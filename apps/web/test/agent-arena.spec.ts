import { describe, expect, it } from "vitest";
import {
  DEFAULT_MONSTER_DNA,
  EDIBLES,
  encodeMonsterDna,
  type NetEntity,
} from "@monsters/game-core";
import {
  observeArena,
  scoreAgentArena,
  startAgentArena,
} from "@/lib/agent/arena";
import { readInput, type ControlState } from "@/components/game/player-monster";

function entity(id: string, overrides: Partial<NetEntity> = {}): NetEntity {
  return {
    id,
    name: id,
    dna: encodeMonsterDna(DEFAULT_MONSTER_DNA),
    x: 0,
    y: 0,
    z: 0,
    yaw: 0,
    health: 100,
    energy: 100,
    age: 60,
    alive: true,
    intent: "wander",
    loco: "land",
    owner: null,
    controlled: false,
    generation: 0,
    ...overrides,
  };
}

function controls(): ControlState {
  return {
    keys: new Set(),
    move: { x: 0, y: 0 },
    look: { x: 0, y: 0 },
    cameraYaw: 0.4,
    cameraPitch: 0.3,
    action: null,
    actionStarted: 0,
    paused: false,
    energy: 100,
    health: 100,
    isDead: false,
    moving: false,
    sprinting: false,
    locomotionMode: "land",
    playerPosition: { x: 0, y: 0, z: 0 },
    agent: {
      enabled: true,
      commandId: 1,
      forward: 1,
      strafe: -0.5,
      turn: 0,
      sprint: true,
      heading: 1.2,
      label: "exploring",
    },
  };
}

describe("agent arena", () => {
  it("calculates a lineage-aware domination score", () => {
    const arena = {
      ...startAgentArena("agent", 1, 100),
      lineageIds: ["agent", "child"],
      foodConsumed: 3,
      fightsWon: 2,
      offspring: 1,
      maxGeneration: 3,
    };
    const score = scoreAgentArena(arena, 220, {
      living: 4,
      eggs: 0,
      births: 1,
      deaths: 0,
    });

    expect(score).toMatchObject({
      survivalSeconds: 120,
      foodConsumed: 3,
      fightsWon: 2,
      offspring: 1,
      generations: 2,
      lineageAlive: 2,
      populationShare: 0.5,
      dominationScore: 833,
    });
  });

  it("returns useful nearby state sorted by distance", () => {
    const food = EDIBLES[0];
    const self = entity("agent", { x: food.x, z: food.z });
    const wild = entity("wild", { x: food.x + 1, z: food.z });
    const arena = startAgentArena("agent", 0, 0);
    const observation = observeArena({
      self,
      selfDna: DEFAULT_MONSTER_DNA,
      entities: [
        { net: self, dna: DEFAULT_MONSTER_DNA },
        { net: wild, dna: { ...DEFAULT_MONSTER_DNA, diet: "carnivore" } },
      ],
      depletedResources: new Set(),
      population: { living: 2, eggs: 0, births: 0, deaths: 0 },
      eggs: 0,
      worldName: "Monster Island",
      worldTime: 12,
      arena,
    });

    expect(observation.nearbyMonsters[0]).toMatchObject({
      id: "wild",
      distance: 1,
      diet: "carnivore",
    });
    expect(observation.nearbyFood[0].distance).toBe(0);
    expect(observation.scorecard.survivalSeconds).toBe(12);
  });

  it("lets human movement temporarily override a visiting agent", () => {
    const state = controls();
    expect(readInput(state)).toMatchObject({
      forward: 1,
      strafe: -0.5,
      heading: 1.2,
      sprint: true,
    });

    state.keys.add("KeyD");
    expect(readInput(state)).toMatchObject({
      forward: 0,
      strafe: 1,
      heading: 0.4,
      sprint: false,
    });
  });
});
