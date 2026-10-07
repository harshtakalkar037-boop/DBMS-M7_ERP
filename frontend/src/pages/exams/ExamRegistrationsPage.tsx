import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ClipboardList, ShieldCheck, UserPlus } from 'lucide-react';
import { api, errMsg } from '../../lib/api';
import { useToast } from '../../components/toast';
import { Card, PageHeader, StatCard, Tabs, SearchInput, SelectField, Field, DataTable, Pagination, StatusBadge, ProgressBar, ErrorBox, useFetch, useDebounced, type Column } from '../../components/ui';
import { dateStr, num, pct } from '../../lib/format';
interface Registration {
  registration_id: number; exam_id: number; student_id: number; offering_id: number;
  registered_on: string; attendance_percentage: string; is_eligible: boolean;
  eligibility_reason: string; exemption_granted: boolean; hall_ticket_no: string; status: string;
  rollNumber?: string; fullName?: string; subjectCode?: string;
}
interface Eligibility {
  student_id: number; roll_number: string; full_name: string; offering_id: number;
  subject_code: string; subject_name: string; semester_name: string;
  attendance_percentage: string; required_percentage: string; is_eligible: number; outstanding_dues: string;
}
interface Stats { total: number; registered: string; rejected: string; appeared: string; absent: string; ineligible: string; }

