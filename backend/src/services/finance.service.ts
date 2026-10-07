import { callProc, query, Row } from '../config/database';
import { AppError, parsePaging, rowsToCsv } from '../utils/api';
import {
  feeStructuresRepo, studentFeesRepo, paymentsRepo, finesRepo,
  scholarshipsRepo, refundsRepo,
} from '../repositories/finance.repository';
import { notificationsRepo } from '../repositories/notification.repository';
import { audit } from '../utils/audit';
import { AuthUser } from '../middleware/auth';

export const feeStructures = {
  list: (q: Record<string, any>) => feeStructuresRepo.list(q, parsePaging(q)),
  byId: async (id: number) => {
    const fs = await feeStructuresRepo.byId(id);
    if (!fs) throw AppError.notFound('Fee structure');
    return fs;
  },
  async create(b: Record<string, any>, actor: AuthUser) {
    const id = await feeStructuresRepo.create(b);
    await audit({ userId: actor.userId, action: 'CREATE', entity: 'fee_structures', entityId: id, description: `Fee structure ${b.feeCode} created`, newValue: b });
    return { feeStructureId: id };
  },
  /** Every change to a fee structure is audit logged (brief requirement). */
  async update(id: number, b: Record<string, any>, actor: AuthUser) {
    const before = await feeStructuresRepo.byId(id);
    if (!before) throw AppError.notFound('Fee structure');
    await feeStructuresRepo.update(id, b);
    await audit({
      userId: actor.userId, action: 'FEE_CHANGE', entity: 'fee_structures', entityId: id,
      description: `Fee structure ${before.fee_code} updated`, oldValue: before, newValue: b,
    });
    return { feeStructureId: id };
  },
};

export const studentFees = {
  list: (q: Record<string, any>) => studentFeesRepo.list(q, parsePaging(q)),
  byId: async (id: number) => {
    const sf = await studentFeesRepo.byId(id);
    if (!sf) throw AppError.notFound('Fee bill');
    return sf;
  },
  forStudent: studentFeesRepo.forStudent,
  summary: studentFeesRepo.summaryForStudent,
  ledger: studentFeesRepo.ledger,
  stats: studentFeesRepo.stats,
  defaulters: studentFeesRepo.defaulters,

  /** Generate one bill per ACTIVE student of a program/semester. */
  async generate(programId: number, semesterId: number, semesterNo: number,
    academicYearId: number, dueDate: string, actor: AuthUser) {
    const { out } = await callProc(
      'sp_generate_semester_fees', [programId, semesterId, semesterNo, academicYearId, dueDate],
      ['p_generated', 'p_message'],
    );
    await audit({
      userId: actor.userId, action: 'FEE_CHANGE', entity: 'student_fees',
      description: `Fees generated for program ${programId} semester ${semesterNo}: ${out.p_message}`,
      newValue: { programId, semesterId, semesterNo, academicYearId, dueDate, generated: out.p_generated },
    });
    return { generated: Number(out.p_generated ?? 0), message: out.p_message };
  },

  /** Apply late fees to every overdue bill (fn_calculate_late_fee does the maths). */
  async applyLateFees(actor: AuthUser) {
    const { out } = await callProc('sp_apply_late_fees', [], ['p_updated', 'p_message']);
    await audit({
      userId: actor.userId, action: 'FEE_CHANGE', entity: 'student_fees',
      description: `Late fees applied: ${out.p_message}`, newValue: { updated: out.p_updated },
    });
    return { updated: Number(out.p_updated ?? 0), message: out.p_message };
  },

  async lateFeePreview(studentFeeId: number) {
    const row = await feeRecord(studentFeeId);
    return { studentFeeId, computedLateFee: row?.computedLateFee ?? 0 };
  },
};

async function feeRecord(id: number) {
  return studentFeesRepo.byId(id);
}

