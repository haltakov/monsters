import {
  INTEREST_RADIUS,
  PROTOCOL_VERSION,
  TICK_RATE,
  diffNetEntity,
  isWithinInterest,
  readPopulation,
  toNetEgg,
  toNetEntity,
  type NetEntity,
  type NetEntityPatch,
  type SimEvent,
  type WorldDeltaMessage,
  type WorldSimState,
  type WorldSnapshotMessage,
} from '@monsters/game-core';

/** Per-connection view state used to build interest-filtered deltas. */
export type ConnectionView = {
  entities: Map<string, NetEntity>;
  eggs: Set<string>;
  depleted: Set<string>;
  lastAckedTick: number;
};

export function createConnectionView(): ConnectionView {
  return {
    entities: new Map(),
    eggs: new Set(),
    depleted: new Set(),
    lastAckedTick: 0,
  };
}

function interestCenter(state: WorldSimState, entityId: string | null) {
  if (!entityId) return null;
  const entity = state.entities.find((candidate) => candidate.id === entityId);
  return entity ? { x: entity.x, z: entity.z } : null;
}

export function buildSnapshot(
  state: WorldSimState,
  world: { id: string; name: string },
  view: ConnectionView,
  you: {
    guestId: string;
    entityId: string | null;
    connectionId: string;
    isController: boolean;
  },
): WorldSnapshotMessage {
  const center = interestCenter(state, you.entityId);
  view.entities.clear();
  view.eggs.clear();
  view.depleted.clear();

  const entities: NetEntity[] = [];
  for (const entity of state.entities) {
    if (!isWithinInterest(entity, center, INTEREST_RADIUS)) continue;
    const net = toNetEntity(entity);
    view.entities.set(net.id, net);
    entities.push(net);
  }
  const eggs = state.eggs.map((egg) => {
    view.eggs.add(egg.id);
    return toNetEgg(egg);
  });
  const depletedResources = Object.keys(state.depletedResources);
  for (const id of depletedResources) view.depleted.add(id);

  return {
    protocolVersion: PROTOCOL_VERSION,
    worldId: world.id,
    worldName: world.name,
    tick: state.tick,
    time: state.time,
    serverTime: Date.now(),
    tickRate: TICK_RATE,
    you,
    entities,
    eggs,
    depletedResources,
    population: readPopulation(state),
  };
}

/**
 * Interest-filtered delta for one connection: only fields that changed, plus
 * explicit removals for entities that left the interest area.
 */
export function buildDelta(
  state: WorldSimState,
  view: ConnectionView,
  entityId: string | null,
  events: SimEvent[],
): WorldDeltaMessage {
  const center = interestCenter(state, entityId);
  const upserts: NetEntityPatch[] = [];
  const seen = new Set<string>();

  for (const entity of state.entities) {
    if (!isWithinInterest(entity, center, INTEREST_RADIUS)) continue;
    seen.add(entity.id);
    const net = toNetEntity(entity);
    const patch = diffNetEntity(view.entities.get(entity.id), net);
    view.entities.set(entity.id, net);
    if (patch) upserts.push(patch);
  }

  const removed: string[] = [];
  for (const id of view.entities.keys()) {
    if (!seen.has(id)) {
      removed.push(id);
      view.entities.delete(id);
    }
  }

  const eggs = [];
  const liveEggs = new Set<string>();
  for (const egg of state.eggs) {
    liveEggs.add(egg.id);
    if (!view.eggs.has(egg.id)) {
      view.eggs.add(egg.id);
      eggs.push(toNetEgg(egg));
    }
  }
  const removedEggs: string[] = [];
  for (const id of view.eggs) {
    if (!liveEggs.has(id)) {
      removedEggs.push(id);
      view.eggs.delete(id);
    }
  }

  const depleted: string[] = [];
  const restored: string[] = [];
  const current = new Set(Object.keys(state.depletedResources));
  for (const id of current) {
    if (!view.depleted.has(id)) {
      view.depleted.add(id);
      depleted.push(id);
    }
  }
  for (const id of view.depleted) {
    if (!current.has(id)) {
      view.depleted.delete(id);
      restored.push(id);
    }
  }

  const you = entityId
    ? state.entities.find((candidate) => candidate.id === entityId)
    : null;

  return {
    tick: state.tick,
    time: state.time,
    serverTime: Date.now(),
    upserts,
    removed,
    eggs,
    removedEggs,
    resources: { depleted, restored },
    events: filterEvents(events, entityId, view),
    population: readPopulation(state),
    ackSeq: you?.lastInputSeq ?? 0,
  };
}

const GLOBAL_EVENT_TYPES = new Set<SimEvent['type']>([
  'birth',
  'death',
  'egg',
  'worldReset',
]);

/** A connection sees global lifecycle events plus everything it is part of. */
function filterEvents(
  events: SimEvent[],
  entityId: string | null,
  view: ConnectionView,
) {
  return events.filter((event) => {
    if (GLOBAL_EVENT_TYPES.has(event.type)) return true;
    if (!entityId) return false;
    switch (event.type) {
      case 'attack':
        return event.attackerId === entityId || event.targetId === entityId;
      case 'attackMissed':
      case 'feed':
      case 'feedFailed':
      case 'pairFailed':
      case 'spawned':
      case 'dnaUpdated':
      case 'control':
        return event.entityId === entityId;
      case 'pairRequested':
        return event.fromEntityId === entityId || event.toEntityId === entityId;
      case 'pairResolved':
        return event.fromEntityId === entityId || event.toEntityId === entityId;
      default:
        return view.entities.has(entityId);
    }
  });
}
