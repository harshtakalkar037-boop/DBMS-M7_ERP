import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, BellRing, Download } from 'lucide-react';
import { api, errMsg } from '../../lib/api';
import { useToast } from '../../components/toast';
import { Card, PageHeader, StatCard, SearchInput, SelectField, Field, DataTable, ErrorBox, Modal, useFetch, useDebounced, type Column, EmptyState } from '../../components/ui';
import { downloadCsv } from '../../lib/csv';
import { dateStr, money, num } from '../../lib/format';
interface Defaulter {
  studentId: number; rollNumber: string; studentName: string; phone: string; email: string;
  programCode: string; departmentCode: string; outstanding: string; oldestDueDate: string;
  daysOverdue: number; lateFee: string;
}
interface Fine {
  fine_id: number; student_id: number; reason: string; fine_type: string; amount: string;
  imposed_on: string; status: string; rollNumber: string; studentName: string;
}
interface Refund {
  refund_id: number; payment_id: number; student_id: number; amount: string; reason: string;
  refund_mode: string; refund_date: string; status: string; rollNumber: string;
  studentName: string; receiptNo: string;
}

const FINE_TYPES = ['LATE_FEE', 'LIBRARY', 'HOSTEL_DAMAGE', 'LAB_BREAKAGE', 'MISCONDUCT', 'OTHER'];

