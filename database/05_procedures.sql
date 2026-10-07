-- =====================================================================================
-- FILE   : 05_procedures.sql
-- PURPOSE : Stored procedures implementing the transactional business workflows of the
--           ERP. The backend never re-implements these rules in JavaScript: it CALLs
--           them, so the rule cannot be bypassed by another client.
--
-- CONVENTIONS
--   * Every procedure runs inside an explicit transaction with a rollback handler.
--   * Parameters prefixed p_ are inputs, OUT parameters report the result.
--   * Business failures raise SIGNAL SQLSTATE '45000' with a readable MESSAGE_TEXT;
--     the backend maps that to HTTP 400/409.
--   * The three procedures demanded by the project brief are
--       sp_bulk_enroll_students      (G2 bulk enrollment)
--       sp_generate_monthly_payroll  (G7 monthly payroll calculation)
--       sp_process_fee_payment       (G5 fee payment + receipt generation)
-- =====================================================================================

-- The target database must already be selected, e.g.
--   mysql -u root -p university_erp < 05_procedures.sql
-- 01_schema.sql creates it. These files deliberately carry no hard-coded USE,
-- so the same scripts install cleanly under any database name (Docker, CI, clones).
SET NAMES utf8mb4;

DROP PROCEDURE IF EXISTS `sp_bulk_enroll_students`;
DROP PROCEDURE IF EXISTS `sp_mark_attendance_bulk`;
DROP PROCEDURE IF EXISTS `sp_register_student_for_exam`;
DROP PROCEDURE IF EXISTS `sp_enter_marks`;
DROP PROCEDURE IF EXISTS `sp_process_semester_results`;
DROP PROCEDURE IF EXISTS `sp_publish_exam_results`;
DROP PROCEDURE IF EXISTS `sp_generate_semester_fees`;
DROP PROCEDURE IF EXISTS `sp_process_fee_payment`;
DROP PROCEDURE IF EXISTS `sp_apply_late_fees`;
DROP PROCEDURE IF EXISTS `sp_allocate_hostel_bed`;
DROP PROCEDURE IF EXISTS `sp_vacate_hostel_bed`;
DROP PROCEDURE IF EXISTS `sp_transfer_room`;
DROP PROCEDURE IF EXISTS `sp_approve_admission`;
DROP PROCEDURE IF EXISTS `sp_generate_monthly_payroll`;
DROP PROCEDURE IF EXISTS `sp_approve_leave`;
DROP PROCEDURE IF EXISTS `sp_compute_student_risk`;
DROP PROCEDURE IF EXISTS `sp_push_notification`;

-- =====================================================================================
-- 0. sp_push_notification - single place where every module publishes a notification
-- =====================================================================================
DELIMITER $$
CREATE PROCEDURE `sp_push_notification`(
  IN  p_user_id    INT UNSIGNED,
  IN  p_title      VARCHAR(160),
  IN  p_message    VARCHAR(500),
  IN  p_type       VARCHAR(30),
  IN  p_severity   VARCHAR(10),
  IN  p_entity     VARCHAR(60),
  IN  p_entity_id  INT UNSIGNED,
  IN  p_link       VARCHAR(255)
)
BEGIN
  INSERT INTO `notifications`
    (`user_id`, `title`, `message`, `type`, `severity`, `entity`, `entity_id`, `link`)
  VALUES
    (p_user_id, p_title, p_message, p_type, p_severity, p_entity, p_entity_id, p_link);
END$$
DELIMITER ;

-- =====================================================================================
-- MODULE 2 - sp_bulk_enroll_students   (** required by the project brief **)
-- Enrolls every ACTIVE student of a program/semester into all of that semester's course
-- offerings. Duplicate enrollments are impossible thanks to
-- uq_enrollments_student_offering, so the procedure is safely re-runnable.
-- =====================================================================================
DELIMITER $$
CREATE PROCEDURE `sp_bulk_enroll_students`(
  IN  p_program_id  SMALLINT UNSIGNED,
  IN  p_semester_id SMALLINT UNSIGNED,
  IN  p_section_id  SMALLINT UNSIGNED,
  IN  p_enrolled_by INT UNSIGNED,
  OUT p_enrolled    INT,
  OUT p_skipped     INT,
  OUT p_message     VARCHAR(255)
)
BEGIN
  DECLARE v_capacity_violation INT DEFAULT 0;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    RESIGNAL;   -- keep the original error visible to the caller
  END;

  START TRANSACTION;

  -- How many (student, offering) pairs are still missing?
  SELECT COUNT(*) INTO p_skipped
  FROM `students` s
  JOIN `course_offerings` o
       ON  o.`program_id`  = p_program_id
       AND o.`semester_id` = p_semester_id
       AND (p_section_id IS NULL OR o.`section_id` = p_section_id)
  WHERE s.`program_id` = p_program_id
    AND s.`status`     = 'ACTIVE'
    AND EXISTS (SELECT 1 FROM `enrollments` e
                WHERE e.`student_id` = s.`student_id` AND e.`offering_id` = o.`offering_id`);

  -- Guard: refuse to over-fill an offering.
  SELECT COUNT(*) INTO v_capacity_violation
  FROM (
    SELECT o.`offering_id`, o.`capacity`,
           COUNT(e.`enrollment_id`) AS `already`
    FROM `course_offerings` o
    LEFT JOIN `enrollments` e ON e.`offering_id` = o.`offering_id`
    WHERE o.`program_id`  = p_program_id
      AND o.`semester_id` = p_semester_id
      AND (p_section_id IS NULL OR o.`section_id` = p_section_id)
    GROUP BY o.`offering_id`, o.`capacity`
    HAVING `already` >= o.`capacity`
  ) x;

  IF v_capacity_violation > 0 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'One or more course offerings have reached their capacity.';
  END IF;

  -- The pairs are staged in a temporary table first. MySQL error 1442 forbids a
  -- trigger from writing to `course_offerings` while the statement that fired it is
  -- still reading that table, so the INSERT below must not JOIN course_offerings.
  DROP TEMPORARY TABLE IF EXISTS `tmp_enroll_batch`;
  CREATE TEMPORARY TABLE `tmp_enroll_batch` (
    `student_id`  INT UNSIGNED NOT NULL,
    `offering_id` INT UNSIGNED NOT NULL,
    PRIMARY KEY (`student_id`, `offering_id`)
  ) ENGINE = Memory;

  INSERT INTO `tmp_enroll_batch` (`student_id`, `offering_id`)
  SELECT s.`student_id`, o.`offering_id`
  FROM `students` s
  JOIN `course_offerings` o
       ON  o.`program_id`  = p_program_id
       AND o.`semester_id` = p_semester_id
       AND (p_section_id IS NULL OR o.`section_id` = p_section_id)
  WHERE s.`program_id` = p_program_id
    AND s.`status`     = 'ACTIVE'
    AND NOT EXISTS (SELECT 1 FROM `enrollments` e
                    WHERE e.`student_id` = s.`student_id` AND e.`offering_id` = o.`offering_id`);

  INSERT INTO `enrollments` (`student_id`, `offering_id`, `enrolled_on`, `enrolled_by`, `status`)
  SELECT `student_id`, `offering_id`, CURDATE(), p_enrolled_by, 'ENROLLED'
  FROM `tmp_enroll_batch`;

  SET p_enrolled = ROW_COUNT();
  DROP TEMPORARY TABLE IF EXISTS `tmp_enroll_batch`;

  -- Keep the denormalised seat counter in sync.
  UPDATE `course_offerings` o
  SET o.`enrolled_count` = (SELECT COUNT(*) FROM `enrollments` e WHERE e.`offering_id` = o.`offering_id`)
  WHERE o.`program_id`  = p_program_id
    AND o.`semester_id` = p_semester_id
    AND (p_section_id IS NULL OR o.`section_id` = p_section_id);

  INSERT INTO `audit_logs` (`user_id`, `action`, `entity`, `entity_id`, `description`)
  VALUES (p_enrolled_by, 'CREATE', 'enrollments', NULL,
          CONCAT('Bulk enrollment: ', p_enrolled, ' new enrollments, ', p_skipped, ' already present'));

  SET p_message = CONCAT('Enrolled ', p_enrolled, ' student-subject combinations.');
  COMMIT;
