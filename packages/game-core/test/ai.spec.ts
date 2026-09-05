import { describe, expect, it } from "vitest";
import { TICK_SECONDS } from "../src/sim/constants";
import { createWorldState, stepWorld } from "../src/sim/engine";
import { EDIBLES } from "../src/world/resources";
import { normalizeAngle } from "../src/mathx";
import { isWaterAt, riverX, OCEAN_RADIUS } from "../src/world/terrain";
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
  it("follows a wandering heading for several seconds and turns along an arc", () => {
    const state = emptyWorld();
    const walker = makeEntity("walker", {
      x: -40,
      z: 0,
      yaw: 0,
      wanderAngle: Math.PI,
      mateCooldownUntil: 9999,
    });
    state.entities.push(walker);
    stepWorld(state, TICK_SECONDS);
    const plannedAngle = walker.wanderAngle;
    const decisionAt = walker.nextDecisionAt;
    expect(decisionAt - state.time).toBeGreaterThanOrEqual(5);
    for (let tick = 0; tick < 40; tick++) {
      const before = { x: walker.x, z: walker.z, yaw: walker.yaw };
      stepWorld(state, TICK_SECONDS);
      expect(walker.wanderAngle).toBe(plannedAngle);
      expect(walker.nextDecisionAt).toBe(decisionAt);
      expect(
        Math.abs(normalizeAngle(walker.yaw - before.yaw)),
      ).toBeLessThanOrEqual(0.120001);
      const dx = walker.x - before.x;
      const dz = walker.z - before.z;
      expect(Math.hypot(dx, dz)).toBeGreaterThan(0);
      expect(normalizeAngle(Math.atan2(-dx, -dz) - walker.yaw)).toBeCloseTo(
        0,
        6,
      );
    }
  });

  it("keeps a food target when a closer resource becomes available, and replaces depleted food", () => {
    const state = emptyWorld();
    const grazer = makeEntity("grazer", {
      x: tree.x,
      z: tree.z + 8,
      energy: 40,
      mateCooldownUntil: 9999,
    });
    for (const food of EDIBLES) state.depletedResources[food.id] = 9999;
    delete state.depletedResources[tree.id];
    state.entities.push(grazer);
    stepWorld(state, TICK_SECONDS);
    expect(grazer.targetId).toBe(tree.id);
    const closer = EDIBLES.find(
      (food) =>
        food.id !== tree.id &&
        Math.hypot(food.x - tree.x, food.z - tree.z) > 6 &&
        Math.hypot(food.x - tree.x, food.z - tree.z) < 45,
    )!;
    grazer.x = closer.x;
    grazer.z = closer.z + 3;
    // Keep the original target within sensing range while making the new one closer.
    const original = EDIBLES.find((food) => food.id === grazer.targetId)!;
    expect(
      Math.hypot(original.x - grazer.x, original.z - grazer.z),
    ).toBeLessThan(52);
    delete state.depletedResources[closer.id];
    stepWorld(state, TICK_SECONDS);
    expect(grazer.intent).toBe("forage");
    expect(grazer.targetId).toBe(tree.id);
    state.depletedResources[tree.id] = 9999;
    stepWorld(state, TICK_SECONDS);
    expect(grazer.targetId).toBe(closer.id);
  });

  it("keeps a valid goal despite a competing social attraction", () => {
    const state = emptyWorld();
    const walker = makeEntity("walker", {
      x: -40,
      z: 0,
      mateCooldownUntil: 9999,
    });
    state.entities.push(walker);
    stepWorld(state, TICK_SECONDS);
    const decisionAt = walker.nextDecisionAt;
    state.entities.push(makePlayer("friend", { x: -10, z: 0 }));
    run(state, 30);
    expect(walker.intent).toBe("wander");
    expect(walker.nextDecisionAt).toBe(decisionAt);
  });

  it.each(["medium", "tiny"] as const)(
    "turns a %s monster away from a river bank without getting stuck",
    (size) => {
      const state = emptyWorld();
      const walker = makeEntity("walker", {
        dna: withDna({ size, build: "lean", legShape: "springy" }),
        x: riverX(0) - 4,
        z: 0,
        yaw: -Math.PI / 2,
        wanderAngle: 0,
        nextDecisionAt: 100,
        mateCooldownUntil: 9999,
      });
      const start = { x: walker.x, z: walker.z };
      state.entities.push(walker);
      for (let tick = 0; tick < 120; tick++) {
        const yaw = walker.yaw;
        stepWorld(state, TICK_SECONDS);
        expect(isWaterAt(walker.x, walker.z)).toBe(false);
        expect(Math.abs(normalizeAngle(walker.yaw - yaw))).toBeLessThanOrEqual(
          0.120001,
        );
      }
      expect(
        Math.hypot(walker.x - start.x, walker.z - start.z),
      ).toBeGreaterThan(5);
    },
  );

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

  it("lets healthy winged AI cruise and react to a nearby threat", () => {
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
    expect(flyer.locomotion).toBe("fly");

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
      x: OCEAN_RADIUS - 1,
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
      x: OCEAN_RADIUS - 3,
      z: 0,
      y: 8,
      locomotion: "fly",
      dna: withDna({
        diet: "carnivore",
        size: "huge",
        mouth: "fangs",
        adaptation: "wings",
      }),
    });
    state.entities.push(flyer, threat);

    run(state, 30);

    expect(flyer.intent).toBe("flee");
    expect(flyer.locomotion).toBe("fly");
    expect(Math.hypot(flyer.x, flyer.z)).toBeLessThanOrEqual(
      OCEAN_RADIUS + 0.01,
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
