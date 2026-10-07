import { callProc, query, Row } from '../config/database';
import { AppError, parsePaging } from '../utils/api';
import { examsRepo, schedulesRepo, registrationsRepo, resultsRepo, gradesRepo } from '../repositories/exam.repository';
import { notificationsRepo } from '../repositories/notification.repository';
import { settingsRepo } from '../repositories/settings.repository';
import { audit } from '../utils/audit';
import { AuthUser } from '../middleware/auth';

export const exams = {
  list: (q: Record<string, any>) => examsRepo.list(q, parsePaging(q)),
  byId: async (id: number) => {
    const e = await examsRepo.byId(id);
    if (!e) throw AppError.notFound('Exam');
    return e;
  },
  async create(b: Record<string, any>, actor: AuthUser) {
    const id = await examsRepo.create(b);
    await audit({ userId: actor.userId, action: 'CREATE', entity: 'exams', entityId: id, description: `Exam ${b.examCode} created`, newValue: b });
    return { examId: id };
  },
  async update(id: number, b: Record<string, any>, actor: AuthUser) {
    const before = await examsRepo.byId(id);
    if (!before) throw AppError.notFound('Exam');
    await examsRepo.update(id, b);
    await audit({ userId: actor.userId, action: 'UPDATE', entity: 'exams', entityId: id, description: `Exam ${before.exam_code} updated`, oldValue: before, newValue: b });
    return { examId: id };
  },
};

export const schedules = {
  list: schedulesRepo.list,
  async create(b: Record<string, any>, actor: AuthUser) {
    const id = await schedulesRepo.create(b);
    await audit({ userId: actor.userId, action: 'CREATE', entity: 'exam_schedules', entityId: id, description: `Schedule ${id} created`, newValue: b });
    return { scheduleId: id };
  },
  async remove(id: number, actor: AuthUser) {
    await schedulesRepo.remove(id);
    await audit({ userId: actor.userId, action: 'DELETE', entity: 'exam_schedules', entityId: id, description: `Schedule ${id} removed` });
    return { deleted: true };
  },
};

export const registrations = {
  list: (q: Record<string, any>) => registrationsRepo.list(q, parsePaging(q)),
  forStudent: registrationsRepo.forStudent,
  stats: registrationsRepo.stats,
  eligibility: (q: Record<string, any>) => query<Row>(
    `SELECT * FROM v_exam_eligibility
     ${q.studentId ? 'WHERE student_id = ?' : ''}
     ${q.offeringId ? (q.studentId ? 'AND' : 'WHERE') + ' offering_id = ?' : ''}
     ${q.ineligibleOnly ? (q.studentId || q.offeringId ? 'AND' : 'WHERE') + ' is_eligible = 0' : ''}
     ORDER BY attendance_percentage ASC LIMIT 500`,
    [q.studentId, q.offeringId].filter(Boolean) as unknown[]),

  /**
   * Register a student for an exam.
   *
   * The 75% rule is enforced TWICE, deliberately:
   *  1. `sp_register_student_for_exam` returns status REJECTED with a reason.
   *  2. `trg_exam_reg_bi_eligibility` refuses any direct INSERT that would
   *     break the rule, so the rule cannot be bypassed even from the mysql CLI.
   */
  async register(examId: number, studentId: number, offeringId: number, actor: AuthUser) {
    const { out } = await callProc(
      'sp_register_student_for_exam', [examId, studentId, offeringId, actor.userId],
      ['p_registration_id', 'p_status', 'p_message'],
    );
    const status = String(out.p_status ?? '');
    await audit({
      userId: actor.userId, action: 'EXAM_REGISTRATION', entity: 'exam_registrations',
      entityId: Number(out.p_registration_id ?? 0) || null,
      description: `Exam ${examId} registration for student ${studentId}: ${status} - ${out.p_message}`,
      newValue: { examId, studentId, offeringId, status },
    });
    return {
      registrationId: out.p_registration_id ?? null,
      status,
      message: out.p_message,
    };
  },

  /** Condonation: an authorised user may waive the attendance rule. */
  async grantExemption(registrationId: number, reason: string, actor: AuthUser) {
    const { execute } = await import('../config/database');
    const res = await execute(
      `UPDATE exam_registrations
       SET exemption_granted = 1, exemption_by = ?, exemption_reason = ?, is_eligible = 1
       WHERE registration_id = ?`,
      [actor.userId, reason, registrationId],
    );
    if (!res.affectedRows) throw AppError.notFound('Exam registration');
    await audit({
      userId: actor.userId, action: 'EXAM_REGISTRATION', entity: 'exam_registrations',
      entityId: registrationId, description: `Exemption granted: ${reason}`, newValue: { reason },
    });
    return { registrationId, exempted: true };
  },
};

