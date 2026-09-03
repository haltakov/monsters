import { describe, expect, it } from "vitest";
import {
  getAgeSpeedMultiplier,
  getCreatureMaxAge,
  getCreatureLifespanHours,
} from "../src/sim/aging";
import {
  applyPlayerMovement,
  stepWorld,
  createWorldState,
} from "../src/sim/engine";
import { catchUpWorld } from "../src/sim/catchup";
import {
  cloneWorldState,
  deserializeWorldState,
  serializeWorldState,
} from "../src/sim/snapshot";
import { emptyWorld, makeEntity, makePlayer, input, withDna } from "./helpers";

describe("DNA lifespan and aging", () => {
  it("has predictable 2–12 hour bounds and meaningful functional variation", () => {
    const small = withDna({
      body: "slug",
      size: "tiny",
      build: "lean",
      diet: "carnivore",
    });
    const tough = withDna({
      body: "rhino",
      size: "huge",
      build: "sturdy",
      diet: "herbivore",
      adaptation: "shell",
    });
    expect(getCreatureLifespanHours(small)).toBe(2);
    expect(getCreatureLifespanHours(tough)).toBe(12);
    expect(
      getCreatureMaxAge({ ...tough, color: "berry", pattern: "spots" }),
    ).toBe(getCreatureMaxAge(tough));
    for (let seed = 1; seed <= 10; seed++) {
      for (const e of createWorldState({
        seed,
        initialPopulation: 100,
        terrestrialOnly: true,
      }).entities) {
        expect(getCreatureLifespanHours(e.dna)).toBeGreaterThanOrEqual(2);
        expect(getCreatureLifespanHours(e.dna)).toBeLessThanOrEqual(12);
      }
    }
  });

  it("eases gradually from full speed at 75% to 40% at the end", () => {
    const dna = withDna({});
    const max = getCreatureMaxAge(dna);
    expect(getAgeSpeedMultiplier(dna, 0)).toBe(1);
    expect(getAgeSpeedMultiplier(dna, max * 0.75)).toBe(1);
    expect(getAgeSpeedMultiplier(dna, max * 0.875)).toBeCloseTo(0.7);
    expect(getAgeSpeedMultiplier(dna, max)).toBeCloseTo(0.4);
    expect(getAgeSpeedMultiplier(dna, max * 2)).toBeCloseTo(0.4);
  });

  it("applies the age multiplier to predicted/player movement", () => {
    const young = makePlayer("young", { input: input(1, { forward: 1 }) });
    const old = {
      ...makePlayer("old", { input: input(1, { forward: 1 }) }),
      age: getCreatureMaxAge(young.dna) * 0.875,
    };
    applyPlayerMovement(young, 0.1);
    applyPlayerMovement(old, 0.1);
    expect(Math.hypot(old.x, old.z) / Math.hypot(young.x, young.z)).toBeCloseTo(
      0.7,
    );
  });

  it("applies the age multiplier to AI movement", () => {
    const state = emptyWorld({
      entities: [makeEntity("wild", { energy: 80, nextDecisionAt: 100 })],
    });
    const old = cloneWorldState(state);
    old.entities[0].age = getCreatureMaxAge(old.entities[0].dna) * 0.875;
    stepWorld(state, 0.1);
    stepWorld(old, 0.1);
    const moved = Math.hypot(state.entities[0].x, state.entities[0].z);
    expect(moved).toBeGreaterThan(0);
    expect(
      Math.hypot(old.entities[0].x, old.entities[0].z) / moved,
    ).toBeCloseTo(0.7, 3);
  });

  it("kills exactly once at maximum age even with full health and energy", () => {
    const entity = makePlayer("elder");
    const max = getCreatureMaxAge(entity.dna);
    entity.age = max - 0.05;
    const state = emptyWorld({ entities: [entity] });
    const events = stepWorld(state, 0.1, [
      { type: "action", entityId: entity.id, action: "attack" },
    ]);
    expect(entity.alive).toBe(false);
    expect(entity.controllerId).toBeNull();
    expect(entity.age).toBe(max);
    expect(events.filter((e) => e.type === "death")).toEqual([
      expect.objectContaining({
        cause: "age",
        killerId: null,
        ageSeconds: max,
      }),
    ]);
    expect(events.some((e) => e.type === "attack")).toBe(false);
    expect(
      stepWorld(state, 0.1).filter((e) => e.type === "death"),
    ).toHaveLength(0);
    expect(entity.age).toBe(max);
  });

  it("keeps age on reload and expires elders across long offline gaps", () => {
    const entity = makeEntity("offline");
    const state = deserializeWorldState(
      serializeWorldState(emptyWorld({ entities: [entity] })),
    );
    expect(state.entities[0].age).toBe(entity.age);
    const result = catchUpWorld(state, 13 * 3600);
    expect(result.truncated).toBe(true);
    expect(result.events).toContainEqual(
      expect.objectContaining({
        type: "death",
        entityId: entity.id,
        cause: "age",
      }),
    );
  });
});
