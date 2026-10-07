import { ReactNode } from 'react';
import { LayoutDashboard, GraduationCap, FileText, UserPlus, BookOpen, Building2, Library, CalendarDays, CalendarClock, ClipboardCheck, PenLine, BarChart3, FileBadge, Award, Ticket, BrainCircuit, Wallet, Receipt, CreditCard, AlertTriangle, Percent, BedDouble, Home, ClipboardList, DoorOpen, Users, Umbrella, CalendarRange, IndianRupee, Sparkles, Lightbulb, ShieldAlert, PieChart, Bell, ScrollText, Settings2, UserCircle, ListChecks } from 'lucide-react';
import { Role } from '../lib/types';
export interface NavItem {
  to: string;
  label: string;
  icon: ReactNode;
  roles: Role[];
  badge?: 'unread';
}

export interface NavSection { title: string; items: NavItem[]; }

const ALL: Role[] = ['ADMIN', 'FACULTY', 'STUDENT', 'ACCOUNTANT', 'HOSTEL_ADMIN', 'EXAM_CELL', 'HR'];
const STAFF: Role[] = ['ADMIN', 'FACULTY', 'ACCOUNTANT', 'HOSTEL_ADMIN', 'EXAM_CELL', 'HR'];
const ADMIN_HR: Role[] = ['ADMIN', 'HR'];
const ADMIN_HOSTEL: Role[] = ['ADMIN', 'HOSTEL_ADMIN'];
const ADMIN_ACCT: Role[] = ['ADMIN', 'ACCOUNTANT'];

