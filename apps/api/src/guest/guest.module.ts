import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { GuestAuthGuard } from './guest-auth.guard';
import { GuestController } from './guest.controller';
import { GuestService } from './guest.service';

@Module({
  imports: [PrismaModule],
  controllers: [GuestController],
  providers: [GuestService, GuestAuthGuard],
  exports: [GuestService, GuestAuthGuard],
})
export class GuestModule {}
