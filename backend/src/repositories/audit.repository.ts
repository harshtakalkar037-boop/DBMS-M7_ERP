import { query, queryOne, Row } from '../config/database';
import { paginate, ListResult } from './helpers';
import { Paging } from '../utils/api';

export const auditRepo = {
  list: (q: Record<string, any>, paging: Paging): Promise<ListResult<Row>> => {
    const parts: string[] = [];
    const params: unknown[] = [];
    if (q.entity) { parts.push('a.entity = ?'); params.push(q.entity); }
    if (q.action) { parts.push('a.action = ?'); params.push(q.action); }
    if (q.userId) { parts.push('a.user_id = ?'); params.push(q.userId); }
    if (q.from) { parts.push('DATE(a.created_at) >= ?'); params.push(q.from); }
    if (q.to) { parts.push('DATE(a.created_at) <= ?'); params.push(q.to); }
    if (q.search) { parts.push('a.description LIKE ?'); params.push(`%${q.search}%`); }
    return paginate<Row>({
      baseSql: `SELECT a.log_id AS id, a.action, a.entity, a.entity_id AS entityId, a.description,
                       a.old_value AS oldValue, a.new_value AS newValue,
                       a.ip_address AS ipAddress, a.created_at AS createdAt,
                       u.email AS actor
                FROM audit_logs a LEFT JOIN users u ON u.user_id = a.user_id`,
      where: { clause: parts.length ? `WHERE ${parts.join(' AND ')}` : '', params },
      orderBy: 'a.log_id DESC',
      paging,
    });
  },
  actionsSummary: () => query<Row>(
    `SELECT action, COUNT(*) AS count, MAX(created_at) AS lastAt
     FROM audit_logs GROUP BY action ORDER BY count DESC`),
  entitySummary: () => query<Row>(
    `SELECT entity, COUNT(*) AS count FROM audit_logs GROUP BY entity ORDER BY count DESC LIMIT 20`),
  stats: () => queryOne<Row>(
    `SELECT COUNT(*) AS total,
            SUM(DATE(created_at) = CURDATE()) AS today,
            SUM(action = 'LOGIN') AS logins,
            SUM(action = 'LOGIN_FAILED') AS failedLogins,
            SUM(action = 'FEE_CHANGE') AS feeChanges,
            SUM(action = 'MARKS_UPDATE') AS marksUpdates,
            SUM(action = 'HOSTEL_ALLOCATION') AS hostelActions,
            SUM(action = 'PAYROLL_RUN') AS payrollRuns
     FROM audit_logs`),
};
