import { Router } from 'express';
import * as raw from '../controllers/academic.controller';
import { wrapAll } from '../utils/wrap';

const c = wrapAll(raw);
import { authenticate, requireRole, requireSelfOrRole } from '../middleware/auth';

const router = Router();

/* -------------------------------------------------------------- read: staff */
const READ = ['ADMIN', 'FACULTY', 'EXAM_CELL', 'ACCOUNTANT', 'HOSTEL_ADMIN', 'HR'] as const;

router.get('/departments', authenticate, c.departments);
router.get('/departments/:id', authenticate, c.department);
router.get('/programs', authenticate, c.programs);
router.get('/programs/all', authenticate, c.allPrograms);
router.get('/categories', authenticate, c.categories);
router.get('/batches', authenticate, c.batches);
router.get('/years', authenticate, c.academicYears);
router.get('/semesters', authenticate, c.semesters);
router.get('/semesters/current', authenticate, c.currentSemester);
router.get('/sections', authenticate, c.sections);
router.get('/subjects', authenticate, c.subjects);
router.get('/subjects/:id', authenticate, c.subject);
router.get('/offerings', authenticate, c.offerings);
router.get('/offerings/:id', authenticate, c.offering);
router.get('/enrollments', authenticate, requireRole(...READ), c.enrollments);
router.get('/faculty-subjects', authenticate, requireRole('ADMIN', 'FACULTY'), c.facultySubjects);

router.get('/timetable/section/:id', authenticate, c.timetableSection);
router.get('/timetable/faculty/:id', authenticate, c.timetableFaculty);
router.get('/timetable/student/:id', authenticate, requireRole('ADMIN', 'FACULTY', 'STUDENT'), c.timetableStudent);
router.get('/timetable/conflicts', authenticate, requireRole('ADMIN'), c.timetableConflicts);

router.get('/calendar', authenticate, c.calendar);

/* ------------------------------------------------------------- write: admin */
router.post('/subjects', authenticate, requireRole('ADMIN'), c.createSubject);
router.put('/subjects/:id', authenticate, requireRole('ADMIN'), c.updateSubject);
router.post('/sections', authenticate, requireRole('ADMIN'), c.createSection);
router.put('/sections/:id/class-teacher', authenticate, requireRole('ADMIN'), c.setClassTeacher);
router.post('/offerings', authenticate, requireRole('ADMIN'), c.createOffering);
router.put('/offerings/:id', authenticate, requireRole('ADMIN'), c.updateOffering);
router.post('/enrollments', authenticate, requireRole('ADMIN'), c.enroll);
router.post('/enrollments/bulk', authenticate, requireRole('ADMIN'), c.bulkEnroll);
router.delete('/enrollments/:id', authenticate, requireRole('ADMIN'), c.dropEnrollment);
router.post('/timetable', authenticate, requireRole('ADMIN'), c.createTimetable);
router.delete('/timetable/:id', authenticate, requireRole('ADMIN'), c.deleteTimetable);
router.post('/calendar', authenticate, requireRole('ADMIN'), c.createEvent);
router.delete('/calendar/:id', authenticate, requireRole('ADMIN'), c.deleteEvent);
router.post('/faculty-subjects', authenticate, requireRole('ADMIN'), c.assignFacultySubject);
router.delete('/faculty-subjects/:id', authenticate, requireRole('ADMIN'), c.removeFacultySubject);

export default router;
