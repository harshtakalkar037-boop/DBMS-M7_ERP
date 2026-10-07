import { query, queryOne, execute, Row } from '../config/database';
import { paginate, searchClause, ListResult } from './helpers';
import { Paging } from '../utils/api';

export const examsRepo = {
  list: (q: Record<string, any>, paging: Paging): Promise<ListResult<Row>> => {
    const parts: string[] = [];
    const params: unknown[] = [];
    if (q.examType) { parts.push('e.exam_type = ?'); params.push(q.examType); }
    if (q.status) { parts.push('e.status = ?'); params.push(q.status); }
    if (q.academicYearId) { parts.push('e.academic_year_id = ?'); params.push(q.academicYearId); }
    if (q.semesterId) { parts.push('e.semester_id = ?'); params.push(q.semesterId); }
    const where = searchClause(['e.exam_code', 'e.name'], q.search as string,
      { clause: parts.length ? `WHERE ${parts.join(' AND ')}` : '', params });
    return paginate<Row>({
      baseSql: `SELECT e.*, ay.year_label AS yearLabel, s.semester_no AS semesterNo,
                       (SELECT COUNT(*) FROM exam_registrations r WHERE r.exam_id = e.exam_id) AS registrationCount,
                       (SELECT COUNT(*) FROM exam_schedules sc WHERE sc.exam_id = e.exam_id) AS scheduleCount
                FROM exams e
                JOIN academic_years ay ON ay.academic_year_id = e.academic_year_id
                JOIN semesters s       ON s.semester_id = e.semester_id`,
      where, orderBy: 'e.start_date DESC', paging,
    });
  },
  byId: (id: number) => queryOne<Row>(
    `SELECT e.*, ay.year_label AS yearLabel, s.semester_no AS semesterNo
     FROM exams e
     JOIN academic_years ay ON ay.academic_year_id = e.academic_year_id
     JOIN semesters s       ON s.semester_id = e.semester_id
     WHERE e.exam_id = ?`, [id]),
  create: async (b: Record<string, any>): Promise<number> => {
    const res = await execute(
      `INSERT INTO exams (exam_code, name, exam_type, academic_year_id, semester_id, start_date, end_date,
                          registration_start, registration_end, min_attendance_required, status)
       VALUES (?,?,?,?,?,?,?,?,?,?,'DRAFT')`,
      [b.examCode, b.name, b.examType, b.academicYearId, b.semesterId, b.startDate, b.endDate,
       b.registrationStart ?? null, b.registrationEnd ?? null, b.minAttendanceRequired ?? 75],
    );
    return res.insertId;
  },
  update: async (id: number, b: Record<string, any>): Promise<void> => {
    await execute(
      `UPDATE exams SET name = COALESCE(?, name), start_date = COALESCE(?, start_date),
              end_date = COALESCE(?, end_date), registration_start = COALESCE(?, registration_start),
              registration_end = COALESCE(?, registration_end),
              min_attendance_required = COALESCE(?, min_attendance_required),
              status = COALESCE(?, status)
       WHERE exam_id = ?`,
      [b.name ?? null, b.startDate ?? null, b.endDate ?? null, b.registrationStart ?? null,
       b.registrationEnd ?? null, b.minAttendanceRequired ?? null, b.status ?? null, id],
    );
  },
};

