import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { GuestModule } from '../guest/guest.module';
import { MonsterController, WorldController } from './world.controller';
import { WorldGateway } from './world.gateway';
import { WorldLockService } from './world-lock.service';
import { WorldPersistenceService } from './world-persistence.service';
import { WorldRunnerService } from './world-runner.service';
import { WorldService } from './world.service';

@Module({
  imports: [PrismaModule, GuestModule],
  controllers: [WorldController, MonsterController],
  providers: [
    WorldLockService,
    WorldPersistenceService,
    WorldRunnerService,
    WorldService,
    WorldGateway,
  ],
  exports: [WorldRunnerService, WorldService],
})
export class WorldModule {}
