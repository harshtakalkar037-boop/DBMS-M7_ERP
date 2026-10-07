import { useMemo, useState } from 'react';
import { CalendarClock, Plus, Trash2, TriangleAlert } from 'lucide-react';
import { api, errMsg } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useToast } from '../../components/toast';
import { Card, PageHeader, SelectField, Field, Modal, EmptyState, Loading, ErrorBox, useFetch, StatusBadge, DataTable, type Column } from '../../components/ui';
import { titleCase } from '../../lib/format';
interface Slot {
  timetable_id: number; offering_id: number; section_id: number; faculty_id: number;
  day_of_week: string; start_time: string; end_time: string; room_number: string;
  slot_label: string; subjectCode: string; subjectName: string; facultyName: string;
}

const DAYS = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];

function toHm(t: unknown): string {
  const s = String(t ?? '');
  return s.length >= 5 ? s.slice(0, 5) : s;
}

export default function TimetablePage() {
  const { user, has } = useAuth();
  const toast = useToast();

  const isStudent = user?.role === 'STUDENT';
  const isFaculty = user?.role === 'FACULTY';

  const [mode, setMode] = useState<'section' | 'faculty'>(isFaculty ? 'faculty' : 'section');
  const [sectionId, setSectionId] = useState('');
  const [facultyId, setFacultyId] = useState(isFaculty ? String(user?.facultyId ?? '') : '');

  const sections = useFetch(() => api.get<{ section_id: number; section_code: string; programCode: string; batchCode: string }[]>('/academics/sections', { limit: 300 }), []);
  const faculty = useFetch(() => api.get<{ faculty_id: number; first_name: string; last_name: string }[]>('/faculty', { limit: 300 }), []);

  const targetId = mode === 'section' ? Number(sectionId || sections.data?.[0]?.section_id || 0) : Number(facultyId || user?.facultyId || 0);
  const path = mode === 'section' ? `/academics/timetable/section/${targetId}` : `/academics/timetable/faculty/${targetId}`;

  const { data, loading, error, reload } = useFetch<Slot[]>(() => (targetId ? api.get<Slot[]>(path) : Promise.resolve([])), [path, targetId]);
  const conflicts = useFetch(() => (has('ADMIN') ? api.get<Record<string, unknown>[]>('/academics/timetable/conflicts') : Promise.resolve([])), []);
  const offerings = useFetch(() => api.get<{ offering_id: number; subjectCode: string; subjectName: string; faculty_id: number }[]>('/academics/offerings', { limit: 300 }), []);

  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    offeringId: '', sectionId: '', facultyId: '', dayOfWeek: 'MONDAY',
    startTime: '09:00', endTime: '10:00', roomNumber: '',
  });
  const [clash, setClash] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setClash(null);
    try {
      await api.post('/academics/timetable', {
        offeringId: Number(form.offeringId),
        sectionId: Number(form.sectionId),
        facultyId: Number(form.facultyId),
        dayOfWeek: form.dayOfWeek,
        startTime: `${form.startTime}:00`,
        endTime: `${form.endTime}:00`,
        roomNumber: form.roomNumber,
        slotLabel: `${form.startTime}-${form.endTime}`,
      });
      toast.success('Timetable slot added.');
      setOpen(false);
      reload();
    } catch (e) {
      const msg = errMsg(e);
      setClash(msg);
      toast.error(msg);
    } finally { setBusy(false); }
  };

  const remove = async (id: number) => {
    try {
      await api.del(`/academics/timetable/${id}`);
      toast.success('Slot removed.');
      reload();
    } catch (e) { toast.error(errMsg(e)); }
  };

  const rows = data ?? [];
  const byDay = useMemo(() => {
    const map = new Map<string, Slot[]>();
    for (const d of DAYS) map.set(d, []);
    for (const s of rows) (map.get(s.day_of_week) ?? []).push(s);
    return map;
  }, [rows]);

  const conflictCols: Column<Record<string, unknown>>[] = [
    { key: 'day_of_week', header: 'Day', render: (r) => titleCase(String(r.day_of_week)) },
    { key: 'slot_label', header: 'Slot' },
    { key: 'room_number', header: 'Room' },
    { key: 'subjectCode', header: 'Subject' },
    { key: 'facultyName', header: 'Faculty' },
    { key: 'conflict_type', header: 'Conflict', render: (r) => <StatusBadge value={String((r as Record<string, unknown>).conflict_type ?? 'CONFLICT')} /> },
  ];

  return (
    <>
      <PageHeader
        title="Timetable"
        subtitle="Weekly schedule per section or per faculty member. Clashes are refused by trg_timetable_bi_conflict in the database."
        icon={<CalendarClock className="h-5 w-5" />}
        actions={has('ADMIN') ? <button type="button" className="btn-primary btn-sm" onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Add slot</button> : null}
      />

      <Card className="mb-4">
        <div className="grid gap-3 p-4 sm:grid-cols-3">
          <SelectField
            label="View"
            value={mode}
            onChange={(e) => setMode(e.target.value as 'section')}
            options={[
              { value: 'section', label: 'By section' },
              { value: 'faculty', label: 'By faculty' },
            ]}
          />
          {mode === 'section' ? (
            <SelectField
              label="Section"
              value={sectionId}
              onChange={(e) => setSectionId(e.target.value)}
              placeholder="Select a section"
              options={(sections.data ?? []).map((s) => ({ value: s.section_id, label: `${s.batchCode} · Section ${s.section_code}` }))}
              className="sm:col-span-2"
            />
          ) : (
            <SelectField
              label="Faculty"
              value={facultyId}
              onChange={(e) => setFacultyId(e.target.value)}
              placeholder="Select a faculty member"
              options={(faculty.data ?? []).map((f) => ({ value: f.faculty_id, label: `${f.first_name} ${f.last_name}` }))}
              className="sm:col-span-2"
            />
          )}
        </div>
      </Card>

      {error ? <ErrorBox message={error} onRetry={reload} /> : loading ? <Loading label="Loading timetable…" /> : (
        rows.length === 0 ? (
          <Card><EmptyState title="No timetable published" hint={isStudent ? 'Your section timetable has not been published yet.' : 'Pick a section or faculty member, or add the first slot.'} /></Card>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {DAYS.map((day) => (
              <Card key={day} className="overflow-hidden">
                <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-2.5">
                  <h3 className="text-sm font-semibold text-slate-800">{titleCase(day)}</h3>
                  <span className="text-[11px] text-slate-500">{(byDay.get(day) ?? []).length} class{(byDay.get(day) ?? []).length === 1 ? '' : 'es'}</span>
                </div>
                <div className="divide-y divide-slate-100">
                  {(byDay.get(day) ?? []).length === 0 ? (
                    <p className="px-4 py-5 text-center text-xs text-slate-400">No classes</p>
                  ) : (
                    (byDay.get(day) ?? []).map((s) => (
                      <div key={s.timetable_id} className="flex items-start justify-between gap-2 px-4 py-2.5">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-800">{toHm(s.start_time)} – {toHm(s.end_time)}</p>
                          <p className="truncate text-xs text-slate-600">{s.subjectCode} · {s.subjectName}</p>
                          <p className="truncate text-[11px] text-slate-400">{s.facultyName} · Room {s.room_number}</p>
                        </div>
                        {has('ADMIN') ? (
                          <button type="button" onClick={() => remove(s.timetable_id)} className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600" aria-label="Remove slot">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        ) : null}
                      </div>
                    ))
                  )}
                </div>
              </Card>
            ))}
          </div>
        )
      )}

      {has('ADMIN') && conflicts.data?.length ? (
        <Card className="mt-4">
          <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-3">
            <TriangleAlert className="h-4 w-4 text-rose-500" />
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Detected conflicts</h2>
          </div>
          <DataTable columns={conflictCols} rows={conflicts.data} rowKey={(_row, i) => i} />
        </Card>
      ) : null}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Add a timetable slot"
        footer={
          <>
            <button type="button" className="btn-secondary btn-sm" onClick={() => setOpen(false)}>Cancel</button>
            <button type="button" className="btn-primary btn-sm" onClick={submit} disabled={busy}>{busy ? 'Saving…' : 'Add slot'}</button>
          </>
        }
      >
        {clash ? (
          <div className="mb-3 flex gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
            <TriangleAlert className="h-4 w-4 shrink-0" />
            <span>{clash}</span>
          </div>
        ) : (
          <p className="mb-3 rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-xs text-brand-800">
            Try booking a faculty member who already teaches in this slot — the trigger
            <code className="mx-1 rounded bg-white px-1">trg_timetable_bi_conflict</code> will refuse it and the
            message will appear here.
          </p>
        )}
        <div className="grid gap-x-4 sm:grid-cols-2">
          <SelectField
            label="Course offering" placeholder="Select"
            value={form.offeringId}
            onChange={(e) => {
              const o = (offerings.data ?? []).find((x) => String(x.offering_id) === e.target.value);
              setForm({ ...form, offeringId: e.target.value, facultyId: o ? String(o.faculty_id) : form.facultyId });
            }}
            options={(offerings.data ?? []).map((o) => ({ value: o.offering_id, label: `${o.subjectCode} — ${o.subjectName}` }))}
            className="sm:col-span-2"
          />
          <SelectField label="Section" placeholder="Select" value={form.sectionId} onChange={(e) => setForm({ ...form, sectionId: e.target.value })} options={(sections.data ?? []).map((s) => ({ value: s.section_id, label: `${s.batchCode} · ${s.section_code}` }))} />
          <SelectField label="Faculty" placeholder="Select" value={form.facultyId} onChange={(e) => setForm({ ...form, facultyId: e.target.value })} options={(faculty.data ?? []).map((f) => ({ value: f.faculty_id, label: `${f.first_name} ${f.last_name}` }))} />
          <SelectField label="Day" value={form.dayOfWeek} onChange={(e) => setForm({ ...form, dayOfWeek: e.target.value })} options={DAYS.map((d) => ({ value: d, label: titleCase(d) }))} />
          <Field label="Room" value={form.roomNumber} onChange={(e) => setForm({ ...form, roomNumber: e.target.value })} placeholder="R101" />
          <Field label="Start time" type="time" value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} />
          <Field label="End time" type="time" value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })} />
        </div>
      </Modal>
    </>
  );
}
