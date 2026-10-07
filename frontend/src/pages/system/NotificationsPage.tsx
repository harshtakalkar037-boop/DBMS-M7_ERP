import { useMemo, useState } from 'react';
import { Bell, CheckCheck, Send, Megaphone } from 'lucide-react';
import { api, errMsg } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useToast } from '../../components/toast';
import { Card, PageHeader, StatCard, Tabs, SearchInput, DataTable, Pagination, ErrorBox, Modal, Field, SelectField, TextAreaField, useFetch, useDebounced, type Column, StatusBadge } from '../../components/ui';
import { dateTimeStr, num, titleCase } from '../../lib/format';
interface Notification {
  notification_id: number; title: string; message: string; type: string; severity: string;
  entity: string | null; entity_id: number | null; link: string | null; is_read: boolean;
  read_at: string | null; created_at: string;
}

const SEVERITIES = ['INFO', 'SUCCESS', 'WARNING', 'ERROR'];
const TYPES = ['ANNOUNCEMENT', 'FEE_REMINDER', 'ATTENDANCE_WARNING', 'EXAM', 'LEAVE_APPROVAL', 'RESULT', 'SYSTEM'];

export default function NotificationsPage() {
  const { has } = useAuth();
  const toast = useToast();
  const [tab, setTab] = useState('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const term = useDebounced(search, 350);

  const params = useMemo(() => ({
    page, limit: 25,
    unread: tab === 'unread' ? 1 : undefined,
    search: term || undefined,
  }), [page, tab, term]);

  const { data, loading, error, reload } = useFetch(() => api.page<Notification>('/notifications', params), [params]);
  const unread = useFetch(() => api.get<{ unread: number }>('/notifications/unread'), []);

  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ title: '', message: '', type: 'ANNOUNCEMENT', severity: 'INFO', link: '' });

  const broadcast = async () => {
    setBusy(true);
    try {
      const res = await api.post<{ recipients?: number; message?: string }>('/notifications/announce', {
        title: form.title, message: form.message, type: form.type, severity: form.severity, link: form.link || undefined,
      });
      toast.success(res.message ?? `Announcement delivered to ${num(res.recipients)} recipients.`);
      setOpen(false);
      setForm({ title: '', message: '', type: 'ANNOUNCEMENT', severity: 'INFO', link: '' });
      reload();
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };

  const markAll = async () => {
    try { await api.post('/notifications/read-all'); toast.success('All notifications marked as read.'); reload(); unread.reload(); }
    catch (e) { toast.error(errMsg(e)); }
  };

  const markOne = async (id: number) => {
    try { await api.patch(`/notifications/${id}/read`); reload(); unread.reload(); }
    catch (e) { toast.error(errMsg(e)); }
  };

  const columns: Column<Notification>[] = [
    {
      key: 'title', header: 'Notification',
      render: (r) => (
        <div className="max-w-md">
          <p className={`truncate text-sm ${r.is_read ? 'text-slate-700' : 'font-semibold text-slate-900'}`}>{r.title}</p>
          <p className="line-clamp-2 text-xs text-slate-500">{r.message}</p>
        </div>
      ),
    },
    { key: 'type', header: 'Type', render: (r) => <span className="chip bg-slate-100 text-slate-600">{titleCase(r.type)}</span> },
    { key: 'severity', header: 'Severity', render: (r) => <StatusBadge value={r.severity} /> },
    { key: 'entity', header: 'Source', render: (r) => (r.entity ? `${r.entity}${r.entity_id ? ` #${r.entity_id}` : ''}` : <span className="text-slate-400">—</span>) },
    { key: 'created_at', header: 'Received', render: (r) => dateTimeStr(r.created_at) },
    { key: 'is_read', header: 'Read', render: (r) => (r.is_read ? <span className="chip bg-slate-100 text-slate-500">Read</span> : <span className="chip bg-brand-100 text-brand-700">Unread</span>) },
    {
      key: 'actions', header: '', align: 'right',
      render: (r) => (!r.is_read ? (
        <button type="button" className="btn-secondary btn-xs" onClick={() => markOne(r.notification_id)}>
          <CheckCheck className="h-3.5 w-3.5" /> Mark read
        </button>
      ) : null),
    },
  ];

  return (
    <>
      <PageHeader
        title="Notifications"
        subtitle="System notices, reminders and announcements. Broadcasts are inserted one row per recipient."
        icon={<Bell className="h-5 w-5" />}
        actions={
          <>
            <button type="button" className="btn-secondary btn-sm" onClick={markAll}><CheckCheck className="h-4 w-4" /> Mark all read</button>
            {has('ADMIN') ? <button type="button" className="btn-primary btn-sm" onClick={() => setOpen(true)}><Megaphone className="h-4 w-4" /> Broadcast</button> : null}
          </>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatCard label="Unread" value={num(unread.data?.unread)} icon={<Bell className="h-5 w-5" />} tone="brand" />
        <StatCard label="On this page" value={num(data?.rows?.length)} tone="slate" />
        <StatCard label="Total" value={num(data?.meta.total)} tone="sky" />
      </div>

      <Tabs active={tab} onChange={(k) => { setTab(k); setPage(1); }} tabs={[{ key: 'all', label: 'All' }, { key: 'unread', label: 'Unread' }]} />

      <Card className="mb-4">
        <div className="p-4"><SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Search notifications…" /></div>
      </Card>

      <Card>
        {error ? <ErrorBox message={error} onRetry={reload} /> : (
          <>
            <DataTable columns={columns} rows={data?.rows ?? []} loading={loading} rowKey={(r) => r.notification_id} empty="No notifications" />
            <Pagination page={data?.meta.page ?? 1} totalPages={data?.meta.totalPages ?? 1} total={data?.meta.total ?? 0} onPage={setPage} />
          </>
        )}
      </Card>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Broadcast an announcement"
        footer={
          <>
            <button type="button" className="btn-secondary btn-sm" onClick={() => setOpen(false)}>Cancel</button>
            <button type="button" className="btn-primary btn-sm" onClick={broadcast} disabled={busy || form.title.length < 3 || form.message.length < 3}>
              <Send className="h-4 w-4" /> {busy ? 'Sending…' : 'Send to everyone'}
            </button>
          </>
        }
      >
        <Field label="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
        <TextAreaField label="Message" value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} required />
        <div className="grid gap-x-4 sm:grid-cols-2">
          <SelectField label="Type" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} options={TYPES.map((t) => ({ value: t, label: titleCase(t) }))} />
          <SelectField label="Severity" value={form.severity} onChange={(e) => setForm({ ...form, severity: e.target.value })} options={SEVERITIES.map((s) => ({ value: s, label: titleCase(s) }))} />
        </div>
        <Field label="Link (optional)" value={form.link} onChange={(e) => setForm({ ...form, link: e.target.value })} placeholder="/exams" />
      </Modal>
    </>
  );
}
