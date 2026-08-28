import { Logger, OnModuleInit } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import {
  CLIENT_EVENTS,
  PROTOCOL_VERSION,
  RATE_LIMITS,
  SERVER_EVENTS,
  sanitizeInput,
  type ActionPayload,
  type AckPayload,
  type InputPayload,
  type JoinPayload,
  type LocomotionPayload,
  type PairRespondPayload,
  type WorldErrorCode,
  type WorldStatusMessage,
} from '@monsters/game-core';
import { getWebOrigins } from '../config/app-config';
import { GuestService } from '../guest/guest.service';
import { readBearerToken } from '../guest/guest-auth.guard';
import {
  buildDelta,
  buildSnapshot,
  createConnectionView,
  type ConnectionView,
} from './world-snapshot.builder';
import { WorldRunnerService } from './world-runner.service';
import { WorldService } from './world.service';

type Bucket = { tokens: number; updatedAt: number };

/** Values the handshake middleware attaches to a socket. */
type SocketData = { guestId?: string; displayName?: string };

function socketData(socket: { data: unknown }): SocketData {
  return socket.data as SocketData;
}

type Session = {
  guestId: string;
  displayName: string;
  entityId: string | null;
  isController: boolean;
  view: ConnectionView;
  buckets: Record<'input' | 'action' | 'other', Bucket>;
};

function createBucket(): Bucket {
  return { tokens: 0, updatedAt: Date.now() };
}

/** Simple in-process token bucket; no Redis in this release. */
function allow(bucket: Bucket, perSecond: number) {
  const now = Date.now();
  const elapsed = (now - bucket.updatedAt) / 1000;
  bucket.updatedAt = now;
  bucket.tokens = Math.max(0, bucket.tokens - elapsed * perSecond);
  if (bucket.tokens >= perSecond) return false;
  bucket.tokens += 1;
  return true;
}

