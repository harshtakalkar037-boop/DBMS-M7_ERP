import { Router } from 'express';
import * as raw from '../controllers/hostel.controller';
import { wrapAll } from '../utils/wrap';

const c = wrapAll(raw);
import { authenticate, requireRole, requireSelfOrRole } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { z } from 'zod';

const router = Router();
const HOSTEL = ['ADMIN', 'HOSTEL_ADMIN'] as const;

router.get('/hostels', authenticate, c.hostels);
router.get('/hostels/:id', authenticate, c.hostel);
router.get('/occupancy', authenticate, requireRole(...HOSTEL, 'STUDENT'), c.occupancy);
router.get('/stats', authenticate, requireRole(...HOSTEL), c.stats);

router.get('/rooms', authenticate, requireRole(...HOSTEL, 'STUDENT'), c.rooms);
router.get('/rooms/vacancy', authenticate, requireRole(...HOSTEL), c.vacancy);
router.get('/blocks', authenticate, requireRole(...HOSTEL), c.blocks);
router.get('/beds', authenticate, requireRole(...HOSTEL), c.beds);
router.post('/rooms', authenticate, requireRole(...HOSTEL), c.createRoom);

router.get('/applications', authenticate, requireRole(...HOSTEL, 'STUDENT'), c.applications);
router.post('/applications', authenticate, requireRole('STUDENT', 'ADMIN', 'HOSTEL_ADMIN'), validate(z.object({
  hostelId: z.number().int().positive(),
  academicYearId: z.number().int().positive(),
  roomTypePref: z.enum(['SINGLE', 'DOUBLE', 'TRIPLE', 'SHARED']).optional(),
  studentId: z.number().int().positive().optional(),
})), c.apply);
router.put('/applications/:id/review', authenticate, requireRole(...HOSTEL), validate(z.object({
  status: z.enum(['APPROVED', 'REJECTED', 'WAITLISTED']),
  remarks: z.string().optional(),
})), c.reviewApplication);
router.get('/applications/:id/beds', authenticate, requireRole(...HOSTEL), c.suggestedBeds);

router.get('/allocations', authenticate, requireRole(...HOSTEL), c.allocations);
router.get('/allocations/me', authenticate, requireRole('STUDENT'), c.myAllocation);
router.get('/allocations/history/me', authenticate, requireRole('STUDENT'), c.allocationHistory);
router.get('/allocations/:id', authenticate, requireRole(...HOSTEL), c.allocation);
router.get('/allocations/student/:id', authenticate, requireSelfOrRole('ADMIN', (r) => Number(r.params.id)), c.allocationHistory);
router.post('/allocations', authenticate, requireRole(...HOSTEL), validate(z.object({
  applicationId: z.number().int().positive(),
  bedId: z.number().int().positive(),
})), c.allocate);
router.post('/allocations/:id/transfer', authenticate, requireRole(...HOSTEL), validate(z.object({
  toBedId: z.number().int().positive(),
  reason: z.string().min(3),
})), c.transfer);
router.post('/allocations/:id/vacate', authenticate, requireRole(...HOSTEL), validate(z.object({
  reason: z.string().min(3),
})), c.vacate);
router.get('/transfers', authenticate, requireRole(...HOSTEL, 'STUDENT'), c.transfers);

router.get('/fees', authenticate, requireRole(...HOSTEL, 'STUDENT', 'ACCOUNTANT'), c.hostelFees);

export default router;
