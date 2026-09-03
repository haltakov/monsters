import {
  EDIBLES,
  PREY,
  getCreatureLifespanHours,
  getAgeSpeedMultiplier,
  type MonsterDna,
  type NetEntity,
  type WorldPopulation,
} from "@monsters/game-core";

export type AgentArenaStatus = "idle" | "active" | "paused" | "dead" | "ended";

export type AgentArenaState = {
  status: AgentArenaStatus;
  rootEntityId: string | null;
  lineageIds: string[];
  deadLineageIds: string[];
  startedAt: number;
  endedAt: number | null;
  foodConsumed: number;
  energyFromFood: number;
  fightsWon: number;
  offspring: number;
  maxGeneration: number;
  rootGeneration: number;
  lastAction: string;
  coachNote: string;
};

export type DominationScorecard = {
  survivalSeconds: number;
  foodConsumed: number;
  fightsWon: number;
  offspring: number;
  generations: number;
  lineageAlive: number;
  populationShare: number;
  dominationScore: number;
};

export const EMPTY_AGENT_ARENA: AgentArenaState = {
  status: "idle",
  rootEntityId: null,
  lineageIds: [],
  deadLineageIds: [],
  startedAt: 0,
  endedAt: null,
  foodConsumed: 0,
  energyFromFood: 0,
  fightsWon: 0,
  offspring: 0,
  maxGeneration: 0,
  rootGeneration: 0,
  lastAction: "Waiting for a visiting agent",
  coachNote: "Survive, learn the island, and grow your lineage.",
};

export function startAgentArena(
  entityId: string,
  generation: number,
  worldTime: number,
  coachNote = EMPTY_AGENT_ARENA.coachNote,
): AgentArenaState {
  return {
    ...EMPTY_AGENT_ARENA,
    status: "active",
    rootEntityId: entityId,
    lineageIds: [entityId],
    deadLineageIds: [],
    startedAt: worldTime,
    maxGeneration: generation,
    rootGeneration: generation,
    lastAction: "Entered the world",
    coachNote,
  };
}

export function scoreAgentArena(
  arena: AgentArenaState,
  worldTime: number,
  population: WorldPopulation,
): DominationScorecard {
  const end = arena.endedAt ?? worldTime;
  const survivalSeconds =
    arena.status === "idle" ? 0 : Math.max(0, end - arena.startedAt);
  // Birth and death events are global even outside the connection's interest
  // radius, so this remains accurate when descendants roam out of sight.
  const deadLineage = new Set(arena.deadLineageIds);
  const lineageAlive = arena.lineageIds.reduce(
    (total, id) => total + (deadLineage.has(id) ? 0 : 1),
    0,
  );
  const populationShare =
    population.living > 0 ? lineageAlive / population.living : 0;
  const generations = Math.max(0, arena.maxGeneration - arena.rootGeneration);
  const dominationScore =
    Math.floor(survivalSeconds / 10) +
    arena.foodConsumed * 12 +
    arena.fightsWon * 40 +
    arena.offspring * 55 +
    generations * 75 +
    Math.round(populationShare * 1000);

  return {
    survivalSeconds: Math.round(survivalSeconds),
    foodConsumed: arena.foodConsumed,
    fightsWon: arena.fightsWon,
    offspring: arena.offspring,
    generations,
    lineageAlive,
    populationShare: Number(populationShare.toFixed(4)),
    dominationScore,
  };
}

function distance(
  from: { x: number; z: number },
  to: { x: number; z: number },
) {
  return Math.hypot(from.x - to.x, from.z - to.z);
}

export function observeArena(input: {
  self: NetEntity;
  selfDna: MonsterDna;
  entities: Iterable<{ net: NetEntity; dna: MonsterDna }>;
  depletedResources: ReadonlySet<string>;
  population: WorldPopulation;
  eggs: number;
  worldName: string;
  worldTime: number;
  /** Client clock used only for the run timer; world catch-up may jump. */
  scoreTime?: number;
  arena: AgentArenaState;
}) {
  const nearbyMonsters = [...input.entities]
    .filter((record) => record.net.id !== input.self.id && record.net.alive)
    .map((record) => ({
      id: record.net.id,
      name: record.net.name,
      distance: Number(distance(input.self, record.net).toFixed(1)),
      bearingRadians: Number(
        Math.atan2(
          record.net.x - input.self.x,
          record.net.z - input.self.z,
        ).toFixed(3),
      ),
      health: record.net.health,
      energy: record.net.energy,
      intent: record.net.intent,
      diet: record.dna.diet,
      social: record.dna.social,
      generation: record.net.generation,
      controlled: record.net.controlled,
    }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 12);

  const nearbyFood = EDIBLES.filter(
    (food) => !input.depletedResources.has(food.id),
  )
    .map((food) => ({
      id: food.id,
      kind: food.kind,
      distance: Number(distance(input.self, food).toFixed(1)),
      x: food.x,
      z: food.z,
      energy: food.energy,
    }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 8);

  const nearbyPrey = PREY.filter(
    (prey) => !input.depletedResources.has(prey.id),
  )
    .map((prey) => ({
      id: prey.id,
      distance: Number(distance(input.self, prey).toFixed(1)),
      x: prey.x,
      z: prey.z,
    }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 5);

  return {
    world: {
      name: input.worldName,
      timeSeconds: Math.round(input.worldTime),
      population: input.population,
      visibleEggs: input.eggs,
    },
    creature: {
      id: input.self.id,
      name: input.self.name,
      dna: input.self.dna,
      traits: input.selfDna,
      position: { x: input.self.x, y: input.self.y, z: input.self.z },
      facingRadians: input.self.yaw,
      health: input.self.health,
      energy: input.self.energy,
      ageSeconds: input.self.age,
      ageHours: input.self.age / 3600,
      maxAgeHours: getCreatureLifespanHours(input.selfDna),
      ageSpeedMultiplier: getAgeSpeedMultiplier(input.selfDna, input.self.age),
      locomotion: input.self.loco,
      generation: input.self.generation,
      alive: input.self.alive,
    },
    nearbyMonsters,
    nearbyFood,
    nearbyPrey,
    agent: {
      status: input.arena.status,
      lastAction: input.arena.lastAction,
      coaching: input.arena.coachNote,
    },
    scorecard: scoreAgentArena(
      input.arena,
      input.scoreTime ?? input.worldTime,
      input.population,
    ),
  };
}

export function webMcpResult(value: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(value) }],
    structuredContent: value,
  };
}
