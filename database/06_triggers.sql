-- =====================================================================================
-- FILE   : 06_triggers.sql
-- PURPOSE : Database level invariants. Anything a client (API, script, mysql prompt)
--           tries to do must pass these checks, so the business rules cannot be bypassed.
--
-- THE THREE TRIGGERS REQUIRED BY THE PROJECT BRIEF
--   1. trg_allocation_ai / trg_allocation_au  - hostel bed + room + hostel occupancy
--   2. trg_student_fees_bu / _ai              - fee modification audit logging
--   3. trg_exam_reg_bi_eligibility            - blocks exam registration below 75%
--
-- NOTE: MariaDB/MySQL have no "AFTER INSERT ... FOR EACH STATEMENT" trigger; every
--       trigger here is FOR EACH ROW and is written to stay cheap (no full table scans).
-- =====================================================================================

-- The target database must already be selected, e.g.
--   mysql -u root -p university_erp < 06_triggers.sql
-- 01_schema.sql creates it. These files deliberately carry no hard-coded USE,
-- so the same scripts install cleanly under any database name (Docker, CI, clones).
SET NAMES utf8mb4;

-- =====================================================================================
-- GROUP 1 / STUDENT - validation + status history
-- =====================================================================================

-- MySQL forbids non-deterministic functions inside a CHECK constraint, so the
-- "date of birth must be in the past" rule is enforced by these triggers.
DELIMITER $$
DROP TRIGGER IF EXISTS `trg_students_bi_validate`$$
CREATE TRIGGER `trg_students_bi_validate`
BEFORE INSERT ON `students` FOR EACH ROW
BEGIN
  IF NEW.`date_of_birth` >= CURDATE() THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Date of birth must be in the past.';
  END IF;
  IF NEW.`email` NOT LIKE '%@%' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Student email address is not valid.';
  END IF;
END$$

DROP TRIGGER IF EXISTS `trg_students_bu_validate`$$
CREATE TRIGGER `trg_students_bu_validate`
BEFORE UPDATE ON `students` FOR EACH ROW
BEGIN
  IF NEW.`date_of_birth` >= CURDATE() THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Date of birth must be in the past.';
  END IF;
END$$

DROP TRIGGER IF EXISTS `trg_students_au_status_history`$$
CREATE TRIGGER `trg_students_au_status_history`
AFTER UPDATE ON `students` FOR EACH ROW
BEGIN
  IF OLD.`status` <> NEW.`status` THEN
    INSERT INTO `student_status_history` (`student_id`, `old_status`, `new_status`, `reason`)
    VALUES (NEW.`student_id`, OLD.`status`, NEW.`status`,
            CONCAT('Status changed from ', OLD.`status`, ' to ', NEW.`status`));
  END IF;
END$$

DROP TRIGGER IF EXISTS `trg_admissions_bi_validate`$$
CREATE TRIGGER `trg_admissions_bi_validate`
BEFORE INSERT ON `admissions` FOR EACH ROW
BEGIN
  IF NEW.`date_of_birth` >= CURDATE() THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Applicant date of birth must be in the past.';
  END IF;
  IF NEW.`marks_12` < 35.00 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Applicant does not meet the minimum qualifying marks (35%).';
  END IF;
END$$

DROP TRIGGER IF EXISTS `trg_faculty_bi_validate`$$
CREATE TRIGGER `trg_faculty_bi_validate`
BEFORE INSERT ON `faculty` FOR EACH ROW
BEGIN
  IF NEW.`date_of_birth` >= CURDATE() THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Faculty date of birth must be in the past.';
  END IF;
  IF NEW.`joining_date` <= NEW.`date_of_birth` THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Joining date must be after the date of birth.';
  END IF;
END$$

-- =====================================================================================
-- GROUP 2 / ACADEMIC - enrollment capacity, timetable conflict detection
-- =====================================================================================

