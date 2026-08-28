import { describe, expect, it } from "vitest";
import { encodeMonsterDna } from "../src/dna/dna";
import {
  applyNetEntityPatch,
  diffNetEntity,
  INTEREST_RADIUS,
  isWithinInterest,
  readPopulation,
  toNetEgg,
  toNetEntity,
} from "../src/protocol/net";
import { createWorldState } from "../src/sim/engine";
import { makeEntity, run, SEED } from "./helpers";

describe("network protocol", () => {
  it("carries the deterministic DNA string for every entity", () => {
    const entity = makeEntity("wild-1", { x: 1.23456, health: 87.65 });
    const net = toNetEntity(entity);
    expect(net.dna).toBe(encodeMonsterDna(entity.dna));
    expect(net.x).toBe(1.23);
    expect(net.health).toBe(87.7);
  });

  it("emits only changed fields and nothing for an unchanged entity", () => {
    const entity = makeEntity("wild-1");
    const first = toNetEntity(entity);
    expect(diffNetEntity(undefined, first)).toEqual(first);
    expect(diffNetEntity(first, toNetEntity(entity))).toBeNull();

    entity.x = 5;
    entity.health = 40;
    const patch = diffNetEntity(first, toNetEntity(entity));
    expect(patch).toEqual({ id: "wild-1", x: 5, health: 40 });
    expect(applyNetEntityPatch(first, patch!)).toEqual(toNetEntity(entity));
  });

  it("filters entities by interest radius around the controlled monster", () => {
    const center = { x: 0, z: 0 };
    expect(isWithinInterest({ x: 10, z: 10 }, center)).toBe(true);
    expect(isWithinInterest({ x: INTEREST_RADIUS + 5, z: 0 }, center)).toBe(false);
    expect(isWithinInterest({ x: 9999, z: 0 }, null)).toBe(true);
  });

  it("reports the population counters used by the HUD", () => {
    const state = createWorldState({ seed: SEED });
    run(state, 20);
    const population = readPopulation(state);
    expect(population.living).toBe(
      state.entities.filter((entity) => entity.alive).length,
    );
    expect(population.eggs).toBe(state.eggs.length);
  });

  it("serializes eggs compactly", () => {
    const egg = toNetEgg({
      id: "egg-1",
      dna: makeEntity("x").dna,
      parentIds: ["a", "b"],
      parentNames: ["A", "B"],
      generation: 1,
      x: 1.111,
      y: 0.222,
      z: 3.333,
      laidAt: 1.55,
      hatchAt: 31.55,
      mutations: 2,
    });
    expect(egg).toEqual({
      id: "egg-1",
      x: 1.11,
      y: 0.22,
      z: 3.33,
      laidAt: 1.6,
      hatchAt: 31.6,
    });
  });
});
