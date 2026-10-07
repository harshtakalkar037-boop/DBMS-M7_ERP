import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { BrainCircuit, Play, Trophy } from 'lucide-react';
import { api, errMsg } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useToast } from '../../components/toast';
import { Card, PageHeader, Tabs, SelectField, DataTable, ProgressBar, ErrorBox, Modal, Field, EmptyState, useFetch, type Column } from '../../components/ui';
import { dateTimeStr, pct, titleCase } from '../../lib/format';
interface BankStat { subjectId: number; subjectCode: string; subjectName: string; questions: number; easy: string; medium: string; hard: string; }
interface Attempt {
  attempt_id?: number; examId?: number; subjectCode?: string; subjectName?: string;
  totalQuestions?: number; correctAnswers?: number; score?: string; percentage?: string;
  startedAt?: string; submittedAt?: string; status?: string;
}
interface StatsRow { subjectCode: string; subjectName: string; attempts: number; averagePercentage: string; bestPercentage: string; lastAttempt: string; }
interface LeaderRow { studentId: number; rollNumber: string; studentName: string; attempts: number; averagePercentage: string; }

export default function MockExamsPage() {
  const { has } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [tab, setTab] = useState('bank');
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ subjectId: '', difficulty: 'MIXED', count: '10', duration: '15' });

  const bank = useFetch(() => api.get<BankStat[]>('/mock-exams/bank/stats'), []);
  const mine = useFetch(() => (has('STUDENT') ? api.get<Attempt[]>('/mock-exams/attempts/me', { limit: 100 }) : Promise.resolve([])), [has]);
  const stats = useFetch(() => (has('STUDENT') ? api.get<StatsRow[]>('/mock-exams/attempts/stats/me') : Promise.resolve([])), [has]);
  const board = useFetch(() => api.get<LeaderRow[]>('/mock-exams/attempts/leaderboard', { limit: 50 }), []);

  const start = async () => {
    if (!form.subjectId) { toast.error('Choose a subject first.'); return; }
    setBusy(true);
    try {
      const res = await api.post<{ examId: number }>('/mock-exams/attempts', {
        subjectId: Number(form.subjectId),
        difficulty: form.difficulty,
        count: Number(form.count),
        duration: Number(form.duration),
      });
      setOpen(false);
      navigate(`/mock-exams/attempts/${res.examId}`);
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };

  const bankCols: Column<BankStat>[] = [
    { key: 'subjectCode', header: 'Code', render: (r) => <span className="font-medium text-slate-800">{r.subjectCode}</span> },
    { key: 'subjectName', header: 'Subject' },
    { key: 'questions', header: 'Questions', align: 'right' },
    { key: 'easy', header: 'Easy', align: 'right' },
    { key: 'medium', header: 'Medium', align: 'right' },
    { key: 'hard', header: 'Hard', align: 'right' },
    {
      key: 'actions', header: '', align: 'right',
      render: (r) => (has('STUDENT') ? (
        <button type="button" className="btn-primary btn-xs" onClick={() => { setForm({ ...form, subjectId: String(r.subjectId) }); setOpen(true); }}>
          <Play className="h-3.5 w-3.5" /> Start test
        </button>
      ) : null),
    },
  ];

  const myCols: Column<Attempt>[] = [
    { key: 'subjectCode', header: 'Subject', render: (r) => <span className="font-medium text-slate-800">{r.subjectCode}</span> },
    { key: 'subjectName', header: 'Name' },
    { key: 'totalQuestions', header: 'Questions', align: 'right' },
    { key: 'correctAnswers', header: 'Correct', align: 'right' },
    { key: 'percentage', header: 'Score', render: (r) => (
      <div className="flex w-36 items-center gap-2">
        <ProgressBar value={Number(r.percentage)} />
        <span className="w-12 shrink-0 text-right text-xs">{pct(r.percentage, 0)}</span>
      </div>
    ) },
    { key: 'startedAt', header: 'Started', render: (r) => dateTimeStr(r.startedAt) },
    {
      key: 'actions', header: '', align: 'right',
      render: (r) => (r.examId ? <Link to={`/mock-exams/attempts/${r.examId}`} className="btn-secondary btn-xs">Review</Link> : null),
    },
  ];

  const statCols: Column<StatsRow>[] = [
    { key: 'subjectCode', header: 'Subject' },
    { key: 'subjectName', header: 'Name' },
    { key: 'attempts', header: 'Attempts', align: 'right' },
    { key: 'averagePercentage', header: 'Average', render: (r) => (
      <div className="flex w-36 items-center gap-2">
        <ProgressBar value={Number(r.averagePercentage)} />
        <span className="w-12 shrink-0 text-right text-xs">{pct(r.averagePercentage, 0)}</span>
      </div>
    ) },
    { key: 'bestPercentage', header: 'Best', align: 'right', render: (r) => pct(r.bestPercentage, 0) },
    { key: 'lastAttempt', header: 'Last attempt', render: (r) => dateTimeStr(r.lastAttempt) },
  ];

  const boardCols: Column<LeaderRow>[] = [
    { key: 'rank', header: '#', align: 'right', render: (_r: LeaderRow, i: number) => `#${i + 1}` },
    { key: 'rollNumber', header: 'Roll no.', render: (r) => <span className="font-medium text-slate-800">{r.rollNumber}</span> },
    { key: 'studentName', header: 'Student' },
    { key: 'attempts', header: 'Attempts', align: 'right' },
    { key: 'averagePercentage', header: 'Average', align: 'right', render: (r) => pct(r.averagePercentage, 1) },
  ];

  return (
    <>
      <PageHeader
        title="Mock test engine"
        subtitle="Timed practice tests drawn from the question bank, auto-graded, with explanations on review."
        icon={<BrainCircuit className="h-5 w-5" />}
        actions={has('STUDENT') ? <button type="button" className="btn-primary btn-sm" onClick={() => setOpen(true)}><Play className="h-4 w-4" /> Start a mock test</button> : null}
      />

      <Tabs
        active={tab}
        onChange={setTab}
        tabs={[
          { key: 'bank', label: 'Question bank' },
          ...(has('STUDENT') ? [{ key: 'mine', label: 'My attempts' }, { key: 'stats', label: 'My performance' }] : []),
          { key: 'leaderboard', label: 'Leaderboard' },
        ]}
      />

      {tab === 'bank' ? (
        <Card>
          {bank.error ? <ErrorBox message={bank.error} onRetry={bank.reload} /> : (
            <DataTable columns={bankCols} rows={bank.data ?? []} loading={bank.loading} rowKey={(r) => r.subjectId} empty="Question bank is empty" />
          )}
        </Card>
      ) : null}

      {tab === 'mine' ? (
        <Card>
          {mine.error ? <ErrorBox message={mine.error} onRetry={mine.reload} /> : (
            (mine.data ?? []).length
              ? <DataTable columns={myCols} rows={mine.data!} rowKey={(r) => r.examId ?? r.attempt_id ?? Math.random()} />
              : <EmptyState title="No attempts yet" hint="Start a practice test from the question bank tab." />
          )}
        </Card>
      ) : null}

      {tab === 'stats' ? (
        <Card>
          {(stats.data ?? []).length
            ? <DataTable columns={statCols} rows={stats.data!} rowKey={(r) => r.subjectCode} />
            : <EmptyState title="No performance data yet" />}
        </Card>
      ) : null}

      {tab === 'leaderboard' ? (
        <Card>
          <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-3">
            <Trophy className="h-4 w-4 text-amber-500" />
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Top performers</h2>
          </div>
          {board.error ? <ErrorBox message={board.error} onRetry={board.reload} /> : (
            <DataTable columns={boardCols} rows={board.data ?? []} loading={board.loading} rowKey={(r) => r.studentId} empty="No attempts recorded yet" />
          )}
        </Card>
      ) : null}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Start a mock test"
        size="sm"
        footer={
          <>
            <button type="button" className="btn-secondary btn-sm" onClick={() => setOpen(false)}>Cancel</button>
            <button type="button" className="btn-primary btn-sm" onClick={start} disabled={busy || !form.subjectId}>{busy ? 'Preparing…' : 'Start'}</button>
          </>
        }
      >
        <SelectField
          label="Subject" placeholder="Select a subject"
          value={form.subjectId}
          onChange={(e) => setForm({ ...form, subjectId: e.target.value })}
          options={(bank.data ?? []).map((b) => ({ value: b.subjectId, label: `${b.subjectCode} — ${b.subjectName} (${b.questions} questions)` }))}
        />
        <SelectField label="Difficulty" value={form.difficulty} onChange={(e) => setForm({ ...form, difficulty: e.target.value })} options={['EASY', 'MEDIUM', 'HARD', 'MIXED'].map((d) => ({ value: d, label: titleCase(d) }))} />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Questions" type="number" min={1} max={50} value={form.count} onChange={(e) => setForm({ ...form, count: e.target.value })} />
          <Field label="Duration (minutes)" type="number" min={1} max={180} value={form.duration} onChange={(e) => setForm({ ...form, duration: e.target.value })} />
        </div>
        <p className="text-xs text-slate-500">
          Questions are picked at random and stored against the attempt, so the paper is fixed once you start.
        </p>
      </Modal>
    </>
  );
}
