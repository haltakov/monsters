import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { AccountAuthGuard, AdminGuard } from '../auth/account-auth.guard';
import { AdminResetWorldDto } from './dto/admin-world.dto';
import { WorldService } from './world.service';

@Controller('admin/world')
@UseGuards(AccountAuthGuard, AdminGuard)
export class AdminWorldController {
  constructor(private readonly worlds: WorldService) {}

  @Post('reset')
  @HttpCode(200)
  reset(@Body() body: AdminResetWorldDto) {
    return this.worlds.adminResetWorld(body.population);
  }
}
