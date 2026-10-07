import { useMemo, useState } from 'react';
import { BookOpen, Download, Plus } from 'lucide-react';
import { api, errMsg } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useToast } from '../../components/toast';
import { Card, PageHeader, SearchInput, SelectField, DataTable, StatusBadge, ErrorBox, Modal, Field, useFetch, useDebounced, type Column } from '../../components/ui';
import { downloadCsv } from '../../lib/csv';
import { num, titleCase } from '../../lib/format';
interface Subject {
  subject_id: number; subject_code: string; name: string; short_name: string; credits: number;
  subject_type: string; department_id: number; department_code?: string; lecture_hours: number;
  tutorial_hours: number; practical_hours: number; is_elective: boolean; status: string;
  offering_count?: number;
}

const TYPES = ['THEORY', 'PRACTICAL', 'THEORY_PRACTICAL', 'SEMINAR', 'PROJECT', 'AUDIT'];

export default function SubjectsPage() {
  const { has } = useAuth();
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [deptId, setDeptId] = useState('');
  const [type, setType] = useState('');
  const term = useDebounced(search, 350);

  const params = useMemo(() => ({ limit: 500, search: term || undefined, departmentId: deptId || undefined, subjectType: type || undefined }), [term, deptId, type]);
  const { data, loading, error, reload } = useFetch(() => api.get<Subject[]>('/academics/subjects', params), [params]);
  const depts = useFetch(() => api.get<{ department_id: number; department_code: string; name: string }[]>('/academics/departments', { limit: 100 }), []);

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    subjectCode: '', name: '', shortName: '', credits: '4', subjectType: 'THEORY',
    departmentId: '', lectureHours: '3', tutorialHours: '1', practicalHours: '0', isElective: false,
    description: '',
  });
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      await api.post('/academics/subjects', {
        subjectCode: form.subjectCode,
        name: form.name,
        shortName: form.shortName || form.name,
        credits: Number(form.credits),
        subjectType: form.subjectType,
        departmentId: Number(form.departmentId),
        lectureHours: Number(form.lectureHours),
        tutorialHours: Number(form.tutorialHours),
        practicalHours: Number(form.practicalHours),
        isElective: form.isElective,
        description: form.description || null,
      });
      toast.success(`Subject ${form.subjectCode} created.`);
      setOpen(false);
      reload();
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };

  const columns: Column<Subject>[] = [
    { key: 'subject_code', header: 'Code', render: (r) => <span className="font-medium text-slate-800">{r.subject_code}</span> },
    { key: 'name', header: 'Subject' },
    { key: 'subject_type', header: 'Type', render: (r) => <span className="chip bg-slate-100 text-slate-600">{titleCase(r.subject_type)}</span> },
    { key: 'credits', header: 'Credits', align: 'right' },
    {
      key: 'hours', header: 'L / T / P', align: 'right',
      csv: (r) => `${r.lecture_hours}/${r.tutorial_hours}/${r.practical_hours}`,
      render: (r) => `${r.lecture_hours} / ${r.tutorial_hours} / ${r.practical_hours}`,
    },
    { key: 'is_elective', header: 'Elective', render: (r) => (r.is_elective ? <span className="chip bg-brand-100 text-brand-700">Elective</span> : <span className="text-slate-400">Core</span>) },
    { key: 'status', header: 'Status', render: (r) => <StatusBadge value={r.status} /> },
  ];

  const rows = data ?? [];

  return (
    <>
      <PageHeader
        title="Subjects"
        subtitle="The subject master. Course offerings reference these rows; no module keeps its own copy."
        icon={<BookOpen className="h-5 w-5" />}
        actions={
          <>
            <button type="button" className="btn-secondary btn-sm" disabled={!rows.length} onClick={() => downloadCsv('subjects.csv', rows as unknown as Record<string, unknown>[])}>
              <Download className="h-4 w-4" /> Export
            </button>
            {has('ADMIN') ? <button type="button" className="btn-primary btn-sm" onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> New subject</button> : null}
          </>
        }
      />

      <Card className="mb-4">
        <div className="grid gap-3 p-4 sm:grid-cols-3">
          <SearchInput value={search} onChange={setSearch} placeholder="Code or subject name…" />
          <SelectField placeholder="All departments" value={deptId} onChange={(e) => setDeptId(e.target.value)} options={(depts.data ?? []).map((d) => ({ value: d.department_id, label: d.name }))} />
          <SelectField placeholder="All types" value={type} onChange={(e) => setType(e.target.value)} options={TYPES.map((t) => ({ value: t, label: titleCase(t) }))} />
        </div>
      </Card>

      <Card>
        {error ? <ErrorBox message={error} onRetry={reload} /> : (
          <DataTable columns={columns} rows={rows} loading={loading} rowKey={(r) => r.subject_id} empty="No subjects match these filters" />
        )}
        <div className="border-t border-slate-200 px-4 py-2.5 text-xs text-slate-500">{num(rows.length)} subjects</div>
      </Card>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Create a subject"
        footer={
          <>
            <button type="button" className="btn-secondary btn-sm" onClick={() => setOpen(false)}>Cancel</button>
            <button type="button" className="btn-primary btn-sm" onClick={submit} disabled={busy || !form.subjectCode || !form.name || !form.departmentId}>{busy ? 'Saving…' : 'Create'}</button>
          </>
        }
      >
        <div className="grid gap-x-4 sm:grid-cols-2">
          <Field label="Subject code" value={form.subjectCode} onChange={(e) => setForm({ ...form, subjectCode: e.target.value })} required placeholder="ETC301" />
          <Field label="Credits" type="number" value={form.credits} onChange={(e) => setForm({ ...form, credits: e.target.value })} />
          <Field label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required className="sm:col-span-2" />
          <Field label="Short name" value={form.shortName} onChange={(e) => setForm({ ...form, shortName: e.target.value })} />
          <SelectField label="Type" value={form.subjectType} onChange={(e) => setForm({ ...form, subjectType: e.target.value })} options={TYPES.map((t) => ({ value: t, label: titleCase(t) }))} />
          <SelectField label="Department" placeholder="Select" value={form.departmentId} onChange={(e) => setForm({ ...form, departmentId: e.target.value })} options={(depts.data ?? []).map((d) => ({ value: d.department_id, label: d.name }))} className="sm:col-span-2" />
          <Field label="Lecture hours" type="number" value={form.lectureHours} onChange={(e) => setForm({ ...form, lectureHours: e.target.value })} />
          <Field label="Tutorial hours" type="number" value={form.tutorialHours} onChange={(e) => setForm({ ...form, tutorialHours: e.target.value })} />
          <Field label="Practical hours" type="number" value={form.practicalHours} onChange={(e) => setForm({ ...form, practicalHours: e.target.value })} />
          <label className="flex items-center gap-2 self-end pb-2 text-sm text-slate-700">
            <input type="checkbox" checked={form.isElective} onChange={(e) => setForm({ ...form, isElective: e.target.checked })} className="h-4 w-4 rounded border-slate-300" />
            Elective subject
          </label>
        </div>
      </Modal>
    </>
  );
}
