import { Router } from 'express';
import * as raw from '../controllers/attendance.controller';
import { wrapAll } from '../utils/wrap';

const c = wrapAll(raw);
import { authenticate, requireRole, requireSelfOrRole } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { z } from 'zod';

const router = Router();
const STAFF = ['ADMIN', 'FACULTY'] as const;

router.get('/sessions', authenticate, requireRole(...STAFF, 'STUDENT'), c.sessions);
router.post('/sessions', authenticate, requireRole(...STAFF), c.createSession);
router.get('/sessions/:id', authenticate, requireRole(...STAFF), c.session);

/** Attendance can only be marked by the faculty taking the class or an admin. */
router.get('/sessions/:id/roster', authenticate, requireRole(...STAFF), c.roster);
router.post('/sessions/:id/mark', authenticate, requireRole(...STAFF), validate(z.object({
  studentId: z.number().int().positive(),
  status: z.enum(['PRESENT', 'ABSENT', 'LATE', 'EXCUSED']),
  remarks: z.string().optional(),
})), c.mark);
router.post('/sessions/:id/mark-bulk', authenticate, requireRole(...STAFF), validate(z.object({
  studentIds: z.array(z.number().int().positive()).min(1),
  status: z.enum(['PRESENT', 'ABSENT', 'LATE', 'EXCUSED']),
})), c.markBulk);

router.get('/report/offering/:id', authenticate, requireRole(...STAFF, 'EXAM_CELL'), c.offeringReport);
router.get('/report/low', authenticate, requireRole(...STAFF, 'EXAM_CELL'), c.low);
router.get('/report/stats', authenticate, requireRole(...STAFF, 'EXAM_CELL'), c.stats);

/** Self-service student views. */
router.get('/me', authenticate, requireRole('STUDENT'), c.mySummary);
router.get('/me/overall', authenticate, requireRole('STUDENT'), c.overall);
router.get('/me/monthly', authenticate, requireRole('STUDENT'), c.monthly);

router.get('/student/:id', authenticate, requireSelfOrRole('ADMIN', (r) => Number(r.params.id)), c.mySummary);
router.get('/student/:id/overall', authenticate, requireSelfOrRole('ADMIN', (r) => Number(r.params.id)), c.overall);
router.get('/student/:id/monthly', authenticate, requireSelfOrRole('ADMIN', (r) => Number(r.params.id)), c.monthly);
router.get('/student/:id/history', authenticate, requireSelfOrRole('ADMIN', (r) => Number(r.params.id)), c.history);

router.post('/warn-low', authenticate, requireRole('ADMIN', 'FACULTY'), c.warnLow);

export default router;
