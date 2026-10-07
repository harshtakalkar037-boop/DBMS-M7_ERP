import { Router } from 'express';
import * as raw from '../controllers/auth.controller';
import { wrapAll } from '../utils/wrap';

const c = wrapAll(raw);
import { authenticate, requireRole } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { z } from 'zod';

const router = Router();

const loginSchema = z.object({
  email: z.string().email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
});
const passwordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8, 'The new password must be at least 8 characters'),
});

router.post('/login', validate(loginSchema), c.login);
router.post('/refresh', c.refresh);
router.post('/logout', authenticate, c.logout);
router.get('/me', authenticate, c.me);
router.post('/change-password', authenticate, validate(passwordSchema), c.changePassword);
router.get('/roles', authenticate, requireRole('ADMIN', 'HR'), c.roles);

export default router;