END$$
DELIMITER ;

-- =====================================================================================
-- MODULE 3 - sp_mark_attendance_bulk
-- Marks a whole class in one call. Accepts a comma separated list of student ids and a
-- status; demonstrates string parsing, INSERT ... ON DUPLICATE KEY UPDATE and ROW_COUNT().
-- =====================================================================================
DELIMITER $$
CREATE PROCEDURE `sp_mark_attendance_bulk`(
  IN  p_session_id   INT UNSIGNED,
  IN  p_student_ids  TEXT,          -- e.g. '1,2,3,4'
  IN  p_status       VARCHAR(10),   -- PRESENT | ABSENT | LATE | EXCUSED
  IN  p_marked_by    INT UNSIGNED,
  OUT p_marked       INT,
  OUT p_message      VARCHAR(255)
)
BEGIN
  DECLARE v_offering_id INT UNSIGNED;
  DECLARE v_semester_id SMALLINT UNSIGNED;
  DECLARE v_list   TEXT;
  DECLARE v_token  VARCHAR(20);
  DECLARE v_pos    INT;
  DECLARE v_done   TINYINT DEFAULT 0;
  DECLARE v_count  INT DEFAULT 0;

  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    RESIGNAL;   -- keep the original error visible to the caller
  END;

  IF p_status NOT IN ('PRESENT', 'ABSENT', 'LATE', 'EXCUSED') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Invalid attendance status.';
  END IF;

  SELECT `offering_id`, `semester_id` INTO v_offering_id, v_semester_id
  FROM `class_sessions` WHERE `session_id` = p_session_id;

  IF v_offering_id IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Class session not found.';
  END IF;

  START TRANSACTION;

  SET v_list = CONCAT(p_student_ids, ',');
  WHILE LENGTH(v_list) > 0 AND v_done = 0 DO
    SET v_pos   = LOCATE(',', v_list);
    SET v_token = TRIM(SUBSTRING(v_list, 1, v_pos - 1));
    SET v_list  = SUBSTRING(v_list, v_pos + 1);
    IF v_token = '' THEN
      SET v_done = 1;
    ELSE
      INSERT INTO `attendance`
        (`session_id`, `student_id`, `offering_id`, `semester_id`, `status`, `marked_by`)
      VALUES
        (p_session_id, CAST(v_token AS UNSIGNED), v_offering_id, v_semester_id, p_status, p_marked_by)
      ON DUPLICATE KEY UPDATE
        `status` = p_status, `marked_by` = p_marked_by, `marked_at` = CURRENT_TIMESTAMP;
      SET v_count = v_count + 1;
    END IF;
  END WHILE;

  SET p_marked = v_count;

  INSERT INTO `audit_logs` (`user_id`, `action`, `entity`, `entity_id`, `description`)
  VALUES (p_marked_by, 'ATTENDANCE_UPDATE', 'attendance', p_session_id,
          CONCAT('Bulk attendance: ', v_count, ' students marked ', p_status));

  SET p_message = CONCAT(v_count, ' attendance records saved.');
  COMMIT;
END$$
DELIMITER ;

-- =====================================================================================
-- MODULE 4 - sp_register_student_for_exam
-- THE 75% RULE LIVES HERE. Even if a client bypasses the API, this procedure (and the
-- matching BEFORE INSERT trigger) refuses to register a student below the threshold
-- unless a documented exemption has been granted.
-- =====================================================================================
DELIMITER $$
CREATE PROCEDURE `sp_register_student_for_exam`(
  IN  p_exam_id       SMALLINT UNSIGNED,
  IN  p_student_id    INT UNSIGNED,
  IN  p_offering_id   INT UNSIGNED,
  IN  p_registered_by INT UNSIGNED,
  OUT p_registration_id INT UNSIGNED,
  OUT p_status        VARCHAR(20),
  OUT p_message       VARCHAR(500)
)
BEGIN
  DECLARE v_attendance    DECIMAL(5,2);
  DECLARE v_threshold     DECIMAL(5,2);
  DECLARE v_semester_id   SMALLINT UNSIGNED;
  DECLARE v_exam_status   VARCHAR(20);
  DECLARE v_existing      INT DEFAULT 0;
  DECLARE v_dues          DECIMAL(12,2);
  DECLARE v_hall_ticket   VARCHAR(30);

  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    RESIGNAL;   -- keep the original error visible to the caller
  END;

  SELECT `semester_id`, `status`, `min_attendance_required`
  INTO v_semester_id, v_exam_status, v_threshold
  FROM `exams` WHERE `exam_id` = p_exam_id;

  IF v_semester_id IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Examination not found.';
  END IF;
  IF v_exam_status NOT IN ('DRAFT', 'SCHEDULED', 'REGISTRATION_OPEN', 'ONGOING') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Registration is closed for this examination.';
  END IF;

  SELECT COUNT(*) INTO v_existing
  FROM `exam_registrations`
  WHERE `exam_id` = p_exam_id AND `student_id` = p_student_id AND `offering_id` = p_offering_id;

  IF v_existing > 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Already registered for this subject.';
  END IF;

  START TRANSACTION;

  SET v_attendance = fn_calculate_attendance_percentage(p_student_id, p_offering_id);
  SET v_dues       = fn_student_outstanding_dues(p_student_id);

  IF v_attendance < v_threshold THEN
    SET p_registration_id = NULL;
    SET p_status  = 'REJECTED';
    SET p_message = CONCAT('Not eligible: attendance ', v_attendance,
                           '% is below the required ', v_threshold,
                           '%. Contact the examination cell for a condonation.');
    ROLLBACK;
  ELSE
    SET v_hall_ticket = CONCAT('HT-', LPAD(p_exam_id, 2, '0'), '-',
                               LPAD(p_student_id, 4, '0'), '-',
                               LPAD(p_offering_id, 4, '0'));

    INSERT INTO `exam_registrations`
      (`exam_id`, `student_id`, `offering_id`, `registered_by`, `attendance_percentage`,
       `is_eligible`, `eligibility_reason`, `hall_ticket_no`, `hall_ticket_issued_at`, `status`)
    VALUES
      (p_exam_id, p_student_id, p_offering_id, p_registered_by, v_attendance, 1,
       CONCAT('Eligible: attendance ', v_attendance, '%'), v_hall_ticket, NOW(), 'REGISTERED');

    SET p_registration_id = LAST_INSERT_ID();
    SET p_status  = 'REGISTERED';
    SET p_message = CONCAT('Registered successfully. Hall ticket ', v_hall_ticket, '.');

    INSERT INTO `audit_logs` (`user_id`, `action`, `entity`, `entity_id`, `description`)
    VALUES (p_registered_by, 'EXAM_REGISTRATION', 'exam_registrations', p_registration_id, p_message);

    CALL sp_push_notification(
      (SELECT `user_id` FROM `students` WHERE `student_id` = p_student_id),
      'Exam registration confirmed',
      CONCAT('You are registered. Hall ticket ', v_hall_ticket, '.'),
      'EXAM_REGISTRATION', 'SUCCESS', 'exam', p_exam_id, '/student/exams');

    COMMIT;
  END IF;
