import { query, queryOne, execute, Row } from '../config/database';
import { paginate, searchClause, ListResult } from './helpers';
import { Paging } from '../utils/api';

export const facultyRepo = {
  list: (q: Record<string, any>, paging: Paging): Promise<ListResult<Row>> => {
    const parts: string[] = [];
    const params: unknown[] = [];
    if (q.departmentId) { parts.push('f.department_id = ?'); params.push(q.departmentId); }
    if (q.designationId) { parts.push('f.designation_id = ?'); params.push(q.designationId); }
    if (q.status) { parts.push('f.status = ?'); params.push(q.status); }
    if (q.employmentType) { parts.push('f.employment_type = ?'); params.push(q.employmentType); }
    const where = searchClause(['f.employee_code', 'f.email', 'CONCAT(f.first_name, " ", f.last_name)'],
      q.search as string, { clause: parts.length ? `WHERE ${parts.join(' AND ')}` : '', params });
    return paginate<Row>({
      baseSql: `SELECT f.*, d.department_code AS departmentCode, d.name AS departmentName,
                       des.title AS designation, des.grade, u.email AS loginEmail, u.is_active AS loginActive,
                       (SELECT p.net_salary FROM payrolls p WHERE p.faculty_id = f.faculty_id
                        ORDER BY p.pay_year DESC, p.pay_month DESC LIMIT 1) AS latestNetSalary,
                       fn_calculate_net_salary(f.faculty_id, MONTH(CURDATE()), YEAR(CURDATE())) AS netSalary
                FROM faculty f
                JOIN departments d  ON d.department_id = f.department_id
                JOIN designations des ON des.designation_id = f.designation_id
                JOIN users u        ON u.user_id = f.user_id`,
      where, orderBy: 'f.employee_code ASC', paging,
    });
  },
  byId: (id: number) => queryOne<Row>(
    `SELECT f.*, d.department_code AS departmentCode, d.name AS departmentName,
            des.title AS designation, u.email AS loginEmail, u.is_active AS loginActive
     FROM faculty f
     JOIN departments d ON d.department_id = f.department_id
     JOIN designations des ON des.designation_id = f.designation_id
     JOIN users u ON u.user_id = f.user_id
     WHERE f.faculty_id = ?`, [id]),
  byUserId: (userId: number) => queryOne<Row>('SELECT * FROM faculty WHERE user_id = ?', [userId]),
  create: async (b: Record<string, any>, userId: number): Promise<number> => {
    const res = await execute(
      `INSERT INTO faculty (user_id, employee_code, first_name, last_name, email, phone, date_of_birth,
        gender, designation_id, department_id, joining_date, employment_type, qualification,
        specialization, experience_years, basic_salary, hra, da, ta, special_allowance, pf_percent, bank_account, status)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'ACTIVE')`,
      [userId, b.employeeCode, b.firstName, b.lastName, b.email, b.phone ?? null, b.dateOfBirth,
       b.gender, b.designationId, b.departmentId, b.joiningDate, b.employmentType ?? 'REGULAR',
       b.qualification ?? null, b.specialization ?? null, b.experienceYears ?? 0,
       b.basicSalary ?? 0, b.hra ?? 0, b.da ?? 0, b.ta ?? 0, b.specialAllowance ?? 0,
       b.pfPercent ?? 12, b.bankAccount ?? null],
    );
    return res.insertId;
  },
  update: async (id: number, b: Record<string, any>): Promise<void> => {
    await execute(
      `UPDATE faculty SET first_name = COALESCE(?, first_name), last_name = COALESCE(?, last_name),
              phone = COALESCE(?, phone), designation_id = COALESCE(?, designation_id),
              department_id = COALESCE(?, department_id), employment_type = COALESCE(?, employment_type),
              qualification = COALESCE(?, qualification), specialization = COALESCE(?, specialization),
              experience_years = COALESCE(?, experience_years), basic_salary = COALESCE(?, basic_salary),
              hra = COALESCE(?, hra), da = COALESCE(?, da), ta = COALESCE(?, ta),
              special_allowance = COALESCE(?, special_allowance), pf_percent = COALESCE(?, pf_percent),
              bank_account = COALESCE(?, bank_account), status = COALESCE(?, status)
       WHERE faculty_id = ?`,
      [b.firstName ?? null, b.lastName ?? null, b.phone ?? null, b.designationId ?? null,
       b.departmentId ?? null, b.employmentType ?? null, b.qualification ?? null,
       b.specialization ?? null, b.experienceYears ?? null, b.basicSalary ?? null, b.hra ?? null,
       b.da ?? null, b.ta ?? null, b.specialAllowance ?? null, b.pfPercent ?? null,
       b.bankAccount ?? null, b.status ?? null, id],
    );
  },
  /** Shows everything one faculty member teaches plus their section responsibilities. */
  workload: (facultyId?: number | null) => query<Row>(
    `SELECT * FROM v_faculty_workload ${facultyId ? 'WHERE faculty_id = ?' : ''}`,
    facultyId ? [facultyId] : []),
  stats: () => queryOne<Row>(
    `SELECT COUNT(*) AS total, SUM(status = 'ACTIVE') AS active, SUM(status = 'ON_LEAVE') AS onLeave,
            (SELECT COUNT(*) FROM faculty_leaves fl WHERE fl.status = 'PENDING') AS pendingLeaves,
            (SELECT COUNT(*) FROM payrolls p WHERE p.status IN ('GENERATED','APPROVED','PAID')) AS payslips
     FROM faculty`),
  /** Subjects + sections assigned to a faculty member (for the faculty dashboard). */
  teachingLoad: (facultyId: number) => query<Row>(
    `SELECT o.offering_id AS offeringId, sub.subject_code AS subjectCode, sub.name AS subjectName,
            sub.credits, p.program_code AS programCode, sec.section_code AS sectionCode,
            s.semester_no AS semesterNo, o.enrolled_count AS enrolled
     FROM course_offerings o
     JOIN subjects sub     ON sub.subject_id = o.subject_id
     JOIN programs p       ON p.program_id = o.program_id
     JOIN semesters s      ON s.semester_id = o.semester_id
     LEFT JOIN sections sec ON sec.section_id = o.section_id
     WHERE o.faculty_id = ? ORDER BY sub.subject_code`, [facultyId]),
};

