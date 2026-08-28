import {
  canMonsterEatPlants,
  canMonsterHunt,
  canMonsterSwim,
  type MonsterDna,
} from "../dna/dna";
import { clamp, dampAngle, direction, normalizeAngle, smoothstep } from "../mathx";
import { nextRandom, randomFn } from "../rng";
import {
  EDIBLE_REGROW_SECONDS,
  EDIBLES,
  PREY,
  PREY_REGROW_SECONDS,
  type Edible,
} from "../world/resources";
import {
  isBlockedByWater,
  isDeepWaterAt,
  isWaterAt,
  PLAYABLE_RADIUS,
  riverX,
  terrainHeight,
  waterBlendAt,
} from "../world/terrain";
import {
  AI_IDLE_ENERGY_PER_SECOND,
  ATTACK_ENERGY_COST,
  CORPSE_LINGER_SECONDS,
  DEFAULT_CONTROL_GRACE_SECONDS,
  DEFAULT_MAX_POPULATION,
  EAT_DISTANCE,
  FLY_ENERGY_PER_SECOND,
  HEALTH_REGEN_DELAY_SECONDS,
  HUNT_DISTANCE,
  INPUT_DEADZONE,
  MATE_DISTANCE,
  MATE_ENERGY_COST,
  MATE_SEARCH_DISTANCE,
  PAIR_REQUEST_TIMEOUT_SECONDS,
  PLAYER_ATTACK_COOLDOWN_SECONDS,
  PLAYER_EAT_COOLDOWN_SECONDS,
  PLAYER_FLY_SPEED,
  PLAYER_FLY_SPRINT_SPEED,
  PLAYER_SPRINT_SPEED,
  PLAYER_WALK_SPEED,
  SPRINT_ENERGY_PER_SECOND,
  SWIM_ENERGY_PER_SECOND,
  TURN_RATE_PER_SECOND,
  WALK_ENERGY_PER_SECOND,
} from "./constants";
import {
  ADULT_AGE_SECONDS,
  createBabyName,
  createRandomName,
  dnaSimilarity,
  EGG_HATCH_SECONDS,
  getCreaturePower,
  getCreatureSpeed,
  INITIAL_WILD_MONSTERS,
  MATING_COOLDOWN_SECONDS,
  mixMonsterDna,
  MONSTER_ARCHETYPES,
} from "./genetics";
import type {
  LocomotionMode,
  PlayerInput,
  SimCommand,
  SimEgg,
  SimEntity,
  SimEvent,
  SimIntent,
  SpawnEntitySpec,
  WorldSettings,
  WorldSimState,
} from "./types";

export const WORLD_STATE_VERSION = 1;

type Parent = {
  id: string;
  name: string;
  dna: MonsterDna;
  generation: number;
  x: number;
  z: number;
};

/** A monster steered by a live socket right now. */
export function isPlayerControlled(entity: SimEntity) {
  return entity.controllerId !== null;
}

export function defaultWorldSettings(): WorldSettings {
  return {
    maxPopulation: DEFAULT_MAX_POPULATION,
    controlGraceSeconds: DEFAULT_CONTROL_GRACE_SECONDS,
  };
}

function settleHabitat(entity: SimEntity, index = 0) {
  const aquatic =
    canMonsterSwim(entity.dna) && entity.dna.adaptation !== "wings";
  if (aquatic) {
    entity.z = clamp(entity.z, -96, 96);
    entity.x = riverX(entity.z) + ((index % 3) - 1) * 0.35;
    entity.y = -0.72;
    entity.locomotion = "swim";
    return entity;
  }

  let attempts = 0;
  while (
    (isWaterAt(entity.x, entity.z) ||
      Math.hypot(entity.x, entity.z) > PLAYABLE_RADIUS - 8) &&
    attempts < 12
  ) {
    const angle = entity.wanderAngle + attempts * 0.83;
    const radius = 14 + ((index * 13 + attempts * 7) % 42);
    entity.x = Math.cos(angle) * radius;
    entity.z = Math.sin(angle) * radius;
    attempts += 1;
  }
  entity.y =
    terrainHeight(entity.x, entity.z) +
    (entity.dna.adaptation === "wings" ? 4.2 : 0);
  entity.locomotion = entity.dna.adaptation === "wings" ? "fly" : "land";
  return entity;
}

function blankEntity(spec: SpawnEntitySpec, random: () => number): SimEntity {
  return {
    id: spec.id,
    name: spec.name,
    dna: spec.dna,
    generation: spec.generation ?? 0,
    parentIds: spec.parentIds ?? null,
    mutations: 0,
    x: spec.x ?? 0,
    y: spec.y ?? 0,
    z: spec.z ?? 0,
    yaw: random() * Math.PI * 2,
    energy: spec.energy ?? 100,
    health: spec.health ?? 100,
    age: spec.age ?? ADULT_AGE_SECONDS + 10,
    intent: "wander",
    targetId: null,
    wanderAngle: random() * Math.PI * 2,
    nextDecisionAt: 0,
    attackCooldownUntil: 0,
    forageCooldownUntil: 0,
    mateCooldownUntil: 0,
    lastAttackedAt: -100,
    lastAttackerId: null,
    alive: true,
    deathAt: null,
    locomotion: "land",
    ownerGuestId: spec.ownerGuestId,
    controllerId: null,
    controlExpiresAt: null,
    input: null,
    lastInputSeq: 0,
  };
}

/**
 * Ten deterministic wild monsters drawn from the existing archetypes. The seed
 * fully determines names, DNA, placement and vitals, so a re-seeded world is
 * byte-for-byte identical.
 */
