import { Request, Response } from 'express';
import * as service from '../services/hostel.service';
import { ok } from '../utils/api';
import { AuthUser } from '../middleware/auth';

const actor = (req: Request): AuthUser => req.user!;
const id = (req: Request): number => Number(req.params.id);
const send = (res: Response, d: unknown, m?: string, status = 200) => res.status(status).json(ok(d, m));

export const hostels = async (_req: Request, res: Response) => { send(res, await service.hostels.list()); };
export const hostel = async (req: Request, res: Response) => { send(res, await service.hostels.byId(id(req))); };
export const occupancy = async (_req: Request, res: Response) => { send(res, await service.hostels.occupancy()); };
export const stats = async (_req: Request, res: Response) => { send(res, await service.hostels.stats()); };

export const rooms = async (req: Request, res: Response) => {
  send(res, await service.rooms.list(
    req.query.hostelId ? Number(req.query.hostelId) : undefined,
    req.query.blockId ? Number(req.query.blockId) : undefined));
};
export const vacancy = async (_req: Request, res: Response) => { send(res, await service.rooms.vacancy()); };
export const blocks = async (req: Request, res: Response) => {
  send(res, await service.rooms.blocks(req.query.hostelId ? Number(req.query.hostelId) : undefined));
};
export const beds = async (req: Request, res: Response) => {
  send(res, await service.rooms.beds(
    req.query.roomId ? Number(req.query.roomId) : undefined,
    req.query.hostelId ? Number(req.query.hostelId) : undefined));
};
export const createRoom = async (req: Request, res: Response) => {
  send(res, await service.rooms.create(req.body, actor(req)), 'Room created', 201);
};

export const applications = async (req: Request, res: Response) => {
  const scoped = { ...(req.query as Record<string, any>) };
  if (actor(req).role === 'STUDENT') scoped.studentId = actor(req).studentId;
  const r = await service.applications.list(scoped);
  send(res, r.rows);
};
export const apply = async (req: Request, res: Response) => {
  send(res, await service.applications.create(req.body, actor(req)), 'Hostel application submitted', 201);
};
export const reviewApplication = async (req: Request, res: Response) => {
  const { status, remarks } = req.body as { status: 'APPROVED' | 'REJECTED' | 'WAITLISTED'; remarks?: string };
  send(res, await service.applications.review(id(req), status, remarks ?? '', actor(req)), 'Application updated');
};
export const suggestedBeds = async (req: Request, res: Response) => {
  send(res, await service.applications.suggestedBeds(id(req)));
};

export const allocations = async (req: Request, res: Response) => {
  const r = await service.allocations.list(req.query as Record<string, any>);
  send(res, r.rows);
};
export const allocation = async (req: Request, res: Response) => { send(res, await service.allocations.byId(id(req))); };
export const myAllocation = async (req: Request, res: Response) => {
  const studentId = actor(req).role === 'STUDENT' ? Number(actor(req).studentId) : id(req);
  send(res, await service.allocations.activeForStudent(studentId));
};
export const allocationHistory = async (req: Request, res: Response) => {
  const studentId = actor(req).role === 'STUDENT' ? Number(actor(req).studentId) : id(req);
  send(res, await service.allocations.historyForStudent(studentId));
};
export const allocate = async (req: Request, res: Response) => {
  send(res, await service.allocations.allocate(Number(req.body.applicationId), Number(req.body.bedId), actor(req)), 'Bed allocated', 201);
};
export const transfer = async (req: Request, res: Response) => {
  send(res, await service.allocations.transfer(id(req), Number(req.body.toBedId), String(req.body.reason ?? ''), actor(req)), 'Resident transferred');
};
export const vacate = async (req: Request, res: Response) => {
  send(res, await service.allocations.vacate(id(req), String(req.body.reason ?? ''), actor(req)), 'Bed vacated');
};
export const transfers = async (req: Request, res: Response) => {
  send(res, await service.allocations.transfers(req.query.studentId ? Number(req.query.studentId) : undefined));
};

export const hostelFees = async (req: Request, res: Response) => {
  const scoped: Record<string, any> = {};
  if (actor(req).role === 'STUDENT') scoped.studentId = actor(req).studentId;
  else if (req.query.studentId) scoped.studentId = req.query.studentId;
  else if (req.query.status) scoped.status = String(req.query.status);
  send(res, await service.hostelFees.list(scoped));
};
