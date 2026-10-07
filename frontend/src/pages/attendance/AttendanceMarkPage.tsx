import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Save, Users, CheckCheck, XCircle, Clock } from 'lucide-react';
import { api, errMsg } from '../../lib/api';
import { useToast } from '../../components/toast';
import { Card, PageHeader, StatCard, SearchInput, Loading, ErrorBox, useFetch, EmptyState } from '../../components/ui';
import { dateStr, num, pct, titleCase } from '../../lib/format';
interface Session {
  session_id: number; offering_id: number; session_date: string; session_no: number;
  topic: string; room_number: string; subjectCode: string; subjectName: string; programId: number;
}
interface RosterRow {
  studentId: number; rollNumber: string; studentName: string; status: string; remarks: string | null; attendanceId: number | null;
}

const STATUSES = ['PRESENT', 'ABSENT', 'LATE', 'EXCUSED'] as const;
type Status = (typeof STATUSES)[number];

const TONE: Record<Status, string> = {
  PRESENT: 'border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100',
  ABSENT: 'border-rose-300 bg-rose-50 text-rose-700 hover:bg-rose-100',
  LATE: 'border-sky-300 bg-sky-50 text-sky-700 hover:bg-sky-100',
  EXCUSED: 'border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100',
};
const ACTIVE_TONE: Record<Status, string> = {
  PRESENT: 'bg-emerald-600 text-white',
  ABSENT: 'bg-rose-600 text-white',
  LATE: 'bg-sky-600 text-white',
  EXCUSED: 'bg-amber-600 text-white',
};

export default function AttendanceMarkPage() {
  const { id } = useParams<{ id: string }>();
  const toast = useToast();

  const session = useFetch<Session>(() => api.get<Session>(`/attendance/sessions/${id}`), [id]);
  const roster = useFetch<RosterRow[]>(() => api.get<RosterRow[]>(`/attendance/sessions/${id}/roster`), [id]);

  const [marks, setMarks] = useState<Record<number, Status>>({});
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!roster.data) return;
    setMarks(Object.fromEntries(roster.data.map((r) => [r.studentId, (r.status ?? 'PRESENT') as Status])));
  }, [roster.data]);

  const rows = useMemo(
    () => (roster.data ?? []).filter((r) => {
      const q = search.trim().toLowerCase();
      return !q || r.studentName.toLowerCase().includes(q) || r.rollNumber.toLowerCase().includes(q);
    }),
    [roster.data, search],
  );

  const present = Object.values(marks).filter((s) => s === 'PRESENT' || s === 'LATE').length;
  const total = Object.keys(marks).length;

  const saveOne = async (studentId: number, status: Status) => {
    setMarks((m) => ({ ...m, [studentId]: status }));
    try {
      await api.post(`/attendance/sessions/${id}/mark`, { studentId, status });
    } catch (e) {
      toast.error(errMsg(e));
      setMarks((m) => ({ ...m, [studentId]: (roster.data?.find((r) => r.studentId === studentId)?.status ?? 'PRESENT') as Status }));
    }
  };

  const saveAll = async () => {
    setSaving(true);
    try {
      // One call per distinct status - the stored procedure sp_mark_attendance_bulk
      // writes them all inside a single transaction on the server.
      for (const status of STATUSES) {
        const ids = Object.entries(marks).filter(([, s]) => s === status).map(([k]) => Number(k));
        if (ids.length) await api.post(`/attendance/sessions/${id}/mark-bulk`, { studentIds: ids, status });
      }
      toast.success(`Attendance saved for ${total} students.`);
      roster.reload();
    } catch (e) { toast.error(errMsg(e)); } finally { setSaving(false); }
  };

  const markAllAs = (status: Status) => {
    setMarks(Object.fromEntries((roster.data ?? []).map((r) => [r.studentId, status])));
  };

  if (session.loading || roster.loading) return <Loading label="Loading the class roster…" />;
  if (session.error || roster.error) return <ErrorBox message={session.error ?? roster.error ?? ''} onRetry={roster.reload} />;
  if (!session.data) return null;

  return (
    <>
      <Link to="/attendance/sessions" className="mb-3 inline-flex items-center gap-1 text-sm text-brand-700 hover:underline">
        <ArrowLeft className="h-4 w-4" /> Back to sessions
      </Link>

      <PageHeader
        title={`${session.data.subjectCode} — Lecture #${session.data.session_no}`}
        subtitle={`${dateStr(session.data.session_date)} · ${session.data.subjectName}${session.data.topic ? ` · ${session.data.topic}` : ''}${session.data.room_number ? ` · Room ${session.data.room_number}` : ''}`}
        icon={<Users className="h-5 w-5" />}
        actions={
          <>
            <button type="button" className="btn-secondary btn-sm" onClick={() => markAllAs('PRESENT')} disabled={!total}>
              <CheckCheck className="h-4 w-4" /> Mark all present
            </button>
            <button type="button" className="btn-primary btn-sm" onClick={saveAll} disabled={saving || !total}>
              <Save className="h-4 w-4" /> {saving ? 'Saving…' : 'Save attendance'}
            </button>
          </>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Students enrolled" value={num(total)} icon={<Users className="h-5 w-5" />} />
        <StatCard label="Present + late" value={num(present)} tone="emerald" icon={<CheckCheck className="h-5 w-5" />} />
        <StatCard label="Absent" value={num(Object.values(marks).filter((s) => s === 'ABSENT').length)} tone="rose" icon={<XCircle className="h-5 w-5" />} />
        <StatCard label="Turnout" value={pct(total ? (present / total) * 100 : 0, 1)} tone="sky" icon={<Clock className="h-5 w-5" />} />
      </div>

      <Card className="mb-4">
        <div className="flex flex-wrap items-center gap-2 p-4">
          <SearchInput value={search} onChange={setSearch} placeholder="Find a student…" className="min-w-[16rem]" />
          <div className="ml-auto flex flex-wrap gap-1.5">
            {STATUSES.map((s) => (
              <button key={s} type="button" className={`btn btn-xs border ${TONE[s]}`} onClick={() => markAllAs(s)}>
                All {titleCase(s)}
              </button>
            ))}
          </div>
        </div>
      </Card>

      <Card>
        {rows.length === 0 ? (
          <EmptyState
            title="No students enrolled"
            hint="Enroll students into this course offering first — the roster is built from the enrollments table."
            action={<Link to="/enrollments" className="btn-primary btn-sm mt-2">Go to enrollment</Link>}
          />
        ) : (
          <div className="divide-y divide-slate-100">
            {rows.map((r) => (
              <div key={r.studentId} className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-800">{r.studentName}</p>
                  <p className="text-xs text-slate-500">
                    {r.rollNumber}
                    {r.attendanceId ? ' · already recorded' : ' · not recorded yet'}
                  </p>
                </div>
                <div className="flex gap-1.5">
                  {STATUSES.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => saveOne(r.studentId, s)}
                      className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition ${
                        marks[r.studentId] === s ? `${ACTIVE_TONE[s]} border-transparent` : `${TONE[s]} bg-white`
                      }`}
                    >
                      {titleCase(s)}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <p className="mt-3 text-xs text-slate-400">
        Every click persists immediately through <code className="rounded bg-slate-200 px-1">sp_mark_attendance_bulk</code>.
        Attendance here is what decides exam eligibility — students under the threshold stored in
        <code className="mx-1 rounded bg-slate-200 px-1">MIN_ATTENDANCE_PERCENTAGE</code> are refused at registration.
      </p>
    </>
  );
}
