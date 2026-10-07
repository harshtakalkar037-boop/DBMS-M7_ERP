import { useState } from 'react';
import { Percent, Award as AwardIcon } from 'lucide-react';
import { api, errMsg } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useToast } from '../../components/toast';
import { Card, PageHeader, StatCard, DataTable, ProgressBar, ErrorBox, Modal, Field, SelectField, useFetch, type Column, EmptyState } from '../../components/ui';
import { money, num, titleCase } from '../../lib/format';
interface Scholarship {
  scholarship_id: number; scholarship_code: string; name: string; provider: string;
  scholarship_type: string; amount: string; is_percentage: boolean; criteria: string;
  max_beneficiaries: number; academic_year_id: number; status: string; beneficiaries: number;
}
interface Awarded {
  student_scholarship_id?: number; scholarship_code: string; name: string; amount: string;
  academic_year?: string; awarded_on?: string; status?: string; percentage?: string;
}

export default function ScholarshipsPage() {
  const { has } = useAuth();
  const toast = useToast();
  const isStudent = has('STUDENT');

  const list = useFetch(() => api.get<Scholarship[]>('/fees/scholarships'), []);
  const mine = useFetch(() => (isStudent ? api.get<Awarded[]>('/fees/scholarships/me') : Promise.resolve([])), [isStudent]);
  const years = useFetch(() => api.get<{ academic_year_id: number; year_label: string }[]>('/academics/years'), []);
  const students = useFetch(() => api.get<{ student_id: number; roll_number: string; full_name: string }[]>('/students', { limit: 500 }), []);

  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ studentId: '', scholarshipId: '', academicYearId: '', amount: '' });

  const award = async () => {
    setBusy(true);
    try {
      await api.post('/fees/scholarships/award', {
        studentId: Number(form.studentId),
        scholarshipId: Number(form.scholarshipId),
        academicYearId: Number(form.academicYearId),
        amount: Number(form.amount || 0),
      });
      toast.success('Scholarship awarded.');
      setOpen(false);
      list.reload();
      mine.reload();
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };

  const cols: Column<Scholarship>[] = [
    { key: 'scholarship_code', header: 'Code', render: (r) => <span className="font-medium text-slate-800">{r.scholarship_code}</span> },
    { key: 'name', header: 'Scholarship' },
    { key: 'provider', header: 'Provider' },
    { key: 'scholarship_type', header: 'Type', render: (r) => <span className="chip bg-brand-100 text-brand-700">{titleCase(r.scholarship_type)}</span> },
    { key: 'amount', header: 'Value', align: 'right', render: (r) => (r.is_percentage ? `${num(r.amount, 0)}% of fees` : money(r.amount)) },
    { key: 'criteria', header: 'Criteria', render: (r) => <span className="max-w-xs truncate text-xs">{r.criteria}</span> },
    {
      key: 'beneficiaries', header: 'Awarded',
      render: (r) => (
        <div className="flex w-36 items-center gap-2">
          <ProgressBar value={(Number(r.beneficiaries) / Math.max(1, Number(r.max_beneficiaries))) * 100} tone="bg-brand-500" />
          <span className="w-14 shrink-0 text-right text-xs">{num(r.beneficiaries)}/{num(r.max_beneficiaries)}</span>
        </div>
      ),
    },
  ];

  const myCols: Column<Awarded>[] = [
    { key: 'scholarship_code', header: 'Code' },
    { key: 'name', header: 'Scholarship' },
    { key: 'academic_year', header: 'Year' },
    { key: 'amount', header: 'Amount', align: 'right', render: (r) => money(r.amount) },
    { key: 'awarded_on', header: 'Awarded on', render: (r) => (r.awarded_on ? String(r.awarded_on).slice(0, 10) : '—') },
    { key: 'status', header: 'Status', render: (r) => <span className="chip bg-emerald-100 text-emerald-700">{r.status ?? 'ACTIVE'}</span> },
  ];

  const rows = list.data ?? [];
  const totalAwarded = rows.reduce((s, r) => s + Number(r.beneficiaries ?? 0), 0);

  return (
    <>
      <PageHeader
        title="Scholarships"
        subtitle="Merit, need and category scholarships, and the students awarded them."
        icon={<Percent className="h-5 w-5" />}
        actions={!isStudent ? <button type="button" className="btn-primary btn-sm" onClick={() => setOpen(true)}><AwardIcon className="h-4 w-4" /> Award a scholarship</button> : null}
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Schemes" value={num(rows.length)} icon={<Percent className="h-5 w-5" />} />
        <StatCard label="Awards made" value={num(totalAwarded)} tone="emerald" />
        <StatCard label="Seats remaining" value={num(rows.reduce((s, r) => s + Math.max(0, Number(r.max_beneficiaries) - Number(r.beneficiaries)), 0))} tone="amber" />
        <StatCard label="Your awards" value={num(mine.data?.length)} tone="sky" />
      </div>

      {isStudent ? (
        <Card className="mb-4">
          <div className="border-b border-slate-200 px-4 py-3"><h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Awarded to you</h2></div>
          {(mine.data ?? []).length
            ? <DataTable columns={myCols} rows={mine.data!} rowKey={(_r, i) => i} />
            : <EmptyState title="No scholarships awarded yet" hint="Scholarship awards are credited against your fee bills." />}
        </Card>
      ) : null}

      <Card>
        {list.error ? <ErrorBox message={list.error} onRetry={list.reload} /> : (
          <DataTable columns={cols} rows={rows} loading={list.loading} rowKey={(r) => r.scholarship_id} empty="No scholarship schemes" />
        )}
      </Card>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Award a scholarship"
        footer={
          <>
            <button type="button" className="btn-secondary btn-sm" onClick={() => setOpen(false)}>Cancel</button>
            <button type="button" className="btn-primary btn-sm" onClick={award} disabled={busy || !form.studentId || !form.scholarshipId || !form.academicYearId}>{busy ? 'Saving…' : 'Award'}</button>
          </>
        }
      >
        <SelectField
          label="Student" placeholder="Select a student" value={form.studentId}
          onChange={(e) => setForm({ ...form, studentId: e.target.value })}
          options={(students.data ?? []).map((s) => ({ value: s.student_id, label: `${s.roll_number} · ${s.full_name}` }))}
        />
        <SelectField
          label="Scholarship" placeholder="Select a scheme" value={form.scholarshipId}
          onChange={(e) => {
            const s = (list.data ?? []).find((x) => String(x.scholarship_id) === e.target.value);
            setForm({ ...form, scholarshipId: e.target.value, amount: s ? String(s.amount) : '' });
          }}
          options={rows.map((s) => ({ value: s.scholarship_id, label: `${s.scholarship_code} — ${s.name}` }))}
        />
        <SelectField
          label="Academic year" placeholder="Select" value={form.academicYearId}
          onChange={(e) => setForm({ ...form, academicYearId: e.target.value })}
          options={(years.data ?? []).map((y) => ({ value: y.academic_year_id, label: y.year_label }))}
        />
        <Field label="Amount credited" type="number" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} hint="Leave 0 to use the scheme's default value" />
      </Modal>
    </>
  );
}
