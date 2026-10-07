import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, BookOpen, IndianRupee } from 'lucide-react';
import { api } from '../../lib/api';
import { Card, StatCard, Tabs, DataTable, ProgressBar, Loading, ErrorBox, EmptyState, useFetch } from '../../components/ui';
import { initials, colorFor, dateStr, money, num, pct, titleCase } from '../../lib/format';
interface Faculty {
  faculty_id: number; employee_code: string; first_name: string; last_name: string;
  email: string; phone: string; date_of_birth: string; gender: string;
  department_id: number; departmentName?: string; departmentCode?: string; designation?: string;
  employment_type: string; qualification: string; specialization: string;
  experience_years: number; joining_date: string; basic_salary: string;
  hra: string; da: string; ta: string; special_allowance: string; pf_percent: string;
  bank_account: string; status: string;
}
interface SubjectRow { offeringId: number; subjectCode: string; subjectName: string; credits: number; programCode: string; sectionCode: string; semesterNo: number; enrolled: number; }
interface Balance { balance_id: number; leave_type: string; allotted: number; used: number; remaining: string; }
interface PayrollRow { payroll_id: number; pay_month: number; pay_year: number; gross_salary: string; net_salary: string; lop_days: number; status: string; }

export default function FacultyDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [tab, setTab] = useState('profile');

  const faculty = useFetch<Faculty>(() => api.get<Faculty>(`/faculty/${id}`), [id]);
  const subjects = useFetch<SubjectRow[]>(() => api.get<SubjectRow[]>(`/faculty/${id}/subjects`), [id]);
  const balances = useFetch<Balance[]>(() => api.get<Balance[]>(`/faculty/${id}/leave-balances`), [id]);
  const payroll = useFetch<PayrollRow[]>(() => api.get<PayrollRow[]>(`/faculty/payroll?facultyId=${id}&limit=24`), [id]);

  if (faculty.loading) return <Loading label="Loading faculty record…" />;
  if (faculty.error) return <ErrorBox message={faculty.error} onRetry={faculty.reload} />;
  if (!faculty.data) return null;

  const f = faculty.data;
  const ytdNet = (payroll.data ?? []).reduce((s, r) => s + Number(r.net_salary ?? 0), 0);

  return (
    <>
      <Link to="/faculty" className="mb-3 inline-flex items-center gap-1 text-sm text-brand-700 hover:underline">
        <ArrowLeft className="h-4 w-4" /> Back to faculty
      </Link>

      <Card className="card-pad mb-4">
        <div className="flex flex-wrap items-start gap-4">
          <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full text-xl font-bold text-white" style={{ background: colorFor(`${f.first_name} ${f.last_name}`) }}>
            {initials(`${f.first_name} ${f.last_name}`)}
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-semibold text-slate-900">{f.first_name} {f.last_name}</h1>
            <p className="text-sm text-slate-500">{f.employee_code} · {f.designation ?? 'Faculty'} · {titleCase(f.employment_type)}</p>
            <p className="text-sm text-slate-600">{f.departmentName ?? ''} · {f.qualification}{f.specialization ? ` · ${f.specialization}` : ''}</p>
            <p className="mt-0.5 text-xs text-slate-400">{f.email} · {f.phone} · Joined {dateStr(f.joining_date)}</p>
          </div>
        </div>
      </Card>

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Subjects this term" value={num(subjects.data?.length)} icon={<BookOpen className="h-5 w-5" />} />
        <StatCard label="Students taught" value={num((subjects.data ?? []).reduce((s, r) => s + Number(r.enrolled ?? 0), 0))} tone="emerald" />
        <StatCard label="Basic salary" value={money(f.basic_salary)} icon={<IndianRupee className="h-5 w-5" />} tone="slate" />
        <StatCard label="Net paid (last 12 slips)" value={money(ytdNet)} tone="amber" />
      </div>

      <Tabs
        active={tab}
        onChange={setTab}
        tabs={[
          { key: 'profile', label: 'Profile' },
          { key: 'subjects', label: 'Subjects', count: subjects.data?.length },
          { key: 'leaves', label: 'Leave balances', count: balances.data?.length },
          { key: 'payroll', label: 'Payroll history', count: payroll.data?.length },
        ]}
      />

      {tab === 'profile' ? (
        <Card>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 px-4 py-4 text-sm sm:grid-cols-3">
            {[
              ['Employee code', f.employee_code], ['Designation', f.designation],
              ['Department', f.departmentName], ['Employment type', titleCase(f.employment_type)],
              ['Qualification', f.qualification], ['Specialization', f.specialization],
              ['Experience', `${num(f.experience_years)} years`], ['Date of birth', dateStr(f.date_of_birth)],
              ['Gender', titleCase(f.gender)], ['Joining date', dateStr(f.joining_date)],
              ['Basic', money(f.basic_salary)], ['HRA', money(f.hra)],
              ['DA', money(f.da)], ['TA', money(f.ta)],
              ['Special allowance', money(f.special_allowance)], ['PF %', pct(f.pf_percent, 0)],
              ['Bank account', f.bank_account], ['Status', titleCase(f.status)],
            ].map(([k, v]) => (
              <div key={String(k)}>
                <dt className="text-[11px] uppercase tracking-wide text-slate-400">{k}</dt>
                <dd className="truncate font-medium text-slate-800">{String(v ?? '—')}</dd>
              </div>
            ))}
          </dl>
        </Card>
      ) : null}

      {tab === 'subjects' ? (
        <Card>
          {(subjects.data ?? []).length ? (
            <DataTable
              rowKey={(r) => r.offeringId}
              rows={subjects.data!}
              columns={[
                { key: 'subjectCode', header: 'Code', render: (r) => <span className="font-medium text-slate-800">{r.subjectCode}</span> },
                { key: 'subjectName', header: 'Subject' },
                { key: 'programCode', header: 'Program' },
                { key: 'semesterNo', header: 'Semester', align: 'right' },
                { key: 'sectionCode', header: 'Section' },
                { key: 'credits', header: 'Credits', align: 'right' },
                { key: 'enrolled', header: 'Enrolled', align: 'right' },
              ]}
            />
          ) : <EmptyState title="No subjects assigned" />}
        </Card>
      ) : null}

      {tab === 'leaves' ? (
        <Card>
          <div className="space-y-3 p-4">
            {(balances.data ?? []).length ? balances.data!.map((b) => (
              <div key={b.leave_type}>
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="font-medium text-slate-700">{titleCase(b.leave_type)}</span>
                  <span className="text-slate-500">{num(b.remaining, 1)} remaining of {num(b.allotted)} · {num(b.used)} used</span>
                </div>
                <ProgressBar value={(Number(b.remaining) / Math.max(1, Number(b.allotted))) * 100} />
              </div>
            )) : <EmptyState title="No leave balances configured" />}
          </div>
        </Card>
      ) : null}

      {tab === 'payroll' ? (
        <Card>
          {(payroll.data ?? []).length ? (
            <DataTable
              rowKey={(r) => r.payroll_id}
              rows={payroll.data!}
              columns={[
                { key: 'pay_month', header: 'Month', render: (r) => `${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][Number(r.pay_month) - 1] ?? r.pay_month} ${r.pay_year}` },
                { key: 'gross_salary', header: 'Gross', align: 'right', render: (r) => money(r.gross_salary) },
                { key: 'net_salary', header: 'Net', align: 'right', render: (r) => <b>{money(r.net_salary)}</b> },
                { key: 'lop_days', header: 'LOP days', align: 'right', render: (r) => (Number(r.lop_days) ? <span className="chip bg-rose-100 text-rose-700">{r.lop_days}</span> : '0') },
                { key: 'status', header: 'Status', render: (r) => <span className={`chip ${r.status === 'PAID' ? 'bg-emerald-100 text-emerald-700' : r.status === 'APPROVED' ? 'bg-brand-100 text-brand-700' : 'bg-slate-100 text-slate-600'}`}>{titleCase(r.status)}</span> },
              ]}
            />
          ) : <EmptyState title="No payslips yet" />}
        </Card>
      ) : null}
    </>
  );
}
