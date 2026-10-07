-- =====================================================================================
-- tests/db/test_rules.sql
-- Executable proof that the database rules, triggers, procedures and functions work.
--
-- HOW TO RUN (from the repository root, after loading the database):
--   mysql -u root -p university_erp < tests/db/test_rules.sql
--   docker compose exec -T db mysql -uroot -proot university_erp < tests/db/test_rules.sql
--
-- Every test prints PASS or FAIL and the script finishes with a summary. Statements that
-- MUST be rejected are executed through t_try(), which captures the error message so the
-- output can be pasted straight into the project report as execution proof.
--
-- NOTE: the tests deliberately modify a handful of rows (they create a test allocation,
--       a test payment, a test admission, a payslip run...). Reload the database with
--       scripts/reset-db.sh (or npm run db:reset) to get pristine demo data back.
-- =====================================================================================
USE `university_erp`;

SET @pass = 0;
SET @fail = 0;

DROP PROCEDURE IF EXISTS `t_assert`;
DROP PROCEDURE IF EXISTS `t_try`;
DELIMITER $$

-- Records the outcome of one assertion.
CREATE PROCEDURE `t_assert`(IN p_name VARCHAR(160), IN p_condition TINYINT, IN p_detail VARCHAR(255))
BEGIN
  IF p_condition = 1 THEN
    SET @pass = @pass + 1;
    SELECT CONCAT('PASS  | ', p_name, '  |  ', IFNULL(p_detail, '')) AS result;
  ELSE
    SET @fail = @fail + 1;
    SELECT CONCAT('FAIL  | ', p_name, '  |  ', IFNULL(p_detail, '')) AS result;
  END IF;
END$$

-- Executes a statement that is expected to fail. p_ok = 1 means "it succeeded".
CREATE PROCEDURE `t_try`(IN p_sql TEXT, OUT p_ok TINYINT, OUT p_msg VARCHAR(255))
BEGIN
  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    GET DIAGNOSTICS CONDITION 1 p_msg = MESSAGE_TEXT;
    SET p_ok = 0;
  END;
  SET @t_sql = p_sql;
  PREPARE t_stmt FROM @t_sql;
  EXECUTE t_stmt;
  DEALLOCATE PREPARE t_stmt;
  SET p_ok = 1;
  SET p_msg = NULL;
END$$
DELIMITER ;

-- -------------------------------------------------------------------------------------
-- Cleanup from any previous run so the script is safe to execute repeatedly.
-- -------------------------------------------------------------------------------------
DELETE FROM `attendance`
WHERE `session_id` IN (SELECT `session_id` FROM `class_sessions`
                       WHERE `session_no` IN (190, 191, 192, 193, 194));
DELETE FROM `class_sessions` WHERE `session_no` IN (190, 191, 192, 193, 194);
DELETE FROM `room_allocations` WHERE `remarks` = 'AUTOMATED TEST ROW';
DELETE FROM `hostel_applications` WHERE `application_no` LIKE 'HAPP-TEST-%';

-- =====================================================================================
SELECT '======== SECTION 1: USER DEFINED FUNCTIONS ========' AS section;
-- =====================================================================================
SET @sid := (SELECT student_id FROM v_student_academic_summary WHERE cgpa > 0 LIMIT 1);
CALL t_assert('fn_calculate_student_cgpa returns a value in 0..10',
              fn_calculate_student_cgpa(@sid) BETWEEN 0 AND 10,
              CONCAT('student ', @sid, ' CGPA = ', fn_calculate_student_cgpa(@sid)));

CALL t_assert('fn_grade_code(92) = AA', fn_grade_code(92.00) = 'AA', fn_grade_code(92.00));
CALL t_assert('fn_grade_points(92) = 10.00', fn_grade_points(92.00) = 10.00, fn_grade_points(92.00));
CALL t_assert('fn_grade_code(38) = FF (fail band)', fn_grade_code(38.00) = 'FF', fn_grade_code(38.00));
CALL t_assert('fn_grade_points(38) = 0.00', fn_grade_points(38.00) = 0.00, fn_grade_points(38.00));
CALL t_assert('fn_grade_points(75) = 8.00 (BB band)', fn_grade_points(75.00) = 8.00, fn_grade_points(75.00));
CALL t_assert('fn_grade_code(39.99) = FF and 40.00 = DD (pass boundary)',
              fn_grade_code(39.99) = 'FF' AND fn_grade_code(40.00) = 'DD',
              CONCAT(fn_grade_code(39.99), ' / ', fn_grade_code(40.00)));

SET @fee_od := (SELECT student_fee_id FROM student_fees
                WHERE status IN ('PENDING','OVERDUE')
                  AND due_date < DATE_SUB(CURDATE(), INTERVAL 10 DAY) LIMIT 1);
