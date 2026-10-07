import { useState, type FormEvent } from 'react';
import { CheckCircle2, Send } from 'lucide-react';
import { api, errMsg } from '../../lib/api';
import { Card, Field, SelectField, Loading, useFetch, EmptyState } from '../../components/ui';
import { titleCase } from '../../lib/format';

interface Program { program_id: number; program_name: string; program_code: string; duration_years: number; }
interface Category { category_id: number; category_name: string; category_code: string; }

const EMPTY = {
  firstName: '', lastName: '', email: '', phone: '', dateOfBirth: '2006-01-01',
  gender: 'MALE', programId: '', categoryId: '', guardianName: '', guardianPhone: '',
  previousSchool: '', qualification: 'HSC', marks10: '75', marks12: '75',
  entranceScore: '100', addressLine1: '', city: 'Pune', state: 'Maharashtra', pincode: '411001',
};

export default function AdmissionApplyPage() {
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ id: number; applicationNo: string } | null>(null);

  const programs = useFetch(() => api.get<Program[]>('/academics/programs/all', { limit: 200 }), []);
  const categories = useFetch(() => api.get<Category[]>('/academics/categories'), []);

  const set = (k: keyof typeof EMPTY) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api.post<{ id: number; applicationNo: string }>('/students/admissions/apply', {
        ...form,
        programId: Number(form.programId),
        categoryId: Number(form.categoryId),
        marks10: Number(form.marks10),
        marks12: Number(form.marks12),
        entranceScore: Number(form.entranceScore),
      });
      setDone(res);
      setForm(EMPTY);
    } catch (err) {
      setError(errMsg(err));
    } finally { setBusy(false); }
  };

  if (done) {
    return (
      <div className="mx-auto max-w-xl">
        <Card className="card-pad text-center">
          <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-500" />
          <h1 className="mt-3 text-lg font-semibold text-slate-900">Application submitted</h1>
          <p className="mt-1 text-sm text-slate-600">
            Your application number is <b className="text-brand-700">{done.applicationNo}</b>. Keep it safe — you will
            need it to track the outcome.
          </p>
          <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
            The admissions office reviews applications in the Admissions module. Approving one runs
            <code className="mx-1 rounded bg-slate-200 px-1">sp_approve_admission</code>, which creates the student
            record and generates the login automatically.
          </p>
          <button type="button" className="btn-primary mt-4" onClick={() => setDone(null)}>Submit another application</button>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-xl font-semibold text-slate-900">Admission application</h1>
      <p className="mt-1 text-sm text-slate-500">
        This is the public-facing form. It writes straight into the <code className="rounded bg-slate-200 px-1">admissions</code> table,
        where a BEFORE INSERT trigger validates the date of birth and the minimum qualifying marks.
      </p>

      {programs.loading ? <Loading /> : (
        <form onSubmit={submit} className="mt-4 space-y-4">
          <Card className="card-pad">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Course & category</h2>
            <div className="grid gap-x-4 sm:grid-cols-2">
              <SelectField
                label="Program applied for"
                placeholder="Select a program"
                required
                value={form.programId}
                onChange={set('programId')}
                options={(programs.data ?? []).map((p) => ({ value: p.program_id, label: p.program_name }))}
                className="sm:col-span-2"
              />
              <SelectField
                label="Category"
                placeholder="Select a category"
                required
                value={form.categoryId}
                onChange={set('categoryId')}
                options={(categories.data ?? []).map((c) => ({ value: c.category_id, label: `${c.category_code} — ${c.category_name}` }))}
              />
              <Field label="Entrance score" type="number" step="0.01" value={form.entranceScore} onChange={set('entranceScore')} hint="Score out of 200" />
            </div>
            {programs.data?.length ? null : <EmptyState title="No programs are open" />}
          </Card>

          <Card className="card-pad">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Applicant details</h2>
            <div className="grid gap-x-4 sm:grid-cols-2">
              <Field label="First name" required value={form.firstName} onChange={set('firstName')} />
              <Field label="Last name" required value={form.lastName} onChange={set('lastName')} />
              <Field label="Email" type="email" required value={form.email} onChange={set('email')} />
              <Field label="Phone" required value={form.phone} onChange={set('phone')} />
              <Field label="Date of birth" type="date" required value={form.dateOfBirth} onChange={set('dateOfBirth')} />
              <SelectField
                label="Gender" value={form.gender} onChange={set('gender')}
                options={['MALE', 'FEMALE', 'OTHER'].map((g) => ({ value: g, label: titleCase(g) }))}
              />
            </div>
          </Card>

          <Card className="card-pad">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Qualifications</h2>
            <div className="grid gap-x-4 sm:grid-cols-2">
              <Field label="Previous school / college" value={form.previousSchool} onChange={set('previousSchool')} />
              <Field label="Qualification" value={form.qualification} onChange={set('qualification')} />
              <Field label="10th marks (%)" type="number" step="0.01" min="0" max="100" value={form.marks10} onChange={set('marks10')} />
              <Field label="12th marks (%)" type="number" step="0.01" min="35" max="100" value={form.marks12} onChange={set('marks12')} hint="Minimum 35% — enforced by a database trigger" />
            </div>
          </Card>

          <Card className="card-pad">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Guardian & address</h2>
            <div className="grid gap-x-4 sm:grid-cols-2">
              <Field label="Guardian name" required value={form.guardianName} onChange={set('guardianName')} />
              <Field label="Guardian phone" required value={form.guardianPhone} onChange={set('guardianPhone')} />
              <Field label="Address" value={form.addressLine1} onChange={set('addressLine1')} className="sm:col-span-2" />
              <Field label="City" value={form.city} onChange={set('city')} />
              <Field label="State" value={form.state} onChange={set('state')} />
              <Field label="PIN code" value={form.pincode} onChange={set('pincode')} />
            </div>
          </Card>

          {error ? (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>
          ) : null}

          <button type="submit" className="btn-primary" disabled={busy || !form.programId || !form.categoryId}>
            {busy ? 'Submitting…' : (<><Send className="h-4 w-4" /> Submit application</>)}
          </button>
        </form>
      )}
    </div>
  );
}