-- A student may not be enrolled twice (UNIQUE), into a closed offering, into an
-- offering that is already full, or while their own record is not ACTIVE.
DELIMITER $$
DROP TRIGGER IF EXISTS `trg_enrollments_bi_guard`$$
CREATE TRIGGER `trg_enrollments_bi_guard`
BEFORE INSERT ON `enrollments` FOR EACH ROW
BEGIN
  DECLARE v_status   VARCHAR(20);
  DECLARE v_capacity SMALLINT UNSIGNED;
  DECLARE v_seats    INT;
  DECLARE v_st_state VARCHAR(20);
  DECLARE v_prog     SMALLINT UNSIGNED;

  SELECT o.`status`, o.`capacity`, o.`program_id`
  INTO v_status, v_capacity, v_prog
  FROM `course_offerings` o WHERE o.`offering_id` = NEW.`offering_id`;

  IF v_status IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Course offering does not exist.';
  END IF;
  IF v_status = 'CANCELLED' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'This course offering has been cancelled.';
  END IF;

  SELECT s.`status`, s.`program_id` INTO v_st_state, v_prog
  FROM `students` s WHERE s.`student_id` = NEW.`student_id`;

  IF v_st_state NOT IN ('ACTIVE', 'SUSPENDED') THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Only ACTIVE students can be enrolled.';
  END IF;

  SELECT COUNT(*) INTO v_seats
  FROM `enrollments` e WHERE e.`offering_id` = NEW.`offering_id`;

  IF v_seats >= v_capacity THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'This course offering is already full.';
  END IF;
END$$

DROP TRIGGER IF EXISTS `trg_enrollments_ai_count`$$
CREATE TRIGGER `trg_enrollments_ai_count`
AFTER INSERT ON `enrollments` FOR EACH ROW
BEGIN
  UPDATE `course_offerings`
  SET `enrolled_count` = (SELECT COUNT(*) FROM `enrollments` e WHERE e.`offering_id` = NEW.`offering_id`)
  WHERE `offering_id` = NEW.`offering_id`;
END$$

DROP TRIGGER IF EXISTS `trg_enrollments_ad_count`$$
CREATE TRIGGER `trg_enrollments_ad_count`
AFTER DELETE ON `enrollments` FOR EACH ROW
BEGIN
  UPDATE `course_offerings`
  SET `enrolled_count` = (SELECT COUNT(*) FROM `enrollments` e WHERE e.`offering_id` = OLD.`offering_id`)
  WHERE `offering_id` = OLD.`offering_id`;
END$$

-- Timetable: the UNIQUE keys already prevent a clash; this trigger produces a readable
-- message that names the conflicting resource instead of "Duplicate entry ...".
DELIMITER $$
DROP TRIGGER IF EXISTS `trg_timetable_bi_conflict`$$
CREATE TRIGGER `trg_timetable_bi_conflict`
BEFORE INSERT ON `timetable` FOR EACH ROW
BEGIN
  DECLARE v_clash INT DEFAULT 0;
  DECLARE v_subj  VARCHAR(150);

  IF NEW.`end_time` <= NEW.`start_time` THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Slot end time must be after the start time.';
  END IF;

  SELECT COUNT(*) INTO v_clash
  FROM `timetable` t
  WHERE t.`faculty_id` = NEW.`faculty_id`
    AND t.`day_of_week` = NEW.`day_of_week`
    AND t.`start_time`  = NEW.`start_time`;
  IF v_clash > 0 THEN
    SELECT s.`name` INTO v_subj FROM `subjects` s
    JOIN `course_offerings` o ON o.`subject_id` = s.`subject_id`
    WHERE o.`offering_id` = (SELECT `offering_id` FROM `timetable`
                             WHERE `faculty_id` = NEW.`faculty_id`
                               AND `day_of_week` = NEW.`day_of_week`
                               AND `start_time` = NEW.`start_time` LIMIT 1);
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Timetable conflict: this faculty member already teaches another class in that slot.';
  END IF;

  SELECT COUNT(*) INTO v_clash
  FROM `timetable` t
  WHERE t.`room_number` = NEW.`room_number`
    AND t.`day_of_week` = NEW.`day_of_week`
    AND t.`start_time`  = NEW.`start_time`;
  IF v_clash > 0 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Timetable conflict: this room is already booked in that slot.';
  END IF;

  SELECT COUNT(*) INTO v_clash
  FROM `timetable` t
  WHERE t.`section_id` = NEW.`section_id`
    AND t.`day_of_week` = NEW.`day_of_week`
    AND t.`start_time`  = NEW.`start_time`;
  IF v_clash > 0 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Timetable conflict: this section already has a class in that slot.';
  END IF;
END$$

