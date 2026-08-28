import { describe, expect, it } from "vitest";
import { ATTACK_ENERGY_COST, TICK_SECONDS } from "../src/sim/constants";
import { stepWorld } from "../src/sim/engine";
import { getCreaturePower } from "../src/sim/genetics";
import { EDIBLES, EDIBLE_REGROW_SECONDS, PREY } from "../src/world/resources";
import { emptyWorld, makeEntity, makePlayer, run, withDna } from "./helpers";

const tree = EDIBLES.find((edible) => edible.kind === "tree")!;
const bush = EDIBLES.find((edible) => edible.kind === "bush")!;

describe("energy, feeding and health", () => {
  it("restores energy from a nearby tree and depletes it until it regrows", () => {
    const state = emptyWorld();
    const player = makePlayer("p1", { x: tree.x, z: tree.z, energy: 20 });
    state.entities.push(player);

    stepWorld(state, TICK_SECONDS, [
      { type: "action", entityId: "p1", action: "eat" },
    ]);

    expect(player.energy).toBeCloseTo(20 + tree.energy, 3);
    expect(state.depletedResources[tree.id]).toBeCloseTo(
      state.time + EDIBLE_REGROW_SECONDS,
      3,
    );

    run(state, 10);
    const events = stepWorld(state, TICK_SECONDS, [
      { type: "action", entityId: "p1", action: "eat" },
    ]);
    expect(
      events.some(
        (event) => event.type === "feedFailed" && event.reason === "noResource",
      ),
    ).toBe(true);

    state.time += EDIBLE_REGROW_SECONDS;
    stepWorld(state, TICK_SECONDS);
    expect(state.depletedResources[tree.id]).toBeUndefined();
  });

  it("halves plant energy for omnivores and refuses carnivores", () => {
    const state = emptyWorld();
    const omnivore = makePlayer("omni", {
      x: bush.x,
      z: bush.z,
      energy: 10,
      dna: withDna({ diet: "omnivore" }),
    });
    const carnivore = makePlayer("carn", {
      x: tree.x,
      z: tree.z,
      energy: 10,
      dna: withDna({ diet: "carnivore" }),
    });
    state.entities.push(omnivore, carnivore);

    const events = stepWorld(state, TICK_SECONDS, [
      { type: "action", entityId: "omni", action: "eat" },
      { type: "action", entityId: "carn", action: "eat" },
    ]);

    expect(omnivore.energy).toBeCloseTo(10 + bush.energy * 0.7, 3);
    expect(carnivore.energy).toBe(10);
    expect(
      events.some(
        (event) => event.type === "feedFailed" && event.reason === "diet",
      ),
    ).toBe(true);
  });

  it("charges the attack cost and damages a wild monster", () => {
    const state = emptyWorld();
    const attacker = makePlayer("p1", { x: 0, z: 0, energy: 100 });
    const target = makeEntity("wild", {
      x: 1,
      z: 0,
      health: 100,
      mateCooldownUntil: 9999,
    });
    state.entities.push(attacker, target);

    const events = stepWorld(state, TICK_SECONDS, [
      { type: "action", entityId: "p1", action: "attack" },
    ]);

    const expectedDamage = 7.5 + getCreaturePower(attacker.dna) * 5.2;
    expect(attacker.energy).toBeCloseTo(100 - ATTACK_ENERGY_COST, 3);
    expect(target.health).toBeCloseTo(100 - expectedDamage, 3);
    expect(events.some((event) => event.type === "attack")).toBe(true);
  });

  it("never damages another actively controlled player monster", () => {
    const state = emptyWorld();
    const attacker = makePlayer("p1", { x: 0, z: 0 });
    const victim = makePlayer("p2", { x: 1, z: 0, health: 100 });
    state.entities.push(attacker, victim);

    const events = stepWorld(state, TICK_SECONDS, [
      { type: "action", entityId: "p1", action: "attack" },
    ]);

    expect(victim.health).toBe(100);
    expect(
      events.some(
        (event) =>
          event.type === "attackMissed" && event.reason === "playerProtected",
      ),
    ).toBe(true);
  });

  it("lets a player hunt an offline monster once its controller is gone", () => {
    const state = emptyWorld();
    const attacker = makePlayer("p1", { x: 0, z: 0 });
    const offline = makePlayer("p2", {
      x: 1,
      z: 0,
      health: 100,
      controllerId: null,
    });
    state.entities.push(attacker, offline);

    stepWorld(state, TICK_SECONDS, [
      { type: "action", entityId: "p1", action: "attack" },
    ]);
    expect(offline.health).toBeLessThan(100);
  });

  it("feeds a carnivore that catches a critter", () => {
    const prey = PREY[0];
    const state = emptyWorld();
    const hunter = makePlayer("p1", {
      x: prey.x,
      z: prey.z,
      energy: 40,
      dna: withDna({ diet: "carnivore" }),
    });
    state.entities.push(hunter);

    stepWorld(state, TICK_SECONDS, [
      { type: "action", entityId: "p1", action: "attack" },
    ]);

    expect(hunter.energy).toBeCloseTo(40 - ATTACK_ENERGY_COST + 45, 3);
    expect(state.depletedResources[prey.id]).toBeGreaterThan(0);
  });

  it("kills a monster that runs out of energy and records the death", () => {
    const state = emptyWorld();
    const player = makePlayer("p1", { energy: 3 });
    state.entities.push(player);

    const events = stepWorld(state, TICK_SECONDS, [
      { type: "action", entityId: "p1", action: "attack" },
    ]);

    expect(player.alive).toBe(false);
    expect(state.stats.deaths).toBe(1);
    expect(
      events.some((event) => event.type === "death" && event.cause === "energy"),
    ).toBe(true);
  });

  it("regenerates health faster at high energy and only after a pause", () => {
    const state = emptyWorld();
    const hurt = makePlayer("hurt", { health: 50, energy: 100 });
    const justHit = makePlayer("hit", {
      health: 50,
      energy: 100,
      lastAttackedAt: 0,
    });
    const tired = makePlayer("tired", { health: 50, energy: 10 });
    state.entities.push(hurt, justHit, tired);
    state.time = 0;

    stepWorld(state, TICK_SECONDS);
    expect(justHit.health).toBe(50);

    run(state, 60);
    expect(hurt.health).toBeGreaterThan(tired.health);
    expect(justHit.health).toBeGreaterThan(50);
  });

  it("stops accepting actions once the monster is dead", () => {
    const state = emptyWorld();
    const dead = makePlayer("p1", { alive: false, deathAt: 0, health: 0 });
    const target = makeEntity("wild", { x: 1, z: 0 });
    state.entities.push(dead, target);

    stepWorld(state, TICK_SECONDS, [
      { type: "action", entityId: "p1", action: "attack" },
      { type: "input", entityId: "p1", input: { forward: 1, strafe: 0, turn: 0, heading: 0, sprint: true, seq: 1 } },
    ]);

    expect(target.health).toBe(100);
    expect(dead.x).toBe(0);
  });
});
