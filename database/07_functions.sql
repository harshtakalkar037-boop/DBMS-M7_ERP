-- =====================================================================================
-- FILE   : 07_functions.sql
-- PURPOSE : User Defined Functions (UDFs) used by triggers, procedures, views, reports
--           and the backend API.
--
-- RULES OBSERVED
--   * Each function is deterministic-with-respect-to-the-database and side-effect free
--     (no INSERT/UPDATE inside a function) so it may be called from a SELECT.
--   * Functions READ tables, therefore they are declared READS SQL DATA.
--     If you run MySQL with binary logging enabled you may need
--     SET GLOBAL log_bin_trust_function_creators = 1;  (see README, section "Troubleshooting")
-- =====================================================================================

-- The target database must already be selected, e.g.
--   mysql -u root -p university_erp < 07_functions.sql
-- 01_schema.sql creates it. These files deliberately carry no hard-coded USE,
-- so the same scripts install cleanly under any database name (Docker, CI, clones).
SET NAMES utf8mb4;
DROP FUNCTION IF EXISTS `fn_calculate_attendance_percentage`;
DROP FUNCTION IF EXISTS `fn_calculate_semester_attendance`;
DROP FUNCTION IF EXISTS `fn_grade_points`;
DROP FUNCTION IF EXISTS `fn_grade_code`;
DROP FUNCTION IF EXISTS `fn_calculate_sgpa`;
DROP FUNCTION IF EXISTS `fn_calculate_student_cgpa`;
DROP FUNCTION IF EXISTS `fn_calculate_late_fee`;
DROP FUNCTION IF EXISTS `fn_calculate_faculty_leave_balance`;
DROP FUNCTION IF EXISTS `fn_student_outstanding_dues`;
DROP FUNCTION IF EXISTS `fn_hostel_available_beds`;
DROP FUNCTION IF EXISTS `fn_calculate_net_salary`;
DROP FUNCTION IF EXISTS `fn_student_backlog_count`;
DROP FUNCTION IF EXISTS `fn_student_earned_credits`;

-- -------------------------------------------------------------------------------------
-- 1. fn_calculate_attendance_percentage(student, offering)
--    Percentage of lectures attended by a student in ONE course offering.
--    PRESENT and LATE count as attended; ABSENT does not; EXCUSED is excluded from the
--    denominator (medical/official leave is not held against the student).
--    Returns 100.00 when no lectures have been held yet (nothing to lose).
--    This is the number the 75% exam eligibility rule is evaluated against.
-- -------------------------------------------------------------------------------------
DELIMITER $$
CREATE FUNCTION `fn_calculate_attendance_percentage`(
  p_student_id  INT UNSIGNED,
  p_offering_id INT UNSIGNED
) RETURNS decimal(5,2)
    READS SQL DATA
BEGIN
  DECLARE v_total   INT DEFAULT 0;
  DECLARE v_present INT DEFAULT 0;

  SELECT COUNT(*),
         SUM(CASE WHEN a.`status` IN ('PRESENT','LATE') THEN 1 ELSE 0 END)
  INTO   v_total, v_present
  FROM `attendance` a
  WHERE a.`student_id`  = p_student_id
    AND a.`offering_id` = p_offering_id
    AND a.`status`     <> 'EXCUSED';

  IF v_total = 0 THEN
    RETURN 100.00;
  END IF;
  RETURN ROUND((v_present / v_total) * 100, 2);
END$$
DELIMITER ;


-- -------------------------------------------------------------------------------------
-- 2. fn_calculate_semester_attendance(student, semester)
--    Attendance across every offering the student is enrolled in for a semester.
-- -------------------------------------------------------------------------------------
DELIMITER $$
CREATE FUNCTION `fn_calculate_semester_attendance`(
  p_student_id  INT UNSIGNED,
  p_semester_id SMALLINT UNSIGNED
) RETURNS decimal(5,2)
    READS SQL DATA
BEGIN
  DECLARE v_total   INT DEFAULT 0;
  DECLARE v_present INT DEFAULT 0;

  SELECT COUNT(*),
         SUM(CASE WHEN a.`status` IN ('PRESENT','LATE') THEN 1 ELSE 0 END)
  INTO   v_total, v_present
  FROM `attendance` a
  WHERE a.`student_id`  = p_student_id
    AND a.`semester_id` = p_semester_id
    AND a.`status`     <> 'EXCUSED';

  IF v_total = 0 THEN RETURN 100.00; END IF;
  RETURN ROUND((v_present / v_total) * 100, 2);
