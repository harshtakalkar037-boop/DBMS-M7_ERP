/** Presentation helpers. Nothing here invents data - it only formats what the API returned. */

export const money = (v: unknown, currency = 'INR'): string => {
  const n = Number(v ?? 0);
  if (!Number.isFinite(n)) return '-';
  const symbol = currency === 'INR' ? '₹' : '';
  return `${symbol}${n.toLocaleString('en-IN', { maximumFractionDigits: 2, minimumFractionDigits: 0 })}`;
};

export const num = (v: unknown, digits = 0): string => {
  const n = Number(v ?? 0);
  if (!Number.isFinite(n)) return '-';
  return n.toLocaleString('en-IN', { maximumFractionDigits: digits, minimumFractionDigits: digits });
};

export const pct = (v: unknown, digits = 2): string => {
  const n = Number(v ?? 0);
  if (!Number.isFinite(n)) return '-';
  return `${n.toFixed(digits)}%`;
};

/** MySQL returns DATETIMEs as "YYYY-MM-DD HH:mm:ss" strings - parse them safely. */
export function toDate(v: unknown): Date | null {
  if (!v) return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;
  const s = String(v).trim().replace(' ', 'T');
  const d = new Date(s.length === 10 ? `${s}T00:00:00` : s);
  return Number.isNaN(d.getTime()) ? null : d;
}

export const dateStr = (v: unknown): string => {
  const d = toDate(v);
  return d ? d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';
};

export const dateTimeStr = (v: unknown): string => {
  const d = toDate(v);
  return d ? d.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-';
};

export const timeStr = (v: unknown): string => {
  const d = toDate(v);
  return d ? d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : String(v ?? '-');
};

export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const monthYear = (m: unknown, y: unknown): string => {
  const mi = Number(m);
  return Number.isFinite(mi) && mi >= 1 && mi <= 12 ? `${MONTHS[mi - 1]} ${y ?? ''}`.trim() : `${m ?? ''} ${y ?? ''}`.trim();
};

export const daysBetween = (a: unknown, b: unknown): number => {
  const d1 = toDate(a);
  const d2 = toDate(b);
  if (!d1 || !d2) return 0;
  return Math.round((d2.getTime() - d1.getTime()) / 86_400_000);
};

export const initials = (name: unknown): string =>
  String(name ?? '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');

export const titleCase = (s: unknown): string =>
  String(s ?? '')
    .toLowerCase()
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((w) => w[0]!.toUpperCase() + w.slice(1))
    .join(' ');

/** Deterministic colour for an avatar/legend derived from a string. */
export function colorFor(seed: unknown): string {
  const s = String(seed ?? '');
  let h = 0;
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) % 360;
  return `hsl(${h} 62% 42%)`;
}

export const STATUS_STYLES: Record<string, string> = {
  ACTIVE: 'bg-emerald-100 text-emerald-700',
  PAID: 'bg-emerald-100 text-emerald-700',
  PRESENT: 'bg-emerald-100 text-emerald-700',
  APPROVED: 'bg-emerald-100 text-emerald-700',
  ELIGIBLE: 'bg-emerald-100 text-emerald-700',
  PUBLISHED: 'bg-emerald-100 text-emerald-700',
  CLEARED: 'bg-emerald-100 text-emerald-700',
  SAFE: 'bg-emerald-100 text-emerald-700',
  PASS: 'bg-emerald-100 text-emerald-700',
  LOW: 'bg-emerald-100 text-emerald-700',
  GOOD: 'bg-emerald-100 text-emerald-700',
  SCHEDULED: 'bg-brand-100 text-brand-700',
  REGISTERED: 'bg-brand-100 text-brand-700',
  REGISTRATION_OPEN: 'bg-brand-100 text-brand-700',
  DRAFT: 'bg-slate-100 text-slate-600',
  PENDING: 'bg-amber-100 text-amber-700',
  ONGOING: 'bg-amber-100 text-amber-700',
  WARNING: 'bg-amber-100 text-amber-700',
  PARTIAL: 'bg-amber-100 text-amber-700',
  IN_REVIEW: 'bg-amber-100 text-amber-700',
  MEDIUM: 'bg-amber-100 text-amber-700',
  SUBMITTED: 'bg-amber-100 text-amber-700',
  INACTIVE: 'bg-slate-100 text-slate-600',
  CANCELLED: 'bg-slate-100 text-slate-600',
  VACATED: 'bg-slate-100 text-slate-600',
  REJECTED: 'bg-rose-100 text-rose-700',
  FAILED: 'bg-rose-100 text-rose-700',
  ABSENT: 'bg-rose-100 text-rose-700',
  OVERDUE: 'bg-rose-100 text-rose-700',
  CRITICAL: 'bg-rose-100 text-rose-700',
  HIGH: 'bg-rose-100 text-rose-700',
  BLOCKED: 'bg-rose-100 text-rose-700',
  SUSPENDED: 'bg-rose-100 text-rose-700',
  NOT_ELIGIBLE: 'bg-rose-100 text-rose-700',
  ERROR: 'bg-rose-100 text-rose-700',
  LATE: 'bg-sky-100 text-sky-700',
  EXCUSED: 'bg-sky-100 text-sky-700',
  LEAVE: 'bg-sky-100 text-sky-700',
  ON_LEAVE: 'bg-sky-100 text-sky-700',
  INFO: 'bg-sky-100 text-sky-700',
};

export const statusClass = (s: unknown): string =>
  STATUS_STYLES[String(s ?? '').toUpperCase()] ?? 'bg-slate-100 text-slate-700';