export function createInitialWildPopulation(
  seed: number,
  count = INITIAL_WILD_MONSTERS,
  idPrefix = "",
): SimEntity[] {
  const state = { value: seed >>> 0 };
  const random = randomFn(state);
  const shuffled = [...MONSTER_ARCHETYPES]
    .map((archetype) => ({ archetype, order: random() }))
    .sort((first, second) => first.order - second.order)
    .slice(0, Math.min(6, MONSTER_ARCHETYPES.length));

  const population: SimEntity[] = [];
  for (let index = 0; index < count; index += 1) {
    const base = shuffled[index % shuffled.length].archetype;
    const angle = random() * Math.PI * 2;
    const radius = 14 + random() * 34;
    const matchingAdult =
      index >= shuffled.length ? population[index % shuffled.length] : null;
    const entity: SimEntity = {
      ...blankEntity(
        {
          id: `${idPrefix}wild-${index + 1}`,
          name: createRandomName(random),
          dna: { ...base.dna, mesh: "smooth" },
          ownerGuestId: null,
        },
        random,
      ),
      x: matchingAdult
        ? matchingAdult.x + Math.cos(angle) * 4.2
        : Math.cos(angle) * radius,
      y: 0,
      z: matchingAdult
        ? matchingAdult.z + Math.sin(angle) * 4.2
        : Math.sin(angle) * radius,
      energy: 58 + random() * 38,
      health: 74 + random() * 26,
      age: ADULT_AGE_SECONDS + 20 + random() * 120,
      mateCooldownUntil:
        index === 0 || index === shuffled.length
          ? 6 + random() * 4
          : 18 + random() * 58,
    };
    entity.yaw = random() * Math.PI * 2;
    entity.wanderAngle = random() * Math.PI * 2;
    population.push(settleHabitat(entity, index));
  }
  return population;
}

export function createWorldState(options: {
  seed: number;
  idPrefix?: string;
  /** Wild monsters to seed. Ten by default; raised only for load testing. */
  initialPopulation?: number;
  settings?: Partial<WorldSettings>;
}): WorldSimState {
  const settings = { ...defaultWorldSettings(), ...options.settings };
  const idPrefix = options.idPrefix ?? "";
  const initialPopulation = Math.max(
    0,
    Math.min(
      settings.maxPopulation,
      options.initialPopulation ?? INITIAL_WILD_MONSTERS,
    ),
  );
  return {
    version: WORLD_STATE_VERSION,
    seed: options.seed >>> 0,
    idPrefix,
    tick: 0,
    time: 0,
    rng: { value: (options.seed ^ 0x45434f53) >>> 0 },
    entities: createInitialWildPopulation(
      options.seed,
      initialPopulation,
      idPrefix,
    ),
    eggs: [],
    depletedResources: {},
    pairRequests: [],
    nextEggId: 1,
    nextCreatureId: 1,
    nextPairRequestId: 1,
    stats: { births: 0, deaths: 0 },
    settings,
  };
}

export function findEntity(state: WorldSimState, id: string) {
  return state.entities.find((entity) => entity.id === id) ?? null;
}

function livingCount(state: WorldSimState) {
  return state.entities.reduce(
    (total, entity) => total + (entity.alive ? 1 : 0),
    0,
  );
}

function isResourceAvailable(state: WorldSimState, id: string) {
  const readyAt = state.depletedResources[id];
  return readyAt === undefined || readyAt <= state.time;
}

function depleteResource(state: WorldSimState, id: string, seconds: number) {
  state.depletedResources[id] = state.time + seconds;
}

function regrowResources(state: WorldSimState) {
  for (const [id, readyAt] of Object.entries(state.depletedResources)) {
    if (readyAt <= state.time) delete state.depletedResources[id];
  }
}

function killEntity(
  state: WorldSimState,
  entity: SimEntity,
  cause: "energy" | "health",
  killerId: string | null,
  events: SimEvent[],
) {
  if (!entity.alive) return;
  entity.alive = false;
  entity.health = 0;
  entity.deathAt = state.time;
  entity.controllerId = null;
  entity.controlExpiresAt = null;
  entity.input = null;
  state.stats.deaths += 1;
  events.push({
    type: "death",
    tick: state.tick,
    entityId: entity.id,
    name: entity.name,
    cause,
    killerId,
    ownerGuestId: entity.ownerGuestId,
  });
}

function layEgg(
  state: WorldSimState,
  first: Parent,
  second: Parent,
  events: SimEvent[],
) {
  const random = randomFn(state.rng);
  const mix = mixMonsterDna(first.dna, second.dna, random);
  const x = (first.x + second.x) / 2;
  const z = (first.z + second.z) / 2;
  const egg: SimEgg = {
    id: `${state.idPrefix}egg-${state.nextEggId++}`,
    dna: mix.dna,
    parentIds: [first.id, second.id],
    parentNames: [first.name, second.name],
    generation: Math.max(first.generation, second.generation) + 1,
    x,
    y: terrainHeight(x, z),
    z,
    laidAt: state.time,
    hatchAt: state.time + EGG_HATCH_SECONDS,
    mutations: mix.mutations,
  };
  state.eggs.push(egg);
  events.push({
    type: "egg",
    tick: state.tick,
    eggId: egg.id,
    parentIds: egg.parentIds,
    parentNames: egg.parentNames,
    generation: egg.generation,
    mutations: egg.mutations,
    x,
    z,
  });
  return egg;
}

function resolveLocomotion(
  entity: SimEntity,
  requested: LocomotionMode,
): LocomotionMode {
  const canSwim = canMonsterSwim(entity.dna);
  const canFly = entity.dna.adaptation === "wings";
  const overWater = isWaterAt(entity.x, entity.z);
  let mode = requested;
  if (mode === "fly" && !canFly) {
    mode = overWater && canSwim ? "swim" : "land";
  } else if (
    mode === "dive" &&
    (!canSwim || !isDeepWaterAt(entity.x, entity.z))
  ) {
    mode = overWater && canSwim ? "swim" : "land";
  } else if (mode !== "fly") {
    mode = overWater && canSwim ? (mode === "dive" ? "dive" : "swim") : "land";
  }
  return mode;
}

function locomotionHeight(entity: SimEntity, mode: LocomotionMode) {
  if (mode === "fly") return terrainHeight(entity.x, entity.z) + 7.4;
  if (mode === "dive") return -3.55;
  if (mode === "swim") {
    return isDeepWaterAt(entity.x, entity.z) ? -1.05 : -0.72;
  }
  return terrainHeight(entity.x, entity.z);
}

