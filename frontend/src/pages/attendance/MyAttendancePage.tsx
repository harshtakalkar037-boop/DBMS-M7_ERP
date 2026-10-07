import { useState } from 'react';
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ClipboardCheck, TriangleAlert } from 'lucide-react';
import { api } from '../../lib/api';
import { Card, PageHeader, StatCard, Tabs, DataTable, ProgressBar, StatusBadge, ErrorBox, useFetch, type Column } from '../../components/ui';
import { num, pct, titleCase } from '../../lib/format';
interface Overall {
  student_id: number; roll_number: string; full_name: string; current_semester_no: number;
  total_classes: number; attended_classes: string; overall_percentage: string;
}
interface SubjectRow {
  offering_id: number; semester_id: number; semester_name: string; subject_code: string;
  subject_name: string; credits: number; total_classes: number; attended_classes: string;
  absent_classes: string; attendance_percentage: string; attendance_status: string;
}
interface Monthly { year: number; month: number; monthName: string; totalClasses: number; attended: number; percentage: string; }

export default function MyAttendancePage() {
  const [tab, setTab] = useState('subjects');

  const overall = useFetch(() => api.get<Overall>('/attendance/me/overall'), []);
  const subjects = useFetch(() => api.get<SubjectRow[]>('/attendance/me', { limit: 200 }), []);
  const monthly = useFetch(() => api.get<Monthly[]>('/attendance/me/monthly'), []);
  const settings = useFetch(() => api.get<{ value: string }>('/exams/policy/threshold'), []);
  const threshold = Number(settings.data?.value ?? 75);

  const rows = subjects.data ?? [];
  const atRisk = rows.filter((r) => Number(r.attendance_percentage) < threshold);

  const subjectCols: Column<SubjectRow>[] = [
    { key: 'subject_code', header: 'Code', render: (r) => <span className="font-medium text-slate-800">{r.subject_code}</span> },
    { key: 'subject_name', header: 'Subject' },
    { key: 'semester_name', header: 'Semester' },
    { key: 'total_classes', header: 'Classes', align: 'right' },
    { key: 'attended_classes', header: 'Attended', align: 'right' },
    { key: 'absent_classes', header: 'Absent', align: 'right' },
    {
      key: 'attendance_percentage', header: 'Attendance',
      render: (r) => (
        <div className="flex w-44 items-center gap-2">
          <ProgressBar value={Number(r.attendance_percentage)} />
          <span className={`w-14 shrink-0 text-right text-xs ${Number(r.attendance_percentage) < threshold ? 'font-semibold text-rose-600' : ''}`}>{pct(r.attendance_percentage, 1)}</span>
        </div>
      ),
    },
    { key: 'attendance_status', header: 'Status', render: (r) => <StatusBadge value={r.attendance_status} /> },
  ];

  return (
    <>
      <PageHeader
        title="My attendance"
        subtitle="Your live attendance across every enrolled subject, straight from the attendance table."
        icon={<ClipboardCheck className="h-5 w-5" />}
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Overall attendance"
          value={pct(overall.data?.overall_percentage)}
          tone={Number(overall.data?.overall_percentage ?? 0) >= threshold ? 'emerald' : 'rose'}
          hint={`${num(overall.data?.attended_classes)} of ${num(overall.data?.total_classes)} classes`}
        />
        <StatCard label="Subjects tracked" value={num(rows.length)} tone="sky" />
        <StatCard label="Below threshold" value={num(atRisk.length)} tone={atRisk.length ? 'rose' : 'emerald'} hint={`Threshold ${threshold}%`} />
        <StatCard label="Current semester" value={num(overall.data?.current_semester_no)} tone="slate" />
      </div>

      {atRisk.length ? (
        <Card className="mb-4 border-rose-200 bg-rose-50">
          <div className="flex gap-3 p-4">
            <TriangleAlert className="h-5 w-5 shrink-0 text-rose-500" />
            <div className="text-sm">
              <p className="font-semibold text-rose-800">
                You are below the {threshold}% attendance requirement in {atRisk.length} subject{atRisk.length === 1 ? '' : 's'}.
              </p>
              <p className="mt-1 text-rose-700">
                The examination module will refuse your registration for these subjects until you cross the threshold.
                Subjects: {atRisk.map((r) => r.subject_code).join(', ')}.
              </p>
            </div>
          </div>
        </Card>
      ) : null}

      <Tabs active={tab} onChange={setTab} tabs={[{ key: 'subjects', label: 'By subject' }, { key: 'trend', label: 'Monthly trend' }]} />

      {tab === 'subjects' ? (
        <Card>
          {subjects.error ? <ErrorBox message={subjects.error} onRetry={subjects.reload} /> : (
            <DataTable columns={subjectCols} rows={rows} loading={subjects.loading} rowKey={(r) => r.offering_id} empty="No attendance records yet" />
          )}
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="card-pad">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Monthly attendance %</h2>
            {(monthly.data ?? []).length ? (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={monthly.data} margin={{ top: 5, right: 8, bottom: 0, left: -22 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="monthName" fontSize={10} />
                    <YAxis domain={[0, 100]} fontSize={10} />
                    <Tooltip formatter={(v) => `${num(v, 1)}%`} />
                    <Line type="monotone" dataKey="percentage" stroke="#4f46e5" strokeWidth={2} dot={{ r: 3 }} name="Attendance %" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : <p className="py-10 text-center text-sm text-slate-500">Not enough history yet.</p>}
          </Card>
          <Card className="card-pad">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Classes held vs attended</h2>
            {(monthly.data ?? []).length ? (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={monthly.data} margin={{ top: 5, right: 8, bottom: 0, left: -22 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="monthName" fontSize={10} />
                    <YAxis allowDecimals={false} fontSize={10} />
                    <Tooltip />
                    <Bar dataKey="totalClasses" fill="#c7d2fe" radius={[3, 3, 0, 0]} name="Held" />
                    <Bar dataKey="attended" fill="#4f46e5" radius={[3, 3, 0, 0]} name="Attended" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : <p className="py-10 text-center text-sm text-slate-500">Not enough history yet.</p>}
          </Card>
        </div>
      )}

      <Card className="mt-4">
        <div className="border-b border-slate-200 px-4 py-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Subject-wise standing</h2>
        </div>
        <div className="space-y-3 p-4">
          {rows.map((r) => (
            <div key={r.offering_id}>
              <div className="mb-1 flex items-center justify-between text-xs">
                <span className="truncate font-medium text-slate-700">{r.subject_code} · {r.subject_name}</span>
                <span className="shrink-0 text-slate-500">{titleCase(r.attendance_status)} · {pct(r.attendance_percentage, 1)}</span>
              </div>
              <ProgressBar value={Number(r.attendance_percentage)} />
            </div>
          ))}
          {!rows.length ? <p className="py-6 text-center text-sm text-slate-500">No records yet.</p> : null}
        </div>
      </Card>
    </>
  );
}
