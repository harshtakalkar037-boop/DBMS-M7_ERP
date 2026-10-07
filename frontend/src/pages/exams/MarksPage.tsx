import { useState } from 'react';
import { PenLine, Save, Zap } from 'lucide-react';
import { api, errMsg } from '../../lib/api';
import { useToast } from '../../components/toast';
import { Card, PageHeader, StatCard, SelectField, DataTable, ErrorBox, EmptyState, useFetch, type Column, StatusBadge } from '../../components/ui';
import { num, pct, titleCase } from '../../lib/format';
interface MarkRow {
  registrationId: number; studentId: number; rollNumber: string; studentName: string;
  marks: string | null; isAbsent: boolean; grade: string | null; gradePoints: string | null;
  isPass: boolean | null; remarks: string | null; maxMarks: number; minMarks: number;
}
interface Exam { exam_id: number; exam_code: string; name: string; status: string; result_published: boolean; }

export default function MarksPage() {
  const toast = useToast();
  const [examId, setExamId] = useState('');
  const [draft, setDraft] = useState<Record<number, string>>({});
  const [absent, setAbsent] = useState<Record<number, boolean>>({});
  const [busy, setBusy] = useState(false);

  const exams = useFetch(() => api.get<Exam[]>('/exams', { limit: 100 }), []);
  const sheet = useFetch<MarkRow[]>(
    () => (examId ? api.get<MarkRow[]>(`/exams/marks/sheet/${examId}`) : Promise.resolve([])),
    [examId],
  );
  const grades = useFetch(() => api.get<{ grade_code: string; grade_label: string; min_percentage: string; max_percentage: string; grade_points: string }[]>('/exams/grades'), []);

  const rows = sheet.data ?? [];
  const marked = rows.filter((r) => r.marks !== null || r.isAbsent).length;
  const passCount = rows.filter((r) => r.isPass === true).length;
  const failCount = rows.filter((r) => r.isPass === false).length;

  const saveOne = async (r: MarkRow) => {
    const raw = draft[r.registrationId] ?? (r.marks ?? '');
    setBusy(true);
    try {
      await api.post('/exams/marks', {
        registrationId: r.registrationId,
        marksObtained: raw === '' || absent[r.registrationId] ? null : Number(raw),
        isAbsent: !!absent[r.registrationId],
      });
      toast.success(`${r.rollNumber} saved.`);
      const key = r.registrationId;
      setDraft((d) => { const n = { ...d }; delete n[key]; return n; });
      sheet.reload();
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };

  const saveAll = async () => {
    const pending = rows.filter((r) => draft[r.registrationId] !== undefined || absent[r.registrationId] !== undefined);
    if (!pending.length) { toast.info('No pending edits.'); return; }
    setBusy(true);
    try {
      for (const r of pending) {
        const raw = draft[r.registrationId] ?? (r.marks ?? '');
        await api.post('/exams/marks', {
          registrationId: r.registrationId,
          marksObtained: raw === '' || absent[r.registrationId] ? null : Number(raw),
          isAbsent: !!absent[r.registrationId],
        });
      }
      toast.success(`${pending.length} mark entries saved.`);
      setDraft({});
      setAbsent({});
      sheet.reload();
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };

  const process = async () => {
    if (!examId) return;
    setBusy(true);
    try {
      const res = await api.post<{ message?: string; processed?: number }>('/exams/results/process', { examId: Number(examId) });
      toast.success(res.message ?? 'Results processed.');
      exams.reload();
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };

  const columns: Column<MarkRow>[] = [
    { key: 'rollNumber', header: 'Roll no.', render: (r) => <span className="font-medium text-slate-800">{r.rollNumber}</span> },
    { key: 'studentName', header: 'Student' },
    {
      key: 'marks', header: 'Marks',
      render: (r) => (
        <input
          type="number"
          min={0}
          max={r.maxMarks}
          step="0.01"
          className="input w-24 py-1 text-right"
          value={draft[r.registrationId] ?? (r.marks ?? '')}
          disabled={absent[r.registrationId]}
          onChange={(e) => setDraft({ ...draft, [r.registrationId]: e.target.value })}
          placeholder="—"
        />
      ),
    },
    {
      key: 'isAbsent', header: 'Absent', align: 'center',
      render: (r) => (
        <input
          type="checkbox"
          className="h-4 w-4 rounded border-slate-300"
          checked={absent[r.registrationId] ?? r.isAbsent}
          onChange={(e) => setAbsent({ ...absent, [r.registrationId]: e.target.checked })}
        />
      ),
    },
    { key: 'maxMarks', header: 'Max', align: 'right' },
    { key: 'grade', header: 'Grade', align: 'center', render: (r) => (r.grade ? <span className="chip bg-slate-100 text-slate-700">{r.grade}</span> : <span className="text-slate-400">—</span>) },
    { key: 'gradePoints', header: 'Points', align: 'right', render: (r) => num(r.gradePoints, 1) },
    { key: 'isPass', header: 'Result', render: (r) => (r.isAbsent ? <StatusBadge value="ABSENT" /> : r.isPass === null ? <span className="text-slate-400">—</span> : <StatusBadge value={r.isPass ? 'PASS' : 'FAILED'} />) },
    {
      key: 'actions', header: '', align: 'right',
      render: (r) => (
        <button
          type="button"
          className="btn-secondary btn-xs"
          disabled={busy || (draft[r.registrationId] === undefined && absent[r.registrationId] === undefined)}
          onClick={() => saveOne(r)}
        ><Save className="h-3.5 w-3.5" /> Save</button>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Marks entry"
        subtitle="Edit marks straight in the grid. Grades and pass/fail are calculated by the database, never by the browser."
        icon={<PenLine className="h-5 w-5" />}
        actions={
          <>
            <button type="button" className="btn-secondary btn-sm" onClick={saveAll} disabled={busy || !rows.length}>Save all pending</button>
            <button type="button" className="btn-primary btn-sm" onClick={process} disabled={busy || !examId}><Zap className="h-4 w-4" /> Process results</button>
          </>
        }
      />

      <Card className="mb-4">
        <div className="p-4">
          <SelectField
            label="Examination"
            placeholder="Select an examination"
            value={examId}
            onChange={(e) => { setExamId(e.target.value); setDraft({}); setAbsent({}); }}
            options={(exams.data ?? []).map((x) => ({ value: x.exam_id, label: `${x.exam_code} — ${x.name}` }))}
          />
        </div>
      </Card>

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Registered students" value={num(rows.length)} />
        <StatCard label="Marks entered" value={num(marked)} tone="sky" hint={rows.length ? `${pct((marked / rows.length) * 100, 0)} complete` : undefined} />
        <StatCard label="Passed" value={num(passCount)} tone="emerald" />
        <StatCard label="Failed" value={num(failCount)} tone="rose" />
      </div>

      <Card>
        {!examId ? (
          <EmptyState title="Pick an examination" hint="The marks sheet lists every registered student for that exam." />
        ) : sheet.error ? (
          <ErrorBox message={sheet.error} onRetry={sheet.reload} />
        ) : (
          <DataTable columns={columns} rows={rows} loading={sheet.loading} rowKey={(r) => r.registrationId} empty="No students registered for this examination" />
        )}
      </Card>

      <Card className="card-pad mt-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Grade scale in force</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {(grades.data ?? []).map((g) => (
            <span key={g.grade_code} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs">
              <b className="text-slate-800">{g.grade_code}</b>{' '}
              <span className="text-slate-500">{g.grade_label} · {num(g.min_percentage, 0)}–{num(g.max_percentage, 0)}% · {num(g.grade_points, 1)} pts</span>
            </span>
          ))}
        </div>
        <p className="mt-3 text-xs text-slate-400">
          Grades come from the <code className="rounded bg-slate-200 px-1">grades</code> table and are applied by a
          database trigger when marks are written — {titleCase('this screen only collects the raw marks')}.
        </p>
      </Card>
    </>
  );
}
