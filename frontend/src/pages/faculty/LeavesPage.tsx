import { useMemo, useState } from 'react';
import { Umbrella, Plus } from 'lucide-react';
import { api, errMsg } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useToast } from '../../components/toast';
import { Card, PageHeader, StatCard, Tabs, SelectField, DataTable, StatusBadge, ErrorBox, Modal, Field, TextAreaField, ProgressBar, useFetch, useDebounced, SearchInput, type Column } from '../../components/ui';
import { dateStr, num, titleCase } from '../../lib/format';
interface Leave {
  leave_id: number; faculty_id: number; leave_type: string; start_date: string; end_date: string;
  days: number; reason: string; applied_on: string; status: string; remarks: string | null;
  facultyName: string; employeeCode: string; departmentCode: string; approverName: string | null;
}
interface Balance { balance_id: number; leave_type: string; allotted: number; used: number; remaining: string; }

const LEAVE_TYPES = ['CASUAL', 'SICK', 'EARNED', 'MATERNITY', 'PATERNITY', 'UNPAID', 'ON_DUTY'];

export default function LeavesPage() {
  const { user, has } = useAuth();
  const toast = useToast();
  const isFaculty = user?.role === 'FACULTY';
  const [tab, setTab] = useState('PENDING');
  const [leaveType, setLeaveType] = useState('');
  const [search, setSearch] = useState('');
  const term = useDebounced(search, 350);

  const params = useMemo(() => ({
    limit: 500,
    status: tab === 'ALL' ? undefined : tab,
    leaveType: leaveType || undefined,
    search: term || undefined,
  }), [tab, leaveType, term]);

  const { data, loading, error, reload } = useFetch(() => api.get<Leave[]>('/faculty/leaves', params), [params]);
  const balances = useFetch<Balance[]>(
    () => (isFaculty ? api.get<Balance[]>('/faculty/me/leave-balances') : api.get<Balance[]>(`/faculty/${user?.facultyId ?? 1}/leave-balances`)),
    [isFaculty, user?.facultyId],
  );
  const stats = useFetch(() => api.get<{ total: number; pendingLeaves: number }>('/faculty/stats'), []);
  const facultyList = useFetch(() => api.get<{ faculty_id: number; first_name: string; last_name: string; employee_code: string }[]>('/faculty', { limit: 300 }), []);

  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    facultyId: isFaculty ? String(user?.facultyId ?? '') : '',
    leaveType: 'CASUAL',
    startDate: new Date().toISOString().slice(0, 10),
    endDate: new Date().toISOString().slice(0, 10),
    days: '1',
    reason: '',
  });

  const apply = async () => {
    setBusy(true);
    try {
      await api.post('/faculty/leaves', {
        ...(isFaculty ? {} : { facultyId: Number(form.facultyId) }),
        leaveType: form.leaveType,
        startDate: form.startDate,
        endDate: form.endDate,
        days: Number(form.days),
        reason: form.reason,
      });
      toast.success('Leave application submitted.');
      setOpen(false);
      setForm({ ...form, reason: '' });
      reload();
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };

  const review = async (id: number, approve: boolean) => {
    try {
      const res = await api.post<{ message?: string }>(`/faculty/leaves/${id}/review`, { approve, remarks: approve ? 'Approved' : 'Rejected' });
      toast.success(res.message ?? (approve ? 'Leave approved.' : 'Leave rejected.'));
      reload();
      balances.reload();
    } catch (e) { toast.error(errMsg(e)); }
  };

  const columns: Column<Leave>[] = [
    { key: 'employeeCode', header: 'Employee' },
    { key: 'facultyName', header: 'Faculty' },
    { key: 'leave_type', header: 'Type', render: (r) => <span className="chip bg-slate-100 text-slate-600">{titleCase(r.leave_type)}</span> },
    { key: 'start_date', header: 'From', render: (r) => dateStr(r.start_date) },
    { key: 'end_date', header: 'To', render: (r) => dateStr(r.end_date) },
    { key: 'days', header: 'Days', align: 'right' },
    { key: 'reason', header: 'Reason', render: (r) => <span className="max-w-xs truncate text-xs">{r.reason}</span> },
    { key: 'applied_on', header: 'Applied on', render: (r) => dateStr(r.applied_on) },
    { key: 'status', header: 'Status', render: (r) => <StatusBadge value={r.status} /> },
    { key: 'approverName', header: 'Decided by', render: (r) => r.approverName ?? <span className="text-slate-400">—</span> },
    {
      key: 'actions', header: '', align: 'right',
      render: (r) => (r.status === 'PENDING' && has('ADMIN', 'HR') ? (
        <div className="flex justify-end gap-1.5">
          <button type="button" className="btn-success btn-xs" onClick={() => review(r.leave_id, true)}>Approve</button>
          <button type="button" className="btn-danger btn-xs" onClick={() => review(r.leave_id, false)}>Reject</button>
        </div>
      ) : null),
    },
  ];

  const rows = data ?? [];

  return (
    <>
      <PageHeader
        title="Leave requests"
        subtitle="Approving a leave calls sp_approve_leave, which updates the balance and notifies the faculty member."
        icon={<Umbrella className="h-5 w-5" />}
        actions={<button type="button" className="btn-primary btn-sm" onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Apply for leave</button>}
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Pending requests" value={num(stats.data?.pendingLeaves)} icon={<Umbrella className="h-5 w-5" />} tone="amber" />
        <StatCard label="Faculty" value={num(stats.data?.total)} tone="slate" />
        <StatCard label="Requests shown" value={num(rows.length)} tone="sky" />
        <StatCard label="Approved (shown)" value={num(rows.filter((r) => r.status === 'APPROVED').length)} tone="emerald" />
      </div>

      {isFaculty ? (
        <Card className="card-pad mb-4">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Your leave balance</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            {(balances.data ?? []).map((b) => (
              <div key={b.leave_type}>
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="font-medium text-slate-700">{titleCase(b.leave_type)}</span>
                  <span className="text-slate-500">{num(b.remaining, 1)} / {num(b.allotted)}</span>
                </div>
                <ProgressBar value={(Number(b.remaining) / Math.max(1, Number(b.allotted))) * 100} />
                <p className="mt-1 text-[11px] text-slate-400">{num(b.used)} days used</p>
              </div>
            ))}
            {!balances.data?.length ? <p className="text-sm text-slate-500">No balances configured.</p> : null}
          </div>
        </Card>
      ) : null}

      <Tabs
        active={tab}
        onChange={setTab}
        tabs={[
          { key: 'PENDING', label: 'Pending' },
          { key: 'APPROVED', label: 'Approved' },
          { key: 'REJECTED', label: 'Rejected' },
          { key: 'ALL', label: 'All' },
        ]}
      />

      <Card className="mb-4">
        <div className="grid gap-3 p-4 sm:grid-cols-2">
          <SearchInput value={search} onChange={setSearch} placeholder="Faculty name or employee code…" />
          <SelectField placeholder="All leave types" value={leaveType} onChange={(e) => setLeaveType(e.target.value)} options={LEAVE_TYPES.map((t) => ({ value: t, label: titleCase(t) }))} />
        </div>
      </Card>

      <Card>
        {error ? <ErrorBox message={error} onRetry={reload} /> : (
          <DataTable columns={columns} rows={rows} loading={loading} rowKey={(r) => r.leave_id} empty="No leave requests in this bucket" />
        )}
      </Card>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Apply for leave"
        footer={
          <>
            <button type="button" className="btn-secondary btn-sm" onClick={() => setOpen(false)}>Cancel</button>
            <button type="button" className="btn-primary btn-sm" onClick={apply} disabled={busy || (!isFaculty && !form.facultyId) || form.reason.length < 5}>
              {busy ? 'Submitting…' : 'Submit application'}
            </button>
          </>
        }
      >
        <div className="grid gap-x-4 sm:grid-cols-2">
          {!isFaculty ? (
            <SelectField
              label="Faculty member" placeholder="Select"
              value={form.facultyId}
              onChange={(e) => setForm({ ...form, facultyId: e.target.value })}
              options={(facultyList.data ?? []).map((f) => ({ value: f.faculty_id, label: `${f.employee_code} · ${f.first_name} ${f.last_name}` }))}
              className="sm:col-span-2"
            />
          ) : null}
          <SelectField label="Leave type" value={form.leaveType} onChange={(e) => setForm({ ...form, leaveType: e.target.value })} options={LEAVE_TYPES.map((t) => ({ value: t, label: titleCase(t) }))} />
          <Field label="Days" type="number" min={1} value={form.days} onChange={(e) => setForm({ ...form, days: e.target.value })} />
          <Field label="Start date" type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
          <Field label="End date" type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
          <TextAreaField label="Reason" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} className="sm:col-span-2" />
        </div>
        <p className="text-xs text-slate-500">
          The balance is only consumed once an administrator or HR approves the request —
          <code className="mx-1 rounded bg-slate-100 px-1">sp_approve_leave</code> handles that in one transaction.
        </p>
      </Modal>
    </>
  );
}
