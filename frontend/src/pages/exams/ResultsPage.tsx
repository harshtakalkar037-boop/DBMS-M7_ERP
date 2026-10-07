import { useState } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Award, Trophy, TrendingUp, BookOpen } from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { Card, PageHeader, StatCard, Tabs, DataTable, StatusBadge, ProgressBar, ErrorBox, useFetch, type Column } from '../../components/ui';
import { num, pct, titleCase } from '../../lib/format';
interface DeptRow { departmentId: number; departmentCode: string; departmentName: string; students: number; averageSgpa: string; averageCgpa: string; failed: string; passPercentage: string; }
interface SubjectRow { subject_code: string; subject_name: string; attempts: number; failures: string; failure_rate: string; average_percentage: string; average_grade_points: string; department_code: string; }
interface RankRow { student_id: number; roll_number: string; full_name: string; cgpa: string; earned_credits: number; backlog_count: number; class_rank: number; department_rank: number; university_rank: number; department_id: number; }
interface StudentResult { result_id: number; semester_id: number; semester_no?: number; exam_id: number; sgpa: string; cgpa: string; total_credits: number; earned_credits: number; backlog_count: number; result_status: string; remarks: string | null; published_on?: string | null; }

export default function ResultsPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState(user?.role === 'STUDENT' ? 'mine' : 'rankings');

  const dept = useFetch(() => api.get<DeptRow[]>('/exams/results/department'), []);
  const subjects = useFetch(() => api.get<SubjectRow[]>('/exams/results/subjects', { limit: 200 }), []);
  const rankings = useFetch(() => api.get<RankRow[]>('/exams/results/rankings', { limit: 200 }), []);
  const mine = useFetch(() => (user?.role === 'STUDENT' ? api.get<StudentResult[]>('/exams/results/me') : Promise.resolve([])), [user?.role]);

  const deptCols: Column<DeptRow>[] = [
    { key: 'departmentCode', header: 'Code', render: (r) => <span className="font-medium text-slate-800">{r.departmentCode}</span> },
    { key: 'departmentName', header: 'Department' },
    { key: 'students', header: 'Students', align: 'right' },
    { key: 'averageSgpa', header: 'Avg SGPA', align: 'right', render: (r) => num(r.averageSgpa, 2) },
    { key: 'averageCgpa', header: 'Avg CGPA', align: 'right', render: (r) => <b>{num(r.averageCgpa, 2)}</b> },
    { key: 'failed', header: 'Failed', align: 'right', render: (r) => (Number(r.failed) ? <span className="chip bg-rose-100 text-rose-700">{r.failed}</span> : '0') },
    {
      key: 'passPercentage', header: 'Pass rate',
      render: (r) => (
        <div className="flex w-36 items-center gap-2">
          <ProgressBar value={Number(r.passPercentage)} />
          <span className="w-12 shrink-0 text-right text-xs">{pct(r.passPercentage, 0)}</span>
        </div>
      ),
    },
  ];

  const subjectCols: Column<SubjectRow>[] = [
    { key: 'subject_code', header: 'Code', render: (r) => <span className="font-medium text-slate-800">{r.subject_code}</span> },
    { key: 'subject_name', header: 'Subject' },
    { key: 'department_code', header: 'Dept' },
    { key: 'attempts', header: 'Attempts', align: 'right' },
    { key: 'failures', header: 'Failures', align: 'right', render: (r) => (Number(r.failures) ? <span className="chip bg-rose-100 text-rose-700">{r.failures}</span> : '0') },
    { key: 'failure_rate', header: 'Failure rate', align: 'right', render: (r) => pct(r.failure_rate, 1) },
    { key: 'average_percentage', header: 'Avg %', align: 'right', render: (r) => num(r.average_percentage, 1) },
    { key: 'average_grade_points', header: 'Avg points', align: 'right', render: (r) => num(r.average_grade_points, 2) },
  ];

  const rankCols: Column<RankRow>[] = [
    { key: 'university_rank', header: 'University rank', render: (r) => <span className="chip bg-brand-100 text-brand-700">#{r.university_rank}</span> },
    { key: 'department_rank', header: 'Dept rank', align: 'right', render: (r) => `#${r.department_rank}` },
    { key: 'class_rank', header: 'Class rank', align: 'right', render: (r) => `#${r.class_rank}` },
    { key: 'roll_number', header: 'Roll no.', render: (r) => <span className="font-medium text-slate-800">{r.roll_number}</span> },
    { key: 'full_name', header: 'Student' },
    { key: 'cgpa', header: 'CGPA', align: 'right', render: (r) => <b>{num(r.cgpa, 2)}</b> },
    { key: 'earned_credits', header: 'Credits', align: 'right' },
    { key: 'backlog_count', header: 'Backlogs', align: 'right', render: (r) => (Number(r.backlog_count) ? <span className="chip bg-rose-100 text-rose-700">{r.backlog_count}</span> : '0') },
  ];

  const myCols: Column<StudentResult>[] = [
    { key: 'semester_no', header: 'Semester', render: (r) => `Semester ${r.semester_no ?? r.semester_id}` },
    { key: 'sgpa', header: 'SGPA', align: 'right', render: (r) => num(r.sgpa, 2) },
    { key: 'cgpa', header: 'CGPA', align: 'right', render: (r) => <b>{num(r.cgpa, 2)}</b> },
    { key: 'earned_credits', header: 'Credits earned', align: 'right', render: (r) => `${num(r.earned_credits)}/${num(r.total_credits)}` },
    { key: 'backlog_count', header: 'Backlogs', align: 'right', render: (r) => (Number(r.backlog_count) ? <span className="chip bg-rose-100 text-rose-700">{r.backlog_count}</span> : '0') },
    { key: 'result_status', header: 'Result', render: (r) => <StatusBadge value={r.result_status} /> },
    { key: 'remarks', header: 'Remarks', render: (r) => r.remarks ?? <span className="text-slate-400">—</span> },
  ];

  const myRows = mine.data ?? [];
  const latest = myRows[0];

  return (
    <>
      <PageHeader
        title="Results & analytics"
        subtitle="Ranks are produced with SQL window functions (RANK / DENSE_RANK / ROW_NUMBER) over the results table."
        icon={<Award className="h-5 w-5" />}
      />

      {user?.role === 'STUDENT' && latest ? (
        <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label="Latest CGPA" value={num(latest.cgpa, 2)} icon={<Trophy className="h-5 w-5" />} tone="brand" />
          <StatCard label="Latest SGPA" value={num(latest.sgpa, 2)} icon={<TrendingUp className="h-5 w-5" />} tone="emerald" />
          <StatCard label="Credits earned" value={`${num(latest.earned_credits)}/${num(latest.total_credits)}`} tone="sky" />
          <StatCard label="Backlogs" value={num(latest.backlog_count)} tone={Number(latest.backlog_count) ? 'rose' : 'emerald'} icon={<BookOpen className="h-5 w-5" />} />
        </div>
      ) : null}

      <Tabs
        active={tab}
        onChange={setTab}
        tabs={[
          ...(user?.role === 'STUDENT' ? [{ key: 'mine', label: 'My results' }] : []),
          { key: 'rankings', label: 'Rankings' },
          { key: 'department', label: 'Department analysis' },
          { key: 'subjects', label: 'Subject analysis' },
        ]}
      />

      {tab === 'mine' ? (
        <Card>{mine.error ? <ErrorBox message={mine.error} onRetry={mine.reload} /> : <DataTable columns={myCols} rows={myRows} loading={mine.loading} rowKey={(r) => r.result_id} empty="No published results" />}</Card>
      ) : null}

      {tab === 'rankings' ? (
        <Card>{rankings.error ? <ErrorBox message={rankings.error} onRetry={rankings.reload} /> : <DataTable columns={rankCols} rows={rankings.data ?? []} loading={rankings.loading} rowKey={(r) => r.student_id} empty="No rankings yet" />}</Card>
      ) : null}

      {tab === 'department' ? (
        <>
          <Card className="card-pad mb-4">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Average CGPA by department</h2>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dept.data ?? []} margin={{ top: 5, right: 8, bottom: 0, left: -20 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="departmentCode" fontSize={10} />
                  <YAxis domain={[0, 10]} fontSize={10} />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="averageSgpa" fill="#a5b4fc" radius={[3, 3, 0, 0]} name="Avg SGPA" />
                  <Bar dataKey="averageCgpa" fill="#4f46e5" radius={[3, 3, 0, 0]} name="Avg CGPA" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
          <Card>{dept.error ? <ErrorBox message={dept.error} onRetry={dept.reload} /> : <DataTable columns={deptCols} rows={dept.data ?? []} loading={dept.loading} rowKey={(r) => r.departmentId} empty="No result data" />}</Card>
        </>
      ) : null}

      {tab === 'subjects' ? (
        <Card>
          {subjects.error ? <ErrorBox message={subjects.error} onRetry={subjects.reload} /> : (
            <DataTable columns={subjectCols} rows={subjects.data ?? []} loading={subjects.loading} rowKey={(r) => r.subject_code} empty="No subject analytics yet" />
          )}
        </Card>
      ) : null}

      <p className="mt-3 text-xs text-slate-400">
        Ranks are recomputed by <code className="rounded bg-slate-200 px-1">sp_process_results</code>; the query uses
        {' '}{titleCase('RANK() OVER (PARTITION BY department ORDER BY cgpa DESC)')} for department rank and a plain
        RANK over the whole university for the overall rank.
      </p>
    </>
  );
}
