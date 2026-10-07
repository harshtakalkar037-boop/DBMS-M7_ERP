#!/usr/bin/env python3
"""
generate_er_diagrams.py — renders the ER diagrams of the University ERP as SVG.

Why a generator instead of a drawing tool?
  * the diagrams stay in sync with the schema: entity/attribute lists live here,
    one place, and can be regenerated any time with `python3 scripts/generate_er_diagrams.py`
  * SVG is plain text, previews in any browser, prints cleanly for a viva report.

Notation used (standard ER / crow's foot):
  ┌──────────────┐
  │  ENTITY      │   <- entity (one per base table)
  ├──────────────┤
  │ # pk_column  │   <- '# '  = primary key
  │ ~ fk_column  │   <- '~ '  = foreign key
  │   column     │
  └──────────────┘
  relationship line:  ──1─────N<   (crow's foot at the "many" end, tick at "one")

Output: docs/er/*.svg  (global + one per module)
"""

from __future__ import annotations

import os
import re
import textwrap

# --------------------------------------------------------------------------- #
# geometry
# --------------------------------------------------------------------------- #
BOX_W = 210
HEAD_H = 26
ATTR_H = 16
PAD = 8
GAP_X = 78
GAP_Y = 34
MARGIN_X = 36
MARGIN_Y = 76          # room for the title
FOOTER_H = 40

MOD_COLOURS = {
    'core':      ('#1e3a8a', '#dbeafe'),   # identity / shared masters
    'student':   ('#0f766e', '#ccfbf1'),
    'academic':  ('#7c3aed', '#ede9fe'),
    'attend':    ('#b45309', '#fef3c7'),
    'exam':      ('#be123c', '#ffe4e6'),
    'finance':   ('#15803d', '#dcfce7'),
    'hostel':    ('#0369a1', '#e0f2fe'),
    'faculty':   ('#a21caf', '#fae8ff'),
    'system':    ('#475569', '#e2e8f0'),
}


def box_height(n_attrs: int) -> int:
    return HEAD_H + PAD + n_attrs * ATTR_H + PAD


