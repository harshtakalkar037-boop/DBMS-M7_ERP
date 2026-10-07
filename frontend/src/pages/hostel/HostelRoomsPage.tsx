import { useState } from 'react';
import { DoorOpen, Plus } from 'lucide-react';
import { api, errMsg } from '../../lib/api';
import { useToast } from '../../components/toast';
import { Card, PageHeader, StatCard, Tabs, SearchInput, SelectField, DataTable, StatusBadge, Modal, Field, ErrorBox, useFetch, type Column } from '../../components/ui';
import { money, num, titleCase } from '../../lib/format';
interface Hostel { hostel_id: number; hostel_code: string; name: string; hostel_type: string; total_rooms: number; total_beds: number; occupied_beds: number; availableBeds: number; rent_per_bed: string; wardenName: string | null; }
interface Room {
  room_id: number; hostel_id: number; block_id: number; room_number: string; floor: number;
  room_type: string; capacity: number; occupied_count: number; rent_per_bed: string; status: string;
  blockName: string; hostelCode: string; bedCount: number; freeBeds: number;
}
interface Bed {
  bed_id: number; room_id: number; bed_code: string; status: string; remarks: string | null;
  roomNumber: string; hostelCode: string; occupantName: string | null;
}

const ROOM_TYPES = ['SINGLE', 'DOUBLE', 'TRIPLE', 'SHARED'];
const ROOM_STATUS = ['AVAILABLE', 'PARTIAL', 'FULL', 'MAINTENANCE', 'RESERVED'];
const BED_STATUS = ['AVAILABLE', 'OCCUPIED', 'RESERVED', 'MAINTENANCE'];