/** Sanitizes anything a client may have sent before it reaches the world. */
export function sanitizeInput(input: PlayerInput): PlayerInput {
  const safe = (value: unknown) =>
    typeof value === "number" && Number.isFinite(value) ? value : 0;
  return {
    forward: clamp(safe(input.forward), -1, 1),
    strafe: clamp(safe(input.strafe), -1, 1),
    turn: clamp(safe(input.turn), -1, 1),
    heading: normalizeAngle(safe(input.heading)),
    sprint: Boolean(input.sprint),
    seq: Math.max(0, Math.floor(safe(input.seq))),
  };
}

/**
 * Authoritative player movement for one fixed step.
 *
 * Exported because the browser runs exactly the same function for local
 * prediction; that is what keeps the predicted position close enough to the
 * server's that reconciliation never has to teleport the monster.
 */
export function applyPlayerMovement(entity: SimEntity, dt: number) {
  const input = entity.input;
  const horizontal = input ? input.strafe : 0;
  const forward = input ? input.forward : 0;
  const sprinting = input ? input.sprint : false;
  const canSwim = canMonsterSwim(entity.dna);
  const canFly = entity.dna.adaptation === "wings";

  if (input && input.turn !== 0) {
    entity.yaw = normalizeAngle(
      entity.yaw + input.turn * TURN_RATE_PER_SECOND * dt,
    );
  }

  const moveMagnitude = Math.abs(horizontal) + Math.abs(forward);
  let moved = false;
  if (input && moveMagnitude > INPUT_DEADZONE) {
    const targetYaw =
      Math.abs(horizontal) > INPUT_DEADZONE
        ? input.heading - Math.sign(horizontal) * Math.PI * 0.5
        : input.heading;
    entity.yaw = dampAngle(entity.yaw, targetYaw, 15, dt);

    const length = Math.hypot(horizontal, forward);
    const xInput = horizontal / Math.max(1, length);
    const zInput = forward / Math.max(1, length);
    const sin = Math.sin(input.heading);
    const cos = Math.cos(input.heading);
    let velocityX = xInput * cos - zInput * sin;
    let velocityZ = -xInput * sin - zInput * cos;
    const magnitude = Math.hypot(velocityX, velocityZ);
    if (magnitude > 0.0001) {
      velocityX /= magnitude;
      velocityZ /= magnitude;
      const flying = entity.locomotion === "fly" && canFly;
      const speed = flying
        ? sprinting
          ? PLAYER_FLY_SPRINT_SPEED
          : PLAYER_FLY_SPEED
        : sprinting
          ? PLAYER_SPRINT_SPEED
          : PLAYER_WALK_SPEED;
      const nextX = entity.x + velocityX * speed * dt;
      const nextZ = entity.z + velocityZ * speed * dt;
      if (flying || !isBlockedByWater(nextX, entity.z, canSwim)) {
        entity.x = nextX;
        moved = true;
      }
      if (flying || !isBlockedByWater(entity.x, nextZ, canSwim)) {
        entity.z = nextZ;
        moved = true;
      }
    }
  }

  entity.locomotion = resolveLocomotion(entity, entity.locomotion);
  entity.y = locomotionHeight(entity, entity.locomotion);

  if (moved) {
    const rate =
      entity.locomotion === "fly"
        ? FLY_ENERGY_PER_SECOND * (sprinting ? 1.75 : 1)
        : entity.locomotion === "swim" || entity.locomotion === "dive"
          ? SWIM_ENERGY_PER_SECOND * (sprinting ? 1.6 : 1)
          : sprinting
            ? SPRINT_ENERGY_PER_SECOND
            : WALK_ENERGY_PER_SECOND;
    entity.energy = Math.max(0, entity.energy - rate * dt);
  }
  entity.intent = moved ? "wander" : "rest";
  return moved;
}

function nearestEdible(state: WorldSimState, entity: SimEntity, range: number) {
  let nearest: Edible | null = null;
  let nearestDistance = range;
  for (const edible of EDIBLES) {
    if (!isResourceAvailable(state, edible.id)) continue;
    const distance = Math.hypot(edible.x - entity.x, edible.z - entity.z);
    if (distance <= nearestDistance) {
      nearest = edible;
      nearestDistance = distance;
    }
  }
  return nearest;
}

function performEat(
  state: WorldSimState,
  entity: SimEntity,
  events: SimEvent[],
) {
  if (!canMonsterEatPlants(entity.dna)) {
    events.push({
      type: "feedFailed",
      tick: state.tick,
      entityId: entity.id,
      reason: "diet",
    });
    return;
  }
  if (entity.energy >= 99.5) {
    events.push({
      type: "feedFailed",
      tick: state.tick,
      entityId: entity.id,
      reason: "full",
    });
    return;
  }
  if (entity.forageCooldownUntil > state.time) return;
  const nearest = nearestEdible(state, entity, EAT_DISTANCE);
  if (!nearest) {
    events.push({
      type: "feedFailed",
      tick: state.tick,
      entityId: entity.id,
      reason: "noResource",
    });
    return;
  }
  const plantEnergy =
    nearest.energy * (entity.dna.diet === "omnivore" ? 0.7 : 1);
  const restored = Math.min(plantEnergy, 100 - entity.energy);
  entity.energy = Math.min(100, entity.energy + restored);
  entity.forageCooldownUntil = state.time + PLAYER_EAT_COOLDOWN_SECONDS;
  depleteResource(state, nearest.id, EDIBLE_REGROW_SECONDS);
  events.push({
    type: "feed",
    tick: state.tick,
    entityId: entity.id,
    entityName: entity.name,
    resourceId: nearest.id,
    energy: restored,
    kind: nearest.kind,
  });
}

