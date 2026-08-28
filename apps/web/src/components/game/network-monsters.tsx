"use client";

import { Billboard } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef, useState, useSyncExternalStore } from "react";
import * as THREE from "three";
import {
  ADULT_AGE_SECONDS,
  EGG_HATCH_SECONDS,
  dampAngle,
  getCreatureSpeed,
  getMonsterSizeScale,
} from "@monsters/game-core";
import {
  MonsterVisual,
  type MonsterMotionState,
} from "@/components/game/monster-model";
import type { SceneQuality } from "@/components/game/world-scenery";
import type {
  WorldConnection,
  WorldEntityRecord,
} from "@/lib/net/world-connection";
import { renderTime, sampleAt } from "@/lib/net/interpolation";

/**
 * One authoritative monster. Position comes from the interpolated network
 * buffer; the gait is still driven by the *rendered* movement so the existing
 * smooth-mesh animation looks identical to the single-player prototype.
 */
function NetworkMonsterActor({
  connection,
  entityId,
  quality,
}: {
  connection: WorldConnection;
  entityId: string;
  quality: SceneQuality;
}) {
  const root = useRef<THREE.Group>(null);
  const visual = useRef<THREE.Group>(null);
  const vitals = useRef<THREE.Group>(null);
  const healthFill = useRef<THREE.Mesh>(null);
  const energyFill = useRef<THREE.Mesh>(null);
  const record = connection.entities.get(entityId);
  const motion = useRef<MonsterMotionState>({
    stride: 0,
    intensity: 0,
    gait: "idle",
  });
  // A referentially stable mount position keeps React Three Fiber from
  // resetting the transform whenever the HUD rerenders.
  const [initialPosition] = useState<[number, number, number]>(() => [
    record?.net.x ?? 0,
    record?.net.y ?? 0,
    record?.net.z ?? 0,
  ]);
  const [dna] = useState(() => record?.dna);

  useFrame(({ clock }, delta) => {
    const live: WorldEntityRecord | undefined =
      connection.entities.get(entityId);
    if (!root.current || !visual.current || !live) return;

    const previousX = root.current.position.x;
    const previousZ = root.current.position.z;
    const sample =
      sampleAt(live.buffer, renderTime(performance.now())) ??
      ({
        t: 0,
        x: live.net.x,
        y: live.net.y,
        z: live.net.z,
        yaw: live.net.yaw,
      } as const);

    const swimming = live.net.loco === "swim" || live.net.loco === "dive";
    const flying = live.net.loco === "fly";
    const bob = flying
      ? Math.sin(clock.elapsedTime * 1.6) * 0.22
      : swimming
        ? Math.sin(clock.elapsedTime * 2.1) * 0.07
        : 0;

    root.current.position.x = sample.x;
    root.current.position.z = sample.z;
    root.current.position.y = live.net.alive ? sample.y + bob : sample.y;
    root.current.rotation.y = dampAngle(
      root.current.rotation.y,
      sample.yaw,
      12,
      delta,
    );

    const renderedSpeed =
      Math.hypot(
        root.current.position.x - previousX,
        root.current.position.z - previousZ,
      ) / Math.max(delta, 1 / 240);
    const moving = live.net.alive && renderedSpeed > 0.015;
    const sprinting =
      live.net.intent === "flee" ||
      live.net.intent === "hunt" ||
      live.net.intent === "defend";
    const cadence = flying ? 6.2 : swimming ? 7.4 : sprinting ? 14 : 9.5;
    const strideAmount = flying
      ? 0.16
      : swimming
        ? 0.34
        : sprinting
          ? 0.68
          : 0.52;
    const speedRatio = THREE.MathUtils.clamp(
      renderedSpeed / Math.max(0.1, getCreatureSpeed(live.dna)),
      0,
      1,
    );
    motion.current.stride = moving
      ? Math.sin(clock.elapsedTime * cadence) * strideAmount
      : 0;
    motion.current.intensity = moving
      ? THREE.MathUtils.lerp(0.68, 1, speedRatio)
      : 0;
    motion.current.gait = flying
      ? "fly"
      : swimming
        ? "swim"
        : sprinting && moving
          ? "sprint"
          : moving
            ? "walk"
            : "idle";

    // Wild monsters keep the prototype's smaller silhouette and grow from
    // juvenile to adult; a player-owned monster renders at full size.
    const juvenileScale = THREE.MathUtils.lerp(
      0.48,
      0.66,
      THREE.MathUtils.smoothstep(live.net.age, 0, ADULT_AGE_SECONDS),
    );
    visual.current.scale.setScalar(live.net.owner ? 1 : juvenileScale);
    visual.current.rotation.z = THREE.MathUtils.damp(
      visual.current.rotation.z,
      live.net.alive ? 0 : -Math.PI * 0.46,
      6,
      delta,
    );
    const actionPulse =
      live.net.intent === "hunt" || live.net.intent === "defend"
        ? Math.max(0, Math.sin(clock.elapsedTime * 7.5))
        : 0;
    visual.current.position.z = THREE.MathUtils.damp(
      visual.current.position.z,
      -actionPulse * 0.24,
      12,
      delta,
    );

    if (vitals.current) {
      vitals.current.visible =
        live.net.alive && (live.net.health < 98 || live.net.energy < 72);
    }
    const healthRatio = THREE.MathUtils.clamp(live.net.health / 100, 0.015, 1);
    const energyRatio = THREE.MathUtils.clamp(live.net.energy / 100, 0.015, 1);
    if (healthFill.current) {
      healthFill.current.scale.x = healthRatio;
      healthFill.current.position.x = -(1 - healthRatio) * 0.52;
    }
    if (energyFill.current) {
      energyFill.current.scale.x = energyRatio;
      energyFill.current.position.x = -(1 - energyRatio) * 0.52;
    }
  });

  if (!dna) return null;
  const barHeight = 2.25 * getMonsterSizeScale(dna.size);

  return (
    <group ref={root} position={initialPosition}>
      <group ref={visual}>
        <MonsterVisual
          dna={dna}
          motionRef={motion}
          castShadow={quality === "desktop"}
        />
      </group>
      <Billboard position={[0, barHeight, 0]} follow>
        <group ref={vitals}>
          <mesh position={[0, 0.08, 0]} scale={[0.58, 0.065, 0.025]}>
            <planeGeometry args={[2, 1]} />
            <meshBasicMaterial color="#173F35" transparent opacity={0.72} />
          </mesh>
          <mesh
            ref={healthFill}
            position={[0, 0.08, 0.01]}
            scale={[1, 0.045, 0.025]}
          >
            <planeGeometry args={[1.04, 1]} />
            <meshBasicMaterial color="#F18C73" />
          </mesh>
          <mesh position={[0, -0.08, 0]} scale={[0.58, 0.055, 0.025]}>
            <planeGeometry args={[2, 1]} />
            <meshBasicMaterial color="#173F35" transparent opacity={0.72} />
          </mesh>
          <mesh
            ref={energyFill}
            position={[0, -0.08, 0.01]}
            scale={[1, 0.035, 0.025]}
          >
            <planeGeometry args={[1.04, 1]} />
            <meshBasicMaterial color="#B6D94A" />
          </mesh>
        </group>
      </Billboard>
    </group>
  );
}

