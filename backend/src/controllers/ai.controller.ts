import { Request, Response } from 'express';
import { ai } from '../services/ai.service';
import { ok } from '../utils/api';
import { AuthUser } from '../middleware/auth';

const actor = (req: Request): AuthUser => req.user!;

export const engine = (_req: Request, res: Response) => { res.json(ok(ai.engine())); };

export const chat = async (req: Request, res: Response) => {
  const { message, sessionId, studentId } = req.body as {
    message: string; sessionId: string; studentId?: number;
  };
  // Only advisors may point the assistant at another student.
  const target = actor(req).role === 'STUDENT' ? undefined : studentId;
  res.json(ok(await ai.chat(message, sessionId || `s-${actor(req).userId}`, actor(req), target)));
};

export const history = async (req: Request, res: Response) => {
  res.json(ok(await ai.history(actor(req).userId, req.query.sessionId as string)));
};
export const sessions = async (req: Request, res: Response) => {
  res.json(ok(await ai.sessions(actor(req).userId)));
};
export const studyPlan = async (req: Request, res: Response) => {
  const { studentId } = req.query as { studentId?: string };
  const target = actor(req).role === 'STUDENT' ? undefined : (studentId ? Number(studentId) : undefined);
  res.json(ok(await ai.studyPlan(actor(req), target)));
};
export const latestPlan = async (req: Request, res: Response) => {
  const studentId = actor(req).role === 'STUDENT' ? Number(actor(req).studentId) : Number(req.params.studentId);
  res.json(ok(await ai.latestPlan(studentId)));
};
export const plans = async (req: Request, res: Response) => {
  const studentId = actor(req).role === 'STUDENT' ? Number(actor(req).studentId) : Number(req.params.studentId);
  res.json(ok(await ai.plans(studentId)));
};
export const atRisk = async (_req: Request, res: Response) => { res.json(ok(await ai.atRisk())); };
export const recomputeRisk = async (req: Request, res: Response) => {
  res.json(ok(await ai.recomputeRisk(actor(req)), 'Risk scores recomputed'));
};
