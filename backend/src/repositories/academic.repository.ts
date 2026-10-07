import { query, queryOne, execute, Row } from '../config/database';
import { paginate, searchClause, ListResult } from './helpers';
import { Paging } from '../utils/api';

/* ======================================================== MASTER ENTITIES */

const simple = (table: string, order: string) => ({
  list: (q: Record<string, any>, paging: Paging, searchCols: string[]): Promise<ListResult<Row>> => {
    const eq: Record<string, string> = {};
    if (q.departmentId) eq.departmentId = `${table}.department_id`;
    if (q.status) eq.status = `${table}.status`;
    if (q.level) eq.level = `${table}.level`;
    const parts: string[] = [];
    const params: unknown[] = [];
    for (const [k, col] of Object.entries(eq)) {
      parts.push(`${col} = ?`);
      params.push(q[k]);
    }
    const base = { clause: parts.length ? `WHERE ${parts.join(' AND ')}` : '', params };
    const where = searchClause(searchCols, q.search as string, base);
    return paginate<Row>({
      baseSql: `SELECT * FROM \`${table}\``,
      where,
      orderBy: order,
      paging,
    });
  },
  byId: (id: number) => queryOne<Row>(`SELECT * FROM \`${table}\` WHERE ${idColumn(table)} = ?`, [id]),
});

const idColumn = (table: string): string => {
  const map: Record<string, string> = {
    departments: 'department_id',
    programs: 'program_id',
    batches: 'batch_id',
    categories: 'category_id',
    subjects: 'subject_id',
    designations: 'designation_id',
    academic_years: 'academic_year_id',
    semesters: 'semester_id',
    sections: 'section_id',
  };
  return map[table] ?? `${table.replace(/s$/, '')}_id`;
};

export const departmentsRepo = simple('departments', 'department_code ASC');
export const categoriesRepo = simple('categories', 'category_id ASC');
export const designationsRepo = simple('designations', 'designation_id ASC');

export const programsRepo = {
  ...simple('programs', 'program_code ASC'),
  listAll: () => query<Row>(
    `SELECT p.*, d.department_code AS departmentCode, d.name AS departmentName,
            (SELECT COUNT(*) FROM batches b WHERE b.program_id = p.program_id) AS batchCount,
            (SELECT COUNT(*) FROM students s WHERE s.program_id = p.program_id) AS studentCount
     FROM programs p JOIN departments d ON d.department_id = p.department_id
     ORDER BY p.program_code`),
};

export const subjectsRepo = {
  list: (q: Record<string, any>, paging: Paging): Promise<ListResult<Row>> => {
    const parts: string[] = [];
    const params: unknown[] = [];
    if (q.departmentId) { parts.push('s.department_id = ?'); params.push(q.departmentId); }
    if (q.semester) {
      parts.push(`EXISTS (SELECT 1 FROM program_subjects ps
                          WHERE ps.subject_id = s.subject_id AND ps.semester_no = ?)`);
      params.push(q.semester);
    }
    if (q.subjectType) { parts.push('s.subject_type = ?'); params.push(q.subjectType); }
    if (q.programId) {
      parts.push(`EXISTS (SELECT 1 FROM program_subjects ps
                          WHERE ps.subject_id = s.subject_id AND ps.program_id = ?)`);
      params.push(q.programId);
    }
    const where = searchClause(['s.subject_code', 's.name'], q.search as string,
      { clause: parts.length ? `WHERE ${parts.join(' AND ')}` : '', params });
    return paginate<Row>({
      baseSql: `SELECT s.*, d.department_code AS departmentCode, d.name AS departmentName
                FROM subjects s JOIN departments d ON d.department_id = s.department_id`,
      where,
      orderBy: 's.subject_code ASC',
      paging,
    });
  },
  byId: (id: number) => queryOne<Row>('SELECT * FROM subjects WHERE subject_id = ?', [id]),
  create: async (b: Record<string, any>): Promise<number> => {
    const res = await execute(
      `INSERT INTO subjects (subject_code, name, short_name, credits, subject_type, department_id,
                             lecture_hours, tutorial_hours, practical_hours, is_elective, status)
       VALUES (?,?,?,?,?,?,?,?,?,?, 'ACTIVE')`,
      [b.subjectCode, b.name, b.shortName ?? null, b.credits ?? 3, b.subjectType ?? 'THEORY',
       b.departmentId, b.lectureHours ?? 3, b.tutorialHours ?? 0,
       b.practicalHours ?? 0, b.isElective ? 1 : 0],
    );
    return res.insertId;
  },
  update: async (id: number, b: Record<string, any>): Promise<void> => {
    await execute(
      `UPDATE subjects SET name = COALESCE(?, name), credits = COALESCE(?, credits),
              subject_type = COALESCE(?, subject_type), department_id = COALESCE(?, department_id),
              is_elective = COALESCE(?, is_elective), status = COALESCE(?, status)
       WHERE subject_id = ?`,
      [b.name ?? null, b.credits ?? null, b.subjectType ?? null, b.departmentId ?? null,
       b.isElective === undefined ? null : (b.isElective ? 1 : 0), b.status ?? null, id],
    );
  },
};