export default function DefaultersPage() {
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [deptId, setDeptId] = useState('');
  const term = useDebounced(search, 350);

  const defaulters = useFetch(() => api.get<Defaulter[]>('/fees/bills/defaulters', { limit: 500 }), []);
  const fines = useFetch(() => api.get<Fine[]>('/fees/fines', { limit: 200 }), []);
  const refunds = useFetch(() => api.get<Refund[]>('/fees/refunds', { limit: 200 }), []);
  const depts = useFetch(() => api.get<{ department_id: number; department_code: string; name: string }[]>('/academics/departments', { limit: 100 }), []);
  const stats = useFetch(() => api.get<{ bills: number; openBills: string; outstanding: string; fines: string }>('/fees/bills/stats'), []);

  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ studentId: '', fineType: 'OTHER', amount: '', reason: '' });
  const students = useFetch(() => api.get<{ student_id: number; roll_number: string; full_name: string }[]>('/students', { limit: 500 }), []);

  const createFine = async () => {
    setBusy(true);
    try {
      await api.post('/fees/fines', {
        studentId: Number(form.studentId), fineType: form.fineType,
        amount: Number(form.amount), reason: form.reason,
      });
      toast.success('Fine recorded.');
      setOpen(false);
      setForm({ studentId: '', fineType: 'OTHER', amount: '', reason: '' });
      fines.reload();
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };

  const rows = useMemo(() => (defaulters.data ?? []).filter((d) => {
    const q = term.toLowerCase();
    if (q && !d.studentName.toLowerCase().includes(q) && !d.rollNumber.toLowerCase().includes(q)) return false;
    if (deptId) {
      const dept = (depts.data ?? []).find((x) => String(x.department_id) === deptId);
      if (dept?.department_code && d.departmentCode && dept.department_code !== d.departmentCode) return false;
    }
    return true;
  }), [defaulters.data, term, deptId, depts.data]);

  const totalOutstanding = rows.reduce((s, r) => s + Number(r.outstanding ?? 0), 0);
  const totalLate = rows.reduce((s, r) => s + Number(r.lateFee ?? 0), 0);

  const columns: Column<Defaulter>[] = [
    { key: 'rollNumber', header: 'Roll no.', render: (r) => <Link to={`/students/${r.studentId}`} className="font-medium text-brand-700 hover:underline">{r.rollNumber}</Link> },
    { key: 'studentName', header: 'Student' },
    { key: 'programCode', header: 'Program', render: (r) => <span className="text-xs">{r.programCode}</span> },
    { key: 'outstanding', header: 'Outstanding', align: 'right', render: (r) => <b className="text-rose-600">{money(r.outstanding)}</b> },
    { key: 'oldestDueDate', header: 'Oldest due', render: (r) => dateStr(r.oldestDueDate) },
    {
      key: 'daysOverdue', header: 'Days overdue', align: 'right',
      render: (r) => (
        <span className={`chip ${Number(r.daysOverdue) > 180 ? 'bg-rose-100 text-rose-700' : Number(r.daysOverdue) > 30 ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'}`}>
          {num(r.daysOverdue)}
        </span>
      ),
    },
    { key: 'lateFee', header: 'Late fee accrued', align: 'right', render: (r) => money(r.lateFee) },
    { key: 'phone', header: 'Phone' },
  ];

  const fineCols: Column<Fine>[] = [
    { key: 'rollNumber', header: 'Roll no.' },
    { key: 'studentName', header: 'Student' },
    { key: 'fine_type', header: 'Type', render: (r) => <span className="chip bg-slate-100 text-slate-600">{r.fine_type.replace('_', ' ')}</span> },
    { key: 'reason', header: 'Reason' },
    { key: 'amount', header: 'Amount', align: 'right', render: (r) => money(r.amount) },
    { key: 'imposed_on', header: 'Imposed on', render: (r) => dateStr(r.imposed_on) },
    { key: 'status', header: 'Status', render: (r) => <span className={`chip ${r.status === 'PAID' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>{r.status}</span> },
  ];

  const refundCols: Column<Refund>[] = [
    { key: 'receiptNo', header: 'Original receipt' },
    { key: 'rollNumber', header: 'Roll no.' },
    { key: 'studentName', header: 'Student' },
    { key: 'amount', header: 'Refunded', align: 'right', render: (r) => money(r.amount) },
    { key: 'reason', header: 'Reason' },
    { key: 'refund_mode', header: 'Mode' },
    { key: 'refund_date', header: 'Date', render: (r) => dateStr(r.refund_date) },
    { key: 'status', header: 'Status', render: (r) => <span className="chip bg-sky-100 text-sky-700">{r.status}</span> },
  ];

  return (
    <>
      <PageHeader
        title="Defaulters, fines & refunds"
        subtitle="Defaulters are computed live by fn_student_outstanding_dues; late fees by fn_calculate_late_fee."
        icon={<AlertTriangle className="h-5 w-5" />}
        actions={
          <>
            <button type="button" className="btn-secondary btn-sm" disabled={!rows.length} onClick={() => downloadCsv('defaulters.csv', rows as unknown as Record<string, unknown>[])}>
              <Download className="h-4 w-4" /> Export
            </button>
            <button type="button" className="btn-primary btn-sm" onClick={() => setOpen(true)}><BellRing className="h-4 w-4" /> Record a fine</button>
          </>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Students with dues" value={num(rows.length)} icon={<AlertTriangle className="h-5 w-5" />} tone="rose" />
        <StatCard label="Outstanding" value={money(totalOutstanding)} tone="rose" />
        <StatCard label="Late fees accrued" value={money(totalLate)} tone="amber" />
        <StatCard label="Fines on record" value={money(stats.data?.fines)} tone="slate" />
      </div>

      <Card className="mb-4">
        <div className="grid gap-3 p-4 sm:grid-cols-2">
          <SearchInput value={search} onChange={setSearch} placeholder="Name or roll number…" />
          <SelectField placeholder="All departments" value={deptId} onChange={(e) => setDeptId(e.target.value)} options={(depts.data ?? []).map((d) => ({ value: d.department_id, label: d.name }))} />
        </div>
      </Card>

      <Card className="mb-4">
        <div className="border-b border-slate-200 px-4 py-3"><h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Defaulters</h2></div>
        {defaulters.error ? <ErrorBox message={defaulters.error} onRetry={defaulters.reload} /> : (
          <DataTable columns={columns} rows={rows} loading={defaulters.loading} rowKey={(r) => r.studentId} empty="No student has an outstanding balance" />
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <div className="border-b border-slate-200 px-4 py-3"><h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Fines</h2></div>
          {fines.error ? <ErrorBox message={fines.error} onRetry={fines.reload} /> : (fines.data ?? []).length ? (
            <DataTable columns={fineCols} rows={fines.data!} rowKey={(r) => r.fine_id} />
          ) : <EmptyState title="No fines recorded" />}
        </Card>
        <Card>
          <div className="border-b border-slate-200 px-4 py-3"><h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Refunds</h2></div>
          {refunds.error ? <ErrorBox message={refunds.error} onRetry={refunds.reload} /> : (refunds.data ?? []).length ? (
            <DataTable columns={refundCols} rows={refunds.data!} rowKey={(r) => r.refund_id} />
          ) : <EmptyState title="No refunds processed" />}
        </Card>
      </div>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Record a fine"
        size="sm"
        footer={
          <>
            <button type="button" className="btn-secondary btn-sm" onClick={() => setOpen(false)}>Cancel</button>
            <button type="button" className="btn-primary btn-sm" onClick={createFine} disabled={busy || !form.studentId || !form.amount || !form.reason}>{busy ? 'Saving…' : 'Record fine'}</button>
          </>
        }
      >
        <SelectField
          label="Student" placeholder="Select a student"
          value={form.studentId} onChange={(e) => setForm({ ...form, studentId: e.target.value })}
          options={(students.data ?? []).map((s) => ({ value: s.student_id, label: `${s.roll_number} · ${s.full_name}` }))}
        />
        <SelectField label="Fine type" value={form.fineType} onChange={(e) => setForm({ ...form, fineType: e.target.value })} options={FINE_TYPES.map((t) => ({ value: t, label: t.replace('_', ' ') }))} />
        <Field label="Amount" type="number" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
        <Field label="Reason" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
      </Modal>
    </>
  );
}