END$$
DELIMITER ;

-- =====================================================================================
-- MODULE 4 - sp_enter_marks   (faculty marks entry, grade derived in SQL)
-- =====================================================================================
DELIMITER $$
CREATE PROCEDURE `sp_enter_marks`(
  IN  p_registration_id INT UNSIGNED,
  IN  p_marks_obtained  DECIMAL(6,2),
  IN  p_is_absent       TINYINT,
  IN  p_entered_by      INT UNSIGNED,
  OUT p_grade           VARCHAR(4),
  OUT p_grade_points    DECIMAL(4,2),
  OUT p_message         VARCHAR(255)
)
BEGIN
  DECLARE v_max        SMALLINT UNSIGNED;
  DECLARE v_pct        DECIMAL(5,2);
  DECLARE v_status_old VARCHAR(20);

  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    RESIGNAL;   -- keep the original error visible to the caller
  END;

  SELECT es.`max_marks`
  INTO v_max
  FROM `exam_registrations` er
  LEFT JOIN `exam_schedules` es
         ON es.`exam_id` = er.`exam_id`
        AND es.`subject_id` = (SELECT `subject_id` FROM `course_offerings`
                               WHERE `offering_id` = er.`offering_id`)
  WHERE er.`registration_id` = p_registration_id;

  IF v_max IS NULL THEN
    SELECT e.`max_marks` INTO v_max
    FROM `exam_registrations` er
    JOIN `exams` x ON x.`exam_id` = er.`exam_id`
    LEFT JOIN `exam_schedules` e ON e.`exam_id` = x.`exam_id`
    WHERE er.`registration_id` = p_registration_id LIMIT 1;
  END IF;
  IF v_max IS NULL THEN
    SET v_max = 100;
  END IF;

  IF p_is_absent = 0 AND (p_marks_obtained < 0 OR p_marks_obtained > v_max) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Marks are outside the permitted range for this paper.';
  END IF;

  START TRANSACTION;

  IF p_is_absent = 1 THEN
    SET v_pct = 0.00;
    SET p_grade = 'FF';
    SET p_grade_points = 0.00;
  ELSE
    SET v_pct = ROUND(p_marks_obtained * 100.0 / v_max, 2);
    SET p_grade = fn_grade_code(v_pct);
    SET p_grade_points = fn_grade_points(v_pct);
  END IF;

  INSERT INTO `marks`
    (`registration_id`, `marks_obtained`, `max_marks`, `percentage`, `grade`,
     `grade_points`, `is_absent`, `is_pass`, `entered_by`)
  VALUES
    (p_registration_id, IF(p_is_absent = 1, 0.00, p_marks_obtained), v_max, v_pct,
     p_grade, p_grade_points, p_is_absent, IF(p_is_absent = 1, 0, v_pct >= 40), p_entered_by)
  ON DUPLICATE KEY UPDATE
    `marks_obtained` = IF(p_is_absent = 1, 0.00, p_marks_obtained),
    `percentage`     = v_pct,
    `grade`          = p_grade,
    `grade_points`   = p_grade_points,
    `is_absent`      = p_is_absent,
    `is_pass`        = IF(p_is_absent = 1, 0, v_pct >= 40),
    `entered_by`     = p_entered_by;

  UPDATE `exam_registrations` SET `status` = 'APPEARED' WHERE `registration_id` = p_registration_id;

  INSERT INTO `audit_logs` (`user_id`, `action`, `entity`, `entity_id`, `description`)
  VALUES (p_entered_by, 'MARKS_UPDATE', 'marks', p_registration_id,
          CONCAT('Marks entered: ', IF(p_is_absent = 1, 'ABSENT', p_marks_obtained),
                 ' -> grade ', p_grade));

  SET p_message = CONCAT('Saved. Grade ', p_grade, ' (', p_grade_points, ' points).');
  COMMIT;
END$$
DELIMITER ;

-- =====================================================================================
-- MODULE 4 - sp_process_semester_results
-- Computes SGPA / CGPA / credits / backlogs for every student of a semester using a
-- cursor, then writes (or refreshes) the `results` rows.
-- =====================================================================================
DELIMITER $$
CREATE PROCEDURE `sp_process_semester_results`(
  IN  p_semester_id   SMALLINT UNSIGNED,
  IN  p_exam_id       SMALLINT UNSIGNED,
  IN  p_published_by  INT UNSIGNED,
  OUT p_processed     INT,
  OUT p_message       VARCHAR(255)
)
BEGIN
  DECLARE v_student   INT UNSIGNED;
  DECLARE v_sgpa      DECIMAL(4,2);
  DECLARE v_cgpa      DECIMAL(4,2);
  DECLARE v_credits   SMALLINT UNSIGNED;
  DECLARE v_earned    SMALLINT UNSIGNED;
  DECLARE v_backlogs  TINYINT UNSIGNED;
  DECLARE v_done      TINYINT DEFAULT 0;
  DECLARE v_count     INT DEFAULT 0;

  DECLARE cur CURSOR FOR
    SELECT er.`student_id`,
           ROUND(SUM(s.`credits` * m.`grade_points`) / NULLIF(SUM(s.`credits`), 0), 2),
           SUM(s.`credits`),
           SUM(CASE WHEN m.`grade_points` > 0 THEN s.`credits` ELSE 0 END),
           SUM(CASE WHEN m.`grade_points` = 0 THEN 1 ELSE 0 END)
    FROM `marks` m
    JOIN `exam_registrations` er ON er.`registration_id` = m.`registration_id`
    JOIN `course_offerings`   co ON co.`offering_id`     = er.`offering_id`
    JOIN `subjects`           s  ON s.`subject_id`       = co.`subject_id`
    WHERE er.`exam_id` = p_exam_id
      AND co.`semester_id` = p_semester_id
    GROUP BY er.`student_id`;

  DECLARE CONTINUE HANDLER FOR NOT FOUND SET v_done = 1;

  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    RESIGNAL;   -- keep the original error visible to the caller
  END;

  START TRANSACTION;
  OPEN cur;
  read_loop: LOOP
    FETCH cur INTO v_student, v_sgpa, v_credits, v_earned, v_backlogs;
    IF v_done = 1 THEN LEAVE read_loop; END IF;

    INSERT INTO `results`
      (`student_id`, `semester_id`, `exam_id`, `sgpa`, `cgpa`, `total_credits`,
       `earned_credits`, `backlog_count`, `result_status`, `published_on`, `published_by`)
    VALUES
      (v_student, p_semester_id, p_exam_id, v_sgpa, 0.00, v_credits, v_earned, v_backlogs,
       CASE WHEN v_backlogs = 0 THEN 'PASS'
            WHEN v_backlogs <= 3 THEN 'PROMOTED'
            ELSE 'FAIL' END,
       NOW(), p_published_by)
    ON DUPLICATE KEY UPDATE
      `exam_id` = p_exam_id,
      `sgpa`    = v_sgpa,
      `total_credits` = v_credits,
      `earned_credits` = v_earned,
      `backlog_count`  = v_backlogs,
      `result_status` = CASE WHEN v_backlogs = 0 THEN 'PASS'
                             WHEN v_backlogs <= 3 THEN 'PROMOTED'
                             ELSE 'FAIL' END,
      `published_on` = NOW(),
      `published_by` = p_published_by;

    SET v_count = v_count + 1;
  END LOOP;
  CLOSE cur;

  -- CGPA is the credit weighted average of every published semester result.
  UPDATE `results` r
  JOIN (
    SELECT r2.`student_id`,
           ROUND(SUM(r2.`sgpa` * r2.`total_credits`) / NULLIF(SUM(r2.`total_credits`), 0), 2) AS cgpa
    FROM `results` r2
    GROUP BY r2.`student_id`
  ) c ON c.`student_id` = r.`student_id`
  SET r.`cgpa` = c.cgpa
  WHERE r.`semester_id` = p_semester_id;

  UPDATE `enrollments` e
  JOIN `course_offerings` co ON co.`offering_id` = e.`offering_id`
  JOIN `exam_registrations` er ON er.`offering_id` = e.`offering_id` AND er.`student_id` = e.`student_id`
  JOIN `marks` m ON m.`registration_id` = er.`registration_id`
  SET e.`grade` = m.`grade`, e.`grade_points` = m.`grade_points`,
      e.`status` = IF(m.`grade_points` > 0, 'PASSED', 'FAILED')
  WHERE co.`semester_id` = p_semester_id AND er.`exam_id` = p_exam_id;

  SET p_processed = v_count;

  INSERT INTO `audit_logs` (`user_id`, `action`, `entity`, `entity_id`, `description`)
  VALUES (p_published_by, 'RESULT_PUBLISHED', 'results', p_semester_id,
          CONCAT('Result processed for ', v_count, ' students'));

  SET p_message = CONCAT('Processed ', v_count, ' student results.');
  COMMIT;
