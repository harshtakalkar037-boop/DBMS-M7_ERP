import { useMemo, useState } from 'react';
import { CalendarRange, Download } from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { Card, PageHeader, StatCard, SearchInput, DataTable, ProgressBar, ErrorBox, useFetch, useDebounced, type Column } from '../../components/ui';
import { downloadCsv } from '../../lib/csv';
import { num, titleCase } from '../../lib/format';
interface SummaryRow {
  faculty_id: number; employee_code: string; full_name: string; email: string;
  department_code: string; designation: string; basic_salary: string; status: string;
  payslips_issued: number; ytd_gross: string; ytd_net: string; ytd_pf: string; ytd_lop: string;
  casual_leave_balance: string | null; sick_leave_balance: string | null;
  earned_leave_balance: string | null; last_pay_year: number; last_pay_month: number;
}
interface Balance { balance_id: number; faculty_id: number; leave_type: string; allotted: number; used: number; remaining: string; }

export default function LeaveBalancesPage() {
  const { user, has } = useAuth();
  const [search, setSearch] = useState('');
  const term = useDebounced(search, 350);

  const summary = useFetch(() => api.get<SummaryRow[]>('/faculty/payroll/summary'), []);
  const mine = useFetch<Balance[]>(
    () => (user?.role === 'FACULTY' ? api.get<Balance[]>('/faculty/me/leave-balances') : Promise.resolve([])),
    [user?.role],
  );

  const rows = useMemo(() => (summary.data ?? []).filter((r) => {
    const q = term.toLowerCase();
    return !q || r.full_name.toLowerCase().includes(q) || r.employee_code.toLowerCase().includes(q) || r.department_code.toLowerCase().includes(q);
  }), [summary.data, term]);

  const columns: Column<SummaryRow>[] = [
    { key: 'employee_code', header: 'Employee' },
    { key: 'full_name', header: 'Faculty' },
    { key: 'department_code', header: 'Dept', render: (r) => <span className="chip bg-slate-100 text-slate-600">{r.department_code}</span> },
    { key: 'designation', header: 'Designation' },
    {
      key: 'casual_leave_balance', header: 'Casual', align: 'right',
      render: (r) => (r.casual_leave_balance === null ? '—' : <span className="font-medium">{num(r.casual_leave_balance, 1)}</span>),
    },
    {
      key: 'sick_leave_balance', header: 'Sick', align: 'right',
      render: (r) => (r.sick_leave_balance === null ? '—' : <span className="font-medium">{num(r.sick_leave_balance, 1)}</span>),
    },
    {
      key: 'earned_leave_balance', header: 'Earned', align: 'right',
      render: (r) => (r.earned_leave_balance === null ? '—' : <span className="font-medium">{num(r.earned_leave_balance, 1)}</span>),
    },
    { key: 'status', header: 'Status', render: (r) => <span className="chip bg-emerald-100 text-emerald-700">{titleCase(r.status)}</span> },
  ];

  return (
    <>
      <PageHeader
        title="Leave balances"
        subtitle="Balances come from fn_calculate_faculty_leave_balance — allotted, minus taken, minus pending."
        icon={<CalendarRange className="h-5 w-5" />}
        actions={
          <button type="button" className="btn-secondary btn-sm" disabled={!rows.length} onClick={() => downloadCsv('leave-balances.csv', rows as unknown as Record<string, unknown>[])}>
            <Download className="h-4 w-4" /> Export
          </button>
        }
      />

      {has('FACULTY') ? (
        <Card className="card-pad mb-4">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Your balances this academic year</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            {(mine.data ?? []).map((b) => (
              <div key={b.leave_type}>
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="font-medium text-slate-700">{titleCase(b.leave_type)}</span>
                  <span className="text-slate-500">{num(b.remaining, 1)} left · {num(b.used)} used</span>
                </div>
                <ProgressBar value={(Number(b.remaining) / Math.max(1, Number(b.allotted))) * 100} />
                <p className="mt-1 text-[11px] text-slate-400">Allotted {num(b.allotted)} days</p>
              </div>
            ))}
            {!mine.data?.length ? <p className="text-sm text-slate-500">No balances configured for this year.</p> : null}
          </div>
        </Card>
      ) : null}

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Faculty tracked" value={num(rows.length)} icon={<CalendarRange className="h-5 w-5" />} />
        <StatCard label="Avg casual leave left" value={num(avg(rows.map((r) => r.casual_leave_balance)), 1)} tone="emerald" />
        <StatCard label="Avg sick leave left" value={num(avg(rows.map((r) => r.sick_leave_balance)), 1)} tone="sky" />
        <StatCard label="Avg earned leave left" value={num(avg(rows.map((r) => r.earned_leave_balance)), 1)} tone="amber" />
      </div>

      <Card className="mb-4"><div className="p-4"><SearchInput value={search} onChange={setSearch} placeholder="Name, employee code or department…" /></div></Card>

      <Card>
        {summary.error ? <ErrorBox message={summary.error} onRetry={summary.reload} /> : (
          <DataTable columns={columns} rows={rows} loading={summary.loading} rowKey={(r) => r.faculty_id} empty="No faculty records" />
        )}
      </Card>
    </>
  );
}

function avg(values: (string | null)[]): number {
  const nums = values.filter((v) => v !== null && v !== undefined).map((v) => Number(v));
  if (!nums.length) return 0;
  return nums.reduce((s, n) => s + n, 0) / nums.length;
}
