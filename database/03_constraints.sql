-- =====================================================================================
-- FILE   : 03_constraints.sql
-- PURPOSE : Circular / deferred foreign keys, performance indexes, CHECK guards added
--           by ALTER, and default system settings.
--
-- WHY HERE: departments.hod_faculty_id -> faculty and faculty.department_id -> departments
--           are mutually dependent (a department has an HOD who is a faculty member who
--           belongs to a department). InnoDB supports this, but both tables must exist
--           first, so those FKs are added here after 02_tables.sql.
-- =====================================================================================

-- The target database must already be selected, e.g.
--   mysql -u root -p university_erp < 03_constraints.sql
-- 01_schema.sql creates it. These files deliberately carry no hard-coded USE,
-- so the same scripts install cleanly under any database name (Docker, CI, clones).
SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- =====================================================================================
-- PART 1 - CIRCULAR / CROSS-MODULE FOREIGN KEYS
-- =====================================================================================

-- departments.hod_faculty_id -> faculty (G7 owns faculty, G1 owns departments)
ALTER TABLE `departments`
  ADD CONSTRAINT `fk_departments_hod`
  FOREIGN KEY (`hod_faculty_id`) REFERENCES `faculty` (`faculty_id`) ON DELETE SET NULL;

-- sections.class_teacher_id -> faculty
ALTER TABLE `sections`
  ADD CONSTRAINT `fk_sections_class_teacher`
  FOREIGN KEY (`class_teacher_id`) REFERENCES `faculty` (`faculty_id`) ON DELETE SET NULL;

-- course_offerings.faculty_id -> faculty
ALTER TABLE `course_offerings`
  ADD CONSTRAINT `fk_offerings_faculty`
  FOREIGN KEY (`faculty_id`) REFERENCES `faculty` (`faculty_id`) ON DELETE SET NULL;

-- faculty_subjects.faculty_id -> faculty
ALTER TABLE `faculty_subjects`
  ADD CONSTRAINT `fk_fs_faculty`
  FOREIGN KEY (`faculty_id`) REFERENCES `faculty` (`faculty_id`) ON DELETE CASCADE;

-- timetable.faculty_id -> faculty
ALTER TABLE `timetable`
  ADD CONSTRAINT `fk_timetable_faculty`
  FOREIGN KEY (`faculty_id`) REFERENCES `faculty` (`faculty_id`) ON DELETE CASCADE;

-- class_sessions.faculty_id -> faculty
ALTER TABLE `class_sessions`
  ADD CONSTRAINT `fk_sessions_faculty`
  FOREIGN KEY (`faculty_id`) REFERENCES `faculty` (`faculty_id`) ON DELETE CASCADE;

-- attendance.marked_by already -> users; add the offering-level faculty reference check
-- (attendance rows are always created against a session whose faculty owns the class).

-- exam_schedules.invigilator_id -> faculty
ALTER TABLE `exam_schedules`
  ADD CONSTRAINT `fk_es_invigilator`
  FOREIGN KEY (`invigilator_id`) REFERENCES `faculty` (`faculty_id`) ON DELETE SET NULL;

-- hostels.warden_faculty_id -> faculty
ALTER TABLE `hostels`
  ADD CONSTRAINT `fk_hostels_warden`
  FOREIGN KEY (`warden_faculty_id`) REFERENCES `faculty` (`faculty_id`) ON DELETE SET NULL;

