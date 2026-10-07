import { callProc, Row } from '../config/database';
import { AppError, Paging, parsePaging, buildOrderBy } from '../utils/api';
import * as repo from '../repositories/student.repository';
import { audit } from '../utils/audit';
import { AuthUser } from '../middleware/auth';
import { notificationsRepo } from '../repositories/notification.repository';

const SORTABLE = [
  'student_id', 'roll_number', 'first_name', 'last_name', 'email',
  'current_semester_no', 'admission_year', 'status', 'created_at',
];

/* ------------------------------------------------------------------ listing */

export async function list(query: Record<string, any>, actor: AuthUser) {
  const paging = parsePaging(query);
  const orderBy = buildOrderBy(query, SORTABLE, 'p.roll_number ASC');
  // A student can only ever see themselves; faculty see their own department.
  const scoped = { ...query };
  if (actor.role === 'STUDENT') scoped.studentId = actor.studentId;
  return repo.listStudents(scoped, paging, orderBy);
}

export async function detail(id: number) {
  const student = await repo.findStudent(id);
  if (!student) throw AppError.notFound('Student');
  const [addresses, guardians, documents, history, fees, attendance, academics] = await Promise.all([
    repo.addresses(id), repo.guardians(id), repo.documents(id), repo.statusHistory(id),
    import('../repositories/finance.repository').then((m) => m.studentFeesRepo.forStudent(id)),
    import('../repositories/attendance.repository').then((m) => m.attendanceRepo.studentSummary(id)),
    import('../repositories/exam.repository').then((m) => m.resultsRepo.forStudent(id)),
  ]);
  return { student, addresses, guardians, documents, history, fees, attendance, academics };
}

export async function stats() { return repo.studentStats(); }

/* ------------------------------------------------------------------ writing */

export async function create(body: Record<string, any>, actor: AuthUser) {
  // 1. login
  const { hashPassword } = await import('./auth.service');
  const { createUser } = await import('../repositories/auth.repository');
  const passwordHash = await hashPassword(body.password ?? 'Student@123');
  const userId = await createUser('STUDENT', body.email, passwordHash, body.phone ?? null);
  try {
    const program = await import('../config/database').then((d) =>
      d.queryOne<Row>('SELECT program_code FROM programs WHERE program_id = ?', [body.programId]));
    const admissionYear = Number(body.admissionYear ?? new Date().getFullYear());
    const rollNumber = body.rollNumber
      ?? await repo.nextRollNumber(String(program?.program_code ?? 'GEN'), admissionYear);
    const regNumber = body.registrationNumber ?? `${rollNumber}/R${admissionYear}`;

    // `students.batch_id` is mandatory. When the caller does not name a batch we
    // fall back to the program's own batch rather than failing the request.
    let batchId: number | null = body.batchId ? Number(body.batchId) : null;
    if (!batchId) {
      const { queryOne: one } = await import('../config/database');
      const batch = await one<Row>(
        'SELECT batch_id AS batchId FROM batches WHERE program_id = ? ORDER BY batch_id LIMIT 1',
        [body.programId]);
      batchId = batch ? Number(batch.batchId) : null;
    }
    if (!batchId) {
      throw AppError.validation('This program has no batch yet. Create a batch for it first.');
    }

    const studentId = await repo.insertStudent({
      userId,
      rollNumber,
      registrationNumber: regNumber,
      firstName: body.firstName,
      middleName: body.middleName ?? null,
      lastName: body.lastName,
      email: body.email,
      phone: body.phone ?? null,
      dateOfBirth: body.dateOfBirth,
      gender: body.gender,
      categoryId: body.categoryId,
      departmentId: body.departmentId,
      programId: body.programId,
      batchId,
      admissionYear,
      ...(body.bloodGroup ? { bloodGroup: body.bloodGroup } : {}),
      ...(body.emergencyContact ? { emergencyContact: body.emergencyContact } : {}),
      ...(body.admissionDate ? { admissionDate: body.admissionDate } : {}),
    });

    if (body.address) await repo.upsertAddress(studentId, body.address);
    if (body.guardian) await repo.upsertGuardian(studentId, body.guardian);

    await audit({
      userId: actor.userId, action: 'CREATE', entity: 'students', entityId: studentId,
      description: `Student ${rollNumber} created`, newValue: { rollNumber, email: body.email },
    });
    await notificationsRepo.create({
      userId, title: 'Welcome to the ERP',
      message: `Your student account is ready. Your roll number is ${rollNumber}.`,
      type: 'ADMISSION', severity: 'SUCCESS', entity: 'students', entityId: studentId, link: '/profile',
    });
    return { studentId, rollNumber, userId };
  } catch (err) {
    await import('../config/database').then((d) => d.execute('DELETE FROM users WHERE user_id = ?', [userId])).catch(() => undefined);
    throw err;
  }
}

export async function update(id: number, body: Record<string, any>, actor: AuthUser) {
  const before = await repo.findStudent(id);
  if (!before) throw AppError.notFound('Student');
  await repo.updateStudent(id, body);
  await audit({
    userId: actor.userId, action: 'UPDATE', entity: 'students', entityId: id,
    description: `Student ${before.roll_number} updated`, oldValue: before, newValue: body,
  });
  return repo.findStudent(id);
}

