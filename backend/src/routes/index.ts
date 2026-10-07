import { Router } from 'express';
import authRoutes from './auth.routes';
import studentRoutes from './student.routes';
import academicRoutes from './academic.routes';
import attendanceRoutes from './attendance.routes';
import examRoutes from './exam.routes';
import financeRoutes from './finance.routes';
import hostelRoutes from './hostel.routes';
import facultyRoutes from './faculty.routes';
import notificationRoutes from './notification.routes';
import mockRoutes from './mock.routes';
import aiRoutes from './ai.routes';
import reportRoutes from './report.routes';
import miscRoutes from './misc.routes';

const router = Router();

router.use('/auth', authRoutes);
router.use('/students', studentRoutes);
router.use('/academics', academicRoutes);
router.use('/attendance', attendanceRoutes);
router.use('/exams', examRoutes);
router.use('/fees', financeRoutes);
router.use('/hostel', hostelRoutes);
router.use('/faculty', facultyRoutes);
router.use('/notifications', notificationRoutes);
router.use('/mock-exams', mockRoutes);
router.use('/ai', aiRoutes);
router.use('/reports', reportRoutes);
router.use('/', miscRoutes); // /dashboard /search /audit /settings /health

export default router;
