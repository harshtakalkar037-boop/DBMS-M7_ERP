import { callProc, Row, queryOne } from '../config/database';
import { AppError, parsePaging, Paging } from '../utils/api';
import * as A from '../repositories/academic.repository';
import { audit } from '../utils/audit';
import { AuthUser } from '../middleware/auth';

/* -------------------------------------------------------------- departments */

export const departments = {
  list: (q: Record<string, any>) => A.departmentsRepo.list(q, parsePaging(q, 100, 500), []),
  byId: A.departmentsRepo.byId,
};

export const programs = {
  list: (q: Record<string, any>) => A.programsRepo.list(q, parsePaging(q, 100, 500), []),
  all: A.programsRepo.listAll,
  byId: A.programsRepo.byId,
};

export const subjects = {
  list: (q: Record<string, any>) => A.subjectsRepo.list(q, parsePaging(q)),
  byId: A.subjectsRepo.byId,
  async create(b: Record<string, any>, actor: AuthUser) {
    const id = await A.subjectsRepo.create(b);
    await audit({ userId: actor.userId, action: 'CREATE', entity: 'subjects', entityId: id, description: `Subject ${b.subjectCode} created`, newValue: b });
    return { subjectId: id };
  },
  async update(id: number, b: Record<string, any>, actor: AuthUser) {
    await A.subjectsRepo.update(id, b);
    await audit({ userId: actor.userId, action: 'UPDATE', entity: 'subjects', entityId: id, description: `Subject ${id} updated`, newValue: b });
    return { subjectId: id };
  },
};

export const batches = {
  list: (q: Record<string, any>) => A.batchesRepo.list(q, parsePaging(q, 100, 500)),
  byId: A.batchesRepo.byId,
};

export const years = A.yearsRepo;
export const sections = {
  list: A.sectionsRepo.list,
  async create(b: Record<string, any>, actor: AuthUser) {
    const id = await A.sectionsRepo.create(b);
    await audit({ userId: actor.userId, action: 'CREATE', entity: 'sections', entityId: id, description: `Section ${b.sectionCode} created`, newValue: b });
    return { sectionId: id };
  },
  async setClassTeacher(id: number, facultyId: number | null, actor: AuthUser) {
    await A.sectionsRepo.setClassTeacher(id, facultyId);
    await audit({ userId: actor.userId, action: 'UPDATE', entity: 'sections', entityId: id, description: `Class teacher set to ${facultyId ?? 'none'}` });
    return { sectionId: id, classTeacherId: facultyId };
  },
};

export const categories = A.categoriesRepo;

/* ------------------------------------------------------------- offerings */

export const offerings = {
  list: (q: Record<string, any>) => A.offeringsRepo.list(q, parsePaging(q)),
  byId: A.offeringsRepo.byId,
  async create(b: Record<string, any>, actor: AuthUser) {
    const id = await A.offeringsRepo.create(b);
    await audit({ userId: actor.userId, action: 'CREATE', entity: 'course_offerings', entityId: id, description: `Course offering ${id} created`, newValue: b });
    return { offeringId: id };
  },
  async update(id: number, b: Record<string, any>, actor: AuthUser) {
    const before = await A.offeringsRepo.byId(id);
    if (!before) throw AppError.notFound('Course offering');
    await A.offeringsRepo.update(id, b);
    await audit({ userId: actor.userId, action: 'UPDATE', entity: 'course_offerings', entityId: id, description: `Offering ${id} updated`, oldValue: before, newValue: b });
    return { offeringId: id };
  },
};

/* ----------------------------------------------------------- enrollments */

