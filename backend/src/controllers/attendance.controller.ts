import { Request, Response } from 'express';
import * as service from '../services/attendance.service';
import { ok } from '../utils/api';
import { AuthUser } from '../middleware/auth';

const actor = (req: Request): AuthUser => req.user!;
const id = (req: Request): number => Number(req.params.id);

export const sessions = async (req: Request, res: Response) => {
  const result = await service.sessions.list(req.query as Record<string, any>);
  res.json(ok(result.rows, undefined, result.meta));
};

export const session = async (req: Request, res: Response) => {
  res.json(ok(await service.sessions.byId(id(req))));
};

export const roster = async (req: Request, res: Response) => {
  res.json(ok(await service.sessions.roster(id(req))));
};

export const createSession = async (req: Request, res: Response) => {
  res.status(201).json(ok(await service.sessions.create(req.body, actor(req)), 'Lecture created'));
};

/** Student facing: my attendance. The path param is ignored for STUDENT role. */
export const mySummary = async (req: Request, res: Response) => {
  const studentId = actor(req).role === 'STUDENT' ? Number(actor(req).studentId) : id(req);
  res.json(ok(await service.attendance.studentSummary(studentId, req.query.semesterId ? Number(req.query.semesterId) : undefined)));
};

export const overall = async (req: Request, res: Response) => {
  const studentId = actor(req).role === 'STUDENT' ? Number(actor(req).studentId) : id(req);
  res.json(ok(await service.attendance.studentOverall(studentId)));
};

export const monthly = async (req: Request, res: Response) => {
  const studentId = actor(req).role === 'STUDENT' ? Number(actor(req).studentId) : id(req);
  res.json(ok(await service.attendance.monthly(studentId)));
};

export const history = async (req: Request, res: Response) => {
  res.json(ok(await service.attendance.history(id(req), req.query.from as string, req.query.to as string)));
};

export const offeringReport = async (req: Request, res: Response) => {
  res.json(ok(await service.attendance.offeringReport(id(req))));
};

export const low = async (req: Request, res: Response) => {
  res.json(ok(await service.attendance.low(
    req.query.threshold ? Number(req.query.threshold) : undefined,
    req.query.semesterId ? Number(req.query.semesterId) : undefined,
    req.query.departmentId ? Number(req.query.departmentId) : undefined,
  )));
};

export const stats = async (_req: Request, res: Response) => { res.json(ok(await service.attendance.stats())); };

export const mark = async (req: Request, res: Response) => {
  const { studentId, status, remarks } = req.body as { studentId: number; status: string; remarks?: string };
  res.json(ok(await service.mark(id(req), Number(studentId), status, remarks, actor(req)), 'Attendance saved'));
};

export const markBulk = async (req: Request, res: Response) => {
  const { studentIds, status } = req.body as { studentIds: number[]; status: string };
  res.json(ok(await service.markBulk(id(req), studentIds, status, actor(req)), 'Attendance saved'));
};

export const warnLow = async (req: Request, res: Response) => {
  res.json(ok(await service.warnLowAttendance(actor(req)), 'Low attendance warnings sent'));
};
