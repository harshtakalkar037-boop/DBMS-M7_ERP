-- =====================================================================================
-- UNIVERSITY HIGHER EDUCATION ERP SYSTEM
-- DBMS Collaborative Project - M7 BATCH | Department of E&TCE
-- Group-wise module ownership:
--   G1 Student & Admission | G2 Academic & Course | G3 Attendance | G4 Examination
--   G5 Fees & Finance      | G6 Hostel            | G7 Faculty, Leave & Payroll
-- =====================================================================================
-- FILE   : 01_schema.sql
-- PURPOSE : Database creation, character set, sequencing rules and the master
--           (shared) entities used by ALL seven modules.
-- NOTE    : Written in portable MySQL 8.0 / MariaDB 10.6+ SQL.
--           Verified on MariaDB 11.8.6 and MySQL-compatible syntax throughout.
--           Load the files in this order (see scripts/reset-db.sh, or `npm run db:reset`):
--             01 schema -> 02 tables -> 03 constraints -> 07 functions -> 08 views
--             -> 04 seed -> 05 procedures -> 06 triggers
--           Functions come before the views that call them, and the seed is loaded
--           before procedures/triggers so that seeded rows are not blocked by rules
--           that only exist to police live application traffic. Loading 01..08 in
--           numeric order works too: 06_triggers.sql ends with a reconciliation block
--           that recomputes every derived counter from the seeded rows.
-- =====================================================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;
SET SQL_MODE = 'STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION';

-- -------------------------------------------------------------------------------------
-- 1. DATABASE
-- -------------------------------------------------------------------------------------
-- The database must exist and be selected before this file runs, so the schema can be
-- installed under any name (local, Docker, CI, per-branch clones):
--
--   CREATE DATABASE university_erp
--     DEFAULT CHARACTER SET utf8mb4 DEFAULT COLLATE utf8mb4_unicode_ci;
--   mysql -u root -p university_erp < database/01_schema.sql
--
-- scripts/reset-db.sh, docker compose and `npm run db:reset` all create and select the
-- database for you. (Hard-coding `CREATE DATABASE ... USE university_erp` here would
-- silently install into university_erp even when another database was selected.)

-- =====================================================================================
-- SECTION A - SHARED / MASTER ENTITIES  (referenced by more than one module)
-- These tables exist EXACTLY ONCE in the whole system. No module is allowed to create
-- its own copy of Student, Faculty, Department, Program, Subject or User.
-- =====================================================================================

-- -------------------------------------------------------------------------------------
-- A1. roles  (Authorisation master - shared by every module)
-- -------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `roles` (
  `role_id`      TINYINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `role_code`    VARCHAR(30)      NOT NULL COMMENT 'ADMIN, FACULTY, STUDENT, ACCOUNTANT, HOSTEL_ADMIN, EXAM_CELL, HR',
  `role_name`    VARCHAR(60)      NOT NULL,
  `description`  VARCHAR(255)     NULL,
  `created_at`   TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`role_id`),
  UNIQUE KEY `uq_roles_code` (`role_code`)
) ENGINE=InnoDB COMMENT='Master list of system roles (RBAC). Shared by all modules.';

-- -------------------------------------------------------------------------------------
-- A2. users  (Single authentication table for ALL modules. Every login is a row here.)
-- -------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `users` (
  `user_id`         INT UNSIGNED   NOT NULL AUTO_INCREMENT,
  `role_id`         TINYINT UNSIGNED NOT NULL,
  `email`           VARCHAR(150)   NOT NULL,
  `password_hash`   VARCHAR(255)   NOT NULL COMMENT 'bcrypt(12) hash - never reversible',
  `phone`           VARCHAR(20)    NULL,
  `is_active`       TINYINT(1)     NOT NULL DEFAULT 1,
  `is_first_login`  TINYINT(1)     NOT NULL DEFAULT 1,
  `last_login_at`   DATETIME       NULL,
  `failed_attempts` TINYINT UNSIGNED NOT NULL DEFAULT 0,
  `locked_until`    DATETIME       NULL,
  `refresh_token`   VARCHAR(512)   NULL COMMENT 'Hashed refresh token (rotated on use)',
  `password_reset_token` VARCHAR(255) NULL,
  `created_at`      TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`      TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`),
  UNIQUE KEY `uq_users_email` (`email`),
  KEY `idx_users_role` (`role_id`),
  CONSTRAINT `fk_users_role` FOREIGN KEY (`role_id`) REFERENCES `roles` (`role_id`)
) ENGINE=InnoDB COMMENT='Single identity store: admin, faculty, students, staff.';

