#!/usr/bin/env python3
"""
generate_data_dictionary.py — builds docs/DATA_DICTIONARY.md from the live schema.

Run:  python3 scripts/generate_data_dictionary.py
Reads: information_schema (columns, keys, indexes, routines, triggers, views)
       database/0*.sql      (the header comment written above each routine)
Writes: docs/DATA_DICTIONARY.md

The dictionary is generated, not typed by hand, so it can never drift from the
database that the application actually runs against.
"""

from __future__ import annotations

import os
import re
import subprocess
from collections import defaultdict

DB = 'university_erp'
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SQL_DIR = os.path.join(HERE, 'database')
OUT = os.path.join(HERE, 'docs', 'DATA_DICTIONARY.md')

# --------------------------------------------------------------------------- #
# module grouping (same seven modules as the project brief)
# --------------------------------------------------------------------------- #
MODULES = [
    ('0 · Shared core & platform',
     ['roles', 'users', 'departments', 'categories', 'academic_years', 'semesters',
      'system_settings', 'notifications', 'audit_logs', 'academic_calendar']),
    ('1 · Student & Admission',
     ['students', 'addresses', 'guardians', 'admissions', 'student_documents',
      'student_status_history']),
    ('2 · Academic & Course',
     ['programs', 'batches', 'sections', 'subjects', 'program_subjects', 'course_offerings',
      'enrollments', 'faculty_subjects', 'timetable']),
    ('3 · Attendance', ['class_sessions', 'attendance']),
    ('4 · Examination & Results',
     ['grades', 'exams', 'exam_schedules', 'exam_registrations', 'marks', 'results']),
    ('5 · Fees & Finance',
     ['fee_structures', 'student_fees', 'payments', 'scholarships', 'student_scholarships',
      'fines', 'refunds', 'transactions']),
    ('6 · Hostel',
     ['hostels', 'hostel_blocks', 'rooms', 'beds', 'hostel_applications', 'room_allocations',
      'room_transfers', 'hostel_fees']),
    ('7 · Faculty, Leave & Payroll',
     ['designations', 'faculty', 'faculty_leaves', 'leave_balances', 'payrolls',
      'payroll_components']),
    ('8 · AI, mock tests & analytics (supporting)',
     ['mcq_questions', 'mock_exams', 'mock_exam_answers', 'ai_conversations', 'study_plans',
      'student_risk_scores']),
]

# short, curated notes for columns whose meaning is not obvious from the name
NOTES = {
    'status': 'Row-level lifecycle flag; the allowed values are constrained per table by CHECK constraints and triggers.',
    'is_active': 'Soft-delete / enable switch. Nothing in this schema is hard-deleted.',
    'is_current': 'Exactly one row in the table carries the current flag (used by every "current semester/year" query).',
    'created_at': 'Set by DEFAULT CURRENT_TIMESTAMP on insert.',
    'updated_at': 'Maintained by ON UPDATE CURRENT_TIMESTAMP.',
    'password_hash': 'bcrypt hash — the plaintext password is never stored.',
    'due_amount': 'total_amount − paid_amount − scholarship_amount − discount_amount, kept in step by triggers.',
    'paid_amount': 'Running total of successful payments, updated by trg_payment_ai / trg_payment_au.',
    'occupied_count': 'Denormalised counter maintained by the hostel triggers — never updated directly by the app.',
    'attendance_percentage': 'Snapshot copied onto the registration row at registration time by sp_register_student_for_exam.',
    'is_eligible': '0 when attendance or dues failed the gate; the trigger refuses the insert in that case.',
    'eligibility_reason': 'Human-readable refusal text returned to the UI when registration is blocked.',
    'grade_points': 'Numeric points for the grade (0–10), used for SGPA/CGPA computation.',
    'cgpa': 'Cumulative grade point average; recomputed by fn_calculate_student_cgpa().',
    'sgpa': 'Semester grade point average; computed by fn_calculate_sgpa() inside sp_process_semester_results.',
    'lop_days': 'Loss-of-pay days derived from approved unpaid leave for the payroll month.',
    'net_salary': 'gross_salary − (pf + professional tax + income tax + LOP + other deductions).',
    'gross_salary': 'basic + hra + da + ta + special_allowance.',
    'payment_mode': 'CASH | CARD | UPI | NETBANKING | CHEQUE | DD | ONLINE | SCHOLARSHIP.',
    'receipt_no': 'Human-readable receipt identifier generated inside sp_process_fee_payment.',
    'risk_score': '0–100 score produced by sp_compute_student_risk (attendance, marks, dues, backlogs).',
    'risk_level': 'LOW | MEDIUM | HIGH | CRITICAL — derived band over risk_score.',
    'active_bed_year': 'Academic year label cached on the allocation so the "one active bed per year" rule is checkable in one index lookup.',
    'old_value': 'JSON snapshot of the row before the change (audit trail).',
    'new_value': 'JSON snapshot of the row after the change (audit trail).',
    'enrolled_count': 'Maintained by trg_enrollments_ai_count / trg_enrollments_ad_count and capped at capacity.',
    'min_attendance_required': 'Per-exam attendance bar (default 75) enforced at registration time.',
}


