import 'dotenv/config';
import { execFileSync } from 'node:child_process';
import { Client } from 'pg';
import {
  adminDatabaseUrl,
  resolveTestDatabaseUrl,
  testDatabaseName,
} from './test-database';

/** Creates the test database if needed and brings it up to date. */
export default async function globalSetup() {
  const testUrl = resolveTestDatabaseUrl();
  const admin = new Client({ connectionString: adminDatabaseUrl(testUrl) });
  await admin.connect();
  try {
    const name = testDatabaseName(testUrl);
    const exists = await admin.query(
      'SELECT 1 FROM pg_database WHERE datname = $1',
      [name],
    );
    if (exists.rowCount === 0) {
      await admin.query(`CREATE DATABASE "${name.replace(/"/g, '""')}"`);
    }
  } finally {
    await admin.end();
  }

  execFileSync(
    'node',
    ['node_modules/prisma/build/index.js', 'migrate', 'deploy'],
    {
      cwd: process.cwd(),
      env: { ...process.env, DATABASE_URL: testUrl },
      stdio: 'inherit',
    },
  );
}
