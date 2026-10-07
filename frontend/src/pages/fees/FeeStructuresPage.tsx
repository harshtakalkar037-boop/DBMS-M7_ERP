import { useMemo, useState } from 'react';
import { Wallet, Plus, Zap } from 'lucide-react';
import { api, errMsg } from '../../lib/api';
import { useToast } from '../../components/toast';
import { Card, PageHeader, StatCard, SearchInput, SelectField, DataTable, Pagination, StatusBadge, Modal, Field, ErrorBox, useFetch, useDebounced, type Column } from '../../components/ui';
import { dateStr, money, num } from '../../lib/format';
interface Structure {
  fee_structure_id: number; fee_code: string; program_id: number; semester_no: number;
  academic_year_id: number; category_id: number; tuition_fee: string; hostel_fee: string;
  exam_fee: string; library_fee: string; lab_fee: string; development_fee: string;
  other_fee: string; late_fee_per_day: string; grace_days: number; due_date: string;
  status: string; programCode?: string; categoryCode?: string; yearLabel?: string; total?: string;
}
interface BillStats { bills: number; openBills: string; billed: string; collected: string; outstanding: string; fines: string; }

const TOTAL_KEYS = ['tuition_fee', 'hostel_fee', 'exam_fee', 'library_fee', 'lab_fee', 'development_fee', 'other_fee'] as const;

