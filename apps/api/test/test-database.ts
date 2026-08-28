/**
 * Integration tests run against a dedicated PostgreSQL database so they can
 * truncate freely without touching a developer's world.
 */
export function resolveTestDatabaseUrl(): string {
  const explicit = process.env.TEST_DATABASE_URL;
  if (explicit) return explicit;
  const base = process.env.DATABASE_URL;
  if (!base) {
    throw new Error(
      'DATABASE_URL (or TEST_DATABASE_URL) must be set to run API tests',
    );
  }
  const url = new URL(base);
  const database = url.pathname.replace(/^\//, '') || 'monsters';
  if (database.endsWith('_test')) return url.toString();
  url.pathname = `/${database}_test`;
  return url.toString();
}

export function adminDatabaseUrl(testUrl: string) {
  const url = new URL(testUrl);
  url.pathname = '/postgres';
  url.search = '';
  return url.toString();
}

export function testDatabaseName(testUrl: string) {
  return new URL(testUrl).pathname.replace(/^\//, '');
}
