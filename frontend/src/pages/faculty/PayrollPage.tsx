import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { IndianRupee, Printer, Zap } from 'lucide-react';
import { api, errMsg } from '../../lib/api';
import { useToast } from '../../components/toast';
import { Card, PageHeader, StatCard, Tabs, SelectField, Field, SearchInput, DataTable, Pagination, ErrorBox, Modal, useFetch, useDebounced, type Column, EmptyState } from '../../components/ui';
import { downloadCsv } from '../../lib/csv';
import { money, monthYear, num, titleCase } from '../../lib/format';
interface Payslip {
  payroll_id: number; faculty_id: number; pay_month: number; pay_year: number;
  basic: string; hra: string; da: string; ta: string; special_allowance: string;
  gross_salary: string; pf_deduction: string; professional_tax: string; income_tax: string;
  lop_days: number; lop_amount: string; other_deduction: string; net_salary: string;
  working_days: number; status: string; employeeCode?: string; fullName?: string; departmentCode?: string;
}
interface SummaryRow {
  faculty_id: number; employee_code: string; full_name: string; department_code: string;
  designation: string; basic_salary: string; payslips_issued: number;
  ytd_gross: string; ytd_net: string; ytd_pf: string; ytd_lop: string;
}
interface MonthRow { year: number; month: number; rows_: number; totalNet: string; }

const STATUSES = ['DRAFT', 'GENERATED', 'APPROVED', 'PAID'];

