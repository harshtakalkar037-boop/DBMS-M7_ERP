import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { BarChart3, BellRing, Download } from 'lucide-react';
import { api, errMsg } from '../../lib/api';
import { useToast } from '../../components/toast';
import { Card, PageHeader, StatCard, SelectField, SearchInput, Tabs, DataTable, StatusBadge, ProgressBar, Loading, ErrorBox, useFetch, useDebounced, type Column } from '../../components/ui';
import { downloadCsv } from '../../lib/csv';
import { num, pct } from '../../lib/format';
interface Stats { students: number; average: string; safe: string; warning: string; critical: string; }
interface LowRow {
  studentId: number; rollNumber: string; studentName: string; email: string; phone: string;
  departmentCode: string; programCode: string; percentage: string; status: string; semesterPercentage: string;
}
interface OfferingRow { studentId: number; rollNumber: string; studentName: string; totalClasses: number; attended: string; absent: string; percentage: string; }

export default function AttendanceReportsPage() {
  const toast = useToast();
  const [tab, setTab] = useState('defaulters');
  const [search, setSearch] = useState('');
  const [offeringId, setOfferingId] = useState('');
  const [deptId, setDeptId] = useState('');
  const term = useDebounced(search, 350);

  const stats = useFetch(() => api.get<Stats>('/attendance/report/stats'), []);
  const settings = useFetch(() => api.get<{ value: string }>('/exams/policy/threshold'), []);
  const threshold = Number(settings.data?.value ?? 75);

  const lowParams = useMemo(() => ({ limit: 500, departmentId: deptId || undefined }), [deptId]);
  const low = useFetch(() => api.get<LowRow[]>('/attendance/report/low', lowParams), [lowParams]);
  const offerings = useFetch(() => api.get<{ offering_id: number; subjectCode: string; subjectName: string; sectionCode: string; semesterNo: number }[]>('/academics/offerings', { limit: 300 }), []);
  const depts = useFetch(() => api.get<{ department_id: number; department_code: string; name: string }[]>('/academics/departments', { limit: 100 }), []);
  const offeringReport = useFetch<OfferingRow[]>(
    () => (offeringId ? api.get<OfferingRow[]>(`/attendance/report/offering/${offeringId}`) : Promise.resolve([])),
    [offeringId],
  );

  const filtered = (low.data ?? []).filter((r) => {
    const q = term.toLowerCase();
    return !q || r.studentName.toLowerCase().includes(q) || r.rollNumber.toLowerCase().includes(q);
  });

  const warn = async () => {
    try {
      const res = await api.post<{ notified: number; message?: string }>('/attendance/warn-low');
      toast.success(res.message ?? `${num(res.notified)} students notified.`);
    } catch (e) { toast.error(errMsg(e)); }
  };

  const pie = [
    { name: 'Safe', value: Number(stats.data?.safe ?? 0), color: '#059669' },
    { name: 'Warning', value: Number(stats.data?.warning ?? 0), color: '#f59e0b' },
    { name: 'Critical', value: Number(stats.data?.critical ?? 0), color: '#e11d48' },
  ];

  const lowCols: Column<LowRow>[] = [
    { key: 'rollNumber', header: 'Roll no.', render: (r) => <Link to={`/students/${r.studentId}`} className="font-medium text-brand-700 hover:underline">{r.rollNumber}</Link> },
    { key: 'studentName', header: 'Student' },
    { key: 'programCode', header: 'Program', render: (r) => <span className="text-xs">{r.programCode}</span> },
    {
      key: 'percentage', header: 'Overall',
      render: (r) => (
        <div className="flex w-40 items-center gap-2">
          <ProgressBar value={Number(r.percentage)} />
          <span className="w-12 shrink-0 text-right text-xs font-medium text-rose-600">{pct(r.percentage, 1)}</span>
        </div>
      ),
    },
    { key: 'semesterPercentage', header: 'This semester', align: 'right', render: (r) => pct(r.semesterPercentage, 1) },
    { key: 'status', header: 'Band', render: (r) => <StatusBadge value={r.status} /> },
    { key: 'phone', header: 'Phone' },
  ];

  const offerCols: Column<OfferingRow>[] = [
    { key: 'rollNumber', header: 'Roll no.', render: (r) => <Link to={`/students/${r.studentId}`} className="font-medium text-brand-700 hover:underline">{r.rollNumber}</Link> },
    { key: 'studentName', header: 'Student' },
    { key: 'totalClasses', header: 'Classes', align: 'right' },
    { key: 'attended', header: 'Attended', align: 'right' },
    { key: 'absent', header: 'Absent', align: 'right' },
    {
      key: 'percentage', header: 'Attendance',
      render: (r) => (
        <div className="flex w-44 items-center gap-2">
          <ProgressBar value={Number(r.percentage)} />
          <span className={`w-14 shrink-0 text-right text-xs ${Number(r.percentage) < threshold ? 'font-semibold text-rose-600' : ''}`}>{pct(r.percentage, 1)}</span>
        </div>
      ),
    },
    {
      key: 'eligible', header: 'Exam eligibility',
      render: (r) => (Number(r.percentage) >= threshold
        ? <span className="chip bg-emerald-100 text-emerald-700">Eligible</span>
        : <span className="chip bg-rose-100 text-rose-700">Blocked</span>),
    },
  ];

  return (
    <>
      <PageHeader
        title="Attendance reports"
        subtitle={`Defaulters are computed against the MIN_ATTENDANCE_PERCENTAGE setting — currently ${threshold}%.`}
        icon={<BarChart3 className="h-5 w-5" />}
        actions={
          <>
            <button type="button" className="btn-secondary btn-sm" disabled={!filtered.length} onClick={() => downloadCsv('low-attendance.csv', filtered as unknown as Record<string, unknown>[])}>
              <Download className="h-4 w-4" /> Export
            </button>
            <button type="button" className="btn-primary btn-sm" onClick={warn}>
              <BellRing className="h-4 w-4" /> Notify defaulters
            </button>
          </>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard label="Institute average" value={pct(stats.data?.average)} icon={<BarChart3 className="h-5 w-5" />} />
        <StatCard label="Safe" value={num(stats.data?.safe)} tone="emerald" />
        <StatCard label="Warning" value={num(stats.data?.warning)} tone="amber" />
        <StatCard label="Critical" value={num(stats.data?.critical)} tone="rose" />
        <StatCard label="Below threshold" value={num(low.data?.length)} tone="rose" hint="Cannot register for exams" />
      </div>

      <Card className="card-pad mb-4">
        <div className="grid gap-4 lg:grid-cols-2">
          <div>
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">Attendance bands</h2>
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={pie} dataKey="value" nameKey="name" outerRadius={70}>
                    {pie.map((e) => <Cell key={e.name} fill={e.color} />)}
                  </Pie>
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div>
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">Defaulters by department</h2>
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={Object.values((low.data ?? []).reduce<Record<string, { dept: string; count: number }>>((acc, r) => {
                  const key = r.departmentCode;
                  acc[key] = acc[key] ?? { dept: key, count: 0 };
                  acc[key]!.count += 1;
                  return acc;
                }, {}))}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="dept" fontSize={10} />
                  <YAxis allowDecimals={false} fontSize={10} />
                  <Tooltip />
                  <Bar dataKey="count" fill="#e11d48" radius={[4, 4, 0, 0]} name="Students below threshold" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </Card>

      <Tabs active={tab} onChange={setTab} tabs={[{ key: 'defaulters', label: 'Defaulters' }, { key: 'offering', label: 'By course offering' }]} />

      {tab === 'defaulters' ? (
        <>
          <Card className="mb-4">
            <div className="grid gap-3 p-4 sm:grid-cols-2">
              <SearchInput value={search} onChange={setSearch} placeholder="Name or roll number…" />
              <SelectField placeholder="All departments" value={deptId} onChange={(e) => setDeptId(e.target.value)} options={(depts.data ?? []).map((d) => ({ value: d.department_id, label: d.name }))} />
            </div>
          </Card>
          <Card>
            {low.error ? <ErrorBox message={low.error} onRetry={low.reload} /> : (
              <DataTable columns={lowCols} rows={filtered} loading={low.loading} rowKey={(r) => r.studentId} empty="Every student is at or above the threshold" />
            )}
          </Card>
        </>
      ) : (
        <>
          <Card className="mb-4">
            <div className="p-4">
              <SelectField
                label="Course offering"
                placeholder="Select an offering"
                value={offeringId}
                onChange={(e) => setOfferingId(e.target.value)}
                options={(offerings.data ?? []).map((o) => ({ value: o.offering_id, label: `${o.subjectCode} · ${o.subjectName} · Sec ${o.sectionCode} · Sem ${o.semesterNo}` }))}
              />
            </div>
          </Card>
          <Card>
            {!offeringId ? (
              <div className="px-4 py-10 text-center text-sm text-slate-500">Pick a course offering to see its register.</div>
            ) : offeringReport.loading ? <Loading /> : offeringReport.error ? <ErrorBox message={offeringReport.error} onRetry={offeringReport.reload} /> : (
              <DataTable columns={offerCols} rows={offeringReport.data ?? []} rowKey={(r) => r.studentId} empty="No students enrolled" />
            )}
          </Card>
        </>
      )}

      <p className="mt-3 text-xs text-slate-400">
        Bands: Safe ≥ {threshold}%, Warning 65–{threshold}%, Critical &lt; 65%. The exam module uses the same
        threshold, read from <code className="rounded bg-slate-200 px-1">system_settings</code> rather than hard-coded.
      </p>
    </>
  );
}