class Diagram:
    """Collects entities + relationships and renders one SVG."""

    def __init__(self, slug: str, title: str, subtitle: str = ''):
        self.slug = slug
        self.title = title
        self.subtitle = subtitle
        self.entities: dict[str, dict] = {}
        self.relations: list[tuple] = []

    # -- spec ------------------------------------------------------------- #
    def entity(self, eid: str, label: str, attrs: list[str], col: int, row: int,
               module: str = 'core'):
        self.entities[eid] = {
            'label': label, 'attrs': attrs, 'col': col, 'row': row, 'module': module,
        }

    def rel(self, a: str, b: str, card: str = '1:N', label: str = '',
            dashed: bool = False):
        self.relations.append((a, b, card, label, dashed))

    # -- layout ----------------------------------------------------------- #
    def _layout(self):
        rows: dict[int, int] = {}
        for e in self.entities.values():
            rows[e['row']] = max(rows.get(e['row'], 0), box_height(len(e['attrs'])))
        y_offsets, y = {}, MARGIN_Y
        for r in sorted(rows):
            y_offsets[r] = y
            y += rows[r] + GAP_Y
        for e in self.entities.values():
            e['x'] = MARGIN_X + e['col'] * (BOX_W + GAP_X)
            e['y'] = y_offsets[e['row']]
            e['w'] = BOX_W
            e['h'] = box_height(len(e['attrs']))
        self.width = MARGIN_X * 2 + (max(e['col'] for e in self.entities.values()) + 1) * (BOX_W + GAP_X) - GAP_X
        self.height = y + FOOTER_H

    # -- svg helpers ------------------------------------------------------ #
    @staticmethod
    def _esc(t: str) -> str:
        return (t.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;'))

    def _box(self, e: dict) -> str:
        stroke, fill = MOD_COLOURS.get(e['module'], MOD_COLOURS['core'])
        x, y, w, h = e['x'], e['y'], e['w'], e['h']
        out = [f'<g>']
        out.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="6" '
                   f'fill="#ffffff" stroke="{stroke}" stroke-width="1.4"/>')
        out.append(f'<path d="M{x} {y + 6} a6 6 0 0 1 6 -6 h{w - 12} a6 6 0 0 1 6 6 v{HEAD_H - 6} '
                   f'h-{w} z" fill="{fill}" stroke="{stroke}" stroke-width="1.4"/>')
        out.append(f'<text x="{x + w / 2}" y="{y + 18}" text-anchor="middle" '
                   f'font-family="Helvetica,Arial,sans-serif" font-size="12.5" font-weight="700" '
                   f'fill="{stroke}">{self._esc(e["label"])}</text>')
        ay = y + HEAD_H + PAD + 12
        for attr in e['attrs']:
            key = False
            style = 'font-size="11" fill="#334155"'
            text = attr
            if attr.startswith('# '):
                text, key, style = attr[2:], True, 'font-size="11" fill="#0f172a" font-weight="700"'
            elif attr.startswith('~ '):
                text, style = attr[2:], 'font-size="11" fill="#b45309" font-style="italic"'
            out.append(f'<text x="{x + 10}" y="{ay}" font-family="Helvetica,Arial,sans-serif" {style}>'
                       f'{self._esc(text)}</text>')
            if key:
                out.append(f'<text x="{x + 10}" y="{ay + 3}" font-family="Helvetica,Arial,sans-serif" '
                           f'font-size="11" fill="#0f172a" text-decoration="underline">'
                           f'{" " * len(text)}</text>')
            ay += ATTR_H
        out.append('</g>')
        return '\n'.join(out)

    # -- relationship routing -------------------------------------------- #
    @staticmethod
    def _anchors(a: dict, b: dict):
        ac = (a['x'] + a['w'] / 2, a['y'] + a['h'] / 2)
        bc = (b['x'] + b['w'] / 2, b['y'] + b['h'] / 2)
        dx, dy = bc[0] - ac[0], bc[1] - ac[1]
        if abs(dx) >= abs(dy):
            if dx >= 0:
                p1 = (a['x'] + a['w'], ac[1])
                p2 = (b['x'], bc[1])
                d1, d2 = 'right', 'left'
            else:
                p1 = (a['x'], ac[1])
                p2 = (b['x'] + b['w'], bc[1])
                d1, d2 = 'left', 'right'
        else:
            if dy >= 0:
                p1 = (ac[0], a['y'] + a['h'])
                p2 = (bc[0], b['y'])
                d1, d2 = 'bottom', 'top'
            else:
                p1 = (ac[0], a['y'])
                p2 = (bc[0], b['y'] + b['h'])
                d1, d2 = 'top', 'bottom'
        return p1, p2, d1, d2

    @staticmethod
    def _path(p1, p2, d1, d2):
        (x1, y1), (x2, y2) = p1, p2
        if d1 in ('left', 'right'):
            mid = (x1 + x2) / 2
            pts = [(x1, y1), (mid, y1), (mid, y2), (x2, y2)]
        else:
            mid = (y1 + y2) / 2
            pts = [(x1, y1), (x1, mid), (x2, mid), (x2, y2)]
        d = f'M{pts[0][0]:.1f} {pts[0][1]:.1f}'
        for p in pts[1:]:
            d += f' L{p[0]:.1f} {p[1]:.1f}'
        return d, pts

    @staticmethod
    def _marker(pt, direction, cardinality):
        """Crow's foot (N) or a single tick (1) at the end of a segment."""
        x, y = pt
        if direction == 'left':        # line arrives from the right
            sx, nx = 1, -1
        elif direction == 'right':
            sx, nx = -1, 1
        elif direction == 'top':       # line arrives from below
            sy, ny = -1, 1
        else:
            sy, ny = 1, -1
        out = []
        if cardinality.upper().startswith('N') or cardinality.upper().startswith('M'):
            L = 12
            if direction in ('left', 'right'):
                out.append(f'M{x} {y} L{x + nx * L} {y - 5}')
                out.append(f'M{x} {y} L{x + nx * L} {y + 5}')
                out.append(f'M{x} {y} L{x + nx * L} {y}')
            else:
                out.append(f'M{x} {y} L{x - 5} {y + ny * L}')
                out.append(f'M{x} {y} L{x + 5} {y + ny * L}')
                out.append(f'M{x} {y} L{x} {y + ny * L}')
        else:
            L = 10
            if direction in ('left', 'right'):
                out.append(f'M{x + nx * L} {y - 6} L{x + nx * L} {y + 6}')
            else:
                out.append(f'M{x - 6} {y + ny * L} L{x + 6} {y + ny * L}')
        return ' '.join(out)

    def _relation(self, rel):
        a_id, b_id, card, label, dashed = rel
        a, b = self.entities.get(a_id), self.entities.get(b_id)
        if not a or not b:
            return ''
        p1, p2, d1, d2 = self._anchors(a, b)
        d, pts = self._path(p1, p2, d1, d2)
        ca, cb = (card.split(':') + ['1'])[:2]
        dash = ' stroke-dasharray="6 4"' if dashed else ''
        out = [f'<g>']
        out.append(f'<path d="{d}" fill="none" stroke="#64748b" stroke-width="1.3"{dash}/>')
        out.append(f'<path d="{self._marker(p1, d1, ca)}" fill="none" stroke="#64748b" stroke-width="1.3"/>')
        out.append(f'<path d="{self._marker(p2, d2, cb)}" fill="none" stroke="#64748b" stroke-width="1.3"/>')
        if label:
            lx, ly = pts[1] if len(pts) > 2 else p1
            mx = (pts[1][0] + pts[2][0]) / 2 if len(pts) > 2 else (p1[0] + p2[0]) / 2
            my = (pts[1][1] + pts[2][1]) / 2 if len(pts) > 2 else (p1[1] + p2[1]) / 2
            mx, my = pts[1] if d1 in ('left', 'right') else (pts[1][0], pts[1][1])
            if d1 in ('left', 'right'):
                mx, my = pts[1][0], (pts[1][1] + pts[2][1]) / 2
            else:
                mx, my = (pts[1][0] + pts[2][0]) / 2, pts[1][1]
            w = max(28, 7 * len(label) + 10)
            out.append(f'<rect x="{mx - w / 2:.1f}" y="{my - 9:.1f}" width="{w}" height="16" rx="8" '
                       f'fill="#ffffff" stroke="#cbd5e1"/>')
            out.append(f'<text x="{mx:.1f}" y="{my + 3:.1f}" text-anchor="middle" '
                       f'font-family="Helvetica,Arial,sans-serif" font-size="9.5" fill="#475569">'
                       f'{self._esc(label)}</text>')
        out.append('</g>')
        return '\n'.join(out)

    # -- mermaid export --------------------------------------------------- #
    MERMAID_CARD = {'1:1': '||--||', '1:N': '||--o{', 'N:1': '}o--||',
                    'N:M': '}o--o{', '0:N': '||--o{'}

    def mermaid(self) -> str:
        """The same diagram in Mermaid ER syntax (renders on GitHub / docs sites)."""
        def ident(label: str) -> str:
            return re.sub(r'[^A-Za-z0-9_]', '_', label).upper()

        chunks = ['erDiagram']
        for e in self.entities.values():
            lines = [f'    {ident(e["label"])} {{']
            for attr in e['attrs']:
                if attr.startswith('# '):
                    text, suffix = attr[2:], ' PK'
                elif attr.startswith('~ '):
                    text, suffix = attr[2:], ' FK'
                else:
                    text, suffix = attr, ''
                kind = 'string'
                if text.endswith('_id') and not suffix:
                    kind = 'int'
                elif any(k in text for k in ('amount', 'salary', 'percentage', 'cgpa', 'sgpa', 'points', 'rent')):
                    kind = 'decimal'
                elif text.endswith('_date') or text.endswith('_on') or text.endswith('_at') or text.endswith('year'):
                    kind = 'date'
                elif text.endswith('_count') or text.endswith('_no') or text.startswith('days') or text.endswith('_days'):
                    kind = 'int'
                lines.append(f'        {kind} {re.sub(r"[^A-Za-z0-9_]", "_", text)}{suffix}')
            lines.append('    }')
            chunks.append('\n'.join(lines))
        for a_id, b_id, card, label, dashed in self.relations:
            a, b = self.entities.get(a_id), self.entities.get(b_id)
            if not a or not b:
                continue
            op = self.MERMAID_CARD.get(card, '||--o{')
            chunks.append(f'    {ident(a["label"])} {op} {ident(b["label"])} : "{label or "relates to"}"')
        return '\n'.join(chunks)

    # -- render ----------------------------------------------------------- #
    def render(self, out_dir: str) -> str:
        self._layout()
        parts = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{self.width}" height="{self.height}" '
                 f'viewBox="0 0 {self.width} {self.height}" font-family="Helvetica,Arial,sans-serif">',
                 '<rect width="100%" height="100%" fill="#f8fafc"/>',
                 f'<text x="{MARGIN_X}" y="34" font-size="19" font-weight="700" fill="#0f172a">'
                 f'{self._esc(self.title)}</text>']
        if self.subtitle:
            parts.append(f'<text x="{MARGIN_X}" y="54" font-size="11.5" fill="#64748b">'
                         f'{self._esc(self.subtitle)}</text>')
        parts.append('<line x1="{0}" y1="64" x2="{1}" y2="64" stroke="#cbd5e1" stroke-width="1"/>'
                     .format(MARGIN_X, self.width - MARGIN_X))
        # relationships first so boxes sit on top
        for rel in self.relations:
            parts.append(self._relation(rel))
        for e in self.entities.values():
            parts.append(self._box(e))
        # legend
        ly = self.height - 26
        parts.append(f'<text x="{MARGIN_X}" y="{ly}" font-size="10" fill="#64748b">'
                     f'# primary key   ~ foreign key   1── one   &lt;── many   - - - identifying/weak relationship'
                     f'   ·  University ERP · M7 BATCH · Dept. of E&amp;TCE</text>')
        parts.append('</svg>')
        os.makedirs(out_dir, exist_ok=True)
        path = os.path.join(out_dir, f'er_{self.slug}.svg')
        with open(path, 'w', encoding='utf-8') as fh:
            fh.write('\n'.join(parts) + '\n')
        return path


