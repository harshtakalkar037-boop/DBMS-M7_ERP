import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Receipt, CreditCard, Download, Zap } from 'lucide-react';
import { api, errMsg } from '../../lib/api';
import { useToast } from '../../components/toast';
import { Card, PageHeader, StatCard, SearchInput, SelectField, DataTable, Pagination, StatusBadge, Modal, Field, ErrorBox, useFetch, useDebounced, type Column } from '../../components/ui';
import { downloadCsv } from '../../lib/csv';
import { dateStr, money, num, titleCase } from '../../lib/format';
interface Bill {
  student_fee_id: number; student_id: number; fee_structure_id: number; semester_id: number;
  academic_year_id: number; total_amount: string; scholarship_amount: string; discount_amount: string;
  fine_amount: string; paid_amount: string; due_amount: string; status: string;
  due_date: string; paid_on: string | null; feeCode: string; semesterNo: number;
  yearLabel: string; computedLateFee: string; rollNumber?: string; studentName?: string;
}
interface Stats { bills: number; openBills: string; billed: string; collected: string; outstanding: string; fines: string; }
interface PaymentResult { paymentId: number; receiptNo: string; message?: string; }

const MODES = ['CASH', 'CARD', 'UPI', 'NETBANKING', 'CHEQUE', 'DD', 'ONLINE', 'SCHOLARSHIP'];
const STATUSES = ['PENDING', 'PARTIAL', 'PAID', 'OVERDUE', 'WAIVED', 'CANCELLED'];

