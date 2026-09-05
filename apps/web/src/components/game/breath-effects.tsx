"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import {
  BREATH_DURATION_SECONDS,
  type BreathElement,
  type SimEvent,
} from "@monsters/game-core";
import type { WorldConnection } from "@/lib/net/world-connection";

type BreathEvent = Extract<SimEvent, { type: "breath" }>;
type Burst = { event: BreathEvent; started: number };
const MAX_BURSTS = 16;
const PARTICLES = 48;
const COLORS: Record<BreathElement, [string, string]> = {
  radioactive: ["#164dff", "#3ecbff"],
  fire: ["#ff491b", "#fff09a"],
  water: ["#21bbdc", "#e1ffff"],
  poison: ["#69ce27", "#dbff75"],
};

/** A fixed particle budget, shared by every visible monster's confirmed casts. */
export function BreathEffects({ connection }: { connection: WorldConnection }) {
  const particles = useRef<THREE.InstancedMesh>(null);
  const rings = useRef<THREE.InstancedMesh>(null);
  const bursts = useRef<(Burst | null)[]>(Array(MAX_BURSTS).fill(null));
  const slot = useRef(0);
  const clock = useRef(0);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const color = useMemo(() => new THREE.Color(), []);
  const palette = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(COLORS).map(([key, values]) => [
          key,
          values.map((value) => new THREE.Color(value)),
        ]),
      ) as Record<BreathElement, THREE.Color[]>,
    [],
  );

  useEffect(() => {
    const offEvents = connection.on("events", (events) => {
      for (const event of events) {
        if (event.type === "worldReset") bursts.current.fill(null);
        if (event.type !== "breath") continue;
        bursts.current[slot.current] = { event, started: clock.current };
        slot.current = (slot.current + 1) % MAX_BURSTS;
      }
    });
    const offSnapshot = connection.on("snapshot", () =>
      bursts.current.fill(null),
    );
    return () => {
      offEvents();
      offSnapshot();
    };
  }, [connection]);

  useFrame((_, delta) => {
    if (!particles.current) return;
    clock.current += delta;
    let count = 0;
    let ringCount = 0;
    for (let index = 0; index < MAX_BURSTS; index++) {
      const burst = bursts.current[index];
      if (!burst) continue;
      const elapsed = clock.current - burst.started;
      if (elapsed > BREATH_DURATION_SECONDS) {
        bursts.current[index] = null;
        continue;
      }
      const { event } = burst;
      const dx = -Math.sin(event.yaw);
      const dz = -Math.cos(event.yaw);
      if (event.element === "radioactive" && rings.current && event.range > 0) {
        for (let ring = 0; ring < 3; ring++) {
          const age = (elapsed - ring * 0.08) / 0.65;
          if (age < 0 || age > 1) continue;
          const distance = age * event.range;
          dummy.position.set(
            event.x + dx * distance,
            event.y,
            event.z + dz * distance,
          );
          dummy.rotation.set(0, event.yaw, 0);
          dummy.scale.setScalar(
            (0.2 + distance * 0.16) * Math.sin(Math.PI * age),
          );
          dummy.updateMatrix();
          rings.current.setMatrixAt(ringCount++, dummy.matrix);
        }
      }
      dummy.rotation.set(0, event.yaw, 0);
      for (let particle = 0; particle < PARTICLES; particle++) {
        const age = (elapsed - (particle / PARTICLES) * 0.25) / 0.6;
        if (age < 0 || age > 1 || event.range <= 0) continue;
        const distance = age * event.range;
        const spiral =
          particle * 2.399 + age * (event.element === "radioactive" ? 13 : 4);
        const spread = (0.08 + distance * 0.11) * (((particle % 5) + 1) / 5);
        const side = Math.cos(spiral) * spread;
        const drift =
          event.element === "fire"
            ? age * 0.6
            : event.element === "water"
              ? -age * age * 0.5
              : 0;
        dummy.position.set(
          event.x + dx * distance + dz * side,
          event.y + Math.sin(spiral) * spread + drift,
          event.z + dz * distance - dx * side,
        );
        const size = (event.element === "poison" ? 0.42 : 0.23) + age * 0.35;
        const fade = Math.sin(Math.PI * age) ** 0.4;
        dummy.scale.set(
          size * fade,
          size * fade * (event.element === "water" ? 1.5 : 1),
          size * fade * (event.element === "fire" ? 1.8 : 1),
        );
        dummy.updateMatrix();
        particles.current.setMatrixAt(count, dummy.matrix);
        color
          .copy(palette[event.element][0])
          .lerp(palette[event.element][1], (particle % 7) / 6);
        particles.current.setColorAt(count, color);
        count++;
      }
    }
    if (rings.current) {
      rings.current.count = ringCount;
      rings.current.instanceMatrix.needsUpdate = true;
    }
    particles.current.count = count;
    particles.current.instanceMatrix.needsUpdate = true;
    if (particles.current.instanceColor)
      particles.current.instanceColor.needsUpdate = true;
  });

  return (
    <>
      <instancedMesh
        ref={particles}
        count={0}
        args={[undefined, undefined, MAX_BURSTS * PARTICLES]}
        frustumCulled={false}
      >
        <icosahedronGeometry args={[1, 1]} />
        <meshBasicMaterial
          transparent
          opacity={0.9}
          depthWrite={false}
          toneMapped={false}
        />
      </instancedMesh>
      <instancedMesh
        ref={rings}
        count={0}
        args={[undefined, undefined, MAX_BURSTS * 3]}
        frustumCulled={false}
      >
        <torusGeometry args={[1, 0.045, 4, 24]} />
        <meshBasicMaterial
          color="#66eaff"
          transparent
          opacity={0.7}
          depthWrite={false}
          toneMapped={false}
          blending={THREE.AdditiveBlending}
        />
      </instancedMesh>
    </>
  );
}