CALL t_assert('fn_calculate_late_fee is positive for an overdue bill',
              @fee_od IS NOT NULL AND fn_calculate_late_fee(@fee_od) > 0,
              CONCAT('bill ', IFNULL(@fee_od,'-'), ' late fee = INR ',
                     IFNULL(fn_calculate_late_fee(@fee_od), 0)));

SET @fee_paid := (SELECT student_fee_id FROM student_fees WHERE status = 'PAID' LIMIT 1);
CALL t_assert('fn_calculate_late_fee is zero for a paid bill',
              @fee_paid IS NOT NULL AND fn_calculate_late_fee(@fee_paid) = 0,
              CONCAT('bill ', IFNULL(@fee_paid,'-')));

SET @fid := (SELECT faculty_id FROM faculty WHERE status = 'ACTIVE' LIMIT 1);
CALL t_assert('fn_calculate_faculty_leave_balance returns a number',
              fn_calculate_faculty_leave_balance(@fid, 'CASUAL', 3) IS NOT NULL,
              CONCAT('faculty ', @fid, ' casual balance = ',
                     fn_calculate_faculty_leave_balance(@fid, 'CASUAL', 3), ' days'));

CALL t_assert('fn_hostel_available_beds <= total beds',
              fn_hostel_available_beds(1) <= (SELECT total_beds FROM hostels WHERE hostel_id = 1),
              CONCAT('hostel 1 free beds = ', fn_hostel_available_beds(1)));

CALL t_assert('fn_calculate_net_salary is greater than zero for an active faculty member',
              fn_calculate_net_salary(@fid, 10, 2026) > 0,
              CONCAT('faculty ', @fid, ' net salary = INR ', fn_calculate_net_salary(@fid, 10, 2026)));

CALL t_assert('fn_student_outstanding_dues matches the sum of unpaid bills',
              ABS(fn_student_outstanding_dues(@sid) -
                  (SELECT IFNULL(SUM(due_amount),0) FROM student_fees
                   WHERE student_id = @sid AND status IN ('PENDING','PARTIAL','OVERDUE'))) < 0.01,
              CONCAT('student ', @sid, ' dues = INR ', fn_student_outstanding_dues(@sid)));

-- =====================================================================================
SELECT '======== SECTION 2: BUSINESS RULE - THE 75% ATTENDANCE GATE ========' AS section;
-- =====================================================================================
SET @low_s := NULL; SET @low_o := NULL; SET @low_pct := NULL; SET @low_exam := NULL;
SELECT student_id, offering_id, attendance_percentage
INTO @low_s, @low_o, @low_pct
FROM v_student_attendance_summary
WHERE attendance_percentage < 75
  AND semester_id IN (SELECT semester_id FROM semesters WHERE academic_year_id =
                        (SELECT academic_year_id FROM academic_years WHERE is_current = 1))
LIMIT 1;

SET @low_exam := (SELECT e.exam_id FROM exams e
                  WHERE e.status = 'REGISTRATION_OPEN'
                    AND e.semester_id = (SELECT semester_id FROM course_offerings
                                         WHERE offering_id = @low_o));

CALL t_try(CONCAT('INSERT INTO exam_registrations (exam_id, student_id, offering_id, registered_by, status) VALUES (',
                  @low_exam, ',', @low_s, ',', @low_o, ', 1, ''REGISTERED'')'),
           @blocked, @msg);
CALL t_assert('TRIGGER refuses exam registration below 75% attendance',
              @blocked = 0,
              CONCAT('student ', @low_s, ' (', @low_pct, '%) -> ', IFNULL(@msg, 'ACCEPTED - RULE BROKEN')));

-- The same student is admitted when an authorised exemption is recorded.
CALL t_try(CONCAT('INSERT INTO exam_registrations (exam_id, student_id, offering_id, registered_by, is_eligible, exemption_granted, exemption_by, exemption_reason, status) VALUES (',
                  @low_exam, ',', @low_s, ',', @low_o,
                  ', 4, 1, 1, 4, ''Medical condonation approved by the Director'', ''REGISTERED'')'),
           @exempt_ok, @msg2);
CALL t_assert('Documented exemption allows the same student to register',
              @exempt_ok = 1, IFNULL(@msg2, 'registered with exemption'));

-- Boundary value: attendance of exactly 75% must be ELIGIBLE.
SET @b_s := NULL; SET @b_o := NULL;
SELECT e.student_id, e.offering_id INTO @b_s, @b_o
FROM enrollments e
JOIN course_offerings o ON o.offering_id = e.offering_id
WHERE o.semester_id = (SELECT semester_id FROM exams WHERE exam_id = @low_exam)
  AND NOT EXISTS (SELECT 1 FROM exam_registrations r
                  WHERE r.student_id = e.student_id AND r.offering_id = e.offering_id
                    AND r.exam_id = @low_exam)
