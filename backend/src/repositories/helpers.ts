import { query, Row } from '../config/database';
import { Paging, buildMeta, Meta } from '../utils/api';

export interface ListOptions {
  /** SELECT ... FROM ... JOIN ... GROUP BY ... (no WHERE / ORDER BY / LIMIT) */
  baseSql: string;
  where?: { clause: string; params: unknown[] };
  orderBy?: string;
  paging?: Paging;
}

export interface ListResult<T> {
  rows: T[];
  meta?: Meta;
  total: number;
}

/**
 * Generic paginated list. The count is derived by wrapping the base query, so it
 * also works for GROUP BY based listings.
 */
export async function paginate<T = Row>(opts: ListOptions): Promise<ListResult<T>> {
  const { baseSql, where, orderBy, paging } = opts;
  const clause = where?.clause ?? '';
  const params = where?.params ?? [];

  if (!paging) {
    const rows = await query<T>(
      `${baseSql} ${clause} ${orderBy ? `ORDER BY ${orderBy}` : ''}`.trim(),
      params,
    );
    return { rows, total: rows.length };
  }

  const totalRow = await query<Row>(
    `SELECT COUNT(*) AS total FROM (${baseSql} ${clause}) AS __count`,
    params,
  );
  const total = Number(totalRow[0]?.total ?? 0);

  const rows = await query<T>(
    `${baseSql} ${clause} ${orderBy ? `ORDER BY ${orderBy}` : ''} LIMIT ? OFFSET ?`,
    [...params, paging.limit, paging.offset],
  );
  return { rows, meta: buildMeta(paging.page, paging.limit, total), total };
}

/** Adds a LIKE based free text search over several columns to a WHERE clause. */
export function searchClause(
  columns: string[],
  term: string | undefined,
  existing?: { clause: string; params: unknown[] },
): { clause: string; params: unknown[] } {
  const parts: string[] = [];
  const params: unknown[] = [];
  if (existing?.clause) {
    parts.push(existing.clause.replace(/^WHERE\s+/i, ''));
    params.push(...existing.params);
  }
  if (term && term.trim()) {
    const like = `%${term.trim()}%`;
    parts.push(`(${columns.map((c) => `${c} LIKE ?`).join(' OR ')})`);
    params.push(...columns.map(() => like));
  }
  return { clause: parts.length ? `WHERE ${parts.join(' AND ')}` : '', params };
}
