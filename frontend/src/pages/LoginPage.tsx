import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { GraduationCap, LogIn, Eye, EyeOff, Info } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { errMsg } from '../lib/api';
import { Field } from '../components/ui';

/** Seeded demo accounts. Shown on the login screen so the app can be explored
 *  (and examined in a viva) without hunting for credentials. */
const DEMO = [
  { role: 'ADMIN', email: 'admin@vpit.edu.in', password: 'Admin@123', blurb: 'Full access: every module, settings and audit log.' },
  { role: 'FACULTY', email: 'pallavi.gite@vpit.edu.in', password: 'Faculty@123', blurb: 'Own classes, attendance marking, marks entry, leave.' },
  { role: 'STUDENT', email: '2024ETC1001@vpit.edu.in', password: 'Student@123', blurb: 'Own attendance, fees, results, hall ticket, mock tests.' },
  { role: 'ACCOUNTANT', email: 'accountant@vpit.edu.in', password: 'Account@123', blurb: 'Fee structures, bills, payments, defaulters.' },
  { role: 'HOSTEL_ADMIN', email: 'hostel.admin@vpit.edu.in', password: 'Hostel@123', blurb: 'Rooms, beds, applications, allocations.' },
  { role: 'EXAM_CELL', email: 'examcell@vpit.edu.in', password: 'Exam@123', blurb: 'Examinations, registrations, marks, results.' },
  { role: 'HR', email: 'hr@vpit.edu.in', password: 'Hr@123', blurb: 'Faculty records, leave approvals, monthly payroll.' },
];

export default function LoginPage() {
  const { login, user } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('admin@vpit.edu.in');
  const [password, setPassword] = useState('Admin@123');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (user) {
    navigate('/', { replace: true });
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(email.trim(), password);
      navigate('/', { replace: true });
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-slate-100 lg:flex-row">
      {/* Brand panel */}
      <div className="relative hidden flex-1 overflow-hidden bg-slate-900 lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div className="absolute -left-24 -top-24 h-72 w-72 rounded-full bg-brand-600/30 blur-3xl" />
        <div className="absolute -bottom-32 -right-16 h-96 w-96 rounded-full bg-sky-500/20 blur-3xl" />
        <div className="relative">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-brand-600 p-2.5 text-white"><GraduationCap className="h-7 w-7" /></div>
            <div>
              <p className="text-lg font-semibold text-white">VPIT University ERP</p>
              <p className="text-xs text-slate-400">Higher Education Management System</p>
            </div>
          </div>
        </div>
        <div className="relative max-w-lg">
          <h1 className="text-3xl font-semibold leading-tight text-white">
            One integrated system for the entire student lifecycle.
          </h1>
          <p className="mt-4 text-sm leading-relaxed text-slate-300">
            Admissions, academics, attendance, examinations, fees, hostel and faculty payroll — every module
            reads and writes the same relational database. Business rules are enforced by stored procedures,
            triggers and functions in MySQL, not by the user interface.
          </p>
          <dl className="mt-8 grid grid-cols-2 gap-4 text-sm">
            {[
              ['7', 'Functional modules'],
              ['8+', 'Stored procedures'],
              ['12+', 'Database triggers'],
              ['12+', 'SQL views'],
              ['8+', 'User-defined functions'],
              ['JWT + RBAC', '7 role types'],
            ].map(([k, v]) => (
              <div key={k} className="rounded-lg border border-white/10 bg-white/5 px-3 py-2.5">
                <dt className="text-base font-semibold text-white">{k}</dt>
                <dd className="text-xs text-slate-400">{v}</dd>
              </div>
            ))}
          </dl>
        </div>
        <p className="relative text-xs text-slate-500">
          DBMS collaborative project · M7 BATCH · Department of Electronics &amp; Telecommunication Engineering
        </p>
      </div>

      {/* Form panel */}
      <div className="flex flex-1 items-center justify-center p-5 sm:p-10">
        <div className="w-full max-w-md">
          <div className="mb-6 flex items-center gap-3 lg:hidden">
            <div className="rounded-lg bg-brand-600 p-2 text-white"><GraduationCap className="h-6 w-6" /></div>
            <div>
              <p className="font-semibold text-slate-900">VPIT University ERP</p>
              <p className="text-xs text-slate-500">M7 BATCH · Dept. of E&amp;TCE</p>
            </div>
          </div>

          <div className="card card-pad">
            <h2 className="text-lg font-semibold text-slate-900">Sign in</h2>
            <p className="mt-1 text-sm text-slate-500">Use your institute email and password.</p>

            <form onSubmit={submit} className="mt-5">
              <Field
                label="Email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@vpit.edu.in"
                required
                autoComplete="username"
              />
              <div className="field">
                <label className="label">Password</label>
                <div className="relative">
                  <input
                    className="input pr-10"
                    type={show ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShow((s) => !s)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:bg-slate-100"
                    aria-label={show ? 'Hide password' : 'Show password'}
                  >
                    {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {error ? (
                <div className="mb-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>
              ) : null}

              <button type="submit" className="btn-primary w-full" disabled={busy}>
                {busy ? 'Signing in…' : (<><LogIn className="h-4 w-4" /> Sign in</>)}
              </button>
            </form>

            <div className="mt-6 rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-600">
                <Info className="h-3.5 w-3.5" /> Demo accounts (click to fill)
              </p>
              <div className="mt-2 grid gap-1.5">
                {DEMO.map((d) => (
                  <button
                    key={d.role}
                    type="button"
                    onClick={() => { setEmail(d.email); setPassword(d.password); }}
                    className="group flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left transition hover:bg-white"
                  >
                    <span className="min-w-0">
                      <span className="block text-xs font-semibold text-slate-700">{d.role}</span>
                      <span className="block truncate text-[11px] text-slate-500">{d.blurb}</span>
                    </span>
                    <span className="shrink-0 text-[11px] text-brand-700 opacity-0 transition group-hover:opacity-100">use →</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <p className="mt-4 text-center text-[11px] text-slate-400">
            Every screen in this application reads live data from the MySQL database — nothing is mocked.
          </p>
        </div>
      </div>
    </div>
  );
}