function performAttack(
  state: WorldSimState,
  entity: SimEntity,
  events: SimEvent[],
) {
  if (entity.attackCooldownUntil > state.time) {
    events.push({
      type: "attackMissed",
      tick: state.tick,
      entityId: entity.id,
      reason: "cooldown",
    });
    return;
  }
  entity.attackCooldownUntil = state.time + PLAYER_ATTACK_COOLDOWN_SECONDS;
  entity.energy = Math.max(0, entity.energy - ATTACK_ENERGY_COST);
  if (entity.energy <= 0) {
    killEntity(state, entity, "energy", null, events);
    return;
  }

  let nearest: SimEntity | null = null;
  let nearestDistance = HUNT_DISTANCE;
  let blockedByProtection = false;
  for (const other of state.entities) {
    if (!other.alive || other.id === entity.id) continue;
    const distance = Math.hypot(other.x - entity.x, other.z - entity.z);
    if (distance >= nearestDistance) continue;
    // Player versus player damage is disabled in this release. The server
    // returns a clear no-op instead of trusting the attacking client.
    if (isPlayerControlled(other)) {
      blockedByProtection = true;
      continue;
    }
    nearest = other;
    nearestDistance = distance;
  }

  if (nearest) {
    const damage = 7.5 + getCreaturePower(entity.dna) * 5.2;
    nearest.health = Math.max(0, nearest.health - damage);
    nearest.lastAttackedAt = state.time;
    nearest.lastAttackerId = entity.id;
    nearest.intent = nearest.health < 28 ? "flee" : "defend";
    nearest.targetId = entity.id;
    const defeated = nearest.health <= 0;
    let energyReward = 0;
    if (defeated) {
      killEntity(state, nearest, "health", entity.id, events);
      if (canMonsterHunt(entity.dna)) {
        energyReward = entity.dna.diet === "carnivore" ? 34 : 20;
        entity.energy = Math.min(100, entity.energy + energyReward);
      }
    }
    events.push({
      type: "attack",
      tick: state.tick,
      attackerId: entity.id,
      attackerName: entity.name,
      targetId: nearest.id,
      targetName: nearest.name,
      damage,
      defeated,
      energyReward,
    });
    return;
  }

  if (canMonsterHunt(entity.dna)) {
    for (const prey of PREY) {
      if (!isResourceAvailable(state, prey.id)) continue;
      const distance = Math.hypot(prey.x - entity.x, prey.z - entity.z);
      if (distance > HUNT_DISTANCE) continue;
      const huntEnergy = entity.dna.diet === "carnivore" ? 45 : 28;
      const restored = Math.min(huntEnergy, 100 - entity.energy);
      entity.energy = Math.min(100, entity.energy + restored);
      depleteResource(state, prey.id, PREY_REGROW_SECONDS);
      events.push({
        type: "feed",
        tick: state.tick,
        entityId: entity.id,
        entityName: entity.name,
        resourceId: prey.id,
        energy: restored,
        kind: "prey",
      });
      return;
    }
  }

  events.push({
    type: "attackMissed",
    tick: state.tick,
    entityId: entity.id,
    reason: blockedByProtection ? "playerProtected" : "noTarget",
  });
}

function isMateReady(entity: SimEntity, now: number) {
  return (
    entity.alive &&
    entity.age >= ADULT_AGE_SECONDS &&
    entity.health >= 55 &&
    entity.energy >= 55 &&
    entity.mateCooldownUntil <= now
  );
}

function performPair(
  state: WorldSimState,
  entity: SimEntity,
  events: SimEvent[],
) {
  const now = state.time;
  if (livingCount(state) + state.eggs.length >= state.settings.maxPopulation) {
    events.push({
      type: "pairFailed",
      tick: state.tick,
      entityId: entity.id,
      reason: "populationFull",
    });
    return;
  }
  if (entity.mateCooldownUntil > now) {
    events.push({
      type: "pairFailed",
      tick: state.tick,
      entityId: entity.id,
      reason: "cooldown",
      seconds: Math.ceil(entity.mateCooldownUntil - now),
    });
    return;
  }
  if (entity.health < 55 || entity.energy < 55) {
    events.push({
      type: "pairFailed",
      tick: state.tick,
      entityId: entity.id,
      reason: "notReady",
    });
    return;
  }
  if (
    state.pairRequests.some(
      (request) =>
        request.fromEntityId === entity.id || request.toEntityId === entity.id,
    )
  ) {
    events.push({
      type: "pairFailed",
      tick: state.tick,
      entityId: entity.id,
      reason: "pending",
    });
    return;
  }

  // A nearby monster steered by another player needs that player's consent.
  let playerPartner: SimEntity | null = null;
  let playerDistance = MATE_DISTANCE;
  for (const other of state.entities) {
    if (other.id === entity.id || !isPlayerControlled(other)) continue;
    if (!isMateReady(other, now)) continue;
    const distance = Math.hypot(other.x - entity.x, other.z - entity.z);
    if (distance < playerDistance) {
      playerPartner = other;
      playerDistance = distance;
    }
  }
  if (playerPartner && playerPartner.ownerGuestId && entity.ownerGuestId) {
    const request = {
      id: `${state.idPrefix}pair-${state.nextPairRequestId++}`,
      fromEntityId: entity.id,
      toEntityId: playerPartner.id,
      fromGuestId: entity.ownerGuestId,
      toGuestId: playerPartner.ownerGuestId,
      createdAt: now,
      expiresAt: now + PAIR_REQUEST_TIMEOUT_SECONDS,
    };
    state.pairRequests.push(request);
    events.push({
      type: "pairRequested",
      tick: state.tick,
      requestId: request.id,
      fromEntityId: entity.id,
      fromEntityName: entity.name,
      toEntityId: playerPartner.id,
      toEntityName: playerPartner.name,
      fromGuestId: request.fromGuestId,
      toGuestId: request.toGuestId,
      expiresAt: request.expiresAt,
    });
    return;
  }

  let nearest: SimEntity | null = null;
  let nearestDistance = MATE_SEARCH_DISTANCE;
  for (const other of state.entities) {
    if (other.id === entity.id || isPlayerControlled(other)) continue;
    if (!isMateReady(other, now)) continue;
    const distance = Math.hypot(other.x - entity.x, other.z - entity.z);
    if (distance < nearestDistance) {
      nearest = other;
      nearestDistance = distance;
    }
  }
  if (!nearest) {
    events.push({
      type: "pairFailed",
      tick: state.tick,
      entityId: entity.id,
      reason: "noPartner",
    });
    return;
  }
  if (nearestDistance > MATE_DISTANCE) {
    events.push({
      type: "pairFailed",
      tick: state.tick,
      entityId: entity.id,
      reason: "tooFar",
      partnerName: nearest.name,
    });
    return;
  }

  completePairing(state, entity, nearest, events);
}

