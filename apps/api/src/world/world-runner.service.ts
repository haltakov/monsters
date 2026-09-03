import {
  Injectable,
  Logger,
  OnApplicationShutdown,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { randomInt } from 'node:crypto';
import {
  accumulate,
  catchUpWorld,
  cloneWorldState,
  createAccumulator,
  isCriticalEvent,
  killWorldMonster,
  MAX_TICKS_PER_UPDATE,
  readPopulation,
  stepWorld,
  TICK_SECONDS,
  INITIAL_WILD_MONSTERS,
  type FixedStepAccumulator,
  type SimCommand,
  type SimEvent,
  type WorldSimState,
} from '@monsters/game-core';
import {
  CHECKPOINT_INTERVAL_MS,
  isWorldRunnerDisabled,
  LOCK_RETRY_MAX_MS,
  LOCK_RETRY_MIN_MS,
  PUBLIC_WORLD_SLUG,
} from '../config/app-config';
import { WorldLockService } from './world-lock.service';
import {
  WorldPersistenceService,
  type WorldRecord,
} from './world-persistence.service';

export type RunnerMode =
  'disabled' | 'starting' | 'standby' | 'running' | 'stopped';

export type RunnerStatus = {
  mode: RunnerMode;
  ownsWorld: boolean;
  worldId: string | null;
  worldSlug: string;
  tick: number;
  simulatedSeconds: number;
  lastTickAt: string | null;
  lastCheckpointAt: string | null;
  nextResetAt: string | null;
  connections: number;
  entities: number;
  livingEntities: number;
  eggs: number;
  droppedTicks: number;
  lastTickDurationMs: number;
};

export type WorldPublish = (payload: {
  state: WorldSimState;
  events: SimEvent[];
  tick: number;
}) => void;

const TICK_INTERVAL_MS = Math.round(TICK_SECONDS * 1000);

/**
 * Owns the authoritative public world.
 *
 * Exactly one process may tick a world at a time; ownership is a PostgreSQL
 * advisory lock. A process that cannot take the lock stays healthy (so a
 * rolling deploy can be diagnosed) but never ticks or writes.
 */
@Injectable()
export class WorldRunnerService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(WorldRunnerService.name);
  private world: WorldRecord | null = null;
  private state: WorldSimState | null = null;
  private timer: NodeJS.Timeout | null = null;
  private lockRetryTimer: NodeJS.Timeout | null = null;
  private lockRetryDelay = LOCK_RETRY_MIN_MS;
  private accumulator: FixedStepAccumulator = createAccumulator(TICK_SECONDS);
  private commands: SimCommand[] = [];
  private lastRealTime = process.hrtime.bigint();
  private lastTickAt: Date | null = null;
  private lastCheckpointAt: Date | null = null;
  private lastTickDurationMs = 0;
  private publishers = new Set<WorldPublish>();
  private connectionCount = 0;
  private mode: RunnerMode = 'starting';
  private stopping = false;
  private resetRetryAt = 0;
  private dailyReset: Promise<unknown> | null = null;
  private adminMutation: Promise<void> | null = null;

  constructor(
    private readonly persistence: WorldPersistenceService,
    private readonly lock: WorldLockService,
  ) {}

  async onModuleInit() {
    if (isWorldRunnerDisabled()) {
      this.mode = 'disabled';
      this.logger.warn('World runner disabled via WORLD_RUNNER_ENABLED=false');
      return;
    }
    this.world = await this.persistence.ensurePublicWorld();
    this.lock.onLost(() => this.handleLockLost());
    await this.tryStart();
  }

  async onApplicationShutdown() {
    await this.shutdown();
  }

  onPublish(publisher: WorldPublish) {
    this.publishers.add(publisher);
    return () => this.publishers.delete(publisher);
  }

  setConnectionCount(count: number) {
    this.connectionCount = count;
  }

  get isRunning() {
    return this.mode === 'running';
  }

  getState() {
    return this.state;
  }

  getWorld() {
    return this.world;
  }

  getStatus(): RunnerStatus {
    const population = this.state
      ? readPopulation(this.state)
      : { living: 0, eggs: 0, births: 0, deaths: 0 };
    return {
      mode: this.mode,
      ownsWorld: this.lock.isOwned && this.mode === 'running',
      worldId: this.world?.id ?? null,
      worldSlug: this.world?.slug ?? PUBLIC_WORLD_SLUG,
      tick: this.state?.tick ?? 0,
      simulatedSeconds: this.state ? Math.round(this.state.time) : 0,
      lastTickAt: this.lastTickAt?.toISOString() ?? null,
      lastCheckpointAt: this.lastCheckpointAt?.toISOString() ?? null,
      nextResetAt: this.world?.nextResetAt?.toISOString() ?? null,
      connections: this.connectionCount,
      entities: this.state?.entities.length ?? 0,
      livingEntities: population.living,
      eggs: population.eggs,
      droppedTicks: this.accumulator.dropped,
      lastTickDurationMs: Math.round(this.lastTickDurationMs * 100) / 100,
    };
  }

  /** Queues a validated command for the next tick, preserving arrival order. */
  enqueue(command: SimCommand) {
    if (this.mode !== 'running') return false;
    this.commands.push(command);
    return true;
  }

  /** Commit the death and recovery snapshot before exposing it to connected clients. */
  killMonster(
    monster: {
      id: string;
      name: string;
      alive: boolean;
      ageSeconds: number;
      ownerId: string | null;
    },
    adminUserId: string,
  ): Promise<void> {
    if (
      !this.isRunning ||
      !this.lock.isOwned ||
      !this.state ||
      !this.world ||
      this.stopping
    ) {
      throw new ServiceUnavailableException(
        'This API instance does not currently own the world',
      );
    }
    const operation = this.commitAdminDeath(monster, adminUserId);
    this.adminMutation = operation;
    return operation.finally(() => {
      if (this.adminMutation === operation) this.adminMutation = null;
    });
  }

  private async commitAdminDeath(
    monster: {
      id: string;
      name: string;
      alive: boolean;
      ageSeconds: number;
      ownerId: string | null;
    },
    adminUserId: string,
  ) {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.mode = 'starting';
    try {
      await this.persistence.drain();
      if (!this.lock.isOwned || !this.state || !this.world || this.stopping) {
        throw new ServiceUnavailableException(
          'World ownership lost before the keeper action',
        );
      }
      const next = cloneWorldState(this.state);
      const entity = next.entities.find(
        (candidate) => candidate.id === monster.id,
      );
      next.tick += 1;
      const events = killWorldMonster(next, monster.id, adminUserId);
      // Also support saved monsters not yet spawned, without spawning them just to kill them.
      if (!entity && monster.alive) {
        events.push({
          type: 'death',
          tick: next.tick,
          entityId: monster.id,
          name: monster.name,
          cause: 'admin',
          adminUserId,
          killerId: null,
          ownerGuestId: monster.ownerId,
          ageSeconds: monster.ageSeconds,
        });
      }
      if (events.length) {
        const at = new Date();
        await this.persistence.commitCriticalEvents(
          this.world,
          next,
          events,
          at,
        );
        if (!this.lock.isOwned || !this.state) {
          throw new ServiceUnavailableException(
            'World ownership changed during the keeper action',
          );
        }
        this.state = next;
        this.lastCheckpointAt = at;
        this.lastTickAt = at;
        // A previously queued spawn must not bring this monster back next tick.
        this.commands = this.commands.filter((command) =>
          command.type === 'spawn'
            ? command.entity.id !== monster.id
            : 'entityId' in command
              ? command.entityId !== monster.id
              : true,
        );
        this.publish(events, next);
      }
    } finally {
      if (this.lock.isOwned && this.state && !this.stopping) this.start();
    }
  }

  /** Atomically replaces the live world and publishes its fresh state. */
  async resetWorld(options: {
    initialPopulation: number;
    terrestrialOnly: boolean;
    preserveHistory?: boolean;
  }) {
    if (
      this.mode !== 'running' ||
      !this.lock.isOwned ||
      !this.world ||
      !this.state
    ) {
      throw new Error('This API instance does not own the running world');
    }

    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.mode = 'starting';
    this.commands = [];

    try {
      await this.persistence.drain();
      if (!this.lock.isOwned || this.stopping || !this.state) {
        throw new Error('World ownership lost before reset');
      }
      const reset = await this.persistence.resetWorld(this.world, {
        seed: randomInt(1, 0x7fffffff),
        initialPopulation: options.initialPopulation,
        terrestrialOnly: options.terrestrialOnly,
        preserveHistory: options.preserveHistory,
        previousState: this.state,
      });
      this.world = reset.world;
      this.state = reset.state;
      this.lastCheckpointAt = reset.simulatedAt;
      this.lastTickAt = reset.simulatedAt;
      this.lastTickDurationMs = 0;
      if (!this.lock.isOwned || this.stopping)
        return {
          seed: this.world.seed,
          population: this.state.entities.length,
          terrestrialOnly: options.terrestrialOnly,
        };
      this.start();
      this.publish(
        [
          {
            type: 'worldReset',
            tick: 0,
            reason: options.preserveHistory ? 'daily' : 'manual',
          },
        ],
        this.state,
      );
      this.logger.warn(
        `Reset world "${this.world.slug}" with ${this.state.entities.length} terrestrial monsters`,
      );
      return {
        seed: this.world.seed,
        population: this.state.entities.length,
        terrestrialOnly: options.terrestrialOnly,
      };
    } catch (error) {
      // Reload whichever complete transaction is durable, then resume service.
      if (this.lock.isOwned && !this.stopping) {
        await this.load(false);
        this.start();
      }
      throw error;
    }
  }

  private scheduleLockRetry() {
    if (this.stopping || this.lockRetryTimer) return;
    this.mode = 'standby';
    const delay = this.lockRetryDelay;
    this.lockRetryDelay = Math.min(LOCK_RETRY_MAX_MS, this.lockRetryDelay * 2);
    this.lockRetryTimer = setTimeout(() => {
      this.lockRetryTimer = null;
      void this.tryStart();
    }, delay);
    this.lockRetryTimer.unref?.();
  }

  private async tryStart() {
    if (this.stopping || !this.world) return;
    let acquired = false;
    try {
      acquired = await this.lock.acquire(this.world.slug);
    } catch (error) {
      this.logger.error(
        `Could not reach PostgreSQL for the world lock: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      this.scheduleLockRetry();
      return;
    }
    if (!acquired) {
      this.logger.log(
        `World "${this.world.slug}" is owned by another process; standing by.`,
      );
      this.scheduleLockRetry();
      return;
    }

    this.lockRetryDelay = LOCK_RETRY_MIN_MS;
    try {
      await this.load();
      this.start();
    } catch (error) {
      this.logger.error(
        `Failed to start the world runner: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      await this.lock.release(this.world.slug);
      this.scheduleLockRetry();
    }
  }

  private async load(checkDailyReset = true) {
    // Another process may have reset the world while this one was on standby.
    this.world = await this.persistence.findWorldBySlug(this.world!.slug);
    const world = this.world!;
    const checkpoint = await this.persistence.loadCheckpoint(world.id);
    if (!this.lock.isOwned || this.stopping)
      throw new Error('World ownership lost during load');
    if (
      checkDailyReset &&
      world.nextResetAt &&
      world.nextResetAt.getTime() <= Date.now()
    ) {
      const reset = await this.persistence.resetWorld(world, {
        seed: randomInt(1, 0x7fffffff),
        initialPopulation: INITIAL_WILD_MONSTERS,
        terrestrialOnly: true,
        preserveHistory: true,
        previousState: checkpoint?.state,
      });
      this.world = reset.world;
      this.state = reset.state;
      this.lastCheckpointAt = reset.simulatedAt;
      return;
    }
    if (!checkpoint) {
      const created = await this.persistence.createInitialCheckpoint(
        world,
        `${world.slug}:`,
      );
      this.state = created.state;
      this.lastCheckpointAt = created.simulatedAt;
      this.logger.log(
        `Seeded world "${world.slug}" with ${created.state.entities.length} wild monsters`,
      );
      return;
    }

    this.state = checkpoint.state;
    this.lastCheckpointAt = checkpoint.simulatedAt;
    const downtimeSeconds =
      (Date.now() - checkpoint.simulatedAt.getTime()) / 1000;
    if (downtimeSeconds > 1) {
      const result = catchUpWorld(this.state, downtimeSeconds);
      this.logger.log(
        `Advanced world "${world.slug}" through ${Math.round(
          downtimeSeconds,
        )}s of downtime using ${result.steps} ${result.mode} steps` +
          (result.truncated ? ' (truncated to the catch-up budget)' : ''),
      );
      if (result.events.length > 0) {
        await this.persistence.commitCriticalEvents(
          world,
          this.state,
          result.events,
          new Date(),
        );
      }
    }
    await this.persistence.checkpoint(world, this.state, new Date());
    this.lastCheckpointAt = new Date();
  }

  private start() {
    if (this.stopping || !this.lock.isOwned) return;
    this.mode = 'running';
    this.accumulator = createAccumulator(TICK_SECONDS);
    this.lastRealTime = process.hrtime.bigint();
    this.timer = setInterval(() => this.onTimer(), TICK_INTERVAL_MS);
    this.timer.unref?.();
    this.logger.log(
      `World runner owns "${this.world?.slug}" at tick ${this.state?.tick ?? 0}`,
    );
  }

  private handleLockLost() {
    if (this.stopping || this.mode === 'stopped' || this.mode === 'disabled')
      return;
    this.logger.error('World ownership lost; pausing the simulation');
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.state = null;
    this.commands = [];
    this.mode = 'standby';
    this.scheduleLockRetry();
  }

  private onTimer() {
    if (this.mode !== 'running' || !this.state || !this.world) return;
    if (
      this.world.nextResetAt &&
      Date.now() >= this.world.nextResetAt.getTime() &&
      Date.now() >= this.resetRetryAt
    ) {
      this.dailyReset = this.resetWorld({
        initialPopulation: INITIAL_WILD_MONSTERS,
        terrestrialOnly: true,
        preserveHistory: true,
      })
        .catch((error: unknown) => {
          this.resetRetryAt = Date.now() + 30_000;
          this.logger.error(
            `Daily reset failed; retrying in 30s: ${error instanceof Error ? error.message : String(error)}`,
          );
        })
        .finally(() => {
          this.dailyReset = null;
        });
      return;
    }
    const startedAt = process.hrtime.bigint();
    const elapsedSeconds = Number(startedAt - this.lastRealTime) / 1e9;
    this.lastRealTime = startedAt;

    const ticks = accumulate(
      this.accumulator,
      elapsedSeconds,
      MAX_TICKS_PER_UPDATE,
    );
    if (ticks === 0) return;

    const events: SimEvent[] = [];
    for (let index = 0; index < ticks; index += 1) {
      const commands = this.commands;
      this.commands = [];
      events.push(...stepWorld(this.state, TICK_SECONDS, commands));
    }

    this.lastTickAt = new Date();
    this.lastTickDurationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;

    this.publish(events, this.state);

    const critical = events.filter(isCriticalEvent);
    if (critical.length > 0) {
      void this.commitCritical(critical);
      return;
    }

    if (
      Date.now() - (this.lastCheckpointAt?.getTime() ?? 0) >=
      CHECKPOINT_INTERVAL_MS
    ) {
      void this.writeCheckpoint();
    }
  }

  private publish(events: SimEvent[], state: WorldSimState) {
    for (const publish of this.publishers) {
      try {
        publish({ state, events, tick: state.tick });
      } catch (error) {
        this.logger.error(
          `World publisher failed: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
  }

  private async commitCritical(events: SimEvent[]) {
    if (!this.world || !this.state) return;
    const at = new Date();
    try {
      await this.persistence.commitCriticalEvents(
        this.world,
        this.state,
        events,
        at,
      );
      this.lastCheckpointAt = at;
    } catch (error) {
      this.logger.error(
        `Failed to persist a critical transition: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  private async writeCheckpoint() {
    if (!this.world || !this.state) return;
    const at = new Date();
    // Set optimistically so a slow write cannot queue a checkpoint per tick.
    this.lastCheckpointAt = at;
    try {
      await this.persistence.checkpoint(this.world, this.state, at);
      await this.persistence.pruneEvents(this.world.id);
    } catch (error) {
      this.logger.error(
        `Checkpoint failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  /** Best-effort final checkpoint plus lock release. */
  async shutdown() {
    if (this.stopping) return;
    this.stopping = true;
    if (this.lockRetryTimer) clearTimeout(this.lockRetryTimer);
    this.lockRetryTimer = null;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;

    await this.dailyReset;
    await this.adminMutation?.catch(() => undefined);
    if (this.mode === 'running' && this.world && this.state) {
      try {
        await this.persistence.checkpoint(this.world, this.state, new Date());
        this.logger.log('Wrote the final checkpoint before shutdown');
      } catch (error) {
        this.logger.error(
          `Final checkpoint failed: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
    await this.persistence.drain();
    if (this.world) await this.lock.release(this.world.slug);
    this.mode = 'stopped';
  }
}
