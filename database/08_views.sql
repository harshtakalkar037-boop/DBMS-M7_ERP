-- =====================================================================================
-- FILE   : 08_views.sql
-- PURPOSE : Reporting / integration views consumed by the backend services, the
--           dashboards and the report module.
--
-- DESIGN  : Every view is written as a single-level JOIN + GROUP BY (no derived table in
--           the FROM clause) so the file stays portable across MySQL 8.0 and MariaDB.
-- =====================================================================================

-- The target database must already be selected, e.g.
--   mysql -u root -p university_erp < 08_views.sql
-- 01_schema.sql creates it. These files deliberately carry no hard-coded USE,
-- so the same scripts install cleanly under any database name (Docker, CI, clones).
SET NAMES utf8mb4;

-- -------------------------------------------------------------------------------------
-- 1. v_student_full_profile - denormalised student master used by profile screens
-- -------------------------------------------------------------------------------------
CREATE OR REPLACE VIEW `v_student_full_profile` AS
SELECT s.`student_id`, s.`roll_number`, s.`registration_number`, s.`user_id`,
       CONCAT(s.`first_name`, ' ', IFNULL(CONCAT(s.`middle_name`, ' '), ''), s.`last_name`) AS `full_name`,
       s.`first_name`, s.`last_name`, s.`email`, s.`phone`, s.`date_of_birth`, s.`gender`,
       s.`blood_group`, s.`status`, s.`photo_url`, s.`current_semester_no`, s.`admission_year`,
       s.`admission_date`,
       d.`department_id`, d.`department_code`, d.`name` AS `department_name`,
       p.`program_id`, p.`program_code`, p.`name` AS `program_name`, p.`level` AS `program_level`,
       b.`batch_id`, b.`batch_code`, b.`start_year` AS `batch_start_year`, b.`end_year` AS `batch_end_year`,
       c.`category_id`, c.`category_code`, c.`name` AS `category_name`,
       u.`is_active` AS `login_active`, u.`last_login_at`,
       TIMESTAMPDIFF(YEAR, s.`date_of_birth`, CURDATE()) AS `age`
FROM `students` s
JOIN `departments`  d ON d.`department_id` = s.`department_id`
JOIN `programs`     p ON p.`program_id`    = s.`program_id`
JOIN `batches`      b ON b.`batch_id`      = s.`batch_id`
JOIN `categories`   c ON c.`category_id`   = s.`category_id`
JOIN `users`        u ON u.`user_id`       = s.`user_id`;

-- -------------------------------------------------------------------------------------
-- 2. v_student_academic_summary - one row per student: credits, CGPA, backlogs
-- -------------------------------------------------------------------------------------
CREATE OR REPLACE VIEW `v_student_academic_summary` AS
SELECT s.`student_id`, s.`roll_number`,
       CONCAT(s.`first_name`, ' ', s.`last_name`) AS `full_name`,
       s.`program_id`, p.`program_code`, p.`name` AS `program_name`,
       s.`department_id`, d.`department_code`,
       s.`batch_id`, b.`batch_code`, s.`current_semester_no`, s.`status`,
       fn_calculate_student_cgpa(s.`student_id`)  AS `cgpa`,
       fn_student_earned_credits(s.`student_id`)  AS `earned_credits`,
       fn_student_backlog_count(s.`student_id`)   AS `backlog_count`,
       COUNT(DISTINCT e.`enrollment_id`)          AS `enrollment_count`,
       ROUND(AVG(r.`sgpa`), 2)                    AS `avg_sgpa`,
       MAX(CASE WHEN sem.`is_current` = 1 THEN r.`sgpa` END) AS `current_sgpa`
FROM `students` s
JOIN `programs`    p ON p.`program_id`   = s.`program_id`
JOIN `departments` d ON d.`department_id`= s.`department_id`
JOIN `batches`     b ON b.`batch_id`     = s.`batch_id`
LEFT JOIN `enrollments` e ON e.`student_id` = s.`student_id`
LEFT JOIN `results`     r ON r.`student_id` = s.`student_id`
LEFT JOIN `semesters` sem ON sem.`semester_id` = r.`semester_id`
GROUP BY s.`student_id`, s.`roll_number`, s.`first_name`, s.`last_name`,
         s.`program_id`, p.`program_code`, p.`name`, s.`department_id`, d.`department_code`,
         s.`batch_id`, b.`batch_code`, s.`current_semester_no`, s.`status`;

