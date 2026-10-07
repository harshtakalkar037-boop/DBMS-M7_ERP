import { Request, Response } from 'express';
import * as service from '../services/exam.service';
import { ok } from '../utils/api';
import { AuthUser } from '../middleware/auth';

const actor = (req: Request): AuthUser => req.user!;
const id = (req: Request): number => Number(req.params.id);
const send = (res: Response, d: unknown, m?: string, status = 200) => res.status(status).json(ok(d, m));

/* -------------------------------------------------------------------- exams */

export const exams = async (req: Request, res: Response) => {
  const r = await service.exams.list(req.query as Record<string, any>);
  send(res, r.rows, undefined, 200); res;
};
export const exam = async (req: Request, res: Response) => { send(res, await service.exams.byId(id(req))); };
export const createExam = async (req: Request, res: Response) => {
  send(res, await service.exams.create(req.body, actor(req)), 'Exam created', 201);
};
export const updateExam = async (req: Request, res: Response) => {
  send(res, await service.exams.update(id(req), req.body, actor(req)), 'Exam updated');
};

/* ---------------------------------------------------------------- schedules */

export const schedules = async (req: Request, res: Response) => {
  send(res, await service.schedules.list(req.query.examId ? Number(req.query.examId) : undefined));
};
export const createSchedule = async (req: Request, res: Response) => {
  send(res, await service.schedules.create(req.body, actor(req)), 'Schedule added', 201);
};
export const deleteSchedule = async (req: Request, res: Response) => {
  send(res, await service.schedules.remove(id(req), actor(req)), 'Schedule removed');
};

/* -------------------------------------------------------------- registrations */

export const registrations = async (req: Request, res: Response) => {
  const r = await service.registrations.list(req.query as Record<string, any>);
  send(res, r.rows);
};

export const myRegistrations = async (req: Request, res: Response) => {
  const studentId = actor(req).role === 'STUDENT' ? Number(actor(req).studentId) : Number(req.params.id);
  send(res, await service.registrations.forStudent(studentId));
};

export const eligibility = async (req: Request, res: Response) => {
  send(res, await service.registrations.eligibility(req.query as Record<string, any>));
};

export const register = async (req: Request, res: Response) => {
  const { examId, studentId, offeringId } = req.body as Record<string, number>;
  const target = actor(req).role === 'STUDENT' ? Number(actor(req).studentId) : Number(studentId);
  const result = await service.registrations.register(Number(examId), target, Number(offeringId), actor(req));
  send(res, result, result.message, result.status === 'REJECTED' ? 409 : 201);
};

export const exempt = async (req: Request, res: Response) => {
  send(res, await service.registrations.grantExemption(id(req), String(req.body.reason ?? ''), actor(req)), 'Exemption granted');
};

export const registrationStats = async (req: Request, res: Response) => {
  send(res, await service.registrations.stats(req.query.examId ? Number(req.query.examId) : undefined));
};

/* --------------------------------------------------------------------- marks */

export const marksSheet = async (req: Request, res: Response) => { send(res, await service.marks.sheet(id(req))); };
export const enterMarks = async (req: Request, res: Response) => {
  const { registrationId, marksObtained, isAbsent } = req.body as {
    registrationId: number; marksObtained: number | null; isAbsent?: boolean;
  };
  send(res, await service.marks.enter(Number(registrationId), marksObtained, !!isAbsent, actor(req)), 'Marks saved');
};

/* ------------------------------------------------------------------- results */

export const myResults = async (req: Request, res: Response) => {
  const studentId = actor(req).role === 'STUDENT' ? Number(actor(req).studentId) : id(req);
  send(res, await service.results.forStudent(studentId));
};
export const markSheet = async (req: Request, res: Response) => {
  send(res, await service.results.markSheet(id(req), req.query.semesterId ? Number(req.query.semesterId) : undefined));
};
export const resultSummary = async (req: Request, res: Response) => { send(res, await service.results.summary(id(req))); };
export const departmentAnalysis = async (req: Request, res: Response) => {
  send(res, await service.results.departmentAnalysis(req.query.semesterId ? Number(req.query.semesterId) : undefined));
};
export const rankings = async (req: Request, res: Response) => {
  send(res, await service.results.rankings(
    req.query.semesterId ? Number(req.query.semesterId) : undefined,
    Number(req.query.limit ?? 50)));
};
export const subjectAnalysis = async (req: Request, res: Response) => {
  send(res, await service.results.subjectWise(req.query.semesterId ? Number(req.query.semesterId) : undefined));
};
export const processResults = async (req: Request, res: Response) => {
  send(res, await service.results.process(Number(req.body.semesterId), req.body.examId ? Number(req.body.examId) : null, actor(req)), 'Results processed');
};
export const publish = async (req: Request, res: Response) => {
  send(res, await service.results.publish(id(req), actor(req)), 'Results published');
};

/* --------------------------------------------------------------- hall ticket */

export const hallTicket = async (req: Request, res: Response) => {
  const studentId = actor(req).role === 'STUDENT' ? Number(actor(req).studentId) : id(req);
  send(res, await service.hallTicket.get(studentId, req.query.examId ? Number(req.query.examId) : undefined));
};

/* -------------------------------------------------------------------- grades */

export const grades = async (_req: Request, res: Response) => { send(res, await service.grades.list()); };

/* -------------------------------------------------------------------- policy */

export const threshold = async (_req: Request, res: Response) => { send(res, { minAttendancePercentage: await service.examPolicy.threshold() }); };
export const setThreshold = async (req: Request, res: Response) => {
  send(res, await service.examPolicy.setThreshold(Number(req.body.value), actor(req)), 'Threshold updated');
};
export const broadcast = async (req: Request, res: Response) => {
  const { title, message, link } = req.body as Record<string, string>;
  send(res, await service.notifyStudents(title, message, link ?? '/exams', actor(req)), 'Notification sent');
};
