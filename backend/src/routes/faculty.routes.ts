import { Router } from 'express';
import * as raw from '../controllers/faculty.controller';
import { wrapAll } from '../utils/wrap';

const c = wrapAll(raw);
import { authenticate, requireRole } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { z } from 'zod';

const router = Router();
const HR = ['ADMIN', 'HR'] as const;

router.get('/', authenticate, requireRole(...HR, 'FACULTY'), c.list);
router.get('/stats', authenticate, requireRole(...HR), c.stats);
router.get('/me', authenticate, requireRole('FACULTY'), c.me);
router.get('/workload', authenticate, requireRole(...HR), c.workload);
router.get('/me/subjects', authenticate, requireRole('FACULTY'), c.teachingLoad);
router.get('/me/leave-balances', authenticate, requireRole('FACULTY'), c.balances);

/* ------------------------------------------------------------------- leaves */
router.get('/leaves', authenticate, requireRole(...HR, 'FACULTY'), c.leaves);
router.get('/leaves/types', authenticate, requireRole(...HR, 'FACULTY'), c.leaveTypes);
router.get('/leaves/:id', authenticate, requireRole(...HR, 'FACULTY'), c.leave);

/* ------------------------------------------------------------------ payroll */
router.get('/payroll', authenticate, requireRole(...HR, 'FACULTY'), c.payrolls);
router.get('/payroll/summary', authenticate, requireRole(...HR), c.payrollSummary);
router.get('/payroll/months', authenticate, requireRole(...HR), c.payrollMonths);
router.post('/leaves', authenticate, requireRole('FACULTY', 'ADMIN'), validate(z.object({
  facultyId: z.number().int().positive().optional(),
  leaveType: z.enum(['CASUAL', 'SICK', 'EARNED', 'MATERNITY', 'PATERNITY', 'UNPAID', 'ON_DUTY']),
  startDate: z.string().min(8),
  endDate: z.string().min(8),
  days: z.number().int().positive(),
  reason: z.string().min(5),
})), c.applyLeave);
router.post('/leaves/:id/review', authenticate, requireRole(...HR), validate(z.object({
  approve: z.boolean(),
  remarks: z.string().optional(),
})), c.reviewLeave);

router.get('/payroll/:id', authenticate, requireRole(...HR, 'FACULTY'), c.payslip);
router.post('/payroll/generate', authenticate, requireRole(...HR), validate(z.object({
  month: z.number().int().min(1).max(12),
  year: z.number().int().min(2000).max(2100),
})), c.generatePayroll);
router.patch('/payroll/:id/status', authenticate, requireRole(...HR), validate(z.object({
  status: z.enum(['DRAFT', 'GENERATED', 'APPROVED', 'PAID']),
})), c.setPayrollStatus);

export default router;

/* ------------------------------------------ single faculty (keep these last) */
router.get('/:id', authenticate, requireRole(...HR), c.detail);
router.get('/:id/subjects', authenticate, requireRole(...HR, 'FACULTY'), c.teachingLoad);
router.get('/:id/leave-balances', authenticate, requireRole(...HR), c.balances);
router.put('/:id', authenticate, requireRole(...HR), c.update);
