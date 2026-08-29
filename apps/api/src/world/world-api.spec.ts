import request from 'supertest';
import { encodeMonsterDna, DEFAULT_MONSTER_DNA } from '@monsters/game-core';
import {
  createHarness,
  resetDatabaseStandalone,
  type Harness,
} from '../../test/harness';
import { PUBLIC_WORLD_SLUG } from '../config/app-config';
import { MAX_OWNED_MONSTERS } from './world.service';
import { AccountService } from '../account/account.service';

const DNA = encodeMonsterDna(DEFAULT_MONSTER_DNA);
const OTHER_DNA = encodeMonsterDna({
  ...DEFAULT_MONSTER_DNA,
  body: 'avian',
  adaptation: 'wings',
});

describe('world REST API', () => {
  let harness: Harness;

  const server = () => harness.app.getHttpServer() as never;

  const bootstrapGuest = async () => {
    const response = await request(server())
      .post('/api/guest/bootstrap')
      .expect(201);
    return response.body as { token: string; guest: { id: string } };
  };

  beforeAll(async () => {
    await resetDatabaseStandalone();
    harness = await createHarness({ runner: true, listen: false });
  });

  afterAll(async () => {
    await harness.close();
  });

  beforeEach(async () => {
    // The runner keeps its in-memory world; only guest-owned rows are reset.
    await harness.prisma.worldMember.deleteMany({});
    await harness.prisma.monster.deleteMany({
      where: { NOT: { ownerId: null } },
    });
    await harness.prisma.guestPlayer.deleteMany({});
  });

  it('seeds the public world exactly once', async () => {
    const worlds = await harness.prisma.world.findMany({
      where: { slug: PUBLIC_WORLD_SLUG },
    });
    expect(worlds).toHaveLength(1);

    // A second boot against the same database must not create a duplicate.
    const second = await createHarness({ runner: false, listen: false });
    await second.close();
    const after = await harness.prisma.world.findMany({
      where: { slug: PUBLIC_WORLD_SLUG },
    });
    expect(after).toHaveLength(1);
    expect(after[0].id).toBe(worlds[0].id);
  });

  it('exposes public world metadata without a token', async () => {
    const response = await request(server())
      .get('/api/worlds/public')
      .expect(200);
    const body = response.body as {
      slug: string;
      runner: { active: boolean };
      population: { living: number };
    };
    expect(body.slug).toBe(PUBLIC_WORLD_SLUG);
    expect(body.runner.active).toBe(true);
    expect(body.population.living).toBeGreaterThan(0);
  });

  it('requires a token for the authoritative snapshot', async () => {
    await request(server()).get('/api/worlds/public/snapshot').expect(401);
    const { token } = await bootstrapGuest();
    const response = await request(server())
      .get('/api/worlds/public/snapshot')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const body = response.body as {
      entities: unknown[];
      protocolVersion: number;
    };
    expect(body.protocolVersion).toBe(1);
    expect(body.entities.length).toBeGreaterThan(0);
  });

  it('creates, lists, edits and selects owned monsters', async () => {
    const { token, guest } = await bootstrapGuest();
    const auth = { Authorization: `Bearer ${token}` };

    const created = await request(server())
      .post('/api/monsters')
      .set(auth)
      .send({ name: 'Pebble', dna: DNA })
      .expect(201);
    const monster = (created.body as { monster: { id: string; dna: string } })
      .monster;
    expect(monster.dna).toBe(DNA);

    const list = await request(server())
      .get('/api/monsters')
      .set(auth)
      .expect(200);
    const listed = list.body as {
      monsters: Array<{ id: string }>;
      selectedMonsterId: string;
    };
    expect(listed.monsters.map((entry) => entry.id)).toEqual([monster.id]);
    expect(listed.selectedMonsterId).toBe(monster.id);

    const edited = await request(server())
      .patch(`/api/monsters/${monster.id}`)
      .set(auth)
      .send({ name: 'Pebble II', dna: OTHER_DNA })
      .expect(200);
    expect(
      (edited.body as { monster: { name: string; dna: string } }).monster,
    ).toMatchObject({ name: 'Pebble II', dna: OTHER_DNA });

    const selected = await request(server())
      .post(`/api/monsters/${monster.id}/select`)
      .set(auth)
      .expect(200);
    expect(
      (selected.body as { monster: { selected: boolean } }).monster.selected,
    ).toBe(true);

    const row = await harness.prisma.monster.findUnique({
      where: { id: monster.id },
    });
    expect(row?.ownerId).toBe(guest.id);
  });

  it('rejects invalid names and DNA', async () => {
    const { token } = await bootstrapGuest();
    const auth = { Authorization: `Bearer ${token}` };

    await request(server())
      .post('/api/monsters')
      .set(auth)
      .send({ name: 'x', dna: DNA })
      .expect(400);
    await request(server())
      .post('/api/monsters')
      .set(auth)
      .send({ name: 'Fine name', dna: 'M6;body=notreal' })
      .expect(400);
    await request(server())
      .post('/api/monsters')
      .set(auth)
      .send({ name: 'Fine name' })
      .expect(400);
    await request(server())
      .post('/api/monsters')
      .set(auth)
      .send({ name: `bad${String.fromCharCode(9)}name`, dna: DNA })
      .expect(400);
  });

  it('reserves player nicknames globally, ignoring case and spacing', async () => {
    const first = await bootstrapGuest();
    const second = await bootstrapGuest();
    await request(server())
      .post('/api/monsters')
      .set({ Authorization: `Bearer ${first.token}` })
      .send({ name: 'Moon Hopper', dna: DNA })
      .expect(201);
    await request(server())
      .post('/api/monsters')
      .set({ Authorization: `Bearer ${second.token}` })
      .send({ name: '  moon   hopper  ', dna: DNA })
      .expect(409);
  });

  it('exposes public lineage and lets an owner spawn a named copy', async () => {
    const { token } = await bootstrapGuest();
    const auth = { Authorization: `Bearer ${token}` };
    const created = await request(server())
      .post('/api/monsters')
      .set(auth)
      .send({ name: 'Ancestor', dna: DNA })
      .expect(201);
    const sourceId = (created.body as { monster: { id: string } }).monster.id;
    const copied = await request(server())
      .post(`/api/monsters/${sourceId}/copy`)
      .set(auth)
      .expect(201);
    const copy = (
      copied.body as {
        monster: { id: string; name: string; originType: string };
      }
    ).monster;
    expect(copy).toMatchObject({ name: 'Ancestor 2', originType: 'copy' });

    const lineage = await request(server())
      .get(`/api/monsters/public/${copy.id}`)
      .expect(200);
    expect((lineage.body as { clonedFrom: { id: string } }).clonedFrom.id).toBe(
      sourceId,
    );
  });

  it('claims local progress for an account and releases all but the active monster', async () => {
    const { token, guest } = await bootstrapGuest();
    const auth = { Authorization: `Bearer ${token}` };
    const first = await request(server())
      .post('/api/monsters')
      .set(auth)
      .send({ name: 'Claim One', dna: DNA })
      .expect(201);
    const second = await request(server())
      .post('/api/monsters')
      .set(auth)
      .send({ name: 'Claim Two', dna: OTHER_DNA })
      .expect(201);
    const firstId = (first.body as { monster: { id: string } }).monster.id;
    const secondId = (second.body as { monster: { id: string } }).monster.id;
    await harness.prisma.user.create({
      data: {
        id: 'account-test',
        name: 'Account Test',
        email: 'account@example.com',
      },
    });
    const accounts = harness.app.get(AccountService);
    await expect(
      accounts.claimGuest(guest.id, 'account-test'),
    ).resolves.toEqual({ claimedMonsters: 2 });
    expect(
      await harness.prisma.monster.count({
        where: { accountOwnerId: 'account-test' },
      }),
    ).toBe(2);

    await accounts.releaseGuest(guest.id, 'account-test');
    const rows = await harness.prisma.monster.findMany({
      where: { id: { in: [firstId, secondId] } },
      select: { id: true, ownerId: true, accountOwnerId: true },
    });
    expect(rows.every((row) => row.accountOwnerId === 'account-test')).toBe(
      true,
    );
    expect(
      rows.filter((row) => row.ownerId === guest.id).map((row) => row.id),
    ).toEqual([secondId]);
  });

  it('refuses to let one guest touch another guest monster', async () => {
    const owner = await bootstrapGuest();
    const stranger = await bootstrapGuest();

    const created = await request(server())
      .post('/api/monsters')
      .set({ Authorization: `Bearer ${owner.token}` })
      .send({ name: 'Mine', dna: DNA })
      .expect(201);
    const id = (created.body as { monster: { id: string } }).monster.id;

    await request(server())
      .patch(`/api/monsters/${id}`)
      .set({ Authorization: `Bearer ${stranger.token}` })
      .send({ name: 'Stolen' })
      .expect(403);
    await request(server())
      .post(`/api/monsters/${id}/select`)
      .set({ Authorization: `Bearer ${stranger.token}` })
      .expect(403);
    const strangerList = await request(server())
      .get('/api/monsters')
      .set({ Authorization: `Bearer ${stranger.token}` })
      .expect(200);
    expect(
      (strangerList.body as { monsters: unknown[] }).monsters,
    ).toHaveLength(0);
    await request(server()).patch(`/api/monsters/${id}`).send({}).expect(401);
  });

  it('caps how many living monsters one guest may own', async () => {
    const { token } = await bootstrapGuest();
    const auth = { Authorization: `Bearer ${token}` };
    for (let index = 0; index < MAX_OWNED_MONSTERS; index += 1) {
      await request(server())
        .post('/api/monsters')
        .set(auth)
        .send({ name: `Monster ${index}`, dna: DNA })
        .expect(201);
    }
    await request(server())
      .post('/api/monsters')
      .set(auth)
      .send({ name: 'One too many', dna: DNA })
      .expect(400);
  });

  it('reports the world runner in the health payload', async () => {
    const response = await request(server()).get('/api/health').expect(200);
    const body = response.body as {
      status: string;
      worldRunner: { ownsWorld: boolean; tick: number; mode: string };
    };
    expect(body.status).toBe('ok');
    expect(body.worldRunner.ownsWorld).toBe(true);
    expect(body.worldRunner.mode).toBe('running');
    expect(body.worldRunner.tick).toBeGreaterThanOrEqual(0);
  });
});
