import { callProc, Row } from '../config/database';
import { AppError, parsePaging } from '../utils/api';
import { sessionsRepo, attendanceRepo } from '../repositories/attendance.repository';
import { settingsRepo } from '../repositories/settings.repository';
import { notificationsRepo } from '../repositories/notification.repository';
import { audit } from '../utils/audit';
import { AuthUser } from '../middleware/auth';

export const sessions = {
  list: (q: Record<string, any>) => sessionsRepo.list(q, parsePaging(q)),
  byId: async (id: number) => {
    const s = await sessionsRepo.byId(id);
    if (!s) throw AppError.notFound('Lecture session');
    return s;
  },
  roster: sessionsRepo.roster,
  async create(b: Record<string, any>, actor: AuthUser) {
    const id = await sessionsRepo.create(b);
    await audit({ userId: actor.userId, action: 'CREATE', entity: 'class_sessions', entityId: id, description: `Lecture ${id} created for offering ${b.offeringId}`, newValue: b });
    return { sessionId: id };
  },
};

/** Threshold used for exam eligibility; stored in system_settings, not hardcoded. */
export function threshold(): Promise<number> {
  return settingsRepo.number('MIN_ATTENDANCE_PERCENTAGE', 75);
}

export const attendance = {
  studentSummary: attendanceRepo.studentSummary,
  studentOverall: attendanceRepo.studentOverall,
  monthly: attendanceRepo.monthly,
  offeringReport: attendanceRepo.offeringReport,
  history: attendanceRepo.history,
  stats: attendanceRepo.stats,
  async low(thresholdPct?: number, semesterId?: number, departmentId?: number) {
    const t = thresholdPct ?? await threshold();
    return attendanceRepo.lowAttendance(t, semesterId, departmentId);
  },
};

/** Mark one student. */
export async function mark(sessionId: number, studentId: number, status: string,
  remarks: string | undefined, actor: AuthUser) {
  await attendanceRepo.upsert(sessionId, studentId, status, actor.userId, remarks);
  await audit({
    userId: actor.userId, action: 'ATTENDANCE_UPDATE', entity: 'attendance', entityId: sessionId,
    description: `Student ${studentId} marked ${status} for session ${sessionId}`,
    newValue: { studentId, status, remarks },
  });
  return { sessionId, studentId, status };
}

/**
 * Mark a whole class in one shot. The DB procedure `sp_mark_attendance_bulk`
 * receives a CSV of student ids and writes one attendance row each, inside a
 * transaction - far cheaper than 60 individual round trips.
 */
export async function markBulk(sessionId: number, studentIds: number[], status: string, actor: AuthUser) {
  if (!studentIds.length) throw AppError.validation('Select at least one student');
  const { out } = await callProc(
    'sp_mark_attendance_bulk', [sessionId, studentIds.join(','), status, actor.userId],
    ['p_marked', 'p_message'],
  );
  await audit({
    userId: actor.userId, action: 'ATTENDANCE_UPDATE', entity: 'attendance', entityId: sessionId,
    description: `Bulk marked ${out.p_marked} students as ${status} for session ${sessionId}`,
    newValue: { status, count: studentIds.length },
  });
  return { sessionId, marked: Number(out.p_marked ?? 0), message: out.p_message };
}

/**
 * Scan every ACTIVE student and notify the ones that fell below the threshold.
 * Returns how many warnings were raised; safe to re-run (NOT EXISTS guard).
 */
export async function warnLowAttendance(actor: AuthUser): Promise<{ scanned: number; warned: number; threshold: number }> {
  const min = await threshold();
  const rows = await attendanceRepo.lowAttendance(min);
  // Persist a single notification per student, skipping ones already warned today.
  const userIdRows = await (async () => {
    const { query } = await import('../config/database');
    if (!rows.length) return [] as Row[];
    const ids = (rows as Row[]).map((r) => Number(r.studentId));
    return query<Row>(
      `SELECT s.student_id AS studentId, s.user_id AS userId, st.roll_number AS rollNumber,
              CONCAT(s.first_name, ' ', s.last_name) AS studentName,
              v.overall_percentage AS percentage
       FROM v_student_attendance_overall v
       JOIN students s ON s.student_id = v.student_id
       JOIN students st ON st.student_id = v.student_id
       WHERE s.student_id IN (${ids.map(() => '?').join(',')})
         AND NOT EXISTS (
           SELECT 1 FROM notifications n
           WHERE n.user_id = s.user_id AND n.type = 'ATTENDANCE_WARNING'
             AND DATE(n.created_at) = CURDATE())`,
      ids,
    );
  })();

  for (const r of userIdRows) {
    if (!r.userId) continue;
    await notificationsRepo.create({
      userId: Number(r.userId),
      title: 'Attendance below the required threshold',
      message: `Your overall attendance is ${r.percentage}%. The university requires ${min}%. You risk losing exam eligibility.`,
      type: 'ATTENDANCE_WARNING',
      severity: Number(r.percentage) < min - 10 ? 'ERROR' : 'WARNING',
      entity: 'students', entityId: Number(r.studentId), link: '/attendance',
    });
  }

  await audit({
    userId: actor.userId, action: 'SYSTEM', entity: 'attendance',
    description: `Low attendance warning run: ${rows.length} below ${min}%, ${userIdRows.length} newly notified`,
    newValue: { threshold: min, belowThreshold: rows.length, notified: userIdRows.length },
  });
  return { scanned: rows.length, warned: userIdRows.length, threshold: min };
}