export default function HostelRoomsPage() {
  const toast = useToast();
  const [tab, setTab] = useState('rooms');
  const [hostelId, setHostelId] = useState('');
  const [roomStatus, setRoomStatus] = useState('');
  const [bedStatus, setBedStatus] = useState('');
  const [search, setSearch] = useState('');

  const hostels = useFetch(() => api.get<Hostel[]>('/hostel/hostels', { limit: 50 }), []);
  const rooms = useFetch(() => api.get<Room[]>('/hostel/rooms', { limit: 500, hostelId: hostelId || undefined, status: roomStatus || undefined }), [hostelId, roomStatus]);
  const beds = useFetch(() => api.get<Bed[]>('/hostel/beds', { limit: 500, hostelId: hostelId || undefined, status: bedStatus || undefined }), [hostelId, bedStatus]);
  const blocks = useFetch(() => api.get<{ block_id: number; name: string; hostelCode: string }[]>('/hostel/blocks'), []);

  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ hostelId: '', blockId: '', roomNumber: '', floor: '1', roomType: 'DOUBLE', capacity: '2', rentPerBed: '22000' });

  const createRoom = async () => {
    setBusy(true);
    try {
      await api.post('/hostel/rooms', {
        hostelId: Number(form.hostelId), blockId: Number(form.blockId),
        roomNumber: form.roomNumber, floor: Number(form.floor),
        roomType: form.roomType, capacity: Number(form.capacity),
        rentPerBed: Number(form.rentPerBed),
      });
      toast.success(`Room ${form.roomNumber} created with ${form.capacity} beds.`);
      setOpen(false);
      rooms.reload();
      beds.reload();
      hostels.reload();
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };

  const roomCols: Column<Room>[] = [
    { key: 'room_number', header: 'Room', render: (r) => <span className="font-medium text-slate-800">{r.room_number}</span> },
    { key: 'hostelCode', header: 'Hostel' },
    { key: 'blockName', header: 'Block' },
    { key: 'floor', header: 'Floor', align: 'right' },
    { key: 'room_type', header: 'Type', render: (r) => <span className="chip bg-slate-100 text-slate-600">{titleCase(r.room_type)}</span> },
    { key: 'capacity', header: 'Capacity', align: 'right' },
    { key: 'bedCount', header: 'Beds', align: 'right' },
    { key: 'occupied_count', header: 'Occupied', align: 'right' },
    { key: 'freeBeds', header: 'Free', align: 'right', render: (r) => <span className={Number(r.freeBeds) ? 'font-semibold text-emerald-600' : 'text-slate-400'}>{num(r.freeBeds)}</span> },
    { key: 'rent_per_bed', header: 'Rent/bed', align: 'right', render: (r) => money(r.rent_per_bed) },
    { key: 'status', header: 'Status', render: (r) => <StatusBadge value={r.status} /> },
  ];

  const bedCols: Column<Bed>[] = [
    { key: 'bed_id', header: 'Bed id', align: 'right' },
    { key: 'hostelCode', header: 'Hostel' },
    { key: 'roomNumber', header: 'Room' },
    { key: 'bed_code', header: 'Bed', render: (r) => <span className="font-medium text-slate-800">{r.bed_code}</span> },
    { key: 'occupantName', header: 'Occupant', render: (r) => r.occupantName ?? <span className="text-slate-400">Vacant</span> },
    { key: 'status', header: 'Status', render: (r) => <StatusBadge value={r.status} /> },
    { key: 'remarks', header: 'Remarks', render: (r) => r.remarks ?? '—' },
  ];

  const filteredBeds = (beds.data ?? []).filter((b) => {
    const q = search.trim().toLowerCase();
    return !q || String(b.roomNumber).toLowerCase().includes(q) || String(b.occupantName ?? '').toLowerCase().includes(q);
  });

  return (
    <>
      <PageHeader
        title="Rooms & beds"
        subtitle="Adding a room creates its beds automatically; allocating or vacating a bed updates occupancy through triggers."
        icon={<DoorOpen className="h-5 w-5" />}
        actions={<button type="button" className="btn-primary btn-sm" onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Add room</button>}
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Hostels" value={num(hostels.data?.length)} icon={<DoorOpen className="h-5 w-5" />} />
        <StatCard label="Rooms" value={num(rooms.data?.length)} tone="sky" />
        <StatCard label="Beds" value={num(beds.data?.length)} tone="slate" />
        <StatCard label="Beds available" value={num((beds.data ?? []).filter((b) => b.status === 'AVAILABLE').length)} tone="emerald" />
      </div>

      <Tabs active={tab} onChange={setTab} tabs={[{ key: 'rooms', label: 'Rooms' }, { key: 'beds', label: 'Beds' }]} />

      <Card className="mb-4">
        <div className="grid gap-3 p-4 sm:grid-cols-3">
          <SelectField label="Hostel" placeholder="All hostels" value={hostelId} onChange={(e) => setHostelId(e.target.value)} options={(hostels.data ?? []).map((h) => ({ value: h.hostel_id, label: `${h.hostel_code} — ${h.name}` }))} />
          {tab === 'rooms'
            ? <SelectField label="Status" placeholder="All statuses" value={roomStatus} onChange={(e) => setRoomStatus(e.target.value)} options={ROOM_STATUS.map((s) => ({ value: s, label: titleCase(s) }))} />
            : <SelectField label="Status" placeholder="All statuses" value={bedStatus} onChange={(e) => setBedStatus(e.target.value)} options={BED_STATUS.map((s) => ({ value: s, label: titleCase(s) }))} />}
          {tab === 'beds' ? <SearchInput value={search} onChange={setSearch} placeholder="Room or occupant…" /> : null}
        </div>
      </Card>

      <Card>
        {tab === 'rooms'
          ? (rooms.error ? <ErrorBox message={rooms.error} onRetry={rooms.reload} /> : <DataTable columns={roomCols} rows={rooms.data ?? []} loading={rooms.loading} rowKey={(r) => r.room_id} empty="No rooms configured" />)
          : (beds.error ? <ErrorBox message={beds.error} onRetry={beds.reload} /> : <DataTable columns={bedCols} rows={filteredBeds} loading={beds.loading} rowKey={(r) => r.bed_id} empty="No beds configured" />)}
      </Card>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Add a hostel room"
        footer={
          <>
            <button type="button" className="btn-secondary btn-sm" onClick={() => setOpen(false)}>Cancel</button>
            <button type="button" className="btn-primary btn-sm" onClick={createRoom} disabled={busy || !form.hostelId || !form.blockId || !form.roomNumber}>{busy ? 'Creating…' : 'Create room'}</button>
          </>
        }
      >
        <div className="grid gap-x-4 sm:grid-cols-2">
          <SelectField label="Hostel" placeholder="Select" value={form.hostelId} onChange={(e) => setForm({ ...form, hostelId: e.target.value })} options={(hostels.data ?? []).map((h) => ({ value: h.hostel_id, label: h.name }))} />
          <SelectField label="Block" placeholder="Select" value={form.blockId} onChange={(e) => setForm({ ...form, blockId: e.target.value })} options={(blocks.data ?? []).map((b) => ({ value: b.block_id, label: `${b.hostelCode} · ${b.name}` }))} />
          <Field label="Room number" value={form.roomNumber} onChange={(e) => setForm({ ...form, roomNumber: e.target.value })} required placeholder="A101" />
          <Field label="Floor" type="number" value={form.floor} onChange={(e) => setForm({ ...form, floor: e.target.value })} />
          <SelectField label="Room type" value={form.roomType} onChange={(e) => setForm({ ...form, roomType: e.target.value })} options={ROOM_TYPES.map((t) => ({ value: t, label: titleCase(t) }))} />
          <Field label="Capacity (beds)" type="number" min={1} max={10} value={form.capacity} onChange={(e) => setForm({ ...form, capacity: e.target.value })} />
          <Field label="Rent per bed" type="number" value={form.rentPerBed} onChange={(e) => setForm({ ...form, rentPerBed: e.target.value })} />
        </div>
        <p className="mt-2 text-xs text-slate-500">
          The API inserts the room and then creates {form.capacity} bed row{Number(form.capacity) === 1 ? '' : 's'} for it,
          so rooms and beds can never drift out of sync.
        </p>
      </Modal>
    </>
  );
}