END$$
DELIMITER ;


-- -------------------------------------------------------------------------------------
-- 3. fn_grade_points(percentage) -> 10 point grade point from the `grades` master
-- -------------------------------------------------------------------------------------
DELIMITER $$
CREATE FUNCTION `fn_grade_points`(p_percentage DECIMAL(5,2))
RETURNS decimal(4,2)
    READS SQL DATA
BEGIN
  DECLARE v_points DECIMAL(4,2) DEFAULT 0.00;
  SELECT g.`grade_points` INTO v_points
  FROM `grades` g
  WHERE p_percentage BETWEEN g.`min_percentage` AND g.`max_percentage`
  ORDER BY g.`min_percentage` DESC LIMIT 1;
  RETURN IFNULL(v_points, 0.00);
END$$
DELIMITER ;


-- -------------------------------------------------------------------------------------
-- 4. fn_grade_code(percentage) -> grade letter (AA / AB / ... / FF)
-- -------------------------------------------------------------------------------------
DELIMITER $$
CREATE FUNCTION `fn_grade_code`(p_percentage DECIMAL(5,2))
RETURNS varchar(4)
    READS SQL DATA
BEGIN
  DECLARE v_code VARCHAR(4) DEFAULT 'FF';
  SELECT g.`grade_code` INTO v_code
  FROM `grades` g
  WHERE p_percentage BETWEEN g.`min_percentage` AND g.`max_percentage`
  ORDER BY g.`min_percentage` DESC LIMIT 1;
  RETURN IFNULL(v_code, 'FF');
END$$
DELIMITER ;


-- -------------------------------------------------------------------------------------
-- 5. fn_calculate_sgpa(student, semester)
--    SGPA = SUM(credits * grade_points) / SUM(credits) for the semester's ENDSEM marks.
--    Only passed/graded subjects are included.
-- -------------------------------------------------------------------------------------
DELIMITER $$
CREATE FUNCTION `fn_calculate_sgpa`(
  p_student_id  INT UNSIGNED,
  p_semester_id SMALLINT UNSIGNED
) RETURNS decimal(4,2)
    READS SQL DATA
BEGIN
  DECLARE v_sgpa DECIMAL(4,2) DEFAULT 0.00;

  SELECT ROUND(SUM(s.`credits` * m.`grade_points`) / NULLIF(SUM(s.`credits`),0), 2)
  INTO v_sgpa
  FROM `marks` m
  JOIN `exam_registrations` er ON er.`registration_id` = m.`registration_id`
  JOIN `exams`      e  ON e.`exam_id`  = er.`exam_id`
  JOIN `course_offerings` co ON co.`offering_id` = er.`offering_id`
  JOIN `subjects`   s  ON s.`subject_id` = co.`subject_id`
  WHERE er.`student_id` = p_student_id
    AND e.`semester_id` = p_semester_id
    AND m.`grade_points` IS NOT NULL;

  RETURN IFNULL(v_sgpa, 0.00);
END$$
DELIMITER ;


-- -------------------------------------------------------------------------------------
-- 6. fn_calculate_student_cgpa(student)
--    CGPA = credit-weighted average of every published semester result (SGPA).
--    Uses the `results` table so that CGPA is stable once a result is published.
-- -------------------------------------------------------------------------------------
DELIMITER $$
CREATE FUNCTION `fn_calculate_student_cgpa`(p_student_id INT UNSIGNED)
RETURNS decimal(4,2)
    READS SQL DATA
BEGIN
  DECLARE v_cgpa DECIMAL(4,2) DEFAULT 0.00;

  SELECT ROUND(SUM(r.`sgpa` * r.`total_credits`) / NULLIF(SUM(r.`total_credits`),0), 2)
  INTO v_cgpa
  FROM `results` r
  WHERE r.`student_id` = p_student_id
    AND r.`total_credits` > 0;

  RETURN IFNULL(v_cgpa, 0.00);
END$$
DELIMITER ;


-- -------------------------------------------------------------------------------------
-- 7. fn_calculate_late_fee(student_fee_id)
--    Late fee = days after (due_date + grace days) * late_fee_per_day of the structure.
--    Returns 0 when the bill is already fully paid or not yet overdue.
--    Demonstrates a business rule implemented inside the database, not in the UI.
-- -------------------------------------------------------------------------------------
DELIMITER $$
CREATE FUNCTION `fn_calculate_late_fee`(p_student_fee_id INT UNSIGNED)
RETURNS decimal(10,2)
    READS SQL DATA