# =========================================================================== #
# 1. GLOBAL ER DIAGRAM — every module and how they meet
# =========================================================================== #
def build_global() -> Diagram:
    d = Diagram('global', 'University ERP — Global ER diagram',
                'One integrated database. Shared masters (users, departments, programs, students, faculty) '
                'are reused by all seven modules — there is no duplicate student or faculty table.')

    # ---- shared core ------------------------------------------------------ #
    d.entity('users', 'users', ['# user_id', '~ role_id', 'email', 'password_hash', 'is_active', 'last_login_at'], 0, 0, 'core')
    d.entity('roles', 'roles', ['# role_id', 'role_code', 'role_name'], 0, 1, 'core')
    d.entity('depts', 'departments', ['# department_id', 'department_code', 'name', '~ hod_faculty_id'], 0, 2, 'core')
    d.entity('students', 'students', ['# student_id', '~ user_id', 'roll_number', '~ department_id', '~ program_id', '~ batch_id', 'current_semester_no', 'status'], 1, 0, 'student')
    d.entity('faculty', 'faculty', ['# faculty_id', '~ user_id', 'employee_code', '~ department_id', '~ designation_id', 'basic_salary', 'status'], 1, 2, 'faculty')

    # ---- module 2 academics ---------------------------------------------- #
    d.entity('programs', 'programs', ['# program_id', 'program_code', 'name', '~ department_id', 'total_semesters'], 2, 3, 'academic')
    d.entity('subjects', 'subjects', ['# subject_id', 'subject_code', 'name', 'credits', '~ department_id'], 3, 3, 'academic')
    d.entity('offerings', 'course_offerings', ['# offering_id', '~ subject_id', '~ faculty_id', '~ program_id', '~ semester_id', 'enrolled_count', 'capacity'], 2, 1, 'academic')
    d.entity('enroll', 'enrollments', ['# enrollment_id', '~ student_id', '~ offering_id', 'grade', 'grade_points', 'status'], 2, 0, 'academic')
    d.entity('timetable', 'timetable', ['# timetable_id', '~ offering_id', '~ faculty_id', 'day_of_week', 'start_time', 'end_time', 'room_number'], 3, 0, 'academic')

    # ---- module 1 admissions --------------------------------------------- #
    d.entity('admissions', 'admissions', ['# admission_id', 'application_no', '~ program_id', 'entrance_score', 'application_date', 'status'], 1, 4, 'student')
    d.entity('guardians', 'guardians', ['# guardian_id', '~ student_id', 'name', 'relation', 'phone'], 0, 4, 'student')

    # ---- module 3 attendance --------------------------------------------- #
    d.entity('sessions', 'class_sessions', ['# session_id', '~ offering_id', '~ faculty_id', 'session_date', 'session_no', 'status'], 4, 1, 'attend')
    d.entity('attendance', 'attendance', ['# attendance_id', '~ session_id', '~ student_id', '~ offering_id', 'status', 'marked_by'], 4, 0, 'attend')

    # ---- module 4 examinations ------------------------------------------- #
    d.entity('exams', 'exams', ['# exam_id', 'exam_code', 'exam_type', '~ semester_id', 'min_attendance_required', 'status'], 5, 2, 'exam')
    d.entity('schedule', 'exam_schedules', ['# schedule_id', '~ exam_id', '~ subject_id', 'exam_date', 'start_time', 'room_number'], 5, 3, 'exam')
    d.entity('reg', 'exam_registrations', ['# registration_id', '~ exam_id', '~ student_id', '~ offering_id', 'attendance_percentage', 'is_eligible', 'hall_ticket_no'], 5, 1, 'exam')
    d.entity('marks', 'marks', ['# mark_id', '~ registration_id', 'marks_obtained', 'grade', 'grade_points', 'is_absent'], 5, 0, 'exam')
    d.entity('results', 'results', ['# result_id', '~ student_id', '~ semester_id', 'sgpa', 'cgpa', 'backlog_count'], 6, 0, 'exam')

    # ---- module 5 finance ------------------------------------------------- #
    d.entity('feestruct', 'fee_structures', ['# fee_structure_id', '~ program_id', 'semester_no', 'amount', 'component'], 2, 5, 'finance')
    d.entity('studentfees', 'student_fees', ['# student_fee_id', '~ student_id', '~ fee_structure_id', 'total_amount', 'paid_amount', 'due_amount', 'status'], 3, 5, 'finance')
    d.entity('payments', 'payments', ['# payment_id', 'receipt_no', '~ student_fee_id', '~ student_id', 'amount', 'payment_mode', 'status'], 4, 5, 'finance')
    d.entity('scholar', 'scholarships', ['# scholarship_id', 'scholarship_code', 'amount', 'is_percentage', 'max_beneficiaries'], 3, 6, 'finance')
    d.entity('stdscholar', 'student_scholarships', ['# student_scholarship_id', '~ student_id', '~ scholarship_id', 'amount', 'status'], 4, 6, 'finance')

    # ---- module 6 hostel --------------------------------------------------- #
    d.entity('hostels', 'hostels', ['# hostel_id', 'hostel_code', 'name', 'hostel_type', '~ warden_faculty_id'], 0, 6, 'hostel')
    d.entity('rooms', 'rooms', ['# room_id', '~ hostel_id', '~ block_id', 'room_number', 'capacity', 'occupied_count'], 1, 6, 'hostel')
    d.entity('beds', 'beds', ['# bed_id', '~ room_id', 'bed_code', 'status'], 1, 7, 'hostel')
    d.entity('happs', 'hostel_applications', ['# application_id', 'application_no', '~ student_id', '~ hostel_id', 'status'], 0, 7, 'hostel')
    d.entity('alloc', 'room_allocations', ['# allocation_id', '~ student_id', '~ bed_id', '~ room_id', '~ hostel_id', 'rent_amount', 'status'], 2, 7, 'hostel')

    # ---- module 7 faculty --------------------------------------------------- #
    d.entity('leaves', 'faculty_leaves', ['# leave_id', '~ faculty_id', 'leave_type', 'start_date', 'days', 'status', '~ approved_by'], 6, 3, 'faculty')
    d.entity('leavebal', 'leave_balances', ['# balance_id', '~ faculty_id', 'leave_type', 'allotted', 'used'], 7, 3, 'faculty')
    d.entity('payroll', 'payrolls', ['# payroll_id', '~ faculty_id', 'pay_month', 'pay_year', 'gross_salary', 'net_salary', 'status'], 6, 2, 'faculty')
    d.entity('paycomp', 'payroll_components', ['# component_id', '~ payroll_id', 'component_type', 'amount'], 7, 2, 'faculty')

    # ---- system ------------------------------------------------------------- #
    d.entity('notif', 'notifications', ['# notification_id', '~ user_id', 'title', 'type', 'is_read'], 6, 6, 'system')
    d.entity('audit', 'audit_logs', ['# id', '~ actor_user_id', 'action', 'entity', 'entity_id', 'old_value', 'new_value'], 7, 6, 'system')

    # ---- relationships ------------------------------------------------------- #
    d.rel('roles', 'users', '1:N', 'has')
    d.rel('users', 'students', '1:1', 'login')
    d.rel('users', 'faculty', '1:1', 'login')
    d.rel('depts', 'students', '1:N', 'offers')
    d.rel('depts', 'programs', '1:N')
    d.rel('depts', 'subjects', '1:N')
    d.rel('depts', 'faculty', '1:N', 'employs')
    d.rel('faculty', 'depts', '1:1', 'heads', dashed=True)
    d.rel('students', 'admissions', '1:1', 'admitted via', dashed=True)
    d.rel('students', 'guardians', '1:N')
    d.rel('programs', 'students', '1:N')
    d.rel('programs', 'feestruct', '1:N', 'priced by')
    d.rel('subjects', 'offerings', '1:N', 'offered as')
    d.rel('faculty', 'offerings', '1:N', 'teaches')
    d.rel('offerings', 'enroll', '1:N', 'enrols')
    d.rel('students', 'enroll', '1:N')
    d.rel('offerings', 'timetable', '1:N', 'scheduled')
    d.rel('faculty', 'timetable', '1:N')
    d.rel('offerings', 'sessions', '1:N', 'meets')
    d.rel('sessions', 'attendance', '1:N', 'marks')
    d.rel('students', 'attendance', '1:N')
    d.rel('students', 'reg', '1:N', 'registers')
    d.rel('exams', 'reg', '1:N')
    d.rel('exams', 'schedule', '1:N')
    d.rel('offerings', 'reg', '1:N', 'for')
    d.rel('reg', 'marks', '1:1', 'scores')
    d.rel('students', 'results', '1:N', 'published')
    d.rel('students', 'studentfees', '1:N', 'billed')
    d.rel('feestruct', 'studentfees', '1:N', 'generates')
    d.rel('studentfees', 'payments', '1:N', 'paid by')
    d.rel('students', 'payments', '1:N')
    d.rel('scholar', 'stdscholar', '1:N', 'awarded')
    d.rel('students', 'stdscholar', '1:N')
    d.rel('students', 'happs', '1:N', 'applies')
    d.rel('hostels', 'happs', '1:N')
    d.rel('hostels', 'rooms', '1:N', 'contains')
    d.rel('rooms', 'beds', '1:N', 'has')
    d.rel('beds', 'alloc', '1:N', 'occupied by')
    d.rel('students', 'alloc', '1:N')
    d.rel('faculty', 'rooms', '1:1', 'warden', dashed=True)
    d.rel('faculty', 'leaves', '1:N', 'applies')
    d.rel('faculty', 'leavebal', '1:N', 'quota')
    d.rel('faculty', 'payroll', '1:N', 'paid')
    d.rel('payroll', 'paycomp', '1:N', 'breakup')
    d.rel('users', 'notif', '1:N', 'receives')
    d.rel('users', 'audit', '1:N', 'writes')
    return d


