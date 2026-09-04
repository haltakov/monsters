import { beforeEach, describe, expect, it, vi } from "vitest";
import { io } from "socket.io-client";
import {
  DEFAULT_MONSTER_DNA,
  encodeMonsterDna,
  type NetEntity,
  type WorldDeltaMessage,
  type WorldSnapshotMessage,
} from "@monsters/game-core";

vi.mock("socket.io-client", () => ({
  io: vi.fn(() => ({
    on: vi.fn(),
    emit: vi.fn(),
    close: vi.fn(),
    removeAllListeners: vi.fn(),
  })),
}));

const { WorldConnection } = await import("@/lib/net/world-connection");

const DNA = encodeMonsterDna(DEFAULT_MONSTER_DNA);

function netEntity(id: string, overrides: Partial<NetEntity> = {}): NetEntity {
  return {
    id,
    name: id,
    dna: DNA,
    x: 0,
    y: 0,
    z: 0,
    yaw: 0,
    health: 100,
    energy: 100,
    age: 60,
    alive: true,
    intent: "wander",
    loco: "land",
    owner: null,
    controlled: false,
    generation: 0,
    ...overrides,
  };
}

function snapshot(
  overrides: Partial<WorldSnapshotMessage> = {},
): WorldSnapshotMessage {
  return {
    protocolVersion: 1,
    worldId: "world-1",
    worldName: "Monster Island",
    tick: 10,
    time: 1,
    serverTime: 1000,
    tickRate: 10,
    you: {
      guestId: "guest-1",
      entityId: "me",
      connectionId: "socket-1",
      isController: true,
    },
    entities: [netEntity("me"), netEntity("wild-1", { x: 5 })],
    eggs: [{ id: "egg-1", x: 1, y: 0, z: 1, laidAt: 0, hatchAt: 30 }],
    depletedResources: ["tree-0"],
    population: { living: 2, eggs: 1, births: 0, deaths: 0 },
    ...overrides,
  };
}

function delta(overrides: Partial<WorldDeltaMessage> = {}): WorldDeltaMessage {
  return {
    tick: 11,
    time: 1.1,
    serverTime: 1100,
    upserts: [],
    removed: [],
    eggs: [],
    removedEggs: [],
    resources: { depleted: [], restored: [] },
    events: [],
    population: { living: 2, eggs: 1, births: 0, deaths: 0 },
    ackSeq: 0,
    ...overrides,
  };
}