@WebSocketGateway({
  cors: { origin: getWebOrigins(), credentials: true },
  path: '/socket.io',
})
export class WorldGateway
  implements
    OnGatewayInit,
    OnGatewayConnection,
    OnGatewayDisconnect,
    OnModuleInit
{
  private readonly logger = new Logger(WorldGateway.name);
  private readonly sessions = new Map<string, Session>();
  /** entityId → socket id of the single active controller. */
  private readonly controllers = new Map<string, string>();

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly guests: GuestService,
    private readonly runner: WorldRunnerService,
    private readonly worlds: WorldService,
  ) {}

  onModuleInit() {
    this.runner.onPublish(({ state, events }) => {
      for (const [socketId, session] of this.sessions) {
        const socket = this.server?.sockets?.sockets?.get(socketId);
        if (!socket) continue;
        const delta = buildDelta(state, session.view, session.entityId, events);
        socket.emit(SERVER_EVENTS.delta, delta);
      }
    });
  }

  private fail(socket: Socket, code: WorldErrorCode, message: string) {
    socket.emit(SERVER_EVENTS.error, { code, message });
  }

  private sendStatus(socket: Socket, status: WorldStatusMessage) {
    socket.emit(SERVER_EVENTS.status, status);
  }

  /**
   * Authentication happens in the handshake middleware, before Socket.IO
   * delivers a single message, so a client can emit `world:join` immediately
   * after `connect` without racing an async connection handler.
   */
  afterInit(server: Server) {
    server.use((socket, next) => {
      const handshake = socket.handshake;
      const auth = handshake.auth as
        { token?: unknown; protocolVersion?: unknown } | undefined;
      const token =
        (typeof auth?.token === 'string' ? auth.token : null) ??
        readBearerToken(handshake.headers.authorization);
      const clientProtocol = Number(auth?.protocolVersion ?? PROTOCOL_VERSION);
      if (clientProtocol !== PROTOCOL_VERSION) {
        next(
          new Error(
            `protocolVersion: client speaks ${clientProtocol}, server speaks ${PROTOCOL_VERSION}`,
          ),
        );
        return;
      }
      this.guests
        .authenticate(token)
        .then((guest) => {
          socketData(socket).guestId = guest.id;
          socketData(socket).displayName = guest.displayName;
          next();
        })
        .catch(() =>
          next(new Error('unauthorized: a guest token is required')),
        );
    });
  }

  handleConnection(socket: Socket) {
    const { guestId, displayName = '' } = socketData(socket);
    if (!guestId) {
      this.fail(socket, 'unauthorized', 'A valid guest token is required');
      socket.disconnect(true);
      return;
    }
    this.sessions.set(socket.id, {
      guestId,
      displayName,
      entityId: null,
      isController: false,
      view: createConnectionView(),
      buckets: {
        input: createBucket(),
        action: createBucket(),
        other: createBucket(),
      },
    });
    this.runner.setConnectionCount(this.sessions.size);
  }

  handleDisconnect(socket: Socket) {
    const session = this.sessions.get(socket.id);
    this.sessions.delete(socket.id);
    this.runner.setConnectionCount(this.sessions.size);
    if (!session?.entityId) return;
    if (this.controllers.get(session.entityId) === socket.id) {
      this.controllers.delete(session.entityId);
      // The monster stays in the world and falls back to AI after the grace
      // period defined by the simulation settings.
      this.runner.enqueue({
        type: 'detach',
        entityId: session.entityId,
        connectionId: socket.id,
      });
    }
  }

  private requireSession(socket: Socket) {
    const session = this.sessions.get(socket.id);
    if (!session) {
      this.fail(socket, 'unauthorized', 'Reconnect before sending commands');
      return null;
    }
    return session;
  }

  private requireControl(socket: Socket, session: Session) {
    if (!session.entityId) {
      this.fail(socket, 'notJoined', 'Join the world before acting');
      return null;
    }
    if (!session.isController) {
      this.fail(
        socket,
        'notOwner',
        'Another session is currently controlling this monster',
      );
      return null;
    }
    return session.entityId;
  }

  @SubscribeMessage(CLIENT_EVENTS.join)
  async onJoin(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: JoinPayload,
  ) {
    const session = this.requireSession(socket);
    if (!session) return;
    if (!allow(session.buckets.other, RATE_LIMITS.otherPerSecond)) {
      this.fail(socket, 'rateLimited', 'Too many join attempts');
      return;
    }
    const state = this.runner.getState();
    const world = this.runner.getWorld();
    if (!state || !world || !this.runner.isRunning) {
      this.fail(
        socket,
        'worldUnavailable',
        'The world runner is not active on this server yet',
      );
      return;
    }

    const requestedId =
      payload && typeof payload.monsterId === 'string'
        ? payload.monsterId
        : null;
    const monster = await this.worlds.resolveControllableMonster(
      session.guestId,
      requestedId,
    );

    if (!monster) {
      session.entityId = null;
      session.isController = false;
      await socket.join(world.id);
      socket.emit(
        SERVER_EVENTS.snapshot,
        buildSnapshot(state, world, session.view, {
          guestId: session.guestId,
          entityId: null,
          connectionId: socket.id,
          isController: false,
        }),
      );
      this.sendStatus(socket, {
        entityId: null,
        isController: false,
        reason: 'observer',
      });
      return;
    }

    const alreadyInWorld = state.entities.some(
      (entity) => entity.id === monster.id,
    );
    if (!alreadyInWorld) {
      this.runner.enqueue(this.worlds.buildSpawnCommand(monster));
    }

    // Deterministic takeover: the newest socket becomes the controller and the
    // previous one is demoted to an observer.
    const previousSocketId = this.controllers.get(monster.id);
    if (previousSocketId && previousSocketId !== socket.id) {
      const previous = this.sessions.get(previousSocketId);
      if (previous) {
        previous.isController = false;
        const previousSocket =
          this.server?.sockets?.sockets?.get(previousSocketId);
        if (previousSocket) {
          this.sendStatus(previousSocket, {
            entityId: monster.id,
            isController: false,
            reason: 'controlTakenOver',
          });
        }
      }
    }

    this.controllers.set(monster.id, socket.id);
    session.entityId = monster.id;
    session.isController = true;
    this.runner.enqueue({
      type: 'attach',
      entityId: monster.id,
      connectionId: socket.id,
    });
    await socket.join(world.id);

    socket.emit(
      SERVER_EVENTS.snapshot,
      buildSnapshot(state, world, session.view, {
        guestId: session.guestId,
        entityId: monster.id,
        connectionId: socket.id,
        isController: true,
      }),
    );
    this.sendStatus(socket, {
      entityId: monster.id,
      isController: true,
      reason: 'joined',
    });
  }

  @SubscribeMessage(CLIENT_EVENTS.leave)
  onLeave(@ConnectedSocket() socket: Socket) {
    const session = this.requireSession(socket);
    if (!session?.entityId) return;
    if (this.controllers.get(session.entityId) === socket.id) {
      this.controllers.delete(session.entityId);
      this.runner.enqueue({
        type: 'detach',
        entityId: session.entityId,
        connectionId: socket.id,
      });
    }
    const entityId = session.entityId;
    session.entityId = null;
    session.isController = false;
    this.sendStatus(socket, {
      entityId,
      isController: false,
      reason: 'left',
    });
  }

  @SubscribeMessage(CLIENT_EVENTS.input)
  onInput(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: InputPayload,
  ) {
    const session = this.requireSession(socket);
    if (!session) return;
    const entityId = this.requireControl(socket, session);
    if (!entityId) return;
    if (!payload || typeof payload !== 'object') {
      this.fail(socket, 'invalidPayload', 'Input payload must be an object');
      return;
    }
    if (!allow(session.buckets.input, RATE_LIMITS.inputPerSecond)) {
      this.fail(socket, 'rateLimited', 'Input rate exceeded');
      return;
    }
    // sanitizeInput clamps every axis; the engine additionally rejects any
    // sequence number that is not strictly increasing.
    this.runner.enqueue({
      type: 'input',
      entityId,
      input: sanitizeInput({
        forward: payload.forward,
        strafe: payload.strafe,
        turn: payload.turn,
        heading: payload.heading,
        sprint: payload.sprint,
        seq: payload.seq,
      }),
    });
  }

  @SubscribeMessage(CLIENT_EVENTS.action)
  onAction(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: ActionPayload,
  ) {
    const session = this.requireSession(socket);
    if (!session) return;
    const entityId = this.requireControl(socket, session);
    if (!entityId) return;
    const action = payload?.action;
    if (action !== 'eat' && action !== 'attack' && action !== 'pair') {
      this.fail(socket, 'invalidPayload', 'Unknown action');
      return;
    }
    if (!allow(session.buckets.action, RATE_LIMITS.actionPerSecond)) {
      this.fail(socket, 'rateLimited', 'Action rate exceeded');
      return;
    }
    this.runner.enqueue({ type: 'action', entityId, action });
  }

  @SubscribeMessage(CLIENT_EVENTS.locomotion)
  onLocomotion(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: LocomotionPayload,
  ) {
    const session = this.requireSession(socket);
    if (!session) return;
    const entityId = this.requireControl(socket, session);
    if (!entityId) return;
    const mode = payload?.mode;
    if (
      mode !== 'fly' &&
      mode !== 'land' &&
      mode !== 'dive' &&
      mode !== 'surface'
    ) {
      this.fail(socket, 'invalidPayload', 'Unknown locomotion mode');
      return;
    }
    if (!allow(session.buckets.other, RATE_LIMITS.otherPerSecond)) {
      this.fail(socket, 'rateLimited', 'Command rate exceeded');
      return;
    }
    this.runner.enqueue({ type: 'locomotion', entityId, mode });
  }

  @SubscribeMessage(CLIENT_EVENTS.pairRespond)
  onPairRespond(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: PairRespondPayload,
  ) {
    const session = this.requireSession(socket);
    if (!session) return;
    const entityId = this.requireControl(socket, session);
    if (!entityId) return;
    if (!payload || typeof payload.requestId !== 'string') {
      this.fail(socket, 'invalidPayload', 'A pairing requestId is required');
      return;
    }
    if (!allow(session.buckets.other, RATE_LIMITS.otherPerSecond)) {
      this.fail(socket, 'rateLimited', 'Command rate exceeded');
      return;
    }
    const state = this.runner.getState();
    const request = state?.pairRequests.find(
      (candidate) => candidate.id === payload.requestId,
    );
    // Only the addressed player may answer a pairing request.
    if (!request || request.toEntityId !== entityId) {
      this.fail(socket, 'notOwner', 'That pairing request is not yours');
      return;
    }
    this.runner.enqueue({
      type: 'pairRespond',
      requestId: payload.requestId,
      accept: payload.accept === true,
    });
  }

  @SubscribeMessage(CLIENT_EVENTS.ack)
  onAck(@ConnectedSocket() socket: Socket, @MessageBody() payload: AckPayload) {
    const session = this.sessions.get(socket.id);
    if (!session || !payload || typeof payload.tick !== 'number') return;
    session.view.lastAckedTick = Math.max(
      session.view.lastAckedTick,
      Math.floor(payload.tick),
    );
  }

  /** Test and diagnostics helper. */
  get connectionCount() {
    return this.sessions.size;
  }
}
