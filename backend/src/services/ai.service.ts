import { env } from '../config/env';
import { aiRepo } from '../repositories/ai.repository';
import { audit } from '../utils/audit';
import { AppError } from '../utils/api';
import { AuthUser } from '../middleware/auth';
import { logger } from '../utils/logger';

/**
 * ============================================================================
 *  AI FEATURES - ISOLATED AND HONEST
 * ============================================================================
 *
 * Two interchangeable engines live behind one interface:
 *
 *  1. LOCAL_ENGINE (default, always available)
 *     A deterministic rule-based advisor. It reads the student's real
 *     attendance, marks, fees, backlogs and mock-test scores out of MySQL and
 *     turns them into advice using explicit if/then rules and weighted scoring.
 *     THIS IS NOT A LANGUAGE MODEL. It does not generate free text, it does not
 *     guess, and it never invents a number. Every sentence it produces contains
 *     a value that was read from the database.
 *
 *  2. LLM (opt-in)
 *     Only used when AI_MODE=llm AND OPENAI_API_KEY is set. The same real facts
 *     are sent to the model as a structured context block, with a system prompt
 *     that forbids inventing data. If the call fails for any reason we fall back
 *     to the local engine rather than showing an error.
 *
 * Every response carries `source` so the UI can label it truthfully.
 */

export interface AiResponse {
  reply: string;
  source: 'LOCAL_ENGINE' | 'LLM';
  data?: unknown;
  generatedAt: string;
}

export interface PlanItem {
  area: string;
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  issue: string;
  action: string;
  metric: string;
}

/* --------------------------------------------------------------- local engine */

/**
 * Rule based planner. Weights come from the risk model that `sp_compute_student_risk`
 * uses in the database, so the UI and the DB never disagree.
 */