-- -------------------------------------------------------------------------------------
-- 3. v_student_attendance_summary - per student per offering, with traffic-light status
--    GREEN >= 85, YELLOW (warning) >= 75, RED (not eligible) < 75
-- -------------------------------------------------------------------------------------
CREATE OR REPLACE VIEW `v_student_attendance_summary` AS
SELECT a.`student_id`,
       s.`roll_number`,
       CONCAT(s.`first_name`, ' ', s.`last_name`) AS `full_name`,
       a.`offering_id`,
       co.`semester_id`,
       sem.`name` AS `semester_name`,
       sub.`subject_id`, sub.`subject_code`, sub.`name` AS `subject_name`, sub.`credits`,
       COUNT(*) AS `total_classes`,
       SUM(CASE WHEN a.`status` IN ('PRESENT','LATE') THEN 1 ELSE 0 END) AS `attended_classes`,
       SUM(CASE WHEN a.`status` = 'ABSENT' THEN 1 ELSE 0 END)            AS `absent_classes`,
       ROUND(SUM(CASE WHEN a.`status` IN ('PRESENT','LATE') THEN 1 ELSE 0 END) * 100.0
             / NULLIF(COUNT(*), 0), 2) AS `attendance_percentage`,
       CASE
         WHEN SUM(CASE WHEN a.`status` IN ('PRESENT','LATE') THEN 1 ELSE 0 END) * 100.0
              / NULLIF(COUNT(*),0) >= 85 THEN 'SAFE'
         WHEN SUM(CASE WHEN a.`status` IN ('PRESENT','LATE') THEN 1 ELSE 0 END) * 100.0
              / NULLIF(COUNT(*),0) >= 75 THEN 'WARNING'
         ELSE 'CRITICAL'
       END AS `attendance_status`
FROM `attendance` a
JOIN `students`         s   ON s.`student_id`  = a.`student_id`
JOIN `course_offerings` co  ON co.`offering_id`= a.`offering_id`
JOIN `subjects`         sub ON sub.`subject_id`= co.`subject_id`
JOIN `semesters`        sem ON sem.`semester_id` = co.`semester_id`
GROUP BY a.`student_id`, s.`roll_number`, s.`first_name`, s.`last_name`, a.`offering_id`,
         co.`semester_id`, sem.`name`, sub.`subject_id`, sub.`subject_code`, sub.`name`, sub.`credits`;

-- -------------------------------------------------------------------------------------
-- 4. v_student_attendance_overall - one row per student (overall + current semester)
-- -------------------------------------------------------------------------------------
CREATE OR REPLACE VIEW `v_student_attendance_overall` AS
SELECT s.`student_id`, s.`roll_number`,
       CONCAT(s.`first_name`, ' ', s.`last_name`) AS `full_name`,
       s.`department_id`, s.`program_id`, s.`batch_id`, s.`current_semester_no`,
       COUNT(a.`attendance_id`) AS `total_classes`,
       SUM(CASE WHEN a.`status` IN ('PRESENT','LATE') THEN 1 ELSE 0 END) AS `attended_classes`,
       ROUND(SUM(CASE WHEN a.`status` IN ('PRESENT','LATE') THEN 1 ELSE 0 END) * 100.0
             / NULLIF(COUNT(a.`attendance_id`),0), 2) AS `overall_percentage`,
       fn_calculate_semester_attendance(s.`student_id`,
            (SELECT sm.`semester_id` FROM `semesters` sm WHERE sm.`is_current` = 1 LIMIT 1)
       ) AS `current_semester_percentage`,
       CASE
         WHEN SUM(CASE WHEN a.`status` IN ('PRESENT','LATE') THEN 1 ELSE 0 END) * 100.0
              / NULLIF(COUNT(a.`attendance_id`),0) >= 85 THEN 'SAFE'
         WHEN SUM(CASE WHEN a.`status` IN ('PRESENT','LATE') THEN 1 ELSE 0 END) * 100.0
              / NULLIF(COUNT(a.`attendance_id`),0) >= 75 THEN 'WARNING'
         ELSE 'CRITICAL'
       END AS `attendance_status`
FROM `students` s
LEFT JOIN `attendance` a ON a.`student_id` = s.`student_id`
GROUP BY s.`student_id`, s.`roll_number`, s.`first_name`, s.`last_name`,
         s.`department_id`, s.`program_id`, s.`batch_id`, s.`current_semester_no`;

-- -------------------------------------------------------------------------------------
-- 5. v_student_fee_status - per student financial position
-- -------------------------------------------------------------------------------------
CREATE OR REPLACE VIEW `v_student_fee_status` AS
SELECT s.`student_id`, s.`roll_number`,
       CONCAT(s.`first_name`, ' ', s.`last_name`) AS `full_name`,
       s.`department_id`, s.`program_id`, s.`batch_id`,
       COUNT(sf.`student_fee_id`)                      AS `total_bills`,
       IFNULL(SUM(sf.`total_amount`),0)                AS `total_billed`,
       IFNULL(SUM(sf.`paid_amount`),0)                 AS `total_paid`,
       IFNULL(SUM(sf.`due_amount`),0)                  AS `total_due`,
       IFNULL(SUM(sf.`fine_amount`),0)                 AS `total_fine`,
       IFNULL(SUM(sf.`scholarship_amount`),0)          AS `total_scholarship`,
       SUM(CASE WHEN sf.`status` = 'PAID'    THEN 1 ELSE 0 END) AS `paid_bills`,
       SUM(CASE WHEN sf.`status` = 'PENDING' THEN 1 ELSE 0 END) AS `pending_bills`,
       SUM(CASE WHEN sf.`status` = 'PARTIAL' THEN 1 ELSE 0 END) AS `partial_bills`,
       SUM(CASE WHEN sf.`status` = 'OVERDUE' THEN 1 ELSE 0 END) AS `overdue_bills`,
       MIN(CASE WHEN sf.`due_amount` > 0 THEN sf.`due_date` END) AS `next_due_date`,
       CASE
         WHEN SUM(sf.`due_amount`) = 0 AND COUNT(sf.`student_fee_id`) > 0 THEN 'CLEARED'
         WHEN SUM(CASE WHEN sf.`status` = 'OVERDUE' THEN 1 ELSE 0 END) > 0 THEN 'OVERDUE'
         WHEN SUM(sf.`due_amount`) > 0 AND SUM(sf.`paid_amount`) > 0 THEN 'PARTIAL'
         WHEN COUNT(sf.`student_fee_id`) = 0 THEN 'NO_BILL'
         ELSE 'PENDING'
       END AS `overall_fee_status`
