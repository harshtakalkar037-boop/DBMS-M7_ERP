import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Send, Sparkles, Bot, User, Lightbulb } from 'lucide-react';
import { api, errMsg } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { Card, PageHeader, Loading, useFetch, Badge } from '../../components/ui';
import { dateTimeStr } from '../../lib/format';
interface AiReply {
  reply: string;
  source: 'LOCAL_ENGINE' | 'LLM';
  data?: unknown;
  generatedAt: string;
}
interface EngineInfo {
  mode: 'local' | 'llm';
  llmEnabled: boolean;
  model: string | null;
  engine: string;
  note: string;
}
interface HistoryRow { id: number; prompt: string; reply: string; source: string; createdAt: string; }

const SUGGESTIONS = [
  'How is my attendance?',
  'What are my pending fees?',
  'Which subjects am I weak in?',
  'How many backlogs do I have?',
  'Show my latest results',
  'Am I eligible for the next exam?',
];

export default function AiChatPage() {
  const { user } = useAuth();
  const [messages, setMessages] = useState<{ role: 'user' | 'assistant'; text: string; source?: string; at?: string }[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottom = useRef<HTMLDivElement>(null);

  const engine = useFetch<EngineInfo>(() => api.get<EngineInfo>('/ai/engine'), []);
  const history = useFetch<HistoryRow[]>(() => api.get<HistoryRow[]>('/ai/history', { limit: 20 }), []);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const ask = async (text: string) => {
    const q = text.trim();
    if (!q || busy) return;
    setBusy(true);
    setError(null);
    setMessages((m) => [...m, { role: 'user', text: q }]);
    setInput('');
    try {
      const res = await api.post<AiReply>('/ai/chat', { message: q });
      setMessages((m) => [...m, { role: 'assistant', text: res.reply, source: res.source, at: res.generatedAt }]);
      history.reload();
    } catch (e) {
      setError(errMsg(e));
      setMessages((m) => m.slice(0, -1));
    } finally { setBusy(false); }
  };

  const submit = (e: FormEvent) => { e.preventDefault(); void ask(input); };

  return (
    <>
      <PageHeader
        title="AI assistant"
        subtitle={
          engine.data
            ? `Engine: ${engine.data.engine}${engine.data.model ? ` (${engine.data.model})` : ''} · mode ${engine.data.mode}`
            : 'Ask questions about your own record.'
        }
        icon={<Sparkles className="h-5 w-5" />}
        actions={engine.data ? (
          <Badge className={engine.data.llmEnabled ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}>
            {engine.data.llmEnabled ? 'LLM connected' : 'Local rule engine'}
          </Badge>
        ) : null}
      />

      {engine.data ? (
        <Card className="card-pad mb-4">
          <p className="text-xs leading-relaxed text-slate-600">
            <b>How this works.</b> {engine.data.note}
          </p>
          <p className="mt-2 text-xs text-slate-500">
            Every answer is assembled from rows read out of your own ERP record (attendance, marks, fees, backlogs,
            mock tests). Nothing is invented and nothing is hard-coded — if the database has no answer, the assistant
            says so.
          </p>
        </Card>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="flex h-[32rem] flex-col lg:col-span-2">
          <div className="flex-1 space-y-3 overflow-y-auto p-4">
            {messages.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
                <Bot className="h-10 w-10 text-slate-300" />
                <p className="text-sm font-medium text-slate-600">Ask me anything about your record</p>
                <p className="max-w-sm text-xs text-slate-500">
                  Try one of the suggestions below{user?.role === 'STUDENT' ? '' : ' — staff questions resolve against your own profile'}.
                </p>
              </div>
            ) : (
              messages.map((m, i) => (
                <div key={i} className={`flex gap-2.5 ${m.role === 'user' ? 'justify-end' : ''}`}>
                  {m.role === 'assistant' ? (
                    <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-100 text-brand-600">
                      <Bot className="h-4 w-4" />
                    </span>
                  ) : null}
                  <div className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                    m.role === 'user' ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-800'
                  }`}>
                    <p className="whitespace-pre-wrap leading-relaxed">{m.text}</p>
                    {m.role === 'assistant' ? (
                      <p className="mt-1 flex items-center gap-2 text-[10px] uppercase tracking-wide text-slate-400">
                        {m.source === 'LLM' ? 'LLM' : 'Local rule engine'}
                        {m.at ? ` · ${dateTimeStr(m.at)}` : ''}
                      </p>
                    ) : null}
                  </div>
                  {m.role === 'user' ? (
                    <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-200 text-slate-600">
                      <User className="h-4 w-4" />
                    </span>
                  ) : null}
                </div>
              ))
            )}
            {busy ? (
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-100 text-brand-600"><Bot className="h-4 w-4" /></span>
                <span className="flex gap-1">
                  <span className="h-2 w-2 animate-bounce rounded-full bg-slate-400" />
                  <span className="h-2 w-2 animate-bounce rounded-full bg-slate-400 [animation-delay:120ms]" />
                  <span className="h-2 w-2 animate-bounce rounded-full bg-slate-400 [animation-delay:240ms]" />
                </span>
              </div>
            ) : null}
            <div ref={bottom} />
          </div>

          {error ? <div className="border-t border-rose-200 bg-rose-50 px-4 py-2 text-xs text-rose-700">{error}</div> : null}

          <form onSubmit={submit} className="flex gap-2 border-t border-slate-200 p-3">
            <input
              className="input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Type your question…"
              disabled={busy}
            />
            <button type="submit" className="btn-primary shrink-0" disabled={busy || !input.trim()}>
              <Send className="h-4 w-4" />
            </button>
          </form>
        </Card>

        <div className="space-y-4">
          <Card className="card-pad">
            <h2 className="mb-2 flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wide text-slate-500">
              <Lightbulb className="h-4 w-4" /> Try asking
            </h2>
            <div className="flex flex-wrap gap-1.5">
              {SUGGESTIONS.map((s) => (
                <button key={s} type="button" className="btn-secondary btn-xs" onClick={() => void ask(s)} disabled={busy}>{s}</button>
              ))}
            </div>
          </Card>

          <Card>
            <div className="border-b border-slate-200 px-4 py-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Recent questions</h2>
            </div>
            <div className="max-h-80 divide-y divide-slate-100 overflow-y-auto">
              {history.loading ? <Loading /> : (history.data ?? []).length ? history.data!.map((h) => (
                <button key={h.id} type="button" onClick={() => void ask(h.prompt)} className="block w-full px-4 py-2.5 text-left transition hover:bg-slate-50">
                  <p className="truncate text-xs font-medium text-slate-700">{h.prompt}</p>
                  <p className="line-clamp-2 text-[11px] text-slate-500">{h.reply}</p>
                </button>
              )) : (
                <p className="px-4 py-6 text-center text-sm text-slate-500">No questions yet.</p>
              )}
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
