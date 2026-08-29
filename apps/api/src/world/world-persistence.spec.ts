import { canMonsterSwim, type SimEvent } from '@monsters/game-core';
import {
  createHarness,
  resetDatabaseStandalone,
  waitFor,
  type Harness,
} from '../../test/harness';
import { WorldPersistenceService } from './world-persistence.service';
import { PUBLIC_WORLD_SLUG } from '../config/app-config';

describe('world persistence', () => {
  let harness: Harness;
  let persistence: WorldPersistenceService;

  beforeAll(async () => {
    await resetDatabaseStandalone();
    harness = await createHarness({ runner: true, listen: false });
    persistence = harness.app.get(WorldPersistenceService);
  });

  afterAll(async () => {
    await harness.close();
  });

  it('writes durable rows for every seeded wild monster', async () => {
    const world = harness.runner.getWorld()!;
    const monsters = await harness.prisma.monster.findMany({
      where: { worldId: world.id, ownerId: null },
    });
    expect(monsters.length).toBeGreaterThanOrEqual(10);
    expect(monsters.every((row) => row.id.startsWith(`${world.slug}:`))).toBe(
      true,
    );
    const storedDna = monsters[0].dna as { code?: unknown };
    expect(typeof storedDna.code).toBe('string');
  });

  it('checkpoints and reloads the exact simulation state', async () => {
    const world = harness.runner.getWorld()!;
    const state = harness.runner.getState()!;
    const at = new Date();
    await persistence.checkpoint(world, state, at);

    const loaded = await persistence.loadCheckpoint(world.id);
    expect(loaded).not.toBeNull();
    expect(loaded!.state.tick).toBe(state.tick);
    expect(loaded!.state.entities).toHaveLength(state.entities.length);

    const worldRow = await harness.prisma.world.findUnique({
      where: { id: world.id },
    });
    expect(worldRow?.currentTick).toBe(state.tick);
  });

  it('captures checkpoint state before waiting in the write queue', async () => {
    const world = harness.runner.getWorld()!;
    const source = structuredClone(harness.runner.getState()!);
    const expectedTick = source.tick;
    const expectedEnergy = source.entities[0].energy;

    const pending = persistence.checkpoint(world, source, new Date());
    source.tick += 10_000;
    source.entities[0].energy = 0;
    await pending;

    const loaded = await persistence.loadCheckpoint(world.id);
    expect(loaded!.state.tick).toBe(expectedTick);
    expect(loaded!.state.entities[0].energy).toBe(expectedEnergy);
  });

  it('commits a birth as one atomic row, event and snapshot write', async () => {
    const world = harness.runner.getWorld()!;
    const state = harness.runner.getState()!;
    const entity = state.entities[0];
    const birth: SimEvent = {
      type: 'birth',
      tick: state.tick,
      eggId: 'egg-test',
      entityId: entity.id,
      name: entity.name,
      generation: entity.generation,
      parentIds: ['a', 'b'],
      mutations: 2,
    };
    await persistence.commitCriticalEvents(world, state, [birth], new Date());

    const events = await harness.prisma.worldEvent.findMany({
      where: { worldId: world.id, type: 'birth' },
    });
    expect(events).toHaveLength(1);
    const snapshot = await harness.prisma.worldSnapshot.findUnique({
      where: { worldId: world.id },
    });
    expect(snapshot?.tick).toBe(state.tick);
  });

  it('marks a monster dead in the same transaction as its death event', async () => {
    const world = harness.runner.getWorld()!;
    const state = harness.runner.getState()!;
    const entity = state.entities[1];
    await persistence.commitCriticalEvents(
      world,
      state,
      [
        {
          type: 'death',
          tick: state.tick,
          entityId: entity.id,
          name: entity.name,
          cause: 'health',
          killerId: null,
          ownerGuestId: null,
        },
      ],
      new Date(),
    );

    const row = await harness.prisma.monster.findUnique({
      where: { id: entity.id },
    });
    expect(row?.alive).toBe(false);
    expect(row?.diedAt).not.toBeNull();
  });

  it('transactionally resets and reseeds a terrestrial-only world', async () => {
    const world = harness.runner.getWorld()!;
    const oldMonsterId = harness.runner.getState()!.entities[0].id;
    const guest = await harness.prisma.guestPlayer.create({
      data: {
        tokenHash: 'reset-test-token-hash',
        displayName: 'Reset tester',
      },
    });
    await harness.prisma.worldMember.create({
      data: {
        worldId: world.id,
        guestId: guest.id,
        selectedMonsterId: oldMonsterId,
      },
    });

    const result = await harness.runner.resetWorld({
      initialPopulation: 14,
      terrestrialOnly: true,
    });

    expect(result.population).toBe(14);
    expect(result.terrestrialOnly).toBe(true);
    const state = harness.runner.getState()!;
    expect(state.entities).toHaveLength(14);
    expect(state.entities.some((entity) => entity.id === oldMonsterId)).toBe(
      false,
    );
    expect(
      state.entities.every(
        (entity) =>
          entity.locomotion === 'land' &&
          entity.dna.breathing === 'lungs' &&
          entity.dna.body !== 'aquatic' &&
          entity.dna.body !== 'avian' &&
          entity.dna.adaptation !== 'wings' &&
          !canMonsterSwim(entity.dna),
      ),
    ).toBe(true);

    const [storedMonsters, member, events, snapshot, storedWorld] =
      await Promise.all([
        harness.prisma.monster.findMany({ where: { worldId: world.id } }),
        harness.prisma.worldMember.findUnique({
          where: {
            worldId_guestId: { worldId: world.id, guestId: guest.id },
          },
        }),
        harness.prisma.worldEvent.findMany({ where: { worldId: world.id } }),
        harness.prisma.worldSnapshot.findUnique({
          where: { worldId: world.id },
        }),
        harness.prisma.world.findUnique({ where: { id: world.id } }),
      ]);
    expect(storedMonsters).toHaveLength(14);
    expect(
      storedMonsters.every((monster) => monster.originType === 'wild'),
    ).toBe(true);
    expect(member?.selectedMonsterId).toBeNull();
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('worldReset');
    expect(snapshot?.tick).toBe(0);
    expect(storedWorld?.seed).toBe(result.seed);
  });

  it('keeps advancing the world after a simulated restart', async () => {
    const world = harness.runner.getWorld()!;
    const before = harness.runner.getState()!.tick;
    await waitFor(() => harness.runner.getState()!.tick > before + 5);
    await harness.runner.shutdown();

    const stored = await persistence.loadCheckpoint(world.id);
    expect(stored!.tick).toBeGreaterThanOrEqual(before);

    // A fresh process picks the world up from the checkpoint and keeps going.
    const restarted = await createHarness({ runner: true, listen: false });
    try {
      await waitFor(
        () => (restarted.runner.getState()?.tick ?? 0) > stored!.tick,
      );
      expect(restarted.runner.getStatus().ownsWorld).toBe(true);
      expect(restarted.runner.getWorld()?.slug).toBe(PUBLIC_WORLD_SLUG);
    } finally {
      await restarted.close();
    }
  });

  it('rejects a snapshot written by a newer build', async () => {
    const world = harness.runner.getWorld()!;
    await harness.prisma.worldSnapshot.update({
      where: { worldId: world.id },
      data: { state: { version: 99, entities: [] } },
    });
    await expect(persistence.loadCheckpoint(world.id)).rejects.toThrow(
      /Unsupported world snapshot version/,
    );
  });
});
