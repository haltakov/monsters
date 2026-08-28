import { io, type Socket } from 'socket.io-client';
import {
  CLIENT_EVENTS,
  PROTOCOL_VERSION,
  SERVER_EVENTS,
  applyNetEntityPatch,
  type NetEntity,
  type SimEvent,
  type WorldDeltaMessage,
  type WorldErrorMessage,
  type WorldSnapshotMessage,
  type WorldStatusMessage,
} from '@monsters/game-core';
import { waitFor } from './harness';

/** Minimal client that mirrors what the browser does with the protocol. */
export class TestClient {
  readonly socket: Socket;
  snapshot: WorldSnapshotMessage | null = null;
  entities = new Map<string, NetEntity>();
  events: SimEvent[] = [];
  errors: WorldErrorMessage[] = [];
  statuses: WorldStatusMessage[] = [];
  deltas = 0;
  ackSeq = 0;
  private seq = 0;

  constructor(url: string, token: string) {
    this.socket = io(url, {
      transports: ['websocket'],
      auth: { token, protocolVersion: PROTOCOL_VERSION },
      forceNew: true,
      reconnection: false,
    });
    this.socket.on(SERVER_EVENTS.snapshot, (message: WorldSnapshotMessage) => {
      this.snapshot = message;
      this.entities = new Map(
        message.entities.map((entity) => [entity.id, entity]),
      );
    });
    this.socket.on(SERVER_EVENTS.delta, (message: WorldDeltaMessage) => {
      this.deltas += 1;
      this.ackSeq = message.ackSeq;
      for (const patch of message.upserts) {
        this.entities.set(
          patch.id,
          applyNetEntityPatch(this.entities.get(patch.id), patch),
        );
      }
      for (const id of message.removed) this.entities.delete(id);
      this.events.push(...message.events);
    });
    this.socket.on(SERVER_EVENTS.status, (message: WorldStatusMessage) =>
      this.statuses.push(message),
    );
    this.socket.on(SERVER_EVENTS.error, (message: WorldErrorMessage) =>
      this.errors.push(message),
    );
  }

  get entityId() {
    return this.snapshot?.you.entityId ?? null;
  }

  get me() {
    const id = this.entityId;
    return id ? (this.entities.get(id) ?? null) : null;
  }

  async connected() {
    await waitFor(() => this.socket.connected, { timeout: 5000 });
    return this;
  }

  async join(monsterId?: string) {
    this.socket.emit(CLIENT_EVENTS.join, { monsterId: monsterId ?? null });
    await waitFor(() => this.snapshot !== null, { timeout: 5000 });
    return this.snapshot!;
  }

  input(
    overrides: Partial<{
      forward: number;
      strafe: number;
      turn: number;
      heading: number;
      sprint: boolean;
      seq: number;
    }> = {},
  ) {
    this.seq += 1;
    this.socket.emit(CLIENT_EVENTS.input, {
      seq: overrides.seq ?? this.seq,
      forward: overrides.forward ?? 0,
      strafe: overrides.strafe ?? 0,
      turn: overrides.turn ?? 0,
      heading: overrides.heading ?? 0,
      sprint: overrides.sprint ?? false,
    });
  }

  raw(event: string, payload: unknown) {
    this.socket.emit(event, payload);
  }

  action(action: 'eat' | 'attack' | 'pair') {
    this.socket.emit(CLIENT_EVENTS.action, { action });
  }

  pairRespond(requestId: string, accept: boolean) {
    this.socket.emit(CLIENT_EVENTS.pairRespond, { requestId, accept });
  }

  async waitForDeltas(count: number) {
    const target = this.deltas + count;
    await waitFor(() => this.deltas >= target, { timeout: 10_000 });
  }

  async waitForEvent<T extends SimEvent['type']>(type: T) {
    await waitFor(() => this.events.some((event) => event.type === type), {
      timeout: 10_000,
    });
    return this.events.find((event) => event.type === type)!;
  }

  close() {
    this.socket.close();
  }
}
