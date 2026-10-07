import { Request, Response } from 'express';
import { reports } from '../services/report.service';
import { ok } from '../utils/api';

export const catalog = async (_req: Request, res: Response) => { res.json(ok(await reports.catalog())); };
export const kpis = async (_req: Request, res: Response) => { res.json(ok(await reports.kpis())); };

export const run = async (req: Request, res: Response) => {
  res.json(ok(await reports.run(req.params.key, req.query as Record<string, any>)));
};

export const csv = async (req: Request, res: Response) => {
  const { filename, csv } = await reports.csv(req.params.key, req.query as Record<string, any>);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(csv);
};