export const NAV: NavSection[] = [
  {
    title: 'Overview',
    items: [
      { to: '/', label: 'Dashboard', icon: <LayoutDashboard className="h-4 w-4" />, roles: ALL },
      { to: '/profile', label: 'My Profile', icon: <UserCircle className="h-4 w-4" />, roles: ALL },
    ],
  },
  {
    title: 'Module 1 · Students',
    items: [
      { to: '/students', label: 'Students', icon: <GraduationCap className="h-4 w-4" />, roles: STAFF },
      { to: '/admissions', label: 'Admissions', icon: <FileText className="h-4 w-4" />, roles: ['ADMIN', 'EXAM_CELL'] },
      { to: '/admissions/apply', label: 'Apply for Admission', icon: <UserPlus className="h-4 w-4" />, roles: ALL },
      { to: '/enrollments', label: 'Enrollment', icon: <ListChecks className="h-4 w-4" />, roles: ['ADMIN', 'EXAM_CELL'] },
    ],
  },
  {
    title: 'Module 2 · Academics',
    items: [
      { to: '/academics/masters', label: 'Departments & Programs', icon: <Building2 className="h-4 w-4" />, roles: STAFF },
      { to: '/academics/subjects', label: 'Subjects', icon: <BookOpen className="h-4 w-4" />, roles: STAFF },
      { to: '/academics/offerings', label: 'Course Offerings', icon: <Library className="h-4 w-4" />, roles: STAFF },
      { to: '/academics/timetable', label: 'Timetable', icon: <CalendarClock className="h-4 w-4" />, roles: ALL },
      { to: '/academics/calendar', label: 'Academic Calendar', icon: <CalendarDays className="h-4 w-4" />, roles: ALL },
    ],
  },
  {
    title: 'Module 3 · Attendance',
    items: [
      { to: '/attendance/sessions', label: 'Sessions', icon: <ClipboardCheck className="h-4 w-4" />, roles: ['ADMIN', 'FACULTY'] },
      { to: '/attendance/reports', label: 'Reports & Defaulters', icon: <BarChart3 className="h-4 w-4" />, roles: ['ADMIN', 'FACULTY', 'EXAM_CELL'] },
      { to: '/attendance/me', label: 'My Attendance', icon: <PenLine className="h-4 w-4" />, roles: ['STUDENT'] },
    ],
  },
  {
    title: 'Module 4 · Examinations',
    items: [
      { to: '/exams', label: 'Examinations', icon: <FileBadge className="h-4 w-4" />, roles: ['ADMIN', 'EXAM_CELL', 'FACULTY', 'STUDENT'] },
      { to: '/exams/registrations', label: 'Registrations', icon: <ClipboardList className="h-4 w-4" />, roles: ['ADMIN', 'EXAM_CELL'] },
      { to: '/exams/marks', label: 'Marks Entry', icon: <PenLine className="h-4 w-4" />, roles: ['ADMIN', 'EXAM_CELL', 'FACULTY'] },
      { to: '/exams/results', label: 'Results', icon: <Award className="h-4 w-4" />, roles: ALL },
      { to: '/exams/hall-ticket', label: 'Hall Ticket', icon: <Ticket className="h-4 w-4" />, roles: ['STUDENT'] },
      { to: '/mock-exams', label: 'Mock Test Engine', icon: <BrainCircuit className="h-4 w-4" />, roles: ALL },
    ],
  },
  {
    title: 'Module 5 · Fees & Finance',
    items: [
      { to: '/fees/structures', label: 'Fee Structures', icon: <Wallet className="h-4 w-4" />, roles: ADMIN_ACCT },
      { to: '/fees/bills', label: 'Fee Bills', icon: <Receipt className="h-4 w-4" />, roles: ADMIN_ACCT },
      { to: '/fees/payments', label: 'Payments', icon: <CreditCard className="h-4 w-4" />, roles: ADMIN_ACCT },
      { to: '/fees/defaulters', label: 'Defaulters', icon: <AlertTriangle className="h-4 w-4" />, roles: ADMIN_ACCT },
      { to: '/fees/scholarships', label: 'Scholarships', icon: <Percent className="h-4 w-4" />, roles: [...ADMIN_ACCT, 'STUDENT'] },
      { to: '/fees/me', label: 'My Fees', icon: <IndianRupee className="h-4 w-4" />, roles: ['STUDENT'] },
    ],
  },
  {
    title: 'Module 6 · Hostel',
    items: [
      { to: '/hostel/dashboard', label: 'Occupancy', icon: <BedDouble className="h-4 w-4" />, roles: [...ADMIN_HOSTEL, 'STUDENT'] },
      { to: '/hostel/rooms', label: 'Rooms & Beds', icon: <DoorOpen className="h-4 w-4" />, roles: ADMIN_HOSTEL },
      { to: '/hostel/applications', label: 'Applications', icon: <ClipboardList className="h-4 w-4" />, roles: ADMIN_HOSTEL },
      { to: '/hostel/allocations', label: 'Allocations', icon: <Home className="h-4 w-4" />, roles: ADMIN_HOSTEL },
      { to: '/hostel/me', label: 'My Hostel', icon: <BedDouble className="h-4 w-4" />, roles: ['STUDENT'] },
    ],
  },
  {
    title: 'Module 7 · Faculty & Payroll',
    items: [
      { to: '/faculty', label: 'Faculty', icon: <Users className="h-4 w-4" />, roles: STAFF },
      { to: '/faculty/leaves', label: 'Leave Requests', icon: <Umbrella className="h-4 w-4" />, roles: [...ADMIN_HR, 'FACULTY'] },
      { to: '/faculty/balances', label: 'Leave Balances', icon: <CalendarRange className="h-4 w-4" />, roles: [...ADMIN_HR, 'FACULTY'] },
      { to: '/faculty/payroll', label: 'Payroll', icon: <IndianRupee className="h-4 w-4" />, roles: ADMIN_HR },
    ],
  },
  {
    title: 'AI Assistant',
    items: [
      { to: '/ai/chat', label: 'Ask the Assistant', icon: <Sparkles className="h-4 w-4" />, roles: ALL },
      { to: '/ai/study-plan', label: 'Study Plan', icon: <Lightbulb className="h-4 w-4" />, roles: ALL },
      { to: '/ai/at-risk', label: 'At-Risk Students', icon: <ShieldAlert className="h-4 w-4" />, roles: ['ADMIN', 'FACULTY', 'EXAM_CELL'] },
    ],
  },
  {
    title: 'Reports & System',
    items: [
      { to: '/reports', label: 'Reports & Exports', icon: <PieChart className="h-4 w-4" />, roles: STAFF },
      { to: '/notifications', label: 'Notifications', icon: <Bell className="h-4 w-4" />, roles: ALL, badge: 'unread' },
      { to: '/audit', label: 'Audit Log', icon: <ScrollText className="h-4 w-4" />, roles: STAFF },
      { to: '/settings', label: 'Settings', icon: <Settings2 className="h-4 w-4" />, roles: STAFF },
    ],
  },
];

export function navFor(role: Role | undefined): NavSection[] {
  if (!role) return [];
  return NAV.map((s) => ({
    ...s,
    items: s.items.filter((i) => i.roles.includes(role)),
  })).filter((s) => s.items.length > 0);
}