END$$
DELIMITER ;

-- =====================================================================================
-- MODULE 4 - sp_publish_exam_results  (flips the exam to PUBLISHED + notifies students)
-- =====================================================================================
DELIMITER $$
CREATE PROCEDURE `sp_publish_exam_results`(
  IN  p_exam_id      SMALLINT UNSIGNED,
  IN  p_published_by INT UNSIGNED,
  OUT p_notified     INT,
  OUT p_message      VARCHAR(255)
)
BEGIN
  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    RESIGNAL;   -- keep the original error visible to the caller
  END;

  START TRANSACTION;

  UPDATE `exams`
  SET `result_published` = 1, `published_on` = NOW(), `status` = 'PUBLISHED'
  WHERE `exam_id` = p_exam_id;

  UPDATE `semesters` s
  JOIN `exams` e ON e.`semester_id` = s.`semester_id`
  SET s.`result_published` = 1
  WHERE e.`exam_id` = p_exam_id;

  INSERT INTO `notifications` (`user_id`, `title`, `message`, `type`, `severity`, `entity`, `entity_id`, `link`)
  SELECT st.`user_id`, 'Result published',
         CONCAT('Your result for ', e.`name`, ' has been published.'),
         'RESULT_PUBLISHED', 'SUCCESS', 'exam', p_exam_id, '/student/results'
  FROM `exam_registrations` er
  JOIN `students` st ON st.`student_id` = er.`student_id`
  JOIN `exams` e     ON e.`exam_id`     = er.`exam_id`
  WHERE er.`exam_id` = p_exam_id
  GROUP BY st.`user_id`, e.`name`;

  SET p_notified = ROW_COUNT();

  INSERT INTO `audit_logs` (`user_id`, `action`, `entity`, `entity_id`, `description`)
  VALUES (p_published_by, 'RESULT_PUBLISHED', 'exams', p_exam_id,
          CONCAT('Results published, ', p_notified, ' students notified'));

  SET p_message = CONCAT('Results published. ', p_notified, ' students notified.');
  COMMIT;
END$$
DELIMITER ;

-- =====================================================================================
-- MODULE 5 - sp_generate_semester_fees
-- Raises one fee bill per active student of a program for a semester.
-- =====================================================================================
DELIMITER $$
CREATE PROCEDURE `sp_generate_semester_fees`(
  IN  p_program_id   SMALLINT UNSIGNED,
  IN  p_semester_id  SMALLINT UNSIGNED,
  IN  p_semester_no  TINYINT UNSIGNED,
  IN  p_academic_year_id SMALLINT UNSIGNED,
  IN  p_due_date     DATE,
  OUT p_generated    INT,
  OUT p_message      VARCHAR(255)
)
BEGIN
  DECLARE v_structure SMALLINT UNSIGNED;
  DECLARE v_total     DECIMAL(10,2);

  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    RESIGNAL;   -- keep the original error visible to the caller
  END;

  SELECT `fee_structure_id`,
         (`tuition_fee` + `hostel_fee` + `exam_fee` + `library_fee` + `lab_fee`
          + `development_fee` + `other_fee`)
  INTO v_structure, v_total
  FROM `fee_structures`
  WHERE `program_id` = p_program_id
    AND `semester_no` = p_semester_no
    AND `academic_year_id` = p_academic_year_id
    AND `category_id` IS NULL
  LIMIT 1;

  IF v_structure IS NULL THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'No fee structure defined for this program / semester / year.';
  END IF;

  START TRANSACTION;

  INSERT INTO `student_fees`
    (`student_id`, `fee_structure_id`, `semester_id`, `academic_year_id`,
     `total_amount`, `due_amount`, `status`, `due_date`)
  SELECT s.`student_id`, v_structure, p_semester_id, p_academic_year_id, v_total, v_total,
         'PENDING', p_due_date
  FROM `students` s
  WHERE s.`program_id` = p_program_id
    AND s.`status` = 'ACTIVE'
    AND NOT EXISTS (SELECT 1 FROM `student_fees` sf
                    WHERE sf.`student_id` = s.`student_id`
                      AND sf.`semester_id` = p_semester_id);

  SET p_generated = ROW_COUNT();

  -- Credit any sanctioned scholarship against the fresh bills.
  UPDATE `student_fees` sf
  JOIN `student_scholarships` ss
    ON ss.`student_id` = sf.`student_id` AND ss.`academic_year_id` = sf.`academic_year_id`
  SET sf.`scholarship_amount` = ss.`amount`,
      sf.`due_amount` = GREATEST(0, sf.`total_amount` - ss.`amount`)
  WHERE sf.`semester_id` = p_semester_id
    AND sf.`scholarship_amount` = 0;

  SET p_message = CONCAT(p_generated, ' fee bills generated.');
  COMMIT;
END$$
DELIMITER ;

