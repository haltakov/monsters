import type { MonsterDna } from "../dna/dna";

export type SimIntent =
  | "wander"
  | "forage"
  | "hunt"
  | "flee"
  | "socialize"
  | "mate"
  | "defend"
  | "rest";

export type LocomotionMode = "land" | "swim" | "dive" | "fly";

/**
 * Normalized player intent. The client never sends a position: only how it
 * wants to move and where it wants to face.
 */
export type PlayerInput = {
  /** -1 (back) … 1 (forward) */
  forward: number;
  /** -1 (left) … 1 (right), camera relative */
  strafe: number;
  /** -1 (left) … 1 (right) explicit turn axis from the arrow keys. */
  turn: number;
  /** Camera yaw in radians: the frame movement input is expressed in. */
  heading: number;
  sprint: boolean;
  /** Monotonic per-connection sequence number. */
  seq: number;
};

export type SimEntity = {
  id: string;
  name: string;
  dna: MonsterDna;
  generation: number;
  parentIds: [string, string] | null;
  mutations: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
  energy: number;
  health: number;
  /** Seconds alive; persisted across restarts. Eggs start at zero on hatching. */
  age: number;
  intent: SimIntent;
  targetId: string | null;
  wanderAngle: number;
  nextDecisionAt: number;
  attackCooldownUntil: number;
  forageCooldownUntil: number;
  mateCooldownUntil: number;
  lastAttackedAt: number;
  lastAttackerId: string | null;
  alive: boolean;
  deathAt: number | null;
  locomotion: LocomotionMode;
  /** Durable owner, or `null` for a wild monster. */
  ownerGuestId: string | null;
  /** Connection currently steering this monster, or `null` for AI control. */
  controllerId: string | null;
  /** When a disconnected monster falls back to AI, in simulation seconds. */
  controlExpiresAt: number | null;
  /** Last input applied; kept so a paused controller keeps its facing. */
  input: PlayerInput | null;
  lastInputSeq: number;
};

export type SimEgg = {
  id: string;
  dna: MonsterDna;
  parentIds: [string, string];
  parentNames: [string, string];
  generation: number;
  x: number;
  y: number;
  z: number;
  laidAt: number;
  hatchAt: number;
  mutations: number;
};

export type PairRequest = {
  id: string;
  fromEntityId: string;
  toEntityId: string;
  fromGuestId: string;
  toGuestId: string;
  createdAt: number;
  expiresAt: number;
};

export type WorldSettings = {
  maxPopulation: number;
  /** Seconds a disconnected monster waits before the AI takes over. */
  controlGraceSeconds: number;
};

export type WorldSimState = {
  version: number;
  seed: number;
  /** Namespace for generated entity ids so worlds never collide in the database. */
  idPrefix: string;
  tick: number;
  /** Seconds of simulated time since the world was created. */
  time: number;
  rng: { value: number };
  entities: SimEntity[];
  eggs: SimEgg[];
  /** Resource id → simulation time at which it becomes available again. */
  depletedResources: Record<string, number>;
  pairRequests: PairRequest[];
  nextEggId: number;
  nextCreatureId: number;
  nextPairRequestId: number;
  stats: { births: number; deaths: number };
  settings: WorldSettings;
};

export type SpawnEntitySpec = {
  id: string;
  name: string;
  dna: MonsterDna;
  ownerGuestId: string | null;
  generation?: number;
  parentIds?: [string, string] | null;
  x?: number;
  y?: number;
  z?: number;
  energy?: number;
  health?: number;
  age?: number;
};

export type SimCommand =
  | { type: "input"; entityId: string; input: PlayerInput }
  | {
      type: "action";
      entityId: string;
      action: "eat" | "attack" | "pair";
      requestId?: string;
    }
  | {
      type: "locomotion";
      entityId: string;
      mode: "fly" | "land" | "dive" | "surface";
    }
  | { type: "pairRespond"; requestId: string; accept: boolean }
  | { type: "attach"; entityId: string; connectionId: string }
  | { type: "detach"; entityId: string; connectionId: string }
  | { type: "spawn"; entity: SpawnEntitySpec }
  | { type: "updateDna"; entityId: string; dna: MonsterDna; name: string };

export type SimEvent =
  | {
      type: "attack";
      tick: number;
      attackerId: string;
      attackerName: string;
      targetId: string;
      targetName: string;
      damage: number;
      defeated: boolean;
      energyReward: number;
    }
  | {
      type: "attackMissed";
      tick: number;
      entityId: string;
      reason: "noTarget" | "playerProtected" | "cooldown" | "dead";
    }
  | {
      type: "feed";
      tick: number;
      entityId: string;
      entityName: string;
      resourceId: string;
      energy: number;
      kind: "tree" | "bush" | "prey";
    }
  | {
      type: "feedFailed";
      tick: number;
      entityId: string;
      reason: "noResource" | "full" | "diet" | "airborne";
    }
  | {
      type: "pairRequested";
      tick: number;
      requestId: string;
      fromEntityId: string;
      fromEntityName: string;
      toEntityId: string;
      toEntityName: string;
      fromGuestId: string;
      toGuestId: string;
      expiresAt: number;
    }
  | {
      type: "pairResolved";
      tick: number;
      requestId: string;
      fromEntityId: string;
      toEntityId: string;
      outcome: "accepted" | "rejected" | "expired";
    }
  | {
      type: "pairFailed";
      tick: number;
      entityId: string;
      reason:
        | "cooldown"
        | "noPartner"
        | "tooFar"
        | "notReady"
        | "populationFull"
        | "pending"
        | "dead";
      partnerName?: string;
      seconds?: number;
    }
  | {
      type: "egg";
      tick: number;
      eggId: string;
      parentIds: [string, string];
      parentNames: [string, string];
      generation: number;
      mutations: number;
      x: number;
      z: number;
    }
  | {
      type: "birth";
      tick: number;
      eggId: string;
      entityId: string;
      name: string;
      generation: number;
      parentIds: [string, string];
      mutations: number;
    }
  | {
      type: "death";
      tick: number;
      entityId: string;
      name: string;
      cause: "energy" | "health" | "age" | "admin";
      adminUserId?: string;
      ageSeconds?: number;
      killerId: string | null;
      ownerGuestId: string | null;
    }
  | {
      type: "control";
      tick: number;
      entityId: string;
      connectionId: string | null;
      ownerGuestId: string | null;
      change: "attached" | "detached" | "aiTakeover";
    }
  | {
      type: "spawned";
      tick: number;
      entityId: string;
      name: string;
      ownerGuestId: string | null;
    }
  | {
      type: "dnaUpdated";
      tick: number;
      entityId: string;
      name: string;
      ownerGuestId: string | null;
    }
  | { type: "worldReset"; tick: number; reason: "daily" | "manual" }
  | { type: "error"; tick: number; message: string; entityId?: string };

export type SimEventType = SimEvent["type"];

/** Events whose loss after a crash would be visible to a player. */
export const CRITICAL_EVENT_TYPES: readonly SimEventType[] = [
  "egg",
  "birth",
  "death",
  "spawned",
  "dnaUpdated",
  "control",
];

export function isCriticalEvent(event: SimEvent) {
  return CRITICAL_EVENT_TYPES.includes(event.type);
}
