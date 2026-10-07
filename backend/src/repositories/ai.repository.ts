import { query, queryOne, execute, Row } from '../config/database';
import { getCollections } from '../config/mongo';

/**
 * Module "AI" persistence. Two stores are used on purpose:
 *  - MySQL  : `ai_conversations` and `study_plans` (system of record, always available)
 *  - MongoDB: the same conversation turns are mirrored when MONGODB_URI is configured,
 *             because chat history is append-only and grows without a fixed schema.
 */
export const aiRepo = {
  appendMessage: async (userId: number, sessionId: string, role: 'USER' | 'ASSISTANT',
    message: string, source: 'LOCAL_ENGINE' | 'LLM'): Promise<void> => {
    await execute(
      'INSERT INTO ai_conversations (user_id, session_id, role, message, source) VALUES (?,?,?,?,?)',
      [userId, sessionId, role, message, source],
    );
    const { aiMessages } = getCollections();
    if (aiMessages) {
      await aiMessages.insertOne({
        userId, sessionId, role, message, source, createdAt: new Date(),
      }).catch(() => undefined);
    }
  },
  history: (userId: number, sessionId?: string, limit = 40) => query<Row>(
    `SELECT conversation_id AS id, role, message, source, created_at AS createdAt
     FROM ai_conversations
     WHERE user_id = ? ${sessionId ? 'AND session_id = ?' : ''}
     ORDER BY conversation_id DESC LIMIT ?`,
    sessionId ? [userId, sessionId, limit] : [userId, limit]),
  sessions: (userId: number) => query<Row>(
    `SELECT session_id AS sessionId, MAX(created_at) AS lastAt, COUNT(*) AS turns
     FROM ai_conversations WHERE user_id = ?
     GROUP BY session_id ORDER BY lastAt DESC LIMIT 20`, [userId]),
  savePlan: async (studentId: number, source: 'LOCAL_ENGINE' | 'LLM',
    snapshot: unknown, plan: unknown, validUntil?: string): Promise<number> => {
    const res = await execute(
      `INSERT INTO study_plans (student_id, source, input_snapshot, plan_json, valid_until)
       VALUES (?,?,?,?,?)`,
      [studentId, source, JSON.stringify(snapshot), JSON.stringify(plan), validUntil ?? null],
    );
    return res.insertId;
  },
  latestPlan: (studentId: number) => queryOne<Row>(
    `SELECT * FROM study_plans WHERE student_id = ? ORDER BY generated_on DESC LIMIT 1`, [studentId]),
  plans: (studentId: number) => query<Row>(
    `SELECT plan_id AS planId, generated_on AS generatedOn, source, valid_until AS validUntil
     FROM study_plans WHERE student_id = ? ORDER BY generated_on DESC LIMIT 20`, [studentId]),

  /** Facts the local engine / LLM may use. Everything here is real data. */
  studentContext: async (studentId: number) => {
    const [profile, attendance, exams, fees, mock, results] = await Promise.all([
      queryOne<Row>('SELECT * FROM v_student_full_profile WHERE student_id = ?', [studentId]),
      query<Row>(`SELECT subject_code AS subjectCode, subject_name AS subjectName,
                         total_classes AS totalClasses, attended_classes AS attended,
                         attendance_percentage AS percentage, attendance_status AS status
                  FROM v_student_attendance_summary
                  WHERE student_id = ? ORDER BY attendance_percentage ASC`, [studentId]),
      query<Row>(`SELECT s.semester_no AS semesterNo, sub.subject_code AS subjectCode, sub.name AS subjectName,
                         m.marks_obtained AS marks, m.max_marks AS maxMarks, m.grade,
                         m.grade_points AS gradePoints, m.is_pass AS isPass
                  FROM marks m
                  JOIN exam_registrations er ON er.registration_id = m.registration_id
                  JOIN course_offerings o    ON o.offering_id = er.offering_id
                  JOIN subjects sub          ON sub.subject_id = o.subject_id
                  JOIN exams e               ON e.exam_id = er.exam_id
                  JOIN semesters s           ON s.semester_id = e.semester_id
                  WHERE er.student_id = ?
                  ORDER BY s.start_date DESC, sub.subject_code`, [studentId]),
      queryOne<Row>('SELECT * FROM v_student_fee_status WHERE student_id = ?', [studentId]),
      query<Row>(`SELECT subject_code AS subjectCode, attempts, average_percentage AS averagePercentage
                  FROM (
                    SELECT s.subject_code, COUNT(*) AS attempts, ROUND(AVG(m.percentage), 2) AS average_percentage
                    FROM mock_exams m JOIN subjects s ON s.subject_id = m.subject_id
                    WHERE m.student_id = ? AND m.status = 'SUBMITTED'
                    GROUP BY s.subject_code
                  ) t ORDER BY average_percentage ASC`, [studentId]),
      queryOne<Row>(`SELECT ROUND(AVG(sgpa), 2) AS averageSgpa, MAX(cgpa) AS latestCgpa,
                            SUM(backlog_count) AS backlogs
                     FROM results WHERE student_id = ?`, [studentId]),
    ]);
    return { profile, attendance, exams, fees, mock, results };
  },
  riskContext: () => query<Row>(
    `SELECT * FROM v_student_risk_dashboard ORDER BY risk_score DESC LIMIT 50`),
};
