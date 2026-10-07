import { Request, Response } from 'express';
import { search } from '../services/search.service';
import { ok } from '../utils/api';
import { AppError } from '../utils/api';

export const globalSearchHandler = async (req: Request, res: Response) => {
  if (!req.user) throw AppError.unauthorized();
  const q = String(req.query.q ?? '');
  res.json(ok(await search(q, req.user, Number(req.query.limit ?? 30))));
};
