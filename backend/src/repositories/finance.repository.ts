import { query, queryOne, execute, Row } from '../config/database';
import { paginate, searchClause, ListResult } from './helpers';
import { Paging } from '../utils/api';

export const feeStructuresRepo = {
  list: (q: Record<string, any>, paging: Paging): Promise<ListResult<Row>> => {
    const parts: string[] = [];
    const params: unknown[] = [];
    if (q.programId) { parts.push('fs.program_id = ?'); params.push(q.programId); }
    if (q.academicYearId) { parts.push('fs.academic_year_id = ?'); params.push(q.academicYearId); }
    if (q.semesterNo) { parts.push('fs.semester_no = ?'); params.push(q.semesterNo); }
    const where = searchClause(['fs.fee_code', 'p.program_code'], q.search as string,
      { clause: parts.length ? `WHERE ${parts.join(' AND ')}` : '', params });
    return paginate<Row>({
      baseSql: `SELECT fs.*, p.program_code AS programCode, p.name AS programName,
                       ay.year_label AS yearLabel, c.category_code AS categoryCode,
                       (fs.tuition_fee + fs.hostel_fee + fs.exam_fee + fs.library_fee +
                        fs.lab_fee + fs.development_fee + fs.other_fee) AS totalFee
                FROM fee_structures fs
                JOIN programs p        ON p.program_id = fs.program_id
                JOIN academic_years ay ON ay.academic_year_id = fs.academic_year_id
                LEFT JOIN categories c ON c.category_id = fs.category_id`,
      where, orderBy: 'fs.fee_structure_id DESC', paging,
    });
  },
  byId: (id: number) => queryOne<Row>('SELECT * FROM fee_structures WHERE fee_structure_id = ?', [id]),
  create: async (b: Record<string, any>): Promise<number> => {
    const res = await execute(
      `INSERT INTO fee_structures (fee_code, program_id, semester_no, academic_year_id, category_id,
        tuition_fee, hostel_fee, exam_fee, library_fee, lab_fee, development_fee, other_fee,
        late_fee_per_day, grace_days, due_date, status)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'ACTIVE')`,
      [b.feeCode, b.programId, b.semesterNo, b.academicYearId, b.categoryId ?? null,
       b.tuitionFee ?? 0, b.hostelFee ?? 0, b.examFee ?? 0, b.libraryFee ?? 0,
       b.labFee ?? 0, b.developmentFee ?? 0, b.otherFee ?? 0,
       b.lateFeePerDay ?? 50, b.graceDays ?? 10, b.dueDate],
    );
    return res.insertId;
  },
  update: async (id: number, b: Record<string, any>): Promise<void> => {
    await execute(
      `UPDATE fee_structures SET tuition_fee = COALESCE(?, tuition_fee), hostel_fee = COALESCE(?, hostel_fee),
              exam_fee = COALESCE(?, exam_fee), library_fee = COALESCE(?, library_fee),
              lab_fee = COALESCE(?, lab_fee), development_fee = COALESCE(?, development_fee),
              other_fee = COALESCE(?, other_fee), late_fee_per_day = COALESCE(?, late_fee_per_day),
              grace_days = COALESCE(?, grace_days), due_date = COALESCE(?, due_date),
              status = COALESCE(?, status)
       WHERE fee_structure_id = ?`,
      [b.tuitionFee ?? null, b.hostelFee ?? null, b.examFee ?? null, b.libraryFee ?? null,
       b.labFee ?? null, b.developmentFee ?? null, b.otherFee ?? null, b.lateFeePerDay ?? null,
       b.graceDays ?? null, b.dueDate ?? null, b.status ?? null, id],
    );
  },
};

