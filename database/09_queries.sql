-- =============================================================================
-- 09_queries.sql — Complex / analytical queries for the University ERP
-- =============================================================================
-- Project : University Higher Education ERP System
-- Batch   : M7 BATCH, Department of E&TCE
-- Engine  : MySQL 8.0 / MariaDB 10.6+  (developed and tested on MariaDB 11.8)
--
-- WHY THIS FILE EXISTS
--   The application issues its own queries from backend/src/repositories/*.ts.
--   This file is the *teaching* companion: 45 hand-written queries that show
--   every construct a DBMS syllabus asks for, grouped by concept:
--
--     A. JOINs                     (inner, outer, self, anti-join, 6-table join)
--     B. GROUP BY / HAVING         (aggregation, filtering groups)
--     C. Subqueries                (scalar, correlated, IN, EXISTS, derived)
--     D. CTEs                      (simple, multiple, recursive)
--     E. Window functions          (ROW_NUMBER, RANK, DENSE_RANK, LAG/LEAD,
--                                   SUM/AVG/COUNT OVER, NTILE, FIRST_VALUE)
--     F. End-to-end analytics      (the queries behind the real dashboards)
--
--   Every query is self-contained and SELECT-only: you can run the whole file
--     mysql -u erp_user -p university_erp < database/09_queries.sql
--   or copy a single block into the viva. Nothing here writes data.
--
--   Notation used in the headers:
--     [VIVA]  = a question an examiner is likely to ask, with the answer.
-- =============================================================================

-- The target database must already be selected, e.g.
--   mysql -u root -p university_erp < 09_queries.sql
-- 01_schema.sql creates it. These files deliberately carry no hard-coded USE,
-- so the same scripts install cleanly under any database name (Docker, CI, clones).

SET SESSION sql_mode = 'STRICT_TRANS_TABLES,NO_ENGINE_SUBSTITUTION,ONLY_FULL_GROUP_BY';

-- =============================================================================
-- SECTION A — JOINs
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Q01 · Five-table inner join — the student master record, fully resolved
-- Concepts: INNER JOIN, foreign-key traversal, column aliasing.
-- Note: this is exactly what v_student_full_profile exposes as a view.
-- -----------------------------------------------------------------------------
SELECT s.roll_number,
       CONCAT(s.first_name, ' ', IFNULL(s.middle_name, ''), ' ', s.last_name) AS student_name,
       s.email,
       d.department_code,
       d.name            AS department_name,
       p.program_code,
       p.name            AS program_name,
       b.batch_code,
       c.name            AS category,
       s.current_semester_no,
       s.admission_year,
       s.status
FROM   students    s
JOIN   departments d ON d.department_id = s.department_id
JOIN   programs    p ON p.program_id    = s.program_id
JOIN   batches     b ON b.batch_id      = s.batch_id
JOIN   categories  c ON c.category_id   = s.category_id
WHERE  s.status = 'ACTIVE'
ORDER  BY d.department_code, s.roll_number
LIMIT  50;


-- -----------------------------------------------------------------------------
-- Q02 · Six-table join — who teaches what to whom, and how many enrolled
-- Concepts: chained INNER JOINs across four different modules (academics,
--           faculty, students, examinations).
-- -----------------------------------------------------------------------------
SELECT sub.subject_code,
       sub.name                                        AS subject_name,
       sub.credits,
       CONCAT(f.first_name, ' ', f.last_name)          AS faculty_name,
       f.employee_code,
       p.program_code,
       sec.section_code,
       sem.name                                        AS semester,
       o.enrolled_count,
       o.capacity,
       ROUND(o.enrolled_count * 100.0 / NULLIF(o.capacity, 0), 1) AS fill_percentage
FROM   course_offerings o
JOIN   subjects    sub ON sub.subject_id  = o.subject_id
JOIN   faculty     f   ON f.faculty_id    = o.faculty_id
JOIN   programs    p   ON p.program_id    = o.program_id
JOIN   semesters   sem ON sem.semester_id = o.semester_id
LEFT   JOIN sections sec ON sec.section_id = o.section_id
WHERE  o.status = 'ACTIVE'
ORDER  BY sub.subject_code, p.program_code
LIMIT  60;


-- -----------------------------------------------------------------------------
-- Q03 · LEFT JOIN with a status predicate in ON (not WHERE) — residents vs
--       day scholars. Putting `ra.status = 'ACTIVE'` in WHERE would silently
--       turn this into an INNER JOIN and hide every day scholar.
-- Concepts: OUTER JOIN, predicate placement, IFNULL/CASE presentation.
-- -----------------------------------------------------------------------------
SELECT s.roll_number,
       CONCAT(s.first_name, ' ', s.last_name) AS student_name,
       CASE WHEN ra.allocation_id IS NULL THEN 'DAY SCHOLAR' ELSE 'RESIDENT' END AS residency,
       h.name        AS hostel,
       h.hostel_code,
       r.room_number,
       bd.bed_code,
       ra.allocated_on
FROM   students s
LEFT   JOIN room_allocations ra
       ON  ra.student_id = s.student_id
       AND ra.status      = 'ACTIVE'
LEFT   JOIN hostels h ON h.hostel_id = ra.hostel_id
LEFT   JOIN rooms   r ON r.room_id   = ra.room_id
LEFT   JOIN beds    bd ON bd.bed_id  = ra.bed_id
WHERE  s.status = 'ACTIVE'
ORDER  BY residency, h.hostel_code, r.room_number
LIMIT  60;


-- -----------------------------------------------------------------------------
-- Q04 · Self join — every department with the name of its HOD
-- Concepts: SELF JOIN on faculty (departments.hod_faculty_id → faculty).
-- -----------------------------------------------------------------------------
SELECT d.department_code,
       d.name                                    AS department,
       CONCAT(h.first_name, ' ', h.last_name)    AS hod_name,
       h.employee_code                           AS hod_code,
       des.title                                 AS hod_designation,
       (SELECT COUNT(*) FROM faculty f2 WHERE f2.department_id = d.department_id) AS faculty_count
FROM   departments d
LEFT   JOIN faculty      h   ON h.faculty_id      = d.hod_faculty_id
LEFT   JOIN designations des ON des.designation_id = h.designation_id
ORDER  BY d.department_code;


-- -----------------------------------------------------------------------------
-- Q05 · Anti-join #1 (LEFT JOIN … IS NULL) — active students who have not
--       enrolled in anything for the current semester.
-- Concepts: anti-join, correlated status lookup with a scalar subquery.
-- -----------------------------------------------------------------------------
SELECT s.roll_number,
       CONCAT(s.first_name, ' ', s.last_name) AS student_name,
       s.current_semester_no
FROM   students s
LEFT   JOIN enrollments e
       ON  e.student_id = s.student_id
       AND e.status      = 'ENROLLED'
       AND e.offering_id IN (SELECT o.offering_id
                             FROM   course_offerings o
                             WHERE  o.semester_id = (SELECT semester_id
                                                     FROM   semesters
                                                     WHERE  is_current = 1
                                                     LIMIT  1))
WHERE  s.status = 'ACTIVE'
  AND  e.enrollment_id IS NULL
ORDER  BY s.roll_number;


-- -----------------------------------------------------------------------------
-- Q06 · Anti-join #2 (NOT EXISTS) — subjects that exist in the curriculum but
--       have never been offered to any batch.
-- [VIVA] "NOT IN vs NOT EXISTS?" → NOT EXISTS is NULL-safe and usually uses an
--        anti-semi-join; NOT IN returns zero rows if the subquery yields NULL.
-- -----------------------------------------------------------------------------
SELECT sub.subject_code, sub.name, sub.credits, d.department_code, sub.status
FROM   subjects sub
JOIN   departments d ON d.department_id = sub.department_id
WHERE  NOT EXISTS (SELECT 1
                   FROM   course_offerings o
                   WHERE  o.subject_id = sub.subject_id)
ORDER  BY d.department_code, sub.subject_code;


-- -----------------------------------------------------------------------------
-- Q07 · Fee ledger with aggregated payments — one row per student bill
-- Concepts: JOIN + LEFT JOIN + correlated scalar subquery + GROUP BY in a
--           derived table (see Q19 for the derived-table form).
-- -----------------------------------------------------------------------------
SELECT s.roll_number,
       CONCAT(s.first_name, ' ', s.last_name)                       AS student_name,
       sf.student_fee_id,
       sf.total_amount,
       sf.scholarship_amount,
       sf.fine_amount,
       sf.paid_amount,
       sf.due_amount,
       sf.status,
       sf.due_date,
       (SELECT COUNT(*) FROM payments py WHERE py.student_fee_id = sf.student_fee_id AND py.status = 'SUCCESS') AS receipts,
       DATEDIFF(CURDATE(), sf.due_date)                              AS days_overdue
FROM   student_fees sf
JOIN   students s ON s.student_id = sf.student_id
WHERE  sf.status <> 'PAID'
ORDER  BY days_overdue DESC
LIMIT  50;


-- -----------------------------------------------------------------------------
-- Q08 · Result sheet join — marks traced back to exam, schedule and subject
-- Concepts: 6-table join across examination + academics + student modules.
-- -----------------------------------------------------------------------------
SELECT e.exam_code,
       es.exam_date,
       sub.subject_code,
       sub.name                                 AS subject_name,
       s.roll_number,
       CONCAT(s.first_name, ' ', s.last_name)   AS student_name,
       m.marks_obtained,
       m.max_marks,
       m.grade,
       m.grade_points
FROM   marks m
JOIN   exam_registrations er ON er.registration_id = m.registration_id
JOIN   exams               e ON e.exam_id          = er.exam_id
JOIN   exam_schedules      es ON es.schedule_id    = er.schedule_id
JOIN   course_offerings    o  ON o.offering_id     = er.offering_id
JOIN   subjects            sub ON sub.subject_id   = o.subject_id
JOIN   students            s  ON s.student_id      = er.student_id
WHERE  e.exam_type = 'ENDSEM'
ORDER  BY e.exam_code, sub.subject_code, s.roll_number
LIMIT  60;


-- =============================================================================
-- SECTION B — GROUP BY / HAVING
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Q09 · Department strength with a HAVING filter on the group
-- Concepts: GROUP BY, COUNT, HAVING (filtering groups, not rows).
-- -----------------------------------------------------------------------------
SELECT d.department_code,
       d.name                             AS department,
       COUNT(*)                           AS students,
       SUM(s.gender = 'MALE')             AS male,
       SUM(s.gender = 'FEMALE')           AS female,
       COUNT(DISTINCT s.program_id)       AS programs,
       COUNT(DISTINCT s.batch_id)         AS batches
FROM   students s
JOIN   departments d ON d.department_id = s.department_id
WHERE  s.status = 'ACTIVE'
GROUP  BY d.department_id, d.department_code, d.name
HAVING COUNT(*) >= 10
ORDER  BY students DESC;


-- -----------------------------------------------------------------------------
-- Q10 · Subjects where more than 20% of the class failed (exam-cell watchlist)
-- Concepts: GROUP BY, conditional SUM(CASE…), HAVING on a computed ratio.
-- -----------------------------------------------------------------------------
SELECT sub.subject_code,
       sub.name                                                        AS subject_name,
       COUNT(*)                                                        AS attempts,
       SUM(CASE WHEN m.is_pass = 1 THEN 1 ELSE 0 END)                  AS passed,
       SUM(CASE WHEN m.is_pass = 0 OR m.is_absent = 1 THEN 1 ELSE 0 END) AS failed,
       ROUND(AVG(m.percentage), 2)                                     AS avg_percentage,
       ROUND(100.0 * SUM(CASE WHEN m.is_pass = 1 THEN 1 ELSE 0 END) / COUNT(*), 1) AS pass_percentage
FROM   marks m
JOIN   exam_registrations er ON er.registration_id = m.registration_id
JOIN   course_offerings   o  ON o.offering_id      = er.offering_id
JOIN   subjects           sub ON sub.subject_id    = o.subject_id
GROUP  BY sub.subject_id, sub.subject_code, sub.name
HAVING COUNT(*) >= 10
   AND (100.0 * SUM(CASE WHEN m.is_pass = 1 THEN 1 ELSE 0 END) / COUNT(*)) < 80
ORDER  BY pass_percentage ASC;


-- -----------------------------------------------------------------------------
-- Q11 · Attendance below the 75% bar — the rule that blocks exam registration
-- Concepts: GROUP BY, conditional aggregation, HAVING.
-- Ties to : trg_block_exam_registration / sp_register_student_for_exam.
-- -----------------------------------------------------------------------------
SELECT s.roll_number,
       CONCAT(s.first_name, ' ', s.last_name)          AS student_name,
       sub.subject_code,
       COUNT(*)                                        AS sessions,
       SUM(CASE WHEN a.status = 'PRESENT' THEN 1 ELSE 0 END) AS present,
       ROUND(100.0 * SUM(CASE WHEN a.status = 'PRESENT' THEN 1 ELSE 0 END) / COUNT(*), 2) AS attendance_percentage
FROM   attendance a
JOIN   students         s   ON s.student_id   = a.student_id
JOIN   course_offerings o   ON o.offering_id  = a.offering_id
JOIN   subjects         sub ON sub.subject_id = o.subject_id
GROUP  BY s.student_id, s.roll_number, s.first_name, s.last_name,
          o.offering_id, sub.subject_code
HAVING COUNT(*) >= 5
   AND (100.0 * SUM(CASE WHEN a.status = 'PRESENT' THEN 1 ELSE 0 END) / COUNT(*)) < 75
ORDER  BY attendance_percentage ASC
LIMIT  50;


-- -----------------------------------------------------------------------------
-- Q12 · Monthly collection by payment mode, only months that actually collected
-- Concepts: GROUP BY on expressions, HAVING, ROLLUP-free multi-column group.
-- -----------------------------------------------------------------------------
SELECT DATE_FORMAT(p.payment_date, '%Y-%m')       AS month,
       p.payment_mode,
       COUNT(*)                                   AS receipts,
       SUM(p.amount)                              AS collected
FROM   payments p
WHERE  p.status = 'SUCCESS'
GROUP  BY DATE_FORMAT(p.payment_date, '%Y-%m'), p.payment_mode
HAVING SUM(p.amount) > 0
ORDER  BY month DESC, collected DESC;


-- -----------------------------------------------------------------------------
-- Q13 · Faculty teaching load — sessions actually delivered, per month
-- Concepts: GROUP BY, COUNT(DISTINCT), HAVING.
-- -----------------------------------------------------------------------------
SELECT f.employee_code,
       CONCAT(f.first_name, ' ', f.last_name)     AS faculty_name,
       d.department_code,
       DATE_FORMAT(cs.session_date, '%Y-%m')      AS month,
       COUNT(*)                                   AS sessions,
       COUNT(DISTINCT cs.offering_id)             AS offerings,
       COUNT(DISTINCT cs.session_date)            AS teaching_days
FROM   class_sessions cs
JOIN   faculty      f ON f.faculty_id   = cs.faculty_id
JOIN   departments  d ON d.department_id = f.department_id
WHERE  cs.status = 'COMPLETED'
GROUP  BY f.faculty_id, f.employee_code, f.first_name, f.last_name,
          d.department_code, DATE_FORMAT(cs.session_date, '%Y-%m')
HAVING COUNT(*) >= 3
ORDER  BY month DESC, sessions DESC
LIMIT  50;


-- -----------------------------------------------------------------------------
-- Q14 · Hostel occupancy, only hostels past the half-way mark
-- Concepts: JOIN + GROUP BY + HAVING on a computed ratio.
-- -----------------------------------------------------------------------------
SELECT h.hostel_code,
       h.name                                                   AS hostel,
       h.hostel_type,
       COUNT(DISTINCT r.room_id)                                AS rooms,
       SUM(r.capacity)                                          AS beds,
       COUNT(ra.allocation_id)                                  AS occupied,
       ROUND(100.0 * COUNT(ra.allocation_id) / NULLIF(SUM(r.capacity), 0), 1) AS occupancy_percentage
FROM   hostels h
JOIN   rooms r ON r.hostel_id = h.hostel_id
LEFT   JOIN room_allocations ra
       ON  ra.room_id = r.room_id
       AND ra.status  = 'ACTIVE'
GROUP  BY h.hostel_id, h.hostel_code, h.name, h.hostel_type
HAVING SUM(r.capacity) > 0
   AND (100.0 * COUNT(ra.allocation_id) / SUM(r.capacity)) > 50
ORDER  BY occupancy_percentage DESC;


-- -----------------------------------------------------------------------------
-- Q15 · Data-quality check — possible duplicate students (same name + DOB)
-- Concepts: GROUP BY … HAVING COUNT(*) > 1 as a duplicate detector.
-- -----------------------------------------------------------------------------
SELECT s.first_name,
       s.last_name,
       s.date_of_birth,
       COUNT(*)                                AS records,
       GROUP_CONCAT(s.roll_number ORDER BY s.roll_number SEPARATOR ', ') AS roll_numbers
FROM   students s
GROUP  BY s.first_name, s.last_name, s.date_of_birth
HAVING COUNT(*) > 1
ORDER  BY records DESC;


-- =============================================================================
-- SECTION C — Subqueries
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Q16 · Scalar subquery in WHERE — students above the institute average
-- Concepts: non-correlated scalar subquery, reusable single value.
-- -----------------------------------------------------------------------------
SELECT x.roll_number,
       x.full_name                                            AS student_name,
       x.overall_percentage                                   AS attendance_percentage,
       x.total_classes,
       x.attended_classes,
       (SELECT ROUND(100.0 * SUM(a.status = 'PRESENT') / COUNT(*), 2)
        FROM   attendance a)                                  AS institute_average
FROM   v_student_attendance_overall x
WHERE  x.overall_percentage >
       (SELECT 100.0 * SUM(a.status = 'PRESENT') / COUNT(*) FROM attendance a)
ORDER  BY x.overall_percentage DESC
LIMIT  40;


-- -----------------------------------------------------------------------------
-- Q17 · Correlated subquery — each student's most recent successful payment
-- Concepts: correlated subquery evaluated once per outer row.
-- [VIVA] Alternative: window function ROW_NUMBER() … = 1 (see Q26). The window
--        form scans once; the correlated form may scan per row.
-- -----------------------------------------------------------------------------
SELECT s.roll_number,
       CONCAT(s.first_name, ' ', s.last_name) AS student_name,
       (SELECT p.amount
        FROM   payments p
        WHERE  p.student_id = s.student_id
          AND  p.status     = 'SUCCESS'
        ORDER  BY p.payment_date DESC, p.payment_id DESC
        LIMIT  1)                             AS last_payment_amount,
       (SELECT p.payment_date
        FROM   payments p
        WHERE  p.student_id = s.student_id
          AND  p.status     = 'SUCCESS'
        ORDER  BY p.payment_date DESC, p.payment_id DESC
        LIMIT  1)                             AS last_payment_date,
       (SELECT p.receipt_no
        FROM   payments p
        WHERE  p.student_id = s.student_id
          AND  p.status     = 'SUCCESS'
        ORDER  BY p.payment_date DESC, p.payment_id DESC
        LIMIT  1)                             AS last_receipt_no
FROM   students s
WHERE  s.status = 'ACTIVE'
  AND  EXISTS (SELECT 1 FROM payments p2 WHERE p2.student_id = s.student_id)
ORDER  BY last_payment_date DESC
LIMIT  40;


-- -----------------------------------------------------------------------------
-- Q18 · IN subquery — students who sat the current end-semester examination
-- Concepts: IN (subquery), scalar subquery for the current exam.
-- -----------------------------------------------------------------------------
SELECT s.roll_number,
       CONCAT(s.first_name, ' ', s.last_name) AS student_name,
       p.program_code
FROM   students s
JOIN   programs p ON p.program_id = s.program_id
WHERE  s.student_id IN (SELECT er.student_id
                        FROM   exam_registrations er
                        WHERE  er.exam_id = (SELECT e.exam_id
                                             FROM   exams e
                                             WHERE  e.exam_type = 'ENDSEM'
                                             ORDER  BY e.start_date DESC
                                             LIMIT  1)
                          AND  er.status = 'REGISTERED')
ORDER  BY s.roll_number
LIMIT  50;


-- -----------------------------------------------------------------------------
-- Q19 · Derived table (FROM subquery) — top fee defaulters with ageing
-- Concepts: derived table, outer filtering on an aggregate computed inside.
-- -----------------------------------------------------------------------------
SELECT d.roll_number,
       d.student_name,
       d.phone,
       d.program_code,
       d.total_due,
       d.overdue_bills,
       d.oldest_due_date,
       DATEDIFF(CURDATE(), d.oldest_due_date) AS days_overdue,
       CASE WHEN DATEDIFF(CURDATE(), d.oldest_due_date) > 180 THEN 'CRITICAL'
            WHEN DATEDIFF(CURDATE(), d.oldest_due_date) >  90 THEN 'HIGH'
            WHEN DATEDIFF(CURDATE(), d.oldest_due_date) >  30 THEN 'MEDIUM'
            ELSE 'LOW' END                    AS ageing_bucket
FROM   (SELECT s.student_id,
               s.roll_number,
               CONCAT(s.first_name, ' ', s.last_name) AS student_name,
               s.phone,
               p.program_code,
               SUM(sf.due_amount)                     AS total_due,
               COUNT(*)                               AS overdue_bills,
               MIN(sf.due_date)                       AS oldest_due_date
        FROM   student_fees sf
        JOIN   students s ON s.student_id = sf.student_id
        JOIN   programs p ON p.program_id = s.program_id
        WHERE  sf.status IN ('PENDING', 'PARTIAL', 'OVERDUE')
        GROUP  BY s.student_id, s.roll_number, s.first_name, s.last_name, s.phone, p.program_code) d
WHERE  d.total_due > 0
ORDER  BY d.total_due DESC
LIMIT  25;


-- -----------------------------------------------------------------------------
-- Q20 · Correlated EXISTS — students carrying at least one backlog
-- Concepts: EXISTS (short-circuits), correlation to the outer row.
-- -----------------------------------------------------------------------------
SELECT s.roll_number,
       CONCAT(s.first_name, ' ', s.last_name) AS student_name,
       s.current_semester_no,
       (SELECT COUNT(*) FROM results r
        WHERE r.student_id = s.student_id AND r.backlog_count > 0) AS backlog_semesters
FROM   students s
WHERE  s.status = 'ACTIVE'
  AND  EXISTS (SELECT 1
               FROM   results r
               WHERE  r.student_id = s.student_id
                 AND  r.backlog_count > 0)
ORDER  BY backlog_semesters DESC, s.roll_number
LIMIT  40;


-- =============================================================================
-- SECTION D — Common Table Expressions (CTEs)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Q21 · Two CTEs joined together — the "at-risk" list (academics + money)
-- Concepts: WITH, multiple CTEs, joining CTEs, CASE for severity.
-- Mirrors  : GET /ai/at-risk and v_student_risk_dashboard.
-- [VIVA] "CTE or subquery?" → CTEs are named, reusable, and readable; the
--        optimiser may inline them (MySQL 8 materialises when referenced twice).
-- -----------------------------------------------------------------------------
WITH attendance_cte AS (
        SELECT s.student_id,
               ROUND(100.0 * SUM(a.status = 'PRESENT') / COUNT(*), 2) AS attendance_pct
        FROM   attendance a
        JOIN   students s ON s.student_id = a.student_id
        GROUP  BY s.student_id),
     dues_cte AS (
        SELECT sf.student_id,
               SUM(sf.due_amount)                     AS pending_fees,
               SUM(CASE WHEN sf.due_date < CURDATE() THEN sf.due_amount ELSE 0 END) AS overdue_fees
        FROM   student_fees sf
        WHERE  sf.status <> 'PAID'
        GROUP  BY sf.student_id)
SELECT s.roll_number,
       CONCAT(s.first_name, ' ', s.last_name)                        AS student_name,
       d.department_code,
       COALESCE(ac.attendance_pct, 0)                                AS attendance_pct,
       COALESCE(dc.pending_fees, 0)                                  AS pending_fees,
       COALESCE(r.backlog_count, 0)                                  AS backlogs,
       CASE WHEN COALESCE(ac.attendance_pct, 0) < 75 AND COALESCE(dc.pending_fees, 0) > 0 THEN 'CRITICAL'
            WHEN COALESCE(ac.attendance_pct, 0) < 75 THEN 'HIGH'
            WHEN COALESCE(dc.pending_fees, 0) > 0    THEN 'MEDIUM'
            ELSE 'LOW' END                                           AS risk_level
FROM   students s
JOIN   departments d ON d.department_id = s.department_id
LEFT   JOIN attendance_cte ac ON ac.student_id = s.student_id
LEFT   JOIN dues_cte       dc ON dc.student_id = s.student_id
LEFT   JOIN results        r  ON r.student_id  = s.student_id
                             AND r.result_id   = (SELECT r2.result_id FROM results r2
                                                  WHERE r2.student_id = s.student_id
                                                  ORDER BY r2.published_on DESC, r2.result_id DESC
                                                  LIMIT 1)
WHERE  s.status = 'ACTIVE'
ORDER  BY FIELD(risk_level, 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW'), pending_fees DESC
LIMIT  50;


-- -----------------------------------------------------------------------------
-- Q22 · CTE + aggregation — department performance league table
-- Concepts: CTE, aggregate over a join, ordering by a computed column.
-- -----------------------------------------------------------------------------
WITH dept_results AS (
        SELECT d.department_id,
               d.department_code,
               d.name AS department_name,
               COUNT(DISTINCT r.student_id)    AS students_evaluated,
               ROUND(AVG(r.sgpa), 2)           AS avg_sgpa,
               ROUND(AVG(r.cgpa), 2)           AS avg_cgpa,
               SUM(r.backlog_count)            AS backlogs
        FROM   results r
        JOIN   students    s ON s.student_id    = r.student_id
        JOIN   departments d ON d.department_id = s.department_id
        GROUP  BY d.department_id, d.department_code, d.name)
SELECT dr.*,
       ROUND(100.0 * dr.students_evaluated /
             NULLIF((SELECT COUNT(*) FROM students x WHERE x.department_id = dr.department_id), 0), 1) AS coverage_percentage,
       CASE WHEN dr.avg_cgpa >= 8.5 THEN 'A'
            WHEN dr.avg_cgpa >= 7.5 THEN 'B'
            WHEN dr.avg_cgpa >= 6.5 THEN 'C'
            ELSE 'D' END AS grade_band
FROM   dept_results dr
ORDER  BY dr.avg_cgpa DESC;


-- -----------------------------------------------------------------------------
-- Q23 · Recursive CTE — a 30-day calendar LEFT JOINed to collections so that
--       days with no collection still appear as zero (gap-free reporting).
-- Concepts: WITH RECURSIVE, anchor + recursive member, termination predicate,
--           LEFT JOIN to a generated series.
-- -----------------------------------------------------------------------------
WITH RECURSIVE calendar AS (
        SELECT CURDATE() - INTERVAL 29 DAY AS day
        UNION ALL
        SELECT day + INTERVAL 1 DAY FROM calendar WHERE day < CURDATE())
SELECT c.day,
       COUNT(p.payment_id)        AS receipts,
       COALESCE(SUM(p.amount), 0) AS collected
FROM   calendar c
LEFT   JOIN payments p
       ON  p.payment_date = c.day
       AND p.status       = 'SUCCESS'
GROUP  BY c.day
ORDER  BY c.day;


-- -----------------------------------------------------------------------------
-- Q24 · Recursive CTE — semester ladder for a program (1 → total_semesters)
--       showing how many subjects a student still has to clear.
-- Concepts: WITH RECURSIVE with a business counter, JOIN back to curriculum.
-- -----------------------------------------------------------------------------
WITH RECURSIVE ladder AS (
        SELECT 1 AS semester_no, p.total_semesters, p.program_id, p.program_code
        FROM   programs p
        WHERE  p.total_semesters > 0
        UNION ALL
        SELECT l.semester_no + 1, l.total_semesters, l.program_id, l.program_code
        FROM   ladder l
        WHERE  l.semester_no < l.total_semesters)
SELECT l.program_code,
       l.semester_no,
       COUNT(DISTINCT ps.subject_id)              AS subjects_in_curriculum,
       (SELECT COUNT(*) FROM students s
        WHERE  s.program_id = l.program_id
          AND  s.current_semester_no = l.semester_no
          AND  s.status = 'ACTIVE')               AS students_here
FROM   ladder l
LEFT   JOIN program_subjects ps
       ON  ps.program_id  = l.program_id
       AND ps.semester_no = l.semester_no
GROUP  BY l.program_id, l.program_code, l.semester_no
ORDER  BY l.program_code, l.semester_no;


-- -----------------------------------------------------------------------------
-- Q25 · CTE + window function — rank students inside their department and
--       express the rank as a percentile of the batch.
-- Concepts: CTE feeding a window function, RANK() OVER (PARTITION BY …).
-- -----------------------------------------------------------------------------
WITH latest AS (
        SELECT r.student_id,
               r.cgpa,
               r.sgpa,
               s.department_id,
               s.program_id,
               ROW_NUMBER() OVER (PARTITION BY r.student_id
                                  ORDER BY r.published_on DESC, r.result_id DESC) AS rn
        FROM   results r
        JOIN   students s ON s.student_id = r.student_id)
SELECT s.roll_number,
       CONCAT(s.first_name, ' ', s.last_name)      AS student_name,
       d.department_code,
       p.program_code,
       l.cgpa,
       RANK()       OVER (PARTITION BY l.department_id ORDER BY l.cgpa DESC) AS dept_rank,
       DENSE_RANK() OVER (PARTITION BY l.program_id   ORDER BY l.cgpa DESC) AS program_dense_rank,
       COUNT(*)     OVER (PARTITION BY l.department_id)                     AS dept_strength,
       ROUND(100.0 * RANK() OVER (PARTITION BY l.department_id ORDER BY l.cgpa DESC)
             / COUNT(*) OVER (PARTITION BY l.department_id), 1)             AS percentile_from_top
FROM   latest l
JOIN   students    s ON s.student_id    = l.student_id
JOIN   departments d ON d.department_id = l.department_id
JOIN   programs    p ON p.program_id    = l.program_id
WHERE  l.rn = 1
ORDER  BY d.department_code, dept_rank
LIMIT  60;


-- =============================================================================
-- SECTION E — Window functions
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Q26 · ROW_NUMBER — the latest class session of every offering
-- Concepts: ROW_NUMBER() OVER (PARTITION BY … ORDER BY …), CTE + filter.
-- [VIVA] ROW_NUMBER vs RANK vs DENSE_RANK: 1,2,3 / 1,2,2,4 / 1,2,2,3.
-- -----------------------------------------------------------------------------
WITH numbered AS (
        SELECT cs.*,
               ROW_NUMBER() OVER (PARTITION BY cs.offering_id
                                  ORDER BY cs.session_date DESC, cs.session_no DESC) AS rn
        FROM   class_sessions cs)
SELECT n.session_id,
       n.offering_id,
       sub.subject_code,
       n.session_date,
       n.session_no,
       n.topic,
       n.status
FROM   numbered n
JOIN   course_offerings o  ON o.offering_id  = n.offering_id
JOIN   subjects         sub ON sub.subject_id = o.subject_id
WHERE  n.rn = 1
ORDER  BY sub.subject_code;


-- -----------------------------------------------------------------------------
-- Q27 · RANK — institute toppers by CGPA (ties share the rank, gaps follow)
-- Concepts: RANK() over the whole set, tie handling.
-- -----------------------------------------------------------------------------
SELECT RANK() OVER (ORDER BY r.cgpa DESC, r.sgpa DESC) AS institute_rank,
       s.roll_number,
       CONCAT(s.first_name, ' ', s.last_name)          AS student_name,
       d.department_code,
       p.program_code,
       r.sgpa,
       r.cgpa,
       r.backlog_count
FROM   results r
JOIN   students    s ON s.student_id    = r.student_id
JOIN   departments d ON d.department_id = s.department_id
JOIN   programs    p ON p.program_id    = s.program_id
WHERE  r.result_id = (SELECT r2.result_id FROM results r2
                      WHERE r2.student_id = r.student_id
                      ORDER BY r2.published_on DESC, r2.result_id DESC LIMIT 1)
ORDER  BY institute_rank
LIMIT  20;


-- -----------------------------------------------------------------------------
-- Q28 · DENSE_RANK + filtered window frame — top 3 scorers per subject
-- Concepts: DENSE_RANK() OVER (PARTITION BY …), top-N-per-group pattern.
-- -----------------------------------------------------------------------------
WITH scored AS (
        SELECT sub.subject_code,
               sub.name                                   AS subject_name,
               s.roll_number,
               CONCAT(s.first_name, ' ', s.last_name)     AS student_name,
               m.marks_obtained,
               DENSE_RANK() OVER (PARTITION BY sub.subject_id
                                  ORDER BY m.marks_obtained DESC) AS subject_rank
        FROM   marks m
        JOIN   exam_registrations er ON er.registration_id = m.registration_id
        JOIN   course_offerings   o  ON o.offering_id      = er.offering_id
        JOIN   subjects           sub ON sub.subject_id    = o.subject_id
        JOIN   students           s  ON s.student_id       = er.student_id
        WHERE  m.is_absent = 0)
SELECT * FROM scored
WHERE  subject_rank <= 3
ORDER  BY subject_code, subject_rank
LIMIT  60;


-- -----------------------------------------------------------------------------
-- Q29 · LAG / LEAD — month-on-month fee collection growth
-- Concepts: LAG() over an ordered aggregate, percentage change.
-- -----------------------------------------------------------------------------
WITH monthly AS (
        SELECT DATE_FORMAT(p.payment_date, '%Y-%m') AS month,
               SUM(p.amount)                        AS collected,
               COUNT(*)                             AS receipts
        FROM   payments p
        WHERE  p.status = 'SUCCESS'
        GROUP  BY DATE_FORMAT(p.payment_date, '%Y-%m'))
SELECT month,
       receipts,
       collected,
       LAG(collected)  OVER (ORDER BY month)                       AS previous_month,
       collected - LAG(collected) OVER (ORDER BY month)            AS delta,
       ROUND(100.0 * (collected - LAG(collected) OVER (ORDER BY month))
             / NULLIF(LAG(collected) OVER (ORDER BY month), 0), 1) AS growth_percentage,
       LEAD(collected) OVER (ORDER BY month)                       AS next_month
FROM   monthly
ORDER  BY month;


-- -----------------------------------------------------------------------------
-- Q30 · Running total — cumulative collection through the year
-- Concepts: SUM() OVER (ORDER BY … ROWS UNBOUNDED PRECEDING), window frames.
-- [VIVA] Default frame is RANGE UNBOUNDED PRECEDING … CURRENT ROW; with ties
--        in ORDER BY, ROWS vs RANGE changes the running total.
-- -----------------------------------------------------------------------------
WITH daily AS (
        SELECT p.payment_date AS day, SUM(p.amount) AS collected
        FROM   payments p
        WHERE  p.status = 'SUCCESS'
        GROUP  BY p.payment_date)
SELECT day,
       collected,
       SUM(collected) OVER (ORDER BY day ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS running_total,
       AVG(collected) OVER (ORDER BY day ROWS BETWEEN 6 PRECEDING AND CURRENT ROW)         AS seven_day_average
FROM   daily
ORDER  BY day DESC
LIMIT  40;


-- -----------------------------------------------------------------------------
-- Q31 · Deviation from the subject average (who is below their class)
-- Concepts: AVG() OVER (PARTITION BY …) keeps detail rows *and* the aggregate
--           without a GROUP BY — the classic window-vs-group-by difference.
-- -----------------------------------------------------------------------------
SELECT sub.subject_code,
       s.roll_number,
       CONCAT(s.first_name, ' ', s.last_name)                              AS student_name,
       m.marks_obtained,
       ROUND(AVG(m.marks_obtained) OVER (PARTITION BY sub.subject_id), 2)  AS subject_average,
       ROUND(m.marks_obtained - AVG(m.marks_obtained) OVER (PARTITION BY sub.subject_id), 2) AS deviation,
       CASE WHEN m.marks_obtained >= AVG(m.marks_obtained) OVER (PARTITION BY sub.subject_id)
            THEN 'ABOVE AVERAGE' ELSE 'BELOW AVERAGE' END                  AS standing
FROM   marks m
JOIN   exam_registrations er ON er.registration_id = m.registration_id
JOIN   course_offerings   o  ON o.offering_id      = er.offering_id
JOIN   subjects           sub ON sub.subject_id    = o.subject_id
JOIN   students           s  ON s.student_id       = er.student_id
WHERE  m.is_absent = 0
ORDER  BY sub.subject_code, deviation ASC
LIMIT  60;


-- -----------------------------------------------------------------------------
-- Q32 · NTILE — split the class into attendance quartiles for mentoring groups
-- Concepts: NTILE(n) OVER (ORDER BY …) — equal-sized buckets.
-- -----------------------------------------------------------------------------
SELECT NTILE(4) OVER (ORDER BY x.overall_percentage DESC) AS quartile,
       x.roll_number,
       x.full_name                                AS student_name,
       x.overall_percentage                       AS attendance_percentage,
       CASE NTILE(4) OVER (ORDER BY x.overall_percentage DESC)
            WHEN 1 THEN 'No intervention'
            WHEN 2 THEN 'Monitor'
            WHEN 3 THEN 'Counselling'
            ELSE 'Parent meeting' END                       AS action
FROM   v_student_attendance_overall x
WHERE  x.overall_percentage IS NOT NULL
ORDER  BY quartile, x.overall_percentage DESC
LIMIT  60;


-- -----------------------------------------------------------------------------
-- Q33 · FIRST_VALUE / LAST_VALUE — subject toppers without a self join
-- Concepts: FIRST_VALUE(), LAST_VALUE() and the importance of the frame
--           (LAST_VALUE needs an explicit frame to end at the last row).
-- -----------------------------------------------------------------------------
SELECT DISTINCT
       sub.subject_code,
       sub.name                                                    AS subject_name,
       FIRST_VALUE(CONCAT(s.first_name, ' ', s.last_name))
         OVER (PARTITION BY sub.subject_id ORDER BY m.marks_obtained DESC)                       AS topper,
       FIRST_VALUE(m.marks_obtained)
         OVER (PARTITION BY sub.subject_id ORDER BY m.marks_obtained DESC)                       AS highest,
       LAST_VALUE(CONCAT(s.first_name, ' ', s.last_name))
         OVER (PARTITION BY sub.subject_id ORDER BY m.marks_obtained DESC
               ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING)                        AS lowest_scorer,
       LAST_VALUE(m.marks_obtained)
         OVER (PARTITION BY sub.subject_id ORDER BY m.marks_obtained DESC
               ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING)                        AS lowest
FROM   marks m
JOIN   exam_registrations er ON er.registration_id = m.registration_id
JOIN   course_offerings   o  ON o.offering_id      = er.offering_id
JOIN   subjects           sub ON sub.subject_id    = o.subject_id
JOIN   students           s  ON s.student_id       = er.student_id
WHERE  m.is_absent = 0
ORDER  BY sub.subject_code
LIMIT  40;


-- -----------------------------------------------------------------------------
-- Q34 · ROW_NUMBER for "second highest" — the viva classic, done properly
-- Concepts: ROW_NUMBER() to reach the n-th row of a partition.
-- -----------------------------------------------------------------------------
WITH ranked AS (
        SELECT sub.subject_code,
               CONCAT(s.first_name, ' ', s.last_name) AS student_name,
               m.marks_obtained,
               ROW_NUMBER() OVER (PARTITION BY sub.subject_id ORDER BY m.marks_obtained DESC) AS rn
        FROM   marks m
        JOIN   exam_registrations er ON er.registration_id = m.registration_id
        JOIN   course_offerings   o  ON o.offering_id      = er.offering_id
        JOIN   subjects           sub ON sub.subject_id    = o.subject_id
        JOIN   students           s  ON s.student_id       = er.student_id
        WHERE  m.is_absent = 0)
SELECT subject_code, student_name, marks_obtained, rn AS position
FROM   ranked
WHERE  rn = 2
ORDER  BY subject_code
LIMIT  40;


-- =============================================================================
-- SECTION F — End-to-end analytics behind real screens
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Q35 · Exam eligibility — the rule enforced by
--       sp_register_student_for_exam + trg_block_exam_registration
-- Concepts: CTE + conditional aggregation + CASE verdict.
-- -----------------------------------------------------------------------------
WITH att AS (
        SELECT a.student_id,
               a.offering_id,
               COUNT(*)                                        AS sessions,
               SUM(a.status = 'PRESENT')                       AS present,
               ROUND(100.0 * SUM(a.status = 'PRESENT') / COUNT(*), 2) AS attendance_pct
        FROM   attendance a
        GROUP  BY a.student_id, a.offering_id),
     dues AS (
        SELECT sf.student_id, SUM(sf.due_amount) AS pending_fees
        FROM   student_fees sf
        WHERE  sf.status <> 'PAID'
        GROUP  BY sf.student_id)
SELECT s.roll_number,
       CONCAT(s.first_name, ' ', s.last_name)     AS student_name,
       sub.subject_code,
       e.exam_code,
       att.attendance_pct,
       e.min_attendance_required,
       COALESCE(dues.pending_fees, 0)             AS pending_fees,
       CASE WHEN att.attendance_pct IS NULL                       THEN 'NO ATTENDANCE RECORD'
            WHEN att.attendance_pct < e.min_attendance_required   THEN 'BLOCKED — ATTENDANCE SHORT'
            WHEN COALESCE(dues.pending_fees, 0) > 0               THEN 'BLOCKED — FEES PENDING'
            ELSE 'ELIGIBLE' END                   AS verdict
FROM   exams e
JOIN   exam_schedules   es  ON es.exam_id     = e.exam_id
JOIN   subjects         sub ON sub.subject_id = es.subject_id
JOIN   course_offerings o   ON o.subject_id   = es.subject_id
                           AND o.program_id   = es.program_id
JOIN   enrollments      en  ON en.offering_id = o.offering_id AND en.status = 'ENROLLED'
JOIN   students         s   ON s.student_id   = en.student_id
LEFT   JOIN att  ON att.student_id  = s.student_id  AND att.offering_id  = o.offering_id
LEFT   JOIN dues ON dues.student_id = s.student_id
WHERE  e.status IN ('SCHEDULED', 'REGISTRATION_OPEN', 'ONGOING')
ORDER  BY FIELD(verdict, 'BLOCKED — ATTENDANCE SHORT', 'BLOCKED — FEES PENDING',
                         'NO ATTENDANCE RECORD', 'ELIGIBLE'),
         att.attendance_pct ASC
LIMIT  60;


-- -----------------------------------------------------------------------------
-- Q36 · Hostel vacancy board with running occupancy per hostel
-- Concepts: JOIN + window SUM + generated status (mirrors v_room_vacancy and
--           the triggers that keep rooms.occupied_count in step with beds).
-- -----------------------------------------------------------------------------
SELECT h.hostel_code,
       b.block_code,
       r.room_number,
       r.room_type,
       r.capacity,
       r.occupied_count,
       r.capacity - r.occupied_count                                            AS free_beds,
       SUM(r.occupied_count) OVER (PARTITION BY h.hostel_id
                                   ORDER BY b.block_code, r.room_number
                                   ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS running_occupancy,
       CASE WHEN r.occupied_count = 0              THEN 'VACANT'
            WHEN r.occupied_count >= r.capacity    THEN 'FULL'
            ELSE 'PARTIAL' END                                                  AS room_state,
       r.status
FROM   rooms r
JOIN   hostels       h ON h.hostel_id = r.hostel_id
LEFT   JOIN hostel_blocks b ON b.block_id = r.block_id
ORDER  BY h.hostel_code, b.block_code, r.room_number
LIMIT  80;


-- -----------------------------------------------------------------------------
-- Q37 · Fee ageing buckets (0-30 / 31-90 / 91-180 / 180+) per program
-- Concepts: CTE + CASE bucketing + GROUP BY with conditional SUM.
-- -----------------------------------------------------------------------------
WITH aged AS (
        SELECT s.program_id,
               p.program_code,
               DATEDIFF(CURDATE(), sf.due_date) AS days,
               sf.due_amount
        FROM   student_fees sf
        JOIN   students s ON s.student_id = sf.student_id
        JOIN   programs p ON p.program_id = s.program_id
        WHERE  sf.status <> 'PAID' AND sf.due_amount > 0)
SELECT program_code,
       COUNT(*)                                                             AS overdue_bills,
       SUM(due_amount)                                                      AS total_due,
       SUM(CASE WHEN days <= 30  THEN due_amount ELSE 0 END)                AS bucket_0_30,
       SUM(CASE WHEN days BETWEEN 31 AND 90  THEN due_amount ELSE 0 END)    AS bucket_31_90,
       SUM(CASE WHEN days BETWEEN 91 AND 180 THEN due_amount ELSE 0 END)    AS bucket_91_180,
       SUM(CASE WHEN days > 180 THEN due_amount ELSE 0 END)                 AS bucket_180_plus
FROM   aged
GROUP  BY program_id, program_code
ORDER  BY total_due DESC;


-- -----------------------------------------------------------------------------
-- Q38 · Payroll register with year-to-date totals per faculty
-- Concepts: window SUM over a partition ordered by period (YTD), plus a
--           month-over-month net comparison with LAG.
-- -----------------------------------------------------------------------------
SELECT f.employee_code,
       CONCAT(f.first_name, ' ', f.last_name)                          AS faculty_name,
       d.department_code,
       py.pay_year,
       py.pay_month,
       py.gross_salary,
       py.net_salary,
       SUM(py.net_salary) OVER (PARTITION BY f.faculty_id, py.pay_year
                                ORDER BY py.pay_month
                                ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS ytd_net,
       py.net_salary - LAG(py.net_salary) OVER (PARTITION BY f.faculty_id
                                                ORDER BY py.pay_year, py.pay_month) AS month_delta,
       py.lop_days,
       py.status
FROM   payrolls py
JOIN   faculty     f ON f.faculty_id    = py.faculty_id
JOIN   departments d ON d.department_id = f.department_id
ORDER  BY f.employee_code, py.pay_year DESC, py.pay_month DESC
LIMIT  80;


-- -----------------------------------------------------------------------------
-- Q39 · Leave utilisation vs sanctioned quota (uses the UDF)
-- Concepts: aggregate + JOIN + call to fn_calculate_faculty_leave_balance.
-- -----------------------------------------------------------------------------
SELECT f.employee_code,
       CONCAT(f.first_name, ' ', f.last_name)              AS faculty_name,
       lb.leave_type,
       lb.allotted,
       lb.used,
       lb.allotted - lb.used                               AS remaining_ledger,
       fn_calculate_faculty_leave_balance(
         f.faculty_id, lb.leave_type,
         (SELECT academic_year_id FROM academic_years WHERE is_current = 1 LIMIT 1)
       )                                                   AS remaining_udf,
       ROUND(100.0 * lb.used / NULLIF(lb.allotted, 0), 1)  AS utilisation_percentage,
       CASE WHEN lb.used >= lb.allotted      THEN 'EXHAUSTED'
            WHEN lb.used >= 0.8 * lb.allotted THEN 'LOW BALANCE'
            ELSE 'HEALTHY' END                             AS health
FROM   leave_balances lb
JOIN   faculty f ON f.faculty_id = lb.faculty_id
ORDER  BY health DESC, utilisation_percentage DESC
LIMIT  60;


-- -----------------------------------------------------------------------------
-- Q40 · Timetable clash detection — the query behind the conflict API
-- Concepts: SELF JOIN with an overlap predicate (a.start < b.end AND
--           b.start < a.end), plus room and faculty clash separation.
-- Note   : the seeded timetable is deliberately conflict-free, so this returns
--          zero rows. Insert two rows for the same faculty/room/day with
--          overlapping times (or use POST /academics/timetable, which runs the
--          same predicate before accepting a slot) to watch it fire.
-- -----------------------------------------------------------------------------
SELECT 'FACULTY'                                            AS clash_type,
       f.employee_code,
       CONCAT(f.first_name, ' ', f.last_name)               AS faculty_name,
       t1.day_of_week,
       t1.start_time,
       t1.end_time,
       t1.room_number                                       AS room_a,
       t2.room_number                                       AS room_b,
       s1.subject_code                                      AS subject_a,
       s2.subject_code                                      AS subject_b
FROM   timetable t1
JOIN   timetable t2
       ON  t1.faculty_id  = t2.faculty_id
       AND t1.timetable_id < t2.timetable_id
       AND t1.day_of_week = t2.day_of_week
       AND t1.start_time  < t2.end_time
       AND t2.start_time  < t1.end_time
       AND t1.is_active   = 1
       AND t2.is_active   = 1
JOIN   faculty            f  ON f.faculty_id   = t1.faculty_id
JOIN   course_offerings   o1 ON o1.offering_id = t1.offering_id
JOIN   subjects           s1 ON s1.subject_id  = o1.subject_id
JOIN   course_offerings   o2 ON o2.offering_id = t2.offering_id
JOIN   subjects           s2 ON s2.subject_id  = o2.subject_id

UNION ALL

SELECT 'ROOM',
       f.employee_code,
       CONCAT(f.first_name, ' ', f.last_name),
       t1.day_of_week,
       t1.start_time,
       t1.end_time,
       t1.room_number,
       t2.room_number,
       s1.subject_code,
       s2.subject_code
FROM   timetable t1
JOIN   timetable t2
       ON  t1.room_number  = t2.room_number
       AND t1.timetable_id < t2.timetable_id
       AND t1.day_of_week  = t2.day_of_week
       AND t1.start_time   < t2.end_time
       AND t2.start_time   < t1.end_time
       AND t1.is_active    = 1
       AND t2.is_active    = 1
JOIN   faculty          f  ON f.faculty_id   = t1.faculty_id
JOIN   course_offerings o1 ON o1.offering_id = t1.offering_id
JOIN   subjects         s1 ON s1.subject_id  = o1.subject_id
JOIN   course_offerings o2 ON o2.offering_id = t2.offering_id
JOIN   subjects         s2 ON s2.subject_id  = o2.subject_id
ORDER  BY clash_type, day_of_week, start_time;


-- -----------------------------------------------------------------------------
-- Q41 · Attendance trend per student — month over month with LAG
-- Concepts: CTE aggregate + LAG + CASE trend arrow.
-- -----------------------------------------------------------------------------
WITH monthly AS (
        SELECT a.student_id,
               DATE_FORMAT(cs.session_date, '%Y-%m')                     AS month,
               COUNT(*)                                                  AS sessions,
               ROUND(100.0 * SUM(a.status = 'PRESENT') / COUNT(*), 2)    AS attendance_pct
        FROM   attendance a
        JOIN   class_sessions cs ON cs.session_id = a.session_id
        GROUP  BY a.student_id, DATE_FORMAT(cs.session_date, '%Y-%m'))
SELECT s.roll_number,
       CONCAT(s.first_name, ' ', s.last_name)     AS student_name,
       m.month,
       m.sessions,
       m.attendance_pct,
       LAG(m.attendance_pct) OVER (PARTITION BY m.student_id ORDER BY m.month) AS previous_month,
       ROUND(m.attendance_pct - LAG(m.attendance_pct) OVER (PARTITION BY m.student_id ORDER BY m.month), 2) AS delta_points,
       CASE WHEN m.attendance_pct > LAG(m.attendance_pct) OVER (PARTITION BY m.student_id ORDER BY m.month) THEN 'IMPROVING'
            WHEN m.attendance_pct < LAG(m.attendance_pct) OVER (PARTITION BY m.student_id ORDER BY m.month) THEN 'DECLINING'
            ELSE 'FLAT' END                       AS trend
FROM   monthly m
JOIN   students s ON s.student_id = m.student_id
ORDER  BY s.roll_number, m.month DESC
LIMIT  60;


-- -----------------------------------------------------------------------------
-- Q42 · Never-attended students — a three-way anti-join (attendance, exams, fees)
-- Concepts: correlated NOT EXISTS ×3, useful for a "ghost student" audit.
-- -----------------------------------------------------------------------------
SELECT s.roll_number,
       CONCAT(s.first_name, ' ', s.last_name) AS student_name,
       s.admission_date,
       s.status
FROM   students s
WHERE  NOT EXISTS (SELECT 1 FROM attendance a         WHERE a.student_id  = s.student_id)
  AND  NOT EXISTS (SELECT 1 FROM exam_registrations er WHERE er.student_id = s.student_id)
  AND  NOT EXISTS (SELECT 1 FROM payments p           WHERE p.student_id  = s.student_id)
ORDER  BY s.admission_date DESC;


-- -----------------------------------------------------------------------------
-- Q43 · Admission funnel — applications by status and category
-- Concepts: GROUP BY with ROLLUP (sub-total + grand total rows).
-- [VIVA] ROLLUP vs CUBE vs GROUPING SETS: ROLLUP produces hierarchical
--        subtotals; MySQL 8 supports all three (MariaDB supports ROLLUP).
-- -----------------------------------------------------------------------------
-- Note: MySQL/MariaDB reject ORDER BY in the same SELECT as WITH ROLLUP,
-- so the rollup runs inside a derived table and the sort happens outside.
SELECT * FROM (
  SELECT IFNULL(c.name, '— ALL CATEGORIES —')    AS category,
         IFNULL(a.status, '— TOTAL —')           AS admission_status,
         COUNT(*)                                AS applications,
         ROUND(AVG(a.entrance_score), 1)         AS avg_entrance_score
  FROM   admissions a
  LEFT   JOIN categories c ON c.category_id = a.category_id
  GROUP  BY c.name, a.status WITH ROLLUP
) rollup
ORDER  BY category, admission_status;


-- -----------------------------------------------------------------------------
-- Q44 · Cross-module 360° snapshot of one student (parameterised)
-- Concepts: UNION ALL of per-module aggregates into a single report; change
--           the student_id literal (or bind it from the application).
-- -----------------------------------------------------------------------------
SET @sid = (SELECT student_id FROM students WHERE status = 'ACTIVE' ORDER BY student_id LIMIT 1);

SELECT 'PROFILE'     AS area, CONCAT(first_name, ' ', last_name) AS metric, roll_number AS value FROM students WHERE student_id = @sid
UNION ALL SELECT 'PROGRAM', p.name, p.program_code FROM students s JOIN programs p ON p.program_id = s.program_id WHERE s.student_id = @sid
UNION ALL SELECT 'ATTENDANCE', 'overall %',
       CAST(ROUND(100.0 * SUM(a.status = 'PRESENT') / NULLIF(COUNT(*), 0), 2) AS CHAR) FROM attendance a WHERE a.student_id = @sid
UNION ALL SELECT 'FEES', 'outstanding', CAST(IFNULL(SUM(due_amount), 0) AS CHAR) FROM student_fees WHERE student_id = @sid AND status <> 'PAID'
UNION ALL SELECT 'FEES', 'paid', CAST(IFNULL(SUM(amount), 0) AS CHAR) FROM payments WHERE student_id = @sid AND status = 'SUCCESS'
UNION ALL SELECT 'RESULTS', 'latest CGPA',
       CAST((SELECT r.cgpa FROM results r WHERE r.student_id = @sid
             ORDER BY r.published_on DESC, r.result_id DESC LIMIT 1) AS CHAR)
UNION ALL SELECT 'HOSTEL', 'hostel code',
       IFNULL((SELECT h.hostel_code FROM room_allocations ra JOIN hostels h ON h.hostel_id = ra.hostel_id
               WHERE ra.student_id = @sid AND ra.status = 'ACTIVE' LIMIT 1), 'DAY SCHOLAR')
UNION ALL SELECT 'ENROLLMENTS', 'active courses', CAST(COUNT(*) AS CHAR) FROM enrollments WHERE student_id = @sid AND status = 'ACTIVE';


-- -----------------------------------------------------------------------------
-- Q45 · Institute KPI card (the numbers on the dashboard) — single-row roll-up
-- Concepts: scalar subqueries, CROSS JOIN of one-row results, no GROUP BY.
-- -----------------------------------------------------------------------------
SELECT (SELECT COUNT(*) FROM students WHERE status = 'ACTIVE')                              AS active_students,
       (SELECT COUNT(*) FROM faculty  WHERE status = 'ACTIVE')                              AS active_faculty,
       (SELECT ROUND(100.0 * SUM(status = 'PRESENT') / COUNT(*), 2) FROM attendance)        AS institute_attendance,
       (SELECT IFNULL(SUM(amount), 0) FROM payments WHERE status = 'SUCCESS')               AS fees_collected,
       (SELECT IFNULL(SUM(due_amount), 0) FROM student_fees WHERE status <> 'PAID')         AS fees_outstanding,
       (SELECT COUNT(*) FROM room_allocations WHERE status = 'ACTIVE')                      AS hostel_residents,
       (SELECT ROUND(AVG(cgpa), 2) FROM results r
         WHERE r.result_id = (SELECT r2.result_id FROM results r2 WHERE r2.student_id = r.student_id
                              ORDER BY r2.published_on DESC, r2.result_id DESC LIMIT 1))    AS average_cgpa,
       (SELECT COUNT(*) FROM exam_registrations WHERE is_eligible = 0)                      AS blocked_registrations,
       (SELECT COUNT(*) FROM faculty_leaves WHERE status = 'PENDING')                       AS pending_leaves,
       (SELECT COUNT(*) FROM audit_logs)                                                    AS audit_entries;

-- =============================================================================
-- End of 09_queries.sql
-- =============================================================================
