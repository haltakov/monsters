import { describe, expect, it } from "vitest";
import { catchUpWorld } from "../src/sim/catchup";
import {
  COARSE_CATCHUP_DT,
  MAX_COARSE_CATCHUP_STEPS,
  TICK_SECONDS,
} from "../src/sim/constants";
import { createWorldState, stepWorld } from "../src/sim/engine";
import {
  deserializeWorldState,
  serializeWorldState,
  SnapshotShapeError,
  SnapshotVersionError,
  WORLD_STATE_VERSION,
} from "../src/sim/snapshot";
import { makePlayer, run, SEED } from "./helpers";

describe("snapshot serialization", () => {
  it("round-trips a live world through JSON", () => {
    const state = createWorldState({ seed: SEED });
    run(state, 50);
    const serialized = JSON.parse(JSON.stringify(serializeWorldState(state)));
    const restored = deserializeWorldState(serialized);

    expect(restored.tick).toBe(state.tick);
    expect(restored.entities).toHaveLength(state.entities.length);
    expect(serializeWorldState(restored)).toEqual(serializeWorldState(state));
  });

  it("continues deterministically from a restored snapshot", () => {
    const original = createWorldState({ seed: SEED });
    run(original, 40);
    const restored = deserializeWorldState(
      JSON.parse(JSON.stringify(serializeWorldState(original))),
    );

    run(original, 60);
    run(restored, 60);
    expect(serializeWorldState(restored)).toEqual(serializeWorldState(original));
  });

  it("drops live control when a snapshot is restored", () => {
    const state = createWorldState({ seed: SEED });
    state.entities.push(makePlayer("p1"));
    const restored = deserializeWorldState(
      JSON.parse(JSON.stringify(serializeWorldState(state))),
    );
    const player = restored.entities.find((entity) => entity.id === "p1")!;
    expect(player.controllerId).toBeNull();
    expect(player.ownerGuestId).toBe("guest-p1");
  });

  it("rejects unsupported snapshot versions and corrupt shapes", () => {
    const state = createWorldState({ seed: SEED });
    const future = { ...(serializeWorldState(state) as object), version: 99 };
    expect(() => deserializeWorldState(future)).toThrow(SnapshotVersionError);

    const past = { ...(serializeWorldState(state) as object), version: 0 };
    expect(() => deserializeWorldState(past)).toThrow(SnapshotVersionError);

    expect(() => deserializeWorldState({ version: WORLD_STATE_VERSION })).toThrow(
      SnapshotShapeError,
    );
    expect(() => deserializeWorldState(null)).toThrow(SnapshotShapeError);
  });
});

describe("offline catch-up", () => {
  it("does nothing for a negligible gap", () => {
    const state = createWorldState({ seed: SEED });
    const result = catchUpWorld(state, 0.05);
    expect(result.mode).toBe("none");
    expect(state.tick).toBe(0);
  });

  it("replays a short gap at the fixed tick rate", () => {
    const state = createWorldState({ seed: SEED });
    const result = catchUpWorld(state, 2);
    expect(result.mode).toBe("fine");
    expect(state.tick).toBe(2 / TICK_SECONDS);
  });

  it("uses bounded coarse steps for a long outage", () => {
    const state = createWorldState({ seed: SEED });
    const result = catchUpWorld(state, 48 * 3600);

    expect(result.mode).toBe("coarse");
    expect(result.truncated).toBe(true);
    expect(result.steps).toBe(MAX_COARSE_CATCHUP_STEPS);
    expect(state.time).toBeCloseTo(
      MAX_COARSE_CATCHUP_STEPS * COARSE_CATCHUP_DT,
      5,
    );
  });

  it("is deterministic for the same checkpoint and elapsed time", () => {
    const first = createWorldState({ seed: SEED });
    const second = createWorldState({ seed: SEED });
    const firstResult = catchUpWorld(first, 900);
    const secondResult = catchUpWorld(second, 900);

    expect(serializeWorldState(second)).toEqual(serializeWorldState(first));
    expect(secondResult.events).toEqual(firstResult.events);
    expect(firstResult.events.length).toBeGreaterThan(0);
  });

  it("keeps the ecosystem running through downtime", () => {
    const state = createWorldState({ seed: SEED });
    catchUpWorld(state, 600);
    expect(state.stats.births + state.stats.deaths).toBeGreaterThan(0);
    expect(state.entities.some((entity) => entity.alive)).toBe(true);
    // Ordinary ticking still works afterwards.
    const before = state.tick;
    stepWorld(state, TICK_SECONDS);
    expect(state.tick).toBe(before + 1);
  });
});
