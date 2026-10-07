/**
 * npm run db:verify
 *
 * Proves the installed database is internally consistent: every denormalised
 * counter is compared with the rows it summarises, and every cross-module
 * invariant is checked. These are the same checks listed in MODULE_INTEGRATION.md
 * §14 — a bad count of 0 on each line is the expected result.
 */
import { env } from '../config/env';
import { query, Row } from '../config/database';

const CHECKS: Array<{ name: string; sql: string }> = [
  {
    name: 'every active student has a login, program and department',
    sql: `SELECT COUNT(*) AS bad FROM students s
          LEFT JOIN users u    ON u.user_id    = s.user_id
          LEFT JOIN programs p ON p.program_id = s.program_id
          WHERE s.status = 'ACTIVE' AND (u.user_id IS NULL OR p.program_id IS NULL)`,
  },
  {
    name: 'course_offerings.enrolled_count matches the enrolment rows',
    sql: `SELECT COUNT(*) AS bad FROM course_offerings o
          WHERE o.enrolled_count <> (SELECT COUNT(*) FROM enrollments e WHERE e.offering_id = o.offering_id)`,
  },
  {
    name: 'rooms.occupied_count matches the active allocations',
    sql: `SELECT COUNT(*) AS bad FROM rooms r
          WHERE r.occupied_count <> (SELECT COUNT(*) FROM room_allocations ra
                                     WHERE ra.room_id = r.room_id AND ra.status = 'ACTIVE')`,
  },
  {
    name: 'bed status matches the active allocations',
    sql: `SELECT COUNT(*) AS bad FROM beds b
          WHERE (b.status = 'OCCUPIED') <> EXISTS (SELECT 1 FROM room_allocations ra
                 WHERE ra.bed_id = b.bed_id AND ra.status = 'ACTIVE')`,
  },
  {
    name: 'hostel roll-ups match rooms and allocations',
    sql: `SELECT COUNT(*) AS bad FROM hostels h
          WHERE h.occupied_beds <> (SELECT COUNT(*) FROM room_allocations ra
                                    WHERE ra.hostel_id = h.hostel_id AND ra.status = 'ACTIVE')
             OR h.total_beds    <> (SELECT IFNULL(SUM(capacity),0) FROM rooms r WHERE r.hostel_id = h.hostel_id)`,
  },
  {
    name: 'bill arithmetic holds (due = total - scholarship - discount - paid + fine)',
    sql: `SELECT COUNT(*) AS bad FROM student_fees
          WHERE ABS((total_amount - scholarship_amount - discount_amount - paid_amount + fine_amount)
                    - due_amount) > 0.01`,
  },
  {
    name: 'no bill marked PAID still carries a balance (and vice versa)',
    sql: `SELECT COUNT(*) AS bad FROM student_fees
          WHERE (status = 'PAID' AND due_amount > 0) OR (status <> 'PAID' AND due_amount <= 0)`,
  },
  {
    name: 'leave ledgers match the approved leave days',
    sql: `SELECT COUNT(*) AS bad FROM leave_balances lb
          WHERE lb.used <> (SELECT IFNULL(SUM(days),0) FROM faculty_leaves l
                            WHERE l.faculty_id = lb.faculty_id AND l.leave_type = lb.leave_type
                              AND l.status = 'APPROVED')`,
  },
  {
    name: 'no exam registration was accepted below the attendance bar',
    sql: `SELECT COUNT(*) AS bad FROM exam_registrations WHERE is_eligible = 0 AND status = 'REGISTERED'`,
  },
  {
    name: 'every payment belongs to a bill of the same student',
    sql: `SELECT COUNT(*) AS bad FROM payments p
          JOIN student_fees sf ON sf.student_fee_id = p.student_fee_id
          WHERE p.student_id <> sf.student_id`,
  },
];

async function main(): Promise<void> {
  console.log(`>> Verifying '${env.db.database}'\n`);
  let failed = 0;
  for (const c of CHECKS) {
    const [row] = await query<Row>(c.sql);
    const bad = Number(row?.bad ?? 0);
    if (bad !== 0) failed += 1;
    console.log(`   ${bad === 0 ? 'PASS' : 'FAIL'}  ${c.name}${bad ? `  (${bad} bad rows)` : ''}`);
  }
  const [counts] = await query<Row>(
    `SELECT
       (SELECT COUNT(*) FROM students)       AS students,
       (SELECT COUNT(*) FROM faculty)        AS faculty,
       (SELECT COUNT(*) FROM enrollments)    AS enrollments,
       (SELECT COUNT(*) FROM attendance)     AS attendance,
       (SELECT COUNT(*) FROM marks)          AS marks,
       (SELECT COUNT(*) FROM student_fees)   AS bills,
       (SELECT COUNT(*) FROM room_allocations WHERE status='ACTIVE') AS residents,
       (SELECT COUNT(*) FROM payrolls)       AS payslips,
       (SELECT COUNT(*) FROM audit_logs)     AS audit`,
  );
  console.log('\n   row counts:', JSON.stringify(counts));
  console.log(failed === 0
    ? '\n>> ALL CONSISTENCY CHECKS PASSED'
    : `\n>> ${failed} CHECK(S) FAILED — re-run 06_triggers.sql (its reconciliation block repairs derived counters)`);
  process.exitCode = failed === 0 ? 0 : 1;
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