export const studentFeesRepo = {
  list: (q: Record<string, any>, paging: Paging): Promise<ListResult<Row>> => {
    const parts: string[] = [];
    const params: unknown[] = [];
    if (q.studentId) { parts.push('sf.student_id = ?'); params.push(q.studentId); }
    if (q.status) { parts.push('sf.status = ?'); params.push(q.status); }
    if (q.programId) { parts.push('st.program_id = ?'); params.push(q.programId); }
    if (q.semesterId) { parts.push('sf.semester_id = ?'); params.push(q.semesterId); }
    if (q.academicYearId) { parts.push('sf.academic_year_id = ?'); params.push(q.academicYearId); }
    if (q.overdueOnly) { parts.push("sf.status IN ('PENDING','PARTIAL','OVERDUE') AND sf.due_date < CURDATE()"); }
    const where = searchClause(['st.roll_number', 'CONCAT(st.first_name, " ", st.last_name)'],
      q.search as string, { clause: parts.length ? `WHERE ${parts.join(' AND ')}` : '', params });
    return paginate<Row>({
      baseSql: `SELECT sf.*, st.roll_number AS rollNumber,
                       CONCAT(st.first_name, ' ', st.last_name) AS studentName, st.phone, st.email,
                       fs.fee_code AS feeCode, s.semester_no AS semesterNo, ay.year_label AS yearLabel,
                       p.program_code AS programCode,
                       fn_calculate_late_fee(sf.student_fee_id) AS computedLateFee
                FROM student_fees sf
                JOIN students st         ON st.student_id = sf.student_id
                JOIN fee_structures fs   ON fs.fee_structure_id = sf.fee_structure_id
                JOIN semesters s         ON s.semester_id = sf.semester_id
                JOIN academic_years ay   ON ay.academic_year_id = sf.academic_year_id
                JOIN programs p          ON p.program_id = st.program_id`,
      where, orderBy: 'sf.student_fee_id DESC', paging,
    });
  },
  byId: (id: number) => queryOne<Row>(
    `SELECT sf.*, st.roll_number AS rollNumber, CONCAT(st.first_name, ' ', st.last_name) AS studentName,
            fs.fee_code AS feeCode, s.semester_no AS semesterNo,
            fn_calculate_late_fee(sf.student_fee_id) AS computedLateFee
     FROM student_fees sf
     JOIN students st ON st.student_id = sf.student_id
     JOIN fee_structures fs ON fs.fee_structure_id = sf.fee_structure_id
     JOIN semesters s ON s.semester_id = sf.semester_id
     WHERE sf.student_fee_id = ?`, [id]),
  forStudent: (studentId: number) => query<Row>(
    `SELECT sf.*, fs.fee_code AS feeCode, s.semester_no AS semesterNo, ay.year_label AS yearLabel,
            fn_calculate_late_fee(sf.student_fee_id) AS computedLateFee
     FROM student_fees sf
     JOIN fee_structures fs ON fs.fee_structure_id = sf.fee_structure_id
     JOIN semesters s       ON s.semester_id = sf.semester_id
     JOIN academic_years ay ON ay.academic_year_id = sf.academic_year_id
     WHERE sf.student_id = ? ORDER BY s.start_date DESC`, [studentId]),
  summaryForStudent: (studentId: number) => queryOne<Row>(
    'SELECT * FROM v_student_fee_status WHERE student_id = ?', [studentId]),
  ledger: (studentFeeId: number) => query<Row>(
    `SELECT t.*, p.receipt_no AS receiptNo, p.payment_mode AS paymentMode
     FROM transactions t LEFT JOIN payments p ON p.payment_id = t.payment_id
     WHERE t.student_fee_id = ? ORDER BY t.transaction_id`, [studentFeeId]),

  /** Accounts dashboard totals. */
  stats: () => queryOne<Row>(
    `SELECT COUNT(*) AS bills,
            SUM(CASE WHEN status <> 'PAID' THEN 1 ELSE 0 END) AS openBills,
            ROUND(SUM(total_amount), 2)  AS billed,
            ROUND(SUM(paid_amount), 2)   AS collected,
            ROUND(SUM(due_amount), 2)    AS outstanding,
            ROUND(SUM(fine_amount), 2)   AS fines
     FROM student_fees`),
  defaulters: (limit = 100) => query<Row>(
    `SELECT st.student_id AS studentId, st.roll_number AS rollNumber,
            CONCAT(st.first_name, ' ', st.last_name) AS studentName, st.phone, st.email,
            p.program_code AS programCode, d.department_code AS departmentCode,
            SUM(sf.due_amount) AS outstanding, MIN(sf.due_date) AS oldestDueDate,
            DATEDIFF(CURDATE(), MIN(sf.due_date)) AS daysOverdue,
            fn_calculate_late_fee(MIN(sf.student_fee_id)) AS lateFee
     FROM student_fees sf
     JOIN students st ON st.student_id = sf.student_id
     JOIN programs p  ON p.program_id = st.program_id
     JOIN departments d ON d.department_id = st.department_id
     WHERE sf.due_amount > 0 AND sf.status <> 'PAID'
     GROUP BY st.student_id, st.roll_number, st.first_name, st.last_name, st.phone, st.email,
              p.program_code, d.department_code
     ORDER BY outstanding DESC LIMIT ?`, [limit]),
};