FROM `students` s
LEFT JOIN `student_fees` sf ON sf.`student_id` = s.`student_id`
GROUP BY s.`student_id`, s.`roll_number`, s.`first_name`, s.`last_name`,
         s.`department_id`, s.`program_id`, s.`batch_id`;

-- -------------------------------------------------------------------------------------
-- 6. v_fee_collection_summary - program x semester collection performance
-- -------------------------------------------------------------------------------------
CREATE OR REPLACE VIEW `v_fee_collection_summary` AS
SELECT p.`program_id`, p.`program_code`, p.`name` AS `program_name`,
       d.`department_id`, d.`department_code`,
       sem.`semester_id`, sem.`name` AS `semester_name`, sem.`semester_no`,
       COUNT(sf.`student_fee_id`)       AS `bills_raised`,
       IFNULL(SUM(sf.`total_amount`),0) AS `amount_billed`,
       IFNULL(SUM(sf.`paid_amount`),0)  AS `amount_collected`,
       IFNULL(SUM(sf.`due_amount`),0)   AS `amount_pending`,
       IFNULL(SUM(sf.`fine_amount`),0)  AS `amount_fine`,
       ROUND(IFNULL(SUM(sf.`paid_amount`),0) * 100.0
             / NULLIF(SUM(sf.`total_amount`),0), 2) AS `collection_percentage`
FROM `student_fees` sf
JOIN `students`   s   ON s.`student_id` = sf.`student_id`
JOIN `programs`   p   ON p.`program_id` = s.`program_id`
JOIN `departments` d  ON d.`department_id` = s.`department_id`
JOIN `semesters`  sem ON sem.`semester_id` = sf.`semester_id`
GROUP BY p.`program_id`, p.`program_code`, p.`name`, d.`department_id`, d.`department_code`,
         sem.`semester_id`, sem.`name`, sem.`semester_no`;

-- -------------------------------------------------------------------------------------
-- 7. v_faculty_workload - teaching load per faculty member
-- -------------------------------------------------------------------------------------
CREATE OR REPLACE VIEW `v_faculty_workload` AS
SELECT f.`faculty_id`, f.`employee_code`,
       CONCAT(f.`first_name`, ' ', f.`last_name`) AS `full_name`,
       f.`email`, f.`department_id`, d.`department_code`, d.`name` AS `department_name`,
       des.`title` AS `designation`, des.`teaching_hours_per_week`, f.`status`,
       IFNULL(oc.`offerings_count`, 0) AS `offerings_count`,
       IFNULL(ec.`students_taught`, 0) AS `students_taught`,
       IFNULL(sc.`sessions_taken`, 0)  AS `sessions_taken`,
       IFNULL(tc.`timetable_slots`, 0) AS `timetable_slots`,
       IFNULL(lc.`pending_leaves`, 0)  AS `pending_leaves`
FROM `faculty` f
JOIN `departments`  d   ON d.`department_id`  = f.`department_id`
JOIN `designations` des ON des.`designation_id` = f.`designation_id`
LEFT JOIN (SELECT `faculty_id`, COUNT(*) AS `offerings_count`
           FROM `course_offerings` GROUP BY `faculty_id`) oc
       ON oc.`faculty_id` = f.`faculty_id`
LEFT JOIN (SELECT co.`faculty_id`, COUNT(e.`enrollment_id`) AS `students_taught`
           FROM `course_offerings` co
           LEFT JOIN `enrollments` e ON e.`offering_id` = co.`offering_id`
           GROUP BY co.`faculty_id`) ec
       ON ec.`faculty_id` = f.`faculty_id`
LEFT JOIN (SELECT co.`faculty_id`, COUNT(cs.`session_id`) AS `sessions_taken`
           FROM `course_offerings` co
           LEFT JOIN `class_sessions` cs ON cs.`offering_id` = co.`offering_id`
           GROUP BY co.`faculty_id`) sc
       ON sc.`faculty_id` = f.`faculty_id`
LEFT JOIN (SELECT `faculty_id`, COUNT(*) AS `timetable_slots`
           FROM `timetable` WHERE `is_active` = 1 GROUP BY `faculty_id`) tc
       ON tc.`faculty_id` = f.`faculty_id`
