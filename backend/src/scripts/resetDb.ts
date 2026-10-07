/**
 * npm run db:reset
 *
 * Drops and rebuilds the ERP database from database/*.sql, in dependency order.
 * Equivalent to `bash scripts/reset-db.sh`, but through the app's own connection
 * settings (so it works wherever .env points) and without needing the mysql client.
 *
 *   npm run db:reset            # rebuild + seed
 *   npm run db:reset -- --keep  # rebuild schema only, no seed data
 */
import { env } from '../config/env';
import { LOAD_ORDER, runFiles, SQL_DIR, withRunner } from './sqlRunner';

const seed = !process.argv.includes('--keep');
const noSeed = process.argv.includes('--no-seed');
const withSeed = seed && !noSeed;

async function main(): Promise<void> {
  const db = env.db.database;
  console.log(`>> Rebuilding database '${db}' on ${env.db.host}:${env.db.port}`);
  console.log(`   (SQL source: ${SQL_DIR})`);

  await withRunner(async (conn) => {
    await conn.query(`DROP DATABASE IF EXISTS \`${db}\``);
    await conn.query(
      `CREATE DATABASE \`${db}\` DEFAULT CHARACTER SET utf8mb4 DEFAULT COLLATE utf8mb4_unicode_ci`,
    );
    await conn.query(`USE \`${db}\``);
  });

  const order = LOAD_ORDER.filter((f) => withSeed || f !== '04_seed.sql');
  await runFiles(order, { failFast: true });

  console.log(`>> Done. ${withSeed ? 'Schema + seed data loaded.' : 'Schema only (no seed).'}`);
  console.log(`>> Log in with any seeded account — see docs/DEMO_CREDENTIALS.md`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
