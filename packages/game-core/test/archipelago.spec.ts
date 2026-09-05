import { describe, expect, it } from "vitest";
import {
  applyPlayerMovement,
  createWorldState,
  stepWorld,
  sanitizeInput,
} from "../src/sim/engine";
import {
  cloneWorldState,
  deserializeWorldState,
  serializeWorldState,
} from "../src/sim/snapshot";
import {
  FLIGHT_CEILING,
  ISLANDS,
  OCEAN_RADIUS,
  SEA_LEVEL,
  isWaterAt,
  isDeepWaterAt,
  isBlockedByWater,
  swimmingFloor,
  terrainHeight,
} from "../src/world/terrain";
import { FISH, KELP, EDIBLES, resourceHeight } from "../src/world/resources";
import { canMonsterSwim } from "../src/dna/dna";
import {
  emptyWorld,
  input,
  makeEntity,
  makePlayer,
  run,
  withDna,
} from "./helpers";

const swimmerDna = withDna({
  body: "aquatic",
  adaptation: "fins",
  breathing: "gills",
  diet: "herbivore",
});

describe("archipelago and vertical movement", () => {
  it("has three separate islands with distinct terrain and sea-only gaps", () => {
    const [home, lakes, peaks] = ISLANDS;
    expect(terrainHeight(peaks.x - 24, peaks.z + 16)).toBeGreaterThan(25);
    expect(isDeepWaterAt(lakes.x - 28, lakes.z + 18)).toBe(true);
    expect(terrainHeight(home.x - 8, home.z + 8)).toBeGreaterThan(SEA_LEVEL);
    for (let i = 0; i < ISLANDS.length; i++)
      for (let j = i + 1; j < ISLANDS.length; j++) {
        const first = ISLANDS[i],
          second = ISLANDS[j];
        expect(
          Math.hypot(first.x - second.x, first.z - second.z) -
            first.radius -
            second.radius,
        ).toBeGreaterThan(90);
        // A direct route may pass the third island, but must cross open water.
        const samples = Array.from({ length: 19 }, (_, index) => {
          const t = (index + 1) / 20;
          return {
            x: first.x + (second.x - first.x) * t,
            z: first.z + (second.z - first.z) * t,
          };
        });
        expect(samples.some(({ x, z }) => isBlockedByWater(x, z, false))).toBe(
          true,
        );
        expect(samples.every(({ x, z }) => !isBlockedByWater(x, z, true))).toBe(
          true,
        );
      }
    expect(isBlockedByWater(OCEAN_RADIUS + 1, 0, true)).toBe(true);
  });

  it("changes swimming depth continuously, holds it on release, and clamps at the floor and surface", () => {
    const player = makePlayer("diver", {
      x: 160,
      z: 0,
      y: SEA_LEVEL - 0.9,
      locomotion: "swim",
      dna: swimmerDna,
    });
    player.input = input(1, { vertical: -1 });
    applyPlayerMovement(player, 0.1);
    expect(player.locomotion).toBe("dive");
    expect(player.y).toBeCloseTo(SEA_LEVEL - 1.2);
    for (let tick = 0; tick < 25; tick++) applyPlayerMovement(player, 0.1);
    const depth = player.y;
    player.input = input(2);
    for (let tick = 0; tick < 10; tick++) applyPlayerMovement(player, 0.1);
    expect(player.y).toBe(depth);
    player.input = input(3, { vertical: -1 });
    for (let tick = 0; tick < 200; tick++) applyPlayerMovement(player, 0.1);
    expect(player.y).toBe(swimmingFloor(player.x, player.z));
    player.input = input(4, { vertical: 1 });
    for (let tick = 0; tick < 200; tick++) applyPlayerMovement(player, 0.1);
    expect(player.locomotion).toBe("swim");
    expect(player.y).toBeCloseTo(SEA_LEVEL - 0.9);
  });

  it("takes off, holds altitude, reaches the ceiling, and descends to land", () => {
    const flyer = makePlayer("flyer", {
      x: -20,
      z: 0,
      dna: withDna({ adaptation: "wings" }),
    });
    flyer.y = terrainHeight(flyer.x, flyer.z);
    flyer.input = input(1, { vertical: 1 });
    for (let tick = 0; tick < 30; tick++) applyPlayerMovement(flyer, 0.1);
    expect(flyer.locomotion).toBe("fly");
    expect(flyer.y).toBeGreaterThan(18);
    const height = flyer.y;
    flyer.input = input(2);
    applyPlayerMovement(flyer, 0.1);
    expect(flyer.y).toBe(height);
    flyer.input = input(3, { vertical: 1 });
    for (let tick = 0; tick < 150; tick++) applyPlayerMovement(flyer, 0.1);
    expect(flyer.y).toBe(FLIGHT_CEILING);
    flyer.input = input(4, { vertical: -1 });
    for (let tick = 0; tick < 160; tick++) applyPlayerMovement(flyer, 0.1);
    expect(flyer.locomotion).toBe("land");
    expect(flyer.y).toBe(terrainHeight(flyer.x, flyer.z));
  });

  it("ignores vertical movement without the required anatomy and sanitizes old/malformed input", () => {
    const walker = makePlayer("walker", { input: input(1, { vertical: 1 }) });
    applyPlayerMovement(walker, 0.1);
    expect(walker.locomotion).toBe("land");
    expect(sanitizeInput(input(2, { vertical: Infinity })).vertical).toBe(0);
    expect(sanitizeInput(input(3, { vertical: -99 })).vertical).toBe(-1);
    expect(sanitizeInput(input(4)).vertical).toBe(0);
  });

  it("lets a swimmer cross open sea to another island without exhausting its energy", () => {
    const player = makePlayer("traveller", {
      x: -110,
      z: -80,
      y: SEA_LEVEL - 3,
      locomotion: "dive",
      dna: swimmerDna,
    });
    player.input = input(1, { forward: 1, heading: Math.PI / 2 });
    for (let tick = 0; tick < 400 && player.x > -245; tick++)
      applyPlayerMovement(player, 0.1);
    expect(player.x).toBeLessThan(-240);
    expect(isWaterAt(player.x, player.z)).toBe(false);
    expect(player.energy).toBeGreaterThan(60);
    expect(player.locomotion).toBe("land");
  });

  it("provides food underwater and requires the player to reach its depth", () => {
    const food = KELP.find((item) => resourceHeight(item) < -15)!;
    const state = emptyWorld();
    const diver = makePlayer("diver", {
      x: food.x,
      z: food.z,
      y: SEA_LEVEL - 0.9,
      energy: 20,
      locomotion: "swim",
      dna: swimmerDna,
    });
    state.entities.push(diver);
    for (const other of EDIBLES)
      if (other.id !== food.id) state.depletedResources[other.id] = 9999;
    let events = stepWorld(state, 0.1, [
      { type: "action", entityId: diver.id, action: "eat" },
    ]);
    expect(events.some((event) => event.type === "feed")).toBe(false);
    diver.y = resourceHeight(food);
    diver.locomotion = "dive";
    events = stepWorld(state, 0.1, [
      { type: "action", entityId: diver.id, action: "eat" },
    ]);
    expect(events).toContainEqual(
      expect.objectContaining({
        type: "feed",
        resourceId: food.id,
        kind: "kelp",
      }),
    );
    expect(diver.energy).toBeGreaterThan(50);
    expect(state.depletedResources[food.id]).toBeGreaterThan(state.time);
    state.time = state.depletedResources[food.id];
    stepWorld(state, 0.1);
    expect(state.depletedResources[food.id]).toBeUndefined();
  });

  it("lets a submerged carnivore catch fish and keeps targets at other depths safe", () => {
    const fish = FISH.find((item) => resourceHeight(item) < -10)!;
    const hunter = makePlayer("hunter", {
      x: fish.x,
      z: fish.z,
      y: resourceHeight(fish),
      locomotion: "dive",
      energy: 20,
      dna: { ...swimmerDna, diet: "carnivore" },
    });
    const other = makeEntity("surface", {
      x: fish.x,
      z: fish.z,
      y: SEA_LEVEL - 1,
      dna: swimmerDna,
    });
    const state = emptyWorld({ entities: [hunter, other] });
    const events = stepWorld(state, 0.1, [
      { type: "action", entityId: hunter.id, action: "attack" },
    ]);
    expect(events).toContainEqual(
      expect.objectContaining({ type: "feed", resourceId: fish.id }),
    );
    expect(other.health).toBe(100);
  });

  it("lets hungry aquatic wildlife dive to a seaweed bed and feed autonomously", () => {
    const food = KELP.find((item) => resourceHeight(item) < -15)!;
    const wild = makeEntity("grazer", {
      x: food.x,
      z: food.z,
      y: SEA_LEVEL - 1,
      locomotion: "swim",
      energy: 18,
      dna: swimmerDna,
    });
    const state = emptyWorld({ entities: [wild] });
    for (const other of EDIBLES)
      if (other.id !== food.id) state.depletedResources[other.id] = 9999;
    const events = [];
    for (let tick = 0; tick < 140; tick++)
      events.push(...stepWorld(state, 0.1));
    expect(events).toContainEqual(
      expect.objectContaining({
        type: "feed",
        entityId: wild.id,
        resourceId: food.id,
      }),
    );
    expect(wild.y).toBeLessThan(SEA_LEVEL - 2);
    expect(wild.energy).toBeGreaterThan(25);
  });

  it("seeds land, sea, and sky habitats and preserves depth through a snapshot", () => {
    const state = createWorldState({ seed: 42, initialPopulation: 30 });
    expect(
      state.entities.some(
        (entity) => entity.locomotion === "fly" && entity.y > 10,
      ),
    ).toBe(true);
    expect(
      state.entities.some(
        (entity) => entity.locomotion === "dive" && entity.y < SEA_LEVEL - 2,
      ),
    ).toBe(true);
    for (const island of ISLANDS)
      expect(
        state.entities.some(
          (entity) =>
            entity.locomotion === "land" &&
            Math.hypot(entity.x - island.x, entity.z - island.z) <
              island.radius,
        ),
      ).toBe(true);
    const restored = deserializeWorldState(serializeWorldState(state));
    expect(restored.entities.map((entity) => entity.y)).toEqual(
      state.entities.map((entity) => entity.y),
    );
    run(restored, 20);
    expect(
      restored.entities
        .filter((entity) => canMonsterSwim(entity.dna))
        .some((entity) => entity.y < -2),
    ).toBe(true);
  });

  it("upgrades an older world without moving owned monsters or changing wild DNA", () => {
    const old = createWorldState({ seed: 5, terrestrialOnly: true });
    delete old.archipelagoVersion;
    const player = makePlayer("owned", { x: -12, z: 4, y: 3 });
    old.entities.push(player);
    const dna = old.entities.map((entity) => entity.dna);
    const upgraded = deserializeWorldState(serializeWorldState(old));
    expect(upgraded.entities.map((entity) => entity.dna)).toEqual(dna);
    expect(
      upgraded.entities.find((entity) => entity.id === player.id),
    ).toMatchObject({ x: -12, y: 3, z: 4 });
    const again = deserializeWorldState(serializeWorldState(upgraded));
    expect(again).toEqual(upgraded);
    const full = cloneWorldState(upgraded);
    full.settings.maxPopulation = full.entities.length;
    full.tick = 299;
    stepWorld(full, 0.1);
    expect(full.entities.length).toBe(upgraded.entities.length);
  });
});
