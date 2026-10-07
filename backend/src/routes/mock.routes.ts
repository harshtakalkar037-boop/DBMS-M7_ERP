import { Router } from 'express';
import * as raw from '../controllers/mockexam.controller';
import { wrapAll } from '../utils/wrap';

const c = wrapAll(raw);
import { authenticate, requireRole } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { z } from 'zod';

const router = Router();
const STAFF = ['ADMIN', 'FACULTY'] as const;

/* Question bank administration */
router.get('/bank/stats', authenticate, c.bankStats);
router.get('/questions', authenticate, c.list);
router.get('/questions/:id', authenticate, c.question);
router.get('/questions/:id/topics', authenticate, c.topics);
router.post('/questions', authenticate, requireRole(...STAFF), c.create);
router.put('/questions/:id', authenticate, requireRole(...STAFF), c.update);
router.delete('/questions/:id', authenticate, requireRole(...STAFF), c.remove);

/* Attempts */
router.post('/attempts', authenticate, requireRole('STUDENT'), validate(z.object({
  subjectId: z.number().int().positive(),
  difficulty: z.enum(['EASY', 'MEDIUM', 'HARD', 'MIXED']).default('MIXED'),
  count: z.number().int().min(1).max(50).default(10),
  duration: z.number().int().min(1).max(180).default(15),
})), c.start);
router.get('/attempts/me', authenticate, requireRole('STUDENT'), c.mine);
router.get('/attempts/stats/me', authenticate, requireRole('STUDENT'), c.stats);
router.get('/attempts/leaderboard', authenticate, c.leaderboard);
router.get('/attempts/:id', authenticate, c.paper);
router.post('/attempts/:id/answer', authenticate, requireRole('STUDENT'), validate(z.object({
  answerId: z.number().int().positive(),
  option: z.enum(['A', 'B', 'C', 'D']).nullable(),
})), c.answer);
router.post('/attempts/:id/submit', authenticate, requireRole('STUDENT'), c.submit);
router.get('/attempts/:id/review', authenticate, requireRole('STUDENT'), c.review);

export default router;