export const batchesRepo = {
  list: (q: Record<string, any>, paging: Paging): Promise<ListResult<Row>> => {
    const parts: string[] = [];
    const params: unknown[] = [];
    if (q.programId) { parts.push('b.program_id = ?'); params.push(q.programId); }
    if (q.status) { parts.push('b.status = ?'); params.push(q.status); }
    const where = searchClause(['b.batch_code'], q.search as string,
      { clause: parts.length ? `WHERE ${parts.join(' AND ')}` : '', params });
    return paginate<Row>({
      baseSql: `SELECT b.*, p.program_code AS programCode, p.name AS programName,
                       ay.year_label AS yearLabel,
                       (SELECT COUNT(*) FROM students s WHERE s.batch_id = b.batch_id) AS studentCount
                FROM batches b
                JOIN programs p ON p.program_id = b.program_id
                JOIN academic_years ay ON ay.academic_year_id = b.academic_year_id`,
      where, orderBy: 'b.batch_code ASC', paging,
    });
  },
  byId: (id: number) => queryOne<Row>('SELECT * FROM batches WHERE batch_id = ?', [id]),
};

/* ==================================================== ACADEMIC YEARS/TERMS */

export const yearsRepo = {
  list: () => query<Row>(
    `SELECT ay.*, (SELECT COUNT(*) FROM semesters s WHERE s.academic_year_id = ay.academic_year_id) AS semesterCount
     FROM academic_years ay ORDER BY ay.start_date DESC`),
  semesters: (academicYearId?: number) => query<Row>(
    `SELECT s.*, ay.year_label AS yearLabel
     FROM semesters s JOIN academic_years ay ON ay.academic_year_id = s.academic_year_id
     ${academicYearId ? 'WHERE s.academic_year_id = ?' : ''}
     ORDER BY s.academic_year_id, s.semester_no`,
    academicYearId ? [academicYearId] : []),
  current: () => queryOne<Row>(
    `SELECT s.*, ay.year_label AS yearLabel FROM semesters s
     JOIN academic_years ay ON ay.academic_year_id = s.academic_year_id
     WHERE s.is_current = 1 LIMIT 1`),
};

/* =============================================================== SECTIONS */

export const sectionsRepo = {
  list: (q: Record<string, any>) => query<Row>(
    `SELECT sec.*, p.program_code AS programCode, p.name AS programName, b.batch_code AS batchCode,
            f.first_name AS classTeacherFirst, f.last_name AS classTeacherLast,
            (SELECT COUNT(*) FROM students s WHERE s.batch_id = sec.batch_id) AS studentCount
     FROM sections sec
     JOIN programs p ON p.program_id = sec.program_id
     JOIN batches b  ON b.batch_id = sec.batch_id
     LEFT JOIN faculty f ON f.faculty_id = sec.class_teacher_id
     ${q.programId ? 'WHERE sec.program_id = ?' : ''}
     ORDER BY sec.section_id`,
    q.programId ? [q.programId] : []),
  create: async (b: Record<string, any>): Promise<number> => {
    const res = await execute(
      `INSERT INTO sections (section_code, program_id, batch_id, semester_id, capacity, room_number, status)
       VALUES (?,?,?,?,?,?,'ACTIVE')`,
      [b.sectionCode, b.programId, b.batchId, b.semesterId ?? null, b.capacity ?? 60, b.roomNumber ?? null],
    );
    return res.insertId;
  },
  setClassTeacher: (id: number, facultyId: number | null) =>
    execute('UPDATE sections SET class_teacher_id = ? WHERE section_id = ?', [facultyId, id]),
};

/* ====================================================== COURSE OFFERINGS */