/* ================================================================= LEAVES */

export const leavesRepo = {
  list: (q: Record<string, any>, paging: Paging): Promise<ListResult<Row>> => {
    const parts: string[] = [];
    const params: unknown[] = [];
    if (q.facultyId) { parts.push('l.faculty_id = ?'); params.push(q.facultyId); }
    if (q.status) { parts.push('l.status = ?'); params.push(q.status); }
    if (q.leaveType) { parts.push('l.leave_type = ?'); params.push(q.leaveType); }
    if (q.departmentId) { parts.push('f.department_id = ?'); params.push(q.departmentId); }
    const where = searchClause(['f.employee_code', 'CONCAT(f.first_name, " ", f.last_name)'],
      q.search as string, { clause: parts.length ? `WHERE ${parts.join(' AND ')}` : '', params });
    return paginate<Row>({
      baseSql: `SELECT l.*, CONCAT(f.first_name, ' ', f.last_name) AS facultyName,
                       f.employee_code AS employeeCode, d.department_code AS departmentCode,
                       CONCAT(a.first_name, ' ', a.last_name) AS approverName
                FROM faculty_leaves l
                JOIN faculty f ON f.faculty_id = l.faculty_id
                JOIN departments d ON d.department_id = f.department_id
                LEFT JOIN faculty a ON a.faculty_id = l.approved_by`,
      where, orderBy: 'l.applied_on DESC, l.leave_id DESC', paging,
    });
  },
  byId: (id: number) => queryOne<Row>(
    `SELECT l.*, CONCAT(f.first_name, ' ', f.last_name) AS facultyName, f.email
     FROM faculty_leaves l JOIN faculty f ON f.faculty_id = l.faculty_id WHERE l.leave_id = ?`, [id]),
  create: async (facultyId: number, b: Record<string, any>): Promise<number> => {
    const res = await execute(
      `INSERT INTO faculty_leaves (faculty_id, leave_type, start_date, end_date, days, reason, status)
       VALUES (?,?,?,?,?,?,'PENDING')`,
      [facultyId, b.leaveType, b.startDate, b.endDate, b.days, b.reason],
    );
    return res.insertId;
  },
  balances: (facultyId: number) => query<Row>(
    `SELECT lb.*,
            fn_calculate_faculty_leave_balance(
              lb.faculty_id, lb.leave_type,
              (SELECT academic_year_id FROM academic_years WHERE is_current = 1 LIMIT 1)
            ) AS remaining
     FROM leave_balances lb WHERE lb.faculty_id = ? ORDER BY lb.leave_type`, [facultyId]),
  /** Leave types with their sanctioned quota for the current year. */
  types: () => query<Row>(
    `SELECT DISTINCT leave_type AS leaveType FROM leave_balances ORDER BY leave_type`),
};

