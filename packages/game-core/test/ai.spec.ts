import { describe, expect, it } from "vitest";
import { TICK_SECONDS } from "../src/sim/constants";
import { createWorldState, stepWorld } from "../src/sim/engine";
import { EDIBLES } from "../src/world/resources";
import { WORLD_RADIUS } from "../src/world/terrain";
import {
  emptyWorld,
  makeEntity,
  makePlayer,
  run,
  SEED,
  withDna,
} from "./helpers";

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

  it("keeps winged AI grounded unless it is actively fleeing", () => {
    const state = emptyWorld();
    const flyer = makeEntity("flyer", {
      x: 0,
      z: 0,
      energy: 90,
      mateCooldownUntil: 9999,
      dna: withDna({
        adaptation: "wings",
        diet: "herbivore",
        size: "small",
      }),
    });
    state.entities.push(flyer);
    run(state, 2);
    expect(flyer.locomotion).toBe("land");

    const threat = makeEntity("threat", {
      x: 5,
      z: 0,
      mateCooldownUntil: 9999,
      dna: withDna({ diet: "carnivore", size: "huge", mouth: "fangs" }),
    });
    state.entities.push(threat);
    run(state, 2);
    expect(flyer.intent).toBe("flee");
    expect(flyer.locomotion).toBe("fly");
  });

  it("keeps a fleeing winged AI inside the simulated ocean boundary", () => {
    const state = emptyWorld();
    const flyer = makeEntity("edge-flyer", {
      x: WORLD_RADIUS + 21,
      z: 0,
      energy: 100,
      health: 20,
      mateCooldownUntil: 9999,
      dna: withDna({
        adaptation: "wings",
        diet: "herbivore",
        social: "solitary",
        size: "tiny",
      }),
    });
    const threat = makePlayer("edge-threat", {
      x: WORLD_RADIUS + 19,
      z: 0,
      dna: withDna({ diet: "carnivore", size: "huge", mouth: "fangs" }),
    });
    state.entities.push(flyer, threat);

    run(state, 30);

    expect(flyer.intent).toBe("flee");
    expect(flyer.locomotion).toBe("fly");
    expect(Math.hypot(flyer.x, flyer.z)).toBeLessThanOrEqual(
      WORLD_RADIUS + 22.01,
    );
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

  it("does not attack or reward an already defeated target twice in one tick", () => {
    const state = emptyWorld();
    const firstHunter = makeEntity("hunter-one", {
      x: -1,
      z: 0,
      energy: 30,
      mateCooldownUntil: 9999,
      dna: withDna({ diet: "carnivore", size: "large", mouth: "fangs" }),
    });
    const secondHunter = makeEntity("hunter-two", {
      x: 1,
      z: 0,
      energy: 30,
      mateCooldownUntil: 9999,
      dna: withDna({ diet: "carnivore", size: "large", mouth: "fangs" }),
    });
    const target = makeEntity("fragile-target", {
      x: 0,
      z: 0,
      health: 1,
      mateCooldownUntil: 9999,
      dna: withDna({ diet: "herbivore", size: "tiny" }),
    });
    state.entities.push(firstHunter, secondHunter, target);

    const events = stepWorld(state, TICK_SECONDS);
    const targetAttacks = events.filter(
      (event) => event.type === "attack" && event.targetId === target.id,
    );

    expect(target.alive).toBe(false);
    expect(targetAttacks).toHaveLength(1);
    expect(
      targetAttacks.filter(
        (event) => event.type === "attack" && event.energyReward > 0,
      ),
    ).toHaveLength(1);
  });

  it("does not let AI initiate mating with a controlled player", () => {
    const state = emptyWorld();
    const wild = makeEntity("wild", { x: 0, z: 0, energy: 100 });
    const player = makePlayer("player", { x: 1, z: 0, energy: 100 });
    state.entities.push(wild, player);

    stepWorld(state, TICK_SECONDS);

    expect(state.eggs).toHaveLength(0);
    expect(player.mateCooldownUntil).toBe(0);
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
    expect(
      Math.hypot(loner.x - neighbour.x, loner.z - neighbour.z),
    ).toBeGreaterThan(3);

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
    const before = state.entities.map((entity) => ({
      x: entity.x,
      z: entity.z,
    }));
    run(state, 100);
    const moved = state.entities.filter(
      (entity, index) =>
        before[index] &&
        Math.hypot(entity.x - before[index].x, entity.z - before[index].z) >
          0.5,
    );
    expect(state.entities.length).toBeGreaterThanOrEqual(10);
    expect(moved.length).toBeGreaterThan(5);
  });
});
