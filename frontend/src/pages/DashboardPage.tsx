import { Link } from 'react-router-dom';
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import {
  Users, UserCog, Building2, GraduationCap, TriangleAlert, Clock, BedDouble,
  CalendarDays, ClipboardCheck, Award, IndianRupee, ArrowRight, Sparkles, Activity,
} from 'lucide-react';
import { useAuth } from '../lib/auth';
import { api } from '../lib/api';
import { StatCard, Card, PageHeader, StatusBadge, ProgressBar, Loading, ErrorBox, useFetch } from '../components/ui';
import { dateTimeStr, money, num, pct, titleCase, statusClass } from '../lib/format';

interface Dashboard {
  counts: Record<string, number>;
  departments: Record<string, unknown>[];
  attendance: { average: string; safe: string; warning: string; critical: string };
  fees: { billed: string; collected: string; outstanding: string };
  risk: { critical: string; high: string; medium: string; low: string };
  recentActivity: { id: number; action: string; entity: string; description: string; createdAt: string }[];
}


/* ------------------------------------------------------------------ shared */

function SectionTitle({ children, to, linkLabel }: { children: React.ReactNode; to?: string; linkLabel?: string }) {
  return (
    <div className="mb-2.5 flex items-center justify-between">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{children}</h2>
      {to ? (
        <Link to={to} className="flex items-center gap-1 text-xs font-medium text-brand-700 hover:underline">
          {linkLabel ?? 'View all'} <ArrowRight className="h-3 w-3" />
        </Link>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------- admin */

function StaffDashboard() {
  const { data, loading, error, reload } = useFetch(() => api.get<Dashboard>('/dashboard'), []);
  const plans = useFetch(() => api.get<Record<string, unknown>[]>('/academics/calendar', { limit: 5 }), []);

  if (loading) return <Loading label="Loading institute dashboard…" />;
  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (!data) return null;

  const c = data.counts ?? {};
  const attendancePie = [
    { name: 'Safe (≥75%)', value: Number(data.attendance?.safe ?? 0), color: '#059669' },
    { name: 'Warning (65-74%)', value: Number(data.attendance?.warning ?? 0), color: '#f59e0b' },
    { name: 'Critical (<65%)', value: Number(data.attendance?.critical ?? 0), color: '#e11d48' },
  ];
  const riskPie = [
    { name: 'Critical', value: Number(data.risk?.critical ?? 0), color: '#e11d48' },
    { name: 'High', value: Number(data.risk?.high ?? 0), color: '#f97316' },
    { name: 'Medium', value: Number(data.risk?.medium ?? 0), color: '#f59e0b' },
    { name: 'Low', value: Number(data.risk?.low ?? 0), color: '#059669' },
  ];
  const feeBar = [
    { name: 'Fees', Collected: Number(data.fees?.collected ?? 0), Outstanding: Number(data.fees?.outstanding ?? 0) },
  ];

  return (
    <>
      <PageHeader
        title="Institute dashboard"
        subtitle="Live figures read straight from the ERP database."
        actions={
          <>
            <Link to="/reports" className="btn-secondary btn-sm"><Activity className="h-4 w-4" /> Reports</Link>
            <Link to="/ai/at-risk" className="btn-primary btn-sm"><Sparkles className="h-4 w-4" /> Risk analysis</Link>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 xl:grid-cols-6">
        <StatCard label="Students" value={num(c.activeStudents)} icon={<Users className="h-5 w-5" />} hint={`${num(c.enrollments)} enrollments`} />
        <StatCard label="Faculty" value={num(c.activeFaculty)} icon={<UserCog className="h-5 w-5" />} tone="emerald" hint={`${num(c.pendingLeaves)} leave requests`} />
        <StatCard label="Departments" value={num(c.departments)} icon={<Building2 className="h-5 w-5" />} tone="sky" hint={`${num(c.programs)} programs`} />
        <StatCard label="Subjects" value={num(c.subjects)} icon={<GraduationCap className="h-5 w-5" />} tone="slate" hint={`${num(c.offerings)} offerings`} />
        <StatCard label="Hostel residents" value={num(c.hostelResidents)} icon={<BedDouble className="h-5 w-5" />} tone="amber" hint={`${num(c.hostels)} hostels`} />
        <StatCard label="Examinations" value={num(c.exams)} icon={<Award className="h-5 w-5" />} tone="rose" hint={`${num(c.pendingHostelApps)} hostel applications`} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="card-pad">
          <SectionTitle to="/attendance/reports">Attendance health</SectionTitle>
          <div className="flex items-center gap-4">
            <div className="h-36 w-36 shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={attendancePie} dataKey="value" innerRadius={38} outerRadius={62} paddingAngle={2}>
                    {attendancePie.map((e) => <Cell key={e.name} fill={e.color} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="min-w-0 flex-1 space-y-1.5 text-xs">
              <p className="text-2xl font-semibold text-slate-900">{pct(data.attendance?.average)}</p>
              <p className="text-slate-500">Institute average</p>
              {attendancePie.map((e) => (
                <div key={e.name} className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 truncate text-slate-600">
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: e.color }} /> {e.name}
                  </span>
                  <b className="text-slate-800">{num(e.value)}</b>
                </div>
              ))}
            </div>
          </div>
        </Card>

        <Card className="card-pad">
          <SectionTitle to="/fees/bills">Fee collection</SectionTitle>
          <div className="h-36">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={feeBar} layout="vertical" margin={{ left: 8, right: 8 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" tickFormatter={(v) => `₹${Math.round(Number(v) / 100000)}L`} fontSize={10} />
                <YAxis type="category" dataKey="name" hide />
                <Tooltip formatter={(v) => money(v)} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="Collected" stackId="a" fill="#059669" radius={[0, 0, 0, 0]} />
                <Bar dataKey="Outstanding" stackId="a" fill="#f59e0b" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 grid grid-cols-3 gap-2 text-center">
            <div><p className="text-[10px] uppercase text-slate-500">Billed</p><p className="text-sm font-semibold">{money(data.fees?.billed)}</p></div>
            <div><p className="text-[10px] uppercase text-slate-500">Collected</p><p className="text-sm font-semibold text-emerald-600">{money(data.fees?.collected)}</p></div>
            <div><p className="text-[10px] uppercase text-slate-500">Outstanding</p><p className="text-sm font-semibold text-amber-600">{money(data.fees?.outstanding)}</p></div>
          </div>
        </Card>

        <Card className="card-pad">
          <SectionTitle to="/ai/at-risk">Student risk model</SectionTitle>
          <div className="h-36">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={riskPie} dataKey="value" nameKey="name" outerRadius={60}>
                  {riskPie.map((e) => <Cell key={e.name} fill={e.color} />)}
                </Pie>
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-1 text-[11px] text-slate-500">
            Scores are produced by <code className="rounded bg-slate-100 px-1">sp_compute_student_risk</code> from attendance,
            marks, backlogs and dues.
          </p>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Department snapshot</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Department</th><th className="text-right">Students</th><th className="text-right">Faculty</th>
                  <th className="text-right">Avg CGPA</th><th className="text-right">Attendance</th>
                  <th className="text-right">Pass %</th><th className="text-right">Dues</th>
                </tr>
              </thead>
              <tbody>
                {(data.departments ?? []).map((d) => (
                  <tr key={String(d.department_id)}>
                    <td>
                      <p className="font-medium text-slate-800">{String(d.department_name)}</p>
                      <p className="text-[11px] text-slate-500">{String(d.department_code)}</p>
                    </td>
                    <td className="text-right">{num(d.student_count)}</td>
                    <td className="text-right">{num(d.faculty_count)}</td>
                    <td className="text-right">{num(d.average_cgpa, 2)}</td>
                    <td className="text-right">{pct(d.average_attendance)}</td>
                    <td className="text-right">{pct(d.pass_percentage)}</td>
                    <td className="text-right">{money(d.pending_fee_amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Recent activity</h2>
            <Link to="/audit" className="text-xs text-brand-700 hover:underline">Audit log</Link>
          </div>
          <div className="max-h-80 divide-y divide-slate-100 overflow-y-auto">
            {(data.recentActivity ?? []).length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-slate-500">No activity recorded yet.</p>
            ) : (
              data.recentActivity.map((a) => (
                <div key={a.id} className="px-4 py-2.5">
                  <p className="truncate text-sm text-slate-700">{a.description}</p>
                  <p className="mt-0.5 flex items-center gap-2 text-[11px] text-slate-400">
                    <span className={`chip ${statusClass(a.action)}`}>{a.action}</span>
                    <Clock className="h-3 w-3" /> {dateTimeStr(a.createdAt)}
                  </p>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>

      <Card className="mt-4">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Upcoming academic events</h2>
          <Link to="/academics/calendar" className="text-xs text-brand-700 hover:underline">Calendar</Link>
        </div>
        <div className="divide-y divide-slate-100">
          {(plans.data ?? []).length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-slate-500">No events scheduled.</p>
          ) : (
            plans.data!.slice(0, 5).map((e) => (
              <div key={String(e.calendar_id ?? e.id)} className="flex items-center justify-between px-4 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-800">{String(e.title)}</p>
                  <p className="truncate text-xs text-slate-500">{String(e.description ?? '')}</p>
                </div>
                <span className="ml-3 shrink-0 text-xs text-slate-500">{dateTimeStr(e.start_date ?? e.event_date)}</span>
              </div>
            ))
          )}
        </div>
      </Card>
    </>
  );
}

/* ------------------------------------------------------------------ faculty */

function FacultyDashboard() {
  const { user } = useAuth();
  const fid = user?.facultyId;
  const me = useFetch(() => api.get<Record<string, unknown>>('/faculty/me'), []);
  const subjects = useFetch(() => api.get<Record<string, unknown>[]>('/faculty/me/subjects'), []);
  const timetable = useFetch(() => api.get<Record<string, unknown>[]>(`/academics/timetable/faculty/${fid}`), [fid]);
  const balances = useFetch(() => api.get<Record<string, unknown>[]>('/faculty/me/leave-balances'), []);
  const leaves = useFetch(() => api.get<Record<string, unknown>[]>('/faculty/leaves', { status: 'PENDING', limit: 50 }), []);
  const sessions = useFetch(() => api.get<Record<string, unknown>[]>('/attendance/sessions', { limit: 6 }), []);

  const today = new Date().toLocaleDateString('en-US', { weekday: 'long' }).toUpperCase();

  return (
    <>
      <PageHeader
        title={`Welcome, ${String(me.data?.first_name ?? user?.name ?? '')}`}
        subtitle={`${String(me.data?.employee_code ?? '')} · ${String(me.data?.designation_name ?? 'Faculty')}`}
        actions={<Link to="/attendance/sessions" className="btn-primary btn-sm"><ClipboardCheck className="h-4 w-4" /> Mark attendance</Link>}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Subjects this term" value={num(subjects.data?.length)} icon={<GraduationCap className="h-5 w-5" />} />
        <StatCard label="Students taught" value={num((subjects.data ?? []).reduce((s, r) => s + Number(r.enrolled ?? 0), 0))} icon={<Users className="h-5 w-5" />} tone="emerald" />
        <StatCard label="Classes today" value={num((timetable.data ?? []).filter((t) => String(t.day_of_week) === today).length)} icon={<CalendarDays className="h-5 w-5" />} tone="sky" />
        <StatCard label="Pending leave requests" value={num(leaves.data?.length)} icon={<TriangleAlert className="h-5 w-5" />} tone="amber" />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">My subjects</h2>
            <Link to="/faculty/leaves" className="text-xs text-brand-700 hover:underline">Leaves</Link>
          </div>
          <div className="overflow-x-auto">
            <table className="table">
              <thead><tr><th>Code</th><th>Subject</th><th>Program</th><th className="text-right">Enrolled</th></tr></thead>
              <tbody>
                {(subjects.data ?? []).map((s) => (
                  <tr key={String(s.offeringId)}>
                    <td className="font-medium text-slate-800">{String(s.subjectCode)}</td>
                    <td>{String(s.subjectName)}</td>
                    <td>{String(s.programCode)} · Sem {String(s.semesterNo)} · {String(s.sectionCode)}</td>
                    <td className="text-right">{num(s.enrolled)}</td>
                  </tr>
                ))}
                {!subjects.data?.length ? <tr><td colSpan={4} className="py-6 text-center text-sm text-slate-500">No subjects assigned yet.</td></tr> : null}
              </tbody>
            </table>
          </div>
        </Card>

        <Card>
          <div className="border-b border-slate-200 px-4 py-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Leave balance</h2>
          </div>
          <div className="space-y-3 px-4 py-4">
            {(balances.data ?? []).map((b) => (
              <div key={String(b.leave_type)}>
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="font-medium text-slate-700">{titleCase(b.leave_type)}</span>
                  <span className="text-slate-500">{num(b.remaining, 1)} left of {num(b.allotted)}</span>
                </div>
                <ProgressBar value={(Number(b.remaining) / Math.max(1, Number(b.allotted))) * 100} />
              </div>
            ))}
            {!balances.data?.length ? <p className="py-4 text-center text-sm text-slate-500">No leave balances configured.</p> : null}
          </div>
        </Card>
      </div>

      <Card className="mt-4">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Recent attendance sessions</h2>
          <Link to="/attendance/sessions" className="text-xs text-brand-700 hover:underline">All sessions</Link>
        </div>
        <div className="overflow-x-auto">
          <table className="table">
            <thead><tr><th>Date</th><th>Subject</th><th>Topic</th><th className="text-right">Marked</th><th>Status</th></tr></thead>
            <tbody>
              {(sessions.data ?? []).map((s) => (
                <tr key={String(s.session_id)}>
                  <td>{String(s.session_date ?? '').slice(0, 10)}</td>
                  <td className="font-medium">{String(s.subject_code ?? '')}</td>
                  <td className="max-w-xs truncate">{String(s.topic ?? '—')}</td>
                  <td className="text-right">{num(s.marked_count)}</td>
                  <td><StatusBadge value={s.status} /></td>
                </tr>
              ))}
              {!sessions.data?.length ? <tr><td colSpan={5} className="py-6 text-center text-sm text-slate-500">No sessions yet.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}

/* ------------------------------------------------------------------ student */

function StudentDashboard() {
  const { user } = useAuth();
  const overall = useFetch(() => api.get<Record<string, unknown>>('/attendance/me/overall'), []);
  const subjects = useFetch(() => api.get<Record<string, unknown>[]>('/attendance/me', { limit: 100 }), []);
  const fees = useFetch(() => api.get<Record<string, unknown>>('/fees/bills/summary/me'), []);
  const results = useFetch(() => api.get<Record<string, unknown>[]>('/exams/results/me'), []);
  const timetable = useFetch(() => api.get<Record<string, unknown>[]>(`/academics/timetable/student/${user?.studentId}`), [user?.studentId]);
  const notes = useFetch(() => api.get<Record<string, unknown>[]>('/notifications', { limit: 5 }), []);

  const attendanceRows = subjects.data ?? [];
  const weak = attendanceRows.filter((r) => Number(r.attendance_percentage) < 75);
  const latest = (results.data ?? [])[0];

  const trend = (results.data ?? []).slice().reverse().map((r) => ({
    sem: `Sem ${r.semester_no ?? r.semester_id}`,
    sgpa: Number(r.sgpa ?? 0),
    cgpa: Number(r.cgpa ?? 0),
  }));

  return (
    <>
      <PageHeader
        title={`Welcome, ${String(overall.data?.full_name ?? user?.name ?? '')}`}
        subtitle={`${String(overall.data?.roll_number ?? '')} · Semester ${String(overall.data?.current_semester_no ?? '—')}`}
        actions={
          <>
            <Link to="/ai/chat" className="btn-secondary btn-sm"><Sparkles className="h-4 w-4" /> Ask assistant</Link>
            <Link to="/exams/hall-ticket" className="btn-primary btn-sm"><Award className="h-4 w-4" /> Hall ticket</Link>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Overall attendance"
          value={pct(overall.data?.overall_percentage)}
          icon={<ClipboardCheck className="h-5 w-5" />}
          tone={Number(overall.data?.overall_percentage ?? 0) >= 75 ? 'emerald' : 'rose'}
          hint={`${num(overall.data?.attended_classes)} of ${num(overall.data?.total_classes)} classes`}
        />
        <StatCard label="Outstanding fees" value={money(fees.data?.total_due)} icon={<IndianRupee className="h-5 w-5" />} tone={Number(fees.data?.total_due ?? 0) > 0 ? 'amber' : 'emerald'} hint={`${num(fees.data?.total_bills)} bills`} />
        <StatCard label="Latest CGPA" value={num(latest?.cgpa, 2)} icon={<Award className="h-5 w-5" />} tone="sky" hint={`SGPA ${num(latest?.sgpa, 2)}`} />
        <StatCard label="Subjects below 75%" value={num(weak.length)} icon={<TriangleAlert className="h-5 w-5" />} tone={weak.length ? 'rose' : 'emerald'} hint={weak.length ? 'Exam registration at risk' : 'All subjects safe'} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="card-pad lg:col-span-2">
          <SectionTitle to="/attendance/me">Attendance by subject</SectionTitle>
          <div className="space-y-2.5">
            {attendanceRows.slice(0, 8).map((r) => (
              <div key={String(r.offering_id)}>
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="truncate font-medium text-slate-700">
                    {String(r.subject_code)} · {String(r.subject_name)}
                  </span>
                  <span className={`shrink-0 ${Number(r.attendance_percentage) < 75 ? 'text-rose-600' : 'text-slate-500'}`}>
                    {pct(r.attendance_percentage)} ({num(r.attended_classes)}/{num(r.total_classes)})
                  </span>
                </div>
                <ProgressBar value={Number(r.attendance_percentage)} />
              </div>
            ))}
            {!attendanceRows.length ? <p className="py-6 text-center text-sm text-slate-500">No attendance records yet.</p> : null}
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Latest notices</h2>
            <Link to="/notifications" className="text-xs text-brand-700 hover:underline">All</Link>
          </div>
          <div className="divide-y divide-slate-100">
            {(notes.data ?? []).map((n) => (
              <div key={String(n.notification_id)} className="px-4 py-2.5">
                <p className="truncate text-sm font-medium text-slate-800">{String(n.title)}</p>
                <p className="line-clamp-2 text-xs text-slate-500">{String(n.message)}</p>
                <p className="mt-0.5 text-[11px] text-slate-400">{dateTimeStr(n.created_at)}</p>
              </div>
            ))}
            {!notes.data?.length ? <p className="px-4 py-6 text-center text-sm text-slate-500">No notifications.</p> : null}
          </div>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card className="card-pad">
          <SectionTitle to="/exams/results">Academic trend</SectionTitle>
          {trend.length ? (
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trend} margin={{ top: 5, right: 8, bottom: 0, left: -18 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="sem" fontSize={10} />
                  <YAxis domain={[0, 10]} fontSize={10} />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Line type="monotone" dataKey="sgpa" stroke="#4f46e5" strokeWidth={2} dot={{ r: 3 }} name="SGPA" />
                  <Line type="monotone" dataKey="cgpa" stroke="#059669" strokeWidth={2} dot={{ r: 3 }} name="CGPA" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="py-8 text-center text-sm text-slate-500">No published results yet.</p>
          )}
        </Card>

        <Card>
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">My timetable</h2>
            <Link to="/academics/timetable" className="text-xs text-brand-700 hover:underline">Full week</Link>
          </div>
          <div className="max-h-64 divide-y divide-slate-100 overflow-y-auto">
            {(timetable.data ?? []).slice(0, 10).map((t) => (
              <div key={String(t.timetable_id)} className="flex items-center justify-between px-4 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-800">{String(t.subjectCode)} · {String(t.subjectName)}</p>
                  <p className="truncate text-xs text-slate-500">{String(t.facultyName ?? '')} · Room {String(t.room_number)}</p>
                </div>
                <span className="ml-3 shrink-0 text-xs text-slate-600">
                  {titleCase(String(t.day_of_week)).slice(0, 3)} {String(t.slot_label)}
                </span>
              </div>
            ))}
            {!timetable.data?.length ? <p className="px-4 py-6 text-center text-sm text-slate-500">No timetable published.</p> : null}
          </div>
        </Card>
      </div>
    </>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();
  if (user?.role === 'STUDENT') return <StudentDashboard />;
  if (user?.role === 'FACULTY') return <FacultyDashboard />;
  return <StaffDashboard />;
}