export const offeringsRepo = {
  list: (q: Record<string, any>, paging: Paging): Promise<ListResult<Row>> => {
    const parts: string[] = [];
    const params: unknown[] = [];
    if (q.programId) { parts.push('o.program_id = ?'); params.push(q.programId); }
    if (q.semesterId) { parts.push('o.semester_id = ?'); params.push(q.semesterId); }
    if (q.facultyId) { parts.push('o.faculty_id = ?'); params.push(q.facultyId); }
    if (q.academicYearId) { parts.push('o.academic_year_id = ?'); params.push(q.academicYearId); }
    if (q.status) { parts.push('o.status = ?'); params.push(q.status); }
    const where = searchClause(['sub.subject_code', 'sub.name', 'p.program_code'], q.search as string,
      { clause: parts.length ? `WHERE ${parts.join(' AND ')}` : '', params });
    return paginate<Row>({
      baseSql: `SELECT o.*, sub.subject_code AS subjectCode, sub.name AS subjectName, sub.credits,
                       p.program_code AS programCode, p.name AS programName,
                       s.semester_no AS semesterNo, ay.year_label AS yearLabel,
                       CONCAT(f.first_name, ' ', f.last_name) AS facultyName,
                       sec.section_code AS sectionCode,
                       (SELECT COUNT(*) FROM enrollments e WHERE e.offering_id = o.offering_id) AS enrolled
                FROM course_offerings o
                JOIN subjects sub        ON sub.subject_id = o.subject_id
                JOIN programs p          ON p.program_id = o.program_id
                JOIN semesters s         ON s.semester_id = o.semester_id
                JOIN academic_years ay   ON ay.academic_year_id = o.academic_year_id
                LEFT JOIN faculty f      ON f.faculty_id = o.faculty_id
                LEFT JOIN sections sec   ON sec.section_id = o.section_id`,
      where, orderBy: 'o.offering_id DESC', paging,
    });
  },
  byId: (id: number) => queryOne<Row>(
    `SELECT o.*, sub.subject_code AS subjectCode, sub.name AS subjectName, sub.credits,
            CONCAT(f.first_name, ' ', f.last_name) AS facultyName, s.semester_no AS semesterNo
     FROM course_offerings o
     JOIN subjects sub ON sub.subject_id = o.subject_id
     LEFT JOIN faculty f ON f.faculty_id = o.faculty_id
     JOIN semesters s ON s.semester_id = o.semester_id
     WHERE o.offering_id = ?`, [id]),
  create: async (b: Record<string, any>): Promise<number> => {
    const res = await execute(
      `INSERT INTO course_offerings
        (subject_id, semester_id, academic_year_id, program_id, section_id, faculty_id,
         capacity, offering_type, status)
       VALUES (?,?,?,?,?,?,?,?,'OPEN')`,
      [b.subjectId, b.semesterId, b.academicYearId, b.programId, b.sectionId ?? null,
       b.facultyId ?? null, b.capacity ?? 60, b.offeringType ?? 'REGULAR'],
    );
    return res.insertId;
  },
  update: async (id: number, b: Record<string, any>): Promise<void> => {
    await execute(
      `UPDATE course_offerings SET faculty_id = COALESCE(?, faculty_id), capacity = COALESCE(?, capacity),
              status = COALESCE(?, status), offering_type = COALESCE(?, offering_type)
       WHERE offering_id = ?`,
      [b.facultyId ?? null, b.capacity ?? null, b.status ?? null, b.offeringType ?? null, id],
    );
  },
};

/* ============================================================ ENROLLMENTS */

