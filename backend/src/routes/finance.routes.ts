import { Router } from 'express';
import * as raw from '../controllers/finance.controller';
import { wrapAll } from '../utils/wrap';

const c = wrapAll(raw);
import { authenticate, requireRole, requireSelfOrRole } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { z } from 'zod';

const router = Router();
const FIN = ['ADMIN', 'ACCOUNTANT'] as const;

router.get('/structures', authenticate, requireRole(...FIN), c.feeStructures);
router.get('/structures/:id', authenticate, requireRole(...FIN), c.feeStructure);
router.post('/structures', authenticate, requireRole(...FIN), c.createFeeStructure);
router.put('/structures/:id', authenticate, requireRole(...FIN), c.updateFeeStructure);

router.get('/bills', authenticate, requireRole(...FIN, 'STUDENT'), c.bills);
router.get('/bills/me', authenticate, requireRole('STUDENT'), c.myBills);
router.get('/bills/summary/me', authenticate, requireRole('STUDENT'), c.myFeeSummary);
router.get('/bills/stats', authenticate, requireRole(...FIN), c.feeStats);
router.get('/bills/defaulters', authenticate, requireRole(...FIN), c.defaulters);
router.get('/bills/:id', authenticate, requireRole(...FIN), c.bill);
router.get('/bills/:id/ledger', authenticate, requireRole(...FIN), c.ledger);
router.get('/bills/:id/late-fee', authenticate, requireRole(...FIN), c.lateFeePreview);

router.get('/student/:id/bills', authenticate, requireSelfOrRole('ADMIN', (r) => Number(r.params.id)), c.myBills);
router.get('/student/:id/summary', authenticate, requireSelfOrRole('ADMIN', (r) => Number(r.params.id)), c.myFeeSummary);

router.post('/generate', authenticate, requireRole(...FIN), validate(z.object({
  programId: z.number().int().positive(),
  semesterId: z.number().int().positive(),
  semesterNo: z.number().int().positive(),
  academicYearId: z.number().int().positive(),
  dueDate: z.string().min(8),
})), c.generateFees);
router.post('/apply-late-fees', authenticate, requireRole(...FIN), c.applyLateFees);

router.get('/payments', authenticate, requireRole(...FIN, 'STUDENT'), c.payments);
router.post('/payments', authenticate, requireRole(...FIN), validate(z.object({
  studentFeeId: z.number().int().positive(),
  amount: z.number().positive('Amount must be greater than zero'),
  paymentMode: z.enum(['CASH', 'CARD', 'UPI', 'NETBANKING', 'CHEQUE', 'DD', 'ONLINE', 'SCHOLARSHIP']),
  referenceNo: z.string().optional(),
})), c.pay);
router.get('/payments/daily', authenticate, requireRole(...FIN), c.dailyCollection);
router.get('/payments/monthly', authenticate, requireRole(...FIN), c.monthlyCollection);
router.get('/payments/receipt/:receiptNo', authenticate, requireRole(...FIN, 'STUDENT'), c.receipt);
router.post('/payments/refund', authenticate, requireRole(...FIN), validate(z.object({
  paymentId: z.number().int().positive(),
  amount: z.number().positive(),
  reason: z.string().min(3),
})), c.refund);

router.get('/fines', authenticate, requireRole(...FIN, 'STUDENT'), c.fines);
router.post('/fines', authenticate, requireRole(...FIN), c.createFine);
router.patch('/fines/:id', authenticate, requireRole(...FIN), c.updateFine);

router.get('/scholarships', authenticate, requireRole(...FIN), c.scholarships);
router.get('/scholarships/me', authenticate, requireRole('STUDENT'), c.myScholarships);
router.get('/scholarships/student/:id', authenticate, requireRole(...FIN), c.myScholarships);
router.post('/scholarships/award', authenticate, requireRole(...FIN), validate(z.object({
  studentId: z.number().int().positive(),
  scholarshipId: z.number().int().positive(),
  academicYearId: z.number().int().positive(),
  amount: z.number().nonnegative(),
})), c.awardScholarship);

router.get('/refunds', authenticate, requireRole(...FIN), c.refunds);
router.get('/export/:kind', authenticate, requireRole(...FIN), c.exportCsvEndpoint);

export default router;
