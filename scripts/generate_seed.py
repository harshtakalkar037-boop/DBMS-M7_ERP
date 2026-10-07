#!/usr/bin/env python3
# =====================================================================================
# generate_seed.py - builds database/04_seed.sql for the University ERP
#
# WHY A GENERATOR?
#   The brief asks for 100+ students, 20+ faculty, 50+ subjects, attendance, marks,
#   fees, hostel, leaves and payroll rows. Hand-writing ~40,000 INSERT rows is error
#   prone and impossible to review. This script generates them deterministically
#   (fixed RNG seed) so every team member produces byte-identical demo data and the
#   volumes can be scaled from the constants below.
#
#   The OUTPUT is a plain .sql file - there is no magic at runtime. The database
#   contains exactly what you can read in database/04_seed.sql.
#
# USAGE:  python3 scripts/generate_seed.py
# =====================================================================================
import json
import os
import random
from datetime import date, timedelta

RNG = random.Random(20260701)          # deterministic: identical output on every run
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "database", "04_seed.sql")
TODAY = date(2026, 10, 6)              # calendar date used to anchor "current" data

# ------------------------------------------------------------------ volumes ---------
STUDENTS_PER_PROGRAM_PER_BATCH = 7     # 6 UG programs x 3 batches x 7      = 126
MTECH_STUDENTS_PER_BATCH       = 6     # 1 PG program  x 2 batches x 6      =  12
N_FACULTY                      = 24
PAST_SESSIONS_PER_OFFERING     = 10    # completed semesters
CURRENT_SESSIONS_PER_OFFERING  = 16    # semesters running right now
SUBJECTS_PER_SEMESTER          = 5
PENDING_ADMISSIONS             = 28    # applications waiting for admin approval

# ------------------------------------------------------------------ passwords -------
HASH_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "password_hashes.json")
if os.path.exists(HASH_FILE):
    HASHES = json.load(open(HASH_FILE))
else:                                  # pragma: no cover - produced by make_hashes.js
    HASHES = {k: "$2a$10$7EqJtq98hPqEX7fNZaFWoOHiYHfMvLbUxvKQp8sVv1xk0n6D0t5Ky"
              for k in ("ADMIN", "FACULTY", "STUDENT", "ACCOUNTANT",
                        "HOSTEL_ADMIN", "EXAM_CELL", "HR")}

# ================================================================ SQL helpers ========
BUF = []


def w(line=""):
    BUF.append(line)


def q(v):
    if v is None:
        return "NULL"
    if isinstance(v, bool):
        return "1" if v else "0"
    if isinstance(v, (int, float)):
        return str(v)
    return "'" + str(v).replace("\\", "\\\\").replace("'", "''") + "'"


def insert(table, cols, rows, chunk=400):
    if not rows:
        return
    w(f"-- {len(rows)} row(s) -> {table}")
    for i in range(0, len(rows), chunk):
        part = rows[i:i + chunk]
        w(f"INSERT INTO `{table}` (`" + "`, `".join(cols) + "`) VALUES")
        w(",\n".join("  (" + ", ".join(q(v) for v in r) + ")" for r in part) + ";")
    w("")


def weekdays(start, end):
    out, d = [], start
    while d <= end:
        if d.weekday() < 6:
            out.append(d)
        d += timedelta(days=1)
    return out


def sample_days(start, end, n):
    """n evenly spaced weekdays between start and end."""
    wd = weekdays(start, end)
    if not wd:
        return [start]
    if len(wd) <= n:
        return wd
    step = len(wd) / float(n)
    return [wd[int(i * step)] for i in range(n)]


# ================================================================ master data ========
DEPARTMENTS = [
    ("ETC",   "Electronics & Telecommunication", "E&TCE"),
    ("CSE",   "Computer Science & Engineering",  "CSE"),
    ("IT",    "Information Technology",          "IT"),
    ("MECH",  "Mechanical Engineering",          "MECH"),
    ("CIVIL", "Civil Engineering",               "CIVIL"),
    ("EEE",   "Electrical & Electronics",        "EEE"),
    ("SH",    "Science & Humanities",            "S&H"),
]
DEPT_ID = {c: i + 1 for i, (c, _, _) in enumerate(DEPARTMENTS)}

DESIGNATIONS = [
    ("PROF",   "Professor",             "AGP-10", 144200, 218200,  8),
    ("ASPROF", "Associate Professor",   "AGP-9",   95000, 207500, 10),
    ("APROF",  "Assistant Professor",   "AGP-8",   57700, 182400, 14),
    ("SLECT",  "Senior Lecturer",       "AGP-7",   45000, 142400, 16),
    ("LECT",   "Lecturer",              "AGP-6",   38000, 125000, 18),
    ("LABASST", "Laboratory Assistant", "AGP-4",   25000,  85000, 20),
]
CATEGORIES = [("GEN", "General"), ("OBC", "Other Backward Class"), ("SC", "Scheduled Caste"),
              ("ST", "Scheduled Tribe"), ("EWS", "Economically Weaker Section"),
              ("PWD", "Person With Disability")]
ROLES = [("ADMIN", "Administrator"), ("FACULTY", "Faculty Member"), ("STUDENT", "Student"),
         ("ACCOUNTANT", "Accountant"), ("HOSTEL_ADMIN", "Hostel Administrator"),
         ("EXAM_CELL", "Examination Cell"), ("HR", "Human Resources")]
ROLE_INDEX = {c: i + 1 for i, (c, _) in enumerate(ROLES)}

# Academic years anchored on the real calendar (today = 2026-10-06)
SEMESTERS = [
    # ay, sem_no, start,        end,          is_current
    (1, 1, date(2024, 7, 1),  date(2024, 11, 30), 0),
    (1, 2, date(2024, 12, 1), date(2025, 4, 30),  0),
    (2, 1, date(2025, 7, 1),  date(2025, 11, 30), 0),
    (2, 2, date(2025, 12, 1), date(2026, 4, 30),  0),
    (2, 3, date(2025, 7, 1),  date(2025, 11, 30), 0),
    (2, 4, date(2025, 12, 1), date(2026, 4, 30),  0),
    (3, 1, date(2026, 7, 1),  date(2026, 11, 30), 0),
    (3, 3, date(2026, 7, 1),  date(2026, 11, 30), 0),
    (3, 5, date(2026, 7, 1),  date(2026, 11, 30), 1),
]
SEM_ID = {(ay, no): i + 1 for i, (ay, no, _, _, _) in enumerate(SEMESTERS)}
SEM_BY_ID = {i + 1: s for i, s in enumerate(SEMESTERS)}
AY_LABEL = {1: "2024-25", 2: "2025-26", 3: "2026-27"}
AY_START = {1: date(2024, 7, 1), 2: date(2025, 7, 1), 3: date(2026, 7, 1)}
AY_END = {1: date(2025, 4, 30), 2: date(2026, 4, 30), 3: date(2027, 4, 30)}

# cohort -> ordered list of (academic_year, semester_no) attended; last one is current
PATH_2024 = [(1, 1), (1, 2), (2, 3), (2, 4), (3, 5)]
PATH_2025 = [(2, 1), (2, 2), (3, 3)]
PATH_2026 = [(3, 1)]

PROGRAMS = [
    ("BTECH-ETC",   "B.Tech. Electronics & Telecommunication", "B.Tech ETC",   "UG", "ETC",   4, 8, 160, 60),
    ("BTECH-CSE",   "B.Tech. Computer Science & Engineering",  "B.Tech CSE",   "UG", "CSE",   4, 8, 160, 60),
    ("BTECH-IT",    "B.Tech. Information Technology",          "B.Tech IT",    "UG", "IT",    4, 8, 160, 60),
    ("BTECH-MECH",  "B.Tech. Mechanical Engineering",          "B.Tech MECH",  "UG", "MECH",  4, 8, 160, 60),
    ("BTECH-CIVIL", "B.Tech. Civil Engineering",               "B.Tech CIVIL", "UG", "CIVIL", 4, 8, 160, 60),
    ("BTECH-EEE",   "B.Tech. Electrical & Electronics",        "B.Tech EEE",   "UG", "EEE",   4, 8, 160, 60),
    ("MTECH-CSE",   "M.Tech. Computer Science & Engineering",  "M.Tech CSE",   "PG", "CSE",   2, 4,  80, 30),
]

SUBJECT_BANK = {
    "ETC": [("Signals & Systems", "THEORY", 4), ("Digital Communication", "THEORY", 4),
            ("Microprocessors & Microcontrollers", "THEORY", 4), ("VLSI Design", "THEORY", 3),
            ("Antenna & Wave Propagation", "THEORY", 3), ("Embedded Systems", "THEORY", 3),
            ("Communication Laboratory", "PRACTICAL", 2), ("Digital Electronics Lab", "PRACTICAL", 2)],
    "CSE": [("Data Structures & Algorithms", "THEORY", 4), ("Database Management Systems", "THEORY", 4),
            ("Operating Systems", "THEORY", 4), ("Computer Networks", "THEORY", 4),
            ("Artificial Intelligence", "THEORY", 3), ("Compiler Design", "THEORY", 3),
            ("DBMS Laboratory", "PRACTICAL", 2), ("Machine Learning", "ELECTIVE", 3)],
    "IT":  [("Web Technologies", "THEORY", 4), ("Software Engineering", "THEORY", 4),
            ("Cloud Computing", "THEORY", 3), ("Cyber Security", "THEORY", 3),
            ("Data Warehousing & Mining", "THEORY", 3), ("Internet of Things", "THEORY", 3),
            ("Web Technology Laboratory", "PRACTICAL", 2), ("Mobile Application Development", "ELECTIVE", 3)],
    "MECH": [("Engineering Thermodynamics", "THEORY", 4), ("Fluid Mechanics", "THEORY", 4),
             ("Theory of Machines", "THEORY", 4), ("Machine Design", "THEORY", 4),
             ("Heat Transfer", "THEORY", 3), ("Manufacturing Processes", "THEORY", 3),
             ("Thermal Engineering Lab", "PRACTICAL", 2), ("CAD/CAM", "ELECTIVE", 3)],
    "CIVIL": [("Strength of Materials", "THEORY", 4), ("Structural Analysis", "THEORY", 4),
              ("Concrete Technology", "THEORY", 3), ("Geotechnical Engineering", "THEORY", 4),
              ("Hydraulics", "THEORY", 3), ("Surveying", "THEORY", 3),
              ("Concrete Laboratory", "PRACTICAL", 2), ("Environmental Engineering", "ELECTIVE", 3)],
    "EEE": [("Electrical Machines - I", "THEORY", 4), ("Power Systems", "THEORY", 4),
            ("Control Systems", "THEORY", 4), ("Power Electronics", "THEORY", 3),
            ("Electrical Measurements", "THEORY", 3), ("Switchgear & Protection", "THEORY", 3),
            ("Electrical Machines Lab", "PRACTICAL", 2), ("Renewable Energy Systems", "ELECTIVE", 3)],
    "SH":  [("Engineering Mathematics - I", "THEORY", 4), ("Engineering Mathematics - II", "THEORY", 4),
            ("Engineering Physics", "THEORY", 3), ("Engineering Chemistry", "THEORY", 3),
            ("Professional Communication", "THEORY", 2), ("Environmental Studies", "THEORY", 2),
            ("Engineering Graphics", "PRACTICAL", 2), ("Constitution of India", "THEORY", 2)],
}

