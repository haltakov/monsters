import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  AccountAuthGuard,
  AdminGuard,
  type AccountRequest,
} from '../auth/account-auth.guard';
import {
  AdminCreateMonsterDto,
  AdminUpdateMonsterDto,
} from './dto/monster.dto';
import { WorldService } from './world.service';
import { getWebOrigins } from '../config/app-config';

@Controller('admin/monsters')
@UseGuards(AccountAuthGuard, AdminGuard)
export class AdminMonsterController {
  constructor(private readonly worlds: WorldService) {}

  @Get()
  list(@Query('origin') origin?: string, @Query('search') search?: string) {
    return this.worlds.adminListMonsters(origin, search);
  }

  @Post()
  async create(@Body() body: AdminCreateMonsterDto) {
    return {
      monster: await this.worlds.adminCreateMonster(
        body.name,
        body.dna,
        body.spawn,
      ),
    };
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() body: AdminUpdateMonsterDto) {
    return { monster: await this.worlds.adminUpdateMonster(id, body) };
  }

  @Post(':id/spawn')
  @HttpCode(200)
  async spawn(@Param('id') id: string) {
    return { monster: await this.worlds.adminSpawnMonster(id) };
  }

  @Post(':id/kill')
  @HttpCode(200)
  async kill(@Param('id') id: string, @Req() request: AccountRequest) {
    if (
      request.headers.origin &&
      !getWebOrigins().includes(request.headers.origin)
    ) {
      throw new ForbiddenException('Untrusted request origin');
    }
    return {
      monster: await this.worlds.adminKillMonster(id, request.account!.user.id),
    };
  }
}
