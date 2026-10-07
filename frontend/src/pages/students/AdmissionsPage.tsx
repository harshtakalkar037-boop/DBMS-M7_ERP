import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { FileText, Download } from 'lucide-react';
import { api, errMsg } from '../../lib/api';
import { useToast } from '../../components/toast';
import { Card, PageHeader, StatCard, SearchInput, SelectField, Tabs, DataTable, Pagination, StatusBadge, ErrorBox, Modal, TextAreaField, useFetch, useDebounced, type Column } from '../../components/ui';
import { downloadCsv } from '../../lib/csv';
import { dateStr, num } from '../../lib/format';
interface Application {
  admission_id: number; application_no: string; first_name: string; last_name: string;
  email: string; phone: string; programCode: string; programName: string; categoryCode: string;
  marks_10: string; marks_12: string; entrance_score: string; status: string;
  application_date: string; rollNumber: string | null; student_id: number | null; city: string;
}
interface Stats { total: number; applied: string; underReview: string; approved: string; rejected: string; waitlisted: string; avgEntranceMarks: string; }


export default function AdmissionsPage() {
  const toast = useToast();
  const [tab, setTab] = useState('APPLIED');
  const [search, setSearch] = useState('');
  const [programId, setProgramId] = useState('');
  const [page, setPage] = useState(1);
  const term = useDebounced(search, 350);

  const stats = useFetch(() => api.get<Stats>('/students/admissions/stats'), []);
  const programs = useFetch(() => api.get<{ program_id: number; program_name: string }[]>('/academics/programs/all', { limit: 200 }), []);

  const params = useMemo(() => ({
    page, limit: 25,
    status: tab === 'ALL' ? undefined : tab,
    search: term || undefined,
    programId: programId || undefined,
  }), [page, tab, term, programId]);

  const { data, loading, error, reload } = useFetch(() => api.page<Application>('/students/admissions', params), [params]);
  const rows = data?.rows ?? [];

  const [review, setReview] = useState<Application | null>(null);
  const [decision, setDecision] = useState<'APPROVED' | 'REJECTED' | 'WAITLISTED'>('APPROVED');
  const [remarks, setRemarks] = useState('');
  const [busy, setBusy] = useState(false);

  const decide = async () => {
    if (!review) return;
    setBusy(true);
    try {
      const res = await api.post<{ studentId?: number; message?: string }>(`/students/admissions/${review.admission_id}/review`, { decision, remarks });
      toast.success(res.message ?? `Application ${decision.toLowerCase()}.`);
      setReview(null);
      setRemarks('');
      reload();
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };

  const columns: Column<Application>[] = [
    { key: 'application_no', header: 'Application', render: (r) => <span className="font-medium text-brand-700">{r.application_no}</span> },
    {
      key: 'first_name', header: 'Applicant',
      render: (r) => (
        <div>
          <p className="font-medium text-slate-800">{r.first_name} {r.last_name}</p>
          <p className="text-[11px] text-slate-500">{r.email}</p>
        </div>
      ),
    },
    { key: 'programCode', header: 'Program', render: (r) => <span className="text-xs">{r.programCode}</span> },
    { key: 'categoryCode', header: 'Category' },
    { key: 'marks_12', header: '12th %', align: 'right', render: (r) => num(r.marks_12, 2) },
    { key: 'entrance_score', header: 'Entrance', align: 'right', render: (r) => num(r.entrance_score, 2) },
    { key: 'application_date', header: 'Applied on', render: (r) => dateStr(r.application_date) },
    { key: 'status', header: 'Status', render: (r) => <StatusBadge value={r.status} /> },
    {
      key: 'actions', header: '', align: 'right',
      render: (r) => (['APPLIED', 'UNDER_REVIEW', 'WAITLISTED'].includes(r.status) ? (
        <button
          type="button"
          className="btn-secondary btn-xs"
          onClick={() => { setReview(r); setDecision('APPROVED'); setRemarks(''); }}
        >Review</button>
      ) : r.student_id ? (
        <Link to={`/students/${r.student_id}`} className="text-xs text-brand-700 hover:underline">{r.rollNumber ?? 'student'}</Link>
      ) : null),
    },
  ];

  return (
    <>
      <PageHeader
        title="Admissions"
        subtitle="Public applications flow in here; approving one calls sp_approve_admission, which creates the student and their login."
        icon={<FileText className="h-5 w-5" />}
        actions={
          <>
            <button
              type="button"
              className="btn-secondary btn-sm"
              disabled={!rows.length}
              onClick={() => downloadCsv('admissions.csv', rows as unknown as Record<string, unknown>[])}
            ><Download className="h-4 w-4" /> Export CSV</button>
            <Link to="/admissions/apply" className="btn-primary btn-sm">Open public form</Link>
          </>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-6">
        <StatCard label="Total" value={num(stats.data?.total)} icon={<FileText className="h-5 w-5" />} />
        <StatCard label="Applied" value={num(stats.data?.applied)} tone="sky" />
        <StatCard label="Under review" value={num(stats.data?.underReview)} tone="amber" />
        <StatCard label="Approved" value={num(stats.data?.approved)} tone="emerald" />
        <StatCard label="Waitlisted" value={num(stats.data?.waitlisted)} tone="slate" />
        <StatCard label="Avg entrance" value={num(stats.data?.avgEntranceMarks, 1)} tone="brand" />
      </div>

      <Tabs
        active={tab}
        onChange={(k) => { setTab(k); setPage(1); }}
        tabs={[
          { key: 'APPLIED', label: 'New' },
          { key: 'UNDER_REVIEW', label: 'Under review' },
          { key: 'WAITLISTED', label: 'Waitlisted' },
          { key: 'APPROVED', label: 'Approved' },
          { key: 'REJECTED', label: 'Rejected' },
          { key: 'ALL', label: 'All' },
        ]}
      />

      <Card className="mb-4">
        <div className="grid gap-3 p-4 sm:grid-cols-2">
          <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Name, application no, email…" />
          <SelectField
            placeholder="All programs"
            value={programId}
            onChange={(e) => { setProgramId(e.target.value); setPage(1); }}
            options={(programs.data ?? []).map((p) => ({ value: p.program_id, label: p.program_name }))}
          />
        </div>
      </Card>

      <Card>
        {error ? <ErrorBox message={error} onRetry={reload} /> : (
          <>
            <DataTable columns={columns} rows={rows} loading={loading} rowKey={(r) => r.admission_id} empty="No applications in this bucket" />
            <Pagination page={data?.meta.page ?? 1} totalPages={data?.meta.totalPages ?? 1} total={data?.meta.total ?? 0} onPage={setPage} />
          </>
        )}
      </Card>

      <Modal
        open={!!review}
        onClose={() => setReview(null)}
        title={`Review ${review?.application_no ?? ''}`}
        size="sm"
        footer={
          <>
            <button type="button" className="btn-secondary btn-sm" onClick={() => setReview(null)}>Cancel</button>
            <button type="button" className="btn-primary btn-sm" onClick={decide} disabled={busy}>{busy ? 'Working…' : 'Submit decision'}</button>
          </>
        }
      >
        {review ? (
          <>
            <dl className="mb-4 grid grid-cols-2 gap-x-4 gap-y-2 rounded-lg bg-slate-50 p-3 text-sm">
              <div><dt className="text-[11px] uppercase text-slate-400">Applicant</dt><dd className="font-medium">{review.first_name} {review.last_name}</dd></div>
              <div><dt className="text-[11px] uppercase text-slate-400">Program</dt><dd className="font-medium">{review.programName}</dd></div>
              <div><dt className="text-[11px] uppercase text-slate-400">10th / 12th</dt><dd className="font-medium">{num(review.marks_10, 1)} / {num(review.marks_12, 1)}</dd></div>
              <div><dt className="text-[11px] uppercase text-slate-400">Entrance</dt><dd className="font-medium">{num(review.entrance_score, 1)}</dd></div>
              <div><dt className="text-[11px] uppercase text-slate-400">Category</dt><dd className="font-medium">{review.categoryCode}</dd></div>
              <div><dt className="text-[11px] uppercase text-slate-400">City</dt><dd className="font-medium">{review.city}</dd></div>
            </dl>
            <SelectField
              label="Decision"
              value={decision}
              onChange={(e) => setDecision(e.target.value as 'APPROVED')}
              options={[
                { value: 'APPROVED', label: 'Approve (creates the student + login)' },
                { value: 'WAITLISTED', label: 'Waitlist' },
                { value: 'REJECTED', label: 'Reject' },
              ]}
            />
            <TextAreaField label="Remarks" value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="Optional note sent to the applicant" />
            {decision === 'APPROVED' ? (
              <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                Approving runs <code>sp_approve_admission</code>: it generates the roll number, creates the
                student row, opens a login account and notifies the applicant.
              </p>
            ) : null}
          </>
        ) : null}
      </Modal>
    </>
  );
}
