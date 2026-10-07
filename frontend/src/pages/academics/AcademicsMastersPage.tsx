import { useState } from 'react';
import { Building2, CalendarRange, Layers } from 'lucide-react';
import { api } from '../../lib/api';
import { Card, PageHeader, StatCard, Tabs, DataTable, ErrorBox, useFetch, StatusBadge, type Column } from '../../components/ui';
import { dateStr, num, titleCase } from '../../lib/format';
interface Department { department_id: number; department_code: string; name: string; short_name: string; established_year: number; status: string; email: string; }
interface Program { program_id: number; program_code: string; name: string; level: string; duration_years: number; total_semesters: number; total_credits: number; intake: number; status: string; }
interface Batch { batch_id: number; batch_code: string; programCode: string; start_year: number; end_year: number; current_semester_no: number; strength: number; studentCount: number; status: string; yearLabel: string; }
interface Section { section_id: number; section_code: string; programCode: string; batchCode: string; capacity: number; room_number: string; classTeacherFirst: string | null; classTeacherLast: string | null; studentCount: number; status: string; }
interface Year { academic_year_id: number; year_label: string; start_date: string; end_date: string; is_current: boolean; semesterCount: number; status: string; }
interface Semester { semester_id: number; semester_no: number; name: string; start_date: string; end_date: string; is_current: boolean; result_published: boolean; yearLabel: string; }