function buildPlan(ctx: Awaited<ReturnType<typeof aiRepo.studentContext>>): {
  items: PlanItem[];
  summary: string;
  score: number;
} {
  const items: PlanItem[] = [];
  const profile = ctx.profile as Record<string, any> | null;
  const fees = ctx.fees as Record<string, any> | null;
  const results = ctx.results as Record<string, any> | null;

  /* ---- Rule 1: attendance below the university threshold is always critical */
  const weak = (ctx.attendance as Record<string, any>[])
    .filter((a) => Number(a.percentage) < 75)
    .sort((a, b) => Number(a.percentage) - Number(b.percentage));

  for (const a of weak.slice(0, 3)) {
    const pct = Number(a.percentage);
    const total = Number(a.totalClasses ?? a.total_classes ?? 0);
    const attended = Number(a.attended ?? a.attended_classes ?? 0);
    // How many consecutive classes are needed to climb back over 75%.
    const needed = total > 0 ? Math.max(0, Math.ceil(0.75 * total - attended) / 0.25) : 0;
    items.push({
      area: 'Attendance',
      priority: pct < 60 ? 'HIGH' : 'MEDIUM',
      issue: `${a.subjectCode} attendance is ${pct}% (${attended}/${total} classes), below the required 75%.`,
      action: `Attend the next ${Math.ceil(needed)} consecutive ${a.subjectCode} classes without missing one to cross 75%.`,
      metric: `${pct}% / 75%`,
    });
  }

  /* ---- Rule 2: subjects with a low average mark or a failing grade */
  const bySubject = new Map<string, { total: number; max: number; n: number; fails: number }>();
  for (const m of ctx.exams as Record<string, any>[]) {
    const key = m.subjectCode;
    const cur = bySubject.get(key) ?? { total: 0, max: 0, n: 0, fails: 0 };
    cur.total += Number(m.marks ?? 0);
    cur.max += Number(m.maxMarks ?? 0);
    cur.n += 1;
    if (m.isPass === false || Number(m.isPass) === 0) cur.fails += 1;
    bySubject.set(key, cur);
  }
  const weakSubjects = [...bySubject.entries()]
    .map(([code, v]) => ({ code, avg: v.max ? (100 * v.total) / v.max : 0, fails: v.fails, n: v.n }))
    .filter((s) => s.avg < 60 || s.fails > 0)
    .sort((a, b) => a.avg - b.avg);

  for (const s of weakSubjects.slice(0, 3)) {
    items.push({
      area: 'Academics',
      priority: s.fails > 0 ? 'HIGH' : 'MEDIUM',
      issue: s.fails > 0
        ? `${s.code}: failed ${s.fails} of ${s.n} assessments (average ${s.avg.toFixed(1)}%).`
        : `${s.code}: average ${s.avg.toFixed(1)}% across ${s.n} assessments.`,
      action: `Revise ${s.code} using the mock test bank for that subject, target 3 practice attempts this week, and clear doubts with the subject faculty.`,
      metric: `avg ${s.avg.toFixed(1)}%${s.fails ? `, ${s.fails} fail(s)` : ''}`,
    });
  }

  /* ---- Rule 3: mock test performance highlights the weakest topics */
  for (const m of (ctx.mock as Record<string, any>[]).slice(0, 2)) {
    if (Number(m.averagePercentage) < 60) {
      items.push({
        area: 'Practice',
        priority: 'MEDIUM',
        issue: `Mock tests in ${m.subjectCode} average ${m.averagePercentage}% over ${m.attempts} attempts.`,
        action: `Attempt one ${m.subjectCode} mock test per day for a week and re-read the explanations of every wrong answer.`,
        metric: `${m.averagePercentage}% over ${m.attempts} attempts`,
      });
    }
  }

  /* ---- Rule 4: backlogs */
  const backlogs = Number(results?.backlogs ?? 0);
  if (backlogs > 0) {
    items.push({
      area: 'Backlogs',
      priority: 'HIGH',
      issue: `You are carrying ${backlogs} backlog(s).`,
      action: 'Register for the backlog examination for these subjects in the next exam cycle.',
      metric: `${backlogs} backlog(s)`,
    });
  }

  /* ---- Rule 5: pending dues block hall tickets in most Indian universities */
  const due = Number(fees?.total_due ?? 0);
  if (due > 0) {
    items.push({
      area: 'Fees',
      priority: due > 20000 ? 'HIGH' : 'LOW',
      issue: `Outstanding dues of INR ${due.toLocaleString('en-IN')}.`,
      action: 'Clear the outstanding amount before the next due date to avoid late fees and a hall-ticket hold.',
      metric: `INR ${due.toLocaleString('en-IN')}`,
    });
  }

  /* ---- Nothing wrong? Say so instead of inventing advice. */
  if (!items.length) {
    return {
      items: [],
      summary: `${profile?.full_name ?? 'This student'} is on track: attendance is at or above 75% in every subject, no backlogs, no pending dues and assessment averages are 60% or better. Keep the current routine up.`,
      score: 0,
    };
  }

  const weight: Record<PlanItem['priority'], number> = { HIGH: 3, MEDIUM: 2, LOW: 1 };
  const score = Math.round(
    Math.min(100, items.reduce((sum, i) => sum + weight[i.priority] * 8, 0)),
  );

  const top = items.find((i) => i.priority === 'HIGH') ?? items[0];
  return {
    items,
    summary: `${items.length} improvement area(s) found from live data. Start with ${top.area.toLowerCase()}: ${top.issue}`,
    score,
  };
}

