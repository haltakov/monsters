import { io, type Socket } from "socket.io-client";
import {
  applyNetEntityPatch,
  CLIENT_EVENTS,
  decodeMonsterDna,
  PROTOCOL_VERSION,
  SERVER_EVENTS,
  type MonsterDna,
  type NetEgg,
  type NetEntity,
  type SimEvent,
  type WorldDeltaMessage,
  type WorldErrorMessage,
  type WorldPopulation,
  type WorldSnapshotMessage,
  type WorldStatusMessage,
} from "@monsters/game-core";
import { getSocketUrl } from "./config";
import { pushSample, type MotionSample } from "./interpolation";

export type ConnectionPhase =
  "idle" | "connecting" | "connected" | "reconnecting" | "error";

export type WorldEntityRecord = {
  net: NetEntity;
  dna: MonsterDna;
  buffer: MotionSample[];
};

export type WorldConnectionEvents = {
  phase: (phase: ConnectionPhase, detail?: string) => void;
  roster: () => void;
  snapshot: (message: WorldSnapshotMessage) => void;
  delta: (message: WorldDeltaMessage) => void;
  events: (events: SimEvent[]) => void;
  status: (status: WorldStatusMessage) => void;
  error: (error: WorldErrorMessage) => void;
};

type Listener<K extends keyof WorldConnectionEvents> = WorldConnectionEvents[K];

/**
 * Owns the Socket.IO session and the authoritative view of the world.
 *
 * Deliberately framework-free: React only subscribes to the low-frequency
 * signals, while the render loop reads `entities` directly every frame.
 */
export class WorldConnection {
  readonly entities = new Map<string, WorldEntityRecord>();
  readonly eggs = new Map<string, NetEgg>();
  readonly depletedResources = new Set<string>();
  population: WorldPopulation = { living: 0, eggs: 0, births: 0, deaths: 0 };
  phase: ConnectionPhase = "idle";
  worldId: string | null = null;
  worldName = "";
  tick = 0;
  serverTick = 0;
  entityId: string | null = null;
  isController = false;
  ackSeq = 0;
  lastMessageAt = -1;
  /** Simulation clock in seconds, as of `lastMessageAt`. */
  worldTime = 0;

  private socket: Socket | null = null;
  private listeners: {
    [K in keyof WorldConnectionEvents]: Set<Listener<K>>;
  } = {
    phase: new Set(),
    roster: new Set(),
    snapshot: new Set(),
    delta: new Set(),
    events: new Set(),
    status: new Set(),
    error: new Set(),
  };
  private pendingMonsterId: string | null = null;
  private rosterVersion = 0;
  private rosterCache: {
    version: number;
    entities: string[];
    eggs: string[];
  } | null = null;
  private now: () => number;

  constructor(options: { now?: () => number } = {}) {
    this.now =
      options.now ??
      (() =>
        typeof performance === "undefined" ? Date.now() : performance.now());
  }

  on<K extends keyof WorldConnectionEvents>(
    event: K,
    listener: Listener<K>,
  ): () => void {
    this.listeners[event].add(listener);
    return () => {
      this.listeners[event].delete(listener);
    };
  }

  /**
   * Stable snapshot of which entities exist, for `useSyncExternalStore`. The
   * same object is returned until the roster actually changes.
   */
  getRoster() {
    if (!this.rosterCache || this.rosterCache.version !== this.rosterVersion) {
      this.rosterCache = {
        version: this.rosterVersion,
        entities: [...this.entities.keys()],
        eggs: [...this.eggs.keys()],
      };
    }
    return this.rosterCache;
  }

  private emit<K extends keyof WorldConnectionEvents>(
    event: K,
    ...args: Parameters<Listener<K>>
  ) {
    if (event === "roster") this.rosterVersion += 1;
    for (const listener of this.listeners[event]) {
      (listener as (...values: unknown[]) => void)(...args);
    }
  }

  private setPhase(phase: ConnectionPhase, detail?: string) {
    if (this.phase === phase) return;
    this.phase = phase;
    this.emit("phase", phase, detail);
  }

  /** Simulation clock extrapolated to now, for egg timers and animations. */
  estimateWorldTime() {
    if (this.lastMessageAt < 0) return this.worldTime;
    return this.worldTime + (this.now() - this.lastMessageAt) / 1000;
  }

  get self() {
    return this.entityId ? (this.entities.get(this.entityId) ?? null) : null;
  }

  connect(token: string, url = getSocketUrl()) {
    this.disconnect();
    this.setPhase("connecting");
    const socket = io(url, {
      transports: ["websocket", "polling"],
      auth: { token, protocolVersion: PROTOCOL_VERSION },
      reconnection: true,
      reconnectionDelay: 600,
      reconnectionDelayMax: 5_000,
      forceNew: true,
    });
    this.socket = socket;

    socket.on("connect", () => {
      this.setPhase("connected");
      // A reconnect re-joins the same monster so the server can hand control
      // back to this session instead of creating a second entity.
      if (this.pendingMonsterId !== null) this.join(this.pendingMonsterId);
    });
    socket.on("disconnect", (reason: string) => {
      this.isController = false;
      this.setPhase(
        reason === "io client disconnect" ? "idle" : "reconnecting",
        reason,
      );
    });
    socket.on("connect_error", (error: Error) => {
      this.setPhase(
        error.message.startsWith("unauthorized") ||
          error.message.startsWith("protocolVersion")
          ? "error"
          : "reconnecting",
        error.message,
      );
    });
    socket.on(SERVER_EVENTS.snapshot, (message: WorldSnapshotMessage) =>
      this.applySnapshot(message),
    );
    socket.on(SERVER_EVENTS.delta, (message: WorldDeltaMessage) =>
      this.applyDelta(message),
    );
    socket.on(SERVER_EVENTS.status, (message: WorldStatusMessage) => {
      this.entityId = message.entityId;
      this.isController = message.isController;
      this.emit("status", message);
    });
    socket.on(SERVER_EVENTS.error, (message: WorldErrorMessage) =>
      this.emit("error", message),
    );
    return this;
  }

