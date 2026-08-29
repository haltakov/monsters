import { describe, expect, it } from "vitest";
import { accumulate, createAccumulator } from "../src/sim/accumulator";
import { TICK_SECONDS } from "../src/sim/constants";
import { canMonsterSwim } from "../src/dna/dna";
import {
  createInitialWildPopulation,
  createWorldState,
  stepWorld,
} from "../src/sim/engine";
import { cloneWorldState, serializeWorldState } from "../src/sim/snapshot";
import type { SimCommand } from "../src/sim/types";
import { input, SEED } from "./helpers";

function scriptedCommands(tick: number): SimCommand[] {
  if (tick === 5) {
    return [{ type: "action", entityId: "wild-1", action: "eat" }];
  }
  if (tick % 7 === 0) {
    return [
      {
        type: "input",
        entityId: "wild-2",
        input: input(tick, { forward: 1, heading: 0.4 }),
      },
    ];
  }
  return [];
}

describe("deterministic simulation", () => {
  it("creates varied terrestrial-only reset populations", () => {
    const population = createInitialWildPopulation(918273, 100, "reset:", {
      terrestrialOnly: true,
    });

    expect(population).toHaveLength(100);
    expect(
      new Set(population.map((entity) => entity.dna.body)).size,
    ).toBeGreaterThan(3);
    expect(
      new Set(population.map((entity) => entity.dna.color)).size,
    ).toBeGreaterThan(8);
    expect(
      population.every(
        (entity) =>
          entity.locomotion === "land" &&
          entity.dna.breathing === "lungs" &&
          entity.dna.body !== "aquatic" &&
          entity.dna.body !== "avian" &&
          entity.dna.adaptation !== "fins" &&
          entity.dna.adaptation !== "wings" &&
          entity.dna.legShape !== "flippers" &&
          entity.dna.tail !== "fin" &&
          entity.dna.pattern !== "rings" &&
          entity.dna.horns !== "buds" &&
          !canMonsterSwim(entity.dna),
      ),
    ).toBe(true);
  });

  it("produces identical snapshots and events for the same seed and inputs", () => {
    const first = createWorldState({ seed: SEED });
    const second = createWorldState({ seed: SEED });
    const firstEvents = [];
    const secondEvents = [];

    for (let tick = 0; tick < 240; tick += 1) {
      firstEvents.push(
        ...stepWorld(first, TICK_SECONDS, scriptedCommands(tick)),
      );
      secondEvents.push(
        ...stepWorld(second, TICK_SECONDS, scriptedCommands(tick)),
      );
    }

    expect(serializeWorldState(second)).toEqual(serializeWorldState(first));
    expect(secondEvents).toEqual(firstEvents);
  });

  it("diverges for a different seed", () => {
    const first = createWorldState({ seed: SEED });
    const second = createWorldState({ seed: SEED + 1 });
    for (let tick = 0; tick < 60; tick += 1) {
      stepWorld(first, TICK_SECONDS);
      stepWorld(second, TICK_SECONDS);
    }
    expect(serializeWorldState(second)).not.toEqual(serializeWorldState(first));
  });

  it("is unaffected by how elapsed frame time is chunked", () => {
    const oneChunk = createAccumulator();
    const manyChunks = createAccumulator();

    const single = createWorldState({ seed: SEED });
    const chunked = createWorldState({ seed: SEED });

    const runTicks = (
      state: ReturnType<typeof createWorldState>,
      ticks: number,
    ) => {
      for (let index = 0; index < ticks; index += 1) {
        stepWorld(state, TICK_SECONDS);
      }
    };

    runTicks(single, accumulate(oneChunk, 1));
    for (const chunk of [0.017, 0.033, 0.05, 0.21, 0.09, 0.3, 0.3]) {
      runTicks(chunked, accumulate(manyChunks, chunk));
    }

    expect(single.tick).toBe(10);
    expect(chunked.tick).toBe(10);
    expect(serializeWorldState(chunked)).toEqual(serializeWorldState(single));
  });

  it("caps a single update so a stalled process cannot replay forever", () => {
    const accumulator = createAccumulator();
    expect(accumulate(accumulator, 600, 20)).toBe(20);
    expect(accumulator.dropped).toBeGreaterThan(5900);
    expect(accumulator.pending).toBe(0);
  });

  it("clones without sharing mutable references", () => {
    const state = createWorldState({ seed: SEED });
    const copy = cloneWorldState(state);
    stepWorld(state, TICK_SECONDS);
    expect(copy.tick).toBe(0);
    expect(state.tick).toBe(1);
  });
});