export default function PayrollPage() {
  const toast = useToast();
  const [tab, setTab] = useState('payslips');
  const [month, setMonth] = useState('');
  const [year, setYear] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const term = useDebounced(search, 350);

  const params = useMemo(() => ({
    page, limit: 25,
    payMonth: month || undefined, payYear: year || undefined,
    status: statusFilter || undefined, search: term || undefined,
  }), [page, month, year, statusFilter, term]);

  const { data, loading, error, reload } = useFetch(() => api.page<Payslip>('/faculty/payroll', params), [params]);
  const months = useFetch(() => api.get<MonthRow[]>('/faculty/payroll/months'), []);
  const summary = useFetch(() => api.get<SummaryRow[]>('/faculty/payroll/summary'), []);
  const stats = useFetch(() => api.get<{ total: number; payslips: number }>('/faculty/stats'), []);

  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [run, setRun] = useState({ month: String(new Date().getMonth() || 12), year: String(new Date().getFullYear()) });
  const [result, setResult] = useState<string | null>(null);

  const generate = async () => {
    setBusy(true);
    setResult(null);
    try {
      const res = await api.post<{ generated?: number; totalNet?: string; message?: string }>('/faculty/payroll/generate', {
        month: Number(run.month), year: Number(run.year),
      });
      setResult(res.message ?? `Generated ${num(res.generated)} payslips totalling ${money(res.totalNet)}.`);
      toast.success('Payroll generated.');
      reload();
      months.reload();
      summary.reload();
    } catch (e) {
      setResult(errMsg(e));
      toast.error('Payroll run failed.');
    } finally { setBusy(false); }
  };

  const setStatus = async (id: number, status: string) => {
    try { await api.patch(`/faculty/payroll/${id}/status`, { status }); toast.success(`Payslip marked ${titleCase(status)}.`); reload(); }
    catch (e) { toast.error(errMsg(e)); }
  };

  const printSlip = (r: Payslip) => {
    const lines = [
      ['Employee', `${r.employeeCode ?? r.faculty_id} — ${r.fullName ?? ''}`],
      ['Pay period', monthYear(r.pay_month, r.pay_year)],
      ['Working days', String(r.working_days)],
      ['Basic', money(r.basic)],
      ['HRA', money(r.hra)],
      ['DA', money(r.da)],
      ['TA', money(r.ta)],
      ['Special allowance', money(r.special_allowance)],
      ['Gross salary', money(r.gross_salary)],
      ['PF deduction', money(r.pf_deduction)],
      ['Professional tax', money(r.professional_tax)],
      ['Income tax', money(r.income_tax)],
      ['Loss of pay', `${r.lop_days} day(s) — ${money(r.lop_amount)}`],
      ['Other deduction', money(r.other_deduction)],
      ['Net salary', money(r.net_salary)],
      ['Status', r.status],
    ];
    const w = window.open('', '_blank', 'width=760,height=900');
    if (!w) { toast.error('Allow pop-ups to print the payslip.'); return; }
    w.document.write(`<html><head><title>Payslip ${monthYear(r.pay_month, r.pay_year)}</title>
      <style>body{font-family:system-ui,sans-serif;padding:32px;color:#0f172a}
      h1{font-size:18px}table{width:100%;border-collapse:collapse;margin-top:16px}
      td{padding:6px 4px;border-bottom:1px solid #e2e8f0;font-size:13px}
      td:last-child{text-align:right;font-weight:600}</style></head><body>
      <h1>Vidya Pratishthan Institute of Technology — Payslip</h1>
      <p>${monthYear(r.pay_month, r.pay_year)}</p>
      <table>${lines.map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join('')}</table>
      </body></html>`);
    w.document.close();
    w.print();
  };

  const payslipCols: Column<Payslip>[] = [
    { key: 'period', header: 'Period', csv: (r) => monthYear(r.pay_month, r.pay_year), render: (r) => <span className="font-medium text-slate-800">{monthYear(r.pay_month, r.pay_year)}</span> },
    { key: 'employeeCode', header: 'Employee' },
    { key: 'fullName', header: 'Faculty' },
    { key: 'departmentCode', header: 'Dept' },
    { key: 'working_days', header: 'Days', align: 'right' },
    { key: 'gross_salary', header: 'Gross', align: 'right', render: (r) => money(r.gross_salary) },
    { key: 'pf_deduction', header: 'PF', align: 'right', render: (r) => money(r.pf_deduction) },
    { key: 'income_tax', header: 'Tax', align: 'right', render: (r) => money(r.income_tax) },
    { key: 'lop_days', header: 'LOP', align: 'right', render: (r) => (Number(r.lop_days) ? <span className="chip bg-rose-100 text-rose-700">{r.lop_days}d</span> : '0') },
    { key: 'net_salary', header: 'Net', align: 'right', render: (r) => <b>{money(r.net_salary)}</b> },
    { key: 'status', header: 'Status', render: (r) => <span className={`chip ${r.status === 'PAID' ? 'bg-emerald-100 text-emerald-700' : r.status === 'APPROVED' ? 'bg-brand-100 text-brand-700' : 'bg-slate-100 text-slate-600'}`}>{titleCase(r.status)}</span> },
    {
      key: 'actions', header: '', align: 'right',
      render: (r) => (
        <div className="flex justify-end gap-1.5">
          <button type="button" className="btn-secondary btn-xs" onClick={() => printSlip(r)}><Printer className="h-3.5 w-3.5" /> Slip</button>
          {r.status !== 'PAID' ? (
            <button type="button" className="btn-primary btn-xs" onClick={() => setStatus(r.payroll_id, r.status === 'DRAFT' ? 'GENERATED' : r.status === 'GENERATED' ? 'APPROVED' : 'PAID')}>
              Advance
            </button>
          ) : null}
        </div>
      ),
    },
  ];

  const summaryCols: Column<SummaryRow>[] = [
    { key: 'employee_code', header: 'Employee' },
    { key: 'full_name', header: 'Faculty' },
    { key: 'department_code', header: 'Dept' },
    { key: 'designation', header: 'Designation' },
    { key: 'basic_salary', header: 'Basic', align: 'right', render: (r) => money(r.basic_salary) },
    { key: 'payslips_issued', header: 'Payslips', align: 'right' },
    { key: 'ytd_gross', header: 'YTD gross', align: 'right', render: (r) => money(r.ytd_gross) },
    { key: 'ytd_net', header: 'YTD net', align: 'right', render: (r) => <b>{money(r.ytd_net)}</b> },
    { key: 'ytd_pf', header: 'YTD PF', align: 'right', render: (r) => money(r.ytd_pf) },
    { key: 'ytd_lop', header: 'YTD LOP', align: 'right', render: (r) => money(r.ytd_lop) },
  ];

  const totalNet = (months.data ?? []).reduce((s, m) => s + Number(m.totalNet ?? 0), 0);

  return (
    <>
      <PageHeader
        title="Payroll"
        subtitle="sp_generate_monthly_payroll builds one payslip per active faculty member, applying PF, professional tax, income tax and loss-of-pay deductions."
        icon={<IndianRupee className="h-5 w-5" />}
        actions={
          <>
            <button type="button" className="btn-secondary btn-sm" disabled={!(summary.data ?? []).length} onClick={() => downloadCsv('payroll-summary.csv', summary.data as unknown as Record<string, unknown>[])}>Export summary</button>
            <button type="button" className="btn-primary btn-sm" onClick={() => setOpen(true)}><Zap className="h-4 w-4" /> Run monthly payroll</button>
          </>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Faculty on roll" value={num(stats.data?.total)} icon={<IndianRupee className="h-5 w-5" />} />
        <StatCard label="Payslips issued" value={num(stats.data?.payslips)} tone="slate" />
        <StatCard label="Payroll months" value={num(months.data?.length)} tone="sky" />
        <StatCard label="Total disbursed" value={money(totalNet)} tone="emerald" />
      </div>

      <Tabs active={tab} onChange={setTab} tabs={[{ key: 'payslips', label: 'Payslips' }, { key: 'months', label: 'Monthly totals' }, { key: 'summary', label: 'Year-to-date' }]} />

      {tab === 'payslips' ? (
        <>
          <Card className="mb-4">
            <div className="grid gap-3 p-4 sm:grid-cols-4">
              <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Name or employee code…" />
              <SelectField placeholder="All months" value={month} onChange={(e) => { setMonth(e.target.value); setPage(1); }} options={Array.from({ length: 12 }, (_, i) => ({ value: i + 1, label: ['January','February','March','April','May','June','July','August','September','October','November','December'][i]! }))} />
              <SelectField placeholder="All years" value={year} onChange={(e) => { setYear(e.target.value); setPage(1); }} options={Array.from(new Set((months.data ?? []).map((m) => m.year))).sort((a, b) => b - a).map((y) => ({ value: y, label: String(y) }))} />
              <SelectField placeholder="All statuses" value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }} options={STATUSES.map((s) => ({ value: s, label: titleCase(s) }))} />
            </div>
          </Card>
          <Card>
            {error ? <ErrorBox message={error} onRetry={reload} /> : (
              <>
                <DataTable columns={payslipCols} rows={data?.rows ?? []} loading={loading} rowKey={(r) => r.payroll_id} empty="No payslips for this period" />
                <Pagination page={data?.meta.page ?? 1} totalPages={data?.meta.totalPages ?? 1} total={data?.meta.total ?? 0} onPage={setPage} />
              </>
            )}
          </Card>
        </>
      ) : null}

      {tab === 'months' ? (
        <>
          <Card className="card-pad mb-4">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Net disbursed per month</h2>
            {(months.data ?? []).length ? (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={(months.data ?? []).slice().reverse().map((m) => ({ ...m, label: monthYear(m.month, m.year) }))} margin={{ top: 5, right: 8, bottom: 0, left: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="label" fontSize={10} />
                    <YAxis fontSize={10} tickFormatter={(v) => `₹${Math.round(Number(v) / 100000)}L`} />
                    <Tooltip formatter={(v) => money(v)} />
                    <Bar dataKey="totalNet" fill="#4f46e5" radius={[4, 4, 0, 0]} name="Net disbursed" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : <EmptyState title="No payroll runs yet" />}
          </Card>
          <Card>
            <DataTable
              rowKey={(r) => `${r.year}-${r.month}`}
              rows={months.data ?? []}
              loading={months.loading}
              empty="No payroll runs"
              columns={[
                { key: 'label', header: 'Month', render: (r) => monthYear(r.month, r.year) },
                { key: 'rows_', header: 'Payslips', align: 'right' },
                { key: 'totalNet', header: 'Net disbursed', align: 'right', render: (r) => <b>{money(r.totalNet)}</b> },
              ]}
            />
          </Card>
        </>
      ) : null}

      {tab === 'summary' ? (
        <Card>
          {summary.error ? <ErrorBox message={summary.error} onRetry={summary.reload} /> : (
            <DataTable columns={summaryCols} rows={summary.data ?? []} loading={summary.loading} rowKey={(r) => r.faculty_id} empty="No payroll data" />
          )}
        </Card>
      ) : null}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Run monthly payroll"
        size="sm"
        footer={
          <>
            <button type="button" className="btn-secondary btn-sm" onClick={() => setOpen(false)}>Close</button>
            <button type="button" className="btn-primary btn-sm" onClick={generate} disabled={busy}>{busy ? 'Running…' : 'Generate payslips'}</button>
          </>
        }
      >
        <div className="grid grid-cols-2 gap-3">
          <SelectField label="Month" value={run.month} onChange={(e) => setRun({ ...run, month: e.target.value })} options={Array.from({ length: 12 }, (_, i) => ({ value: i + 1, label: ['January','February','March','April','May','June','July','August','September','October','November','December'][i]! }))} />
          <Field label="Year" type="number" value={run.year} onChange={(e) => setRun({ ...run, year: e.target.value })} />
        </div>
        <p className="text-xs text-slate-500">
          Runs <code className="rounded bg-slate-100 px-1">sp_generate_monthly_payroll</code> for every active faculty
          member. Re-running an existing, already-paid month is refused by the procedure, so duplicates are impossible.
        </p>
        {result ? (
          <div className={`mt-3 rounded-lg border px-3 py-2 text-sm ${result.toLowerCase().includes('cannot') || result.toLowerCase().includes('refus') ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}>
            {result}
          </div>
        ) : null}
      </Modal>
    </>
  );
}
