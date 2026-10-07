import { Router } from 'express';
import * as raw from '../controllers/exam.controller';
import { wrapAll } from '../utils/wrap';

const c = wrapAll(raw);
import { authenticate, requireRole, requireSelfOrRole } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { z } from 'zod';

const router = Router();
const EXAM = ['ADMIN', 'EXAM_CELL'] as const;
const READ = ['ADMIN', 'EXAM_CELL', 'FACULTY'] as const;

/* ------------------------------------------------------------------- exams */
router.get('/', authenticate, requireRole(...READ, 'STUDENT'), c.exams);
router.post('/', authenticate, requireRole(...EXAM), c.createExam);

/* --------------------------------------------------------------- schedules */
router.get('/schedules', authenticate, requireRole(...READ, 'STUDENT'), c.schedules);
router.post('/schedules', authenticate, requireRole(...EXAM), c.createSchedule);
router.delete('/schedules/:id', authenticate, requireRole(...EXAM), c.deleteSchedule);

/* ----------------------------------------------------------- registrations */
router.get('/registrations', authenticate, requireRole(...READ), c.registrations);
router.get('/registrations/stats', authenticate, requireRole(...READ), c.registrationStats);
router.get('/registrations/eligibility', authenticate, requireRole(...READ), c.eligibility);
router.post('/registrations', authenticate, validate(z.object({
  examId: z.number().int().positive(),
  studentId: z.number().int().positive().optional(),
  offeringId: z.number().int().positive(),
})), c.register);
router.post('/registrations/:id/exempt', authenticate, requireRole(...EXAM), validate(z.object({
  reason: z.string().min(5, 'Record why this exemption was granted'),
})), c.exempt);

router.get('/grades', authenticate, c.grades);
router.get('/:id', authenticate, requireRole(...READ, 'STUDENT'), c.exam);
router.put('/:id', authenticate, requireRole(...EXAM), c.updateExam);

/* ------------------------------------------------------------------- marks */
router.get('/marks/sheet/:id', authenticate, requireRole(...READ), c.marksSheet);
router.post('/marks', authenticate, requireRole(...EXAM, 'FACULTY'), validate(z.object({
  registrationId: z.number().int().positive(),
  marksObtained: z.number().min(0).nullable().optional(),
  isAbsent: z.boolean().optional(),
})), c.enterMarks);

/* ----------------------------------------------------------------- results */
router.get('/results/me', authenticate, requireRole('STUDENT'), c.myResults);
router.get('/results/department', authenticate, requireRole(...READ), c.departmentAnalysis);
router.get('/results/subjects', authenticate, requireRole(...READ), c.subjectAnalysis);
router.get('/results/rankings', authenticate, requireRole(...READ), c.rankings);
router.post('/results/process', authenticate, requireRole(...EXAM), c.processResults);
router.post('/results/publish/:id', authenticate, requireRole(...EXAM), c.publish);
router.get('/results/student/:id', authenticate, requireSelfOrRole('ADMIN', (r) => Number(r.params.id)), c.myResults);
router.get('/results/marksheet/:id', authenticate, requireSelfOrRole('ADMIN', (r) => Number(r.params.id)), c.markSheet);
router.get('/results/summary/:id', authenticate, requireSelfOrRole('ADMIN', (r) => Number(r.params.id)), c.resultSummary);

/* ------------------------------------------------------------ hall tickets */
router.get('/hall-ticket/me', authenticate, requireRole('STUDENT'), c.hallTicket);
router.get('/hall-ticket/:id', authenticate, requireRole(...READ), c.hallTicket);

/* ------------------------------------------------------------------ extras */
router.get('/policy/threshold', authenticate, c.threshold);
router.put('/policy/threshold', authenticate, requireRole(...EXAM), validate(z.object({
  value: z.number().min(0).max(100),
})), c.setThreshold);
router.post('/notify', authenticate, requireRole(...EXAM), validate(z.object({
  title: z.string().min(3), message: z.string().min(3), link: z.string().optional(),
})), c.broadcast);

export default router;