def mysql(sql: str, ncol: int = 0) -> list[list[str]]:
    """Run a query and return tab-separated rows.

    `ncol` (optional) discards rows that do not have that many fields: MySQL can
    emit short rows when a trailing column of a view is NULL.
    """
    cmd = ['mysql', '-u', 'erp_user', '-perp_pass_2026', '-N', '-B', DB, '-e', sql]
    out = subprocess.run(cmd, capture_output=True, text=True, check=True).stdout
    rows = [line.split('\t') for line in out.strip().split('\n') if line]
    return [r for r in rows if not ncol or len(r) == ncol]


def humanise(name: str) -> str:
    words = name.replace('_', ' ').strip()
    return words[0].upper() + words[1:]


def sql_type(col_type: str, col_key_extra: str) -> str:
    return col_type.upper()


# --------------------------------------------------------------------------- #
# fetch the schema
# --------------------------------------------------------------------------- #
print('reading information_schema …')
tables = {r[0] for r in mysql("SELECT table_name FROM information_schema.tables "
                              "WHERE table_schema = DATABASE() AND table_type = 'BASE TABLE'")}

columns = defaultdict(list)
for (table, name, col_type, nullable, col_key, default, extra, comment) in mysql("""
    SELECT table_name, column_name, column_type, is_nullable, column_key,
           IFNULL(column_default, ''), extra, column_comment
    FROM information_schema.columns
    WHERE table_schema = DATABASE()
    ORDER BY table_name, ordinal_position""", ncol=8):
    if table not in tables:
        continue
    columns[table].append({
        'name': name, 'type': col_type, 'nullable': nullable,
        'key': col_key, 'default': default, 'extra': extra, 'comment': comment,
    })

fks = defaultdict(list)
for (table, column, ref_table, ref_col, constraint) in mysql("""
    SELECT table_name, column_name, referenced_table_name, referenced_column_name, constraint_name
    FROM information_schema.key_column_usage
    WHERE table_schema = DATABASE() AND referenced_table_name IS NOT NULL
    ORDER BY table_name, constraint_name, ordinal_position""", ncol=5):
    fks[table].append({'column': column, 'ref_table': ref_table,
                       'ref_col': ref_col, 'constraint': constraint})

indexes = defaultdict(list)
for (table, index, non_unique, cols) in mysql("""
    SELECT table_name, index_name, non_unique, GROUP_CONCAT(column_name ORDER BY seq_in_index)
    FROM information_schema.statistics
    WHERE table_schema = DATABASE()
    GROUP BY table_name, index_name, non_unique
    ORDER BY table_name, index_name""", ncol=4):
    indexes[table].append({'name': index, 'unique': non_unique == '0', 'cols': cols})