FIRST_MALE = ["Aarav", "Aditya", "Aryan", "Athirva", "Chetan", "Dhruv", "Gaurav", "Harsh", "Ishaan",
              "Jayesh", "Karan", "Kunal", "Lokesh", "Manish", "Nikhil", "Omkar", "Pranav", "Rahul",
              "Rohit", "Sahil", "Sanket", "Shubham", "Siddharth", "Soham", "Tanmay", "Tejas",
              "Vaibhav", "Vikram", "Vishal", "Yash", "Aniket", "Bhushan", "Chaitanya", "Digvijay"]
FIRST_FEMALE = ["Aditi", "Akanksha", "Ananya", "Anjali", "Bhavana", "Diksha", "Divya", "Gayatri",
                "Ishwari", "Kajal", "Komal", "Madhavi", "Manasi", "Neha", "Nikita", "Pallavi",
                "Pooja", "Prachi", "Priya", "Ruchita", "Rutuja", "Sakshi", "Shreya", "Sneha",
                "Sonali", "Swati", "Tanvi", "Tejaswini", "Vaishnavi", "Vidya", "Yamini", "Riya"]
LAST = ["Patil", "Deshmukh", "Joshi", "Kulkarni", "Shinde", "More", "Jadhav", "Pawar", "Chavan",
        "Gaikwad", "Wagh", "Kadam", "Nikam", "Salunkhe", "Bhosale", "Sawant", "Kale", "Bhandari",
        "Rane", "Mane", "Ghorpade", "Ingale", "Khot", "Nalawade", "Thorat", "Zambre", "Gite"]
CITIES = [("Pune", "Pune", "Maharashtra", "411001"), ("Mumbai", "Mumbai", "Maharashtra", "400001"),
          ("Nashik", "Nashik", "Maharashtra", "422001"), ("Nagpur", "Nagpur", "Maharashtra", "440001"),
          ("Aurangabad", "Aurangabad", "Maharashtra", "431001"), ("Kolhapur", "Kolhapur", "Maharashtra", "416001"),
          ("Solapur", "Solapur", "Maharashtra", "413001"), ("Satara", "Satara", "Maharashtra", "415001"),
          ("Indore", "Indore", "Madhya Pradesh", "452001"), ("Jaipur", "Jaipur", "Rajasthan", "302001")]

GRADE_TABLE = [(90, "AA", 10.00), (80, "AB", 9.00), (70, "BB", 8.00), (60, "BC", 7.00),
               (50, "CC", 6.00), (45, "CD", 5.00), (40, "DD", 4.00), (0, "FF", 0.00)]


def grade_for(pct):
    for lo, code, pts in GRADE_TABLE:
        if pct >= lo:
            return code, pts
    return "FF", 0.00


# ================================================================ build ==============
w("""-- =====================================================================================
-- FILE   : 04_seed.sql  (GENERATED FILE - do not hand edit)
-- SOURCE : scripts/generate_seed.py   (deterministic, RNG seed 20260701)
-- PURPOSE: Realistic, fully interlinked demo data for every module of the ERP:
--            Student -> enrollment -> attendance -> exam eligibility -> registration
--                    -> marks -> result -> SGPA -> CGPA
--            Student -> fee structure -> bill -> payment -> receipt -> ledger
--            Student -> hostel application -> bed allocation -> occupancy
--            Faculty -> designation -> leave -> payroll -> payslip
-- ORDER  : masters first, dependents after. Safe to reload after a database reset.
-- =====================================================================================

USE `university_erp`;
SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;
SET UNIQUE_CHECKS = 0;
""")

# ------------------------------------------------------------------ masters ---------
insert("roles", ["role_code", "role_name", "description"],
       [(c, n, f"{n} role of the University ERP") for c, n in ROLES])
insert("departments", ["department_code", "name", "short_name", "email", "phone",
                       "established_year", "status"],
       [(c, n, s, f"hod.{c.lower()}@vpit.edu.in", f"0202{RNG.randint(1000000, 9999999)}",
         RNG.randint(1985, 2012), "ACTIVE") for c, n, s in DEPARTMENTS])
insert("designations", ["designation_code", "title", "grade", "min_basic_pay", "max_basic_pay",
                        "teaching_hours_per_week"], DESIGNATIONS)
insert("categories", ["category_code", "name", "description"],
       [(c, n, f"{n} category") for c, n in CATEGORIES])
insert("academic_years", ["year_label", "start_date", "end_date", "is_current", "status"],
       [(AY_LABEL[1], AY_START[1], AY_END[1], 0, "CLOSED"),
        (AY_LABEL[2], AY_START[2], AY_END[2], 0, "CLOSED"),
        (AY_LABEL[3], AY_START[3], AY_END[3], 1, "ACTIVE")])
insert("semesters", ["academic_year_id", "semester_no", "name", "start_date", "end_date",
                     "is_current", "result_published"],
       [(ay, no, f"Semester {no}", s, e, cur, 0) for (ay, no, s, e, cur) in SEMESTERS])

prog_rows = [(code, name, short, level, DEPT_ID[dept], dur, sems, cred, intake, "ACTIVE")
             for code, name, short, level, dept, dur, sems, cred, intake in PROGRAMS]
insert("programs", ["program_code", "name", "short_name", "level", "department_id",
                    "duration_years", "total_semesters", "total_credits", "intake", "status"],
       prog_rows)
PROG_ID = {row[0]: i + 1 for i, row in enumerate(prog_rows)}

batch_rows, batch_meta = [], []
for code, _, _, level, dept, *_ in PROGRAMS:
    for y in ([2024, 2025] if level == "PG" else [2024, 2025, 2026]):
        path = {2024: PATH_2024, 2025: PATH_2025, 2026: PATH_2026}[y]
        batch_rows.append((f"{code}-{y}", PROG_ID[code], y - 2023, y,
                           y + (2 if level == "PG" else 4), path[-1][1], 0, "ACTIVE"))
        batch_meta.append(dict(code=f"{code}-{y}", program=code, year=y, level=level,
                               dept=dept, path=path, current_sem_no=path[-1][1]))
insert("batches", ["batch_code", "program_id", "academic_year_id", "start_year", "end_year",
                   "current_semester_no", "strength", "status"], batch_rows)
BATCH_ID = {b["code"]: i + 1 for i, b in enumerate(batch_meta)}

sec_rows = []
for b in batch_meta:
    sec_rows.append(("A", PROG_ID[b["program"]], BATCH_ID[b["code"]],
                     SEM_ID[b["path"][-1]], 60, f"R{101 + len(sec_rows) % 20}", "ACTIVE"))
    b["section_id"] = len(sec_rows)
insert("sections", ["section_code", "program_id", "batch_id", "semester_id", "capacity",
                    "room_number", "status"], sec_rows)

subj_rows, subject_pool = [], {}
for dept, items in SUBJECT_BANK.items():
    subject_pool[dept] = []
    for name, stype, cred in items:
        idx = len(subj_rows) + 1
        subj_rows.append((f"{dept}{100 + idx}", name, name[:30], cred,
                          stype, DEPT_ID[dept], 3, 1, 2 if stype == "PRACTICAL" else 0,
                          1 if stype == "ELECTIVE" else 0, "ACTIVE"))
        subject_pool[dept].append((idx, cred))
insert("subjects", ["subject_code", "name", "short_name", "credits", "subject_type",
                    "department_id", "lecture_hours", "tutorial_hours", "practical_hours",
                    "is_elective", "status"], subj_rows)
SUBJ_CREDITS = {i: r[3] for i, r in enumerate(subj_rows, 1)}
SUBJ_NAME = {i: r[1] for i, r in enumerate(subj_rows, 1)}
ELECTIVE_NAMES = ("Mining", "Learning", "CAM", "India", "Development")

cur_rows = []
for b in batch_meta:
    pool = subject_pool[b["dept"]] + subject_pool["SH"]
    for sem_no in range(1, (5 if b["level"] == "PG" else 9)):
        for k in range(SUBJECTS_PER_SEMESTER):
            sid = pool[(5 * (sem_no - 1) + k) % len(pool)][0]
            row = (PROG_ID[b["program"]], sid, sem_no,
                   1 if SUBJ_NAME[sid].endswith(ELECTIVE_NAMES) else 0)
            if row not in cur_rows:
                cur_rows.append(row)
insert("program_subjects", ["program_id", "subject_id", "semester_no", "is_elective"], cur_rows)

# ------------------------------------------------------------------ users -----------
users, user_role, uid = [], {}, [0]


def add_user(role_code, email, phone=None):
    uid[0] += 1
    users.append((ROLE_INDEX[role_code], email, HASHES[role_code], phone, 1, 0, None, 0, None))
    user_role[email] = role_code
    return uid[0]


ADMIN_UID = add_user("ADMIN", "admin@vpit.edu.in", "9000000001")
ACC_UID = add_user("ACCOUNTANT", "accountant@vpit.edu.in", "9000000002")
HOSTEL_UID = add_user("HOSTEL_ADMIN", "hostel.admin@vpit.edu.in", "9000000003")
EXAM_UID = add_user("EXAM_CELL", "examcell@vpit.edu.in", "9000000004")
HR_UID = add_user("HR", "hr@vpit.edu.in", "9000000005")

