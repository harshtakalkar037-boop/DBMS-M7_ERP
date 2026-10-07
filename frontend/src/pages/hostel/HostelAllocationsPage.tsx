import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Home, LogOut, ArrowLeftRight } from 'lucide-react';
import { api, errMsg } from '../../lib/api';
import { useToast } from '../../components/toast';
import { Card, PageHeader, StatCard, Tabs, SearchInput, SelectField, DataTable, Pagination, StatusBadge, Modal, TextAreaField, ErrorBox, useFetch, useDebounced, type Column } from '../../components/ui';
import { dateStr, money, num } from '../../lib/format';
interface Allocation {
  allocation_id: number; student_id: number; bed_id: number; room_id: number; hostel_id: number;
  academic_year_id: number; allocated_on: string; vacated_on: string | null; rent_amount: string;
  status: string; remarks: string | null; rollNumber: string; studentName: string; gender: string;
  phone: string; hostelCode: string; hostelName: string; roomNumber?: string; bedCode?: string;
}
interface Transfer {
  transfer_id: number; student_id: number; from_bed_id: number; to_bed_id: number;
  reason: string; transferred_on: string; studentName: string; rollNumber: string;
  fromRoom: string; fromBed: string; toRoom: string; toBed: string;
}

export default function HostelAllocationsPage() {
  const toast = useToast();
  const [tab, setTab] = useState('active');
  const [search, setSearch] = useState('');
  const [hostelId, setHostelId] = useState('');
  const [page, setPage] = useState(1);
  const term = useDebounced(search, 350);

  const params = useMemo(() => ({
    page, limit: 25,
    status: tab === 'all' ? undefined : tab.toUpperCase(),
    search: term || undefined,
    hostelId: hostelId || undefined,
  }), [page, tab, term, hostelId]);

  const { data, loading, error, reload } = useFetch(() => api.page<Allocation>('/hostel/allocations', params), [params]);
  const hostels = useFetch(() => api.get<{ hostel_id: number; hostel_code: string; name: string }[]>('/hostel/hostels', { limit: 50 }), []);
  const transfers = useFetch(() => api.get<Transfer[]>('/hostel/transfers', { limit: 200 }), []);
  const stats = useFetch(() => api.get<{ residents: number; totalBeds: string; occupiedBeds: string }>('/hostel/stats'), []);
  const beds = useFetch(() => api.get<{ bed_id: number; bed_code: string; roomNumber: string; hostelCode: string; status: string }[]>('/hostel/beds', { limit: 500, status: 'AVAILABLE' }), []);

  const [vacate, setVacate] = useState<Allocation | null>(null);
  const [transfer, setTransfer] = useState<Allocation | null>(null);
  const [toBedId, setToBedId] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const doVacate = async () => {
    if (!vacate) return;
    setBusy(true);
    try {
      const res = await api.post<{ message?: string }>(`/hostel/allocations/${vacate.allocation_id}/vacate`, { reason: reason || 'Vacated by hostel office' });
      toast.success(res.message ?? 'Bed vacated.');
      setVacate(null);
      setReason('');
      reload();
      stats.reload();
      beds.reload();
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };

  const doTransfer = async () => {
    if (!transfer) return;
    setBusy(true);
    try {
      const res = await api.post<{ message?: string }>(`/hostel/allocations/${transfer.allocation_id}/transfer`, {
        toBedId: Number(toBedId), reason,
      });
      toast.success(res.message ?? 'Student transferred.');
      setTransfer(null);
      setToBedId('');
      setReason('');
      reload();
      transfers.reload();
      beds.reload();
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };

  const columns: Column<Allocation>[] = [
    {
      key: 'rollNumber', header: 'Student',
      render: (r) => (
        <div>
          <Link to={`/students/${r.student_id}`} className="font-medium text-brand-700 hover:underline">{r.rollNumber}</Link>
          <p className="text-[11px] text-slate-500">{r.studentName}</p>
        </div>
      ),
    },
    { key: 'hostelCode', header: 'Hostel', render: (r) => <span className="text-xs">{r.hostelCode} · {r.hostelName}</span> },
    { key: 'roomNumber', header: 'Room', render: (r) => r.roomNumber ?? `#${r.room_id}` },
    { key: 'bedCode', header: 'Bed', render: (r) => r.bedCode ?? `#${r.bed_id}` },
    { key: 'allocated_on', header: 'Allocated', render: (r) => dateStr(r.allocated_on) },
    { key: 'vacated_on', header: 'Vacated', render: (r) => (r.vacated_on ? dateStr(r.vacated_on) : <span className="text-slate-400">—</span>) },
    { key: 'rent_amount', header: 'Rent', align: 'right', render: (r) => money(r.rent_amount) },
    { key: 'status', header: 'Status', render: (r) => <StatusBadge value={r.status} /> },
    {
      key: 'actions', header: '', align: 'right',
      render: (r) => (r.status === 'ACTIVE' ? (
        <div className="flex justify-end gap-1.5">
          <button type="button" className="btn-secondary btn-xs" onClick={() => { setTransfer(r); setToBedId(''); setReason(''); }}>
            <ArrowLeftRight className="h-3.5 w-3.5" /> Transfer
          </button>
          <button type="button" className="btn-danger btn-xs" onClick={() => { setVacate(r); setReason(''); }}>
            <LogOut className="h-3.5 w-3.5" /> Vacate
          </button>
        </div>
      ) : null),
    },
  ];

  const transferCols: Column<Transfer>[] = [
    { key: 'transferred_on', header: 'Date', render: (r) => dateStr(r.transferred_on) },
    { key: 'rollNumber', header: 'Roll no.' },
    { key: 'studentName', header: 'Student' },
    { key: 'fromRoom', header: 'From', render: (r) => `${r.fromRoom} · ${r.fromBed}` },
    { key: 'toRoom', header: 'To', render: (r) => `${r.toRoom} · ${r.toBed}` },
    { key: 'reason', header: 'Reason' },
  ];

  return (
    <>
      <PageHeader
        title="Allocations"
        subtitle="Active residents, transfers and vacations. Vacating frees the bed and decrements every occupancy counter automatically."
        icon={<Home className="h-5 w-5" />}
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Residents" value={num(stats.data?.residents)} icon={<Home className="h-5 w-5" />} tone="emerald" />
        <StatCard label="Beds occupied" value={num(stats.data?.occupiedBeds)} tone="brand" />
        <StatCard label="Total beds" value={num(stats.data?.totalBeds)} tone="slate" />
        <StatCard label="Transfers on record" value={num(transfers.data?.length)} tone="sky" />
      </div>

      <Tabs active={tab} onChange={setTab} tabs={[{ key: 'active', label: 'Active' }, { key: 'vacated', label: 'Vacated' }, { key: 'all', label: 'All' }, { key: 'transfers', label: 'Transfers' }]} />

      {tab === 'transfers' ? (
        <Card>
          {transfers.error ? <ErrorBox message={transfers.error} onRetry={transfers.reload} /> : (
            <DataTable columns={transferCols} rows={transfers.data ?? []} loading={transfers.loading} rowKey={(r) => r.transfer_id} empty="No transfers recorded" />
          )}
        </Card>
      ) : (
        <>
          <Card className="mb-4">
            <div className="grid gap-3 p-4 sm:grid-cols-2">
              <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Name or roll number…" />
              <SelectField placeholder="All hostels" value={hostelId} onChange={(e) => { setHostelId(e.target.value); setPage(1); }} options={(hostels.data ?? []).map((h) => ({ value: h.hostel_id, label: `${h.hostel_code} — ${h.name}` }))} />
            </div>
          </Card>
          <Card>
            {error ? <ErrorBox message={error} onRetry={reload} /> : (
              <>
                <DataTable columns={columns} rows={data?.rows ?? []} loading={loading} rowKey={(r) => r.allocation_id} empty="No allocations" />
                <Pagination page={data?.meta.page ?? 1} totalPages={data?.meta.totalPages ?? 1} total={data?.meta.total ?? 0} onPage={setPage} />
              </>
            )}
          </Card>
        </>
      )}

      <Modal
        open={!!vacate}
        onClose={() => setVacate(null)}
        title={`Vacate bed — ${vacate?.rollNumber ?? ''}`}
        size="sm"
        footer={
          <>
            <button type="button" className="btn-secondary btn-sm" onClick={() => setVacate(null)}>Cancel</button>
            <button type="button" className="btn-danger btn-sm" onClick={doVacate} disabled={busy}>{busy ? 'Working…' : 'Vacate bed'}</button>
          </>
        }
      >
        <TextAreaField label="Reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Course completed / disciplinary / personal" />
        <p className="text-xs text-slate-500">
          The allocation is marked VACATED, the bed returns to AVAILABLE, and the room and hostel occupancy counters
          are decremented by triggers — all in one transaction.
        </p>
      </Modal>

      <Modal
        open={!!transfer}
        onClose={() => setTransfer(null)}
        title={`Transfer — ${transfer?.rollNumber ?? ''}`}
        footer={
          <>
            <button type="button" className="btn-secondary btn-sm" onClick={() => setTransfer(null)}>Cancel</button>
            <button type="button" className="btn-primary btn-sm" onClick={doTransfer} disabled={busy || !toBedId || reason.length < 3}>{busy ? 'Working…' : 'Transfer'}</button>
          </>
        }
      >
        <p className="mb-3 text-xs text-slate-500">
          Runs <code className="rounded bg-slate-100 px-1">sp_transfer_room</code>: the old allocation is closed, a new
          one is opened on the target bed, and a row is written to <code className="rounded bg-slate-100 px-1">room_transfers</code>.
        </p>
        <SelectField
          label="Target bed (free beds only)" placeholder="Select a bed" value={toBedId}
          onChange={(e) => setToBedId(e.target.value)}
          options={(beds.data ?? []).map((b) => ({ value: b.bed_id, label: `${b.hostelCode} · Room ${b.roomNumber} · Bed ${b.bed_code}` }))}
        />
        <TextAreaField label="Reason" value={reason} onChange={(e) => setReason(e.target.value)} />
      </Modal>
    </>
  );
}
