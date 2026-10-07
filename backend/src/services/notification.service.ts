import { callProc } from '../config/database';
import { AppError, parsePaging } from '../utils/api';
import { notificationsRepo } from '../repositories/notification.repository';
import { audit } from '../utils/audit';
import { AuthUser } from '../middleware/auth';

export const notifications = {
  mine: (userId: number, limit?: number) => notificationsRepo.forUser(userId, limit ?? 30),
  unread: async (userId: number) => {
    const row = await notificationsRepo.unreadCount(userId);
    return { unread: Number(row?.unread ?? 0) };
  },
  async markRead(id: number, userId: number) {
    const res = await notificationsRepo.markRead(id, userId);
    if (!res.affectedRows) throw AppError.notFound('Notification');
    return { read: true };
  },
  async markAllRead(userId: number) {
    const res = await notificationsRepo.markAllRead(userId);
    return { updated: res.affectedRows };
  },
};

export const announcements = {
  /**
   * Targeted broadcast. `target` selects the audience:
   *   ALL | STUDENT | FACULTY | PROGRAM:<id>
   * Uses one INSERT ... VALUES (),(),() rather than N calls.
   */
  async send(b: {
    title: string; message: string; severity?: string; link?: string;
    target: string;
  }, actor: AuthUser) {
    const [kind, value] = String(b.target ?? 'ALL').split(':');
    let userIds: number[] = [];
    if (kind === 'ALL') {
      userIds = (await notificationsRepo.userIdsByRole('ADMIN'))
        .concat(await notificationsRepo.userIdsByRole('FACULTY'))
        .concat(await notificationsRepo.userIdsByRole('STUDENT'))
        .map((r) => Number(r.userId));
    } else if (kind === 'PROGRAM' && value) {
      userIds = (await notificationsRepo.userIdsByProgram(Number(value))).map((r) => Number(r.userId));
    } else {
      userIds = (await notificationsRepo.userIdsByRole(kind)).map((r) => Number(r.userId));
    }
    userIds = Array.from(new Set(userIds));
    const inserted = await notificationsRepo.broadcast(userIds, {
      title: b.title, message: b.message, severity: b.severity ?? 'INFO', link: b.link,
    });
    await audit({
      userId: actor.userId, action: 'CREATE', entity: 'notifications',
      description: `Announcement "${b.title}" sent to ${inserted} recipients (${b.target})`,
      newValue: { target: b.target, recipients: inserted },
    });
    return { recipients: inserted };
  },

  /** Single push helper that goes through the stored procedure. */
  async push(userId: number, b: { title: string; message: string; type?: string; severity?: string; link?: string }) {
    await callProc('sp_push_notification',
      [userId, b.title, b.message, b.type ?? 'GENERAL', b.severity ?? 'INFO', null, null, b.link ?? null]);
    return { pushed: true };
  },
};
