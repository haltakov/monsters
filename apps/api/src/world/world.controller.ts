import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  ServiceUnavailableException,
  UseGuards,
} from '@nestjs/common';
import { CurrentGuest } from '../guest/current-guest.decorator';
import { GuestAuthGuard } from '../guest/guest-auth.guard';
import type { GuestRecord } from '../guest/guest.service';
import { buildSnapshot, createConnectionView } from './world-snapshot.builder';
import { WorldRunnerService } from './world-runner.service';
import { WorldService } from './world.service';
import { CreateMonsterDto, UpdateMonsterDto } from './dto/monster.dto';

@Controller('worlds')
export class WorldController {
  constructor(
    private readonly worlds: WorldService,
    private readonly runner: WorldRunnerService,
  ) {}

  /** Public metadata; no authentication required. */
  @Get('public')
  getPublicWorld() {
    return this.worlds.getPublicWorldMetadata();
  }

  /**
   * Authoritative bootstrap snapshot. Useful for a cold start or a reconnect
   * that happens before the socket is up.
   */
  @Get('public/snapshot')
  @UseGuards(GuestAuthGuard)
  async getSnapshot(@CurrentGuest() guest: GuestRecord) {
    const state = this.runner.getState();
    const world = this.runner.getWorld();
    if (!state || !world || !this.runner.isRunning) {
      throw new ServiceUnavailableException(
        'This API instance does not currently own the world',
      );
    }
    const member = await this.worlds.getMember(guest.id);
    return buildSnapshot(state, world, createConnectionView(), {
      guestId: guest.id,
      entityId: member.selectedMonsterId,
      connectionId: 'rest',
      isController: false,
    });
  }
}

@Controller('monsters')
@UseGuards(GuestAuthGuard)
export class MonsterController {
  constructor(private readonly worlds: WorldService) {}

  @Get()
  list(@CurrentGuest() guest: GuestRecord) {
    return this.worlds.listMonsters(guest.id);
  }

  @Post()
  @HttpCode(201)
  async create(
    @CurrentGuest() guest: GuestRecord,
    @Body() body: CreateMonsterDto,
  ) {
    const monster = await this.worlds.createMonster(
      guest.id,
      body.name,
      body.dna,
    );
    return { monster };
  }

  @Patch(':id')
  async update(
    @CurrentGuest() guest: GuestRecord,
    @Param('id') id: string,
    @Body() body: UpdateMonsterDto,
  ) {
    const monster = await this.worlds.updateMonster(guest.id, id, body);
    return { monster };
  }

  @Post(':id/select')
  @HttpCode(200)
  async select(@CurrentGuest() guest: GuestRecord, @Param('id') id: string) {
    const monster = await this.worlds.selectMonster(guest.id, id);
    return { monster };
  }
}
