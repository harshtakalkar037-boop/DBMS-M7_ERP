import { Request, Response } from 'express';
import { notifications, announcements } from '../services/notification.service';
import { ok } from '../utils/api';
import { AuthUser } from '../middleware/auth';

const actor = (req: Request): AuthUser => req.user!;

export const mine = async (req: Request, res: Response) => {
  res.json(ok(await notifications.mine(actor(req).userId, Number(req.query.limit ?? 30))));
};
export const unread = async (req: Request, res: Response) => {
  res.json(ok(await notifications.unread(actor(req).userId)));
};
export const markRead = async (req: Request, res: Response) => {
  res.json(ok(await notifications.markRead(Number(req.params.id), actor(req).userId)));
};
export const markAllRead = async (req: Request, res: Response) => {
  res.json(ok(await notifications.markAllRead(actor(req).userId)));
};
export const announce = async (req: Request, res: Response) => {
  const b = req.body as { title: string; message: string; severity?: string; link?: string; target: string };
  res.status(201).json(ok(await announcements.send(b, actor(req)), 'Announcement sent'));
};
export const push = async (req: Request, res: Response) => {
  const b = req.body as { userId: number; title: string; message: string; type?: string; severity?: string; link?: string };
  res.status(201).json(ok(await announcements.push(Number(b.userId), b), 'Notification pushed'));
};
