import { useState } from 'react';
import { FileBadge, Megaphone, Plus, Trash2 } from 'lucide-react';
import { api, errMsg } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useToast } from '../../components/toast';
import { Card, PageHeader, StatCard, Tabs, DataTable, StatusBadge, Loading, ErrorBox, Modal, Field, SelectField, TextAreaField, useFetch, type Column, EmptyState } from '../../components/ui';
import { dateStr, num, pct, titleCase } from '../../lib/format';
interface Exam {
  exam_id: number; exam_code: string; name: string; exam_type: string; academic_year_id: number;
  semester_id: number; start_date: string; end_date: string; registration_start: string;
  registration_end: string; result_published: boolean; min_attendance_required: string; status: string;
  semesterNo?: number; yearLabel?: string; registeredCount?: number;
}
interface Schedule {
  schedule_id: number; exam_id: number; subject_id: number; program_id: number; exam_date: string;
  start_time: string; end_time: string; room_number: string; max_marks: number; min_marks: number;
  invigilator_id: number; subjectCode: string; subjectName: string; programCode: string;
  invigilatorName: string; registered: number;
}
interface RegStats { total: number; registered: string; rejected: string; appeared: string; absent: string; ineligible: string; }

const EXAM_TYPES = ['INSEM', 'ENDSEM', 'MIDSEM', 'QUIZ', 'PRACTICAL', 'VIVA', 'MOCK', 'RETEST', 'SUPPLEMENTARY'];
const STATUSES = ['DRAFT', 'SCHEDULED', 'REGISTRATION_OPEN', 'REGISTRATION_CLOSED', 'ONGOING', 'COMPLETED', 'RESULT_PUBLISHED', 'CANCELLED'];
const STUDENT_VISIBLE = ['SCHEDULED', 'REGISTRATION_OPEN', 'REGISTRATION_CLOSED', 'ONGOING', 'COMPLETED', 'RESULT_PUBLISHED'];

