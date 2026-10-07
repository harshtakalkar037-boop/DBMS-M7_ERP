import { Request, Response } from 'express';
import * as service from '../services/finance.service';
import { ok } from '../utils/api';
import { AuthUser } from '../middleware/auth';
import { rowsToCsv } from '../utils/api';

const actor = (req: Request): AuthUser => req.user!;
const id = (req: Request): number => Number(req.params.id);
const send = (res: Response, d: unknown, m?: string, status = 200) => res.status(status).json(ok(d, m));

/** Students always see only their own bills. */
const studentOf = (req: Request): number | undefined =>
  actor(req).role === 'STUDENT' ? Number(actor(req).studentId) : undefined;

/* ------------------------------------------------------------ fee structures */

export const feeStructures = async (req: Request, res: Response) => {
  const r = await service.feeStructures.list(req.query as Record<string, any>);
  send(res, r.rows);
};
export const feeStructure = async (req: Request, res: Response) => { send(res, await service.feeStructures.byId(id(req))); };
export const createFeeStructure = async (req: Request, res: Response) => {
  send(res, await service.feeStructures.create(req.body, actor(req)), 'Fee structure created', 201);
};
export const updateFeeStructure = async (req: Request, res: Response) => {
  send(res, await service.feeStructures.update(id(req), req.body, actor(req)), 'Fee structure updated');
};

/* ---------------------------------------------------------------- student fees */

export const bills = async (req: Request, res: Response) => {
  const scoped = { ...(req.query as Record<string, any>) };
  const own = studentOf(req);
  if (own) scoped.studentId = own;
  const r = await service.studentFees.list(scoped);
  send(res, r.rows, undefined, 200);
};
export const bill = async (req: Request, res: Response) => { send(res, await service.studentFees.byId(id(req))); };
export const myBills = async (req: Request, res: Response) => {
  const studentId = studentOf(req) ?? id(req);
  send(res, await service.studentFees.forStudent(studentId));
};
export const myFeeSummary = async (req: Request, res: Response) => {
  send(res, await service.studentFees.summary(studentOf(req) ?? id(req)));
};
export const ledger = async (req: Request, res: Response) => { send(res, await service.studentFees.ledger(id(req))); };
export const feeStats = async (_req: Request, res: Response) => { send(res, await service.studentFees.stats()); };
export const defaulters = async (req: Request, res: Response) => {
  send(res, await service.studentFees.defaulters(Number(req.query.limit ?? 100)));
};
export const generateFees = async (req: Request, res: Response) => {
  send(res, await service.studentFees.generate(
    Number(req.body.programId), Number(req.body.semesterId), Number(req.body.semesterNo),
    Number(req.body.academicYearId), String(req.body.dueDate), actor(req)), 'Fees generated');
};
export const applyLateFees = async (req: Request, res: Response) => {
  send(res, await service.studentFees.applyLateFees(actor(req)), 'Late fees applied');
};
export const lateFeePreview = async (req: Request, res: Response) => {
  send(res, await service.studentFees.lateFeePreview(id(req)));
};

/* -------------------------------------------------------------------- payments */

export const payments = async (req: Request, res: Response) => {
  const scoped = { ...(req.query as Record<string, any>) };
  const own = studentOf(req);
  if (own) scoped.studentId = own;
  const r = await service.payments.list(scoped);
  send(res, r.rows);
};
export const pay = async (req: Request, res: Response) => {
  const { studentFeeId, amount, paymentMode, referenceNo } = req.body as {
    studentFeeId: number; amount: number; paymentMode: string; referenceNo?: string;
  };
  send(res, await service.payments.pay(Number(studentFeeId), Number(amount), paymentMode, referenceNo, actor(req)), 'Payment recorded', 201);
};
export const receipt = async (req: Request, res: Response) => { send(res, await service.payments.receipt(String(req.params.receiptNo))); };
export const dailyCollection = async (req: Request, res: Response) => {
  send(res, await service.payments.daily(Number(req.query.days ?? 30)));
};
export const monthlyCollection = async (_req: Request, res: Response) => { send(res, await service.payments.monthly()); };
export const refund = async (req: Request, res: Response) => {
  send(res, await service.payments.refund(Number(req.body.paymentId), Number(req.body.amount), String(req.body.reason), actor(req)), 'Refund recorded');
};

/* ----------------------------------------------------------------------- fines */

export const fines = async (req: Request, res: Response) => {
  const scoped: Record<string, any> = {};
  const own = studentOf(req);
  if (own) scoped.studentId = own;
  else if (req.query.studentId) scoped.studentId = req.query.studentId;
  send(res, await service.fines.list(scoped));
};
export const createFine = async (req: Request, res: Response) => {
  send(res, await service.fines.create(req.body, actor(req)), 'Fine imposed', 201);
};
export const updateFine = async (req: Request, res: Response) => {
  send(res, await service.fines.status(id(req), String(req.body.status), actor(req)), 'Fine updated');
};

/* --------------------------------------------------------------- scholarships */

export const scholarships = async (_req: Request, res: Response) => { send(res, await service.scholarships.list()); };
export const myScholarships = async (req: Request, res: Response) => {
  send(res, await service.scholarships.forStudent(studentOf(req) ?? id(req)));
};
export const awardScholarship = async (req: Request, res: Response) => {
  send(res, await service.scholarships.award(
    Number(req.body.studentId), Number(req.body.scholarshipId),
    Number(req.body.academicYearId), Number(req.body.amount), actor(req)), 'Scholarship awarded', 201);
};

export const refunds = async (_req: Request, res: Response) => { send(res, await service.refunds.list()); };

/* ------------------------------------------------------------------- exports */

export const exportCsvEndpoint = async (req: Request, res: Response) => {
  const kind = String(req.params.kind);
  const csv = await service.exportCsv(kind, req.query as Record<string, any>);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="fees-${kind}-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send(csv);
};
