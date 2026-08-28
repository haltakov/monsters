import { describe, expect, it } from "vitest";
import { TICK_SECONDS } from "../src/sim/constants";
import { createWorldState, stepWorld } from "../src/sim/engine";
import { EDIBLES } from "../src/world/resources";
import { emptyWorld, makeEntity, makePlayer, run, SEED, withDna } from "./helpers";

const tree = EDIBLES[0];

describe("AI objective selection", () => {
  it("forages when hungry", () => {
    const state = emptyWorld();
    const grazer = makeEntity("grazer", {
      x: tree.x,
      z: tree.z + 20,
      energy: 18,
      mateCooldownUntil: 9999,
    });
    state.entities.push(grazer);
    const distanceBefore = Math.hypot(grazer.x - tree.x, grazer.z - tree.z);

    run(state, 20);

    expect(grazer.intent).toBe("forage");
    expect(Math.hypot(grazer.x - tree.x, grazer.z - tree.z)).toBeLessThan(
      distanceBefore,
    );
  });

  it("flees a stronger carnivore", () => {
    const state = emptyWorld();
    const prey = makeEntity("prey", {
      x: 0,
      z: 0,
      energy: 100,
      health: 40,
      mateCooldownUntil: 9999,
      dna: withDna({ diet: "herbivore", size: "small" }),
    });
    const hunter = makeEntity("hunter", {
      x: 6,
      z: 0,
      energy: 30,
      mateCooldownUntil: 9999,
      dna: withDna({ diet: "carnivore", size: "huge", mouth: "fangs" }),
    });
    state.entities.push(prey, hunter);

    run(state, 10);

    expect(prey.intent).toBe("flee");
    expect(Math.hypot(prey.x - hunter.x, prey.z - hunter.z)).toBeGreaterThan(6);
  });

  it("hunts when a carnivore is hungry and the target is weaker", () => {
    const state = emptyWorld();
    const hunter = makeEntity("hunter", {
      x: -10,
      z: 0,
      energy: 40,
      mateCooldownUntil: 9999,
      dna: withDna({ diet: "carnivore", size: "large", mouth: "fangs" }),
    });
    const target = makeEntity("target", {
      x: -22,
      z: 0,
      mateCooldownUntil: 9999,
      dna: withDna({ diet: "herbivore", size: "tiny" }),
    });
    state.entities.push(hunter, target);

    run(state, 15);
    expect(["hunt", "defend"]).toContain(hunter.intent);
    // The hunter chases toward its prey while the prey runs away.
    expect(hunter.x).toBeLessThan(-10);
    expect(target.x).toBeLessThan(-22);
  });

  it("keeps solitary monsters apart and pulls pack monsters together", () => {
    const solitary = emptyWorld();
    const loner = makeEntity("loner", {
      x: 0,
      z: 0,
      mateCooldownUntil: 9999,
      dna: withDna({ social: "solitary" }),
    });
    const neighbour = makeEntity("neighbour", {
      x: 3,
      z: 0,
      mateCooldownUntil: 9999,
      dna: withDna({ social: "solitary" }),
    });
    solitary.entities.push(loner, neighbour);
    run(solitary, 20);
    expect(Math.hypot(loner.x - neighbour.x, loner.z - neighbour.z)).toBeGreaterThan(3);

    const pack = emptyWorld();
    const first = makeEntity("first", {
      x: 0,
      z: 0,
      mateCooldownUntil: 9999,
      dna: withDna({ social: "pack" }),
    });
    const second = makeEntity("second", {
      x: 30,
      z: 0,
      mateCooldownUntil: 9999,
      dna: withDna({ social: "pack" }),
    });
    pack.entities.push(first, second);
    run(pack, 30);
    expect(Math.hypot(first.x - second.x, first.z - second.z)).toBeLessThan(30);
  });

  it("returns a disconnected player monster to AI control after the grace period", () => {
    const state = emptyWorld();
    state.settings.controlGraceSeconds = 2;
    const player = makePlayer("p1", { x: 0, z: 0, energy: 20 });
    state.entities.push(player);

    stepWorld(state, TICK_SECONDS, [
      { type: "detach", entityId: "p1", connectionId: "socket-p1" },
    ]);
    expect(player.controllerId).toBe("socket-p1");
    expect(player.controlExpiresAt).toBeCloseTo(state.time + 2, 5);

    run(state, 25);
    expect(player.controllerId).toBeNull();

    const positionBefore = { x: player.x, z: player.z };
    run(state, 30);
    expect(
      Math.hypot(player.x - positionBefore.x, player.z - positionBefore.z),
    ).toBeGreaterThan(0.5);
    expect(player.ownerGuestId).toBe("guest-p1");
  });

  it("keeps the seeded world alive and moving without any players", () => {
    const state = createWorldState({ seed: SEED });
    const before = state.entities.map((entity) => ({ x: entity.x, z: entity.z }));
    run(state, 100);
    const moved = state.entities.filter(
      (entity, index) =>
        before[index] &&
        Math.hypot(entity.x - before[index].x, entity.z - before[index].z) > 0.5,
    );
    expect(state.entities.length).toBeGreaterThanOrEqual(10);
    expect(moved.length).toBeGreaterThan(5);
  });
});