faculty_rows, fac_meta = [], []
for i in range(N_FACULTY):
    gender = "FEMALE" if i % 3 == 0 else "MALE"
    first = RNG.choice(FIRST_FEMALE if gender == "FEMALE" else FIRST_MALE)
    last = RNG.choice(LAST)
    dept = DEPARTMENTS[i % len(DEPARTMENTS)][0]
    desig = DESIGNATIONS[min(len(DESIGNATIONS) - 1, (i % 5) + 1)]
    email = f"{first.lower()}.{last.lower()}@vpit.edu.in"
    if email in user_role:
        email = f"{first.lower()}.{last.lower()}{i}@vpit.edu.in"
    fuid = add_user("FACULTY", email, f"9{RNG.randint(100000000, 999999999)}")
    basic = float(round(RNG.uniform(desig[3] * 0.55, desig[3] * 0.95) / 500.0) * 500)
    faculty_rows.append((
        fuid, f"EMP-{1001 + i}", first, last, email, f"9{RNG.randint(100000000, 999999999)}",
        date(RNG.randint(1968, 1995), RNG.randint(1, 12), RNG.randint(1, 28)), gender,
        (i % 5) + 2, DEPT_ID[dept],
        date(RNG.randint(2008, 2024), RNG.randint(1, 12), RNG.randint(1, 28)),
        "REGULAR" if i % 7 else "CONTRACT",
        RNG.choice(["Ph.D.", "M.Tech.", "M.E.", "M.Tech., Ph.D. (Pursuing)"]),
        RNG.choice(["VLSI", "Machine Learning", "Structural Engineering", "Thermal Engineering",
                    "Power Systems", "Network Security", "Applied Mathematics", "Signal Processing"]),
        RNG.randint(2, 28), basic, round(basic * 0.40, 2), round(basic * 0.17, 2),
        round(basic * 0.05, 2), round(basic * 0.12, 2), 12.00,
        f"SBIN{RNG.randint(10 ** 11, 10 ** 12 - 1)}", "ACTIVE"))
    fac_meta.append(dict(id=i + 1, name=f"{first} {last}", dept=dept, email=email,
                         user_id=fuid, basic=basic))
insert("faculty", ["user_id", "employee_code", "first_name", "last_name", "email", "phone",
                   "date_of_birth", "gender", "designation_id", "department_id", "joining_date",
                   "employment_type", "qualification", "specialization", "experience_years",
                   "basic_salary", "hra", "da", "ta", "special_allowance", "pf_percent",
                   "bank_account", "status"], faculty_rows)

student_rows, stu_meta = [], []
for b in batch_meta:
    n = MTECH_STUDENTS_PER_BATCH if b["level"] == "PG" else STUDENTS_PER_PROGRAM_PER_BATCH
    for k in range(n):
        gender = "FEMALE" if RNG.random() < 0.42 else "MALE"
        first = RNG.choice(FIRST_FEMALE if gender == "FEMALE" else FIRST_MALE)
        last = RNG.choice(LAST)
        tag = b["program"].replace("BTECH-", "").replace("MTECH-", "M")
        roll = f"{b['year']}{tag}{1001 + k}"
        email = f"{roll.lower()}@vpit.edu.in"
        suid = add_user("STUDENT", email, f"8{RNG.randint(100000000, 999999999)}")
        cat = RNG.choices([1, 2, 3, 4, 5, 6], weights=[38, 27, 15, 8, 10, 2])[0]
        status = RNG.choices(["ACTIVE"] * 8 + ["SUSPENDED", "INACTIVE"],
                             weights=[12] * 8 + [1, 1])[0]
        student_rows.append((
            suid, roll, f"VPIT/{b['year']}/{tag}/{1001 + k}", first, None, last, email,
            f"8{RNG.randint(100000000, 999999999)}",
            date(RNG.randint(2003, 2008), RNG.randint(1, 12), RNG.randint(1, 28)), gender,
            RNG.choice(["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"]), "Indian",
            cat, DEPT_ID[b["dept"]], PROG_ID[b["program"]], BATCH_ID[b["code"]], b["year"],
            date(b["year"], 7, 15), b["current_sem_no"], status, None,
            f"9{RNG.randint(100000000, 999999999)}"))
        stu_meta.append(dict(id=len(student_rows), roll=roll, name=f"{first} {last}",
                             first=first, last=last, batch=b, email=email, user_id=suid,
                             category=cat, gender=gender, status=status, dept=b["dept"],
                             program=b["program"], level=b["level"]))
insert("students", ["user_id", "roll_number", "registration_number", "first_name", "middle_name",
                    "last_name", "email", "phone", "date_of_birth", "gender", "blood_group",
                    "nationality", "category_id", "department_id", "program_id", "batch_id",
                    "admission_year", "admission_date", "current_semester_no", "status",
                    "photo_url", "emergency_contact"], student_rows)
N_STUDENTS = len(student_rows)

insert("users", ["role_id", "email", "password_hash", "phone", "is_active", "is_first_login",
                 "last_login_at", "failed_attempts", "locked_until"], users)

addr_rows, guard_rows, doc_rows = [], [], []
for s in stu_meta:
    city, district, state, pin = RNG.choice(CITIES)
    addr_rows.append((s["id"], "PERMANENT",
                      f"{RNG.randint(1, 999)} {RNG.choice(['Ganesh', 'Shivaji', 'Tilak', 'Nehru', 'MG'])} Nagar",
                      f"Near {RNG.choice(['Bus Stand', 'Temple', 'Market', 'Railway Station'])}",
                      city, district, state, pin, "India", 1))
    hc = RNG.choice(CITIES)
    addr_rows.append((s["id"], "CORRESPONDENCE",
                      f"Room {RNG.randint(1, 60)}, {RNG.choice(['Sai', 'Krishna', 'Annapurna'])} Hostel",
                      None, hc[0], hc[1], hc[2], hc[3], "India", 0))
    guard_rows.append((s["id"], f"{RNG.choice(FIRST_MALE)} {s['last']}", "FATHER",
                       f"9{RNG.randint(100000000, 999999999)}",
                       f"{s['first'].lower()}.father@vpit.edu.in",
                       RNG.choice(["Service", "Business", "Farmer", "Teacher", "Engineer", "Doctor"]),
                       round(RNG.uniform(180000, 1500000), 2), 1))
    guard_rows.append((s["id"], f"{RNG.choice(FIRST_FEMALE)} {s['last']}", "MOTHER",
                       f"9{RNG.randint(100000000, 999999999)}",
                       f"{s['first'].lower()}.mother@vpit.edu.in",
                       RNG.choice(["Homemaker", "Teacher", "Nurse", "Service", "Business"]),
                       round(RNG.uniform(120000, 900000), 2), 0))
    for dtype, ext in [("MARKSHEET_10", "pdf"), ("AADHAR", "pdf"), ("PHOTO", "jpg")]:
        doc_rows.append((s["id"], dtype, f"{s['roll']}_{dtype.lower()}.{ext}",
                         f"/uploads/students/{s['roll']}/{dtype.lower()}.{ext}",
                         "application/pdf" if ext == "pdf" else "image/jpeg",
                         RNG.randint(45000, 850000), 1 if RNG.random() < 0.85 else 0,
                         ADMIN_UID, None))
insert("addresses", ["student_id", "address_type", "line1", "line2", "city", "district",
                     "state", "pincode", "country", "is_primary"], addr_rows)
insert("guardians", ["student_id", "name", "relation", "phone", "email", "occupation",
                     "annual_income", "is_primary"], guard_rows)
insert("student_documents", ["student_id", "doc_type", "file_name", "file_path", "mime_type",
                             "size_bytes", "is_verified", "verified_by", "verified_at"], doc_rows)

adm_rows = []
for i, s in enumerate(stu_meta):
    b = s["batch"]
    adm_rows.append((f"APP-{b['year']}-{10001 + i}", s["id"], b["year"] - 2023,
                     PROG_ID[s["program"]], s["category"], s["first"], s["last"], s["email"],
                     f"8{RNG.randint(100000000, 999999999)}",
                     date(RNG.randint(2003, 2008), RNG.randint(1, 12), RNG.randint(1, 28)),
                     s["gender"], f"{RNG.choice(FIRST_MALE)} {s['last']}",
                     f"9{RNG.randint(100000000, 999999999)}",
                     RNG.choice(["Savitribai Phule Vidyalaya", "Modern High School",
                                 "Kendriya Vidyalaya", "St. Xaviers School"]),
                     "HSC", round(RNG.uniform(62, 96), 2), round(RNG.uniform(58, 94), 2),
                     round(RNG.uniform(45, 132), 2), "12/A, Model Colony", "Pune",
                     "Maharashtra", "411007", date(b["year"], RNG.randint(3, 6), RNG.randint(1, 28)),
                     "APPROVED", ADMIN_UID, date(b["year"], 6, 20), "Eligible - merit list"))
for i in range(PENDING_ADMISSIONS):
    gender = "FEMALE" if RNG.random() < 0.45 else "MALE"
    first = RNG.choice(FIRST_FEMALE if gender == "FEMALE" else FIRST_MALE)
    last = RNG.choice(LAST)
    prog = PROGRAMS[RNG.randrange(6)][0]
    adm_rows.append((f"APP-2026-{20001 + i}", None, 3, PROG_ID[prog],
                     RNG.choices([1, 2, 3, 4, 5], weights=[35, 30, 18, 8, 9])[0],
                     first, last, f"applicant.{20001 + i}@gmail.com",
                     f"8{RNG.randint(100000000, 999999999)}",
                     date(RNG.randint(2005, 2009), RNG.randint(1, 12), RNG.randint(1, 28)),
                     gender, f"{RNG.choice(FIRST_MALE)} {last}",
                     f"9{RNG.randint(100000000, 999999999)}",
                     RNG.choice(["New English School", "Vidya Niketan", "Bharati Vidyapeeth"]),
                     "HSC", round(RNG.uniform(55, 97), 2), round(RNG.uniform(52, 95), 2),
                     round(RNG.uniform(30, 140), 2), "45, Laxmi Road", "Pune",
                     "Maharashtra", "411002", date(2026, RNG.randint(8, 9), RNG.randint(1, 28)),
                     RNG.choice(["APPLIED", "APPLIED", "UNDER_REVIEW", "WAITLISTED"]),
                     None, None, None))
insert("admissions", ["application_no", "student_id", "academic_year_id", "program_id",
                      "category_id", "first_name", "last_name", "email", "phone", "date_of_birth",
                      "gender", "guardian_name", "guardian_phone", "previous_school",
                      "qualification", "marks_10", "marks_12", "entrance_score", "address_line1",
                      "city", "state", "pincode", "application_date", "status", "reviewed_by",
                      "reviewed_at", "remarks"], adm_rows)

