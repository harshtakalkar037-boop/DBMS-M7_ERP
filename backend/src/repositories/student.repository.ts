import { query, queryOne, execute, Row, PoolConnection } from '../config/database';
import { paginate, searchClause, ListResult } from './helpers';
import { Paging } from '../utils/api';

/* ================================================================== STUDENTS */

const STUDENT_SELECT = `
  SELECT p.*,
         (SELECT COUNT(*) FROM addresses a WHERE a.student_id = p.student_id)        AS address_count,
         (SELECT COUNT(*) FROM guardians g WHERE g.student_id = p.student_id)        AS guardian_count,
         (SELECT COUNT(*) FROM student_documents d WHERE d.student_id = p.student_id) AS document_count,
         (SELECT COUNT(*) FROM enrollments e WHERE e.student_id = p.student_id)      AS enrollment_count,
         fn_calculate_student_cgpa(p.student_id)                                     AS cgpa,
         fn_student_backlog_count(p.student_id)                                      AS backlog_count,
         fn_student_outstanding_dues(p.student_id)                                   AS outstanding_dues
  FROM v_student_full_profile p`;

const FILTER_MAP: Record<string, string> = {
  studentId: 'p.student_id',
  programId: 'p.program_id',
  departmentId: 'p.department_id',
  batchId: 'p.batch_id',
  categoryId: 'p.category_id',
  status: 'p.status',
  semester: 'p.current_semester_no',
  admissionYear: 'p.admission_year',
  gender: 'p.gender',
  city: 'EXISTS (SELECT 1 FROM addresses a WHERE a.student_id = p.student_id AND a.city LIKE ?)',
};

export function buildStudentWhere(filters: Record<string, any>) {
  const parts: string[] = [];
  const params: unknown[] = [];
  for (const [key, col] of Object.entries(FILTER_MAP)) {
    const v = filters[key];
    if (v === undefined || v === null || v === '') continue;
    if (key === 'city') {
      parts.push(col);
      params.push(`%${v}%`);
    } else {
      parts.push(`${col} = ?`);
      params.push(v);
    }
  }
  return { clause: parts.length ? `WHERE ${parts.join(' AND ')}` : '', params };
}

export function listStudents(
  q: Record<string, any>,
  paging: Paging,
  orderBy: string,
): Promise<ListResult<Row>> {
  const where = searchClause(
    ['p.full_name', 'p.roll_number', 'p.email', 'p.registration_number', 'p.department_code', 'p.program_code'],
    q.search as string,
    buildStudentWhere(q),
  );
  return paginate<Row>({ baseSql: STUDENT_SELECT, where, orderBy, paging });
}

export async function findStudent(id: number): Promise<Row | null> {
  const rows = await query<Row>(`${STUDENT_SELECT} WHERE p.student_id = ?`, [id]);
  return rows[0] ?? null;
}

export async function findStudentByUserId(userId: number): Promise<Row | null> {
  const rows = await query<Row>(`${STUDENT_SELECT} WHERE p.user_id = ?`, [userId]);
  return rows[0] ?? null;
}

export async function findStudentByRoll(roll: string): Promise<Row | null> {
  const rows = await query<Row>(`${STUDENT_SELECT} WHERE p.roll_number = ?`, [roll]);
  return rows[0] ?? null;
}

export interface CreateStudentInput {
  userId: number;
  rollNumber: string;
  registrationNumber: string;
  firstName: string;
  middleName?: string | null;
  lastName: string;
  email: string;
  phone?: string | null;
  dateOfBirth: string;
  gender: string;
  bloodGroup?: string | null;
  categoryId: number;
  departmentId: number;
  programId: number;
  batchId: number;
  admissionYear: number;
  currentSemesterNo?: number;
  emergencyContact?: string | null;
  photoUrl?: string | null;
}

export async function insertStudent(input: CreateStudentInput): Promise<number> {
  const res = await execute(
    `INSERT INTO students
       (user_id, roll_number, registration_number, first_name, middle_name, last_name, email,
        phone, date_of_birth, gender, blood_group, category_id, department_id, program_id,
        batch_id, admission_year, admission_date, current_semester_no, emergency_contact, photo_url, status)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURDATE(),?,?,?,'ACTIVE')`,
    [
      input.userId, input.rollNumber, input.registrationNumber, input.firstName,
      input.middleName ?? null, input.lastName, input.email, input.phone ?? null,
      input.dateOfBirth, input.gender, input.bloodGroup ?? null, input.categoryId,
      input.departmentId, input.programId, input.batchId, input.admissionYear,
      input.currentSemesterNo ?? 1, input.emergencyContact ?? null, input.photoUrl ?? null,
    ],
  );
  return res.insertId;
}