  join(monsterId: string | null) {
    this.pendingMonsterId = monsterId;
    if (this.socket?.connected)
      this.socket.emit(CLIENT_EVENTS.join, { monsterId });
  }

  sendInput(input: {
    seq: number;
    forward: number;
    strafe: number;
    turn: number;
    heading: number;
    sprint: boolean;
  }) {
    if (this.socket?.connected && this.isController)
      this.socket.emit(CLIENT_EVENTS.input, input);
  }

  sendAction(action: "eat" | "attack" | "pair") {
    if (this.socket?.connected && this.isController)
      this.socket.emit(CLIENT_EVENTS.action, { action });
  }

  sendLocomotion(mode: "fly" | "land" | "dive" | "surface") {
    if (this.socket?.connected && this.isController)
      this.socket.emit(CLIENT_EVENTS.locomotion, { mode });
  }

  respondToPair(requestId: string, accept: boolean) {
    if (this.socket?.connected && this.isController)
      this.socket.emit(CLIENT_EVENTS.pairRespond, { requestId, accept });
  }

  acknowledge(tick: number) {
    if (this.socket?.connected) this.socket.emit(CLIENT_EVENTS.ack, { tick });
  }

  disconnect() {
    this.socket?.removeAllListeners();
    this.socket?.close();
    this.socket = null;
    this.entities.clear();
    this.eggs.clear();
    this.depletedResources.clear();
    this.entityId = null;
    this.isController = false;
    this.pendingMonsterId = null;
    this.worldId = null;
    this.worldName = "";
    this.tick = 0;
    this.serverTick = 0;
    this.ackSeq = 0;
    this.lastMessageAt = -1;
    this.worldTime = 0;
    this.population = { living: 0, eggs: 0, births: 0, deaths: 0 };
    this.emit("roster");
    this.setPhase("idle");
  }

  private upsert(net: NetEntity, at: number) {
    const existing = this.entities.get(net.id);
    if (!existing) {
      const record: WorldEntityRecord = {
        net,
        dna: decodeMonsterDna(net.dna),
        buffer: [{ t: at, x: net.x, y: net.y, z: net.z, yaw: net.yaw }],
      };
      this.entities.set(net.id, record);
      return true;
    }
    const dnaChanged = existing.net.dna !== net.dna;
    existing.net = net;
    if (dnaChanged) existing.dna = decodeMonsterDna(net.dna);
    pushSample(existing.buffer, {
      t: at,
      x: net.x,
      y: net.y,
      z: net.z,
      yaw: net.yaw,
    });
    return false;
  }

  applySnapshot(message: WorldSnapshotMessage) {
    const at = this.now();
    this.lastMessageAt = at;
    this.worldId = message.worldId;
    this.worldName = message.worldName;
    this.tick = message.tick;
    this.serverTick = message.tick;
    this.worldTime = message.time;
    this.entityId = message.you.entityId;
    this.pendingMonsterId = message.you.entityId;
    this.ackSeq = 0;
    this.isController = message.you.isController;
    this.population = message.population;

    this.entities.clear();
    for (const entity of message.entities) this.upsert(entity, at);
    this.eggs.clear();
    for (const egg of message.eggs) this.eggs.set(egg.id, egg);
    this.depletedResources.clear();
    for (const id of message.depletedResources) {
      this.depletedResources.add(id);
    }

    this.emit("snapshot", message);
    this.emit("roster");
  }

  applyDelta(message: WorldDeltaMessage) {
    const at = this.now();
    this.lastMessageAt = at;
    this.tick = message.tick;
    this.serverTick = message.tick;
    this.worldTime = message.time;
    this.population = message.population;
    this.ackSeq = message.ackSeq;

    let rosterChanged = false;
    for (const patch of message.upserts) {
      const previous = this.entities.get(patch.id)?.net;
      const net = applyNetEntityPatch(previous, patch);
      if (this.upsert(net, at)) rosterChanged = true;
    }
    for (const id of message.removed) {
      if (this.entities.delete(id)) rosterChanged = true;
    }
    for (const egg of message.eggs) {
      if (!this.eggs.has(egg.id)) rosterChanged = true;
      this.eggs.set(egg.id, egg);
    }
    for (const id of message.removedEggs) {
      if (this.eggs.delete(id)) rosterChanged = true;
    }
    for (const id of message.resources.depleted) {
      if (!this.depletedResources.has(id)) rosterChanged = true;
      this.depletedResources.add(id);
    }
    for (const id of message.resources.restored) {
      if (this.depletedResources.delete(id)) rosterChanged = true;
    }

    this.emit("delta", message);
    if (message.events.length > 0) this.emit("events", message.events);
    if (rosterChanged) this.emit("roster");
  }
}
