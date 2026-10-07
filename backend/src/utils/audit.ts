import { execute, query } from '../config/database';
import { mongo } from '../config/mongo';
import { logger } from './logger';

export type AuditAction =
  | 'LOGIN' | 'LOGOUT' | 'LOGIN_FAILED' | 'CREATE' | 'UPDATE' | 'DELETE'
  | 'PAYMENT' | 'FEE_CHANGE' | 'MARKS_UPDATE' | 'ATTENDANCE_UPDATE'
  | 'HOSTEL_ALLOCATION' | 'EXAM_REGISTRATION' | 'RESULT_PUBLISHED'
  | 'LEAVE_ACTION' | 'PAYROLL_RUN' | 'APPROVE' | 'REJECT' | 'SYSTEM';

interface AuditInput {
  userId?: number | null;
  action: AuditAction;
  entity: string;
  entityId?: number | null;
  description?: string | null;
  oldValue?: unknown;
  newValue?: unknown;
  ip?: string | null;
  userAgent?: string | null;
}

/**
 * Writes one audit_logs row. Audit failures must never break the request that
 * triggered them, so every error here is swallowed and logged.
 */
export async function audit(input: AuditInput): Promise<void> {
  try {
    await execute(
      `INSERT INTO audit_logs
         (user_id, action, entity, entity_id, description, old_value, new_value, ip_address, user_agent)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        input.userId ?? null,
        input.action,
        input.entity,
        input.entityId ?? null,
        input.description ?? null,
        input.oldValue === undefined ? null : JSON.stringify(input.oldValue),
        input.newValue === undefined ? null : JSON.stringify(input.newValue),
        input.ip ?? null,
        (input.userAgent ?? '').slice(0, 255) || null,
      ],
    );

    // Optional MongoDB mirror (justified: append-only, high volume time series).
    await mongo.insertAuditEvent({
      userId: input.userId ?? null,
      action: input.action,
      entity: input.entity,
      entityId: input.entityId ?? null,
      description: input.description ?? null,
      at: new Date(),
      ip: input.ip ?? null,
    });
  } catch (err) {
    logger.warn(`audit write failed: ${(err as Error).message}`);
  }
}

export async function recentAudit(limit = 50, entity?: string) {
  return query(
    `SELECT l.log_id AS id, l.action, l.entity, l.entity_id AS entityId, l.description,
            l.created_at AS createdAt, u.email AS actorEmail
     FROM audit_logs l
     LEFT JOIN users u ON u.user_id = l.user_id
     ${entity ? 'WHERE l.entity = ?' : ''}
     ORDER BY l.log_id DESC LIMIT ${Number(limit) || 50}`,
    entity ? [entity] : [],
  );
}
