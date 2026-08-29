import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { GuestModule } from '../guest/guest.module';
import {
  MonsterController,
  PublicMonsterController,
  WorldController,
} from './world.controller';
import { WorldGateway } from './world.gateway';
import { WorldLockService } from './world-lock.service';
import { WorldPersistenceService } from './world-persistence.service';
import { WorldRunnerService } from './world-runner.service';
import { WorldService } from './world.service';
import { AdminMonsterController } from './admin-monster.controller';
import { AdminWorldController } from './admin-world.controller';

@Module({
  imports: [PrismaModule, GuestModule],
  controllers: [
    WorldController,
    MonsterController,
    PublicMonsterController,
    AdminMonsterController,
    AdminWorldController,
  ],
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
