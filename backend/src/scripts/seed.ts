/**
 * npm run db:seed
 *
 * Loads database/04_seed.sql into the existing schema (tables must already exist).
 * Safe to re-run only on an empty schema — run `npm run db:reset` to start over.
 */
import { env } from '../config/env';
import { runFiles, withRunner } from './sqlRunner';

async function main(): Promise<void> {
  const tableRows = await withRunner(async (conn) => {
    const [r] = await conn.query(
      `SELECT COUNT(*) AS n FROM information_schema.tables
       WHERE table_schema = ? AND table_type = 'BASE TABLE'`,
      [env.db.database],
    );
    return r as Array<{ n: number }>;
  });
  const tables = Number(tableRows[0]?.n ?? 0);
  if (tables < 10) {
    console.error(`Only ${tables} tables in '${env.db.database}'. Load 01–03 first (npm run db:reset).`);
    process.exit(1);
  }
  const studentRows = await withRunner(async (conn) => {
    const [r] = await conn.query('SELECT COUNT(*) AS n FROM students');
    return r as Array<{ n: number }>;
  });
  const n = studentRows[0]?.n ?? 0;
  if (Number(n) > 0) {
    console.error(`'${env.db.database}' already holds ${n} students. Use: npm run db:reset`);
    process.exit(1);
  }
  await runFiles(['04_seed.sql'], { failFast: true });
  console.log('>> Seed loaded.');
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