export default function ExamRegistrationsPage() {
  const toast = useToast();
  const [tab, setTab] = useState('register');
  const [search, setSearch] = useState('');
  const [examId, setExamId] = useState('');
  const [page, setPage] = useState(1);
  const term = useDebounced(search, 350);

  const stats = useFetch(() => api.get<Stats>('/exams/registrations/stats'), []);
  const exams = useFetch(() => api.get<{ exam_id: number; exam_code: string; name: string; status: string }[]>('/exams', { limit: 100 }), []);
  const threshold = useFetch(() => api.get<{ minAttendancePercentage: number }>('/exams/policy/threshold'), []);
  const students = useFetch(() => api.get<{ student_id: number; roll_number: string; full_name: string }[]>('/students', { limit: 500 }), []);

  const eligParams = useMemo(() => ({
    limit: 500, ineligibleOnly: 1, studentId: undefined,
  }), []);
  const eligibility = useFetch(() => api.get<Eligibility[]>('/exams/registrations/eligibility', eligParams), [eligParams]);

  const regParams = useMemo(() => ({ page, limit: 25, examId: examId || undefined, search: term || undefined }), [page, examId, term]);
  const regs = useFetch(() => api.page<Registration>('/exams/registrations', regParams), [regParams]);

  const [form, setForm] = useState({ examId: '', studentId: '', offeringId: '' });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const register = async () => {
    setBusy(true);
    setResult(null);
    try {
      const res = await api.post<{ message?: string; hallTicket?: string }>('/exams/registrations', {
        examId: Number(form.examId),
        studentId: Number(form.studentId),
        offeringId: Number(form.offeringId),
      });
      setResult(res.message ?? 'Registered.');
      toast.success('Registration processed.');
      regs.reload();
      stats.reload();
      eligibility.reload();
    } catch (e) {
      setResult(errMsg(e));
      toast.error('Registration refused.');
    } finally { setBusy(false); }
  };

  const ineligible = (eligibility.data ?? []).filter((e) => {
    const q = term.toLowerCase();
    return !q || e.full_name.toLowerCase().includes(q) || e.roll_number.toLowerCase().includes(q);
  });

  const eligCols: Column<Eligibility>[] = [
    { key: 'roll_number', header: 'Roll no.', render: (r) => <Link to={`/students/${r.student_id}`} className="font-medium text-brand-700 hover:underline">{r.roll_number}</Link> },
    { key: 'full_name', header: 'Student' },
    { key: 'subject_code', header: 'Subject' },
    { key: 'subject_name', header: 'Name' },
    { key: 'semester_name', header: 'Semester' },
    {
      key: 'attendance_percentage', header: 'Attendance',
      render: (r) => (
        <div className="flex w-40 items-center gap-2">
          <ProgressBar value={Number(r.attendance_percentage)} />
          <span className="w-12 shrink-0 text-right text-xs font-semibold text-rose-600">{pct(r.attendance_percentage, 1)}</span>
        </div>
      ),
    },
    { key: 'required_percentage', header: 'Required', align: 'right', render: (r) => pct(r.required_percentage, 0) },
    { key: 'outstanding_dues', header: 'Dues', align: 'right' },
    { key: 'is_eligible', header: 'Verdict', render: () => <span className="chip bg-rose-100 text-rose-700">Not eligible</span> },
  ];

  const regCols: Column<Registration>[] = [
    { key: 'registration_id', header: 'ID', align: 'right' },
    { key: 'rollNumber', header: 'Roll no.' },
    { key: 'fullName', header: 'Student' },
    { key: 'subjectCode', header: 'Subject' },
    { key: 'attendance_percentage', header: 'Attendance', align: 'right', render: (r) => pct(r.attendance_percentage, 1) },
    { key: 'hall_ticket_no', header: 'Hall ticket', render: (r) => r.hall_ticket_no ?? <span className="text-slate-400">—</span> },
    { key: 'eligibility_reason', header: 'Reason', render: (r) => <span className="max-w-xs truncate text-xs">{r.eligibility_reason}</span> },
    { key: 'exemption_granted', header: 'Exemption', render: (r) => (r.exemption_granted ? <span className="chip bg-amber-100 text-amber-700">Granted</span> : <span className="text-slate-400">—</span>) },
    { key: 'registered_on', header: 'Registered', render: (r) => dateStr(r.registered_on) },
    { key: 'status', header: 'Status', render: (r) => <StatusBadge value={r.status} /> },
  ];

  return (
    <>
      <PageHeader
        title="Exam registrations"
        subtitle={`Registrations are screened inside MySQL by sp_register_student_for_exam. Minimum attendance required: ${threshold.data ? `${threshold.data.minAttendancePercentage}%` : '…'} — the rule holds for API calls and scripts too, not just this screen.`}
        icon={<ClipboardList className="h-5 w-5" />}
        actions={<button type="button" className="btn-primary btn-sm" onClick={() => setTab('register')}><UserPlus className="h-4 w-4" /> Register a student</button>}
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard label="Total registrations" value={num(stats.data?.total)} icon={<ClipboardList className="h-5 w-5" />} />
        <StatCard label="Registered" value={num(stats.data?.registered)} tone="sky" />
        <StatCard label="Appeared" value={num(stats.data?.appeared)} tone="emerald" />
        <StatCard label="Absent" value={num(stats.data?.absent)} tone="rose" />
        <StatCard label="Blocked by attendance" value={num(eligibility.data?.length)} tone="amber" icon={<ShieldCheck className="h-5 w-5" />} />
      </div>

      <Tabs active={tab} onChange={setTab} tabs={[{ key: 'register', label: 'Register' }, { key: 'blocked', label: 'Blocked by attendance', count: eligibility.data?.length }, { key: 'all', label: 'All registrations' }]} />

      {tab === 'register' ? (
        <Card className="card-pad max-w-2xl">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Register a student for an examination</h2>
          <p className="mt-1 text-xs text-slate-500">
            Try a student from the “Blocked by attendance” tab: the procedure will refuse the registration and
            return the exact reason, proving the rule is enforced in MySQL rather than in the browser.
          </p>
          <div className="mt-4 grid gap-x-4 sm:grid-cols-2">
            <SelectField label="Examination" placeholder="Select" value={form.examId} onChange={(e) => setForm({ ...form, examId: e.target.value })} options={(exams.data ?? []).map((x) => ({ value: x.exam_id, label: `${x.exam_code} — ${x.name}` }))} className="sm:col-span-2" />
            <SelectField label="Student" placeholder="Select" value={form.studentId} onChange={(e) => setForm({ ...form, studentId: e.target.value })} options={(students.data ?? []).map((s) => ({ value: s.student_id, label: `${s.roll_number} · ${s.full_name}` }))} className="sm:col-span-2" />
            <Field label="Course offering id" type="number" value={form.offeringId} onChange={(e) => setForm({ ...form, offeringId: e.target.value })} hint="The offering the student is enrolled in" className="sm:col-span-2" />
          </div>
          <button type="button" className="btn-primary mt-2" onClick={register} disabled={busy || !form.examId || !form.studentId || !form.offeringId}>
            {busy ? 'Registering…' : 'Register'}
          </button>
          {result ? (
            <div className={`mt-4 rounded-lg border px-4 py-3 text-sm ${result.toLowerCase().includes('not eligible') || result.toLowerCase().includes('below') ? 'border-rose-200 bg-rose-50 text-rose-800' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}>
              {result}
            </div>
          ) : null}
        </Card>
      ) : null}

      {tab === 'blocked' ? (
        <>
          <Card className="mb-4"><div className="p-4"><SearchInput value={search} onChange={setSearch} placeholder="Filter by name or roll number…" /></div></Card>
          <Card>
            {eligibility.error ? <ErrorBox message={eligibility.error} onRetry={eligibility.reload} /> : (
              <DataTable columns={eligCols} rows={ineligible} loading={eligibility.loading} rowKey={(r) => `${r.student_id}-${r.offering_id}`} empty="Every student is eligible" />
            )}
          </Card>
        </>
      ) : null}

      {tab === 'all' ? (
        <>
          <Card className="mb-4">
            <div className="grid gap-3 p-4 sm:grid-cols-2">
              <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Name or roll number…" />
              <SelectField placeholder="All examinations" value={examId} onChange={(e) => { setExamId(e.target.value); setPage(1); }} options={(exams.data ?? []).map((x) => ({ value: x.exam_id, label: x.exam_code }))} />
            </div>
          </Card>
          <Card>
            {regs.error ? <ErrorBox message={regs.error} onRetry={regs.reload} /> : (
              <>
                <DataTable columns={regCols} rows={regs.data?.rows ?? []} loading={regs.loading} rowKey={(r) => r.registration_id} empty="No registrations yet" />
                <Pagination page={regs.data?.meta.page ?? 1} totalPages={regs.data?.meta.totalPages ?? 1} total={regs.data?.meta.total ?? 0} onPage={setPage} />
              </>
            )}
          </Card>
        </>
      ) : null}
    </>
  );
}
