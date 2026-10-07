import { Request, Response } from 'express';
import { settings } from '../services/settings.service';
import { ok } from '../utils/api';
import { AppError } from '../utils/api';

const actor = (req: Request) => { if (!req.user) throw AppError.unauthorized(); return req.user; };

export const list = async (_req: Request, res: Response) => { res.json(ok(await settings.list())); };
export const update = async (req: Request, res: Response) => {
  const { key, value } = req.body as { key: string; value: string };
  res.json(ok(await settings.update(key, value, actor(req)), 'Setting updated'));
};
