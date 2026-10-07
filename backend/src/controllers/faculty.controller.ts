import { Request, Response } from 'express';
import * as service from '../services/faculty.service';
import { ok } from '../utils/api';
import { AuthUser } from '../middleware/auth';

const actor = (req: Request): AuthUser => req.user!;
const id = (req: Request): number => Number(req.params.id);
const send = (res: Response, d: unknown, m?: string, status = 200) => res.status(status).json(ok(d, m));

/* -------------------------------------------------------------------- faculty */

export const list = async (req: Request, res: Response) => {
  const r = await service.faculty.list(req.query as Record<string, any>);
  send(res, r.rows);
};
export const detail = async (req: Request, res: Response) => { send(res, await service.faculty.byId(id(req))); };
export const me = async (req: Request, res: Response) => {
  const facultyId = actor(req).facultyId;
  if (!facultyId) { res.json(ok(null)); return; }
  send(res, await service.faculty.byId(facultyId));
};
export const stats = async (_req: Request, res: Response) => { send(res, await service.faculty.stats()); };
export const workload = async (req: Request, res: Response) => {
  send(res, await service.faculty.workload(req.query.facultyId ? Number(req.query.facultyId) : null));
};
export const teachingLoad = async (req: Request, res: Response) => {
  const facultyId = actor(req).role === 'FACULTY' ? Number(actor(req).facultyId) : id(req);
  send(res, await service.faculty.teachingLoad(facultyId));
};
export const create = async (req: Request, res: Response) => {
  send(res, await service.faculty.create(req.body, actor(req)), 'Faculty member created', 201);
};
export const update = async (req: Request, res: Response) => {
  send(res, await service.faculty.update(id(req), req.body, actor(req)), 'Faculty member updated');
};

/* --------------------------------------------------------------------- leaves */

export const leaves = async (req: Request, res: Response) => {
  const scoped = { ...(req.query as Record<string, any>) };
  if (actor(req).role === 'FACULTY') scoped.facultyId = actor(req).facultyId;
  const r = await service.leaves.list(scoped);
  send(res, r.rows);
};
export const leave = async (req: Request, res: Response) => { send(res, await service.leaves.byId(id(req))); };
export const balances = async (req: Request, res: Response) => {
  const facultyId = actor(req).role === 'FACULTY' ? Number(actor(req).facultyId) : id(req);
  send(res, await service.leaves.balances(facultyId));
};
export const leaveTypes = async (_req: Request, res: Response) => { send(res, await service.leaves.types()); };
export const applyLeave = async (req: Request, res: Response) => {
  const facultyId = actor(req).role === 'FACULTY' ? Number(actor(req).facultyId) : Number(req.body.facultyId);
  send(res, await service.leaves.apply(facultyId, req.body, actor(req)), 'Leave applied', 201);
};
export const reviewLeave = async (req: Request, res: Response) => {
  const { approve, remarks } = req.body as { approve: boolean; remarks?: string };
  send(res, await service.leaves.review(id(req), !!approve, remarks ?? '', actor(req)),
    approve ? 'Leave approved' : 'Leave rejected');
};

/* -------------------------------------------------------------------- payroll */

export const payrolls = async (req: Request, res: Response) => {
  const scoped = { ...(req.query as Record<string, any>) };
  if (actor(req).role === 'FACULTY') scoped.facultyId = actor(req).facultyId;
  const r = await service.payroll.list(scoped);
  send(res, r.rows);
};
export const payslip = async (req: Request, res: Response) => { send(res, await service.payroll.slip(id(req))); };
export const payrollSummary = async (_req: Request, res: Response) => { send(res, await service.payroll.summary()); };
export const payrollMonths = async (_req: Request, res: Response) => { send(res, await service.payroll.months()); };
export const generatePayroll = async (req: Request, res: Response) => {
  send(res, await service.payroll.generate(Number(req.body.month), Number(req.body.year), actor(req)), 'Payroll generated');
};
export const setPayrollStatus = async (req: Request, res: Response) => {
  send(res, await service.payroll.setStatus(id(req), req.body.status, actor(req)), 'Payslip updated');
};