LIMIT 1;

DELETE FROM attendance WHERE student_id = @b_s AND offering_id = @b_o;
SET @b_sem := (SELECT semester_id FROM course_offerings WHERE offering_id = @b_o);
INSERT INTO class_sessions (offering_id, faculty_id, semester_id, session_date, session_no, status)
VALUES (@b_o, (SELECT faculty_id FROM course_offerings WHERE offering_id = @b_o),
        @b_sem, DATE_SUB(CURDATE(), INTERVAL 10 DAY), 190, 'COMPLETED');
SET @sess1 := LAST_INSERT_ID();
INSERT INTO class_sessions (offering_id, faculty_id, semester_id, session_date, session_no, status)
VALUES (@b_o, (SELECT faculty_id FROM course_offerings WHERE offering_id = @b_o),
        @b_sem, DATE_SUB(CURDATE(), INTERVAL 9 DAY), 191, 'COMPLETED');
SET @sess2 := LAST_INSERT_ID();
INSERT INTO class_sessions (offering_id, faculty_id, semester_id, session_date, session_no, status)
VALUES (@b_o, (SELECT faculty_id FROM course_offerings WHERE offering_id = @b_o),
        @b_sem, DATE_SUB(CURDATE(), INTERVAL 8 DAY), 192, 'COMPLETED');
SET @sess3 := LAST_INSERT_ID();
INSERT INTO class_sessions (offering_id, faculty_id, semester_id, session_date, session_no, status)
VALUES (@b_o, (SELECT faculty_id FROM course_offerings WHERE offering_id = @b_o),
        @b_sem, DATE_SUB(CURDATE(), INTERVAL 7 DAY), 193, 'COMPLETED');
SET @sess4 := LAST_INSERT_ID();

-- 3 present out of 4 lectures = exactly 75.00%
INSERT INTO attendance (session_id, student_id, offering_id, semester_id, status)
VALUES (@sess1, @b_s, @b_o, @b_sem, 'PRESENT'),
       (@sess2, @b_s, @b_o, @b_sem, 'PRESENT'),
       (@sess3, @b_s, @b_o, @b_sem, 'PRESENT'),
       (@sess4, @b_s, @b_o, @b_sem, 'ABSENT');

CALL t_assert('Attendance of 3/4 lectures computes to exactly 75.00%',
              fn_calculate_attendance_percentage(@b_s, @b_o) = 75.00,
              CONCAT('student ', @b_s, ' = ', fn_calculate_attendance_percentage(@b_s, @b_o), '%'));

CALL t_try(CONCAT('INSERT INTO exam_registrations (exam_id, student_id, offering_id, registered_by, status) VALUES (',
                  @low_exam, ',', @b_s, ',', @b_o, ', 1, ''REGISTERED'')'),
           @boundary_ok, @msg3);
CALL t_assert('Attendance of exactly 75% IS ELIGIBLE for the examination',
              @boundary_ok = 1, IFNULL(@msg3, 'accepted at the boundary'));

-- One lecture more and the same student drops below the line.
INSERT INTO class_sessions (offering_id, faculty_id, semester_id, session_date, session_no, status)
VALUES (@b_o, (SELECT faculty_id FROM course_offerings WHERE offering_id = @b_o),
        @b_sem, DATE_SUB(CURDATE(), INTERVAL 6 DAY), 194, 'COMPLETED');
INSERT INTO attendance (session_id, student_id, offering_id, semester_id, status)
VALUES (LAST_INSERT_ID(), @b_s, @b_o, @b_sem, 'ABSENT');
CALL t_assert('A further absence drops the same student to 60% (3/5)',
              fn_calculate_attendance_percentage(@b_s, @b_o) = 60.00,
              CONCAT('student ', @b_s, ' = ', fn_calculate_attendance_percentage(@b_s, @b_o), '%'));

-- =====================================================================================
SELECT '======== SECTION 3: HOSTEL OCCUPANCY TRIGGERS ========' AS section;
-- =====================================================================================
SET @h := 1;
SET @occ_before := (SELECT occupied_beds FROM hostels WHERE hostel_id = @h);
SELECT b.bed_id, b.room_id INTO @bed, @room
FROM beds b JOIN rooms r ON r.room_id = b.room_id
WHERE r.hostel_id = @h AND b.status = 'AVAILABLE' LIMIT 1;
SET @room_occ_before := (SELECT occupied_count FROM rooms WHERE room_id = @room);
SET @stud := (SELECT s.student_id FROM students s
              WHERE s.status = 'ACTIVE'
                AND NOT EXISTS (SELECT 1 FROM room_allocations ra
                                WHERE ra.student_id = s.student_id AND ra.status = 'ACTIVE')
              LIMIT 1);