-- =====================================================================================
-- MODULE 5 - sp_process_fee_payment   (** required by the project brief **)
-- Records a payment, generates the receipt number, posts the ledger entry, recomputes
-- the bill status and notifies the student. Fully transactional.
-- =====================================================================================
DELIMITER $$
CREATE PROCEDURE `sp_process_fee_payment`(
  IN  p_student_fee_id INT UNSIGNED,
  IN  p_amount         DECIMAL(10,2),
  IN  p_payment_mode   VARCHAR(20),
  IN  p_reference_no   VARCHAR(60),
  IN  p_received_by    INT UNSIGNED,
  OUT p_payment_id     INT UNSIGNED,
  OUT p_receipt_no     VARCHAR(30),
  OUT p_message        VARCHAR(255)
)
BEGIN
  DECLARE v_student   INT UNSIGNED;
  DECLARE v_due       DECIMAL(10,2);
  DECLARE v_total     DECIMAL(10,2);
  DECLARE v_paid      DECIMAL(10,2);
  DECLARE v_txn       VARCHAR(60);
  DECLARE v_receipt   VARCHAR(30);
  DECLARE v_dup       INT DEFAULT 0;

  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    RESIGNAL;   -- keep the original error visible to the caller
  END;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Payment amount must be greater than zero.';
  END IF;

  SELECT `student_id`, `due_amount`, `total_amount`, `paid_amount`
  INTO v_student, v_due, v_total, v_paid
  FROM `student_fees`
  WHERE `student_fee_id` = p_student_fee_id;

  IF v_student IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Fee bill not found.';
  END IF;
  IF p_amount > v_due + 0.01 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Payment exceeds the outstanding amount on this bill.';
  END IF;
  IF p_reference_no IS NOT NULL THEN
    SELECT COUNT(*) INTO v_dup FROM `payments` WHERE `transaction_id` = p_reference_no;
    IF v_dup > 0 THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Duplicate transaction reference.';
    END IF;
  END IF;

  START TRANSACTION;

  SET v_txn = CONCAT('TXN', DATE_FORMAT(NOW(), '%Y%m%d%H%i%s'), LPAD(FLOOR(RAND() * 100000), 5, '0'));
  IF p_reference_no IS NOT NULL AND p_reference_no <> '' THEN
    SET v_txn = p_reference_no;
  END IF;

  SET v_receipt = CONCAT('RCP-', DATE_FORMAT(NOW(), '%Y'), '-',
                         LPAD((SELECT IFNULL(MAX(`payment_id`), 0) + 1 FROM `payments`), 6, '0'));

  INSERT INTO `payments`
    (`receipt_no`, `transaction_id`, `student_fee_id`, `student_id`, `amount`,
     `payment_mode`, `payment_date`, `status`, `reference_no`, `received_by`)
  VALUES
    (v_receipt, v_txn, p_student_fee_id, v_student, p_amount, p_payment_mode,
     NOW(), 'SUCCESS', p_reference_no, p_received_by);

  SET p_payment_id = LAST_INSERT_ID();
  SET p_receipt_no = CONCAT('RCP-', DATE_FORMAT(NOW(), '%Y'), '-', LPAD(p_payment_id, 6, '0'));
  UPDATE `payments` SET `receipt_no` = p_receipt_no WHERE `payment_id` = p_payment_id;

  -- The AFTER INSERT trigger trg_payment_after_insert keeps student_fees in sync and
  -- writes the ledger row; the UPDATE below only normalises the status value.
  UPDATE `student_fees`
  SET `status` = CASE
                   WHEN `due_amount` <= 0 THEN 'PAID'
                   WHEN `paid_amount` > 0 THEN 'PARTIAL'
                   ELSE `status`
                 END,
      `paid_on` = CASE WHEN `due_amount` <= 0 THEN NOW() ELSE `paid_on` END
  WHERE `student_fee_id` = p_student_fee_id;

  INSERT INTO `audit_logs` (`user_id`, `action`, `entity`, `entity_id`, `description`)
  VALUES (p_received_by, 'PAYMENT', 'payments', p_payment_id,
          CONCAT('Receipt ', p_receipt_no, ' for INR ', p_amount, ' via ', p_payment_mode));

  CALL sp_push_notification(
    (SELECT `user_id` FROM `students` WHERE `student_id` = v_student),
    'Payment received',
    CONCAT('We received INR ', FORMAT(p_amount, 2), '. Receipt no. ', p_receipt_no, '.'),
    'FEE_DUE', 'SUCCESS', 'payment', p_payment_id, '/student/fees');

  SET p_message = CONCAT('Payment recorded. Receipt ', p_receipt_no, '.');
  COMMIT;
END$$
DELIMITER ;

-- =====================================================================================
-- MODULE 5 - sp_apply_late_fees  (uses fn_calculate_late_fee)
-- =====================================================================================
DELIMITER $$
CREATE PROCEDURE `sp_apply_late_fees`(OUT p_updated INT, OUT p_message VARCHAR(255))
BEGIN
  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    RESIGNAL;   -- keep the original error visible to the caller
  END;

  START TRANSACTION;

  UPDATE `student_fees` sf
  JOIN `fee_structures` fs ON fs.`fee_structure_id` = sf.`fee_structure_id`
  SET sf.`fine_amount` = fn_calculate_late_fee(sf.`student_fee_id`),
      sf.`due_amount`  = GREATEST(0, sf.`total_amount` - sf.`scholarship_amount`
                                     - sf.`discount_amount` - sf.`paid_amount`)
                         + fn_calculate_late_fee(sf.`student_fee_id`),
      sf.`status`      = 'OVERDUE'
  WHERE sf.`status` IN ('PENDING', 'PARTIAL', 'OVERDUE')
    AND sf.`due_amount` > 0
    AND CURDATE() > DATE_ADD(sf.`due_date`, INTERVAL fs.`grace_days` DAY);

  SET p_updated = ROW_COUNT();
  SET p_message = CONCAT('Late fees applied to ', p_updated, ' bills.');
  COMMIT;
END$$
DELIMITER ;

-- =====================================================================================
-- MODULE 6 - sp_allocate_hostel_bed
-- Allocates a bed to an approved hostel application. The AFTER INSERT trigger on
-- room_allocations flips the bed to OCCUPIED and bumps the room / hostel counters.
-- =====================================================================================
DELIMITER $$
CREATE PROCEDURE `sp_allocate_hostel_bed`(
  IN  p_application_id INT UNSIGNED,
  IN  p_bed_id         INT UNSIGNED,
  IN  p_allocated_by   INT UNSIGNED,
  OUT p_allocation_id  INT UNSIGNED,
  OUT p_message        VARCHAR(255)
)
BEGIN
  DECLARE v_student   INT UNSIGNED;
  DECLARE v_hostel    SMALLINT UNSIGNED;
  DECLARE v_room      INT UNSIGNED;
  DECLARE v_year      SMALLINT UNSIGNED;
  DECLARE v_bed_state VARCHAR(20);
  DECLARE v_active    INT DEFAULT 0;
  DECLARE v_rent      DECIMAL(10,2);
  DECLARE v_app_state VARCHAR(20);

  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    RESIGNAL;   -- keep the original error visible to the caller
  END;

  SELECT `student_id`, `hostel_id`, `academic_year_id`, `status`
  INTO v_student, v_hostel, v_year, v_app_state
  FROM `hostel_applications` WHERE `application_id` = p_application_id;

  IF v_student IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Hostel application not found.';
  END IF;
  IF v_app_state NOT IN ('APPLIED', 'WAITLISTED', 'APPROVED') THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'This application is no longer active.';
  END IF;

  SELECT `status`, `room_id` INTO v_bed_state, v_room
  FROM `beds` WHERE `bed_id` = p_bed_id;

  IF v_bed_state IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Bed not found.';
  END IF;
  IF v_bed_state <> 'AVAILABLE' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'That bed is not available.';
  END IF;

  SELECT COUNT(*) INTO v_active
  FROM `room_allocations`
  WHERE `student_id` = v_student AND `status` = 'ACTIVE';

  IF v_active > 0 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'This student already has an active bed allocation.';
  END IF;

  SELECT `rent_per_bed` INTO v_rent FROM `rooms` WHERE `room_id` = v_room;

  START TRANSACTION;

  INSERT INTO `room_allocations`
    (`student_id`, `bed_id`, `room_id`, `hostel_id`, `academic_year_id`,
     `allocated_on`, `allocated_by`, `rent_amount`, `status`)
  VALUES
    (v_student, p_bed_id, v_room, v_hostel, v_year, CURDATE(), p_allocated_by,
     v_rent, 'ACTIVE');

  SET p_allocation_id = LAST_INSERT_ID();

  INSERT INTO `hostel_fees`
    (`allocation_id`, `student_id`, `academic_year_id`, `amount`, `due_date`, `status`)
  VALUES
    (p_allocation_id, v_student, v_year, v_rent * 6,
     DATE_ADD(CURDATE(), INTERVAL 30 DAY), 'PENDING');

  UPDATE `hostel_applications`
  SET `status` = 'APPROVED', `reviewed_by` = p_allocated_by, `reviewed_on` = NOW()
  WHERE `application_id` = p_application_id;

  INSERT INTO `audit_logs` (`user_id`, `action`, `entity`, `entity_id`, `description`)
  VALUES (p_allocated_by, 'HOSTEL_ALLOCATION', 'room_allocations', p_allocation_id,
          CONCAT('Bed ', p_bed_id, ' allocated to student ', v_student));

  CALL sp_push_notification(
    (SELECT `user_id` FROM `students` WHERE `student_id` = v_student),
    'Hostel bed allocated',
    CONCAT('Bed ', p_bed_id, ' in room ', v_room, ' has been allocated to you.'),
    'HOSTEL_ALLOCATION', 'SUCCESS', 'room_allocations', p_allocation_id, '/student/hostel');

  SET p_message = CONCAT('Bed allocated (allocation #', p_allocation_id, ').');
  COMMIT;
