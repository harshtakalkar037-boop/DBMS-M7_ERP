import { query, queryOne, Row } from '../config/database';

/** Aggregates that power the role dashboards. Every figure is computed from live tables. */
export const dashboardRepo = {
  admin: async () => {
    const [counts, dept, attendance, fees, risk, recentActivity] = await Promise.all([
      queryOne<Row>(`SELECT
        (SELECT COUNT(*) FROM students WHERE status = 'ACTIVE') AS activeStudents,
        (SELECT COUNT(*) FROM faculty WHERE status = 'ACTIVE') AS activeFaculty,
        (SELECT COUNT(*) FROM departments) AS departments,
        (SELECT COUNT(*) FROM programs) AS programs,
        (SELECT COUNT(*) FROM subjects) AS subjects,
        (SELECT COUNT(*) FROM course_offerings) AS offerings,
        (SELECT COUNT(*) FROM enrollments) AS enrollments,
        (SELECT COUNT(*) FROM hostels) AS hostels,
        (SELECT COUNT(*) FROM room_allocations WHERE status = 'ACTIVE') AS hostelResidents,
        (SELECT COUNT(*) FROM exams) AS exams,
        (SELECT COUNT(*) FROM faculty_leaves WHERE status = 'PENDING') AS pendingLeaves,
        (SELECT COUNT(*) FROM hostel_applications WHERE status = 'APPLIED') AS pendingHostelApps,
        (SELECT COUNT(*) FROM admissions WHERE status = 'APPLIED') AS pendingAdmissions,
        (SELECT COUNT(*) FROM student_fees WHERE status IN ('PENDING','PARTIAL','OVERDUE')) AS openBills`),
      query<Row>(`SELECT * FROM v_department_performance`),
      queryOne<Row>(`SELECT ROUND(AVG(overall_percentage), 2) AS average,
                            SUM(attendance_status = 'SAFE') AS safe,
                            SUM(attendance_status = 'WARNING') AS warning,
                            SUM(attendance_status = 'CRITICAL') AS critical
                     FROM v_student_attendance_overall`),
      queryOne<Row>(`SELECT ROUND(SUM(total_amount), 2) AS billed,
                            ROUND(SUM(paid_amount), 2) AS collected,
                            ROUND(SUM(due_amount), 2) AS outstanding
                     FROM student_fees`),
      queryOne<Row>(`SELECT SUM(risk_level = 'CRITICAL') AS critical,
                            SUM(risk_level = 'HIGH') AS high,
                            SUM(risk_level = 'MEDIUM') AS medium,
                            SUM(risk_level = 'LOW') AS low
                     FROM v_student_risk_dashboard`),
      query<Row>(`SELECT a.log_id AS id, a.action, a.entity, a.description,
                         a.created_at AS createdAt
                  FROM audit_logs a ORDER BY a.log_id DESC LIMIT 12`),
    ]);
    return { counts, departments: dept, attendance, fees, risk, recentActivity };
  },

  student: async (studentId: number) => {
    const [profile, academic, attendance, subjects, fees, exams, hostel, notifications, mock, dues] =
      await Promise.all([
        queryOne<Row>('SELECT * FROM v_student_full_profile WHERE student_id = ?', [studentId]),
        queryOne<Row>('SELECT * FROM v_student_academic_summary WHERE student_id = ?', [studentId]),
        queryOne<Row>('SELECT * FROM v_student_attendance_overall WHERE student_id = ?', [studentId]),
        query<Row>(`SELECT subject_code AS subjectCode, subject_name AS subjectName, percentage,
                           attendance_status AS status, attended, total_classes AS totalClasses
                    FROM v_student_attendance_summary WHERE student_id = ? ORDER BY percentage ASC`, [studentId]),
        queryOne<Row>('SELECT * FROM v_student_fee_status WHERE student_id = ?', [studentId]),
        query<Row>(`SELECT exam_name AS examName, exam_type AS examType, status,
                           hall_ticket_no AS hallTicketNo, start_time AS startTime, exam_date AS examDate,
                           room_number AS roomNumber
                    FROM v_exam_hall_ticket WHERE student_id = ?
                    ORDER BY exam_date DESC LIMIT 10`, [studentId]),
        queryOne<Row>(`SELECT ra.allocation_id AS allocationId, h.name AS hostelName,
                              r.room_number AS roomNumber, bd.bed_code AS bedCode, ra.allocated_on AS allocatedOn
                       FROM room_allocations ra
                       JOIN hostels h ON h.hostel_id = ra.hostel_id
                       JOIN rooms r   ON r.room_id = ra.room_id
                       JOIN beds bd   ON bd.bed_id = ra.bed_id
                       WHERE ra.student_id = ? AND ra.status = 'ACTIVE' LIMIT 1`, [studentId]),
        query<Row>(`SELECT title, message, type, severity, created_at AS createdAt
                    FROM notifications WHERE (user_id = ? OR user_id IS NULL)
                    ORDER BY created_at DESC LIMIT 6`,
          // notifications are keyed by user_id, so map student -> user first
          [(await queryOne<Row>('SELECT user_id AS userId FROM students WHERE student_id = ?', [studentId]))?.userId]),
        query<Row>(`SELECT COUNT(*) AS attempts, ROUND(AVG(percentage), 2) AS averagePercentage
                    FROM mock_exams WHERE student_id = ? AND status = 'SUBMITTED'`, [studentId]),
        queryOne<Row>('SELECT fn_student_outstanding_dues(?) AS outstanding', [studentId]),
      ]);
    return { profile, academic, attendance, subjects, fees, exams, hostel, notifications, mock, dues };
  },

  faculty: async (facultyId: number) => {
    const [profile, subjects, todayClasses, pendingLeaves, payroll, lowAttendance, exams] = await Promise.all([
      queryOne<Row>(`SELECT f.*, d.department_code AS departmentCode, des.title AS designation
                     FROM faculty f
                     JOIN departments d ON d.department_id = f.department_id
                     JOIN designations des ON des.designation_id = f.designation_id
                     WHERE f.faculty_id = ?`, [facultyId]),
      query<Row>(`SELECT o.offering_id AS offeringId, sub.subject_code AS subjectCode, sub.name AS subjectName,
                         p.program_code AS programCode, sec.section_code AS sectionCode,
                         o.enrolled_count AS enrolled, s.semester_no AS semesterNo
                  FROM course_offerings o
                  JOIN subjects sub ON sub.subject_id = o.subject_id
                  JOIN programs p   ON p.program_id = o.program_id
                  JOIN semesters s  ON s.semester_id = o.semester_id
                  LEFT JOIN sections sec ON sec.section_id = o.section_id
                  WHERE o.faculty_id = ? ORDER BY sub.subject_code`, [facultyId]),
      query<Row>(`SELECT COUNT(*) AS sessions FROM class_sessions cs WHERE cs.faculty_id = ?
                    AND cs.session_date = CURDATE()`, [facultyId]),
      queryOne<Row>(`SELECT COUNT(*) AS pending FROM faculty_leaves WHERE faculty_id = ? AND status = 'PENDING'`,
        [facultyId]),
      queryOne<Row>(`SELECT p.* FROM payrolls p WHERE p.faculty_id = ?
                     ORDER BY p.pay_year DESC, p.pay_month DESC LIMIT 1`, [facultyId]),
      query<Row>(`SELECT st.student_id AS studentId, st.roll_number AS rollNumber,
                         CONCAT(st.first_name, ' ', st.last_name) AS studentName,
                         sub.subject_code AS subjectCode,
                         fn_calculate_attendance_percentage(st.student_id, o.offering_id) AS percentage
                  FROM course_offerings o
                  JOIN enrollments e ON e.offering_id = o.offering_id
                  JOIN students st   ON st.student_id = e.student_id
                  JOIN subjects sub  ON sub.subject_id = o.subject_id
                  WHERE o.faculty_id = ?
                  HAVING percentage < 75
                  ORDER BY percentage ASC LIMIT 20`, [facultyId]),
      query<Row>(`SELECT e.exam_id AS examId, e.name, e.exam_type AS examType, e.status,
                         e.start_date AS startDate,
                         (SELECT COUNT(*) FROM exam_registrations r WHERE r.exam_id = e.exam_id) AS registrations
                  FROM exams e ORDER BY e.start_date DESC LIMIT 6`),
    ]);
    return { profile, subjects, todayClasses, pendingLeaves, payroll, lowAttendance, exams };
  },

  accountant: async () => {
    const [totals, monthly, defaulters, recent] = await Promise.all([
      queryOne<Row>(`SELECT ROUND(SUM(total_amount), 2) AS billed, ROUND(SUM(paid_amount), 2) AS collected,
                            ROUND(SUM(due_amount), 2) AS outstanding, ROUND(SUM(fine_amount), 2) AS fines,
                            COUNT(*) AS bills,
                            SUM(status = 'PAID') AS paidBills,
                            SUM(status = 'OVERDUE') AS overdueBills
                     FROM student_fees`),
      query<Row>('SELECT * FROM v_fee_collection_summary ORDER BY year DESC, month DESC LIMIT 12'),
      query<Row>(`SELECT st.roll_number AS rollNumber, CONCAT(st.first_name, ' ', st.last_name) AS studentName,
                         SUM(sf.due_amount) AS outstanding
                  FROM student_fees sf JOIN students st ON st.student_id = sf.student_id
                  WHERE sf.due_amount > 0 GROUP BY st.student_id, st.roll_number, st.first_name, st.last_name
                  ORDER BY outstanding DESC LIMIT 10`),
      query<Row>(`SELECT p.receipt_no AS receiptNo, p.amount, p.payment_mode AS mode,
                         p.payment_date AS date, st.roll_number AS rollNumber
                  FROM payments p JOIN students st ON st.student_id = p.student_id
                  ORDER BY p.payment_date DESC LIMIT 10`),
    ]);
    return { totals, monthly, defaulters, recent };
  },

  hostelAdmin: async () => {
    const [occupancy, stats, pending, rooms] = await Promise.all([
      query<Row>('SELECT * FROM v_hostel_occupancy'),
      queryOne<Row>(`SELECT (SELECT SUM(total_beds) FROM hostels) AS beds,
                            (SELECT SUM(occupied_beds) FROM hostels) AS occupied,
                            (SELECT COUNT(*) FROM room_allocations WHERE status = 'ACTIVE') AS residents,
                            (SELECT COUNT(*) FROM hostel_applications WHERE status = 'APPLIED') AS pendingApplications`),
      query<Row>(`SELECT ha.application_no AS applicationNo, st.roll_number AS rollNumber,
                         CONCAT(st.first_name, ' ', st.last_name) AS studentName,
                         h.hostel_code AS hostelCode, ha.applied_on AS appliedOn
                  FROM hostel_applications ha
                  JOIN students st ON st.student_id = ha.student_id
                  JOIN hostels h   ON h.hostel_id = ha.hostel_id
                  WHERE ha.status = 'APPLIED' ORDER BY ha.applied_on ASC LIMIT 10`),
      query<Row>('SELECT * FROM v_room_vacancy ORDER BY hostel_code, room_number LIMIT 40'),
    ]);
    return { occupancy, stats, pending, rooms };
  },

  examCell: async () => {
    const [exams, stats, failure, results] = await Promise.all([
      query<Row>(`SELECT e.*, (SELECT COUNT(*) FROM exam_registrations r WHERE r.exam_id = e.exam_id) AS registrations
                  FROM exams e ORDER BY e.start_date DESC LIMIT 10`),
      queryOne<Row>(`SELECT COUNT(*) AS exams,
                            SUM(status = 'REGISTRATION_OPEN') AS open,
                            SUM(result_published = 1) AS published,
                            (SELECT COUNT(*) FROM exam_registrations) AS registrations,
                            (SELECT COUNT(*) FROM exam_registrations WHERE status = 'REJECTED') AS rejected
                     FROM exams`),
      query<Row>('SELECT * FROM v_subject_failure_rate ORDER BY failure_rate DESC LIMIT 10'),
      query<Row>(`SELECT d.department_code AS departmentCode, ROUND(AVG(r.sgpa), 2) AS averageSgpa
                  FROM results r JOIN students s ON s.student_id = r.student_id
                  JOIN departments d ON d.department_id = s.department_id
                  GROUP BY d.department_code ORDER BY averageSgpa DESC`),
    ]);
    return { exams, stats, failure, results };
  },

  hr: async () => {
    const [counts, leaves, payroll, departments] = await Promise.all([
      queryOne<Row>(`SELECT COUNT(*) AS faculty, SUM(status = 'ACTIVE') AS active,
                            SUM(status = 'ON_LEAVE') AS onLeave
                     FROM faculty`),
      query<Row>(`SELECT l.*, CONCAT(f.first_name, ' ', f.last_name) AS facultyName, f.employee_code AS employeeCode
                  FROM faculty_leaves l JOIN faculty f ON f.faculty_id = l.faculty_id
                  WHERE l.status = 'PENDING' ORDER BY l.applied_on DESC LIMIT 10`),
      query<Row>('SELECT * FROM v_faculty_payroll_summary ORDER BY last_pay_year DESC, last_pay_month DESC LIMIT 12'),
      query<Row>(`SELECT d.department_code AS departmentCode, COUNT(f.faculty_id) AS faculty
                  FROM departments d LEFT JOIN faculty f ON f.department_id = d.department_id
                  GROUP BY d.department_code ORDER BY faculty DESC`),
    ]);
    return { counts, leaves, payroll, departments };
  },
};
