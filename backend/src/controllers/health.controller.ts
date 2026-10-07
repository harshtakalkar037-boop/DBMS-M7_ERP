import { Request, Response } from 'express';
import { ping, queryOne, Row } from '../config/database';
import { mongoStatus } from '../config/mongo';
import { env } from '../config/env';
import { ok } from '../utils/api';

export async function health(_req: Request, res: Response): Promise<void> {
  const dbUp = await ping();
  let dbVersion = 'unknown';
  let counts: Record<string, number> = {};
  if (dbUp) {
    const v = await queryOne<Row>('SELECT VERSION() AS v');
    dbVersion = String(v?.v ?? 'unknown');
    const c = await queryOne<Row>(
      `SELECT (SELECT COUNT(*) FROM students) AS students,
              (SELECT COUNT(*) FROM faculty) AS faculty,
              (SELECT COUNT(*) FROM enrollments) AS enrollments,
              (SELECT COUNT(*) FROM attendance) AS attendance,
              (SELECT COUNT(*) FROM exams) AS exams,
              (SELECT COUNT(*) FROM student_fees) AS fees,
              (SELECT COUNT(*) FROM room_allocations) AS allocations,
              (SELECT COUNT(*) FROM payrolls) AS payrolls`);
    counts = Object.fromEntries(Object.entries(c ?? {}).map(([k, val]) => [k, Number(val ?? 0)]));
  }
  res.status(dbUp ? 200 : 503).json(ok({
    status: dbUp ? 'ok' : 'degraded',
    service: 'university-erp-api',
    version: '1.0.0',
    database: { connected: dbUp, version: dbVersion, database: env.db.database, counts },
    mongo: mongoStatus(),
    ai: { mode: env.ai.mode, llmEnabled: env.ai.llmEnabled },
    uptimeSeconds: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
  }));
}
