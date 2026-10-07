import { Request, Response } from 'express';
import * as service from '../services/auth.service';
import { ok } from '../utils/api';
import { AppError } from '../utils/api';
import { AuthUser } from '../middleware/auth';

const actorOf = (req: Request): AuthUser => {
  if (!req.user) throw AppError.unauthorized();
  return req.user;
};
const ctxOf = (req: Request) => ({ ip: req.ip, userAgent: req.headers['user-agent'] ?? null });

export const login = async (req: Request, res: Response) => {
  const { email, password } = req.body as { email: string; password: string };
  res.json(ok(await service.login(email, password, ctxOf(req)), 'Signed in'));
};

export const refresh = async (req: Request, res: Response) => {
  const { refreshToken } = req.body as { refreshToken: string };
  res.json(ok(await service.refresh(refreshToken, ctxOf(req))));
};

export const logout = async (req: Request, res: Response) => {
  res.json(ok(await service.logout(actorOf(req).userId, ctxOf(req)), 'Signed out'));
};

export const me = async (req: Request, res: Response) => {
  res.json(ok(await service.me(actorOf(req).userId)));
};

export const changePassword = async (req: Request, res: Response) => {
  const { currentPassword, newPassword } = req.body as { currentPassword: string; newPassword: string };
  res.json(ok(await service.changePassword(actorOf(req).userId, currentPassword, newPassword), 'Password updated'));
};

export const roles = async (_req: Request, res: Response) => {
  res.json(ok(await service.listRoles()));
};