export const enrollmentsRepo = {
  list: (q: Record<string, any>, paging: Paging): Promise<ListResult<Row>> => {
    const parts: string[] = [];
    const params: unknown[] = [];
    if (q.studentId) { parts.push('e.student_id = ?'); params.push(q.studentId); }
    if (q.offeringId) { parts.push('e.offering_id = ?'); params.push(q.offeringId); }
    if (q.semesterId) { parts.push('o.semester_id = ?'); params.push(q.semesterId); }
    if (q.programId) { parts.push('o.program_id = ?'); params.push(q.programId); }
    if (q.status) { parts.push('e.status = ?'); params.push(q.status); }
    const where = searchClause(['s.roll_number', 'CONCAT(s.first_name, " ", s.last_name)', 'sub.subject_code'],
      q.search as string, { clause: parts.length ? `WHERE ${parts.join(' AND ')}` : '', params });
    return paginate<Row>({
      baseSql: `SELECT e.*, s.roll_number AS rollNumber,
                       CONCAT(s.first_name, ' ', s.last_name) AS studentName,
                       sub.subject_code AS subjectCode, sub.name AS subjectName, sub.credits,
                       o.semester_id AS semesterId, s2.semester_no AS semesterNo,
                       p.program_code AS programCode
                FROM enrollments e
                JOIN students s ON s.student_id = e.student_id
                JOIN course_offerings o ON o.offering_id = e.offering_id
                JOIN subjects sub ON sub.subject_id = o.subject_id
                JOIN semesters s2 ON s2.semester_id = o.semester_id
                JOIN programs p ON p.program_id = o.program_id`,
      where, orderBy: 'e.enrollment_id DESC', paging,
    });
  },
  create: async (studentId: number, offeringId: number, by: number): Promise<number> => {
    const res = await execute(
      `INSERT INTO enrollments (student_id, offering_id, enrolled_by, status) VALUES (?,?,?,'ENROLLED')`,
      [studentId, offeringId, by],
    );
    return res.insertId;
  },
  remove: (id: number) => execute('DELETE FROM enrollments WHERE enrollment_id = ?', [id]),
  /** Subjects a student is currently studying (used by the student dashboard). */
  forStudent: (studentId: number, semesterId?: number) => query<Row>(
    `SELECT e.enrollment_id AS enrollmentId, o.offering_id AS offeringId, sub.subject_code AS subjectCode,
            sub.name AS subjectName, sub.credits, sub.subject_type AS subjectType,
            CONCAT(f.first_name, ' ', f.last_name) AS facultyName,
            s.semester_no AS semesterNo, s2.semester_id AS semesterId,
            fn_calculate_attendance_percentage(?, o.offering_id) AS attendancePercentage
     FROM enrollments e
     JOIN course_offerings o ON o.offering_id = e.offering_id
     JOIN subjects sub       ON sub.subject_id = o.subject_id
     JOIN semesters s2       ON s2.semester_id = o.semester_id
     LEFT JOIN semesters s   ON s.semester_id = o.semester_id
     LEFT JOIN faculty f     ON f.faculty_id = o.faculty_id
     WHERE e.student_id = ? ${semesterId ? 'AND o.semester_id = ?' : ''}
     ORDER BY sub.subject_code`,
    semesterId ? [studentId, studentId, semesterId] : [studentId, studentId]),
};

/* ============================================================== TIMETABLE */

export const timetableRepo = {
  forSection: (sectionId: number) => query<Row>(
    `SELECT t.*, sub.subject_code AS subjectCode, sub.name AS subjectName,
            CONCAT(f.first_name, ' ', f.last_name) AS facultyName
     FROM timetable t
     JOIN course_offerings o ON o.offering_id = t.offering_id
     JOIN subjects sub       ON sub.subject_id = o.subject_id
     JOIN faculty f          ON f.faculty_id = t.faculty_id
     WHERE t.section_id = ? AND t.is_active = 1
     ORDER BY FIELD(t.day_of_week,'MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY'), t.start_time`,
    [sectionId]),
  forFaculty: (facultyId: number) => query<Row>(
    `SELECT t.*, sub.subject_code AS subjectCode, sub.name AS subjectName,
            sec.section_code AS sectionCode, p.program_code AS programCode
     FROM timetable t
     JOIN course_offerings o ON o.offering_id = t.offering_id
     JOIN subjects sub       ON sub.subject_id = o.subject_id
     JOIN sections sec       ON sec.section_id = t.section_id
     JOIN programs p         ON p.program_id = o.program_id
     WHERE t.faculty_id = ? AND t.is_active = 1
     ORDER BY FIELD(t.day_of_week,'MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY'), t.start_time`,
    [facultyId]),
  forStudent: (studentId: number) => query<Row>(
    `SELECT t.*, sub.subject_code AS subjectCode, sub.name AS subjectName,
            CONCAT(f.first_name, ' ', f.last_name) AS facultyName
     FROM timetable t
     JOIN enrollments e       ON e.offering_id = t.offering_id
     JOIN course_offerings o  ON o.offering_id = t.offering_id
     JOIN subjects sub        ON sub.subject_id = o.subject_id
     JOIN faculty f           ON f.faculty_id = t.faculty_id
     WHERE e.student_id = ? AND t.is_active = 1
     ORDER BY FIELD(t.day_of_week,'MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY'), t.start_time`,
    [studentId]),
  create: async (b: Record<string, any>): Promise<number> => {
    // Conflict detection is enforced by trg_timetable_bi_conflict and by UNIQUE keys.
    const res = await execute(
      `INSERT INTO timetable (offering_id, section_id, faculty_id, day_of_week, start_time, end_time, room_number, slot_label)
       VALUES (?,?,?,?,?,?,?,?)`,
      [b.offeringId, b.sectionId, b.facultyId, b.dayOfWeek, b.startTime, b.endTime,
       b.roomNumber, b.slotLabel ?? null],
    );
    return res.insertId;
  },
  remove: (id: number) => execute('DELETE FROM timetable WHERE timetable_id = ?', [id]),
  /** Returns every clash in the current timetable (used by the admin screen). */
  conflicts: () => query<Row>(
    `SELECT 'FACULTY' AS conflictType, t1.faculty_id AS refId, t1.day_of_week AS day, t1.start_time AS startTime,
            COUNT(*) AS slots, GROUP_CONCAT(DISTINCT t1.room_number) AS rooms
     FROM timetable t1 GROUP BY t1.faculty_id, t1.day_of_week, t1.start_time HAVING COUNT(*) > 1
     UNION ALL
     SELECT 'ROOM', t2.room_number, t2.day_of_week, t2.start_time, COUNT(*), GROUP_CONCAT(DISTINCT t2.faculty_id)
     FROM timetable t2 GROUP BY t2.room_number, t2.day_of_week, t2.start_time HAVING COUNT(*) > 1`),
};