describe("world connection state mapping", () => {
  let now = 0;
  let connection: InstanceType<typeof WorldConnection>;

  beforeEach(() => {
    now = 0;
    connection = new WorldConnection({ now: () => now });
  });

  it("maps a snapshot into decoded entities, eggs and resources", () => {
    connection.applySnapshot(snapshot());

    expect(connection.worldId).toBe("world-1");
    expect(connection.entityId).toBe("me");
    expect(connection.isController).toBe(true);
    expect(connection.entities.size).toBe(2);
    expect(connection.entities.get("me")?.dna).toEqual(DEFAULT_MONSTER_DNA);
    expect(connection.eggs.has("egg-1")).toBe(true);
    expect(connection.depletedResources.has("tree-0")).toBe(true);
    expect(connection.self?.net.id).toBe("me");
  });

  it("never queues gameplay commands during an outage or before control is granted", () => {
    const handlers = new Map<string, (...args: unknown[]) => void>();
    const socket = {
      connected: false,
      on: vi.fn((name: string, handler: (...args: unknown[]) => void) =>
        handlers.set(name, handler),
      ),
      emit: vi.fn(),
      close: vi.fn(),
      removeAllListeners: vi.fn(),
    };
    vi.mocked(io).mockReturnValueOnce(
      socket as unknown as ReturnType<typeof io>,
    );
    connection.connect("token");
    connection.applySnapshot(snapshot());
    const act = () => {
      connection.sendInput({
        seq: 1,
        forward: 1,
        strafe: 0,
        turn: 0,
        heading: 0,
        sprint: false,
      });
      connection.sendAction("attack");
      connection.sendLocomotion("fly");
      connection.respondToPair("request", true);
      connection.acknowledge(10);
    };
    act();
    expect(socket.emit).not.toHaveBeenCalled();
    socket.connected = true;
    act();
    expect(socket.emit).toHaveBeenCalledTimes(5);
    socket.emit.mockClear();
    handlers.get("disconnect")!("transport close");
    expect(connection.isController).toBe(false);
    socket.connected = false;
    act();
    socket.connected = true;
    connection.sendAction("attack");
    expect(socket.emit).not.toHaveBeenCalled();
    connection.disconnect();
  });

  it("invalidates cached roster and authority when explicitly disconnected", () => {
    connection.applySnapshot(snapshot());
    const previousRoster = connection.getRoster();
    const listener = vi.fn();
    connection.on("roster", listener);
    connection.disconnect();
    expect(connection.getRoster()).not.toBe(previousRoster);
    expect(connection.getRoster()).toMatchObject({ entities: [], eggs: [] });
    expect(connection.isController).toBe(false);
    expect(connection.worldId).toBeNull();
    expect(connection.estimateWorldTime()).toBe(0);
    expect(listener).toHaveBeenCalledOnce();
  });

  it("discards the previous season's controller, entities, eggs and depleted resources", () => {
    connection.applySnapshot(snapshot());
    connection.applyDelta(delta({ ackSeq: 99 }));
    connection.applySnapshot(
      snapshot({
        tick: 0,
        time: 0,
        you: {
          guestId: "guest-1",
          entityId: null,
          connectionId: "socket-1",
          isController: false,
        },
        entities: [netEntity("new-season")],
        eggs: [],
        depletedResources: [],
      }),
    );
    expect(connection.entityId).toBeNull();
    expect(connection.isController).toBe(false);
    expect(connection.self).toBeNull();
    expect(connection.ackSeq).toBe(0);
    expect([...connection.entities.keys()]).toEqual(["new-season"]);
    expect(connection.eggs.size).toBe(0);
    expect(connection.depletedResources.size).toBe(0);
  });

  it("applies field-level patches and records interpolation samples", () => {
    connection.applySnapshot(snapshot());
    now = 100;
    connection.applyDelta(delta({ upserts: [{ id: "wild-1", x: 7.5 }] }));

    const wild = connection.entities.get("wild-1")!;
    expect(wild.net.x).toBe(7.5);
    expect(wild.net.name).toBe("wild-1");
    expect(wild.buffer).toHaveLength(2);
    expect(wild.buffer[1]).toMatchObject({ t: 100, x: 7.5 });
  });

  it("re-decodes DNA only when it actually changes", () => {
    connection.applySnapshot(snapshot());
    const before = connection.entities.get("me")!.dna;
    connection.applyDelta(delta({ upserts: [{ id: "me", x: 1 }] }));
    expect(connection.entities.get("me")!.dna).toBe(before);

    const changed = encodeMonsterDna({
      ...DEFAULT_MONSTER_DNA,
      body: "avian",
    });
    connection.applyDelta(delta({ upserts: [{ id: "me", dna: changed }] }));
    expect(connection.entities.get("me")!.dna.body).toBe("avian");
  });

  it("removes entities that leave interest and eggs that hatch", () => {
    connection.applySnapshot(snapshot());
    connection.applyDelta(
      delta({ removed: ["wild-1"], removedEggs: ["egg-1"] }),
    );
    expect(connection.entities.has("wild-1")).toBe(false);
    expect(connection.eggs.size).toBe(0);
  });

  it("tracks resource depletion and regrowth", () => {
    connection.applySnapshot(snapshot());
    connection.applyDelta(
      delta({ resources: { depleted: ["bush-3"], restored: ["tree-0"] } }),
    );
    expect(connection.depletedResources.has("bush-3")).toBe(true);
    expect(connection.depletedResources.has("tree-0")).toBe(false);
  });

  it("only invalidates the roster snapshot when membership changes", () => {
    connection.applySnapshot(snapshot());
    const first = connection.getRoster();
    connection.applyDelta(delta({ upserts: [{ id: "wild-1", x: 3 }] }));
    expect(connection.getRoster()).toBe(first);

    connection.applyDelta(delta({ upserts: [netEntity("wild-2")] }));
    const second = connection.getRoster();
    expect(second).not.toBe(first);
    expect(second.entities).toContain("wild-2");
  });

  it("notifies listeners about events and phase changes", () => {
    const events = vi.fn();
    connection.on("events", events);
    connection.applySnapshot(snapshot());
    connection.applyDelta(
      delta({
        events: [
          {
            type: "death",
            tick: 11,
            entityId: "wild-1",
            name: "wild-1",
            cause: "health",
            killerId: null,
            ownerGuestId: null,
          },
        ],
      }),
    );
    expect(events).toHaveBeenCalledTimes(1);
  });

  it("extrapolates the world clock between messages", () => {
    connection.applySnapshot(snapshot({ time: 42 }));
    now = 500;
    expect(connection.estimateWorldTime()).toBeCloseTo(42.5, 5);
  });
});
