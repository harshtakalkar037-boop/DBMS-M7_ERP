# University Higher Education ERP System

A complete, runnable, database-centric ERP for a university — seven integrated modules, a real React +
TypeScript frontend, a real Node/Express/TypeScript API, and a MySQL/MariaDB database where the business
rules actually live (stored procedures, triggers, functions, views and constraints).

**M7 BATCH · Department of E&TCE · DBMS major project**

---

## Table of contents

1. [What this is](#what-this-is)
2. [Feature tour](#feature-tour)
3. [Architecture](#architecture)
4. [DBMS artefacts](#dbms-artefacts)
5. [Quick start (local)](#quick-start-local)
6. [Quick start (Docker)](#quick-start-docker)
7. [Demo logins](#demo-logins)
8. [API overview](#api-overview)
9. [Testing](#testing)
10. [Documentation index](#documentation-index)
11. [Project structure](#project-structure)
12. [Design decisions worth defending in a viva](#design-decisions-worth-defending-in-a-viva)
13. [Troubleshooting](#troubleshooting)

---

## What this is

| | |
|---|---|
| **Frontend** | React 18 + TypeScript + Tailwind CSS + Vite — 48 screens, all wired to the API |
| **Backend** | Node 20 + Express + TypeScript (strict) — JWT auth, 7 roles, zod validation, mysql2 pool |
| **Database** | MySQL 8 / MariaDB 10.6+ — 61 tables, 677 columns, 20 views, 17 procedures, 13 functions, 28 triggers, 138 foreign keys |
| **Seed data** | 141 students, 24 faculty, 56 subjects, 2,270 enrolments, 3,706 sessions, 25,434 attendance rows, 2,130 marks, 426 fee bills, 103 hostel allocations, 192 payslips |
| **Tests** | 68 database rule tests + 158 API smoke checks + 40 end-to-end workflow checks — all passing |

Nothing here is a mock-up. Every button performs a request; every request is authenticated, authorised,
validated and audited; and the rules that matter are enforced by the database, so they hold for `curl`,
for a `mysql>` prompt, and for the UI alike.

---

## Feature tour

### The seven modules

| # | Module | Highlights |
|---|---|---|
| 1 | **Student & Admission** | public application form, review/approval that creates the student **and** the login in one transaction, addresses, guardians, documents, status history |
| 2 | **Academic & Course** | departments, programs, batches, sections, subjects, curriculum mapping, course offerings, **bulk enrolment** with capacity checks, weekly timetable with **clash detection**, academic calendar |
| 3 | **Attendance** | class sessions, per-student and bulk marking, subject/semester/student reports, low-attendance warnings — and the **<75 % rule** that gates examinations |
| 4 | **Examination & Results** | examinations, schedules, **eligibility-gated registration**, hall tickets, marks entry, result processing (SGPA/CGPA/backlogs), publishing, rankings via window functions |
| 5 | **Fees & Finance** | fee structures, bill generation, **payments with receipts**, late fees, scholarships, fines, refunds, defaulters with ageing, CSV export |
| 6 | **Hostel** | hostels → blocks → rooms → beds, applications, allocation, transfer, vacation, live occupancy — capacity maintained **by triggers** |
| 7 | **Faculty, Leave & Payroll** | faculty records, subject allotment, leave application/approval with balances, **monthly payroll generation**, payslip workflow (DRAFT → GENERATED → APPROVED → PAID), printable slips |

### Cross-cutting services

* **AI assistant** — answers questions about your attendance, fees, results and timetable. Runs on a local
  rule engine, or on OpenAI **if** `OPENAI_API_KEY` is set. Every answer is labelled with its source
  (`LOCAL_ENGINE` / `LLM`), so it never pretends to be something it is not.
* **Study plans & at-risk scoring** — `sp_compute_student_risk` scores every student from attendance,
  marks, CGPA, backlogs and dues; the study planner turns that into ranked actions.
* **Mock examination engine** — 180-question bank, timed attempts, instant grading, review with
  explanations, statistics and a leaderboard.
* **Notifications, audit log, global search** — in-app notifications, a two-level audit trail
  (application + row-level triggers), and one search box across all modules.
* **Reports & CSV** — 12 reports with filters, KPI cards, in-page CSV and full server-side export.

---

## Architecture

```
Browser (React SPA) ──► Vite dev server (proxy /api) ──► Express API ──► MySQL / MariaDB
                                                            │
                                              middleware: helmet · cors · rate-limit · morgan
                                              routes: authenticate → requireRole → validate(zod)
                                              services: rules, row-level scoping, audit
                                              repositories: parameterised SQL only
```

**Rules of the road**

* The browser only ever calls the relative path `/api/v1/…` — no host names in client code.
* Every value reaches SQL as a `?` placeholder; SQL injection is structurally impossible.
* Business rules live in stored routines (or services) — **never** in React. The UI hides what you cannot
  use; the database is what says no.
* Read models are views (`v_*`), so the same six-table join is written once and reused by the API, the
  reports and the dashboards.

---

## DBMS artefacts

| File | Contents |
|---|---|
| `database/01_schema.sql` | database, character set, helper setup |
| `database/02_tables.sql` | 61 base tables with datatypes, defaults, CHECKs |
| `database/03_constraints.sql` | 138 foreign keys, unique keys, extra CHECKs |
| `database/04_seed.sql` | realistic seed data (generated by `scripts/generate_seed.py`) |
| `database/05_procedures.sql` | 17 stored procedures |
| `database/06_triggers.sql` | 28 triggers + post-seed reconciliation of derived counters |
| `database/07_functions.sql` | 13 user-defined functions |
| `database/08_views.sql` | 20 views |
| `database/09_queries.sql` | 45 annotated analytical queries (joins, HAVING, subqueries, CTEs, recursive CTEs, window functions) |

**The rules that make this a DBMS project**

| Rule | Enforced by |
|---|---|
| Attendance below the bar blocks exam registration | `sp_register_student_for_exam` **and** `trg_exam_reg_bi_eligibility` |
| Pending fees block exam registration | the same procedure, via `fn_student_outstanding_dues` |
| Bed capacity is never stale | `trg_allocation_ai/au/ad`, `trg_beds_bu_guard`, `trg_rooms_bu_capacity` |
| One active bed per student per year | `trg_allocation_bi_duplicate` |
| Every fee/payment/marks change is audited | `trg_student_fees_ai_audit`, `trg_student_fees_bu_audit`, `trg_payment_ai`, `trg_payment_au`, `trg_marks_au_audit` |
| No timetable clashes | `trg_timetable_bi_conflict` (+ `GET /academics/timetable/conflicts`) |
| No over-capacity or duplicate enrolment | `trg_enrollments_bi_guard` (+ count triggers) |
| Leave cannot overlap; a paid payslip cannot be reopened | `trg_faculty_leaves_bi_guard`, `trg_payrolls_bu_guard` |

---

## Quick start (local)

**Prerequisites:** Node 20+, MySQL 8 or MariaDB 10.6+, Python 3 (only for the generators), Git.

```bash
git clone <this-repo> university-erp && cd university-erp
```

**1 · Database**

```bash
mysql -u root -p -e "CREATE DATABASE university_erp CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
for f in database/0[1-8]*.sql; do echo "-- $f"; mysql -u root -p university_erp < "$f"; done
```

(On a machine where the database already exists, `bash scripts/reset-db.sh` does all of this in one go.)

**2 · Backend**

```bash
cd backend
cp .env.example .env        # then edit DB_USER / DB_PASSWORD if needed
npm install
npm run dev                 # http://localhost:8080/api/v1/health
```

**3 · Frontend** (second terminal)

```bash
cd frontend
npm install
npm run dev                 # http://localhost:5173
```

Open <http://localhost:5173> and log in with one of the accounts below.

> The Vite dev server proxies `/api` to `http://127.0.0.1:8080`. If the API runs elsewhere, set
> `VITE_API_TARGET` (e.g. `VITE_API_TARGET=http://api:8080 npm run dev`).

---

## Quick start (Docker)

```bash
cp .env.example .env 2>/dev/null || true      # optional: tune secrets/ports
docker compose up -d --build
docker compose logs -f api
```

* Web: <http://localhost:5173>
* API: <http://localhost:8080/api/v1/health>
* DB: `localhost:3306` (user `erp_user`, password `erp_pass_2026`, database `university_erp`)

The database container loads `database/01…08*.sql` automatically on first boot, in filename order.
Add `--profile mongo` to also start the optional (unused-by-default) MongoDB event store.
`docker compose down -v` removes the volumes and therefore the data.

---

## Demo logins

The password is the same for every account of a role:

| Role | Email | Password |
|---|---|---|
| ADMIN | `admin@vpit.edu.in` | `Admin@123` |
| FACULTY | `pallavi.gite@vpit.edu.in` | `Faculty@123` |
| STUDENT | `2024ETC1001@vpit.edu.in` | `Student@123` |
| ACCOUNTANT | `accountant@vpit.edu.in` | `Account@123` |
| HOSTEL_ADMIN | `hostel.admin@vpit.edu.in` | `Hostel@123` |
| EXAM_CELL | `examcell@vpit.edu.in` | `Exam@123` |
| HR | `hr@vpit.edu.in` | `Hr@123` |

See [`docs/DEMO_CREDENTIALS.md`](docs/DEMO_CREDENTIALS.md) for more accounts and what each role can see.
**These are seeded demo credentials — rotate them before any real deployment.**

---

## API overview

Base path: `/api/v1`. Responses use one envelope:

```jsonc
// success
{ "success": true, "data": { }, "meta": { "page": 1, "limit": 25, "total": 141, "totalPages": 6 } }
// failure
{ "success": false, "message": "Attendance 62.50% is below the required 75%", "code": "VALIDATION_ERROR" }
```

| Group | Examples |
|---|---|
| `/auth` | `POST /login`, `POST /refresh`, `POST /logout`, `GET /me`, `POST /change-password` |
| `/students` | `GET /students` (filters + pagination), `GET /students/:id`, `POST /students`, `PATCH /students/:id/status`, `POST /admissions/apply` (public), `POST /admissions/:id/review` |
| `/academics` | departments · programs · batches · sections · subjects · offerings · enrolments (`POST /enrollments/bulk`) · timetable (`GET /timetable/conflicts`) · calendar |
| `/attendance` | `POST /sessions`, `POST /sessions/:id/mark`, `POST /sessions/:id/mark-bulk`, `GET /report/low`, `GET /me/overall`, `POST /warn-low` |
| `/exams` | exams · schedules · registrations (`POST /registrations`, `GET /registrations/eligibility`) · marks · results (`POST /results/process`, `POST /results/publish/:id`) · `GET /hall-ticket/me` |
| `/fees` | structures · bills · `POST /generate` · `POST /apply-late-fees` · `POST /payments` · `POST /payments/refund` · scholarships · fines · `GET /export/:kind` |
| `/hostel` | hostels · rooms · beds · applications · allocations (`POST /allocations`, `/transfer`, `/vacate`) · `GET /occupancy` |
| `/faculty` | faculty · workload · leaves (`POST /leaves`, `POST /leaves/:id/review`) · payroll (`POST /payroll/generate`, `PATCH /payroll/:id/status`) |
| `/ai` | `POST /chat`, `GET /study-plan`, `GET /at-risk`, `POST /risk/recompute`, `GET /engine` |
| `/mock-exams` | `POST /attempts`, `POST /attempts/:id/answer`, `POST /attempts/:id/submit`, `GET /attempts/:id/review`, `GET /attempts/leaderboard` |
| `/reports`, `/notifications`, `/audit`, `/settings`, `/search`, `/dashboard` | read-only reporting and system endpoints |

---

## Testing

```bash
# database rules (attendance gate, bed capacity, audit, arithmetic …)
mysql -u root -p university_erp < tests/db/test_rules.sql | tail -20

# every endpoint × every role (status codes + authorisation)
bash tests/api/smoke.sh | tail -20

# end-to-end workflow (admission → fees → attendance → exam → marks → results …)
python3 tests/api/workflow.py | tail -20
```

Current results: **68 / 68**, **158 / 158**, **40 / 40** — all passing.

---

## Documentation index

| Document | What is inside |
|---|---|
| [`PROJECT_REPORT.md`](PROJECT_REPORT.md) | the 32-section project report |
| [`docs/ER_DIAGRAMS.md`](docs/ER_DIAGRAMS.md) | global ER diagram + one per module (SVG **and** Mermaid source) |
| [`docs/DATA_DICTIONARY.md`](docs/DATA_DICTIONARY.md) | every table, column, key, index, view, procedure, function and trigger |
| [`docs/MODULE_INTEGRATION.md`](docs/MODULE_INTEGRATION.md) | how the modules share data, six canonical cross-module flows, where each rule is enforced |
| [`docs/DEMO_CREDENTIALS.md`](docs/DEMO_CREDENTIALS.md) | demo accounts and what each role can see |
| [`database/09_queries.sql`](database/09_queries.sql) | 45 commented analytical queries, grouped by DBMS concept |

The data dictionary and the ER diagrams are **generated** from the live schema:

```bash
python3 scripts/generate_data_dictionary.py     # → docs/DATA_DICTIONARY.md
python3 scripts/generate_er_diagrams.py         # → docs/ER_DIAGRAMS.md + docs/er/*.svg|mmd
python3 scripts/generate_seed.py                # → database/04_seed.sql
```

---

## Project structure

```
university-erp/
├── database/             01_schema … 09_queries  (load in numeric order)
├── backend/
│   └── src/
│       ├── config/       env, database pool, logger
│       ├── middleware/   authenticate, requireRole, validate, error handler
│       ├── routes/       one file per module, mounted in routes/index.ts
│       ├── services/     business rules, row-level scoping, audit + notifications
│       ├── repositories/ parameterised SQL only
│       └── utils/        response envelope, pagination, error classes
├── frontend/
│   └── src/
│       ├── pages/        48 screens (students, academics, attendance, exams,
│       │                 fees, hostel, faculty, ai, system)
│       ├── components/   DataTable, StatCard, Modal, Tabs, Toast, charts …
│       ├── lib/          api.ts (axios wrapper), format.ts, csv.ts
│       └── App.tsx       routes + role-aware navigation
├── docs/                 ER_DIAGRAMS · DATA_DICTIONARY · MODULE_INTEGRATION · er/*.svg
├── scripts/              seed generator, ER generator, dictionary generator, reset-db
├── tests/                db/test_rules.sql · api/smoke.sh · api/workflow.py
└── docker-compose.yml    db + api + web (+ optional mongo)
```

---

## Design decisions worth defending in a viva

1. **Why the rule is in the database.** If attendance < 75 % were checked only in React, a `curl` would
   pass. It is checked inside `sp_register_student_for_exam` *and* again by a `BEFORE INSERT` trigger, so
   every client, script and SQL prompt obeys it.
2. **Why denormalised counters are acceptable.** `enrolled_count`, `occupied_count` and `paid_amount` are
   derived, but they are derived *by triggers inside the same transaction* as the change — and after
   seeding, a reconciliation block recomputes them. The consistency checks in
   `MODULE_INTEGRATION.md §14` all return 0 bad rows.
3. **Why views.** A join used by the API, the reports and the dashboard is written once as a view; a
   change to the join touches one file.
4. **Why procedures instead of application code.** Multi-row operations (bulk enrolment, payroll run,
   result processing, fee payment) need to be atomic. A procedure gives you atomicity plus a single
   definition of the rule, plus a message the UI can display verbatim.
5. **Why row-level scoping in the service, not just the route.** `requireRole` answers "may this role call
   this endpoint?"; `student.service.list()` answers "may *this* user see *that* row?". Both are needed.
6. **Why `DECIMAL` and not `FLOAT`.** Money in binary floating point loses cents. `DECIMAL(12,2)` in SQL,
   string on the wire, formatted in the browser.
7. **Why the AI is honest.** No key, no LLM: the UI shows a `LOCAL_ENGINE` badge. Set `OPENAI_API_KEY` and
   the same screens call a real model and show `LLM`. Nothing is faked either way, and the AI never writes
   to academic or financial tables.
8. **Why MongoDB is optional.** It is an append-only event store, disabled by default, and no feature
   depends on it — which is the only honest justification for a second database here.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| `ECONNREFUSED 127.0.0.1:3306` | the database is not running, or `DB_HOST`/`DB_PORT` in `backend/.env` are wrong |
| `Access denied for user 'erp_user'@'localhost'` | create the user: `CREATE USER 'erp_user'@'%' IDENTIFIED BY 'erp_pass_2026'; GRANT ALL ON university_erp.* TO 'erp_user'@'%'; FLUSH PRIVILEGES;` |
| API starts but `/health` says the DB is not connected | check `DB_NAME` and that `database/0*.sql` were loaded: `SHOW TABLES;` |
| Frontend loads but every request 404s | the Vite proxy target is wrong — set `VITE_API_TARGET` to where the API listens and restart Vite |
| Everything is empty after a fresh install | load the files in order; `04_seed.sql` must run **after** `03_constraints.sql` and **before** `06_triggers.sql` (the reconciliation at the end of `06` fixes the derived counters) |
| `ER_SIGNAL_EXCEPTION` when registering for an exam | that is the rule working — the message tells you whether it was attendance or dues |
| Port already in use | stop the other process, or override ports: `WEB_PORT=5174 API_PORT=8081 docker compose up -d` |

---

**Built for the DBMS laboratory, and built to actually run.** If you can read SQL, you can verify every
claim in this README from a `mysql>` prompt.
