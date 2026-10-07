import { query, queryOne, execute, Row } from '../config/database';
import { paginate, searchClause, ListResult } from './helpers';
import { Paging } from '../utils/api';

/**
 * Module 4 extra: a mock/practice MCQ engine. Questions live in `mcq_questions`,
 * attempts in `mock_exams` + `mock_exam_answers`. Everything is real persisted data -
 * no fabricated scores.
 */
export const questionsRepo = {
  list: (q: Record<string, any>, paging: Paging): Promise<ListResult<Row>> => {
    const parts: string[] = [];
    const params: unknown[] = [];
    if (q.subjectId) { parts.push('q.subject_id = ?'); params.push(q.subjectId); }
    if (q.difficulty) { parts.push('q.difficulty = ?'); params.push(q.difficulty); }
    if (q.topic) { parts.push('q.topic = ?'); params.push(q.topic); }
    parts.push("q.status = 'ACTIVE'");
    const where = searchClause(['q.question_text', 'q.topic'], q.search as string,
      { clause: `WHERE ${parts.join(' AND ')}`, params });
    return paginate<Row>({
      baseSql: `SELECT q.*, s.subject_code AS subjectCode, s.name AS subjectName
                FROM mcq_questions q JOIN subjects s ON s.subject_id = q.subject_id`,
      where, orderBy: 'q.question_id DESC', paging,
    });
  },
  byId: (id: number) => queryOne<Row>('SELECT * FROM mcq_questions WHERE question_id = ?', [id]),
  create: async (b: Record<string, any>, by: number): Promise<number> => {
    const res = await execute(
      `INSERT INTO mcq_questions (subject_id, difficulty, question_text, option_a, option_b, option_c,
        option_d, correct_option, marks, explanation, topic, created_by, status)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,'ACTIVE')`,
      [b.subjectId, b.difficulty ?? 'MEDIUM', b.questionText, b.optionA, b.optionB, b.optionC,
       b.optionD, b.correctOption.toUpperCase(), b.marks ?? 1, b.explanation ?? null,
       b.topic ?? null, by],
    );
    return res.insertId;
  },
  update: async (id: number, b: Record<string, any>): Promise<void> => {
    await execute(
      `UPDATE mcq_questions SET question_text = COALESCE(?, question_text),
              option_a = COALESCE(?, option_a), option_b = COALESCE(?, option_b),
              option_c = COALESCE(?, option_c), option_d = COALESCE(?, option_d),
              correct_option = COALESCE(?, correct_option), explanation = COALESCE(?, explanation),
              difficulty = COALESCE(?, difficulty), topic = COALESCE(?, topic),
              status = COALESCE(?, status)
       WHERE question_id = ?`,
      [b.questionText ?? null, b.optionA ?? null, b.optionB ?? null, b.optionC ?? null,
       b.optionD ?? null, b.correctOption ? String(b.correctOption).toUpperCase() : null,
       b.explanation ?? null, b.difficulty ?? null, b.topic ?? null, b.status ?? null, id],
    );
  },
  remove: (id: number) => execute('DELETE FROM mcq_questions WHERE question_id = ?', [id]),
  topics: (subjectId: number) => query<Row>(
    `SELECT topic, COUNT(*) AS questionCount, difficulty
     FROM mcq_questions WHERE subject_id = ? AND status = 'ACTIVE'
     GROUP BY topic, difficulty ORDER BY topic`, [subjectId]),
  bankStats: () => query<Row>(
    `SELECT s.subject_id AS subjectId, s.subject_code AS subjectCode, s.name AS subjectName,
            COUNT(q.question_id) AS questions,
            SUM(q.difficulty = 'EASY')   AS easy,
            SUM(q.difficulty = 'MEDIUM') AS medium,
            SUM(q.difficulty = 'HARD')   AS hard
     FROM subjects s LEFT JOIN mcq_questions q
       ON q.subject_id = s.subject_id AND q.status = 'ACTIVE'
     GROUP BY s.subject_id, s.subject_code, s.name
     HAVING questions > 0
     ORDER BY questions DESC`),
};

