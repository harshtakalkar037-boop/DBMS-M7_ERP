import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Trash2, UserCog, FileText, IndianRupee, ClipboardCheck, Award, MapPin, Users as UsersIcon } from 'lucide-react';
import { api, errMsg } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useToast } from '../../components/toast';
import { Card, StatCard, Tabs, StatusBadge, ProgressBar, Loading, ErrorBox, Modal, Field, SelectField, useFetch, type Column, DataTable, EmptyState } from '../../components/ui';
import { initials, colorFor, dateStr, dateTimeStr, money, num, pct, titleCase } from '../../lib/format';
interface Detail {
  student: Record<string, any>;
  addresses: Record<string, any>[];
  guardians: Record<string, any>[];
  documents: Record<string, any>[];
  history: Record<string, any>[];
  fees: Record<string, any>[];
  attendance: Record<string, any>[];
  academics: Record<string, any>[];
}

const STATUSES = ['ACTIVE', 'INACTIVE', 'SUSPENDED', 'GRADUATED', 'ALUMNI'];

export default function StudentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { has } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [tab, setTab] = useState('overview');
  const [statusOpen, setStatusOpen] = useState(false);
  const [newStatus, setNewStatus] = useState('ACTIVE');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const { data, loading, error, reload } = useFetch<Detail>(() => api.get<Detail>(`/students/${id}`), [id]);

  if (loading) return <Loading label="Loading student record…" />;
  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (!data) return null;

  const s = data.student ?? {};
  const canManage = has('ADMIN');
  const due = (data.fees ?? []).reduce((t, f) => t + Number(f.due_amount ?? 0), 0);
  const avgAttendance = data.attendance?.length
    ? data.attendance.reduce((t, a) => t + Number(a.attendance_percentage ?? 0), 0) / data.attendance.length
    : 0;
  const latestResult = (data.academics ?? [])[0];

  const saveStatus = async () => {
    setBusy(true);
    try {
      await api.patch(`/students/${id}/status`, { status: newStatus, reason });
      toast.success(`Status changed to ${titleCase(newStatus)}.`);
      setStatusOpen(false);
      reload();
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await api.del(`/students/${id}`);
      toast.success('Student record deleted.');
      navigate('/students');
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };

  const feeCols: Column<Record<string, any>>[] = [
    { key: 'feeCode', header: 'Bill', render: (r) => <span className="font-medium">{String(r.feeCode)}</span> },
    { key: 'semesterNo', header: 'Sem', align: 'right', render: (r) => `Sem ${r.semesterNo}` },
    { key: 'total_amount', header: 'Billed', align: 'right', render: (r) => money(r.total_amount) },
    { key: 'paid_amount', header: 'Paid', align: 'right', render: (r) => money(r.paid_amount) },
    { key: 'due_amount', header: 'Due', align: 'right', render: (r) => <span className={Number(r.due_amount) > 0 ? 'font-semibold text-rose-600' : ''}>{money(r.due_amount)}</span> },
    { key: 'due_date', header: 'Due date', render: (r) => dateStr(r.due_date) },
    { key: 'status', header: 'Status', render: (r) => <StatusBadge value={r.status} /> },
  ];

  const attCols: Column<Record<string, any>>[] = [
    { key: 'subject_code', header: 'Subject', render: (r) => <span className="font-medium">{String(r.subject_code)}</span> },
    { key: 'subject_name', header: 'Name' },
    { key: 'total_classes', header: 'Classes', align: 'right', render: (r) => num(r.total_classes) },
    { key: 'attended_classes', header: 'Attended', align: 'right', render: (r) => num(r.attended_classes) },
    {
      key: 'attendance_percentage', header: 'Attendance', render: (r) => (
        <div className="flex w-40 items-center gap-2">
          <ProgressBar value={Number(r.attendance_percentage)} />
          <span className="w-14 shrink-0 text-right text-xs">{pct(r.attendance_percentage, 1)}</span>
        </div>
      ),
    },
    { key: 'attendance_status', header: 'Status', render: (r) => <StatusBadge value={r.attendance_status} /> },
  ];

  const acadCols: Column<Record<string, any>>[] = [
    { key: 'semester_id', header: 'Semester', render: (r) => `Semester ${r.semester_no ?? r.semester_id}` },
    { key: 'sgpa', header: 'SGPA', align: 'right', render: (r) => num(r.sgpa, 2) },
    { key: 'cgpa', header: 'CGPA', align: 'right', render: (r) => <b>{num(r.cgpa, 2)}</b> },
    { key: 'earned_credits', header: 'Credits', align: 'right', render: (r) => `${num(r.earned_credits)}/${num(r.total_credits)}` },
    { key: 'backlog_count', header: 'Backlogs', align: 'right', render: (r) => (Number(r.backlog_count) ? <span className="chip bg-rose-100 text-rose-700">{r.backlog_count}</span> : '0') },
    { key: 'result_status', header: 'Result', render: (r) => <StatusBadge value={r.result_status} /> },
  ];

  return (
    <>
      <Link to="/students" className="mb-3 inline-flex items-center gap-1 text-sm text-brand-700 hover:underline">
        <ArrowLeft className="h-4 w-4" /> Back to students
      </Link>

      <Card className="card-pad mb-4">
        <div className="flex flex-wrap items-start gap-4">
          <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full text-xl font-bold text-white" style={{ background: colorFor(s.full_name) }}>
            {initials(s.full_name)}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold text-slate-900">{String(s.full_name)}</h1>
              <StatusBadge value={s.status} />
            </div>
            <p className="mt-0.5 text-sm text-slate-500">
              {String(s.roll_number)} · {String(s.registration_number ?? '')}
            </p>
            <p className="mt-1 text-sm text-slate-600">
              {String(s.program_name)} · {String(s.department_name)} · Batch {String(s.batch_code)} · Semester {String(s.current_semester_no)}
            </p>
            <p className="mt-0.5 text-xs text-slate-400">
              {String(s.email)} · {String(s.phone)} · Admitted {dateStr(s.admission_date)}
            </p>
          </div>
          {canManage ? (
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn-secondary btn-sm" onClick={() => { setNewStatus(String(s.status ?? 'ACTIVE')); setStatusOpen(true); }}>
                <UserCog className="h-4 w-4" /> Change status
              </button>
              <button type="button" className="btn-danger btn-sm" onClick={remove}><Trash2 className="h-4 w-4" /> Delete</button>
            </div>
          ) : null}
        </div>
      </Card>

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="CGPA" value={num(s.cgpa, 2)} icon={<Award className="h-5 w-5" />} hint={latestResult ? `Latest SGPA ${num(latestResult.sgpa, 2)}` : 'No results yet'} />
        <StatCard label="Backlogs" value={num(s.backlog_count)} icon={<FileText className="h-5 w-5" />} tone={Number(s.backlog_count) > 0 ? 'rose' : 'emerald'} />
        <StatCard label="Attendance" value={pct(avgAttendance, 1)} icon={<ClipboardCheck className="h-5 w-5" />} tone={avgAttendance >= 75 ? 'emerald' : 'rose'} hint={`${data.attendance?.length ?? 0} subjects`} />
        <StatCard label="Outstanding dues" value={money(due)} icon={<IndianRupee className="h-5 w-5" />} tone={due > 0 ? 'amber' : 'emerald'} hint={`${data.fees?.length ?? 0} bills`} />
      </div>

      <Tabs
        active={tab}
        onChange={setTab}
        tabs={[
          { key: 'overview', label: 'Overview' },
          { key: 'attendance', label: 'Attendance', count: data.attendance?.length },
          { key: 'academics', label: 'Results', count: data.academics?.length },
          { key: 'fees', label: 'Fees', count: data.fees?.length },
          { key: 'contacts', label: 'Contacts & documents' },
          { key: 'history', label: 'Status history', count: data.history?.length },
        ]}
      />

      {tab === 'overview' ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <div className="border-b border-slate-200 px-4 py-3"><h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Academic profile</h2></div>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 px-4 py-4 text-sm">
              {[
                ['Roll number', s.roll_number], ['Registration no.', s.registration_number],
                ['Program', s.program_name], ['Department', s.department_name],
                ['Batch', s.batch_code], ['Current semester', s.current_semester_no],
                ['Admission year', s.admission_year], ['Category', s.category_name],
                ['Gender', titleCase(s.gender)], ['Blood group', s.blood_group],
                ['Date of birth', dateStr(s.date_of_birth)], ['Enrollments', s.enrollment_count],
              ].map(([k, v]) => (
                <div key={String(k)}>
                  <dt className="text-[11px] uppercase tracking-wide text-slate-400">{k}</dt>
                  <dd className="truncate font-medium text-slate-800">{String(v ?? '—')}</dd>
                </div>
              ))}
            </dl>
          </Card>

          <Card>
            <div className="border-b border-slate-200 px-4 py-3"><h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Attendance at a glance</h2></div>
            <div className="space-y-2.5 px-4 py-4">
              {(data.attendance ?? []).slice(0, 8).map((a) => (
                <div key={String(a.offering_id)}>
                  <div className="mb-1 flex justify-between text-xs">
                    <span className="truncate font-medium text-slate-700">{String(a.subject_code)} · {String(a.subject_name)}</span>
                    <span className="shrink-0 text-slate-500">{pct(a.attendance_percentage, 1)}</span>
                  </div>
                  <ProgressBar value={Number(a.attendance_percentage)} />
                </div>
              ))}
              {!data.attendance?.length ? <EmptyState title="No attendance records" /> : null}
            </div>
          </Card>
        </div>
      ) : null}

      {tab === 'attendance' ? <Card><DataTable columns={attCols} rows={data.attendance ?? []} rowKey={(r) => r.offering_id} empty="No attendance records" /></Card> : null}
      {tab === 'academics' ? <Card><DataTable columns={acadCols} rows={data.academics ?? []} rowKey={(_row, i) => i} empty="No published results" /></Card> : null}
      {tab === 'fees' ? <Card><DataTable columns={feeCols} rows={data.fees ?? []} rowKey={(r) => r.student_fee_id} empty="No fee bills" /></Card> : null}

      {tab === 'contacts' ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-3">
              <MapPin className="h-4 w-4 text-slate-400" /><h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Addresses</h2>
            </div>
            <div className="divide-y divide-slate-100">
              {(data.addresses ?? []).map((a) => (
                <div key={a.address_id} className="px-4 py-3 text-sm">
                  <p className="font-medium text-slate-800">{titleCase(a.address_type)}</p>
                  <p className="text-slate-600">{String(a.line1)}{a.line2 ? `, ${a.line2}` : ''}</p>
                  <p className="text-slate-500">{String(a.city)}, {String(a.state)} {String(a.pincode)}</p>
                </div>
              ))}
              {!data.addresses?.length ? <EmptyState title="No addresses on file" /> : null}
            </div>
          </Card>
          <Card>
            <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-3">
              <UsersIcon className="h-4 w-4 text-slate-400" /><h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Guardians</h2>
            </div>
            <div className="divide-y divide-slate-100">
              {(data.guardians ?? []).map((g) => (
                <div key={g.guardian_id} className="px-4 py-3 text-sm">
                  <p className="font-medium text-slate-800">{String(g.name)} <span className="text-xs text-slate-500">({titleCase(g.relation)})</span></p>
                  <p className="text-slate-600">{String(g.phone)}{g.email ? ` · ${g.email}` : ''}</p>
                  {g.occupation ? <p className="text-xs text-slate-500">{String(g.occupation)}{g.annual_income ? ` · Annual income ${money(g.annual_income)}` : ''}</p> : null}
                </div>
              ))}
              {!data.guardians?.length ? <EmptyState title="No guardians on file" /> : null}
            </div>
          </Card>
          <Card className="lg:col-span-2">
            <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-3">
              <FileText className="h-4 w-4 text-slate-400" /><h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Documents</h2>
            </div>
            <DataTable
              rowKey={(r) => r.id}
              rows={data.documents ?? []}
              empty="No documents uploaded"
              columns={[
                { key: 'docType', header: 'Type', render: (r) => titleCase(r.docType) },
                { key: 'fileName', header: 'File' },
                { key: 'sizeBytes', header: 'Size', align: 'right', render: (r) => `${num(Number(r.sizeBytes) / 1024, 1)} KB` },
                { key: 'isVerified', header: 'Verified', render: (r) => <StatusBadge value={r.isVerified ? 'ACTIVE' : 'PENDING'} /> },
                { key: 'uploadedAt', header: 'Uploaded', render: (r) => dateTimeStr(r.uploadedAt) },
              ]}
            />
          </Card>
        </div>
      ) : null}

      {tab === 'history' ? (
        <Card>
          {data.history?.length ? (
            <DataTable
              rowKey={(_row, i) => i}
              rows={data.history}
              empty="No status changes"
              columns={[
                { key: 'old_status', header: 'From', render: (r) => <StatusBadge value={r.old_status} /> },
                { key: 'new_status', header: 'To', render: (r) => <StatusBadge value={r.new_status} /> },
                { key: 'reason', header: 'Reason', render: (r) => String(r.reason ?? '—') },
                { key: 'changed_at', header: 'When', render: (r) => dateTimeStr(r.changed_at ?? r.created_at) },
              ]}
            />
          ) : <EmptyState title="Status has never changed" hint="The trigger trg_students_au_status_history records every change." />}
        </Card>
      ) : null}

      <Modal
        open={statusOpen}
        onClose={() => setStatusOpen(false)}
        title="Change student status"
        size="sm"
        footer={
          <>
            <button type="button" className="btn-secondary btn-sm" onClick={() => setStatusOpen(false)}>Cancel</button>
            <button type="button" className="btn-primary btn-sm" onClick={saveStatus} disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
          </>
        }
      >
        <SelectField label="New status" value={newStatus} onChange={(e) => setNewStatus(e.target.value)} options={STATUSES.map((x) => ({ value: x, label: titleCase(x) }))} />
        <Field label="Reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Optional note recorded in the status history" />
      </Modal>
    </>
  );
}
