import { Request, Response } from 'express';
import { auditService } from '../services/audit.service';
import { ok } from '../utils/api';

export const list = async (req: Request, res: Response) => {
  const result = await auditService.list(req.query as Record<string, any>);
  res.json(ok(result.rows, undefined, result.meta));
};
export const actions = async (_req: Request, res: Response) => { res.json(ok(await auditService.actionsSummary())); };
export const entities = async (_req: Request, res: Response) => { res.json(ok(await auditService.entitySummary())); };
export const stats = async (_req: Request, res: Response) => { res.json(ok(await auditService.stats())); };
