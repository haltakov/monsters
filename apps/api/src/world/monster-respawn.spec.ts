import request from 'supertest';
import {
  deserializeWorldState,
  DEFAULT_MONSTER_DNA,
  encodeMonsterDna,
  ISLANDS,
  islandAt,
} from '@monsters/game-core';
import {
  createHarness,
  resetDatabaseStandalone,
  waitFor,
  type Harness,
} from '../../test/harness';
import { TestClient } from '../../test/socket-client';
import { GuestService } from '../guest/guest.service';
import {
  MAX_OWNED_MONSTERS,
  WorldService,
  type MonsterView,
} from './world.service';
import { AuthService, type AccountSession } from '../auth/auth.service';

const DNA = encodeMonsterDna({
  ...DEFAULT_MONSTER_DNA,
  color: 'obsidian',
  adaptation: 'spines',
});

describe('saved monster inventory and respawning', () => {
  let harness: Harness;
  const clients: TestClient[] = [];
  const server = () => harness.app.getHttpServer() as never;
  const worlds = () => harness.app.get(WorldService);
  const live = (id: string) =>
    harness.runner.getState()!.entities.find((entity) => entity.id === id);
  async function player(name: string) {
    const identity = await harness.app.get(GuestService).bootstrap();
    const monster = await worlds().createMonster(identity.guest.id, name, DNA);
    return { ...identity, monster };
  }
  async function join(token: string, id: string) {
    const client = new TestClient(harness.url, token);
    clients.push(client);
    await client.connected();
    await client.join(id);
    await waitFor(() => Boolean(live(id)));
    return client;
  }
  async function respawn(token: string, id: string, status = 200) {
    return request(server())
      .post(`/api/monsters/${id}/respawn`)
      .set('Authorization', `Bearer ${token}`)
      .expect(status);
  }
  beforeEach(async () => {
    await resetDatabaseStandalone();
    harness = await createHarness({ runner: true, listen: true });
  });
  afterEach(async () => {
    clients.splice(0).forEach((client) => client.close());
    jest.restoreAllMocks();
    await harness.close();
  });

  it('preserves owned designs and last selection through admin reset and seeds every island', async () => {
    const first = await player('Saved custom monster');
    const client = await join(first.token, first.monster.id);
    await harness.prisma.user.create({
      data: {
        id: 'inventory-account',
        name: 'Keeper',
        email: 'saved@example.com',
      },
    });
    const accountOnly = await harness.prisma.monster.create({
      data: {
        worldId: harness.runner.getWorld()!.id,
        name: 'Account-only design',
        species: 'round',
        dna: { code: DNA },
        accountOwnerId: 'inventory-account',
        originType: 'player',
        alive: false,
      },
    });
    const oldWildId = harness.runner
      .getState()!
      .entities.find((entity) => !entity.ownerGuestId)!.id;
    await worlds().adminResetWorld(12);
    await waitFor(() =>
      client.events.some((event) => event.type === 'worldReset'),
    );
    const state = harness.runner.getState()!;
    for (const island of ISLANDS)
      expect(
        state.entities.some(
          (entity) =>
            entity.locomotion === 'land' &&
            islandAt(entity.x, entity.z)?.id === island.id,
        ),
      ).toBe(true);
    expect(
      await harness.prisma.monster.findUnique({ where: { id: oldWildId } }),
    ).toBeNull();
    expect(
      await harness.prisma.monster.findUnique({
        where: { id: accountOnly.id },
      }),
    ).toMatchObject({ alive: false, dna: { code: DNA } });
    const inventory = await request(server())
      .get('/api/monsters')
      .set('Authorization', `Bearer ${first.token}`)
      .expect(200);
    expect(inventory.body).toMatchObject({
      selectedMonsterId: first.monster.id,
      monsters: [
        {
          id: first.monster.id,
          name: first.monster.name,
          dna: DNA,
          alive: false,
        },
      ],
    });
    expect(client.snapshot?.you.entityId).toBeNull();
    const result = await respawn(first.token, first.monster.id);
    expect((result.body as { monster: MonsterView }).monster).toMatchObject({
      id: first.monster.id,
      name: first.monster.name,
      dna: DNA,
      alive: true,
      ageSeconds: 0,
    });
    client.snapshot = null;
    const rejoined = await client.join(first.monster.id);
    expect(rejoined.you.isController).toBe(true);
  });

  it('respawns the same design after death and retries do not heal or duplicate the living monster', async () => {
    const owner = await player('Phoenix');
    const client = await join(owner.token, owner.monster.id);
    await worlds().adminKillMonster(owner.monster.id, 'test-keeper');
    expect(live(owner.monster.id)?.alive).toBe(false);
    await Promise.all([
      respawn(owner.token, owner.monster.id),
      respawn(owner.token, owner.monster.id),
    ]);
    const checkpoint = await harness.prisma.worldSnapshot.findUniqueOrThrow({
      where: { worldId: harness.runner.getWorld()!.id },
    });
    expect(
      deserializeWorldState(checkpoint.state).entities.find(
        (entity) => entity.id === owner.monster.id,
      ),
    ).toMatchObject({
      alive: true,
      ownerGuestId: owner.guest.id,
      name: 'Phoenix',
    });
    expect(live(owner.monster.id)).toMatchObject({
      alive: true,
      health: 100,
      energy: 100,
      age: 0,
    });
    const row = await harness.prisma.monster.findUniqueOrThrow({
      where: { id: owner.monster.id },
    });
    expect(row).toMatchObject({
      alive: true,
      diedAt: null,
      name: 'Phoenix',
      dna: { code: DNA },
    });
    live(owner.monster.id)!.health = 54;
    live(owner.monster.id)!.energy = 42;
    await Promise.all([
      respawn(owner.token, owner.monster.id),
      respawn(owner.token, owner.monster.id),
    ]);
    expect(live(owner.monster.id)!.health).toBeLessThan(55);
    expect(live(owner.monster.id)!.energy).toBeLessThan(43);
    expect(
      harness.runner
        .getState()!
        .entities.filter((entity) => entity.id === owner.monster.id),
    ).toHaveLength(1);
    client.snapshot = null;
    await client.join(owner.monster.id);
    const before = {
      x: live(owner.monster.id)!.x,
      z: live(owner.monster.id)!.z,
    };
    client.input({ forward: 1, heading: 0 });
    await waitFor(
      () =>
        Math.hypot(
          live(owner.monster.id)!.x - before.x,
          live(owner.monster.id)!.z - before.z,
        ) > 0.3,
    );
  });

  it('rejects foreign and unauthenticated respawns and enforces the living inventory limit', async () => {
    const owner = await player('Limited');
    const stranger = await player('Stranger');
    await worlds().adminKillMonster(owner.monster.id, 'test-keeper');
    await request(server())
      .post(`/api/monsters/${owner.monster.id}/respawn`)
      .expect(401);
    await respawn(stranger.token, owner.monster.id, 403);
    await expect(
      worlds().copyMonster(stranger.guest.id, owner.monster.id, null),
    ).rejects.toThrow('Monster not found');
    for (let index = 0; index < MAX_OWNED_MONSTERS; index++)
      await worlds().createMonster(owner.guest.id, `Living ${index}`, DNA);
    await respawn(owner.token, owner.monster.id, 400);
    expect(
      await harness.prisma.monster.findUnique({
        where: { id: owner.monster.id },
      }),
    ).toMatchObject({ alive: false });
    expect(live(owner.monster.id)).toBeUndefined();
  });

  it('lets a signed-in owner respawn an archived design from another device', async () => {
    const owner = await player('Across devices');
    const nextDevice = await harness.app.get(GuestService).bootstrap();
    const account = await harness.prisma.user.create({
      data: {
        id: 'respawn-account',
        name: 'Account',
        email: 'respawn@example.com',
      },
    });
    await harness.prisma.monster.update({
      where: { id: owner.monster.id },
      data: { accountOwnerId: account.id },
    });
    await worlds().adminKillMonster(owner.monster.id, 'test-keeper');
    const identity: AccountSession = {
      user: {
        id: account.id,
        name: account.name,
        email: account.email,
        image: null,
        role: 'user',
      },
      session: { id: 'session', expiresAt: new Date(Date.now() + 86400_000) },
    };
    jest
      .spyOn(harness.app.get(AuthService), 'getSession')
      .mockResolvedValue(identity);
    const result = await respawn(nextDevice.token, owner.monster.id);
    expect((result.body as { monster: MonsterView }).monster).toMatchObject({
      id: owner.monster.id,
      accountOwned: true,
      alive: true,
    });
    expect(live(owner.monster.id)?.ownerGuestId).toBe(nextDevice.guest.id);
    expect(
      await harness.prisma.monster.findUnique({
        where: { id: owner.monster.id },
      }),
    ).toMatchObject({
      ownerId: nextDevice.guest.id,
      accountOwnerId: account.id,
    });
  });

  it('does not revive a saved monster when the authoritative world is unavailable', async () => {
    const owner = await player('Offline recovery');
    await worlds().adminKillMonster(owner.monster.id, 'test-keeper');
    await harness.runner.shutdown();
    await respawn(owner.token, owner.monster.id, 503);
    expect(
      await harness.prisma.monster.findUnique({
        where: { id: owner.monster.id },
      }),
    ).toMatchObject({ alive: false });
  });
});
