import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './lib/auth';
import { AppShell, RoleGate } from './components/AppShell';
import { Loading } from './components/ui';

import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import ProfilePage from './pages/ProfilePage';

import StudentsPage from './pages/students/StudentsPage';
import StudentDetailPage from './pages/students/StudentDetailPage';
import AdmissionsPage from './pages/students/AdmissionsPage';
import AdmissionApplyPage from './pages/students/AdmissionApplyPage';
import EnrollmentsPage from './pages/students/EnrollmentsPage';

import AcademicsMastersPage from './pages/academics/AcademicsMastersPage';
import SubjectsPage from './pages/academics/SubjectsPage';
import OfferingsPage from './pages/academics/OfferingsPage';
import TimetablePage from './pages/academics/TimetablePage';
import CalendarPage from './pages/academics/CalendarPage';

import AttendanceSessionsPage from './pages/attendance/AttendanceSessionsPage';
import AttendanceMarkPage from './pages/attendance/AttendanceMarkPage';
import AttendanceReportsPage from './pages/attendance/AttendanceReportsPage';
import MyAttendancePage from './pages/attendance/MyAttendancePage';

import ExamsPage from './pages/exams/ExamsPage';
import ExamRegistrationsPage from './pages/exams/ExamRegistrationsPage';
import MarksPage from './pages/exams/MarksPage';
import ResultsPage from './pages/exams/ResultsPage';
import HallTicketPage from './pages/exams/HallTicketPage';
import MockExamsPage from './pages/exams/MockExamsPage';
import MockAttemptPage from './pages/exams/MockAttemptPage';

import FeeStructuresPage from './pages/fees/FeeStructuresPage';
import BillsPage from './pages/fees/BillsPage';
import PaymentsPage from './pages/fees/PaymentsPage';
import DefaultersPage from './pages/fees/DefaultersPage';
import ScholarshipsPage from './pages/fees/ScholarshipsPage';
import MyFeesPage from './pages/fees/MyFeesPage';

import HostelDashboardPage from './pages/hostel/HostelDashboardPage';
import HostelRoomsPage from './pages/hostel/HostelRoomsPage';
import HostelApplicationsPage from './pages/hostel/HostelApplicationsPage';
import HostelAllocationsPage from './pages/hostel/HostelAllocationsPage';
import MyHostelPage from './pages/hostel/MyHostelPage';

import FacultyPage from './pages/faculty/FacultyPage';
import FacultyDetailPage from './pages/faculty/FacultyDetailPage';
import LeavesPage from './pages/faculty/LeavesPage';
import LeaveBalancesPage from './pages/faculty/LeaveBalancesPage';
import PayrollPage from './pages/faculty/PayrollPage';

import AiChatPage from './pages/ai/AiChatPage';
import StudyPlanPage from './pages/ai/StudyPlanPage';
import AtRiskPage from './pages/ai/AtRiskPage';

