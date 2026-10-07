import { useMemo, useState } from 'react';
import { Library, Plus } from 'lucide-react';
import { api, errMsg } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useToast } from '../../components/toast';
import { Card, PageHeader, SearchInput, SelectField, DataTable, Pagination, StatusBadge, ProgressBar, ErrorBox, Modal, Field, useFetch, useDebounced, type Column } from '../../components/ui';
import { num, titleCase } from '../../lib/format';
interface Offering {
  offering_id: number; subjectCode: string; subjectName: string; credits: number;
  programCode: string; semesterNo: number; yearLabel: string; sectionCode: string;
  facultyName: string; capacity: number; enrolled: number; offering_type: string; status: string;
}

export default function OfferingsPage() {
  const { has } = useAuth();
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [semesterId, setSemesterId] = useState('');
  const [programId, setProgramId] = useState('');
  const [page, setPage] = useState(1);
  const term = useDebounced(search, 350);

  const params = useMemo(() => ({
    page, limit: 25, search: term || undefined, semesterId: semesterId || undefined, programId: programId || undefined,
  }), [page, term, semesterId, programId]);

  const { data, loading, error, reload } = useFetch(() => api.page<Offering>('/academics/offerings', params), [params]);
  const semesters = useFetch(() => api.get<{ semester_id: number; semester_no: number; name: string }[]>('/academics/semesters', { limit: 200 }), []);
  const programs = useFetch(() => api.get<{ program_id: number; program_name: string }[]>('/academics/programs/all', { limit: 200 }), []);
  const subjects = useFetch(() => api.get<{ subject_id: number; subject_code: string; name: string }[]>('/academics/subjects', { limit: 500 }), []);
  const faculty = useFetch(() => api.get<{ faculty_id: number; first_name: string; last_name: string }[]>('/faculty', { limit: 300 }), []);
  const sections = useFetch(() => api.get<{ section_id: number; section_code: string; programCode: string }[]>('/academics/sections', { limit: 300 }), []);

  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ subjectId: '', semesterId: '', programId: '', sectionId: '', facultyId: '', capacity: '60', offeringType: 'REGULAR' });

  const submit = async () => {
    setBusy(true);
    try {
      await api.post('/academics/offerings', {
        subjectId: Number(form.subjectId), semesterId: Number(form.semesterId),
        programId: Number(form.programId), sectionId: Number(form.sectionId),
        facultyId: Number(form.facultyId), capacity: Number(form.capacity),
        offeringType: form.offeringType,
      });
      toast.success('Course offering created.');
      setOpen(false);
      reload();
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };

  const columns: Column<Offering>[] = [
    { key: 'subjectCode', header: 'Code', render: (r) => <span className="font-medium text-slate-800">{r.subjectCode}</span> },
    { key: 'subjectName', header: 'Subject' },
    { key: 'programCode', header: 'Program', render: (r) => <span className="text-xs">{r.programCode}</span> },
    { key: 'semesterNo', header: 'Sem', align: 'right', render: (r) => `Sem ${r.semesterNo}` },
    { key: 'sectionCode', header: 'Sec' },
    { key: 'facultyName', header: 'Faculty' },
    {
      key: 'enrolled', header: 'Enrolled', align: 'right',
      render: (r) => (
        <div className="ml-auto w-32">
          <div className="mb-0.5 text-right text-xs text-slate-500">{num(r.enrolled)} / {num(r.capacity)}</div>
          <ProgressBar value={(Number(r.enrolled) / Math.max(1, Number(r.capacity))) * 100} tone="bg-brand-500" />
        </div>
      ),
    },
    { key: 'offering_type', header: 'Type', render: (r) => titleCase(r.offering_type) },
    { key: 'status', header: 'Status', render: (r) => <StatusBadge value={r.status} /> },
  ];

  return (
    <>
      <PageHeader
        title="Course offerings"
        subtitle="A subject actually taught to a section in a semester. Attendance, exams, marks and results all hang off this row."
        icon={<Library className="h-5 w-5" />}
        actions={has('ADMIN') ? <button type="button" className="btn-primary btn-sm" onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> New offering</button> : null}
      />

      <Card className="mb-4">
        <div className="grid gap-3 p-4 sm:grid-cols-3">
          <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Subject code or name…" />
          <SelectField placeholder="All programs" value={programId} onChange={(e) => { setProgramId(e.target.value); setPage(1); }} options={(programs.data ?? []).map((p) => ({ value: p.program_id, label: p.program_name }))} />
          <SelectField placeholder="All semesters" value={semesterId} onChange={(e) => { setSemesterId(e.target.value); setPage(1); }} options={(semesters.data ?? []).map((s) => ({ value: s.semester_id, label: s.name }))} />
        </div>
      </Card>

      <Card>
        {error ? <ErrorBox message={error} onRetry={reload} /> : (
          <>
            <DataTable columns={columns} rows={data?.rows ?? []} loading={loading} rowKey={(r) => r.offering_id} empty="No offerings match these filters" />
            <Pagination page={data?.meta.page ?? 1} totalPages={data?.meta.totalPages ?? 1} total={data?.meta.total ?? 0} onPage={setPage} />
          </>
        )}
      </Card>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Create a course offering"
        footer={
          <>
            <button type="button" className="btn-secondary btn-sm" onClick={() => setOpen(false)}>Cancel</button>
            <button type="button" className="btn-primary btn-sm" onClick={submit} disabled={busy}>{busy ? 'Saving…' : 'Create'}</button>
          </>
        }
      >
        <div className="grid gap-x-4 sm:grid-cols-2">
          <SelectField label="Subject" placeholder="Select" value={form.subjectId} onChange={(e) => setForm({ ...form, subjectId: e.target.value })} options={(subjects.data ?? []).map((s) => ({ value: s.subject_id, label: `${s.subject_code} — ${s.name}` }))} className="sm:col-span-2" />
          <SelectField label="Semester" placeholder="Select" value={form.semesterId} onChange={(e) => setForm({ ...form, semesterId: e.target.value })} options={(semesters.data ?? []).map((s) => ({ value: s.semester_id, label: s.name }))} />
          <SelectField label="Section" placeholder="Select" value={form.sectionId} onChange={(e) => setForm({ ...form, sectionId: e.target.value })} options={(sections.data ?? []).map((s) => ({ value: s.section_id, label: `${s.section_code} · ${s.programCode}` }))} />
          <SelectField label="Faculty" placeholder="Select" value={form.facultyId} onChange={(e) => setForm({ ...form, facultyId: e.target.value })} options={(faculty.data ?? []).map((f) => ({ value: f.faculty_id, label: `${f.first_name} ${f.last_name}` }))} className="sm:col-span-2" />
          <Field label="Capacity" type="number" value={form.capacity} onChange={(e) => setForm({ ...form, capacity: e.target.value })} />
          <SelectField label="Offering type" value={form.offeringType} onChange={(e) => setForm({ ...form, offeringType: e.target.value })} options={['REGULAR', 'BACKLOG', 'ELECTIVE', 'REMEDIAL', 'HONORS'].map((t) => ({ value: t, label: titleCase(t) }))} />
        </div>
      </Modal>
    </>
  );
}