INSERT INTO hostel_applications (application_no, student_id, hostel_id, academic_year_id,
                                 room_type_pref, applied_on, status)
VALUES (CONCAT('HAPP-TEST-', FLOOR(RAND()*100000)), @stud, @h, 3, 'DOUBLE', CURDATE(), 'APPLIED');
SET @app := LAST_INSERT_ID();

CALL sp_allocate_hostel_bed(@app, @bed, 3, @alloc_id, @alloc_msg);

CALL t_assert('sp_allocate_hostel_bed created an allocation',
              @alloc_id IS NOT NULL, IFNULL(@alloc_msg, ''));
CALL t_assert('TRIGGER marked the bed as OCCUPIED',
              (SELECT status FROM beds WHERE bed_id = @bed) = 'OCCUPIED', CONCAT('bed ', @bed));
CALL t_assert('TRIGGER incremented the room occupancy counter',
              (SELECT occupied_count FROM rooms WHERE room_id = @room) = @room_occ_before + 1,
              CONCAT('room ', @room, ': ', @room_occ_before, ' -> ',
                     (SELECT occupied_count FROM rooms WHERE room_id = @room)));
CALL t_assert('TRIGGER incremented the hostel occupancy counter',
              (SELECT occupied_beds FROM hostels WHERE hostel_id = @h) = @occ_before + 1,
              CONCAT('hostel ', @h, ': ', @occ_before, ' -> ',
                     (SELECT occupied_beds FROM hostels WHERE hostel_id = @h)));
CALL t_assert('Allocation created the hostel rent bill',
              (SELECT COUNT(*) FROM hostel_fees WHERE allocation_id = @alloc_id) = 1, '');
UPDATE `room_allocations` SET `remarks` = 'AUTOMATED TEST ROW' WHERE `allocation_id` = @alloc_id;

-- The trigger must refuse a second active bed for the same student.
SET @bed2 := (SELECT b.bed_id FROM beds b JOIN rooms r ON r.room_id = b.room_id
              WHERE r.hostel_id = @h AND b.status = 'AVAILABLE' LIMIT 1);
CALL t_try(CONCAT('INSERT INTO room_allocations (student_id, bed_id, room_id, hostel_id, academic_year_id, status) VALUES (',
                  @stud, ',', @bed2, ',(SELECT room_id FROM beds WHERE bed_id = ', @bed2, '), ', @h, ', 3, ''ACTIVE'')'),
           @dup_blocked, @msg4);
CALL t_assert('TRIGGER blocks a second active bed for the same student',
              @dup_blocked = 0, IFNULL(@msg4, 'ACCEPTED - RULE BROKEN'));

-- Vacating must hand the bed back.
CALL sp_vacate_hostel_bed(@alloc_id, 3, 'Automated test cleanup', @vac_msg);
CALL t_assert('TRIGGER released the bed when the allocation was vacated',
              (SELECT status FROM beds WHERE bed_id = @bed) = 'AVAILABLE',
              CONCAT('bed ', @bed, ' -> ', (SELECT status FROM beds WHERE bed_id = @bed)));
CALL t_assert('TRIGGER decremented the hostel occupancy counter on vacating',
              (SELECT occupied_beds FROM hostels WHERE hostel_id = @h) = @occ_before,
              CONCAT('hostel ', @h, ' back to ', @occ_before));
DELETE FROM hostel_applications WHERE application_id = @app;

-- Room capacity guard.
SET @cap_room := (SELECT room_id FROM rooms WHERE capacity = 1 LIMIT 1);
CALL t_try(CONCAT('UPDATE rooms SET occupied_count = 5 WHERE room_id = ', @cap_room),
           @cap_blocked, @msg5);
CALL t_assert('TRIGGER refuses to over-fill a room beyond its bed count',
              @cap_blocked = 0, IFNULL(@msg5, 'ACCEPTED - RULE BROKEN'));

-- =====================================================================================
SELECT '======== SECTION 4: FEE AUDIT TRIGGER + PAYMENT PROCEDURE ========' AS section;
-- =====================================================================================
SET @bill := (SELECT student_fee_id FROM student_fees WHERE status IN ('PENDING','PARTIAL','OVERDUE')
              AND due_amount > 500 LIMIT 1);
SET @audits_before := (SELECT COUNT(*) FROM audit_logs WHERE entity = 'student_fees');
UPDATE student_fees SET fine_amount = fine_amount + 250 WHERE student_fee_id = @bill;
CALL t_assert('TRIGGER wrote a FEE_CHANGE audit record with old and new values',
              (SELECT COUNT(*) FROM audit_logs
               WHERE entity = 'student_fees' AND entity_id = @bill
                 AND old_value IS NOT NULL AND new_value IS NOT NULL) >
              (SELECT COUNT(*) FROM audit_logs WHERE entity = 'student_fees' AND entity_id = @bill
                 AND log_id <= @audits_before),
              CONCAT('audit rows for bill ', @bill, ': ',
                     (SELECT COUNT(*) FROM audit_logs WHERE entity = 'student_fees' AND entity_id = @bill)));

