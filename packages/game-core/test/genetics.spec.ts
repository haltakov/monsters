import { describe, expect, it } from "vitest";
import {
  DEFAULT_MONSTER_DNA,
  SMOOTH_HORN_SHAPES,
  SMOOTH_PATTERNS,
  decodeMonsterDna,
  encodeMonsterDna,
} from "../src/dna/dna";
import { createSeededRandom } from "../src/rng";
import {
  ADULT_AGE_SECONDS,
  dnaSimilarity,
  EGG_HATCH_SECONDS,
  MATING_COOLDOWN_SECONDS,
  mixMonsterDna,
} from "../src/sim/genetics";
import { TICK_SECONDS } from "../src/sim/constants";
import { createWorldState, stepWorld } from "../src/sim/engine";
import { emptyWorld, makeEntity, makePlayer, run, withDna } from "./helpers";

describe("genetics", () => {
  it("inherits every gene from one of the two parents apart from mutations", () => {
    const first = withDna({ body: "round", color: "moss", diet: "herbivore" });
    const second = withDna({
      body: "saurian",
      color: "ember",
      diet: "carnivore",
    });
    const { dna, mutations } = mixMonsterDna(
      first,
      second,
      createSeededRandom(1234),
      0,
    );

    expect(mutations).toBe(0);
    for (const key of Object.keys(dna) as Array<keyof typeof dna>) {
      if (key === "mesh") continue;
      expect([first[key], second[key]]).toContain(dna[key]);
    }
    expect(dna.mesh).toBe("smooth");
  });

  it("applies deterministic seeded mutations", () => {
    const parentA = withDna({ body: "round" });
    const parentB = withDna({ body: "bean" });
    const one = mixMonsterDna(parentA, parentB, createSeededRandom(99), 1);
    const two = mixMonsterDna(parentA, parentB, createSeededRandom(99), 1);
    const different = mixMonsterDna(
      parentA,
      parentB,
      createSeededRandom(100),
      1,
    );

    expect(one).toEqual(two);
    expect(one.mutations).toBeGreaterThan(0);
    expect(different.dna).not.toEqual(one.dna);
  });

  it("keeps weak legacy traits out of new organic mutations", () => {
    expect(SMOOTH_PATTERNS).not.toContain("rings");
    expect(SMOOTH_HORN_SHAPES).not.toContain("buds");

    for (let seed = 0; seed < 100; seed += 1) {
      const result = mixMonsterDna(
        withDna({ pattern: "plain", horns: "none" }),
        withDna({ pattern: "spots", horns: "spikes" }),
        createSeededRandom(seed),
        1,
      );
      expect(result.dna.pattern).not.toBe("rings");
      expect(result.dna.horns).not.toBe("buds");
    }
  });

  it("scores identical DNA as fully similar", () => {
    expect(dnaSimilarity(DEFAULT_MONSTER_DNA, DEFAULT_MONSTER_DNA)).toBe(1);
    expect(
      dnaSimilarity(
        DEFAULT_MONSTER_DNA,
        withDna({ body: "aquatic", diet: "carnivore" }),
      ),
    ).toBeLessThan(1);
  });

  it("round-trips DNA through the versioned codec", () => {
    const dna = withDna({
      body: "avian",
      mouth: "grin",
      pattern: "saddle",
      horns: "crown",
      ears: "long-ear",
      adaptation: "spines",
      color: "jade",
      accent: "copper",
    });
    expect(decodeMonsterDna(encodeMonsterDna(dna))).toEqual(dna);
    expect(
      decodeMonsterDna(
        encodeMonsterDna(dna).replace("mesh=smooth", "mesh=classic"),
      ).mesh,
    ).toBe("smooth");
    expect(() => decodeMonsterDna("M9;body=round")).toThrow();
  });
});