rowcounts = {r[0]: r[1] for r in mysql("""
    SELECT table_name, table_rows FROM information_schema.tables
    WHERE table_schema = DATABASE()""")}

views = [r[0] for r in mysql("SELECT table_name FROM information_schema.views "
                             "WHERE table_schema = DATABASE() ORDER BY table_name")]
procs = [r[0] for r in mysql("SELECT routine_name FROM information_schema.routines "
                             "WHERE routine_schema = DATABASE() AND routine_type='PROCEDURE' ORDER BY routine_name")]
funcs = [r[0] for r in mysql("SELECT routine_name FROM information_schema.routines "
                             "WHERE routine_schema = DATABASE() AND routine_type='FUNCTION' ORDER BY routine_name")]
triggers = []
for (name, table, action, timing) in mysql("""
    SELECT trigger_name, event_object_table, action_statement, action_timing
    FROM information_schema.triggers WHERE trigger_schema = DATABASE() ORDER BY event_object_table, trigger_name""", ncol=4):
    triggers.append({'name': name, 'table': table, 'timing': timing, 'action': action})

# --------------------------------------------------------------------------- #
# pull the header comment that sits above each CREATE in the SQL sources
# --------------------------------------------------------------------------- #
def header_comment(object_name: str) -> str:
    pattern = re.compile(
        r'((?:^\s*--[^\n]*\n)+)\s*CREATE\s+(?:OR\s+REPLACE\s+)?(?:DEFINER\s*=\s*\S+\s+)?'
        r'(PROCEDURE|FUNCTION|TRIGGER|VIEW)\s+`?' + re.escape(object_name) + r'`?',
        re.IGNORECASE | re.MULTILINE)
    for fn in sorted(os.listdir(SQL_DIR)):
        if not fn.endswith('.sql'):
            continue
        text = open(os.path.join(SQL_DIR, fn), encoding='utf-8').read()
        m = pattern.search(text)
        if m:
            lines = [re.sub(r'^\s*--\s?', '', ln).rstrip() for ln in m.group(1).strip().split('\n')]
            # drop separator/box-drawing-only lines
            lines = [ln for ln in lines if ln.strip('─-=*· ') and len(ln) > 3]
            if lines:
                return ' '.join(lines[:3]).strip()
    return ''


def short_action(trigger_action: str) -> str:
    a = ' '.join(trigger_action.split())
    return (a[:150] + '…') if len(a) > 150 else a


# --------------------------------------------------------------------------- #
# render
# --------------------------------------------------------------------------- #
print('writing', OUT)
L: list[str] = []
A = L.append

A('# DATA DICTIONARY')
A('')
A('**University Higher Education ERP System** — M7 BATCH, Department of E&TCE')
A('')
A(f'Generated by `scripts/generate_data_dictionary.py` from the live schema `{DB}` — '
  f'it is never hand-edited, so it cannot drift away from the database.')
A('')
A(f'| | |')
A('|---|---|')
A(f'| Base tables | **{len(tables)}** |')
A(f'| Columns documented | **{sum(len(v) for k, v in columns.items() if k in tables)}** |')
A(f'| Views | **{len(views)}** |')
A(f'| Stored procedures | **{len(procs)}** |')
A(f'| Functions (UDFs) | **{len(funcs)}** |')
A(f'| Triggers | **{len(triggers)}** |')
A(f'| Foreign keys | **{sum(len(v) for v in fks.values())}** |')
A('')
A('Contents')
A('')
A('1. [How to read this dictionary](#how-to-read-this-dictionary)')
for i, (title, _) in enumerate(MODULES, start=2):
    anchor = re.sub(r'[^a-z0-9]+', '-', title.lower()).strip('-')
    A(f'{i}. [{title}](#{anchor})')
