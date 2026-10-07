-- =====================================================================================
-- FILE   : 02_tables.sql
-- PURPOSE : All remaining tables, grouped by owning module (G1..G7 + extras).
-- RULES   :
--   * Every module references the SHARED masters from 01_schema.sql (users, departments,
--     programs, batches, subjects, academic_years, semesters, categories, roles).
--   * No module defines its own Student / Faculty / Department / Subject table.
--   * Every table has a PRIMARY KEY; every relationship has a FOREIGN KEY.
--   * UNIQUE, NOT NULL, CHECK and DEFAULT are used wherever the business demands it.
-- =====================================================================================

-- The target database must already be selected, e.g.
--   mysql -u root -p university_erp < 02_tables.sql
-- 01_schema.sql creates it. These files deliberately carry no hard-coded USE,
-- so the same scripts install cleanly under any database name (Docker, CI, clones).
SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- =====================================================================================
-- MODULE 1 (GROUP 1) - STUDENT & ADMISSION MANAGEMENT
-- Tables : students, addresses, guardians, admissions, student_documents,
--          student_status_history
-- =====================================================================================

-- -------------------------------------------------------------------------------------
-- 1.1 students  (The ONE student table. Every other module FKs to student_id.)
-- -------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `students` (
  `student_id`          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id`             INT UNSIGNED NOT NULL COMMENT 'Login account (role = STUDENT)',
  `roll_number`         VARCHAR(20)  NOT NULL COMMENT 'University roll number, UNIQUE',
  `registration_number` VARCHAR(30)  NOT NULL COMMENT 'Admission registration number, UNIQUE',
  `first_name`          VARCHAR(80)  NOT NULL,
  `middle_name`         VARCHAR(80)  NULL,
  `last_name`           VARCHAR(80)  NOT NULL,
  `email`               VARCHAR(150) NOT NULL,
  `phone`               VARCHAR(20)  NULL,
  `date_of_birth`       DATE         NOT NULL,
  `gender`              ENUM('MALE','FEMALE','OTHER') NOT NULL,
  `blood_group`         ENUM('A+','A-','B+','B-','AB+','AB-','O+','O-') NULL,
  `nationality`         VARCHAR(50)  NOT NULL DEFAULT 'Indian',
  `category_id`         TINYINT UNSIGNED NOT NULL,
  `department_id`       INT UNSIGNED NOT NULL,
  `program_id`          SMALLINT UNSIGNED NOT NULL,
  `batch_id`            SMALLINT UNSIGNED NOT NULL,
  `admission_year`      SMALLINT UNSIGNED NOT NULL,
  `admission_date`      DATE         NULL,
  `current_semester_no` TINYINT UNSIGNED NOT NULL DEFAULT 1,
  `status`              ENUM('ACTIVE','INACTIVE','GRADUATED','SUSPENDED','ALUMNI') NOT NULL DEFAULT 'ACTIVE',
  `photo_url`           VARCHAR(255) NULL,
  `emergency_contact`   VARCHAR(20)  NULL,
  `created_at`          TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`          TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`student_id`),
  UNIQUE KEY `uq_students_roll`   (`roll_number`),
  UNIQUE KEY `uq_students_regno`  (`registration_number`),
  UNIQUE KEY `uq_students_email`  (`email`),
  UNIQUE KEY `uq_students_user`   (`user_id`),
  KEY `idx_students_program`   (`program_id`),
  KEY `idx_students_department`(`department_id`),
  KEY `idx_students_batch`    (`batch_id`),
  KEY `idx_students_status`   (`status`),
  KEY `idx_students_name`     (`last_name`, `first_name`),
  KEY `idx_students_category` (`category_id`),
  CONSTRAINT `fk_students_user` FOREIGN KEY (`user_id`)
    REFERENCES `users` (`user_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_students_category` FOREIGN KEY (`category_id`)
    REFERENCES `categories` (`category_id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_students_department` FOREIGN KEY (`department_id`)
    REFERENCES `departments` (`department_id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_students_program` FOREIGN KEY (`program_id`)
    REFERENCES `programs` (`program_id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_students_batch` FOREIGN KEY (`batch_id`)
    REFERENCES `batches` (`batch_id`) ON DELETE RESTRICT,
  CONSTRAINT `chk_students_semester` CHECK (`current_semester_no` BETWEEN 1 AND 12)
  -- NOTE: `date_of_birth` must be in the past. MySQL forbids non-deterministic
  --       functions (CURDATE) inside a CHECK clause, so this rule is enforced by the
  --       BEFORE INSERT/UPDATE trigger trg_students_validate_dob in 06_triggers.sql.
) ENGINE=InnoDB COMMENT='G1: single student master for the whole ERP.';

-- -------------------------------------------------------------------------------------
-- 1.2 addresses  (permanent / correspondence / hostel address of a student)
-- -------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `addresses` (
  `address_id`   INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `student_id`   INT UNSIGNED NOT NULL,
  `address_type` ENUM('PERMANENT','CORRESPONDENCE','HOSTEL') NOT NULL DEFAULT 'PERMANENT',
  `line1`        VARCHAR(160) NOT NULL,
  `line2`        VARCHAR(160) NULL,
  `city`         VARCHAR(80)  NOT NULL,
  `district`     VARCHAR(80)  NULL,
  `state`        VARCHAR(80)  NOT NULL,
  `pincode`      VARCHAR(10)  NOT NULL,
  `country`      VARCHAR(60)  NOT NULL DEFAULT 'India',
  `is_primary`   TINYINT(1)   NOT NULL DEFAULT 0,
  `created_at`   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`address_id`),
  UNIQUE KEY `uq_addresses_student_type` (`student_id`, `address_type`),
  KEY `idx_addresses_city` (`city`),
  CONSTRAINT `fk_addresses_student` FOREIGN KEY (`student_id`)
    REFERENCES `students` (`student_id`) ON DELETE CASCADE,
  CONSTRAINT `chk_addresses_pincode` CHECK (CHAR_LENGTH(`pincode`) BETWEEN 4 AND 10)
) ENGINE=InnoDB COMMENT='G1: student addresses (permanent / correspondence / hostel).';

-- -------------------------------------------------------------------------------------
-- 1.3 guardians  (parent / guardian details of a student)
-- -------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `guardians` (
  `guardian_id`   INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `student_id`    INT UNSIGNED NOT NULL,
  `name`          VARCHAR(120) NOT NULL,
  `relation`      ENUM('FATHER','MOTHER','GUARDIAN','SPOUSE','SIBLING') NOT NULL DEFAULT 'FATHER',
  `phone`         VARCHAR(20)  NOT NULL,
  `email`         VARCHAR(150) NULL,
  `occupation`    VARCHAR(80)  NULL,
  `annual_income` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  `is_primary`    TINYINT(1)   NOT NULL DEFAULT 0,
  `created_at`    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`guardian_id`),
  UNIQUE KEY `uq_guardians_student_relation` (`student_id`, `relation`),
  KEY `idx_guardians_student` (`student_id`),
  CONSTRAINT `fk_guardians_student` FOREIGN KEY (`student_id`)
    REFERENCES `students` (`student_id`) ON DELETE CASCADE,
  CONSTRAINT `chk_guardians_income` CHECK (`annual_income` >= 0)
) ENGINE=InnoDB COMMENT='G1: guardian / parent information.';

-- -------------------------------------------------------------------------------------
-- 1.4 admissions  (application -> approval workflow; creates the student row)
-- -------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `admissions` (
  `admission_id`       INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `application_no`     VARCHAR(30)  NOT NULL COMMENT 'APP-2026-000123',
  `student_id`         INT UNSIGNED NULL COMMENT 'Set when the application is APPROVED',
  `academic_year_id`   SMALLINT UNSIGNED NOT NULL,
  `program_id`         SMALLINT UNSIGNED NOT NULL,
  `category_id`        TINYINT UNSIGNED NOT NULL,
  `first_name`         VARCHAR(80)  NOT NULL,
  `last_name`          VARCHAR(80)  NOT NULL,
  `email`              VARCHAR(150) NOT NULL,
  `phone`              VARCHAR(20)  NOT NULL,
  `date_of_birth`      DATE         NOT NULL,
  `gender`             ENUM('MALE','FEMALE','OTHER') NOT NULL,
  `guardian_name`      VARCHAR(120) NOT NULL,
  `guardian_phone`     VARCHAR(20)  NOT NULL,
  `previous_school`    VARCHAR(160) NULL,
  `qualification`      VARCHAR(80)  NOT NULL DEFAULT 'HSC',
  `marks_10`           DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  `marks_12`           DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  `entrance_score`     DECIMAL(6,2) NULL,
  `address_line1`      VARCHAR(160) NULL,
  `city`               VARCHAR(80)  NULL,
  `state`              VARCHAR(80)  NULL,
  `pincode`            VARCHAR(10)  NULL,
  `application_date`   DATE         NOT NULL DEFAULT (CURRENT_DATE),
  `status`             ENUM('APPLIED','UNDER_REVIEW','APPROVED','REJECTED','WAITLISTED') NOT NULL DEFAULT 'APPLIED',
  `reviewed_by`        INT UNSIGNED NULL,
  `reviewed_at`        DATETIME     NULL,
  `remarks`            VARCHAR(500) NULL,
  `created_at`         TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`         TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`admission_id`),
  UNIQUE KEY `uq_admissions_appno` (`application_no`),
  UNIQUE KEY `uq_admissions_student` (`student_id`),
  KEY `idx_admissions_status` (`status`),
  KEY `idx_admissions_program` (`program_id`),
  KEY `idx_admissions_email`  (`email`),
  CONSTRAINT `fk_admissions_student` FOREIGN KEY (`student_id`)
    REFERENCES `students` (`student_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_admissions_year` FOREIGN KEY (`academic_year_id`)
    REFERENCES `academic_years` (`academic_year_id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_admissions_program` FOREIGN KEY (`program_id`)
    REFERENCES `programs` (`program_id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_admissions_category` FOREIGN KEY (`category_id`)
    REFERENCES `categories` (`category_id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_admissions_reviewer` FOREIGN KEY (`reviewed_by`)
    REFERENCES `users` (`user_id`) ON DELETE SET NULL,
  CONSTRAINT `chk_admissions_marks10` CHECK (`marks_10` BETWEEN 0 AND 100),
  CONSTRAINT `chk_admissions_marks12` CHECK (`marks_12` BETWEEN 0 AND 100)
  -- date_of_birth validation is enforced by trg_admissions_validate_dob (see 06_triggers.sql)
) ENGINE=InnoDB COMMENT='G1: admission applications and their approval lifecycle.';

-- -------------------------------------------------------------------------------------
-- 1.5 student_documents  (upload metadata - files live on disk, metadata in DB)
-- -------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `student_documents` (
  `document_id`  INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `student_id`   INT UNSIGNED NOT NULL,
  `doc_type`     ENUM('PHOTO','AADHAR','PAN','BIRTH_CERTIFICATE','MARKSHEET_10','MARKSHEET_12',
                      'TRANSFER_CERTIFICATE','CASTE_CERTIFICATE','INCOME_CERTIFICATE','OTHER') NOT NULL,
  `file_name`    VARCHAR(255) NOT NULL,
  `file_path`    VARCHAR(255) NOT NULL,
  `mime_type`    VARCHAR(100) NOT NULL DEFAULT 'application/octet-stream',
  `size_bytes`   INT UNSIGNED NOT NULL DEFAULT 0,
  `is_verified`  TINYINT(1)   NOT NULL DEFAULT 0,
  `verified_by`  INT UNSIGNED NULL,
  `verified_at`  DATETIME     NULL,
  `uploaded_at`  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`document_id`),
  KEY `idx_documents_student` (`student_id`),
  KEY `idx_documents_type` (`doc_type`),
  CONSTRAINT `fk_documents_student` FOREIGN KEY (`student_id`)
    REFERENCES `students` (`student_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_documents_verifier` FOREIGN KEY (`verified_by`)
    REFERENCES `users` (`user_id`) ON DELETE SET NULL
) ENGINE=InnoDB COMMENT='G1: metadata of documents uploaded against a student.';

-- -------------------------------------------------------------------------------------
-- 1.6 student_status_history  (admission / status change audit, filled by trigger)
-- -------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `student_status_history` (
  `history_id`  INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `student_id`  INT UNSIGNED NOT NULL,
  `old_status`  VARCHAR(30)  NULL,
  `new_status`  VARCHAR(30)  NOT NULL,
  `reason`      VARCHAR(255) NULL,
  `changed_by`  INT UNSIGNED NULL,
  `changed_at`  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY `idx_status_history_student` (`student_id`),
  CONSTRAINT `fk_status_history_student` FOREIGN KEY (`student_id`)
    REFERENCES `students` (`student_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_status_history_user` FOREIGN KEY (`changed_by`)
    REFERENCES `users` (`user_id`) ON DELETE SET NULL
) ENGINE=InnoDB COMMENT='G1: history of student status transitions (written by trigger).';

-- =====================================================================================
-- MODULE 2 (GROUP 2) - ACADEMIC & COURSE MANAGEMENT
-- Tables : sections, program_subjects (curriculum), course_offerings, enrollments,
--          faculty_subjects, timetable, academic_calendar, class_sessions
-- =====================================================================================

-- -------------------------------------------------------------------------------------
-- 2.1 sections  (a division of a batch, e.g. ETC-2024-A / Section A)
-- -------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `sections` (
  `section_id`   SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `section_code` VARCHAR(10)  NOT NULL COMMENT 'A, B, C',
  `program_id`   SMALLINT UNSIGNED NOT NULL,
  `batch_id`     SMALLINT UNSIGNED NOT NULL,
  `semester_id`  SMALLINT UNSIGNED NULL,
  `capacity`     SMALLINT UNSIGNED NOT NULL DEFAULT 60,
  `room_number`  VARCHAR(20)  NULL,
  `class_teacher_id` INT UNSIGNED NULL COMMENT 'FK -> faculty(faculty_id), added in 03',
  `status`       ENUM('ACTIVE','INACTIVE') NOT NULL DEFAULT 'ACTIVE',
  PRIMARY KEY (`section_id`),
  UNIQUE KEY `uq_sections_batch_code` (`batch_id`, `section_code`),
  KEY `idx_sections_program` (`program_id`),
  CONSTRAINT `fk_sections_program` FOREIGN KEY (`program_id`)
    REFERENCES `programs` (`program_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_sections_batch` FOREIGN KEY (`batch_id`)
    REFERENCES `batches` (`batch_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_sections_semester` FOREIGN KEY (`semester_id`)
    REFERENCES `semesters` (`semester_id`) ON DELETE SET NULL,
  CONSTRAINT `chk_sections_capacity` CHECK (`capacity` BETWEEN 1 AND 300)
) ENGINE=InnoDB COMMENT='G2: class sections inside a batch.';

-- -------------------------------------------------------------------------------------
-- 2.2 program_subjects  (curriculum: which subject is taught in which semester)
-- -------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `program_subjects` (
  `program_subject_id` SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `program_id`  SMALLINT UNSIGNED NOT NULL,
  `subject_id`  SMALLINT UNSIGNED NOT NULL,
  `semester_no` TINYINT UNSIGNED NOT NULL,
  `is_elective` TINYINT(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (`program_subject_id`),
  UNIQUE KEY `uq_program_subjects` (`program_id`, `subject_id`, `semester_no`),
  KEY `idx_program_subjects_sem` (`program_id`, `semester_no`),
  CONSTRAINT `fk_ps_program` FOREIGN KEY (`program_id`)
    REFERENCES `programs` (`program_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_ps_subject` FOREIGN KEY (`subject_id`)
    REFERENCES `subjects` (`subject_id`) ON DELETE CASCADE,
  CONSTRAINT `chk_ps_semester` CHECK (`semester_no` BETWEEN 1 AND 12)
) ENGINE=InnoDB COMMENT='G2: curriculum mapping program -> subject per semester.';

-- -------------------------------------------------------------------------------------
-- 2.3 course_offerings  (a subject actually offered in a semester to a section)
-- -------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `course_offerings` (
  `offering_id`      INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `subject_id`       SMALLINT UNSIGNED NOT NULL,
  `semester_id`      SMALLINT UNSIGNED NOT NULL,
  `academic_year_id` SMALLINT UNSIGNED NOT NULL,
  `program_id`       SMALLINT UNSIGNED NOT NULL,
  `section_id`       SMALLINT UNSIGNED NULL,
  `faculty_id`       INT UNSIGNED NULL COMMENT 'FK -> faculty.faculty_id (added in 03)',
  `capacity`         SMALLINT UNSIGNED NOT NULL DEFAULT 60,
  `enrolled_count`   SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  `offering_type`    ENUM('REGULAR','ELECTIVE','BACKLOG','AUDIT') NOT NULL DEFAULT 'REGULAR',
  `status`           ENUM('OPEN','CLOSED','CANCELLED','COMPLETED') NOT NULL DEFAULT 'OPEN',
  `created_at`       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`offering_id`),
  UNIQUE KEY `uq_offerings` (`subject_id`, `semester_id`, `program_id`, `section_id`),
  KEY `idx_offerings_faculty`  (`faculty_id`),
  KEY `idx_offerings_semester` (`semester_id`),
  KEY `idx_offerings_program`  (`program_id`),
  CONSTRAINT `fk_offerings_subject` FOREIGN KEY (`subject_id`)
    REFERENCES `subjects` (`subject_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_offerings_semester` FOREIGN KEY (`semester_id`)
    REFERENCES `semesters` (`semester_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_offerings_year` FOREIGN KEY (`academic_year_id`)
    REFERENCES `academic_years` (`academic_year_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_offerings_program` FOREIGN KEY (`program_id`)
    REFERENCES `programs` (`program_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_offerings_section` FOREIGN KEY (`section_id`)
    REFERENCES `sections` (`section_id`) ON DELETE SET NULL,
  CONSTRAINT `chk_offerings_capacity` CHECK (`capacity` >= 1),
  CONSTRAINT `chk_offerings_enrolled` CHECK (`enrolled_count` >= 0)
) ENGINE=InnoDB COMMENT='G2: subject offered in a semester; FK target of attendance and exams.';

-- -------------------------------------------------------------------------------------
-- 2.4 enrollments  (student <-> course_offering; the academic spine of the ERP)
-- -------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `enrollments` (
  `enrollment_id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `student_id`    INT UNSIGNED NOT NULL,
  `offering_id`   INT UNSIGNED NOT NULL,
  `enrolled_on`   DATE         NOT NULL DEFAULT (CURRENT_DATE),
  `enrolled_by`   INT UNSIGNED NULL,
  `grade`         VARCHAR(4)   NULL COMMENT 'Final grade letter for this offering',
  `grade_points`  DECIMAL(4,2) NULL,
  `status`        ENUM('ENROLLED','COMPLETED','DROPPED','FAILED','PASSED') NOT NULL DEFAULT 'ENROLLED',
  `created_at`    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`enrollment_id`),
  UNIQUE KEY `uq_enrollments_student_offering` (`student_id`, `offering_id`),
  KEY `idx_enrollments_offering` (`offering_id`),
  KEY `idx_enrollments_status`  (`status`),
  CONSTRAINT `fk_enrollments_student` FOREIGN KEY (`student_id`)
    REFERENCES `students` (`student_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_enrollments_offering` FOREIGN KEY (`offering_id`)
    REFERENCES `course_offerings` (`offering_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_enrollments_user` FOREIGN KEY (`enrolled_by`)
    REFERENCES `users` (`user_id`) ON DELETE SET NULL,
  CONSTRAINT `chk_enrollments_points` CHECK (`grade_points` IS NULL OR (`grade_points` BETWEEN 0 AND 10))
) ENGINE=InnoDB COMMENT='G2: student enrolled into a course offering (no duplicate enrollment).';

-- -------------------------------------------------------------------------------------
-- 2.5 faculty_subjects  (faculty <-> subject allocation for an academic year)
-- -------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `faculty_subjects` (
  `allocation_id`    INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `faculty_id`       INT UNSIGNED NOT NULL COMMENT 'FK -> faculty.faculty_id (added in 03)',
  `subject_id`       SMALLINT UNSIGNED NOT NULL,
  `academic_year_id` SMALLINT UNSIGNED NOT NULL,
  `semester_id`      SMALLINT UNSIGNED NULL,
  `is_primary`       TINYINT(1) NOT NULL DEFAULT 1,
  `assigned_on`      DATE        NOT NULL DEFAULT (CURRENT_DATE),
  PRIMARY KEY (`allocation_id`),
  UNIQUE KEY `uq_faculty_subjects` (`faculty_id`, `subject_id`, `academic_year_id`, `semester_id`),
  KEY `idx_fs_subject` (`subject_id`),
  CONSTRAINT `fk_fs_subject` FOREIGN KEY (`subject_id`)
    REFERENCES `subjects` (`subject_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_fs_year` FOREIGN KEY (`academic_year_id`)
    REFERENCES `academic_years` (`academic_year_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_fs_semester` FOREIGN KEY (`semester_id`)
    REFERENCES `semesters` (`semester_id`) ON DELETE SET NULL
) ENGINE=InnoDB COMMENT='G2: which faculty teaches which subject in which year.';

-- -------------------------------------------------------------------------------------
-- 2.6 timetable  (weekly schedule with 3-way conflict prevention)
-- -------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `timetable` (
  `timetable_id` SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `offering_id`  INT UNSIGNED NOT NULL,
  `section_id`   SMALLINT UNSIGNED NOT NULL,
  `faculty_id`   INT UNSIGNED NOT NULL COMMENT 'FK -> faculty.faculty_id (added in 03)',
  `day_of_week`  ENUM('MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY','SUNDAY') NOT NULL,
  `start_time`   TIME NOT NULL,
  `end_time`     TIME NOT NULL,
  `room_number`  VARCHAR(20) NOT NULL,
  `slot_label`   VARCHAR(20) NULL COMMENT 'e.g. 09:00-10:00',
  `is_active`    TINYINT(1)  NOT NULL DEFAULT 1,
  PRIMARY KEY (`timetable_id`),
  UNIQUE KEY `uq_timetable_section_slot`  (`section_id`, `day_of_week`, `start_time`),
  UNIQUE KEY `uq_timetable_faculty_slot`  (`faculty_id`, `day_of_week`, `start_time`),
  UNIQUE KEY `uq_timetable_room_slot`     (`room_number`, `day_of_week`, `start_time`),
  KEY `idx_timetable_offering` (`offering_id`),
  CONSTRAINT `fk_timetable_offering` FOREIGN KEY (`offering_id`)
    REFERENCES `course_offerings` (`offering_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_timetable_section` FOREIGN KEY (`section_id`)
    REFERENCES `sections` (`section_id`) ON DELETE CASCADE,
  CONSTRAINT `chk_timetable_time` CHECK (`end_time` > `start_time`)
) ENGINE=InnoDB COMMENT='G2: weekly timetable. Conflicts blocked by UNIQUE keys + trigger.';

-- -------------------------------------------------------------------------------------
-- 2.7 academic_calendar  (events: exams, holidays, fests, last-working-day...)
-- -------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `academic_calendar` (
  `event_id`         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `academic_year_id` SMALLINT UNSIGNED NOT NULL,
  `semester_id`      SMALLINT UNSIGNED NULL,
  `title`            VARCHAR(150) NOT NULL,
  `description`      VARCHAR(500) NULL,
  `event_type`       ENUM('EXAM','HOLIDAY','FEST','WORKSHOP','SEMINAR','RESULT','FEE_DUE','OTHER') NOT NULL DEFAULT 'OTHER',
  `event_date`       DATE NOT NULL,
  `end_date`         DATE NULL,
  `is_holiday`       TINYINT(1) NOT NULL DEFAULT 0,
  `created_at`       TIMESTAMP  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`event_id`),
  KEY `idx_calendar_year` (`academic_year_id`),
  KEY `idx_calendar_date` (`event_date`),
  CONSTRAINT `fk_calendar_year` FOREIGN KEY (`academic_year_id`)
    REFERENCES `academic_years` (`academic_year_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_calendar_semester` FOREIGN KEY (`semester_id`)
    REFERENCES `semesters` (`semester_id`) ON DELETE SET NULL,
  CONSTRAINT `chk_calendar_dates` CHECK (`end_date` IS NULL OR `end_date` >= `event_date`)
) ENGINE=InnoDB COMMENT='G2: academic calendar shared with exams, finance and students.';

-- -------------------------------------------------------------------------------------
-- 2.8 class_sessions  (one physical lecture - the unit of attendance)
-- -------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `class_sessions` (
  `session_id`   INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `offering_id`  INT UNSIGNED NOT NULL,
  `faculty_id`   INT UNSIGNED NOT NULL COMMENT 'FK -> faculty.faculty_id (added in 03)',
  `semester_id`  SMALLINT UNSIGNED NOT NULL,
  `session_date` DATE NOT NULL,
  `session_no`   TINYINT UNSIGNED NOT NULL DEFAULT 1,
  `topic`        VARCHAR(255) NULL,
  `room_number`  VARCHAR(20)  NULL,
  `start_time`   TIME NULL,
  `end_time`     TIME NULL,
  `status`       ENUM('SCHEDULED','COMPLETED','CANCELLED') NOT NULL DEFAULT 'COMPLETED',
  `created_at`   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`session_id`),
  UNIQUE KEY `uq_sessions_offering_date_no` (`offering_id`, `session_date`, `session_no`),
  KEY `idx_sessions_faculty` (`faculty_id`, `session_date`),
  KEY `idx_sessions_date` (`session_date`),
  CONSTRAINT `fk_sessions_offering` FOREIGN KEY (`offering_id`)
    REFERENCES `course_offerings` (`offering_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_sessions_semester` FOREIGN KEY (`semester_id`)
    REFERENCES `semesters` (`semester_id`) ON DELETE CASCADE
) ENGINE=InnoDB COMMENT='G2/G3: a single lecture. Attendance rows hang off this.';

-- =====================================================================================
-- MODULE 3 (GROUP 3) - ATTENDANCE MANAGEMENT
-- Tables : attendance
-- =====================================================================================

-- -------------------------------------------------------------------------------------
-- 3.1 attendance  (one row per student per lecture)
-- -------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `attendance` (
  `attendance_id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `session_id`    INT UNSIGNED NOT NULL,
  `student_id`    INT UNSIGNED NOT NULL,
  `offering_id`   INT UNSIGNED NOT NULL COMMENT 'Denormalised for fast % computation (indexed)',
  `semester_id`   SMALLINT UNSIGNED NOT NULL,
  `status`        ENUM('PRESENT','ABSENT','LATE','EXCUSED') NOT NULL DEFAULT 'PRESENT',
  `remarks`       VARCHAR(255) NULL,
  `marked_by`     INT UNSIGNED NULL,
  `marked_at`     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`attendance_id`),
  UNIQUE KEY `uq_attendance_session_student` (`session_id`, `student_id`),
  KEY `idx_attendance_student_offering` (`student_id`, `offering_id`, `status`),
  KEY `idx_attendance_offering_date` (`offering_id`, `status`),
  KEY `idx_attendance_semester` (`semester_id`),
  CONSTRAINT `fk_attendance_session` FOREIGN KEY (`session_id`)
    REFERENCES `class_sessions` (`session_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_attendance_student` FOREIGN KEY (`student_id`)
    REFERENCES `students` (`student_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_attendance_offering` FOREIGN KEY (`offering_id`)
    REFERENCES `course_offerings` (`offering_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_attendance_semester` FOREIGN KEY (`semester_id`)
    REFERENCES `semesters` (`semester_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_attendance_user` FOREIGN KEY (`marked_by`)
    REFERENCES `users` (`user_id`) ON DELETE SET NULL
) ENGINE=InnoDB COMMENT='G3: attendance register. Drives the 75%% exam-eligibility rule.';

-- =====================================================================================
-- MODULE 4 (GROUP 4) - EXAMINATION & RESULTS MANAGEMENT
-- Tables : grades, exams, exam_schedules, exam_registrations, marks, results
-- =====================================================================================

-- -------------------------------------------------------------------------------------
-- 4.0 grades  (grade master - 10 point grading system)
-- -------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `grades` (
  `grade_id`      TINYINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `grade_code`    VARCHAR(4)  NOT NULL COMMENT 'AA, AB, BB, ... FF',
  `grade_label`   VARCHAR(20) NOT NULL COMMENT 'Outstanding / Excellent / Fail',
  `min_percentage` DECIMAL(5,2) NOT NULL,
  `max_percentage` DECIMAL(5,2) NOT NULL,
  `grade_points`  DECIMAL(4,2) NOT NULL COMMENT '10.00 for an AA grade needs 4 digits',
  `is_pass`       TINYINT(1)  NOT NULL DEFAULT 1,
  PRIMARY KEY (`grade_id`),
  UNIQUE KEY `uq_grades_code` (`grade_code`),
  UNIQUE KEY `uq_grades_range` (`min_percentage`, `max_percentage`),
  CONSTRAINT `chk_grades_range` CHECK (`max_percentage` > `min_percentage`),
  CONSTRAINT `chk_grades_points` CHECK (`grade_points` BETWEEN 0 AND 10)
) ENGINE=InnoDB COMMENT='G4: 10-point grade master used by marks + results.';

-- -------------------------------------------------------------------------------------
-- 4.1 exams  (an examination event: MSE-1, End Semester...)
-- -------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `exams` (
  `exam_id`          SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `exam_code`        VARCHAR(20)  NOT NULL COMMENT 'ENDSEM-2025-ODD',
  `name`             VARCHAR(120) NOT NULL,
  `exam_type`        ENUM('INTERNAL','MIDTERM','ENDSEM','PRACTICAL','VIVA','QUIZ','MOCK') NOT NULL DEFAULT 'ENDSEM',
  `academic_year_id` SMALLINT UNSIGNED NOT NULL,
  `semester_id`      SMALLINT UNSIGNED NOT NULL,
  `start_date`       DATE         NOT NULL,
  `end_date`         DATE         NOT NULL,
  `registration_start` DATE NULL,
  `registration_end`   DATE NULL,
  `result_published`   TINYINT(1) NOT NULL DEFAULT 0,
  `published_on`       DATETIME   NULL,
  `min_attendance_required` DECIMAL(5,2) NOT NULL DEFAULT 75.00 COMMENT 'Business rule: 75%',
  `status`           ENUM('DRAFT','SCHEDULED','REGISTRATION_OPEN','ONGOING','COMPLETED','PUBLISHED','CANCELLED') NOT NULL DEFAULT 'DRAFT',
  `created_at`       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`exam_id`),
  UNIQUE KEY `uq_exams_code` (`exam_code`),
  KEY `idx_exams_semester` (`semester_id`),
  KEY `idx_exams_status` (`status`),
  CONSTRAINT `fk_exams_year` FOREIGN KEY (`academic_year_id`)
    REFERENCES `academic_years` (`academic_year_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_exams_semester` FOREIGN KEY (`semester_id`)
    REFERENCES `semesters` (`semester_id`) ON DELETE CASCADE,
  CONSTRAINT `chk_exams_dates` CHECK (`end_date` >= `start_date`),
  CONSTRAINT `chk_exams_min_att` CHECK (`min_attendance_required` BETWEEN 0 AND 100)
) ENGINE=InnoDB COMMENT='G4: examination header. Eligibility threshold stored per exam.';

-- -------------------------------------------------------------------------------------
-- 4.2 exam_schedules  (subject-wise date sheet of an exam)
-- -------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `exam_schedules` (
  `schedule_id`  INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `exam_id`      SMALLINT UNSIGNED NOT NULL,
  `subject_id`   SMALLINT UNSIGNED NOT NULL,
  `program_id`   SMALLINT UNSIGNED NOT NULL,
  `exam_date`    DATE NOT NULL,
  `start_time`   TIME NOT NULL,
  `end_time`     TIME NOT NULL,
  `room_number`  VARCHAR(20) NOT NULL,
  `max_marks`    SMALLINT UNSIGNED NOT NULL DEFAULT 100,
  `min_marks`    SMALLINT UNSIGNED NOT NULL DEFAULT 40,
  `invigilator_id` INT UNSIGNED NULL COMMENT 'FK -> faculty.faculty_id (added in 03)',
  PRIMARY KEY (`schedule_id`),
  UNIQUE KEY `uq_exam_schedules` (`exam_id`, `subject_id`, `program_id`),
  UNIQUE KEY `uq_exam_schedules_room` (`exam_date`, `start_time`, `room_number`),
  KEY `idx_exam_schedules_date` (`exam_date`),
  CONSTRAINT `fk_es_exam` FOREIGN KEY (`exam_id`)
    REFERENCES `exams` (`exam_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_es_subject` FOREIGN KEY (`subject_id`)
    REFERENCES `subjects` (`subject_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_es_program` FOREIGN KEY (`program_id`)
    REFERENCES `programs` (`program_id`) ON DELETE CASCADE,
  CONSTRAINT `chk_es_marks` CHECK (`min_marks` < `max_marks` AND `max_marks` <= 200),
  CONSTRAINT `chk_es_time` CHECK (`end_time` > `start_time`)
) ENGINE=InnoDB COMMENT='G4: date sheet - one row per (exam, subject, program).';

-- -------------------------------------------------------------------------------------
-- 4.3 exam_registrations  (student registers for an exam; eligibility is enforced here)
-- -------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `exam_registrations` (
  `registration_id`       INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `exam_id`               SMALLINT UNSIGNED NOT NULL,
  `student_id`            INT UNSIGNED NOT NULL,
  `offering_id`           INT UNSIGNED NOT NULL,
  `schedule_id`           INT UNSIGNED NULL,
  `registered_on`         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `registered_by`         INT UNSIGNED NULL,
  `attendance_percentage` DECIMAL(5,2) NULL COMMENT 'Snapshot at registration time',
  `is_eligible`           TINYINT(1) NOT NULL DEFAULT 1,
  `eligibility_reason`    VARCHAR(255) NULL,
  `exemption_granted`     TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'Authorised 75% waiver',
  `exemption_by`          INT UNSIGNED NULL,
  `exemption_reason`      VARCHAR(255) NULL,
  `hall_ticket_no`        VARCHAR(30) NULL,
  `hall_ticket_issued_at` DATETIME NULL,
  `status`                ENUM('REGISTERED','VERIFIED','REJECTED','CANCELLED','ABSENT','APPEARED') NOT NULL DEFAULT 'REGISTERED',
  PRIMARY KEY (`registration_id`),
  UNIQUE KEY `uq_exam_reg` (`exam_id`, `student_id`, `offering_id`),
  UNIQUE KEY `uq_exam_hall_ticket` (`hall_ticket_no`),
  KEY `idx_exam_reg_student` (`student_id`),
  KEY `idx_exam_reg_exam` (`exam_id`),
  CONSTRAINT `fk_er_exam` FOREIGN KEY (`exam_id`)
    REFERENCES `exams` (`exam_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_er_student` FOREIGN KEY (`student_id`)
    REFERENCES `students` (`student_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_er_offering` FOREIGN KEY (`offering_id`)
    REFERENCES `course_offerings` (`offering_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_er_schedule` FOREIGN KEY (`schedule_id`)
    REFERENCES `exam_schedules` (`schedule_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_er_registered_by` FOREIGN KEY (`registered_by`)
    REFERENCES `users` (`user_id`) ON DELETE SET NULL,
  CONSTRAINT `chk_er_attendance` CHECK (`attendance_percentage` IS NULL OR (`attendance_percentage` BETWEEN 0 AND 100))
) ENGINE=InnoDB COMMENT='G4: exam registration. Trigger blocks <75%% attendance.';

-- -------------------------------------------------------------------------------------
-- 4.4 marks  (marks per exam registration; grade computed by trigger)
-- -------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `marks` (
  `mark_id`         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `registration_id` INT UNSIGNED NOT NULL,
  `marks_obtained`  DECIMAL(6,2) NOT NULL DEFAULT 0.00,
  `max_marks`       SMALLINT UNSIGNED NOT NULL DEFAULT 100,
  `percentage`      DECIMAL(5,2) NULL,
  `grade`           VARCHAR(4)   NULL,
  `grade_points`    DECIMAL(4,2) NULL,
  `is_absent`       TINYINT(1)   NOT NULL DEFAULT 0,
  `is_pass`         TINYINT(1)   NOT NULL DEFAULT 1,
  `entered_by`      INT UNSIGNED NULL,
  `entered_on`      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `remarks`         VARCHAR(255) NULL,
  PRIMARY KEY (`mark_id`),
  UNIQUE KEY `uq_marks_registration` (`registration_id`),
  KEY `idx_marks_grade` (`grade`),
  CONSTRAINT `fk_marks_registration` FOREIGN KEY (`registration_id`)
    REFERENCES `exam_registrations` (`registration_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_marks_entered_by` FOREIGN KEY (`entered_by`)
    REFERENCES `users` (`user_id`) ON DELETE SET NULL,
  CONSTRAINT `chk_marks_range` CHECK (`marks_obtained` >= 0 AND `marks_obtained` <= `max_marks`)
) ENGINE=InnoDB COMMENT='G4: marks entry. Grade/grade points derived by trigger.';

-- -------------------------------------------------------------------------------------
-- 4.5 results  (one published semester result per student: SGPA + status)
-- -------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `results` (
  `result_id`      INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `student_id`     INT UNSIGNED NOT NULL,
  `semester_id`    SMALLINT UNSIGNED NOT NULL,
  `exam_id`        SMALLINT UNSIGNED NULL,
  `sgpa`           DECIMAL(4,2) NOT NULL DEFAULT 0.00,
  `cgpa`           DECIMAL(4,2) NOT NULL DEFAULT 0.00 COMMENT 'Snapshot of fn_calculate_student_cgpa()',
  `total_credits`  SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  `earned_credits` SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  `backlog_count`  TINYINT UNSIGNED NOT NULL DEFAULT 0,
  `result_status`  ENUM('PASS','FAIL','PROMOTED','WITHHELD') NOT NULL DEFAULT 'PASS',
  `remarks`        VARCHAR(255) NULL,
  `published_on`   DATETIME     NULL,
  `published_by`   INT UNSIGNED NULL,
  `created_at`     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`result_id`),
  UNIQUE KEY `uq_results_student_semester` (`student_id`, `semester_id`),
  KEY `idx_results_semester` (`semester_id`),
  KEY `idx_results_sgpa` (`sgpa`),
  CONSTRAINT `fk_results_student` FOREIGN KEY (`student_id`)
    REFERENCES `students` (`student_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_results_semester` FOREIGN KEY (`semester_id`)
    REFERENCES `semesters` (`semester_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_results_exam` FOREIGN KEY (`exam_id`)
    REFERENCES `exams` (`exam_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_results_published_by` FOREIGN KEY (`published_by`)
    REFERENCES `users` (`user_id`) ON DELETE SET NULL,
  CONSTRAINT `chk_results_sgpa` CHECK (`sgpa` BETWEEN 0 AND 10),
  CONSTRAINT `chk_results_cgpa` CHECK (`cgpa` BETWEEN 0 AND 10)
) ENGINE=InnoDB COMMENT='G4: published semester result with SGPA / CGPA / backlogs.';

-- =====================================================================================
-- MODULE 5 (GROUP 5) - FEES & FINANCE MANAGEMENT
-- Tables : fee_structures, student_fees, payments, scholarships, student_scholarships,
--          fines, refunds, transactions
-- =====================================================================================

-- -------------------------------------------------------------------------------------
-- 5.1 fee_structures  (program + semester + category fee template)
-- -------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `fee_structures` (
  `fee_structure_id` SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `fee_code`         VARCHAR(30) NOT NULL COMMENT 'FS-BTECH-ETC-S3-GEN',
  `program_id`       SMALLINT UNSIGNED NOT NULL,
  `semester_no`      TINYINT UNSIGNED NOT NULL,
  `academic_year_id` SMALLINT UNSIGNED NOT NULL,
  `category_id`      TINYINT UNSIGNED NULL COMMENT 'NULL => applies to all categories',
  `tuition_fee`      DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `hostel_fee`       DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `exam_fee`         DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `library_fee`      DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `lab_fee`          DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `development_fee`  DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `other_fee`        DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `late_fee_per_day` DECIMAL(8,2)  NOT NULL DEFAULT 50.00,
  `grace_days`       SMALLINT UNSIGNED NOT NULL DEFAULT 10,
  `due_date`         DATE NOT NULL,
  `status`           ENUM('ACTIVE','INACTIVE') NOT NULL DEFAULT 'ACTIVE',
  `created_at`       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`fee_structure_id`),
  UNIQUE KEY `uq_fee_structures_code` (`fee_code`),
  UNIQUE KEY `uq_fee_structures_key` (`program_id`, `semester_no`, `academic_year_id`, `category_id`),
  KEY `idx_fee_structures_program` (`program_id`),
  CONSTRAINT `fk_fee_structures_program` FOREIGN KEY (`program_id`)
    REFERENCES `programs` (`program_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_fee_structures_year` FOREIGN KEY (`academic_year_id`)
    REFERENCES `academic_years` (`academic_year_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_fee_structures_category` FOREIGN KEY (`category_id`)
    REFERENCES `categories` (`category_id`) ON DELETE SET NULL,
  CONSTRAINT `chk_fee_structures_nonneg` CHECK (`tuition_fee` >= 0 AND `hostel_fee` >= 0
        AND `exam_fee` >= 0 AND `library_fee` >= 0 AND `lab_fee` >= 0
        AND `development_fee` >= 0 AND `other_fee` >= 0)
) ENGINE=InnoDB COMMENT='G5: fee template per program/semester/category.';

-- -------------------------------------------------------------------------------------
-- 5.2 student_fees  (a fee bill raised against one student for one semester)
-- -------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `student_fees` (
  `student_fee_id`      INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `student_id`          INT UNSIGNED NOT NULL,
  `fee_structure_id`    SMALLINT UNSIGNED NOT NULL,
  `semester_id`         SMALLINT UNSIGNED NOT NULL,
  `academic_year_id`    SMALLINT UNSIGNED NOT NULL,
  `total_amount`        DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `scholarship_amount`  DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `discount_amount`     DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `fine_amount`         DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `paid_amount`         DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `due_amount`          DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `status`  ENUM('PENDING','PARTIAL','PAID','OVERDUE','REFUNDED') NOT NULL DEFAULT 'PENDING',
  `due_date` DATE NOT NULL,
  `paid_on`  DATETIME NULL,
  `remarks`  VARCHAR(255) NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`student_fee_id`),
  UNIQUE KEY `uq_student_fees` (`student_id`, `fee_structure_id`, `semester_id`),
  KEY `idx_student_fees_status`  (`status`),
  KEY `idx_student_fees_due`     (`due_date`),
  KEY `idx_student_fees_semester`(`semester_id`),
  CONSTRAINT `fk_student_fees_student` FOREIGN KEY (`student_id`)
    REFERENCES `students` (`student_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_student_fees_structure` FOREIGN KEY (`fee_structure_id`)
    REFERENCES `fee_structures` (`fee_structure_id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_student_fees_semester` FOREIGN KEY (`semester_id`)
    REFERENCES `semesters` (`semester_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_student_fees_year` FOREIGN KEY (`academic_year_id`)
    REFERENCES `academic_years` (`academic_year_id`) ON DELETE CASCADE,
  CONSTRAINT `chk_student_fees_amounts` CHECK (`total_amount` >= 0 AND `paid_amount` >= 0
        AND `due_amount` >= 0 AND `fine_amount` >= 0 AND `scholarship_amount` >= 0
        AND `discount_amount` >= 0),
  CONSTRAINT `chk_student_fees_paid_limit` CHECK (`paid_amount` <= `total_amount`)
) ENGINE=InnoDB COMMENT='G5: fee ledger head per student per semester.';

-- -------------------------------------------------------------------------------------
-- 5.3 payments  (money received; generates a receipt + ledger transaction)
-- -------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `payments` (
  `payment_id`     INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `receipt_no`     VARCHAR(30)  NOT NULL COMMENT 'RCP-2026-000001',
  `transaction_id` VARCHAR(60)  NOT NULL COMMENT 'Gateway / bank reference, UNIQUE',
  `student_fee_id` INT UNSIGNED NOT NULL,
  `student_id`     INT UNSIGNED NOT NULL,
  `amount`         DECIMAL(10,2) NOT NULL,
  `payment_mode`   ENUM('CASH','CARD','UPI','NETBANKING','CHEQUE','DD','ONLINE','SCHOLARSHIP') NOT NULL DEFAULT 'ONLINE',
  `payment_date`   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `status`         ENUM('SUCCESS','PENDING','FAILED','REFUNDED') NOT NULL DEFAULT 'SUCCESS',
  `reference_no`   VARCHAR(60)  NULL,
  `received_by`    INT UNSIGNED NULL,
  `remarks`        VARCHAR(255) NULL,
  `created_at`     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`payment_id`),
  UNIQUE KEY `uq_payments_receipt` (`receipt_no`),
  UNIQUE KEY `uq_payments_txn` (`transaction_id`),
  KEY `idx_payments_student` (`student_id`),
  KEY `idx_payments_fee`    (`student_fee_id`),
  KEY `idx_payments_date`   (`payment_date`),
  CONSTRAINT `fk_payments_fee` FOREIGN KEY (`student_fee_id`)
    REFERENCES `student_fees` (`student_fee_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_payments_student` FOREIGN KEY (`student_id`)
    REFERENCES `students` (`student_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_payments_receiver` FOREIGN KEY (`received_by`)
    REFERENCES `users` (`user_id`) ON DELETE SET NULL,
  CONSTRAINT `chk_payments_amount` CHECK (`amount` > 0)
) ENGINE=InnoDB COMMENT='G5: payment receipt. Trigger updates student_fees status.';

-- -------------------------------------------------------------------------------------
-- 5.4 scholarships  (scholarship master) and 5.5 student_scholarships (awards)
-- -------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `scholarships` (
  `scholarship_id`   SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `scholarship_code` VARCHAR(20) NOT NULL,
  `name`             VARCHAR(150) NOT NULL,
  `provider`         VARCHAR(120) NOT NULL,
  `scholarship_type` ENUM('MERIT','NEED','SPORTS','GOVERNMENT','MINORITY','OTHER') NOT NULL DEFAULT 'MERIT',
  `amount`           DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `is_percentage`    TINYINT(1) NOT NULL DEFAULT 0 COMMENT '1 => amount is a % of tuition',
  `criteria`         VARCHAR(500) NULL,
  `max_beneficiaries` SMALLINT UNSIGNED NULL,
  `academic_year_id` SMALLINT UNSIGNED NOT NULL,
  `status`           ENUM('ACTIVE','INACTIVE') NOT NULL DEFAULT 'ACTIVE',
  PRIMARY KEY (`scholarship_id`),
  UNIQUE KEY `uq_scholarships_code` (`scholarship_code`),
  CONSTRAINT `fk_scholarships_year` FOREIGN KEY (`academic_year_id`)
    REFERENCES `academic_years` (`academic_year_id`) ON DELETE CASCADE,
  CONSTRAINT `chk_scholarships_amount` CHECK (`amount` >= 0)
) ENGINE=InnoDB COMMENT='G5: scholarship master.';

CREATE TABLE IF NOT EXISTS `student_scholarships` (
  `student_scholarship_id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `student_id`        INT UNSIGNED NOT NULL,
  `scholarship_id`    SMALLINT UNSIGNED NOT NULL,
  `academic_year_id`  SMALLINT UNSIGNED NOT NULL,
  `amount`            DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `sanctioned_on`     DATE NOT NULL DEFAULT (CURRENT_DATE),
  `sanctioned_by`     INT UNSIGNED NULL,
  `status`            ENUM('APPLIED','APPROVED','REJECTED','CREDITED') NOT NULL DEFAULT 'APPROVED',
  `remarks`           VARCHAR(255) NULL,
  PRIMARY KEY (`student_scholarship_id`),
  UNIQUE KEY `uq_student_scholarships` (`student_id`, `scholarship_id`, `academic_year_id`),
  KEY `idx_ss_student` (`student_id`),
  CONSTRAINT `fk_ss_student` FOREIGN KEY (`student_id`)
    REFERENCES `students` (`student_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_ss_scholarship` FOREIGN KEY (`scholarship_id`)
    REFERENCES `scholarships` (`scholarship_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_ss_year` FOREIGN KEY (`academic_year_id`)
    REFERENCES `academic_years` (`academic_year_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_ss_user` FOREIGN KEY (`sanctioned_by`)
    REFERENCES `users` (`user_id`) ON DELETE SET NULL,
  CONSTRAINT `chk_ss_amount` CHECK (`amount` >= 0)
) ENGINE=InnoDB COMMENT='G5: scholarship awarded to a student for a year.';

-- -------------------------------------------------------------------------------------
-- 5.6 fines  (library fine, hostel damage, discipline, late fee...)
-- -------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `fines` (
  `fine_id`         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `student_id`      INT UNSIGNED NOT NULL,
  `student_fee_id`  INT UNSIGNED NULL,
  `reason`          VARCHAR(255) NOT NULL,
  `fine_type`       ENUM('LATE_FEE','LIBRARY','HOSTEL_DAMAGE','DISCIPLINE','EXAM_MALPRACTICE','OTHER') NOT NULL DEFAULT 'OTHER',
  `amount`          DECIMAL(10,2) NOT NULL,
  `imposed_on`      DATE NOT NULL DEFAULT (CURRENT_DATE),
  `imposed_by`      INT UNSIGNED NULL,
  `status`          ENUM('PENDING','PAID','WAIVED') NOT NULL DEFAULT 'PENDING',
  `remarks`         VARCHAR(255) NULL,
  PRIMARY KEY (`fine_id`),
  KEY `idx_fines_student` (`student_id`),
  CONSTRAINT `fk_fines_student` FOREIGN KEY (`student_id`)
    REFERENCES `students` (`student_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_fines_fee` FOREIGN KEY (`student_fee_id`)
    REFERENCES `student_fees` (`student_fee_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_fines_user` FOREIGN KEY (`imposed_by`)
    REFERENCES `users` (`user_id`) ON DELETE SET NULL,
  CONSTRAINT `chk_fines_amount` CHECK (`amount` > 0)
) ENGINE=InnoDB COMMENT='G5: fines raised against students.';

-- -------------------------------------------------------------------------------------
-- 5.7 refunds  (money returned to a student)
-- -------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `refunds` (
  `refund_id`     INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `payment_id`    INT UNSIGNED NOT NULL,
  `student_id`    INT UNSIGNED NOT NULL,
  `amount`        DECIMAL(10,2) NOT NULL,
  `reason`        VARCHAR(255) NOT NULL,
  `refund_mode`   ENUM('CASH','UPI','NETBANKING','CHEQUE') NOT NULL DEFAULT 'NETBANKING',
  `refund_date`   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `status`        ENUM('INITIATED','PROCESSED','REJECTED') NOT NULL DEFAULT 'INITIATED',
  `processed_by`  INT UNSIGNED NULL,
  `remarks`       VARCHAR(255) NULL,
  PRIMARY KEY (`refund_id`),
  KEY `idx_refunds_student` (`student_id`),
  CONSTRAINT `fk_refunds_payment` FOREIGN KEY (`payment_id`)
    REFERENCES `payments` (`payment_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_refunds_student` FOREIGN KEY (`student_id`)
    REFERENCES `students` (`student_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_refunds_user` FOREIGN KEY (`processed_by`)
    REFERENCES `users` (`user_id`) ON DELETE SET NULL,
  CONSTRAINT `chk_refunds_amount` CHECK (`amount` > 0)
) ENGINE=InnoDB COMMENT='G5: refund processing.';

-- -------------------------------------------------------------------------------------
-- 5.8 transactions  (double-entry style ledger - auto written by payment trigger)
-- -------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `transactions` (
  `transaction_id`  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `student_fee_id`  INT UNSIGNED NOT NULL,
  `payment_id`      INT UNSIGNED NULL,
  `student_id`      INT UNSIGNED NOT NULL,
  `txn_type`        ENUM('DEBIT','CREDIT') NOT NULL,
  `amount`          DECIMAL(10,2) NOT NULL,
  `balance_after`   DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `description`     VARCHAR(255) NULL,
  `created_at`      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`transaction_id`),
  KEY `idx_txn_student` (`student_id`),
  KEY `idx_txn_fee` (`student_fee_id`),
  CONSTRAINT `fk_txn_fee` FOREIGN KEY (`student_fee_id`)
    REFERENCES `student_fees` (`student_fee_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_txn_payment` FOREIGN KEY (`payment_id`)
    REFERENCES `payments` (`payment_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_txn_student` FOREIGN KEY (`student_id`)
    REFERENCES `students` (`student_id`) ON DELETE CASCADE,
  CONSTRAINT `chk_txn_amount` CHECK (`amount` >= 0)
) ENGINE=InnoDB COMMENT='G5: financial ledger, every payment/refund posts an entry.';

-- =====================================================================================
-- MODULE 6 (GROUP 6) - HOSTEL MANAGEMENT
-- Tables : hostels, hostel_blocks, rooms, beds, hostel_applications, room_allocations,
--          room_transfers, hostel_fees
-- =====================================================================================

CREATE TABLE IF NOT EXISTS `hostels` (
  `hostel_id`    SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `hostel_code`  VARCHAR(20)  NOT NULL,
  `name`         VARCHAR(120) NOT NULL,
  `hostel_type`  ENUM('BOYS','GIRLS','CO_ED') NOT NULL DEFAULT 'BOYS',
  `warden_faculty_id` INT UNSIGNED NULL COMMENT 'FK -> faculty.faculty_id (added in 03)',
  `address`      VARCHAR(255) NULL,
  `contact_no`   VARCHAR(20)  NULL,
  `total_rooms`  SMALLINT UNSIGNED NOT NULL DEFAULT 0 COMMENT 'Maintained by trigger',
  `total_beds`   SMALLINT UNSIGNED NOT NULL DEFAULT 0 COMMENT 'Maintained by trigger',
  `occupied_beds` SMALLINT UNSIGNED NOT NULL DEFAULT 0 COMMENT 'Maintained by trigger',
  `rent_per_bed` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `status`       ENUM('ACTIVE','MAINTENANCE','CLOSED') NOT NULL DEFAULT 'ACTIVE',
  `created_at`   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`hostel_id`),
  UNIQUE KEY `uq_hostels_code` (`hostel_code`),
  CONSTRAINT `chk_hostels_rent` CHECK (`rent_per_bed` >= 0),
  CONSTRAINT `chk_hostels_occupancy` CHECK (`occupied_beds` <= `total_beds`)
) ENGINE=InnoDB COMMENT='G6: hostel master with live occupancy counters.';

CREATE TABLE IF NOT EXISTS `hostel_blocks` (
  `block_id`   SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `hostel_id`  SMALLINT UNSIGNED NOT NULL,
  `block_code` VARCHAR(10) NOT NULL COMMENT 'A, B, C',
  `name`       VARCHAR(80)  NOT NULL,
  `floors`     TINYINT UNSIGNED NOT NULL DEFAULT 1,
  `status`     ENUM('ACTIVE','MAINTENANCE','CLOSED') NOT NULL DEFAULT 'ACTIVE',
  PRIMARY KEY (`block_id`),
  UNIQUE KEY `uq_hostel_blocks` (`hostel_id`, `block_code`),
  CONSTRAINT `fk_blocks_hostel` FOREIGN KEY (`hostel_id`)
    REFERENCES `hostels` (`hostel_id`) ON DELETE CASCADE
) ENGINE=InnoDB COMMENT='G6: blocks (wings) inside a hostel.';

CREATE TABLE IF NOT EXISTS `rooms` (
  `room_id`      INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `hostel_id`    SMALLINT UNSIGNED NOT NULL,
  `block_id`     SMALLINT UNSIGNED NOT NULL,
  `room_number`  VARCHAR(10)  NOT NULL COMMENT 'UNIQUE within hostel',
  `floor`        TINYINT UNSIGNED NOT NULL DEFAULT 0,
  `room_type`    ENUM('SINGLE','DOUBLE','TRIPLE','SHARED') NOT NULL DEFAULT 'DOUBLE',
  `capacity`     TINYINT UNSIGNED NOT NULL DEFAULT 2,
  `occupied_count` TINYINT UNSIGNED NOT NULL DEFAULT 0 COMMENT 'Maintained by trigger',
  `rent_per_bed` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `status`       ENUM('AVAILABLE','FULL','MAINTENANCE','RESERVED') NOT NULL DEFAULT 'AVAILABLE',
  PRIMARY KEY (`room_id`),
  UNIQUE KEY `uq_rooms_hostel_number` (`hostel_id`, `room_number`),
  KEY `idx_rooms_block` (`block_id`),
  KEY `idx_rooms_status` (`status`),
  CONSTRAINT `fk_rooms_hostel` FOREIGN KEY (`hostel_id`)
    REFERENCES `hostels` (`hostel_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_rooms_block` FOREIGN KEY (`block_id`)
    REFERENCES `hostel_blocks` (`block_id`) ON DELETE CASCADE,
  CONSTRAINT `chk_rooms_capacity` CHECK (`capacity` BETWEEN 1 AND 6),
  CONSTRAINT `chk_rooms_occupied` CHECK (`occupied_count` <= `capacity`),
  CONSTRAINT `chk_rooms_rent` CHECK (`rent_per_bed` >= 0)
) ENGINE=InnoDB COMMENT='G6: rooms with capacity automatically maintained by triggers.';

CREATE TABLE IF NOT EXISTS `beds` (
  `bed_id`    INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `room_id`   INT UNSIGNED NOT NULL,
  `bed_code`  VARCHAR(10) NOT NULL COMMENT 'A, B, C or 1, 2',
  `status`    ENUM('AVAILABLE','OCCUPIED','RESERVED','MAINTENANCE') NOT NULL DEFAULT 'AVAILABLE',
  `remarks`   VARCHAR(255) NULL,
  PRIMARY KEY (`bed_id`),
  UNIQUE KEY `uq_beds_room_code` (`room_id`, `bed_code`),
  KEY `idx_beds_status` (`status`),
  KEY `idx_beds_room` (`room_id`),
  CONSTRAINT `fk_beds_room` FOREIGN KEY (`room_id`)
    REFERENCES `rooms` (`room_id`) ON DELETE CASCADE
) ENGINE=InnoDB COMMENT='G6: individual beds; allocation flips status to OCCUPIED.';

CREATE TABLE IF NOT EXISTS `hostel_applications` (
  `application_id`  INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `application_no`  VARCHAR(30) NOT NULL,
  `student_id`      INT UNSIGNED NOT NULL,
  `hostel_id`       SMALLINT UNSIGNED NOT NULL,
  `academic_year_id` SMALLINT UNSIGNED NOT NULL,
  `room_type_pref`  ENUM('SINGLE','DOUBLE','TRIPLE','SHARED') NOT NULL DEFAULT 'DOUBLE',
  `applied_on`      DATE NOT NULL DEFAULT (CURRENT_DATE),
  `status`          ENUM('APPLIED','APPROVED','REJECTED','WAITLISTED','CANCELLED') NOT NULL DEFAULT 'APPLIED',
  `reviewed_by`     INT UNSIGNED NULL,
  `reviewed_on`     DATETIME NULL,
  `remarks`         VARCHAR(255) NULL,
  PRIMARY KEY (`application_id`),
  UNIQUE KEY `uq_hostel_applications_no` (`application_no`),
  UNIQUE KEY `uq_hostel_applications_student_year` (`student_id`, `academic_year_id`),
  KEY `idx_happlications_hostel` (`hostel_id`),
  CONSTRAINT `fk_ha_student` FOREIGN KEY (`student_id`)
    REFERENCES `students` (`student_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_ha_hostel` FOREIGN KEY (`hostel_id`)
    REFERENCES `hostels` (`hostel_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_ha_year` FOREIGN KEY (`academic_year_id`)
    REFERENCES `academic_years` (`academic_year_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_ha_reviewer` FOREIGN KEY (`reviewed_by`)
    REFERENCES `users` (`user_id`) ON DELETE SET NULL
) ENGINE=InnoDB COMMENT='G6: hostel seat application workflow.';

CREATE TABLE IF NOT EXISTS `room_allocations` (
  `allocation_id`   INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `student_id`      INT UNSIGNED NOT NULL,
  `bed_id`          INT UNSIGNED NOT NULL,
  `room_id`         INT UNSIGNED NOT NULL,
  `hostel_id`       SMALLINT UNSIGNED NOT NULL,
  `academic_year_id` SMALLINT UNSIGNED NOT NULL,
  `allocated_on`    DATE NOT NULL DEFAULT (CURRENT_DATE),
  `allocated_by`    INT UNSIGNED NULL,
  `vacated_on`      DATE NULL,
  `rent_amount`     DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `status`          ENUM('ACTIVE','VACATED','TRANSFERRED') NOT NULL DEFAULT 'ACTIVE',
  `remarks`         VARCHAR(255) NULL,
  -- Business rule: a bed may be occupied by at most one ACTIVE resident per
  -- academic year. A plain UNIQUE (bed_id, academic_year_id) would also block
  -- re-letting a bed after a resident vacates it, so the key is built on a
  -- generated column that is NULL unless the allocation is ACTIVE - unique
  -- indexes ignore NULLs, so historical VACATED rows never collide.
  -- (Works on MySQL 8 and MariaDB 5.2+. This is the "partial unique index"
  --  idiom for MySQL because it has no CREATE UNIQUE INDEX ... WHERE.)
  `active_bed_year` VARCHAR(32) AS (IF(`status` = 'ACTIVE',
                                    CONCAT(`bed_id`, '-', `academic_year_id`), NULL)) VIRTUAL,
  PRIMARY KEY (`allocation_id`),
  UNIQUE KEY `uq_allocations_bed_year` (`active_bed_year`),
  KEY `idx_allocations_student` (`student_id`),
  KEY `idx_allocations_bed` (`bed_id`, `academic_year_id`),
  KEY `idx_allocations_hostel` (`hostel_id`),
  KEY `idx_allocations_status` (`status`),
  CONSTRAINT `fk_ra_student` FOREIGN KEY (`student_id`)
    REFERENCES `students` (`student_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_ra_bed` FOREIGN KEY (`bed_id`)
    REFERENCES `beds` (`bed_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_ra_room` FOREIGN KEY (`room_id`)
    REFERENCES `rooms` (`room_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_ra_hostel` FOREIGN KEY (`hostel_id`)
    REFERENCES `hostels` (`hostel_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_ra_year` FOREIGN KEY (`academic_year_id`)
    REFERENCES `academic_years` (`academic_year_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_ra_allocator` FOREIGN KEY (`allocated_by`)
    REFERENCES `users` (`user_id`) ON DELETE SET NULL,
  CONSTRAINT `chk_ra_rent` CHECK (`rent_amount` >= 0)
) ENGINE=InnoDB COMMENT='G6: bed allocation. Triggers maintain bed/room/hostel occupancy.';

CREATE TABLE IF NOT EXISTS `room_transfers` (
  `transfer_id`   INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `student_id`    INT UNSIGNED NOT NULL,
  `from_bed_id`   INT UNSIGNED NOT NULL,
  `to_bed_id`     INT UNSIGNED NOT NULL,
  `reason`        VARCHAR(255) NOT NULL,
  `transferred_on` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `approved_by`   INT UNSIGNED NULL,
  PRIMARY KEY (`transfer_id`),
  KEY `idx_transfers_student` (`student_id`),
  CONSTRAINT `fk_rt_student` FOREIGN KEY (`student_id`)
    REFERENCES `students` (`student_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_rt_from_bed` FOREIGN KEY (`from_bed_id`)
    REFERENCES `beds` (`bed_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_rt_to_bed` FOREIGN KEY (`to_bed_id`)
    REFERENCES `beds` (`bed_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_rt_approver` FOREIGN KEY (`approved_by`)
    REFERENCES `users` (`user_id`) ON DELETE SET NULL,
  CONSTRAINT `chk_rt_beds_differ` CHECK (`from_bed_id` <> `to_bed_id`)
) ENGINE=InnoDB COMMENT='G6: room transfer history.';

CREATE TABLE IF NOT EXISTS `hostel_fees` (
  `hostel_fee_id`   INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `allocation_id`   INT UNSIGNED NOT NULL,
  `student_id`      INT UNSIGNED NOT NULL,
  `academic_year_id` SMALLINT UNSIGNED NOT NULL,
  `amount`          DECIMAL(10,2) NOT NULL,
  `paid_amount`     DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `due_date`        DATE NOT NULL,
  `status`          ENUM('PENDING','PARTIAL','PAID','OVERDUE') NOT NULL DEFAULT 'PENDING',
  `created_at`      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`hostel_fee_id`),
  UNIQUE KEY `uq_hostel_fees_allocation` (`allocation_id`),
  KEY `idx_hostel_fees_student` (`student_id`),
  CONSTRAINT `fk_hf_allocation` FOREIGN KEY (`allocation_id`)
    REFERENCES `room_allocations` (`allocation_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_hf_student` FOREIGN KEY (`student_id`)
    REFERENCES `students` (`student_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_hf_year` FOREIGN KEY (`academic_year_id`)
    REFERENCES `academic_years` (`academic_year_id`) ON DELETE CASCADE,
  CONSTRAINT `chk_hf_amount` CHECK (`amount` >= 0 AND `paid_amount` >= 0)
) ENGINE=InnoDB COMMENT='G6: hostel rent billed per allocation.';

-- =====================================================================================
-- MODULE 7 (GROUP 7) - FACULTY, LEAVE & PAYROLL MANAGEMENT
-- Tables : designations, faculty, faculty_leaves, leave_balances, payrolls,
--          payroll_components
-- =====================================================================================

CREATE TABLE IF NOT EXISTS `designations` (
  `designation_id`   SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `designation_code` VARCHAR(20) NOT NULL COMMENT 'PROF, ASP, AP, LECT',
  `title`            VARCHAR(80) NOT NULL,
  `grade`            VARCHAR(20) NULL,
  `min_basic_pay`    DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  `max_basic_pay`    DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  `teaching_hours_per_week` TINYINT UNSIGNED NOT NULL DEFAULT 16,
  PRIMARY KEY (`designation_id`),
  UNIQUE KEY `uq_designations_code` (`designation_code`),
  CONSTRAINT `chk_designations_pay` CHECK (`max_basic_pay` >= `min_basic_pay`)
) ENGINE=InnoDB COMMENT='G7: designation master (Professor, Asst. Professor...).';

CREATE TABLE IF NOT EXISTS `faculty` (
  `faculty_id`      INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id`         INT UNSIGNED NOT NULL COMMENT 'Login account (role = FACULTY)',
  `employee_code`   VARCHAR(20)  NOT NULL COMMENT 'EMP-0001',
  `first_name`      VARCHAR(80)  NOT NULL,
  `last_name`       VARCHAR(80)  NOT NULL,
  `email`           VARCHAR(150) NOT NULL,
  `phone`           VARCHAR(20)  NULL,
  `date_of_birth`   DATE         NOT NULL,
  `gender`          ENUM('MALE','FEMALE','OTHER') NOT NULL,
  `designation_id`  SMALLINT UNSIGNED NOT NULL,
  `department_id`   INT UNSIGNED NOT NULL,
  `joining_date`    DATE         NOT NULL,
  `employment_type` ENUM('REGULAR','CONTRACT','VISITING','ADJUNCT') NOT NULL DEFAULT 'REGULAR',
  `qualification`   VARCHAR(150) NULL,
  `specialization`  VARCHAR(150) NULL,
  `experience_years` TINYINT UNSIGNED NOT NULL DEFAULT 0,
  `basic_salary`    DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  `hra`             DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  `da`              DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  `ta`              DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  `special_allowance` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  `pf_percent`      DECIMAL(5,2)  NOT NULL DEFAULT 12.00,
  `bank_account`    VARCHAR(30)  NULL,
  `status`          ENUM('ACTIVE','ON_LEAVE','RESIGNED','RETIRED','SUSPENDED') NOT NULL DEFAULT 'ACTIVE',
  `created_at`      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`faculty_id`),
  UNIQUE KEY `uq_faculty_employee_code` (`employee_code`),
  UNIQUE KEY `uq_faculty_email` (`email`),
  UNIQUE KEY `uq_faculty_user` (`user_id`),
  KEY `idx_faculty_department` (`department_id`),
  KEY `idx_faculty_designation` (`designation_id`),
  KEY `idx_faculty_status` (`status`),
  CONSTRAINT `fk_faculty_user` FOREIGN KEY (`user_id`)
    REFERENCES `users` (`user_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_faculty_designation` FOREIGN KEY (`designation_id`)
    REFERENCES `designations` (`designation_id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_faculty_department` FOREIGN KEY (`department_id`)
    REFERENCES `departments` (`department_id`) ON DELETE RESTRICT,
  CONSTRAINT `chk_faculty_salary` CHECK (`basic_salary` >= 0 AND `hra` >= 0 AND `da` >= 0
        AND `ta` >= 0 AND `special_allowance` >= 0),
  CONSTRAINT `chk_faculty_pf` CHECK (`pf_percent` BETWEEN 0 AND 25)
  -- date_of_birth validation is enforced by trg_faculty_validate_dob (see 06_triggers.sql)
) ENGINE=InnoDB COMMENT='G7: single faculty master for attendance, exams and payroll.';

CREATE TABLE IF NOT EXISTS `faculty_leaves` (
  `leave_id`     INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `faculty_id`   INT UNSIGNED NOT NULL,
  `leave_type`   ENUM('CASUAL','SICK','EARNED','MATERNITY','PATERNITY','UNPAID','ON_DUTY') NOT NULL DEFAULT 'CASUAL',
  `start_date`   DATE NOT NULL,
  `end_date`     DATE NOT NULL,
  `days`         TINYINT UNSIGNED NOT NULL DEFAULT 1,
  `reason`       VARCHAR(500) NOT NULL,
  `applied_on`   DATE NOT NULL DEFAULT (CURRENT_DATE),
  `status`       ENUM('PENDING','APPROVED','REJECTED','CANCELLED') NOT NULL DEFAULT 'PENDING',
  `approved_by`  INT UNSIGNED NULL,
  `approved_on`  DATETIME NULL,
  `remarks`      VARCHAR(255) NULL,
  PRIMARY KEY (`leave_id`),
  KEY `idx_leaves_faculty` (`faculty_id`, `status`),
  KEY `idx_leaves_dates` (`start_date`, `end_date`),
  CONSTRAINT `fk_leaves_faculty` FOREIGN KEY (`faculty_id`)
    REFERENCES `faculty` (`faculty_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_leaves_approver` FOREIGN KEY (`approved_by`)
    REFERENCES `users` (`user_id`) ON DELETE SET NULL,
  CONSTRAINT `chk_leaves_dates` CHECK (`end_date` >= `start_date`),
  CONSTRAINT `chk_leaves_days` CHECK (`days` BETWEEN 1 AND 180)
) ENGINE=InnoDB COMMENT='G7: leave application and approval workflow.';

CREATE TABLE IF NOT EXISTS `leave_balances` (
  `balance_id`       INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `faculty_id`       INT UNSIGNED NOT NULL,
  `academic_year_id` SMALLINT UNSIGNED NOT NULL,
  `leave_type`       ENUM('CASUAL','SICK','EARNED','MATERNITY','PATERNITY','UNPAID','ON_DUTY') NOT NULL,
  `allotted`         TINYINT UNSIGNED NOT NULL DEFAULT 0,
  `used`             TINYINT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (`balance_id`),
  UNIQUE KEY `uq_leave_balances` (`faculty_id`, `academic_year_id`, `leave_type`),
  CONSTRAINT `fk_lb_faculty` FOREIGN KEY (`faculty_id`)
    REFERENCES `faculty` (`faculty_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_lb_year` FOREIGN KEY (`academic_year_id`)
    REFERENCES `academic_years` (`academic_year_id`) ON DELETE CASCADE,
  CONSTRAINT `chk_lb_used` CHECK (`used` >= 0)
) ENGINE=InnoDB COMMENT='G7: leave balance ledger, updated by approval trigger.';

CREATE TABLE IF NOT EXISTS `payrolls` (
  `payroll_id`       INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `faculty_id`       INT UNSIGNED NOT NULL,
  `pay_month`        TINYINT UNSIGNED NOT NULL COMMENT '1..12',
  `pay_year`         SMALLINT UNSIGNED NOT NULL,
  `basic`            DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  `hra`              DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  `da`               DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  `ta`               DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  `special_allowance` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  `gross_salary`     DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  `pf_deduction`     DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  `professional_tax` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  `income_tax`       DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  `lop_days`         TINYINT UNSIGNED NOT NULL DEFAULT 0 COMMENT 'Loss of pay days',
  `lop_amount`       DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  `other_deduction`  DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  `net_salary`       DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  `working_days`     TINYINT UNSIGNED NOT NULL DEFAULT 30,
  `status`           ENUM('DRAFT','GENERATED','APPROVED','PAID') NOT NULL DEFAULT 'DRAFT',
  `generated_on`     DATETIME NULL,
  `paid_on`          DATE NULL,
  `remarks`          VARCHAR(255) NULL,
  PRIMARY KEY (`payroll_id`),
  UNIQUE KEY `uq_payrolls_faculty_month` (`faculty_id`, `pay_month`, `pay_year`),
  KEY `idx_payrolls_period` (`pay_year`, `pay_month`),
  CONSTRAINT `fk_payrolls_faculty` FOREIGN KEY (`faculty_id`)
    REFERENCES `faculty` (`faculty_id`) ON DELETE CASCADE,
  CONSTRAINT `chk_payrolls_month` CHECK (`pay_month` BETWEEN 1 AND 12),
  CONSTRAINT `chk_payrolls_net` CHECK (`net_salary` >= 0)
) ENGINE=InnoDB COMMENT='G7: monthly payroll record (payslip).';

CREATE TABLE IF NOT EXISTS `payroll_components` (
  `component_id`  INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `payroll_id`    INT UNSIGNED NOT NULL,
  `component_type` ENUM('EARNING','DEDUCTION') NOT NULL,
  `name`          VARCHAR(80) NOT NULL,
  `amount`        DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  PRIMARY KEY (`component_id`),
  KEY `idx_payroll_components` (`payroll_id`),
  CONSTRAINT `fk_pc_payroll` FOREIGN KEY (`payroll_id`)
    REFERENCES `payrolls` (`payroll_id`) ON DELETE CASCADE,
  CONSTRAINT `chk_pc_amount` CHECK (`amount` >= 0)
) ENGINE=InnoDB COMMENT='G7: itemised allowances / deductions of a payslip.';

-- =====================================================================================
-- CROSS-CUTTING FEATURES (mock exams + AI assistance + risk engine)
-- =====================================================================================

CREATE TABLE IF NOT EXISTS `mcq_questions` (
  `question_id`   INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `subject_id`    SMALLINT UNSIGNED NOT NULL,
  `difficulty`    ENUM('EASY','MEDIUM','HARD') NOT NULL DEFAULT 'MEDIUM',
  `question_text` VARCHAR(500) NOT NULL,
  `option_a`      VARCHAR(255) NOT NULL,
  `option_b`      VARCHAR(255) NOT NULL,
  `option_c`      VARCHAR(255) NOT NULL,
  `option_d`      VARCHAR(255) NOT NULL,
  `correct_option` ENUM('A','B','C','D') NOT NULL,
  `marks`         TINYINT UNSIGNED NOT NULL DEFAULT 1,
  `explanation`   VARCHAR(500) NULL,
  `topic`         VARCHAR(100) NULL,
  `created_by`    INT UNSIGNED NULL,
  `status`        ENUM('ACTIVE','INACTIVE') NOT NULL DEFAULT 'ACTIVE',
  `created_at`    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`question_id`),
  KEY `idx_mcq_subject` (`subject_id`, `difficulty`),
  CONSTRAINT `fk_mcq_subject` FOREIGN KEY (`subject_id`)
    REFERENCES `subjects` (`subject_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_mcq_creator` FOREIGN KEY (`created_by`)
    REFERENCES `users` (`user_id`) ON DELETE SET NULL
) ENGINE=InnoDB COMMENT='Mock exam question bank.';

CREATE TABLE IF NOT EXISTS `mock_exams` (
  `mock_exam_id`    INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `student_id`      INT UNSIGNED NOT NULL,
  `subject_id`      SMALLINT UNSIGNED NOT NULL,
  `difficulty`      ENUM('EASY','MEDIUM','HARD','MIXED') NOT NULL DEFAULT 'MIXED',
  `total_questions` SMALLINT UNSIGNED NOT NULL DEFAULT 10,
  `duration_minutes` SMALLINT UNSIGNED NOT NULL DEFAULT 15,
  `started_at`      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `expires_at`      DATETIME NOT NULL,
  `submitted_at`    DATETIME NULL,
  `score`           DECIMAL(6,2) NOT NULL DEFAULT 0.00,
  `max_score`       DECIMAL(6,2) NOT NULL DEFAULT 0.00,
  `percentage`      DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  `correct_count`   SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  `status`          ENUM('IN_PROGRESS','SUBMITTED','EXPIRED') NOT NULL DEFAULT 'IN_PROGRESS',
  PRIMARY KEY (`mock_exam_id`),
  KEY `idx_mock_exams_student` (`student_id`, `started_at`),
  CONSTRAINT `fk_me_student` FOREIGN KEY (`student_id`)
    REFERENCES `students` (`student_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_me_subject` FOREIGN KEY (`subject_id`)
    REFERENCES `subjects` (`subject_id`) ON DELETE CASCADE
) ENGINE=InnoDB COMMENT='Mock exam attempts with a real server-side timer.';

CREATE TABLE IF NOT EXISTS `mock_exam_answers` (
  `answer_id`      INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `mock_exam_id`   INT UNSIGNED NOT NULL,
  `question_id`    INT UNSIGNED NOT NULL,
  `selected_option` ENUM('A','B','C','D') NULL,
  `is_correct`     TINYINT(1) NOT NULL DEFAULT 0,
  `marks_awarded`  DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  `answered_at`    DATETIME NULL,
  PRIMARY KEY (`answer_id`),
  UNIQUE KEY `uq_mock_answers` (`mock_exam_id`, `question_id`),
  CONSTRAINT `fk_ma_exam` FOREIGN KEY (`mock_exam_id`)
    REFERENCES `mock_exams` (`mock_exam_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_ma_question` FOREIGN KEY (`question_id`)
    REFERENCES `mcq_questions` (`question_id`) ON DELETE CASCADE
) ENGINE=InnoDB COMMENT='Answers of a mock exam attempt.';

CREATE TABLE IF NOT EXISTS `ai_conversations` (
  `conversation_id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id`         INT UNSIGNED NOT NULL,
  `session_id`      VARCHAR(64) NOT NULL,
  `role`            ENUM('USER','ASSISTANT') NOT NULL,
  `message`         TEXT NOT NULL,
  `source`          ENUM('LOCAL_ENGINE','LLM') NOT NULL DEFAULT 'LOCAL_ENGINE',
  `created_at`      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`conversation_id`),
  KEY `idx_ai_conv_user_session` (`user_id`, `session_id`),
  CONSTRAINT `fk_ai_conv_user` FOREIGN KEY (`user_id`)
    REFERENCES `users` (`user_id`) ON DELETE CASCADE
) ENGINE=InnoDB COMMENT='AI study assistant chat history (MySQL mirror of optional Mongo store).';

CREATE TABLE IF NOT EXISTS `study_plans` (
  `plan_id`      INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `student_id`   INT UNSIGNED NOT NULL,
  `generated_on` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `source`       ENUM('LOCAL_ENGINE','LLM') NOT NULL DEFAULT 'LOCAL_ENGINE',
  `input_snapshot` JSON NULL COMMENT 'attendance %, weak subjects, risk score used',
  `plan_json`    JSON NOT NULL,
  `valid_until`  DATE NULL,
  PRIMARY KEY (`plan_id`),
  KEY `idx_study_plans_student` (`student_id`, `generated_on`),
  CONSTRAINT `fk_study_plans_student` FOREIGN KEY (`student_id`)
    REFERENCES `students` (`student_id`) ON DELETE CASCADE
) ENGINE=InnoDB COMMENT='Generated study plans (local analytics engine or LLM).';

CREATE TABLE IF NOT EXISTS `student_risk_scores` (
  `risk_id`      INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `student_id`   INT UNSIGNED NOT NULL,
  `computed_on`  DATE NOT NULL,
  `risk_score`   DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  `risk_level`   ENUM('LOW','MEDIUM','HIGH','CRITICAL') NOT NULL DEFAULT 'LOW',
  `attendance_pct` DECIMAL(5,2) NULL,
  `avg_marks`    DECIMAL(5,2) NULL,
  `cgpa`         DECIMAL(4,2) NULL,
  `pending_fees` DECIMAL(10,2) NULL,
  `backlog_count` TINYINT UNSIGNED NOT NULL DEFAULT 0,
  `factors`      JSON NULL,
  PRIMARY KEY (`risk_id`),
  UNIQUE KEY `uq_risk_student_date` (`student_id`, `computed_on`),
  KEY `idx_risk_level` (`risk_level`),
  CONSTRAINT `fk_risk_student` FOREIGN KEY (`student_id`)
    REFERENCES `students` (`student_id`) ON DELETE CASCADE,
  CONSTRAINT `chk_risk_score` CHECK (`risk_score` BETWEEN 0 AND 100)
) ENGINE=InnoDB COMMENT='Academic risk detection output (analytics engine).';

SET FOREIGN_KEY_CHECKS = 1;

-- =====================================================================================
-- END OF 02_tables.sql
-- Tables defined: 45 (12 shared + 6 G1 + 8 G2/G3 + 1 G3 + 6 G4 + 8 G5 + 8 G6 + 6 G7 + 6 extras)
-- =====================================================================================
