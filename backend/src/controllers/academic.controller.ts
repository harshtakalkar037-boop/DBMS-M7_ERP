import { Request, Response } from 'express';
import * as service from '../services/academic.service';
import { ok } from '../utils/api';
import { AuthUser } from '../middleware/auth';
import { AppError } from '../utils/api';

const actor = (req: Request): AuthUser => { if (!req.user) throw AppError.unauthorized(); return req.user; };
const id = (req: Request): number => Number(req.params.id);
const send = (res: Response, data: unknown, message?: string, status = 200) => res.status(status).json(ok(data, message));

/* ------------------------------------------------------------------ masters */

export const departments = async (req: Request, res: Response) => {
  const r = await service.departments.list(req.query as Record<string, any>);
  send(res, r.rows, undefined, 200);
};
export const department = async (req: Request, res: Response) => { send(res, await service.departments.byId(id(req))); };

export const programs = async (req: Request, res: Response) => {
  const r = await service.programs.list(req.query as Record<string, any>);
  send(res, r.rows);
};
export const allPrograms = async (_req: Request, res: Response) => { send(res, await service.programs.all()); };

export const categories = async (req: Request, res: Response) => {
  const r = await service.categories.list(req.query as Record<string, any>, { page: 1, limit: 100, offset: 0 } as any, []);
  send(res, r.rows);
};

export const subjects = async (req: Request, res: Response) => {
  const r = await service.subjects.list(req.query as Record<string, any>);
  send(res, r.rows, undefined, 200);
};
export const subject = async (req: Request, res: Response) => { send(res, await service.subjects.byId(id(req))); };
export const createSubject = async (req: Request, res: Response) => {
  send(res, await service.subjects.create(req.body, actor(req)), 'Subject created', 201);
};
export const updateSubject = async (req: Request, res: Response) => {
  send(res, await service.subjects.update(id(req), req.body, actor(req)), 'Subject updated');
};

export const batches = async (req: Request, res: Response) => {
  const r = await service.batches.list(req.query as Record<string, any>);
  send(res, r.rows);
};

export const academicYears = async (_req: Request, res: Response) => { send(res, await service.years.list()); };
export const semesters = async (req: Request, res: Response) => {
  send(res, await service.years.semesters(req.query.academicYearId ? Number(req.query.academicYearId) : undefined));
};
export const currentSemester = async (_req: Request, res: Response) => { send(res, await service.years.current()); };

export const sections = async (req: Request, res: Response) => { send(res, await service.sections.list(req.query as Record<string, any>)); };
export const createSection = async (req: Request, res: Response) => {
  send(res, await service.sections.create(req.body, actor(req)), 'Section created', 201);
};
export const setClassTeacher = async (req: Request, res: Response) => {
  send(res, await service.sections.setClassTeacher(id(req), req.body.facultyId ?? null, actor(req)), 'Class teacher updated');
};

/* ---------------------------------------------------------------- offerings */

export const offerings = async (req: Request, res: Response) => {
  const r = await service.offerings.list(req.query as Record<string, any>);
  send(res, r.rows);
};
export const offering = async (req: Request, res: Response) => { send(res, await service.offerings.byId(id(req))); };
export const createOffering = async (req: Request, res: Response) => {
  send(res, await service.offerings.create(req.body, actor(req)), 'Course offering created', 201);
};
export const updateOffering = async (req: Request, res: Response) => {
  send(res, await service.offerings.update(id(req), req.body, actor(req)), 'Course offering updated');
};

/* --------------------------------------------------------------- enrollments */

export const enrollments = async (req: Request, res: Response) => {
  const r = await service.enrollments.list(req.query as Record<string, any>);
  send(res, r.rows);
};
export const enroll = async (req: Request, res: Response) => {
  send(res, await service.enrollments.enroll(Number(req.body.studentId), Number(req.body.offeringId), actor(req)), 'Student enrolled', 201);
};
export const dropEnrollment = async (req: Request, res: Response) => {
  send(res, await service.enrollments.drop(id(req), actor(req)), 'Enrollment removed');
};
export const bulkEnroll = async (req: Request, res: Response) => {
  send(res, await service.enrollments.bulk(
    Number(req.body.programId), Number(req.body.semesterId), req.body.sectionId ? Number(req.body.sectionId) : null, actor(req)),
  'Bulk enrollment complete');
};

/* ---------------------------------------------------------------- timetable */

export const timetableSection = async (req: Request, res: Response) => { send(res, await service.timetable.forSection(id(req))); };
export const timetableFaculty = async (req: Request, res: Response) => { send(res, await service.timetable.forFaculty(id(req))); };
export const timetableStudent = async (req: Request, res: Response) => {
  const studentId = req.user?.role === 'STUDENT' ? Number(req.user.studentId) : id(req);
  send(res, await service.timetable.forStudent(studentId));
};
export const timetableConflicts = async (_req: Request, res: Response) => { send(res, await service.timetable.conflicts()); };
export const createTimetable = async (req: Request, res: Response) => {
  send(res, await service.timetable.create(req.body, actor(req)), 'Timetable slot added', 201);
};
export const deleteTimetable = async (req: Request, res: Response) => {
  send(res, await service.timetable.remove(id(req), actor(req)), 'Timetable slot removed');
};

/* ----------------------------------------------------------------- calendar */

export const calendar = async (req: Request, res: Response) => {
  send(res, await service.calendar.list(req.query.from as string, req.query.to as string));
};
export const createEvent = async (req: Request, res: Response) => {
  send(res, await service.calendar.create(req.body, actor(req)), 'Event added', 201);
};
export const deleteEvent = async (req: Request, res: Response) => {
  send(res, await service.calendar.remove(id(req), actor(req)), 'Event removed');
};

/* ---------------------------------------------------------- faculty subject */

export const facultySubjects = async (req: Request, res: Response) => {
  send(res, await service.facultySubjects.list(req.query.facultyId ? Number(req.query.facultyId) : undefined));
};
export const assignFacultySubject = async (req: Request, res: Response) => {
  send(res, await service.facultySubjects.create(req.body, actor(req)), 'Subject assigned', 201);
};
export const removeFacultySubject = async (req: Request, res: Response) => {
  send(res, await service.facultySubjects.remove(id(req), actor(req)), 'Assignment removed');
};