function completePairing(
  state: WorldSimState,
  first: SimEntity,
  second: SimEntity,
  events: SimEvent[],
) {
  const cooldownUntil = state.time + MATING_COOLDOWN_SECONDS;
  first.mateCooldownUntil = cooldownUntil;
  second.mateCooldownUntil = cooldownUntil;
  first.energy = Math.max(0, first.energy - MATE_ENERGY_COST);
  second.energy = Math.max(0, second.energy - 16);
  layEgg(state, first, second, events);
}

function expirePairRequests(state: WorldSimState, events: SimEvent[]) {
  if (state.pairRequests.length === 0) return;
  const remaining = [];
  for (const request of state.pairRequests) {
    const from = findEntity(state, request.fromEntityId);
    const to = findEntity(state, request.toEntityId);
    if (request.expiresAt <= state.time || !from?.alive || !to?.alive) {
      events.push({
        type: "pairResolved",
        tick: state.tick,
        requestId: request.id,
        fromEntityId: request.fromEntityId,
        toEntityId: request.toEntityId,
        outcome: "expired",
      });
      continue;
    }
    remaining.push(request);
  }
  state.pairRequests = remaining;
}

function releaseExpiredControl(state: WorldSimState, events: SimEvent[]) {
  for (const entity of state.entities) {
    if (
      entity.controlExpiresAt !== null &&
      entity.controlExpiresAt <= state.time
    ) {
      entity.controlExpiresAt = null;
      entity.controllerId = null;
      entity.input = null;
      events.push({
        type: "control",
        tick: state.tick,
        entityId: entity.id,
        connectionId: null,
        ownerGuestId: entity.ownerGuestId,
        change: "aiTakeover",
      });
    }
  }
}

function applyCommand(
  state: WorldSimState,
  command: SimCommand,
  events: SimEvent[],
) {
  if (command.type === "spawn") {
    if (findEntity(state, command.entity.id)) return;
    const random = randomFn(state.rng);
    const entity = blankEntity(command.entity, random);
    if (command.entity.x === undefined || command.entity.z === undefined) {
      settleHabitat(entity, state.entities.length);
    } else {
      entity.locomotion = resolveLocomotion(entity, "land");
      entity.y = locomotionHeight(entity, entity.locomotion);
    }
    state.entities.push(entity);
    events.push({
      type: "spawned",
      tick: state.tick,
      entityId: entity.id,
      name: entity.name,
      ownerGuestId: entity.ownerGuestId,
    });
    return;
  }

  if (command.type === "updateDna") {
    const entity = findEntity(state, command.entityId);
    if (!entity) return;
    entity.dna = command.dna;
    entity.name = command.name;
    entity.locomotion = resolveLocomotion(entity, entity.locomotion);
    entity.y = locomotionHeight(entity, entity.locomotion);
    events.push({
      type: "dnaUpdated",
      tick: state.tick,
      entityId: entity.id,
      name: entity.name,
      ownerGuestId: entity.ownerGuestId,
    });
    return;
  }

  if (command.type === "attach") {
    const entity = findEntity(state, command.entityId);
    if (!entity || !entity.alive) return;
    entity.controllerId = command.connectionId;
    entity.controlExpiresAt = null;
    entity.lastInputSeq = 0;
    entity.input = null;
    events.push({
      type: "control",
      tick: state.tick,
      entityId: entity.id,
      connectionId: command.connectionId,
      ownerGuestId: entity.ownerGuestId,
      change: "attached",
    });
    return;
  }

  if (command.type === "detach") {
    const entity = findEntity(state, command.entityId);
    if (!entity || entity.controllerId !== command.connectionId) return;
    entity.input = null;
    entity.controlExpiresAt =
      state.time + state.settings.controlGraceSeconds;
    events.push({
      type: "control",
      tick: state.tick,
      entityId: entity.id,
      connectionId: command.connectionId,
      ownerGuestId: entity.ownerGuestId,
      change: "detached",
    });
    return;
  }

  if (command.type === "pairRespond") {
    const request = state.pairRequests.find(
      (candidate) => candidate.id === command.requestId,
    );
    if (!request) return;
    state.pairRequests = state.pairRequests.filter(
      (candidate) => candidate.id !== request.id,
    );
    const from = findEntity(state, request.fromEntityId);
    const to = findEntity(state, request.toEntityId);
    const distance =
      from && to ? Math.hypot(from.x - to.x, from.z - to.z) : Infinity;
    const acceptable =
      command.accept &&
      from &&
      to &&
      isMateReady(from, state.time) &&
      isMateReady(to, state.time) &&
      distance <= MATE_DISTANCE &&
      livingCount(state) + state.eggs.length < state.settings.maxPopulation;
    events.push({
      type: "pairResolved",
      tick: state.tick,
      requestId: request.id,
      fromEntityId: request.fromEntityId,
      toEntityId: request.toEntityId,
      outcome: acceptable ? "accepted" : "rejected",
    });
    if (acceptable && from && to) completePairing(state, from, to, events);
    return;
  }

  const entity = findEntity(state, command.entityId);
  if (!entity) return;
  if (!entity.alive) {
    if (command.type === "action") {
      events.push({
        type: "attackMissed",
        tick: state.tick,
        entityId: entity.id,
        reason: "dead",
      });
    }
    return;
  }

  if (command.type === "input") {
    const input = sanitizeInput(command.input);
    if (input.seq <= entity.lastInputSeq) return;
    entity.lastInputSeq = input.seq;
    entity.input = input;
    return;
  }

  if (command.type === "locomotion") {
    const canSwim = canMonsterSwim(entity.dna);
    const canFly = entity.dna.adaptation === "wings";
    if (command.mode === "fly" && canFly) entity.locomotion = "fly";
    else if (command.mode === "land")
      entity.locomotion = resolveLocomotion(entity, "land");
    else if (command.mode === "dive" && canSwim)
      entity.locomotion = resolveLocomotion(entity, "dive");
    else if (command.mode === "surface" && canSwim)
      entity.locomotion = resolveLocomotion(entity, "swim");
    entity.locomotion = resolveLocomotion(entity, entity.locomotion);
    entity.y = locomotionHeight(entity, entity.locomotion);
    return;
  }

  if (command.type === "action") {
    if (command.action === "eat") performEat(state, entity, events);
    else if (command.action === "attack") performAttack(state, entity, events);
    else performPair(state, entity, events);
  }
}

