import { query, queryOne, execute, Row } from '../config/database';

export const notificationsRepo = {
  /** Latest notifications for the bell icon / notification centre. */
  forUser: (userId: number, limit = 30) => query<Row>(
    `SELECT * FROM notifications
     WHERE user_id = ? OR user_id IS NULL
     ORDER BY created_at DESC, notification_id DESC LIMIT ?`, [userId, limit]),
  unreadCount: (userId: number) => queryOne<Row>(
    `SELECT COUNT(*) AS unread FROM notifications
     WHERE (user_id = ? OR user_id IS NULL) AND is_read = 0`, [userId]),
  markRead: (id: number, userId: number) => execute(
    `UPDATE notifications SET is_read = 1, read_at = NOW()
     WHERE notification_id = ? AND (user_id = ? OR user_id IS NULL)`, [id, userId]),
  markAllRead: (userId: number) => execute(
    `UPDATE notifications SET is_read = 1, read_at = NOW()
     WHERE (user_id = ? OR user_id IS NULL) AND is_read = 0`, [userId]),
  create: async (b: {
    userId?: number | null; title: string; message: string; type?: string;
    severity?: string; entity?: string; entityId?: number | null; link?: string;
  }): Promise<number> => {
    const res = await execute(
      `INSERT INTO notifications (user_id, title, message, type, severity, entity, entity_id, link)
       VALUES (?,?,?,?,?,?,?,?)`,
      [b.userId ?? null, b.title, b.message, b.type ?? 'GENERAL', b.severity ?? 'INFO',
       b.entity ?? null, b.entityId ?? null, b.link ?? null],
    );
    return res.insertId;
  },
  /** Broadcast to a set of users - used by announcements. */
  broadcast: async (userIds: number[], b: {
    title: string; message: string; type?: string; severity?: string; link?: string;
  }): Promise<number> => {
    if (!userIds.length) return 0;
    const values = userIds.map(() => '(?,?,?,?,?,NULL,NULL,?)').join(',');
    const params: unknown[] = [];
    for (const id of userIds) {
      params.push(id, b.title, b.message, b.type ?? 'ANNOUNCEMENT',
        b.severity ?? 'INFO', b.link ?? null);
    }
    const res = await execute(
      `INSERT INTO notifications (user_id, title, message, type, severity, entity, entity_id, link)
       VALUES ${values}`, params);
    return res.affectedRows;
  },
  userIdsByRole: (roleCode: string) => query<Row>(
    `SELECT u.user_id AS userId FROM users u
     JOIN roles r ON r.role_id = u.role_id
     WHERE r.role_code = ? AND u.is_active = 1`, [roleCode]),
  userIdsByProgram: (programId: number) => query<Row>(
    `SELECT s.user_id AS userId FROM students s WHERE s.program_id = ? AND s.status = 'ACTIVE'`, [programId]),
};
