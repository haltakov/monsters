import { DEFAULT_MONSTER_DNA, type MonsterDna } from "../src/dna/dna";
import { createWorldState, stepWorld } from "../src/sim/engine";
import { TICK_SECONDS } from "../src/sim/constants";
import type {
  PlayerInput,
  SimCommand,
  SimEntity,
  WorldSimState,
} from "../src/sim/types";

export const SEED = 0x4d4f4e53;

export function emptyWorld(overrides: Partial<WorldSimState> = {}) {
  const state = createWorldState({ seed: SEED });
  state.entities = [];
  state.eggs = [];
  return Object.assign(state, overrides);
}

export function makeEntity(
  id: string,
  overrides: Partial<SimEntity> = {},
): SimEntity {
  return {
    id,
    name: id,
    dna: { ...DEFAULT_MONSTER_DNA },
    generation: 0,
    parentIds: null,
    mutations: 0,
    x: 0,
    y: 0,
    z: 0,
    yaw: 0,
    energy: 100,
    health: 100,
    age: 200,
    intent: "wander",
    targetId: null,
    wanderAngle: 0,
    nextDecisionAt: 0,
    attackCooldownUntil: 0,
    forageCooldownUntil: 0,
    mateCooldownUntil: 0,
    lastAttackedAt: -100,
    lastAttackerId: null,
    alive: true,
    deathAt: null,
    locomotion: "land",
    ownerGuestId: null,
    controllerId: null,
    controlExpiresAt: null,
    input: null,
    lastInputSeq: 0,
    ...overrides,
  };
}

export function makePlayer(
  id: string,
  overrides: Partial<SimEntity> = {},
): SimEntity {
  return makeEntity(id, {
    ownerGuestId: `guest-${id}`,
    controllerId: `socket-${id}`,
    ...overrides,
  });
}

export function input(
  seq: number,
  overrides: Partial<PlayerInput> = {},
): PlayerInput {
  return {
    forward: 0,
    strafe: 0,
    turn: 0,
    heading: 0,
    sprint: false,
    seq,
    ...overrides,
  };
}

export function run(
  state: WorldSimState,
  ticks: number,
  commandsForTick: (tick: number) => SimCommand[] = () => [],
) {
  for (let index = 0; index < ticks; index += 1) {
    stepWorld(state, TICK_SECONDS, commandsForTick(index));
  }
  return state;
}

export function withDna(overrides: Partial<MonsterDna>): MonsterDna {
  return { ...DEFAULT_MONSTER_DNA, ...overrides };
}
