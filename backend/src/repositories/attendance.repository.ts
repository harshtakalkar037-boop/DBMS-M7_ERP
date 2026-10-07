import { query, queryOne, execute, Row } from '../config/database';
import { paginate, searchClause, ListResult } from './helpers';
import { Paging } from '../utils/api';

/** Lectures of an offering (used by the faculty attendance screen). */
export const sessionsRepo = {
  list: async (q: Record<string, any>, paging?: Paging): Promise<ListResult<Row>> => {
    const parts: string[] = [];
    const params: unknown[] = [];
    if (q.offeringId) { parts.push('cs.offering_id = ?'); params.push(q.offeringId); }
    if (q.facultyId) { parts.push('cs.faculty_id = ?'); params.push(q.facultyId); }
    if (q.from) { parts.push('cs.session_date >= ?'); params.push(q.from); }
    if (q.to) { parts.push('cs.session_date <= ?'); params.push(q.to); }
    if (q.semesterId) { parts.push('cs.semester_id = ?'); params.push(q.semesterId); }
    const base = `SELECT cs.*, sub.subject_code AS subjectCode, sub.name AS subjectName,
                         CONCAT(f.first_name, ' ', f.last_name) AS facultyName,
                         (SELECT COUNT(*) FROM attendance a WHERE a.session_id = cs.session_id) AS markedCount,
                         (SELECT COUNT(*) FROM attendance a WHERE a.session_id = cs.session_id
                            AND a.status IN ('PRESENT','LATE')) AS presentCount
                  FROM class_sessions cs
                  JOIN course_offerings o ON o.offering_id = cs.offering_id
                  JOIN subjects sub       ON sub.subject_id = o.subject_id
                  JOIN faculty f          ON f.faculty_id = cs.faculty_id`;
    const where = { clause: parts.length ? `WHERE ${parts.join(' AND ')}` : '', params };
    if (!paging) {
      const rows = await query<Row>(
        `${base} ${where.clause} ORDER BY cs.session_date DESC, cs.session_no DESC LIMIT 200`, where.params);
      return { rows, total: rows.length };
    }
    return paginate<Row>({ baseSql: base, where, orderBy: 'cs.session_date DESC, cs.session_no DESC', paging });
  },
  byId: (id: number) => queryOne<Row>(
    `SELECT cs.*, sub.subject_code AS subjectCode, sub.name AS subjectName, o.program_id AS programId
     FROM class_sessions cs
     JOIN course_offerings o ON o.offering_id = cs.offering_id
     JOIN subjects sub       ON sub.subject_id = o.subject_id
     WHERE cs.session_id = ?`, [id]),
  create: async (b: Record<string, any>): Promise<number> => {
    const row = await queryOne<Row>(
      `SELECT IFNULL(MAX(session_no), 0) + 1 AS next_no FROM class_sessions
       WHERE offering_id = ? AND session_date = ?`, [b.offeringId, b.sessionDate]);
    const res = await execute(
      `INSERT INTO class_sessions
        (offering_id, faculty_id, semester_id, session_date, session_no, topic, room_number, start_time, end_time, status)
       SELECT ?, o.faculty_id, o.semester_id, ?, ?, ?, ?, ?, ?, 'COMPLETED'
       FROM course_offerings o WHERE o.offering_id = ?`,
      [b.offeringId, b.sessionDate, row?.next_no ?? 1, b.topic ?? null, b.roomNumber ?? null,
       b.startTime ?? '09:00:00', b.endTime ?? '10:00:00', b.offeringId],
    );
    return res.insertId;
  },
  /** Every student of the offering with their status for one lecture. */
  roster: (sessionId: number) => query<Row>(
    `SELECT s.student_id AS studentId, s.roll_number AS rollNumber,
            CONCAT(s.first_name, ' ', s.last_name) AS studentName, s.photo_url AS photoUrl,
            IFNULL(a.status, 'PRESENT') AS status, a.remarks, a.attendance_id AS attendanceId
     FROM class_sessions cs
     JOIN course_offerings o ON o.offering_id = cs.offering_id
     JOIN enrollments e      ON e.offering_id = o.offering_id
     JOIN students s         ON s.student_id = e.student_id
     LEFT JOIN attendance a  ON a.session_id = cs.session_id AND a.student_id = s.student_id
     WHERE cs.session_id = ?
     ORDER BY s.roll_number`, [sessionId]),
};

