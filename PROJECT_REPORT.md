# PROJECT REPORT

# University Higher Education ERP System

**A fully integrated, database-centric Enterprise Resource Planning system for a university**

| | |
|---|---|
| **Batch** | M7 BATCH |
| **Department** | Department of E&TCE |
| **Subject** | Database Management Systems (DBMS) — major project |
| **Type** | Full-stack, runnable application + complete DBMS artefacts |
| **Stack** | React 18 + TypeScript + Tailwind CSS · Node 20 + Express + TypeScript · MySQL 8 / MariaDB 10.6+ |
| **Scale of build** | 61 tables · 677 columns · 20 views · 17 stored procedures · 13 functions · 28 triggers · 138 foreign keys · ~50,000 lines of SQL · ~7,500 lines of backend TypeScript · ~9,800 lines of frontend TypeScript · 48 screens |

---

## Contents

| # | Section |
|---|---|
| 1 | [Introduction](#1-introduction) |
| 2 | [Problem statement](#2-problem-statement) |
| 3 | [Objectives](#3-objectives) |
| 4 | [Existing systems and their limitations](#4-existing-systems-and-their-limitations) |
| 5 | [The proposed system](#5-the-proposed-system) |
| 6 | [System requirements](#6-system-requirements) |
| 7 | [Technology stack and justification](#7-technology-stack-and-justification) |
| 8 | [System architecture](#8-system-architecture) |
| 9 | [Database design — ER model](#9-database-design--er-model) |
| 10 | [Relational schema and normalisation](#10-relational-schema-and-normalisation) |
| 11 | [Constraints and referential integrity](#11-constraints-and-referential-integrity) |
| 12 | [Stored procedures](#12-stored-procedures) |
| 13 | [Triggers](#13-triggers) |
| 14 | [User-defined functions](#14-user-defined-functions) |
| 15 | [Views](#15-views) |
| 16 | [Complex queries — joins, aggregation, subqueries, CTEs, window functions](#16-complex-queries--joins-aggregation-subqueries-ctes-window-functions) |
| 17 | [Indexing and performance](#17-indexing-and-performance) |
| 18 | [Transactions, concurrency and recovery](#18-transactions-concurrency-and-recovery) |
| 19 | [Security — authentication, RBAC, hardening](#19-security--authentication-rbac-hardening) |
| 20 | [Module 1 — Student & Admission](#20-module-1--student--admission) |
| 21 | [Module 2 — Academic & Course](#21-module-2--academic--course) |
| 22 | [Module 3 — Attendance](#22-module-3--attendance) |
| 23 | [Module 4 — Examination & Results](#23-module-4--examination--results) |
| 24 | [Module 5 — Fees & Finance](#24-module-5--fees--finance) |
| 25 | [Module 6 — Hostel](#25-module-6--hostel) |
| 26 | [Module 7 — Faculty, Leave & Payroll](#26-module-7--faculty-leave--payroll) |
| 27 | [AI features and the mock examination engine](#27-ai-features-and-the-mock-examination-engine) |
| 28 | [Notifications, audit trail and global search](#28-notifications-audit-trail-and-global-search) |
| 29 | [Reports and CSV export](#29-reports-and-csv-export) |
| 30 | [Frontend design and user experience](#30-frontend-design-and-user-experience) |
| 31 | [Testing and results](#31-testing-and-results) |
| 32 | [Installation, running the project, limitations and future scope](#32-installation-running-the-project-limitations-and-future-scope) |

---

## 1. Introduction

A university runs on data: who applied, who was admitted, who teaches what, who attended, who passed,
who paid, who sleeps in which bed, and who gets paid at the end of the month. In most colleges these
answers live in different places — an admission register, a department Excel sheet, an accounts package,
a hostel register and a payroll spreadsheet — and none of them agree with each other.

This project builds **one** integrated ERP for all of it. It is deliberately built the way a DBMS course
expects: the database is not a dumb store behind a CRUD app, it is the place where the university's rules
live — in constraints, stored procedures, triggers, functions and views — and the application is a
well-behaved client of that database.

Everything here runs. There is a seeded database with a realistic volume of rows (141 students, 24 faculty,
2,270 enrolments, 25,434 attendance records, 2,130 marks, 426 fee bills, 103 hostel allocations, 192
payslips), a REST API with JWT authentication and seven roles, and a React interface with 48 screens. No
screen is a mock-up: every button issues a request, and every request is authorised, validated and
audited.

---

## 2. Problem statement

> Design and implement a University Higher Education ERP System that integrates student admission,
> academics, attendance, examination, fees, hostel and faculty/payroll into a single consistent database,
> enforcing the institution's business rules **inside the DBMS**, and exposing them through a secure
> role-based web application.

The hard parts that make this a database project rather than a web project:

1. **Attendance must gate examinations.** A student below the required attendance (default 75 %) must not
   be able to register for an examination — from any client.
2. **Hostel capacity must never go stale.** Allocating or vacating a bed must immediately change what
   every other user sees as "available".
3. **Money must be auditable.** Every change to a fee record must leave a trail of who changed what, and
   no payment may exist without a receipt.
4. **Modules must not duplicate people.** One student row, one faculty row, one department list — reused
   everywhere.
5. **Rules must survive the UI.** If the UI is bypassed, the database must still say no.

---

## 3. Objectives

| # | Objective | How it is met |
|---|---|---|
| 1 | One integrated schema for seven modules | 61 tables with 138 foreign keys across all modules |
| 2 | Real relational design | 3NF/BCNF design, documented in §10, with ER diagrams (§9) |
| 3 | Business rules in the DBMS | 17 procedures, 28 triggers, 13 functions (§§12–14) |
| 4 | Complex analytics | 45 hand-written queries with CTEs and window functions (§16, `09_queries.sql`) |
| 5 | Secure multi-role access | JWT + 7 roles + row-level scoping (§19) |
| 6 | Working UI for every feature | 48 React screens, all wired to the API (§30) |
| 7 | Honest AI features | local rule engine with an optional OpenAI adapter, labelled in the UI (§27) |
| 8 | Complete DBMS documentation | ER diagrams, data dictionary, integration document, this report |
| 9 | Reproducible build | `database/01…09*.sql`, seed generator, docker-compose, test suites (§31–32) |
| 10 | No fake features | every button performs a real request; MongoDB is optional and off by default |

---

## 4. Existing systems and their limitations

| Typical existing setup | Limitation | What this project does instead |
|---|---|---|
| Admission register in Excel, student data re-entered by each department | duplicate, conflicting student records | `students` is one table, referenced by FK from every module |
| Attendance in paper registers, totalled at the end of the month | the <75 % rule is discovered too late, and not enforced | attendance is live; `%` is computed on demand and blocks registration |
| Standalone accounts software | finance does not know about academics; a defaulter sits an exam | dues are checked inside the registration procedure |
| Hostel register on paper | bed counts are wrong; two students get the same bed | triggers maintain capacity; a duplicate active bed is impossible |
| Payroll in a spreadsheet | leave and pay are unconnected | approved leave feeds LOP days in `sp_generate_monthly_payroll` |
| Departmental files with no audit | nobody knows who changed a mark or a fee | two-level audit: application log + row-level triggers |

---

## 5. The proposed system

Seven functional modules plus four cross-cutting services, all over one schema:

| Module | What it does |
|---|---|
| 1 · Student & Admission | online application, review, conversion to a student + login, addresses, guardians, documents, status history |
| 2 · Academic & Course | departments, programs, batches, sections, subjects, curriculum mapping, course offerings, bulk enrolment, timetable with clash detection, academic calendar |
| 3 · Attendance | class sessions, per-session marking (single and bulk), subject/semester/student reports, low-attendance warnings |
| 4 · Examination & Results | examinations, schedules, registration with eligibility gate, hall tickets, marks entry, result processing (SGPA/CGPA/backlogs), publishing, rankings |
| 5 · Fees & Finance | fee structures, bill generation, payments with receipts, late fees, scholarships, fines, refunds, defaulters, CSV export |
| 6 · Hostel | hostels, blocks, rooms, beds, applications, allocation, transfer, vacation, occupancy and vacancy |
| 7 · Faculty, Leave & Payroll | faculty records, subject allotment, leave application/approval, leave balances, monthly payroll generation, payslip workflow |
| Cross-cutting | AI assistant + study plans + at-risk scoring · mock exam engine · notifications · audit log · global search · reports & CSV |

**Design principle used throughout:** *a rule belongs in the database if breaking it would corrupt data.*
Capacity, eligibility, uniqueness, audit and money arithmetic are database rules. Pagination, formatting
and navigation are application concerns.

---

## 6. System requirements

**Hardware (minimum)**

| | |
|---|---|
| CPU | dual-core 2 GHz |
| RAM | 4 GB (8 GB recommended: MariaDB + API + Vite concurrently) |
| Disk | 2 GB free (database ≈ 60 MB, `node_modules` ≈ 400 MB) |

**Software**

| | Version used here |
|---|---|
| Operating system | Linux (Debian 13) — also runs on Windows/macOS |
| Database | MariaDB 11.8 (MySQL 8.0 compatible; all SQL is valid for both) |
| Runtime | Node.js 20.20 |
| Package manager | npm 10 |
| Browser | any evergreen browser (Chrome/Edge/Firefox/Safari) |
| Optional | Docker + Docker Compose, MongoDB (disabled by default) |

---

## 7. Technology stack and justification

| Layer | Choice | Why |
|---|---|---|
| Database | **MySQL 8 / MariaDB 10.6+** | the course target; mature stored procedures, triggers, CTEs and window functions; `DECIMAL` money; InnoDB transactions and row locks |
| DB access | **mysql2/promise** | prepared statements with placeholders, connection pooling, `DECIMAL` kept as string so money never loses precision |
| API | **Node 20 + Express + TypeScript (strict)** | one language across the stack; `strict` catches the null/undefined mistakes that SQL boundaries invite |
| Validation | **zod** | one schema per endpoint; request bodies are validated before a service ever runs |
| Auth | **jsonwebtoken + bcryptjs** | stateless access tokens, refresh token in an HttpOnly cookie, bcrypt password hashes |
| Security | **helmet, cors, express-rate-limit, compression, morgan** | standard hardening: security headers, controlled CORS, brute-force throttling, request logging |
| Frontend | **React 18 + TypeScript + Vite** | component model, fast HMR, type-safe API contracts |
| Styling | **Tailwind CSS** | consistent design system without shipping a CSS framework's opinions |
| Charts | **Recharts** | the dashboards, attendance trends and risk charts |
| Icons | **lucide-react** | offline SVG icons (no CDN — the app works in a sandbox/air-gapped preview) |
| Testing | **bash + python3 + SQL** | three suites: endpoint smoke, end-to-end workflow, database rule tests |
| Docs | generated Markdown + SVG | the data dictionary and ER diagrams are generated from the live schema, so they cannot drift |

**Not used, deliberately:** no ORM (the SQL is the point of the project), no CDN assets (the app must run
offline), no mocked endpoints, and MongoDB is present only as an optional event stream that no feature
depends on.

---

## 8. System architecture

```
 ┌────────────────────────── Presentation layer ──────────────────────────┐
 │ React 18 SPA · 48 screens · React Router · AuthContext · Toast system    │
 │ talks only to /api/v1 (relative URL) — no host names in client code      │
 └───────────────────────────────────┬─────────────────────────────────────┘
                                     │  JSON over HTTPS/HTTP (Vite proxy)
 ┌───────────────────────────────────▼─────────────────────────────────────┐
 │ API layer (Express)                                                     │
 │   middleware: helmet · cors · rate-limit · morgan · error handler       │
 │   routes   : authenticate → requireRole(...) → validate(zod) → ctrl     │
 │   services : business rules, row-level scoping, audit + notifications   │
 │   repos    : parameterised SQL only (no string-built predicates)        │
 └───────────────────────────────────┬─────────────────────────────────────┘
                                     │ mysql2 pool (10 connections)
 ┌───────────────────────────────────▼─────────────────────────────────────┐
 │ Database layer — `university_erp`                                       │
 │   base tables 61 · views 20 · procedures 17 · functions 13 · triggers 28 │
 │   rules: CHECK · FK (138) · UNIQUE · triggers · procedures · functions   │
 └─────────────────────────────────────────────────────────────────────────┘
```

**Request lifecycle** (e.g. `POST /api/v1/exams/registrations`)

1. `helmet` → `cors` → `rate-limit` → `morgan`
2. `authenticate` verifies the JWT and loads the user + role
3. `requireRole('ADMIN','EXAM_CELL','STUDENT')` authorises the route
4. `validate(zodSchema)` shapes the body (400 with field errors if not)
5. controller → service: applies row-level scoping, writes an audit entry
6. service → repository → **`CALL sp_register_student_for_exam(...)`**
7. inside the procedure: recompute attendance, check dues, insert or refuse; a `BEFORE INSERT` trigger
   repeats the check
8. response envelope `{ success, data, meta? }` or `{ success:false, message, code }`

---

## 9. Database design — ER model

Eight diagrams are generated from `scripts/generate_er_diagrams.py` into `docs/er/`:

| Diagram | Entities | Relationships |
|---|---|---|
| `er_global.svg` — the whole system | 35 | 46 |
| `er_module1_student_admission.svg` | 12 | 13 |
| `er_module2_academic_course.svg` | 12 | 14 |
| `er_module3_attendance.svg` | 8 | 9 |
| `er_module4_examination_results.svg` | 9 | 10 |
| `er_module5_fees_finance.svg` | 10 | 10 |
| `er_module6_hostel.svg` | 10 | 12 |
| `er_module7_faculty_leave_payroll.svg` | 11 | 12 |

See **[`docs/ER_DIAGRAMS.md`](docs/ER_DIAGRAMS.md)** for the pictures, the Mermaid source and the notation.

Key modelling decisions:

* **Strong entities** for real-world things: `students`, `faculty`, `subjects`, `rooms`, `exams`.
* **Weak/associative entities** for events between them: `enrollments` (student ↔ offering),
  `attendance` (student ↔ session), `exam_registrations` (student ↔ exam/offering),
  `room_allocations` (student ↔ bed), `payrolls` (faculty ↔ month).
* **`course_offerings` is the pivot** of the academic side — attendance sessions, exam registrations,
  timetable slots and enrolments all reference it, which is what makes "per subject, per semester,
  per section, per teacher" reporting possible without duplication.
* **`users` is the only authentication entity**; both `students` and `faculty` reference it, so a person
  has one login no matter how many modules they appear in.

---

## 10. Relational schema and normalisation

The schema is normalised to **3NF**, and the transactional tables are in **BCNF**.

| Normal form | How it is satisfied | Example |
|---|---|---|
| 1NF | every column is atomic; no repeating groups | addresses are rows in `addresses`, not `address1/address2` columns |
| 2NF | no partial dependency on a composite key | `enrollments(enrollment_id)` carries grades; nothing depends on only `(student_id)` |
| 3NF | no transitive dependency between non-key columns | a student row stores `department_id`, not `department_name` (that lives in `departments`) |
| BCNF | every determinant is a candidate key | `grades(grade_code)` determines `grade_points`; `grades` has its own table |

**Deliberate, documented denormalisation** — three counters exist for performance and are kept honest by
triggers (and reconciled after seeding):

| Denormalised column | Maintained by | Why it is safe |
|---|---|---|
| `course_offerings.enrolled_count` | `trg_enrollments_ai_count`, `trg_enrollments_ad_count` | needed to enforce capacity on every insert without counting 2,270 rows |
| `rooms.occupied_count`, `beds.status` | `trg_allocation_ai/au/ad`, `trg_beds_bu_guard` | vacancy must be a single-column lookup |
| `student_fees.paid_amount`, `due_amount` | `sp_process_fee_payment`, `trg_payment_ai/au` | every payment posts once, inside a transaction |

**Datatypes.** Money is `DECIMAL(12,2)`, percentages `DECIMAL(5,2)`, flags `TINYINT(1)`, identifiers
`INT UNSIGNED AUTO_INCREMENT`, enumerations `VARCHAR` with `CHECK` constraints, timestamps
`TIMESTAMP DEFAULT CURRENT_TIMESTAMP` with `ON UPDATE CURRENT_TIMESTAMP` where the row is mutable.

---

## 11. Constraints and referential integrity

`03_constraints.sql` adds, on top of the column definitions:

| Constraint type | Count / example | Purpose |
|---|---|---|
| PRIMARY KEY | every table | surrogate `<singular>_id` |
| FOREIGN KEY | **138**, with `ON DELETE RESTRICT/CASCADE` and `ON UPDATE CASCADE` | cross-module integrity; e.g. `exam_registrations.student_id → students.student_id` |
| UNIQUE | `users.email`, `students.roll_number`, `faculty.employee_code`, `payments.receipt_no`, `admissions.application_no`, `room_allocations.active_bed_year` (per student/year) | no duplicate identities or receipts |
| CHECK | statuses, marks ranges, `capacity > 0`, `end_date >= start_date`, money `>= 0`, grade percentage bands | illegal states are unrepresentable |
| NOT NULL + DEFAULT | every mandatory column and audit timestamp | no half-written rows |

Referential actions were chosen per relationship, not by default: master data is `RESTRICT` (you cannot
delete a department that has students), while dependent detail rows such as `marks` or
`payroll_components` are `CASCADE`.

---

## 12. Stored procedures

17 procedures in `05_procedures.sql`. The Node services call them; they do not re-implement them.

| Procedure | What it does | Called from |
|---|---|---|
| `sp_approve_admission` | creates the login, the student row, roll/registration numbers and the status history — all or nothing | `POST /students/admissions/:id/review` |
| `sp_bulk_enroll_students` | enrols a batch/section into every offering of a semester, honouring capacity | `POST /academics/enrollments/bulk` |
| `sp_mark_attendance_bulk` | writes one attendance row per student for a session in one transaction | `POST /attendance/sessions/:id/mark-bulk` |
| `sp_register_student_for_exam` | **the eligibility gate**: recomputes attendance, checks dues, registers or refuses with a reason, issues a hall-ticket number | `POST /exams/registrations` |
| `sp_enter_marks` | validates marks, derives percentage/grade/points | `POST /exams/marks` |
| `sp_process_semester_results` | computes SGPA, CGPA, credits, backlogs and result status for a semester | `POST /exams/results/process` |
| `sp_publish_exam_results` | publishes results and notifies every affected student | `POST /exams/results/publish/:id` |
| `sp_generate_semester_fees` | turns fee structures into student bills | `POST /fees/generate` |
| `sp_process_fee_payment` | posts a payment, allocates it, issues a receipt, updates the bill and its status | `POST /fees/payments` |
| `sp_apply_late_fees` | applies `fn_calculate_late_fee()` to every overdue bill | `POST /fees/apply-late-fees` |
| `sp_allocate_hostel_bed` | allocates a bed to an approved application (triggers update capacity) | `POST /hostel/allocations` |
| `sp_transfer_room` | moves a resident to another bed with an audit trail | `POST /hostel/allocations/:id/transfer` |
| `sp_vacate_hostel_bed` | vacates a bed and frees capacity | `POST /hostel/allocations/:id/vacate` |
| `sp_approve_leave` | approves/rejects a leave and consumes the balance only on approval | `POST /faculty/leaves/:id/review` |
| `sp_generate_monthly_payroll` | builds every payslip for a month: earnings, PF, tax, LOP, net | `POST /faculty/payroll/generate` |
| `sp_push_notification` | writes a notification (single user or role broadcast) | notification service |
| `sp_compute_student_risk` | recomputes risk scores from attendance, marks, dues and backlogs | `POST /ai/risk/recompute` |

Each procedure declares `DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;` so a failure
leaves no partial work, and each one returns an OUT message that the API surfaces to the user verbatim —
which is why the UI can say *"Registration refused: attendance 62.5 % is below the required 75 %"* without
containing that rule itself.

---

## 13. Triggers

28 triggers in `06_triggers.sql`, named `trg_<table>_<bi|bu|ai|au|ad>_<intent>`.

| Theme | Triggers | Guarantee |
|---|---|---|
| **Exam eligibility** | `trg_exam_reg_bi_eligibility` | no registration row can exist for a student who fails the attendance/dues gate (unless an exemption was granted) |
| **Hostel capacity** | `trg_allocation_bi_duplicate`, `trg_allocation_ai`, `trg_allocation_au`, `trg_allocation_ad`, `trg_beds_bu_guard`, `trg_rooms_bu_capacity` | one active bed per student per year; bed status and room occupancy always match reality; a bed cannot be occupied twice |
| **Fee audit** | `trg_student_fees_ai_audit`, `trg_student_fees_bu_audit`, `trg_payment_ai`, `trg_payment_au` | every fee/payment change writes an audit row with old and new values; `paid_amount`/`due_amount` stay consistent |
| **Marks integrity** | `trg_marks_bi_derive`, `trg_marks_bu_derive`, `trg_marks_au_audit` | percentage, grade and points are derived, not typed; every edit is audited |
| **Enrolment integrity** | `trg_enrollments_bi_guard`, `trg_enrollments_ai_count`, `trg_enrollments_ad_count` | no duplicates, no over-capacity, `enrolled_count` always exact |
| **Timetable** | `trg_timetable_bi_conflict` | a faculty member or room cannot be double-booked on the same day/time |
| **Validation** | `trg_students_bi_validate`, `trg_students_bu_validate`, `trg_students_au_status_history`, `trg_admissions_bi_validate`, `trg_faculty_bi_validate`, `trg_faculty_leaves_bi_guard`, `trg_faculty_leaves_bu_guard`, `trg_payrolls_bu_guard`, `trg_attendance_bi_guard` | data-quality rules (dates, ranges, statuses, no overlapping leave, no editing a paid payslip) and the student status history |

The file ends with a **post-seed reconciliation** block: because `04_seed.sql` is loaded before the
triggers exist, that block recomputes every denormalised counter from the source rows so the shipped
database is internally consistent from the first query (see §31).

---

## 14. User-defined functions

13 deterministic functions in `07_functions.sql`. They are reused inside procedures, triggers, views and
application queries, so a rule is never written twice.

| Function | Purpose | Used by |
|---|---|---|
| `fn_calculate_student_cgpa` | credit-weighted CGPA across completed semesters | `sp_process_semester_results`, result views, transcripts |
| `fn_calculate_sgpa` | SGPA for one semester | result processing |
| `fn_calculate_attendance_percentage` | attendance % of a student for an offering (or overall) | registration gate, reports, AI features |
| `fn_calculate_semester_attendance` | attendance % for a whole semester | semester reports |
| `fn_calculate_late_fee` | late fee from days overdue and the configured rate | `sp_apply_late_fees` |
| `fn_calculate_faculty_leave_balance` | remaining leave of a type in an academic year | leave screens, payroll summary view |
| `fn_calculate_net_salary` | net pay for a faculty member for a month | `sp_generate_monthly_payroll`, payroll screens |
| `fn_grade_code`, `fn_grade_points` | percentage → grade code / grade points | marks triggers, result processing |
| `fn_student_outstanding_dues` | total unpaid fees | the exam gate, defaulters report, risk scoring |
| `fn_student_backlog_count`, `fn_student_earned_credits` | backlog count and earned credits | results, transcripts, risk scoring |
| `fn_hostel_available_beds` | free beds right now | hostel dashboard, allocation screen |

---

## 15. Views

20 views in `08_views.sql`. They are the read models of the system: the API, the reports and the
dashboards all query views, so a six-table join is written once.

| Area | Views |
|---|---|
| Students | `v_student_full_profile`, `v_student_academic_summary` |
| Attendance | `v_student_attendance_summary`, `v_student_attendance_overall`, `v_monthly_attendance` |
| Academics | `v_department_performance`, `v_subject_failure_rate`, `v_faculty_workload` |
| Examinations | `v_exam_eligibility`, `v_exam_hall_ticket`, `v_exam_result_summary`, `v_student_rankings`, `v_student_result_history` |
| Finance | `v_student_fee_status`, `v_fee_collection_summary`, `v_daily_fee_collection` |
| Hostel | `v_hostel_occupancy`, `v_room_vacancy` |
| Faculty | `v_faculty_payroll_summary` |
| Analytics | `v_student_risk_dashboard` |

Two of them deserve special mention because they are the interface of a business rule:

* `v_exam_eligibility` — every student/offering pair with its attendance %, the required %, outstanding
  dues and the verdict. The UI's "Blocked by attendance" tab is a direct read of this view.
* `v_student_rankings` — uses `RANK()` / `DENSE_RANK()` over CGPA, which is why the toppers screen needs
  no application-side sorting.

---

## 16. Complex queries — joins, aggregation, subqueries, CTEs, window functions

`database/09_queries.sql` contains **45 annotated queries**, grouped by concept, all of which run against
the seeded database. Highlights:

| Concept | Query | What it answers |
|---|---|---|
| 6-table inner join | Q02 | who teaches what to whom, and how full the class is |
| LEFT JOIN with the predicate in `ON` | Q03 | residents vs day scholars (and why `WHERE` would break it) |
| SELF JOIN | Q04, Q40 | department → HOD; timetable clash detection |
| Anti-join (`LEFT JOIN … IS NULL`, `NOT EXISTS`) | Q05, Q06, Q42 | students not enrolled, subjects never offered, "ghost" students |
| `GROUP BY … HAVING` | Q09–Q15 | department strength, failing subjects, <75 % defaulters, hostel occupancy, duplicate students |
| Scalar / correlated / `IN` / derived-table subqueries | Q16–Q20 | above-average attendance, last payment, registered students, top defaulters, backlogs |
| Simple + multiple CTEs | Q21, Q22 | the at-risk list, department league table |
| **Recursive CTE** | Q23, Q24 | a gap-free 30-day collection calendar; a semester ladder per program |
| `ROW_NUMBER` | Q26, Q34 | latest session per offering; the "second highest marks" classic |
| `RANK` / `DENSE_RANK` | Q25, Q27, Q28 | institute toppers, top-3 per subject, percentile within department |
| `LAG` / `LEAD` | Q29, Q41 | month-on-month collection growth; per-student attendance trend |
| Running totals / moving average | Q30 | cumulative collection and a 7-day average with explicit window frames |
| `AVG() OVER (PARTITION BY …)` | Q31 | each mark compared with its subject average, detail rows preserved |
| `NTILE` | Q32 | attendance quartiles for mentoring groups |
| `FIRST_VALUE` / `LAST_VALUE` | Q33 | subject topper and lowest scorer without a self join |
| `GROUP BY … WITH ROLLUP` | Q43 | admission funnel with sub-totals and a grand total |
| Window + aggregate combined | Q38, Q39 | payroll YTD totals and month deltas; leave utilisation vs quota |
| End-to-end analytics | Q35, Q36, Q37, Q44, Q45 | exam eligibility verdicts, hostel vacancy board, fee ageing buckets, a 360° student snapshot, the dashboard KPI row |

Behind the application itself, the same constructs appear in the repositories — for example
`v_student_rankings` (window functions), the at-risk query (CTEs), and the defaulters report
(conditional aggregation with `HAVING`).

---

## 17. Indexing and performance

| Index | Why it exists |
|---|---|
| Primary keys (61) | clustered InnoDB access for every lookup by id |
| Every foreign key column (138) | InnoDB requires it, and joins/cascades need it |
| `students(roll_number)`, `faculty(employee_code)`, `payments(receipt_no)`, `admissions(application_no)` | UNIQUE business keys |
| `students(status, department_id, program_id, batch_id)` | the list screen's filter columns |
| `attendance(student_id, offering_id)`, `attendance(session_id)` | attendance % and per-session marking |
| `enrollments(offering_id)`, `exam_registrations(exam_id, student_id)`, `student_fees(student_id, status)` | the hot joins behind eligibility, bills and reports |
| `room_allocations(student_id, status)`, `beds(room_id, status)`, `rooms(hostel_id)` | vacancy and allocation lookups |
| `audit_logs(created_at)`, `notifications(user_id, is_read)` | time-ordered feeds |

Measured behaviour on the seeded data (25 k attendance rows, 2.3 k registrations): the dashboard, student
list (paginated), attendance reports and at-risk list all respond in tens of milliseconds because they read
views over indexed columns rather than computing in JavaScript. Pagination is enforced in SQL
(`LIMIT/OFFSET` with a `COUNT(*)` for `meta.total`), so no screen ever loads the whole table into the
browser.

---

## 18. Transactions, concurrency and recovery

* **Engine**: InnoDB everywhere — row-level locking, crash recovery, FK enforcement.
* **Isolation**: server default `REPEATABLE READ`; the critical sections additionally rely on the row locks
  taken by their own `INSERT`/`UPDATE` statements.
* **Atomic units**: every multi-statement operation is a stored procedure with
  `START TRANSACTION … COMMIT` and an exit handler that rolls back and re-signals (§12).
* **Contention**: two clerks allocating the last bed, or enrolling into the final seat, collide on the row
  lock; the loser is refused by the guard trigger rather than by application code racing ahead of it.
* **Consistency after seeding**: the reconciliation block at the end of `06_triggers.sql` recomputes every
  derived counter, so a fresh install starts consistent and stays consistent through triggers.
* **Backup/restore**: `docker-compose` mounts a volume for MySQL; `mysqldump` produces a complete logical
  backup including routines (`--routines --triggers --events`).

---

## 19. Security — authentication, RBAC, hardening

**Authentication**

| | |
|---|---|
| Login | `POST /auth/login` → bcrypt compare → JWT access token (8 h) + refresh token in an HttpOnly, SameSite cookie (7 d) |
| Refresh | `POST /auth/refresh` (cookie-based) issues a new access token; logout revokes the refresh token |
| Password change | `POST /auth/change-password` requires the current password and re-hashes with bcrypt |
| Password storage | bcrypt hashes only — created in `sp_approve_admission` and in the auth service |

**Authorisation — seven roles**

| Role | Reach |
|---|---|
| `ADMIN` | everything, including settings, audit, announcements |
| `STUDENT` | own profile, attendance, fees, results, hall ticket, hostel, mock tests, AI study plan |
| `FACULTY` | own offerings, sessions, marks, students of those offerings, own leaves and payslips |
| `ACCOUNTANT` | fee structures, bills, payments, scholarships, fines, refunds, exports |
| `HOSTEL_ADMIN` | hostels, rooms, beds, applications, allocations, transfers |
| `EXAM_CELL` | exams, schedules, registrations, eligibility, marks, results, publishing |
| `HR` | faculty records, leaves, leave balances, payroll |

Enforcement is layered: `requireRole(...)` on the route, then **row-level scoping inside the service**
(a STUDENT's `list()` is forced to `scoped.studentId = actor.studentId`), so tampering with an id in the
URL yields a 403 or an empty result — never somebody else's data.

**Hardening**

| Measure | Where |
|---|---|
| Parameterised SQL only (`?` placeholders); no interpolated user input | every repository |
| `helmet` security headers, controlled CORS, `express-rate-limit` on auth routes | `app.ts` |
| zod validation on every write | routes |
| No secrets in the client; `.env` on the server only | config |
| Audit trail (application + row-level triggers) | `audit_logs` + triggers |
| Error envelope never leaks stack traces | error middleware |
| Passwords never logged; `morgan` logs method, path, status and duration only | middleware |

---

## 20. Module 1 — Student & Admission

**Purpose.** Take a candidate from application to enrolled student, and keep the master data that every
other module depends on.

**Entities.** `admissions`, `students`, `addresses`, `guardians`, `student_documents`,
`student_status_history` (+ `users`, `categories`, `programs`, `batches`).

**Flow.** Public `POST /students/admissions/apply` → row in `admissions` → admin review →
`sp_approve_admission` creates the login and the student in one transaction → programme/batch/section
assigned → bills can now be generated (module 5) and a hostel bed requested (module 6).

**Database logic.** `sp_approve_admission`; `trg_students_bi_validate`, `trg_students_bu_validate`
(data quality), `trg_students_au_status_history` (every status change is recorded);
`v_student_full_profile`.

**UI.** `StudentsPage` (filtered, paginated, sortable list), `StudentDetailPage` (profile, addresses,
guardians, documents, fees, attendance, academics — one student, six modules), `AdmissionsPage`
(review → approve/reject), `AdmissionApplyPage` (public form).

**Integration points.** academics (programme/batch), finance (bills), hostel (applications), attendance
and exams (enrolments and registrations), auth (the login row).

---

## 21. Module 2 — Academic & Course

**Purpose.** Model the curriculum and who teaches it, and schedule it without clashes.

**Entities.** `departments`, `programs`, `batches`, `sections`, `subjects`, `program_subjects`,
`course_offerings`, `enrollments`, `faculty_subjects`, `timetable`, `academic_calendar`,
`academic_years`, `semesters`.

**Database logic.** `sp_bulk_enroll_students`; `trg_enrollments_bi_guard` (duplicate/over-capacity),
`trg_enrollments_ai_count` / `trg_enrollments_ad_count` (counter), `trg_timetable_bi_conflict`
(faculty and room double-booking).

**UI.** `AcademicsMastersPage` (departments, programs, batches, sections, years, semesters),
`SubjectsPage`, `OfferingsPage`, `TimetablePage` (weekly grid + `GET /academics/timetable/conflicts`),
`CalendarPage`.

**Integration points.** faculty (teacher of an offering), attendance (sessions), exams (registrations),
students (enrolments), fees (fee structure per program + semester).

---

## 22. Module 3 — Attendance

**Purpose.** Record who was present in every session, and make the percentage available to the modules
that depend on it.

**Entities.** `class_sessions`, `attendance`.

**Database logic.** `sp_mark_attendance_bulk`; `fn_calculate_attendance_percentage`,
`fn_calculate_semester_attendance`; `trg_attendance_bi_guard`; views
`v_student_attendance_summary`, `v_student_attendance_overall`, `v_monthly_attendance`.

**UI.** `AttendanceSessionsPage` (create sessions), `AttendanceMarkPage` (roster with bulk actions),
`AttendanceReportsPage` (per offering, low-attendance list, statistics), `MyAttendancePage` (student view
with subject-wise and monthly breakdown).

**Integration points.** **exams** — the attendance percentage is recomputed inside
`sp_register_student_for_exam`; **notifications** — `POST /attendance/warn-low` pushes warnings to
defaulters; **academics** — sessions belong to an offering.

---

## 23. Module 4 — Examination & Results

**Purpose.** Run examinations, decide who may sit them, record marks and publish results with ranks.

**Entities.** `exams`, `exam_schedules`, `exam_registrations`, `marks`, `results`, `grades`.

**The gate.** `sp_register_student_for_exam` recomputes the student's attendance for the offering, reads
`fn_student_outstanding_dues()`, and either registers the student (issuing a hall-ticket number) or
returns `REJECTED` with a human-readable reason. `trg_exam_reg_bi_eligibility` repeats the check before
insert so that a direct `INSERT` cannot sneak past.

**Marks → results.** `sp_enter_marks` (with `trg_marks_bi_derive` / `trg_marks_bu_derive` deriving
percentage, grade and points, and `trg_marks_au_audit` auditing edits) →
`sp_process_semester_results` (SGPA via `fn_calculate_sgpa`, CGPA via `fn_calculate_student_cgpa`,
credits, backlogs) → `sp_publish_exam_results` (flip the flag and notify students).

**UI.** `ExamsPage` (examinations + schedule + announcements), `ExamRegistrationsPage` (register form,
"Blocked by attendance" tab fed by `v_exam_eligibility`, full register), `MarksPage`, `ResultsPage`
(department performance, subject failure rates, toppers from `v_student_rankings`), `HallTicketPage`.

**Integration points.** attendance and finance (both gates), academics (offerings/schedules),
notifications (hall tickets, results), students (marksheets).

---

## 24. Module 5 — Fees & Finance

**Purpose.** Bill students correctly, take payments with receipts, chase defaulters, and keep an auditable
money trail.

**Entities.** `fee_structures`, `student_fees`, `payments`, `scholarships`, `student_scholarships`,
`fines`, `refunds`, `transactions`.

**Database logic.** `sp_generate_semester_fees` (bills from structures), `sp_process_fee_payment`
(payment + receipt + bill status, atomically), `sp_apply_late_fees` (uses `fn_calculate_late_fee`),
`fn_student_outstanding_dues`; audit triggers `trg_student_fees_ai_audit`, `trg_student_fees_bu_audit`,
`trg_payment_ai`, `trg_payment_au`; views `v_student_fee_status`, `v_fee_collection_summary`,
`v_daily_fee_collection`.

**UI.** `FeeStructuresPage`, `BillsPage` (bills + ledger + late fee), `PaymentsPage` (record payment,
receipt, refund, daily/monthly collection), `DefaultersPage` (ageing, warnings), `ScholarshipsPage`
(schemes + award), `MyFeesPage` (student: bills, payments, receipts).

**Integration points.** academics (structures per program/semester), students (bills), **exams**
(pending dues block registration), hostel (rent is billed on the same student), notifications (receipts).

---

## 25. Module 6 — Hostel

**Purpose.** Manage hostel inventory and residents, with capacity that is always correct.

**Entities.** `hostels`, `hostel_blocks`, `rooms`, `beds`, `hostel_applications`, `room_allocations`,
`room_transfers`, `hostel_fees`.

**Database logic.** `sp_allocate_hostel_bed`, `sp_transfer_room`, `sp_vacate_hostel_bed`,
`fn_hostel_available_beds`; triggers `trg_allocation_bi_duplicate` (one active bed per year),
`trg_allocation_ai` / `trg_allocation_au` / `trg_allocation_ad` (bed status + occupancy counters),
`trg_beds_bu_guard`, `trg_rooms_bu_capacity`; views `v_room_vacancy`, `v_hostel_occupancy`.

**UI.** `HostelDashboardPage` (occupancy and stats), `HostelRoomsPage` (rooms + beds + create room,
which also creates its beds), `HostelApplicationsPage` (review → allocate to a specific bed),
`HostelAllocationsPage` (transfer, vacate), `MyHostelPage` (student's room, rent and history).

**Integration points.** students (only a student can apply), faculty (the warden is a faculty row),
finance (rent bills).

---

## 26. Module 7 — Faculty, Leave & Payroll

**Purpose.** Maintain faculty records, run the leave cycle, and pay people correctly.

**Entities.** `designations`, `faculty`, `faculty_subjects`, `faculty_leaves`, `leave_balances`,
`payrolls`, `payroll_components`.

**Database logic.** `sp_approve_leave` (approve/reject, consumes the balance only on approval),
`sp_generate_monthly_payroll` (earnings, PF, professional tax, LOP from approved unpaid leave, net via
`fn_calculate_net_salary`, plus component rows); `fn_calculate_faculty_leave_balance`;
guards `trg_faculty_bi_validate`, `trg_faculty_leaves_bi_guard`, `trg_faculty_leaves_bu_guard`,
`trg_payrolls_bu_guard`; views `v_faculty_workload`, `v_faculty_payroll_summary`.

**UI.** `FacultyPage` (list, filters, create), `FacultyDetailPage` (profile, subjects, workload, leaves,
payslips), `LeavesPage` (apply, review, tabs by status), `LeaveBalancesPage` (quota vs used, export),
`PayrollPage` (payslips, monthly totals, YTD summary, run payroll, advance status, print a slip).

**Integration points.** academics (offerings, timetable, subject allotment), attendance (sessions taken),
hostel (warden), exams (invigilation), auth (login).

---

## 27. AI features and the mock examination engine

**Honesty first.** The AI layer is isolated in `services/ai.service.ts` and has two back-ends:

```
if (OPENAI_API_KEY is set)  → LLM adapter (OpenAI chat completion)
on error, or when no key    → local rule-based engine
```

Every response carries `source: 'LLM' | 'LOCAL_ENGINE'`, and **the UI prints that badge on every answer**,
so the system never pretends to be something it is not. This build runs with no key, so everything shown
comes from the local engine — deterministic rules over the same views the rest of the application uses.

| Feature | Endpoint | What it really does |
|---|---|---|
| AI assistant | `POST /ai/chat` | answers questions about the caller's attendance, fees, results and timetable by querying the database, then phrasing the answer; stores the conversation in `ai_conversations` |
| Study plan | `GET /ai/study-plan` | ranks areas (attendance, weak subjects, backlogs, dues) into HIGH/MEDIUM/LOW actions with a metric and a validity date; persisted in `study_plans` |
| At-risk list | `GET /ai/at-risk`, `POST /ai/risk/recompute` | `sp_compute_student_risk` scores every student from attendance %, average marks, CGPA, backlogs and pending dues into LOW/MEDIUM/HIGH/CRITICAL |
| Engine info | `GET /ai/engine` | reports which back-end is active (used by the banner in the UI) |

**Mock examination engine** (`/mock-exams/*`): a question bank (`mcq_questions`, 180 seeded questions with
difficulty, topic and explanation), timed attempts (`mock_exams`, `mock_exam_answers`), instant
auto-grading, a review screen with explanations, per-student statistics and a leaderboard built with
window functions. This is a genuine feature of the database schema, not a demo widget.

No AI output is ever written back into academic or financial tables: the AI is read-only advice.

---

## 28. Notifications, audit trail and global search

**Notifications.** `sp_push_notification` writes a row for a user or broadcasts to a role. Producers:
result publishing, hall-ticket issue, payment receipts, low-attendance warnings, leave decisions, payroll
runs and the admin announcement screen. The UI shows an unread badge and a paginated inbox with
mark-read / mark-all / announce.

**Audit.** Two complementary levels, both populated:

| Level | Source | Covers |
|---|---|---|
| Application | every service that mutates data | who did what, to which entity, from which IP, with old and new values |
| Row-level | `trg_marks_au_audit`, `trg_student_fees_ai_audit`, `trg_student_fees_bu_audit`, `trg_payment_ai`, `trg_payment_au` | any change to marks, bills or payments — even from a `mysql>` prompt |

`AuditPage` (admin) renders both with filters (action, entity, user, date), statistics, and CSV export.

**Global search.** `GET /search` searches students, faculty, subjects, bills, applications and
examinations in one request and returns typed hits with a deep link, so the header search box reaches
every module.

---

## 29. Reports and CSV export

`GET /reports` lists **12 reports**; `GET /reports/:key` runs one and answers
`{ key, title, columns[], rows[], generatedAt }`; `GET /reports/:key/csv` streams the same query as a
downloadable file.

| Report | Modules joined |
|---|---|
| `attendance_summary`, `attendance_defaulters` | attendance + students + academics |
| `semester_result`, `subject_failure`, `toppers`, `backlog_students` | exams + academics + students |
| `department_performance` | results + students + departments |
| `fee_collection`, `fee_defaulters`, `daily_collection`, `payment_register` | finance + students + programs |
| `hostel_occupancy` | hostel |
| `audit_trail` | audit + users |

`ReportsPage` offers an in-page CSV of the rows on screen and a full server-side export, plus KPI cards
from `GET /reports/kpis`. Reports are read-only `SELECT`s, so they can never corrupt data.

---

## 30. Frontend design and user experience

48 screens, each a real client of the API. Shared building blocks keep the interface consistent:
`DataTable` (sortable, paginated, CSV-aware), `StatCard`, `Tabs`, `Modal`, `Field`/`SelectField`,
`SearchInput` (debounced), `Pagination`, `ProgressBar`, `StatusBadge`, `EmptyState`, `ErrorBox`,
`useFetch`, and a toast system for success/error feedback.

| Area | Screens |
|---|---|
| Dashboard & shell | `DashboardPage` (role-aware KPIs, charts, activity), `ProfilePage`, `LoginPage`, `NotFoundPage` |
| Students | `StudentsPage`, `StudentDetailPage`, `AdmissionsPage`, `AdmissionApplyPage` |
| Academics | `AcademicsMastersPage`, `SubjectsPage`, `OfferingsPage`, `TimetablePage`, `CalendarPage` |
| Attendance | `AttendanceSessionsPage`, `AttendanceMarkPage`, `AttendanceReportsPage`, `MyAttendancePage` |
| Examinations | `ExamsPage`, `ExamRegistrationsPage`, `MarksPage`, `ResultsPage`, `HallTicketPage` |
| Fees | `FeeStructuresPage`, `BillsPage`, `PaymentsPage`, `DefaultersPage`, `ScholarshipsPage`, `MyFeesPage` |
| Hostel | `HostelDashboardPage`, `HostelRoomsPage`, `HostelApplicationsPage`, `HostelAllocationsPage`, `MyHostelPage` |
| Faculty | `FacultyPage`, `FacultyDetailPage`, `LeavesPage`, `LeaveBalancesPage`, `PayrollPage` |
| AI & mock tests | `AiChatPage`, `StudyPlanPage`, `AtRiskPage`, `MockExamsPage`, `MockAttemptPage` |
| System | `ReportsPage`, `NotificationsPage`, `AuditPage`, `SettingsPage` |

Rules the interface follows:

* **No hardcoded numbers.** Every figure on every screen comes from an endpoint.
* **Role-aware navigation.** Menu items are filtered by `has('ROLE')`, and the server re-checks anyway.
* **Optimistic but honest.** Actions refresh their own list; failures show the server's message verbatim
  (e.g. the refusal text from `sp_register_student_for_exam`).
* **Works offline in a sandbox.** No CDN fonts, scripts or images — only inline styles, SVG icons and
  data URIs; the browser talks to the API through a relative `/api` path.

---

## 31. Testing and results

Three suites, all green against the seeded database.

| Suite | Command | Result |
|---|---|---|
| Database rule tests | `mysql … < tests/db/test_rules.sql` | **68 passed, 0 failed** |
| API smoke (every endpoint, every role) | `bash tests/api/smoke.sh` | **158 passed, 0 failed** |
| End-to-end workflow | `python3 tests/api/workflow.py` | **40 passed, 0 failed** |

What the suites actually verify (not just "the endpoint answered"):

* the attendance gate refuses a student below the threshold — through the API **and** through a direct
  `INSERT` that the trigger rejects;
* the dues gate refuses a student with unpaid bills;
* a bed cannot be allocated twice in the same academic year; allocating and vacating change
  `rooms.occupied_count` and `beds.status` correctly;
* a payment produces a receipt, updates the bill, and appears in `audit_logs`;
* marks entry derives grade and points; result processing produces SGPA/CGPA/backlogs;
* payroll generation creates payslips for every active faculty member, and a paid payslip cannot be
  reopened;
* the leave balance decreases on approval and not on rejection;
* role-based access: a student receives 403 on admin, HR, finance and hostel endpoints;
* the denormalised counters agree with their source rows (the reconciliation checks in §14 of
  `MODULE_INTEGRATION.md` all return 0).

---

## 32. Installation, running the project, limitations and future scope

### 32.1 Run it locally (≈ 5 minutes)

```bash
# 1. database — create it and load the schema, seed and logic in order
mysql -u root -p -e "CREATE DATABASE university_erp CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
mysql -u root -p university_erp < database/01_schema.sql
mysql -u root -p university_erp < database/02_tables.sql
mysql -u root -p university_erp < database/03_constraints.sql
mysql -u root -p university_erp < database/04_seed.sql
mysql -u root -p university_erp < database/05_procedures.sql
mysql -u root -p university_erp < database/06_triggers.sql     # ends with reconciliation
mysql -u root -p university_erp < database/07_functions.sql
mysql -u root -p university_erp < database/08_views.sql

# 2. backend
cd backend && cp .env.example .env && npm install && npm run dev      # http://localhost:8080/api/v1

# 3. frontend (a second terminal)
cd frontend && npm install && npm run dev                             # http://localhost:5173

# 4. optional — everything in containers
docker compose up -d
```

Or, on a machine with the database already created: `bash scripts/reset-db.sh` reloads and reseeds
everything in one step.

### 32.2 Demo logins

| Role | Email | Password |
|---|---|---|
| Admin | `admin@vpit.edu.in` | `Admin@123` |
| Faculty | `pallavi.gite@vpit.edu.in` | `Faculty@123` |
| Student | `2024ETC1001@vpit.edu.in` | `Student@123` |
| Accountant | `accountant@vpit.edu.in` | `Account@123` |
| Hostel admin | `hostel.admin@vpit.edu.in` | `Hostel@123` |
| Exam cell | `examcell@vpit.edu.in` | `Exam@123` |
| HR | `hr@vpit.edu.in` | `Hr@123` |

(Change these before any real deployment — they are seeded demo credentials.)

### 32.3 Repository map

```
university-erp/
├── database/          01_schema · 02_tables · 03_constraints · 04_seed ·
│                      05_procedures · 06_triggers · 07_functions · 08_views · 09_queries
├── backend/src/       config · middleware · routes · services · repositories · utils
├── frontend/src/      pages (48) · components · lib · AuthContext
├── docs/              ER_DIAGRAMS.md · DATA_DICTIONARY.md · MODULE_INTEGRATION.md · er/*.svg
├── scripts/           seed generator, ER-diagram generator, data-dictionary generator, reset-db
├── tests/             db/test_rules.sql · api/smoke.sh · api/workflow.py
└── docker-compose.yml
```

### 32.4 Limitations

| Limitation | Reason / mitigation |
|---|---|
| Seeded demo passwords | deliberately simple for viva/demo; bcrypt-hashed and to be rotated in production |
| AI runs on the local engine here | no `OPENAI_API_KEY` in this environment; set one and the same UI calls a real LLM, with the `source` badge showing `LLM` |
| MongoDB is off by default | it is optional telemetry; no feature depends on it |
| Single-institution model | one university, one schema; multi-tenancy would add a `campus_id` discriminator |
| Email/SMS not sent | notifications are in-app rows; an SMTP/SMS adapter would sit behind the same service |

### 32.5 Future scope

1. Parent/guardian portal with read-only access to attendance, fees and results.
2. Online proctored examinations with question shuffling (the mock-exam engine is the groundwork).
3. Biometric/RFID attendance ingestion through the existing `sp_mark_attendance_bulk` contract.
4. Placement and alumni module reusing the same `students` master.
5. Document verification workflow with file storage for `student_documents`.
6. Scheduled jobs (event scheduler) for late fees, low-attendance warnings and payroll.
7. Read replicas / materialised summary tables if the row counts grow by two orders of magnitude.
8. Multi-campus tenancy and a proper SSO integration (SAML/OIDC).

---

## Conclusion

The system is one integrated ERP, not seven applications sharing a login. Its rules live where a DBMS
course says they should live: in CHECK constraints, foreign keys, stored procedures, triggers, functions
and views. The application is a careful client of that database — it authenticates, authorises, validates,
scopes and audits, but it never re-implements a rule the database already enforces, and it never pretends
to enforce one that the database could bypass.

Every screen, procedure and rule described in this report exists in the repository and can be run, read
and tested today.

---

*Artefacts referenced by this report:*
[`docs/ER_DIAGRAMS.md`](docs/ER_DIAGRAMS.md) · [`docs/DATA_DICTIONARY.md`](docs/DATA_DICTIONARY.md) ·
[`docs/MODULE_INTEGRATION.md`](docs/MODULE_INTEGRATION.md) · [`database/09_queries.sql`](database/09_queries.sql) ·
[`README.md`](README.md)
