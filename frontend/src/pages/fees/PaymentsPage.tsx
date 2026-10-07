import { useState } from 'react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { CreditCard, Download, Printer } from 'lucide-react';
import { api, errMsg } from '../../lib/api';
import { useToast } from '../../components/toast';
import { Card, PageHeader, StatCard, Tabs, SelectField, DataTable, StatusBadge, ErrorBox, Field, useFetch, type Column, EmptyState } from '../../components/ui';
import { dateStr, dateTimeStr, money, monthYear, num, titleCase } from '../../lib/format';
interface Payment {
  payment_id: number; receipt_no: string; student_fee_id: number; student_id: number;
  amount: string; payment_mode: string; payment_date: string; status: string;
  reference_no: string; rollNumber: string; studentName: string;
}
interface Daily { payment_day: string; transactions: number; collected_amount: string; online_amount: string; cash_amount: string; }
interface Monthly { year: number; month: number; transactions: string; amount: string; }
interface ReceiptRow {
  receipt_no: string; payment_date: string; amount: string; payment_mode: string;
  reference_no: string | null; status: string; rollNumber: string; studentName: string;
  feeCode: string; semesterNo: number; total_amount: string; paid_amount: string; due_amount: string;
  ledger: { date: string; description: string; debit: string; credit: string; balance: string }[];
}

const MODES = ['CASH', 'CARD', 'UPI', 'NETBANKING', 'CHEQUE', 'DD', 'ONLINE', 'SCHOLARSHIP'];