export const schedulesRepo = {
  list: (examId?: number) => query<Row>(
    `SELECT sc.*, sub.subject_code AS subjectCode, sub.name AS subjectName,
            p.program_code AS programCode,
            CONCAT(f.first_name, ' ', f.last_name) AS invigilatorName,
            (SELECT COUNT(*) FROM exam_registrations r
              WHERE r.schedule_id = sc.schedule_id AND r.status IN ('REGISTERED','VERIFIED','APPEARED')) AS registered
     FROM exam_schedules sc
     JOIN subjects sub ON sub.subject_id = sc.subject_id
     JOIN programs p   ON p.program_id = sc.program_id
     LEFT JOIN faculty f ON f.faculty_id = sc.invigilator_id
     ${examId ? 'WHERE sc.exam_id = ?' : ''}
     ORDER BY sc.exam_date, sc.start_time`,
    examId ? [examId] : []),
  create: async (b: Record<string, any>): Promise<number> => {
    const res = await execute(
      `INSERT INTO exam_schedules (exam_id, subject_id, program_id, exam_date, start_time, end_time,
                                   room_number, max_marks, min_marks, invigilator_id)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [b.examId, b.subjectId, b.programId, b.examDate, b.startTime, b.endTime,
       b.roomNumber, b.maxMarks ?? 100, b.minMarks ?? 40, b.invigilatorId ?? null],
    );
    return res.insertId;
  },
  remove: (id: number) => execute('DELETE FROM exam_schedules WHERE schedule_id = ?', [id]),
};

export const registrationsRepo = {
  list: (q: Record<string, any>, paging: Paging): Promise<ListResult<Row>> => {
    const parts: string[] = [];
    const params: unknown[] = [];
    if (q.examId) { parts.push('r.exam_id = ?'); params.push(q.examId); }
    if (q.studentId) { parts.push('r.student_id = ?'); params.push(q.studentId); }
    if (q.status) { parts.push('r.status = ?'); params.push(q.status); }
    if (q.programId) { parts.push('st.program_id = ?'); params.push(q.programId); }
    const where = searchClause(['st.roll_number', 'CONCAT(st.first_name, " ", st.last_name)', 'r.hall_ticket_no'],
      q.search as string, { clause: parts.length ? `WHERE ${parts.join(' AND ')}` : '', params });
    return paginate<Row>({
      baseSql: `SELECT r.*, st.roll_number AS rollNumber,
                       CONCAT(st.first_name, ' ', st.last_name) AS studentName,
                       sub.subject_code AS subjectCode, sub.name AS subjectName,
                       e.name AS examName, e.exam_type AS examType,
                       sc.exam_date AS examDate, sc.start_time AS startTime, sc.room_number AS roomNumber,
                       m.marks_obtained AS marks, m.max_marks AS maxMarks, m.grade
                FROM exam_registrations r
                JOIN students st          ON st.student_id = r.student_id
                JOIN course_offerings o   ON o.offering_id = r.offering_id
                JOIN subjects sub         ON sub.subject_id = o.subject_id
                JOIN exams e              ON e.exam_id = r.exam_id
                LEFT JOIN exam_schedules sc ON sc.schedule_id = r.schedule_id
                LEFT JOIN marks m         ON m.registration_id = r.registration_id`,
      where, orderBy: 'r.registration_id DESC', paging,
    });
  },
  /** Everything a student needs for their exam dashboard. */
  forStudent: (studentId: number) => query<Row>(
    `SELECT r.registration_id AS registrationId, r.status, r.hall_ticket_no AS hallTicketNo,
            r.attendance_percentage AS attendancePercentage, r.is_eligible AS isEligible,
            r.eligibility_reason AS reason, r.exemption_granted AS exempted,
            e.exam_id AS examId, e.exam_code AS examCode, e.name AS examName, e.exam_type AS examType, e.status AS examStatus,
            sub.subject_code AS subjectCode, sub.name AS subjectName,
            sc.exam_date AS examDate, sc.start_time AS startTime, sc.end_time AS endTime,
            sc.room_number AS roomNumber, sc.max_marks AS maxMarks,
            m.marks_obtained AS marks, m.grade, m.grade_points AS gradePoints, m.is_pass AS isPass,
            e.result_published AS published
     FROM exam_registrations r
     JOIN exams e             ON e.exam_id = r.exam_id
     JOIN course_offerings o  ON o.offering_id = r.offering_id
     JOIN subjects sub        ON sub.subject_id = o.subject_id
     LEFT JOIN exam_schedules sc ON sc.schedule_id = r.schedule_id
     LEFT JOIN marks m        ON m.registration_id = r.registration_id
     WHERE r.student_id = ?
     ORDER BY sc.exam_date DESC, e.exam_id DESC`, [studentId]),
  /** Registration statistics for the exam-cell dashboard. */
  stats: (examId?: number) => queryOne<Row>(
    `SELECT COUNT(*) AS total,
            SUM(r.status = 'REGISTERED')  AS registered,
            SUM(r.status = 'REJECTED')    AS rejected,
            SUM(r.status = 'APPEARED')    AS appeared,
            SUM(r.status = 'ABSENT')      AS absent,
            SUM(r.is_eligible = 0)        AS ineligible
     FROM exam_registrations r ${examId ? 'WHERE r.exam_id = ?' : ''}`,
    examId ? [examId] : []),
  /** Marks entry sheet: every registration for one schedule. */
  marksSheet: (scheduleId: number) => query<Row>(
    `SELECT r.registration_id AS registrationId, st.student_id AS studentId, st.roll_number AS rollNumber,
            CONCAT(st.first_name, ' ', st.last_name) AS studentName,
            m.marks_obtained AS marks, m.is_absent AS isAbsent, m.grade, m.grade_points AS gradePoints,
            m.is_pass AS isPass, m.remarks, sc.max_marks AS maxMarks, sc.min_marks AS minMarks
     FROM exam_registrations r
     JOIN students st ON st.student_id = r.student_id
     JOIN exam_schedules sc ON sc.schedule_id = r.schedule_id
     LEFT JOIN marks m ON m.registration_id = r.registration_id
     WHERE r.schedule_id = ? AND r.status IN ('REGISTERED','VERIFIED','APPEARED','ABSENT')
     ORDER BY st.roll_number`, [scheduleId]),
};

export const resultsRepo = {
  /** Semester results of one student (semester-wise SGPA/CGPA). */
  forStudent: (studentId: number) => query<Row>(
    `SELECT r.*, s.semester_no AS semesterNo, s.name AS semesterName, ay.year_label AS yearLabel,
            e.name AS examName
     FROM results r
     JOIN semesters s      ON s.semester_id = r.semester_id
     JOIN academic_years ay ON ay.academic_year_id = s.academic_year_id
     LEFT JOIN exams e     ON e.exam_id = r.exam_id
     WHERE r.student_id = ? ORDER BY s.start_date`, [studentId]),
  /** Full mark sheet: every subject of every exam for a student. */
  markSheet: (studentId: number, semesterId?: number) => query<Row>(
    `SELECT sub.subject_code AS subjectCode, sub.name AS subjectName, sub.credits,
            s.semester_no AS semesterNo, e.exam_code AS examCode, e.exam_type AS examType,
            m.marks_obtained AS marksObtained, m.max_marks AS maxMarks, m.percentage,
            m.grade, m.grade_points AS gradePoints, m.is_pass AS isPass,
            sc.exam_date AS examDate
     FROM marks m
     JOIN exam_registrations r ON r.registration_id = m.registration_id
     JOIN exams e              ON e.exam_id = r.exam_id
     JOIN semesters s          ON s.semester_id = e.semester_id
     JOIN course_offerings o   ON o.offering_id = r.offering_id
     JOIN subjects sub         ON sub.subject_id = o.subject_id
     LEFT JOIN exam_schedules sc ON sc.schedule_id = r.schedule_id
     WHERE r.student_id = ? ${semesterId ? 'AND e.semester_id = ?' : ''}
     ORDER BY s.start_date, sub.subject_code`,
    semesterId ? [studentId, semesterId] : [studentId]),
  summary: (studentId: number) => queryOne<Row>(
    `SELECT * FROM v_student_academic_summary WHERE student_id = ?`, [studentId]),
  /** Department result analysis (pass %, average SGPA). */
  departmentAnalysis: (semesterId?: number) => query<Row>(
    `SELECT d.department_id AS departmentId, d.department_code AS departmentCode, d.name AS departmentName,
            COUNT(DISTINCT r.student_id) AS students,
            ROUND(AVG(r.sgpa), 2) AS averageSgpa,
            ROUND(AVG(r.cgpa), 2) AS averageCgpa,
            SUM(r.result_status IN ('FAIL')) AS failed,
            ROUND(100 * SUM(r.result_status <> 'FAIL') / NULLIF(COUNT(*), 0), 2) AS passPercentage
     FROM results r
     JOIN students st ON st.student_id = r.student_id
     JOIN departments d ON d.department_id = st.department_id
     ${semesterId ? 'WHERE r.semester_id = ?' : ''}
     GROUP BY d.department_id, d.department_code, d.name
     ORDER BY averageSgpa DESC`,
    semesterId ? [semesterId] : []),
  rankings: (semesterId?: number, limit = 50) => query<Row>(
    `SELECT * FROM v_student_rankings
     ${semesterId ? 'WHERE semester_id = ?' : ''}
     ORDER BY class_rank LIMIT ?`,
    semesterId ? [semesterId, limit] : [limit]),
  subjectWise: (semesterId?: number) => query<Row>(
    `SELECT * FROM v_subject_failure_rate ${semesterId ? 'WHERE semester_id = ?' : ''}
     ORDER BY failure_rate DESC`, semesterId ? [semesterId] : []),
};

export const gradesRepo = {
  list: () => query<Row>('SELECT * FROM grades ORDER BY min_percentage DESC'),
};
