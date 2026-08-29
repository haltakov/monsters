import { Module } from '@nestjs/common';
import { GuestModule } from '../guest/guest.module';
import { PrismaModule } from '../prisma/prisma.module';
import { AccountController } from './account.controller';
import { AccountService } from './account.service';

@Module({
  imports: [PrismaModule, GuestModule],
  controllers: [AccountController],
  providers: [AccountService],
})
export class AccountModule {}
