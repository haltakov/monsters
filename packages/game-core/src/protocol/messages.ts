import type { SimEvent } from "../sim/types";
import type { NetEgg, NetEntity, NetEntityPatch, WorldPopulation } from "./net";

/** Socket.IO event names, shared so the client and server cannot drift. */
export const CLIENT_EVENTS = {
  join: "world:join",
  leave: "world:leave",
  input: "world:input",
  action: "world:action",
  locomotion: "world:locomotion",
  pairRespond: "world:pair-respond",
  ack: "world:ack",
} as const;

export const SERVER_EVENTS = {
  snapshot: "world:snapshot",
  delta: "world:delta",
  status: "world:status",
  error: "world:error",
} as const;

export type ClientEventName = (typeof CLIENT_EVENTS)[keyof typeof CLIENT_EVENTS];
export type ServerEventName = (typeof SERVER_EVENTS)[keyof typeof SERVER_EVENTS];

export type JoinPayload = {
  /** Owned, living monster the client wants to control, if any. */
  monsterId?: string | null;
};

export type InputPayload = {
  seq: number;
  forward: number;
  strafe: number;
  turn: number;
  heading: number;
  sprint: boolean;
};

export type ActionPayload = {
  action: "eat" | "attack" | "pair";
};

export type LocomotionPayload = {
  mode: "fly" | "land" | "dive" | "surface";
};

export type PairRespondPayload = {
  requestId: string;
  accept: boolean;
};

export type AckPayload = {
  tick: number;
};

export type WorldSnapshotMessage = {
  protocolVersion: number;
  worldId: string;
  worldName: string;
  tick: number;
  time: number;
  serverTime: number;
  tickRate: number;
  you: {
    guestId: string;
    entityId: string | null;
    connectionId: string;
    /** False when another socket already controls the selected monster. */
    isController: boolean;
  };
  entities: NetEntity[];
  eggs: NetEgg[];
  depletedResources: string[];
  population: WorldPopulation;
};

export type WorldDeltaMessage = {
  tick: number;
  time: number;
  serverTime: number;
  /** Full state for entities entering interest, patches for the rest. */
  upserts: NetEntityPatch[];
  removed: string[];
  eggs: NetEgg[];
  removedEggs: string[];
  resources: { depleted: string[]; restored: string[] };
  events: SimEvent[];
  population: WorldPopulation;
  /** Server sequence number of the last input applied to your entity. */
  ackSeq: number;
};

export type WorldStatusMessage = {
  entityId: string | null;
  isController: boolean;
  reason:
    | "joined"
    | "controlTakenOver"
    | "observer"
    | "monsterDead"
    | "left"
    | "runnerPaused";
};

export type WorldErrorCode =
  | "unauthorized"
  | "invalidPayload"
  | "rateLimited"
  | "staleInput"
  | "notJoined"
  | "notOwner"
  | "worldUnavailable"
  | "protocolVersion";

export type WorldErrorMessage = {
  code: WorldErrorCode;
  message: string;
  detail?: string;
};

/** Bounded client command rates enforced by the gateway. */
export const RATE_LIMITS = {
  inputPerSecond: 30,
  actionPerSecond: 10,
  otherPerSecond: 10,
} as const;
