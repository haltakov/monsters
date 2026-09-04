import {
  createHarness,
  resetDatabaseStandalone,
  waitFor,
  type Harness,
} from '../../test/harness';
import { WorldPersistenceService } from './world-persistence.service';

describe('critical event recovery', () => {
  let harness: Harness;
  beforeEach(async () => {
    await resetDatabaseStandalone();
    harness = await createHarness({ runner: true, listen: false });
  });
  afterEach(async () => {
    jest.restoreAllMocks();
    await harness.close();
  });

  it('pauses on a failed lifecycle write, retries it, and publishes only after persistence', async () => {
    const persistence = harness.app.get(WorldPersistenceService);
    const original = persistence.commitCriticalEvents.bind(persistence);
    let available = false;
    const save = jest
      .spyOn(persistence, 'commitCriticalEvents')
      .mockImplementation(async (...args) => {
        if (!available) throw new Error('temporary database failure');
        return original(...args);
      });
    const state = harness.runner.getState()!;
    const victim = state.entities[0];
    victim.energy = 0;
    const observed = jest.fn();
    harness.runner.onPublish(observed);
    await waitFor(() => save.mock.calls.length > 0);
    const pausedTick = state.tick;
    expect(harness.runner.isRunning).toBe(false);
    expect(observed).not.toHaveBeenCalled();
    expect(
      (
        await harness.prisma.monster.findUniqueOrThrow({
          where: { id: victim.id },
        })
      ).alive,
    ).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(state.tick).toBe(pausedTick);
    available = true;
    await waitFor(() => harness.runner.isRunning);
    expect(observed).toHaveBeenCalled();
    expect(
      (
        await harness.prisma.monster.findUniqueOrThrow({
          where: { id: victim.id },
        })
      ).alive,
    ).toBe(false);
    expect(
      await harness.prisma.worldEvent.count({ where: { type: 'death' } }),
    ).toBe(1);
    expect(save.mock.calls[0][4]).toBe(save.mock.calls[1][4]);
  });

  it('deduplicates the event log if a committed transaction response is lost', async () => {
    const persistence = harness.app.get(WorldPersistenceService);
    const original = persistence.commitCriticalEvents.bind(persistence);
    const save = jest
      .spyOn(persistence, 'commitCriticalEvents')
      .mockImplementationOnce(async (...args) => {
        await original(...args);
        throw new Error('connection dropped after commit');
      });
    const victim = harness.runner.getState()!.entities[0];
    victim.energy = 0;
    await waitFor(
      () => save.mock.calls.length >= 2 && harness.runner.isRunning,
    );
    expect(
      await harness.prisma.worldEvent.count({ where: { type: 'death' } }),
    ).toBe(1);
    expect(
      (
        await harness.prisma.monster.findUniqueOrThrow({
          where: { id: victim.id },
        })
      ).alive,
    ).toBe(false);
  });

  it('shuts down during an outage without saving a checkpoint that skips the failed death', async () => {
    const persistence = harness.app.get(WorldPersistenceService);
    const checkpoint = await persistence.loadCheckpoint(
      harness.runner.getWorld()!.id,
    );
    jest
      .spyOn(persistence, 'commitCriticalEvents')
      .mockRejectedValue(new Error('offline'));
    harness.runner.getState()!.entities[0].energy = 0;
    await waitFor(() => !harness.runner.isRunning);
    await harness.runner.shutdown();
    expect(
      (await persistence.loadCheckpoint(harness.runner.getWorld()!.id))?.tick,
    ).toBe(checkpoint?.tick);
  });
});
