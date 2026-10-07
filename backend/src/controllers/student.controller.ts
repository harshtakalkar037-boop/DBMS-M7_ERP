import { Request, Response } from 'express';
import * as service from '../services/student.service';
import { ok } from '../utils/api';
import { AuthUser } from '../middleware/auth';
import { AppError } from '../utils/api';

const actor = (req: Request): AuthUser => { if (!req.user) throw AppError.unauthorized(); return req.user; };
const id = (req: Request, key = 'id'): number => Number(req.params[key]);

/* ----------------------------------------------------------------- students */

export const list = async (req: Request, res: Response) => {
  const result = await service.list(req.query as Record<string, any>, actor(req));
  res.json(ok(result.rows, undefined, result.meta));
};

export const detail = async (req: Request, res: Response) => {
  const studentId = actor(req).role === 'STUDENT' ? Number(actor(req).studentId) : id(req);
  res.json(ok(await service.detail(studentId)));
};

export const stats = async (_req: Request, res: Response) => { res.json(ok(await service.stats())); };

export const create = async (req: Request, res: Response) => {
  res.status(201).json(ok(await service.create(req.body, actor(req)), 'Student created'));
};

export const update = async (req: Request, res: Response) => {
  res.json(ok(await service.update(id(req), req.body, actor(req)), 'Student updated'));
};

export const remove = async (req: Request, res: Response) => {
  res.json(ok(await service.remove(id(req), actor(req)), 'Student removed'));
};

export const changeStatus = async (req: Request, res: Response) => {
  const { status, reason } = req.body as { status: string; reason: string };
  res.json(ok(await service.changeStatus(id(req), status, reason, actor(req)), 'Status updated'));
};

/* --------------------------------------------------- nested student records */

export const addresses = async (req: Request, res: Response) => { res.json(ok(await service.addresses(id(req)))); };
export const saveAddress = async (req: Request, res: Response) => {
  res.json(ok(await service.saveAddress(id(req), req.body), 'Address saved'));
};
export const guardians = async (req: Request, res: Response) => { res.json(ok(await service.guardians(id(req)))); };
export const saveGuardian = async (req: Request, res: Response) => {
  res.json(ok(await service.saveGuardian(id(req), req.body), 'Guardian saved'));
};
export const documents = async (req: Request, res: Response) => { res.json(ok(await service.documents(id(req)))); };
export const addDocument = async (req: Request, res: Response) => {
  res.status(201).json(ok(await service.addDocument(id(req), req.body, actor(req)), 'Document added'));
};

/* -------------------------------------------------------------- admissions */

export const admissions = async (req: Request, res: Response) => {
  const result = await service.listAdmissions(req.query as Record<string, any>);
  res.json(ok(result.rows, undefined, result.meta));
};
export const admissionStats = async (_req: Request, res: Response) => { res.json(ok(await service.admissionStats())); };
export const admission = async (req: Request, res: Response) => { res.json(ok(await service.findAdmission(id(req)))); };

/** Public: submit an application (no auth). */
export const apply = async (req: Request, res: Response) => {
  res.status(201).json(ok(await service.apply(req.body), 'Application submitted'));
};

export const reviewAdmission = async (req: Request, res: Response) => {
  const { approve, remarks } = req.body as { approve: boolean; remarks?: string };
  res.json(ok(await service.reviewAdmission(id(req), !!approve, remarks ?? '', actor(req)),
    approve ? 'Application approved' : 'Application rejected'));
};
