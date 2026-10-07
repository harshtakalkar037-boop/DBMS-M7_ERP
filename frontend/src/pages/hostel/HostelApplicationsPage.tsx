import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ClipboardList, BedDouble } from 'lucide-react';
import { api, errMsg } from '../../lib/api';
import { useToast } from '../../components/toast';
import { Card, PageHeader, StatCard, Tabs, SearchInput, SelectField, DataTable, StatusBadge, Modal, TextAreaField, Loading, ErrorBox, useFetch, useDebounced, type Column, EmptyState } from '../../components/ui';
import { dateStr, money, num, titleCase } from '../../lib/format';
interface Application {
  application_id: number; application_no: string; student_id: number; hostel_id: number;
  academic_year_id: number; room_type_pref: string; applied_on: string; status: string;
  remarks: string | null; rollNumber: string; studentName: string; gender: string;
  phone: string; hostelCode: string; hostelName: string; yearLabel: string;
}
interface Bed {
  bed_id: number; bed_code: string; status: string; roomNumber: string;
  hostelCode: string; occupantName: string | null; room_id: number;
}

const STATUSES = ['APPLIED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'WAITLISTED', 'ALLOCATED', 'CANCELLED'];
const TABS = [{ key: 'ALL', label: 'All' }, ...STATUSES.map((s) => ({ key: s, label: titleCase(s) }))];

export default function HostelApplicationsPage() {
  const toast = useToast();
  const [tab, setTab] = useState('APPLIED');
  const [search, setSearch] = useState('');
  const [hostelId, setHostelId] = useState('');
  const term = useDebounced(search, 350);

  const params = useMemo(() => ({ limit: 500, status: tab === 'ALL' ? undefined : tab, search: term || undefined, hostelId: hostelId || undefined }), [tab, term, hostelId]);
  const { data, loading, error, reload } = useFetch(() => api.get<Application[]>('/hostel/applications', params), [params]);
  const hostels = useFetch(() => api.get<{ hostel_id: number; hostel_code: string; name: string }[]>('/hostel/hostels', { limit: 50 }), []);
  const stats = useFetch(() => api.get<{ hostels: number; totalBeds: string; occupiedBeds: string; residents: number; pendingApplications: number }>('/hostel/stats'), []);

  const [review, setReview] = useState<Application | null>(null);
  const [decision, setDecision] = useState<'APPROVED' | 'REJECTED' | 'WAITLISTED'>('APPROVED');
  const [remarks, setRemarks] = useState('');
  const [busy, setBusy] = useState(false);

  const [alloc, setAlloc] = useState<Application | null>(null);
  const beds = useFetch<Bed[]>(() => (alloc ? api.get<Bed[]>(`/hostel/applications/${alloc.application_id}/beds`) : Promise.resolve([])), [alloc?.application_id]);
  const [bedId, setBedId] = useState('');

  const rows = data ?? [];

  const decide = async () => {
    if (!review) return;
    setBusy(true);
    try {
      await api.put(`/hostel/applications/${review.application_id}/review`, { status: decision, remarks: remarks || undefined });
      toast.success(`Application ${decision.toLowerCase()}.`);
      setReview(null);
      setRemarks('');
      reload();
      stats.reload();
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };

  const allocate = async () => {
    if (!alloc || !bedId) return;
    setBusy(true);
    try {
      const res = await api.post<{ allocationId: number; message?: string }>('/hostel/allocations', {
        applicationId: alloc.application_id,
        bedId: Number(bedId),
      });
      toast.success(res.message ?? `Bed allocated (allocation #${res.allocationId}).`);
      setAlloc(null);
      setBedId('');
      reload();
      stats.reload();
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };

  const columns: Column<Application>[] = [
    { key: 'application_no', header: 'Application', render: (r) => <span className="font-medium text-brand-700">{r.application_no}</span> },
    {
      key: 'studentName', header: 'Student',
      render: (r) => (
        <div>
          <Link to={`/students/${r.student_id}`} className="font-medium text-slate-800 hover:underline">{r.studentName}</Link>
          <p className="text-[11px] text-slate-500">{r.rollNumber} · {titleCase(r.gender)}</p>
        </div>
      ),
    },
    { key: 'hostelCode', header: 'Hostel', render: (r) => <span className="text-xs">{r.hostelCode}</span> },
    { key: 'room_type_pref', header: 'Preference', render: (r) => titleCase(r.room_type_pref) },
    { key: 'yearLabel', header: 'Year' },
    { key: 'applied_on', header: 'Applied on', render: (r) => dateStr(r.applied_on) },
    { key: 'status', header: 'Status', render: (r) => <StatusBadge value={r.status} /> },
    {
      key: 'actions', header: '', align: 'right',
      render: (r) => (
        <div className="flex justify-end gap-1.5">
          {['APPLIED', 'UNDER_REVIEW', 'WAITLISTED'].includes(r.status) ? (
            <button type="button" className="btn-secondary btn-xs" onClick={() => { setReview(r); setDecision('APPROVED'); setRemarks(''); }}>Review</button>
          ) : null}
          {r.status === 'APPROVED' ? (
            <button type="button" className="btn-primary btn-xs" onClick={() => { setAlloc(r); setBedId(''); }}><BedDouble className="h-3.5 w-3.5" /> Allocate bed</button>
          ) : null}
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Hostel applications"
        subtitle="Approve an application, then allocate a bed — sp_allocate_hostel_bed checks availability and sets the bed, room and hostel counters."
        icon={<ClipboardList className="h-5 w-5" />}
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard label="Pending applications" value={num(stats.data?.pendingApplications)} icon={<ClipboardList className="h-5 w-5" />} tone="amber" />
        <StatCard label="Residents" value={num(stats.data?.residents)} tone="emerald" />
        <StatCard label="Total beds" value={num(stats.data?.totalBeds)} tone="slate" />
        <StatCard label="Beds occupied" value={num(stats.data?.occupiedBeds)} tone="brand" />
        <StatCard label="Hostels" value={num(stats.data?.hostels)} tone="sky" />
      </div>

      <Tabs
        active={tab}
        onChange={setTab}
        tabs={TABS}
      />

      <Card className="mb-4">
        <div className="grid gap-3 p-4 sm:grid-cols-2">
          <SearchInput value={search} onChange={setSearch} placeholder="Name, roll number or application no…" />
          <SelectField placeholder="All hostels" value={hostelId} onChange={(e) => setHostelId(e.target.value)} options={(hostels.data ?? []).map((h) => ({ value: h.hostel_id, label: `${h.hostel_code} — ${h.name}` }))} />
        </div>
      </Card>

      <Card>
        {error ? <ErrorBox message={error} onRetry={reload} /> : (
          <DataTable columns={columns} rows={rows} loading={loading} rowKey={(r) => r.application_id} empty="No applications in this bucket" />
        )}
      </Card>

      <Modal
        open={!!review}
        onClose={() => setReview(null)}
        title={`Review ${review?.application_no ?? ''}`}
        size="sm"
        footer={
          <>
            <button type="button" className="btn-secondary btn-sm" onClick={() => setReview(null)}>Cancel</button>
            <button type="button" className="btn-primary btn-sm" onClick={decide} disabled={busy}>{busy ? 'Saving…' : 'Submit'}</button>
          </>
        }
      >
        {review ? (
          <>
            <dl className="mb-4 grid grid-cols-2 gap-x-4 gap-y-2 rounded-lg bg-slate-50 p-3 text-sm">
              <div><dt className="text-[11px] uppercase text-slate-400">Student</dt><dd className="font-medium">{review.studentName}</dd></div>
              <div><dt className="text-[11px] uppercase text-slate-400">Roll no.</dt><dd className="font-medium">{review.rollNumber}</dd></div>
              <div><dt className="text-[11px] uppercase text-slate-400">Hostel</dt><dd className="font-medium">{review.hostelName}</dd></div>
              <div><dt className="text-[11px] uppercase text-slate-400">Preference</dt><dd className="font-medium">{titleCase(review.room_type_pref)}</dd></div>
            </dl>
            <SelectField
              label="Decision" value={decision}
              onChange={(e) => setDecision(e.target.value as 'APPROVED')}
              options={[
                { value: 'APPROVED', label: 'Approve' },
                { value: 'WAITLISTED', label: 'Waitlist' },
                { value: 'REJECTED', label: 'Reject' },
              ]}
            />
            <TextAreaField label="Remarks" value={remarks} onChange={(e) => setRemarks(e.target.value)} />
          </>
        ) : null}
      </Modal>

      <Modal
        open={!!alloc}
        onClose={() => setAlloc(null)}
        title={`Allocate a bed — ${alloc?.rollNumber ?? ''}`}
        footer={
          <>
            <button type="button" className="btn-secondary btn-sm" onClick={() => setAlloc(null)}>Cancel</button>
            <button type="button" className="btn-primary btn-sm" onClick={allocate} disabled={busy || !bedId}>{busy ? 'Allocating…' : 'Allocate bed'}</button>
          </>
        }
      >
        {alloc ? (
          <>
            <p className="mb-3 text-xs text-slate-500">
              Only beds in <b>{alloc.hostelName}</b> that are currently free are listed. Allocating runs
              {' '}<code className="rounded bg-slate-100 px-1">sp_allocate_hostel_bed</code>, which refuses the
              allocation if the bed is occupied, the student already has an active bed, or the hostel is full.
            </p>
            {beds.loading ? <Loading label="Finding free beds…" /> : (beds.data ?? []).length ? (
              <div className="max-h-72 overflow-y-auto rounded-lg border border-slate-200">
                {beds.data!.map((b) => (
                  <label
                    key={b.bed_id}
                    className={`flex cursor-pointer items-center justify-between border-b border-slate-100 px-3 py-2 text-sm last:border-0 transition ${
                      bedId === String(b.bed_id) ? 'bg-brand-50' : 'hover:bg-slate-50'
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="bed"
                        value={b.bed_id}
                        checked={bedId === String(b.bed_id)}
                        onChange={() => setBedId(String(b.bed_id))}
                        className="h-4 w-4"
                      />
                      <span className="font-medium text-slate-800">Room {b.roomNumber} · Bed {b.bed_code}</span>
                    </span>
                    <span className="chip bg-emerald-100 text-emerald-700">{titleCase(b.status)}</span>
                  </label>
                ))}
              </div>
            ) : (
              <EmptyState title="No free beds" hint="Add rooms and beds to this hostel before allocating." />
            )}
            <p className="mt-3 text-xs text-slate-400">
              Hostel rent is charged from the room's rent-per-bed ({money((beds.data?.[0] as unknown as Record<string, string>)?.rent_per_bed ?? 0)} range) and a
              hostel fee row is created for the allocation.
            </p>
          </>
        ) : null}
      </Modal>
    </>
  );
}
