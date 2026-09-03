"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { MonsterNameLabel } from "@/components/game/monster-name-label";
import {
  applyPlayerMovement,
  getMonsterSizeScale,
  type LocomotionMode,
  type MonsterDna,
  type PlayerInput,
  type SimEntity,
} from "@monsters/game-core";
import {
  MonsterVisual,
  type MonsterMotionState,
} from "@/components/game/monster-model";
import type { WorldConnection } from "@/lib/net/world-connection";
import { reconcilePosition } from "@/lib/net/reconciliation";

/** Client input state shared between the DOM handlers and the render loop. */
export type ControlState = {
  keys: Set<string>;
  move: { x: number; y: number };
  look: { x: number; y: number };
  cameraYaw: number;
  cameraPitch: number;
  action: "eat" | "attack" | "mate" | null;
  actionStarted: number;
  paused: boolean;
  /** Mirrors of the authoritative values, for HUD and gating only. */
  energy: number;
  health: number;
  isDead: boolean;
  moving: boolean;
  sprinting: boolean;
  locomotionMode: LocomotionMode;
  playerPosition: { x: number; y: number; z: number };
  /** High-level visiting-agent intent. Human input temporarily overrides it. */
  agent: {
    enabled: boolean;
    commandId: number;
    forward: number;
    strafe: number;
    turn: number;
    sprint: boolean;
    heading: number | null;
    label: string;
  };
};

/** How often normalized input is published to the server. */
const INPUT_SEND_INTERVAL = 1 / 15;
const INPUT_HEARTBEAT_SECONDS = 0.5;

function blankPredictedEntity(dna: MonsterDna): SimEntity {
  return {
    id: "local",
    name: "local",
    dna,
    generation: 0,
    parentIds: null,
    mutations: 0,
    x: 0,
    y: 0,
    z: 0,
    yaw: 0,
    energy: 100,
    health: 100,
    age: 100,
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
    controllerId: "local",
    controlExpiresAt: null,
    input: null,
    lastInputSeq: 0,
  };
}

export function readInput(state: ControlState): Omit<PlayerInput, "seq"> {
  const keys = state.keys;
  const blocked = state.paused || state.isDead;
  const hasHumanMovement =
    keys.has("KeyW") ||
    keys.has("KeyS") ||
    keys.has("KeyA") ||
    keys.has("KeyD") ||
    keys.has("ArrowUp") ||
    keys.has("ArrowDown") ||
    keys.has("ArrowLeft") ||
    keys.has("ArrowRight") ||
    Math.abs(state.move.x) > 0.05 ||
    Math.abs(state.move.y) > 0.05;
  const useAgent = !blocked && state.agent.enabled && !hasHumanMovement;
  const strafe = blocked
    ? 0
    : useAgent
      ? state.agent.strafe
      : (keys.has("KeyD") ? 1 : 0) - (keys.has("KeyA") ? 1 : 0) + state.move.x;
  const forward = blocked
    ? 0
    : useAgent
      ? state.agent.forward
      : (keys.has("KeyW") || keys.has("ArrowUp") ? 1 : 0) -
        (keys.has("KeyS") || keys.has("ArrowDown") ? 1 : 0) +
        state.move.y;
  const turn = blocked
    ? 0
    : useAgent
      ? state.agent.turn
      : (keys.has("ArrowLeft") ? 1 : 0) - (keys.has("ArrowRight") ? 1 : 0);
  return {
    forward: THREE.MathUtils.clamp(forward, -1, 1),
    strafe: THREE.MathUtils.clamp(strafe, -1, 1),
    turn,
    heading: useAgent
      ? (state.agent.heading ?? state.cameraYaw)
      : state.cameraYaw,
    sprint:
      !blocked &&
      (useAgent
        ? state.agent.sprint
        : keys.has("ShiftLeft") || keys.has("ShiftRight")),
  };
}

function sameInput(
  first: Omit<PlayerInput, "seq">,
  second: Omit<PlayerInput, "seq">,
) {
  return (
    Math.abs(first.forward - second.forward) < 0.01 &&
    Math.abs(first.strafe - second.strafe) < 0.01 &&
    first.turn === second.turn &&
    Math.abs(first.heading - second.heading) < 0.01 &&
    first.sprint === second.sprint
  );
}

/**
 * The monster this browser controls.
 *
 * It predicts movement locally with the very same fixed-step function the
 * server runs, then eases towards the authoritative position. Vitals, actions
 * and death always come from the server.
 */