-- =====================================================================================
-- GROUP 3 / ATTENDANCE - only enrolled students, no future-dated marking
-- =====================================================================================
DELIMITER $$
DROP TRIGGER IF EXISTS `trg_attendance_bi_guard`$$
CREATE TRIGGER `trg_attendance_bi_guard`
BEFORE INSERT ON `attendance` FOR EACH ROW
BEGIN
  DECLARE v_enrolled INT DEFAULT 0;
  DECLARE v_session_date DATE;

  SELECT `session_date` INTO v_session_date
  FROM `class_sessions` WHERE `session_id` = NEW.`session_id`;

  IF v_session_date IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Class session does not exist.';
  END IF;
  IF v_session_date > CURDATE() THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Attendance cannot be marked for a future dated session.';
  END IF;

  SELECT COUNT(*) INTO v_enrolled
  FROM `enrollments` e
  WHERE e.`student_id` = NEW.`student_id` AND e.`offering_id` = NEW.`offering_id`;

  IF v_enrolled = 0 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'This student is not enrolled in the course of this session.';
  END IF;
END$$

-- =====================================================================================
-- GROUP 4 / EXAMINATION - *** THE 75% ATTENDANCE GATE *** and marks validation
-- =====================================================================================
DELIMITER $$
DROP TRIGGER IF EXISTS `trg_exam_reg_bi_eligibility`$$
CREATE TRIGGER `trg_exam_reg_bi_eligibility`
BEFORE INSERT ON `exam_registrations` FOR EACH ROW
BEGIN
  DECLARE v_attendance DECIMAL(5,2);
  DECLARE v_threshold  DECIMAL(5,2) DEFAULT 75.00;
  DECLARE v_enrolled   INT DEFAULT 0;

  SELECT CAST(`setting_value` AS DECIMAL(5,2)) INTO v_threshold
  FROM `system_settings` WHERE `setting_key` = 'MIN_ATTENDANCE_PERCENTAGE';

  -- Only students of the offering may register.
  SELECT COUNT(*) INTO v_enrolled
  FROM `enrollments` e
  WHERE e.`student_id` = NEW.`student_id` AND e.`offering_id` = NEW.`offering_id`;
  IF v_enrolled = 0 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'This student is not enrolled in the course of this examination.';
  END IF;

  -- Always recompute attendance from the register - never trust the client.
  SET v_attendance = fn_calculate_attendance_percentage(NEW.`student_id`, NEW.`offering_id`);

  IF NEW.`attendance_percentage` IS NULL
     OR NEW.`attendance_percentage` <> v_attendance THEN
    SET NEW.`attendance_percentage` = v_attendance;
  END IF;

  IF v_attendance < v_threshold AND NEW.`exemption_granted` = 0 THEN
    SET NEW.`is_eligible` = 0;
    SET NEW.`eligibility_reason` =
      CONCAT('Attendance ', v_attendance, '% is below the mandatory ', v_threshold, '%');
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Exam registration refused: attendance is below the required 75%.';
  END IF;

  IF v_attendance >= v_threshold THEN
    SET NEW.`is_eligible` = 1;
    IF NEW.`eligibility_reason` IS NULL THEN
      SET NEW.`eligibility_reason` = CONCAT('Eligible: attendance ', v_attendance, '%');
    END IF;
  END IF;
END$$

DELIMITER $$
DROP TRIGGER IF EXISTS `trg_exam_reg_ai_audit`$$
CREATE TRIGGER `trg_exam_reg_ai_audit`
AFTER INSERT ON `exam_registrations` FOR EACH ROW
BEGIN
  INSERT INTO `audit_logs` (`user_id`, `action`, `entity`, `entity_id`, `description`)
  VALUES (NEW.`registered_by`, 'EXAM_REGISTRATION', 'exam_registrations', NEW.`registration_id`,
          CONCAT('Registration for exam ', NEW.`exam_id`, ' (attendance ',
                 IFNULL(NEW.`attendance_percentage`, 0), '%)'));
END$$

-- Marks: validate the range and derive percentage / grade / grade points in the database
-- so that no client can store an inconsistent grade.
DELIMITER $$
DROP TRIGGER IF EXISTS `trg_marks_bi_derive`$$
CREATE TRIGGER `trg_marks_bi_derive`
BEFORE INSERT ON `marks` FOR EACH ROW
BEGIN
  DECLARE v_max SMALLINT UNSIGNED;

  SELECT COALESCE(MAX(es.`max_marks`), 100) INTO v_max
  FROM `exam_registrations` er
  LEFT JOIN `exam_schedules` es
         ON es.`exam_id` = er.`exam_id`
        AND es.`subject_id` = (SELECT `subject_id` FROM `course_offerings`
                               WHERE `offering_id` = er.`offering_id`)
  WHERE er.`registration_id` = NEW.`registration_id`;

  IF NEW.`max_marks` IS NULL OR NEW.`max_marks` = 0 THEN
    SET NEW.`max_marks` = v_max;
  END IF;

  IF NEW.`marks_obtained` < 0 OR NEW.`marks_obtained` > NEW.`max_marks` THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Marks entered are outside the permitted range for this paper.';
  END IF;

  IF NEW.`is_absent` = 1 THEN
    SET NEW.`marks_obtained` = 0.00;
    SET NEW.`percentage`     = 0.00;
    SET NEW.`grade`          = 'FF';
    SET NEW.`grade_points`   = 0.00;
    SET NEW.`is_pass`        = 0;
  ELSE
    SET NEW.`percentage`   = ROUND(NEW.`marks_obtained` * 100.0 / NEW.`max_marks`, 2);
    SET NEW.`grade`        = fn_grade_code(NEW.`percentage`);
    SET NEW.`grade_points` = fn_grade_points(NEW.`percentage`);
    SET NEW.`is_pass`      = IF(NEW.`percentage` >= 40, 1, 0);
  END IF;