export async function updateStudent(id: number, patch: Record<string, unknown>): Promise<void> {
  const allowed = [
    'first_name', 'last_name', 'middle_name', 'phone', 'email', 'blood_group', 'category_id',
    'department_id', 'program_id', 'batch_id', 'current_semester_no', 'status', 'photo_url',
    'emergency_contact', 'date_of_birth', 'gender',
  ];
  const sets: string[] = [];
  const params: unknown[] = [];
  for (const col of allowed) {
    const key = col.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
    const value = patch[key];
    if (value === undefined) continue;
    sets.push(`\`${col}\` = ?`);
    params.push(value);
  }
  if (!sets.length) return;
  params.push(id);
  await execute(`UPDATE students SET ${sets.join(', ')} WHERE student_id = ?`, params);
}

export async function deleteStudent(id: number): Promise<void> {
  // Status based "soft delete": a student must never disappear from the academic
  // history, so the row is marked INACTIVE and the login is disabled.
  await execute(`UPDATE students SET status = 'INACTIVE' WHERE student_id = ?`, [id]);
}

export async function nextRollNumber(programCode: string, year: number): Promise<string> {
  const row = await queryOne<Row>(
    `SELECT IFNULL(MAX(CAST(SUBSTRING_INDEX(roll_number, '${programCode}', -1) AS UNSIGNED)), 1000) + 1 AS next_no
     FROM students WHERE roll_number LIKE ?`,
    [`${year}${programCode}%`],
  );
  return `${year}${programCode}${row?.next_no ?? 1001}`;
}

/* ---------------------------------------------------- addresses / guardians */

export async function addresses(studentId: number): Promise<Row[]> {
  return query('SELECT * FROM addresses WHERE student_id = ? ORDER BY is_primary DESC, address_type', [studentId]);
}

export async function upsertAddress(studentId: number, body: Record<string, any>): Promise<void> {
  await execute(
    `INSERT INTO addresses (student_id, address_type, line1, line2, city, district, state, pincode, country, is_primary)
     VALUES (?,?,?,?,?,?,?,?,?,?)
     ON DUPLICATE KEY UPDATE line1 = VALUES(line1), line2 = VALUES(line2), city = VALUES(city),
                             district = VALUES(district), state = VALUES(state),
                             pincode = VALUES(pincode), is_primary = VALUES(is_primary)`,
    [
      studentId, body.addressType ?? 'PERMANENT', body.line1, body.line2 ?? null, body.city,
      body.district ?? null, body.state, body.pincode, body.country ?? 'India',
      body.isPrimary ? 1 : 0,
    ],
  );
}

export async function guardians(studentId: number): Promise<Row[]> {
  return query('SELECT * FROM guardians WHERE student_id = ? ORDER BY is_primary DESC', [studentId]);
}

export async function upsertGuardian(studentId: number, body: Record<string, any>): Promise<void> {
  await execute(
    `INSERT INTO guardians (student_id, name, relation, phone, email, occupation, annual_income, is_primary)
     VALUES (?,?,?,?,?,?,?,?)
     ON DUPLICATE KEY UPDATE name = VALUES(name), phone = VALUES(phone), email = VALUES(email),
                             occupation = VALUES(occupation), annual_income = VALUES(annual_income)`,
    [
      studentId, body.name, body.relation ?? 'FATHER', body.phone, body.email ?? null,
      body.occupation ?? null, body.annualIncome ?? 0, body.isPrimary ? 1 : 0,
    ],
  );
}

export async function documents(studentId: number): Promise<Row[]> {
  return query(
    `SELECT document_id AS id, doc_type AS docType, file_name AS fileName, file_path AS filePath,
            mime_type AS mimeType, size_bytes AS sizeBytes, is_verified AS isVerified, uploaded_at AS uploadedAt
     FROM student_documents WHERE student_id = ? ORDER BY uploaded_at DESC`,
    [studentId],
  );
}

export async function addDocument(studentId: number, body: Record<string, any>): Promise<number> {
  const res = await execute(
    `INSERT INTO student_documents (student_id, doc_type, file_name, file_path, mime_type, size_bytes, is_verified)
     VALUES (?,?,?,?,?,?,0)`,
    [studentId, body.docType, body.fileName, body.filePath, body.mimeType ?? 'application/octet-stream',
     body.sizeBytes ?? 0],
  );
  return res.insertId;
}

export async function statusHistory(studentId: number): Promise<Row[]> {
  return query(
    `SELECT history_id AS id, old_status AS oldStatus, new_status AS newStatus, reason, changed_at AS changedAt
     FROM student_status_history WHERE student_id = ? ORDER BY changed_at DESC`,
    [studentId],
  );
}