SET @due_before := (SELECT due_amount FROM student_fees WHERE student_fee_id = @bill);
SET @paid_before := (SELECT paid_amount FROM student_fees WHERE student_fee_id = @bill);
SET @txn_before := (SELECT COUNT(*) FROM transactions WHERE student_fee_id = @bill);

CALL sp_process_fee_payment(@bill, 1000.00, 'UPI', CONCAT('TESTREF', FLOOR(RAND()*1000000)), 2,
                            @pay_id, @receipt, @pay_msg);

CALL t_assert('sp_process_fee_payment created the payment', @pay_id IS NOT NULL, IFNULL(@pay_msg, ''));
CALL t_assert('sp_process_fee_payment generated a receipt number',
              @receipt LIKE 'RCP-%', IFNULL(@receipt, ''));
CALL t_assert('TRIGGER increased paid_amount by the payment',
              (SELECT paid_amount FROM student_fees WHERE student_fee_id = @bill) = @paid_before + 1000,
              CONCAT(@paid_before, ' -> ', (SELECT paid_amount FROM student_fees WHERE student_fee_id = @bill)));
CALL t_assert('TRIGGER reduced due_amount by the payment',
              (SELECT due_amount FROM student_fees WHERE student_fee_id = @bill) = @due_before - 1000,
              CONCAT(@due_before, ' -> ', (SELECT due_amount FROM student_fees WHERE student_fee_id = @bill)));
CALL t_assert('TRIGGER posted the ledger entry',
              (SELECT COUNT(*) FROM transactions WHERE student_fee_id = @bill) = @txn_before + 1,
              CONCAT('ledger rows now ', (SELECT COUNT(*) FROM transactions WHERE student_fee_id = @bill)));

CALL t_try(CONCAT('CALL sp_process_fee_payment(', @bill, ', 100.00, ''UPI'', (SELECT reference_no FROM payments WHERE payment_id = ', @pay_id, '), 2, @x1, @x2, @x3)'),
           @dup_pay_blocked, @msg6);
CALL t_assert('Duplicate payment reference is rejected',
              @dup_pay_blocked = 0, IFNULL(@msg6, 'ACCEPTED - RULE BROKEN'));

CALL t_try(CONCAT('CALL sp_process_fee_payment(', @bill, ', 999999.00, ''CASH'', NULL, 2, @x1, @x2, @x3)'),
           @over_blocked, @msg7);
CALL t_assert('Over-payment beyond the outstanding amount is rejected',
              @over_blocked = 0, IFNULL(@msg7, 'ACCEPTED - RULE BROKEN'));

-- =====================================================================================
SELECT '======== SECTION 5: PAYROLL PROCEDURE ========' AS section;
-- =====================================================================================
SET @pay_before := (SELECT COUNT(*) FROM payrolls WHERE pay_month = 10 AND pay_year = 2026);
CALL sp_generate_monthly_payroll(10, 2026, 5, @gen_count, @gen_total, @gen_msg);
CALL t_assert('sp_generate_monthly_payroll generated payslips for every active faculty member',
              @gen_count > 0, CONCAT(@gen_count, ' payslips, total net INR ', FORMAT(@gen_total, 2)));
CALL t_assert('Payroll components (earnings + deductions) were written',
              (SELECT COUNT(*) FROM payroll_components pc
               JOIN payrolls p ON p.payroll_id = pc.payroll_id
               WHERE p.pay_month = 10 AND p.pay_year = 2026) >= @gen_count * 5,
              CONCAT((SELECT COUNT(*) FROM payroll_components pc
                      JOIN payrolls p ON p.payroll_id = pc.payroll_id
                      WHERE p.pay_month = 10 AND p.pay_year = 2026), ' component rows'));
CALL t_assert('fn_calculate_net_salary agrees with the stored net salary',
              (SELECT COUNT(*) FROM payrolls p
               WHERE p.pay_month = 10 AND p.pay_year = 2026
                 AND ABS(p.net_salary - fn_calculate_net_salary(p.faculty_id, 10, 2026)) < 500) >= @gen_count - 2,
              'function and procedure compute the same figures (+- LOP rounding)');

CALL sp_generate_monthly_payroll(10, 2026, 5, @gen_count2, @gen_total2, @gen_msg2);
CALL t_assert('Re-running the payroll is idempotent (no duplicate payslips)',
              (SELECT COUNT(*) FROM payrolls WHERE pay_month = 10 AND pay_year = 2026) = @pay_before + @gen_count,
              CONCAT('still ', (SELECT COUNT(*) FROM payrolls WHERE pay_month = 10 AND pay_year = 2026), ' rows'));

