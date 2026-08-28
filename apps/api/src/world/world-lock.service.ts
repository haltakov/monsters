import { Injectable, Logger } from '@nestjs/common';
import { Client } from 'pg';
import { WORLD_LOCK_NAMESPACE } from '../config/app-config';

/** Stable 32-bit key for a world slug. */
export function worldLockKey(slug: string) {
  let hash = 2166136261;
  for (let index = 0; index < slug.length; index += 1) {
    hash ^= slug.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  // Advisory lock ids are signed int4.
  return hash | 0;
}

/**
 * Session-scoped PostgreSQL advisory lock held on a dedicated connection.
 *
 * Only the process holding the lock may tick or write a world. The lock is
 * released automatically by PostgreSQL if the process dies or the connection
 * drops, which is exactly the behaviour a rolling Coolify deploy needs: the
 * outgoing container releases the world the moment it goes away.
 */
@Injectable()
export class WorldLockService {
  private readonly logger = new Logger(WorldLockService.name);
  private client: Client | null = null;
  private owned = false;
  private lostHandler: (() => void) | null = null;

  get isOwned() {
    return this.owned;
  }

  onLost(handler: () => void) {
    this.lostHandler = handler;
  }

  private handleLoss(reason: string) {
    if (!this.owned) return;
    this.owned = false;
    this.logger.warn(`Lost world ownership: ${reason}`);
    this.lostHandler?.();
  }

  async acquire(slug: string, connectionString = process.env.DATABASE_URL) {
    if (this.owned) return true;
    if (!connectionString) throw new Error('DATABASE_URL is required');

    const client = new Client({ connectionString });
    client.on('error', (error) => {
      this.handleLoss(error.message);
      void this.dispose();
    });
    client.on('end', () => {
      this.handleLoss('connection ended');
    });

    await client.connect();
    try {
      const result = await client.query<{ locked: boolean }>(
        'SELECT pg_try_advisory_lock($1::int, $2::int) AS locked',
        [WORLD_LOCK_NAMESPACE, worldLockKey(slug)],
      );
      const locked = result.rows[0]?.locked === true;
      if (!locked) {
        await client.end();
        return false;
      }
      this.client = client;
      this.owned = true;
      return true;
    } catch (error) {
      await client.end().catch(() => undefined);
      throw error;
    }
  }

  /** Cheap liveness probe used by the health endpoint and the tick loop. */
  async verify(slug: string) {
    if (!this.owned || !this.client) return false;
    try {
      const result = await this.client.query<{ held: boolean }>(
        `SELECT EXISTS (
           SELECT 1 FROM pg_locks
           WHERE locktype = 'advisory'
             AND classid = $1::int
             AND objid = ($2::bigint)::oid
             AND pid = pg_backend_pid()
             AND granted
         ) AS held`,
        [WORLD_LOCK_NAMESPACE, worldLockKey(slug) >>> 0],
      );
      const held = result.rows[0]?.held === true;
      if (!held) this.handleLoss('advisory lock no longer granted');
      return held;
    } catch (error) {
      this.handleLoss(error instanceof Error ? error.message : 'probe failed');
      return false;
    }
  }

  async release(slug: string) {
    if (!this.client) {
      this.owned = false;
      return;
    }
    const client = this.client;
    this.client = null;
    this.owned = false;
    try {
      await client.query('SELECT pg_advisory_unlock($1::int, $2::int)', [
        WORLD_LOCK_NAMESPACE,
        worldLockKey(slug),
      ]);
    } catch {
      // The connection is already gone; PostgreSQL released the lock for us.
    }
    await client.end().catch(() => undefined);
  }

  private async dispose() {
    const client = this.client;
    this.client = null;
    if (client) await client.end().catch(() => undefined);
  }
}