export default function AcademicsMastersPage() {
  const [tab, setTab] = useState('departments');

  const departments = useFetch(() => api.get<Department[]>('/academics/departments', { limit: 100 }), []);
  const programs = useFetch(() => api.get<Program[]>('/academics/programs/all', { limit: 200 }), []);
  const batches = useFetch(() => api.get<Batch[]>('/academics/batches', { limit: 300 }), []);
  const sections = useFetch(() => api.get<Section[]>('/academics/sections', { limit: 300 }), []);
  const years = useFetch(() => api.get<Year[]>('/academics/years'), []);
  const semesters = useFetch(() => api.get<Semester[]>('/academics/semesters', { limit: 200 }), []);

  const deptCols: Column<Department>[] = [
    { key: 'department_code', header: 'Code', render: (r) => <span className="font-medium text-slate-800">{r.department_code}</span> },
    { key: 'name', header: 'Department' },
    { key: 'short_name', header: 'Short name' },
    { key: 'established_year', header: 'Established', align: 'right' },
    { key: 'email', header: 'Email' },
    { key: 'status', header: 'Status', render: (r) => <StatusBadge value={r.status} /> },
  ];

  const progCols: Column<Program>[] = [
    { key: 'program_code', header: 'Code', render: (r) => <span className="font-medium text-slate-800">{r.program_code}</span> },
    { key: 'name', header: 'Program' },
    { key: 'level', header: 'Level', render: (r) => <span className="chip bg-slate-100 text-slate-600">{r.level}</span> },
    { key: 'duration_years', header: 'Years', align: 'right' },
    { key: 'total_semesters', header: 'Semesters', align: 'right' },
    { key: 'total_credits', header: 'Credits', align: 'right' },
    { key: 'intake', header: 'Intake', align: 'right' },
    { key: 'status', header: 'Status', render: (r) => <StatusBadge value={r.status} /> },
  ];

  const batchCols: Column<Batch>[] = [
    { key: 'batch_code', header: 'Batch', render: (r) => <span className="font-medium text-slate-800">{r.batch_code}</span> },
    { key: 'programCode', header: 'Program' },
    { key: 'yearLabel', header: 'Admission year' },
    { key: 'start_year', header: 'From', align: 'right' },
    { key: 'end_year', header: 'To', align: 'right' },
    { key: 'current_semester_no', header: 'Current sem', align: 'right' },
    { key: 'strength', header: 'Sanctioned', align: 'right' },
    { key: 'studentCount', header: 'Enrolled', align: 'right' },
    { key: 'status', header: 'Status', render: (r) => <StatusBadge value={r.status} /> },
  ];

  const sectionCols: Column<Section>[] = [
    { key: 'section_code', header: 'Section', render: (r) => <span className="font-medium text-slate-800">{r.section_code}</span> },
    { key: 'programCode', header: 'Program' },
    { key: 'batchCode', header: 'Batch' },
    { key: 'room_number', header: 'Room' },
    { key: 'capacity', header: 'Capacity', align: 'right' },
    { key: 'studentCount', header: 'Students', align: 'right' },
    {
      key: 'classTeacherFirst', header: 'Class teacher',
      render: (r) => (r.classTeacherFirst ? `${r.classTeacherFirst} ${r.classTeacherLast ?? ''}` : <span className="text-slate-400">Not assigned</span>),
    },
    { key: 'status', header: 'Status', render: (r) => <StatusBadge value={r.status} /> },
  ];

  const yearCols: Column<Year>[] = [
    { key: 'year_label', header: 'Academic year', render: (r) => <span className="font-medium text-slate-800">{r.year_label}</span> },
    { key: 'start_date', header: 'Starts', render: (r) => dateStr(r.start_date) },
    { key: 'end_date', header: 'Ends', render: (r) => dateStr(r.end_date) },
    { key: 'semesterCount', header: 'Semesters', align: 'right' },
    {
      key: 'is_current', header: 'Current',
      render: (r) => (r.is_current ? <span className="chip bg-emerald-100 text-emerald-700">Current</span> : <span className="text-slate-400">—</span>),
    },
  ];

  const semCols: Column<Semester>[] = [
    { key: 'name', header: 'Semester', render: (r) => <span className="font-medium text-slate-800">{r.name}</span> },
    { key: 'semester_no', header: 'No.', align: 'right' },
    { key: 'yearLabel', header: 'Academic year' },
    { key: 'start_date', header: 'Starts', render: (r) => dateStr(r.start_date) },
    { key: 'end_date', header: 'Ends', render: (r) => dateStr(r.end_date) },
    { key: 'is_current', header: 'Current', render: (r) => (r.is_current ? <span className="chip bg-emerald-100 text-emerald-700">Current</span> : <span className="text-slate-400">—</span>) },
    { key: 'result_published', header: 'Results', render: (r) => (r.result_published ? <span className="chip bg-brand-100 text-brand-700">Published</span> : <span className="text-slate-400">Pending</span>) },
  ];

  const current = (tab === 'departments' && departments.error) || (tab === 'programs' && programs.error) ||
    (tab === 'batches' && batches.error) || (tab === 'sections' && sections.error) ||
    (tab === 'years' && years.error) || (tab === 'semesters' && semesters.error);

  return (
    <>
      <PageHeader
        title="Academic masters"
        subtitle="Departments, programs, batches, sections, academic years and semesters — the shared reference data every other module joins to."
        icon={<Building2 className="h-5 w-5" />}
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Departments" value={num(departments.data?.length)} icon={<Building2 className="h-5 w-5" />} />
        <StatCard label="Programs" value={num(programs.data?.length)} tone="emerald" />
        <StatCard label="Batches" value={num(batches.data?.length)} icon={<Layers className="h-5 w-5" />} tone="sky" />
        <StatCard label="Sections" value={num(sections.data?.length)} icon={<CalendarRange className="h-5 w-5" />} tone="amber" />
      </div>

      <Tabs
        active={tab}
        onChange={setTab}
        tabs={[
          { key: 'departments', label: 'Departments', count: departments.data?.length },
          { key: 'programs', label: 'Programs', count: programs.data?.length },
          { key: 'batches', label: 'Batches', count: batches.data?.length },
          { key: 'sections', label: 'Sections', count: sections.data?.length },
          { key: 'years', label: 'Academic years', count: years.data?.length },
          { key: 'semesters', label: 'Semesters', count: semesters.data?.length },
        ]}
      />

      <Card>
        {current ? <ErrorBox message="Could not load this master." /> : (
          <>
            {tab === 'departments' ? <DataTable columns={deptCols} rows={departments.data ?? []} loading={departments.loading} rowKey={(r) => r.department_id} /> : null}
            {tab === 'programs' ? <DataTable columns={progCols} rows={programs.data ?? []} loading={programs.loading} rowKey={(r) => r.program_id} /> : null}
            {tab === 'batches' ? <DataTable columns={batchCols} rows={batches.data ?? []} loading={batches.loading} rowKey={(r) => r.batch_id} /> : null}
            {tab === 'sections' ? <DataTable columns={sectionCols} rows={sections.data ?? []} loading={sections.loading} rowKey={(r) => r.section_id} /> : null}
            {tab === 'years' ? <DataTable columns={yearCols} rows={years.data ?? []} loading={years.loading} rowKey={(r) => r.academic_year_id} /> : null}
            {tab === 'semesters' ? <DataTable columns={semCols} rows={semesters.data ?? []} loading={semesters.loading} rowKey={(r) => r.semester_id} /> : null}
          </>
        )}
      </Card>

      <p className="mt-3 text-xs text-slate-400">
        Titles use {titleCase('snake_case column names')} straight from MySQL — nothing on these screens is hard-coded.
      </p>
    </>
  );
}
