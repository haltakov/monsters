import { Injectable, Logger } from '@nestjs/common';
import {
  createWorldState,
  encodeMonsterDna,
  deserializeWorldState,
  serializeWorldState,
  WORLD_STATE_VERSION,
  type SimEntity,
  type SimEvent,
  type WorldSimState,
} from '@monsters/game-core';
import type { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { nextUtcMidnight } from './daily-reset';
import {
  getSeedPopulation,
  PUBLIC_WORLD_NAME,
  PUBLIC_WORLD_SEED,
  PUBLIC_WORLD_SLUG,
} from '../config/app-config';

export type WorldRecord = {
  id: string;
  slug: string;
  name: string;
  seed: number;
  isPublic: boolean;
  status: string;
  currentTick: number;
  simulatedAt: Date;
  nextResetAt: Date | null;
  createdAt: Date;
};

export type ResetWorldOptions = {
  seed: number;
  initialPopulation: number;
  terrestrialOnly: boolean;
  /** Daily resets archive the outgoing population, never erase player history. */
  preserveHistory?: boolean;
  previousState?: WorldSimState;
  now?: Date;
};

/** Keep the event log useful without letting it grow forever. */
const EVENT_RETENTION_DAYS = 7;

export function monsterRowData(entity: SimEntity, worldId: string) {
  return {
    name: entity.name,
    species: entity.dna.body,
    dna: {
      code: encodeMonsterDna(entity.dna),
      genes: entity.dna,
    } as unknown as Prisma.InputJsonValue,
    position: {
      x: entity.x,
      y: entity.y,
      z: entity.z,
      yaw: entity.yaw,
    } as unknown as Prisma.InputJsonValue,
    energy: Math.round(entity.energy),
    ageSeconds: entity.age,
    worldId,
    ownerId: entity.ownerGuestId,
    originType: entity.parentIds
      ? 'mating'
      : entity.ownerGuestId
        ? 'player'
        : 'wild',
    generation: entity.generation,
    parentAId: entity.parentIds?.[0] ?? null,
    parentBId: entity.parentIds?.[1] ?? null,
    mutations: entity.mutations,
    alive: entity.alive,
  };
}

@Injectable()
export class WorldPersistenceService {
  private readonly logger = new Logger(WorldPersistenceService.name);
  /** Serializes durable writes so two checkpoints can never interleave. */
  private writeChain: Promise<unknown> = Promise.resolve();

  constructor(private readonly prisma: PrismaService) {}

  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const next = this.writeChain.then(task, task);
    this.writeChain = next.catch(() => undefined);
    return next;
  }

  /**
   * Creates the permanent public world if it does not exist yet. Safe to call
   * from every booting process: the unique slug makes it idempotent.
   */
  async ensurePublicWorld(): Promise<WorldRecord> {
    const existing = await this.prisma.world.findUnique({
      where: { slug: PUBLIC_WORLD_SLUG },
    });
    if (existing) {
      if (existing.nextResetAt) return existing;
      // First rollout starts at the next midnight, not an immediate reset.
      await this.prisma.world.updateMany({
        where: { id: existing.id, nextResetAt: null },
        data: { nextResetAt: nextUtcMidnight() },
      });
      return await this.prisma.world.findUniqueOrThrow({
        where: { id: existing.id },
      });
    }
    try {
      return await this.prisma.world.create({
        data: {
          slug: PUBLIC_WORLD_SLUG,
          name: PUBLIC_WORLD_NAME,
          seed: PUBLIC_WORLD_SEED,
          isPublic: true,
          status: 'active',
          settings: {},
          nextResetAt: nextUtcMidnight(),
        },
      });
    } catch {
      // Another booting process won the race; its row is the canonical one.
      const world = await this.prisma.world.findUnique({
        where: { slug: PUBLIC_WORLD_SLUG },
      });
      if (!world) throw new Error('Failed to seed the public world');
      return world;
    }
  }

  async findWorldBySlug(slug: string) {
    return this.prisma.world.findUnique({ where: { slug } });
  }

  /**
   * Loads the latest recovery snapshot. Returns `null` when the world has
   * never been simulated, so the caller can seed the initial population.
   */
  async loadCheckpoint(worldId: string) {
    const snapshot = await this.prisma.worldSnapshot.findUnique({
      where: { worldId },
    });
    if (!snapshot) return null;
    const state = deserializeWorldState(snapshot.state);
    return { state, simulatedAt: snapshot.simulatedAt, tick: snapshot.tick };
  }

  /** First-run seeding: deterministic wild population plus durable rows. */
  async createInitialCheckpoint(world: WorldRecord, idPrefix: string) {
    const state = createWorldState({
      seed: world.seed,
      idPrefix,
      initialPopulation: getSeedPopulation(),
      terrestrialOnly: true,
    });
    const now = new Date();
    await this.prisma.$transaction([
      ...state.entities.map((entity) =>
        this.prisma.monster.upsert({
          where: { id: entity.id },
          create: { id: entity.id, ...monsterRowData(entity, world.id) },
          update: monsterRowData(entity, world.id),
        }),
      ),
      this.prisma.worldSnapshot.upsert({
        where: { worldId: world.id },
        create: {
          worldId: world.id,
          version: WORLD_STATE_VERSION,
          tick: state.tick,
          simulatedAt: now,
          state: serializeWorldState(state) as Prisma.InputJsonValue,
        },
        update: {
          version: WORLD_STATE_VERSION,
          tick: state.tick,
          simulatedAt: now,
          state: serializeWorldState(state) as Prisma.InputJsonValue,
        },
      }),
      this.prisma.world.update({
        where: { id: world.id },
        data: { currentTick: state.tick, simulatedAt: now },
      }),
      this.prisma.worldEvent.create({
        data: {
          worldId: world.id,
          tick: 0,
          type: 'worldSeeded',
          payload: {
            entities: state.entities.length,
            seed: world.seed,
          },
        },
      }),
    ]);
    return { state, simulatedAt: now };
  }

  /**
   * Replaces one world's simulation atomically. Daily resets archive monsters
   * and preserve lineage/history; explicit admin resets may erase that history.
   * Accounts, guest devices and memberships are always preserved.
   */
  resetWorld(world: WorldRecord, options: ResetWorldOptions) {
    const now = options.now ?? new Date();
    const state = createWorldState({
      seed: options.seed,
      idPrefix: `${world.slug}:reset-${options.seed}:`,
      initialPopulation: options.initialPopulation,
      terrestrialOnly: options.terrestrialOnly,
    });
    const serialized = serializeWorldState(state) as Prisma.InputJsonValue;
    const ages =
      options.previousState?.entities.map((entity) => ({
        id: entity.id,
        ageSeconds: entity.age,
      })) ?? [];

    return this.enqueue(async () => {
      const updatedWorld = await this.prisma.$transaction(async (tx) => {
        await tx.worldMember.updateMany({
          where: { worldId: world.id },
          data: { selectedMonsterId: null },
        });
        if (!options.preserveHistory) {
          await tx.worldEvent.deleteMany({ where: { worldId: world.id } });
        }
        await tx.worldSnapshot.deleteMany({ where: { worldId: world.id } });
        if (options.preserveHistory) {
          await tx.monster.updateMany({
            where: { worldId: world.id, alive: true },
            data: { alive: false, diedAt: now },
          });
          for (const entity of ages) {
            await tx.monster.updateMany({
              where: { id: entity.id, worldId: world.id },
              data: { ageSeconds: entity.ageSeconds },
            });
          }
        } else {
          await tx.monster.deleteMany({ where: { worldId: world.id } });
        }
        await tx.monster.createMany({
          data: state.entities.map((entity) => ({
            id: entity.id,
            ...monsterRowData(entity, world.id),
          })),
        });
        await tx.worldSnapshot.create({
          data: {
            worldId: world.id,
            version: WORLD_STATE_VERSION,
            tick: 0,
            simulatedAt: now,
            state: serialized,
          },
        });
        const nextWorld = await tx.world.update({
          where: { id: world.id },
          data: {
            seed: options.seed,
            status: 'active',
            currentTick: 0,
            simulatedAt: now,
            nextResetAt: nextUtcMidnight(now),
          },
        });
        await tx.worldEvent.create({
          data: {
            worldId: world.id,
            tick: 0,
            type: 'worldReset',
            payload: {
              entities: state.entities.length,
              seed: options.seed,
              terrestrialOnly: options.terrestrialOnly,
              reason: options.preserveHistory ? 'daily' : 'manual',
            },
          },
        });
        return nextWorld;
      });

      return { world: updatedWorld, state, simulatedAt: now };
    });
  }

  /**
   * Routine checkpoint. Runtime coordinates live in the serialized state;
   * owned monsters additionally get their durable row refreshed so the REST
   * surface shows sensible values.
   */
  checkpoint(world: WorldRecord, state: WorldSimState, simulatedAt: Date) {
    // The live simulation keeps mutating while an earlier database write is
    // in flight. Capture everything at the enqueue boundary so the snapshot,
    // tick and wall-clock timestamp always describe the same instant.
    const serialized = serializeWorldState(state) as Prisma.InputJsonValue;
    const tick = state.tick;
    const owned = state.entities
      .filter((entity) => entity.ownerGuestId)
      .map((entity) => ({
        id: entity.id,
        energy: Math.round(entity.energy),
        ageSeconds: entity.age,
        alive: entity.alive,
        position: {
          x: entity.x,
          y: entity.y,
          z: entity.z,
          yaw: entity.yaw,
        },
      }));

    return this.enqueue(async () => {
      await this.prisma.$transaction([
        this.prisma.worldSnapshot.upsert({
          where: { worldId: world.id },
          create: {
            worldId: world.id,
            version: WORLD_STATE_VERSION,
            tick,
            simulatedAt,
            state: serialized,
          },
          update: {
            version: WORLD_STATE_VERSION,
            tick,
            simulatedAt,
            state: serialized,
          },
        }),
        this.prisma.world.update({
          where: { id: world.id },
          data: { currentTick: tick, simulatedAt },
        }),
        ...owned.map((entity) =>
          this.prisma.monster.updateMany({
            where: { id: entity.id },
            data: {
              energy: entity.energy,
              ageSeconds: entity.ageSeconds,
              alive: entity.alive,
              position: entity.position,
            },
          }),
        ),
      ]);
    });
  }

  /**
   * A critical transition must not be able to disappear after a crash, so the
   * relational fact, the event row and the recovery snapshot are written in
   * one transaction.
   */
  commitCriticalEvents(
    world: WorldRecord,
    state: WorldSimState,
    events: SimEvent[],
    simulatedAt: Date,
  ) {
    // As with routine checkpoints, materialize all mutable simulation data
    // before joining the asynchronous write queue.
    const serialized = serializeWorldState(state) as Prisma.InputJsonValue;
    const tick = state.tick;
    const bornEntities = new Map(
      events
        .filter((event) => event.type === 'birth')
        .map((event) => {
          const entity = state.entities.find(
            (candidate) => candidate.id === event.entityId,
          );
          return entity
            ? [event.entityId, monsterRowData(entity, world.id)]
            : [event.entityId, null];
        }),
    );

    return this.enqueue(async () => {
      const parentIds = [
        ...new Set(
          [...bornEntities.values()]
            .flatMap((row) => (row ? [row.parentAId, row.parentBId] : []))
            .filter((id): id is string => Boolean(id)),
        ),
      ];
      const parentOwners = new Map(
        (
          await this.prisma.monster.findMany({
            where: { id: { in: parentIds } },
            select: { id: true, accountOwnerId: true },
          })
        ).map((parent) => [parent.id, parent.accountOwnerId]),
      );
      const operations: Prisma.PrismaPromise<unknown>[] = [];
      for (const event of events) {
        if (event.type === 'birth') {
          const row = bornEntities.get(event.entityId);
          if (row) {
            // Offspring enters the signed-in history of the first account-owned
            // parent (the initiating parent wins when both are players).
            const accountOwnerId =
              (row.parentAId ? parentOwners.get(row.parentAId) : null) ??
              (row.parentBId ? parentOwners.get(row.parentBId) : null) ??
              null;
            operations.push(
              this.prisma.monster.upsert({
                where: { id: event.entityId },
                create: { id: event.entityId, ...row, accountOwnerId },
                update: row,
              }),
            );
          }
        }
        if (event.type === 'death') {
          operations.push(
            this.prisma.monster.updateMany({
              where: { id: event.entityId },
              data: {
                alive: false,
                diedAt: simulatedAt,
                energy: 0,
                ageSeconds: event.ageSeconds,
              },
            }),
          );
        }
        operations.push(
          this.prisma.worldEvent.create({
            data: {
              worldId: world.id,
              tick: event.tick,
              type: event.type,
              payload: event,
            },
          }),
        );
      }

      operations.push(
        this.prisma.worldSnapshot.upsert({
          where: { worldId: world.id },
          create: {
            worldId: world.id,
            version: WORLD_STATE_VERSION,
            tick,
            simulatedAt,
            state: serialized,
          },
          update: {
            version: WORLD_STATE_VERSION,
            tick,
            simulatedAt,
            state: serialized,
          },
        }),
        this.prisma.world.update({
          where: { id: world.id },
          data: { currentTick: tick, simulatedAt },
        }),
      );
      await this.prisma.$transaction(operations);
    });
  }

  async pruneEvents(worldId: string) {
    const cutoff = new Date(
      Date.now() - EVENT_RETENTION_DAYS * 24 * 60 * 60 * 1000,
    );
    const removed = await this.prisma.worldEvent.deleteMany({
      where: { worldId, createdAt: { lt: cutoff } },
    });
    if (removed.count > 0) {
      this.logger.log(`Pruned ${removed.count} historic world events`);
    }
  }

  /** Waits for every queued durable write to settle. */
  async drain() {
    await this.writeChain.catch(() => undefined);
  }
}