LEFT JOIN (SELECT `faculty_id`, COUNT(*) AS `pending_leaves`
           FROM `faculty_leaves` WHERE `status` = 'PENDING'
           GROUP BY `faculty_id`) lc
       ON lc.`faculty_id` = f.`faculty_id`;

-- -------------------------------------------------------------------------------------
-- 8. v_faculty_payroll_summary - per faculty: latest payslip + year-to-date totals
-- -------------------------------------------------------------------------------------
CREATE OR REPLACE VIEW `v_faculty_payroll_summary` AS
SELECT f.`faculty_id`, f.`employee_code`,
       CONCAT(f.`first_name`, ' ', f.`last_name`) AS `full_name`,
       f.`email`, f.`department_id`, d.`department_code`, des.`title` AS `designation`,
       f.`basic_salary`, f.`status`,
       COUNT(py.`payroll_id`)                 AS `payslips_issued`,
       IFNULL(SUM(py.`gross_salary`),0)       AS `ytd_gross`,
       IFNULL(SUM(py.`net_salary`),0)         AS `ytd_net`,
       IFNULL(SUM(py.`pf_deduction`),0)       AS `ytd_pf`,
       IFNULL(SUM(py.`lop_amount`),0)         AS `ytd_lop`,
       MAX(py.`pay_year`)                     AS `last_pay_year`,
       MAX(py.`pay_month`)                    AS `last_pay_month`,
       fn_calculate_faculty_leave_balance(f.`faculty_id`, 'CASUAL',
            (SELECT ay.`academic_year_id` FROM `academic_years` ay WHERE ay.`is_current` = 1 LIMIT 1)
       ) AS `casual_leave_balance`
FROM `faculty` f
JOIN `departments`  d   ON d.`department_id` = f.`department_id`
JOIN `designations` des ON des.`designation_id` = f.`designation_id`
LEFT JOIN `payrolls` py ON py.`faculty_id` = f.`faculty_id`
GROUP BY f.`faculty_id`, f.`employee_code`, f.`first_name`, f.`last_name`, f.`email`,
         f.`department_id`, d.`department_code`, des.`title`, f.`basic_salary`, f.`status`;

-- -------------------------------------------------------------------------------------
-- 9. v_hostel_occupancy - live occupancy per hostel (trigger-maintained counters)
-- -------------------------------------------------------------------------------------
CREATE OR REPLACE VIEW `v_hostel_occupancy` AS
SELECT h.`hostel_id`, h.`hostel_code`, h.`name` AS `hostel_name`, h.`hostel_type`,
       h.`total_rooms`, h.`total_beds`, h.`occupied_beds`,
       h.`total_beds` - h.`occupied_beds` AS `available_beds`,
       ROUND(h.`occupied_beds` * 100.0 / NULLIF(h.`total_beds`,0), 2) AS `occupancy_percentage`,
       IFNULL(rc.`rooms_configured`, 0) AS `rooms_configured`,
       IFNULL(rc.`rooms_full`, 0)       AS `rooms_full`,
       IFNULL(rc.`rooms_available`, 0)  AS `rooms_available`,
       IFNULL(ac.`active_allocations`, 0) AS `active_allocations`,
       h.`rent_per_bed`, h.`status`,
       CONCAT(wf.`first_name`, ' ', wf.`last_name`) AS `warden_name`
FROM `hostels` h
LEFT JOIN (SELECT `hostel_id`, COUNT(*) AS `rooms_configured`,
                  SUM(`status` = 'FULL')      AS `rooms_full`,
                  SUM(`status` = 'AVAILABLE') AS `rooms_available`
           FROM `rooms` GROUP BY `hostel_id`) rc
       ON rc.`hostel_id` = h.`hostel_id`
LEFT JOIN (SELECT `hostel_id`, COUNT(*) AS `active_allocations`
           FROM `room_allocations` WHERE `status` = 'ACTIVE'
           GROUP BY `hostel_id`) ac
       ON ac.`hostel_id` = h.`hostel_id`
LEFT JOIN `faculty` wf ON wf.`faculty_id` = h.`warden_faculty_id`;

-- -------------------------------------------------------------------------------------
-- 10. v_room_vacancy - per room capacity vs occupied beds
-- -------------------------------------------------------------------------------------
CREATE OR REPLACE VIEW `v_room_vacancy` AS
SELECT r.`room_id`, r.`room_number`, r.`floor`, r.`room_type`, r.`capacity`,
       r.`occupied_count`, (r.`capacity` - r.`occupied_count`) AS `vacant_beds`,
       r.`rent_per_bed`, r.`status`,
       h.`hostel_id`, h.`hostel_code`, h.`name` AS `hostel_name`, h.`hostel_type`,
       b.`block_id`, b.`block_code`,
       COUNT(bd.`bed_id`) AS `beds_configured`,
       SUM(CASE WHEN bd.`status` = 'AVAILABLE' THEN 1 ELSE 0 END) AS `beds_available`
