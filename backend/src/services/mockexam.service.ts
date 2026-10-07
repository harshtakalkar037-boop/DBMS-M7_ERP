import { queryOne, Row } from '../config/database';
import { AppError, parsePaging } from '../utils/api';
import { questionsRepo, mockExamRepo } from '../repositories/mockexam.repository';
import { audit } from '../utils/audit';
import { AuthUser } from '../middleware/auth';

export const questions = {
  list: (q: Record<string, any>) => questionsRepo.list(q, parsePaging(q)),
  byId: questionsRepo.byId,
  topics: questionsRepo.topics,
  bankStats: questionsRepo.bankStats,
  async create(b: Record<string, any>, actor: AuthUser) {
    const id = await questionsRepo.create(b, actor.userId);
    await audit({ userId: actor.userId, action: 'CREATE', entity: 'mcq_questions', entityId: id, description: 'MCQ added to the bank' });
    return { questionId: id };
  },
  async update(id: number, b: Record<string, any>, actor: AuthUser) {
    await questionsRepo.update(id, b);
    await audit({ userId: actor.userId, action: 'UPDATE', entity: 'mcq_questions', entityId: id, description: 'MCQ updated' });
    return { questionId: id };
  },
  async remove(id: number, actor: AuthUser) {
    await questionsRepo.remove(id);
    await audit({ userId: actor.userId, action: 'DELETE', entity: 'mcq_questions', entityId: id, description: 'MCQ removed' });
    return { deleted: true };
  },
};

export const mockExams = {
  /**
   * Start a new attempt. Questions are chosen with ORDER BY RAND() from the
   * bank; if the bank is empty for that subject we fail loudly instead of
   * inventing questions.
   */
  async start(studentId: number, subjectId: number, difficulty: string, count: number, duration: number) {
    const available = await queryOne<Row>(
      `SELECT COUNT(*) AS n FROM mcq_questions q
       WHERE q.subject_id = ? AND q.status = 'ACTIVE' AND (? = 'MIXED' OR q.difficulty = ?)`,
      [subjectId, difficulty, difficulty],
    );
    const n = Number(available?.n ?? 0);
    if (n === 0) {
      throw AppError.business(
        'No questions are available for this subject and difficulty. Ask a faculty member to add questions to the bank first.',
      );
    }
    const size = Math.min(count, n);
    const id = await mockExamRepo.create(studentId, subjectId, difficulty, size, duration);
    const paper = await mockExamRepo.paper(id);
    return {
      examId: id,
      durationMinutes: duration,
      totalQuestions: size,
      /** correct_option is deliberately not returned while the attempt is live. */
      questions: paper.map((q) => ({
        answerId: q.answerId,
        questionId: q.questionId,
        questionText: q.questionText,
        optionA: q.optionA, optionB: q.optionB, optionC: q.optionC, optionD: q.optionD,
        marks: q.marks, difficulty: q.difficulty, selectedOption: q.selectedOption,
      })),
    };
  },

  byId: mockExamRepo.byId,
  paper: (id: number) => mockExamRepo.paper(id),

  async answer(examId: number, answerId: number, option: string | null, studentId: number) {
    const exam = await mockExamRepo.byId(examId, studentId);
    if (!exam) throw AppError.notFound('Mock exam');
    if (exam.status !== 'IN_PROGRESS') throw AppError.business('This attempt has already been submitted');
    if (exam.expires_at && new Date(exam.expires_at) < new Date()) {
      await mockExamRepo.submit(examId);
      await mockExamRepo.finalize(examId);
      throw AppError.business('The time for this attempt has expired. It has been auto-submitted.');
    }
    await mockExamRepo.saveAnswer(answerId, examId, option ? option.toUpperCase() : null);
    return { saved: true };
  },

  /** Grade (SQL) then finalise the totals. */
  async submit(examId: number, studentId: number) {
    const exam = await mockExamRepo.byId(examId, studentId);
    if (!exam) throw AppError.notFound('Mock exam');
    if (exam.status !== 'IN_PROGRESS') throw AppError.business('This attempt has already been submitted');
    await mockExamRepo.submit(examId);
    await mockExamRepo.finalize(examId);
    const after = await mockExamRepo.byId(examId, studentId);
    return {
      examId,
      score: Number(after?.score ?? 0),
      maxScore: Number(after?.max_score ?? 0),
      percentage: Number(after?.percentage ?? 0),
      correct: Number(after?.correct_count ?? 0),
      total: Number(after?.total_questions ?? 0),
    };
  },

  review: (examId: number, studentId: number) => mockExamRepo.review(examId),
  forStudent: mockExamRepo.forStudent,
  stats: mockExamRepo.stats,
  leaderboard: mockExamRepo.leaderboard,
};