export const payments = {
  list: (q: Record<string, any>) => paymentsRepo.list(q, parsePaging(q)),
  daily: paymentsRepo.daily,
  monthly: paymentsRepo.monthly,

  /**
   * Record a payment. `sp_process_fee_payment` generates the receipt number and
   * the transaction id; `trg_payment_ai` then updates student_fees and appends
   * the ledger row in `transactions`.
   */
  async pay(studentFeeId: number, amount: number, mode: string, reference: string | undefined, actor: AuthUser) {
    const before = await studentFeesRepo.byId(studentFeeId);
    if (!before) throw AppError.notFound('Fee bill');
    if (amount <= 0) throw AppError.validation('Payment amount must be greater than zero');
    if (Number(amount) > Number(before.due_amount)) {
      throw AppError.validation(`Payment exceeds the outstanding balance of ${before.due_amount}`);
    }
    const { out } = await callProc(
      'sp_process_fee_payment', [studentFeeId, amount, mode, reference ?? null, actor.userId],
      ['p_payment_id', 'p_receipt_no', 'p_message'],
    );
    await audit({
      userId: actor.userId, action: 'PAYMENT', entity: 'payments',
      entityId: Number(out.p_payment_id ?? 0) || null,
      description: `Payment of ${amount} received for bill ${studentFeeId}: ${out.p_receipt_no}`,
      oldValue: { dueAmount: before.due_amount }, newValue: { amount, mode },
    });
    const stu = await query<Row>('SELECT user_id AS userId FROM students WHERE student_id = ?', [before.student_id]);
    if (stu[0]?.userId) {
      await notificationsRepo.create({
        userId: Number(stu[0].userId),
        title: 'Payment received',
        message: `We received INR ${amount} against bill ${before.fee_code}. Receipt ${out.p_receipt_no}.`,
        type: 'FEE_DUE', severity: 'SUCCESS', entity: 'payments',
        entityId: Number(out.p_payment_id ?? 0) || null, link: '/fees',
      });
    }
    return {
      paymentId: out.p_payment_id,
      receiptNo: out.p_receipt_no,
      message: out.p_message,
      amount,
    };
  },

  /** Printable receipt payload. */
  async receipt(receiptNo: string) {
    const p = await paymentsRepo.byReceipt(receiptNo);
    if (!p) throw AppError.notFound('Receipt');
    const ledger = await studentFeesRepo.ledger(Number(p.student_fee_id));
    return {
      receipt: p,
      ledger,
      balance: ledger.length ? Number(ledger[ledger.length - 1].balance_after) : 0,
      printedAt: new Date().toISOString(),
      institute: 'Integrated University ERP',
    };
  },

  async refund(paymentId: number, amount: number, reason: string, actor: AuthUser) {
    const { queryOne } = await import('../config/database');
    const p = await queryOne<Row>('SELECT * FROM payments WHERE payment_id = ?', [paymentId]);
    if (!p) throw AppError.notFound('Payment');
    if (Number(amount) > Number(p.amount)) throw AppError.validation('Refund cannot exceed the payment amount');
    const id = await refundsRepo.create({ paymentId, studentId: p.student_id, amount, reason }, actor.userId);
    await executeUpdatePayment(paymentId);
    await audit({
      userId: actor.userId, action: 'PAYMENT', entity: 'refunds', entityId: id,
      description: `Refund of ${amount} against receipt ${p.receipt_no}: ${reason}`, newValue: { paymentId, amount, reason },
    });
    return { refundId: id };
  },
};

async function executeUpdatePayment(paymentId: number) {
  const { execute } = await import('../config/database');
  await execute("UPDATE payments SET status = 'REFUNDED' WHERE payment_id = ?", [paymentId]);
}

export const fines = {
  list: finesRepo.list,
  async create(b: Record<string, any>, actor: AuthUser) {
    const id = await finesRepo.create(b, actor.userId);
    await audit({ userId: actor.userId, action: 'CREATE', entity: 'fines', entityId: id, description: `Fine of ${b.amount} imposed on student ${b.studentId}`, newValue: b });
    return { fineId: id };
  },
  async status(id: number, status: string, actor: AuthUser) {
    await finesRepo.updateStatus(id, status);
    await audit({ userId: actor.userId, action: 'UPDATE', entity: 'fines', entityId: id, description: `Fine ${id} marked ${status}` });
    return { fineId: id, status };
  },
};

export const scholarships = {
  list: scholarshipsRepo.list,
  forStudent: scholarshipsRepo.forStudent,
  async award(studentId: number, scholarshipId: number, academicYearId: number, amount: number, actor: AuthUser) {
    const id = await scholarshipsRepo.award(studentId, scholarshipId, academicYearId, amount, actor.userId);
    await audit({ userId: actor.userId, action: 'CREATE', entity: 'student_scholarships', entityId: id, description: `Scholarship ${scholarshipId} awarded to student ${studentId} (${amount})` });
    return { studentScholarshipId: id };
  },
};

export const refunds = { list: refundsRepo.list };

/** Generic CSV export used by the fees screens. */
export async function exportCsv(kind: string, params: Record<string, any>): Promise<string> {
  switch (kind) {
    case 'defaulters': return rowsToCsv(await studentFeesRepo.defaulters(500));
    case 'bills': {
      const { rows } = await studentFeesRepo.list(params, parsePaging(params, 1000, 1000));
      return rowsToCsv(rows);
    }
    case 'payments': {
      const { rows } = await paymentsRepo.list(params, parsePaging(params, 1000, 1000));
      return rowsToCsv(rows);
    }
    case 'collection': return rowsToCsv(await paymentsRepo.monthly());
    default: throw AppError.validation(`No exporter for "${kind}"`);
  }
}