export default function PaymentsPage() {
  const toast = useToast();
  const [tab, setTab] = useState('payments');
  const [mode, setMode] = useState('');

  const payments = useFetch(() => api.get<Payment[]>('/fees/payments', { limit: 100, paymentMode: mode || undefined }), [mode]);
  const daily = useFetch(() => api.get<Daily[]>('/fees/payments/daily', { limit: 30 }), []);
  const monthly = useFetch(() => api.get<Monthly[]>('/fees/payments/monthly'), []);

  const [receiptNo, setReceiptNo] = useState('');
  const [receipt, setReceipt] = useState<ReceiptRow | null>(null);
  const [busy, setBusy] = useState(false);

  const findReceipt = async () => {
    setBusy(true);
    try {
      const r = await api.get<ReceiptRow>(`/fees/payments/receipt/${encodeURIComponent(receiptNo.trim())}`);
      setReceipt(r);
    } catch (e) { toast.error(errMsg(e)); setReceipt(null); } finally { setBusy(false); }
  };

  const totalToday = (daily.data ?? []).reduce((s, d) => s + Number(d.collected_amount ?? 0), 0);

  const paymentCols: Column<Payment>[] = [
    { key: 'receipt_no', header: 'Receipt', render: (r) => <button type="button" className="font-medium text-brand-700 hover:underline" onClick={() => { setReceiptNo(r.receipt_no); setTab('receipt'); setReceipt(null); }}>{r.receipt_no}</button> },
    { key: 'payment_date', header: 'Date', render: (r) => dateTimeStr(r.payment_date) },
    { key: 'rollNumber', header: 'Roll no.' },
    { key: 'studentName', header: 'Student' },
    { key: 'payment_mode', header: 'Mode', render: (r) => <span className="chip bg-slate-100 text-slate-600">{titleCase(r.payment_mode)}</span> },
    { key: 'reference_no', header: 'Reference' },
    { key: 'amount', header: 'Amount', align: 'right', render: (r) => <b>{money(r.amount)}</b> },
    { key: 'status', header: 'Status', render: (r) => <StatusBadge value={r.status} /> },
  ];

  return (
    <>
      <PageHeader
        title="Payments & receipts"
        subtitle="Every receipt is reproducible from the payment and ledger tables — nothing is stored as a formatted document."
        icon={<CreditCard className="h-5 w-5" />}
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Recent transactions" value={num(payments.data?.length)} icon={<CreditCard className="h-5 w-5" />} />
        <StatCard label="Collected (last 30 days)" value={money(totalToday)} tone="emerald" />
        <StatCard label="Days with collections" value={num(daily.data?.length)} tone="sky" />
        <StatCard label="Cash collected" value={money((daily.data ?? []).reduce((s, d) => s + Number(d.cash_amount ?? 0), 0))} tone="amber" />
      </div>

      <Tabs active={tab} onChange={setTab} tabs={[{ key: 'payments', label: 'Payment register' }, { key: 'collections', label: 'Collection trends' }, { key: 'receipt', label: 'Reprint a receipt' }]} />

      {tab === 'payments' ? (
        <>
          <Card className="mb-4">
            <div className="p-4">
              <SelectField label="Payment mode" placeholder="All modes" value={mode} onChange={(e) => setMode(e.target.value)} options={MODES.map((m) => ({ value: m, label: titleCase(m.replace('_', ' ')) }))} />
            </div>
          </Card>
          <Card>
            {payments.error ? <ErrorBox message={payments.error} onRetry={payments.reload} /> : (
              <DataTable columns={paymentCols} rows={payments.data ?? []} loading={payments.loading} rowKey={(r) => r.payment_id} empty="No payments recorded" />
            )}
          </Card>
        </>
      ) : null}

      {tab === 'collections' ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="card-pad">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Daily collections (last 30 days)</h2>
            {(daily.data ?? []).length ? (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={(daily.data ?? []).slice().reverse()} margin={{ top: 5, right: 8, bottom: 0, left: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="payment_day" fontSize={10} tickFormatter={(v) => String(v).slice(5)} />
                    <YAxis fontSize={10} tickFormatter={(v) => `₹${Math.round(Number(v) / 1000)}k`} />
                    <Tooltip formatter={(v) => money(v)} />
                    <Area type="monotone" dataKey="collected_amount" stroke="#4f46e5" fill="#c7d2fe" name="Collected" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : <EmptyState title="No collections yet" />}
          </Card>
          <Card className="card-pad">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Monthly collections</h2>
            {(monthly.data ?? []).length ? (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={(monthly.data ?? []).map((m) => ({ ...m, label: monthYear(m.month, m.year) }))} margin={{ top: 5, right: 8, bottom: 0, left: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="label" fontSize={10} />
                    <YAxis fontSize={10} tickFormatter={(v) => `₹${Math.round(Number(v) / 100000)}L`} />
                    <Tooltip formatter={(v) => money(v)} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="amount" fill="#059669" radius={[4, 4, 0, 0]} name="Collected" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : <EmptyState title="No collections yet" />}
          </Card>
          <Card className="lg:col-span-2">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Day book</h2>
              <button type="button" className="btn-secondary btn-xs" onClick={() => downloadDaily()}><Download className="h-3.5 w-3.5" /> CSV</button>
            </div>
            <DataTable
              rowKey={(r) => r.payment_day}
              rows={daily.data ?? []}
              empty="No collections"
              columns={[
                { key: 'payment_day', header: 'Day', render: (r) => dateStr(r.payment_day) },
                { key: 'transactions', header: 'Transactions', align: 'right' },
                { key: 'online_amount', header: 'Online', align: 'right', render: (r) => money(r.online_amount) },
                { key: 'cash_amount', header: 'Cash', align: 'right', render: (r) => money(r.cash_amount) },
                { key: 'collected_amount', header: 'Total', align: 'right', render: (r) => <b>{money(r.collected_amount)}</b> },
              ]}
            />
          </Card>
        </div>
      ) : null}

      {tab === 'receipt' ? (
        <Card className="card-pad max-w-3xl">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Reprint a receipt</h2>
          <p className="mt-1 text-xs text-slate-500">Enter the receipt number, for example <code className="rounded bg-slate-100 px-1">RCP-2026-000001</code>.</p>
          <div className="mt-3 flex gap-2">
            <Field value={receiptNo} onChange={(e) => setReceiptNo(e.target.value)} placeholder="RCP-2026-000001" />
            <button type="button" className="btn-primary shrink-0" onClick={findReceipt} disabled={busy || !receiptNo.trim()}>{busy ? 'Loading…' : 'Fetch'}</button>
          </div>

          {receipt ? (
            <div className="mt-4 rounded-lg border border-slate-300 p-5">
              <div className="flex items-start justify-between border-b border-dashed border-slate-300 pb-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-brand-700">Vidya Pratishthan Institute of Technology</p>
                  <h3 className="text-lg font-semibold text-slate-900">Fee payment receipt</h3>
                  <p className="text-xs text-slate-500">Finance &amp; Accounts · {receipt.feeCode}</p>
                </div>
                <div className="text-right text-sm">
                  <p className="font-mono font-semibold text-slate-800">{receipt.receipt_no}</p>
                  <p className="text-slate-500">{dateTimeStr(receipt.payment_date)}</p>
                  <StatusBadge value={receipt.status} />
                </div>
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <div><dt className="text-[11px] uppercase text-slate-400">Student</dt><dd className="font-medium">{receipt.studentName}</dd></div>
                <div><dt className="text-[11px] uppercase text-slate-400">Roll number</dt><dd className="font-medium">{receipt.rollNumber}</dd></div>
                <div><dt className="text-[11px] uppercase text-slate-400">Semester</dt><dd className="font-medium">Semester {receipt.semesterNo}</dd></div>
                <div><dt className="text-[11px] uppercase text-slate-400">Mode</dt><dd className="font-medium">{titleCase(receipt.payment_mode)}</dd></div>
                <div><dt className="text-[11px] uppercase text-slate-400">Reference</dt><dd className="font-medium">{receipt.reference_no ?? '—'}</dd></div>
                <div><dt className="text-[11px] uppercase text-slate-400">Amount received</dt><dd className="text-base font-semibold text-emerald-700">{money(receipt.amount)}</dd></div>
              </dl>
              <div className="mt-4">
                <p className="mb-1 text-[11px] uppercase tracking-wide text-slate-400">Ledger</p>
                <table className="table">
                  <thead><tr><th>Date</th><th>Particulars</th><th className="text-right">Debit</th><th className="text-right">Credit</th><th className="text-right">Balance</th></tr></thead>
                  <tbody>
                    {(receipt.ledger ?? []).map((l, i) => (
                      <tr key={i}>
                        <td>{dateStr(l.date)}</td><td>{l.description}</td>
                        <td className="text-right">{l.debit ? money(l.debit) : '—'}</td>
                        <td className="text-right">{l.credit ? money(l.credit) : '—'}</td>
                        <td className="text-right">{money(l.balance)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-3 flex items-center justify-between border-t border-slate-200 pt-3 text-xs text-slate-500">
                <span>Billed {money(receipt.total_amount)} · Paid {money(receipt.paid_amount)} · Due {money(receipt.due_amount)}</span>
                <button type="button" className="btn-secondary btn-xs" onClick={() => window.print()}><Printer className="h-3.5 w-3.5" /> Print</button>
              </div>
            </div>
          ) : null}
        </Card>
      ) : null}
    </>
  );

  function downloadDaily() {
    import('../../lib/csv').then(({ downloadCsv }) => {
      downloadCsv('daily-collections.csv', (daily.data ?? []) as unknown as Record<string, unknown>[]);
    });
  }
}
