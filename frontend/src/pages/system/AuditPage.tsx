import { useMemo, useState } from 'react';
import { ScrollText, Download } from 'lucide-react';
import { api } from '../../lib/api';
import { Card, PageHeader, StatCard, SearchInput, SelectField, Field, DataTable, Pagination, ErrorBox, useFetch, useDebounced, type Column, Badge } from '../../components/ui';
import { downloadCsv } from '../../lib/csv';
import { dateTimeStr, num, titleCase } from '../../lib/format';
interface AuditRow {
  id: number; action: string; entity: string; entityId: number | null;
  description: string; oldValue: string | null; newValue: string | null;
  ipAddress: string | null; createdAt: string; actor: string | null;
}
interface AuditStats { total: string; today: string; logins: string; failedLogins: string; feeChanges: string; marksUpdates: string; hostelActions: string; payrollRuns: string; }

export default function AuditPage() {
  const [action, setAction] = useState('');
  const [entity, setEntity] = useState('');
  const [search, setSearch] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const term = useDebounced(search, 350);

  const params = useMemo(() => ({
    page, limit: 25,
    action: action || undefined, entity: entity || undefined,
    search: term || undefined, from: from || undefined, to: to || undefined,
  }), [page, action, entity, term, from, to]);

  const { data, loading, error, reload } = useFetch(() => api.page<AuditRow>('/audit', params), [params]);
  const stats = useFetch(() => api.get<AuditStats>('/audit/stats'), []);
  const actions = useFetch(() => api.get<string[]>('/audit/actions'), []);
  const entities = useFetch(() => api.get<string[]>('/audit/entities'), []);

  const columns: Column<AuditRow>[] = [
    { key: 'createdAt', header: 'When', render: (r) => <span className="whitespace-nowrap text-xs">{dateTimeStr(r.createdAt)}</span> },
    { key: 'actor', header: 'Actor', render: (r) => r.actor ?? <span className="text-slate-400">system</span> },
    { key: 'action', header: 'Action', render: (r) => <Badge className={actionTone(r.action)}>{r.action}</Badge> },
    { key: 'entity', header: 'Entity', render: (r) => <span className="text-xs">{r.entity}{r.entityId ? ` #${r.entityId}` : ''}</span> },
    { key: 'description', header: 'Description', render: (r) => <span className="max-w-md truncate text-sm">{r.description}</span> },
    {
      key: 'changes', header: 'Change',
      render: (r) => (r.oldValue || r.newValue
        ? <span className="max-w-xs truncate text-xs text-slate-500" title={`${r.oldValue ?? ''} → ${r.newValue ?? ''}`}>
            {r.oldValue ? String(r.oldValue).slice(0, 40) : '—'} → {r.newValue ? String(r.newValue).slice(0, 40) : '—'}
          </span>
        : <span className="text-slate-400">—</span>),
    },
    { key: 'ipAddress', header: 'IP', render: (r) => <span className="text-xs text-slate-500">{r.ipAddress ?? '—'}</span> },
  ];

  return (
    <>
      <PageHeader
        title="Audit log"
        subtitle="Every significant write is logged by the application and by database triggers on fee structures, marks and hostel actions."
        icon={<ScrollText className="h-5 w-5" />}
        actions={
          <button type="button" className="btn-secondary btn-sm" disabled={!data?.rows.length} onClick={() => downloadCsv('audit-log.csv', data!.rows as unknown as Record<string, unknown>[])}>
            <Download className="h-4 w-4" /> Export page
          </button>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4 xl:grid-cols-8">
        <StatCard label="Total entries" value={num(stats.data?.total)} icon={<ScrollText className="h-5 w-5" />} />
        <StatCard label="Today" value={num(stats.data?.today)} tone="brand" />
        <StatCard label="Logins" value={num(stats.data?.logins)} tone="sky" />
        <StatCard label="Failed logins" value={num(stats.data?.failedLogins)} tone={Number(stats.data?.failedLogins) ? 'rose' : 'slate'} />
        <StatCard label="Fee changes" value={num(stats.data?.feeChanges)} tone="amber" />
        <StatCard label="Marks updates" value={num(stats.data?.marksUpdates)} tone="emerald" />
        <StatCard label="Hostel actions" value={num(stats.data?.hostelActions)} tone="slate" />
        <StatCard label="Payroll runs" value={num(stats.data?.payrollRuns)} tone="sky" />
      </div>

      <Card className="mb-4">
        <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-5">
          <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Search descriptions…" />
          <SelectField placeholder="All actions" value={action} onChange={(e) => { setAction(e.target.value); setPage(1); }} options={(actions.data ?? []).map((a) => ({ value: a, label: titleCase(a) }))} />
          <SelectField placeholder="All entities" value={entity} onChange={(e) => { setEntity(e.target.value); setPage(1); }} options={(entities.data ?? []).map((e2) => ({ value: e2, label: titleCase(e2) }))} />
          <Field label="From" type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} />
          <Field label="To" type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} />
        </div>
      </Card>

      <Card>
        {error ? <ErrorBox message={error} onRetry={reload} /> : (
          <>
            <DataTable columns={columns} rows={data?.rows ?? []} loading={loading} rowKey={(r) => r.id} empty="No audit entries match these filters" />
            <Pagination page={data?.meta.page ?? 1} totalPages={data?.meta.totalPages ?? 1} total={data?.meta.total ?? 0} onPage={setPage} />
          </>
        )}
      </Card>
    </>
  );
}

function actionTone(action: string): string {
  const a = action.toUpperCase();
  if (a.includes('DELETE')) return 'bg-rose-100 text-rose-700';
  if (a.includes('CREATE') || a.includes('INSERT')) return 'bg-emerald-100 text-emerald-700';
  if (a.includes('UPDATE') || a.includes('CHANGE')) return 'bg-amber-100 text-amber-700';
  if (a.includes('LOGIN')) return 'bg-sky-100 text-sky-700';
  return 'bg-slate-100 text-slate-600';
}
