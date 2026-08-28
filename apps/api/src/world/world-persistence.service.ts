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
  createdAt: Date;
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
    worldId,
    ownerId: entity.ownerGuestId,
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
    if (existing) return existing;
    try {
      return await this.prisma.world.create({
        data: {
          slug: PUBLIC_WORLD_SLUG,
          name: PUBLIC_WORLD_NAME,
          seed: PUBLIC_WORLD_SEED,
          isPublic: true,
          status: 'active',
          settings: {},
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
      const operations: Prisma.PrismaPromise<unknown>[] = [];
      for (const event of events) {
        if (event.type === 'birth') {
          const row = bornEntities.get(event.entityId);
          if (row) {
            operations.push(
              this.prisma.monster.upsert({
                where: { id: event.entityId },
                create: { id: event.entityId, ...row },
                update: row,
              }),
            );
          }
        }
        if (event.type === 'death') {
          operations.push(
            this.prisma.monster.updateMany({
              where: { id: event.entityId },
              data: { alive: false, diedAt: simulatedAt, energy: 0 },
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
