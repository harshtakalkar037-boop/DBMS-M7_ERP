/**
 * npm run test:db
 *
 * Runs tests/db/test_rules.sql (the executable proof that the database rules,
 * triggers, procedures and functions behave) and prints a pass/fail summary.
 */
import fs from 'fs';
import path from 'path';
import { env } from '../config/env';
import { runFile, withRunner } from './sqlRunner';

const FILE = path.resolve(__dirname, '..', '..', '..', 'tests', 'db', 'test_rules.sql');

async function main(): Promise<void> {
  if (!fs.existsSync(FILE)) {
    console.error(`Missing ${FILE}`);
    process.exit(1);
  }
  console.log(`>> Running database rule tests against '${env.db.database}'\n`);
  const started = Date.now();
  await withRunner(async (conn) => {
    const { statements, failed } = await runFile(conn, FILE, { failFast: false });
    console.log(`\n>> ${statements - failed}/${statements} statements executed cleanly`);
    console.log(`   (the test script prints PASS/FAIL per rule above; statements that MUST be`);
    console.log(`    rejected are expected to fail, so a non-zero count is normal here)`);
  });
  console.log(`>> finished in ${((Date.now() - started) / 1000).toFixed(1)}s`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
