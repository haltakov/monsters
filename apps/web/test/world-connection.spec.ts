import { beforeEach, describe, expect, it, vi } from "vitest";
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