END$$

DROP TRIGGER IF EXISTS `trg_marks_bu_derive`$$
CREATE TRIGGER `trg_marks_bu_derive`
BEFORE UPDATE ON `marks` FOR EACH ROW
BEGIN
  IF NEW.`marks_obtained` < 0 OR NEW.`marks_obtained` > NEW.`max_marks` THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Marks entered are outside the permitted range for this paper.';
  END IF;

  IF NEW.`is_absent` = 1 THEN
    SET NEW.`marks_obtained` = 0.00;
    SET NEW.`percentage`     = 0.00;
    SET NEW.`grade`          = 'FF';
    SET NEW.`grade_points`   = 0.00;
    SET NEW.`is_pass`        = 0;
  ELSE
    SET NEW.`percentage`   = ROUND(NEW.`marks_obtained` * 100.0 / NEW.`max_marks`, 2);
    SET NEW.`grade`        = fn_grade_code(NEW.`percentage`);
    SET NEW.`grade_points` = fn_grade_points(NEW.`percentage`);
    SET NEW.`is_pass`      = IF(NEW.`percentage` >= 40, 1, 0);
  END IF;
END$$

DROP TRIGGER IF EXISTS `trg_marks_au_audit`$$
CREATE TRIGGER `trg_marks_au_audit`
AFTER UPDATE ON `marks` FOR EACH ROW
BEGIN
  IF OLD.`marks_obtained` <> NEW.`marks_obtained` OR OLD.`is_absent` <> NEW.`is_absent` THEN
    INSERT INTO `audit_logs` (`user_id`, `action`, `entity`, `entity_id`, `old_value`, `new_value`, `description`)
    VALUES (NEW.`entered_by`, 'MARKS_UPDATE', 'marks', NEW.`mark_id`,
            JSON_OBJECT('marks', OLD.`marks_obtained`, 'grade', OLD.`grade`),
            JSON_OBJECT('marks', NEW.`marks_obtained`, 'grade', NEW.`grade`),
            CONCAT('Marks changed from ', OLD.`marks_obtained`, ' to ', NEW.`marks_obtained`));
  END IF;
END$$

-- =====================================================================================
-- GROUP 5 / FINANCE - fee audit logging + payment status automation
-- =====================================================================================
DELIMITER $$
DROP TRIGGER IF EXISTS `trg_student_fees_ai_audit`$$
CREATE TRIGGER `trg_student_fees_ai_audit`
AFTER INSERT ON `student_fees` FOR EACH ROW
BEGIN
  INSERT INTO `audit_logs` (`action`, `entity`, `entity_id`, `description`, `new_value`)
  VALUES ('FEE_CHANGE', 'student_fees', NEW.`student_fee_id`,
          CONCAT('Fee bill created for student ', NEW.`student_id`,
                 ' amount ', NEW.`total_amount`),
          JSON_OBJECT('total_amount', NEW.`total_amount`, 'due_amount', NEW.`due_amount`,
                      'status', NEW.`status`, 'due_date', NEW.`due_date`));
END$$