describe("pairing and eggs", () => {
  it.each(["player", "wild"])(
    "requires a mature %s initiator and a mature partner",
    (kind) => {
      const state = emptyWorld();
      const first = (kind === "player" ? makePlayer : makeEntity)("first", {
        x: 0,
        z: 0,
        age: ADULT_AGE_SECONDS - 1,
      });
      const second = makeEntity("second", { x: 1, z: 0 });
      state.entities.push(first, second);
      const commands =
        kind === "player"
          ? [
              {
                type: "action" as const,
                entityId: first.id,
                action: "pair" as const,
              },
            ]
          : [];
      const rejected = stepWorld(state, TICK_SECONDS, commands);
      expect(state.eggs).toHaveLength(0);
      if (kind === "player")
        expect(rejected).toContainEqual(
          expect.objectContaining({ type: "pairFailed", reason: "notReady" }),
        );
      first.age = ADULT_AGE_SECONDS;
      second.age = ADULT_AGE_SECONDS - 1;
      stepWorld(state, TICK_SECONDS, commands);
      expect(state.eggs).toHaveLength(0);
      second.age = ADULT_AGE_SECONDS;
      stepWorld(state, TICK_SECONDS, commands);
      expect(state.eggs).toHaveLength(1);
    },
  );

  it("prevents either parent from breeding with a fresh partner until recovery ends", () => {
    const state = emptyWorld();
    const first = makePlayer("first", { x: 0, z: 0 });
    const second = makeEntity("second", { x: 1, z: 0 });
    state.entities.push(first, second);
    stepWorld(state, TICK_SECONDS, [
      { type: "action", entityId: first.id, action: "pair" },
    ]);
    const recoveryAt = first.mateCooldownUntil;
    expect(recoveryAt - state.time).toBe(20 * 60);
    state.entities.push(makeEntity("fresh", { x: 2, z: 0 }));
    state.time = recoveryAt - 1;
    const denied = stepWorld(
      state,
      TICK_SECONDS,
      [first, second].map((parent) => ({
        type: "action" as const,
        entityId: parent.id,
        action: "pair" as const,
      })),
    );
    expect(denied.filter((event) => event.type === "egg")).toHaveLength(0);
    expect(
      denied.filter(
        (event) => event.type === "pairFailed" && event.reason === "cooldown",
      ),
    ).toHaveLength(2);
    state.time = recoveryAt;
    first.energy = second.energy = 100;
    first.x = second.x - 1;
    first.z = second.z;
    const accepted = stepWorld(state, TICK_SECONDS, [
      { type: "action", entityId: first.id, action: "pair" },
    ]);
    expect(accepted.filter((event) => event.type === "egg")).toHaveLength(1);
  });

  it("cannot grow the ten-monster starting population beyond fifteen in its first fifteen minutes", () => {
    const state = createWorldState({ seed: 42 });
    run(state, (15 * 60) / TICK_SECONDS);
    expect(state.stats.births + state.eggs.length).toBeLessThanOrEqual(5);
    expect(
      state.entities.filter((entity) => entity.alive).length +
        state.eggs.length,
    ).toBeLessThanOrEqual(15);
  });

  it("refuses to pair while a cooldown is active and when too far away", () => {
    const state = emptyWorld();
    const player = makePlayer("p1", { x: 0, z: 0, mateCooldownUntil: 50 });
    const partner = makeEntity("wild", { x: 1, z: 0 });
    state.entities.push(player, partner);

    let events = stepWorld(state, TICK_SECONDS, [
      { type: "action", entityId: "p1", action: "pair" },
    ]);
    expect(
      events.some(
        (event) => event.type === "pairFailed" && event.reason === "cooldown",
      ),
    ).toBe(true);

    player.mateCooldownUntil = 0;
    partner.x = 12;
    events = stepWorld(state, TICK_SECONDS, [
      { type: "action", entityId: "p1", action: "pair" },
    ]);
    expect(
      events.some(
        (event) => event.type === "pairFailed" && event.reason === "tooFar",
      ),
    ).toBe(true);

    partner.x = 1;
    partner.energy = 10;
    events = stepWorld(state, TICK_SECONDS, [
      { type: "action", entityId: "p1", action: "pair" },
    ]);
    expect(
      events.some(
        (event) => event.type === "pairFailed" && event.reason === "noPartner",
      ),
    ).toBe(true);
  });

  it("lays an egg with a ready AI partner and starts both cooldowns", () => {
    const state = emptyWorld();
    const player = makePlayer("p1", { x: 0, z: 0 });
    const partner = makeEntity("wild", { x: 1, z: 0 });
    state.entities.push(player, partner);

    const events = stepWorld(state, TICK_SECONDS, [
      { type: "action", entityId: "p1", action: "pair" },
    ]);

    expect(state.eggs).toHaveLength(1);
    expect(events.some((event) => event.type === "egg")).toBe(true);
    expect(player.mateCooldownUntil).toBeCloseTo(
      state.time + MATING_COOLDOWN_SECONDS,
      5,
    );
    expect(partner.mateCooldownUntil).toBeCloseTo(
      state.time + MATING_COOLDOWN_SECONDS,
      5,
    );
  });

  it("requires explicit acceptance between two controlled players", () => {
    const state = emptyWorld();
    const first = makePlayer("p1", { x: 0, z: 0 });
    const second = makePlayer("p2", { x: 2, z: 0 });
    state.entities.push(first, second);

    const requested = stepWorld(state, TICK_SECONDS, [
      { type: "action", entityId: "p1", action: "pair" },
    ]);
    const request = requested.find((event) => event.type === "pairRequested");
    if (request?.type !== "pairRequested") throw new Error("no pair request");
    expect(state.eggs).toHaveLength(0);

    const rejected = stepWorld(state, TICK_SECONDS, [
      {
        type: "pairRespond",
        requestId: request.requestId,
        accept: false,
      },
    ]);
    expect(
      rejected.some(
        (event) =>
          event.type === "pairResolved" && event.outcome === "rejected",
      ),
    ).toBe(true);
    expect(state.eggs).toHaveLength(0);

    const retry = stepWorld(state, TICK_SECONDS, [
      { type: "action", entityId: "p1", action: "pair" },
    ]).find((event) => event.type === "pairRequested");
    if (retry?.type !== "pairRequested") throw new Error("no pair request");
    const accepted = stepWorld(state, TICK_SECONDS, [
      { type: "pairRespond", requestId: retry.requestId, accept: true },
    ]);
    expect(
      accepted.some(
        (event) =>
          event.type === "pairResolved" && event.outcome === "accepted",
      ),
    ).toBe(true);
    expect(state.eggs).toHaveLength(1);
  });

  it("expires an unanswered player pairing request", () => {
    const state = emptyWorld();
    state.entities.push(
      makePlayer("p1", { x: 0, z: 0 }),
      makePlayer("p2", { x: 2, z: 0 }),
    );

    stepWorld(state, TICK_SECONDS, [
      { type: "action", entityId: "p1", action: "pair" },
    ]);
    expect(state.pairRequests).toHaveLength(1);

    run(state, 205);
    expect(state.pairRequests).toHaveLength(0);
    expect(state.eggs).toHaveLength(0);
  });

  it("hatches an egg into a juvenile that grows into an adult", () => {
    const state = emptyWorld();
    const player = makePlayer("p1", { x: -10, z: 0 });
    const partner = makeEntity("wild", { x: -9, z: 0, mateCooldownUntil: 0 });
    state.entities.push(player, partner);

    stepWorld(state, TICK_SECONDS, [
      { type: "action", entityId: "p1", action: "pair" },
    ]);
    const egg = state.eggs[0];
    expect(egg.hatchAt).toBeCloseTo(egg.laidAt + EGG_HATCH_SECONDS, 5);

    run(state, EGG_HATCH_SECONDS * 10 + 2);
    expect(state.eggs).toHaveLength(0);
    const baby = state.entities.find((entity) => entity.id.startsWith("baby-"));
    expect(baby).toBeDefined();
    expect(baby!.generation).toBe(egg.generation);
    expect(baby!.parentIds).toEqual(egg.parentIds);
    expect(baby!.age).toBeLessThan(ADULT_AGE_SECONDS);
    expect(state.stats.births).toBe(1);

    run(state, ADULT_AGE_SECONDS * 10 + 5);
    expect(baby!.age).toBeGreaterThanOrEqual(ADULT_AGE_SECONDS);
  });

  it("keeps a due egg queued until population capacity is available", () => {
    const state = emptyWorld();
    const parent = makePlayer("parent", { x: 0, z: 0 });
    state.entities.push(parent);
    state.settings.maxPopulation = 1;
    state.eggs.push({
      id: "waiting-egg",
      dna: { ...DEFAULT_MONSTER_DNA },
      parentIds: ["parent-a", "parent-b"],
      parentNames: ["Parent A", "Parent B"],
      generation: 1,
      x: 2,
      y: 0,
      z: 2,
      laidAt: 0,
      hatchAt: 0,
      mutations: 0,
    });

    let events = stepWorld(state, TICK_SECONDS);
    expect(state.eggs.map((egg) => egg.id)).toEqual(["waiting-egg"]);
    expect(events.some((event) => event.type === "birth")).toBe(false);

    parent.alive = false;
    parent.health = 0;
    events = stepWorld(state, TICK_SECONDS);
    expect(state.eggs).toHaveLength(0);
    expect(events.some((event) => event.type === "birth")).toBe(true);
    expect(state.stats.births).toBe(1);
  });
});
