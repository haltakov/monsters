import { encodeMonsterDna } from "../dna/dna";
import { round } from "../mathx";
import type {
  LocomotionMode,
  SimEgg,
  SimEntity,
  SimIntent,
  WorldSimState,
} from "../sim/types";

/** Bumped whenever the wire shape changes incompatibly. */
export const PROTOCOL_VERSION = 1;

/**
 * Radius, in world units, of the area a connection receives entity updates
 * for. Lifecycle and population events are always global.
 */
export const INTEREST_RADIUS = 110;
export const INTEREST_HYSTERESIS = 12;

export type NetEntity = {
  id: string;
  name: string;
  /** Versioned deterministic DNA string; the client decodes it for visuals. */
  dna: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
  health: number;
  energy: number;
  age: number;
  alive: boolean;
  intent: SimIntent;
  loco: LocomotionMode;
  owner: string | null;
  controlled: boolean;
  generation: number;
};

export type NetEntityPatch = Partial<NetEntity> & { id: string };

export type NetEgg = {
  id: string;
  x: number;
  y: number;
  z: number;
  laidAt: number;
  hatchAt: number;
};

export function toNetEntity(entity: SimEntity): NetEntity {
  return {
    id: entity.id,
    name: entity.name,
    dna: encodeMonsterDna(entity.dna),
    x: round(entity.x, 2),
    y: round(entity.y, 2),
    z: round(entity.z, 2),
    yaw: round(entity.yaw, 3),
    health: round(entity.health, 1),
    energy: round(entity.energy, 1),
    age: round(entity.age, 1),
    alive: entity.alive,
    intent: entity.intent,
    loco: entity.locomotion,
    owner: entity.ownerGuestId,
    controlled: entity.controllerId !== null,
    generation: entity.generation,
  };
}

export function toNetEgg(egg: SimEgg): NetEgg {
  return {
    id: egg.id,
    x: round(egg.x, 2),
    y: round(egg.y, 2),
    z: round(egg.z, 2),
    laidAt: round(egg.laidAt, 1),
    hatchAt: round(egg.hatchAt, 1),
  };
}

const NET_ENTITY_KEYS = [
  "name",
  "dna",
  "x",
  "y",
  "z",
  "yaw",
  "health",
  "energy",
  "age",
  "alive",
  "intent",
  "loco",
  "owner",
  "controlled",
  "generation",
] as const satisfies ReadonlyArray<Exclude<keyof NetEntity, "id">>;

/**
 * Field-level delta. Returns `null` when nothing changed so an unchanged
 * entity costs zero bytes.
 */
export function diffNetEntity(
  previous: NetEntity | undefined,
  next: NetEntity,
): NetEntityPatch | null {
  if (!previous) return { ...next };
  const patch: NetEntityPatch = { id: next.id };
  let changed = false;
  for (const key of NET_ENTITY_KEYS) {
    if (previous[key] !== next[key]) {
      Object.assign(patch, { [key]: next[key] });
      changed = true;
    }
  }
  return changed ? patch : null;
}

export function applyNetEntityPatch(
  previous: NetEntity | undefined,
  patch: NetEntityPatch,
): NetEntity {
  return { ...(previous ?? ({} as NetEntity)), ...patch } as NetEntity;
}

export function isWithinInterest(
  entity: { x: number; z: number },
  center: { x: number; z: number } | null,
  radius = INTEREST_RADIUS,
) {
  if (!center) return true;
  return Math.hypot(entity.x - center.x, entity.z - center.z) <= radius;
}

export type WorldPopulation = {
  living: number;
  eggs: number;
  births: number;
  deaths: number;
};

export function readPopulation(state: WorldSimState): WorldPopulation {
  return {
    living: state.entities.reduce(
      (total, entity) => total + (entity.alive ? 1 : 0),
      0,
    ),
    eggs: state.eggs.length,
    births: state.stats.births,
    deaths: state.stats.deaths,
  };
}