export const paymentsRepo = {
  list: (q: Record<string, any>, paging: Paging): Promise<ListResult<Row>> => {
    const parts: string[] = ['p.status = ?'];
    const params: unknown[] = [q.status ?? 'SUCCESS'];
    if (q.studentId) { parts.push('p.student_id = ?'); params.push(q.studentId); }
    if (q.paymentMode) { parts.push('p.payment_mode = ?'); params.push(q.paymentMode); }
    if (q.from) { parts.push('DATE(p.payment_date) >= ?'); params.push(q.from); }
    if (q.to) { parts.push('DATE(p.payment_date) <= ?'); params.push(q.to); }
    const where = searchClause(['p.receipt_no', 'p.transaction_id', 'st.roll_number'],
      q.search as string, { clause: `WHERE ${parts.join(' AND ')}`, params });
    return paginate<Row>({
      baseSql: `SELECT p.*, st.roll_number AS rollNumber,
                       CONCAT(st.first_name, ' ', st.last_name) AS studentName,
                       s.semester_no AS semesterNo,
                       CONCAT(u2.first_name, ' ', u2.last_name) AS receivedByName
                FROM payments p
                JOIN students st ON st.student_id = p.student_id
                LEFT JOIN student_fees sf ON sf.student_fee_id = p.student_fee_id
                LEFT JOIN semesters s ON s.semester_id = sf.semester_id
                LEFT JOIN faculty u2 ON u2.user_id = p.received_by`,
      where, orderBy: 'p.payment_date DESC', paging,
    });
  },
  byReceipt: (receiptNo: string) => queryOne<Row>(
    `SELECT p.*, st.roll_number AS rollNumber,
            CONCAT(st.first_name, ' ', st.last_name) AS studentName, st.email, st.phone,
            p2.program_code AS programCode, s.semester_no AS semesterNo, ay.year_label AS yearLabel
     FROM payments p
     JOIN students st ON st.student_id = p.student_id
     LEFT JOIN programs p2 ON p2.program_id = st.program_id
     LEFT JOIN student_fees sf ON sf.student_fee_id = p.student_fee_id
     LEFT JOIN semesters s ON s.semester_id = sf.semester_id
     LEFT JOIN academic_years ay ON ay.academic_year_id = sf.academic_year_id
     WHERE p.receipt_no = ?`, [receiptNo]),
  daily: (days = 30) => query<Row>(
    'SELECT * FROM v_daily_fee_collection ORDER BY payment_day DESC LIMIT ?', [days]),
  monthly: () => query<Row>('SELECT * FROM v_fee_collection_summary ORDER BY program_code, semester_no'),
};

export const finesRepo = {
  list: (q: Record<string, any>) => query<Row>(
    `SELECT f.*, st.roll_number AS rollNumber, CONCAT(st.first_name, ' ', st.last_name) AS studentName
     FROM fines f JOIN students st ON st.student_id = f.student_id
     ${q.studentId ? 'WHERE f.student_id = ?' : ''}
     ORDER BY f.imposed_on DESC LIMIT 200`, q.studentId ? [q.studentId] : []),
  create: async (b: Record<string, any>, by: number): Promise<number> => {
    const res = await execute(
      `INSERT INTO fines (student_id, student_fee_id, reason, fine_type, amount, imposed_by, status)
       VALUES (?,?,?,?,?,?,'PENDING')`,
      [b.studentId, b.studentFeeId ?? null, b.reason, b.fineType ?? 'OTHER', b.amount, by],
    );
    return res.insertId;
  },
  updateStatus: (id: number, status: string) =>
    execute('UPDATE fines SET status = ? WHERE fine_id = ?', [status, id]),
};

export const scholarshipsRepo = {
  list: () => query<Row>(
    `SELECT sc.*, (SELECT COUNT(*) FROM student_scholarships ss
                   WHERE ss.scholarship_id = sc.scholarship_id AND ss.status IN ('APPROVED','CREDITED')) AS beneficiaries
     FROM scholarships sc ORDER BY sc.scholarship_id`),
  award: async (studentId: number, scholarshipId: number, academicYearId: number, amount: number, by: number) => {
    const res = await execute(
      `INSERT INTO student_scholarships (student_id, scholarship_id, academic_year_id, amount, sanctioned_by, status)
       VALUES (?,?,?,?,?,'APPROVED')`,
      [studentId, scholarshipId, academicYearId, amount, by],
    );
    return res.insertId;
  },
  forStudent: (studentId: number) => query<Row>(
    `SELECT ss.*, sc.name AS scholarshipName, sc.scholarship_type AS type, ay.year_label AS yearLabel
     FROM student_scholarships ss
     JOIN scholarships sc ON sc.scholarship_id = ss.scholarship_id
     JOIN academic_years ay ON ay.academic_year_id = ss.academic_year_id
     WHERE ss.student_id = ? ORDER BY ss.sanctioned_on DESC`, [studentId]),
};

export const refundsRepo = {
  list: () => query<Row>(
    `SELECT r.*, st.roll_number AS rollNumber, CONCAT(st.first_name, ' ', st.last_name) AS studentName,
            p.receipt_no AS receiptNo
     FROM refunds r
     JOIN students st ON st.student_id = r.student_id
     LEFT JOIN payments p ON p.payment_id = r.payment_id
     ORDER BY r.refund_date DESC LIMIT 200`),
  create: async (b: Record<string, any>, by: number): Promise<number> => {
    const res = await execute(
      `INSERT INTO refunds (payment_id, student_id, amount, reason, refund_mode, processed_by, status)
       VALUES (?,?,?,?,?,?,'PROCESSED')`,
      [b.paymentId, b.studentId, b.amount, b.reason, b.refundMode ?? 'NETBANKING', by],
    );
    return res.insertId;
  },
};