export const attendanceRepo = {
  /** Subject-wise attendance of one student (drives the student dashboard). */
  studentSummary: (studentId: number, semesterId?: number) => query<Row>(
    `SELECT * FROM v_student_attendance_summary
     WHERE student_id = ? ${semesterId ? 'AND semester_id = ?' : ''}
     ORDER BY semester_id, subject_code`,
    semesterId ? [studentId, semesterId] : [studentId]),

  studentOverall: (studentId: number) => queryOne<Row>(
    `SELECT * FROM v_student_attendance_overall WHERE student_id = ?`, [studentId]),

  /** Monthly attendance history for charts. */
  monthly: (studentId: number) => query<Row>(
    `SELECT year, month, month_name AS monthName, total_classes AS totalClasses, attended, percentage
     FROM v_monthly_attendance WHERE student_id = ? ORDER BY year, month`, [studentId]),

  /** Faculty view: attendance of every student in one offering. */
  offeringReport: (offeringId: number) => query<Row>(
    `SELECT s.student_id AS studentId, s.roll_number AS rollNumber,
            CONCAT(s.first_name, ' ', s.last_name) AS studentName,
            COUNT(a.attendance_id) AS totalClasses,
            SUM(CASE WHEN a.status IN ('PRESENT','LATE') THEN 1 ELSE 0 END) AS attended,
            SUM(CASE WHEN a.status = 'ABSENT' THEN 1 ELSE 0 END) AS absent,
            fn_calculate_attendance_percentage(s.student_id, ?) AS percentage
     FROM enrollments e
     JOIN students s ON s.student_id = e.student_id
     LEFT JOIN attendance a ON a.student_id = s.student_id AND a.offering_id = e.offering_id
     WHERE e.offering_id = ?
     GROUP BY s.student_id, s.roll_number, s.first_name, s.last_name
     ORDER BY s.roll_number`, [offeringId, offeringId]),

  /** Students below the eligibility threshold - the low attendance warning list. */
  lowAttendance: (threshold = 75, semesterId?: number, departmentId?: number) => query<Row>(
    `SELECT s.student_id AS studentId, s.roll_number AS rollNumber,
            CONCAT(s.first_name, ' ', s.last_name) AS studentName, s.email, s.phone,
            d.department_code AS departmentCode, p.program_code AS programCode,
            v.overall_percentage AS percentage, v.attendance_status AS status,
            fn_calculate_semester_attendance(s.student_id, sem.semester_id) AS semesterPercentage
     FROM v_student_attendance_overall v
     JOIN students s      ON s.student_id = v.student_id
     JOIN departments d   ON d.department_id = s.department_id
     JOIN programs p      ON p.program_id = s.program_id
     JOIN semesters sem   ON sem.is_current = 1
     WHERE s.status = 'ACTIVE' AND v.overall_percentage < ?
       ${semesterId ? 'AND s.current_semester_no = (SELECT semester_no FROM semesters WHERE semester_id = ?)' : ''}
       ${departmentId ? 'AND s.department_id = ?' : ''}
     ORDER BY v.overall_percentage ASC
     LIMIT 200`,
    [threshold, ...(semesterId ? [semesterId] : []), ...(departmentId ? [departmentId] : [])]),

  /** Overall attendance statistics for the admin dashboard. */
  stats: () => queryOne<Row>(
    `SELECT COUNT(*) AS students,
            ROUND(AVG(overall_percentage), 2) AS average,
            SUM(attendance_status = 'SAFE')     AS safe,
            SUM(attendance_status = 'WARNING')  AS warning,
            SUM(attendance_status = 'CRITICAL') AS critical
     FROM v_student_attendance_overall`),

  upsert: async (sessionId: number, studentId: number, status: string, markedBy: number, remarks?: string) => {
    const sess = await queryOne<Row>(
      'SELECT offering_id, semester_id FROM class_sessions WHERE session_id = ?', [sessionId]);
    if (!sess) throw new Error('Session not found');
    await execute(
      `INSERT INTO attendance (session_id, student_id, offering_id, semester_id, status, marked_by, remarks)
       VALUES (?,?,?,?,?,?,?)
       ON DUPLICATE KEY UPDATE status = VALUES(status), marked_by = VALUES(marked_by),
                               remarks = VALUES(remarks), marked_at = CURRENT_TIMESTAMP`,
      [sessionId, studentId, sess.offering_id, sess.semester_id, status, markedBy, remarks ?? null],
    );
  },

  /** Attendance history of a student (for the attendance report / export). */
  history: (studentId: number, from?: string, to?: string) => query<Row>(
    `SELECT a.attendance_id AS id, a.session_id AS sessionId, cs.session_date AS sessionDate,
            sub.subject_code AS subjectCode, sub.name AS subjectName, a.status, a.marked_at AS markedAt
     FROM attendance a
     JOIN class_sessions cs ON cs.session_id = a.session_id
     JOIN course_offerings o ON o.offering_id = a.offering_id
     JOIN subjects sub ON sub.subject_id = o.subject_id
     WHERE a.student_id = ? ${from ? 'AND cs.session_date >= ?' : ''} ${to ? 'AND cs.session_date <= ?' : ''}
     ORDER BY cs.session_date DESC LIMIT 500`,
    [studentId, ...(from ? [from] : []), ...(to ? [to] : [])]),
};