-- *** REQUIRED TRIGGER: every modification of a fee record is written to the audit log ***
DELIMITER $$
DROP TRIGGER IF EXISTS `trg_student_fees_bu_audit`$$
CREATE TRIGGER `trg_student_fees_bu_audit`
BEFORE UPDATE ON `student_fees` FOR EACH ROW
BEGIN
  -- Recompute the outstanding balance and the payment status centrally, so that no
  -- application code can leave a contradictory (amount, status) pair behind.
  SET NEW.`due_amount` = GREATEST(0,
      NEW.`total_amount` - NEW.`scholarship_amount` - NEW.`discount_amount`
      - NEW.`paid_amount` + NEW.`fine_amount`);

  IF NEW.`due_amount` <= 0 THEN
    SET NEW.`status`  = 'PAID';
    SET NEW.`paid_on` = COALESCE(NEW.`paid_on`, NOW());
  ELSEIF NEW.`paid_amount` > 0 THEN
    SET NEW.`status` = 'PARTIAL';
  ELSEIF NEW.`due_date` < CURDATE() THEN
    SET NEW.`status` = 'OVERDUE';
  ELSE
    SET NEW.`status` = 'PENDING';
  END IF;

  IF OLD.`total_amount`       <> NEW.`total_amount`
     OR OLD.`scholarship_amount` <> NEW.`scholarship_amount`
     OR OLD.`discount_amount` <> NEW.`discount_amount`
     OR OLD.`fine_amount`     <> NEW.`fine_amount`
     OR OLD.`paid_amount`     <> NEW.`paid_amount`
     OR OLD.`status`          <> NEW.`status` THEN
    INSERT INTO `audit_logs` (`action`, `entity`, `entity_id`, `old_value`, `new_value`, `description`)
    VALUES ('FEE_CHANGE', 'student_fees', NEW.`student_fee_id`,
            JSON_OBJECT('total_amount', OLD.`total_amount`, 'paid_amount', OLD.`paid_amount`,
                        'due_amount', OLD.`due_amount`, 'fine_amount', OLD.`fine_amount`,
                        'scholarship_amount', OLD.`scholarship_amount`, 'status', OLD.`status`),
            JSON_OBJECT('total_amount', NEW.`total_amount`, 'paid_amount', NEW.`paid_amount`,
                        'due_amount', NEW.`due_amount`, 'fine_amount', NEW.`fine_amount`,
                        'scholarship_amount', NEW.`scholarship_amount`, 'status', NEW.`status`),
            'Fee record modified');
  END IF;
END$$

-- Payment received -> update the bill, post the ledger entry, notify the student.
DELIMITER $$
DROP TRIGGER IF EXISTS `trg_payment_ai`$$
CREATE TRIGGER `trg_payment_ai`
AFTER INSERT ON `payments` FOR EACH ROW
BEGIN
  IF NEW.`status` = 'SUCCESS' THEN
    UPDATE `student_fees`
    SET `paid_amount` = `paid_amount` + NEW.`amount`
    WHERE `student_fee_id` = NEW.`student_fee_id`;

    INSERT INTO `transactions`
      (`student_fee_id`, `payment_id`, `student_id`, `txn_type`, `amount`, `balance_after`, `description`)
    SELECT sf.`student_fee_id`, NEW.`payment_id`, NEW.`student_id`, 'CREDIT', NEW.`amount`,
           GREATEST(0, sf.`total_amount` - sf.`scholarship_amount` - sf.`discount_amount`
                       - sf.`paid_amount` + sf.`fine_amount`),
           CONCAT('Receipt ', NEW.`receipt_no`, ' - ', NEW.`payment_mode`)
    FROM `student_fees` sf WHERE sf.`student_fee_id` = NEW.`student_fee_id`;
  END IF;
END$$

DELIMITER $$
DROP TRIGGER IF EXISTS `trg_payment_au`$$
CREATE TRIGGER `trg_payment_au`
AFTER UPDATE ON `payments` FOR EACH ROW
BEGIN
  IF OLD.`status` = 'SUCCESS' AND NEW.`status` = 'REFUNDED' THEN
    UPDATE `student_fees`
    SET `paid_amount` = GREATEST(0, `paid_amount` - NEW.`amount`)
    WHERE `student_fee_id` = NEW.`student_fee_id`;

    INSERT INTO `transactions`
      (`student_fee_id`, `payment_id`, `student_id`, `txn_type`, `amount`, `description`)
    VALUES (NEW.`student_fee_id`, NEW.`payment_id`, NEW.`student_id`, 'DEBIT', NEW.`amount`,
            CONCAT('Refund against receipt ', NEW.`receipt_no`));
  END IF;
END$$

