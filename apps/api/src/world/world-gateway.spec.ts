import request from 'supertest';
import {
  DEFAULT_MONSTER_DNA,
  PLAYER_SPRINT_SPEED,
  encodeMonsterDna,
  type SimEntity,
} from '@monsters/game-core';
import {
  createHarness,
  resetDatabaseStandalone,
  waitFor,
  type Harness,
} from '../../test/harness';
import { TestClient } from '../../test/socket-client';
import { GuestService } from '../guest/guest.service';

const DNA = encodeMonsterDna(DEFAULT_MONSTER_DNA);

describe('world websocket protocol', () => {
  let harness: Harness;
  const openClients: TestClient[] = [];

  const server = () => harness.app.getHttpServer() as never;

  async function createPlayer(name: string) {
    // Created through the service so the suite is not throttled by the
    // deliberately tight public bootstrap rate limit.
    const { token, guest } = await harness.app.get(GuestService).bootstrap();
    const created = await request(server())
      .post('/api/monsters')
      .set({ Authorization: `Bearer ${token}` })
      .send({ name, dna: DNA })
      .expect(201);
    const monster = (created.body as { monster: { id: string } }).monster;
    return { token, guestId: guest.id, monsterId: monster.id };
  }

  async function connect(token: string) {
    const client = new TestClient(harness.url, token);
    openClients.push(client);
    await client.connected();
    return client;
  }

  /**
   * Every player spawns on the same beach, so tests that care about
   * proximity move their monsters to a private, empty patch of land first.
   */
  function isolate(entities: SimEntity[], x: number, z: number) {
    entities.forEach((candidate, index) => {
      candidate.x = x + index;
      candidate.z = z;
      candidate.y = 0;
    });
  }

  function entity(id: string) {
    return harness.runner
      .getState()!
      .entities.find((candidate) => candidate.id === id);
  }

  async function joinedEntity(id: string) {
    await waitFor(() => Boolean(entity(id)));
    return entity(id)!;
  }

  beforeAll(async () => {
    await resetDatabaseStandalone();
    harness = await createHarness({ runner: true, listen: true });
  });

  afterAll(async () => {
    for (const client of openClients) client.close();
    await harness.close();
  });

  it('refuses a connection without a valid token', async () => {
    const client = new TestClient(harness.url, 'not-a-token');
    openClients.push(client);
    await waitFor(
      () => client.socket.disconnected && !client.socket.connected,
      {
        timeout: 5000,
      },
    );
    expect(client.snapshot).toBeNull();
  });

  it('gives two authenticated clients consistent snapshots of one world', async () => {
    const first = await createPlayer('First');
    const second = await createPlayer('Second');
    const clientA = await connect(first.token);
    const clientB = await connect(second.token);

    const snapshotA = await clientA.join(first.monsterId);
    const snapshotB = await clientB.join(second.monsterId);

    expect(snapshotA.worldId).toBe(snapshotB.worldId);
    expect(snapshotA.you.entityId).toBe(first.monsterId);
    expect(snapshotB.you.entityId).toBe(second.monsterId);
    expect(snapshotA.you.isController).toBe(true);

    await clientA.waitForDeltas(4);
    await clientB.waitForDeltas(4);
    expect(clientA.entities.has(second.monsterId)).toBe(true);
    expect(clientB.entities.has(first.monsterId)).toBe(true);

    // Both clients agree on the shared wild population.
    const wildA = [...clientA.entities.keys()].filter((id) =>
      id.includes(':wild-'),
    );
    const wildB = [...clientB.entities.keys()].filter((id) =>
      id.includes(':wild-'),
    );
    expect(wildA.sort()).toEqual(wildB.sort());
  });

  it('moves only the entity the input belongs to', async () => {
    const mover = await createPlayer('Mover');
    const idler = await createPlayer('Idler');
    const moverClient = await connect(mover.token);
    const idlerClient = await connect(idler.token);
    await moverClient.join(mover.monsterId);
    await idlerClient.join(idler.monsterId);

    const moverEntity = await joinedEntity(mover.monsterId);
    const idlerEntity = await joinedEntity(idler.monsterId);
    const idlerStart = { x: idlerEntity.x, z: idlerEntity.z };
    const moverStart = { x: moverEntity.x, z: moverEntity.z };

    for (let index = 0; index < 20; index += 1) {
      moverClient.input({ forward: 1, heading: 0 });
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    await moverClient.waitForDeltas(3);

    expect(
      Math.hypot(moverEntity.x - moverStart.x, moverEntity.z - moverStart.z),
    ).toBeGreaterThan(0.5);
    expect(
      Math.hypot(idlerEntity.x - idlerStart.x, idlerEntity.z - idlerStart.z),
    ).toBeLessThan(0.001);
  });

  it('cannot be tricked into superhuman speed or forged vitals', async () => {
    const player = await createPlayer('Cheater');
    const client = await connect(player.token);
    await client.join(player.monsterId);
    const live = await joinedEntity(player.monsterId);
    const start = { x: live.x, z: live.z, health: live.health };

    const startedAt = Date.now();
    for (let index = 0; index < 20; index += 1) {
      client.raw('world:input', {
        seq: index + 1,
        forward: 5000,
        strafe: -5000,
        turn: 900,
        heading: 0.5,
        sprint: true,
        // Fields the protocol does not define must be ignored outright.
        x: 999,
        z: 999,
        health: 100_000,
        energy: 100_000,
        damage: 500,
      });
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    await client.waitForDeltas(3);
    const seconds = (Date.now() - startedAt) / 1000 + 0.5;

    const travelled = Math.hypot(live.x - start.x, live.z - start.z);
    expect(travelled).toBeLessThanOrEqual(PLAYER_SPRINT_SPEED * seconds);
    expect(live.health).toBeLessThanOrEqual(100);
    expect(live.energy).toBeLessThanOrEqual(100);
    expect(start.health).toBeLessThanOrEqual(100);
  });

  it('ignores stale sequence numbers and rate-limits floods', async () => {
    const player = await createPlayer('Sequencer');
    const client = await connect(player.token);
    await client.join(player.monsterId);
    const live = await joinedEntity(player.monsterId);

    client.input({ forward: 1, heading: 0, seq: 500 });
    await client.waitForDeltas(2);
    expect(live.lastInputSeq).toBe(500);

    client.input({ forward: -1, heading: 0, seq: 3 });
    await client.waitForDeltas(2);
    expect(live.lastInputSeq).toBe(500);
    expect(live.input?.forward).toBe(1);

    client.errors.length = 0;
    for (let index = 0; index < 200; index += 1) {
      client.input({ forward: 1, heading: 0, seq: 1000 + index });
    }
    await waitFor(() =>
      client.errors.some((error) => error.code === 'rateLimited'),
    );
  });

  it('resumes the same entity after a disconnect without duplicating it', async () => {
    const player = await createPlayer('Returner');
    const first = await connect(player.token);
    const snapshot = await first.join(player.monsterId);
    await joinedEntity(player.monsterId);
    first.close();

    await waitFor(() => entity(player.monsterId)?.controlExpiresAt !== null, {
      timeout: 5000,
    });

    const second = await connect(player.token);
    const resumed = await second.join(player.monsterId);
    expect(resumed.you.entityId).toBe(snapshot.you.entityId);
    expect(resumed.you.isController).toBe(true);

    const matches = harness.runner
      .getState()!
      .entities.filter((candidate) => candidate.id === player.monsterId);
    expect(matches).toHaveLength(1);
    await second.waitForDeltas(2);
    expect(entity(player.monsterId)!.controlExpiresAt).toBeNull();
  });

  it('keeps exactly one controller per monster', async () => {
    const player = await createPlayer('Shared');
    const original = await connect(player.token);
    await original.join(player.monsterId);
    const takeover = await connect(player.token);
    await takeover.join(player.monsterId);

    await waitFor(() =>
      original.statuses.some((status) => status.reason === 'controlTakenOver'),
    );
    original.errors.length = 0;
    original.input({ forward: 1, heading: 0, seq: 9000 });
    await waitFor(() =>
      original.errors.some((error) => error.code === 'notOwner'),
    );
    expect(takeover.snapshot!.you.isController).toBe(true);
  });

  it('releases the previous monster when one socket switches control', async () => {
    const first = await createPlayer('Switcher One');
    const created = await request(server())
      .post('/api/monsters')
      .set({ Authorization: `Bearer ${first.token}` })
      .send({ name: 'Switcher Two', dna: DNA })
      .expect(201);
    const secondId = (created.body as { monster: { id: string } }).monster.id;
    const client = await connect(first.token);
    await client.join(first.monsterId);
    const firstEntity = await joinedEntity(first.monsterId);

    client.input({ forward: 1, heading: 0 });
    await waitFor(() => firstEntity.input?.forward === 1);

    // TestClient normally retains the last snapshot, so clear it before
    // waiting for the replacement snapshot emitted by a second join.
    client.snapshot = null;
    await client.join(secondId);
    const secondEntity = await joinedEntity(secondId);

    await waitFor(() => firstEntity.controlExpiresAt !== null);
    expect(firstEntity.input).toBeNull();
    expect(secondEntity.controllerId).toBe(client.socket.id);

    // Taking over the released monster must not demote the first socket from
    // the new monster it now controls.
    const takeover = await connect(first.token);
    await takeover.join(first.monsterId);
    await waitFor(() => firstEntity.controllerId === takeover.socket.id);
    expect(secondEntity.controllerId).toBe(client.socket.id);

    client.input({ forward: 1, heading: 0 });
    await waitFor(() => secondEntity.lastInputSeq > 0);
    expect(client.errors.some((error) => error.code === 'notOwner')).toBe(
      false,
    );
  });

  it('never lets a player damage another controlled player', async () => {
    const attacker = await createPlayer('Attacker');
    const victim = await createPlayer('Victim');
    const attackerClient = await connect(attacker.token);
    const victimClient = await connect(victim.token);
    await attackerClient.join(attacker.monsterId);
    await victimClient.join(victim.monsterId);

    const attackerEntity = await joinedEntity(attacker.monsterId);
    const victimEntity = await joinedEntity(victim.monsterId);
    isolate([attackerEntity, victimEntity], -62, 58);
    victimEntity.health = 100;

    attackerClient.action('attack');
    await attackerClient.waitForDeltas(3);

    expect(victimEntity.health).toBe(100);
    expect(
      attackerClient.events.some(
        (event) =>
          event.type === 'attackMissed' && event.reason === 'playerProtected',
      ),
    ).toBe(true);
  });

  it('lets a player fight a wild monster', async () => {
    const player = await createPlayer('Hunter');
    const client = await connect(player.token);
    await client.join(player.monsterId);
    const live = await joinedEntity(player.monsterId);

    const wild = harness.runner
      .getState()!
      .entities.find(
        (candidate): candidate is SimEntity =>
          candidate.alive &&
          candidate.ownerGuestId === null &&
          candidate.id.includes(':wild-'),
      )!;
    isolate([live, wild], 58, -62);
    wild.health = 100;
    const before = wild.health;

    client.action('attack');
    const attack = await client.waitForEvent('attack');
    expect(attack.type === 'attack' && attack.targetId).toBe(wild.id);
    expect(wild.health).toBeLessThan(before);
    expect(live.energy).toBeLessThan(100);
  });

  it('requires acceptance for player to player pairing and honours a refusal', async () => {
    const first = await createPlayer('Romeo');
    const second = await createPlayer('Juliet');
    const clientA = await connect(first.token);
    const clientB = await connect(second.token);
    await clientA.join(first.monsterId);
    await clientB.join(second.monsterId);

    const entityA = await joinedEntity(first.monsterId);
    const entityB = await joinedEntity(second.monsterId);
    isolate([entityA, entityB], -64, -58);
    entityA.mateCooldownUntil = 0;
    entityB.mateCooldownUntil = 0;
    const eggsBefore = harness.runner.getState()!.eggs.length;

    clientA.action('pair');
    const requested = await clientB.waitForEvent('pairRequested');
    if (requested.type !== 'pairRequested') throw new Error('unexpected event');
    expect(requested.toEntityId).toBe(second.monsterId);
    expect(harness.runner.getState()!.eggs).toHaveLength(eggsBefore);

    // A third party cannot answer somebody else's request.
    clientA.errors.length = 0;
    clientA.pairRespond(requested.requestId, true);
    await waitFor(() =>
      clientA.errors.some((error) => error.code === 'notOwner'),
    );
    expect(harness.runner.getState()!.eggs).toHaveLength(eggsBefore);

    clientB.pairRespond(requested.requestId, false);
    const rejected = await clientB.waitForEvent('pairResolved');
    expect(rejected.type === 'pairResolved' && rejected.outcome).toBe(
      'rejected',
    );
    expect(harness.runner.getState()!.eggs).toHaveLength(eggsBefore);
  });

  it('lays an egg once the second player accepts', async () => {
    const first = await createPlayer('Mira');
    const second = await createPlayer('Nim');
    const clientA = await connect(first.token);
    const clientB = await connect(second.token);
    await clientA.join(first.monsterId);
    await clientB.join(second.monsterId);

    const entityA = await joinedEntity(first.monsterId);
    const entityB = await joinedEntity(second.monsterId);
    isolate([entityA, entityB], 62, 58);
    entityA.mateCooldownUntil = 0;
    entityB.mateCooldownUntil = 0;
    entityA.energy = 100;
    entityB.energy = 100;
    const eggsBefore = harness.runner.getState()!.eggs.length;

    clientA.action('pair');
    const requested = await clientB.waitForEvent('pairRequested');
    if (requested.type !== 'pairRequested') throw new Error('unexpected event');
    clientB.pairRespond(requested.requestId, true);

    const resolved = await clientB.waitForEvent('pairResolved');
    expect(resolved.type === 'pairResolved' && resolved.outcome).toBe(
      'accepted',
    );
    await waitFor(() => harness.runner.getState()!.eggs.length > eggsBefore);
  });

  it('expires an unanswered pairing request', async () => {
    const first = await createPlayer('Waiting');
    const second = await createPlayer('Silent');
    const clientA = await connect(first.token);
    const clientB = await connect(second.token);
    await clientA.join(first.monsterId);
    await clientB.join(second.monsterId);

    const entityA = await joinedEntity(first.monsterId);
    const entityB = await joinedEntity(second.monsterId);
    isolate([entityA, entityB], -20, 78);
    entityA.mateCooldownUntil = 0;
    entityB.mateCooldownUntil = 0;

    clientA.action('pair');
    await clientA.waitForEvent('pairRequested');

    const state = harness.runner.getState()!;
    await waitFor(() => state.pairRequests.length > 0);
    // Fast-forward the deadline instead of waiting out the real timeout.
    for (const pending of state.pairRequests) pending.expiresAt = state.time;

    const resolved = await clientA.waitForEvent('pairResolved');
    expect(resolved.type === 'pairResolved' && resolved.outcome).toBe(
      'expired',
    );
  });

  it('rejects commands from a socket that has not joined', async () => {
    const player = await createPlayer('Lurker');
    const client = await connect(player.token);
    client.action('attack');
    await waitFor(() =>
      client.errors.some((error) => error.code === 'notJoined'),
    );
  });
});
