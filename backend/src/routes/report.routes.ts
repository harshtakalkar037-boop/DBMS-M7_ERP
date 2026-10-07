import { Router } from 'express';
import * as raw from '../controllers/report.controller';
import { wrapAll } from '../utils/wrap';

const c = wrapAll(raw);
import { authenticate, requireRole } from '../middleware/auth';

const router = Router();
const VIEW = ['ADMIN', 'FACULTY', 'ACCOUNTANT', 'HOSTEL_ADMIN', 'EXAM_CELL', 'HR'] as const;

router.get('/', authenticate, requireRole(...VIEW), c.catalog);
router.get('/kpis', authenticate, requireRole(...VIEW), c.kpis);
router.get('/:key', authenticate, requireRole(...VIEW), c.run);
router.get('/:key/csv', authenticate, requireRole(...VIEW), c.csv);

export default router;