function updateAiEntity(
  state: WorldSimState,
  entity: SimEntity,
  living: SimEntity[],
  dt: number,
  events: SimEvent[],
) {
  const now = state.time;
  const random = randomFn(state.rng);

  entity.energy = Math.max(
    0,
    entity.energy - AI_IDLE_ENERGY_PER_SECOND * dt,
  );
  if (entity.energy <= 0) {
    killEntity(state, entity, "energy", null, events);
    return;
  }

  let steerX = Math.cos(entity.wanderAngle) * 0.16;
  let steerZ = Math.sin(entity.wanderAngle) * 0.16;
  const scores: Array<[SimIntent, number]> = [["wander", 0.16]];
  const hunger = clamp((72 - entity.energy) / 72, 0, 1);
  const lowHealth = clamp((60 - entity.health) / 60, 0, 1);
  const power = getCreaturePower(entity.dna);

  if (now >= entity.nextDecisionAt) {
    entity.wanderAngle += (random() - 0.5) * 1.3;
    entity.nextDecisionAt = now + 0.7 + random() * 1.4;
  }

  let nearestThreat: SimEntity | null = null;
  let threatDistance = 16;
  for (const other of living) {
    if (other.id === entity.id) continue;
    if (!canMonsterHunt(other.dna)) continue;
    const separation = direction(entity.x, entity.z, other.x, other.z);
    const dangerous =
      other.lastAttackerId === entity.id ||
      (other.dna.diet === "carnivore" &&
        (entity.dna.diet === "herbivore" ||
          getCreaturePower(other.dna) > power * 1.08));
    if (dangerous && separation.distance < threatDistance) {
      nearestThreat = other;
      threatDistance = separation.distance;
    }
  }

  if (nearestThreat) {
    const away = direction(
      nearestThreat.x,
      nearestThreat.z,
      entity.x,
      entity.z,
    );
    const fleeScore =
      clamp((16 - threatDistance) / 12, 0, 1) * (0.8 + lowHealth * 1.4);
    steerX += away.x * fleeScore * 1.9;
    steerZ += away.z * fleeScore * 1.9;
    scores.push(["flee", fleeScore]);
  }

  if (entity.dna.social === "solitary") {
    let repelX = 0;
    let repelZ = 0;
    let nearby = 0;
    for (const other of living) {
      if (other.id === entity.id) continue;
      const distance = Math.hypot(other.x - entity.x, other.z - entity.z);
      if (distance > 11 || distance < 0.001) continue;
      const away = direction(other.x, other.z, entity.x, entity.z);
      const strength = (11 - distance) / 11;
      repelX += away.x * strength;
      repelZ += away.z * strength;
      nearby += strength;
    }
    if (nearby > 0) {
      steerX += repelX * 0.95;
      steerZ += repelZ * 0.95;
      scores.push(["socialize", Math.min(0.78, nearby * 0.42)]);
    }
  } else {
    const desiredNeighbors =
      entity.dna.social === "pair" ? 1 : entity.dna.social === "pack" ? 3 : 7;
    const preferred = living
      .filter((other) => other.id !== entity.id)
      .map((other) => ({
        x: other.x,
        z: other.z,
        distance: Math.hypot(other.x - entity.x, other.z - entity.z),
        similarity: dnaSimilarity(entity.dna, other.dna),
      }))
      .sort(
        (first, second) =>
          second.similarity / (1 + second.distance * 0.025) -
          first.similarity / (1 + first.distance * 0.025),
      )
      .slice(0, desiredNeighbors);
    let socialX = 0;
    let socialZ = 0;
    let socialWeight = 0;
    for (const other of preferred) {
      const toward = direction(entity.x, entity.z, other.x, other.z);
      const idealDistance = entity.dna.social === "pair" ? 4.2 : 5.5;
      const distanceError = clamp(
        (toward.distance - idealDistance) / 12,
        -0.7,
        1,
      );
      const weight = 0.18 + other.similarity ** 2 * 0.82;
      socialX += toward.x * distanceError * weight;
      socialZ += toward.z * distanceError * weight;
      socialWeight += Math.abs(distanceError) * weight;
    }
    if (socialWeight > 0.02) {
      steerX += socialX * 0.9;
      steerZ += socialZ * 0.9;
      scores.push(["socialize", Math.min(0.82, socialWeight * 0.45)]);
    }
  }

  if (canMonsterEatPlants(entity.dna) && hunger > 0.05) {
    let nearestFood: Edible | null = null;
    let foodDistance = 52;
    for (const edible of EDIBLES) {
      if (!isResourceAvailable(state, edible.id)) continue;
      const distance = Math.hypot(edible.x - entity.x, edible.z - entity.z);
      if (distance < foodDistance) {
        foodDistance = distance;
        nearestFood = edible;
      }
    }
    if (nearestFood) {
      const towardFood = direction(
        entity.x,
        entity.z,
        nearestFood.x,
        nearestFood.z,
      );
      const forageScore = hunger * (0.72 + Math.min(0.28, foodDistance / 80));
      steerX += towardFood.x * forageScore * 1.55;
      steerZ += towardFood.z * forageScore * 1.55;
      scores.push(["forage", forageScore]);
      if (foodDistance < 2.5 && now >= entity.forageCooldownUntil) {
        const dietFactor = entity.dna.diet === "omnivore" ? 0.72 : 1;
        const restored = Math.min(
          nearestFood.energy * 0.5 * dietFactor,
          100 - entity.energy,
        );
        entity.energy = Math.min(100, entity.energy + restored);
        entity.forageCooldownUntil = now + 5.5;
        depleteResource(state, nearestFood.id, EDIBLE_REGROW_SECONDS);
        events.push({
          type: "feed",
          tick: state.tick,
          entityId: entity.id,
          entityName: entity.name,
          resourceId: nearestFood.id,
          energy: restored,
          kind: nearestFood.kind,
        });
      }
    }
  }

  let prey: SimEntity | null = null;
  let preyDistance = 34;
  const shouldHunt =
    canMonsterHunt(entity.dna) &&
    (entity.dna.diet === "carnivore" ? entity.energy < 68 : entity.energy < 38);
  if (shouldHunt) {
    for (const other of living) {
      if (other.id === entity.id) continue;
      const otherPower = getCreaturePower(other.dna);
      const distance = Math.hypot(other.x - entity.x, other.z - entity.z);
      if (distance < preyDistance && otherPower < power * 1.22) {
        prey = other;
        preyDistance = distance;
      }
    }
  }

  const defending =
    now - entity.lastAttackedAt < 7 && entity.lastAttackerId !== null;
  let combatTarget: SimEntity | null = prey;
  if (defending) {
    combatTarget =
      living.find((other) => other.id === entity.lastAttackerId) ?? null;
  }
  if (combatTarget) {
    const towardTarget = direction(
      entity.x,
      entity.z,
      combatTarget.x,
      combatTarget.z,
    );
    const combatScore = defending
      ? entity.health < 25
        ? 0
        : 0.9
      : hunger * 1.08;
    if (defending && entity.health < 25) {
      steerX -= towardTarget.x * 1.8;
      steerZ -= towardTarget.z * 1.8;
      scores.push(["flee", 1]);
    } else {
      steerX += towardTarget.x * combatScore * 1.8;
      steerZ += towardTarget.z * combatScore * 1.8;
      scores.push([defending ? "defend" : "hunt", combatScore]);
      entity.targetId = combatTarget.id;
      if (towardTarget.distance < 2.8 && now >= entity.attackCooldownUntil) {
        entity.attackCooldownUntil = now + 1.35 + random() * 0.35;
        entity.energy = Math.max(0, entity.energy - 3.6);
        const damage = 4.5 + power * (3.2 + random() * 2.4);
        combatTarget.health = Math.max(0, combatTarget.health - damage);
        combatTarget.lastAttackedAt = now;
        combatTarget.lastAttackerId = entity.id;
        const defeated = combatTarget.health <= 0;
        let energyReward = 0;
        if (defeated) {
          killEntity(state, combatTarget, "health", entity.id, events);
          energyReward = entity.dna.diet === "carnivore" ? 38 : 22;
          entity.energy = Math.min(100, entity.energy + energyReward);
        }
        events.push({
          type: "attack",
          tick: state.tick,
          attackerId: entity.id,
          attackerName: entity.name,
          targetId: combatTarget.id,
          targetName: combatTarget.name,
          damage,
          defeated,
          energyReward,
        });
      }
    }
  }

  const readyToMate =
    entity.age >= ADULT_AGE_SECONDS &&
    entity.energy >= 62 &&
    entity.health >= 62 &&
    entity.mateCooldownUntil <= now &&
    living.length + state.eggs.length < state.settings.maxPopulation;
  if (readyToMate) {
    const partner = living
      .filter(
        (other) =>
          other.id !== entity.id &&
          other.age >= ADULT_AGE_SECONDS &&
          other.energy >= 60 &&
          other.health >= 60 &&
          other.mateCooldownUntil <= now,
      )
      .map((other) => ({
        other,
        similarity: dnaSimilarity(entity.dna, other.dna),
        distance: Math.hypot(other.x - entity.x, other.z - entity.z),
      }))
      .filter((candidate) => candidate.similarity >= 0.28)
      .sort(
        (first, second) =>
          second.similarity / (1 + second.distance * 0.035) -
          first.similarity / (1 + first.distance * 0.035),
      )[0];
    if (partner) {
      const towardPartner = direction(
        entity.x,
        entity.z,
        partner.other.x,
        partner.other.z,
      );
      const mateScore = 0.42 + partner.similarity * 0.48;
      steerX += towardPartner.x * mateScore;
      steerZ += towardPartner.z * mateScore;
      scores.push(["mate", mateScore]);
      entity.targetId = partner.other.id;
      if (partner.distance < 2.8) {
        const cooldownUntil = now + MATING_COOLDOWN_SECONDS;
        entity.mateCooldownUntil = cooldownUntil;
        partner.other.mateCooldownUntil = cooldownUntil;
        entity.energy = Math.max(0, entity.energy - 16);
        partner.other.energy = Math.max(0, partner.other.energy - 16);
        layEgg(state, entity, partner.other, events);
      }
    }
  }

  // Local separation is always active, even for armies, so a group stays a
  // readable cluster rather than collapsing into one overlapping mesh.
  for (const other of living) {
    if (other.id === entity.id) continue;
    const separation = direction(other.x, other.z, entity.x, entity.z);
    if (separation.distance < 2.6 && separation.distance > 0.001) {
      const strength = (2.6 - separation.distance) / 2.6;
      steerX += separation.x * strength * 1.4;
      steerZ += separation.z * strength * 1.4;
    }
  }

  const radius = Math.hypot(entity.x, entity.z);
  if (radius > PLAYABLE_RADIUS - 12) {
    steerX += (-entity.x / radius) * 2;
    steerZ += (-entity.z / radius) * 2;
  }
  const length = Math.hypot(steerX, steerZ);
  const dominant = scores.sort((first, second) => second[1] - first[1])[0];
  entity.intent = dominant?.[0] ?? "wander";
  if (length > 0.0001) {
    const speedScale =
      entity.intent === "flee"
        ? 1.28
        : entity.intent === "hunt" || entity.intent === "defend"
          ? 1.12
          : entity.intent === "rest"
            ? 0.2
            : 0.82;
    const speed = getCreatureSpeed(entity.dna) * speedScale;
    const moveX = (steerX / length) * speed * dt;
    const moveZ = (steerZ / length) * speed * dt;
    const nextX = entity.x + moveX;
    const nextZ = entity.z + moveZ;
    const blocked = isBlockedByWater(nextX, nextZ, canMonsterSwim(entity.dna));
    if (!blocked) {
      entity.x = nextX;
      entity.z = nextZ;
      entity.yaw = Math.atan2(-moveX, -moveZ);
      entity.energy = Math.max(
        0,
        entity.energy -
          (entity.intent === "flee" || entity.intent === "hunt" ? 0.42 : 0.2) *
            dt,
      );
    } else {
      entity.wanderAngle += Math.PI * (0.45 + random() * 0.4);
    }
  }

  const blend = canMonsterSwim(entity.dna) ? waterBlendAt(entity.x, entity.z) : 0;
  entity.locomotion =
    entity.dna.adaptation === "wings" ? "fly" : blend > 0.52 ? "swim" : "land";
  entity.y =
    entity.dna.adaptation === "wings"
      ? terrainHeight(entity.x, entity.z) + 4.2
      : blend > 0.52
        ? -0.72
        : terrainHeight(entity.x, entity.z);
}

