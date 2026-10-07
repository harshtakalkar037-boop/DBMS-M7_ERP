import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ShieldAlert, RefreshCw, Download } from 'lucide-react';
import { api, errMsg } from '../../lib/api';
import { useToast } from '../../components/toast';
import { Card, PageHeader, StatCard, Tabs, SearchInput, SelectField, DataTable, ProgressBar, ErrorBox, useFetch, useDebounced, type Column } from '../../components/ui';
import { downloadCsv } from '../../lib/csv';
import { money, num, pct, titleCase } from '../../lib/format';
interface RiskRow {
  student_id: number; roll_number: string; full_name: string; department_code: string;
  program_code: string; current_semester_no: number; attendance_percentage: string;
  cgpa: string; backlog_count: number; pending_fees: string; risk_score: number; risk_level: string;
}

const LEVEL_TONE: Record<string, string> = {
  CRITICAL: 'bg-rose-100 text-rose-700',
  HIGH: 'bg-orange-100 text-orange-700',
  MEDIUM: 'bg-amber-100 text-amber-700',
  LOW: 'bg-emerald-100 text-emerald-700',
};

export default function AtRiskPage() {
  const toast = useToast();
  const [tab, setTab] = useState('ALL');
  const [search, setSearch] = useState('');
  const [deptId, setDeptId] = useState('');
  const term = useDebounced(search, 350);

  const { data, loading, error, reload } = useFetch(() => api.get<RiskRow[]>('/ai/at-risk', { limit: 500 }), []);
  const depts = useFetch(() => api.get<{ department_id: number; department_code: string; name: string }[]>('/academics/departments', { limit: 100 }), []);

  const rows = useMemo(() => (data ?? []).filter((r) => {
    if (tab !== 'ALL' && r.risk_level !== tab) return false;
    const q = term.toLowerCase();
    if (q && !r.full_name.toLowerCase().includes(q) && !r.roll_number.toLowerCase().includes(q)) return false;
    if (deptId) {
      const dept = (depts.data ?? []).find((d) => String(d.department_id) === deptId);
      if (dept?.department_code && dept.department_code !== r.department_code) return false;
    }
    return true;
  }), [data, tab, term, deptId, depts.data]);

  const recompute = async () => {
    try {
      const res = await api.post<{ rows?: number; message?: string }>('/ai/risk/recompute');
      toast.success(res.message ?? `Risk scores recomputed for ${num(res.rows)} students.`);
      reload();
    } catch (e) { toast.error(errMsg(e)); }
  };

  const buckets = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].map((level) => ({
    name: titleCase(level),
    value: (data ?? []).filter((r) => r.risk_level === level).length,
    color: { CRITICAL: '#e11d48', HIGH: '#f97316', MEDIUM: '#f59e0b', LOW: '#059669' }[level],
  }));

  const columns: Column<RiskRow>[] = [
    { key: 'roll_number', header: 'Roll no.', render: (r) => <Link to={`/students/${r.student_id}`} className="font-medium text-brand-700 hover:underline">{r.roll_number}</Link> },
    { key: 'full_name', header: 'Student' },
    { key: 'department_code', header: 'Dept', render: (r) => <span className="chip bg-slate-100 text-slate-600">{r.department_code}</span> },
    { key: 'current_semester_no', header: 'Sem', align: 'right' },
    {
      key: 'attendance_percentage', header: 'Attendance',
      render: (r) => (
        <div className="flex w-36 items-center gap-2">
          <ProgressBar value={Number(r.attendance_percentage)} />
          <span className="w-12 shrink-0 text-right text-xs">{pct(r.attendance_percentage, 0)}</span>
        </div>
      ),
    },
    { key: 'cgpa', header: 'CGPA', align: 'right', render: (r) => num(r.cgpa, 2) },
    { key: 'backlog_count', header: 'Backlogs', align: 'right', render: (r) => (Number(r.backlog_count) ? <span className="chip bg-rose-100 text-rose-700">{r.backlog_count}</span> : '0') },
    { key: 'pending_fees', header: 'Dues', align: 'right', render: (r) => (Number(r.pending_fees) ? money(r.pending_fees) : '—') },
    {
      key: 'risk_score', header: 'Risk score',
      render: (r) => (
        <div className="flex w-32 items-center gap-2">
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-200">
            <div
              className={`h-full rounded-full ${Number(r.risk_score) >= 70 ? 'bg-rose-500' : Number(r.risk_score) >= 40 ? 'bg-amber-500' : 'bg-emerald-500'}`}
              style={{ width: `${Math.min(100, Number(r.risk_score))}%` }}
            />
          </div>
          <span className="w-8 shrink-0 text-right text-xs font-semibold">{num(r.risk_score)}</span>
        </div>
      ),
    },
    { key: 'risk_level', header: 'Level', render: (r) => <span className={`chip ${LEVEL_TONE[r.risk_level] ?? 'bg-slate-100 text-slate-600'}`}>{titleCase(r.risk_level)}</span> },
  ];

  return (
    <>
      <PageHeader
        title="At-risk students"
        subtitle="Scores are computed by sp_compute_student_risk from attendance (35%), academics (35%), backlogs (15%) and dues (15%)."
        icon={<ShieldAlert className="h-5 w-5" />}
        actions={
          <>
            <button type="button" className="btn-secondary btn-sm" disabled={!rows.length} onClick={() => downloadCsv('at-risk.csv', rows as unknown as Record<string, unknown>[])}>
              <Download className="h-4 w-4" /> Export
            </button>
            <button type="button" className="btn-primary btn-sm" onClick={recompute} disabled={loading}>
              <RefreshCw className="h-4 w-4" /> Recompute scores
            </button>
          </>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard label="Students scored" value={num(data?.length)} icon={<ShieldAlert className="h-5 w-5" />} />
        <StatCard label="Critical" value={num((data ?? []).filter((r) => r.risk_level === 'CRITICAL').length)} tone="rose" />
        <StatCard label="High" value={num((data ?? []).filter((r) => r.risk_level === 'HIGH').length)} tone="amber" />
        <StatCard label="Medium" value={num((data ?? []).filter((r) => r.risk_level === 'MEDIUM').length)} tone="sky" />
        <StatCard label="Low" value={num((data ?? []).filter((r) => r.risk_level === 'LOW').length)} tone="emerald" />
      </div>

      <div className="mb-4 grid gap-4 lg:grid-cols-3">
        <Card className="card-pad lg:col-span-2">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Risk score distribution</h2>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={(data ?? []).slice(0, 40)} margin={{ top: 5, right: 8, bottom: 0, left: -22 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="roll_number" fontSize={9} interval={3} />
                <YAxis domain={[0, 100]} fontSize={10} />
                <Tooltip />
                <Bar dataKey="risk_score" name="Risk score">
                  {(data ?? []).slice(0, 40).map((r) => (
                    <Cell key={r.student_id} fill={Number(r.risk_score) >= 70 ? '#e11d48' : Number(r.risk_score) >= 40 ? '#f59e0b' : '#059669'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card className="card-pad">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Risk buckets</h2>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={buckets} dataKey="value" nameKey="name" outerRadius={70}>
                  {buckets.map((b) => <Cell key={b.name} fill={b.color} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 space-y-1 text-xs">
            {buckets.map((b) => (
              <div key={b.name} className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-slate-600">
                  <span className="h-2 w-2 rounded-full" style={{ background: b.color }} /> {b.name}
                </span>
                <b>{num(b.value)}</b>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Tabs
        active={tab}
        onChange={setTab}
        tabs={[
          { key: 'ALL', label: 'All' },
          { key: 'CRITICAL', label: 'Critical' },
          { key: 'HIGH', label: 'High' },
          { key: 'MEDIUM', label: 'Medium' },
          { key: 'LOW', label: 'Low' },
        ]}
      />

      <Card className="mb-4">
        <div className="grid gap-3 p-4 sm:grid-cols-2">
          <SearchInput value={search} onChange={setSearch} placeholder="Name or roll number…" />
          <SelectField placeholder="All departments" value={deptId} onChange={(e) => setDeptId(e.target.value)} options={(depts.data ?? []).map((d) => ({ value: d.department_id, label: d.name }))} />
        </div>
      </Card>

      <Card>
        {error ? <ErrorBox message={error} onRetry={reload} /> : (
          <DataTable columns={columns} rows={rows} loading={loading} rowKey={(r) => r.student_id} empty="No students in this risk band" />
        )}
      </Card>
    </>
  );
}