-- =====================================================================================
-- GROUP 6 / HOSTEL - *** occupancy automation (required by the brief) ***
-- =====================================================================================
DELIMITER $$
DROP TRIGGER IF EXISTS `trg_allocation_ai`$$
CREATE TRIGGER `trg_allocation_ai`
AFTER INSERT ON `room_allocations` FOR EACH ROW
BEGIN
  IF NEW.`status` = 'ACTIVE' THEN
    UPDATE `beds`  SET `status` = 'OCCUPIED' WHERE `bed_id` = NEW.`bed_id`;
    UPDATE `rooms` SET `occupied_count` = `occupied_count` + 1 WHERE `room_id` = NEW.`room_id`;
    UPDATE `hostels` SET `occupied_beds` = `occupied_beds` + 1 WHERE `hostel_id` = NEW.`hostel_id`;

    INSERT INTO `audit_logs` (`user_id`, `action`, `entity`, `entity_id`, `description`)
    VALUES (NEW.`allocated_by`, 'HOSTEL_ALLOCATION', 'room_allocations', NEW.`allocation_id`,
            CONCAT('TRIGGER: bed ', NEW.`bed_id`, ' occupied, room ',
                   NEW.`room_id`, ' occupancy incremented'));
  END IF;
END$$

DELIMITER $$
DROP TRIGGER IF EXISTS `trg_allocation_au`$$
CREATE TRIGGER `trg_allocation_au`
AFTER UPDATE ON `room_allocations` FOR EACH ROW
BEGIN
  -- Bed transfer: free the old bed, occupy the new one.
  IF NEW.`bed_id` <> OLD.`bed_id` AND NEW.`status` = 'ACTIVE' THEN
    UPDATE `beds` SET `status` = 'AVAILABLE' WHERE `bed_id` = OLD.`bed_id`;
    UPDATE `beds` SET `status` = 'OCCUPIED'  WHERE `bed_id` = NEW.`bed_id`;

    UPDATE `rooms` SET `occupied_count` = GREATEST(0, `occupied_count` - 1)
      WHERE `room_id` = OLD.`room_id`;
    UPDATE `rooms` SET `occupied_count` = `occupied_count` + 1 WHERE `room_id` = NEW.`room_id`;

    IF OLD.`hostel_id` <> NEW.`hostel_id` THEN
      UPDATE `hostels` SET `occupied_beds` = GREATEST(0, `occupied_beds` - 1)
        WHERE `hostel_id` = OLD.`hostel_id`;
      UPDATE `hostels` SET `occupied_beds` = `occupied_beds` + 1 WHERE `hostel_id` = NEW.`hostel_id`;
    END IF;
  END IF;

  -- Vacating: release the bed and decrement every counter.
  IF OLD.`status` = 'ACTIVE' AND NEW.`status` IN ('VACATED', 'TRANSFERRED') THEN
    UPDATE `beds` SET `status` = 'AVAILABLE' WHERE `bed_id` = NEW.`bed_id`;
    UPDATE `rooms` SET `occupied_count` = GREATEST(0, `occupied_count` - 1)
      WHERE `room_id` = NEW.`room_id`;
    UPDATE `hostels` SET `occupied_beds` = GREATEST(0, `occupied_beds` - 1)
      WHERE `hostel_id` = NEW.`hostel_id`;
  END IF;

  -- Reactivating a vacated allocation (rare, but keeps the counters honest).
  IF OLD.`status` IN ('VACATED', 'TRANSFERRED') AND NEW.`status` = 'ACTIVE' THEN
    UPDATE `beds` SET `status` = 'OCCUPIED' WHERE `bed_id` = NEW.`bed_id`;
    UPDATE `rooms` SET `occupied_count` = `occupied_count` + 1 WHERE `room_id` = NEW.`room_id`;
    UPDATE `hostels` SET `occupied_beds` = `occupied_beds` + 1 WHERE `hostel_id` = NEW.`hostel_id`;
  END IF;
END$$

DELIMITER $$
DROP TRIGGER IF EXISTS `trg_allocation_ad`$$
CREATE TRIGGER `trg_allocation_ad`
AFTER DELETE ON `room_allocations` FOR EACH ROW
BEGIN
  IF OLD.`status` = 'ACTIVE' THEN
    UPDATE `beds` SET `status` = 'AVAILABLE' WHERE `bed_id` = OLD.`bed_id`;
    UPDATE `rooms` SET `occupied_count` = GREATEST(0, `occupied_count` - 1)
      WHERE `room_id` = OLD.`room_id`;
    UPDATE `hostels` SET `occupied_beds` = GREATEST(0, `occupied_beds` - 1)
      WHERE `hostel_id` = OLD.`hostel_id`;
  END IF;
END$$