export function PlayerMonster({
  connection,
  controls,
  dna,
  name,
  onFrame,
}: {
  connection: WorldConnection;
  controls: React.RefObject<ControlState>;
  dna: MonsterDna;
  name: string;
  onFrame: (frame: {
    x: number;
    y: number;
    z: number;
    moving: boolean;
    sprinting: boolean;
    mode: LocomotionMode;
  }) => void;
}) {
  const root = useRef<THREE.Group>(null);
  const visual = useRef<THREE.Group>(null);
  const wings = [useRef<THREE.Group>(null), useRef<THREE.Group>(null)];
  const motion = useRef<MonsterMotionState>({
    stride: 0,
    intensity: 0,
    gait: "idle",
  });
  const predicted = useRef<SimEntity>(blankPredictedEntity(dna));
  const initialised = useRef(false);
  const sendAccumulator = useRef(0);
  const heartbeat = useRef(0);
  const sequence = useRef(0);
  const lastSent = useRef<Omit<PlayerInput, "seq"> | null>(null);
  const cameraTarget = useMemo(() => new THREE.Vector3(), []);
  const desiredCamera = useMemo(() => new THREE.Vector3(), []);

  useFrame(({ camera, clock }, delta) => {
    const state = controls.current;
    if (!root.current || !visual.current) return;

    const authoritative = connection.self;
    const entity = predicted.current;
    entity.dna = dna;

    if (authoritative) {
      if (!initialised.current) {
        entity.x = authoritative.net.x;
        entity.y = authoritative.net.y;
        entity.z = authoritative.net.z;
        entity.yaw = authoritative.net.yaw;
        root.current.position.set(entity.x, entity.y, entity.z);
        initialised.current = true;
      }
      entity.energy = authoritative.net.energy;
      entity.health = authoritative.net.health;
      entity.age = authoritative.net.age;
      entity.alive = authoritative.net.alive;
      entity.locomotion = authoritative.net.loco;
    }

    const raw = readInput(state);
    const step = Math.min(delta, 0.1);
    entity.input = { ...raw, seq: sequence.current };
    const canControl =
      connection.isController && entity.alive && !state.paused && !state.isDead;
    if (!canControl) {
      entity.input = {
        ...raw,
        forward: 0,
        strafe: 0,
        turn: 0,
        seq: sequence.current,
      };
    }
    applyPlayerMovement(entity, step);

    if (authoritative) {
      const result = reconcilePosition(
        { x: entity.x, y: entity.y, z: entity.z },
        {
          x: authoritative.net.x,
          y: authoritative.net.y,
          z: authoritative.net.z,
        },
        delta,
      );
      entity.x = result.position.x;
      entity.y = result.position.y;
      entity.z = result.position.z;
      if (result.snapped) {
        root.current.position.set(entity.x, entity.y, entity.z);
      }
    }

    // Publish normalized intent, never a position.
    sendAccumulator.current += delta;
    heartbeat.current += delta;
    if (sendAccumulator.current >= INPUT_SEND_INTERVAL) {
      sendAccumulator.current = 0;
      const changed = !lastSent.current || !sameInput(lastSent.current, raw);
      if (
        canControl &&
        (changed || heartbeat.current >= INPUT_HEARTBEAT_SECONDS)
      ) {
        sequence.current += 1;
        heartbeat.current = 0;
        lastSent.current = raw;
        connection.sendInput({ ...raw, seq: sequence.current });
      }
    }

    const flying = entity.locomotion === "fly";
    const diving = entity.locomotion === "dive";
    const swimming = entity.locomotion === "swim";
    const previousX = root.current.position.x;
    const previousZ = root.current.position.z;

    root.current.position.x = entity.x;
    root.current.position.z = entity.z;
    const cosmeticBob = flying
      ? Math.sin(clock.elapsedTime * 1.8) * 0.22
      : diving
        ? Math.sin(clock.elapsedTime * 2.1) * 0.16
        : swimming
          ? Math.sin(clock.elapsedTime * 2.4) * 0.08
          : 0;
    root.current.position.y = THREE.MathUtils.damp(
      root.current.position.y,
      entity.y + cosmeticBob,
      9,
      delta,
    );
    root.current.rotation.y = entity.yaw;

    const travelled = Math.hypot(
      root.current.position.x - previousX,
      root.current.position.z - previousZ,
    );
    const moving = entity.alive && !state.isDead && travelled > 0.0008;
    const sprinting = moving && raw.sprint;

    onFrame({
      x: entity.x,
      y: entity.y,
      z: entity.z,
      moving,
      sprinting,
      mode: entity.locomotion,
    });

    const cadence = flying
      ? 6.2
      : swimming || diving
        ? 7.4
        : sprinting
          ? 15
          : 10.5;
    const strideAmount = flying
      ? 0.16
      : swimming || diving
        ? 0.34
        : sprinting
          ? 0.68
          : 0.5;
    const stride = moving
      ? Math.sin(clock.elapsedTime * cadence) * strideAmount
      : 0;
    motion.current.stride = stride;
    motion.current.intensity = moving ? (sprinting ? 1 : 0.78) : 0;
    motion.current.gait = flying
      ? "fly"
      : swimming || diving
        ? "swim"
        : sprinting && moving
          ? "sprint"
          : moving
            ? "walk"
            : "idle";
    wings.forEach((wing, index) => {
      if (wing.current) {
        const side = index === 0 ? -1 : 1;
        const flap = flying
          ? Math.abs(Math.sin(clock.elapsedTime * 10.5)) * 0.7
          : 0.04;
        wing.current.rotation.z = side * -(0.38 + flap);
      }
    });

    const actionAge = performance.now() - state.actionStarted;
    let actionPitch = flying
      ? -0.16 + Math.sin(clock.elapsedTime * 2.8) * 0.035
      : diving
        ? 0.08 + Math.sin(clock.elapsedTime * 2.4) * 0.07
        : swimming
          ? Math.sin(clock.elapsedTime * 2.4) * 0.055
          : 0;
    let actionForward = 0;
    let actionDrop = 0;
    let scaleX = 1;
    let scaleY = 1;
    let scaleZ = 1;
    if (!state.isDead && state.action === "attack" && actionAge < 680) {
      const pulse = Math.sin((actionAge / 680) * Math.PI);
      actionPitch = -pulse * 0.34;
      actionForward = -pulse * 0.52;
      scaleX = 1 + pulse * 0.055;
      scaleY = 1 - pulse * 0.045;
    } else if (!state.isDead && state.action === "eat" && actionAge < 920) {
      const pulse = Math.sin((actionAge / 920) * Math.PI);
      actionPitch = pulse * 0.42;
      actionDrop = -pulse * 0.12;
      scaleX = 1 + pulse * 0.045;
      scaleY = 1 - pulse * 0.075;
      scaleZ = 1 + pulse * 0.035;
    } else if (!state.isDead && state.action === "mate" && actionAge < 1050) {
      const pulse = Math.sin((actionAge / 1050) * Math.PI);
      const wiggle = Math.sin((actionAge / 1050) * Math.PI * 4) * pulse;
      actionPitch = -pulse * 0.08;
      actionForward = -pulse * 0.22;
      scaleX = 1 + pulse * 0.07 + wiggle * 0.025;
      scaleY = 1 + pulse * 0.1;
      scaleZ = 1 - pulse * 0.04;
    }
    const walkBob = moving
      ? Math.abs(Math.sin(clock.elapsedTime * cadence)) *
        (sprinting ? 0.09 : swimming || diving || flying ? 0.035 : 0.06)
      : 0;
    visual.current.rotation.x = THREE.MathUtils.damp(
      visual.current.rotation.x,
      actionPitch,
      13,
      delta,
    );
    visual.current.rotation.z = THREE.MathUtils.damp(
      visual.current.rotation.z,
      state.isDead
        ? -Math.PI * 0.47
        : moving
          ? stride * (sprinting ? 0.12 : 0.075)
          : 0,
      5.5,
      delta,
    );
    visual.current.position.z = THREE.MathUtils.damp(
      visual.current.position.z,
      actionForward,
      14,
      delta,
    );
    visual.current.position.y = THREE.MathUtils.damp(
      visual.current.position.y,
      walkBob + actionDrop + (state.isDead ? -0.2 : 0),
      14,
      delta,
    );
    visual.current.scale.x = THREE.MathUtils.damp(
      visual.current.scale.x,
      scaleX,
      14,
      delta,
    );
    visual.current.scale.y = THREE.MathUtils.damp(
      visual.current.scale.y,
      scaleY,
      14,
      delta,
    );
    visual.current.scale.z = THREE.MathUtils.damp(
      visual.current.scale.z,
      scaleZ,
      14,
      delta,
    );

    const distance = flying ? 12 : diving ? 7.2 : 9.4;
    const horizontalDistance = Math.cos(state.cameraPitch) * distance;
    const cameraLift = flying ? 3.3 : diving ? 0.55 : 2.6;
    desiredCamera.set(
      root.current.position.x + Math.sin(state.cameraYaw) * horizontalDistance,
      root.current.position.y +
        cameraLift +
        Math.sin(state.cameraPitch) * distance,
      root.current.position.z + Math.cos(state.cameraYaw) * horizontalDistance,
    );
    camera.position.lerp(desiredCamera, 1 - Math.exp(-delta * 6));
    cameraTarget.set(
      root.current.position.x,
      root.current.position.y + (diving ? 0.9 : 1.35),
      root.current.position.z,
    );
    camera.lookAt(cameraTarget);
  });

  return (
    <group ref={root}>
      <group ref={visual}>
        <MonsterVisual dna={dna} wingRefs={wings} motionRef={motion} />
      </group>
      <MonsterNameLabel
        name={name}
        positionY={2.62 * getMonsterSizeScale(dna.size)}
      />
    </group>
  );
}