export const marks = {
  sheet: registrationsRepo.marksSheet,

  /**
   * Enter marks for one registration. `sp_enter_marks` validates the range and
   * derives the grade via fn_grade_code / fn_grade_points; trg_marks_audit
   * writes the audit row and blocks edits on published exams.
   */
  async enter(registrationId: number, obtained: number | null, isAbsent: boolean, actor: AuthUser) {
    const { out } = await callProc(
      'sp_enter_marks',
      [registrationId, obtained ?? 0, isAbsent ? 1 : 0, actor.userId],
      ['p_grade', 'p_grade_points', 'p_message'],
    );
    await audit({
      userId: actor.userId, action: 'MARKS_UPDATE', entity: 'marks', entityId: registrationId,
      description: `Marks entered for registration ${registrationId}: ${out.p_message}`,
      newValue: { obtained, isAbsent, grade: out.p_grade, points: out.p_grade_points },
    });
    return {
      registrationId,
      grade: out.p_grade,
      gradePoints: out.p_grade_points,
      message: out.p_message,
    };
  },
};

export const results = {
  forStudent: resultsRepo.forStudent,
  markSheet: resultsRepo.markSheet,
  summary: resultsRepo.summary,
  departmentAnalysis: resultsRepo.departmentAnalysis,
  rankings: resultsRepo.rankings,
  subjectWise: resultsRepo.subjectWise,

  /** Compute SGPA/CGPA/backlogs for every student of a semester. */
  async process(semesterId: number, examId: number | null, actor: AuthUser) {
    const { out } = await callProc(
      'sp_process_semester_results', [semesterId, examId, actor.userId],
      ['p_processed', 'p_message'],
    );
    await audit({
      userId: actor.userId, action: 'RESULT_PUBLISHED', entity: 'results',
      description: `Semester result processing: ${out.p_message}`,
      newValue: { semesterId, examId, processed: out.p_processed },
    });
    return { processed: Number(out.p_processed ?? 0), message: out.p_message };
  },

  /** Flip an exam to published - students can then see their marks. */
  async publish(examId: number, actor: AuthUser) {
    const { out } = await callProc('sp_publish_exam_results', [examId, actor.userId], ['p_notified', 'p_message']);
    await audit({
      userId: actor.userId, action: 'RESULT_PUBLISHED', entity: 'exams', entityId: examId,
      description: `Results published: ${out.p_message}`, newValue: { notified: out.p_notified },
    });
    return { examId, notified: Number(out.p_notified ?? 0), message: out.p_message };
  },
};

export const grades = gradesRepo;

export const hallTicket = {
  /** Structured hall ticket for printing: student + exam + timetable details. */
  async get(studentId: number, examId?: number) {
    const rows = await query<Row>(
      `SELECT * FROM v_exam_hall_ticket
       WHERE student_id = ? ${examId ? 'AND exam_id = ?' : ''}
       ORDER BY exam_date, start_time`,
      examId ? [studentId, examId] : [studentId],
    );
    if (!rows.length) throw AppError.notFound('Hall ticket');
    const photo = await query<Row>('SELECT photo_url AS photoUrl, full_name AS fullName FROM v_student_full_profile WHERE student_id = ?', [studentId]);
    return {
      student: { studentId, photoUrl: photo[0]?.photoUrl ?? null, fullName: photo[0]?.fullName ?? rows[0].student_name },
      subjects: rows,
      instructions: [
        'Carry this hall ticket and your institute ID card to every examination.',
        'Report to the examination hall 15 minutes before the scheduled start time.',
        'Mobile phones and smart watches are not permitted inside the hall.',
        'Students with attendance below the required percentage will not be allowed to appear.',
      ],
    };
  },
};

export const examPolicy = {
  threshold: () => settingsRepo.number('MIN_ATTENDANCE_PERCENTAGE', 75),
  async setThreshold(value: number, actor: AuthUser) {
    await settingsRepo.set('MIN_ATTENDANCE_PERCENTAGE', String(value));
    await audit({ userId: actor.userId, action: 'UPDATE', entity: 'system_settings', description: `Minimum attendance set to ${value}%`, newValue: { value } });
    return { minAttendancePercentage: value };
  },
};

export const notifyStudents = async (title: string, message: string, link: string, actor: AuthUser) => {
  const { query: q } = await import('../config/database');
  const rows = await q<Row>('SELECT user_id AS userId FROM students WHERE status = \'ACTIVE\'');
  const count = await notificationsRepo.broadcast(rows.map((r) => Number(r.userId)), {
    title, message, type: 'EXAM_SCHEDULE', severity: 'INFO', link,
  });
  await audit({ userId: actor.userId, action: 'CREATE', entity: 'notifications', description: `Broadcast "${title}" to ${count} students` });
  return { notified: count };
};
