import { WORLD_STATE_VERSION, defaultWorldSettings } from "./engine";
import type { WorldSimState } from "./types";

export class SnapshotVersionError extends Error {
  constructor(
    readonly foundVersion: unknown,
    readonly supportedVersion: number,
  ) {
    super(
      `Unsupported world snapshot version ${String(foundVersion)}; this build supports version ${supportedVersion}.`,
    );
    this.name = "SnapshotVersionError";
  }
}

export class SnapshotShapeError extends Error {
  constructor(message: string) {
    super(`Corrupt world snapshot: ${message}`);
    this.name = "SnapshotShapeError";
  }
}

export function cloneWorldState(state: WorldSimState): WorldSimState {
  return JSON.parse(JSON.stringify(state)) as WorldSimState;
}

/** Plain JSON with no class instances, maps, sets or cycles. */
export function serializeWorldState(state: WorldSimState): unknown {
  return JSON.parse(JSON.stringify(state)) as unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function deserializeWorldState(value: unknown): WorldSimState {
  if (!isRecord(value)) throw new SnapshotShapeError("expected an object");
  const version = value.version;
  if (typeof version !== "number") {
    throw new SnapshotShapeError("missing numeric version");
  }
  if (version > WORLD_STATE_VERSION) {
    throw new SnapshotVersionError(version, WORLD_STATE_VERSION);
  }
  if (version < WORLD_STATE_VERSION) {
    throw new SnapshotVersionError(version, WORLD_STATE_VERSION);
  }
  if (!Array.isArray(value.entities)) {
    throw new SnapshotShapeError("entities must be an array");
  }
  if (!Array.isArray(value.eggs)) {
    throw new SnapshotShapeError("eggs must be an array");
  }
  if (!isRecord(value.rng) || typeof value.rng.value !== "number") {
    throw new SnapshotShapeError("rng state must be a numeric container");
  }
  if (typeof value.tick !== "number" || typeof value.time !== "number") {
    throw new SnapshotShapeError("tick and time must be numbers");
  }

  const state = value as unknown as WorldSimState;
  // Tolerate checkpoints written before a field existed so a rolling deploy of
  // the same major snapshot version keeps working.
  state.depletedResources = isRecord(value.depletedResources)
    ? (value.depletedResources as Record<string, number>)
    : {};
  state.pairRequests = Array.isArray(value.pairRequests)
    ? state.pairRequests
    : [];
  state.stats = isRecord(value.stats)
    ? state.stats
    : { births: 0, deaths: 0 };
  state.settings = { ...defaultWorldSettings(), ...(state.settings ?? {}) };
  state.idPrefix = typeof value.idPrefix === "string" ? value.idPrefix : "";
  state.nextEggId = typeof value.nextEggId === "number" ? value.nextEggId : 1;
  state.nextCreatureId =
    typeof value.nextCreatureId === "number" ? value.nextCreatureId : 1;
  state.nextPairRequestId =
    typeof value.nextPairRequestId === "number" ? value.nextPairRequestId : 1;

  // Live control never survives a restart: every socket is gone.
  for (const entity of state.entities) {
    entity.controllerId = null;
    entity.controlExpiresAt = null;
    entity.input = null;
    entity.lastInputSeq = 0;
  }
  return state;
}

export { WORLD_STATE_VERSION };