-- -------------------------------------------------------------------------------------
-- A3. departments  (Shared: G1 admission, G2 programs, G4 subjects, G7 faculty)
-- -------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `departments` (
  `department_id`    INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `department_code`  VARCHAR(20)  NOT NULL COMMENT 'e.g. ETC, CSE, MECH',
  `name`             VARCHAR(120) NOT NULL,
  `short_name`       VARCHAR(40)  NULL,
  `hod_faculty_id`   INT UNSIGNED NULL COMMENT 'FK -> faculty(faculty_id), added in 03_constraints.sql',
  `email`            VARCHAR(150) NULL,
  `phone`            VARCHAR(20)  NULL,
  `established_year` SMALLINT UNSIGNED NULL,
  `status`           ENUM('ACTIVE','INACTIVE') NOT NULL DEFAULT 'ACTIVE',
  `created_at`       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`department_id`),
  UNIQUE KEY `uq_departments_code` (`department_code`),
  UNIQUE KEY `uq_departments_name` (`name`)
) ENGINE=InnoDB COMMENT='Academic departments. One row per department - shared everywhere.';

-- -------------------------------------------------------------------------------------
-- A4. categories  (Reservation category master - G1 admission, G5 fee concession)
-- -------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `categories` (
  `category_id`   TINYINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `category_code` VARCHAR(10)  NOT NULL COMMENT 'GEN, OBC, SC, ST, EWS, PWD',
  `name`          VARCHAR(60)  NOT NULL,
  `description`   VARCHAR(255) NULL,
  PRIMARY KEY (`category_id`),
  UNIQUE KEY `uq_categories_code` (`category_code`)
) ENGINE=InnoDB COMMENT='Reservation / admission categories.';

-- -------------------------------------------------------------------------------------
-- A5. academic_years  (Shared calendar spine for G2, G3, G4, G5, G6)
-- -------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `academic_years` (
  `academic_year_id` SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `year_label`       VARCHAR(20)  NOT NULL COMMENT 'e.g. 2025-26',
  `start_date`       DATE         NOT NULL,
  `end_date`         DATE         NOT NULL,
  `is_current`       TINYINT(1)   NOT NULL DEFAULT 0,
  `status`           ENUM('ACTIVE','CLOSED','UPCOMING') NOT NULL DEFAULT 'ACTIVE',
  PRIMARY KEY (`academic_year_id`),
  UNIQUE KEY `uq_academic_years_label` (`year_label`),
  CONSTRAINT `chk_academic_years_dates` CHECK (`end_date` > `start_date`)
) ENGINE=InnoDB COMMENT='Academic year master. Single source of truth for all modules.';

-- -------------------------------------------------------------------------------------
-- A6. semesters  (Shared by G2 offerings, G4 exams/results, G5 semester fees)
-- -------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `semesters` (
  `semester_id`     SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `academic_year_id` SMALLINT UNSIGNED NOT NULL,
  `semester_no`     TINYINT UNSIGNED NOT NULL COMMENT '1..8',
  `name`            VARCHAR(40)  NOT NULL COMMENT 'e.g. Semester 3',
  `start_date`      DATE         NOT NULL,
  `end_date`        DATE         NOT NULL,
  `is_current`      TINYINT(1)   NOT NULL DEFAULT 0,
  `result_published` TINYINT(1)  NOT NULL DEFAULT 0,
  PRIMARY KEY (`semester_id`),
  UNIQUE KEY `uq_semesters_year_no` (`academic_year_id`, `semester_no`),
  KEY `idx_semesters_current` (`is_current`),
  CONSTRAINT `fk_semesters_year` FOREIGN KEY (`academic_year_id`)
    REFERENCES `academic_years` (`academic_year_id`) ON DELETE CASCADE,
  CONSTRAINT `chk_semesters_no` CHECK (`semester_no` BETWEEN 1 AND 12),
  CONSTRAINT `chk_semesters_dates` CHECK (`end_date` > `start_date`)
) ENGINE=InnoDB COMMENT='Semester master, one row per (academic year, semester number).';

