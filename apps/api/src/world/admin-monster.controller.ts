import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AccountAuthGuard, AdminGuard } from '../auth/account-auth.guard';
import {
  AdminCreateMonsterDto,
  AdminUpdateMonsterDto,
} from './dto/monster.dto';
import { WorldService } from './world.service';

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
}