FROM `rooms` r
JOIN `hostels`       h  ON h.`hostel_id` = r.`hostel_id`
JOIN `hostel_blocks` b  ON b.`block_id`  = r.`block_id`
LEFT JOIN `beds`     bd ON bd.`room_id`  = r.`room_id`
GROUP BY r.`room_id`, r.`room_number`, r.`floor`, r.`room_type`, r.`capacity`,
         r.`occupied_count`, r.`rent_per_bed`, r.`status`,
         h.`hostel_id`, h.`hostel_code`, h.`name`, h.`hostel_type`, b.`block_id`, b.`block_code`;

-- -------------------------------------------------------------------------------------
-- 11. v_exam_result_summary - per exam: appeared / passed / failed / pass rate
-- -------------------------------------------------------------------------------------
CREATE OR REPLACE VIEW `v_exam_result_summary` AS
SELECT e.`exam_id`, e.`exam_code`, e.`name` AS `exam_name`, e.`exam_type`,
       e.`semester_id`, sem.`name` AS `semester_name`, e.`status` AS `exam_status`,
       e.`result_published`,
       COUNT(DISTINCT er.`registration_id`) AS `registrations`,
       SUM(CASE WHEN er.`status` = 'APPEARED' THEN 1 ELSE 0 END) AS `appeared`,
       SUM(CASE WHEN m.`is_pass` = 1 THEN 1 ELSE 0 END)          AS `passed`,
       SUM(CASE WHEN m.`is_pass` = 0 THEN 1 ELSE 0 END)          AS `failed`,
       SUM(CASE WHEN m.`is_absent` = 1 THEN 1 ELSE 0 END)        AS `absent`,
       ROUND(AVG(m.`percentage`), 2)   AS `average_percentage`,
       MAX(m.`marks_obtained`)         AS `highest_marks`,
       MIN(m.`marks_obtained`)         AS `lowest_marks`,
       ROUND(SUM(CASE WHEN m.`is_pass` = 1 THEN 1 ELSE 0 END) * 100.0
             / NULLIF(SUM(CASE WHEN m.`is_pass` IN (0,1) THEN 1 ELSE 0 END),0), 2) AS `pass_percentage`
FROM `exams` e
JOIN `semesters` sem ON sem.`semester_id` = e.`semester_id`
LEFT JOIN `exam_registrations` er ON er.`exam_id` = e.`exam_id`
LEFT JOIN `marks` m ON m.`registration_id` = er.`registration_id`
GROUP BY e.`exam_id`, e.`exam_code`, e.`name`, e.`exam_type`, e.`semester_id`,
         sem.`name`, e.`status`, e.`result_published`;

-- -------------------------------------------------------------------------------------
-- 12. v_subject_failure_rate - hardest subjects ranked by failure rate
-- -------------------------------------------------------------------------------------
CREATE OR REPLACE VIEW `v_subject_failure_rate` AS
SELECT sub.`subject_id`, sub.`subject_code`, sub.`name` AS `subject_name`,
       sub.`credits`, sub.`subject_type`, sub.`department_id`,
       d.`department_code`,
       COUNT(m.`mark_id`)                                 AS `attempts`,
       SUM(CASE WHEN m.`is_pass` = 0 THEN 1 ELSE 0 END)   AS `failures`,
       ROUND(SUM(CASE WHEN m.`is_pass` = 0 THEN 1 ELSE 0 END) * 100.0
             / NULLIF(COUNT(m.`mark_id`),0), 2)           AS `failure_rate`,
       ROUND(AVG(m.`percentage`), 2)                      AS `average_percentage`,
       ROUND(AVG(m.`grade_points`), 2)                    AS `average_grade_points`
FROM `marks` m
JOIN `exam_registrations` er ON er.`registration_id` = m.`registration_id`
JOIN `course_offerings`   co ON co.`offering_id`     = er.`offering_id`
JOIN `subjects`           sub ON sub.`subject_id`    = co.`subject_id`
JOIN `departments`        d   ON d.`department_id`   = sub.`department_id`
GROUP BY sub.`subject_id`, sub.`subject_code`, sub.`name`, sub.`credits`,
         sub.`subject_type`, sub.`department_id`, d.`department_code`;

-- -------------------------------------------------------------------------------------
-- 13. v_department_performance - department level academic KPIs
-- -------------------------------------------------------------------------------------
-- IMPORTANT: every measure is pre-aggregated in its own derived table. Joining
-- results, attendance, fees and marks all at once would produce a cartesian
-- fan-out and inflate the SUM()/AVG() figures by orders of magnitude.
CREATE OR REPLACE VIEW `v_department_performance` AS
SELECT d.`department_id`, d.`department_code`, d.`name` AS `department_name`,
       IFNULL(sc.`student_count`, 0)  AS `student_count`,
       IFNULL(fc.`faculty_count`, 0)  AS `faculty_count`,
       IFNULL(pc.`program_count`, 0)  AS `program_count`,
       ac.`average_cgpa`,
       aa.`average_attendance`,
       IFNULL(aa.`critical_attendance_students`, 0) AS `critical_attendance_students`,
       ap.`pass_percentage`,
       IFNULL(fd.`students_with_dues`, 0)  AS `students_with_dues`,
       IFNULL(fd.`pending_fee_amount`, 0)  AS `pending_fee_amount`
