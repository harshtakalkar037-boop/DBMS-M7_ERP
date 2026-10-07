import { callProc, Row } from '../config/database';
import { AppError, parsePaging } from '../utils/api';
import { facultyRepo, leavesRepo, payrollRepo } from '../repositories/faculty.repository';
import { notificationsRepo } from '../repositories/notification.repository';
import { hashPassword } from './auth.service';
import { createUser } from '../repositories/auth.repository';
import { audit } from '../utils/audit';
import { AuthUser } from '../middleware/auth';

export const faculty = {
  list: (q: Record<string, any>) => facultyRepo.list(q, parsePaging(q)),
  byId: async (id: number) => {
    const f = await facultyRepo.byId(id);
    if (!f) throw AppError.notFound('Faculty member');
    return f;
  },
  byUserId: facultyRepo.byUserId,
  workload: facultyRepo.workload,
  teachingLoad: facultyRepo.teachingLoad,
  stats: facultyRepo.stats,

  /** Creates the login (role = FACULTY) and the employee record together. */
  async create(b: Record<string, any>, actor: AuthUser) {
    const hash = await hashPassword(b.password ?? 'Faculty@123');
    const userId = await createUser('FACULTY', b.email, hash, b.phone ?? null);
    try {
      const id = await facultyRepo.create(b, userId);
      await audit({
        userId: actor.userId, action: 'CREATE', entity: 'faculty', entityId: id,
        description: `Faculty ${b.employeeCode} created`, newValue: { ...b, password: undefined },
      });
      await notificationsRepo.create({
        userId, title: 'Welcome to the ERP',
        message: `Your faculty account is ready. Your employee code is ${b.employeeCode}.`,
        type: 'GENERAL', severity: 'SUCCESS', entity: 'faculty', entityId: id, link: '/profile',
      });
      return { facultyId: id, userId };
    } catch (err) {
      const { execute } = await import('../config/database');
      await execute('DELETE FROM users WHERE user_id = ?', [userId]).catch(() => undefined);
      throw err;
    }
  },

  async update(id: number, b: Record<string, any>, actor: AuthUser) {
    const before = await facultyRepo.byId(id);
    if (!before) throw AppError.notFound('Faculty member');
    await facultyRepo.update(id, b);
    await audit({
      userId: actor.userId, action: 'UPDATE', entity: 'faculty', entityId: id,
      description: `Faculty ${before.employee_code} updated`, oldValue: before, newValue: b,
    });
    return { facultyId: id };
  },
};

export const leaves = {
  list: (q: Record<string, any>) => leavesRepo.list(q, parsePaging(q)),
  byId: async (id: number) => {
    const l = await leavesRepo.byId(id);
    if (!l) throw AppError.notFound('Leave application');
    return l;
  },
  balances: leavesRepo.balances,
  types: leavesRepo.types,

  async apply(facultyId: number, b: Record<string, any>, actor: AuthUser) {
    if (Number(b.days) <= 0) throw AppError.validation('Leave duration must be at least one day');
    const id = await leavesRepo.create(facultyId, b);
    await audit({
      userId: actor.userId, action: 'CREATE', entity: 'faculty_leaves', entityId: id,
      description: `${b.leaveType} leave applied for ${b.days} day(s)`, newValue: b,
    });
    return { leaveId: id };
  },

  /**
   * Approve / reject. `sp_approve_leave` consumes the leave balance (only on
   * approval) and notifies the applicant.
   */
  async review(leaveId: number, approve: boolean, remarks: string, actor: AuthUser) {
    const before = await leavesRepo.byId(leaveId);
    if (!before) throw AppError.notFound('Leave application');
    const { out } = await callProc(
      'sp_approve_leave', [leaveId, approve ? 1 : 0, actor.userId, remarks ?? null], ['p_message'],
    );
    await audit({
      userId: actor.userId,
      action: approve ? 'LEAVE_ACTION' : 'REJECT',
      entity: 'faculty_leaves', entityId: leaveId,
      description: `Leave ${leaveId} ${approve ? 'approved' : 'rejected'}: ${out.p_message}`,
      oldValue: { status: before.status }, newValue: { status: approve ? 'APPROVED' : 'REJECTED', remarks },
    });
    const row = await (await import('../config/database')).queryOne<Row>(
      'SELECT user_id AS userId FROM faculty WHERE faculty_id = ?', [before.faculty_id]);
    if (row?.userId) {
      await notificationsRepo.create({
        userId: Number(row.userId),
        title: `Leave ${approve ? 'approved' : 'rejected'}`,
        message: `Your ${before.leave_type} leave (${before.days} days) was ${approve ? 'approved' : 'rejected'}. ${remarks ?? ''}`.trim(),
        type: 'LEAVE_APPROVAL', severity: approve ? 'SUCCESS' : 'WARNING',
        entity: 'faculty_leaves', entityId: leaveId, link: '/leaves',
      });
    }
    return { leaveId, approved: approve, message: out.p_message };
  },
};

export const payroll = {
  list: (q: Record<string, any>) => payrollRepo.list(q, parsePaging(q)),
  byId: async (id: number) => {
    const p = await payrollRepo.byId(id);
    if (!p) throw AppError.notFound('Payslip');
    return p;
  },
  components: payrollRepo.components,
  summary: payrollRepo.summary,
  months: payrollRepo.months,

  /**
   * Generate every payslip for a month. `sp_generate_monthly_payroll` computes
   * gross, PF, professional tax, income tax, LOP and net salary per faculty.
   */
  async generate(month: number, year: number, actor: AuthUser) {
    if (month < 1 || month > 12) throw AppError.validation('Month must be between 1 and 12');
    const { out } = await callProc(
      'sp_generate_monthly_payroll', [month, year, actor.userId],
      ['p_generated', 'p_total_net', 'p_message'],
    );
    await audit({
      userId: actor.userId, action: 'PAYROLL_RUN', entity: 'payrolls',
      description: `Payroll ${month}/${year}: ${out.p_message}`,
      newValue: { month, year, generated: out.p_generated, totalNet: out.p_total_net },
    });
    return {
      generated: Number(out.p_generated ?? 0),
      totalNet: Number(out.p_total_net ?? 0),
      message: out.p_message,
    };
  },

  async setStatus(id: number, status: 'DRAFT' | 'GENERATED' | 'APPROVED' | 'PAID', actor: AuthUser) {
    await payrollRepo.updateStatus(id, status);
    await audit({
      userId: actor.userId, action: 'UPDATE', entity: 'payrolls', entityId: id,
      description: `Payslip ${id} marked ${status}`, newValue: { status },
    });
    return { payrollId: id, status };
  },

  /** Full printable payslip: header + earnings/deduction lines. */
  async slip(id: number) {
    const [p, components] = await Promise.all([payrollRepo.byId(id), payrollRepo.components(id)]);
    if (!p) throw AppError.notFound('Payslip');
    return {
      payslip: p,
      earnings: components.filter((c: Row) => c.component_type === 'EARNING'),
      deductions: components.filter((c: Row) => c.component_type === 'DEDUCTION'),
      institute: 'Integrated University ERP',
    };
  },
};