# ------------------------------------------------------------------ academics -------
off_rows, offering_meta, offer_key = [], [], {}
for b in batch_meta:
    pool = subject_pool[b["dept"]] + subject_pool["SH"]
    for (ay, sem_no) in b["path"]:
        for k in range(SUBJECTS_PER_SEMESTER):
            sid = pool[(5 * (sem_no - 1) + k) % len(pool)][0]
            key = (PROG_ID[b["program"]], sid, SEM_ID[(ay, sem_no)])
            if key in offer_key:
                continue
            offer_key[key] = len(off_rows) + 1
            off_rows.append((sid, SEM_ID[(ay, sem_no)], ay, PROG_ID[b["program"]],
                             b["section_id"], fac_meta[RNG.randrange(N_FACULTY)]["id"], 60, 0,
                             "ELECTIVE" if SUBJ_NAME[sid].endswith(ELECTIVE_NAMES) else "REGULAR",
                             "OPEN" if ay == 3 else "COMPLETED"))
            offering_meta.append(dict(id=len(off_rows), subject=sid,
                                      semester=SEM_ID[(ay, sem_no)], ay=ay, sem_no=sem_no,
                                      program=b["program"], section=b["section_id"],
                                      faculty=off_rows[-1][5], is_current=(ay == 3)))
insert("course_offerings", ["subject_id", "semester_id", "academic_year_id", "program_id",
                            "section_id", "faculty_id", "capacity", "enrolled_count",
                            "offering_type", "status"], off_rows)

fs_pairs = sorted({(o["faculty"], o["subject"], o["ay"], o["semester"]) for o in offering_meta})
insert("faculty_subjects", ["faculty_id", "subject_id", "academic_year_id", "semester_id",
                            "is_primary", "assigned_on"],
       [(f, s, ay, sem, 1, date(2026, 7, 1)) for f, s, ay, sem in fs_pairs])

enr_rows, student_offerings = [], {}
for s in stu_meta:
    b = s["batch"]
    pool = subject_pool[b["dept"]] + subject_pool["SH"]
    s_off = []
    for (ay, sem_no) in b["path"]:
        for k in range(SUBJECTS_PER_SEMESTER):
            sid = pool[(5 * (sem_no - 1) + k) % len(pool)][0]
            oid = offer_key[(PROG_ID[b["program"]], sid, SEM_ID[(ay, sem_no)])]
            last = (ay, sem_no) == b["path"][-1]
            enr_rows.append((s["id"], oid, date(2024 if ay == 1 else (2025 if ay == 2 else 2026), 7, 10),
                             ADMIN_UID, None, None,
                             "ENROLLED" if last else ("PASSED" if RNG.random() > 0.04 else "FAILED")))
            s_off.append((oid, sid, SEM_ID[(ay, sem_no)], sem_no, last))
    student_offerings[s["id"]] = s_off
insert("enrollments", ["student_id", "offering_id", "enrolled_on", "enrolled_by", "grade",
                       "grade_points", "status"], enr_rows)

sess_rows, offering_sessions, SESSION_DATE = [], {}, {}
for o in offering_meta:
    ay, no, sdate, edate, _ = SEM_BY_ID[o["semester"]]
    n = CURRENT_SESSIONS_PER_OFFERING if o["is_current"] else PAST_SESSIONS_PER_OFFERING
    days = (sample_days(sdate, date(2026, 10, 5), n) if o["is_current"]
            else sample_days(sdate, sdate + timedelta(days=75), n))
    offering_sessions[o["id"]] = []
    for idx, dd in enumerate(days):
        sess_rows.append((o["id"], o["faculty"], o["semester"], dd, idx + 1,
                          f"Unit {idx % 5 + 1} - {SUBJ_NAME[o['subject']][:38]}",
                          f"R{101 + (o['id'] % 20)}", "09:00:00", "10:00:00", "COMPLETED"))
        offering_sessions[o["id"]].append(len(sess_rows))
        SESSION_DATE[len(sess_rows)] = dd
insert("class_sessions", ["offering_id", "faculty_id", "semester_id", "session_date", "session_no",
                          "topic", "room_number", "start_time", "end_time", "status"], sess_rows)

# attendance: per (student, subject) propensity so a realistic minority falls below 75%
att_rows, att_stats = [], {}
for s in stu_meta:
    base = RNG.choices([0.95, 0.89, 0.83, 0.77, 0.69, 0.58], weights=[28, 26, 19, 13, 9, 5])[0]
    for oid, sid_, sem_id, sem_no, is_cur in student_offerings[s["id"]]:
        p = min(1.0, max(0.30, base + RNG.uniform(-0.13, 0.13)))
        present = total = 0
        for sess_id in offering_sessions[oid]:
            r = RNG.random()
            if r < p:
                st, present = ("PRESENT", present + 1) if r > p * 0.05 else ("LATE", present + 1)
            else:
                st = "ABSENT"
            total += 1
            att_rows.append((sess_id, s["id"], oid, sem_id, st, None, ADMIN_UID,
                             f"{SESSION_DATE[sess_id]} 09:05:00"))
        att_stats[(s["id"], oid)] = (present, total)
insert("attendance", ["session_id", "student_id", "offering_id", "semester_id", "status",
                      "remarks", "marked_by", "marked_at"], att_rows)

low = sum(1 for _, (p_, t) in att_stats.items() if t and p_ * 100.0 / t < 75)
w(f"-- attendance: {len(att_stats)} (student, subject) records, {low} below the 75% threshold")
w("")

# ------------------------------------------------------------------ examinations ----
exam_rows, exam_meta = [], []
for (ay, no, sdate, edate, cur) in SEMESTERS:
    if ay == 3:
        continue          # academic year 2026-27 is running: see the two loops below
    exam_rows.append((f"ENDSEM-{AY_LABEL[ay]}-S{no}",
                      f"End Semester Examination - Semester {no} ({AY_LABEL[ay]})", "ENDSEM",
                      ay, SEM_ID[(ay, no)], edate - timedelta(days=25), edate - timedelta(days=10),
                      edate - timedelta(days=45), edate - timedelta(days=30), 1,
                      f"{edate} 15:00:00", 75.00, "PUBLISHED"))
    exam_meta.append(dict(id=len(exam_rows), type="ENDSEM", semester=SEM_ID[(ay, no)], ay=ay,
                          sem_no=no, has_marks=True, max_marks=100))
# mid-term exams of the running semesters (marks entered, results not published)
for (ay, no) in [(3, 1), (3, 3), (3, 5)]:
    exam_rows.append((f"MID-2026-27-S{no}",
                      f"Mid Semester Examination - Semester {no} (2026-27)", "MIDTERM",
                      3, SEM_ID[(ay, no)], date(2026, 9, 5), date(2026, 9, 12),
                      date(2026, 8, 25), date(2026, 9, 1), 0, None, 75.00, "COMPLETED"))
    exam_meta.append(dict(id=len(exam_rows), type="MIDTERM", semester=SEM_ID[(ay, no)], ay=3,
                          sem_no=no, has_marks=True, max_marks=50))
# end-semester exams of the running semesters - registration OPEN (no marks yet)
for (ay, no) in [(3, 1), (3, 3), (3, 5)]:
    exam_rows.append((f"ENDSEM-2026-27-S{no}",
                      f"End Semester Examination - Semester {no} (2026-27)", "ENDSEM",
                      3, SEM_ID[(ay, no)], date(2026, 11, 10), date(2026, 11, 24),
                      date(2026, 10, 1), date(2026, 10, 25), 0, None, 75.00, "REGISTRATION_OPEN"))
    exam_meta.append(dict(id=len(exam_rows), type="ENDSEM", semester=SEM_ID[(ay, no)], ay=3,
                          sem_no=no, has_marks=False, max_marks=100))
insert("exams", ["exam_code", "name", "exam_type", "academic_year_id", "semester_id", "start_date",
                 "end_date", "registration_start", "registration_end", "result_published",
                 "published_on", "min_attendance_required", "status"], exam_rows)
OPEN_EXAMS = {e["id"]: e for e in exam_meta if not e["has_marks"]}

sched_rows, sched_key = [], {}
# `g` is a GLOBAL counter across every exam. The room label HALL-<letter><number> is
# derived as (g % 6, g // 6) which is a bijection over the non-negative integers, so no
# two schedule rows can ever share (exam_date, start_time, room_number) - the UNIQUE key
# uq_exam_schedules_room would otherwise reject the seed.
g = 0
for e in exam_meta:
    if e["type"] != "ENDSEM":
        continue
    programs_for_sem = sorted({o["program"] for o in offering_meta if o["semester"] == e["semester"]})
    for prog in programs_for_sem:
        subs = sorted({o["subject"] for o in offering_meta
                       if o["semester"] == e["semester"] and o["program"] == prog})
        for sub in subs:
            if e["ay"] == 3:                       # examinations scheduled for Nov 2026
                exam_day = date(2026, 11, 10) + timedelta(days=(g % 10))
            else:
                exam_day = SEM_BY_ID[e["semester"]][3] - timedelta(days=20 - (g % 8))
            room = f"HALL-{chr(65 + g % 6)}{101 + (g // 6)}"
            start = "09:30:00" if g % 2 == 0 else "13:30:00"
            end = "12:30:00" if g % 2 == 0 else "16:30:00"
            sched_rows.append((e["id"], sub, PROG_ID[prog], exam_day, start, end,
                               room, e["max_marks"], 40, fac_meta[g % N_FACULTY]["id"]))
            sched_key[(e["id"], sub, PROG_ID[prog])] = len(sched_rows)
            g += 1
insert("exam_schedules", ["exam_id", "subject_id", "program_id", "exam_date", "start_time",
                          "end_time", "room_number", "max_marks", "min_marks", "invigilator_id"],
       sched_rows)