import ReportsPage from './pages/system/ReportsPage';
import NotificationsPage from './pages/system/NotificationsPage';
import AuditPage from './pages/system/AuditPage';
import SettingsPage from './pages/system/SettingsPage';
import NotFoundPage from './pages/system/NotFoundPage';

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, ready } = useAuth();
  if (!ready) return <Loading label="Restoring your session…" />;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route
        element={
          <RequireAuth>
            <AppShell />
          </RequireAuth>
        }
      >
        <Route path="/" element={<DashboardPage />} />
        <Route path="/profile" element={<ProfilePage />} />

        {/* Module 1 */}
        <Route path="/students" element={<RoleGate roles={['ADMIN', 'FACULTY', 'ACCOUNTANT', 'HOSTEL_ADMIN', 'EXAM_CELL', 'HR']}><StudentsPage /></RoleGate>} />
        <Route path="/students/:id" element={<RoleGate roles={['ADMIN', 'FACULTY', 'ACCOUNTANT', 'HOSTEL_ADMIN', 'EXAM_CELL', 'HR']}><StudentDetailPage /></RoleGate>} />
        <Route path="/admissions" element={<RoleGate roles={['ADMIN', 'EXAM_CELL']}><AdmissionsPage /></RoleGate>} />
        <Route path="/admissions/apply" element={<AdmissionApplyPage />} />
        <Route path="/enrollments" element={<RoleGate roles={['ADMIN', 'EXAM_CELL']}><EnrollmentsPage /></RoleGate>} />

        {/* Module 2 */}
        <Route path="/academics/masters" element={<AcademicsMastersPage />} />
        <Route path="/academics/subjects" element={<SubjectsPage />} />
        <Route path="/academics/offerings" element={<OfferingsPage />} />
        <Route path="/academics/timetable" element={<TimetablePage />} />
        <Route path="/academics/calendar" element={<CalendarPage />} />

        {/* Module 3 */}
        <Route path="/attendance/sessions" element={<RoleGate roles={['ADMIN', 'FACULTY']}><AttendanceSessionsPage /></RoleGate>} />
        <Route path="/attendance/sessions/:id" element={<RoleGate roles={['ADMIN', 'FACULTY']}><AttendanceMarkPage /></RoleGate>} />
        <Route path="/attendance/reports" element={<RoleGate roles={['ADMIN', 'FACULTY', 'EXAM_CELL']}><AttendanceReportsPage /></RoleGate>} />
        <Route path="/attendance/me" element={<RoleGate roles={['STUDENT']}><MyAttendancePage /></RoleGate>} />

        {/* Module 4 */}
        <Route path="/exams" element={<ExamsPage />} />
        <Route path="/exams/registrations" element={<RoleGate roles={['ADMIN', 'EXAM_CELL']}><ExamRegistrationsPage /></RoleGate>} />
        <Route path="/exams/marks" element={<RoleGate roles={['ADMIN', 'EXAM_CELL', 'FACULTY']}><MarksPage /></RoleGate>} />
        <Route path="/exams/results" element={<ResultsPage />} />
        <Route path="/exams/hall-ticket" element={<RoleGate roles={['STUDENT']}><HallTicketPage /></RoleGate>} />
        <Route path="/mock-exams" element={<MockExamsPage />} />
        <Route path="/mock-exams/attempts/:id" element={<MockAttemptPage />} />

        {/* Module 5 */}
        <Route path="/fees/structures" element={<RoleGate roles={['ADMIN', 'ACCOUNTANT']}><FeeStructuresPage /></RoleGate>} />
        <Route path="/fees/bills" element={<RoleGate roles={['ADMIN', 'ACCOUNTANT']}><BillsPage /></RoleGate>} />
        <Route path="/fees/payments" element={<RoleGate roles={['ADMIN', 'ACCOUNTANT']}><PaymentsPage /></RoleGate>} />
        <Route path="/fees/defaulters" element={<RoleGate roles={['ADMIN', 'ACCOUNTANT']}><DefaultersPage /></RoleGate>} />
        <Route path="/fees/scholarships" element={<ScholarshipsPage />} />
        <Route path="/fees/me" element={<RoleGate roles={['STUDENT']}><MyFeesPage /></RoleGate>} />

        {/* Module 6 */}
        <Route path="/hostel/dashboard" element={<HostelDashboardPage />} />
        <Route path="/hostel/rooms" element={<RoleGate roles={['ADMIN', 'HOSTEL_ADMIN']}><HostelRoomsPage /></RoleGate>} />
        <Route path="/hostel/applications" element={<RoleGate roles={['ADMIN', 'HOSTEL_ADMIN']}><HostelApplicationsPage /></RoleGate>} />
        <Route path="/hostel/allocations" element={<RoleGate roles={['ADMIN', 'HOSTEL_ADMIN']}><HostelAllocationsPage /></RoleGate>} />
        <Route path="/hostel/me" element={<RoleGate roles={['STUDENT']}><MyHostelPage /></RoleGate>} />

        {/* Module 7 */}
        <Route path="/faculty" element={<FacultyPage />} />
        <Route path="/faculty/:id" element={<FacultyDetailPage />} />
        <Route path="/faculty/leaves" element={<LeavesPage />} />
        <Route path="/faculty/balances" element={<LeaveBalancesPage />} />
        <Route path="/faculty/payroll" element={<RoleGate roles={['ADMIN', 'HR']}><PayrollPage /></RoleGate>} />

        {/* AI */}
        <Route path="/ai/chat" element={<AiChatPage />} />
        <Route path="/ai/study-plan" element={<StudyPlanPage />} />
        <Route path="/ai/at-risk" element={<RoleGate roles={['ADMIN', 'FACULTY', 'EXAM_CELL']}><AtRiskPage /></RoleGate>} />

        {/* System */}
        <Route path="/reports" element={<RoleGate roles={['ADMIN', 'FACULTY', 'ACCOUNTANT', 'HOSTEL_ADMIN', 'EXAM_CELL', 'HR']}><ReportsPage /></RoleGate>} />
        <Route path="/notifications" element={<NotificationsPage />} />
        <Route path="/audit" element={<RoleGate roles={['ADMIN', 'FACULTY', 'ACCOUNTANT', 'HOSTEL_ADMIN', 'EXAM_CELL', 'HR']}><AuditPage /></RoleGate>} />
        <Route path="/settings" element={<RoleGate roles={['ADMIN', 'FACULTY', 'ACCOUNTANT', 'HOSTEL_ADMIN', 'EXAM_CELL', 'HR']}><SettingsPage /></RoleGate>} />

        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
