import { Global, Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AccountAuthGuard, AdminGuard } from './account-auth.guard';
import { AuthConfigurationController } from './auth.controller';
import { AuthService } from './auth.service';

@Global()
@Module({
  imports: [PrismaModule],
  controllers: [AuthConfigurationController],
  providers: [AuthService, AccountAuthGuard, AdminGuard],
  exports: [AuthService, AccountAuthGuard, AdminGuard],
})
export class AuthModule {}
