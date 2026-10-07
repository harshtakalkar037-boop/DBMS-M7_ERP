import { callProc, query, Row } from '../config/database';
import { AppError, parsePaging } from '../utils/api';
import {
  hostelsRepo, roomsRepo, applicationsRepo, allocationsRepo, hostelFeesRepo,
} from '../repositories/hostel.repository';
import { notificationsRepo } from '../repositories/notification.repository';
import { audit } from '../utils/audit';
import { AuthUser } from '../middleware/auth';

export const hostels = {
  list: hostelsRepo.list,
  byId: async (id: number) => {
    const h = await hostelsRepo.byId(id);
    if (!h) throw AppError.notFound('Hostel');
    return h;
  },
  occupancy: hostelsRepo.occupancy,
  stats: hostelsRepo.stats,
};

export const rooms = {
  list: roomsRepo.list,
  vacancy: roomsRepo.vacancy,
  blocks: roomsRepo.blocks,
  beds: roomsRepo.beds,
  async create(b: Record<string, any>, actor: AuthUser) {
    const id = await roomsRepo.create(b);
    await audit({ userId: actor.userId, action: 'CREATE', entity: 'rooms', entityId: id, description: `Room ${b.roomNumber} created with beds`, newValue: b });
    return { roomId: id };
  },
};

export const applications = {
  list: (q: Record<string, any>) => applicationsRepo.list(q, parsePaging(q)),
  suggestedBeds: applicationsRepo.suggestedBeds,

  /** A student applies for hostel accommodation (self service). */
  async create(b: Record<string, any>, actor: AuthUser) {
    const studentId = b.studentId ?? actor.studentId;
    if (!studentId) throw AppError.validation('studentId is required');
    const existing = await query<Row>(
      `SELECT application_id AS id FROM hostel_applications
       WHERE student_id = ? AND academic_year_id = ? AND status IN ('APPLIED','APPROVED')`,
      [studentId, b.academicYearId],
    );
    if (existing.length) {
      throw AppError.conflict('This student already has an active hostel application for the year');
    }
    const id = await applicationsRepo.create({ ...b, studentId });
    await audit({
      userId: actor.userId, action: 'CREATE', entity: 'hostel_applications', entityId: id,
      description: `Hostel application submitted by student ${studentId}`, newValue: b,
    });
    return { applicationId: id };
  },

  async review(id: number, status: 'APPROVED' | 'REJECTED' | 'WAITLISTED', remarks: string, actor: AuthUser) {
    await applicationsRepo.review(id, status, actor.userId, remarks);
    await audit({
      userId: actor.userId,
      action: status === 'REJECTED' ? 'REJECT' : 'APPROVE',
      entity: 'hostel_applications', entityId: id,
      description: `Hostel application ${id} ${status.toLowerCase()}${remarks ? `: ${remarks}` : ''}`,
      newValue: { status, remarks },
    });
    return { applicationId: id, status };
  },
};

export const allocations = {
  list: (q: Record<string, any>) => allocationsRepo.list(q, parsePaging(q)),
  byId: allocationsRepo.byId,
  activeForStudent: allocationsRepo.activeForStudent,
  historyForStudent: allocationsRepo.historyForStudent,
  transfers: allocationsRepo.transfers,

  /**
   * Allocate a bed. `sp_allocate_hostel_bed` inserts the allocation, raises the
   * hostel fee bill and marks the application approved. bed/room/hostel counters
   * are maintained by the trg_bed_au / trg_room_au / trg_allocation_* triggers,
   * so capacity never drifts.
   */
  async allocate(applicationId: number, bedId: number, actor: AuthUser) {
    const { out } = await callProc(
      'sp_allocate_hostel_bed', [applicationId, bedId, actor.userId],
      ['p_allocation_id', 'p_message'],
    );
    await audit({
      userId: actor.userId, action: 'HOSTEL_ALLOCATION', entity: 'room_allocations',
      entityId: Number(out.p_allocation_id ?? 0) || null,
      description: `Bed ${bedId} allocated for application ${applicationId}: ${out.p_message}`,
      newValue: { applicationId, bedId },
    });
    const stu = await query<Row>(
      `SELECT s.user_id AS userId, r.room_number AS room, h.name AS hostel, bd.bed_code AS bed
       FROM room_allocations ra
       JOIN students s ON s.student_id = ra.student_id
       JOIN rooms r    ON r.room_id = ra.room_id
       JOIN hostels h  ON h.hostel_id = ra.hostel_id
       JOIN beds bd    ON bd.bed_id = ra.bed_id
       WHERE ra.allocation_id = ?`, [out.p_allocation_id],
    );
    if (stu[0]?.userId) {
      await notificationsRepo.create({
        userId: Number(stu[0].userId),
        title: 'Hostel bed allocated',
        message: `You have been allotted ${stu[0].hostel}, room ${stu[0].room}, bed ${stu[0].bed}.`,
        type: 'HOSTEL_ALLOCATION', severity: 'SUCCESS', entity: 'room_allocations',
        entityId: Number(out.p_allocation_id ?? 0) || null, link: '/hostel',
      });
    }
    return { allocationId: out.p_allocation_id, message: out.p_message };
  },

  /** Move a resident to a different bed. */
  async transfer(allocationId: number, toBedId: number, reason: string, actor: AuthUser) {
    const { out } = await callProc(
      'sp_transfer_room', [allocationId, toBedId, reason, actor.userId], ['p_message'],
    );
    await audit({
      userId: actor.userId, action: 'HOSTEL_ALLOCATION', entity: 'room_allocations',
      entityId: allocationId, description: `Transfer to bed ${toBedId}: ${out.p_message}`,
      newValue: { toBedId, reason },
    });
    return { allocationId, message: out.p_message };
  },

  async vacate(allocationId: number, reason: string, actor: AuthUser) {
    const { out } = await callProc('sp_vacate_hostel_bed', [allocationId, actor.userId, reason], ['p_message']);
    await audit({
      userId: actor.userId, action: 'HOSTEL_ALLOCATION', entity: 'room_allocations',
      entityId: allocationId, description: `Bed vacated: ${out.p_message}`, newValue: { reason },
    });
    return { allocationId, message: out.p_message };
  },
};

export const hostelFees = { list: hostelFeesRepo.list };