-- Only one ACTIVE allocation per student per academic year.
DELIMITER $$
DROP TRIGGER IF EXISTS `trg_allocation_bi_duplicate`$$
CREATE TRIGGER `trg_allocation_bi_duplicate`
BEFORE INSERT ON `room_allocations` FOR EACH ROW
BEGIN
  DECLARE v_active INT DEFAULT 0;

  IF NEW.`status` = 'ACTIVE' THEN
    SELECT COUNT(*) INTO v_active
    FROM `room_allocations` ra
    WHERE ra.`student_id` = NEW.`student_id`
      AND ra.`academic_year_id` = NEW.`academic_year_id`
      AND ra.`status` = 'ACTIVE';

    IF v_active > 0 THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'This student already has an active bed allocation for this year.';
    END IF;
  END IF;
END$$

-- A room can never hold more students than it has beds.
DELIMITER $$
DROP TRIGGER IF EXISTS `trg_rooms_bu_capacity`$$
CREATE TRIGGER `trg_rooms_bu_capacity`
BEFORE UPDATE ON `rooms` FOR EACH ROW
BEGIN
  IF NEW.`occupied_count` > NEW.`capacity` THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Room capacity exceeded - there are not enough beds in this room.';
  END IF;
  IF NEW.`occupied_count` < 0 THEN
    SET NEW.`occupied_count` = 0;
  END IF;
  IF NEW.`occupied_count` >= NEW.`capacity` THEN
    SET NEW.`status` = 'FULL';
  ELSEIF NEW.`status` = 'FULL' THEN
    SET NEW.`status` = 'AVAILABLE';
  END IF;
END$$

-- A bed with an active allocation may not be released by hand.
DELIMITER $$
DROP TRIGGER IF EXISTS `trg_beds_bu_guard`$$
CREATE TRIGGER `trg_beds_bu_guard`
BEFORE UPDATE ON `beds` FOR EACH ROW
BEGIN
  DECLARE v_alloc INT DEFAULT 0;

  IF OLD.`status` = 'OCCUPIED' AND NEW.`status` = 'AVAILABLE' THEN
    SELECT COUNT(*) INTO v_alloc
    FROM `room_allocations` ra
    WHERE ra.`bed_id` = OLD.`bed_id` AND ra.`status` = 'ACTIVE';
    IF v_alloc > 0 THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'This bed is currently allocated - vacate the allocation first.';
    END IF;
  END IF;
END$$

-- =====================================================================================
-- GROUP 7 / FACULTY - keep the leave ledger consistent when a leave is cancelled
-- =====================================================================================
DELIMITER $$
DROP TRIGGER IF EXISTS `trg_faculty_leaves_bu_guard`$$
CREATE TRIGGER `trg_faculty_leaves_bu_guard`
BEFORE UPDATE ON `faculty_leaves` FOR EACH ROW
BEGIN
  DECLARE v_year SMALLINT UNSIGNED;
  DECLARE v_balance DECIMAL(5,2);

  IF OLD.`status` = 'PENDING' AND NEW.`status` = 'APPROVED' THEN
    SELECT `academic_year_id` INTO v_year FROM `academic_years` WHERE `is_current` = 1 LIMIT 1;
    SET v_balance = fn_calculate_faculty_leave_balance(NEW.`faculty_id`, NEW.`leave_type`, v_year);
    IF NEW.`leave_type` IN ('CASUAL', 'SICK', 'EARNED') AND v_balance < NEW.`days` THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Leave cannot be approved: remaining balance is insufficient.';
    END IF;
  END IF;

  IF OLD.`status` = 'APPROVED' AND NEW.`status` = 'CANCELLED' THEN
    SELECT `academic_year_id` INTO v_year FROM `academic_years` WHERE `is_current` = 1 LIMIT 1;
    UPDATE `leave_balances`
    SET `used` = GREATEST(0, `used` - OLD.`days`)
    WHERE `faculty_id` = OLD.`faculty_id`
      AND `leave_type` = OLD.`leave_type`
      AND `academic_year_id` = v_year;
  END IF;

  IF NEW.`end_date` < NEW.`start_date` THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Leave end date cannot precede the start date.';
  END IF;
END$$

DELIMITER $$
DROP TRIGGER IF EXISTS `trg_faculty_leaves_bi_guard`$$
CREATE TRIGGER `trg_faculty_leaves_bi_guard`
BEFORE INSERT ON `faculty_leaves` FOR EACH ROW
BEGIN
  IF NEW.`end_date` < NEW.`start_date` THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Leave end date cannot precede the start date.';
  END IF;
  IF NEW.`start_date` < (SELECT `joining_date` FROM `faculty` WHERE `faculty_id` = NEW.`faculty_id`) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Leave cannot start before the joining date.';
  END IF;
END$$