export default function FeeStructuresPage() {
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [yearId, setYearId] = useState('');
  const [page, setPage] = useState(1);
  const term = useDebounced(search, 350);

  const params = useMemo(() => ({ page, limit: 25, search: term || undefined, academicYearId: yearId || undefined }), [page, term, yearId]);
  const { data, loading, error, reload } = useFetch(() => api.page<Structure>('/fees/structures', params), [params]);
  const stats = useFetch(() => api.get<BillStats>('/fees/bills/stats'), []);
  const years = useFetch(() => api.get<{ academic_year_id: number; year_label: string }[]>('/academics/years'), []);
  const programs = useFetch(() => api.get<{ program_id: number; program_name: string }[]>('/academics/programs/all', { limit: 200 }), []);
  const categories = useFetch(() => api.get<{ category_id: number; category_name: string }[]>('/academics/categories'), []);

  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [busyLate, setBusyLate] = useState(false);
  const [form, setForm] = useState({
    programId: '', semesterNo: '1', academicYearId: '', categoryId: '',
    tuitionFee: '60000', hostelFee: '0', examFee: '2500', libraryFee: '1800',
    labFee: '3500', developmentFee: '4000', otherFee: '1200',
    lateFeePerDay: '50', graceDays: '10', dueDate: `${new Date().getFullYear()}-08-15`,
  });

  const total = TOTAL_KEYS.reduce((sum, k) => sum + Number((form as unknown as Record<string, string>)[k] ?? 0), 0);

  const submit = async () => {
    setBusy(true);
    try {
      await api.post('/fees/structures', {
        programId: Number(form.programId), semesterNo: Number(form.semesterNo),
        academicYearId: Number(form.academicYearId), categoryId: Number(form.categoryId),
        tuitionFee: Number(form.tuitionFee), hostelFee: Number(form.hostelFee),
        examFee: Number(form.examFee), libraryFee: Number(form.libraryFee),
        labFee: Number(form.labFee), developmentFee: Number(form.developmentFee),
        otherFee: Number(form.otherFee), lateFeePerDay: Number(form.lateFeePerDay),
        graceDays: Number(form.graceDays), dueDate: form.dueDate,
      });
      toast.success('Fee structure created and audit-logged.');
      setOpen(false);
      reload();
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };

  const lateFees = async () => {
    setBusyLate(true);
    try {
      const res = await api.post<{ updated: number; message?: string }>('/fees/apply-late-fees');
      toast.success(res.message ?? `Late fees applied to ${num(res.updated)} bills.`);
      stats.reload();
    } catch (e) { toast.error(errMsg(e)); } finally { setBusyLate(false); }
  };

  const columns: Column<Structure>[] = [
    { key: 'fee_code', header: 'Code', render: (r) => <span className="font-medium text-slate-800">{r.fee_code}</span> },
    { key: 'programCode', header: 'Program', render: (r) => r.programCode ?? `#${r.program_id}` },
    { key: 'semester_no', header: 'Sem', align: 'right' },
    { key: 'yearLabel', header: 'Year' },
    { key: 'categoryCode', header: 'Category' },
    {
      key: 'total', header: 'Total', align: 'right',
      csv: (r) => TOTAL_KEYS.reduce((s, k) => s + Number((r as unknown as Record<string, string>)[k] ?? 0), 0),
      render: (r) => <b>{money(TOTAL_KEYS.reduce((s, k) => s + Number((r as unknown as Record<string, string>)[k] ?? 0), 0))}</b>,
    },
    { key: 'late_fee_per_day', header: 'Late fee/day', align: 'right', render: (r) => money(r.late_fee_per_day) },
    { key: 'grace_days', header: 'Grace days', align: 'right' },
    { key: 'due_date', header: 'Due date', render: (r) => dateStr(r.due_date) },
    { key: 'status', header: 'Status', render: (r) => <StatusBadge value={r.status} /> },
  ];

  return (
    <>
      <PageHeader
        title="Fee structures"
        subtitle="Charges per program, semester and category. Every change is written to the audit log by a database trigger."
        icon={<Wallet className="h-5 w-5" />}
        actions={
          <>
            <button type="button" className="btn-secondary btn-sm" onClick={lateFees} disabled={busyLate}>
              <Zap className="h-4 w-4" /> {busyLate ? 'Running…' : 'Apply late fees'}
            </button>
            <button type="button" className="btn-primary btn-sm" onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> New structure</button>
          </>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard label="Bills raised" value={num(stats.data?.bills)} icon={<Wallet className="h-5 w-5" />} />
        <StatCard label="Open bills" value={num(stats.data?.openBills)} tone="amber" />
        <StatCard label="Billed" value={money(stats.data?.billed)} tone="slate" />
        <StatCard label="Collected" value={money(stats.data?.collected)} tone="emerald" />
        <StatCard label="Outstanding" value={money(stats.data?.outstanding)} tone="rose" />
      </div>

      <Card className="mb-4">
        <div className="grid gap-3 p-4 sm:grid-cols-2">
          <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Fee code…" />
          <SelectField placeholder="All academic years" value={yearId} onChange={(e) => { setYearId(e.target.value); setPage(1); }} options={(years.data ?? []).map((y) => ({ value: y.academic_year_id, label: y.year_label }))} />
        </div>
      </Card>

      <Card>
        {error ? <ErrorBox message={error} onRetry={reload} /> : (
          <>
            <DataTable columns={columns} rows={data?.rows ?? []} loading={loading} rowKey={(r) => r.fee_structure_id} empty="No fee structures" />
            <Pagination page={data?.meta.page ?? 1} totalPages={data?.meta.totalPages ?? 1} total={data?.meta.total ?? 0} onPage={setPage} />
          </>
        )}
      </Card>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Create a fee structure"
        size="lg"
        footer={
          <>
            <button type="button" className="btn-secondary btn-sm" onClick={() => setOpen(false)}>Cancel</button>
            <button type="button" className="btn-primary btn-sm" onClick={submit} disabled={busy || !form.programId || !form.academicYearId || !form.categoryId}>
              {busy ? 'Saving…' : `Create — ${money(total)} per student`}
            </button>
          </>
        }
      >
        <div className="grid gap-x-4 sm:grid-cols-2">
          <SelectField label="Program" placeholder="Select" value={form.programId} onChange={(e) => setForm({ ...form, programId: e.target.value })} options={(programs.data ?? []).map((p) => ({ value: p.program_id, label: p.program_name }))} className="sm:col-span-2" />
          <SelectField label="Academic year" placeholder="Select" value={form.academicYearId} onChange={(e) => setForm({ ...form, academicYearId: e.target.value })} options={(years.data ?? []).map((y) => ({ value: y.academic_year_id, label: y.year_label }))} />
          <SelectField label="Category" placeholder="Select" value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })} options={(categories.data ?? []).map((c) => ({ value: c.category_id, label: c.category_name }))} />
          <Field label="Semester no." type="number" value={form.semesterNo} onChange={(e) => setForm({ ...form, semesterNo: e.target.value })} />
          <Field label="Due date" type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
          <Field label="Tuition fee" type="number" value={form.tuitionFee} onChange={(e) => setForm({ ...form, tuitionFee: e.target.value })} />
          <Field label="Hostel fee" type="number" value={form.hostelFee} onChange={(e) => setForm({ ...form, hostelFee: e.target.value })} />
          <Field label="Exam fee" type="number" value={form.examFee} onChange={(e) => setForm({ ...form, examFee: e.target.value })} />
          <Field label="Library fee" type="number" value={form.libraryFee} onChange={(e) => setForm({ ...form, libraryFee: e.target.value })} />
          <Field label="Lab fee" type="number" value={form.labFee} onChange={(e) => setForm({ ...form, labFee: e.target.value })} />
          <Field label="Development fee" type="number" value={form.developmentFee} onChange={(e) => setForm({ ...form, developmentFee: e.target.value })} />
          <Field label="Other fee" type="number" value={form.otherFee} onChange={(e) => setForm({ ...form, otherFee: e.target.value })} />
          <Field label="Late fee per day" type="number" value={form.lateFeePerDay} onChange={(e) => setForm({ ...form, lateFeePerDay: e.target.value })} />
          <Field label="Grace days" type="number" value={form.graceDays} onChange={(e) => setForm({ ...form, graceDays: e.target.value })} />
        </div>
        <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
          Total per student: <b>{money(total)}</b>. Late fees are computed by
          {' '}<code className="rounded bg-slate-200 px-1">fn_calculate_late_fee</code> and applied by
          {' '}<code className="rounded bg-slate-200 px-1">sp_apply_late_fees</code>.
        </p>
      </Modal>
    </>
  );
}
