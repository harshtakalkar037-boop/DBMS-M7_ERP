import { Router } from 'express';
import { health } from '../controllers/health.controller';
import * as dashboardC from '../controllers/dashboard.controller';
import * as searchC from '../controllers/search.controller';
import * as settingsC from '../controllers/settings.controller';
import * as auditC from '../controllers/audit.controller';
import { wrapAll } from '../utils/wrap';

const dashboard = wrapAll(dashboardC).dashboard;
const globalSearchHandler = wrapAll(searchC).globalSearchHandler;
const settings = wrapAll(settingsC);
const audit = wrapAll(auditC);
import { authenticate, requireRole } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { z } from 'zod';

const router = Router();

router.get('/health', health);
router.get('/dashboard', authenticate, dashboard);
router.get('/search', authenticate, globalSearchHandler);

router.get('/settings', authenticate, requireRole('ADMIN'), settings.list);
router.put('/settings', authenticate, requireRole('ADMIN'), validate(z.object({
  key: z.string().min(1),
  value: z.string(),
})), settings.update);

router.get('/audit', authenticate, requireRole('ADMIN', 'HR', 'ACCOUNTANT'), audit.list);
router.get('/audit/stats', authenticate, requireRole('ADMIN', 'HR', 'ACCOUNTANT'), audit.stats);
router.get('/audit/actions', authenticate, requireRole('ADMIN', 'HR', 'ACCOUNTANT'), audit.actions);
router.get('/audit/entities', authenticate, requireRole('ADMIN', 'HR', 'ACCOUNTANT'), audit.entities);

export default router;
