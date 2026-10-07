import { Router } from 'express';
import * as raw from '../controllers/student.controller';
import { wrapAll } from '../utils/wrap';

const c = wrapAll(raw);
import { authenticate, requireRole, requireSelfOrRole } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { z } from 'zod';

const router = Router();

/** Everyone who is signed in may list students; the service scopes the result. */
router.get('/', authenticate, c.list);
router.get('/stats', authenticate, requireRole('ADMIN', 'FACULTY', 'EXAM_CELL'), c.stats);

// Nested resources must be declared before /:id so "stats" etc. are not eaten by it.
router.get('/my/documents', authenticate, c.documents);
router.get('/my/addresses', authenticate, c.addresses);

/* --------------------------------------------------------------- admissions */

router.post('/admissions/apply', validate(z.object({
  programId: z.number().int().positive(),
  categoryId: z.number().int().positive(),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email(),
  phone: z.string().min(6),
  dateOfBirth: z.string().min(6),
  gender: z.enum(['MALE', 'FEMALE', 'OTHER']),
  guardianName: z.string().min(1),
  guardianPhone: z.string().min(6),
  // Optional academic details. marks12 defaults to 60 so the BEFORE INSERT
  // validation trigger (minimum 35%) is satisfied for walk-in applicants.
  previousSchool: z.string().optional(),
  qualification: z.string().optional(),
  marks10: z.number().min(0).max(100).optional(),
  marks12: z.number().min(0).max(100).optional(),
  entranceScore: z.number().min(0).optional(),
  addressLine1: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  pincode: z.string().optional(),
  academicYearId: z.number().int().positive().optional(),
})), c.apply);

router.get('/admissions/stats', authenticate, requireRole('ADMIN'), c.admissionStats);
router.get('/admissions', authenticate, requireRole('ADMIN'), c.admissions);
router.get('/admissions/:id', authenticate, requireRole('ADMIN'), c.admission);
router.post('/admissions/:id/review', authenticate, requireRole('ADMIN'), validate(z.object({
  approve: z.boolean(),
  remarks: z.string().optional(),
})), c.reviewAdmission);

router.get('/:id', authenticate, requireSelfOrRole('ADMIN', (r) => Number(r.params.id)), c.detail);
router.post('/', authenticate, requireRole('ADMIN'), validate(z.object({
  programId: z.number().int().positive(),
  departmentId: z.number().int().positive(),
  categoryId: z.number().int().positive(),
  batchId: z.number().int().positive().nullable().optional(),
  firstName: z.string().min(1, 'First name is required'),
  middleName: z.string().optional(),
  lastName: z.string().min(1, 'Last name is required'),
  email: z.string().email('Enter a valid email address'),
  phone: z.string().min(6).optional(),
  dateOfBirth: z.string().min(6, 'Date of birth is required'),
  gender: z.enum(['MALE', 'FEMALE', 'OTHER']),
  bloodGroup: z.enum(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']).optional(),
  admissionYear: z.number().int().min(1990).max(2100),
  admissionDate: z.string().optional(),
  emergencyContact: z.string().optional(),
  rollNumber: z.string().optional(),
  password: z.string().min(8).optional(),
  address: z.object({
    addressType: z.enum(['PERMANENT', 'CORRESPONDENCE', 'HOSTEL']).optional(),
    line1: z.string().min(1), city: z.string().min(1), state: z.string().min(1),
    pincode: z.string().min(4), line2: z.string().optional(), country: z.string().optional(),
  }).optional(),
  guardian: z.object({
    name: z.string().min(1), relation: z.enum(['FATHER', 'MOTHER', 'GUARDIAN', 'SPOUSE', 'SIBLING']).optional(),
    phone: z.string().min(6), email: z.string().email().optional(),
    occupation: z.string().optional(), annualIncome: z.number().optional(),
  }).optional(),
})), c.create);
router.put('/:id', authenticate, requireRole('ADMIN'), c.update);
router.delete('/:id', authenticate, requireRole('ADMIN'), c.remove);
router.patch('/:id/status', authenticate, requireRole('ADMIN'), validate(z.object({
  status: z.enum(['ACTIVE', 'INACTIVE', 'GRADUATED', 'SUSPENDED', 'ALUMNI']),
  reason: z.string().min(1, 'Give a reason for the status change'),
})), c.changeStatus);

router.get('/:id/addresses', authenticate, requireSelfOrRole('ADMIN', (r) => Number(r.params.id)), c.addresses);
router.put('/:id/addresses', authenticate, requireRole('ADMIN'), c.saveAddress);
router.get('/:id/guardians', authenticate, requireSelfOrRole('ADMIN', (r) => Number(r.params.id)), c.guardians);
router.put('/:id/guardians', authenticate, requireRole('ADMIN'), c.saveGuardian);
router.get('/:id/documents', authenticate, requireSelfOrRole('ADMIN', (r) => Number(r.params.id)), c.documents);
router.post('/:id/documents', authenticate, requireRole('ADMIN'), c.addDocument);


export default router;