-- -------------------------------------------------------------------------------------
-- A7. programs  (Degree programs - G1 admission, G2 curriculum, G5 fee structure)
-- -------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `programs` (
  `program_id`     SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `program_code`   VARCHAR(20)  NOT NULL COMMENT 'e.g. BTECH-ETC',
  `name`           VARCHAR(150) NOT NULL,
  `short_name`     VARCHAR(40)  NULL,
  `level`          ENUM('DIPLOMA','UG','PG','PHD') NOT NULL DEFAULT 'UG',
  `department_id`  INT UNSIGNED NOT NULL,
  `duration_years` TINYINT UNSIGNED NOT NULL DEFAULT 4,
  `total_semesters` TINYINT UNSIGNED NOT NULL DEFAULT 8,
  `total_credits`  SMALLINT UNSIGNED NOT NULL DEFAULT 160,
  `intake`         SMALLINT UNSIGNED NOT NULL DEFAULT 60,
  `status`         ENUM('ACTIVE','INACTIVE','CLOSED') NOT NULL DEFAULT 'ACTIVE',
  `created_at`     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`program_id`),
  UNIQUE KEY `uq_programs_code` (`program_code`),
  KEY `idx_programs_department` (`department_id`),
  CONSTRAINT `fk_programs_department` FOREIGN KEY (`department_id`)
    REFERENCES `departments` (`department_id`) ON DELETE RESTRICT,
  CONSTRAINT `chk_programs_duration` CHECK (`duration_years` BETWEEN 1 AND 8)
) ENGINE=InnoDB COMMENT='Degree / diploma programs offered by the university.';

-- -------------------------------------------------------------------------------------
-- A8. batches  (Admission batch - a cohort of students inside one program)
-- -------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `batches` (
  `batch_id`          SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `batch_code`        VARCHAR(20) NOT NULL COMMENT 'e.g. ETC-2024-A',
  `program_id`        SMALLINT UNSIGNED NOT NULL,
  `academic_year_id`  SMALLINT UNSIGNED NOT NULL COMMENT 'Year of admission',
  `start_year`        SMALLINT UNSIGNED NOT NULL,
  `end_year`          SMALLINT UNSIGNED NOT NULL,
  `current_semester_no` TINYINT UNSIGNED NOT NULL DEFAULT 1,
  `strength`          SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  `status`            ENUM('ACTIVE','GRADUATED','INACTIVE') NOT NULL DEFAULT 'ACTIVE',
  PRIMARY KEY (`batch_id`),
  UNIQUE KEY `uq_batches_code` (`batch_code`),
  KEY `idx_batches_program` (`program_id`),
  CONSTRAINT `fk_batches_program` FOREIGN KEY (`program_id`)
    REFERENCES `programs` (`program_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_batches_year` FOREIGN KEY (`academic_year_id`)
    REFERENCES `academic_years` (`academic_year_id`) ON DELETE RESTRICT,
  CONSTRAINT `chk_batches_years` CHECK (`end_year` > `start_year`)
) ENGINE=InnoDB COMMENT='Student cohort / batch inside a program.';

-- -------------------------------------------------------------------------------------
-- A9. subjects  (Single subject master - used by G2, G3 attendance, G4 exams)
-- -------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `subjects` (
  `subject_id`    SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `subject_code`  VARCHAR(20)  NOT NULL COMMENT 'e.g. ETC301',
  `name`          VARCHAR(150) NOT NULL,
  `short_name`    VARCHAR(40)  NULL,
  `credits`       TINYINT UNSIGNED NOT NULL DEFAULT 3,
  `subject_type`  ENUM('THEORY','PRACTICAL','ELECTIVE','PROJECT','SEMINAR') NOT NULL DEFAULT 'THEORY',
  `department_id` INT UNSIGNED NOT NULL,
  `lecture_hours` TINYINT UNSIGNED NOT NULL DEFAULT 3,
  `tutorial_hours` TINYINT UNSIGNED NOT NULL DEFAULT 0,
  `practical_hours` TINYINT UNSIGNED NOT NULL DEFAULT 0,
  `is_elective`   TINYINT(1)   NOT NULL DEFAULT 0,
  `status`        ENUM('ACTIVE','INACTIVE') NOT NULL DEFAULT 'ACTIVE',
  `created_at`    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`subject_id`),
  UNIQUE KEY `uq_subjects_code` (`subject_code`),
  KEY `idx_subjects_department` (`department_id`),
  KEY `idx_subjects_type` (`subject_type`),
  CONSTRAINT `fk_subjects_department` FOREIGN KEY (`department_id`)
    REFERENCES `departments` (`department_id`) ON DELETE RESTRICT,
  CONSTRAINT `chk_subjects_credits` CHECK (`credits` BETWEEN 1 AND 12)
) ENGINE=InnoDB COMMENT='Subject master. Shared by academic, attendance and exam modules.';

