import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { HealthController } from './health.controller';
import { GuestModule } from './guest/guest.module';
import { PrismaModule } from './prisma/prisma.module';
import { WorldModule } from './world/world.module';

@Module({
  imports: [
    // In-memory rate limiting sized for a small public prototype. No Redis.
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 240 }]),
    PrismaModule,
    GuestModule,
    WorldModule,
  ],
  controllers: [AppController, HealthController],
  providers: [AppService, { provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
