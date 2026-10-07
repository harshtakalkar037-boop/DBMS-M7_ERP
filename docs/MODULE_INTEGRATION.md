# MODULE INTEGRATION

**University Higher Education ERP System** — M7 BATCH, Department of E&TCE

> This document answers the question an examiner asks second: *"OK, the modules work — but do they work
> **together**?"* Every claim below points at a real file, endpoint, table or stored routine in this
> repository.

---

## Contents

1. [Architecture at a glance](#1-architecture-at-a-glance)
2. [Shared masters — the single source of truth](#2-shared-masters--the-single-source-of-truth)
3. [Module reference](#3-module-reference)
4. [Integration matrix — who touches what](#4-integration-matrix--who-touches-what)
5. [Six canonical cross-module flows](#5-six-canonical-cross-module-flows)
6. [Where each business rule is enforced](#6-where-each-business-rule-is-enforced)
7. [Transaction boundaries](#7-transaction-boundaries)
8. [Identity, authentication and RBAC wiring](#8-identity-authentication-and-rbac-wiring)
9. [Notifications and audit — the cross-cutting modules](#9-notifications-and-audit--the-cross-cutting-modules)
10. [The AI layer (isolated, honest, replaceable)](#10-the-ai-layer-isolated-honest-replaceable)
11. [Reporting and CSV export](#11-reporting-and-csv-export)
12. [API conventions](#12-api-conventions)
13. [How to add an eighth module](#13-how-to-add-an-eighth-module)
14. [Consistency checklist (queries that prove integration)](#14-consistency-checklist-queries-that-prove-integration)

---

## 1. Architecture at a glance

```
                       Browser (React 18 + TypeScript + Tailwind)
                                     │  fetch('/api/v1/…')  — relative URLs only
                                     ▼
                       Vite dev server  (proxy: /api → http://127.0.0.1:8080)
                                     │
                                     ▼
   ┌─────────────────────────────────────────────────────────────────────────┐
   │  Express API  (Node 20 + TypeScript, strict)                            │
   │                                                                         │
   │   middleware   helmet · cors · rate-limit · morgan · error handler      │
   │   auth         authenticate (JWT) → requireRole(...) → validate(zod)    │
   │   routes       students academics attendance exams fees hostel faculty  │
   │                ai mock reports notifications audit search dashboard      │
   │   services     business rules, authorisation scoping, audit calls       │
   │   repositories parameterised SQL only  (mysql2 pool, prepared)          │
   └─────────────────────────────────────────────────────────────────────────┘
                                     │  mysql2/promise pool (10 connections)
                                     ▼
   ┌─────────────────────────────────────────────────────────────────────────┐
   │  MySQL 8 / MariaDB 10.6+   database `university_erp`                    │
   │                                                                         │
   │  tables(61) · views(20) · procedures(17) · functions(13) · triggers(28) │
   │  foreign keys(138) · CHECK constraints · audit + notification tables    │
   └─────────────────────────────────────────────────────────────────────────┘
                                     │
                                     ▼
        MongoDB (optional, OFF by default) — append-only event stream only
```

**Rules of the road that keep the layers honest**

| Rule | Why |
|---|---|
| The browser only ever calls `/api/v1/…` (relative) | works unchanged behind any proxy/host; no CORS surprises, no `localhost` in client code |
| Routes do no SQL; repositories do no authorisation | one layer to review for security, one for data access |
| Every value reaches SQL as a `?` placeholder | SQL injection is structurally impossible, not merely unlikely |
| Business rules live in stored routines **or** services — never in React | the rule holds for curl, scripts and the UI equally |
| Read models are views (`v_*`) | the same join is written once and reused by API, reports and dashboard |

---

## 2. Shared masters — the single source of truth

There is exactly one table per real-world entity. No module keeps a private copy.

| Master | Owner (create/update) | Consumed by |
|---|---|---|
| `users` + `roles` | auth module | every module (login, RBAC, audit actor, notifications) |
| `departments` | academics (`/academics/departments`) | students, faculty, subjects, reports, dashboards |
| `programs`, `batches`, `sections` | academics | admissions, students, fees, offerings, timetable, reports |
| `subjects` | academics | offerings, attendance, exams, timetable, faculty allotment |
| `academic_years`, `semesters` | academics | fees, exams, results, hostel year, leave balances, payroll month |
| `students` | admissions → `sp_approve_admission` | enrolments, attendance, exams, fees, hostel, AI, notifications |
| `faculty` | faculty module (HR) | offerings, sessions, timetable, invigilation, warden, leaves, payroll |

Consequences that are enforced by the database, not by convention:

* `students.user_id → users.user_id` and `faculty.user_id → users.user_id`: **one login per person**,
  regardless of how many modules they appear in.
* `departments.hod_faculty_id → faculty.faculty_id` and `hostels.warden_faculty_id → faculty.faculty_id`:
  the department/hostel structure refers to the *same* faculty rows payroll pays.
* Deleting a department or program is restricted (`ON DELETE RESTRICT`) while students reference it —
  the FK refuses rather than orphaning rows.

---

## 3. Module reference

### Module 1 — Student & Admission

| | |
|---|---|
| Tables | `admissions`, `students`, `addresses`, `guardians`, `student_documents`, `student_status_history` |
| API | `GET/POST /students`, `GET/PUT/DELETE /students/:id`, `PATCH /students/:id/status`, `POST /admissions/apply` (public), `GET /admissions`, `POST /admissions/:id/review`, addresses/guardians/documents sub-resources |
| DB logic | `sp_approve_admission`, `trg_students_bi_validate`, `trg_students_bu_validate`, `trg_students_au_status_history`, `v_student_full_profile` |
| Frontend | `StudentsPage`, `StudentDetailPage`, `AdmissionsPage`, `AdmissionApplyPage` |
| **Integrates with** | academics (program/batch/section chosen at admission), finance (bills generated after the student exists), hostel (a student can apply for a bed), auth (a `users` row is created by the approval procedure) |

### Module 2 — Academic & Course

| | |
|---|---|
| Tables | `programs`, `batches`, `sections`, `subjects`, `program_subjects`, `course_offerings`, `enrollments`, `faculty_subjects`, `timetable`, `academic_calendar` |
| API | `/academics/*` — departments, programs, batches, years, semesters, sections, subjects, offerings, enrolments (incl. `POST /enrollments/bulk`), timetable, calendar, `GET /academics/timetable/conflicts` |
| DB logic | `sp_bulk_enroll_students`, `trg_enrollments_bi_guard`, `trg_enrollments_ai_count`, `trg_enrollments_ad_count`, `trg_timetable_bi_conflict` |
| Frontend | `AcademicsMastersPage`, `SubjectsPage`, `OfferingsPage`, `TimetablePage`, `CalendarPage` |
| **Integrates with** | faculty (`offerings.faculty_id`), attendance (sessions belong to an offering), exams (registrations belong to an offering), students (enrolments), fees (fee structures are per program + semester) |

### Module 3 — Attendance

| | |
|---|---|
| Tables | `class_sessions`, `attendance` |
| API | `/attendance/sessions` (+ `POST /sessions/:id/mark`, `mark-bulk`), `/attendance/report/*`, `/attendance/me*`, `/attendance/student/:id/*`, `POST /attendance/warn-low` |
| DB logic | `sp_mark_attendance_bulk`, `fn_calculate_attendance_percentage`, `fn_calculate_semester_attendance`, `trg_attendance_bi_guard`, `v_student_attendance_summary`, `v_student_attendance_overall`, `v_monthly_attendance` |
| Frontend | `AttendanceSessionsPage`, `AttendanceMarkPage`, `AttendanceReportsPage`, `MyAttendancePage` |
| **Integrates with** | **exams** — the attendance percentage is the gate for registration; **academics** — sessions hang off offerings; **notifications** — low-attendance warnings are pushed to the student |

### Module 4 — Examination & Results

| | |
|---|---|
| Tables | `exams`, `exam_schedules`, `exam_registrations`, `marks`, `results`, `grades` |
| API | `/exams` (+ schedules, registrations, `POST /registrations`, eligibility, exemption, hall tickets, marks, results processing/publishing, rankings, `PUT /policy/threshold`) |
| DB logic | `sp_register_student_for_exam`, `sp_enter_marks`, `sp_process_semester_results`, `sp_publish_exam_results`, `fn_grade_code`, `fn_grade_points`, `fn_calculate_sgpa`, `fn_calculate_student_cgpa`, `trg_exam_reg_bi_eligibility`, `trg_marks_bi_derive`, `trg_marks_bu_derive`, `trg_marks_au_audit`, `v_exam_eligibility`, `v_exam_hall_ticket`, `v_student_rankings`, `v_subject_failure_rate` |
| Frontend | `ExamsPage`, `ExamRegistrationsPage`, `MarksPage`, `ResultsPage`, `HallTicketPage` |
| **Integrates with** | attendance (eligibility), finance (dues block registration), academics (offerings/schedules), notifications (results published, hall tickets issued), students (marksheets) |

### Module 5 — Fees & Finance

| | |
|---|---|
| Tables | `fee_structures`, `student_fees`, `payments`, `scholarships`, `student_scholarships`, `fines`, `refunds`, `transactions` |
| API | `/fees/structures`, `/fees/bills` (+ `/me`, `/defaulters`, ledger, late-fee), `POST /fees/generate`, `POST /fees/apply-late-fees`, `POST /fees/payments`, `POST /fees/payments/refund`, `/fees/fines`, `/fees/scholarships` (+ `/award`), `GET /fees/export/:kind` |
| DB logic | `sp_generate_semester_fees`, `sp_process_fee_payment`, `sp_apply_late_fees`, `fn_calculate_late_fee`, `fn_student_outstanding_dues`, `trg_student_fees_ai_audit`, `trg_student_fees_bu_audit`, `trg_payment_ai`, `trg_payment_au`, `v_student_fee_status`, `v_daily_fee_collection`, `v_fee_collection_summary` |
| Frontend | `FeeStructuresPage`, `BillsPage`, `PaymentsPage`, `DefaultersPage`, `ScholarshipsPage`, `MyFeesPage` |
| **Integrates with** | academics (fee structure per program/semester), students (bills per student), **exams** (pending dues block registration), hostel (hostel fees are separate but the same student), notifications (payment receipts) |

### Module 6 — Hostel

| | |
|---|---|
| Tables | `hostels`, `hostel_blocks`, `rooms`, `beds`, `hostel_applications`, `room_allocations`, `room_transfers`, `hostel_fees` |
| API | `/hostel/hostels`, `/hostel/rooms` (+ `/vacancy`), `/hostel/beds`, `/hostel/applications` (+ review, available beds), `/hostel/allocations` (+ transfer, vacate, `/me`), `/hostel/transfers`, `/hostel/fees`, `/hostel/occupancy`, `/hostel/stats` |
| DB logic | `sp_allocate_hostel_bed`, `sp_transfer_room`, `sp_vacate_hostel_bed`, `fn_hostel_available_beds`, `trg_rooms_bu_capacity`, `trg_beds_bu_guard`, `trg_allocation_bi_duplicate`, `trg_allocation_ai`, `trg_allocation_au`, `trg_allocation_ad`, `v_room_vacancy`, `v_hostel_occupancy` |
| Frontend | `HostelDashboardPage`, `HostelRoomsPage`, `HostelApplicationsPage`, `HostelAllocationsPage`, `MyHostelPage` |
| **Integrates with** | students (only a `students` row can apply), faculty (warden is a faculty row), finance (rent bills + hostel fee rows) |

### Module 7 — Faculty, Leave & Payroll

| | |
|---|---|
| Tables | `designations`, `faculty`, `faculty_subjects`, `faculty_leaves`, `leave_balances`, `payrolls`, `payroll_components` |
| API | `/faculty` (+ `/me`, `/workload`, `/:id/subjects`, `/:id/leave-balances`), `/faculty/leaves` (+ `POST /:id/review`), `/faculty/payroll` (+ `/summary`, `/months`, `POST /generate`, `PATCH /:id/status`) |
| DB logic | `sp_approve_leave`, `sp_generate_monthly_payroll`, `fn_calculate_faculty_leave_balance`, `fn_calculate_net_salary`, `trg_faculty_bi_validate`, `trg_faculty_leaves_bi_guard`, `trg_faculty_leaves_bu_guard`, `trg_payrolls_bu_guard`, `v_faculty_workload`, `v_faculty_payroll_summary` |
| Frontend | `FacultyPage`, `FacultyDetailPage`, `LeavesPage`, `LeaveBalancesPage`, `PayrollPage` |
| **Integrates with** | academics (offerings, timetable, faculty subjects), attendance (sessions taken), hostel (warden), exams (invigilation), auth (login) |

### Cross-cutting — AI, mock tests, reports, notifications, audit, search

| Feature | Where it lives | DB objects used |
|---|---|---|
| AI chat / study plan / at-risk | `services/ai.service.ts` (`LOCAL_ENGINE` or OpenAI adapter) | `ai_conversations`, `study_plans`, `student_risk_scores`, `sp_compute_student_risk`, `v_student_risk_dashboard` |
| Mock exam engine | `services/mockexam.service.ts` | `mcq_questions`, `mock_exams`, `mock_exam_answers` |
| Reports + CSV | `services/report.service.ts` | 12 report queries over the views, e.g. `attendance_defaulters`, `fee_defaulters`, `toppers`, `department_performance` |
| Notifications | `services/notification.service.ts` | `notifications`, `sp_push_notification` |
| Audit | `middleware` + every service | `audit_logs`, plus row-level triggers (`trg_marks_au_audit`, `trg_student_fees_*_audit`, `trg_payment_*`) |
| Global search | `services/search.service.ts` | searches students, faculty, subjects, invoices, applications, exams |

---

## 4. Integration matrix — who touches what

Rows = the module that **owns** the data. Columns = the module that **reads/writes** it.
`W` = writes, `R` = reads, `—` = no coupling.

| Owner ↓ / Consumer → | 1 Student | 2 Academic | 3 Attendance | 4 Exam | 5 Finance | 6 Hostel | 7 Faculty |
|---|---|---|---|---|---|---|---|
| **students** | — | R | R | R | R | R | — |
| **users / roles** | W | R | R | R | R | R | R |
| **departments / programs / subjects** | R | — | R | R | R | — | R |
| **course_offerings / enrollments** | R | — | W/R | W/R | — | — | R |
| **class_sessions / attendance** | R | R | — | **R (gate)** | — | — | R |
| **exam_registrations / marks / results** | R | R | R | — | — | — | R |
| **student_fees / payments** | R | R | — | **R (gate)** | — | R | — |
| **rooms / beds / allocations** | R | — | — | — | R | — | R (warden) |
| **faculty / leaves / payroll** | — | R | R | R | — | R | — |
| **notifications / audit_logs** | W | W | W | W | W | W | W |

The two marked **gates** are the interesting ones: attendance and fees both decide whether an exam
registration is allowed. They are evaluated inside the database, so no client can skip them.

---

## 5. Six canonical cross-module flows

### 5.1 Application → student → bill

1. Candidate submits `POST /students/admissions/apply` (public, no JWT) → row in `admissions` (`status = APPLIED`).
2. Admin opens `AdmissionsPage`, reviews, and calls `POST /students/admissions/:id/review`.
3. The service calls **`sp_approve_admission`**, which in one transaction:
   creates the `users` row (bcrypt hash), the `students` row (roll number + registration number),
   the category/program/batch links, and a `student_status_history` row.
4. The finance module bills the new student: `POST /fees/generate` → **`sp_generate_semester_fees`**
   turns the `fee_structures` row for that program/semester into a `student_fees` bill.
5. The student can now log in, see `MyFeesPage`, and (optionally) apply for a hostel bed.

### 5.2 Bulk enrolment → attendance → eligibility

1. `POST /academics/enrollments/bulk` → **`sp_bulk_enroll_students`** enrols a whole batch/section into
   every offering of the semester; `trg_enrollments_bi_guard` refuses over-capacity or duplicate rows and
   `trg_enrollments_ai_count` / `trg_enrollments_ad_count` keep `course_offerings.enrolled_count` exact.
2. A faculty member creates a session (`POST /attendance/sessions`) and marks the class
   (`POST /attendance/sessions/:id/mark-bulk` → **`sp_mark_attendance_bulk`**).
3. `v_student_attendance_summary` recomputes the running percentage.
4. `GET /exams/registrations/eligibility` shows `v_exam_eligibility`: every student/offering pair whose
   attendance is below `exams.min_attendance_required` (default 75) or which has outstanding dues.

### 5.3 Exam registration — the rule that cannot be bypassed

```
POST /exams/registrations  { examId, studentId, offeringId }
        │
        ▼  exam.service → sp_register_student_for_exam
        ├─ recompute attendance % for the offering        (fn_calculate_attendance_percentage)
        ├─ read outstanding dues                          (fn_student_outstanding_dues)
        ├─ attendance < exams.min_attendance_required  →  REJECTED  ('attendance below …')
        ├─ dues > 0                                    →  REJECTED  ('fees pending …')
        └─ otherwise INSERT … hall_ticket_no            →  REGISTERED
                    │
                    ▼  BEFORE INSERT trigger
        trg_exam_reg_bi_eligibility  — repeats the check and raises an SQL error if
                                       is_eligible = 0 and no exemption was granted
```

The same refusal happens for `mysql>` clients, scripts and the UI, because the rule is in MySQL.
The UI (`ExamRegistrationsPage`) simply displays the message the procedure returned.

### 5.4 Marks → results → notifications

1. `POST /exams/marks` → **`sp_enter_marks`** (validates range, derives grade/points via
   `fn_grade_code` / `fn_grade_points`; `trg_marks_bi_derive` fills the derived columns and
   `trg_marks_au_audit` writes the audit row).
2. `POST /exams/results/process` → **`sp_process_semester_results`** computes SGPA (`fn_calculate_sgpa`),
   CGPA (`fn_calculate_student_cgpa`), backlogs and the pass/fail status into `results`.
3. `POST /exams/results/publish/:id` → **`sp_publish_exam_results`** flips `result_published` and pushes a
   notification to every affected student.
4. The student sees the marksheet (`GET /exams/results/me`) and the leaderboard
   (`GET /exams/results/rankings`, which uses `RANK()`/`DENSE_RANK()` in `v_student_rankings`).

### 5.5 Hostel allocation → live capacity

1. Student applies: `POST /hostel/applications` → row in `hostel_applications`.
2. Warden reviews: `PUT /hostel/applications/:id/review` (APPROVED / REJECTED / WAITLISTED).
3. `POST /hostel/allocations` → **`sp_allocate_hostel_bed`** inserts `room_allocations`; then
   * `trg_allocation_bi_duplicate` blocks a second active bed in the same academic year,
   * `trg_allocation_ai` marks the bed `OCCUPIED` and increments `rooms.occupied_count`.
4. Vacating (`POST /hostel/allocations/:id/vacate` → `sp_vacate_hostel_bed`) fires
   `trg_allocation_ad` / `trg_allocation_au`, which free the bed and decrement the counter — so
   `v_room_vacancy` and `fn_hostel_available_beds()` are always current with zero application code.

### 5.6 Leave → payroll

1. Faculty applies for leave (`POST /faculty/leaves`); `trg_faculty_leaves_bi_guard` rejects overlapping
   or zero-day leaves.
2. HR reviews (`POST /faculty/leaves/:id/review` → **`sp_approve_leave`**), which updates the leave status and,
   on approval, consumes `leave_balances`.
3. `POST /faculty/payroll/generate` → **`sp_generate_monthly_payroll`** reads approved unpaid leave for the
   month, computes LOP days, calls `fn_calculate_net_salary`, writes `payrolls` +
   `payroll_components`, and reports how many payslips it produced.
4. HR advances each payslip `DRAFT → GENERATED → APPROVED → PAID` (`PATCH /faculty/payroll/:id/status`,
   guarded by `trg_payrolls_bu_guard`).
5. `v_faculty_payroll_summary` and `v_faculty_workload` feed the HR screens and the reports.

---

## 6. Where each business rule is enforced

| Rule | Enforced by | Layer |
|---|---|---|
| Attendance < 75 % blocks exam registration | `sp_register_student_for_exam` + `trg_exam_reg_bi_eligibility` | **database** |
| Pending fees block exam registration | same procedure (reads `fn_student_outstanding_dues`) | **database** |
| Bed capacity never goes stale | `trg_allocation_ai/au/ad`, `trg_beds_bu_guard`, `trg_rooms_bu_capacity` | **database** |
| One active bed per student per year | `trg_allocation_bi_duplicate` | **database** |
| Every fee change is audited | `trg_student_fees_ai_audit`, `trg_student_fees_bu_audit`, `trg_payment_ai`, `trg_payment_au` | **database** |
| Marks/grades/derived columns consistent | `trg_marks_bi_derive`, `trg_marks_bu_derive` | **database** |
| Enrolment cannot exceed capacity / duplicate | `trg_enrollments_bi_guard` (+ count triggers) | **database** |
| Timetable has no faculty/room clashes | `trg_timetable_bi_conflict` (+ `GET /academics/timetable/conflicts`) | **database** |
| Leave cannot overlap, balance cannot go negative | `trg_faculty_leaves_bi_guard`, `sp_approve_leave` | **database** |
| Students only see their own data | `student.service.list()` sets `scoped.studentId = actor.studentId` | **service** |
| Only HR can approve leaves / run payroll | `requireRole('ADMIN','HR')` on the route | **route** |
| Request bodies are well formed | zod schemas on every write route | **route** |
| Passwords are never stored in the clear | bcrypt hash in `sp_approve_admission` / `auth.service` | **database + service** |

Note what is *not* in the list: nothing important is enforced only in React. The UI hides buttons it
cannot use, but the server and the database are the ones that say no.

---

## 7. Transaction boundaries

| Operation | Boundary | Behaviour on failure |
|---|---|---|
| Admission approval | `sp_approve_admission` | user + student + history roll back together; never a half-created student |
| Bulk enrolment | `sp_bulk_enroll_students` | capacity is re-checked per row; a failure rolls the whole batch back |
| Attendance marking | `sp_mark_attendance_bulk` | all-or-nothing per session |
| Fee payment | `sp_process_fee_payment` | payment row + bill update + receipt number commit together; `trg_payment_ai` keeps `paid_amount` in step |
| Payroll run | `sp_generate_monthly_payroll` | every payslip for the month commits together |
| Result processing | `sp_process_semester_results` | all students of the semester commit together |
| Hostel allocation / transfer / vacate | `sp_allocate_hostel_bed`, `sp_transfer_room`, `sp_vacate_hostel_bed` | allocation + bed status + counters stay consistent |
| Multi-step service calls | `withTransaction()` helper where more than one statement must succeed | rollback + `audit_logs` entry |

Isolation: the pool uses the server default (`REPEATABLE READ` on MySQL/MariaDB). Writes that must be
serialised (allocation, enrolment counting) rely on row-level locks taken by the `UPDATE`/`INSERT`
inside the procedure plus the guard triggers, so two concurrent allocations cannot both take the last bed.

---

## 8. Identity, authentication and RBAC wiring

| Role | Sees | Typical routes |
|---|---|---|
| `ADMIN` | everything | all modules, settings, audit, announcements |
| `STUDENT` | only their own rows | `/students/:my-id`, `/attendance/me*`, `/fees/bills/me`, `/exams/results/me`, `/hostel/allocations/me`, `/mock-exams/attempts/me` |
| `FACULTY` | their offerings, sessions, students, own leaves/payslips | `/attendance/sessions`, `/exams/marks`, `/faculty/me/*` |
| `ACCOUNTANT` | fees, payments, scholarships, fines, refunds, exports | `/fees/*` |
| `HOSTEL_ADMIN` | hostels, rooms, beds, applications, allocations | `/hostel/*` |
| `EXAM_CELL` | exams, schedules, registrations, marks, results | `/exams/*` |
| `HR` | faculty, leaves, payroll | `/faculty/*` |

* Tokens: JWT access token (8 h) returned in the login body, refresh token as an HttpOnly cookie (7 d).
* `authenticate` resolves the user + role, `requireRole(...)` authorises, `validate(zod)` shapes the body.
* Scoping happens **after** authorisation, inside the service (`scoped.studentId`, `scoped.facultyId`),
  so a student who tampers with an id in the URL still only gets their own row — usually a 403.

---

## 9. Notifications and audit — the cross-cutting modules

**Notifications.** `sp_push_notification` inserts a row for a user (or broadcasts to a role). Producers:
result publishing, hall-ticket issue, payment receipts, low-attendance warnings, leave decisions, and the
admin "announce" screen (`POST /notifications/announce`). The UI badge polls `GET /notifications/unread`.

**Audit.** Two complementary levels, and both are populated in this build:

| Level | Source | Example |
|---|---|---|
| Application audit | every service that mutates data writes `audit_logs` (`action`, `entity`, `entityId`, `oldValue`, `newValue`, `ipAddress`, `actor`) | "approved admission 42", "generated payroll 9/2026" |
| Row-level audit | triggers on the tables where money or marks change | `trg_marks_au_audit`, `trg_student_fees_ai_audit`, `trg_student_fees_bu_audit`, `trg_payment_ai`, `trg_payment_au` |

`AuditPage` (admin) renders both: filters by action/entity/user/date plus `/audit/stats`.

---

## 10. The AI layer (isolated, honest, replaceable)

```
POST /ai/chat  { message }
      │
      ▼ ai.service.ts
   ┌──────────────────────────────────────────────────────────────┐
   │ if (OPENAI_API_KEY is set) → LLM adapter (OpenAI chat API)    │
   │        on any failure → fall through to the local engine      │
   │ else → local rule-based engine                               │
   └──────────────────────────────────────────────────────────────┘
      │  both paths return { reply, source: 'LLM' | 'LOCAL_ENGINE' }
      ▼
   ai_conversations row (so the chat has history) → response to the UI
```

* The UI prints the `source` badge on every answer, so **the demo never claims to be an LLM when it is not**.
* The local engine is a deterministic rule planner: it reads the student's attendance, marks, backlog
  count and pending dues (the same views the rest of the app uses), and turns them into a ranked study plan.
* `GET /ai/at-risk` and `POST /ai/risk/recompute` use `sp_compute_student_risk`, i.e. the scoring is real
  SQL over real rows, not a random number.
* No AI output is ever written back into academic or financial records — the AI is read-only advice.

MongoDB: the project ships with an optional Mongo event stream (`MONGO_ENABLED`, default **false**).
It is append-only telemetry (feature events) and no business rule depends on it; with it disabled every
feature still works, which is the honest way to justify a second database.

---

## 11. Reporting and CSV export

`GET /reports` lists 12 reports; `GET /reports/:key` runs one and answers
`{ key, title, columns[], rows[], generatedAt }`; `GET /reports/:key/csv` streams the same query as a file.
Reports span modules by design — for example `fee_defaulters` joins students + programs + bills, and
`attendance_defaulters` joins attendance + students + offerings. `ReportsPage` offers both an in-page CSV
(of the filtered rows on screen) and a full server-side export.

---

## 12. API conventions

| Convention | Detail |
|---|---|
| Base path | `/api/v1` |
| Success envelope | `{ success: true, data, message?, meta? }` |
| List envelope | `meta = { page, limit, total, totalPages }` |
| Error envelope | `{ success: false, message, code?, errors?: [{ field, message }] }` |
| Status codes | 200 ok · 201 created · 400 validation · 401 unauthenticated · 403 forbidden · 404 not found · 409 conflict · 429 rate limited · 500 server error |
| Filtering | query parameters are whitelisted per resource (`FILTER_MAP` in each repository) |
| Sorting | `sort` + `order`; only whitelisted columns |
| Money | `DECIMAL` in SQL, string on the wire, formatted in the browser — never a float |

---

## 13. How to add an eighth module

1. **Schema** — new tables in `02_tables.sql`, FKs/CHECKs in `03_constraints.sql`, seed rows in `04_seed.sql`.
   Reference `students`/`faculty`/`departments` by FK rather than copying them.
2. **Database logic** — put the rules in `05_procedures.sql` / `06_triggers.sql` / `07_functions.sql`, and expose
   read models as views in `08_views.sql`.
3. **Backend** — `repositories/<module>.repository.ts` (SQL only) → `services/<module>.service.ts`
   (rules + scoping + audit) → `controllers/<module>.controller.ts` → `routes/<module>.routes.ts`
   (with `authenticate` + `requireRole` + `validate`), mounted in `routes/index.ts`.
4. **Frontend** — `pages/<module>/*.tsx` using `api.page()`/`api.get()`, `DataTable`, `useFetch`, `useToast`,
   plus a route in `App.tsx` and an entry in `nav.ts` gated by `has('ROLE')`.
5. **Docs** — regenerate the data dictionary and the ER diagrams, and add the module here.
6. **Tests** — add a scenario to `tests/api/workflow.py` so the new endpoints are covered end to end.

---

## 14. Consistency checklist (queries that prove integration)

Run any of these; each one joins at least two modules. (The denormalised counters they check are
recomputed by the *post-seed reconciliation* block at the end of `06_triggers.sql`, because the seed data
is loaded before the triggers that would otherwise maintain them.)

```sql
-- a) every active student has a login, a program and a department
SELECT COUNT(*) FROM students s
LEFT JOIN users u  ON u.user_id = s.user_id
LEFT JOIN programs p ON p.program_id = s.program_id
WHERE s.status = 'ACTIVE' AND (u.user_id IS NULL OR p.program_id IS NULL);      -- expect 0

-- b) enrolment counters match the enrolment rows
SELECT COUNT(*) FROM course_offerings o
WHERE o.enrolled_count <> (SELECT COUNT(*) FROM enrollments e
                           WHERE e.offering_id = o.offering_id AND e.status = 'ENROLLED');  -- expect 0

-- c) room occupancy matches the active allocations
SELECT COUNT(*) FROM rooms r
WHERE r.occupied_count <> (SELECT COUNT(*) FROM room_allocations ra
                           WHERE ra.room_id = r.room_id AND ra.status = 'ACTIVE');          -- expect 0

-- d) bill arithmetic holds  (due = total - scholarship - discount - paid + fine)
SELECT COUNT(*) FROM student_fees
WHERE ABS((total_amount - scholarship_amount - discount_amount - paid_amount + fine_amount)
          - due_amount) > 0.01;                                                          -- expect 0

-- g) leave ledgers match the approved leave days
SELECT COUNT(*) FROM leave_balances lb
WHERE lb.used <> (SELECT IFNULL(SUM(days), 0) FROM faculty_leaves l
                  WHERE l.faculty_id = lb.faculty_id AND l.leave_type = lb.leave_type
                    AND l.status = 'APPROVED');                                          -- expect 0

-- h) bed status matches the active allocations
SELECT COUNT(*) FROM beds b
WHERE (b.status = 'OCCUPIED') <> EXISTS (SELECT 1 FROM room_allocations ra
                                         WHERE ra.bed_id = b.bed_id AND ra.status = 'ACTIVE');  -- expect 0

-- e) no registration was accepted below the attendance bar
SELECT COUNT(*) FROM exam_registrations
WHERE is_eligible = 0 AND status = 'REGISTERED';                                             -- expect 0

-- f) every payment belongs to a bill of the same student
SELECT COUNT(*) FROM payments p
JOIN student_fees sf ON sf.student_fee_id = p.student_fee_id
WHERE p.student_id <> sf.student_id;                                                          -- expect 0
```

More analytical proofs (window functions, CTEs, recursive CTEs) live in `database/09_queries.sql`.