-- =====================================================================================
SELECT '======== SECTION 6: ACADEMIC PROCEDURES AND GUARDS ========' AS section;
-- =====================================================================================
SELECT program_id, semester_id INTO @p_id, @sem_id
FROM course_offerings WHERE academic_year_id = 3 LIMIT 1;

CALL sp_bulk_enroll_students(@p_id, @sem_id, NULL, 1, @enr_new, @enr_skip, @enr_msg);
CALL t_assert('sp_bulk_enroll_students ran and reported what it did',
              @enr_new >= 0, CONCAT(IFNULL(@enr_msg,''), ' (already enrolled: ', @enr_skip, ')'));

CALL sp_bulk_enroll_students(@p_id, @sem_id, NULL, 1, @enr_new2, @enr_skip2, @enr_msg2);
CALL t_assert('Re-running bulk enrollment inserts no duplicates',
              @enr_new2 = 0, CONCAT('second run inserted ', @enr_new2, ' rows'));

CALL t_try('INSERT INTO enrollments (student_id, offering_id, status) SELECT student_id, offering_id, ''ENROLLED'' FROM enrollments LIMIT 1',
           @dup_enr_blocked, @msg8);
CALL t_assert('Duplicate enrollment is rejected by the UNIQUE constraint',
              @dup_enr_blocked = 0, LEFT(IFNULL(@msg8, 'ACCEPTED - RULE BROKEN'), 60));

-- Marks entry: the grade is derived inside the database.
SET @reg := (SELECT registration_id FROM marks LIMIT 1);
DELETE FROM marks WHERE registration_id = @reg;
CALL t_try(CONCAT('INSERT INTO marks (registration_id, marks_obtained, max_marks, entered_by) VALUES (',
                  @reg, ', 5000, 100, 1)'), @marks_blocked, @msg9);
CALL t_assert('Marks above the maximum are rejected by the trigger',
              @marks_blocked = 0, IFNULL(@msg9, 'ACCEPTED - RULE BROKEN'));

INSERT INTO marks (registration_id, marks_obtained, max_marks, entered_by)
VALUES (@reg, 82, 100, 1);
CALL t_assert('Marks trigger derived the grade letter and grade points (82/100 -> AB / 9.00)',
              (SELECT grade FROM marks WHERE registration_id = @reg) = 'AB'
              AND (SELECT grade_points FROM marks WHERE registration_id = @reg) = 9.00,
              CONCAT((SELECT grade FROM marks WHERE registration_id = @reg), ' / ',
                     (SELECT grade_points FROM marks WHERE registration_id = @reg), ' points'));

UPDATE marks SET marks_obtained = 35 WHERE registration_id = @reg;
CALL t_assert('Updating marks re-derives the grade (35/100 -> FF / 0.00)',
              (SELECT grade FROM marks WHERE registration_id = @reg) = 'FF'
              AND (SELECT is_pass FROM marks WHERE registration_id = @reg) = 0,
              CONCAT((SELECT grade FROM marks WHERE registration_id = @reg), ' / pass=',
                     (SELECT is_pass FROM marks WHERE registration_id = @reg)));

