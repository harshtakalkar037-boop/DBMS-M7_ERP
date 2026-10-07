import { useState } from 'react';
import { IndianRupee, Receipt } from 'lucide-react';
import { api } from '../../lib/api';
import {
  Card, PageHeader, StatCard, Tabs, DataTable, StatusBadge, ProgressBar, Loading, ErrorBox,
  useFetch, type Column, EmptyState,
} from '../../components/ui';
import { dateStr, money, num } from '../../lib/format';

interface Bill {
  student_fee_id: number; total_amount: string; scholarship_amount: string; discount_amount: string;
  fine_amount: string; paid_amount: string; due_amount: string; status: string; due_date: string;
  paid_on: string | null; feeCode: string; semesterNo: number; yearLabel: string; computedLateFee: string;
}
interface Summary {
  total_bills: number; total_billed: string; total_paid: string; total_due: string;
}
interface Payment {
  payment_id: number; receipt_no: string; amount: string; payment_mode: string;
  payment_date: string; status: string; reference_no: string | null;
}

export default function MyFeesPage() {
  const [tab, setTab] = useState('bills');

  const bills = useFetch(() => api.get<Bill[]>('/fees/bills/me'), []);
  const summary = useFetch(() => api.get<Summary>('/fees/bills/summary/me'), []);
  const payments = useFetch(() => api.get<Payment[]>('/fees/payments', { limit: 100 }), []);

  const billCols: Column<Bill>[] = [
    { key: 'feeCode', header: 'Bill', render: (r) => <span className="font-medium text-slate-800">{r.feeCode}</span> },
    { key: 'semesterNo', header: 'Semester', render: (r) => `Semester ${r.semesterNo}` },
    { key: 'yearLabel', header: 'Year' },
    { key: 'total_amount', header: 'Billed', align: 'right', render: (r) => money(r.total_amount) },
    { key: 'discount_amount', header: 'Discount', align: 'right', render: (r) => money(r.discount_amount) },
    { key: 'fine_amount', header: 'Fine', align: 'right', render: (r) => (Number(r.fine_amount) ? <span className="text-rose-600">{money(r.fine_amount)}</span> : '—') },
    { key: 'paid_amount', header: 'Paid', align: 'right', render: (r) => <span className="text-emerald-600">{money(r.paid_amount)}</span> },
    { key: 'due_amount', header: 'Due', align: 'right', render: (r) => (Number(r.due_amount) > 0 ? <b className="text-rose-600">{money(r.due_amount)}</b> : '—') },
    { key: 'due_date', header: 'Due date', render: (r) => dateStr(r.due_date) },
    { key: 'status', header: 'Status', render: (r) => <StatusBadge value={r.status} /> },
  ];

  const payCols: Column<Payment>[] = [
    { key: 'receipt_no', header: 'Receipt', render: (r) => <span className="font-mono text-xs">{r.receipt_no}</span> },
    { key: 'payment_date', header: 'Date', render: (r) => dateStr(r.payment_date) },
    { key: 'payment_mode', header: 'Mode' },
    { key: 'reference_no', header: 'Reference', render: (r) => r.reference_no ?? '—' },
    { key: 'amount', header: 'Amount', align: 'right', render: (r) => <b>{money(r.amount)}</b> },
    { key: 'status', header: 'Status', render: (r) => <StatusBadge value={r.status} /> },
  ];

  const paidPct = Number(summary.data?.total_billed)
    ? (Number(summary.data?.total_paid) / Number(summary.data?.total_billed)) * 100
    : 0;

  return (
    <>
      <PageHeader
        title="My fees"
        subtitle="Your bills, payments and outstanding balance, read live from the finance module."
        icon={<IndianRupee className="h-5 w-5" />}
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Total billed" value={money(summary.data?.total_billed)} tone="slate" />
        <StatCard label="Paid" value={money(summary.data?.total_paid)} tone="emerald" icon={<Receipt className="h-5 w-5" />} />
        <StatCard label="Outstanding" value={money(summary.data?.total_due)} tone={Number(summary.data?.total_due) > 0 ? 'rose' : 'emerald'} />
        <StatCard label="Bills" value={num(summary.data?.total_bills)} tone="sky" />
      </div>

      <Card className="card-pad mb-4">
        <div className="mb-1 flex items-center justify-between text-xs">
          <span className="font-semibold uppercase tracking-wide text-slate-500">Payment progress</span>
          <span className="text-slate-500">{num(paidPct, 1)}% settled</span>
        </div>
        <ProgressBar value={paidPct} tone="bg-emerald-500" />
      </Card>

      <Tabs active={tab} onChange={setTab} tabs={[{ key: 'bills', label: 'My bills' }, { key: 'payments', label: 'Payment history' }]} />

      {tab === 'bills' ? (
        <Card>
          {bills.error ? <ErrorBox message={bills.error} onRetry={bills.reload} /> : bills.loading ? <Loading /> : (bills.data ?? []).length ? (
            <DataTable columns={billCols} rows={bills.data!} rowKey={(r) => r.student_fee_id} />
          ) : <EmptyState title="No bills raised" />}
        </Card>
      ) : (
        <Card>
          {payments.error ? <ErrorBox message={payments.error} onRetry={payments.reload} /> : (payments.data ?? []).length ? (
            <DataTable columns={payCols} rows={payments.data!} rowKey={(r) => r.payment_id} />
          ) : <EmptyState title="No payments recorded yet" />}
        </Card>
      )}
    </>
  );
}
