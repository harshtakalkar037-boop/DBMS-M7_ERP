import { Router } from 'express';
import * as raw from '../controllers/notification.controller';
import { wrapAll } from '../utils/wrap';

const c = wrapAll(raw);
import { authenticate, requireRole } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { z } from 'zod';

const router = Router();

router.get('/', authenticate, c.mine);
router.get('/unread', authenticate, c.unread);
router.patch('/:id/read', authenticate, c.markRead);
router.post('/read-all', authenticate, c.markAllRead);

router.post('/announce', authenticate, requireRole('ADMIN', 'FACULTY', 'EXAM_CELL', 'HOSTEL_ADMIN'), validate(z.object({
  title: z.string().min(3),
  message: z.string().min(3),
  severity: z.enum(['INFO', 'SUCCESS', 'WARNING', 'ERROR']).optional(),
  link: z.string().optional(),
  target: z.string().default('ALL'),
})), c.announce);

router.post('/push', authenticate, requireRole('ADMIN'), validate(z.object({
  userId: z.number().int().positive(),
  title: z.string().min(3),
  message: z.string().min(3),
  type: z.string().optional(),
  severity: z.enum(['INFO', 'SUCCESS', 'WARNING', 'ERROR']).optional(),
  link: z.string().optional(),
})), c.push);

export default router;
