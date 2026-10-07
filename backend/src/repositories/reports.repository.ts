import { query, queryOne, Row } from '../config/database';

/**
 * Every report is a real SQL query. `run()` returns rows + a stable column list so
 * the frontend can render a table and the CSV exporter can reuse the same result.
 */
export interface ReportResult {
  key: string;
  title: string;
  columns: string[];
  rows: Row[];
  generatedAt: string;
}

const build = (key: string, title: string, rows: Row[]): ReportResult => ({
  key,
  title,
  columns: rows.length ? Object.keys(rows[0]) : [],
  rows,
  generatedAt: new Date().toISOString(),
});

export const REPORTS: Record<string, { title: string; run: (p: Record<string, any>) => Promise<Row[]> }> = {
  /* ---------- 1. Attendance ---------- */
  attendance_summary: {
    title: 'Attendance summary (subject wise)',
    run: (p) => query<Row>(
      `SELECT st.roll_number AS roll_number,
              CONCAT(st.first_name, ' ', st.last_name) AS student_name,
              p.program_code AS program, d.department_code AS department,
              v.subject_code, v.subject_name, v.total_classes, v.attended_classes,
              v.attendance_percentage, v.attendance_status
       FROM v_student_attendance_summary v
       JOIN students st    ON st.student_id = v.student_id
       JOIN programs p     ON p.program_id = st.program_id
       JOIN departments d  ON d.department_id = st.department_id
       JOIN course_offerings o ON o.offering_id = v.offering_id
       WHERE (? IS NULL OR st.program_id = ?)
         AND (? IS NULL OR st.department_id = ?)
         AND (? IS NULL OR o.semester_id = ?)
       ORDER BY v.attendance_percentage ASC
       LIMIT 1000`,
      [p.programId ?? null, p.programId ?? null,
       p.departmentId ?? null, p.departmentId ?? null,
       p.semesterId ?? null, p.semesterId ?? null]),
  },
  attendance_defaulters: {
    title: 'Students below attendance threshold',
    run: (p) => query<Row>(
      `SELECT st.roll_number AS roll_number,
              CONCAT(st.first_name, ' ', st.last_name) AS student_name,
              p.program_code AS program, st.phone, st.email,
              v.overall_percentage, v.attended_classes, v.total_classes, v.attendance_status
       FROM v_student_attendance_overall v
       JOIN students st ON st.student_id = v.student_id
       JOIN programs p  ON p.program_id = st.program_id
       WHERE v.overall_percentage < ?
       ORDER BY v.overall_percentage ASC`,
      [p.threshold ?? 75]),
  },

  /* ---------- 2. Academic / results ---------- */
  semester_result: {
    title: 'Semester result sheet',
    run: (p) => query<Row>(
      `SELECT st.roll_number AS roll_number,
              CONCAT(st.first_name, ' ', st.last_name) AS student_name,
              p.program_code AS program, s.semester_no AS semester,
              r.sgpa, r.cgpa, r.total_credits, r.earned_credits,
              r.backlog_count, r.result_status
       FROM results r
       JOIN students st  ON st.student_id = r.student_id
       JOIN programs p   ON p.program_id = st.program_id
       JOIN semesters s  ON s.semester_id = r.semester_id
       WHERE (? IS NULL OR r.semester_id = ?)
         AND (? IS NULL OR st.program_id = ?)
       ORDER BY r.cgpa DESC`,
      [p.semesterId ?? null, p.semesterId ?? null, p.programId ?? null, p.programId ?? null]),
  },
  subject_failure: {
    title: 'Subject wise failure analysis',
    run: () => query<Row>(
      `SELECT * FROM v_subject_failure_rate ORDER BY failure_rate DESC, attempts DESC`),
  },
  department_performance: {
    title: 'Department performance',
    run: () => query<Row>('SELECT * FROM v_department_performance ORDER BY average_cgpa DESC'),
  },
  toppers: {
    title: 'University toppers (window functions)',
    run: (p) => query<Row>(
      `SELECT r.roll_number, r.full_name, p.program_code AS program,
              d.department_code AS department, r.cgpa, r.earned_credits,
              r.class_rank, r.department_rank, r.university_rank
       FROM v_student_rankings r
       JOIN students st ON st.student_id = r.student_id
       JOIN programs p  ON p.program_id = st.program_id
       JOIN departments d ON d.department_id = st.department_id
       ORDER BY r.university_rank LIMIT ?`, [Math.min(Number(p.limit) || 50, 500)]),
  },
  backlog_students: {
    title: 'Students with backlogs',
    run: () => query<Row>(
      `SELECT st.roll_number AS roll_number, CONCAT(st.first_name, ' ', st.last_name) AS student_name,
              p.program_code AS program, st.current_semester_no AS semester,
              r.cgpa, r.backlog_count AS backlogs
       FROM students st
       JOIN programs p ON p.program_id = st.program_id
       JOIN v_student_rankings r ON r.student_id = st.student_id
       WHERE st.status = 'ACTIVE' AND r.backlog_count > 0
       ORDER BY r.backlog_count DESC, st.roll_number`),
  },

  /* ---------- 3. Fees ---------- */
  fee_collection: {
    title: 'Fee collection summary',
    run: () => query<Row>('SELECT * FROM v_fee_collection_summary ORDER BY amount_pending DESC'),
  },
  fee_defaulters: {
    title: 'Fee defaulters',
    run: (p) => query<Row>(
      `SELECT st.roll_number AS roll_number,
              CONCAT(st.first_name, ' ', st.last_name) AS student_name,
              p.program_code AS program, f.total_billed, f.total_paid, f.total_due,
              f.overdue_bills, f.next_due_date, f.overall_fee_status
       FROM v_student_fee_status f
       JOIN students st ON st.student_id = f.student_id
       JOIN programs p  ON p.program_id = st.program_id
       WHERE f.total_due > ?
       ORDER BY f.total_due DESC`, [p.minDue ?? 0]),
  },
  daily_collection: {
    title: 'Daily fee collection',
    run: (p) => query<Row>(
      'SELECT * FROM v_daily_fee_collection ORDER BY payment_day DESC LIMIT ?',
      [Math.min(Number(p.limit) || 60, 500)]),
  },
  payment_register: {
    title: 'Payment register',
    run: (p) => query<Row>(
      `SELECT p.receipt_no, p.payment_date, st.roll_number,
              CONCAT(st.first_name, ' ', st.last_name) AS student_name,
              p.amount, p.payment_mode, p.status, p.reference_no
       FROM payments p JOIN students st ON st.student_id = p.student_id
       WHERE (p.payment_date >= IFNULL(?, '1900-01-01'))
         AND (p.payment_date < DATE_ADD(IFNULL(?, CURDATE()), INTERVAL 1 DAY))
       ORDER BY p.payment_date DESC LIMIT 2000`,
      [p.from ?? null, p.to ?? null]),
  },

  /* ---------- 4. Hostel ---------- */
  hostel_occupancy: {
    title: 'Hostel occupancy',
    run: () => query<Row>('SELECT * FROM v_hostel_occupancy ORDER BY occupancy_percentage DESC'),
  },
  hostel_residents: {
    title: 'Hostel residents',
    run: (p) => query<Row>(
      `SELECT h.hostel_code, r.room_number, bd.bed_code, st.roll_number,
              CONCAT(st.first_name, ' ', st.last_name) AS student_name, st.gender,
              p.program_code AS program, ra.allocated_on, ra.rent_amount
       FROM room_allocations ra
       JOIN students st ON st.student_id = ra.student_id
       JOIN hostels h   ON h.hostel_id = ra.hostel_id
       JOIN rooms r     ON r.room_id = ra.room_id
       JOIN beds bd     ON bd.bed_id = ra.bed_id
       JOIN programs p  ON p.program_id = st.program_id
       WHERE ra.status = 'ACTIVE' AND (? IS NULL OR ra.hostel_id = ?)
       ORDER BY h.hostel_code, r.room_number, bd.bed_code`,
      [p.hostelId ?? null, p.hostelId ?? null]),
  },

  /* ---------- 5. Faculty / HR ---------- */
  faculty_workload: {
    title: 'Faculty workload',
    run: () => query<Row>('SELECT * FROM v_faculty_workload ORDER BY students_taught DESC'),
  },
  payroll_register: {
    title: 'Payroll register',
    run: (p) => query<Row>(
      `SELECT p.payroll_id, f.employee_code,
              CONCAT(f.first_name, ' ', f.last_name) AS faculty_name,
              d.department_code AS department, des.title AS designation,
              p.pay_month, p.pay_year, p.gross_salary, p.pf_deduction,
              p.professional_tax, p.income_tax, p.lop_days, p.lop_amount,
              p.net_salary, p.working_days, p.status
       FROM payrolls p
       JOIN faculty f        ON f.faculty_id = p.faculty_id
       JOIN departments d    ON d.department_id = f.department_id
       JOIN designations des ON des.designation_id = f.designation_id
       WHERE (? IS NULL OR p.pay_year = ?) AND (? IS NULL OR p.pay_month = ?)
       ORDER BY p.pay_year DESC, p.pay_month DESC, f.employee_code`,
      [p.year ?? null, p.year ?? null, p.month ?? null, p.month ?? null]),
  },
  leave_register: {
    title: 'Leave register',
    run: (p) => query<Row>(
      `SELECT f.employee_code, CONCAT(f.first_name, ' ', f.last_name) AS faculty_name,
              l.leave_type, l.start_date, l.end_date, l.days, l.status, l.applied_on
       FROM faculty_leaves l JOIN faculty f ON f.faculty_id = l.faculty_id
       WHERE (? IS NULL OR l.status = ?) AND (? IS NULL OR f.department_id = ?)
       ORDER BY l.applied_on DESC LIMIT 1000`,
      [p.status ?? null, p.status ?? null, p.departmentId ?? null, p.departmentId ?? null]),
  },

  /* ---------- 6. At-risk students ---------- */
  at_risk_students: {
    title: 'At risk students (composite score)',
    run: (p) => query<Row>(
      `SELECT * FROM v_student_risk_dashboard
       WHERE (? IS NULL OR risk_level = ?)
       ORDER BY risk_score DESC LIMIT 500`,
      [p.level ?? null, p.level ?? null]),
  },

  /* ---------- 7. Audit ---------- */
  audit_trail: {
    title: 'Audit trail',
    run: (p) => query<Row>(
      `SELECT a.log_id, a.action, a.entity, a.entity_id, a.description,
              u.email AS actor, a.ip_address, a.created_at
       FROM audit_logs a LEFT JOIN users u ON u.user_id = a.user_id
       WHERE (? IS NULL OR a.entity = ?) AND (? IS NULL OR a.action = ?)
       ORDER BY a.log_id DESC LIMIT 1000`,
      [p.entity ?? null, p.entity ?? null, p.action ?? null, p.action ?? null]),
  },
};

export const reportsRepo = {
  catalog: () => Object.entries(REPORTS).map(([key, r]) => ({ key, title: r.title })),
  run: async (key: string, params: Record<string, any> = {}): Promise<ReportResult> => {
    const report = REPORTS[key];
    if (!report) throw Object.assign(new Error(`Unknown report: ${key}`), { status: 404 });
    const rows = await report.run(params);
    return build(key, report.title, rows);
  },
  /** Headline numbers shown above every report page. */
  kpis: () => queryOne<Row>(
    `SELECT (SELECT COUNT(*) FROM students WHERE status = 'ACTIVE') AS students,
            (SELECT COUNT(*) FROM faculty WHERE status = 'ACTIVE') AS faculty,
            (SELECT ROUND(AVG(overall_percentage), 2) FROM v_student_attendance_overall) AS avgAttendance,
            (SELECT ROUND(SUM(paid_amount), 2) FROM student_fees) AS collected,
            (SELECT ROUND(SUM(due_amount), 2) FROM student_fees) AS outstanding,
            (SELECT COUNT(*) FROM room_allocations WHERE status = 'ACTIVE') AS residents`),
};