export default function BillsPage() {
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const term = useDebounced(search, 350);

  const params = useMemo(() => ({ page, limit: 25, search: term || undefined, status: status || undefined }), [page, term, status]);
  const { data, loading, error, reload } = useFetch(() => api.page<Bill>('/fees/bills', params), [params]);
  const stats = useFetch(() => api.get<Stats>('/fees/bills/stats'), []);

  const [payBill, setPayBill] = useState<Bill | null>(null);
  const [payForm, setPayForm] = useState({ amount: '', paymentMode: 'ONLINE', referenceNo: '' });
  const [busy, setBusy] = useState(false);

  const pay = async () => {
    if (!payBill) return;
    setBusy(true);
    try {
      const res = await api.post<PaymentResult>('/fees/payments', {
        studentFeeId: payBill.student_fee_id,
        amount: Number(payForm.amount),
        paymentMode: payForm.paymentMode,
        referenceNo: payForm.referenceNo || undefined,
      });
      toast.success(`${res.message ?? 'Payment recorded'} — receipt ${res.receiptNo}`);
      setPayBill(null);
      setPayForm({ amount: '', paymentMode: 'ONLINE', referenceNo: '' });
      reload();
      stats.reload();
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };

  const exportCsv = async () => {
    try {
      await api.download('/fees/export/bills', `fee-bills-${new Date().toISOString().slice(0, 10)}.csv`);
      toast.success('CSV downloaded.');
    } catch (e) { toast.error(errMsg(e)); }
  };

  const columns: Column<Bill>[] = [
    {
      key: 'rollNumber', header: 'Student',
      csv: (r) => r.rollNumber,
      render: (r) => (
        <div>
          <Link to={`/students/${r.student_id}`} className="font-medium text-brand-700 hover:underline">{r.rollNumber ?? `#${r.student_id}`}</Link>
          <p className="text-[11px] text-slate-500">{r.studentName ?? ''}</p>
        </div>
      ),
    },
    { key: 'feeCode', header: 'Fee code' },
    { key: 'semesterNo', header: 'Sem', align: 'right', render: (r) => `Sem ${r.semesterNo}` },
    { key: 'total_amount', header: 'Billed', align: 'right', render: (r) => money(r.total_amount) },
    { key: 'discount_amount', header: 'Discount', align: 'right', render: (r) => money(r.discount_amount) },
    { key: 'fine_amount', header: 'Fine', align: 'right', render: (r) => (Number(r.fine_amount) ? <span className="text-rose-600">{money(r.fine_amount)}</span> : '—') },
    { key: 'paid_amount', header: 'Paid', align: 'right', render: (r) => money(r.paid_amount) },
    { key: 'due_amount', header: 'Due', align: 'right', render: (r) => (Number(r.due_amount) > 0 ? <b className="text-rose-600">{money(r.due_amount)}</b> : money(0)) },
    { key: 'due_date', header: 'Due date', render: (r) => dateStr(r.due_date) },
    {
      key: 'computedLateFee', header: 'Late fee now', align: 'right',
      render: (r) => (Number(r.computedLateFee) > 0 ? <span className="chip bg-amber-100 text-amber-700">{money(r.computedLateFee)}</span> : <span className="text-slate-400">—</span>),
    },
    { key: 'status', header: 'Status', render: (r) => <StatusBadge value={r.status} /> },
    {
      key: 'actions', header: '', align: 'right',
      render: (r) => (Number(r.due_amount) > 0 ? (
        <button
          type="button"
          className="btn-primary btn-xs"
          onClick={() => { setPayBill(r); setPayForm({ amount: r.due_amount, paymentMode: 'ONLINE', referenceNo: '' }); }}
        ><CreditCard className="h-3.5 w-3.5" /> Record payment</button>
      ) : <span className="text-xs text-slate-400">Settled</span>),
    },
  ];

  const rows = data?.rows ?? [];

  return (
    <>
      <PageHeader
        title="Fee bills"
        subtitle="One bill per student per semester. Recording a payment calls sp_record_fee_payment, which issues a receipt and writes the ledger."
        icon={<Receipt className="h-5 w-5" />}
        actions={
          <>
            <button type="button" className="btn-secondary btn-sm" onClick={exportCsv}><Download className="h-4 w-4" /> Export CSV</button>
            <button type="button" className="btn-secondary btn-sm" disabled={!rows.length} onClick={() => downloadCsv('fee-bills.csv', rows as unknown as Record<string, unknown>[])}>Export page</button>
          </>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard label="Bills" value={num(stats.data?.bills)} icon={<Receipt className="h-5 w-5" />} />
        <StatCard label="Open bills" value={num(stats.data?.openBills)} tone="amber" />
        <StatCard label="Collected" value={money(stats.data?.collected)} tone="emerald" />
        <StatCard label="Outstanding" value={money(stats.data?.outstanding)} tone="rose" />
        <StatCard label="Fines raised" value={money(stats.data?.fines)} tone="slate" />
      </div>

      <Card className="mb-4">
        <div className="grid gap-3 p-4 sm:grid-cols-2">
          <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Roll number, name or fee code…" />
          <SelectField placeholder="All statuses" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} options={STATUSES.map((s) => ({ value: s, label: titleCase(s) }))} />
        </div>
      </Card>

      <Card>
        {error ? <ErrorBox message={error} onRetry={reload} /> : (
          <>
            <DataTable columns={columns} rows={rows} loading={loading} rowKey={(r) => r.student_fee_id} empty="No bills match these filters" />
            <Pagination page={data?.meta.page ?? 1} totalPages={data?.meta.totalPages ?? 1} total={data?.meta.total ?? 0} onPage={setPage} />
          </>
        )}
      </Card>

      <Modal
        open={!!payBill}
        onClose={() => setPayBill(null)}
        title={`Record payment — ${payBill?.feeCode ?? ''}`}
        size="sm"
        footer={
          <>
            <button type="button" className="btn-secondary btn-sm" onClick={() => setPayBill(null)}>Cancel</button>
            <button type="button" className="btn-primary btn-sm" onClick={pay} disabled={busy || !Number(payForm.amount)}>
              <Zap className="h-4 w-4" /> {busy ? 'Recording…' : 'Record payment'}
            </button>
          </>
        }
      >
        {payBill ? (
          <>
            <dl className="mb-4 grid grid-cols-2 gap-x-4 gap-y-2 rounded-lg bg-slate-50 p-3 text-sm">
              <div><dt className="text-[11px] uppercase text-slate-400">Student</dt><dd className="font-medium">{payBill.rollNumber ?? `#${payBill.student_id}`}</dd></div>
              <div><dt className="text-[11px] uppercase text-slate-400">Semester</dt><dd className="font-medium">Semester {payBill.semesterNo}</dd></div>
              <div><dt className="text-[11px] uppercase text-slate-400">Billed</dt><dd className="font-medium">{money(payBill.total_amount)}</dd></div>
              <div><dt className="text-[11px] uppercase text-slate-400">Paid so far</dt><dd className="font-medium">{money(payBill.paid_amount)}</dd></div>
              <div><dt className="text-[11px] uppercase text-slate-400">Outstanding</dt><dd className="font-semibold text-rose-600">{money(payBill.due_amount)}</dd></div>
              <div><dt className="text-[11px] uppercase text-slate-400">Late fee today</dt><dd className="font-medium">{money(payBill.computedLateFee)}</dd></div>
            </dl>
            <Field label="Amount received" type="number" step="0.01" value={payForm.amount} onChange={(e) => setPayForm({ ...payForm, amount: e.target.value })} required />
            <SelectField label="Payment mode" value={payForm.paymentMode} onChange={(e) => setPayForm({ ...payForm, paymentMode: e.target.value })} options={MODES.map((m) => ({ value: m, label: titleCase(m.replace('_', ' ')) }))} />
            <Field label="Reference no. (optional)" value={payForm.referenceNo} onChange={(e) => setPayForm({ ...payForm, referenceNo: e.target.value })} placeholder="UTR / cheque no." />
            <p className="text-xs text-slate-500">
              <code className="rounded bg-slate-100 px-1">sp_record_fee_payment</code> generates the receipt number,
              updates the bill, inserts the payment and appends the ledger row inside one transaction.
            </p>
          </>
        ) : null}
      </Modal>
    </>
  );
}