FROM `departments` d
LEFT JOIN (SELECT `department_id`, COUNT(*) AS `student_count`
           FROM `students` GROUP BY `department_id`) sc
       ON sc.`department_id` = d.`department_id`
LEFT JOIN (SELECT `department_id`, COUNT(*) AS `faculty_count`
           FROM `faculty` WHERE `status` = 'ACTIVE' GROUP BY `department_id`) fc
       ON fc.`department_id` = d.`department_id`
LEFT JOIN (SELECT `department_id`, COUNT(*) AS `program_count`
           FROM `programs` GROUP BY `department_id`) pc
       ON pc.`department_id` = d.`department_id`
LEFT JOIN (SELECT s.`department_id`, ROUND(AVG(r.`cgpa`), 2) AS `average_cgpa`
           FROM `results` r JOIN `students` s ON s.`student_id` = r.`student_id`
           GROUP BY s.`department_id`) ac
       ON ac.`department_id` = d.`department_id`
LEFT JOIN (SELECT s.`department_id`,
                  ROUND(AVG(v.`overall_percentage`), 2) AS `average_attendance`,
                  SUM(v.`attendance_status` = 'CRITICAL') AS `critical_attendance_students`
           FROM `v_student_attendance_overall` v
           JOIN `students` s ON s.`student_id` = v.`student_id`
           GROUP BY s.`department_id`) aa
       ON aa.`department_id` = d.`department_id`
LEFT JOIN (SELECT s.`department_id`,
                  ROUND(SUM(m.`is_pass` = 1) * 100.0 / NULLIF(COUNT(*), 0), 2) AS `pass_percentage`
           FROM `marks` m
           JOIN `exam_registrations` er ON er.`registration_id` = m.`registration_id`
           JOIN `students` s ON s.`student_id` = er.`student_id`
           GROUP BY s.`department_id`) ap
       ON ap.`department_id` = d.`department_id`
LEFT JOIN (SELECT s.`department_id`,
                  COUNT(*) AS `students_with_dues`,
                  ROUND(SUM(f.`total_due`), 2) AS `pending_fee_amount`
           FROM `v_student_fee_status` f
           JOIN `students` s ON s.`student_id` = f.`student_id`
           WHERE f.`total_due` > 0
           GROUP BY s.`department_id`) fd
       ON fd.`department_id` = d.`department_id`;

-- 14. v_exam_eligibility - attendance gate used before exam registration
-- -------------------------------------------------------------------------------------
CREATE OR REPLACE VIEW `v_exam_eligibility` AS
SELECT s.`student_id`, s.`roll_number`,
       CONCAT(s.`first_name`, ' ', s.`last_name`) AS `full_name`,
       co.`offering_id`,
       sub.`subject_code`, sub.`name` AS `subject_name`,
       sem.`semester_id`, sem.`name` AS `semester_name`,
       -- Deliberately the SAME function the exam trigger and
       -- sp_register_student_for_exam use, so the screen, the API and the
       -- database can never disagree about who is eligible.
       fn_calculate_attendance_percentage(s.`student_id`, co.`offering_id`) AS `attendance_percentage`,
       (SELECT CAST(`setting_value` AS DECIMAL(5,2)) FROM `system_settings`
        WHERE `setting_key` = 'MIN_ATTENDANCE_PERCENTAGE') AS `required_percentage`,
       CASE
         WHEN fn_calculate_attendance_percentage(s.`student_id`, co.`offering_id`)
              >= (SELECT CAST(`setting_value` AS DECIMAL(5,2)) FROM `system_settings`
                  WHERE `setting_key` = 'MIN_ATTENDANCE_PERCENTAGE')
         THEN 1 ELSE 0
       END AS `is_eligible`,
       fn_student_outstanding_dues(s.`student_id`) AS `outstanding_dues`
FROM `enrollments` e
JOIN `students`        s   ON s.`student_id`    = e.`student_id`
JOIN `course_offerings` co ON co.`offering_id`  = e.`offering_id`
JOIN `subjects`       sub  ON sub.`subject_id`  = co.`subject_id`
JOIN `semesters`      sem  ON sem.`semester_id` = co.`semester_id`;

-- -------------------------------------------------------------------------------------
-- 15. v_student_result_history - semester by semester result sheet
-- -------------------------------------------------------------------------------------
CREATE OR REPLACE VIEW `v_student_result_history` AS
SELECT r.`result_id`, r.`student_id`, s.`roll_number`,
       CONCAT(s.`first_name`, ' ', s.`last_name`) AS `full_name`,
       r.`semester_id`, sem.`semester_no`, sem.`name` AS `semester_name`,
       ay.`year_label`,
       r.`sgpa`, r.`cgpa`, r.`total_credits`, r.`earned_credits`,
       r.`backlog_count`, r.`result_status`, r.`published_on`
