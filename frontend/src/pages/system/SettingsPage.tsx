import { useMemo, useState } from 'react';
import { Settings2, Save, Info } from 'lucide-react';
import { api, errMsg } from '../../lib/api';
import { useToast } from '../../components/toast';
import { Card, PageHeader, SearchInput, Field, Loading, ErrorBox, useFetch, EmptyState } from '../../components/ui';
import { dateTimeStr, num, titleCase } from '../../lib/format';
interface Setting {
  key: string; value: string; description: string; updatedAt: string;
}

export default function SettingsPage() {
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const { data, loading, error, reload } = useFetch(() => api.get<Setting[]>('/settings'), []);

  const rows = useMemo(() => (data ?? []).filter((s) => {
    const q = search.trim().toLowerCase();
    return !q || s.key.toLowerCase().includes(q) || s.description.toLowerCase().includes(q);
  }), [data, search]);

  const save = async (s: Setting) => {
    const value = draft[s.key];
    if (value === undefined || value === s.value) return;
    setBusy(s.key);
    try {
      const res = await api.put<{ key: string; value: string; previous?: string }>('/settings', { key: s.key, value });
      toast.success(`${res.key} updated from "${res.previous ?? s.value}" to "${res.value}".`);
      setDraft((d) => { const n = { ...d }; delete n[s.key]; return n; });
      reload();
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(null); }
  };

  return (
    <>
      <PageHeader
        title="Settings"
        subtitle="Editable institute parameters. Business rules such as the attendance threshold are read from here at runtime, never hard-coded."
        icon={<Settings2 className="h-5 w-5" />}
      />

      <Card className="card-pad mb-4">
        <div className="flex gap-2.5">
          <Info className="h-4 w-4 shrink-0 text-brand-600" />
          <p className="text-xs leading-relaxed text-slate-600">
            These rows live in the <code className="rounded bg-slate-100 px-1">system_settings</code> table. Stored
            procedures, functions, views and triggers all read their thresholds from this table, so changing a value
            here immediately changes the behaviour of exam registration, late-fee calculation and the eligibility view.
          </p>
        </div>
      </Card>

      <Card className="mb-4">
        <div className="p-4"><SearchInput value={search} onChange={setSearch} placeholder="Search settings…" /></div>
      </Card>

      {loading ? <Loading /> : error ? <ErrorBox message={error} onRetry={reload} /> : !rows.length ? (
        <Card><EmptyState title="No settings match this search" /></Card>
      ) : (
        <div className="space-y-3">
          {rows.map((s) => {
            const value = draft[s.key] ?? s.value;
            const dirty = draft[s.key] !== undefined && draft[s.key] !== s.value;
            const numeric = /^-?\d+(\.\d+)?$/.test(s.value);
            return (
              <Card key={s.key} className="card-pad">
                <div className="flex flex-wrap items-end gap-3">
                  <div className="min-w-[14rem] flex-1">
                    <p className="text-sm font-semibold text-slate-800">{titleCase(s.key)}</p>
                    <p className="text-xs text-slate-500">{s.description}</p>
                    <p className="mt-0.5 text-[11px] text-slate-400">
                      <code className="rounded bg-slate-100 px-1">{s.key}</code> · updated {dateTimeStr(s.updatedAt)}
                    </p>
                  </div>
                  <div className="w-56">
                    {s.key === 'CURRENT_ACADEMIC_YEAR' && false ? null : null}
                    {numeric ? (
                      <Field
                        label="Value" type="number" step="any" value={value}
                        onChange={(e) => setDraft({ ...draft, [s.key]: e.target.value })}
                      />
                    ) : (
                      <Field
                        label="Value" value={value}
                        onChange={(e) => setDraft({ ...draft, [s.key]: e.target.value })}
                      />
                    )}
                  </div>
                  <button
                    type="button"
                    className="btn-primary btn-sm mb-3"
                    disabled={!dirty || busy === s.key}
                    onClick={() => void save(s)}
                  >
                    <Save className="h-4 w-4" /> {busy === s.key ? 'Saving…' : 'Save'}
                  </button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <p className="mt-3 text-xs text-slate-400">{num(rows.length)} setting{rows.length === 1 ? '' : 's'} shown.</p>
    </>
  );
}
