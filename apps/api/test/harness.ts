import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Client } from 'pg';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { WorldRunnerService } from '../src/world/world-runner.service';
import { getWebOrigins } from '../src/config/app-config';

export type Harness = {
  app: INestApplication;
  prisma: PrismaService;
  runner: WorldRunnerService;
  url: string;
  close: () => Promise<void>;
};

const TRUNCATE_SQL =
  'TRUNCATE TABLE "WorldEvent", "WorldSnapshot", "WorldMember", "Monster", "World", "GuestPlayer" RESTART IDENTITY CASCADE';

/** Removes every row so each suite starts from a known empty world. */
export async function resetDatabase(prisma: PrismaService) {
  await prisma.$executeRawUnsafe(TRUNCATE_SQL);
}

/** Same reset, usable before any Nest application exists. */
export async function resetDatabaseStandalone() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query(TRUNCATE_SQL);
  } finally {
    await client.end();
  }
}

export async function createHarness(
  options: { runner?: boolean; listen?: boolean } = {},
): Promise<Harness> {
  const previous = process.env.WORLD_RUNNER_ENABLED;
  process.env.WORLD_RUNNER_ENABLED = options.runner ? 'true' : 'false';

  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleRef.createNestApplication();
  app.enableCors({ origin: getWebOrigins(), credentials: true });
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.enableShutdownHooks();
  await app.init();

  let url = '';
  if (options.listen !== false) {
    await app.listen(0);
    url = await app.getUrl();
    // Node reports the IPv6 wildcard for port 0; clients need a real host.
    url = url.replace('[::1]', '127.0.0.1').replace('0.0.0.0', '127.0.0.1');
  }

  process.env.WORLD_RUNNER_ENABLED = previous;
  const prisma = app.get(PrismaService);
  const runner = app.get(WorldRunnerService);

  return {
    app,
    prisma,
    runner,
    url,
    close: async () => {
      await runner.shutdown();
      await app.close();
    },
  };
}

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Waits until `predicate` is true or the budget runs out. */
export async function waitFor(
  predicate: () => boolean | Promise<boolean>,
  { timeout = 8000, interval = 25 } = {},
) {
  const deadline = Date.now() + timeout;
  for (;;) {
    if (await predicate()) return;
    if (Date.now() > deadline) {
      throw new Error('Timed out waiting for a condition');
    }
    await sleep(interval);
  }
}
