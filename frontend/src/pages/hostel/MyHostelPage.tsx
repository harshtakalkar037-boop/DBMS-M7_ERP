import { useState } from 'react';
import { BedDouble, FileText } from 'lucide-react';
import { api, errMsg } from '../../lib/api';
import { useToast } from '../../components/toast';
import {
  Card, PageHeader, StatCard, DataTable, Loading, ErrorBox, EmptyState, Modal,
  SelectField, useFetch, type Column,
} from '../../components/ui';
import { dateStr, money, num, titleCase } from '../../lib/format';

interface Allocation {
  allocation_id: number; student_id: number; bed_id: number; room_id: number; hostel_id: number;
  academic_year_id: number; allocated_on: string; vacated_on: string | null; rent_amount: string;
  status: string; remarks: string | null; roomNumber?: string; bedCode?: string;
  hostelName?: string; hostelCode?: string;
}
interface HistoryRow {
  allocation_id: number; allocated_on: string; vacated_on: string | null;
  rent_amount: string; status: string; roomNumber?: string; bedCode?: string;
  hostelName?: string; hostelCode?: string;
}
interface Hostel { hostel_id: number; hostel_code: string; name: string; hostel_type: string; availableBeds: number; rent_per_bed: string; }

export default function MyHostelPage() {
  const toast = useToast();
  const current = useFetch(() => api.get<Allocation>('/hostel/allocations/me'), []);
  const history = useFetch(() => api.get<HistoryRow[]>('/hostel/allocations/history/me'), []);
  const hostels = useFetch(() => api.get<Hostel[]>('/hostel/hostels', { limit: 50 }), []);
  const years = useFetch(() => api.get<{ academic_year_id: number; year_label: string }[]>('/academics/years'), []);
  const apps = useFetch(() => api.get<{ application_id: number; application_no: string; status: string; applied_on: string; hostelCode: string; hostelName: string }[]>('/hostel/applications', { limit: 100 }), []);

  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ hostelId: '', academicYearId: '', roomTypePref: 'DOUBLE' });

  const apply = async () => {
    setBusy(true);
    try {
      const res = await api.post<{ applicationId: number; applicationNo?: string; message?: string }>('/hostel/applications', {
        hostelId: Number(form.hostelId),
        academicYearId: Number(form.academicYearId),
        roomTypePref: form.roomTypePref,
      });
      toast.success(res.message ?? `Application ${res.applicationNo ?? res.applicationId} submitted.`);
      setOpen(false);
      apps.reload();
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };

  const histCols: Column<HistoryRow>[] = [
    { key: 'hostelCode', header: 'Hostel', render: (r) => <span className="font-medium text-slate-800">{r.hostelCode}</span> },
    { key: 'roomNumber', header: 'Room' },
    { key: 'bedCode', header: 'Bed' },
    { key: 'allocated_on', header: 'Allocated', render: (r) => dateStr(r.allocated_on) },
    { key: 'vacated_on', header: 'Vacated', render: (r) => (r.vacated_on ? dateStr(r.vacated_on) : <span className="text-slate-400">—</span>) },
    { key: 'rent_amount', header: 'Rent', align: 'right', render: (r) => money(r.rent_amount) },
    { key: 'status', header: 'Status', render: (r) => <span className={`chip ${r.status === 'ACTIVE' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{titleCase(r.status)}</span> },
  ];

  const appCols: Column<{ application_id: number; application_no: string; status: string; applied_on: string; hostelCode: string; hostelName: string }>[] = [
    { key: 'application_no', header: 'Application' },
    { key: 'hostelCode', header: 'Hostel', render: (r) => `${r.hostelCode} · ${r.hostelName}` },
    { key: 'applied_on', header: 'Applied on', render: (r) => dateStr(r.applied_on) },
    { key: 'status', header: 'Status', render: (r) => <span className={`chip ${r.status === 'APPROVED' ? 'bg-emerald-100 text-emerald-700' : r.status === 'REJECTED' ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'}`}>{titleCase(r.status)}</span> },
  ];

  return (
    <>
      <PageHeader
        title="My hostel"
        subtitle="Your current bed, your allocation history and your applications."
        icon={<BedDouble className="h-5 w-5" />}
        actions={
          (!current.data || current.data.status !== 'ACTIVE')
            ? <button type="button" className="btn-primary btn-sm" onClick={() => setOpen(true)}><FileText className="h-4 w-4" /> Apply for a bed</button>
            : null
        }
      />

      {current.loading ? <Loading /> : current.error ? <ErrorBox message={current.error} onRetry={current.reload} /> : !current.data || current.data.status !== 'ACTIVE' ? (
        <Card className="card-pad mb-4">
          <EmptyState
            title="You do not have an active bed allocation"
            hint="Apply for accommodation and the hostel office will allocate a bed when one is free."
            action={<button type="button" className="btn-primary btn-sm mt-2" onClick={() => setOpen(true)}>Apply for a bed</button>}
          />
        </Card>
      ) : (
        <>
          <Card className="card-pad mb-4">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard label="Hostel" value={current.data.hostelCode ?? `#${current.data.hostel_id}`} hint={current.data.hostelName} />
              <StatCard label="Room" value={current.data.roomNumber ?? `#${current.data.room_id}`} tone="sky" />
              <StatCard label="Bed" value={current.data.bedCode ?? `#${current.data.bed_id}`} tone="brand" />
              <StatCard label="Annual rent" value={money(current.data.rent_amount)} tone="amber" hint={`Allocated ${dateStr(current.data.allocated_on)}`} />
            </div>
          </Card>
        </>
      )}

      <Card className="mb-4">
        <div className="border-b border-slate-200 px-4 py-3"><h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Allocation history</h2></div>
        {(history.data ?? []).length
          ? <DataTable columns={histCols} rows={history.data!} rowKey={(r) => r.allocation_id} />
          : <EmptyState title="No previous allocations" />}
      </Card>

      <Card>
        <div className="border-b border-slate-200 px-4 py-3"><h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">My applications</h2></div>
        {(apps.data ?? []).length
          ? <DataTable columns={appCols} rows={apps.data!} rowKey={(r) => r.application_id} />
          : <EmptyState title="You have not applied for hostel accommodation" />}
      </Card>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Apply for hostel accommodation"
        size="sm"
        footer={
          <>
            <button type="button" className="btn-secondary btn-sm" onClick={() => setOpen(false)}>Cancel</button>
            <button type="button" className="btn-primary btn-sm" onClick={apply} disabled={busy || !form.hostelId || !form.academicYearId}>{busy ? 'Submitting…' : 'Submit application'}</button>
          </>
        }
      >
        <SelectField
          label="Hostel" placeholder="Select a hostel" value={form.hostelId}
          onChange={(e) => setForm({ ...form, hostelId: e.target.value })}
          options={(hostels.data ?? []).map((h) => ({ value: h.hostel_id, label: `${h.name} — ${num(h.availableBeds)} beds free · ${money(h.rent_per_bed)}/yr` }))}
        />
        <SelectField
          label="Academic year" placeholder="Select" value={form.academicYearId}
          onChange={(e) => setForm({ ...form, academicYearId: e.target.value })}
          options={(years.data ?? []).map((y) => ({ value: y.academic_year_id, label: y.year_label }))}
        />
        <SelectField
          label="Room preference" value={form.roomTypePref}
          onChange={(e) => setForm({ ...form, roomTypePref: e.target.value })}
          options={['SINGLE', 'DOUBLE', 'TRIPLE', 'SHARED'].map((t) => ({ value: t, label: titleCase(t) }))}
        />
        <p className="text-xs text-slate-500">
          The hostel office reviews applications in the Hostel module; once approved, a bed is allocated through
          {' '}<code className="rounded bg-slate-100 px-1">sp_allocate_hostel_bed</code>.
        </p>
      </Modal>
    </>
  );
}