export const enrollments = {
  list: (q: Record<string, any>) => A.enrollmentsRepo.list(q, parsePaging(q)),
  async enroll(studentId: number, offeringId: number, actor: AuthUser) {
    const id = await A.enrollmentsRepo.create(studentId, offeringId, actor.userId);
    await audit({ userId: actor.userId, action: 'CREATE', entity: 'enrollments', entityId: id, description: `Student ${studentId} enrolled in offering ${offeringId}` });
    return { enrollmentId: id };
  },
  async drop(id: number, actor: AuthUser) {
    await A.enrollmentsRepo.remove(id);
    await audit({ userId: actor.userId, action: 'DELETE', entity: 'enrollments', entityId: id, description: `Enrollment ${id} removed` });
    return { deleted: true };
  },
  /**
   * Bulk enroll every student of a batch into every subject of the semester.
   * Delegated to `sp_bulk_enroll_students` so the whole set is one transaction
   * and the enrollment trigger (which maintains course_offerings.enrolled_count)
   * fires consistently.
   */
  async bulk(programId: number, semesterId: number, sectionId: number | null, actor: AuthUser) {
    const { out } = await callProc(
      'sp_bulk_enroll_students', [programId, semesterId, sectionId ?? null, actor.userId],
      ['p_enrolled', 'p_skipped', 'p_message'],
    );
    await audit({
      userId: actor.userId, action: 'CREATE', entity: 'enrollments',
      description: `Bulk enrollment for program ${programId}, semester ${semesterId}: ${out.p_message}`,
      newValue: { programId, semesterId, sectionId, enrolled: out.p_enrolled, skipped: out.p_skipped },
    });
    return { enrolled: Number(out.p_enrolled ?? 0), skipped: Number(out.p_skipped ?? 0), message: out.p_message };
  },
  forStudent: A.enrollmentsRepo.forStudent,
};

/* --------------------------------------------------------------- timetable */

export const timetable = {
  forSection: A.timetableRepo.forSection,
  forFaculty: A.timetableRepo.forFaculty,
  forStudent: A.timetableRepo.forStudent,
  conflicts: A.timetableRepo.conflicts,
  async create(b: Record<string, any>, actor: AuthUser) {
    // trg_timetable_bi_conflict refuses the insert when the faculty or room is
    // already busy, so no application level duplicate check is needed.
    const id = await A.timetableRepo.create(b);
    await audit({ userId: actor.userId, action: 'CREATE', entity: 'timetable', entityId: id, description: `Timetable slot ${id} created`, newValue: b });
    return { timetableId: id };
  },
  async remove(id: number, actor: AuthUser) {
    await A.timetableRepo.remove(id);
    await audit({ userId: actor.userId, action: 'DELETE', entity: 'timetable', entityId: id, description: `Timetable slot ${id} removed` });
    return { deleted: true };
  },
};

/* ---------------------------------------------------------------- calendar */

export const calendar = {
  list: A.calendarRepo.list,
  async create(b: Record<string, any>, actor: AuthUser) {
    const id = await A.calendarRepo.create(b);
    await audit({ userId: actor.userId, action: 'CREATE', entity: 'academic_calendar', entityId: id, description: `Event "${b.title}" added`, newValue: b });
    return { eventId: id };
  },
  async remove(id: number, actor: AuthUser) {
    await A.calendarRepo.remove(id);
    await audit({ userId: actor.userId, action: 'DELETE', entity: 'academic_calendar', entityId: id, description: `Event ${id} removed` });
    return { deleted: true };
  },
};

/* -------------------------------------------------------------- curriculum */

export const curriculum = {
  forProgram: A.curriculumRepo.forProgram,
  async add(programId: number, subjectId: number, semesterNo: number, isElective: boolean, actor: AuthUser) {
    await A.curriculumRepo.add(programId, subjectId, semesterNo, isElective);
    await audit({ userId: actor.userId, action: 'CREATE', entity: 'program_subjects', description: `Subject ${subjectId} added to program ${programId} semester ${semesterNo}` });
    return { programId, subjectId, semesterNo };
  },
  async remove(programId: number, subjectId: number, semesterNo: number, actor: AuthUser) {
    await A.curriculumRepo.remove(programId, subjectId, semesterNo);
    await audit({ userId: actor.userId, action: 'DELETE', entity: 'program_subjects', description: `Subject ${subjectId} removed from program ${programId} semester ${semesterNo}` });
    return { deleted: true };
  },
};

export const facultySubjects = {
  list: A.facultySubjectsRepo.list,
  async create(b: Record<string, any>, actor: AuthUser) {
    const id = await A.facultySubjectsRepo.create(b);
    await audit({ userId: actor.userId, action: 'CREATE', entity: 'faculty_subjects', entityId: id, description: `Faculty ${b.facultyId} assigned subject ${b.subjectId}` });
    return { allocationId: id };
  },
  async remove(id: number, actor: AuthUser) {
    await A.facultySubjectsRepo.remove(id);
    await audit({ userId: actor.userId, action: 'DELETE', entity: 'faculty_subjects', entityId: id, description: `Allocation ${id} removed` });
    return { deleted: true };
  },
};
