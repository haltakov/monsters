import { describe, expect, it } from "vitest";
import {
  PLAYER_SPRINT_SPEED,
  PLAYER_WALK_SPEED,
  TICK_SECONDS,
  WALK_ENERGY_PER_SECOND,
} from "../src/sim/constants";
import { sanitizeInput, stepWorld } from "../src/sim/engine";
import {
  isBlockedByWater,
  isWaterAt,
  PLAYABLE_RADIUS,
  riverX,
  WORLD_RADIUS,
} from "../src/world/terrain";
import { emptyWorld, input, makePlayer, run, withDna } from "./helpers";

describe("authoritative movement", () => {
  it("moves a walking player at the walk speed and no faster", () => {
    const state = emptyWorld();
    const player = makePlayer("p1", { x: 0, z: 0 });
    state.entities.push(player);

    run(state, 10, (tick) => [
      {
        type: "input",
        entityId: "p1",
        input: input(tick + 1, { forward: 1, heading: 0 }),
      },
    ]);

    const travelled = Math.hypot(player.x, player.z);
    expect(travelled).toBeGreaterThan(PLAYER_WALK_SPEED * 0.9);
    expect(travelled).toBeLessThanOrEqual(PLAYER_WALK_SPEED * 1.001);
  });

  it("caps sprinting at the sprint speed", () => {
    const state = emptyWorld();
    const player = makePlayer("p1", { x: 0, z: 0 });
    state.entities.push(player);

    run(state, 10, (tick) => [
      {
        type: "input",
        entityId: "p1",
        input: input(tick + 1, { forward: 1, heading: 0, sprint: true }),
      },
    ]);

    const travelled = Math.hypot(player.x, player.z);
    expect(travelled).toBeLessThanOrEqual(PLAYER_SPRINT_SPEED * 1.001);
    expect(travelled).toBeGreaterThan(PLAYER_WALK_SPEED);
  });

  it("uses DNA to make agile players faster than heavy ones", () => {
    const state = emptyWorld();
    const agile = makePlayer("agile", {
      x: -20,
      dna: withDna({
        size: "tiny",
        build: "lean",
        legShape: "springy",
      }),
    });
    const heavy = makePlayer("heavy", {
      x: 20,
      dna: withDna({ size: "huge", build: "sturdy", legShape: "stubby" }),
    });
    state.entities.push(agile, heavy);

    run(state, 10, (tick) =>
      [agile, heavy].map((player) => ({
        type: "input" as const,
        entityId: player.id,
        input: input(tick + 1, { forward: 1, heading: 0 }),
      })),
    );

    expect(Math.abs(agile.z)).toBeGreaterThan(Math.abs(heavy.z) * 1.5);
  });

  it("cannot be pushed past the world radius by extreme input", () => {
    const state = emptyWorld();
    const player = makePlayer("p1", { x: PLAYABLE_RADIUS - 3, z: 0 });
    state.entities.push(player);

    run(state, 200, (tick) => [
      {
        type: "input",
        entityId: "p1",
        input: input(tick + 1, {
          forward: 1000,
          strafe: -1000,
          heading: Math.PI,
        }),
      },
    ]);

    expect(Math.hypot(player.x, player.z)).toBeLessThanOrEqual(
      WORLD_RADIUS + 1,
    );
    expect(isWaterAt(player.x, player.z)).toBe(false);
  });

  it("keeps flying players inside the simulated ocean boundary", () => {
    const state = emptyWorld();
    const player = makePlayer("flyer", {
      x: WORLD_RADIUS + 18,
      z: 0,
      locomotion: "fly",
      dna: withDna({ adaptation: "wings" }),
    });
    state.entities.push(player);

    run(state, 100, (tick) => [
      {
        type: "input",
        entityId: player.id,
        input: input(tick + 1, { forward: -1, heading: Math.PI / 2 }),
      },
    ]);

    expect(Math.hypot(player.x, player.z)).toBeLessThanOrEqual(
      WORLD_RADIUS + 22.01,
    );
  });

  it("lets a persisted flyer beyond the boundary travel back inward", () => {
    const state = emptyWorld();
    const player = makePlayer("returning-flyer", {
      x: WORLD_RADIUS + 30,
      z: 0,
      locomotion: "fly",
      dna: withDna({ adaptation: "wings" }),
    });
    const startingRadius = Math.hypot(player.x, player.z);
    state.entities.push(player);

    run(state, 40, (tick) => [
      {
        type: "input",
        entityId: player.id,
        input: input(tick + 1, { forward: 1, heading: Math.PI / 2 }),
      },
    ]);

    expect(Math.hypot(player.x, player.z)).toBeLessThan(startingRadius);
    expect(Math.hypot(player.x, player.z)).toBeLessThanOrEqual(
      WORLD_RADIUS + 22.01,
    );
  });

  it("does not strand a non-swimmer by landing it over deep water", () => {
    const state = emptyWorld();
    const player = makePlayer("flyer", {
      x: PLAYABLE_RADIUS + 5,
      z: 0,
      locomotion: "fly",
      dna: withDna({ adaptation: "wings", breathing: "lungs" }),
    });
    state.entities.push(player);

    stepWorld(state, TICK_SECONDS, [
      { type: "locomotion", entityId: player.id, mode: "land" },
    ]);

    expect(player.locomotion).toBe("fly");
  });

  it("blocks a non-swimmer from entering the river", () => {
    const state = emptyWorld();
    const startZ = 0;
    const player = makePlayer("p1", { x: riverX(startZ) - 3, z: startZ });
    state.entities.push(player);
    const startX = player.x;

    run(state, 60, (tick) => [
      {
        type: "input",
        entityId: "p1",
        // heading π/2 drives movement toward +x
        input: input(tick + 1, { forward: -1, heading: Math.PI / 2 }),
      },
    ]);

    expect(player.x).toBeGreaterThan(startX);
    expect(isWaterAt(player.x, player.z)).toBe(false);
    expect(Math.abs(player.x - riverX(player.z))).toBeGreaterThanOrEqual(1.4);
  });

  it("lets a gilled swimmer cross the river", () => {
    const state = emptyWorld();
    const startZ = 0;
    const player = makePlayer("p1", {
      x: riverX(startZ) - 3,
      z: startZ,
      dna: withDna({ breathing: "gills" }),
    });
    state.entities.push(player);

    run(state, 60, (tick) => [
      {
        type: "input",
        entityId: "p1",
        input: input(tick + 1, { forward: -1, heading: Math.PI / 2 }),
      },
    ]);

    expect(player.x).toBeGreaterThan(riverX(player.z));
  });

  it("agrees with the shared boundary predicate", () => {
    expect(isBlockedByWater(riverX(0), 0, false)).toBe(true);
    expect(isBlockedByWater(riverX(0), 0, true)).toBe(false);
    expect(isBlockedByWater(WORLD_RADIUS + 100, 0, true)).toBe(true);
    // A bridge is walkable even though it crosses the river.
    expect(isBlockedByWater(riverX(-20), -20, false)).toBe(false);
  });

  it("drains energy while walking", () => {
    const state = emptyWorld();
    const player = makePlayer("p1", { x: 0, z: 0, energy: 100 });
    state.entities.push(player);

    run(state, 10, (tick) => [
      {
        type: "input",
        entityId: "p1",
        input: input(tick + 1, { forward: 1, heading: 0 }),
      },
    ]);

    expect(player.energy).toBeCloseTo(100 - WALK_ENERGY_PER_SECOND, 3);
  });

  it("rejects stale and malformed input", () => {
    const state = emptyWorld();
    const player = makePlayer("p1", { x: 0, z: 0 });
    state.entities.push(player);

    stepWorld(state, TICK_SECONDS, [
      { type: "input", entityId: "p1", input: input(10, { forward: 1 }) },
    ]);
    expect(player.lastInputSeq).toBe(10);

    stepWorld(state, TICK_SECONDS, [
      { type: "input", entityId: "p1", input: input(4, { forward: -1 }) },
    ]);
    expect(player.lastInputSeq).toBe(10);
    expect(player.input?.forward).toBe(1);

    const cleaned = sanitizeInput({
      forward: Number.NaN,
      strafe: 42,
      turn: -99,
      heading: Number.POSITIVE_INFINITY,
      sprint: 1 as unknown as boolean,
      seq: -3,
    });
    expect(cleaned).toEqual({
      forward: 0,
      strafe: 1,
      turn: -1,
      heading: 0,
      sprint: true,
      seq: 0,
    });
  });
});
