import { useEffect, useState, type ReactNode } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { LogOut, Menu, X, ChevronDown, GraduationCap } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { initials, colorFor, titleCase } from '../lib/format';
import { navFor, type NavSection } from './nav';
import { GlobalSearch } from './GlobalSearch';
import { NotificationBell } from './NotificationBell';
const ROLE_THEME: Record<string, string> = {
  ADMIN: 'bg-brand-100 text-brand-700',
  FACULTY: 'bg-emerald-100 text-emerald-700',
  STUDENT: 'bg-sky-100 text-sky-700',
  ACCOUNTANT: 'bg-amber-100 text-amber-700',
  HOSTEL_ADMIN: 'bg-violet-100 text-violet-700',
  EXAM_CELL: 'bg-rose-100 text-rose-700',
  HR: 'bg-teal-100 text-teal-700',
};

export function AppShell() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const sections: NavSection[] = navFor(user?.role);

  // Close the mobile drawer and profile menu on navigation.
  useEffect(() => { setOpen(false); setProfileOpen(false); }, [location.pathname]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest('[data-profile]')) setProfileOpen(false);
    };
    document.addEventListener('click', onDoc);
    return () => document.removeEventListener('click', onDoc);
  }, []);

  if (!user) return null;

  return (
    <div className="flex min-h-screen bg-slate-100">
      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 transform overflow-y-auto bg-slate-900 transition-transform duration-200 lg:static lg:translate-x-0 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center gap-2.5 px-4 py-4">
          <div className="rounded-lg bg-brand-600 p-2 text-white"><GraduationCap className="h-5 w-5" /></div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-white">VPIT University ERP</p>
            <p className="truncate text-[11px] text-slate-400">Dept. of E&amp;TCE · M7 BATCH</p>
          </div>
        </div>

        <nav className="space-y-5 px-2 pb-8">
          {sections.map((section) => (
            <div key={section.title}>
              <p className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">{section.title}</p>
              <div className="space-y-0.5">
                {section.items.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.to === '/'}
                    className={({ isActive }) =>
                      `flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition ${
                        isActive ? 'bg-brand-600 font-medium text-white' : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                      }`
                    }
                  >
                    {item.icon}
                    <span className="truncate">{item.label}</span>
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>
      </aside>

      {open ? (
        <div className="fixed inset-0 z-40 bg-slate-900/50 lg:hidden" onClick={() => setOpen(false)} />
      ) : null}

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
          <div className="flex items-center gap-2 px-3 py-2.5 sm:px-5">
            <button type="button" onClick={() => setOpen(true)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 lg:hidden" aria-label="Open menu">
              <Menu className="h-5 w-5" />
            </button>
            <GlobalSearch />
            <div className="ml-auto flex items-center gap-1">
              <NotificationBell />
              <div className="relative" data-profile>
                <button
                  type="button"
                  onClick={() => setProfileOpen((o) => !o)}
                  className="flex items-center gap-2 rounded-lg py-1 pl-1 pr-2 transition hover:bg-slate-100"
                >
                  <span
                    className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold text-white"
                    style={{ background: colorFor(user.name) }}
                  >
                    {initials(user.name)}
                  </span>
                  <span className="hidden text-left sm:block">
                    <span className="block max-w-[10rem] truncate text-xs font-semibold text-slate-800">{user.name}</span>
                    <span className={`chip mt-0.5 ${ROLE_THEME[user.role] ?? 'bg-slate-100 text-slate-700'}`}>{user.role}</span>
                  </span>
                  <ChevronDown className="hidden h-4 w-4 text-slate-400 sm:block" />
                </button>
                {profileOpen ? (
                  <div className="absolute right-0 z-50 mt-2 w-56 animate-pop-in overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
                    <div className="border-b border-slate-100 px-4 py-3">
                      <p className="truncate text-sm font-semibold text-slate-800">{user.name}</p>
                      <p className="truncate text-xs text-slate-500">{user.email}</p>
                      <p className="mt-1 text-[11px] text-slate-400">
                        {user.studentId ? `Student #${user.studentId}` : null}
                        {user.facultyId ? `Faculty #${user.facultyId}` : null}
                        {!user.studentId && !user.facultyId ? titleCase(user.role) : null}
                      </p>
                    </div>
                    <Link to="/profile" className="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">My profile</Link>
                    <button
                      type="button"
                      onClick={() => { logout(); navigate('/login'); }}
                      className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-rose-600 hover:bg-rose-50"
                    >
                      <LogOut className="h-4 w-4" /> Sign out
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </header>

        <main className="min-w-0 flex-1 px-3 py-4 sm:px-5 sm:py-6">
          <Outlet />
        </main>

        <footer className="border-t border-slate-200 bg-white px-4 py-3 text-center text-[11px] text-slate-400">
          University Higher Education ERP · DBMS collaborative project · M7 BATCH, Department of E&amp;TCE
        </footer>
      </div>

      {open ? (
        <button type="button" onClick={() => setOpen(false)} className="fixed right-3 top-3 z-[60] rounded-lg bg-slate-800 p-2 text-white lg:hidden" aria-label="Close menu">
          <X className="h-5 w-5" />
        </button>
      ) : null}
    </div>
  );
}

/** Guard for routes that only make sense for certain roles. */
export function RoleGate({ roles, children }: { roles: string[]; children: ReactNode }) {
  const { has } = useAuth();
  if (!has(...(roles as never[]))) {
    return (
      <div className="card card-pad text-center">
        <p className="text-sm font-medium text-slate-700">You do not have access to this page.</p>
        <p className="mt-1 text-xs text-slate-500">This area is restricted to: {roles.join(', ')}.</p>
      </div>
    );
  }
  return <>{children}</>;
}
