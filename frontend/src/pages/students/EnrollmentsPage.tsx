import { useMemo, useState } from 'react';
import { Layers, Zap } from 'lucide-react';
import { api, errMsg } from '../../lib/api';
import { useToast } from '../../components/toast';
import { Card, PageHeader, SelectField, Tabs, DataTable, Pagination, StatusBadge, ErrorBox, useFetch, type Column, EmptyState } from '../../components/ui';
import { dateStr, num, titleCase } from '../../lib/format';
interface Enrollment {
  enrollment_id: number; student_id: number; roll_number: string; full_name: string;
  offering_id: number; subject_code: string; subject_name: string; semester_no: number;
  section_code: string; enrollment_date: string; status: string; grade: string | null;
}
interface BulkResult { enrolled: number; skipped: number; message?: string; }

export default function EnrollmentsPage() {
  const toast = useToast();
  const [tab, setTab] = useState('list');
  const [filters, setFilters] = useState({ programId: '', semesterId: '', sectionId: '', status: '' });
  const [page, setPage] = useState(1);

  const programs = useFetch(() => api.get<{ program_id: number; program_name: string }[]>('/academics/programs/all', { limit: 200 }), []);
  const semesters = useFetch(() => api.get<{ semester_id: number; semester_no: number; name: string }[]>('/academics/semesters', { limit: 200 }), []);
  const sections = useFetch(() => api.get<{ section_id: number; section_code: string }[]>('/academics/sections', { limit: 300 }), []);

  const params = useMemo(() => ({
    page, limit: 25,
    programId: filters.programId || undefined,
    semesterId: filters.semesterId || undefined,
    sectionId: filters.sectionId || undefined,
    status: filters.status || undefined,
  }), [page, filters]);

  const { data, loading, error, reload } = useFetch(() => api.page<Enrollment>('/academics/enrollments', params), [params]);

  const [bulk, setBulk] = useState({ programId: '', semesterId: '', sectionId: '' });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<BulkResult | null>(null);

  const runBulk = async () => {
    if (!bulk.programId || !bulk.semesterId) { toast.error('Choose a program and a semester first.'); return; }
    setBusy(true);
    setResult(null);
    try {
      const res = await api.post<BulkResult>('/academics/enrollments/bulk', {
        programId: Number(bulk.programId),
        semesterId: Number(bulk.semesterId),
        sectionId: bulk.sectionId ? Number(bulk.sectionId) : null,
      });
      setResult(res);
      toast.success(res.message ?? 'Bulk enrollment complete.');
      reload();
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };

  const columns: Column<Enrollment>[] = [
    { key: 'roll_number', header: 'Roll no.', render: (r) => <span className="font-medium text-slate-800">{r.roll_number}</span> },
    { key: 'full_name', header: 'Student' },
    { key: 'subject_code', header: 'Subject', render: (r) => <span className="text-xs">{r.subject_code}</span> },
    { key: 'subject_name', header: 'Name' },
    { key: 'semester_no', header: 'Sem', align: 'right', render: (r) => `Sem ${r.semester_no}` },
    { key: 'section_code', header: 'Section' },
    { key: 'enrollment_date', header: 'Enrolled on', render: (r) => dateStr(r.enrollment_date) },
    { key: 'status', header: 'Status', render: (r) => <StatusBadge value={r.status} /> },
    { key: 'grade', header: 'Grade', align: 'right', render: (r) => r.grade ?? <span className="text-slate-400">—</span> },
  ];

  return (
    <>
      <PageHeader
        title="Enrollment"
        subtitle="Enroll students into course offerings one at a time, or enrol a whole section with sp_bulk_enroll_section."
        icon={<Layers className="h-5 w-5" />}
      />

      <Tabs active={tab} onChange={setTab} tabs={[{ key: 'list', label: 'Enrollment register' }, { key: 'bulk', label: 'Bulk enroll a cohort' }]} />

      {tab === 'list' ? (
        <>
          <Card className="mb-4">
            <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
              <SelectField placeholder="All programs" value={filters.programId} onChange={(e) => { setFilters({ ...filters, programId: e.target.value }); setPage(1); }} options={(programs.data ?? []).map((p) => ({ value: p.program_id, label: p.program_name }))} />
              <SelectField placeholder="All semesters" value={filters.semesterId} onChange={(e) => { setFilters({ ...filters, semesterId: e.target.value }); setPage(1); }} options={(semesters.data ?? []).map((s) => ({ value: s.semester_id, label: `${titleCase(s.name)} (Sem ${s.semester_no})` }))} />
              <SelectField placeholder="All sections" value={filters.sectionId} onChange={(e) => { setFilters({ ...filters, sectionId: e.target.value }); setPage(1); }} options={(sections.data ?? []).map((s) => ({ value: s.section_id, label: s.section_code }))} />
              <SelectField placeholder="All statuses" value={filters.status} onChange={(e) => { setFilters({ ...filters, status: e.target.value }); setPage(1); }} options={['ACTIVE', 'DROPPED', 'COMPLETED'].map((s) => ({ value: s, label: titleCase(s) }))} />
            </div>
          </Card>
          <Card>
            {error ? <ErrorBox message={error} onRetry={reload} /> : (
              <>
                <DataTable columns={columns} rows={data?.rows ?? []} loading={loading} rowKey={(r) => r.enrollment_id} empty="No enrollments match these filters" />
                <Pagination page={data?.meta.page ?? 1} totalPages={data?.meta.totalPages ?? 1} total={data?.meta.total ?? 0} onPage={setPage} />
              </>
            )}
          </Card>
        </>
      ) : (
        <Card className="card-pad max-w-2xl">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Enrol a whole cohort</h2>
          <p className="mt-1 text-xs text-slate-500">
            Runs <code className="rounded bg-slate-100 px-1">sp_bulk_enroll_section</code>. Every active student of the
            program/semester is enrolled into each offering of that semester. The procedure is idempotent — students
            who are already enrolled are skipped instead of being duplicated, so it is safe to run twice.
          </p>
          <div className="mt-4 grid gap-x-4 sm:grid-cols-3">
            <SelectField label="Program" placeholder="Select" value={bulk.programId} onChange={(e) => setBulk({ ...bulk, programId: e.target.value })} options={(programs.data ?? []).map((p) => ({ value: p.program_id, label: p.program_name }))} />
            <SelectField label="Semester" placeholder="Select" value={bulk.semesterId} onChange={(e) => setBulk({ ...bulk, semesterId: e.target.value })} options={(semesters.data ?? []).map((s) => ({ value: s.semester_id, label: `Semester ${s.semester_no}` }))} />
            <SelectField label="Section (optional)" placeholder="All sections" value={bulk.sectionId} onChange={(e) => setBulk({ ...bulk, sectionId: e.target.value })} options={(sections.data ?? []).map((s) => ({ value: s.section_id, label: s.section_code }))} />
          </div>
          <button type="button" className="btn-primary mt-2" onClick={runBulk} disabled={busy}>
            {busy ? 'Enrolling…' : (<><Zap className="h-4 w-4" /> Run bulk enrollment</>)}
          </button>

          {result ? (
            <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
              <p className="font-semibold">Done</p>
              <p className="mt-0.5">
                {num(result.enrolled)} new enrollment{Number(result.enrolled) === 1 ? '' : 's'} created,
                {' '}{num(result.skipped)} skipped (already enrolled).
              </p>
            </div>
          ) : (
            <EmptyState title="No run yet" hint="Pick a program and semester, then run the procedure. Run it twice to prove it is idempotent." />
          )}
        </Card>
      )}
    </>
  );
}