export default function ExamsPage() {
  const { user, has } = useAuth();
  const toast = useToast();
  const isExam = has('ADMIN', 'EXAM_CELL');
  const [tab, setTab] = useState('exams');
  const [statusFilter, setStatusFilter] = useState('');

  const exams = useFetch(() => api.get<Exam[]>('/exams', { limit: 100 }), []);
  const schedules = useFetch(() => api.get<Schedule[]>('/exams/schedules', { limit: 300 }), []);
  const stats = useFetch(() => api.get<RegStats>('/exams/registrations/stats'), []);
  const threshold = useFetch(() => api.get<{ minAttendancePercentage: number }>('/exams/policy/threshold'), []);
  const semesters = useFetch(() => api.get<{ semester_id: number; semester_no: number; name: string }[]>('/academics/semesters', { limit: 200 }), []);
  const years = useFetch(() => api.get<{ academic_year_id: number; year_label: string }[]>('/academics/years'), []);

  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    examCode: '', name: '', examType: 'ENDSEM', semesterId: '', academicYearId: '',
    startDate: new Date().toISOString().slice(0, 10), endDate: '',
    registrationStart: '', registrationEnd: '',
  });

  const [notifyOpen, setNotifyOpen] = useState(false);
  const [notice, setNotice] = useState({ title: '', message: '', link: '' });

  const createExam = async () => {
    setBusy(true);
    try {
      await api.post('/exams', {
        examCode: form.examCode, name: form.name, examType: form.examType,
        semesterId: Number(form.semesterId), academicYearId: Number(form.academicYearId),
        startDate: form.startDate, endDate: form.endDate || null,
        registrationStart: form.registrationStart || null, registrationEnd: form.registrationEnd || null,
      });
      toast.success('Examination created.');
      setOpen(false);
      exams.reload();
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };

  const removeSchedule = async (id: number) => {
    try { await api.del(`/exams/schedules/${id}`); toast.success('Schedule removed.'); schedules.reload(); }
    catch (e) { toast.error(errMsg(e)); }
  };

  const broadcast = async () => {
    setBusy(true);
    try {
      const res = await api.post<{ recipients?: number; message?: string }>('/exams/notify', notice);
      toast.success(res.message ?? 'Announcement sent.');
      setNotifyOpen(false);
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };

  const examCols: Column<Exam>[] = [
    { key: 'exam_code', header: 'Code', render: (r) => <span className="font-medium text-slate-800">{r.exam_code}</span> },
    { key: 'name', header: 'Examination' },
    { key: 'exam_type', header: 'Type', render: (r) => <span className="chip bg-slate-100 text-slate-600">{r.exam_type}</span> },
    { key: 'start_date', header: 'Starts', render: (r) => dateStr(r.start_date) },
    { key: 'end_date', header: 'Ends', render: (r) => dateStr(r.end_date) },
    {
      key: 'registration', header: 'Registration window',
      render: (r) => (r.registration_start ? `${dateStr(r.registration_start)} → ${dateStr(r.registration_end)}` : '—'),
    },
    { key: 'min_attendance_required', header: 'Min attendance', align: 'right', render: (r) => pct(r.min_attendance_required, 0) },
    { key: 'result_published', header: 'Result', render: (r) => (r.result_published ? <span className="chip bg-emerald-100 text-emerald-700">Published</span> : <span className="text-slate-400">Pending</span>) },
    { key: 'status', header: 'Status', render: (r) => <StatusBadge value={r.status} /> },
  ];

  const schedCols: Column<Schedule>[] = [
    { key: 'exam_date', header: 'Date', render: (r) => dateStr(r.exam_date) },
    { key: 'start_time', header: 'Time', render: (r) => `${String(r.start_time).slice(0, 5)} – ${String(r.end_time).slice(0, 5)}` },
    { key: 'subjectCode', header: 'Subject', render: (r) => <span className="font-medium text-slate-800">{r.subjectCode}</span> },
    { key: 'subjectName', header: 'Name' },
    { key: 'programCode', header: 'Program', render: (r) => <span className="text-xs">{r.programCode}</span> },
    { key: 'room_number', header: 'Hall' },
    { key: 'invigilatorName', header: 'Invigilator' },
    { key: 'max_marks', header: 'Marks', align: 'right', render: (r) => `${num(r.max_marks)} / min ${num(r.min_marks)}` },
    { key: 'registered', header: 'Registered', align: 'right' },
    {
      key: 'actions', header: '', align: 'right',
      render: (r) => (isExam ? (
        <button type="button" onClick={() => removeSchedule(r.schedule_id)} className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600" aria-label="Remove"><Trash2 className="h-3.5 w-3.5" /></button>
      ) : null),
    },
  ];

  const myExams = (exams.data ?? []).filter((e) => STUDENT_VISIBLE.includes(e.status));
  const visibleExams = (user?.role === 'STUDENT' ? myExams : (exams.data ?? []))
    .filter((e) => !statusFilter || e.status === statusFilter);

  return (
    <>
      <PageHeader
        title="Examinations"
        subtitle={`Registration is gated on attendance: the database refuses students below ${num(threshold.data?.minAttendancePercentage ?? 75)}%.`}
        icon={<FileBadge className="h-5 w-5" />}
        actions={
          isExam ? (
            <>
              <button type="button" className="btn-secondary btn-sm" onClick={() => setNotifyOpen(true)}><Megaphone className="h-4 w-4" /> Announce</button>
              <button type="button" className="btn-primary btn-sm" onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> New examination</button>
            </>
          ) : null
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard label="Examinations" value={num(exams.data?.length)} icon={<FileBadge className="h-5 w-5" />} />
        <StatCard label="Registrations" value={num(stats.data?.total)} tone="sky" />
        <StatCard label="Appeared" value={num(stats.data?.appeared)} tone="emerald" />
        <StatCard label="Absent" value={num(stats.data?.absent)} tone="rose" />
        <StatCard label="Rejected / ineligible" value={num(stats.data?.rejected)} tone="amber" />
      </div>

      <Tabs active={tab} onChange={setTab} tabs={[{ key: 'exams', label: 'Examinations', count: exams.data?.length }, { key: 'schedule', label: 'Schedule', count: schedules.data?.length }]} />

      {tab === 'exams' ? (
        <Card>
          {exams.error ? <ErrorBox message={exams.error} onRetry={exams.reload} /> : (
<>
              <div className="grid gap-3 p-4 sm:grid-cols-3">
                <SelectField placeholder="All statuses" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} options={STATUSES.map((s) => ({ value: s, label: titleCase(s) }))} />
              </div>
              <DataTable columns={examCols} rows={visibleExams} loading={exams.loading} rowKey={(r) => r.exam_id} empty="No examinations" />
            </>
          )}
        </Card>
      ) : (
        <Card>
          {schedules.error ? <ErrorBox message={schedules.error} onRetry={schedules.reload} /> : schedules.loading ? <Loading /> : (
            schedules.data?.length
              ? <DataTable columns={schedCols} rows={schedules.data} rowKey={(r) => r.schedule_id} />
              : <EmptyState title="No schedule published" hint="Exam cell staff add schedule rows per subject and program." />
          )}
        </Card>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Create an examination"
        footer={
          <>
            <button type="button" className="btn-secondary btn-sm" onClick={() => setOpen(false)}>Cancel</button>
            <button type="button" className="btn-primary btn-sm" onClick={createExam} disabled={busy}>{busy ? 'Saving…' : 'Create'}</button>
          </>
        }
      >
        <div className="grid gap-x-4 sm:grid-cols-2">
          <Field label="Exam code" value={form.examCode} onChange={(e) => setForm({ ...form, examCode: e.target.value })} required placeholder="ENDSEM-2026-27-S5" />
          <SelectField label="Type" value={form.examType} onChange={(e) => setForm({ ...form, examType: e.target.value })} options={EXAM_TYPES.map((t) => ({ value: t, label: t }))} />
          <Field label="Name" className="sm:col-span-2" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          <SelectField label="Semester" placeholder="Select" value={form.semesterId} onChange={(e) => setForm({ ...form, semesterId: e.target.value })} options={(semesters.data ?? []).map((s) => ({ value: s.semester_id, label: s.name }))} />
          <SelectField label="Academic year" placeholder="Select" value={form.academicYearId} onChange={(e) => setForm({ ...form, academicYearId: e.target.value })} options={(years.data ?? []).map((y) => ({ value: y.academic_year_id, label: y.year_label }))} />
          <Field label="Start date" type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
          <Field label="End date" type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
          <Field label="Registration opens" type="date" value={form.registrationStart} onChange={(e) => setForm({ ...form, registrationStart: e.target.value })} />
          <Field label="Registration closes" type="date" value={form.registrationEnd} onChange={(e) => setForm({ ...form, registrationEnd: e.target.value })} />
        </div>
        <p className="mt-2 text-xs text-slate-500">
          The minimum attendance required is copied from the <code className="rounded bg-slate-100 px-1">MIN_ATTENDANCE_PERCENTAGE</code> setting
          when the exam is created, so the rule stays consistent with the rest of the system.
        </p>
      </Modal>

      <Modal
        open={notifyOpen}
        onClose={() => setNotifyOpen(false)}
        title="Broadcast an exam announcement"
        footer={
          <>
            <button type="button" className="btn-secondary btn-sm" onClick={() => setNotifyOpen(false)}>Cancel</button>
            <button type="button" className="btn-primary btn-sm" onClick={broadcast} disabled={busy}>{busy ? 'Sending…' : 'Send'}</button>
          </>
        }
      >
        <Field label="Title" value={notice.title} onChange={(e) => setNotice({ ...notice, title: e.target.value })} required />
        <TextAreaField label="Message" value={notice.message} onChange={(e) => setNotice({ ...notice, message: e.target.value })} required />
        <Field label="Link (optional)" value={notice.link} onChange={(e) => setNotice({ ...notice, link: e.target.value })} placeholder="/exams" />
        <p className="text-xs text-slate-500">Delivered through the notifications table — every student sees it in the bell menu.</p>
      </Modal>
    </>
  );
}