# =========================================================================== #
# 2. MODULE 1 — Student & Admission
# =========================================================================== #
def build_student() -> Diagram:
    d = Diagram('module1_student_admission', 'Module 1 — Student & Admission',
                'Application → merit/entrance review → admission → student master → addresses, guardians, '
                'documents, category, and a status history written by triggers.')
    d.entity('roles', 'roles', ['# role_id', 'role_code', 'role_name'], 0, 0, 'core')
    d.entity('users', 'users', ['# user_id', '~ role_id', 'email', 'password_hash', 'is_active'], 0, 1, 'core')
    d.entity('cats', 'categories', ['# category_id', 'category_code', 'name'], 0, 2, 'core')
    d.entity('depts', 'departments', ['# department_id', 'department_code', 'name'], 0, 3, 'core')
    d.entity('programs', 'programs', ['# program_id', 'program_code', 'name', '~ department_id'], 0, 4, 'core')
    d.entity('batches', 'batches', ['# batch_id', 'batch_code', '~ program_id', 'start_year', 'strength'], 0, 5, 'core')

    d.entity('admissions', 'admissions', ['# admission_id', 'application_no', '~ program_id', '~ category_id',
                                          'marks_10', 'marks_12', 'entrance_score', 'application_date',
                                          'status', '~ reviewed_by'], 1, 0, 'student')
    d.entity('students', 'students', ['# student_id', '~ user_id', 'roll_number', 'registration_number',
                                      'first_name', 'last_name', '~ department_id', '~ program_id',
                                      '~ batch_id', '~ category_id', 'current_semester_no', 'status'], 1, 3, 'student')
    d.entity('addresses', 'addresses', ['# address_id', '~ student_id', 'address_type', 'city', 'state', 'pincode'], 2, 1, 'student')
    d.entity('guardians', 'guardians', ['# guardian_id', '~ student_id', 'name', 'relation', 'phone', 'email'], 2, 2, 'student')
    d.entity('docs', 'student_documents', ['# document_id', '~ student_id', 'document_type', 'file_path', 'verified'], 2, 3, 'student')
    d.entity('history', 'student_status_history', ['# history_id', '~ student_id', 'old_status', 'new_status', 'reason', '~ changed_by'], 2, 4, 'student')

    d.rel('roles', 'users', '1:N')
    d.rel('users', 'students', '1:1', 'login')
    d.rel('cats', 'admissions', '1:N', 'reserved under')
    d.rel('programs', 'admissions', '1:N', 'applied to')
    d.rel('admissions', 'students', '1:1', 'converted into', dashed=True)
    d.rel('depts', 'students', '1:N')
    d.rel('programs', 'students', '1:N')
    d.rel('batches', 'students', '1:N', 'member of')
    d.rel('cats', 'students', '1:N')
    d.rel('students', 'addresses', '1:N')
    d.rel('students', 'guardians', '1:N')
    d.rel('students', 'docs', '1:N')
    d.rel('students', 'history', '1:N', 'status changes')
    return d