/** Rule-based chat: maps an intent to a real query, never to invented prose. */
function answerLocally(question: string, ctx: Awaited<ReturnType<typeof aiRepo.studentContext>>): string {
  const q = question.toLowerCase();
  const profile = ctx.profile as Record<string, any> | null;
  const fees = ctx.fees as Record<string, any> | null;
  const results = ctx.results as Record<string, any> | null;

  if (/(attendance|absent|present|class)/.test(q)) {
    const rows = ctx.attendance as Record<string, any>[];
    if (!rows.length) return 'No attendance has been recorded for you yet.';
    const overall = rows.reduce((s, r) => s + Number(r.percentage), 0) / rows.length;
    const low = rows.filter((r) => Number(r.percentage) < 75);
    return `Your average attendance is ${overall.toFixed(2)}% across ${rows.length} subjects.`
      + (low.length
        ? ` ${low.length} subject(s) are below 75%: ${low.map((r) => `${r.subjectCode} (${r.percentage}%)`).join(', ')}.`
        : ' Every subject is at or above the required 75%.');
  }

  if (/(fee|dues|payment|outstanding|bill)/.test(q)) {
    if (!fees) return 'No fee records were found for you.';
    return `Total billed INR ${Number(fees.total_billed ?? 0).toLocaleString('en-IN')}, paid INR ${Number(fees.total_paid ?? 0).toLocaleString('en-IN')}, outstanding INR ${Number(fees.total_due ?? 0).toLocaleString('en-IN')}. Status: ${fees.overall_fee_status}.`
      + (fees.next_due_date ? ` Next due date: ${fees.next_due_date}.` : '');
  }

  if (/(cgpa|sgpa|grade|marks|result|backlog)/.test(q)) {
    const r = results ?? {};
    return `Your latest CGPA is ${r.latestCgpa ?? 'not available yet'} with an average SGPA of ${r.averageSgpa ?? 'n/a'} and ${r.backlogs ?? 0} backlog(s).`;
  }

  if (/(mock|practice|test|quiz)/.test(q)) {
    const rows = ctx.mock as Record<string, any>[];
    if (!rows.length) return 'You have not submitted any mock tests yet. Open Practice Tests to start one.';
    return rows.map((m) => `${m.subjectCode}: ${m.averagePercentage}% over ${m.attempts} attempt(s)`).join('. ') + '.';
  }

  if (/(impro|plan|study|advice|weak|help)/.test(q)) {
    const plan = buildPlan(ctx);
    return `${plan.summary} ${plan.items.slice(0, 3).map((i) => `[${i.priority}] ${i.action}`).join(' ')}`;
  }

  return 'I can answer questions about your attendance, fees, results, backlogs, mock test performance and study plan. Ask me one of those.';
}

/* ----------------------------------------------------------------- LLM adapter */

interface LlmTurn { role: 'user' | 'assistant'; content: string }