/* ====================================================== ACADEMIC CALENDAR */

export const calendarRepo = {
  list: (from?: string, to?: string) => query<Row>(
    `SELECT c.*, ay.year_label AS yearLabel, s.semester_no AS semesterNo
     FROM academic_calendar c
     JOIN academic_years ay ON ay.academic_year_id = c.academic_year_id
     LEFT JOIN semesters s  ON s.semester_id = c.semester_id
     ${from ? 'WHERE c.event_date >= ?' : ''} ${from && to ? 'AND c.event_date <= ?' : ''}
     ORDER BY c.event_date`,
    from && to ? [from, to] : from ? [from] : []),
  create: async (b: Record<string, any>): Promise<number> => {
    const res = await execute(
      `INSERT INTO academic_calendar (academic_year_id, semester_id, title, description, event_type, event_date, end_date, is_holiday)
       VALUES (?,?,?,?,?,?,?,?)`,
      [b.academicYearId, b.semesterId ?? null, b.title, b.description ?? null,
       b.eventType ?? 'OTHER', b.eventDate, b.endDate ?? null, b.isHoliday ? 1 : 0],
    );
    return res.insertId;
  },
  remove: (id: number) => execute('DELETE FROM academic_calendar WHERE event_id = ?', [id]),
};

/* ================================================== FACULTY ALLOCATIONS */

export const facultySubjectsRepo = {
  list: (facultyId?: number) => query<Row>(
    `SELECT fs.*, sub.subject_code AS subjectCode, sub.name AS subjectName, sub.credits,
            CONCAT(f.first_name, ' ', f.last_name) AS facultyName, ay.year_label AS yearLabel
     FROM faculty_subjects fs
     JOIN subjects sub ON sub.subject_id = fs.subject_id
     JOIN faculty f    ON f.faculty_id = fs.faculty_id
     JOIN academic_years ay ON ay.academic_year_id = fs.academic_year_id
     ${facultyId ? 'WHERE fs.faculty_id = ?' : ''}
     ORDER BY fs.allocation_id`,
    facultyId ? [facultyId] : []),
  create: async (b: Record<string, any>): Promise<number> => {
    const res = await execute(
      `INSERT INTO faculty_subjects (faculty_id, subject_id, academic_year_id, semester_id, is_primary)
       VALUES (?,?,?,?,?) ON DUPLICATE KEY UPDATE is_primary = VALUES(is_primary)`,
      [b.facultyId, b.subjectId, b.academicYearId, b.semesterId ?? null, b.isPrimary ? 1 : 0],
    );
    return res.insertId;
  },
  remove: (id: number) => execute('DELETE FROM faculty_subjects WHERE allocation_id = ?', [id]),
};

export const curriculumRepo = {
  forProgram: (programId: number) => query<Row>(
    `SELECT ps.*, sub.subject_code AS subjectCode, sub.name AS subjectName, sub.credits,
            sub.subject_type AS subjectType
     FROM program_subjects ps JOIN subjects sub ON sub.subject_id = ps.subject_id
     WHERE ps.program_id = ? ORDER BY ps.semester_no, sub.subject_code`, [programId]),
  add: async (programId: number, subjectId: number, semesterNo: number, isElective: boolean): Promise<void> => {
    await execute(
      `INSERT IGNORE INTO program_subjects (program_id, subject_id, semester_no, is_elective)
       VALUES (?,?,?,?)`,
      [programId, subjectId, semesterNo, isElective ? 1 : 0],
    );
  },
  remove: (programId: number, subjectId: number, semesterNo: number) =>
    execute('DELETE FROM program_subjects WHERE program_id = ? AND subject_id = ? AND semester_no = ?',
      [programId, subjectId, semesterNo]),
};