END$$
DELIMITER ;

-- =====================================================================================
-- MODULE 6 - sp_vacate_hostel_bed
-- =====================================================================================
DELIMITER $$
CREATE PROCEDURE `sp_vacate_hostel_bed`(
  IN  p_allocation_id INT UNSIGNED,
  IN  p_done_by       INT UNSIGNED,
  IN  p_reason        VARCHAR(255),
  OUT p_message       VARCHAR(255)
)
BEGIN
  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    RESIGNAL;   -- keep the original error visible to the caller
  END;

  START TRANSACTION;

  UPDATE `room_allocations`
  SET `status` = 'VACATED', `vacated_on` = CURDATE(), `remarks` = p_reason
  WHERE `allocation_id` = p_allocation_id AND `status` = 'ACTIVE';

  IF ROW_COUNT() = 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'No active allocation with that id.';
  END IF;

  INSERT INTO `audit_logs` (`user_id`, `action`, `entity`, `entity_id`, `description`)
  VALUES (p_done_by, 'HOSTEL_ALLOCATION', 'room_allocations', p_allocation_id,
          CONCAT('Allocation vacated: ', IFNULL(p_reason, '')));

  SET p_message = 'Allocation vacated and the bed is available again.';
  COMMIT;
END$$
DELIMITER ;

-- =====================================================================================
-- MODULE 6 - sp_transfer_room
-- =====================================================================================
DELIMITER $$
CREATE PROCEDURE `sp_transfer_room`(
  IN  p_allocation_id INT UNSIGNED,
  IN  p_to_bed_id     INT UNSIGNED,
  IN  p_reason        VARCHAR(255),
  IN  p_approved_by   INT UNSIGNED,
  OUT p_message       VARCHAR(255)
)
BEGIN
  DECLARE v_student INT UNSIGNED;
  DECLARE v_from    INT UNSIGNED;
  DECLARE v_state   VARCHAR(20);
  DECLARE v_room    INT UNSIGNED;
  DECLARE v_hostel  SMALLINT UNSIGNED;

  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    RESIGNAL;   -- keep the original error visible to the caller
  END;

  SELECT `student_id`, `bed_id`, `hostel_id`
  INTO v_student, v_from, v_hostel
  FROM `room_allocations` WHERE `allocation_id` = p_allocation_id;

  IF v_student IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Allocation not found.';
  END IF;
  IF v_from = p_to_bed_id THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Student already occupies that bed.';
  END IF;

  SELECT `status`, `room_id` INTO v_state, v_room
  FROM `beds` WHERE `bed_id` = p_to_bed_id;

  IF v_state IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Target bed not found.';
  END IF;
  IF v_state <> 'AVAILABLE' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Target bed is not available.';
  END IF;

  START TRANSACTION;

  UPDATE `room_allocations`
  SET `bed_id` = p_to_bed_id, `room_id` = v_room
  WHERE `allocation_id` = p_allocation_id;

  INSERT INTO `room_transfers`
    (`student_id`, `from_bed_id`, `to_bed_id`, `reason`, `transferred_on`, `approved_by`)
  VALUES (v_student, v_from, p_to_bed_id, p_reason, NOW(), p_approved_by);

  INSERT INTO `audit_logs` (`user_id`, `action`, `entity`, `entity_id`, `description`)
  VALUES (p_approved_by, 'HOSTEL_ALLOCATION', 'room_transfers', p_allocation_id,
          CONCAT('Room transfer: bed ', v_from, ' -> ', p_to_bed_id));

  CALL sp_push_notification(
    (SELECT `user_id` FROM `students` WHERE `student_id` = v_student),
    'Room transfer approved',
    CONCAT('You have been moved to bed ', p_to_bed_id, '.'),
    'HOSTEL_ALLOCATION', 'INFO', 'room_transfers', p_allocation_id, '/student/hostel');

  SET p_message = 'Room transfer completed.';
  COMMIT;
END$$
DELIMITER ;

-- =====================================================================================
-- MODULE 1 - sp_approve_admission
-- Turns an approved admission application into a real student: creates the login,
-- the roll number, the student row and the notification. Fully transactional.
-- =====================================================================================
DELIMITER $$
CREATE PROCEDURE `sp_approve_admission`(
  IN  p_admission_id INT UNSIGNED,
  IN  p_reviewed_by  INT UNSIGNED,
  IN  p_approve      TINYINT,
  IN  p_remarks      VARCHAR(500),
  OUT p_student_id   INT UNSIGNED,
  OUT p_message      VARCHAR(255)
)
BEGIN
  DECLARE v_app      VARCHAR(30);
  DECLARE v_first    VARCHAR(80);
  DECLARE v_last     VARCHAR(80);
  DECLARE v_email    VARCHAR(150);
  DECLARE v_phone    VARCHAR(20);
  DECLARE v_dob      DATE;
  DECLARE v_gender   VARCHAR(10);
  DECLARE v_prog     SMALLINT UNSIGNED;
  DECLARE v_cat      TINYINT UNSIGNED;
  DECLARE v_year     SMALLINT UNSIGNED;
  DECLARE v_guardian VARCHAR(120);
  DECLARE v_gphone   VARCHAR(20);
  DECLARE v_dept     INT UNSIGNED;
  DECLARE v_batch    SMALLINT UNSIGNED;
  DECLARE v_role     TINYINT UNSIGNED;
  DECLARE v_user     INT UNSIGNED;
  DECLARE v_roll     VARCHAR(20);
  DECLARE v_regno    VARCHAR(30);
  DECLARE v_seq      INT;

  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    RESIGNAL;   -- keep the original error visible to the caller
  END;

  SELECT `application_no`, `first_name`, `last_name`, `email`, `phone`, `date_of_birth`,
         `gender`, `program_id`, `category_id`, `academic_year_id`, `guardian_name`,
         `guardian_phone`, `student_id`
  INTO v_app, v_first, v_last, v_email, v_phone, v_dob, v_gender, v_prog, v_cat,
       v_year, v_guardian, v_gphone, p_student_id
  FROM `admissions` WHERE `admission_id` = p_admission_id;

  IF v_app IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Admission application not found.';
  END IF;

  START TRANSACTION;

  IF p_approve = 0 THEN
    UPDATE `admissions`
    SET `status` = 'REJECTED', `reviewed_by` = p_reviewed_by,
        `reviewed_at` = NOW(), `remarks` = p_remarks
    WHERE `admission_id` = p_admission_id;
    SET p_message = 'Application rejected.';
    COMMIT;
  ELSE
    IF p_student_id IS NOT NULL THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'This application has already been converted into a student.';
    END IF;

    SELECT `department_id` INTO v_dept FROM `programs` WHERE `program_id` = v_prog;

    SELECT `batch_id` INTO v_batch
    FROM `batches`
    WHERE `program_id` = v_prog AND `academic_year_id` = v_year
    ORDER BY `batch_id` ASC LIMIT 1;

    IF v_batch IS NULL THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'No batch exists for this program and academic year.';
    END IF;

    SELECT `role_id` INTO v_role FROM `roles` WHERE `role_code` = 'STUDENT';

    IF EXISTS (SELECT 1 FROM `users` WHERE `email` = v_email) THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'A user with this email already exists.';
    END IF;

    INSERT INTO `users` (`role_id`, `email`, `password_hash`, `phone`, `is_active`)
    VALUES (v_role, v_email, '$2a$10$V9GrLRpIK0clF/GvaN7zJeS7.aAEsXui/m.KlGy2vrFYPzANVMjZC',
            v_phone, 1);
    SET v_user = LAST_INSERT_ID();

    SELECT IFNULL(MAX(CAST(SUBSTRING(`roll_number`, -4) AS UNSIGNED)), 1000) + 1
    INTO v_seq
    FROM `students` WHERE `admission_year` = 2026;

    SET v_roll = CONCAT('2026',
                        REPLACE(REPLACE((SELECT `program_code` FROM `programs`
                                         WHERE `program_id` = v_prog), 'BTECH-', ''), 'MTECH-', 'M'),
                        LPAD(v_seq, 4, '0'));
    SET v_regno = CONCAT('VPIT/2026/', v_roll);

    INSERT INTO `students`
      (`user_id`, `roll_number`, `registration_number`, `first_name`, `last_name`, `email`,
       `phone`, `date_of_birth`, `gender`, `category_id`, `department_id`, `program_id`,
       `batch_id`, `admission_year`, `admission_date`, `current_semester_no`, `status`)
    VALUES
      (v_user, v_roll, v_regno, v_first, v_last, v_email, v_phone, v_dob, v_gender,
       v_cat, v_dept, v_prog, v_batch, 2026, CURDATE(), 1, 'ACTIVE');

    SET p_student_id = LAST_INSERT_ID();

    INSERT INTO `guardians` (`student_id`, `name`, `relation`, `phone`, `is_primary`)
    VALUES (p_student_id, v_guardian, 'FATHER', v_gphone, 1);

    UPDATE `admissions`
    SET `status` = 'APPROVED', `student_id` = p_student_id, `reviewed_by` = p_reviewed_by,
        `reviewed_at` = NOW(), `remarks` = IFNULL(p_remarks, 'Approved')
    WHERE `admission_id` = p_admission_id;

    INSERT INTO `audit_logs` (`user_id`, `action`, `entity`, `entity_id`, `description`)
    VALUES (p_reviewed_by, 'APPROVE', 'admissions', p_admission_id,
            CONCAT('Admission approved - student ', v_roll, ' created'));

    CALL sp_push_notification(v_user, 'Admission approved',
      CONCAT('Congratulations! You are admitted. Your roll number is ', v_roll, '.'),
      'ADMISSION', 'SUCCESS', 'student', p_student_id, '/student/profile');

    SET p_message = CONCAT('Admission approved. Student ', v_roll, ' created.');
    COMMIT;
  END IF;