-- hostel_fees reference the finance module indirectly via students (already FK'ed).

-- =====================================================================================
-- PART 2 - PERFORMANCE INDEXES (section 35 of the brief)
-- Composite covering indexes for the queries the dashboards actually run.
-- =====================================================================================

-- Student search: name / email / roll / program / status
CREATE INDEX `idx_students_status_program` ON `students` (`status`, `program_id`, `current_semester_no`);
CREATE INDEX `idx_students_created`        ON `students` (`created_at`);

-- Enrollment lookups
CREATE INDEX `idx_enrollments_student_status` ON `enrollments` (`student_id`, `status`);

-- Attendance analytics (the heaviest aggregation in the system)
CREATE INDEX `idx_attendance_student_status` ON `attendance` (`student_id`, `status`);
CREATE INDEX `idx_attendance_offering_student` ON `attendance` (`offering_id`, `student_id`);
CREATE INDEX `idx_attendance_semester_student` ON `attendance` (`semester_id`, `student_id`);

-- Course offerings
CREATE INDEX `idx_offerings_year_status` ON `course_offerings` (`academic_year_id`, `status`);

-- Marks / results
CREATE INDEX `idx_marks_points`       ON `marks` (`grade_points`);
CREATE INDEX `idx_results_status_sem` ON `results` (`semester_id`, `result_status`);

-- Exam registrations
CREATE INDEX `idx_er_exam_status`    ON `exam_registrations` (`exam_id`, `status`);
CREATE INDEX `idx_er_student_exam`   ON `exam_registrations` (`student_id`, `exam_id`);

-- Finance
CREATE INDEX `idx_payments_status_mode`  ON `payments` (`status`, `payment_mode`);
CREATE INDEX `idx_student_fees_status_sem` ON `student_fees` (`semester_id`, `status`);
CREATE INDEX `idx_txn_created`            ON `transactions` (`created_at`);

-- Hostel
CREATE INDEX `idx_beds_room_status` ON `beds` (`room_id`, `status`);
CREATE INDEX `idx_allocations_hostel_status` ON `room_allocations` (`hostel_id`, `status`);

-- Payroll
CREATE INDEX `idx_payrolls_faculty_year` ON `payrolls` (`faculty_id`, `pay_year`);
CREATE INDEX `idx_leaves_status_date`    ON `faculty_leaves` (`status`, `start_date`);

-- Notifications
CREATE INDEX `idx_notifications_created` ON `notifications` (`created_at`);

-- =====================================================================================
-- PART 3 - BUSINESS GUARDS EXPRESSED AS CONSTRAINTS
-- =====================================================================================

-- A hall ticket may only exist for an eligible / exempt registration.
ALTER TABLE `exam_registrations`
  ADD CONSTRAINT `chk_er_hall_ticket_needs_eligibility`
  CHECK (`hall_ticket_no` IS NULL OR `is_eligible` = 1);

-- An exemption must always carry a reason (auditability of the 75% rule waiver).
ALTER TABLE `exam_registrations`
  ADD CONSTRAINT `chk_er_exemption_reason`
  CHECK (`exemption_granted` = 0 OR (`exemption_reason` IS NOT NULL AND `exemption_by` IS NOT NULL));

-- =====================================================================================
-- PART 4 - DEFAULT SYSTEM SETTINGS (used by backend + SQL functions)
-- =====================================================================================
INSERT IGNORE INTO `system_settings` (`setting_key`, `setting_value`, `description`) VALUES
  ('MIN_ATTENDANCE_PERCENTAGE', '75.00', 'Minimum attendance %% required for exam eligibility'),
  ('LATE_FEE_PER_DAY',          '50.00', 'Late fee charged per day after the due date'),
  ('FEE_GRACE_DAYS',            '10',    'Grace days before late fees start'),
  ('PASS_PERCENTAGE',           '40.00', 'Minimum percentage to pass a subject'),
  ('MAX_BACKLOGS_FOR_PROMOTION','4',     'Backlogs allowed before a student is detained'),
  ('LEAVE_CASUAL_PER_YEAR',     '12',    'Casual leave allotted per academic year'),
  ('LEAVE_SICK_PER_YEAR',       '10',    'Sick leave allotted per academic year'),
  ('LEAVE_EARNED_PER_YEAR',     '15',    'Earned leave allotted per academic year'),
  ('PF_PERCENT',                '12.00', 'Provident fund deduction percentage'),
  ('PROFESSIONAL_TAX',          '200.00','Monthly professional tax'),
  ('INSTITUTE_NAME',            'Vidya Pratishthan Institute of Technology', 'Institute display name'),
  ('INSTITUTE_SHORT_NAME',      'VPIT',  'Institute short name'),
  ('CURRENT_ACADEMIC_YEAR',     '2025-26', 'Currently active academic year label');

-- =====================================================================================
-- PART 5 - GRADE MASTER (seeded here because marks/results depend on it)
-- =====================================================================================
INSERT IGNORE INTO `grades` (`grade_code`, `grade_label`, `min_percentage`, `max_percentage`, `grade_points`, `is_pass`) VALUES
  ('AA', 'Outstanding',  90.00, 100.00, 10.00, 1),
  ('AB', 'Excellent',    80.00,  89.99,  9.00, 1),
  ('BB', 'Very Good',    70.00,  79.99,  8.00, 1),
  ('BC', 'Good',         60.00,  69.99,  7.00, 1),
  ('CC', 'Average',      50.00,  59.99,  6.00, 1),
  ('CD', 'Below Average',45.00,  49.99,  5.00, 1),
  ('DD', 'Pass',         40.00,  44.99,  4.00, 1),
  ('FF', 'Fail',          0.00,  39.99,  0.00, 0);
-- NOTE: an absent candidate is recorded with marks.is_absent = 1 and grade 'FF'
--       (grade_points 0). No separate zero-width grade row is needed because
--       chk_grades_range requires max_percentage > min_percentage.

SET FOREIGN_KEY_CHECKS = 1;

-- =====================================================================================
-- END OF 03_constraints.sql
-- =====================================================================================