FROM `results` r
JOIN `students`  s   ON s.`student_id`  = r.`student_id`
JOIN `semesters` sem ON sem.`semester_id` = r.`semester_id`
JOIN `academic_years` ay ON ay.`academic_year_id` = sem.`academic_year_id`;

-- -------------------------------------------------------------------------------------
-- 16. v_student_risk_dashboard - academic risk detection (0-100, higher = worse)
--    Factors: low attendance (35), low CGPA (25), backlogs (20), pending fees (10),
--             weak mock exam performance (10)
-- -------------------------------------------------------------------------------------
CREATE OR REPLACE VIEW `v_student_risk_dashboard` AS
SELECT s.`student_id`, s.`roll_number`,
       CONCAT(s.`first_name`, ' ', s.`last_name`) AS `full_name`,
       s.`department_id`, d.`department_code`, s.`program_id`, p.`program_code`,
       s.`batch_id`, s.`current_semester_no`,
       att.`overall_percentage` AS `attendance_percentage`,
       acs.`cgpa`, acs.`backlog_count`,
       fee.`total_due` AS `pending_fees`,
       ROUND(
         (CASE WHEN att.`overall_percentage` < 75 THEN 35
               WHEN att.`overall_percentage` < 85 THEN 15 ELSE 0 END) +
         (CASE WHEN acs.`cgpa` < 5.0 THEN 25 WHEN acs.`cgpa` < 6.5 THEN 10 ELSE 0 END) +
         (CASE WHEN acs.`backlog_count` >= 4 THEN 20
               WHEN acs.`backlog_count` >= 1 THEN 10 ELSE 0 END) +
         (CASE WHEN fee.`total_due` > 50000 THEN 10 WHEN fee.`total_due` > 0 THEN 5 ELSE 0 END) +
         (CASE WHEN IFNULL(mk.`avg_mock_percentage`,100) < 40 THEN 10
               WHEN IFNULL(mk.`avg_mock_percentage`,100) < 60 THEN 5 ELSE 0 END)
       , 2) AS `risk_score`,
       CASE
         WHEN (CASE WHEN att.`overall_percentage` < 75 THEN 35
                    WHEN att.`overall_percentage` < 85 THEN 15 ELSE 0 END) +
              (CASE WHEN acs.`cgpa` < 5.0 THEN 25 WHEN acs.`cgpa` < 6.5 THEN 10 ELSE 0 END) +
              (CASE WHEN acs.`backlog_count` >= 4 THEN 20
                    WHEN acs.`backlog_count` >= 1 THEN 10 ELSE 0 END) +
              (CASE WHEN fee.`total_due` > 50000 THEN 10 WHEN fee.`total_due` > 0 THEN 5 ELSE 0 END) +
              (CASE WHEN IFNULL(mk.`avg_mock_percentage`,100) < 40 THEN 10
                    WHEN IFNULL(mk.`avg_mock_percentage`,100) < 60 THEN 5 ELSE 0 END) >= 65 THEN 'CRITICAL'
         WHEN (CASE WHEN att.`overall_percentage` < 75 THEN 35
                    WHEN att.`overall_percentage` < 85 THEN 15 ELSE 0 END) +
              (CASE WHEN acs.`cgpa` < 5.0 THEN 25 WHEN acs.`cgpa` < 6.5 THEN 10 ELSE 0 END) +
              (CASE WHEN acs.`backlog_count` >= 4 THEN 20
                    WHEN acs.`backlog_count` >= 1 THEN 10 ELSE 0 END) +
              (CASE WHEN fee.`total_due` > 50000 THEN 10 WHEN fee.`total_due` > 0 THEN 5 ELSE 0 END) +
              (CASE WHEN IFNULL(mk.`avg_mock_percentage`,100) < 40 THEN 10
                    WHEN IFNULL(mk.`avg_mock_percentage`,100) < 60 THEN 5 ELSE 0 END) >= 40 THEN 'HIGH'
         WHEN (CASE WHEN att.`overall_percentage` < 75 THEN 35
                    WHEN att.`overall_percentage` < 85 THEN 15 ELSE 0 END) +
              (CASE WHEN acs.`cgpa` < 5.0 THEN 25 WHEN acs.`cgpa` < 6.5 THEN 10 ELSE 0 END) +
              (CASE WHEN acs.`backlog_count` >= 4 THEN 20
                    WHEN acs.`backlog_count` >= 1 THEN 10 ELSE 0 END) +
              (CASE WHEN fee.`total_due` > 50000 THEN 10 WHEN fee.`total_due` > 0 THEN 5 ELSE 0 END) +
              (CASE WHEN IFNULL(mk.`avg_mock_percentage`,100) < 40 THEN 10
                    WHEN IFNULL(mk.`avg_mock_percentage`,100) < 60 THEN 5 ELSE 0 END) >= 20 THEN 'MEDIUM'
         ELSE 'LOW'
       END AS `risk_level`
