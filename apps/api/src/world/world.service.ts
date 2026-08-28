import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  decodeMonsterDna,
  encodeMonsterDna,
  getMonsterSpawn,
  type MonsterDna,
} from '@monsters/game-core';
import type { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { normalizeDisplayName, parseDna } from '../common/validation';
import { PUBLIC_WORLD_SLUG } from '../config/app-config';
import { WorldRunnerService } from './world-runner.service';

/** Living monsters one guest may own at the same time. */
export const MAX_OWNED_MONSTERS = 6;

export type MonsterView = {
  id: string;
  name: string;
  species: string;
  dna: string;
  generation: number;
  parentIds: [string, string] | null;
  mutations: number;
  alive: boolean;
  diedAt: string | null;
  createdAt: string;
  inWorld: boolean;
  selected: boolean;
};

type MonsterRow = {
  id: string;
  name: string;
  species: string;
  dna: Prisma.JsonValue;
  generation: number;
  parentAId: string | null;
  parentBId: string | null;
  mutations: number;
  alive: boolean;
  diedAt: Date | null;
  createdAt: Date;
  ownerId: string | null;
};

export function readStoredDna(value: unknown): MonsterDna {
  if (value && typeof value === 'object' && 'code' in value) {
    const code = value.code;
    if (typeof code === 'string') return decodeMonsterDna(code);
  }
  throw new BadRequestException('Stored DNA is unreadable');
}

@Injectable()
export class WorldService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly runner: WorldRunnerService,
  ) {}

  private async requireWorld() {
    const world = await this.prisma.world.findUnique({
      where: { slug: PUBLIC_WORLD_SLUG },
    });
    if (!world) {
      throw new ServiceUnavailableException('The public world is not ready');
    }
    return world;
  }

  async getPublicWorldMetadata() {
    const world = await this.requireWorld();
    const status = this.runner.getStatus();
    return {
      id: world.id,
      slug: world.slug,
      name: world.name,
      isPublic: world.isPublic,
      status: world.status,
      tick: status.ownsWorld ? status.tick : world.currentTick,
      simulatedAt: world.simulatedAt.toISOString(),
      createdAt: world.createdAt.toISOString(),
      population: {
        living: status.livingEntities,
        eggs: status.eggs,
      },
      runner: {
        active: status.ownsWorld,
        tickRate: 10,
      },
    };
  }

  toMonsterView(
    row: MonsterRow,
    options: { selectedId?: string | null } = {},
  ): MonsterView {
    const dna = readStoredDna(row.dna);
    return {
      id: row.id,
      name: row.name,
      species: row.species,
      dna: encodeMonsterDna(dna),
      generation: row.generation,
      parentIds:
        row.parentAId && row.parentBId ? [row.parentAId, row.parentBId] : null,
      mutations: row.mutations,
      alive: row.alive,
      diedAt: row.diedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      inWorld: Boolean(
        this.runner.getState()?.entities.some((entity) => entity.id === row.id),
      ),
      selected: options.selectedId === row.id,
    };
  }

  async getMember(guestId: string) {
    const world = await this.requireWorld();
    return this.prisma.worldMember.upsert({
      where: { worldId_guestId: { worldId: world.id, guestId } },
      create: { worldId: world.id, guestId },
      update: { lastSeenAt: new Date() },
    });
  }

  async listMonsters(guestId: string) {
    const world = await this.requireWorld();
    const [rows, member] = await Promise.all([
      this.prisma.monster.findMany({
        where: { worldId: world.id, ownerId: guestId },
        orderBy: { createdAt: 'asc' },
      }),
      this.getMember(guestId),
    ]);
    return {
      monsters: rows.map((row) =>
        this.toMonsterView(row, { selectedId: member.selectedMonsterId }),
      ),
      selectedMonsterId: member.selectedMonsterId,
    };
  }

  async createMonster(guestId: string, rawName: unknown, rawDna: unknown) {
    const world = await this.requireWorld();
    const name = normalizeDisplayName(rawName, 'name');
    const { dna, encoded } = parseDna(rawDna);

    const livingOwned = await this.prisma.monster.count({
      where: { worldId: world.id, ownerId: guestId, alive: true },
    });
    if (livingOwned >= MAX_OWNED_MONSTERS) {
      throw new BadRequestException(
        `A guest may keep at most ${MAX_OWNED_MONSTERS} living monsters`,
      );
    }

    const monster = await this.prisma.monster.create({
      data: {
        name,
        species: dna.body,
        dna: { code: encoded, genes: dna },
        worldId: world.id,
        ownerId: guestId,
        energy: 100,
        alive: true,
      },
    });
    await this.prisma.worldMember.upsert({
      where: { worldId_guestId: { worldId: world.id, guestId } },
      create: {
        worldId: world.id,
        guestId,
        selectedMonsterId: monster.id,
      },
      update: { selectedMonsterId: monster.id },
    });
    return this.toMonsterView(monster, { selectedId: monster.id });
  }

  async updateMonster(
    guestId: string,
    monsterId: string,
    body: { name?: unknown; dna?: unknown },
  ) {
    const world = await this.requireWorld();
    const monster = await this.prisma.monster.findUnique({
      where: { id: monsterId },
    });
    if (!monster || monster.worldId !== world.id) {
      throw new NotFoundException('Monster not found');
    }
    if (monster.ownerId !== guestId) {
      throw new ForbiddenException('That monster belongs to another guest');
    }
    if (!monster.alive) {
      throw new BadRequestException('A dead monster cannot be edited');
    }

    const name =
      body.name === undefined
        ? monster.name
        : normalizeDisplayName(body.name, 'name');
    const dna =
      body.dna === undefined
        ? readStoredDna(monster.dna)
        : parseDna(body.dna).dna;
    const encoded = encodeMonsterDna(dna);

    const updated = await this.prisma.monster.update({
      where: { id: monster.id },
      data: {
        name,
        species: dna.body,
        dna: { code: encoded, genes: dna },
      },
    });

    // Keep a live entity in sync with its durable row.
    if (this.runner.getState()?.entities.some((e) => e.id === monster.id)) {
      this.runner.enqueue({
        type: 'updateDna',
        entityId: monster.id,
        dna,
        name,
      });
    }
    const member = await this.getMember(guestId);
    return this.toMonsterView(updated, {
      selectedId: member.selectedMonsterId,
    });
  }

  async selectMonster(guestId: string, monsterId: string) {
    const world = await this.requireWorld();
    const monster = await this.prisma.monster.findUnique({
      where: { id: monsterId },
    });
    if (!monster || monster.worldId !== world.id) {
      throw new NotFoundException('Monster not found');
    }
    if (monster.ownerId !== guestId) {
      throw new ForbiddenException('That monster belongs to another guest');
    }
    if (!monster.alive) {
      throw new BadRequestException('That monster is dead');
    }
    await this.prisma.worldMember.upsert({
      where: { worldId_guestId: { worldId: world.id, guestId } },
      create: { worldId: world.id, guestId, selectedMonsterId: monster.id },
      update: { selectedMonsterId: monster.id, lastSeenAt: new Date() },
    });
    return this.toMonsterView(monster, { selectedId: monster.id });
  }

  /** Resolves the monster a joining connection should control. */
  async resolveControllableMonster(
    guestId: string,
    requestedId?: string | null,
  ) {
    const world = await this.requireWorld();
    const member = await this.getMember(guestId);
    const wantedId = requestedId ?? member.selectedMonsterId;
    if (!wantedId) return null;
    const monster = await this.prisma.monster.findFirst({
      where: {
        id: wantedId,
        worldId: world.id,
        ownerId: guestId,
        alive: true,
      },
    });
    if (!monster) return null;
    if (member.selectedMonsterId !== monster.id) {
      await this.prisma.worldMember.update({
        where: { id: member.id },
        data: { selectedMonsterId: monster.id },
      });
    }
    return monster;
  }

  /** Spawn command for a monster that is not in the simulation yet. */
  buildSpawnCommand(monster: {
    id: string;
    name: string;
    dna: Prisma.JsonValue;
    ownerId: string | null;
    generation: number;
    parentAId: string | null;
    parentBId: string | null;
  }) {
    const dna = readStoredDna(monster.dna);
    const spawn = getMonsterSpawn(dna);
    return {
      type: 'spawn' as const,
      entity: {
        id: monster.id,
        name: monster.name,
        dna,
        ownerGuestId: monster.ownerId,
        generation: monster.generation,
        parentIds:
          monster.parentAId && monster.parentBId
            ? ([monster.parentAId, monster.parentBId] as [string, string])
            : null,
        x: spawn.x,
        y: spawn.y,
        z: spawn.z,
      },
    };
  }
}
