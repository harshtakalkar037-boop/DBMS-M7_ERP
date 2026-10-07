import { useState } from 'react';
import { CalendarDays, Plus, Trash2, PartyPopper } from 'lucide-react';
import { api, errMsg } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useToast } from '../../components/toast';
import { Card, PageHeader, EmptyState, Modal, Field, SelectField, TextAreaField, DataTable, Loading, ErrorBox, useFetch, type Column, StatusBadge } from '../../components/ui';
import { dateStr, titleCase } from '../../lib/format';

interface Event {
  event_id: number; academic_year_id: number; semester_id: number | null; title: string;
  description: string; event_type: string; event_date: string; end_date: string | null;
  is_holiday: boolean; yearLabel: string; semesterNo: number | null;
}

const TYPES = ['EXAM', 'HOLIDAY', 'FESTIVAL', 'EVENT', 'SEMINAR', 'SPORTS', 'OTHER'];

export default function CalendarPage() {
  const { has } = useAuth();
  const toast = useToast();
  const { data, loading, error, reload } = useFetch(() => api.get<Event[]>('/academics/calendar', { limit: 300 }), []);
  const years = useFetch(() => api.get<{ academic_year_id: number; year_label: string }[]>('/academics/years'), []);
  const semesters = useFetch(() => api.get<{ semester_id: number; semester_no: number; name: string }[]>('/academics/semesters', { limit: 200 }), []);

  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    title: '', description: '', eventType: 'EVENT', eventDate: new Date().toISOString().slice(0, 10),
    endDate: '', academicYearId: '', semesterId: '', isHoliday: false,
  });

  const submit = async () => {
    setBusy(true);
    try {
      await api.post('/academics/calendar', {
        title: form.title, description: form.description || null, eventType: form.eventType,
        eventDate: form.eventDate, endDate: form.endDate || null,
        academicYearId: Number(form.academicYearId), semesterId: form.semesterId ? Number(form.semesterId) : null,
        isHoliday: form.isHoliday,
      });
      toast.success('Event added to the academic calendar.');
      setOpen(false);
      reload();
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };

  const remove = async (id: number) => {
    try { await api.del(`/academics/calendar/${id}`); toast.success('Event removed.'); reload(); }
    catch (e) { toast.error(errMsg(e)); }
  };

  const rows = (data ?? []).slice().sort((a, b) => String(a.event_date).localeCompare(String(b.event_date)));
  const upcoming = rows.filter((e) => new Date(String(e.event_date)).getTime() >= Date.now() - 86_400_000);

  const columns: Column<Event>[] = [
    { key: 'event_date', header: 'Date', render: (r) => <span className="font-medium text-slate-800">{dateStr(r.event_date)}</span> },
    { key: 'end_date', header: 'Ends', render: (r) => (r.end_date ? dateStr(r.end_date) : <span className="text-slate-400">—</span>) },
    { key: 'title', header: 'Event' },
    { key: 'event_type', header: 'Type', render: (r) => <StatusBadge value={titleCase(r.event_type) === 'Holiday' ? 'LATE' : r.event_type} map={false} /> },
    { key: 'is_holiday', header: 'Holiday', render: (r) => (r.is_holiday ? <span className="chip bg-amber-100 text-amber-700"><PartyPopper className="h-3 w-3" /> Holiday</span> : <span className="text-slate-400">No</span>) },
    { key: 'yearLabel', header: 'Year' },
    { key: 'semesterNo', header: 'Sem', align: 'right', render: (r) => (r.semesterNo ? `Sem ${r.semesterNo}` : '—') },
    {
      key: 'actions', header: '', align: 'right',
      render: (r) => (has('ADMIN') ? (
        <button type="button" onClick={() => remove(r.event_id)} className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600" aria-label="Remove event"><Trash2 className="h-3.5 w-3.5" /></button>
      ) : null),
    },
  ];

  return (
    <>
      <PageHeader
        title="Academic calendar"
        subtitle="Term dates, holidays and institute events for the academic year."
        icon={<CalendarDays className="h-5 w-5" />}
        actions={has('ADMIN') ? <button type="button" className="btn-primary btn-sm" onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Add event</button> : null}
      />

      {upcoming.length ? (
        <Card className="mb-4">
          <div className="border-b border-slate-200 px-4 py-3"><h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Coming up next</h2></div>
          <div className="grid gap-2 p-4 sm:grid-cols-2 lg:grid-cols-3">
            {upcoming.slice(0, 6).map((e) => (
              <div key={e.event_id} className={`rounded-lg border px-3 py-2.5 ${e.is_holiday ? 'border-amber-200 bg-amber-50' : 'border-slate-200 bg-slate-50'}`}>
                <p className="text-xs font-semibold text-brand-700">{dateStr(e.event_date)}</p>
                <p className="truncate text-sm font-medium text-slate-800">{e.title}</p>
                <p className="line-clamp-2 text-xs text-slate-500">{e.description}</p>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      <Card>
        {error ? <ErrorBox message={error} onRetry={reload} /> : loading ? <Loading /> : (
          rows.length ? <DataTable columns={columns} rows={rows} rowKey={(r) => r.event_id} /> : <EmptyState title="No events scheduled" />
        )}
      </Card>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Add a calendar event"
        footer={
          <>
            <button type="button" className="btn-secondary btn-sm" onClick={() => setOpen(false)}>Cancel</button>
            <button type="button" className="btn-primary btn-sm" onClick={submit} disabled={busy || !form.title || !form.academicYearId}>{busy ? 'Saving…' : 'Add event'}</button>
          </>
        }
      >
        <div className="grid gap-x-4 sm:grid-cols-2">
          <Field label="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required className="sm:col-span-2" />
          <TextAreaField label="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="sm:col-span-2" />
          <SelectField label="Type" value={form.eventType} onChange={(e) => setForm({ ...form, eventType: e.target.value })} options={TYPES.map((t) => ({ value: t, label: titleCase(t) }))} />
          <SelectField label="Academic year" placeholder="Select" value={form.academicYearId} onChange={(e) => setForm({ ...form, academicYearId: e.target.value })} options={(years.data ?? []).map((y) => ({ value: y.academic_year_id, label: y.year_label }))} />
          <Field label="Start date" type="date" value={form.eventDate} onChange={(e) => setForm({ ...form, eventDate: e.target.value })} required />
          <Field label="End date (optional)" type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
          <SelectField label="Semester (optional)" placeholder="Whole year" value={form.semesterId} onChange={(e) => setForm({ ...form, semesterId: e.target.value })} options={(semesters.data ?? []).map((s) => ({ value: s.semester_id, label: s.name }))} className="sm:col-span-2" />
          <label className="flex items-center gap-2 pb-2 text-sm text-slate-700">
            <input type="checkbox" checked={form.isHoliday} onChange={(e) => setForm({ ...form, isHoliday: e.target.checked })} className="h-4 w-4 rounded border-slate-300" />
            This is a holiday
          </label>
        </div>
      </Modal>
    </>
  );
}
