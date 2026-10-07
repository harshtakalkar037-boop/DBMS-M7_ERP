import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bell, CheckCheck } from 'lucide-react';
import { api } from '../lib/api';
import { dateTimeStr, statusClass, titleCase } from '../lib/format';
import { useFetch } from './ui';

interface Notification {
  notification_id: number;
  title: string;
  message: string;
  type: string;
  severity: string;
  link: string | null;
  is_read: boolean;
  created_at: string;
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const { data, loading, reload } = useFetch(
    () => api.get<Notification[]>('/notifications', { limit: 12 }),
    [],
  );
  const rows = data ?? [];
  const unread = rows.filter((r) => !r.is_read).length;

  // Poll quietly so the badge stays honest during a live demo.
  useEffect(() => {
    const t = window.setInterval(reload, 60_000);
    return () => window.clearInterval(t);
  }, [reload]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest('[data-bell]')) setOpen(false);
    };
    document.addEventListener('click', onDoc);
    return () => document.removeEventListener('click', onDoc);
  }, []);

  const markAll = async () => {
    await api.post('/notifications/read-all');
    reload();
  };

  const markOne = async (id: number) => {
    await api.patch(`/notifications/${id}/read`);
    reload();
  };

  return (
    <div className="relative" data-bell>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="relative rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
        aria-label="Notifications"
      >
        <Bell className="h-5 w-5" />
        {unread > 0 ? (
          <span className="absolute right-1 top-1 min-w-[16px] rounded-full bg-rose-500 px-1 text-[10px] font-bold leading-4 text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="absolute right-0 z-50 mt-2 w-[min(92vw,24rem)] animate-pop-in overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2.5">
            <p className="text-sm font-semibold text-slate-800">Notifications</p>
            {unread > 0 ? (
              <button type="button" onClick={markAll} className="flex items-center gap-1 text-xs text-brand-700 hover:underline">
                <CheckCheck className="h-3.5 w-3.5" /> Mark all read
              </button>
            ) : null}
          </div>
          <div className="max-h-[60vh] overflow-y-auto">
            {loading ? (
              <p className="px-4 py-8 text-center text-sm text-slate-500">Loading…</p>
            ) : !rows.length ? (
              <p className="px-4 py-8 text-center text-sm text-slate-500">You have no notifications yet.</p>
            ) : (
              rows.map((n) => (
                <div
                  key={n.notification_id}
                  className={`border-b border-slate-100 px-4 py-3 transition last:border-0 ${n.is_read ? '' : 'bg-brand-50/50'}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium text-slate-800">{n.title}</p>
                    <span className={`chip shrink-0 ${statusClass(n.severity)}`}>{titleCase(n.type)}</span>
                  </div>
                  <p className="mt-0.5 text-xs leading-snug text-slate-600">{n.message}</p>
                  <div className="mt-1.5 flex items-center justify-between">
                    <span className="text-[11px] text-slate-400">{dateTimeStr(n.created_at)}</span>
                    {!n.is_read ? (
                      <button type="button" onClick={() => markOne(n.notification_id)} className="text-[11px] text-brand-700 hover:underline">
                        Mark read
                      </button>
                    ) : null}
                  </div>
                </div>
              ))
            )}
          </div>
          <Link to="/notifications" className="block bg-slate-50 px-4 py-2.5 text-center text-xs font-medium text-brand-700 hover:bg-slate-100">
            View all notifications
          </Link>
        </div>
      ) : null}
    </div>
  );
}