# =========================================================================== #
# 3. MODULE 2 — Academic & Course
# =========================================================================== #
def build_academic() -> Diagram:
    d = Diagram('module2_academic_course', 'Module 2 — Academic & Course',
                'Departments own programs and subjects; program_subjects maps the curriculum; offerings bind '
                'a subject to a semester, section and teacher; enrolments use sp_bulk_enroll_students.')
    d.entity('years', 'academic_years', ['# academic_year_id', 'year_label', 'start_date', 'is_current'], 0, 0, 'academic')
    d.entity('semesters', 'semesters', ['# semester_id', '~ academic_year_id', 'semester_no', 'name', 'is_current', 'result_published'], 0, 1, 'academic')
    d.entity('depts', 'departments', ['# department_id', 'department_code', 'name'], 0, 2, 'academic')
    d.entity('programs', 'programs', ['# program_id', 'program_code', 'name', '~ department_id', 'duration_years'], 0, 3, 'academic')
    d.entity('sections', 'sections', ['# section_id', 'section_code', '~ program_id', '~ batch_id', 'capacity'], 0, 4, 'academic')

    d.entity('subjects', 'subjects', ['# subject_id', 'subject_code', 'name', 'credits', 'subject_type', '~ department_id'], 1, 1, 'academic')
    d.entity('progsub', 'program_subjects', ['# program_subject_id', '~ program_id', '~ subject_id', 'semester_no', 'is_elective'], 1, 3, 'academic')
    d.entity('offerings', 'course_offerings', ['# offering_id', '~ subject_id', '~ program_id', '~ semester_id',
                                               '~ section_id', '~ faculty_id', 'capacity', 'enrolled_count', 'status'], 2, 1, 'academic')
    d.entity('enroll', 'enrollments', ['# enrollment_id', '~ student_id', '~ offering_id', 'enrolled_on',
                                       '~ enrolled_by', 'grade', 'grade_points', 'status'], 2, 2, 'academic')
    d.entity('timetable', 'timetable', ['# timetable_id', '~ offering_id', '~ section_id', '~ faculty_id',
                                        'day_of_week', 'start_time', 'end_time', 'room_number', 'is_active'], 2, 4, 'academic')
    d.entity('students', 'students', ['# student_id', 'roll_number', '~ program_id', '~ batch_id'], 3, 2, 'core')
    d.entity('faculty', 'faculty', ['# faculty_id', 'employee_code', '~ department_id'], 3, 1, 'faculty')

    d.rel('years', 'semesters', '1:N', 'has')
    d.rel('depts', 'programs', '1:N')
    d.rel('depts', 'subjects', '1:N')
    d.rel('programs', 'progsub', '1:N', 'curriculum')
    d.rel('subjects', 'progsub', '1:N')
    d.rel('programs', 'sections', '1:N')
    d.rel('subjects', 'offerings', '1:N', 'offered as')
    d.rel('semesters', 'offerings', '1:N')
    d.rel('sections', 'offerings', '1:N')
    d.rel('faculty', 'offerings', '1:N', 'teaches')
    d.rel('offerings', 'enroll', '1:N', 'enrols')
    d.rel('students', 'enroll', '1:N')
    d.rel('offerings', 'timetable', '1:N', 'slots')
    d.rel('faculty', 'timetable', '1:N', 'conflict-checked')
    return d


