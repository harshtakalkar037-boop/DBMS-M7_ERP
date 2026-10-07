import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, Send, Timer, XCircle } from 'lucide-react';
import { api, errMsg } from '../../lib/api';
import { useToast } from '../../components/toast';
import { Card, PageHeader, StatCard, Loading, ErrorBox, useFetch } from '../../components/ui';
import { num, pct, titleCase } from '../../lib/format';
interface Question {
  answerId: number; questionId: number; questionText: string;
  optionA: string; optionB: string; optionC: string; optionD: string;
  marks: number; difficulty: string; selectedOption: string | null;
}
interface Paper {
  examId: number; durationMinutes: number; totalQuestions: number;
  questions: Question[]; subjectCode?: string; subjectName?: string;
  startedAt?: string; status?: string;
}
interface ReviewQuestion extends Question {
  correctOption: string; explanation: string; isCorrect: boolean; topic: string;
}
interface Review {
  examId: number; score: string; maxScore: string; percentage: string;
  correctAnswers: number; totalQuestions: number; durationMinutes: number;
  questions: ReviewQuestion[];
}

const OPTIONS = ['A', 'B', 'C', 'D'] as const;

export default function MockAttemptPage() {
  const { id } = useParams<{ id: string }>();
  const toast = useToast();

  const paper = useFetch<Paper>(() => api.get<Paper>(`/mock-exams/attempts/${id}`), [id]);
  const review = useFetch<Review | null>(() => api.get<Review>(`/mock-exams/attempts/${id}/review`), [id]);

  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [submitted, setSubmitted] = useState(false);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!paper.data) return;
    const initial: Record<number, string> = {};
    for (const q of paper.data.questions) if (q.selectedOption) initial[q.answerId] = q.selectedOption;
    setAnswers(initial);
    setRemaining(paper.data.durationMinutes * 60);
  }, [paper.data]);

  const isFinished = submitted || !!review.data;

  useEffect(() => {
    if (isFinished || remaining === null) return;
    if (remaining <= 0) { submit(); return; }
    const t = window.setInterval(() => setRemaining((r) => (r === null ? null : r - 1)), 1000);
    return () => window.clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remaining, isFinished]);

  const choose = async (answerId: number, option: string) => {
    setAnswers((a) => ({ ...a, [answerId]: option }));
    try {
      await api.post(`/mock-exams/attempts/${id}/answer`, { answerId, option });
    } catch (e) { toast.error(errMsg(e)); }
  };

  const submit = async () => {
    if (busy || isFinished) return;
    setBusy(true);
    try {
      const res = await api.post<{ score?: string; percentage?: string; message?: string }>(`/mock-exams/attempts/${id}/submit`);
      toast.success(res.message ?? `Scored ${num(res.percentage, 0)}%`);
      setSubmitted(true);
      review.reload();
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };

  const answered = useMemo(() => Object.keys(answers).length, [answers]);

  const mm = remaining === null ? '--' : String(Math.floor(remaining / 60)).padStart(2, '0');
  const ss = remaining === null ? '--' : String(remaining % 60).padStart(2, '0');

  if (paper.loading) return <Loading label="Preparing your paper…" />;
  if (paper.error) return <ErrorBox message={paper.error} onRetry={paper.reload} />;
  if (!paper.data) return null;

  const q = paper.data.questions;
  const data = review.data;

  if (isFinished && data) {
    return (
      <>
        <Link to="/mock-exams" className="mb-3 inline-flex items-center gap-1 text-sm text-brand-700 hover:underline">
          <ArrowLeft className="h-4 w-4" /> Back to mock tests
        </Link>
        <PageHeader title="Test review" subtitle="Every question with the correct answer and explanation." />

        <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label="Score" value={`${num(data.score, 1)} / ${num(data.maxScore, 1)}`} tone="brand" />
          <StatCard label="Percentage" value={pct(data.percentage, 1)} tone={Number(data.percentage) >= 50 ? 'emerald' : 'rose'} />
          <StatCard label="Correct" value={`${num(data.correctAnswers)} / ${num(data.totalQuestions)}`} tone="sky" />
          <StatCard label="Duration" value={`${num(data.durationMinutes)} min`} tone="slate" />
        </div>

        <div className="space-y-3">
          {data.questions.map((item, i) => (
            <Card key={item.answerId} className="card-pad">
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm font-medium text-slate-800">
                  {i + 1}. {item.questionText}
                </p>
                <span className={`chip shrink-0 ${item.isCorrect ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                  {item.isCorrect ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />} {item.isCorrect ? 'Correct' : 'Wrong'}
                </span>
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {OPTIONS.map((opt) => {
                  const text = String((item as unknown as Record<string, string>)[`option${opt}`] ?? '');
                  const isCorrect = item.correctOption === opt;
                  const picked = item.selectedOption === opt;
                  return (
                    <div
                      key={opt}
                      className={`rounded-lg border px-3 py-2 text-sm ${
                        isCorrect ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                          : picked ? 'border-rose-300 bg-rose-50 text-rose-800'
                            : 'border-slate-200 bg-white text-slate-700'
                      }`}
                    >
                      <b>{opt}.</b> {text}
                      {isCorrect ? <span className="ml-1 text-xs font-semibold text-emerald-600">(correct)</span> : null}
                      {picked && !isCorrect ? <span className="ml-1 text-xs font-semibold text-rose-600">(your answer)</span> : null}
                    </div>
                  );
                })}
              </div>
              {item.explanation ? (
                <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
                  <b>Explanation:</b> {item.explanation}
                </p>
              ) : null}
              <p className="mt-2 text-[11px] text-slate-400">{titleCase(item.difficulty)} · {item.marks} mark{item.marks === 1 ? '' : 's'}{item.topic ? ` · ${item.topic}` : ''}</p>
            </Card>
          ))}
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Mock test in progress"
        subtitle={`${num(paper.data.totalQuestions)} questions · ${num(paper.data.durationMinutes)} minutes`}
        actions={
          <div className="flex items-center gap-2">
            <span className={`chip text-sm ${remaining !== null && remaining < 60 ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-700'}`}>
              <Timer className="h-3.5 w-3.5" /> {mm}:{ss}
            </span>
            <button type="button" className="btn-primary btn-sm" onClick={submit} disabled={busy}>
              <Send className="h-4 w-4" /> {busy ? 'Submitting…' : 'Submit test'}
            </button>
          </div>
        }
      />

      <Card className="card-pad mb-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-slate-600">
            Answered <b className="text-slate-900">{answered}</b> of <b className="text-slate-900">{q.length}</b>
          </p>
          <div className="flex flex-wrap gap-1.5">
            {q.map((item, i) => (
              <button
                key={item.answerId}
                type="button"
                onClick={() => document.getElementById(`q-${item.answerId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
                className={`h-8 w-8 rounded-lg border text-xs font-semibold transition ${
                  answers[item.answerId] ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-slate-300 bg-white text-slate-500'
                }`}
              >
                {i + 1}
              </button>
            ))}
          </div>
        </div>
      </Card>

      <div className="space-y-3">
        {q.map((item, i) => (
          <div key={item.answerId} id={`q-${item.answerId}`}>
          <Card className="card-pad">
            <p className="text-sm font-medium text-slate-800">{i + 1}. {item.questionText}</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {OPTIONS.map((opt) => {
                const text = String((item as unknown as Record<string, string>)[`option${opt}`] ?? '');
                const picked = answers[item.answerId] === opt;
                return (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => choose(item.answerId, opt)}
                    className={`rounded-lg border px-3 py-2 text-left text-sm transition ${
                      picked ? 'border-brand-500 bg-brand-50 text-brand-900 ring-1 ring-brand-300' : 'border-slate-200 bg-white text-slate-700 hover:border-brand-300 hover:bg-brand-50/40'
                    }`}
                  >
                    <b>{opt}.</b> {text}
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-[11px] text-slate-400">{titleCase(item.difficulty)} · {item.marks} mark{item.marks === 1 ? '' : 's'}</p>
          </Card>
          </div>
        ))}
      </div>

      <div className="mt-4 flex justify-end">
        <button type="button" className="btn-primary" onClick={submit} disabled={busy}>
          <Send className="h-4 w-4" /> {busy ? 'Submitting…' : 'Submit test'}
        </button>
      </div>
    </>
  );
}
