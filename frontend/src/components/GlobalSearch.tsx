import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, X, CornerDownLeft } from 'lucide-react';
import { api } from '../lib/api';
import { titleCase } from '../lib/format';

interface Hit {
  module: string;
  entity: string;
  id: number;
  title: string;
  subtitle: string;
  /** Deep link the search repository already resolved for this row. */
  link?: string;
}

/** Fallback destinations for modules whose rows carry no explicit link. */
const LINK_FOR: Record<string, (id: number) => string> = {
  STUDENT: (id) => `/students/${id}`,
  FACULTY: (id) => `/faculty/${id}`,
  ACADEMIC: (id) => `/academics/offerings?offeringId=${id}`,
  EXAM: () => '/exams',
  HOSTEL: () => '/hostel/dashboard',
  FEE: () => '/fees/bills',
};

export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<Hit[]>([]);
  const [busy, setBusy] = useState(false);
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  // Ctrl/Cmd+K opens the palette from anywhere in the app.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (open) window.setTimeout(() => inputRef.current?.focus(), 30);
    else { setQ(''); setHits([]); setCursor(0); }
  }, [open]);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setHits([]); return; }
    const t = window.setTimeout(async () => {
      setBusy(true);
      try {
        const rows = await api.get<Hit[]>('/search', { q: term, limit: 12 });
        setHits(rows ?? []);
        setCursor(0);
      } catch {
        setHits([]);
      } finally {
        setBusy(false);
      }
    }, 260);
    return () => window.clearTimeout(t);
  }, [q]);

  const go = (h: Hit) => {
    const make = LINK_FOR[h.module];
    navigate(h.link || (make ? make(h.id) : '/'));
    setOpen(false);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="hidden items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-500 transition hover:border-brand-400 hover:text-slate-700 md:flex"
      >
        <Search className="h-4 w-4" />
        <span>Search students, faculty, subjects…</span>
        <kbd className="ml-2 rounded border border-slate-300 bg-slate-50 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">Ctrl K</kbd>
      </button>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 md:hidden"
        aria-label="Search"
      >
        <Search className="h-5 w-5" />
      </button>

      {open ? (
        <div className="fixed inset-0 z-[90] flex items-start justify-center bg-slate-900/40 p-4 pt-[10vh] backdrop-blur-sm" onClick={() => setOpen(false)}>
          <div className="w-full max-w-2xl animate-pop-in overflow-hidden rounded-xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 border-b border-slate-200 px-4">
              <Search className="h-5 w-5 text-slate-400" />
              <input
                ref={inputRef}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowDown') { e.preventDefault(); setCursor((c) => Math.min(c + 1, hits.length - 1)); }
                  if (e.key === 'ArrowUp') { e.preventDefault(); setCursor((c) => Math.max(c - 1, 0)); }
                  if (e.key === 'Enter' && hits[cursor]) go(hits[cursor]!);
                  if (e.key === 'Escape') setOpen(false);
                }}
                placeholder="Search across every module…"
                className="w-full bg-transparent py-3.5 text-sm outline-none placeholder:text-slate-400"
              />
              {busy ? <span className="text-xs text-slate-400">searching…</span> : null}
              <button type="button" onClick={() => setOpen(false)} className="rounded p-1 text-slate-400 hover:bg-slate-100">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="max-h-[52vh] overflow-y-auto">
              {q.trim().length < 2 ? (
                <p className="px-4 py-8 text-center text-sm text-slate-500">Type at least 2 characters to search.</p>
              ) : !busy && !hits.length ? (
                <p className="px-4 py-8 text-center text-sm text-slate-500">No matches for “{q}”.</p>
              ) : (
                hits.map((h, i) => (
                  <button
                    key={`${h.module}-${h.id}`}
                    type="button"
                    onMouseEnter={() => setCursor(i)}
                    onClick={() => go(h)}
                    className={`flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left transition ${
                      i === cursor ? 'bg-brand-50' : 'hover:bg-slate-50'
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-800">{h.title}</p>
                      <p className="truncate text-xs text-slate-500">{h.subtitle}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="chip bg-slate-100 text-slate-600">{titleCase(h.module)}</span>
                      {i === cursor ? <CornerDownLeft className="h-3.5 w-3.5 text-slate-400" /> : null}
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
