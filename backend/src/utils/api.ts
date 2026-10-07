import { Row } from '../config/database';

/* --------------------------------------------------------------- responses */

export interface Meta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface SuccessBody<T> {
  success: true;
  data: T;
  message?: string;
  meta?: Meta;
}

export interface ErrorBody {
  success: false;
  message: string;
  code?: string;
  errors?: Array<{ field: string; message: string }>;
}

export const ok = <T>(data: T, message?: string, meta?: Meta): SuccessBody<T> => ({
  success: true,
  data,
  ...(message ? { message } : {}),
  ...(meta ? { meta } : {}),
});

export const buildMeta = (page: number, limit: number, total: number): Meta => ({
  page,
  limit,
  total,
  totalPages: limit > 0 ? Math.ceil(total / limit) : 0,
});

/* ----------------------------------------------------------------- errors */

export type ErrorCode =
  | 'BAD_REQUEST'
  | 'VALIDATION_ERROR'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'BUSINESS_RULE'
  | 'TOO_MANY_REQUESTS'
  | 'INTERNAL';

const STATUS: Record<ErrorCode, number> = {
  BAD_REQUEST: 400,
  VALIDATION_ERROR: 422,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  BUSINESS_RULE: 409,
  TOO_MANY_REQUESTS: 429,
  INTERNAL: 500,
};

export class AppError extends Error {
  public readonly status: number;
  public readonly code: ErrorCode;
  public readonly details?: Array<{ field: string; message: string }>;

  constructor(
    message: string,
    code: ErrorCode = 'INTERNAL',
    details?: Array<{ field: string; message: string }>,
  ) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.status = STATUS[code] ?? 500;
    this.details = details;
    Object.setPrototypeOf(this, AppError.prototype);
  }

  static badRequest(message = 'Invalid request') {
    return new AppError(message, 'BAD_REQUEST');
  }
  static validation(message: string, details?: Array<{ field: string; message: string }>) {
    return new AppError(message, 'VALIDATION_ERROR', details);
  }
  static unauthorized(message = 'Authentication required') {
    return new AppError(message, 'UNAUTHORIZED');
  }
  static forbidden(message = 'You are not allowed to perform this action') {
    return new AppError(message, 'FORBIDDEN');
  }
  static notFound(entity = 'Resource') {
    return new AppError(`${entity} not found`, 'NOT_FOUND');
  }
  static conflict(message = 'Resource already exists') {
    return new AppError(message, 'CONFLICT');
  }
  static business(message: string) {
    return new AppError(message, 'BUSINESS_RULE');
  }
}

/**
 * Translate a MySQL error into a safe, user friendly AppError.
 * Raw driver messages (which leak schema details) are never returned to clients.
 */
export function toAppError(err: unknown): AppError {
  if (err instanceof AppError) return err;

  const e = err as { code?: string; sqlMessage?: string; message?: string; sqlState?: string };
  const code = e?.code ?? '';
  const message = e?.sqlMessage ?? e?.message ?? '';

  // SIGNAL SQLSTATE '45000' raised by our own triggers / procedures.
  if (e?.sqlState === '45000' || code === 'ER_SIGNAL_EXCEPTION') {
    return AppError.business(message || 'The operation was rejected by a business rule');
  }
  switch (code) {
    case 'ER_DUP_ENTRY': {
      const match = /for key '([^']+)'/.exec(message);
      const key = match ? match[1] : 'unique constraint';
      return AppError.conflict(`A record with that ${humaniseKey(key)} already exists`);
    }
    case 'ER_NO_REFERENCED_ROW':
    case 'ER_NO_REFERENCED_ROW_2':
      return AppError.badRequest('Referenced record does not exist');
    case 'ER_ROW_IS_REFERENCED':
    case 'ER_ROW_IS_REFERENCED_2':
      return AppError.conflict('This record is still referenced by other data and cannot be removed');
    case 'ER_DATA_TOO_LONG':
      return AppError.validation('One of the values is too long for its column');
    case 'ER_BAD_NULL_ERROR':
      return AppError.validation('A required value is missing');
    case 'ER_CHECK_CONSTRAINT_VIOLATED':
      return AppError.validation(message || 'A database check constraint was violated');
    case 'ER_PARSE_ERROR':
    case 'ER_BAD_FIELD_ERROR':
      return AppError.badRequest('Malformed query');
    default:
      return new AppError('An unexpected error occurred', 'INTERNAL');
  }
}

function humaniseKey(key: string): string {
  return key
    .replace(/^(uq|idx|fk)_/i, '')
    .replace(/_/g, ' ')
    .trim();
}

/* --------------------------------------------------------------- paging ---- */

export interface Paging {
  page: number;
  limit: number;
  offset: number;
}

export function parsePaging(q: Record<string, any>, defaultLimit = 20, maxLimit = 200): Paging {
  const page = Math.max(1, Number.parseInt(String(q.page ?? '1'), 10) || 1);
  const rawLimit = Number.parseInt(String(q.limit ?? defaultLimit), 10) || defaultLimit;
  const limit = Math.min(maxLimit, Math.max(1, rawLimit));
  return { page, limit, offset: (page - 1) * limit };
}

/**
 * Whitelist based ORDER BY. Only column names present in `allowed` can ever
 * reach the SQL string, so a crafted ?sort= cannot inject anything.
 */
export function buildOrderBy(
  q: Record<string, any>,
  allowed: string[],
  fallback = '1',
): string {
  const raw = String(q.sort ?? '');
  if (!raw) return fallback;
  const desc = raw.startsWith('-');
  const column = raw.replace(/^[-+]/, '');
  if (!allowed.includes(column)) return fallback;
  return `\`${column}\` ${desc ? 'DESC' : 'ASC'}`;
}

/** Build "WHERE a = ? AND b = ?" from a map of present filters. */
export function buildFilters(
  source: Record<string, any>,
  columnMap: Record<string, string>,
): { clause: string; params: unknown[] } {
  const parts: string[] = [];
  const params: unknown[] = [];
  for (const [key, column] of Object.entries(columnMap)) {
    const value = source[key];
    if (value === undefined || value === null || value === '') continue;
    parts.push(`${column} = ?`);
    params.push(value);
  }
  return { clause: parts.length ? `WHERE ${parts.join(' AND ')}` : '', params };
}

export const toNum = (v: unknown, fallback = 0): number => {
  const n = typeof v === 'number' ? v : Number.parseFloat(String(v ?? ''));
  return Number.isFinite(n) ? n : fallback;
};

export const rowsToCsv = (rows: Row[]): string => {
  if (!rows.length) return '';
  const headers = Object.keys(rows[0]);
  const esc = (v: unknown): string => {
    if (v === null || v === undefined) return '';
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [
    headers.join(','),
    ...rows.map((r) => headers.map((h) => esc(r[h])).join(',')),
  ].join('\n');
};
