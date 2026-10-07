import { query, Row } from '../config/database';

export interface SearchHit {
  module: string;
  entity: string;
  id: number;
  title: string;
  subtitle: string;
  link: string;
}

/**
 * Global search. Each entity is a separate parameterised UNION branch, so the
 * term is never concatenated into SQL. Results are capped per entity and the
 * whole set is limited, which keeps the query predictable on large data sets.
 */
export async function globalSearch(term: string, limit = 30): Promise<SearchHit[]> {
  const like = `%${term.trim()}%`;
  const exact = term.trim();
  // One entry per placeholder, in textual order of the UNION branches below.
  const params: unknown[] = [
    exact, like, like, like, like,               // students
    exact, like, like, like, like,               // faculty
    like, like, like,                            // subjects
    like, like,                                  // programs
    like, like,                                  // exams
    exact, like, like, like,                     // payments
    like, like,                                  // hostels
    like, like, like,                            // admissions
  ];
  // The UNION is wrapped in a derived table: MariaDB does not expose branch
  // aliases to the outer ORDER BY, while MySQL 8 does. This form works on both.
  const rows = await query<Row>(
    `SELECT * FROM (
     (SELECT 'STUDENT' AS module, 'students' AS entity, s.student_id AS id,
             CONCAT(s.first_name, ' ', s.last_name) AS title,
             CONCAT(s.roll_number, ' - ', p.program_code) AS subtitle,
             CONCAT('/students/', s.student_id) AS link,
             (s.roll_number = ?) AS exact_match
      FROM students s JOIN programs p ON p.program_id = s.program_id
      WHERE s.roll_number LIKE ? OR s.first_name LIKE ? OR s.last_name LIKE ? OR s.email LIKE ?
      ORDER BY s.roll_number LIMIT 8)

     UNION ALL
     (SELECT 'FACULTY', 'faculty', f.faculty_id,
             CONCAT(f.first_name, ' ', f.last_name),
             CONCAT(f.employee_code, ' - ', d.department_code),
             CONCAT('/faculty/', f.faculty_id), (f.employee_code = ?)
      FROM faculty f JOIN departments d ON d.department_id = f.department_id
      WHERE f.employee_code LIKE ? OR f.first_name LIKE ? OR f.last_name LIKE ? OR f.email LIKE ?
      ORDER BY f.employee_code LIMIT 8)

     UNION ALL
     (SELECT 'ACADEMIC', 'subjects', sub.subject_id, sub.name,
             CONCAT(sub.subject_code, ' - ', sub.credits, ' credits'),
             CONCAT('/academics/subjects/', sub.subject_id), 0
      FROM subjects sub
      WHERE sub.subject_code LIKE ? OR sub.name LIKE ? OR sub.short_name LIKE ?
      LIMIT 8)

     UNION ALL
     (SELECT 'ACADEMIC', 'programs', p.program_id, p.name,
             CONCAT(p.program_code, ' - ', d.department_code),
             CONCAT('/academics/programs/', p.program_id), 0
      FROM programs p JOIN departments d ON d.department_id = p.department_id
      WHERE p.program_code LIKE ? OR p.name LIKE ?
      LIMIT 5)

     UNION ALL
     (SELECT 'EXAM', 'exams', e.exam_id, e.name,
             CONCAT(e.exam_code, ' - ', e.exam_type),
             CONCAT('/exams/', e.exam_id), 0
      FROM exams e WHERE e.exam_code LIKE ? OR e.name LIKE ?
      LIMIT 5)

     UNION ALL
     (SELECT 'FINANCE', 'payments', pay.payment_id, pay.receipt_no,
             CONCAT(s2.roll_number, ' - INR ', pay.amount),
             CONCAT('/fees/payments/', pay.payment_id), (pay.receipt_no = ?)
      FROM payments pay JOIN students s2 ON s2.student_id = pay.student_id
      WHERE pay.receipt_no LIKE ? OR pay.transaction_id LIKE ? OR pay.reference_no LIKE ?
      ORDER BY pay.payment_id DESC LIMIT 8)

     UNION ALL
     (SELECT 'HOSTEL', 'hostels', h.hostel_id, h.name,
             CONCAT(h.hostel_code, ' - ', h.hostel_type),
             CONCAT('/hostel/hostels/', h.hostel_id), 0
      FROM hostels h WHERE h.hostel_code LIKE ? OR h.name LIKE ?
      LIMIT 5)

     UNION ALL
     (SELECT 'ADMISSION', 'admissions', a.admission_id,
             CONCAT(a.first_name, ' ', a.last_name),
             CONCAT(a.application_no, ' - ', a.status),
             CONCAT('/admissions/', a.admission_id), 0
      FROM admissions a
      WHERE a.application_no LIKE ? OR a.first_name LIKE ? OR a.last_name LIKE ?
      LIMIT 5)

     ) AS u
     ORDER BY u.exact_match DESC, u.module, u.title
     LIMIT ?`,
    [...params, limit],
  );
  return rows.map((r) => ({
    module: String(r.module),
    entity: String(r.entity),
    id: Number(r.id),
    title: String(r.title),
    subtitle: String(r.subtitle ?? ''),
    link: String(r.link),
  }));
}
