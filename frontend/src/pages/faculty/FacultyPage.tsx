import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Users, Download } from 'lucide-react';
import { api } from '../../lib/api';
import { Card, PageHeader, StatCard, SearchInput, SelectField, DataTable, Pagination, StatusBadge, ErrorBox, useFetch, useDebounced, type Column } from '../../components/ui';
import { downloadCsv } from '../../lib/csv';
import { dateStr, money, num, titleCase } from '../../lib/format';
interface FacultyRow {
  faculty_id: number; employee_code: string; first_name: string; last_name: string;
  email: string; phone: string; departmentCode: string; departmentName: string;
  designation: string; employment_type: string; experience_years: number;
  basic_salary: string; joining_date: string; status: string; latestNetSalary?: string;
}
interface Stats { total: number; active: string; onLeave: string; pendingLeaves: number; payslips: number; }

export default function FacultyPage() {
  const [search, setSearch] = useState('');
  const [deptId, setDeptId] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const term = useDebounced(search, 350);

  const params = useMemo(() => ({ page, limit: 25, search: term || undefined, departmentId: deptId || undefined, status: status || undefined }), [page, term, deptId, status]);
  const { data, loading, error, reload } = useFetch(() => api.page<FacultyRow>('/faculty', params), [params]);
  const stats = useFetch(() => api.get<Stats>('/faculty/stats'), []);
  const depts = useFetch(() => api.get<{ department_id: number; department_code: string; name: string }[]>('/academics/departments', { limit: 100 }), []);

  const columns: Column<FacultyRow>[] = [
    {
      key: 'employee_code', header: 'Employee',
      render: (r) => (
        <div>
          <Link to={`/faculty/${r.faculty_id}`} className="font-medium text-brand-700 hover:underline">{r.employee_code}</Link>
          <p className="text-[11px] text-slate-500">{r.email}</p>
        </div>
      ),
    },
    { key: 'name', header: 'Name', csv: (r) => `${r.first_name} ${r.last_name}`, render: (r) => <span className="font-medium text-slate-800">{r.first_name} {r.last_name}</span> },
    { key: 'designation', header: 'Designation' },
    { key: 'departmentCode', header: 'Dept', render: (r) => <span className="chip bg-slate-100 text-slate-600">{r.departmentCode}</span> },
    { key: 'employment_type', header: 'Employment', render: (r) => titleCase(r.employment_type) },
    { key: 'experience_years', header: 'Exp (yrs)', align: 'right' },
    { key: 'basic_salary', header: 'Basic', align: 'right', render: (r) => money(r.basic_salary) },
    { key: 'latestNetSalary', header: 'Latest net', align: 'right', render: (r) => (r.latestNetSalary ? money(r.latestNetSalary) : <span className="text-slate-400">—</span>) },
    { key: 'joining_date', header: 'Joined', render: (r) => dateStr(r.joining_date) },
    { key: 'status', header: 'Status', render: (r) => <StatusBadge value={r.status} /> },
  ];

  const rows = data?.rows ?? [];

  return (
    <>
      <PageHeader
        title="Faculty"
        subtitle="One shared faculty master used by academics, attendance, leave and payroll."
        icon={<Users className="h-5 w-5" />}
        actions={
          <button type="button" className="btn-secondary btn-sm" disabled={!rows.length} onClick={() => downloadCsv('faculty.csv', rows as unknown as Record<string, unknown>[], columns.map((c) => ({ key: c.key, label: c.header })))}>
            <Download className="h-4 w-4" /> Export CSV
          </button>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard label="Faculty" value={num(stats.data?.total)} icon={<Users className="h-5 w-5" />} />
        <StatCard label="Active" value={num(stats.data?.active)} tone="emerald" />
        <StatCard label="On leave" value={num(stats.data?.onLeave)} tone="sky" />
        <StatCard label="Pending leave requests" value={num(stats.data?.pendingLeaves)} tone="amber" />
        <StatCard label="Payslips issued" value={num(stats.data?.payslips)} tone="slate" />
      </div>

      <Card className="mb-4">
        <div className="grid gap-3 p-4 sm:grid-cols-3">
          <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Name, employee code or email…" />
          <SelectField placeholder="All departments" value={deptId} onChange={(e) => { setDeptId(e.target.value); setPage(1); }} options={(depts.data ?? []).map((d) => ({ value: d.department_id, label: d.name }))} />
          <SelectField placeholder="All statuses" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} options={['ACTIVE', 'ON_LEAVE', 'RESIGNED', 'RETIRED', 'INACTIVE'].map((s) => ({ value: s, label: titleCase(s) }))} />
        </div>
      </Card>

      <Card>
        {error ? <ErrorBox message={error} onRetry={reload} /> : (
          <>
            <DataTable columns={columns} rows={rows} loading={loading} rowKey={(r) => r.faculty_id} empty="No faculty match these filters" />
            <Pagination page={data?.meta.page ?? 1} totalPages={data?.meta.totalPages ?? 1} total={data?.meta.total ?? 0} onPage={setPage} />
          </>
        )}
      </Card>
    </>
  );
}