reg_rows, mark_rows = [], []
reg_id = 0
for s in stu_meta:
    b = s["batch"]
    pool = subject_pool[b["dept"]] + subject_pool["SH"]
    ability = RNG.choices([0.88, 0.78, 0.68, 0.58, 0.48], weights=[18, 30, 28, 16, 8])[0]
    for e in exam_meta:
        if not e["has_marks"] or (e["ay"], e["sem_no"]) not in b["path"]:
            continue
        for k in range(SUBJECTS_PER_SEMESTER):
            sid = pool[(5 * (e["sem_no"] - 1) + k) % len(pool)][0]
            oid = offer_key[(PROG_ID[b["program"]], sid, SEM_ID[(e["ay"], e["sem_no"])])]
            reg_id += 1
            present, total = att_stats.get((s["id"], oid), (0, 0))
            pct_att = round(present * 100.0 / total, 2) if total else 100.00
            if pct_att >= 75.0:
                reason, exempt, exempt_by, exempt_reason = "Eligible as per attendance", 0, None, None
            else:
                # Historical records: condonation granted by the competent authority.
                reason = (f"Attendance {pct_att}% below the required 75% - "
                          f"condonation granted by the competent authority")
                exempt, exempt_by, exempt_reason = 1, EXAM_UID, "Medical / representational condonation"
            reg_rows.append((e["id"], s["id"], oid,
                             sched_key.get((e["id"], sid, PROG_ID[b["program"]])),
                             f"{SEM_BY_ID[e['semester']][2]} 10:30:00",
                             s["user_id"], pct_att, 1, reason, exempt, exempt_by, exempt_reason,
                             f"HT-{e['id']:02d}-{s['id']:04d}-{k + 1}",
                             f"{SEM_BY_ID[e['semester']][3]} 10:00:00",
                             "APPEARED" if e["type"] == "ENDSEM" else "REGISTERED"))
            if RNG.random() < 0.015:
                obtained, absent = 0.00, 1
            else:
                absent = 0
                obtained = min(float(e["max_marks"]),
                               round(max(8.0, RNG.gauss(ability * 100, 10)) * e["max_marks"] / 100.0, 2))
            pct_calc = 0.00 if absent else round(obtained * 100.0 / e["max_marks"], 2)
            gcode, gpts = grade_for(pct_calc)
            mark_rows.append((reg_id, obtained, e["max_marks"], pct_calc, gcode, gpts, absent,
                              1 if (pct_calc >= 40 and not absent) else 0,
                              fac_meta[RNG.randrange(N_FACULTY)]["user_id"], None))

# live registrations for the open ENDSEM exams (only >=75% attendance students)
pre_registered = 0
for s in stu_meta:
    if s["status"] != "ACTIVE":
        continue
    b = s["batch"]
    cur = b["path"][-1]
    pool = subject_pool[b["dept"]] + subject_pool["SH"]
    exam_id = next((eid for eid, e in OPEN_EXAMS.items() if (e["ay"], e["sem_no"]) == cur), None)
    if exam_id is None:
        continue
    for k in range(SUBJECTS_PER_SEMESTER):
        sid = pool[(5 * (cur[1] - 1) + k) % len(pool)][0]
        oid = offer_key[(PROG_ID[b["program"]], sid, SEM_ID[cur])]
        present, total = att_stats.get((s["id"], oid), (0, 0))
        pct_att = round(present * 100.0 / total, 2) if total else 100.00
        if pct_att < 75.0 or RNG.random() > 0.35:
            continue                       # <75% blocked; the rest register live in the UI
        reg_id += 1
        reg_rows.append((exam_id, s["id"], oid, None, "2026-10-03 11:15:00",
                         s["user_id"], pct_att, 1,
                         "Eligible as per attendance", 0, None, None,
                         f"HT-{exam_id:02d}-{s['id']:04d}-{k + 1}", None, "REGISTERED"))
        pre_registered += 1

insert("exam_registrations", ["exam_id", "student_id", "offering_id", "schedule_id", "registered_on",
                              "registered_by", "attendance_percentage", "is_eligible",
                              "eligibility_reason", "exemption_granted", "exemption_by",
                              "exemption_reason", "hall_ticket_no", "hall_ticket_issued_at",
                              "status"], reg_rows)
insert("marks", ["registration_id", "marks_obtained", "max_marks", "percentage", "grade",
                 "grade_points", "is_absent", "is_pass", "entered_by", "remarks"], mark_rows)
w(f"-- {pre_registered} subject registrations already created for the open ENDSEM exams")
w("-- (only students with >= 75% attendance; the rest must register from the UI)")
w("")

# results: SGPA per (student, semester) from ENDSEM marks, CGPA accumulated over time
offering_subject = {o["id"]: o["subject"] for o in offering_meta}
pair = {}
for idx, r in enumerate(reg_rows):
    if idx >= len(mark_rows):
        break
    m = mark_rows[idx]
    e = next((e for e in exam_meta if e["id"] == r[0]), None)
    if e is None or e["type"] != "ENDSEM":
        continue
    pair.setdefault((r[1], r[0]), []).append((SUBJ_CREDITS[offering_subject[r[2]]], float(m[5])))

end_sem_exam = {(e["semester"]): e["id"] for e in exam_meta if e["type"] == "ENDSEM"}
results_by_student = {}
for (sid_, eid), items in pair.items():
    e = next(e for e in exam_meta if e["id"] == eid)
    results_by_student.setdefault(sid_, []).append((e["semester"], items))

res_rows = []
for sid_, sem_list in results_by_student.items():
    sem_list.sort(key=lambda x: x[0])
    cum_cred, cum_pts = 0, 0.0
    for sem, items in sem_list:
        tot_cred = sum(c for c, _ in items)
        sgpa = round(sum(c * p for c, p in items) / tot_cred, 2) if tot_cred else 0.0
        cum_cred += tot_cred
        cum_pts += sgpa * tot_cred
        cgpa = round(cum_pts / cum_cred, 2)
        failed = sum(1 for _, p in items if p == 0.0)
        status = "PASS" if failed == 0 else ("PROMOTED" if failed <= 3 else "FAIL")
        res_rows.append((sid_, sem, end_sem_exam[sem], sgpa, cgpa, tot_cred,
                         max(0, tot_cred - failed * 4), failed, status, None,
                         f"{SEM_BY_ID[sem][3]} 11:00:00", EXAM_UID))
insert("results", ["student_id", "semester_id", "exam_id", "sgpa", "cgpa", "total_credits",
                   "earned_credits", "backlog_count", "result_status", "remarks", "published_on",
                   "published_by"], res_rows)

# ------------------------------------------------------------------ finance ---------
fs_rows, fs_key = [], {}
for b in batch_meta:
    for (ay, no) in b["path"]:
        key = (PROG_ID[b["program"]], no, ay)
        if key in fs_key:
            continue
        tuition = 62000.00 if b["level"] == "PG" else 48000.00
        fs_key[key] = len(fs_rows) + 1
        fs_rows.append((f"FS-{b['program']}-S{no}-AY{ay}", PROG_ID[b["program"]], no, ay, None,
                        tuition, 22000.00, 2500.00, 1800.00, 3500.00, 4000.00, 1200.00,
                        50.00, 10, SEM_BY_ID[SEM_ID[(ay, no)]][2] + timedelta(days=45), "ACTIVE"))
# category specific (concession) structures - demonstrates category based fee rules
for prog, cat in (("BTECH-ETC", 3), ("BTECH-CSE", 3)):
    fs_rows.append((f"FS-{prog}-S1-AY3-SC", PROG_ID[prog], 1, 3, cat, 10000.00, 22000.00,
                    2500.00, 1800.00, 3500.00, 4000.00, 1200.00, 50.00, 10,
                    date(2026, 8, 15), "ACTIVE"))
insert("fee_structures", ["fee_code", "program_id", "semester_no", "academic_year_id", "category_id",
                          "tuition_fee", "hostel_fee", "exam_fee", "library_fee", "lab_fee",
                          "development_fee", "other_fee", "late_fee_per_day", "grace_days",
                          "due_date", "status"], fs_rows)
FS_BY_ID = {i + 1: r for i, r in enumerate(fs_rows)}

insert("scholarships", ["scholarship_code", "name", "provider", "scholarship_type", "amount",
                        "is_percentage", "criteria", "max_beneficiaries", "academic_year_id",
                        "status"],
       [("MERIT-01", "Merit Scholarship - Top 10%", "Vidya Pratishthan Trust", "MERIT", 30000.00,
         0, "SGPA >= 9.00 in the previous semester", 20, 3, "ACTIVE"),
        ("MERIT-02", "Merit Scholarship - Top 25%", "Vidya Pratishthan Trust", "MERIT", 15000.00,
         0, "SGPA >= 8.00 in the previous semester", 50, 3, "ACTIVE"),
        ("GOV-SC", "Post-Matric Scholarship (SC/ST)", "Social Welfare Department", "GOVERNMENT",
         48000.00, 0, "SC/ST category with family income below 2.5 lakh", None, 3, "ACTIVE"),
        ("GOV-EWS", "EWS Fee Concession", "State Government", "GOVERNMENT", 25000.00, 0,
         "EWS category with a valid certificate", None, 3, "ACTIVE"),
        ("SPORTS-01", "Sports Excellence Award", "Sports Authority of India", "SPORTS", 20000.00,
         0, "State or national level representation", 10, 3, "ACTIVE")])

sf_rows, sf_meta = [], []
for s in stu_meta:
    b = s["batch"]
    for (ay, no) in b["path"]:
        fid = fs_key[(PROG_ID[b["program"]], no, ay)]
        fs = FS_BY_ID[fid]
        gross = float(sum(fs[5:12]))
        scholarship = RNG.choice([15000.0, 20000.0, 25000.0, 30000.0, 48000.0]) if RNG.random() < 0.18 else 0.0
        discount = round(gross * 0.05, 2) if s["category"] in (3, 4) else 0.0
        net = round(gross - scholarship - discount, 2)
        due_date = fs[14]
        is_current = (ay, no) == b["path"][-1]
        roll = RNG.random()
        if is_current:
            if roll < 0.34:
                paid, status = net, "PAID"
            elif roll < 0.60:
                paid, status = round(net * RNG.uniform(0.3, 0.8), 2), "PARTIAL"
            elif roll < 0.82:
                paid, status = 0.00, "PENDING"
            else:
                paid, status = 0.00, "OVERDUE"
        else:
            paid = net if roll < 0.9 else round(net * 0.6, 2)
            status = "PAID" if paid >= net - 0.01 else "PARTIAL"
        due = round(max(0.0, net - paid), 2)
        fine = round(RNG.choice([500.0, 1000.0, 1500.0, 2500.0]), 2) if status == "OVERDUE" else 0.0
        sf_id = len(sf_rows) + 1
        sf_rows.append((s["id"], fid, SEM_ID[(ay, no)], ay, round(gross, 2), scholarship, discount,
                        fine, round(paid, 2), due,
                        "PAID" if due <= 0.01 else status, due_date,
                        date(2026, RNG.randint(1, 9), RNG.randint(1, 28)) if due <= 0.01 else None,
                        None))
        sf_meta.append(dict(id=sf_id, student=s["id"], net=net, paid=paid, due=due,
                            status=status, due_date=due_date))