-- -------------------------------------------------------------------------------------
-- A10. system_settings  (key/value configuration - configurable ERP behaviour)
-- -------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `system_settings` (
  `setting_key`   VARCHAR(60)  NOT NULL,
  `setting_value` VARCHAR(255) NOT NULL,
  `description`   VARCHAR(255) NULL,
  `updated_at`    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`setting_key`)
) ENGINE=InnoDB COMMENT='Runtime configuration: attendance threshold, late fee rate etc.';

-- -------------------------------------------------------------------------------------
-- A11. notifications  (Central notification centre - every module publishes here)
-- -------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `notifications` (
  `notification_id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id`         INT UNSIGNED NULL COMMENT 'NULL => broadcast to all users',
  `title`           VARCHAR(160) NOT NULL,
  `message`         VARCHAR(500) NOT NULL,
  `type`     ENUM('ATTENDANCE_WARNING','EXAM_REGISTRATION','EXAM_SCHEDULE','RESULT_PUBLISHED',
                  'FEE_DUE','FEE_OVERDUE','HOSTEL_ALLOCATION','LEAVE_APPROVAL','PAYROLL_GENERATED',
                  'ANNOUNCEMENT','ADMISSION','GENERAL') NOT NULL DEFAULT 'GENERAL',
  `severity`        ENUM('INFO','SUCCESS','WARNING','ERROR') NOT NULL DEFAULT 'INFO',
  `entity`          VARCHAR(60)  NULL COMMENT 'e.g. student_fee, exam',
  `entity_id`       INT UNSIGNED NULL,
  `link`            VARCHAR(255) NULL,
  `is_read`         TINYINT(1)   NOT NULL DEFAULT 0,
  `read_at`         DATETIME     NULL,
  `created_at`      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`notification_id`),
  KEY `idx_notifications_user_read` (`user_id`, `is_read`, `created_at`),
  KEY `idx_notifications_type` (`type`),
  CONSTRAINT `fk_notifications_user` FOREIGN KEY (`user_id`)
    REFERENCES `users` (`user_id`) ON DELETE CASCADE
) ENGINE=InnoDB COMMENT='Central notification centre. Written by every module.';

-- -------------------------------------------------------------------------------------
-- A12. audit_logs  (Cross-module audit trail - required by section 22)
-- -------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `audit_logs` (
  `log_id`      BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id`     INT UNSIGNED NULL,
  `action`      ENUM('LOGIN','LOGOUT','LOGIN_FAILED','CREATE','UPDATE','DELETE','PAYMENT',
                     'FEE_CHANGE','MARKS_UPDATE','ATTENDANCE_UPDATE','HOSTEL_ALLOCATION',
                     'EXAM_REGISTRATION','RESULT_PUBLISHED','LEAVE_ACTION','PAYROLL_RUN',
                     'APPROVE','REJECT','SYSTEM') NOT NULL,
  `entity`      VARCHAR(60)  NOT NULL,
  `entity_id`   INT UNSIGNED NULL,
  `description` VARCHAR(500) NULL,
  `old_value`   JSON         NULL,
  `new_value`   JSON         NULL,
  `ip_address`  VARCHAR(45)  NULL,
  `user_agent`  VARCHAR(255) NULL,
  `created_at`  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`log_id`),
  KEY `idx_audit_user` (`user_id`),
  KEY `idx_audit_entity` (`entity`, `entity_id`),
  KEY `idx_audit_created` (`created_at`),
  KEY `idx_audit_action` (`action`),
  CONSTRAINT `fk_audit_user` FOREIGN KEY (`user_id`)
    REFERENCES `users` (`user_id`) ON DELETE SET NULL
) ENGINE=InnoDB COMMENT='Audit trail for all important operations across all modules.';

SET FOREIGN_KEY_CHECKS = 1;

-- =====================================================================================
-- END OF 01_schema.sql - shared master entities for the M7 BATCH University ERP
-- =====================================================================================
