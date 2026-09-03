import { describe, expect, it } from "vitest";
import { killWorldMonster, stepWorld } from "../src/sim/engine";
import { emptyWorld, makeEntity, makePlayer, input } from "./helpers";

describe("keeper death", () => {
  it("kills wild or player-controlled creatures without changing their DNA or ancestry", () => {
    for (const entity of [
      makeEntity("wild"),
      makePlayer("player", {
        input: input(1, { forward: 1 }),
        parentIds: ["a", "b"],
      }),
    ]) {
      const state = emptyWorld({ entities: [entity, makeEntity("untouched")] });
      const dna = { ...entity.dna };
      const parentIds = entity.parentIds;
      const events = killWorldMonster(state, entity.id, "keeper");
      expect(entity).toMatchObject({
        alive: false,
        health: 0,
        controllerId: null,
        input: null,
        deathAt: state.time,
        dna,
        parentIds,
      });
      expect(state.entities[1].alive).toBe(true);
      expect(events).toContainEqual(
        expect.objectContaining({
          type: "death",
          entityId: entity.id,
          cause: "admin",
          adminUserId: "keeper",
          killerId: null,
        }),
      );
      expect(killWorldMonster(state, entity.id, "keeper")).toEqual([]);
      expect(state.stats.deaths).toBe(1);
      stepWorld(state, 0.1, [
        { type: "action", entityId: entity.id, action: "eat" },
      ]);
      expect(entity.alive).toBe(false);
    }
  });

  it("does nothing for a missing creature", () => {
    const state = emptyWorld();
    expect(killWorldMonster(state, "missing", "keeper")).toEqual([]);
    expect(state.stats.deaths).toBe(0);
  });
});
