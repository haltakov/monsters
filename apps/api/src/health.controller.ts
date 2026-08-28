import { Controller, Get } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { PrismaService } from './prisma/prisma.service';
import { WorldRunnerService } from './world/world-runner.service';

@Controller('health')
@SkipThrottle()
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly runner: WorldRunnerService,
  ) {}

  @Get()
  async check() {
    await this.prisma.$queryRaw`SELECT 1`;
    const runner = this.runner.getStatus();

    return {
      status: 'ok',
      database: 'connected',
      // `ownsWorld` is false on an instance that is only standing by, so a
      // rolling deploy never reports two owners.
      worldRunner: runner,
      process: {
        rssMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
        heapUsedMb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        uptimeSeconds: Math.round(process.uptime()),
      },
      timestamp: new Date().toISOString(),
    };
  }
}