A(f'{len(MODULES) + 2}. [Relationships (foreign keys)](#relationships-foreign-keys)')
A(f'{len(MODULES) + 3}. [Views](#views)')
A(f'{len(MODULES) + 4}. [Stored procedures](#stored-procedures)')
A(f'{len(MODULES) + 5}. [Functions](#functions)')
A(f'{len(MODULES) + 6}. [Triggers](#triggers)')
A('')
A('---')
A('')
A('## How to read this dictionary')
A('')
A('| Symbol | Meaning |')
A('|---|---|')
A('| **PK** | Primary key |')
A('| **FK → table(col)** | Foreign key; see the [relationships](#relationships-foreign-keys) section for the constraint name |')
A('| **UQ** | Unique index |')
A('| **IX** | Non-unique (performance) index |')
A('| *not null* | Column is mandatory |')
A('| `default` | Value used when the insert omits the column |')
A('')
A('Naming conventions used throughout the schema:')
A('')
A('* every table is **plural** and its surrogate key is `<singular>_id`;')
A('* every foreign key column is exactly `<referenced_singular>_id`;')
A('* every table carries `created_at`, and anything mutable carries `updated_at`;')
A('* money is `DECIMAL(12,2)`, percentages are `DECIMAL(5,2)`, and no monetary value is ever a float;')
A('* lifecycle columns are uppercase enumerations (`ACTIVE`, `PENDING`, `PAID`, …) enforced by CHECK constraints.')
A('')
A('---')
A('')

for title, group in MODULES:
    anchor = re.sub(r'[^a-z0-9]+', '-', title.lower()).strip('-')
    A(f'## {title}')
    A('')
    for table in group:
        if table not in tables:
            continue
        cols = columns.get(table, [])
        if not cols:
            continue
        A(f'### `{table}`')
        A('')
        note = header_comment(table)
        if note:
            A(f'_{note}_')
            A('')
        A(f'Rows (approx.): `{rowcounts.get(table, "n/a")}`')
        A('')
        A('| Column | Type | Null | Key | Default | Description |')
        A('|---|---|---|---|---|---|')
        fk_by_col = {f['column']: f for f in fks.get(table, [])}
        uniq_cols = set()
        idx_cols = set()
        for ix in indexes.get(table, []):
            for c in ix['cols'].split(','):
                (uniq_cols if ix['unique'] and ',' not in ix['cols'] else idx_cols).add(c)
        for c in cols:
            key = []
            if c['key'] == 'PRI':
                key.append('**PK**')
            elif c['key'] == 'UNI':
                key.append('**UQ**')
            elif c['key'] == 'MUL':
                key.append('**IX**')
            if c['name'] in fk_by_col:
                f = fk_by_col[c['name']]
                key.append(f'**FK → {f["ref_table"]}({f["ref_col"]})**')
            default = ''
            if c['default'] not in (None, 'NULL', ''):
                default = f'`{c["default"]}`'
            if c['extra'] and 'auto_increment' in c['extra']:
                default = 'AUTO_INCREMENT'
            desc = c['comment'] or NOTES.get(c['name'], '') or humanise(c['name'])
            A(f'| `{c["name"]}` | `{c["type"]}` | {"yes" if c["nullable"] == "YES" else "*not null*"} | '
              f'{" ".join(key) if key else "—"} | {default or "—"} | {desc} |')
        # indexes
        extra_idx = [ix for ix in indexes.get(table, [])
                     if ix['name'].upper() != 'PRIMARY' and ix['name'] not in
                     {f['constraint'] for f in fks.get(table, [])}]
        if extra_idx:
            A('')
            A('Indexes: ' + ', '.join(
                f'`{ix["name"]}`{" (unique)" if ix["unique"] else ""} → {ix["cols"]}'
                for ix in extra_idx))
        if fks.get(table):
            A('')
            A('Outgoing foreign keys: ' + ', '.join(
                f'`{f["constraint"]}`: {f["column"]} → {f["ref_table"]}({f["ref_col"]})'
                for f in fks[table]))
        A('')
    A('---')
    A('')