BEGIN
  DECLARE v_due_date   DATE;
  DECLARE v_grace_days INT DEFAULT 0;
  DECLARE v_per_day    DECIMAL(8,2) DEFAULT 0.00;
  DECLARE v_days_late  INT DEFAULT 0;
  DECLARE v_status     VARCHAR(20);

  SELECT sf.`due_date`, fs.`grace_days`, fs.`late_fee_per_day`, sf.`status`
  INTO   v_due_date, v_grace_days, v_per_day, v_status
  FROM `student_fees` sf
  JOIN `fee_structures` fs ON fs.`fee_structure_id` = sf.`fee_structure_id`
  WHERE sf.`student_fee_id` = p_student_fee_id;

  IF v_due_date IS NULL OR v_status IN ('PAID','REFUNDED') THEN
    RETURN 0.00;
  END IF;

  SET v_days_late = DATEDIFF(CURDATE(), DATE_ADD(v_due_date, INTERVAL v_grace_days DAY));
  IF v_days_late <= 0 THEN
    RETURN 0.00;
  END IF;
  RETURN ROUND(v_days_late * v_per_day, 2);
END$$
DELIMITER ;


-- -------------------------------------------------------------------------------------
-- 8. fn_calculate_faculty_leave_balance(faculty, leave_type, academic_year)
--    Balance = allotted - used(approved leaves) - used(pending leaves, reserved).
--    Pending applications are reserved so a faculty member cannot over-apply.
-- -------------------------------------------------------------------------------------
DELIMITER $$
CREATE FUNCTION `fn_calculate_faculty_leave_balance`(
  p_faculty_id       INT UNSIGNED,
  p_leave_type       VARCHAR(20),
  p_academic_year_id SMALLINT UNSIGNED
) RETURNS decimal(5,2)
    READS SQL DATA
BEGIN
  DECLARE v_allotted DECIMAL(5,2) DEFAULT 0.00;
  DECLARE v_used     DECIMAL(5,2) DEFAULT 0.00;

  SELECT IFNULL(`allotted`,0) - IFNULL(`used`,0)
  INTO v_allotted
  FROM `leave_balances`
  WHERE `faculty_id` = p_faculty_id
    AND `leave_type` = p_leave_type
    AND `academic_year_id` = p_academic_year_id
  LIMIT 1;

  -- Reserve pending applications so the balance cannot be double-spent.
  SELECT IFNULL(SUM(`days`),0)
  INTO v_used
  FROM `faculty_leaves`
  WHERE `faculty_id` = p_faculty_id
    AND `leave_type` = p_leave_type
    AND `status`     = 'PENDING';

  RETURN v_allotted - v_used;
END$$
DELIMITER ;


-- -------------------------------------------------------------------------------------
-- 9. fn_student_outstanding_dues(student) -> total unpaid amount across all bills
-- -------------------------------------------------------------------------------------
DELIMITER $$
CREATE FUNCTION `fn_student_outstanding_dues`(p_student_id INT UNSIGNED)
RETURNS decimal(12,2)
    READS SQL DATA
BEGIN
  DECLARE v_dues DECIMAL(12,2) DEFAULT 0.00;
  SELECT IFNULL(SUM(`due_amount`),0) INTO v_dues
  FROM `student_fees`
  WHERE `student_id` = p_student_id
    AND `status` IN ('PENDING','PARTIAL','OVERDUE');
  RETURN v_dues;
END$$
DELIMITER ;


-- -------------------------------------------------------------------------------------
-- 10. fn_hostel_available_beds(hostel) -> beds with status AVAILABLE
-- -------------------------------------------------------------------------------------
DELIMITER $$
CREATE FUNCTION `fn_hostel_available_beds`(p_hostel_id SMALLINT UNSIGNED)
RETURNS int
    READS SQL DATA
BEGIN
  DECLARE v_count INT DEFAULT 0;
  SELECT COUNT(*) INTO v_count
  FROM `beds` b
  JOIN `rooms` r ON r.`room_id` = b.`room_id`
  WHERE r.`hostel_id` = p_hostel_id
    AND b.`status` = 'AVAILABLE';
  RETURN v_count;
END$$
DELIMITER ;


-- -------------------------------------------------------------------------------------
-- 11. fn_calculate_net_salary(faculty, month, year)
--     gross = basic + hra + da + ta + special_allowance
--     deductions = PF% of basic + professional tax + income tax + LOP + other
--     net = gross - deductions   (never negative)
-- -------------------------------------------------------------------------------------
DELIMITER $$
CREATE FUNCTION `fn_calculate_net_salary`(
  p_faculty_id INT UNSIGNED,
  p_month      TINYINT UNSIGNED,
  p_year       SMALLINT UNSIGNED
) RETURNS decimal(12,2)
    READS SQL DATA