# =========================================================================== #
# 4. MODULE 3 — Attendance
# =========================================================================== #
def build_attendance() -> Diagram:
    d = Diagram('module3_attendance', 'Module 3 — Attendance',
                'A class session is the unit of teaching; attendance records one row per student per session. '
                'v_student_attendance_summary feeds the <75% rule that blocks exam registration.')
    d.entity('offerings', 'course_offerings', ['# offering_id', '~ subject_id', '~ faculty_id', '~ semester_id'], 0, 0, 'academic')
    d.entity('subjects', 'subjects', ['# subject_id', 'subject_code', 'name', 'credits'], 0, 1, 'academic')
    d.entity('sessions', 'class_sessions', ['# session_id', '~ offering_id', '~ faculty_id', '~ semester_id',
                                            'session_date', 'session_no', 'topic', 'room_number', 'status'], 1, 0, 'attend')
    d.entity('attendance', 'attendance', ['# attendance_id', '~ session_id', '~ student_id', '~ offering_id',
                                          '~ semester_id', 'status', 'remarks', '~ marked_by'], 1, 2, 'attend')
    d.entity('students', 'students', ['# student_id', 'roll_number', 'first_name', 'last_name'], 2, 2, 'core')
    d.entity('faculty', 'faculty', ['# faculty_id', 'employee_code', 'first_name', 'last_name'], 2, 0, 'faculty')
    d.entity('summary', 'v_student_attendance_summary (view)', ['student_id', 'offering_id', 'total_classes',
                                                                'present_classes', 'attendance_percentage', 'status'], 1, 4, 'attend')
    d.entity('overall', 'v_student_attendance_overall (view)', ['student_id', 'roll_number', 'total_classes',
                                                                'attended_classes', 'overall_percentage', 'attendance_status'], 2, 4, 'attend')

    d.rel('subjects', 'offerings', '1:N')
    d.rel('faculty', 'offerings', '1:N')
    d.rel('offerings', 'sessions', '1:N', 'conducts')
    d.rel('faculty', 'sessions', '1:N', 'takes')
    d.rel('sessions', 'attendance', '1:N', 'records')
    d.rel('students', 'attendance', '1:N')
    d.rel('offerings', 'attendance', '1:N')
    d.rel('attendance', 'summary', 'N:1', 'aggregated', dashed=True)
    d.rel('attendance', 'overall', 'N:1', 'aggregated', dashed=True)
    return d


# =========================================================================== #
# 5. MODULE 4 — Examination & Results
# =========================================================================== #
def build_exam() -> Diagram:
    d = Diagram('module4_examination_results', 'Module 4 — Examination & Results',
                'Registration is screened by sp_register_student_for_exam (attendance + dues); marks roll up to '
                'results; calculate_student_cgpa() recomputes CGPA; RANK/DENSE_RANK produce toppers.')
    d.entity('exams', 'exams', ['# exam_id', 'exam_code', 'name', 'exam_type', '~ academic_year_id',
                                '~ semester_id', 'registration_start', 'registration_end',
                                'min_attendance_required', 'result_published', 'status'], 0, 0, 'exam')
    d.entity('schedule', 'exam_schedules', ['# schedule_id', '~ exam_id', '~ subject_id', '~ program_id',
                                            'exam_date', 'start_time', 'end_time', 'room_number',
                                            'max_marks', '~ invigilator_id'], 0, 2, 'exam')
    d.entity('reg', 'exam_registrations', ['# registration_id', '~ exam_id', '~ student_id', '~ offering_id',
                                           '~ schedule_id', 'attendance_percentage', 'is_eligible',
                                           'eligibility_reason', 'exemption_granted', 'hall_ticket_no', 'status'], 1, 1, 'exam')
    d.entity('marks', 'marks', ['# mark_id', '~ registration_id', 'marks_obtained', 'max_marks', 'percentage',
                                'grade', 'grade_points', 'is_absent', 'is_pass', '~ entered_by'], 2, 1, 'exam')
    d.entity('grades', 'grades', ['# grade_id', 'grade_code', 'min_percentage', 'max_percentage', 'grade_points', 'is_pass'], 3, 0, 'exam')
    d.entity('results', 'results', ['# result_id', '~ student_id', '~ semester_id', '~ exam_id', 'sgpa', 'cgpa',
                                    'total_credits', 'earned_credits', 'backlog_count', 'result_status'], 2, 3, 'exam')
    d.entity('students', 'students', ['# student_id', 'roll_number', 'first_name', 'last_name'], 3, 3, 'core')
    d.entity('elig', 'v_exam_eligibility (view)', ['student_id', 'offering_id', 'attendance_percentage',
                                                   'required_percentage', 'outstanding_dues', 'is_eligible'], 1, 4, 'exam')
    d.entity('hall', 'v_exam_hall_ticket (view)', ['registration_id', 'roll_number', 'exam_code', 'subject_code',
                                                   'exam_date', 'room_number', 'hall_ticket_no'], 2, 4, 'exam')

    d.rel('exams', 'schedule', '1:N', 'timetable')
    d.rel('exams', 'reg', '1:N', 'registrations')
    d.rel('students', 'reg', '1:N')
    d.rel('schedule', 'reg', '1:N', 'for paper')
    d.rel('reg', 'marks', '1:1', 'scored')
    d.rel('grades', 'marks', '1:N', 'graded by')
    d.rel('reg', 'results', 'N:1', 'rolls up')
    d.rel('students', 'results', '1:N')
    d.rel('reg', 'elig', 'N:1', 'screened by', dashed=True)
    d.rel('reg', 'hall', '1:1', 'prints', dashed=True)
    return d