END$$
DELIMITER ;

-- =====================================================================================
-- MODULE 7 - sp_generate_monthly_payroll   (** required by the project brief **)
-- Builds the payslip for every ACTIVE faculty member for a month, using
-- fn_calculate_net_salary() and the approved UNPAID leave (loss of pay) days.
-- =====================================================================================
DELIMITER $$
CREATE PROCEDURE `sp_generate_monthly_payroll`(
  IN  p_pay_month   TINYINT UNSIGNED,
  IN  p_pay_year    SMALLINT UNSIGNED,
  IN  p_generated_by INT UNSIGNED,
  OUT p_generated   INT,
  OUT p_total_net   DECIMAL(14,2),
  OUT p_message     VARCHAR(255)
)
BEGIN
  DECLARE v_faculty  INT UNSIGNED;
  DECLARE v_basic, v_hra, v_da, v_ta, v_sa DECIMAL(12,2);
  DECLARE v_gross, v_pf, v_pt, v_it, v_lop, v_net DECIMAL(12,2);
  DECLARE v_lop_days TINYINT UNSIGNED;
  DECLARE v_done     TINYINT DEFAULT 0;
  DECLARE v_count    INT DEFAULT 0;
  DECLARE v_total    DECIMAL(14,2) DEFAULT 0;
  DECLARE v_pt_rate  DECIMAL(12,2) DEFAULT 200.00;

  DECLARE cur CURSOR FOR
    SELECT `faculty_id`, `basic_salary`, `hra`, `da`, `ta`, `special_allowance`
    FROM `faculty`
    WHERE `status` IN ('ACTIVE', 'ON_LEAVE')
    ORDER BY `faculty_id`;

  DECLARE CONTINUE HANDLER FOR NOT FOUND SET v_done = 1;

  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    RESIGNAL;   -- keep the original error visible to the caller
  END;

  SELECT IFNULL(CAST(`setting_value` AS DECIMAL(12,2)), 200.00) INTO v_pt_rate
  FROM `system_settings` WHERE `setting_key` = 'PROFESSIONAL_TAX';

  START TRANSACTION;
  OPEN cur;
  pay_loop: LOOP
    FETCH cur INTO v_faculty, v_basic, v_hra, v_da, v_ta, v_sa;
    IF v_done = 1 THEN LEAVE pay_loop; END IF;

    SELECT IFNULL(SUM(`days`), 0) INTO v_lop_days
    FROM `faculty_leaves`
    WHERE `faculty_id` = v_faculty
      AND `status` = 'APPROVED'
      AND `leave_type` = 'UNPAID'
      AND MONTH(`start_date`) = p_pay_month
      AND YEAR(`start_date`)  = p_pay_year;

    SET v_gross = v_basic + v_hra + v_da + v_ta + v_sa;
    SET v_pf    = ROUND(v_basic * 0.12, 2);
    SET v_pt    = v_pt_rate;
    SET v_lop   = ROUND((v_gross / 30.0) * v_lop_days, 2);
    SET v_it    = ROUND(GREATEST(0, (v_gross * 12 - 250000) * 0.05 / 12.0), 2);
    SET v_net   = GREATEST(0, ROUND(v_gross - v_pf - v_pt - v_it - v_lop, 2));

    INSERT INTO `payrolls`
      (`faculty_id`, `pay_month`, `pay_year`, `basic`, `hra`, `da`, `ta`,
       `special_allowance`, `gross_salary`, `pf_deduction`, `professional_tax`,
       `income_tax`, `lop_days`, `lop_amount`, `other_deduction`, `net_salary`,
       `working_days`, `status`, `generated_on`)
    VALUES
      (v_faculty, p_pay_month, p_pay_year, v_basic, v_hra, v_da, v_ta, v_sa, v_gross,
       v_pf, v_pt, v_it, v_lop_days, v_lop, 0.00, v_net, 30, 'GENERATED', NOW())
    ON DUPLICATE KEY UPDATE
      `basic` = v_basic, `hra` = v_hra, `da` = v_da, `ta` = v_ta,
      `special_allowance` = v_sa, `gross_salary` = v_gross,
      `pf_deduction` = v_pf, `professional_tax` = v_pt, `income_tax` = v_it,
      `lop_days` = v_lop_days, `lop_amount` = v_lop, `net_salary` = v_net,
      `status` = 'GENERATED', `generated_on` = NOW();

    DELETE FROM `payroll_components`
    WHERE `payroll_id` = (SELECT `payroll_id` FROM `payrolls`
                          WHERE `faculty_id` = v_faculty
                            AND `pay_month` = p_pay_month
                            AND `pay_year` = p_pay_year);

    INSERT INTO `payroll_components` (`payroll_id`, `component_type`, `name`, `amount`)
    SELECT `payroll_id`, 'EARNING', 'Basic Pay', v_basic FROM `payrolls`
      WHERE `faculty_id` = v_faculty AND `pay_month` = p_pay_month AND `pay_year` = p_pay_year;
    INSERT INTO `payroll_components` (`payroll_id`, `component_type`, `name`, `amount`)
    SELECT `payroll_id`, 'EARNING', 'House Rent Allowance', v_hra FROM `payrolls`
      WHERE `faculty_id` = v_faculty AND `pay_month` = p_pay_month AND `pay_year` = p_pay_year;
    INSERT INTO `payroll_components` (`payroll_id`, `component_type`, `name`, `amount`)
    SELECT `payroll_id`, 'EARNING', 'Dearness Allowance', v_da FROM `payrolls`
      WHERE `faculty_id` = v_faculty AND `pay_month` = p_pay_month AND `pay_year` = p_pay_year;
    INSERT INTO `payroll_components` (`payroll_id`, `component_type`, `name`, `amount`)
    SELECT `payroll_id`, 'EARNING', 'Transport Allowance', v_ta FROM `payrolls`
      WHERE `faculty_id` = v_faculty AND `pay_month` = p_pay_month AND `pay_year` = p_pay_year;
    INSERT INTO `payroll_components` (`payroll_id`, `component_type`, `name`, `amount`)
    SELECT `payroll_id`, 'DEDUCTION', 'Provident Fund', v_pf FROM `payrolls`
      WHERE `faculty_id` = v_faculty AND `pay_month` = p_pay_month AND `pay_year` = p_pay_year;
    INSERT INTO `payroll_components` (`payroll_id`, `component_type`, `name`, `amount`)
    SELECT `payroll_id`, 'DEDUCTION', 'Professional Tax', v_pt FROM `payrolls`
      WHERE `faculty_id` = v_faculty AND `pay_month` = p_pay_month AND `pay_year` = p_pay_year;

    SET v_count = v_count + 1;
    SET v_total = v_total + v_net;
  END LOOP;
  CLOSE cur;

  INSERT INTO `audit_logs` (`user_id`, `action`, `entity`, `entity_id`, `description`)
  VALUES (p_generated_by, 'PAYROLL_RUN', 'payrolls', NULL,
          CONCAT('Payroll ', p_pay_month, '/', p_pay_year, ' generated for ', v_count,
                 ' faculty, total net ', FORMAT(v_total, 2)));

  SET p_generated = v_count;
  SET p_total_net = v_total;
  SET p_message = CONCAT('Payroll generated for ', v_count, ' faculty members.');
  COMMIT;
