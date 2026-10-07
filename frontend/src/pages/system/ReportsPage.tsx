import { useEffect, useMemo, useState } from 'react';
import { PieChart as PieIcon, Download, FileSpreadsheet, AlertTriangle } from 'lucide-react';
import { api, errMsg } from '../../lib/api';
import { useToast } from '../../components/toast';
import { Card, PageHeader, SearchInput, SelectField, Field, DataTable, Pagination, Loading, ErrorBox, useFetch, useDebounced, EmptyState } from '../../components/ui';
import { downloadCsv } from '../../lib/csv';
import { money, num } from '../../lib/format';
interface ReportMeta { key: string; title: string; }
interface ReportResult {
  key: string; title: string;
  columns: { key: string; label: string }[];
  rows: Record<string, unknown>[];
  generatedAt: string;
}
interface Kpis { students: number; faculty: number; avgAttendance: string; collected: string; outstanding: string; residents: number; }

export default function ReportsPage() {
  const toast = useToast();
  const [key, setKey] = useState('attendance_summary');
  const [search, setSearch] = useState('');
  const [semesterId, setSemesterId] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const term = useDebounced(search, 350);

  const catalogue = useFetch(() => api.get<ReportMeta[]>('/reports'), []);
  const kpis = useFetch(() => api.get<Kpis>('/reports/kpis'), []);
  const semesters = useFetch(() => api.get<{ semester_id: number; name: string }[]>('/academics/semesters', { limit: 200 }), []);
  const depts = useFetch(() => api.get<{ department_id: number; department_code: string; name: string }[]>('/academics/departments', { limit: 100 }), []);

  // /reports/:key answers with the whole result set ({key,title,columns,rows,generatedAt}),
  // so paging happens here in the browser rather than in SQL.
  const PAGE_SIZE = 25;
  const params = useMemo(() => ({
    semesterId: semesterId || undefined,
    departmentId: departmentId || undefined,
    from: from || undefined,
    to: to || undefined,
  }), [semesterId, departmentId, from, to]);

  const { data, loading, error, reload } = useFetch(() => api.get<ReportResult>(`/reports/${key}`, params), [key, params]);

  const rows = useMemo(() => (data?.rows ?? []).filter((r) => {
    const q = term.toLowerCase();
    return !q || Object.values(r).some((v) => String(v ?? '').toLowerCase().includes(q));
  }), [data?.rows, term]);

  const paged = useMemo(() => rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), [rows, page]);

  const exportCsv = async (useApi: boolean) => {
    try {
      if (useApi) {
        await api.download(`/reports/${key}/csv`, `${key}-${new Date().toISOString().slice(0, 10)}.csv`, params);
      } else {
        const cols = data?.rows?.length ? Object.keys(data.rows[0]!) : [];
        downloadCsv(`${key}.csv`, rows, cols.map((c) => ({ key: c, label: c })));
      }
      toast.success('CSV downloaded.');
    } catch (e) { toast.error(errMsg(e)); }
  };

  // A new report (or filter) restarts paging.
  useEffect(() => { setPage(1); }, [key, params]);

  const columns = (data?.columns?.length
    ? data.columns
    : (data?.rows?.[0] ? Object.keys(data.rows[0]).map((k) => ({ key: k, label: k })) : [])
  ).map((c) => ({
    key: c.key,
    header: (c.label ?? c.key).replace(/_/g, ' ').replace(/\b\w/g, (x) => x.toUpperCase()),
    render: (r: Record<string, unknown>) => {
      const v = r[c.key];
      if (typeof v === 'number') return num(v, Number.isInteger(v) ? 0 : 2);
      if (typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v) && /amount|fee|salary|due|paid|total|collected|outstanding/i.test(c.key)) return money(v);
      return String(v ?? '—');
    },
  }));

  const selected = (catalogue.data ?? []).find((r) => r.key === key);

  return (
    <>
      <PageHeader
        title="Reports & exports"
        subtitle={`${num(catalogue.data?.length)} reports, each a stored SQL query with joins, grouping and (where relevant) window functions.`}
        icon={<PieIcon className="h-5 w-5" />}
        actions={
          <>
            <button type="button" className="btn-secondary btn-sm" onClick={() => void exportCsv(false)} disabled={!rows.length}>
              <Download className="h-4 w-4" /> CSV (this page)
            </button>
            <button type="button" className="btn-primary btn-sm" onClick={() => void exportCsv(true)} disabled={!rows.length}>
              <FileSpreadsheet className="h-4 w-4" /> CSV (full report)
            </button>
          </>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-6">
        <Stat label="Students" value={num(kpis.data?.students)} />
        <Stat label="Faculty" value={num(kpis.data?.faculty)} />
        <Stat label="Avg attendance" value={`${num(kpis.data?.avgAttendance, 1)}%`} />
        <Stat label="Collected" value={money(kpis.data?.collected)} />
        <Stat label="Outstanding" value={money(kpis.data?.outstanding)} />
        <Stat label="Hostel residents" value={num(kpis.data?.residents)} />
      </div>

      <div className="grid gap-4 lg:grid-cols-4">
        <Card className="lg:col-span-1">
          <div className="border-b border-slate-200 px-4 py-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Report catalogue</h2>
          </div>
          <div className="max-h-[32rem] overflow-y-auto">
            {catalogue.loading ? <Loading /> : (catalogue.data ?? []).map((r) => (
              <button
                key={r.key}
                type="button"
                onClick={() => { setKey(r.key); setPage(1); }}
                className={`block w-full px-4 py-2.5 text-left text-sm transition ${
                  key === r.key ? 'bg-brand-50 font-medium text-brand-800' : 'text-slate-700 hover:bg-slate-50'
                }`}
              >
                {r.title}
              </button>
            ))}
          </div>
        </Card>

        <div className="lg:col-span-3">
          <Card className="mb-4">
            <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
              <SelectField label="Semester" placeholder="All semesters" value={semesterId} onChange={(e) => { setSemesterId(e.target.value); setPage(1); }} options={(semesters.data ?? []).map((s) => ({ value: s.semester_id, label: s.name }))} />
              <SelectField label="Department" placeholder="All departments" value={departmentId} onChange={(e) => { setDepartmentId(e.target.value); setPage(1); }} options={(depts.data ?? []).map((d) => ({ value: d.department_id, label: d.name }))} />
              <div className="grid grid-cols-2 gap-2">
                <Field label="From" type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} />
                <Field label="To" type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} />
              </div>
            </div>
          </Card>

          <Card>
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
              <div>
                <h2 className="text-sm font-semibold text-slate-800">{selected?.title ?? key}</h2>
                <p className="text-[11px] text-slate-500">
                  {`${num(rows.length)} rows`}
                  {data?.generatedAt ? ` · generated ${String(data.generatedAt).slice(0, 19).replace('T', ' ')}` : ''}
                </p>
              </div>
              <SearchInput value={search} onChange={setSearch} placeholder="Filter rows…" className="w-56" />
            </div>

            {error ? <ErrorBox message={error} onRetry={reload} /> : loading ? <Loading label="Running the report…" /> : !rows.length ? (
              <EmptyState title="This report returned no rows" hint="Try widening the filters — some reports need a semester or a date range." />
            ) : (
              <>
                <DataTable columns={columns} rows={paged} rowKey={(_r, i) => i} />
                <Pagination page={page} totalPages={Math.max(1, Math.ceil(rows.length / PAGE_SIZE))} total={rows.length} onPage={setPage} />
              </>
            )}
          </Card>
        </div>
      </div>

      <p className="mt-3 flex items-start gap-1.5 text-xs text-slate-400">
        <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
        <span>
          Reports are read-only SELECTs over the live tables. Date filters apply to reports that expose an event date
          (payments, attendance, admissions); others ignore them.
        </span>
      </p>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card px-3 py-2.5">
      <p className="truncate text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="truncate text-sm font-semibold text-slate-900">{value}</p>
    </div>
  );
}