# =========================================================================== #
# 6. MODULE 5 — Fees & Finance
# =========================================================================== #
def build_finance() -> Diagram:
    d = Diagram('module5_fees_finance', 'Module 5 — Fees & Finance',
                'Fee structures generate student bills; sp_process_fee_payment posts a payment, issues a receipt '
                'and updates the bill inside one transaction; triggers audit every change.')
    d.entity('feestruct', 'fee_structures', ['# fee_structure_id', '~ program_id', 'semester_no',
                                             '~ academic_year_id', 'component', 'amount', 'due_date'], 0, 0, 'finance')
    d.entity('studentfees', 'student_fees', ['# student_fee_id', '~ student_id', '~ fee_structure_id',
                                             '~ semester_id', '~ academic_year_id', 'total_amount',
                                             'scholarship_amount', 'fine_amount', 'paid_amount',
                                             'due_amount', 'status', 'due_date'], 1, 0, 'finance')
    d.entity('payments', 'payments', ['# payment_id', 'receipt_no', 'transaction_id', '~ student_fee_id',
                                      '~ student_id', 'amount', 'payment_mode', 'payment_date',
                                      'status', '~ received_by'], 2, 0, 'finance')
    d.entity('fines', 'fines', ['# fine_id', '~ student_id', '~ student_fee_id', 'fine_type', 'reason',
                                'amount', 'imposed_on', 'status'], 2, 1, 'finance')
    d.entity('refunds', 'refunds', ['# refund_id', '~ payment_id', '~ student_id', 'amount', 'reason',
                                    'refund_mode', 'status'], 2, 2, 'finance')
    d.entity('scholar', 'scholarships', ['# scholarship_id', 'scholarship_code', 'name', 'provider',
                                         'scholarship_type', 'amount', 'is_percentage', 'max_beneficiaries'], 0, 2, 'finance')
    d.entity('stdscholar', 'student_scholarships', ['# student_scholarship_id', '~ student_id', '~ scholarship_id',
                                                    '~ academic_year_id', 'amount', 'sanctioned_on', 'status'], 1, 2, 'finance')
    d.entity('students', 'students', ['# student_id', 'roll_number', 'first_name', 'last_name'], 3, 1, 'core')
    d.entity('feestatus', 'v_student_fee_status (view)', ['student_id', 'total_billed', 'total_paid',
                                                          'total_due', 'overdue_bills', 'overall_fee_status'], 3, 0, 'finance')
    d.entity('daily', 'v_daily_fee_collection (view)', ['payment_date', 'receipts', 'collected', 'payment_mode'], 3, 2, 'finance')

    d.rel('feestruct', 'studentfees', '1:N', 'generates bill')
    d.rel('students', 'studentfees', '1:N', 'billed to')
    d.rel('studentfees', 'payments', '1:N', 'paid by')
    d.rel('students', 'payments', '1:N')
    d.rel('studentfees', 'fines', '1:N', 'late fee')
    d.rel('payments', 'refunds', '1:N', 'refunded')
    d.rel('scholar', 'stdscholar', '1:N', 'awarded')
    d.rel('students', 'stdscholar', '1:N', 'benefits')
    d.rel('studentfees', 'feestatus', 'N:1', 'rolled up', dashed=True)
    d.rel('payments', 'daily', 'N:1', 'rolled up', dashed=True)
    return d


# =========================================================================== #
# 7. MODULE 6 — Hostel
# =========================================================================== #
def build_hostel() -> Diagram:
    d = Diagram('module6_hostel', 'Module 6 — Hostel',
                'Hostels → blocks → rooms → beds. Allocating or vacating a bed fires triggers that keep '
                'rooms.occupied_count and beds.status correct, so vacancy is never stale.')
    d.entity('hostels', 'hostels', ['# hostel_id', 'hostel_code', 'name', 'hostel_type',
                                    '~ warden_faculty_id', 'total_rooms', 'total_beds',
                                    'occupied_beds', 'rent_per_bed', 'status'], 0, 0, 'hostel')
    d.entity('blocks', 'hostel_blocks', ['# block_id', '~ hostel_id', 'block_code', 'name', 'floors', 'status'], 0, 2, 'hostel')
    d.entity('rooms', 'rooms', ['# room_id', '~ hostel_id', '~ block_id', 'room_number', 'floor',
                                'room_type', 'capacity', 'occupied_count', 'rent_per_bed', 'status'], 1, 1, 'hostel')
    d.entity('beds', 'beds', ['# bed_id', '~ room_id', 'bed_code', 'status', 'remarks'], 1, 3, 'hostel')
    d.entity('happs', 'hostel_applications', ['# application_id', 'application_no', '~ student_id', '~ hostel_id',
                                              '~ academic_year_id', 'room_type_pref', 'applied_on',
                                              'status', '~ reviewed_by'], 2, 0, 'hostel')
    d.entity('alloc', 'room_allocations', ['# allocation_id', '~ student_id', '~ bed_id', '~ room_id',
                                           '~ hostel_id', '~ academic_year_id', 'allocated_on',
                                           '~ allocated_by', 'vacated_on', 'rent_amount', 'status'], 2, 2, 'hostel')
    d.entity('transfers', 'room_transfers', ['# transfer_id', '~ allocation_id', '~ from_bed_id', '~ to_bed_id',
                                             'reason', 'transferred_on', '~ approved_by'], 3, 2, 'hostel')
    d.entity('hfees', 'hostel_fees', ['# hostel_fee_id', '~ allocation_id', '~ student_id',
                                      '~ academic_year_id', 'amount', 'paid_amount', 'due_date', 'status'], 3, 3, 'hostel')
    d.entity('students', 'students', ['# student_id', 'roll_number', 'first_name', 'last_name', 'gender'], 3, 0, 'core')
    d.entity('vacancy', 'v_room_vacancy (view)', ['room_id', 'room_number', 'capacity', 'occupied_count',
                                                  'vacant_beds', 'hostel_code'], 1, 4, 'hostel')

    d.rel('hostels', 'blocks', '1:N', 'divided into')
    d.rel('hostels', 'rooms', '1:N')
    d.rel('blocks', 'rooms', '1:N')
    d.rel('rooms', 'beds', '1:N', 'furnished with')
    d.rel('students', 'happs', '1:N', 'applies')
    d.rel('hostels', 'happs', '1:N')
    d.rel('happs', 'alloc', '1:1', 'approved →')
    d.rel('beds', 'alloc', '1:N', 'occupies')
    d.rel('students', 'alloc', '1:N')
    d.rel('alloc', 'transfers', '1:N', 'moves')
    d.rel('alloc', 'hfees', '1:N', 'rent bill')
    d.rel('rooms', 'vacancy', '1:1', 'exposed as', dashed=True)
    return d


