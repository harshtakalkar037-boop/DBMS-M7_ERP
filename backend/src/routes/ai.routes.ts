import { Router } from 'express';
import * as raw from '../controllers/ai.controller';
import { wrapAll } from '../utils/wrap';

const c = wrapAll(raw);
import { authenticate, requireRole } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { z } from 'zod';

const router = Router();

/** Tells the UI which engine is live, so nothing is mislabelled. */
router.get('/engine', authenticate, c.engine);

router.get('/history', authenticate, c.history);
router.get('/sessions', authenticate, c.sessions);
router.post('/chat', authenticate, validate(z.object({
  message: z.string().min(2, 'Type a question first').max(1000),
  sessionId: z.string().optional(),
  studentId: z.number().int().positive().optional(),
})), c.chat);

router.get('/study-plan', authenticate, c.studyPlan);
router.get('/study-plan/me', authenticate, c.latestPlan);
router.get('/study-plan/student/:studentId', authenticate, requireRole('ADMIN', 'FACULTY'), c.plans);

router.get('/at-risk', authenticate, requireRole('ADMIN', 'FACULTY', 'EXAM_CELL'), c.atRisk);
router.post('/risk/recompute', authenticate, requireRole('ADMIN'), c.recomputeRisk);

export default router;