function hatchEggs(state: WorldSimState, events: SimEvent[]) {
  if (state.eggs.length === 0) return;
  const due = state.eggs.filter((egg) => egg.hatchAt <= state.time);
  if (due.length === 0) return;
  const random = randomFn(state.rng);
  for (const egg of due) {
    if (livingCount(state) >= state.settings.maxPopulation) break;
    const baby = blankEntity(
      {
        id: `${state.idPrefix}baby-${state.nextCreatureId++}`,
        name: createBabyName(egg.parentNames[0], egg.parentNames[1], random),
        dna: egg.dna,
        ownerGuestId: null,
        generation: egg.generation,
        parentIds: egg.parentIds,
        x: egg.x + (random() - 0.5) * 1.2,
        y: egg.y,
        z: egg.z + (random() - 0.5) * 1.2,
        energy: 78,
        health: 100,
        age: 0,
      },
      random,
    );
    baby.mutations = egg.mutations;
    baby.intent = "socialize";
    baby.targetId = egg.parentIds[0];
    baby.nextDecisionAt = state.time + 1;
    baby.attackCooldownUntil = state.time + 8;
    baby.forageCooldownUntil = state.time + 3;
    baby.mateCooldownUntil = state.time + ADULT_AGE_SECONDS;
    settleHabitat(baby, state.nextCreatureId);
    state.entities.push(baby);
    state.stats.births += 1;
    events.push({
      type: "birth",
      tick: state.tick,
      eggId: egg.id,
      entityId: baby.id,
      name: baby.name,
      generation: baby.generation,
      parentIds: egg.parentIds,
      mutations: egg.mutations,
    });
  }
  state.eggs = state.eggs.filter((egg) => egg.hatchAt > state.time);
}