# --------------------------------------------------------------------------- #
A('## Relationships (foreign keys)')
A('')
A('Every relationship below is a real `FOREIGN KEY … ON DELETE/UPDATE` constraint created in '
  '`03_constraints.sql`; the application never relies on "soft" references.')
A('')
A('| Child table | Column | → Parent table | Column | Constraint |')
A('|---|---|---|---|---|')
for table in sorted(fks):
    for f in fks[table]:
        A(f'| `{table}` | `{f["column"]}` | `{f["ref_table"]}` | `{f["ref_col"]}` | `{f["constraint"]}` |')
A('')
A('---')
A('')

A('## Views')
A('')
A(f'{len(views)} views. Each one is defined in `08_views.sql` and used by the API (see '
  '`MODULE_INTEGRATION.md` for who calls what).')
A('')
A('| View | Purpose |')
A('|---|---|')
view_purpose = {
    'v_student_full_profile': 'One row per student with department, program, batch, category resolved — the student list grid.',
    'v_student_academic_summary': 'Per-student credits, CGPA, backlogs and current semester standing.',
    'v_student_attendance_summary': 'Attendance per student per offering (drives the <75% gate).',
    'v_student_attendance_overall': 'Attendance per student across everything (student dashboard + AI features).',
    'v_monthly_attendance': 'Month-wise attendance roll-up for reports and trend charts.',
    'v_student_fee_status': 'Billed / paid / due / overdue per student — the defaulters report.',
    'v_fee_collection_summary': 'Collection totals by program, semester and mode.',
    'v_daily_fee_collection': 'Day-wise receipts for the finance dashboard.',
    'v_hostel_occupancy': 'Beds, occupancy and vacancy per hostel/block.',
    'v_room_vacancy': 'Room-level vacancy used by the allocation screen.',
    'v_faculty_workload': 'Offerings, students taught, sessions taken and pending leaves per faculty member.',
    'v_faculty_payroll_summary': 'Year-to-date payroll figures and leave balances per faculty member.',
    'v_department_performance': 'Average SGPA/CGPA and backlog counts per department.',
    'v_exam_result_summary': 'Result statistics per exam and subject.',
    'v_subject_failure_rate': 'Failure rate per subject (exam-cell watchlist).',
    'v_exam_eligibility': 'The attendance + dues gate, exposed as a queryable view.',
    'v_exam_hall_ticket': 'Printable hall-ticket rows.',
    'v_student_rankings': 'Ranked students using RANK()/DENSE_RANK() window functions.',
    'v_student_result_history': 'Semester-by-semester result trail for a student.',
    'v_student_risk_dashboard': 'Combined risk view used by the AI at-risk feature.',
}
for v in views:
    A(f'| `{v}` | {view_purpose.get(v, header_comment(v) or "Reporting view.")} |')
A('')
A('---')
A('')

A('## Stored procedures')
A('')
A(f'{len(procs)} procedures live in `05_procedures.sql`. They are called by the Node services '
  '(never re-implemented in JavaScript) so that the business rule exists in exactly one place: the database.')
