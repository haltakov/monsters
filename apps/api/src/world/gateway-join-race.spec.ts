import { createWorldState } from '@monsters/game-core';
import { WorldGateway } from './world.gateway';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function fixture() {
  const state = createWorldState({ seed: 1, initialPopulation: 0 });
  const runner = {
    getState: () => state,
    getWorld: () => ({ id: 'world', name: 'Test' }),
    isRunning: true,
    waitForPendingCommit: async () => {},
    enqueue: jest.fn(),
    setConnectionCount: jest.fn(),
  };
  const worlds = {
    resolveControllableMonster: jest.fn(),
    buildSpawnCommand: (monster: { id: string }) => ({
      type: 'spawn',
      entity: monster,
    }),
  };
  const gateway = new WorldGateway(
    {} as never,
    runner as never,
    worlds as never,
  );
  const socket = {
    id: 'socket',
    connected: true,
    data: { guestId: 'guest' },
    emit: jest.fn(),
    join: jest.fn(),
    disconnect: jest.fn(),
  };
  gateway.handleConnection(socket as never);
  return { gateway, runner, worlds, socket };
}

describe('pending websocket joins', () => {
  it.each(['leave', 'disconnect'] as const)(
    'does not attach after a %s during the ownership lookup',
    async (action) => {
      const { gateway, runner, worlds, socket } = fixture();
      const lookup = deferred<{ id: string }>();
      worlds.resolveControllableMonster.mockReturnValue(lookup.promise);
      const joining = gateway.onJoin(socket as never, { monsterId: 'target' });
      if (action === 'leave') gateway.onLeave(socket as never);
      else {
        socket.connected = false;
        gateway.handleDisconnect(socket as never);
      }
      lookup.resolve({ id: 'target' });
      await joining;
      expect(runner.enqueue).not.toHaveBeenCalled();
      expect(socket.emit).not.toHaveBeenCalled();
    },
  );

  it('keeps the newest requested monster when lookups finish out of order', async () => {
    const { gateway, runner, worlds, socket } = fixture();
    const old = deferred<{ id: string }>();
    worlds.resolveControllableMonster
      .mockReturnValueOnce(old.promise)
      .mockResolvedValueOnce({ id: 'new' });
    const first = gateway.onJoin(socket as never, { monsterId: 'old' });
    await gateway.onJoin(socket as never, { monsterId: 'new' });
    old.resolve({ id: 'old' });
    await first;
    expect(
      runner.enqueue.mock.calls
        .map(([command]: [{ type: string; entityId?: string }]) => command)
        .filter((command) => command.type === 'attach'),
    ).toEqual([{ type: 'attach', entityId: 'new', connectionId: 'socket' }]);
  });

  it('does not attach against a world that changed during the lookup', async () => {
    const { gateway, runner, worlds, socket } = fixture();
    const lookup = deferred<{ id: string }>();
    worlds.resolveControllableMonster.mockReturnValue(lookup.promise);
    const joining = gateway.onJoin(socket as never, { monsterId: 'target' });
    runner.isRunning = false;
    lookup.resolve({ id: 'target' });
    await joining;
    expect(runner.enqueue).not.toHaveBeenCalled();
    expect(socket.emit).toHaveBeenCalledWith(
      'world:error',
      expect.objectContaining({ code: 'worldUnavailable' }),
    );
  });
});