function NetworkEggActor({
  connection,
  eggId,
}: {
  connection: WorldConnection;
  eggId: string;
}) {
  const root = useRef<THREE.Group>(null);
  const egg = connection.eggs.get(eggId);
  const position = useMemo<[number, number, number]>(
    () => [egg?.x ?? 0, (egg?.y ?? 0) + 0.42, egg?.z ?? 0],
    [egg?.x, egg?.y, egg?.z],
  );

  useFrame(({ clock }) => {
    const live = connection.eggs.get(eggId);
    if (!root.current || !live) return;
    const age = Math.max(0, connection.estimateWorldTime() - live.laidAt);
    const urgency = THREE.MathUtils.smoothstep(
      age,
      EGG_HATCH_SECONDS * 0.6,
      EGG_HATCH_SECONDS,
    );
    root.current.rotation.z =
      Math.sin(clock.elapsedTime * (2.2 + urgency * 5)) *
      (0.04 + urgency * 0.09);
    root.current.position.y =
      live.y + 0.42 + Math.sin(clock.elapsedTime * 1.8) * 0.025;
  });

  if (!egg) return null;
  return (
    <group ref={root} position={position}>
      <mesh scale={[0.38, 0.54, 0.38]} castShadow>
        <sphereGeometry args={[1, 22, 16]} />
        <meshStandardMaterial color="#FFF3D4" roughness={0.72} />
      </mesh>
      <mesh position={[0, 0.04, 0.35]} scale={[0.24, 0.12, 0.04]}>
        <sphereGeometry args={[1, 14, 10]} />
        <meshStandardMaterial color="#F3D65C" roughness={0.7} />
      </mesh>
      <mesh position={[0, -0.37, 0]} scale={[0.58, 0.08, 0.48]}>
        <cylinderGeometry args={[1, 1.12, 1, 18]} />
        <meshStandardMaterial color="#A97855" roughness={1} />
      </mesh>
    </group>
  );
}

const EMPTY_ROSTER = { version: 0, entities: [], eggs: [] };

/** Renders every authoritative entity except the locally predicted player. */
export function NetworkPopulation({
  connection,
  quality,
  selfEntityId,
}: {
  connection: WorldConnection;
  quality: SceneQuality;
  selfEntityId: string | null;
}) {
  // The connection is an external store; subscribing this way keeps the very
  // frequent network updates out of React's render path.
  const roster = useSyncExternalStore(
    useMemo(
      () => (onChange: () => void) => connection.on("roster", onChange),
      [connection],
    ),
    () => connection.getRoster(),
    () => EMPTY_ROSTER,
  );

  return (
    <group>
      {roster.entities
        .filter((id) => id !== selfEntityId)
        .map((id) => (
          <NetworkMonsterActor
            key={id}
            connection={connection}
            entityId={id}
            quality={quality}
          />
        ))}
      {roster.eggs.map((id) => (
        <NetworkEggActor key={id} connection={connection} eggId={id} />
      ))}
    </group>
  );
}