insert("student_fees", ["student_id", "fee_structure_id", "semester_id", "academic_year_id",
                        "total_amount", "scholarship_amount", "discount_amount", "fine_amount",
                        "paid_amount", "due_amount", "status", "due_date", "paid_on", "remarks"],
       sf_rows)

pay_rows, txn_rows = [], []
for b in sf_meta:
    if b["paid"] <= 0:
        continue
    remaining = float(b["paid"])
    parts = 1 if RNG.random() < 0.7 else 2
    for part in range(parts):
        amt = remaining if part == parts - 1 else round(remaining * RNG.uniform(0.4, 0.6), 2)
        if amt <= 0:
            continue
        pay_id = len(pay_rows) + 1
        mode = RNG.choice(["ONLINE", "UPI", "CARD", "NETBANKING", "CASH", "CHEQUE"])
        pdate = date(2026, RNG.randint(1, 9), RNG.randint(1, 28))
        pay_rows.append((f"RCP-2026-{100000 + pay_id}", f"TXN{RNG.randint(10 ** 11, 10 ** 12 - 1)}",
                         b["id"], b["student"], round(amt, 2), mode,
                         f"{pdate} {RNG.randint(9, 17):02d}:{RNG.randint(10, 59)}:00",
                         "SUCCESS", f"REF{RNG.randint(10 ** 8, 10 ** 9 - 1)}", ACC_UID, None))
        txn_rows.append((b["id"], pay_id, b["student"], "CREDIT", round(amt, 2),
                         round(b["net"] - b["paid"], 2), f"Payment received via {mode}"))
        remaining = round(remaining - amt, 2)
insert("payments", ["receipt_no", "transaction_id", "student_fee_id", "student_id", "amount",
                    "payment_mode", "payment_date", "status", "reference_no", "received_by",
                    "remarks"], pay_rows)
insert("transactions", ["student_fee_id", "payment_id", "student_id", "txn_type", "amount",
                        "balance_after", "description"], txn_rows)

ss_rows = []
for s in stu_meta:
    if s["category"] in (3, 4) and RNG.random() < 0.55:
        ss_rows.append((s["id"], 3, 3, 48000.00, date(2026, 8, 1), ACC_UID, "CREDITED", None))
    elif RNG.random() < 0.12:
        ss_rows.append((s["id"], 1 if RNG.random() < 0.5 else 2, 3,
                        30000.00 if RNG.random() < 0.5 else 15000.00,
                        date(2026, 8, 5), ACC_UID, "APPROVED", "Merit list published"))
insert("student_scholarships", ["student_id", "scholarship_id", "academic_year_id", "amount",
                                "sanctioned_on", "sanctioned_by", "status", "remarks"], ss_rows)

fine_rows = []
for s in stu_meta:
    if RNG.random() < 0.16:
        fine_rows.append((s["id"], None, RNG.choice([
            "Library book returned after the due date", "Hostel room damage charges",
            "Late fee for semester registration", "Laboratory equipment breakage"]),
            RNG.choice(["LATE_FEE", "LIBRARY", "HOSTEL_DAMAGE", "OTHER"]),
            round(RNG.uniform(100, 2500), 2), date(2026, RNG.randint(2, 9), RNG.randint(1, 28)),
            ADMIN_UID, RNG.choice(["PENDING", "PENDING", "PAID", "WAIVED"]), None))
insert("fines", ["student_id", "student_fee_id", "reason", "fine_type", "amount", "imposed_on",
                 "imposed_by", "status", "remarks"], fine_rows)

refund_rows = []
for _ in range(6):
    if not pay_rows:
        break
    pid = RNG.randrange(len(pay_rows))
    p = pay_rows[pid]
    refund_rows.append((pid + 1, p[3], round(float(p[4]) * 0.25, 2),
                        RNG.choice(["Excess payment received",
                                    "Scholarship credited after the payment",
                                    "Semester fee revised by the finance committee"]),
                        RNG.choice(["UPI", "NETBANKING", "CHEQUE"]),
                        date(2026, RNG.randint(3, 9), RNG.randint(1, 28)),
                        RNG.choice(["PROCESSED", "INITIATED"]), ACC_UID, None))
insert("refunds", ["payment_id", "student_id", "amount", "reason", "refund_mode", "refund_date",
                   "status", "processed_by", "remarks"], refund_rows)

# ------------------------------------------------------------------ hostel ----------
HOSTELS = [("BH-1", "Vidya Boys Hostel - 1", "BOYS", 2),
           ("BH-2", "Vidya Boys Hostel - 2", "BOYS", 3),
           ("GH-1", "Pratishthan Girls Hostel", "GIRLS", 2)]
hostel_rows, block_rows, room_rows, bed_rows = [], [], [], []
for hi, (code, name, htype, nblocks) in enumerate(HOSTELS):
    hostel_rows.append((code, name, htype, fac_meta[hi * 3]["id"],
                        f"{RNG.randint(1, 50)} Vidyanagar Campus Road",
                        f"0202{RNG.randint(1000000, 9999999)}", 0, 0, 0,
                        22000.00 if htype == "BOYS" else 24000.00, "ACTIVE"))
insert("hostels", ["hostel_code", "name", "hostel_type", "warden_faculty_id", "address",
                   "contact_no", "total_rooms", "total_beds", "occupied_beds", "rent_per_bed",
                   "status"], hostel_rows)

for hi, (_, _, _, nblocks) in enumerate(HOSTELS):
    for bi in range(nblocks):
        block_rows.append((hi + 1, chr(65 + bi), f"Block {chr(65 + bi)}", 3, "ACTIVE"))
insert("hostel_blocks", ["hostel_id", "block_code", "name", "floors", "status"], block_rows)

room_meta = []      # (room_id, hostel_id, block_id, capacity)
for hi, (_, _, _, nblocks) in enumerate(HOSTELS):
    for bi in range(1, nblocks + 1):
        for f in range(1, 4):
            for r in range(1, 6):
                cap = RNG.choice([2, 2, 2, 3, 1])
                rtype = {1: "SINGLE", 2: "DOUBLE", 3: "TRIPLE"}[cap]
                room_rows.append((hi + 1, bi, f"{chr(64 + bi)}{f}0{r}", f, rtype, cap, 0,
                                  22000.00 if cap == 2 else (26000.00 if cap == 1 else 19000.00),
                                  "AVAILABLE"))
                room_meta.append((len(room_rows), hi + 1, bi, cap))
ROOM_HOSTEL = {r[0]: r[1] for r in room_meta}
ROOM_BLOCK = {r[0]: r[2] for r in room_meta}
ROOM_CAP = {r[0]: r[3] for r in room_meta}

for rid_, hid, bid, cap in room_meta:
    for i in range(cap):
        bed_rows.append([rid_, chr(65 + i), "AVAILABLE", None])
N_BEDS = len(bed_rows)
beds_by_hostel, room_occupied = {}, {r[0]: 0 for r in room_meta}
for idx, b in enumerate(bed_rows):
    beds_by_hostel.setdefault(ROOM_HOSTEL[b[0]], []).append(idx)
ptr = {h: 0 for h in beds_by_hostel}

# applications + allocations
applicants = []
for s in stu_meta:
    if s["status"] != "ACTIVE":
        continue
    if s["gender"] == "MALE" and RNG.random() < 0.78:
        applicants.append((s, RNG.choice([1, 2])))
    elif s["gender"] == "FEMALE" and RNG.random() < 0.82:
        applicants.append((s, 3))
RNG.shuffle(applicants)

app_rows, alloc_rows, hfee_rows = [], [], []
for i, (s, hid) in enumerate(applicants):
    bi = None
    while ptr.get(hid, 0) < len(beds_by_hostel.get(hid, [])):
        cand = beds_by_hostel[hid][ptr[hid]]
        ptr[hid] += 1
        if bed_rows[cand][2] == "AVAILABLE":
            bi = cand
            break
    if bi is None:
        app_rows.append((f"HAPP-2026-{30001 + i}", s["id"], hid, 3, "DOUBLE",
                         date(2026, RNG.randint(6, 8), RNG.randint(1, 28)),
                         "WAITLISTED", None, None, "No bed available in the requested hostel"))
        continue
    room_id = bed_rows[bi][0]
    bed_rows[bi][2] = "OCCUPIED"
    room_occupied[room_id] += 1
    app_rows.append((f"HAPP-2026-{30001 + i}", s["id"], hid, 3, "DOUBLE",
                     date(2026, RNG.randint(6, 8), RNG.randint(1, 28)),
                     "APPROVED", HOSTEL_UID, date(2026, 8, 20), None))
    alloc_rows.append([s["id"], bi + 1, room_id, hid, 3, date(2026, 8, 22), HOSTEL_UID, None,
                       22000.00, "ACTIVE", None])
    hfee_rows.append((len(alloc_rows), s["id"], 3, 22000.00,
                      RNG.choice([0.00, 11000.00, 22000.00]), date(2026, 9, 30),
                      "PENDING" if RNG.random() < 0.3 else "PAID"))