FROM `students` s
JOIN `departments` d ON d.`department_id` = s.`department_id`
JOIN `programs`    p ON p.`program_id`    = s.`program_id`
LEFT JOIN `v_student_attendance_overall` att ON att.`student_id` = s.`student_id`
LEFT JOIN `v_student_academic_summary`   acs ON acs.`student_id` = s.`student_id`
LEFT JOIN `v_student_fee_status`         fee ON fee.`student_id` = s.`student_id`
LEFT JOIN (
  SELECT me.`student_id`, ROUND(AVG(me.`percentage`),2) AS `avg_mock_percentage`
  FROM `mock_exams` me WHERE me.`status` = 'SUBMITTED' GROUP BY me.`student_id`
) mk ON mk.`student_id` = s.`student_id`
WHERE s.`status` = 'ACTIVE';

-- -------------------------------------------------------------------------------------
-- 17. v_student_rankings - window function demo (RANK / DENSE_RANK / ROW_NUMBER)
-- -------------------------------------------------------------------------------------
CREATE OR REPLACE VIEW `v_student_rankings` AS
SELECT `student_id`, `roll_number`, `full_name`, `department_id`, `program_id`,
       `cgpa`, `earned_credits`, `backlog_count`, `current_semester_no`,
       RANK()       OVER (PARTITION BY `program_id`, `current_semester_no`
                          ORDER BY `cgpa` DESC) AS `class_rank`,
       DENSE_RANK() OVER (PARTITION BY `department_id` ORDER BY `cgpa` DESC) AS `department_rank`,
       ROW_NUMBER() OVER (ORDER BY `cgpa` DESC, `backlog_count` ASC)         AS `university_rank`
FROM `v_student_academic_summary`;

-- -------------------------------------------------------------------------------------
-- 18. v_monthly_attendance - monthly attendance for reports and trend charts
-- -------------------------------------------------------------------------------------
CREATE OR REPLACE VIEW `v_monthly_attendance` AS
SELECT a.`student_id`, YEAR(a.`marked_at`) AS `year`, MONTH(a.`marked_at`) AS `month`,
       MONTHNAME(a.`marked_at`) AS `month_name`,
       COUNT(*) AS `total_classes`,
       SUM(CASE WHEN a.`status` IN ('PRESENT','LATE') THEN 1 ELSE 0 END) AS `attended`,
       ROUND(SUM(CASE WHEN a.`status` IN ('PRESENT','LATE') THEN 1 ELSE 0 END) * 100.0
             / NULLIF(COUNT(*),0), 2) AS `percentage`
FROM `attendance` a
GROUP BY a.`student_id`, YEAR(a.`marked_at`), MONTH(a.`marked_at`), MONTHNAME(a.`marked_at`);

-- -------------------------------------------------------------------------------------
-- 19. v_daily_fee_collection - daily collection for the finance dashboard line chart
-- -------------------------------------------------------------------------------------
CREATE OR REPLACE VIEW `v_daily_fee_collection` AS
SELECT DATE(p.`payment_date`) AS `payment_day`,
       COUNT(*)               AS `transactions`,
       SUM(p.`amount`)        AS `collected_amount`,
       SUM(CASE WHEN p.`payment_mode` = 'ONLINE' THEN p.`amount` ELSE 0 END) AS `online_amount`,
       SUM(CASE WHEN p.`payment_mode` = 'CASH'   THEN p.`amount` ELSE 0 END) AS `cash_amount`
FROM `payments` p
WHERE p.`status` = 'SUCCESS'
GROUP BY DATE(p.`payment_date`);

-- -------------------------------------------------------------------------------------
-- 20. v_exam_hall_ticket - printable hall ticket data
-- -------------------------------------------------------------------------------------
CREATE OR REPLACE VIEW `v_exam_hall_ticket` AS
SELECT er.`registration_id`, er.`hall_ticket_no`, er.`exam_id`, ex.`exam_code`,
       ex.`name` AS `exam_name`, ex.`exam_type`,
       s.`student_id`, s.`roll_number`,
       CONCAT(s.`first_name`, ' ', s.`last_name`) AS `student_name`,
       s.`photo_url`, s.`department_id`, d.`department_code`, p.`program_code`,
       sub.`subject_code`, sub.`name` AS `subject_name`,
       esch.`exam_date`, esch.`start_time`, esch.`end_time`, esch.`room_number`,
       esch.`max_marks`, er.`status`
FROM `exam_registrations` er
JOIN `exams`             ex   ON ex.`exam_id`    = er.`exam_id`
JOIN `students`          s    ON s.`student_id`  = er.`student_id`
JOIN `departments`       d    ON d.`department_id` = s.`department_id`
JOIN `programs`          p    ON p.`program_id`  = s.`program_id`
JOIN `course_offerings`  co   ON co.`offering_id`= er.`offering_id`
JOIN `subjects`          sub  ON sub.`subject_id`= co.`subject_id`
LEFT JOIN `exam_schedules` esch ON esch.`schedule_id` = er.`schedule_id`;

-- =====================================================================================
-- END OF 08_views.sql - 20 views
-- =====================================================================================