BEGIN
  DECLARE v_basic, v_hra, v_da, v_ta, v_sa DECIMAL(12,2) DEFAULT 0.00;
  DECLARE v_gross, v_pf, v_pt, v_it, v_lop, v_other, v_net DECIMAL(12,2) DEFAULT 0.00;
  DECLARE v_pf_pct   DECIMAL(5,2) DEFAULT 12.00;
  DECLARE v_lop_days TINYINT DEFAULT 0;
  DECLARE v_per_day  DECIMAL(12,2) DEFAULT 0.00;

  SELECT f.`basic_salary`, f.`hra`, f.`da`, f.`ta`, f.`special_allowance`, f.`pf_percent`
  INTO   v_basic, v_hra, v_da, v_ta, v_sa, v_pf_pct
  FROM `faculty` f WHERE f.`faculty_id` = p_faculty_id;

  IF v_basic IS NULL THEN RETURN 0.00; END IF;

  -- Loss of pay: approved UNPAID leaves that overlap the payroll month.
  SELECT IFNULL(SUM(fl.`days`),0) INTO v_lop_days
  FROM `faculty_leaves` fl
  WHERE fl.`faculty_id` = p_faculty_id
    AND fl.`status` = 'APPROVED'
    AND fl.`leave_type` IN ('UNPAID')
    AND MONTH(fl.`start_date`) = p_month
    AND YEAR(fl.`start_date`)  = p_year;

  SELECT IFNULL(`setting_value`, '200') INTO v_pt
  FROM `system_settings` WHERE `setting_key` = 'PROFESSIONAL_TAX';

  SET v_gross  = v_basic + v_hra + v_da + v_ta + v_sa;
  SET v_pf     = ROUND(v_basic * (v_pf_pct / 100), 2);
  SET v_it     = ROUND(GREATEST(0, (v_gross * 12 - 250000) * 0.05 / 12.0), 2);
  SET v_per_day= ROUND(v_gross / 30, 2);
  SET v_lop    = ROUND(v_per_day * v_lop_days, 2);
  SET v_other  = 0.00;
  SET v_net    = v_gross - v_pf - v_pt - v_it - v_lop - v_other;

  IF v_net < 0 THEN SET v_net = 0.00; END IF;
  RETURN ROUND(v_net, 2);
END$$
DELIMITER ;


-- -------------------------------------------------------------------------------------
-- 12. fn_student_backlog_count(student) -> subjects where the latest attempt is a fail
-- -------------------------------------------------------------------------------------
DELIMITER $$
CREATE FUNCTION `fn_student_backlog_count`(p_student_id INT UNSIGNED)
RETURNS int
    READS SQL DATA
BEGIN
  DECLARE v_count INT DEFAULT 0;
  SELECT COUNT(*) INTO v_count
  FROM (
    SELECT er.`offering_id`,
           MAX(m.`grade_points`) AS best_points
    FROM `marks` m
    JOIN `exam_registrations` er ON er.`registration_id` = m.`registration_id`
    WHERE er.`student_id` = p_student_id
    GROUP BY er.`offering_id`
    HAVING best_points = 0
  ) x;
  RETURN v_count;
END$$
DELIMITER ;


-- -------------------------------------------------------------------------------------
-- 13. fn_student_earned_credits(student) -> credits of subjects successfully cleared
-- -------------------------------------------------------------------------------------
DELIMITER $$
CREATE FUNCTION `fn_student_earned_credits`(p_student_id INT UNSIGNED)
RETURNS int
    READS SQL DATA
BEGIN
  DECLARE v_credits INT DEFAULT 0;
  SELECT IFNULL(SUM(s.`credits`),0) INTO v_credits
  FROM (
    SELECT er.`offering_id`, MAX(m.`grade_points`) AS best_points
    FROM `marks` m
    JOIN `exam_registrations` er ON er.`registration_id` = m.`registration_id`
    WHERE er.`student_id` = p_student_id
    GROUP BY er.`offering_id`
    HAVING best_points > 0
  ) x
  JOIN `course_offerings` co ON co.`offering_id` = x.`offering_id`
  JOIN `subjects` s ON s.`subject_id` = co.`subject_id`;
  RETURN v_credits;
END$$
DELIMITER ;


-- =====================================================================================
-- END OF 07_functions.sql - 13 user defined functions
-- =====================================================================================