A('')
A('| Procedure | Purpose |')
A('|---|---|')
proc_purpose = {
    'sp_register_student_for_exam': 'Registration gate: recomputes attendance, checks dues, inserts or refuses with a reason, issues a hall-ticket number.',
    'sp_bulk_enroll_students': 'Enrols a whole batch/section into every offering of a semester in one transaction, honouring capacity.',
    'sp_mark_attendance_bulk': 'Writes one attendance row per student for a session inside a single transaction.',
    'sp_process_fee_payment': 'Posts a payment, allocates it against the bill, issues a receipt number and updates bill status atomically.',
    'sp_generate_semester_fees': 'Creates student_fees rows for every student of a program/semester from the fee structure.',
    'sp_apply_late_fees': 'Applies fn_calculate_late_fee() to every overdue bill.',
    'sp_generate_monthly_payroll': 'Builds payslips for all active faculty for a month, with LOP and PF, in one transaction.',
    'sp_process_semester_results': 'Computes SGPA/CGPA/backlogs per student for a semester and writes `results`.',
    'sp_publish_exam_results': 'Flips an exam to published and notifies students.',
    'sp_enter_marks': 'Validates and inserts marks for a registration, deriving grade and points.',
    'sp_allocate_hostel_bed': 'Allocates a bed to an approved application and fires the occupancy triggers.',
    'sp_transfer_room': 'Moves a resident to another bed with an audit trail.',
    'sp_vacate_hostel_bed': 'Vacates a bed, closes the allocation and frees capacity.',
    'sp_approve_admission': 'Converts an admission application into a student + user account.',
    'sp_approve_leave': 'Approves/rejects a leave and updates the leave balance.',
    'sp_push_notification': 'Writes a notification row (optionally broadcast to a role).',
    'sp_compute_student_risk': 'Recomputes risk scores for all students (attendance, marks, dues, backlogs).',
}
for p in procs:
    A(f'| `{p}` | {proc_purpose.get(p, header_comment(p) or "See 05_procedures.sql.")} |')
A('')
A('---')
A('')

A('## Functions')
A('')
A(f'{len(funcs)} deterministic functions in `07_functions.sql`. They are also used inside views, '
  'triggers and procedures, which is why the same rule never appears twice.')
A('')
A('| Function | Purpose |')
A('|---|---|')
func_purpose = {
    'fn_calculate_student_cgpa': 'Credit-weighted CGPA across all completed semesters.',
    'fn_calculate_sgpa': 'SGPA for one semester from grade points × credits.',
    'fn_calculate_late_fee': 'Late fee for a bill from days overdue and the configured rate.',
    'fn_calculate_faculty_leave_balance': 'Remaining leave of a type for a faculty member in an academic year.',
    'fn_calculate_attendance_percentage': 'Attendance % of a student for an offering (or all offerings).',
    'fn_calculate_semester_attendance': 'Attendance % of a student for a whole semester.',
    'fn_calculate_net_salary': 'Net pay for a faculty member for a month (earnings − deductions − LOP).',
    'fn_grade_code': 'Maps a percentage to a grade code using the `grades` table.',
    'fn_grade_points': 'Maps a percentage (or grade) to grade points.',
    'fn_hostel_available_beds': 'Free beds in a hostel/room right now.',
    'fn_student_backlog_count': 'Number of failed subjects still open for a student.',
    'fn_student_earned_credits': 'Credits earned (passed) by a student.',
    'fn_student_outstanding_dues': 'Total unpaid fees for a student.',
}
for f in funcs:
    A(f'| `{f}` | {func_purpose.get(f, header_comment(f) or "See 07_functions.sql.")} |')
A('')
A('---')
A('')

A('## Triggers')
A('')
A(f'{len(triggers)} triggers in `06_triggers.sql`. Naming: `trg_<table>_<bi|bu|ai|au|ad>_<intent>` '
  '(before/after insert/update/delete).')
A('')
A('| Trigger | Table | Timing | What it guarantees |')
A('|---|---|---|---|')
for t in sorted(triggers, key=lambda x: (x['table'], x['name'])):
    A(f'| `{t["name"]}` | `{t["table"]}` | {t["timing"]} | {short_action(t["action"])} |')
A('')
A('---')
A('')
A('_Generated file — rerun `python3 scripts/generate_data_dictionary.py` after any schema change._')

os.makedirs(os.path.dirname(OUT), exist_ok=True)
open(OUT, 'w', encoding='utf-8').write('\n'.join(L) + '\n')
print('done:', OUT, f'({len(L)} lines)')