/* ============================================================== ADMISSIONS */

const ADMISSION_SELECT = `
  SELECT a.*, p.program_code AS programCode, p.name AS programName,
         c.category_code AS categoryCode, ay.year_label AS yearLabel,
         s.roll_number AS rollNumber
  FROM admissions a
  JOIN programs p       ON p.program_id = a.program_id
  JOIN categories c     ON c.category_id = a.category_id
  JOIN academic_years ay ON ay.academic_year_id = a.academic_year_id
  LEFT JOIN students s  ON s.student_id = a.student_id`;

export function listAdmissions(q: Record<string, any>, paging: Paging, orderBy: string) {
  const parts: string[] = [];
  const params: unknown[] = [];
  if (q.status) { parts.push('a.status = ?'); params.push(q.status); }
  if (q.programId) { parts.push('a.program_id = ?'); params.push(q.programId); }
  if (q.academicYearId) { parts.push('a.academic_year_id = ?'); params.push(q.academicYearId); }
  const base = { clause: parts.length ? `WHERE ${parts.join(' AND ')}` : '', params };
  const where = searchClause(
    ['a.application_no', 'a.first_name', 'a.last_name', 'a.email', 'a.phone'],
    q.search as string,
    base,
  );
  return paginate<Row>({ baseSql: ADMISSION_SELECT, where, orderBy, paging });
}

export async function findAdmission(id: number): Promise<Row | null> {
  return queryOne<Row>(`${ADMISSION_SELECT} WHERE a.admission_id = ?`, [id]);
}

export interface AdmissionInput {
  academicYearId: number;
  programId: number;
  categoryId: number;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  dateOfBirth: string;
  gender: string;
  guardianName: string;
  guardianPhone: string;
  previousSchool?: string | null;
  qualification?: string;
  marks10?: number;
  marks12?: number;
  entranceScore?: number | null;
  addressLine1?: string | null;
  city?: string | null;
  state?: string | null;
  pincode?: string | null;
}

export async function insertAdmission(input: AdmissionInput): Promise<{ id: number; applicationNo: string }> {
  const seq = await queryOne<Row>(
    `SELECT LPAD(IFNULL(MAX(admission_id), 0) + 1, 5, '0') AS seq FROM admissions`,
  );
  const applicationNo = `APP-${new Date().getFullYear()}-${seq?.seq ?? '00001'}`;
  const res = await execute(
    `INSERT INTO admissions
      (application_no, academic_year_id, program_id, category_id, first_name, last_name, email, phone,
       date_of_birth, gender, guardian_name, guardian_phone, previous_school, qualification,
       marks_10, marks_12, entrance_score, address_line1, city, state, pincode,
       application_date, status)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURDATE(),'APPLIED')`,
    [
      applicationNo, input.academicYearId, input.programId, input.categoryId, input.firstName,
      input.lastName, input.email, input.phone, input.dateOfBirth, input.gender,
      input.guardianName, input.guardianPhone, input.previousSchool ?? null,
      input.qualification ?? 'HSC', input.marks10 ?? 0, input.marks12 ?? 0,
      input.entranceScore ?? null, input.addressLine1 ?? null, input.city ?? null,
      input.state ?? null, input.pincode ?? null,
    ],
  );
  return { id: res.insertId, applicationNo };
}

export async function admissionStats(): Promise<Row | null> {
  return queryOne<Row>(
    `SELECT COUNT(*) AS total,
            SUM(status = 'APPLIED')      AS applied,
            SUM(status = 'UNDER_REVIEW') AS underReview,
            SUM(status = 'APPROVED')     AS approved,
            SUM(status = 'REJECTED')     AS rejected,
            SUM(status = 'WAITLISTED')   AS waitlisted,
            ROUND(AVG(marks_12), 2)      AS avgEntranceMarks
     FROM admissions`,
  );
}

/* ============================================================ STATISTICS */

export async function studentStats(): Promise<Row | null> {
  return queryOne<Row>(
    `SELECT COUNT(*) AS total,
            SUM(status = 'ACTIVE')    AS active,
            SUM(status = 'GRADUATED') AS graduated,
            SUM(status = 'SUSPENDED') AS suspended,
            SUM(status = 'ALUMNI')    AS alumni,
            SUM(status = 'INACTIVE')  AS inactive,
            SUM(gender = 'MALE')      AS male,
            SUM(gender = 'FEMALE')    AS female
     FROM students`,
  );
}

export async function countBy(sql: string, params: unknown[] = []): Promise<Row[]> {
  return query(sql, params);
}

export async function withConnection<T>(fn: (conn: PoolConnection) => Promise<T>): Promise<T> {
  const { transaction } = await import('../config/database');
  return transaction(fn);
}