END$$
DELIMITER ;

-- =====================================================================================
-- MODULE 7 - sp_approve_leave   (approval also updates the leave balance ledger)
-- =====================================================================================
DELIMITER $$
CREATE PROCEDURE `sp_approve_leave`(
  IN  p_leave_id   INT UNSIGNED,
  IN  p_approve    TINYINT,
  IN  p_approved_by INT UNSIGNED,
  IN  p_remarks    VARCHAR(255),
  OUT p_message    VARCHAR(255)
)
BEGIN
  DECLARE v_faculty INT UNSIGNED;
  DECLARE v_type    VARCHAR(20);
  DECLARE v_days    TINYINT UNSIGNED;
  DECLARE v_status  VARCHAR(20);
  DECLARE v_year    SMALLINT UNSIGNED;

  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    RESIGNAL;   -- keep the original error visible to the caller
  END;

  SELECT `faculty_id`, `leave_type`, `days`, `status`
  INTO v_faculty, v_type, v_days, v_status
  FROM `faculty_leaves` WHERE `leave_id` = p_leave_id;

  IF v_faculty IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Leave application not found.';
  END IF;
  IF v_status <> 'PENDING' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'This leave has already been decided.';
  END IF;

  SELECT `academic_year_id` INTO v_year FROM `academic_years` WHERE `is_current` = 1 LIMIT 1;

  START TRANSACTION;

  IF p_approve = 1 THEN
    UPDATE `faculty_leaves`
    SET `status` = 'APPROVED', `approved_by` = p_approved_by, `approved_on` = NOW(),
        `remarks` = p_remarks
    WHERE `leave_id` = p_leave_id;

    INSERT INTO `leave_balances` (`faculty_id`, `academic_year_id`, `leave_type`, `allotted`, `used`)
    VALUES (v_faculty, v_year, v_type, 0, v_days)
    ON DUPLICATE KEY UPDATE `used` = `used` + v_days;

    SET p_message = 'Leave approved and the balance has been updated.';
  ELSE
    UPDATE `faculty_leaves`
    SET `status` = 'REJECTED', `approved_by` = p_approved_by, `approved_on` = NOW(),
        `remarks` = p_remarks
    WHERE `leave_id` = p_leave_id;
    SET p_message = 'Leave rejected.';
  END IF;

  INSERT INTO `audit_logs` (`user_id`, `action`, `entity`, `entity_id`, `description`)
  VALUES (p_approved_by, 'LEAVE_ACTION', 'faculty_leaves', p_leave_id, p_message);

  CALL sp_push_notification(
    (SELECT `user_id` FROM `faculty` WHERE `faculty_id` = v_faculty),
    CONCAT('Leave ', IF(p_approve = 1, 'approved', 'rejected')),
    CONCAT('Your ', v_type, ' leave for ', v_days, ' day(s) was ',
           IF(p_approve = 1, 'approved', 'rejected'), '. ', IFNULL(p_remarks, '')),
    'LEAVE_APPROVAL', IF(p_approve = 1, 'SUCCESS', 'WARNING'), 'faculty_leaves', p_leave_id,
    '/faculty/leaves');

  COMMIT;
END$$
DELIMITER ;

-- =====================================================================================
-- CROSS MODULE - sp_compute_student_risk
-- Recomputes the academic risk score for every active student from live data
-- (attendance, CGPA, backlogs, pending fees, mock exam performance).
-- =====================================================================================
DELIMITER $$
CREATE PROCEDURE `sp_compute_student_risk`(OUT p_rows INT, OUT p_message VARCHAR(255))
BEGIN
  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    RESIGNAL;   -- keep the original error visible to the caller
  END;

  START TRANSACTION;

  INSERT INTO `student_risk_scores`
    (`student_id`, `computed_on`, `risk_score`, `risk_level`, `attendance_pct`,
     `cgpa`, `pending_fees`, `backlog_count`, `factors`)
  SELECT r.`student_id`, CURDATE(), r.`risk_score`, r.`risk_level`, r.`attendance_percentage`,
         r.`cgpa`, r.`pending_fees`, r.`backlog_count`,
         JSON_OBJECT('attendance', r.`attendance_percentage`, 'cgpa', r.`cgpa`,
                     'backlogs', r.`backlog_count`, 'pending_fees', r.`pending_fees`)
  FROM `v_student_risk_dashboard` r
  ON DUPLICATE KEY UPDATE
    `risk_score` = r.`risk_score`,
    `risk_level` = r.`risk_level`,
    `attendance_pct` = r.`attendance_percentage`,
    `cgpa` = r.`cgpa`,
    `pending_fees` = r.`pending_fees`,
    `backlog_count` = r.`backlog_count`,
    `factors` = JSON_OBJECT('attendance', r.`attendance_percentage`, 'cgpa', r.`cgpa`,
                            'backlogs', r.`backlog_count`, 'pending_fees', r.`pending_fees`);

  SET p_rows = ROW_COUNT();
  SET p_message = CONCAT('Risk scores recomputed for ', p_rows, ' students.');
  COMMIT;
END$$
DELIMITER ;

-- =====================================================================================
-- END OF 05_procedures.sql - 16 stored procedures
-- =====================================================================================