function removeExpiredBodies(state: WorldSimState) {
  const hasExpired = state.entities.some(
    (entity) =>
      !entity.alive &&
      entity.deathAt !== null &&
      state.time - entity.deathAt > CORPSE_LINGER_SECONDS,
  );
  if (!hasExpired) return;
  state.entities = state.entities.filter(
    (entity) =>
      entity.alive ||
      entity.deathAt === null ||
      state.time - entity.deathAt <= CORPSE_LINGER_SECONDS,
  );
}

/**
 * Advances the world by one explicit fixed step. The state object is mutated
 * in place; callers that need history should clone it first. The function is
 * pure with respect to the outside world: no clocks, no I/O, no globals.
 */
export function stepWorld(
  state: WorldSimState,
  dt: number,
  commands: readonly SimCommand[] = [],
): SimEvent[] {
  const events: SimEvent[] = [];
  state.tick += 1;
  state.time += dt;

  for (const command of commands) applyCommand(state, command, events);
  releaseExpiredControl(state, events);
  expirePairRequests(state, events);
  regrowResources(state);

  const living = state.entities.filter((entity) => entity.alive);
  for (const entity of living) {
    // A monster earlier in this same step may have killed this one.
    if (!entity.alive) continue;
    entity.age += dt;

    const recentlyHurt =
      state.time - entity.lastAttackedAt < HEALTH_REGEN_DELAY_SECONDS;
    if (!recentlyHurt && entity.energy > 4 && entity.health < 100) {
      const recovery = 0.12 + (entity.energy / 100) * 1.02;
      entity.health = Math.min(100, entity.health + recovery * dt);
    }

    if (isPlayerControlled(entity)) {
      applyPlayerMovement(entity, dt);
      if (entity.energy <= 0) killEntity(state, entity, "energy", null, events);
      continue;
    }

    updateAiEntity(state, entity, living, dt, events);
  }

  hatchEggs(state, events);
  removeExpiredBodies(state);
  return events;
}

/** Convenience wrapper used by tests and the load harness. */
export function runTicks(
  state: WorldSimState,
  ticks: number,
  dt: number,
  commandsByTick: ReadonlyMap<number, SimCommand[]> = new Map(),
) {
  const events: SimEvent[] = [];
  for (let index = 0; index < ticks; index += 1) {
    events.push(...stepWorld(state, dt, commandsByTick.get(index) ?? []));
  }
  return events;
}

export {
  ADULT_AGE_SECONDS,
  EGG_HATCH_SECONDS,
  MATING_COOLDOWN_SECONDS,
  smoothstep,
  nextRandom,
};
