import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { BedDouble, Home } from 'lucide-react';
import { api } from '../../lib/api';
import { Card, PageHeader, StatCard, DataTable, ProgressBar, ErrorBox, useFetch, type Column } from '../../components/ui';
import { money, num, pct, titleCase } from '../../lib/format';
interface Occupancy {
  hostel_id: number; hostel_code: string; hostel_name: string; hostel_type: string;
  total_rooms: number; total_beds: number; occupied_beds: number; available_beds: number;
  occupancy_percentage: string; rooms_configured: number; rooms_full: string; rooms_available: string;
}
interface Stats { hostels: number; totalBeds: string; occupiedBeds: string; residents: number; pendingApplications: number; }
interface Block { block_id: number; hostel_id: number; block_code: string; name: string; floors: number; status: string; hostelCode: string; rooms: number; }
interface FeeRow {
  hostel_fee_id: number; allocation_id: number; student_id: number; amount: string;
  paid_amount: string; due_date: string; status: string; rollNumber: string;
  studentName: string; hostelCode: string; roomNumber: string; yearLabel: string;
}

export default function HostelDashboardPage() {
  const occupancy = useFetch(() => api.get<Occupancy[]>('/hostel/occupancy'), []);
  const stats = useFetch(() => api.get<Stats>('/hostel/stats'), []);
  const blocks = useFetch(() => api.get<Block[]>('/hostel/blocks'), []);
  const fees = useFetch(() => api.get<FeeRow[]>('/hostel/fees', { limit: 300 }), []);

  const rows = occupancy.data ?? [];
  const pie = rows.map((h, i) => ({
    name: h.hostel_code,
    occupied: Number(h.occupied_beds),
    free: Math.max(0, Number(h.total_beds) - Number(h.occupied_beds)),
    color: ['#4f46e5', '#059669', '#f59e0b', '#0ea5e9'][i % 4],
  }));

  const cols: Column<Occupancy>[] = [
    { key: 'hostel_code', header: 'Code', render: (r) => <span className="font-medium text-slate-800">{r.hostel_code}</span> },
    { key: 'hostel_name', header: 'Hostel' },
    { key: 'hostel_type', header: 'Type', render: (r) => <span className="chip bg-slate-100 text-slate-600">{titleCase(r.hostel_type)}</span> },
    { key: 'total_rooms', header: 'Rooms', align: 'right' },
    { key: 'total_beds', header: 'Beds', align: 'right' },
    { key: 'occupied_beds', header: 'Occupied', align: 'right' },
    { key: 'available_beds', header: 'Available', align: 'right', render: (r) => <span className={Number(r.available_beds) ? 'font-semibold text-emerald-600' : 'text-slate-400'}>{num(r.available_beds)}</span> },
    {
      key: 'occupancy_percentage', header: 'Occupancy',
      render: (r) => (
        <div className="flex w-40 items-center gap-2">
          <ProgressBar value={Number(r.occupancy_percentage)} tone={Number(r.occupancy_percentage) > 90 ? 'bg-rose-500' : 'bg-brand-500'} />
          <span className="w-12 shrink-0 text-right text-xs">{pct(r.occupancy_percentage, 0)}</span>
        </div>
      ),
    },
    { key: 'rooms_available', header: 'Free rooms', align: 'right' },
  ];

  return (
    <>
      <PageHeader
        title="Hostel occupancy"
        subtitle="Bed counters are maintained by database triggers — allocating or vacating a bed updates the bed, room and hostel rows in the same transaction."
        icon={<BedDouble className="h-5 w-5" />}
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard label="Hostels" value={num(stats.data?.hostels)} icon={<Home className="h-5 w-5" />} />
        <StatCard label="Total beds" value={num(stats.data?.totalBeds)} tone="slate" />
        <StatCard label="Occupied" value={num(stats.data?.occupiedBeds)} tone="brand" />
        <StatCard label="Residents" value={num(stats.data?.residents)} tone="emerald" />
        <StatCard label="Pending applications" value={num(stats.data?.pendingApplications)} tone="amber" />
      </div>

      <div className="mb-4 grid gap-4 lg:grid-cols-2">
        <Card className="card-pad">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Beds occupied vs free</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={pie} margin={{ top: 5, right: 8, bottom: 0, left: -18 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" fontSize={10} />
                <YAxis allowDecimals={false} fontSize={10} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="occupied" stackId="a" fill="#4f46e5" name="Occupied" />
                <Bar dataKey="free" stackId="a" fill="#c7d2fe" radius={[4, 4, 0, 0]} name="Free" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card className="card-pad">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Share of total capacity</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={pie} dataKey="occupied" nameKey="name" outerRadius={80}>
                  {pie.map((e) => <Cell key={e.name} fill={e.color} />)}
                </Pie>
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <Card className="mb-4">
        <div className="border-b border-slate-200 px-4 py-3"><h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Hostel-wise occupancy</h2></div>
        {occupancy.error ? <ErrorBox message={occupancy.error} onRetry={occupancy.reload} /> : (
          <DataTable columns={cols} rows={rows} loading={occupancy.loading} rowKey={(r) => r.hostel_id} empty="No hostels configured" />
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <div className="border-b border-slate-200 px-4 py-3"><h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Blocks</h2></div>
          <DataTable
            rowKey={(r) => r.block_id}
            rows={blocks.data ?? []}
            loading={blocks.loading}
            empty="No blocks"
            columns={[
              { key: 'hostelCode', header: 'Hostel' },
              { key: 'block_code', header: 'Block', render: (r) => <span className="font-medium text-slate-800">{r.block_code}</span> },
              { key: 'name', header: 'Name' },
              { key: 'floors', header: 'Floors', align: 'right' },
              { key: 'rooms', header: 'Rooms', align: 'right' },
            ]}
          />
        </Card>
        <Card>
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Hostel fee ledger</h2>
            <span className="text-xs text-slate-500">{num(fees.data?.length)} entries</span>
          </div>
          <DataTable
            rowKey={(r) => r.hostel_fee_id}
            rows={fees.data ?? []}
            loading={fees.loading}
            empty="No hostel fee records"
            columns={[
              { key: 'rollNumber', header: 'Roll no.' },
              { key: 'studentName', header: 'Student' },
              { key: 'roomNumber', header: 'Room' },
              { key: 'amount', header: 'Charged', align: 'right', render: (r) => money(r.amount) },
              { key: 'paid_amount', header: 'Paid', align: 'right', render: (r) => money(r.paid_amount) },
              { key: 'status', header: 'Status', render: (r) => <span className={`chip ${r.status === 'PAID' ? 'bg-emerald-100 text-emerald-700' : r.status === 'PARTIAL' ? 'bg-amber-100 text-amber-700' : 'bg-rose-100 text-rose-700'}`}>{titleCase(r.status)}</span> },
            ]}
          />
        </Card>
      </div>
    </>
  );
}
