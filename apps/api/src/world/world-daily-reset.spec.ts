import { canMonsterSwim, getCreatureMaxAge } from '@monsters/game-core';
import {
  createHarness,
  resetDatabaseStandalone,
  waitFor,
  type Harness,
} from '../../test/harness';
import { TestClient } from '../../test/socket-client';
import { GuestService } from '../guest/guest.service';
import { WorldPersistenceService } from './world-persistence.service';
import { nextUtcMidnight } from './daily-reset';

describe('daily world rollover', () => {
  let harness: Harness;

  beforeEach(async () => {
    await resetDatabaseStandalone();
    harness = await createHarness({ runner: true, listen: true });
  });

  afterEach(async () => {
    await harness.close();
  });

  async function makeDue() {
    const due = new Date(Date.now() - 3 * 86400_000);
    await harness.prisma.world.update({
      where: { id: harness.runner.getWorld()!.id },
      data: { nextResetAt: due },
    });
    harness.runner.getWorld()!.nextResetAt = due;
  }

  it('initializes the deadline without resetting the existing population', () => {
    expect(harness.runner.getWorld()!.nextResetAt).toEqual(nextUtcMidnight());
    expect(harness.runner.getState()!.entities).toHaveLength(10);
    expect(harness.runner.getState()!.entities[0].id).not.toContain(':reset-');
  });

  it('resets once, archives ages/history, preserves membership and refreshes connected observers', async () => {
    const { token, guest } = await harness.app.get(GuestService).bootstrap();
    const world = harness.runner.getWorld()!;
    const old = harness.runner.getState()!.entities[0];
    old.age = 3600;
    await harness.prisma.monster.update({
      where: { id: old.id },
      data: { ownerId: guest.id },
    });
    old.ownerGuestId = guest.id;
    await harness.prisma.worldMember.create({
      data: { worldId: world.id, guestId: guest.id, selectedMonsterId: old.id },
    });
    const client = new TestClient(harness.url, token);
    try {
      await client.connected();
      await client.join(old.id);
      expect(client.snapshot?.you.isController).toBe(true);
      const persistence = harness.app.get(WorldPersistenceService);
      const resetSpy = jest.spyOn(persistence, 'resetWorld');
      await makeDue();
      await waitFor(() =>
        client.events.some((event) => event.type === 'worldReset'),
      );
      expect(client.snapshot?.you.entityId).toBeNull();
      expect(client.snapshot?.you.isController).toBe(false);
      expect(client.entities.has(old.id)).toBe(false);
      expect(client.snapshot?.depletedResources).toEqual([]);
      const fresh = harness.runner.getState()!;
      expect(fresh.entities).toHaveLength(10);
      expect(
        fresh.entities.every(
          (entity) =>
            entity.locomotion === 'land' && !canMonsterSwim(entity.dna),
        ),
      ).toBe(true);
      const archived = await harness.prisma.monster.findUniqueOrThrow({
        where: { id: old.id },
      });
      expect(archived.alive).toBe(false);
      expect(archived.ageSeconds).toBeGreaterThanOrEqual(3600);
      expect(archived.ownerId).toBe(guest.id);
      const member = await harness.prisma.worldMember.findUniqueOrThrow({
        where: { worldId_guestId: { worldId: world.id, guestId: guest.id } },
      });
      expect(member.selectedMonsterId).toBeNull();
      expect(
        await harness.prisma.monster.count({ where: { worldId: world.id } }),
      ).toBe(20);
      expect(harness.runner.getWorld()!.nextResetAt).toEqual(nextUtcMidnight());
      await client.waitForDeltas(3);
      expect(resetSpy).toHaveBeenCalledTimes(1);
      resetSpy.mockRestore();
    } finally {
      client.close();
    }
  });

  it('performs a missed reset on startup, but not again after another restart', async () => {
    const old = harness.runner.getState()!.entities[0].id;
    await harness.runner.shutdown();
    await makeDue();
    await harness.close();
    harness = await createHarness({ runner: true, listen: false });
    expect(
      harness.runner.getState()!.entities.some((entity) => entity.id === old),
    ).toBe(false);
    expect(
      await harness.prisma.monster.findUnique({ where: { id: old } }),
    ).toMatchObject({ alive: false });
    const freshId = harness.runner.getState()!.entities[0].id;
    await harness.close();
    harness = await createHarness({ runner: true, listen: false });
    expect(
      harness.runner
        .getState()!
        .entities.some((entity) => entity.id === freshId),
    ).toBe(true);
    expect(
      await harness.prisma.worldEvent.count({ where: { type: 'worldReset' } }),
    ).toBe(1);
  });

  it('resumes ticking after a failed reset and backs off before retrying', async () => {
    const persistence = harness.app.get(WorldPersistenceService);
    const resetSpy = jest
      .spyOn(persistence, 'resetWorld')
      .mockRejectedValueOnce(new Error('temporary database failure'));
    const before = harness.runner.getState()!.tick;
    await makeDue();
    await waitFor(
      () => resetSpy.mock.calls.length === 1 && harness.runner.isRunning,
    );
    await waitFor(() => harness.runner.getState()!.tick > before + 4);
    expect(resetSpy).toHaveBeenCalledTimes(1);
    resetSpy.mockRestore();
  });

  it('persists an old-age death and its final age without requiring low energy', async () => {
    const old = harness.runner.getState()!.entities[0];
    const maxAge = getCreatureMaxAge(old.dna);
    old.age = maxAge - 0.01;
    old.energy = old.health = 100;
    await waitFor(
      async () =>
        !(
          await harness.prisma.monster.findUniqueOrThrow({
            where: { id: old.id },
          })
        ).alive,
    );
    const row = await harness.prisma.monster.findUniqueOrThrow({
      where: { id: old.id },
    });
    expect(row.ageSeconds).toBe(maxAge);
    const event = await harness.prisma.worldEvent.findFirstOrThrow({
      where: { type: 'death' },
    });
    expect(event.payload).toMatchObject({ cause: 'age', ageSeconds: maxAge });
  });
});
