import mysql, { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { env } from './env';

/**
 * Single shared connection pool for the whole application.
 *
 * All statements use placeholders (?) - string interpolation into SQL is never
 * used for user supplied values, which is what protects the system from SQL
 * injection (OWASP A1).
 */
export const pool: Pool = mysql.createPool({
  host: env.db.host,
  port: env.db.port,
  user: env.db.user,
  password: env.db.password,
  database: env.db.database,
  waitForConnections: true,
  connectionLimit: env.db.connectionLimit,
  queueLimit: 0,
  charset: 'utf8mb4',
  namedPlaceholders: false,
  dateStrings: true,          // avoids timezone drift on DATE columns
  // BIGINT (COUNT(*), ids) comes back as a JS number; DECIMAL stays a string
  // (mysql2 `decimalNumbers` defaults to false) so money never loses precision.
  supportBigNumbers: false,
  bigNumberStrings: false,
  decimalNumbers: false,
  // NOTE: a custom `typeCast` is deliberately NOT used here. With this driver
  // version it corrupts values for prepared statements on MariaDB. Booleans are
  // converted from TINYINT(1) in `query()` below instead, using the column
  // metadata returned with every result set.
});

export type Row = RowDataPacket & Record<string, any>;
export type { PoolConnection };

/* ------------------------------------------------------------------ helpers */

/**
 * TINYINT(1) is the boolean type used throughout the schema. MySQL returns it as
 * 0/1, so we turn those columns into real booleans using the result metadata.
 */
const TINY = 1;

function coerceBooleans(rows: unknown, fields: unknown): void {
  if (!Array.isArray(rows) || !Array.isArray(fields)) return;
  const boolCols: string[] = [];
  for (const f of fields as Array<{ name?: string; columnType?: number; columnLength?: number }>) {
    if (f?.columnType === TINY && f.columnLength === 1 && f.name) boolCols.push(f.name);
  }
  if (!boolCols.length) return;
  for (const row of rows as Array<Record<string, unknown>>) {
    if (!row || typeof row !== 'object') continue;
    for (const col of boolCols) {
      if (col in row) row[col] = Number(row[col]) === 1;
    }
  }
}

/** Run a SELECT and return the rows. */
export async function query<T = Row>(sql: string, params: unknown[] = []): Promise<T[]> {
  const [rows, fields] = await pool.execute(sql, params as any[]);
  coerceBooleans(rows, fields);
  return rows as T[];
}

/** Run a SELECT that is expected to return at most one row. */
export async function queryOne<T = Row>(sql: string, params: unknown[] = []): Promise<T | null> {
  const rows = await query<T>(sql, params);
  return rows.length ? rows[0] : null;
}

/** Run a SELECT that returns a single scalar value. */
export async function scalar<T = number>(sql: string, params: unknown[] = []): Promise<T | null> {
  const row = await queryOne<Row>(sql, params);
  if (!row) return null;
  const value = Object.values(row)[0];
  return (value === null || value === undefined ? null : value) as T | null;
}

/** Run an INSERT / UPDATE / DELETE and return the affected-row metadata. */
export async function execute(sql: string, params: unknown[] = []): Promise<ResultSetHeader> {
  const [res] = await pool.execute(sql, params as any[]);
  return res as ResultSetHeader;
}

/** Run several statements in one transaction. */
export async function transaction<T>(fn: (conn: PoolConnection) => Promise<T>): Promise<T> {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback().catch(() => undefined);
    throw err;
  } finally {
    conn.release();
  }
}

export interface ProcResult {
  rows: Row[];
  out: Record<string, any>;
}

/**
 * CALL a stored procedure and read its OUT parameters.
 *
 * MySQL returns OUT parameters in session variables, so we run the CALL and a
 * follow-up SELECT on the *same* connection:
 *   CALL sp_x(?, ?, @a, @b); SELECT @a AS a, @b AS b;
 */
export async function callProc(
  name: string,
  inParams: unknown[] = [],
  outParams: string[] = [],
): Promise<ProcResult> {
  const conn = await pool.getConnection();
  try {
    const placeholders = [
      ...inParams.map(() => '?'),
      ...outParams.map((o) => `@${o}`),
    ].join(', ');
    const callSql = outParams.length || inParams.length
      ? `CALL \`${name}\`(${placeholders})`
      : `CALL \`${name}\`()`;

    const [raw] = await conn.query(callSql, inParams as any[]);
    const rows = Array.isArray(raw) ? (raw as Row[]) : [];

    let out: Record<string, any> = {};
    if (outParams.length) {
      const [outRows] = await conn.query(
        `SELECT ${outParams.map((o) => `@${o} AS \`${o}\``).join(', ')}`,
      );
      out = ((outRows as Row[]) ?? [])[0] ?? {};
    }
    return { rows, out };
  } finally {
    conn.release();
  }
}

/** Ping the database - used by /health and by the startup banner. */
export async function ping(): Promise<boolean> {
  try {
    await pool.query('SELECT 1');
    return true;
  } catch {
    return false;
  }
}
