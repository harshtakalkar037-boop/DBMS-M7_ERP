import { dashboardRepo } from '../repositories/dashboard.repository';
import { AppError } from '../utils/api';
import { AuthUser } from '../middleware/auth';

/**
 * One endpoint per role. Nothing is hardcoded - every number below comes from a
 * SQL aggregate over the live tables.
 */
export async function forRole(actor: AuthUser) {
  switch (actor.role) {
    case 'ADMIN': return dashboardRepo.admin();
    case 'STUDENT': {
      if (!actor.studentId) throw AppError.badRequest('This account is not linked to a student record');
      return dashboardRepo.student(actor.studentId);
    }
    case 'FACULTY': {
      if (!actor.facultyId) throw AppError.badRequest('This account is not linked to a faculty record');
      return dashboardRepo.faculty(actor.facultyId);
    }
    case 'ACCOUNTANT': return dashboardRepo.accountant();
    case 'HOSTEL_ADMIN': return dashboardRepo.hostelAdmin();
    case 'EXAM_CELL': return dashboardRepo.examCell();
    case 'HR': return dashboardRepo.hr();
    default: throw AppError.forbidden('Unknown role');
  }
}
