import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Download, GraduationCap, Plus } from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useToast } from '../../components/toast';
import { Card, PageHeader, StatCard, SearchInput, SelectField, Field, Modal, DataTable, Pagination, StatusBadge, ErrorBox, useFetch, useDebounced, type Column } from '../../components/ui';
import { downloadCsv } from '../../lib/csv';
import { money, num, titleCase } from '../../lib/format';
interface Student {
  student_id: number; roll_number: string; full_name: string; email: string; phone: string;
  department_code: string; department_name: string; program_code: string; batch_code: string;
  current_semester_no: number; admission_year: number; status: string; cgpa: string;
  backlog_count: number; outstanding_dues: string; gender: string; login_active: boolean;
}
interface Stats { total: number; active: string; suspended: string; inactive: string; male: string; female: string; }

const GENDERS = ['MALE', 'FEMALE', 'OTHER'];
const STATUSES = ['ACTIVE', 'INACTIVE', 'SUSPENDED', 'GRADUATED', 'ALUMNI'];

export default function StudentsPage() {
  const { has } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const canEdit = has('ADMIN');

  const [search, setSearch] = useState('');
  const [deptId, setDeptId] = useState('');
  const [status, setStatus] = useState('');
  const [semester, setSemester] = useState('');
  const [gender, setGender] = useState('');
  const [page, setPage] = useState(1);
  const term = useDebounced(search, 350);

  const depts = useFetch(() => api.get<{ department_id: number; department_code: string; name: string }[]>('/academics/departments', { limit: 100 }), []);
  const stats = useFetch(() => api.get<Stats>('/students/stats'), []);

  const params = useMemo(() => ({
    page, limit: 25, search: term || undefined, departmentId: deptId || undefined,
    status: status || undefined, semester: semester || undefined, gender: gender || undefined,
  }), [page, term, deptId, status, semester, gender]);

  const { data, loading, error, reload } = useFetch(() => api.page<Student>('/students', params), [params]);
  const rows = data?.rows ?? [];

  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    firstName: '', lastName: '', email: '', phone: '', dateOfBirth: '2005-01-01',
    gender: 'MALE', programId: '', departmentId: '', categoryId: '', admissionYear: String(new Date().getFullYear()),
  });

  const programs = useFetch(() => api.get<{ program_id: number; program_name: string; department_id: number }[]>('/academics/programs/all', { limit: 200 }), []);
  const categories = useFetch(() => api.get<{ category_id: number; category_name: string }[]>('/academics/categories'), []);

  const submit = async () => {
    setBusy(true);
    try {
      const res = await api.post<{ studentId: number; rollNumber: string }>('/students', {
        ...form,
        programId: Number(form.programId),
        departmentId: Number(form.departmentId),
        categoryId: Number(form.categoryId),
        admissionYear: Number(form.admissionYear),
      });
      toast.success(`Student ${res.rollNumber} created. A login has been generated automatically.`);
      setOpen(false);
      reload();
      navigate(`/students/${res.studentId}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not create the student');
    } finally { setBusy(false); }
  };

  const columns: Column<Student>[] = [
    {
      key: 'roll_number',
      header: 'Roll no.',
      csv: (r) => r.roll_number,
      render: (r) => (
        <Link to={`/students/${r.student_id}`} className="font-medium text-brand-700 hover:underline">{r.roll_number}</Link>
      ),
    },
    { key: 'full_name', header: 'Name', csv: (r) => r.full_name, render: (r) => <span className="font-medium text-slate-800">{r.full_name}</span> },
    { key: 'program_code', header: 'Program', csv: (r) => r.program_code, render: (r) => <span className="text-xs">{r.program_code}</span> },
    { key: 'current_semester_no', header: 'Sem', csv: (r) => r.current_semester_no, align: 'right' },
    { key: 'cgpa', header: 'CGPA', csv: (r) => r.cgpa, align: 'right', render: (r) => num(r.cgpa, 2) },
    {
      key: 'backlog_count', header: 'Backlogs', csv: (r) => r.backlog_count, align: 'right',
      render: (r) => (Number(r.backlog_count) > 0
        ? <span className="chip bg-rose-100 text-rose-700">{r.backlog_count}</span>
        : <span className="text-slate-400">0</span>),
    },
    { key: 'outstanding_dues', header: 'Dues', csv: (r) => r.outstanding_dues, align: 'right', render: (r) => money(r.outstanding_dues) },
    { key: 'status', header: 'Status', csv: (r) => r.status, render: (r) => <StatusBadge value={r.status} /> },
  ];

  return (
    <>
      <PageHeader
        title="Students"
        subtitle="Every student record lives in one shared master table used by all seven modules."
        icon={<GraduationCap className="h-5 w-5" />}
        actions={
          <>
            <button
              type="button"
              className="btn-secondary btn-sm"
              disabled={!rows.length}
              onClick={() => downloadCsv('students.csv', rows as unknown as Record<string, unknown>[], columns.map((c) => ({ key: c.key, label: c.header })))}
            >
              <Download className="h-4 w-4" /> Export CSV
            </button>
            {canEdit ? (
              <button type="button" className="btn-primary btn-sm" onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> New student</button>
            ) : null}
          </>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard label="Total students" value={num(stats.data?.total)} icon={<GraduationCap className="h-5 w-5" />} />
        <StatCard label="Active" value={num(stats.data?.active)} tone="emerald" />
        <StatCard label="Suspended" value={num(stats.data?.suspended)} tone="rose" />
        <StatCard label="Male" value={num(stats.data?.male)} tone="sky" />
        <StatCard label="Female" value={num(stats.data?.female)} tone="amber" />
      </div>

      <Card className="mb-4">
        <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-5">
          <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Name, roll no, email…" className="lg:col-span-2" />
          <SelectField
            placeholder="All departments"
            value={deptId}
            onChange={(e) => { setDeptId(e.target.value); setPage(1); }}
            options={(depts.data ?? []).map((d) => ({ value: d.department_id, label: d.name }))}
          />
          <SelectField placeholder="All statuses" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} options={STATUSES.map((s) => ({ value: s, label: titleCase(s) }))} />
          <SelectField placeholder="All semesters" value={semester} onChange={(e) => { setSemester(e.target.value); setPage(1); }} options={Array.from({ length: 8 }, (_, i) => ({ value: i + 1, label: `Semester ${i + 1}` }))} />
          <SelectField placeholder="All genders" value={gender} onChange={(e) => { setGender(e.target.value); setPage(1); }} options={GENDERS.map((g) => ({ value: g, label: titleCase(g) }))} />
        </div>
      </Card>

      <Card>
        {error ? <ErrorBox message={error} onRetry={reload} /> : (
          <>
            <DataTable columns={columns} rows={rows} loading={loading} rowKey={(r) => r.student_id} empty="No students match these filters" />
            <Pagination page={data?.meta.page ?? 1} totalPages={data?.meta.totalPages ?? 1} total={data?.meta.total ?? 0} onPage={setPage} />
          </>
        )}
      </Card>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Admit a new student"
        footer={
          <>
            <button type="button" className="btn-secondary btn-sm" onClick={() => setOpen(false)}>Cancel</button>
            <button type="button" className="btn-primary btn-sm" onClick={submit} disabled={busy || !form.programId || !form.departmentId || !form.categoryId}>
              {busy ? 'Creating…' : 'Create student'}
            </button>
          </>
        }
      >
        <p className="mb-4 rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-xs text-brand-800">
          Creating a student also creates their login account (password <b>Student@123</b>) and generates the
          next roll number for the program — both done by the API, never by the browser.
        </p>
        <div className="grid gap-x-4 sm:grid-cols-2">
          <Field label="First name" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} required />
          <Field label="Last name" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} required />
          <Field label="Email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required className="sm:col-span-2" />
          <Field label="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          <Field label="Date of birth" type="date" value={form.dateOfBirth} onChange={(e) => setForm({ ...form, dateOfBirth: e.target.value })} required />
          <SelectField label="Gender" value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })} options={GENDERS.map((g) => ({ value: g, label: titleCase(g) }))} />
          <Field label="Admission year" type="number" value={form.admissionYear} onChange={(e) => setForm({ ...form, admissionYear: e.target.value })} />
          <SelectField
            label="Program"
            placeholder="Select a program"
            value={form.programId}
            onChange={(e) => {
              const p = (programs.data ?? []).find((x) => String(x.program_id) === e.target.value);
              setForm({ ...form, programId: e.target.value, departmentId: p ? String(p.department_id) : form.departmentId });
            }}
            options={(programs.data ?? []).map((p) => ({ value: p.program_id, label: p.program_name }))}
            className="sm:col-span-2"
          />
          <SelectField
            label="Department"
            placeholder="Select a department"
            value={form.departmentId}
            onChange={(e) => setForm({ ...form, departmentId: e.target.value })}
            options={(depts.data ?? []).map((d) => ({ value: d.department_id, label: d.name }))}
          />
          <SelectField
            label="Category"
            placeholder="Select a category"
            value={form.categoryId}
            onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
            options={(categories.data ?? []).map((c) => ({ value: c.category_id, label: c.category_name }))}
          />
        </div>
      </Modal>
    </>
  );
}