/* =============================================================== PAYROLL */

export const payrollRepo = {
  list: (q: Record<string, any>, paging: Paging): Promise<ListResult<Row>> => {
    const parts: string[] = [];
    const params: unknown[] = [];
    if (q.payMonth) { parts.push('p.pay_month = ?'); params.push(q.payMonth); }
    if (q.payYear) { parts.push('p.pay_year = ?'); params.push(q.payYear); }
    if (q.facultyId) { parts.push('p.faculty_id = ?'); params.push(q.facultyId); }
    if (q.status) { parts.push('p.status = ?'); params.push(q.status); }
    const where = searchClause(['f.employee_code', 'CONCAT(f.first_name, " ", f.last_name)'],
      q.search as string, { clause: parts.length ? `WHERE ${parts.join(' AND ')}` : '', params });
    return paginate<Row>({
      baseSql: `SELECT p.*, f.employee_code AS employeeCode,
                       CONCAT(f.first_name, ' ', f.last_name) AS facultyName,
                       f.bank_account AS bankAccount, des.title AS designation,
                       d.department_code AS departmentCode
                FROM payrolls p
                JOIN faculty f       ON f.faculty_id = p.faculty_id
                JOIN designations des ON des.designation_id = f.designation_id
                JOIN departments d   ON d.department_id = f.department_id`,
      where, orderBy: 'p.pay_year DESC, p.pay_month DESC, f.employee_code ASC', paging,
    });
  },
  byId: (id: number) => queryOne<Row>(
    `SELECT p.*, f.employee_code AS employeeCode, f.bank_account AS bankAccount,
            CONCAT(f.first_name, ' ', f.last_name) AS facultyName,
            des.title AS designation, d.name AS departmentName, f.joining_date AS joiningDate
     FROM payrolls p
     JOIN faculty f        ON f.faculty_id = p.faculty_id
     JOIN designations des ON des.designation_id = f.designation_id
     JOIN departments d    ON d.department_id = f.department_id
     WHERE p.payroll_id = ?`, [id]),
  components: (payrollId: number) => query<Row>(
    `SELECT * FROM payroll_components WHERE payroll_id = ? ORDER BY component_type, component_id`, [payrollId]),
  summary: () => query<Row>('SELECT * FROM v_faculty_payroll_summary ORDER BY last_pay_year DESC, last_pay_month DESC, employee_code'),
  updateStatus: (id: number, status: string) => execute(
    `UPDATE payrolls SET status = ?, ${status === 'PAID' ? 'paid_on = CURDATE(),' : ''} remarks = remarks
     WHERE payroll_id = ?`, [status, id]),
  months: () => query<Row>(
    `SELECT pay_year AS year, pay_month AS month, COUNT(*) AS rows_,
            ROUND(SUM(net_salary), 2) AS totalNet
     FROM payrolls GROUP BY pay_year, pay_month ORDER BY pay_year DESC, pay_month DESC`),
};
