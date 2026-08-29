import {
  BadRequestException,
  ConflictException,
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
import {
  normalizeDisplayName,
  normalizeNicknameKey,
  parseDna,
  MAX_NAME_LENGTH,
} from '../common/validation';
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
  accountOwned: boolean;
  originType: string;
  clonedFromId: string | null;
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
  accountOwnerId: string | null;
  originType: string;
  clonedFromId: string | null;
};

function isUniqueConstraintError(error: unknown) {
  return Boolean(
    error &&
    typeof error === 'object' &&
    'code' in error &&
    error.code === 'P2002',
  );
}

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
    options: { selectedId?: string | null; accountId?: string | null } = {},
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
      accountOwned: Boolean(
        options.accountId && row.accountOwnerId === options.accountId,
      ),
      originType: row.originType,
      clonedFromId: row.clonedFromId,
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

  async listMonsters(guestId: string, accountId?: string | null) {
    const world = await this.requireWorld();
    const [rows, member] = await Promise.all([
      this.prisma.monster.findMany({
        where: {
          worldId: world.id,
          OR: [
            { ownerId: guestId },
            ...(accountId ? [{ accountOwnerId: accountId }] : []),
          ],
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.getMember(guestId),
    ]);
    return {
      monsters: rows.map((row) =>
        this.toMonsterView(row, {
          selectedId: member.selectedMonsterId,
          accountId,
        }),
      ),
      selectedMonsterId: member.selectedMonsterId,
    };
  }

  async createMonster(
    guestId: string,
    rawName: unknown,
    rawDna: unknown,
    accountId?: string | null,
  ) {
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

    let monster: MonsterRow;
    try {
      monster = await this.prisma.monster.create({
        data: {
          name,
          nicknameKey: normalizeNicknameKey(name),
          species: dna.body,
          dna: { code: encoded, genes: dna },
          worldId: world.id,
          ownerId: guestId,
          accountOwnerId: accountId,
          originType: 'player',
          energy: 100,
          alive: true,
        },
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new ConflictException('That monster nickname is already taken');
      }
      throw error;
    }
    await this.prisma.worldMember.upsert({
      where: { worldId_guestId: { worldId: world.id, guestId } },
      create: {
        worldId: world.id,
        guestId,
        selectedMonsterId: monster.id,
      },
      update: { selectedMonsterId: monster.id },
    });
    return this.toMonsterView(monster, {
      selectedId: monster.id,
      accountId,
    });
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

    let updated: MonsterRow;
    try {
      updated = await this.prisma.monster.update({
        where: { id: monster.id },
        data: {
          name,
          nicknameKey: normalizeNicknameKey(name),
          species: dna.body,
          dna: { code: encoded, genes: dna },
        },
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new ConflictException('That monster nickname is already taken');
      }
      throw error;
    }

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

  async selectMonster(
    guestId: string,
    monsterId: string,
    accountId?: string | null,
  ) {
    const world = await this.requireWorld();
    const monster = await this.prisma.monster.findUnique({
      where: { id: monsterId },
    });
    if (!monster || monster.worldId !== world.id) {
      throw new NotFoundException('Monster not found');
    }
    const mayUse =
      monster.ownerId === guestId ||
      Boolean(accountId && monster.accountOwnerId === accountId);
    if (!mayUse) {
      throw new ForbiddenException('That monster belongs to another guest');
    }
    if (!monster.alive) {
      throw new BadRequestException('That monster is dead');
    }
    const rebound =
      monster.ownerId === guestId
        ? monster
        : await this.prisma.monster.update({
            where: { id: monster.id },
            data: { ownerId: guestId },
          });
    await this.prisma.worldMember.upsert({
      where: { worldId_guestId: { worldId: world.id, guestId } },
      create: { worldId: world.id, guestId, selectedMonsterId: monster.id },
      update: { selectedMonsterId: monster.id, lastSeenAt: new Date() },
    });
    return this.toMonsterView(rebound, {
      selectedId: monster.id,
      accountId,
    });
  }

  async copyMonster(
    guestId: string,
    monsterId: string,
    accountId?: string | null,
  ) {
    const source = await this.prisma.monster.findUnique({
      where: { id: monsterId },
    });
    if (
      !source ||
      (source.ownerId !== guestId && source.accountOwnerId !== accountId)
    ) {
      throw new NotFoundException('Monster not found');
    }
    const dna = readStoredDna(source.dna);
    for (let copy = 2; copy < 1000; copy += 1) {
      const suffix = ` ${copy}`;
      const name = `${source.name.slice(0, MAX_NAME_LENGTH - suffix.length)}${suffix}`;
      try {
        return await this.createCopiedMonster(
          guestId,
          accountId,
          source,
          name,
          dna,
        );
      } catch (error) {
        if (!isUniqueConstraintError(error)) throw error;
      }
    }
    throw new ConflictException('Could not allocate a unique nickname');
  }

  private async createCopiedMonster(
    guestId: string,
    accountId: string | null | undefined,
    source: MonsterRow,
    name: string,
    dna: MonsterDna,
  ) {
    const world = await this.requireWorld();
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
        nicknameKey: normalizeNicknameKey(name),
        species: dna.body,
        dna: source.dna as Prisma.InputJsonValue,
        worldId: world.id,
        ownerId: guestId,
        accountOwnerId: accountId,
        originType: 'copy',
        clonedFromId: source.id,
        energy: 100,
      },
    });
    await this.prisma.worldMember.upsert({
      where: { worldId_guestId: { worldId: world.id, guestId } },
      create: { worldId: world.id, guestId, selectedMonsterId: monster.id },
      update: { selectedMonsterId: monster.id },
    });
    return this.toMonsterView(monster, {
      selectedId: monster.id,
      accountId,
    });
  }

  async getPublicMonster(monsterId: string) {
    const monster = await this.prisma.monster.findUnique({
      where: { id: monsterId },
    });
    if (!monster) throw new NotFoundException('Monster not found');
    const relatedIds = [
      monster.parentAId,
      monster.parentBId,
      monster.clonedFromId,
    ].filter((id): id is string => Boolean(id));
    const [related, children] = await Promise.all([
      this.prisma.monster.findMany({ where: { id: { in: relatedIds } } }),
      this.prisma.monster.findMany({
        where: {
          OR: [
            { parentAId: monster.id },
            { parentBId: monster.id },
            { clonedFromId: monster.id },
          ],
        },
        orderBy: { createdAt: 'desc' },
        take: 24,
      }),
    ]);
    const compact = (row: MonsterRow) => ({
      id: row.id,
      name: row.name,
      species: row.species,
      generation: row.generation,
      alive: row.alive,
      originType: row.originType,
    });
    const byId = new Map(related.map((row) => [row.id, compact(row)]));
    return {
      monster: this.toMonsterView(monster),
      parents: [monster.parentAId, monster.parentBId]
        .map((id) => (id ? byId.get(id) : null))
        .filter(Boolean),
      clonedFrom: monster.clonedFromId
        ? (byId.get(monster.clonedFromId) ?? null)
        : null,
      children: children.map(compact),
    };
  }

  async listPublicMonsters(originType?: string, search?: string) {
    const world = await this.requireWorld();
    const where = {
      worldId: world.id,
      ...(originType && originType !== 'all' ? { originType } : {}),
      ...(search?.trim()
        ? { name: { contains: search.trim(), mode: 'insensitive' as const } }
        : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.monster.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: 60,
      }),
      this.prisma.monster.count({ where }),
    ]);
    return { monsters: rows.map((row) => this.toMonsterView(row)), total };
  }

  async adminListMonsters(originType?: string, search?: string) {
    const world = await this.requireWorld();
    const rows = await this.prisma.monster.findMany({
      where: {
        worldId: world.id,
        ...(originType && originType !== 'all' ? { originType } : {}),
        ...(search?.trim()
          ? { name: { contains: search.trim(), mode: 'insensitive' } }
          : {}),
      },
      include: {
        accountOwner: {
          select: { id: true, name: true, email: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return {
      monsters: rows.map((row) => ({
        ...this.toMonsterView(row),
        owner: row.accountOwner,
        localPlayerCreated: Boolean(row.ownerId),
      })),
    };
  }

  async adminCreateMonster(rawName: unknown, rawDna: unknown, spawn = true) {
    const world = await this.requireWorld();
    const name = normalizeDisplayName(rawName, 'name');
    const { dna, encoded } = parseDna(rawDna);
    // Validate world ownership before persisting so a requested spawn cannot
    // leave behind a durable monster when this API cannot actually spawn it.
    if (spawn && !this.runner.isRunning) {
      throw new ServiceUnavailableException(
        'This API instance does not currently own the world',
      );
    }
    const monster = await this.prisma.monster.create({
      data: {
        name,
        species: dna.body,
        dna: { code: encoded, genes: dna },
        worldId: world.id,
        originType: 'admin',
        energy: 100,
        alive: true,
      },
    });
    if (spawn) this.spawnDurableMonster(monster);
    return this.toMonsterView(monster);
  }

  async adminUpdateMonster(
    monsterId: string,
    body: { name?: unknown; dna?: unknown },
  ) {
    const monster = await this.prisma.monster.findUnique({
      where: { id: monsterId },
    });
    if (!monster) throw new NotFoundException('Monster not found');
    const name =
      body.name === undefined
        ? monster.name
        : normalizeDisplayName(body.name, 'name');
    const dna =
      body.dna === undefined
        ? readStoredDna(monster.dna)
        : parseDna(body.dna).dna;
    let updated: MonsterRow;
    try {
      updated = await this.prisma.monster.update({
        where: { id: monster.id },
        data: {
          name,
          ...(monster.nicknameKey
            ? { nicknameKey: normalizeNicknameKey(name) }
            : {}),
          species: dna.body,
          dna: { code: encodeMonsterDna(dna), genes: dna },
        },
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new ConflictException('That monster nickname is already taken');
      }
      throw error;
    }
    if (this.runner.getState()?.entities.some((e) => e.id === monster.id)) {
      this.runner.enqueue({
        type: 'updateDna',
        entityId: monster.id,
        dna,
        name,
      });
    }
    return this.toMonsterView(updated);
  }

  async adminSpawnMonster(monsterId: string) {
    const monster = await this.prisma.monster.findUnique({
      where: { id: monsterId },
    });
    if (!monster) throw new NotFoundException('Monster not found');
    const revived = monster.alive
      ? monster
      : await this.prisma.monster.update({
          where: { id: monster.id },
          data: { alive: true, diedAt: null, energy: 100 },
        });
    this.spawnDurableMonster(revived);
    return this.toMonsterView(revived);
  }

  private spawnDurableMonster(monster: MonsterRow) {
    if (!this.runner.isRunning) {
      throw new ServiceUnavailableException(
        'This API instance does not currently own the world',
      );
    }
    if (!this.runner.getState()?.entities.some((e) => e.id === monster.id)) {
      this.runner.enqueue(this.buildSpawnCommand(monster));
    }
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
