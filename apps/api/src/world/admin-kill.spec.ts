import request from 'supertest';
import { DEFAULT_MONSTER_DNA, encodeMonsterDna } from '@monsters/game-core';
import {
  createHarness,
  resetDatabaseStandalone,
  waitFor,
  type Harness,
} from '../../test/harness';
import { TestClient } from '../../test/socket-client';
import { AuthService, type AccountSession } from '../auth/auth.service';
import { GuestService } from '../guest/guest.service';
import { WorldService } from './world.service';
import { WorldPersistenceService } from './world-persistence.service';

describe('keeper kill API', () => {
  let harness: Harness;
  const identity: AccountSession = {
    user: {
      id: 'keeper-test',
      name: 'Keeper',
      email: 'keeper@example.com',
      image: null,
      role: 'admin',
    },
    session: {
      id: 'test-session',
      expiresAt: new Date(Date.now() + 86400_000),
    },
  };
  const server = () => harness.app.getHttpServer() as never;
  const authorize = () =>
    jest
      .spyOn(harness.app.get(AuthService), 'getSession')
      .mockResolvedValue(identity);
  beforeEach(async () => {
    await resetDatabaseStandalone();
    harness = await createHarness({ runner: true, listen: true });
  });
  afterEach(async () => {
    jest.restoreAllMocks();
    await harness.close();
  });

  it('rejects guests, non-admins and untrusted browser origins', async () => {
    const id = harness.runner.getState()!.entities[0].id;
    const auth = authorize().mockResolvedValue(null);
    await request(server()).post(`/api/admin/monsters/${id}/kill`).expect(401);
    auth.mockResolvedValue({
      ...identity,
      user: { ...identity.user, role: 'user' },
    });
    await request(server()).post(`/api/admin/monsters/${id}/kill`).expect(403);
    auth.mockResolvedValue(identity);
    await request(server())
      .post(`/api/admin/monsters/${id}/kill`)
      .set('Origin', 'https://untrusted.example')
      .expect(403);
    expect(harness.runner.getState()!.entities[0].alive).toBe(true);
  });

  it('durably kills wild monsters, audits the admin and is safe to retry', async () => {
    authorize();
    const before = harness.runner.getState()!;
    const id = before.entities[0].id;
    const sibling = before.entities[1].id;
    const response = await request(server())
      .post(`/api/admin/monsters/${id}/kill`)
      .expect(200);
    expect(
      (response.body as { monster: { id: string; alive: boolean } }).monster,
    ).toMatchObject({ id, alive: false });
    const row = await harness.prisma.monster.findUniqueOrThrow({
      where: { id },
    });
    expect(row.diedAt).not.toBeNull();
    expect(
      harness.runner
        .getState()!
        .entities.find((entity) => entity.id === sibling)?.alive,
    ).toBe(true);
    const event = await harness.prisma.worldEvent.findFirstOrThrow({
      where: { type: 'death' },
    });
    expect(event.payload).toMatchObject({
      entityId: id,
      cause: 'admin',
      adminUserId: 'keeper-test',
    });
    await request(server()).post(`/api/admin/monsters/${id}/kill`).expect(200);
    expect(
      await harness.prisma.worldEvent.count({ where: { type: 'death' } }),
    ).toBe(1);
    expect(
      (await harness.prisma.monster.findUniqueOrThrow({ where: { id } }))
        .diedAt,
    ).toEqual(row.diedAt);
    await harness.close();
    harness = await createHarness({ runner: true, listen: true });
    expect(
      harness.runner.getState()!.entities.find((entity) => entity.id === id)
        ?.alive,
    ).toBe(false);
  });

  it('kills a controlled creature, preserves ownership/ancestry and tells the watching client', async () => {
    authorize();
    const { token, guest } = await harness.app.get(GuestService).bootstrap();
    const worlds = harness.app.get(WorldService);
    const monster = await worlds.createMonster(
      guest.id,
      'Keeper target',
      encodeMonsterDna(DEFAULT_MONSTER_DNA),
    );
    const parents = harness.runner
      .getState()!
      .entities.slice(0, 2)
      .map((entity) => entity.id);
    await harness.prisma.monster.update({
      where: { id: monster.id },
      data: { parentAId: parents[0], parentBId: parents[1], generation: 1 },
    });
    const client = new TestClient(harness.url, token);
    try {
      await client.connected();
      await client.join(monster.id);
      await waitFor(() =>
        Boolean(
          harness.runner
            .getState()!
            .entities.find((entity) => entity.id === monster.id)?.controllerId,
        ),
      );
      await request(server())
        .post(`/api/admin/monsters/${monster.id}/kill`)
        .expect(200);
      await waitFor(() =>
        client.events.some(
          (event) => event.type === 'death' && event.entityId === monster.id,
        ),
      );
      expect(client.me?.alive).toBe(false);
      expect(
        await harness.prisma.monster.findUniqueOrThrow({
          where: { id: monster.id },
        }),
      ).toMatchObject({
        alive: false,
        ownerId: guest.id,
        parentAId: parents[0],
        parentBId: parents[1],
        generation: 1,
      });
      expect(
        harness.runner
          .getState()!
          .entities.find((entity) => entity.id === monster.id)?.controllerId,
      ).toBeNull();
    } finally {
      client.close();
    }
  });

  it('kills an unspawned record and cancels a pending spawn of that same animal', async () => {
    authorize();
    const worlds = harness.app.get(WorldService);
    const monster = await worlds.adminCreateMonster(
      'Not spawned',
      encodeMonsterDna(DEFAULT_MONSTER_DNA),
      false,
    );
    const row = await harness.prisma.monster.findUniqueOrThrow({
      where: { id: monster.id },
    });
    harness.runner.enqueue(worlds.buildSpawnCommand(row));
    // Call synchronously before the next tick can apply the queued spawn.
    await harness.runner.killMonster(row, identity.user.id);
    const tick = harness.runner.getState()!.tick;
    await waitFor(() => harness.runner.getState()!.tick > tick + 2);
    expect(
      harness.runner
        .getState()!
        .entities.find((entity) => entity.id === monster.id)?.alive,
    ).not.toBe(true);
    expect(
      (
        await harness.prisma.monster.findUniqueOrThrow({
          where: { id: monster.id },
        })
      ).alive,
    ).toBe(false);
  });

  it('does not publish or mutate a death when saving fails, then resumes ticking', async () => {
    const id = harness.runner.getState()!.entities[0].id;
    const publish = jest.fn();
    const off = harness.runner.onPublish(publish);
    const persistence = harness.app.get(WorldPersistenceService);
    const save = jest
      .spyOn(persistence, 'commitCriticalEvents')
      .mockRejectedValueOnce(new Error('database unavailable'));
    await expect(
      harness.app.get(WorldService).adminKillMonster(id, identity.user.id),
    ).rejects.toThrow('database unavailable');
    expect(harness.runner.getState()!.entities[0].alive).toBe(true);
    expect(
      (await harness.prisma.monster.findUniqueOrThrow({ where: { id } })).alive,
    ).toBe(true);
    expect(publish).not.toHaveBeenCalled();
    save.mockRestore();
    off();
    const tick = harness.runner.getState()!.tick;
    await waitFor(() => harness.runner.getState()!.tick > tick);
  });

  it('rejects unknown IDs and refuses writes on a stopped runner', async () => {
    authorize();
    await request(server())
      .post('/api/admin/monsters/missing/kill')
      .expect(404);
    const id = harness.runner.getState()!.entities[0].id;
    await harness.runner.shutdown();
    await request(server()).post(`/api/admin/monsters/${id}/kill`).expect(503);
    expect(
      (await harness.prisma.monster.findUniqueOrThrow({ where: { id } })).alive,
    ).toBe(true);
  });

  it('respawns a lingering corpse atomically and keeps the revived state after restart', async () => {
    const worlds = harness.app.get(WorldService);
    const id = harness.runner.getState()!.entities[0].id;
    await worlds.adminKillMonster(id, identity.user.id);
    expect(
      harness.runner.getState()!.entities.find((entity) => entity.id === id)
        ?.alive,
    ).toBe(false);
    const revived = await worlds.adminSpawnMonster(id);
    expect(revived).toMatchObject({
      id,
      alive: true,
      diedAt: null,
      ageSeconds: 0,
      inWorld: true,
    });
    expect(
      harness.runner.getState()!.entities.filter((entity) => entity.id === id),
    ).toHaveLength(1);
    expect(
      harness.runner.getState()!.entities.find((entity) => entity.id === id),
    ).toMatchObject({ health: 100, energy: 100, alive: true });
    const born = await harness.prisma.worldEvent.count({
      where: { type: 'spawned' },
    });
    await worlds.adminSpawnMonster(id);
    expect(
      await harness.prisma.worldEvent.count({ where: { type: 'spawned' } }),
    ).toBe(born);
    await harness.close();
    harness = await createHarness({ runner: true, listen: true });
    expect(
      harness.runner.getState()!.entities.find((entity) => entity.id === id)
        ?.alive,
    ).toBe(true);
  });

  it('keeps a dead record dead when respawn persistence fails or the runner stops', async () => {
    const worlds = harness.app.get(WorldService);
    const id = harness.runner.getState()!.entities[0].id;
    await worlds.adminKillMonster(id, identity.user.id);
    const save = jest
      .spyOn(harness.app.get(WorldPersistenceService), 'commitCriticalEvents')
      .mockRejectedValueOnce(new Error('save unavailable'));
    await expect(worlds.adminSpawnMonster(id)).rejects.toThrow(
      'save unavailable',
    );
    expect(
      harness.runner.getState()!.entities.find((entity) => entity.id === id)
        ?.alive,
    ).toBe(false);
    expect(
      (await harness.prisma.monster.findUniqueOrThrow({ where: { id } })).alive,
    ).toBe(false);
    save.mockRestore();
    await harness.runner.shutdown();
    await expect(worlds.adminSpawnMonster(id)).rejects.toMatchObject({
      status: 503,
    });
    expect(
      (await harness.prisma.monster.findUniqueOrThrow({ where: { id } })).alive,
    ).toBe(false);
  });
});
