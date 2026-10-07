import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ClipboardCheck, Plus } from 'lucide-react';
import { api, errMsg } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useToast } from '../../components/toast';
import { Card, PageHeader, StatCard, SelectField, Field, DataTable, Pagination, StatusBadge, Modal, ErrorBox, useFetch, type Column } from '../../components/ui';
import { dateStr, num } from '../../lib/format';
interface Session {
  session_id: number; offering_id: number; faculty_id: number; session_date: string;
  session_no: number; topic: string; room_number: string; status: string;
  subjectCode: string; subjectName: string; facultyName: string;
  markedCount: number; presentCount: number;
}
interface Stats { students: number; average: string; safe: string; warning: string; critical: string; }

export default function AttendanceSessionsPage() {
  const { user, has } = useAuth();
  const toast = useToast();
  const [offeringId, setOfferingId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);

  const params = useMemo(() => ({
    page, limit: 25,
    offeringId: offeringId || undefined,
    facultyId: user?.role === 'FACULTY' ? user.facultyId : undefined,
    from: from || undefined, to: to || undefined,
  }), [page, offeringId, from, to, user]);

  const { data, loading, error, reload } = useFetch(() => api.page<Session>('/attendance/sessions', params), [params]);
  const stats = useFetch(() => api.get<Stats>('/attendance/report/stats'), []);

  const mine = useFetch(
    () => (user?.role === 'FACULTY' ? api.get<Record<string, unknown>[]>('/faculty/me/subjects') : api.get<Record<string, unknown>[]>('/academics/offerings', { limit: 300 })),
    [user?.role],
  );
  const allOfferings = useFetch(() => api.get<{ offering_id: number; subjectCode: string; subjectName: string; sectionCode: string; semesterNo: number }[]>('/academics/offerings', { limit: 300 }), []);

  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    offeringId: '', sessionDate: new Date().toISOString().slice(0, 10),
    topic: '', roomNumber: '', startTime: '09:00', endTime: '10:00',
  });

  const submit = async () => {
    setBusy(true);
    try {
      const res = await api.post<{ sessionId: number }>('/attendance/sessions', {
        offeringId: Number(form.offeringId),
        sessionDate: form.sessionDate,
        topic: form.topic || null,
        roomNumber: form.roomNumber || null,
        startTime: `${form.startTime}:00`,
        endTime: `${form.endTime}:00`,
      });
      toast.success(`Lecture ${res.sessionId} created.`);
      setOpen(false);
      reload();
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };

  const columns: Column<Session>[] = [
    { key: 'session_date', header: 'Date', render: (r) => dateStr(r.session_date) },
    { key: 'session_no', header: 'Lecture', align: 'right', render: (r) => `#${r.session_no}` },
    { key: 'subjectCode', header: 'Subject', render: (r) => <span className="font-medium text-slate-800">{r.subjectCode}</span> },
    { key: 'subjectName', header: 'Name' },
    { key: 'topic', header: 'Topic', render: (r) => <span className="max-w-xs truncate text-xs text-slate-600">{r.topic || '—'}</span> },
    { key: 'room_number', header: 'Room' },
    { key: 'markedCount', header: 'Marked', align: 'right', render: (r) => `${num(r.presentCount)}/${num(r.markedCount)}` },
    { key: 'status', header: 'Status', render: (r) => <StatusBadge value={r.status} /> },
    {
      key: 'actions', header: '', align: 'right',
      render: (r) => (
        <Link to={`/attendance/sessions/${r.session_id}`} className="btn-secondary btn-xs">
          {Number(r.markedCount) > 0 ? 'Edit marking' : 'Mark attendance'}
        </Link>
      ),
    },
  ];

  const offeringOptions = (allOfferings.data ?? []).map((o) => ({
    value: o.offering_id,
    label: `${o.subjectCode} · ${o.subjectName} · Sec ${o.sectionCode} · Sem ${o.semesterNo}`,
  }));

  return (
    <>
      <PageHeader
        title="Attendance sessions"
        subtitle="One row per lecture. Marking attendance writes rows into the attendance table through sp_mark_attendance_bulk."
        icon={<ClipboardCheck className="h-5 w-5" />}
        actions={
          <>
            <Link to="/attendance/reports" className="btn-secondary btn-sm">Reports</Link>
            {has('ADMIN', 'FACULTY') ? <button type="button" className="btn-primary btn-sm" onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> New lecture</button> : null}
          </>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard label="Institute average" value={`${num(stats.data?.average, 2)}%`} />
        <StatCard label="Safe (≥75%)" value={num(stats.data?.safe)} tone="emerald" />
        <StatCard label="Warning (65-74%)" value={num(stats.data?.warning)} tone="amber" />
        <StatCard label="Critical (<65%)" value={num(stats.data?.critical)} tone="rose" />
        <StatCard label="Students tracked" value={num(stats.data?.students)} tone="sky" />
      </div>

      <Card className="mb-4">
        <div className="grid gap-3 p-4 sm:grid-cols-4">
          <SelectField placeholder="All offerings" label="Offering" value={offeringId} onChange={(e) => { setOfferingId(e.target.value); setPage(1); }} options={offeringOptions} className="sm:col-span-2" />
          <Field label="From" type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} />
          <Field label="To" type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} />
        </div>
      </Card>

      <Card>
        {error ? <ErrorBox message={error} onRetry={reload} /> : (
          <>
            <DataTable columns={columns} rows={data?.rows ?? []} loading={loading} rowKey={(r) => r.session_id} empty="No lectures found" />
            <Pagination page={data?.meta.page ?? 1} totalPages={data?.meta.totalPages ?? 1} total={data?.meta.total ?? 0} onPage={setPage} />
          </>
        )}
      </Card>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Create a lecture session"
        footer={
          <>
            <button type="button" className="btn-secondary btn-sm" onClick={() => setOpen(false)}>Cancel</button>
            <button type="button" className="btn-primary btn-sm" onClick={submit} disabled={busy || !form.offeringId}>{busy ? 'Saving…' : 'Create & mark'}</button>
          </>
        }
      >
        <div className="grid gap-x-4 sm:grid-cols-2">
          <SelectField
            label="Course offering" placeholder="Select" value={form.offeringId} onChange={(e) => setForm({ ...form, offeringId: e.target.value })}
            options={
              user?.role === 'FACULTY' && mine.data?.length
                ? (mine.data as Record<string, any>[]).map((o) => ({ value: o.offeringId, label: `${o.subjectCode} · ${o.subjectName} · Sec ${o.sectionCode}` }))
                : offeringOptions
            }
            className="sm:col-span-2"
          />
          <Field label="Date" type="date" value={form.sessionDate} onChange={(e) => setForm({ ...form, sessionDate: e.target.value })} required />
          <Field label="Room" value={form.roomNumber} onChange={(e) => setForm({ ...form, roomNumber: e.target.value })} placeholder="R101" />
          <Field label="Start" type="time" value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} />
          <Field label="End" type="time" value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })} />
          <Field label="Topic covered" value={form.topic} onChange={(e) => setForm({ ...form, topic: e.target.value })} className="sm:col-span-2" placeholder="Unit 3 — Convolution" />
        </div>
        <p className="mt-2 text-xs text-slate-500">
          The lecture number is assigned automatically per offering and date by the API, and the faculty is taken from
          the course offering — not from the browser.
        </p>
      </Modal>
    </>
  );
}
