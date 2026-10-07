/**
 * Shared helper for the `db:*` npm scripts.
 *
 * It runs .sql files the same way `mysql < file.sql` would, but through the
 * application's own connection settings, so there is nothing extra to configure.
 *
 * Why the split at all? Because `mysql2` will not accept two statements in one
 * call unless `multipleStatements` is enabled — and we deliberately do NOT enable
 * it on the application pool (that is how injection becomes possible). This
 * runner opens its own short-lived connection with the flag on, and only ever
 * feeds it files from disk that we ship.
 */
import fs from 'fs';
import path from 'path';
import mysql from 'mysql2/promise';
import { env } from '../config/env';

export const SQL_DIR = path.resolve(__dirname, '..', '..', '..', 'database');

/** Order matters — see 01_schema.sql and scripts/reset-db.sh. */
export const LOAD_ORDER = [
  '01_schema.sql',
  '02_tables.sql',
  '03_constraints.sql',
  '07_functions.sql',
  '08_views.sql',
  '04_seed.sql',
  '05_procedures.sql',
  '06_triggers.sql',
];

export type RunnerOptions = {
  /** Print each statement batch as it runs (very noisy — off by default). */
  verbose?: boolean;
  /** Stop at the first error (default true). */
  failFast?: boolean;
};

export async function withRunner<T>(
  fn: (conn: mysql.Connection) => Promise<T>,
): Promise<T> {
  const conn = await mysql.createConnection({
    host: env.db.host,
    port: env.db.port,
    user: env.db.user,
    password: env.db.password,
    database: env.db.database,
    multipleStatements: true,
    charset: 'utf8mb4',
  });
  try {
    return await fn(conn);
  } finally {
    await conn.end();
  }
}

/**
 * Split a file into executable chunks.
 *
 * Stored routines and triggers contain `;` inside their bodies, so the file
 * temporarily switches to `$$` (or `//`) as the delimiter — the same trick the
 * mysql client uses. We honour those DELIMITER directives instead of guessing.
 */
export function splitStatements(sql: string): string[] {
  const out: string[] = [];
  let delimiter = ';';
  let buffer = '';

  const lines = sql.split(/\r?\n/);
  for (const raw of lines) {
    const line = raw;
    const dm = /^\s*DELIMITER\s+(\S+)\s*$/i.exec(line);
    if (dm) {
      if (buffer.trim()) out.push(buffer.trim());
      buffer = '';
      delimiter = dm[1]!;
      continue;
    }
    // drop whole-line comments and blank lines that would otherwise join chunks
    if (!buffer.trim() && (/^\s*--/.test(line) || line.trim() === '')) continue;

    buffer += `${line}\n`;
    const idx = buffer.lastIndexOf(delimiter);
    if (idx !== -1) {
      const chunk = buffer.slice(0, idx).trim();
      const rest = buffer.slice(idx + delimiter.length);
      if (chunk) out.push(chunk);
      buffer = rest;
    }
  }
  if (buffer.trim()) out.push(buffer.trim());
  return out.filter((s) => s.length > 0);
}

export async function runFile(
  conn: mysql.Connection,
  file: string,
  opts: RunnerOptions = {},
): Promise<{ file: string; statements: number; failed: number }> {
  const full = path.isAbsolute(file) ? file : path.join(SQL_DIR, file);
  const sql = fs.readFileSync(full, 'utf8');
  const statements = splitStatements(sql);
  let failed = 0;

  for (const statement of statements) {
    try {
      if (opts.verbose) process.stdout.write(`    ${statement.slice(0, 70).replace(/\s+/g, ' ')}…\n`);
      await conn.query(statement);
    } catch (e) {
      failed += 1;
      const msg = e instanceof Error ? e.message : String(e);
      process.stderr.write(`  !  ${path.basename(full)}: ${msg.split('\n')[0]}\n`);
      if (opts.failFast !== false) throw e;
    }
  }
  return { file: path.basename(full), statements: statements.length, failed };
}

export async function runFiles(
  files: string[],
  opts: RunnerOptions = {},
): Promise<void> {
  await withRunner(async (conn) => {
    for (const f of files) {
      process.stdout.write(`  → ${f.padEnd(22)}`);
      const started = Date.now();
      // 01_schema.sql contains `CREATE DATABASE … USE university_erp` for the
      // plain `mysql < 01_schema.sql` path. When the target database has another
      // name (CI, per-branch clones) that USE would hijack the rest of the run,
      // so we re-assert the configured database before every file.
      await conn.query(`USE \`${env.db.database}\``);
      const { statements, failed } = await runFile(conn, f, opts);
      const secs = ((Date.now() - started) / 1000).toFixed(1);
      process.stdout.write(` ${statements} statements, ${failed} failed (${secs}s)\n`);
    }
  });
}
