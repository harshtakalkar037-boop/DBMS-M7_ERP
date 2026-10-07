import { Request, Response } from 'express';
import { forRole } from '../services/dashboard.service';
import { ok } from '../utils/api';
import { AppError } from '../utils/api';

export const dashboard = async (req: Request, res: Response) => {
  if (!req.user) throw AppError.unauthorized();
  res.json(ok(await forRole(req.user)));
};
