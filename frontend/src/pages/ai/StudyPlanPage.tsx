import { useState } from 'react';
import { Lightbulb, RefreshCw, AlertTriangle } from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useToast } from '../../components/toast';
import { Card, PageHeader, StatCard, SelectField, Loading, ErrorBox, Badge, EmptyState, useFetch } from '../../components/ui';
import { dateStr, num } from '../../lib/format';
interface PlanItem { area: string; priority: 'HIGH' | 'MEDIUM' | 'LOW'; issue: string; action: string; metric: string; }
interface PlanResponse {
  reply: string;
  source: 'LOCAL_ENGINE' | 'LLM';
  data: { riskScore: number; validUntil: string; items: PlanItem[] };
  generatedAt: string;
}

const PRIORITY_TONE: Record<string, string> = {
  HIGH: 'bg-rose-100 text-rose-700',
  MEDIUM: 'bg-amber-100 text-amber-700',
  LOW: 'bg-sky-100 text-sky-700',
};

export default function StudyPlanPage() {
  const { user } = useAuth();
  const toast = useToast();
  const [studentId, setStudentId] = useState('');
  const students = useFetch(() => api.get<{ student_id: number; roll_number: string; full_name: string }[]>('/students', { limit: 500 }), []);

  const key = user?.role === 'STUDENT' ? 'me' : (studentId || 'me');
  const { data, loading, error, reload } = useFetch<PlanResponse>(
    () => api.get<PlanResponse>('/ai/study-plan', user?.role === 'STUDENT' ? undefined : (studentId ? { studentId: Number(studentId) } : undefined)),
    [key],
  );

  const plan = data?.data;
  const items = plan?.items ?? [];

  return (
    <>
      <PageHeader
        title="Personalised study plan"
        subtitle="Generated from your live attendance, marks, backlogs, dues and mock-test scores."
        icon={<Lightbulb className="h-5 w-5" />}
        actions={
          <button type="button" className="btn-secondary btn-sm" onClick={() => { reload(); toast.info('Plan regenerated from the latest data.'); }} disabled={loading}>
            <RefreshCw className="h-4 w-4" /> Regenerate
          </button>
        }
      />

      {user?.role !== 'STUDENT' ? (
        <Card className="mb-4">
          <div className="p-4">
            <SelectField
              label="Student"
              placeholder="Myself (uses your own record)"
              value={studentId}
              onChange={(e) => setStudentId(e.target.value)}
              options={(students.data ?? []).map((s) => ({ value: s.student_id, label: `${s.roll_number} · ${s.full_name}` }))}
            />
          </div>
        </Card>
      ) : null}

      {loading ? <Loading label="Building your study plan…" /> : error ? <ErrorBox message={error} onRetry={reload} /> : !plan ? (
        <Card><EmptyState title="No plan generated" /></Card>
      ) : (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard
              label="Risk score"
              value={num(plan.riskScore)}
              tone={Number(plan.riskScore) >= 70 ? 'rose' : Number(plan.riskScore) >= 40 ? 'amber' : 'emerald'}
              icon={<AlertTriangle className="h-5 w-5" />}
              hint="0 = safe, 100 = critical"
            />
            <StatCard label="Focus areas" value={num(items.length)} tone="brand" />
            <StatCard label="High priority" value={num(items.filter((i) => i.priority === 'HIGH').length)} tone="rose" />
            <StatCard label="Valid until" value={plan.validUntil ? dateStr(plan.validUntil) : '—'} tone="slate" />
          </div>

          <Card className="card-pad mb-4">
            <p className="text-sm leading-relaxed text-slate-700">{data?.reply}</p>
            <p className="mt-2 text-[11px] uppercase tracking-wide text-slate-400">
              Source: {data?.source === 'LLM' ? 'language model' : 'local rule engine'} · generated {dateStr(data?.generatedAt)}
            </p>
          </Card>

          <div className="space-y-3">
            {items.map((item, i) => (
              <Card key={`${item.area}-${i}`} className="card-pad">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`chip ${PRIORITY_TONE[item.priority] ?? 'bg-slate-100 text-slate-600'}`}>{item.priority}</span>
                      <span className="chip bg-slate-100 text-slate-600">{item.area}</span>
                    </div>
                    <p className="mt-2 text-sm font-medium text-slate-800">{item.issue}</p>
                  </div>
                  <Badge className="bg-slate-100 text-slate-600">{item.metric}</Badge>
                </div>
                <p className="mt-2 rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-900">
                  <b>Suggested action:</b> {item.action}
                </p>
              </Card>
            ))}
            {!items.length ? (
              <Card className="card-pad">
                <p className="text-sm text-slate-600">
                  No improvement areas were found — your attendance, marks, fees and backlogs are all within the safe
                  band. Keep it up.
                </p>
              </Card>
            ) : null}
          </div>

          <p className="mt-3 text-xs text-slate-400">
            Weights come from the same risk model the database uses in
            {' '}<code className="rounded bg-slate-200 px-1">sp_compute_student_risk</code>, so the plan and the
            at-risk list can never disagree.
          </p>
        </>
      )}
    </>
  );
}
