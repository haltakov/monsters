import 'dotenv/config';
import { resolveTestDatabaseUrl } from './test-database';

process.env.DATABASE_URL = resolveTestDatabaseUrl();
// Each suite opts in explicitly; most do not need a ticking world.
process.env.WORLD_RUNNER_ENABLED ??= 'false';
process.env.WEB_ORIGIN ??= 'http://localhost:3100';