async function callLlm(system: string, turns: LlmTurn[]): Promise<string | null> {
  if (!env.ai.llmEnabled) return null;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.ai.apiKey}`,
      },
      body: JSON.stringify({
        model: env.ai.model,
        temperature: 0.2,
        messages: [{ role: 'system', content: system }, ...turns],
      }),
    });
    clearTimeout(timer);
    if (!res.ok) {
      logger.warn(`LLM call failed with HTTP ${res.status}, falling back to the local engine`);
      return null;
    }
    const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    return json.choices?.[0]?.message?.content ?? null;
  } catch (err) {
    logger.warn(`LLM call threw (${(err as Error).message}), falling back to the local engine`);
    return null;
  }
}

const SYSTEM_PROMPT = [
  'You are the academic assistant inside a university ERP system.',
  'You are given a JSON block of REAL facts about one student, taken directly from the database.',
  'Rules you must never break:',
  ' 1. Use only the numbers in the facts block. If something is not there, say you do not have it.',
  ' 2. Never invent a mark, percentage, date, fee amount or name.',
  ' 3. Be concise: at most 120 words, plain text, no markdown tables.',
  ' 4. If the student is at risk, name the single most urgent action first.',
].join('\n');

/* -------------------------------------------------------------------- service */

export const ai = {
  /** Which engine will be used - surfaced in the UI so nothing is misrepresented. */
  engine: () => ({
    mode: env.ai.mode,
    llmEnabled: env.ai.llmEnabled,
    model: env.ai.llmEnabled ? env.ai.model : null,
    engine: env.ai.llmEnabled ? 'LLM' : 'LOCAL_ENGINE',
    note: env.ai.llmEnabled
      ? 'OpenAI is configured, so replies are generated by the language model using your real records as context.'
      : 'No API key is configured. Replies come from the local rule-based engine: deterministic, database-driven, and not a language model.',
  }),

  history: (userId: number, sessionId?: string) => aiRepo.history(userId, sessionId),
  sessions: (userId: number) => aiRepo.sessions(userId),

  /**
   * Chat. For students the context is always their own record; an advisor may
   * pass `studentId` explicitly (and RBAC in the controller decides who may).
   */
  async chat(message: string, sessionId: string, actor: AuthUser, studentId?: number): Promise<AiResponse> {
    const targetStudentId = actor.role === 'STUDENT' ? actor.studentId : (studentId ?? null);
    if (!targetStudentId) {
      throw AppError.badRequest('The assistant needs a student context. Sign in as a student, or pass a studentId.');
    }

    const ctx = await aiRepo.studentContext(Number(targetStudentId));
    await aiRepo.appendMessage(actor.userId, sessionId, 'USER', message, 'LOCAL_ENGINE');

    let reply = '';
    let source: 'LOCAL_ENGINE' | 'LLM' = 'LOCAL_ENGINE';

    if (env.ai.llmEnabled) {
      const facts = JSON.stringify(ctx).slice(0, 6000);
      const past = (await aiRepo.history(actor.userId, sessionId, 8)).reverse();
      const turns: LlmTurn[] = [
        ...past.map((t) => ({ role: String(t.role) === 'USER' ? 'user' as const : 'assistant' as const, content: String(t.message) })),
        { role: 'user', content: `FACTS:\n${facts}\n\nQUESTION: ${message}` },
      ];
      const llmReply = await callLlm(SYSTEM_PROMPT, turns);
      if (llmReply) { reply = llmReply; source = 'LLM'; }
    }
    if (!reply) reply = answerLocally(message, ctx);

    await aiRepo.appendMessage(actor.userId, sessionId, 'ASSISTANT', reply, source);
    await audit({
      userId: actor.userId, action: 'SYSTEM', entity: 'ai_conversations',
      description: `AI chat answered by ${source}`,
    });
    return { reply, source, generatedAt: new Date().toISOString() };
  },

  /**
   * Study plan. The plan is a structured object, so the UI can render checkboxes
   * instead of pretending to parse prose.
   */
  async studyPlan(actor: AuthUser, studentId?: number): Promise<AiResponse & { data: unknown }> {
    const target = actor.role === 'STUDENT' ? actor.studentId : (studentId ?? null);
    if (!target) throw AppError.badRequest('A student context is required to build a study plan');

    const ctx = await aiRepo.studentContext(Number(target));
    const plan = buildPlan(ctx);

    let narrative = plan.summary;
    let source: 'LOCAL_ENGINE' | 'LLM' = 'LOCAL_ENGINE';
    if (env.ai.llmEnabled) {
      const llm = await callLlm(SYSTEM_PROMPT, [{
        role: 'user',
        content: `FACTS:\n${JSON.stringify({ ctx, plan }).slice(0, 6000)}\n\nQUESTION: Summarise this study plan in 80 words, most urgent action first.`,
      }]);
      if (llm) { narrative = llm; source = 'LLM'; }
    }

    const validUntil = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
    await aiRepo.savePlan(Number(target), source, ctx, { ...plan, narrative }, validUntil);
    await audit({
      userId: actor.userId, action: 'SYSTEM', entity: 'study_plans',
      description: `Study plan generated by ${source} (${plan.items.length} items, risk ${plan.score})`,
    });
    return {
      reply: narrative,
      source,
      data: {
        riskScore: plan.score,
        validUntil,
        items: plan.items,
        generatedOn: new Date().toISOString(),
      },
      generatedAt: new Date().toISOString(),
    };
  },

  latestPlan: (studentId: number) => aiRepo.latestPlan(studentId),
  plans: (studentId: number) => aiRepo.plans(studentId),

  /** Faculty/HR view: the at-risk list produced by the DB risk procedure. */
  atRisk: () => aiRepo.riskContext(),

  /**
   * Recompute the risk score for every student. `sp_compute_student_risk`
   * weights attendance, marks, backlogs and pending dues into one 0-100 score.
   */
  async recomputeRisk(actor: AuthUser) {
    const { callProc } = await import('../config/database');
    const { out } = await callProc('sp_compute_student_risk', [], ['p_rows', 'p_message']);
    await audit({
      userId: actor.userId, action: 'SYSTEM', entity: 'student_risk_scores',
      description: `Risk recomputation: ${out.p_message}`,
    });
    return { rows: Number(out.p_rows ?? 0), message: out.p_message };
  },
};