-- A payslip that has already been paid must not be edited silently.
DELIMITER $$
DROP TRIGGER IF EXISTS `trg_payrolls_bu_guard`$$
CREATE TRIGGER `trg_payrolls_bu_guard`
BEFORE UPDATE ON `payrolls` FOR EACH ROW
BEGIN
  IF OLD.`status` = 'PAID' AND NEW.`status` NOT IN ('PAID', 'APPROVED') THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'A paid payslip cannot be moved back to draft.';
  END IF;
  IF NEW.`net_salary` < 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Net salary cannot be negative.';
  END IF;
END$$

-- =====================================================================================
-- END OF 06_triggers.sql
-- =====================================================================================

-- =====================================================================================
-- POST-SEED RECONCILIATION
-- -------------------------------------------------------------------------------------
-- The seed file (04_seed.sql) is loaded BEFORE the triggers in this file exist, so the
-- denormalised counters it ships with were never maintained by a trigger. Rather than
-- leave the database with numbers that disagree with the rows they summarise, this
-- section recomputes every one of them from the source of truth.
--
-- It is idempotent and safe to re-run at any time: it only writes derived values.
-- =====================================================================================

-- 1. course_offerings.enrolled_count  (maintained afterwards by trg_enrollments_ai_count)
UPDATE `course_offerings` o
   SET o.`enrolled_count` = (
         SELECT COUNT(*) FROM `enrollments` e
         WHERE e.`offering_id` = o.`offering_id`);

-- 2. rooms.occupied_count and beds.status (maintained afterwards by the allocation triggers)
UPDATE `beds` b
   SET b.`status` = CASE
         WHEN EXISTS (SELECT 1 FROM `room_allocations` ra
                      WHERE ra.`bed_id` = b.`bed_id` AND ra.`status` = 'ACTIVE')
         THEN 'OCCUPIED' ELSE 'AVAILABLE' END;

UPDATE `rooms` r
   SET r.`occupied_count` = (
         SELECT COUNT(*) FROM `beds` b
         WHERE b.`room_id` = r.`room_id` AND b.`status` = 'OCCUPIED');

-- 3. hostel roll-ups (derived from rooms + allocations)
UPDATE `hostels` h
   SET h.`total_rooms`    = (SELECT COUNT(*)         FROM `rooms` r WHERE r.`hostel_id` = h.`hostel_id`),
       h.`total_beds`     = (SELECT IFNULL(SUM(r.`capacity`), 0) FROM `rooms` r WHERE r.`hostel_id` = h.`hostel_id`),
       h.`occupied_beds`  = (SELECT COUNT(*) FROM `room_allocations` ra
                             WHERE ra.`hostel_id` = h.`hostel_id` AND ra.`status` = 'ACTIVE');

-- 4. leave_balances.used  (maintained afterwards by sp_approve_leave)
UPDATE `leave_balances` lb
   SET lb.`used` = (
         SELECT IFNULL(SUM(l.`days`), 0) FROM `faculty_leaves` l
         WHERE l.`faculty_id` = lb.`faculty_id`
           AND l.`leave_type` = lb.`leave_type`
           AND l.`status`     = 'APPROVED');

-- 5. bill arithmetic (payments are posted by sp_process_fee_payment from here on)
-- The canonical formula is the one used by sp_process_fee_payment:
--   due = GREATEST(0, total - scholarship - discount - paid) + fine
-- (a fine increases what the student owes, it is not a concession).
UPDATE `student_fees` sf
   SET sf.`paid_amount` = (
         SELECT IFNULL(SUM(p.`amount`), 0) FROM `payments` p
         WHERE p.`student_fee_id` = sf.`student_fee_id` AND p.`status` = 'SUCCESS'),
       sf.`due_amount`  = GREATEST(0, sf.`total_amount` - sf.`scholarship_amount`
                                    - sf.`discount_amount`
                                    - (SELECT IFNULL(SUM(p.`amount`), 0) FROM `payments` p
                                       WHERE p.`student_fee_id` = sf.`student_fee_id`
                                         AND p.`status` = 'SUCCESS'))
                          + sf.`fine_amount`;

UPDATE `student_fees`
   SET `status` = CASE
        WHEN `due_amount` <= 0                       THEN 'PAID'
        WHEN `paid_amount` > 0                       THEN 'PARTIAL'
        WHEN `due_date` < CURDATE()                  THEN 'OVERDUE'
        ELSE 'PENDING' END,
       `paid_on` = CASE WHEN `due_amount` <= 0 AND `paid_on` IS NULL THEN CURDATE() ELSE `paid_on` END;

-- =====================================================================================
-- END OF 06_triggers.sql
-- =====================================================================================