# room transfers: move a few allocated students to another free bed in the same hostel
trans_rows = []
for _ in range(min(5, max(1, len(alloc_rows) // 12))):
    a = alloc_rows[RNG.randrange(len(alloc_rows))]
    hid = a[3]
    target = None
    while ptr.get(hid, 0) < len(beds_by_hostel.get(hid, [])):
        cand = beds_by_hostel[hid][ptr[hid]]
        ptr[hid] += 1
        if bed_rows[cand][2] == "AVAILABLE":
            target = cand
            break
    if target is None:
        continue
    old_bed, old_room = a[1], a[2]
    new_room = bed_rows[target][0]
    bed_rows[old_bed - 1][2] = "AVAILABLE"
    room_occupied[old_room] -= 1
    bed_rows[target][2] = "OCCUPIED"
    room_occupied[new_room] += 1
    a[1], a[2] = target + 1, new_room
    trans_rows.append((a[0], old_bed, target + 1,
                       RNG.choice(["Requested a room near friends",
                                   "Medical reason - ground floor required",
                                   "Room mate change request"]),
                       date(2026, 9, 15), HOSTEL_UID))

# rooms + beds are emitted with the final occupancy computed above
# NOTE: room_meta rows are (room_id, hostel_id, block_id, capacity) and room_rows are
#       emitted in the same order, so index i of both describe the same room.
final_rooms = []
for (room_id, hostel_id, block_id, capacity), r in zip(room_meta, room_rows):
    occupied = room_occupied[room_id]
    assert occupied <= capacity, f"room {room_id}: {occupied} > {capacity}"
    final_rooms.append((hostel_id, block_id, r[2], r[3], r[4], capacity, occupied, r[7],
                        "FULL" if occupied >= capacity else "AVAILABLE"))
insert("rooms", ["hostel_id", "block_id", "room_number", "floor", "room_type", "capacity",
                 "occupied_count", "rent_per_bed", "status"], final_rooms)
insert("beds", ["room_id", "bed_code", "status", "remarks"], [tuple(b) for b in bed_rows])
insert("hostel_applications", ["application_no", "student_id", "hostel_id", "academic_year_id",
                               "room_type_pref", "applied_on", "status", "reviewed_by",
                               "reviewed_on", "remarks"], app_rows)
insert("room_allocations", ["student_id", "bed_id", "room_id", "hostel_id", "academic_year_id",
                            "allocated_on", "allocated_by", "vacated_on", "rent_amount",
                            "status", "remarks"], [tuple(a) for a in alloc_rows])
insert("hostel_fees", ["allocation_id", "student_id", "academic_year_id", "amount", "paid_amount",
                       "due_date", "status"], hfee_rows)
insert("room_transfers", ["student_id", "from_bed_id", "to_bed_id", "reason", "transferred_on",
                          "approved_by"], trans_rows)

# hostel counters (at runtime these are maintained by trg_bed_allocation_* triggers)
w("-- Hostel counters are maintained by triggers at runtime; they are set here because")
w("-- 04_seed.sql is loaded BEFORE 06_triggers.sql.")
for hi in range(1, len(HOSTELS) + 1):
    rooms_n = sum(1 for r in room_meta if r[1] == hi)
    beds_n = sum(1 for b in bed_rows if ROOM_HOSTEL[b[0]] == hi)
    occ = sum(1 for b in bed_rows if ROOM_HOSTEL[b[0]] == hi and b[2] == "OCCUPIED")
    w(f"UPDATE `hostels` SET `total_rooms`={rooms_n}, `total_beds`={beds_n}, "
      f"`occupied_beds`={occ} WHERE `hostel_id`={hi};")
w("")

# ------------------------------------------------------------------ payroll ---------
lb_rows = []
for f in fac_meta:
    for lt, allotted in (("CASUAL", 12), ("SICK", 10), ("EARNED", 15)):
        lb_rows.append((f["id"], 3, lt, allotted, RNG.randint(0, min(allotted, 6))))
insert("leave_balances", ["faculty_id", "academic_year_id", "leave_type", "allotted", "used"], lb_rows)

lv_rows = []
for _ in range(96):
    f = fac_meta[RNG.randrange(N_FACULTY)]
    lt = RNG.choice(["CASUAL", "CASUAL", "SICK", "EARNED", "ON_DUTY"])
    days = RNG.choice([1, 1, 2, 3, 5])
    start = date(2026, RNG.randint(1, 9), RNG.randint(1, 22))
    if start + timedelta(days=days - 1) > TODAY:
        continue
    status = RNG.choices(["APPROVED", "PENDING", "REJECTED"], weights=[65, 25, 10])[0]
    lv_rows.append((f["id"], lt, start, start + timedelta(days=days - 1), days,
                    RNG.choice(["Family function", "Medical appointment", "Fever and rest",
                                "Conference attendance", "Personal work", "Marriage in family"]),
                    start - timedelta(days=RNG.randint(2, 10)), status, ADMIN_UID,
                    start - timedelta(days=1) if status != "PENDING" else None,
                    "Approved" if status == "APPROVED" else
                    ("Under review" if status == "PENDING" else "Insufficient leave balance")))
insert("faculty_leaves", ["faculty_id", "leave_type", "start_date", "end_date", "days", "reason",
                          "applied_on", "status", "approved_by", "approved_on", "remarks"], lv_rows)

pay_rows2, comp_rows = [], []
for f in fac_meta:
    for month in range(3, 9):                       # March .. August 2026
        pid = len(pay_rows2) + 1
        basic = f["basic"]
        hra, da = round(basic * 0.40, 2), round(basic * 0.17, 2)
        ta, sa = round(basic * 0.05, 2), round(basic * 0.12, 2)
        gross = round(basic + hra + da + ta + sa, 2)
        pf, pt = round(basic * 0.12, 2), 200.00
        lop_days = RNG.choice([0, 0, 0, 0, 1, 2])
        lop = round(gross / 30.0 * lop_days, 2)
        it = round(max(0.0, (gross * 12 - 250000) * 0.05 / 12.0), 2) if gross > 60000 else 0.0
        net = round(gross - pf - pt - lop - it, 2)
        status = "PAID" if month < 8 else "APPROVED"
        pay_rows2.append((f["id"], month, 2026, basic, hra, da, ta, sa, gross, pf, pt, it,
                          lop_days, lop, 0.00, net, 30, status, date(2026, month, 28),
                          date(2026, month, 28) if status == "PAID" else None, None))
        for cname, camt in (("Basic Pay", basic), ("House Rent Allowance", hra),
                            ("Dearness Allowance", da), ("Transport Allowance", ta),
                            ("Special Allowance", sa)):
            comp_rows.append((pid, "EARNING", cname, camt))
        for cname, camt in (("Provident Fund", pf), ("Professional Tax", pt),
                            ("Income Tax", it), ("Loss of Pay", lop)):
            if camt > 0:
                comp_rows.append((pid, "DEDUCTION", cname, camt))
insert("payrolls", ["faculty_id", "pay_month", "pay_year", "basic", "hra", "da", "ta",
                    "special_allowance", "gross_salary", "pf_deduction", "professional_tax",
                    "income_tax", "lop_days", "lop_amount", "other_deduction", "net_salary",
                    "working_days", "status", "generated_on", "paid_on", "remarks"], pay_rows2)
insert("payroll_components", ["payroll_id", "component_type", "name", "amount"], comp_rows)

# ------------------------------------------------------------------ timetable -------
DAY_NAMES = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"]
SLOTS = [("09:00:00", "10:00:00"), ("10:00:00", "11:00:00"), ("11:15:00", "12:15:00"),
         ("12:15:00", "13:15:00"), ("14:00:00", "15:00:00"), ("15:00:00", "16:00:00")]
tt_rows, fac_busy, room_busy, sec_busy = [], set(), set(), set()
rooms_pool = [f"R{101 + i}" for i in range(20)]
for o in offering_meta:
    if not o["is_current"]:
        continue
    placed, attempts = 0, 0
    while placed < 4 and attempts < 240:
        attempts += 1
        day = RNG.choice(DAY_NAMES)
        slot = RNG.choice(SLOTS)
        room = RNG.choice(rooms_pool)
        kf, kr, ks = (o["faculty"], day, slot[0]), (room, day, slot[0]), (o["section"], day, slot[0])
        if kf in fac_busy or kr in room_busy or ks in sec_busy:
            continue
        fac_busy.add(kf); room_busy.add(kr); sec_busy.add(ks)
        tt_rows.append((o["id"], o["section"], o["faculty"], day, slot[0], slot[1], room,
                        f"{slot[0][:5]}-{slot[1][:5]}", 1))
        placed += 1
insert("timetable", ["offering_id", "section_id", "faculty_id", "day_of_week", "start_time",
                     "end_time", "room_number", "slot_label", "is_active"], tt_rows)

insert("academic_calendar", ["academic_year_id", "semester_id", "title", "description",
                             "event_type", "event_date", "end_date", "is_holiday"],
       [(3, SEM_ID[(3, 5)], "Semester 5 Commencement", "Teaching begins for odd semester 2026-27",
         "OTHER", date(2026, 7, 1), None, 0),
        (3, SEM_ID[(3, 5)], "Mid Semester Examination", "MSE for all UG/PG programs",
         "EXAM", date(2026, 9, 5), date(2026, 9, 12), 0),
        (3, SEM_ID[(3, 5)], "End Semester Examination", "ESE for all UG/PG programs",
         "EXAM", date(2026, 11, 10), date(2026, 11, 24), 0),
        (3, SEM_ID[(3, 5)], "Last date for fee payment", "Semester fee without late fee",
         "FEE_DUE", date(2026, 8, 15), None, 0),
        (3, SEM_ID[(3, 5)], "Independence Day", "National holiday", "HOLIDAY",
         date(2026, 8, 15), None, 1),
        (3, SEM_ID[(3, 5)], "Ganesh Chaturthi", "Institute holiday", "HOLIDAY",
         date(2026, 8, 26), None, 1),
        (3, SEM_ID[(3, 5)], "Gandhi Jayanti", "National holiday", "HOLIDAY",
         date(2026, 10, 2), None, 1),
        (3, SEM_ID[(3, 5)], "Diwali Vacation", "Institute holiday", "HOLIDAY",
         date(2026, 10, 19), date(2026, 10, 28), 1),
        (3, SEM_ID[(3, 5)], "Result Declaration - Semester 5", "Result publishing",
         "RESULT", date(2026, 12, 10), None, 0),
        (3, SEM_ID[(3, 5)], "Annual Technical Festival - Praxis", "Institute fest",
         "FEST", date(2026, 10, 8), date(2026, 10, 10), 0),
        (3, SEM_ID[(3, 5)], "One Week Workshop on AI/ML", "Department of CSE",
         "WORKSHOP", date(2026, 9, 21), date(2026, 9, 26), 0),
        (3, SEM_ID[(3, 5)], "National Seminar on VLSI Design", "Department of E&TCE",
         "SEMINAR", date(2026, 10, 15), None, 0)])

# ------------------------------------------------------------------ mock exams ------
mcq_rows = []
qbank_subjects = list(range(1, min(19, len(subj_rows) + 1)))
for sid in qbank_subjects:
    name = SUBJ_NAME[sid]
    for i in range(10):
        diff = RNG.choice(["EASY", "EASY", "MEDIUM", "MEDIUM", "MEDIUM", "HARD"])
        correct = RNG.choice("ABCD")
        mcq_rows.append((sid, diff,
                         f"[{name}] Which statement best describes concept {i + 1} of {name}?",
                         "Correct conceptual statement", "Partially correct but incomplete",
                         "Incorrect - contradicts the definition", "Not applicable to this topic",
                         correct, 1 if diff != "HARD" else 2,
                         f"Refer to Unit {(i % 5) + 1} of {name}.",
                         f"Unit {(i % 5) + 1}", fac_meta[0]["user_id"], "ACTIVE"))
insert("mcq_questions", ["subject_id", "difficulty", "question_text", "option_a", "option_b",
                         "option_c", "option_d", "correct_option", "marks", "explanation",
                         "topic", "created_by", "status"], mcq_rows)

mock_rows, mock_ans = [], []
qs_by_subject = {}
for i, m in enumerate(mcq_rows):
    qs_by_subject.setdefault(m[0], []).append(i)
for s in stu_meta[:70]:
    for _ in range(RNG.choice([0, 1, 1, 2])):
        subject = RNG.choice(qbank_subjects)
        qs = qs_by_subject[subject][:10]
        mid = len(mock_rows) + 1
        score = max_score = 0.0
        correct_count = 0
        for qi in qs:
            qrow = mcq_rows[qi]
            max_score += qrow[8]
            if RNG.random() < RNG.uniform(0.35, 0.95):
                sel, correct_count, score = qrow[7], correct_count + 1, score + qrow[8]
            else:
                sel = RNG.choice([c for c in "ABCD" if c != qrow[7]])
            mock_ans.append((mid, qi + 1, sel, 1 if sel == qrow[7] else 0,
                             qrow[8] if sel == qrow[7] else 0, None))
        started = date(2026, RNG.randint(7, 9), RNG.randint(1, 28))
        mock_rows.append((s["id"], subject, RNG.choice(["EASY", "MEDIUM", "HARD", "MIXED"]),
                          len(qs), 15, f"{started} 18:00:00", f"{started} 18:15:00",
                          f"{started} 18:12:00", round(score, 2), max_score,
                          round(score * 100.0 / max_score, 2) if max_score else 0.0,
                          correct_count, "SUBMITTED"))
insert("mock_exams", ["student_id", "subject_id", "difficulty", "total_questions",
                      "duration_minutes", "started_at", "expires_at", "submitted_at", "score",
                      "max_score", "percentage", "correct_count", "status"], mock_rows)
insert("mock_exam_answers", ["mock_exam_id", "question_id", "selected_option", "is_correct",
                             "marks_awarded", "answered_at"], mock_ans)

# ------------------------------------------------------------------ notifications ---
notif_rows = []


def notify(uid_, ntype, title, msg, sev="INFO", entity=None, eid=None, read=0):
    notif_rows.append((uid_, title, msg, ntype, sev, entity, eid,
                       date(2026, 9, RNG.randint(1, 30)), read, None))


for s in stu_meta:
    stats = [att_stats.get((s["id"], o[0]), (0, 0)) for o in student_offerings[s["id"]] if o[4]]
    pres, tot = (sum(x[0] for x in stats), sum(x[1] for x in stats)) if stats else (0, 0)
    pct = pres * 100.0 / tot if tot else 100.0
    if pct < 75:
        notify(s["user_id"], "ATTENDANCE_WARNING", "Low attendance alert",
               f"Your attendance is {pct:.1f}%, below the mandatory 75%. You cannot register "
               f"for the end semester examination unless a condonation is granted.",
               "ERROR", "student", s["id"])
    elif pct < 85:
        notify(s["user_id"], "ATTENDANCE_WARNING", "Attendance caution",
               f"Your attendance is {pct:.1f}%. Keep it above 75% to remain eligible.",
               "WARNING", "student", s["id"])
    if RNG.random() < 0.35:
        notify(s["user_id"], "FEE_DUE", "Semester fee reminder",
               "Your semester fee is due. Pay before the last date to avoid a late fee.",
               "WARNING", "student_fee", s["id"])
notify(None, "ANNOUNCEMENT", "End Semester Examination registration open",
       "Registration for the End Semester Examination (November 2026) is open. Only students "
       "with 75% or more attendance are eligible to register.", "INFO", "exam", None)
notify(None, "ANNOUNCEMENT", "Annual Technical Festival - Praxis 2026",
       "Registrations are open for Praxis 2026, scheduled 8-10 October 2026.", "INFO")
notify(None, "ANNOUNCEMENT", "Diwali vacation announced",
       "The institute will remain closed from 19 October to 28 October 2026.", "INFO")
for f in fac_meta[:8]:
    notify(f["user_id"], "PAYROLL_GENERATED", "Payslip generated for August 2026",
           "Your payslip for August 2026 has been generated and is available to download.",
           "SUCCESS", "payroll", f["id"], read=1)
insert("notifications", ["user_id", "title", "message", "type", "severity", "entity", "entity_id",
                         "created_at", "is_read", "read_at"], notif_rows)

# ------------------------------------------------------------------ risk + audit ----
risk_rows = []
for s in stu_meta:
    stats = [att_stats.get((s["id"], o[0]), (0, 0)) for o in student_offerings[s["id"]] if o[4]]
    pres, tot = (sum(x[0] for x in stats), sum(x[1] for x in stats)) if stats else (0, 0)
    apct = round(pres * 100.0 / tot, 2) if tot else 100.0
    cgpa = max([float(r[4]) for r in res_rows if r[0] == s["id"]] or [0.0])
    dues = sum(b["due"] for b in sf_meta if b["student"] == s["id"])
    backlog = sum(r[7] for r in res_rows if r[0] == s["id"])
    score = ((35 if apct < 75 else 15 if apct < 85 else 0) +
             (25 if 0 < cgpa < 5 else 10 if 0 < cgpa < 6.5 else 0) +
             (20 if backlog >= 4 else 10 if backlog >= 1 else 0) +
             (10 if dues > 50000 else 5 if dues > 0 else 0))
    level = "CRITICAL" if score >= 65 else "HIGH" if score >= 40 else "MEDIUM" if score >= 20 else "LOW"
    risk_rows.append((s["id"], date(2026, 10, 5), score, level, apct, None, round(cgpa, 2),
                      round(dues, 2), backlog, None))
insert("student_risk_scores", ["student_id", "computed_on", "risk_score", "risk_level",
                               "attendance_pct", "avg_marks", "cgpa", "pending_fees",
                               "backlog_count", "factors"], risk_rows)

insert("audit_logs", ["user_id", "action", "entity", "entity_id", "description", "created_at"],
       [(ADMIN_UID, "CREATE", "system", None, "Database seeded with demo data", date(2026, 10, 1)),
        (ADMIN_UID, "LOGIN", "user", ADMIN_UID, "Administrator login", date(2026, 10, 1)),
        (EXAM_UID, "RESULT_PUBLISHED", "exam", 1,
         "Results published for Semester 1 (2024-25)", date(2026, 10, 2)),
        (ACC_UID, "PAYMENT", "payment", 1, "Fee payment recorded", date(2026, 10, 2)),
        (HOSTEL_UID, "HOSTEL_ALLOCATION", "room_allocations", 1,
         "Bed allocated to a student", date(2026, 8, 22)),
        (HR_UID, "PAYROLL_RUN", "payrolls", 1,
         "Monthly payroll generated for August 2026", date(2026, 8, 28))])

# ------------------------------------------------------------------ footer ----------
w("""SET UNIQUE_CHECKS = 1;
SET FOREIGN_KEY_CHECKS = 1;

-- -------------------------------------------------------------------------------------
-- SEED SUMMARY
-- -------------------------------------------------------------------------------------""")
for label, value in [
    ("users", len(users)), ("departments", len(DEPARTMENTS)), ("designations", len(DESIGNATIONS)),
    ("programs / batches", f"{len(PROGRAMS)} / {len(batch_meta)}"), ("sections", len(sec_rows)),
    ("subjects / offerings", f"{len(subj_rows)} / {len(off_rows)}"), ("faculty", N_FACULTY),
    ("students", N_STUDENTS), ("enrollments", len(enr_rows)), ("class sessions", len(sess_rows)),
    ("attendance rows", len(att_rows)), ("exams / schedules", f"{len(exam_rows)} / {len(sched_rows)}"),
    ("exam registrations", len(reg_rows)), ("marks", len(mark_rows)), ("results", len(res_rows)),
    ("fee structures / bills", f"{len(fs_rows)} / {len(sf_rows)}"), ("payments", len(pay_rows)),
    ("ledger transactions", len(txn_rows)), ("hostel rooms / beds", f"{len(room_rows)} / {N_BEDS}"),
    ("hostel applications / allocations", f"{len(app_rows)} / {len(alloc_rows)}"),
    ("room transfers", len(trans_rows)), ("faculty leaves", len(lv_rows)),
    ("payrolls / components", f"{len(pay_rows2)} / {len(comp_rows)}"),
    ("timetable slots", len(tt_rows)), ("mcq questions", len(mcq_rows)),
    ("mock attempts / answers", f"{len(mock_rows)} / {len(mock_ans)}"),
    ("notifications", len(notif_rows)), ("risk scores", len(risk_rows)),
]:
    w(f"--   {label:<36}: {value}")
w("""--
-- DEMO LOGINS (password is the same for every account of that role)
--   admin@vpit.edu.in      / Admin@123
--   examcell@vpit.edu.in   / Exam@123
--   accountant@vpit.edu.in / Account@123
--   hostel.admin@vpit.edu.in / Hostel@123
--   hr@vpit.edu.in         / Hr@123
--   <faculty>@vpit.edu.in  / Faculty@123      (see docs/DEMO_CREDENTIALS.md)
--   <roll>@vpit.edu.in     / Student@123      e.g. 2024ETC1001@vpit.edu.in
-- =====================================================================================
""")

with open(OUT, "w") as fh:
    fh.write("\n".join(BUF) + "\n")

print(f"Wrote {OUT}")
print(f"  students={N_STUDENTS} faculty={N_FACULTY} subjects={len(subj_rows)} "
      f"offerings={len(off_rows)} enrollments={len(enr_rows)} sessions={len(sess_rows)}")
print(f"  attendance={len(att_rows)} (below 75%: {low}) registrations={len(reg_rows)} "
      f"marks={len(mark_rows)} results={len(res_rows)}")
print(f"  bills={len(sf_rows)} payments={len(pay_rows)} beds={N_BEDS} "
      f"allocations={len(alloc_rows)} payrolls={len(pay_rows2)} timetable={len(tt_rows)}")