export const mockExamRepo = {
  /** Create an attempt and pick questions at random from the bank. */
  create: async (studentId: number, subjectId: number, difficulty: string,
    count: number, duration: number): Promise<number> => {
    const res = await execute(
      `INSERT INTO mock_exams (student_id, subject_id, difficulty, total_questions, duration_minutes,
                               started_at, expires_at, status)
       VALUES (?,?,?,?,?, NOW(), DATE_ADD(NOW(), INTERVAL ? MINUTE), 'IN_PROGRESS')`,
      [studentId, subjectId, difficulty, count, duration, duration],
    );
    const examId = res.insertId;
    await execute(
      `INSERT INTO mock_exam_answers (mock_exam_id, question_id)
       SELECT ?, q.question_id
       FROM mcq_questions q
       WHERE q.subject_id = ? AND q.status = 'ACTIVE'
         AND (? = 'MIXED' OR q.difficulty = ?)
       ORDER BY RAND() LIMIT ?`,
      [examId, subjectId, difficulty, difficulty, count],
    );
    return examId;
  },
  byId: (id: number, studentId?: number) => queryOne<Row>(
    `SELECT m.*, s.subject_code AS subjectCode, s.name AS subjectName
     FROM mock_exams m JOIN subjects s ON s.subject_id = m.subject_id
     WHERE m.mock_exam_id = ? ${studentId ? 'AND m.student_id = ?' : ''}`,
    studentId ? [id, studentId] : [id]),
  /** Question paper (never exposes correct_option until submission). */
  paper: (examId: number) => query<Row>(
    `SELECT a.answer_id AS answerId, q.question_id AS questionId, q.question_text AS questionText,
            q.option_a AS optionA, q.option_b AS optionB, q.option_c AS optionC, q.option_d AS optionD,
            q.marks, q.difficulty, a.selected_option AS selectedOption
     FROM mock_exam_answers a JOIN mcq_questions q ON q.question_id = a.question_id
     WHERE a.mock_exam_id = ? ORDER BY a.answer_id`, [examId]),
  saveAnswer: (answerId: number, examId: number, option: string | null) => execute(
    `UPDATE mock_exam_answers SET selected_option = ?, answered_at = NOW()
     WHERE answer_id = ? AND mock_exam_id = ?`, [option, answerId, examId]),
  /** Grade the attempt in SQL - awards marks and computes score/percentage. */
  submit: (examId: number) => execute(
    `UPDATE mock_exam_answers a
     JOIN mcq_questions q ON q.question_id = a.question_id
     SET a.is_correct    = (a.selected_option <=> q.correct_option),
         a.marks_awarded = IF(a.selected_option <=> q.correct_option, q.marks, 0)
     WHERE a.mock_exam_id = ?`, [examId]),
  finalize: (examId: number) => execute(
    `UPDATE mock_exams m
     SET m.score          = (SELECT IFNULL(SUM(a.marks_awarded), 0) FROM mock_exam_answers a WHERE a.mock_exam_id = m.mock_exam_id),
         m.max_score      = (SELECT IFNULL(SUM(q.marks), 0) FROM mock_exam_answers a
                             JOIN mcq_questions q ON q.question_id = a.question_id WHERE a.mock_exam_id = m.mock_exam_id),
         m.correct_count  = (SELECT COUNT(*) FROM mock_exam_answers a WHERE a.mock_exam_id = m.mock_exam_id AND a.is_correct = 1),
         m.percentage     = ROUND(100 * (SELECT IFNULL(SUM(a.marks_awarded), 0) FROM mock_exam_answers a WHERE a.mock_exam_id = m.mock_exam_id)
                                    / NULLIF((SELECT IFNULL(SUM(q.marks), 0) FROM mock_exam_answers a
                                              JOIN mcq_questions q ON q.question_id = a.question_id
                                              WHERE a.mock_exam_id = m.mock_exam_id), 0), 2),
         m.submitted_at   = NOW(),
         m.status         = 'SUBMITTED'
     WHERE m.mock_exam_id = ?`, [examId]),
  /** Result review with explanation for each question. */
  review: (examId: number) => query<Row>(
    `SELECT q.question_id AS questionId, q.question_text AS questionText,
            q.option_a AS optionA, q.option_b AS optionB, q.option_c AS optionC, q.option_d AS optionD,
            q.correct_option AS correctOption, q.explanation, q.marks, q.difficulty,
            a.selected_option AS selectedOption, a.is_correct AS isCorrect, a.marks_awarded AS awarded
     FROM mock_exam_answers a JOIN mcq_questions q ON q.question_id = a.question_id
     WHERE a.mock_exam_id = ? ORDER BY a.answer_id`, [examId]),
  forStudent: (studentId: number, limit = 20) => query<Row>(
    `SELECT m.*, s.subject_code AS subjectCode, s.name AS subjectName
     FROM mock_exams m JOIN subjects s ON s.subject_id = m.subject_id
     WHERE m.student_id = ? ORDER BY m.started_at DESC LIMIT ?`, [studentId, limit]),
  /** Attempt history of a student - used by the AI study-planner and analytics. */
  stats: (studentId: number) => query<Row>(
    `SELECT s.subject_id AS subjectId, s.subject_code AS subjectCode, s.name AS subjectName,
            COUNT(m.mock_exam_id) AS attempts,
            ROUND(AVG(m.percentage), 2) AS averagePercentage,
            MAX(m.percentage) AS bestPercentage,
            MAX(m.submitted_at) AS lastAttempt
     FROM mock_exams m JOIN subjects s ON s.subject_id = m.subject_id
     WHERE m.student_id = ? AND m.status = 'SUBMITTED'
     GROUP BY s.subject_id, s.subject_code, s.name
     ORDER BY averagePercentage ASC`, [studentId]),
  leaderboard: (subjectId?: number, limit = 20) => query<Row>(
    `SELECT st.student_id AS studentId, st.roll_number AS rollNumber,
            CONCAT(st.first_name, ' ', st.last_name) AS studentName,
            COUNT(m.mock_exam_id) AS attempts, ROUND(AVG(m.percentage), 2) AS averagePercentage
     FROM mock_exams m JOIN students st ON st.student_id = m.student_id
     WHERE m.status = 'SUBMITTED' ${subjectId ? 'AND m.subject_id = ?' : ''}
     GROUP BY st.student_id, st.roll_number, st.first_name, st.last_name
     HAVING attempts >= 1
     ORDER BY averagePercentage DESC LIMIT ?`,
    subjectId ? [subjectId, limit] : [limit]),
};
