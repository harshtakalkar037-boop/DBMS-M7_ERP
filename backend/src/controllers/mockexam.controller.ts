import { Request, Response } from 'express';
import { questions, mockExams } from '../services/mockexam.service';
import { ok } from '../utils/api';
import { AuthUser } from '../middleware/auth';

const actor = (req: Request): AuthUser => req.user!;
const id = (req: Request): number => Number(req.params.id);
const send = (res: Response, d: unknown, m?: string, status = 200) => res.status(status).json(ok(d, m));
const studentId = (req: Request): number => Number(actor(req).studentId ?? req.body?.studentId ?? 0);

/* --------------------------------------------------------------- question bank */

export const bankStats = async (_req: Request, res: Response) => { send(res, await questions.bankStats()); };
export const list = async (req: Request, res: Response) => {
  const r = await questions.list(req.query as Record<string, any>);
  send(res, r.rows);
};
export const question = async (req: Request, res: Response) => { send(res, await questions.byId(id(req))); };
export const topics = async (req: Request, res: Response) => { send(res, await questions.topics(id(req))); };
export const create = async (req: Request, res: Response) => {
  send(res, await questions.create(req.body, actor(req)), 'Question added', 201);
};
export const update = async (req: Request, res: Response) => {
  send(res, await questions.update(id(req), req.body, actor(req)), 'Question updated');
};
export const remove = async (req: Request, res: Response) => {
  send(res, await questions.remove(id(req), actor(req)), 'Question removed');
};

/* --------------------------------------------------------------------- attempts */

export const start = async (req: Request, res: Response) => {
  const { subjectId, difficulty, count, duration } = req.body as {
    subjectId: number; difficulty?: string; count?: number; duration?: number;
  };
  send(res, await mockExams.start(studentId(req), Number(subjectId), difficulty ?? 'MIXED',
    Number(count ?? 10), Number(duration ?? 15)), 'Attempt started', 201);
};
export const paper = async (req: Request, res: Response) => { send(res, await mockExams.paper(id(req))); };
export const answer = async (req: Request, res: Response) => {
  const { answerId, option } = req.body as { answerId: number; option: string | null };
  send(res, await mockExams.answer(id(req), Number(answerId), option, studentId(req)));
};
export const submit = async (req: Request, res: Response) => {
  send(res, await mockExams.submit(id(req), studentId(req)), 'Attempt submitted');
};
export const review = async (req: Request, res: Response) => {
  send(res, await mockExams.review(id(req), studentId(req)));
};
export const mine = async (req: Request, res: Response) => {
  send(res, await mockExams.forStudent(studentId(req), Number(req.query.limit ?? 20)));
};
export const stats = async (req: Request, res: Response) => { send(res, await mockExams.stats(studentId(req))); };
export const leaderboard = async (req: Request, res: Response) => {
  send(res, await mockExams.leaderboard(req.query.subjectId ? Number(req.query.subjectId) : undefined, Number(req.query.limit ?? 20)));
};