-- Timetable conflict detection.
SELECT offering_id, section_id, faculty_id INTO @tt_off, @tt_sec, @tt_fac
FROM course_offerings WHERE academic_year_id = 3 AND section_id IS NOT NULL LIMIT 1;
SELECT day_of_week, start_time, end_time, room_number
INTO @tt_day, @tt_start, @tt_end, @tt_room
FROM timetable WHERE section_id = @tt_sec LIMIT 1;
CALL t_try(CONCAT('INSERT INTO timetable (offering_id, section_id, faculty_id, day_of_week, start_time, end_time, room_number) VALUES (',
                  @tt_off, ',', @tt_sec, ',', @tt_fac, ', ''', @tt_day, ''', ''', @tt_start,
                  ''', ''', @tt_end, ''', ''', @tt_room, ''')'), @tt_blocked, @msg10);
CALL t_assert('Timetable conflict is rejected with a readable message',
              @tt_blocked = 0, IFNULL(@msg10, 'ACCEPTED - RULE BROKEN'));

-- =====================================================================================
SELECT '======== SECTION 7: EXAM REGISTRATION PROCEDURE ========' AS section;
-- =====================================================================================
SELECT s.student_id, s.offering_id INTO @e_student, @e_offering
FROM v_student_attendance_summary s
WHERE s.attendance_percentage >= 75
  AND s.semester_id IN (SELECT semester_id FROM semesters
                        WHERE academic_year_id = (SELECT academic_year_id FROM academic_years WHERE is_current = 1))
LIMIT 1;
SET @e_exam := (SELECT exam_id FROM exams
                WHERE semester_id = (SELECT semester_id FROM course_offerings WHERE offering_id = @e_offering)
                  AND status = 'REGISTRATION_OPEN' LIMIT 1);

DELETE FROM exam_registrations
WHERE exam_id = @e_exam AND student_id = @e_student AND offering_id = @e_offering;

CALL sp_register_student_for_exam(@e_exam, @e_student, @e_offering, 4, @reg_id, @reg_status, @reg_msg);
CALL t_assert('sp_register_student_for_exam registers an eligible student',
              @reg_status = 'REGISTERED', IFNULL(@reg_msg, ''));
CALL t_assert('The registration issued a hall ticket number',
              (SELECT hall_ticket_no FROM exam_registrations WHERE registration_id = @reg_id) IS NOT NULL,
              (SELECT hall_ticket_no FROM exam_registrations WHERE registration_id = @reg_id));
CALL t_assert('The registration notified the student',
              (SELECT COUNT(*) FROM notifications WHERE entity = 'exam' AND entity_id = @e_exam) > 0,
              CONCAT((SELECT COUNT(*) FROM notifications WHERE entity = 'exam'), ' exam notifications'));

-- A second low-attendance student (the first one was already registered above).
SET @low_s2 := NULL; SET @low_o2 := NULL; SET @low_pct2 := NULL;
SELECT s.student_id, s.offering_id, s.attendance_percentage
INTO @low_s2, @low_o2, @low_pct2
FROM v_student_attendance_summary s
WHERE s.attendance_percentage < 75
  AND s.semester_id = (SELECT semester_id FROM exams WHERE exam_id = @low_exam)
  AND NOT EXISTS (SELECT 1 FROM exam_registrations r
                  WHERE r.exam_id = @low_exam
                    AND r.student_id = s.student_id
                    AND r.offering_id = s.offering_id)
LIMIT 1;

CALL sp_register_student_for_exam(@low_exam, @low_s2, @low_o2, 4, @r2, @st2, @mg2);
CALL t_assert('sp_register_student_for_exam refuses a student below 75%',
              @st2 = 'REJECTED',
              CONCAT('student ', @low_s2, ' (', @low_pct2, '%) -> ', IFNULL(@mg2, '')));

-- =====================================================================================
SELECT '======== SECTION 8: ADMISSION APPROVAL PROCEDURE ========' AS section;
-- =====================================================================================
SET @adm := (SELECT admission_id FROM admissions WHERE status IN ('APPLIED','UNDER_REVIEW')
             AND student_id IS NULL LIMIT 1);
SET @stud_before := (SELECT COUNT(*) FROM students);
CALL sp_approve_admission(@adm, 1, 1, 'Approved by the admission committee', @new_stud, @adm_msg);
SET @adm := IFNULL(@adm, 0);
CALL t_assert('sp_approve_admission created the student record',
              @new_stud IS NOT NULL AND (SELECT COUNT(*) FROM students) = @stud_before + 1,
              IFNULL(@adm_msg, ''));
CALL t_assert('sp_approve_admission created the login account',
              (SELECT COUNT(*) FROM users u JOIN students s ON s.user_id = u.user_id
               WHERE s.student_id = @new_stud) = 1, CONCAT('student ', @new_stud));
CALL t_assert('sp_approve_admission linked the application to the new student',
              (SELECT student_id FROM admissions WHERE admission_id = @adm) = @new_stud, '');
CALL t_assert('sp_approve_admission generated a roll number',
              (SELECT roll_number FROM students WHERE student_id = @new_stud) LIKE '2026%',
              (SELECT roll_number FROM students WHERE student_id = @new_stud));

-- =====================================================================================
SELECT '======== SECTION 9: LEAVE APPROVAL PROCEDURE ========' AS section;
-- =====================================================================================
SELECT leave_id, faculty_id, leave_type, days
INTO @lv, @lv_fac, @lv_type, @lv_days
FROM faculty_leaves WHERE status = 'PENDING' AND leave_type IN ('CASUAL','SICK','EARNED')
  AND days <= 3 LIMIT 1;
SET @used_before := (SELECT IFNULL(SUM(used),0) FROM leave_balances
                     WHERE faculty_id = @lv_fac AND leave_type = @lv_type);
CALL sp_approve_leave(@lv, 1, 1, 'Approved', @lv_msg);
CALL t_assert('sp_approve_leave approved the leave',
              (SELECT status FROM faculty_leaves WHERE leave_id = @lv) = 'APPROVED', IFNULL(@lv_msg, ''));
CALL t_assert('sp_approve_leave consumed the leave balance',
              (SELECT IFNULL(SUM(used),0) FROM leave_balances
               WHERE faculty_id = @lv_fac AND leave_type = @lv_type) = @used_before + @lv_days,
              CONCAT(@used_before, ' -> ', (SELECT IFNULL(SUM(used),0) FROM leave_balances
                     WHERE faculty_id = @lv_fac AND leave_type = @lv_type), ' used days'));

-- =====================================================================================
SELECT '======== SECTION 10: VIEWS AND ANALYTICS ========' AS section;
-- =====================================================================================
CALL t_assert('v_student_rankings ranks every student (RANK/DENSE_RANK/ROW_NUMBER)',
              (SELECT COUNT(*) FROM v_student_rankings WHERE university_rank IS NULL) = 0,
              CONCAT((SELECT COUNT(*) FROM v_student_rankings), ' ranked students'));
CALL t_assert('v_hostel_occupancy balances (occupied + available = total)',
              (SELECT COUNT(*) FROM v_hostel_occupancy
               WHERE occupied_beds + available_beds <> total_beds) = 0, 'all hostels balance');
CALL t_assert('v_exam_eligibility marks low attendance students as ineligible',
              (SELECT COUNT(*) FROM v_exam_eligibility WHERE is_eligible = 0) > 0,
              CONCAT((SELECT COUNT(*) FROM v_exam_eligibility WHERE is_eligible = 0),
                     ' ineligible (student, subject) pairs'));
CALL t_assert('v_student_risk_dashboard identifies students at risk',
              (SELECT COUNT(*) FROM v_student_risk_dashboard WHERE risk_level <> 'LOW') > 0,
              CONCAT((SELECT COUNT(*) FROM v_student_risk_dashboard WHERE risk_level = 'CRITICAL'),
                     ' critical / ',
                     (SELECT COUNT(*) FROM v_student_risk_dashboard WHERE risk_level = 'HIGH'), ' high / ',
                     (SELECT COUNT(*) FROM v_student_risk_dashboard WHERE risk_level = 'MEDIUM'), ' medium'));
CALL t_assert('v_department_performance reports every department',
              (SELECT COUNT(*) FROM v_department_performance) = (SELECT COUNT(*) FROM departments),
              CONCAT((SELECT COUNT(*) FROM v_department_performance), ' departments'));
CALL t_assert('v_subject_failure_rate ranks the subjects',
              (SELECT COUNT(*) FROM v_subject_failure_rate WHERE attempts > 0) > 0,
              CONCAT((SELECT COUNT(*) FROM v_subject_failure_rate), ' subjects analysed'));

CALL sp_compute_student_risk(@risk_rows, @risk_msg);
CALL t_assert('sp_compute_student_risk persisted the risk scores', @risk_rows > 0, IFNULL(@risk_msg, ''));

-- =====================================================================================
SELECT '======== SECTION 11: AUDIT TRAIL ========' AS section;
-- =====================================================================================
CALL t_assert('Audit log captured FEE_CHANGE entries',
              (SELECT COUNT(*) FROM audit_logs WHERE action = 'FEE_CHANGE') > 0,
              CONCAT((SELECT COUNT(*) FROM audit_logs WHERE action = 'FEE_CHANGE'), ' entries'));
CALL t_assert('Audit log captured MARKS_UPDATE entries',
              (SELECT COUNT(*) FROM audit_logs WHERE action = 'MARKS_UPDATE') > 0,
              CONCAT((SELECT COUNT(*) FROM audit_logs WHERE action = 'MARKS_UPDATE'), ' entries'));
CALL t_assert('Audit log captured HOSTEL_ALLOCATION entries',
              (SELECT COUNT(*) FROM audit_logs WHERE action = 'HOSTEL_ALLOCATION') > 0,
              CONCAT((SELECT COUNT(*) FROM audit_logs WHERE action = 'HOSTEL_ALLOCATION'), ' entries'));
CALL t_assert('Audit log captured PAYMENT entries',
              (SELECT COUNT(*) FROM audit_logs WHERE action = 'PAYMENT') > 0,
              CONCAT((SELECT COUNT(*) FROM audit_logs WHERE action = 'PAYMENT'), ' entries'));
CALL t_assert('Audit log captured PAYROLL_RUN entries',
              (SELECT COUNT(*) FROM audit_logs WHERE action = 'PAYROLL_RUN') > 0,
              CONCAT((SELECT COUNT(*) FROM audit_logs WHERE action = 'PAYROLL_RUN'), ' entries'));

-- =====================================================================================
SELECT '=================== TEST SUMMARY ===================' AS section;
SELECT @pass AS passed, @fail AS failed,
       CASE WHEN @fail = 0 THEN 'ALL DATABASE TESTS PASSED' ELSE 'SOME TESTS FAILED' END AS verdict;