export async function remove(id: number, actor: AuthUser) {
  const before = await repo.findStudent(id);
  if (!before) throw AppError.notFound('Student');
  await repo.deleteStudent(id);
  await audit({
    userId: actor.userId, action: 'DELETE', entity: 'students', entityId: id,
    description: `Student ${before.roll_number} removed`, oldValue: before,
  });
  return { deleted: true };
}

export async function changeStatus(id: number, status: string, reason: string, actor: AuthUser) {
  const before = await repo.findStudent(id);
  if (!before) throw AppError.notFound('Student');
  await import('../config/database').then((d) =>
    d.execute('UPDATE students SET status = ? WHERE student_id = ?', [status, id]));
  await audit({
    userId: actor.userId, action: 'UPDATE', entity: 'students', entityId: id,
    description: `Status ${before.status} -> ${status} (${reason})`, oldValue: { status: before.status }, newValue: { status, reason },
  });
  return { studentId: id, status };
}

/* ---------------------------------------------------------------- addresses */

export const addresses = repo.addresses;
export async function saveAddress(id: number, body: Record<string, any>) {
  await repo.upsertAddress(id, body);
  return repo.addresses(id);
}
export const guardians = repo.guardians;
export async function saveGuardian(id: number, body: Record<string, any>) {
  await repo.upsertGuardian(id, body);
  return repo.guardians(id);
}
export const documents = repo.documents;
export async function addDocument(id: number, body: Record<string, any>, actor: AuthUser) {
  const docId = await repo.addDocument(id, body);
  await audit({ userId: actor.userId, action: 'CREATE', entity: 'student_documents', entityId: docId, description: `Document ${body.docType} uploaded for student ${id}` });
  return { documentId: docId };
}

/* --------------------------------------------------------------- admissions */

export async function listAdmissions(query: Record<string, any>) {
  const paging = parsePaging(query);
  const orderBy = buildOrderBy(query, ['admission_id', 'application_no', 'first_name', 'application_date', 'status'], 'a.application_date DESC, a.admission_id DESC');
  return repo.listAdmissions(query, paging, orderBy);
}

export const admissionStats = repo.admissionStats;
export const findAdmission = repo.findAdmission;

/** Public application form - no login required. */
export async function apply(body: Record<string, any>) {
  const row = await import('../config/database').then((d) =>
    d.queryOne<Row>('SELECT academic_year_id FROM academic_years WHERE is_current = 1 LIMIT 1'));
  const result = await repo.insertAdmission({
    academicYearId: body.academicYearId ?? Number(row?.academic_year_id ?? 1),
    programId: body.programId,
    categoryId: body.categoryId,
    firstName: body.firstName,
    lastName: body.lastName,
    email: body.email,
    phone: body.phone,
    dateOfBirth: body.dateOfBirth,
    gender: body.gender,
    guardianName: body.guardianName,
    guardianPhone: body.guardianPhone,
    previousSchool: body.previousSchool ?? null,
    qualification: body.qualification ?? 'HSC',
    marks10: body.marks10 ?? 0,
    marks12: body.marks12 ?? 0,
    entranceScore: body.entranceScore ?? null,
    addressLine1: body.addressLine1 ?? null,
    city: body.city ?? null,
    state: body.state ?? null,
    pincode: body.pincode ?? null,
  });
  await audit({
    action: 'CREATE', entity: 'admissions', entityId: result.id,
    description: `New application ${result.applicationNo} from ${body.firstName} ${body.lastName}`,
    newValue: { email: body.email, programId: body.programId },
  });
  return result;
}

/**
 * Approve / reject an application.
 * The heavy lifting is done by `sp_approve_admission`, which creates the user,
 * the student row, the roll number and the first fee bill inside one transaction.
 */
export async function reviewAdmission(id: number, approve: boolean, remarks: string, actor: AuthUser) {
  const before = await repo.findAdmission(id);
  if (!before) throw AppError.notFound('Admission application');
  const { out } = await callProc(
    'sp_approve_admission', [id, actor.userId, approve ? 1 : 0, remarks ?? null],
    ['p_student_id', 'p_message'],
  );
  await audit({
    userId: actor.userId,
    action: approve ? 'APPROVE' : 'REJECT',
    entity: 'admissions', entityId: id,
    description: `Application ${before.application_no} ${approve ? 'approved' : 'rejected'}: ${out.p_message ?? ''}`,
    oldValue: { status: before.status },
    newValue: { status: approve ? 'APPROVED' : 'REJECTED', remarks, studentId: out.p_student_id },
  });
  if (approve && out.p_student_id) {
    const userRow = await import('../config/database').then((d) =>
      d.queryOne<Row>('SELECT user_id AS userId FROM students WHERE student_id = ?', [out.p_student_id]));
    if (userRow?.userId) {
      await notificationsRepo.create({
        userId: Number(userRow.userId),
        title: 'Admission approved',
        message: `Congratulations! Your application ${before.application_no} has been approved.`,
        type: 'ADMISSION', severity: 'SUCCESS', entity: 'admissions', entityId: id, link: '/profile',
      });
    }
  }
  return { applicationId: id, approved: approve, studentId: out.p_student_id ?? null, message: out.p_message };
}