# =========================================================================== #
# 8. MODULE 7 — Faculty, Leave & Payroll
# =========================================================================== #
def build_faculty() -> Diagram:
    d = Diagram('module7_faculty_leave_payroll', 'Module 7 — Faculty, Leave & Payroll',
                'Leave applications draw on leave_balances (quota kept honest by '
                'fn_calculate_faculty_leave_balance); sp_generate_monthly_payroll builds every payslip for a '
                'month; payroll_components carry the earnings/deduction breakup.')
    d.entity('design', 'designations', ['# designation_id', 'title', 'grade'], 0, 0, 'faculty')
    d.entity('depts', 'departments', ['# department_id', 'department_code', 'name', '~ hod_faculty_id'], 0, 1, 'faculty')
    d.entity('faculty', 'faculty', ['# faculty_id', '~ user_id', 'employee_code', 'first_name', 'last_name',
                                    '~ designation_id', '~ department_id', 'joining_date',
                                    'employment_type', 'qualification', 'experience_years',
                                    'basic_salary', 'hra', 'da', 'ta', 'pf_percent', 'status'], 1, 0, 'faculty')
    d.entity('fsubjects', 'faculty_subjects', ['# faculty_subject_id', '~ faculty_id', '~ subject_id',
                                               '~ academic_year_id'], 1, 2, 'faculty')
    d.entity('subjects', 'subjects', ['# subject_id', 'subject_code', 'name', 'credits'], 0, 2, 'academic')
    d.entity('leaves', 'faculty_leaves', ['# leave_id', '~ faculty_id', 'leave_type', 'start_date', 'end_date',
                                          'days', 'reason', 'applied_on', 'status', '~ approved_by', 'remarks'], 2, 0, 'faculty')
    d.entity('leavebal', 'leave_balances', ['# balance_id', '~ faculty_id', '~ academic_year_id', 'leave_type',
                                            'allotted', 'used'], 2, 2, 'faculty')
    d.entity('payroll', 'payrolls', ['# payroll_id', '~ faculty_id', 'pay_month', 'pay_year', 'basic', 'hra', 'da',
                                     'ta', 'special_allowance', 'gross_salary', 'pf_deduction',
                                     'professional_tax', 'lop_days', 'lop_amount', 'net_salary',
                                     'working_days', 'status', 'paid_on'], 3, 0, 'faculty')
    d.entity('paycomp', 'payroll_components', ['# component_id', '~ payroll_id', 'component_type',
                                               'component_name', 'amount'], 3, 2, 'faculty')
    d.entity('workload', 'v_faculty_workload (view)', ['faculty_id', 'employee_code', 'full_name',
                                                       'offerings_count', 'students_taught',
                                                       'sessions_taken', 'pending_leaves'], 3, 3, 'faculty')
    d.entity('paysum', 'v_faculty_payroll_summary (view)', ['faculty_id', 'employee_code', 'payslips_issued',
                                                            'ytd_gross', 'ytd_net', 'ytd_pf',
                                                            'casual_leave_balance'], 4, 2, 'faculty')

    d.rel('design', 'faculty', '1:N', 'holds')
    d.rel('depts', 'faculty', '1:N', 'employs')
    d.rel('faculty', 'depts', '1:1', 'heads', dashed=True)
    d.rel('faculty', 'fsubjects', '1:N', 'allotted')
    d.rel('subjects', 'fsubjects', '1:N')
    d.rel('faculty', 'leaves', '1:N', 'applies')
    d.rel('faculty', 'leavebal', '1:N', 'annual quota')
    d.rel('leaves', 'leavebal', 'N:1', 'consumes', dashed=True)
    d.rel('faculty', 'payroll', '1:N', 'payslip')
    d.rel('payroll', 'paycomp', '1:N', 'breakup')
    d.rel('faculty', 'workload', '1:1', 'summarised', dashed=True)
    d.rel('faculty', 'paysum', '1:1', 'year-to-date', dashed=True)
    return d


# =========================================================================== #
DOC_HEADER = """# ER DIAGRAMS

**University Higher Education ERP System** — M7 BATCH, Department of E&TCE

Eight diagrams: one **global** diagram showing how the seven modules share the same student,
faculty and department masters, plus one diagram per module.

| # | Diagram | SVG | Entities | Relationships |
|---|---|---|---|---|
{rows}

Every picture below is produced by `scripts/generate_er_diagrams.py`, so the SVG and the Mermaid
source can never disagree. Regenerate everything with:

```bash
python3 scripts/generate_er_diagrams.py
```

## Notation

| Symbol | Meaning |
|---|---|
| `# column` | Primary key |
| `~ column` | Foreign key |
| `1--` | One — a single tick on the relationship line |
| crow's foot | Many |
| `- - -` | Derived / identifying relationship (enforced by a trigger or exposed by a view) |

## How the modules are joined

* `users` is the single authentication table; `students` and `faculty` each carry a `user_id`, so a person is
  never duplicated across modules.
* `departments`, `programs`, `batches`, `sections` and `subjects` are shared masters used by academics,
  attendance, examinations, fees and faculty alike.
* `students` is referenced by admissions, enrolments, attendance, exam registrations, marks, results, fees,
  hostel applications/allocations and the analytics tables — that is what makes this one ERP instead of
  seven disconnected apps.
* `course_offerings` is the pivot of the academic side: attendance sessions, exam registrations, timetable
  slots and enrolments all hang off it.

---

{bodies}"""


def main():
    here = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    out = os.path.join(here, 'docs', 'er')
    diagrams = [build_global(), build_student(), build_academic(), build_attendance(),
                build_exam(), build_finance(), build_hostel(), build_faculty()]
    rows, bodies = [], []
    for i, d in enumerate(diagrams):
        path = d.render(out)
        slug = os.path.basename(path)
        mmd = d.mermaid()
        with open(os.path.join(out, slug.replace('.svg', '.mmd')), 'w', encoding='utf-8') as fh:
            fh.write(mmd + '\n')
        rows.append(f'| {i} | {d.title} | [`{slug}`](er/{slug}) | {len(d.entities)} | {len(d.relations)} |')
        bodies.append(f'## {d.title}\n')
        bodies.append(f'![{d.title}](er/{slug})\n')
        if d.subtitle:
            bodies.append(f'_{d.subtitle}_\n')
        bodies.append('<details><summary>Mermaid source (paste into any Mermaid renderer)</summary>\n')
        bodies.append('```mermaid')
        bodies.append(mmd)
        bodies.append('```')
        bodies.append('</details>\n')
        print(f'{path}  ({d.width}×{d.height}, {len(d.entities)} entities, {len(d.relations)} relationships)')

    doc = DOC_HEADER.format(rows='\n'.join(rows), bodies='\n'.join(bodies))
    with open(os.path.join(here, 'docs', 'ER_DIAGRAMS.md'), 'w', encoding='utf-8') as fh:
        fh.write(doc + '\n')
    print('wrote docs/ER_DIAGRAMS.md')


if __name__ == '__main__':
    main()
