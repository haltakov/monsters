"use client";

import Link from "next/link";
import { Canvas, useFrame } from "@react-three/fiber";
import { Float, Sky, Sparkles } from "@react-three/drei";
import {
  ArrowLeft,
  Crosshair,
  Dna,
  Leaf,
  MousePointer2,
  Swords,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { MonsterMark } from "@/components/monster-mark";

type Action = "eat" | "attack" | null;
type EdibleKind = "tree" | "bush";

type Edible = {
  id: string;
  kind: EdibleKind;
  x: number;
  z: number;
  energy: number;
};

type ControlState = {
  keys: Set<string>;
  move: { x: number; y: number };
  look: { x: number; y: number };
  cameraYaw: number;
  characterYaw: number;
  cameraPitch: number;
  action: Action;
  actionStarted: number;
  energy: number;
  isDead: boolean;
  moving: boolean;
  sprinting: boolean;
  playerPosition: { x: number; z: number };
};

const WORLD_AREA_MULTIPLIER = 10;
const WORLD_SCALE = Math.sqrt(WORLD_AREA_MULTIPLIER);
const WORLD_RADIUS = 40 * WORLD_SCALE;
const PLAYABLE_RADIUS = 38.2 * WORLD_SCALE;
const BRIDGE_POSITIONS = [-96, -58, -20, 20, 58, 96] as const;
const WALK_ENERGY_PER_SECOND = 1.2;
const SPRINT_ENERGY_PER_SECOND = 3.8;
const ATTACK_ENERGY_COST = 7;
const EAT_DISTANCE = 4.2;

function normalizeAngle(angle: number) {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

function dampAngle(
  current: number,
  target: number,
  smoothing: number,
  delta: number,
) {
  const difference = normalizeAngle(target - current);
  return normalizeAngle(
    current + difference * (1 - Math.exp(-smoothing * delta)),
  );
}

const TREES: Array<[number, number, number]> = [
  [-18, -13, 0.9],
  [-14, 14, 1.15],
  [-11, -4, 0.8],
  [-8, 19, 1.05],
  [11, 16, 1.2],
  [17, 10, 0.9],
  [20, -7, 1.15],
  [13, -17, 0.95],
  [-20, 5, 0.85],
  [8, -9, 0.8],
  [20, 2, 0.72],
  [-4, -20, 0.95],
  [-31, -16, 1.1],
  [-29, 10, 0.94],
  [-24, 25, 1.18],
  [-12, 31, 0.86],
  [5, 33, 1.08],
  [23, 27, 0.96],
  [31, 14, 1.16],
  [32, -11, 0.88],
  [24, -28, 1.06],
  [-19, -29, 0.92],
];

const BUSHES: Array<[number, number, number]> = [
  [-16, 2, 0.9],
  [-12, -15, 0.75],
  [-6, 11, 0.8],
  [8, 20, 0.9],
  [15, 6, 0.75],
  [18, -13, 0.8],
  [7, -18, 0.65],
  [-20, -5, 0.75],
  [-31, 2, 0.86],
  [-26, -24, 0.72],
  [-18, 29, 0.82],
  [1, 29, 0.76],
  [18, 28, 0.9],
  [30, 5, 0.78],
  [28, -22, 0.84],
  [8, -32, 0.7],
];

const ROCKS: Array<[number, number, number, number]> = [
  [-17, 9, 0.8, 0.4],
  [-9, -17, 1.1, -0.3],
  [-4, 15, 0.65, 0.2],
  [10, 11, 0.9, 0.6],
  [17, -2, 1.2, -0.2],
  [4, -14, 0.7, 0.35],
  [-30, -8, 1.1, 0.2],
  [-25, 22, 0.82, -0.45],
  [-6, 31, 1.28, 0.1],
  [21, 26, 0.92, 0.52],
  [31, -14, 1.16, -0.18],
  [17, -30, 0.88, 0.36],
];

const PLANTS: Array<[number, number]> = [
  [-8, 7],
  [-14, -8],
  [-18, 15],
  [8, 6],
  [14, 13],
  [16, -10],
  [4, -19],
  [-2, 19],
  [-29, 7],
  [-25, -21],
  [-16, 30],
  [0, 33],
  [20, 29],
  [30, 9],
  [27, -23],
  [-3, -32],
];

function riverX(z: number) {
  return 3.8 + Math.sin(z * 0.12) * 2.7;
}

function terrainHeight(x: number, z: number) {
  const radius = Math.hypot(x, z);
  const edge = THREE.MathUtils.smoothstep(WORLD_RADIUS - radius, 0, 10);
  const hillA = Math.exp(-((x + 19) ** 2 + (z - 12) ** 2) / 130) * 3.1;
  const hillB = Math.exp(-((x - 20) ** 2 + (z + 15) ** 2) / 155) * 2.75;
  const hillC = Math.exp(-((x - 23) ** 2 + (z - 23) ** 2) / 145) * 2.2;
  const hillD = Math.exp(-((x + 15) ** 2 + (z + 24) ** 2) / 175) * 1.8;
  const hillE = Math.exp(-((x + 72) ** 2 + (z - 48) ** 2) / 510) * 2.65;
  const hillF = Math.exp(-((x - 77) ** 2 + (z + 54) ** 2) / 620) * 3.2;
  const hillG = Math.exp(-((x - 68) ** 2 + (z - 72) ** 2) / 560) * 2.4;
  const hillH = Math.exp(-((x + 79) ** 2 + (z + 66) ** 2) / 680) * 2.9;
  const hillI = Math.exp(-((x + 8) ** 2 + (z - 88) ** 2) / 470) * 2.15;
  const hillJ = Math.exp(-((x - 14) ** 2 + (z + 91) ** 2) / 530) * 2.35;
  const ripple = (Math.sin(x * 0.25) + Math.cos(z * 0.23)) * 0.07;
  const riverFlatten = THREE.MathUtils.smoothstep(
    Math.abs(x - riverX(z)),
    0.7,
    4,
  );
  return Math.max(
    -0.12,
    (0.12 +
      (hillA +
        hillB +
        hillC +
        hillD +
        hillE +
        hillF +
        hillG +
        hillH +
        hillI +
        hillJ +
        ripple) *
        riverFlatten) *
      edge,
  );
}

function isBlockedByWater(x: number, z: number) {
  if (Math.hypot(x, z) > PLAYABLE_RADIUS) return true;
  const bridge = BRIDGE_POSITIONS.some(
    (bridgeZ) => Math.abs(z - bridgeZ) < 1.45,
  );
  return Math.abs(x - riverX(z)) < 1.48 && !bridge;
}

function createRandom(seed: number) {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

function scatterPositions(count: number, seed: number) {
  const random = createRandom(seed);
  const positions: Array<[number, number]> = [];
  const innerRadius = 36;
  const outerRadius = PLAYABLE_RADIUS - 5;

  while (positions.length < count) {
    const angle = random() * Math.PI * 2;
    const radius = Math.sqrt(
      innerRadius ** 2 + random() * (outerRadius ** 2 - innerRadius ** 2),
    );
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    if (Math.abs(x - riverX(z)) < 4.2) continue;
    positions.push([x, z]);
  }

  return positions;
}

const EXTRA_TREES: Array<[number, number, number]> = scatterPositions(
  78,
  1847,
).map(([x, z], index) => [x, z, 0.72 + (index % 7) * 0.075]);
const EXTRA_BUSHES: Array<[number, number, number]> = scatterPositions(
  68,
  7319,
).map(([x, z], index) => [x, z, 0.62 + (index % 6) * 0.06]);
const EXTRA_ROCKS: Array<[number, number, number, number]> = scatterPositions(
  52,
  9923,
).map(([x, z], index) => [
  x,
  z,
  0.62 + (index % 8) * 0.08,
  ((index * 1.71) % Math.PI) - Math.PI / 2,
]);
const EXTRA_PLANTS = scatterPositions(86, 4213);
const ALL_TREES = [...TREES, ...EXTRA_TREES];
const ALL_BUSHES = [...BUSHES, ...EXTRA_BUSHES];
const EDIBLES: Edible[] = [
  ...ALL_TREES.map(([x, z], index) => ({
    id: `tree-${index}`,
    kind: "tree" as const,
    x,
    z,
    energy: 42,
  })),
  ...ALL_BUSHES.map(([x, z], index) => ({
    id: `bush-${index}`,
    kind: "bush" as const,
    x,
    z,
    energy: 28,
  })),
];

function Terrain() {
  const geometry = useMemo(() => {
    const size = WORLD_RADIUS * 2 + 4;
    const segments = 184;
    const vertices: number[] = [];
    const indices: number[] = [];

    for (let zIndex = 0; zIndex <= segments; zIndex += 1) {
      for (let xIndex = 0; xIndex <= segments; xIndex += 1) {
        const x = (xIndex / segments - 0.5) * size;
        const z = (zIndex / segments - 0.5) * size;
        vertices.push(x, terrainHeight(x, z), z);
      }
    }

    for (let zIndex = 0; zIndex < segments; zIndex += 1) {
      for (let xIndex = 0; xIndex < segments; xIndex += 1) {
        const x = ((xIndex + 0.5) / segments - 0.5) * size;
        const z = ((zIndex + 0.5) / segments - 0.5) * size;
        if (Math.hypot(x, z) > WORLD_RADIUS - 0.3) continue;
        const a = zIndex * (segments + 1) + xIndex;
        const b = a + 1;
        const c = a + segments + 1;
        const d = c + 1;
        indices.push(a, c, b, b, c, d);
      }
    }

    const result = new THREE.BufferGeometry();
    result.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(vertices, 3),
    );
    result.setIndex(indices);
    result.computeVertexNormals();
    return result;
  }, []);

  return (
    <>
      <mesh geometry={geometry} receiveShadow>
        <meshStandardMaterial color="#72B95A" roughness={0.92} />
      </mesh>
      <mesh position={[0, -0.5, 0]} receiveShadow>
        <cylinderGeometry
          args={[WORLD_RADIUS, WORLD_RADIUS - 1.4, 1.08, 192]}
        />
        <meshStandardMaterial color="#E4C16E" roughness={1} />
      </mesh>
    </>
  );
}

function Sea() {
  const sea = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (sea.current)
      sea.current.position.y =
        -0.42 + Math.sin(clock.elapsedTime * 0.7) * 0.035;
  });

  return (
    <mesh
      ref={sea}
      position={[0, -0.42, 0]}
      rotation={[-Math.PI / 2, 0, 0]}
      receiveShadow
    >
      <circleGeometry args={[420, 192]} />
      <meshStandardMaterial
        color="#4AAFC5"
        roughness={0.32}
        metalness={0.05}
        transparent
        opacity={0.88}
      />
    </mesh>
  );
}

function River() {
  const segments = useMemo(
    () =>
      Array.from({ length: 128 }, (_, index) => {
        const riverExtent = PLAYABLE_RADIUS + 0.5;
        const segmentLength = (riverExtent * 2) / 127;
        const z = -riverExtent + index * segmentLength;
        const nextZ = Math.min(riverExtent, z + segmentLength);
        const x = riverX(z);
        const nextX = riverX(nextZ);
        return {
          x: (x + nextX) / 2,
          z: (z + nextZ) / 2,
          angle: Math.atan2(nextX - x, nextZ - z),
        };
      }),
    [],
  );

  return (
    <group>
      {segments.map((segment, index) => (
        <mesh
          key={index}
          position={[segment.x, 0.16, segment.z]}
          rotation={[0, segment.angle, 0]}
          receiveShadow
        >
          <boxGeometry args={[2.85, 0.09, 2.35]} />
          <meshStandardMaterial
            color="#55B8CE"
            roughness={0.2}
            metalness={0.06}
          />
        </mesh>
      ))}
      {BRIDGE_POSITIONS.map((z) => (
        <Bridge key={z} z={z} />
      ))}
    </group>
  );
}

function Bridge({ z }: { z: number }) {
  const x = riverX(z);
  return (
    <group position={[x, terrainHeight(x, z) + 0.27, z]}>
      {Array.from({ length: 7 }, (_, index) => (
        <mesh
          key={index}
          position={[0, 0, (index - 3) * 0.36]}
          castShadow
          receiveShadow
        >
          <boxGeometry args={[3.65, 0.18, 0.3]} />
          <meshStandardMaterial
            color={index % 2 ? "#A8683D" : "#BC7B48"}
            roughness={0.95}
          />
        </mesh>
      ))}
      <mesh position={[-1.62, -0.18, 0]} castShadow>
        <boxGeometry args={[0.18, 0.25, 2.6]} />
        <meshStandardMaterial color="#70452F" />
      </mesh>
      <mesh position={[1.62, -0.18, 0]} castShadow>
        <boxGeometry args={[0.18, 0.25, 2.6]} />
        <meshStandardMaterial color="#70452F" />
      </mesh>
    </group>
  );
}

function Tree({ x, z, scale }: { x: number; z: number; scale: number }) {
  return (
    <group position={[x, terrainHeight(x, z), z]} scale={scale}>
      <mesh position={[0, 1.25, 0]} castShadow>
        <cylinderGeometry args={[0.28, 0.42, 2.5, 18]} />
        <meshStandardMaterial color="#855333" roughness={1} />
      </mesh>
      <mesh position={[0, 3.15, 0]} scale={[1, 1.05, 0.96]} castShadow>
        <sphereGeometry args={[1.45, 24, 18]} />
        <meshStandardMaterial color="#2F7D4A" roughness={0.95} />
      </mesh>
      <mesh position={[-0.8, 2.75, 0.3]} castShadow>
        <sphereGeometry args={[0.9, 22, 16]} />
        <meshStandardMaterial color="#3E9152" roughness={1} />
      </mesh>
      <mesh position={[0.78, 2.75, 0.2]} castShadow>
        <sphereGeometry args={[0.85, 22, 16]} />
        <meshStandardMaterial color="#4BA15A" roughness={1} />
      </mesh>
    </group>
  );
}

function Bush({ x, z, scale }: { x: number; z: number; scale: number }) {
  return (
    <group position={[x, terrainHeight(x, z) + 0.48 * scale, z]} scale={scale}>
      <mesh position={[-0.48, 0, 0]} scale={[1, 0.9, 1.05]} castShadow>
        <sphereGeometry args={[0.7, 20, 14]} />
        <meshStandardMaterial color="#3F9850" roughness={0.92} />
      </mesh>
      <mesh position={[0.42, 0.05, 0]} scale={[1.05, 0.92, 1]} castShadow>
        <sphereGeometry args={[0.78, 20, 14]} />
        <meshStandardMaterial color="#54AA57" roughness={0.92} />
      </mesh>
      <mesh position={[0, 0.38, 0.12]} castShadow>
        <sphereGeometry args={[0.72, 20, 14]} />
        <meshStandardMaterial color="#68B95C" roughness={0.92} />
      </mesh>
      <mesh position={[0.55, 0.28, -0.45]}>
        <sphereGeometry args={[0.1, 8, 8]} />
        <meshStandardMaterial color="#F4CF5A" />
      </mesh>
      <mesh position={[-0.46, 0.42, -0.48]}>
        <sphereGeometry args={[0.1, 8, 8]} />
        <meshStandardMaterial color="#F4CF5A" />
      </mesh>
    </group>
  );
}

function Rock({
  x,
  z,
  scale,
  rotation,
}: {
  x: number;
  z: number;
  scale: number;
  rotation: number;
}) {
  return (
    <mesh
      position={[x, terrainHeight(x, z) + scale * 0.35, z]}
      rotation={[0.1, rotation, -0.08]}
      scale={[scale, scale * 0.72, scale * 0.9]}
      castShadow
      receiveShadow
    >
      <sphereGeometry args={[0.9, 22, 15]} />
      <meshStandardMaterial color="#718A7D" roughness={0.9} />
    </mesh>
  );
}

function Plant({ x, z }: { x: number; z: number }) {
  return (
    <group position={[x, terrainHeight(x, z), z]}>
      {[-0.22, 0, 0.22].map((offset, index) => (
        <mesh
          key={offset}
          position={[offset, 0.32 + index * 0.06, 0]}
          rotation={[0, 0, offset * 1.6]}
          castShadow
        >
          <capsuleGeometry args={[0.11, 0.45, 3, 7]} />
          <meshStandardMaterial color={index === 1 ? "#82C95E" : "#62AC52"} />
        </mesh>
      ))}
      <mesh position={[0, 0.68, 0]}>
        <sphereGeometry args={[0.14, 10, 10]} />
        <meshStandardMaterial color="#F3C453" />
      </mesh>
    </group>
  );
}

function CuteMonster({
  controls,
  onPlayerFrame,
}: {
  controls: React.RefObject<ControlState>;
  onPlayerFrame: (
    x: number,
    z: number,
    moving: boolean,
    sprinting: boolean,
  ) => void;
}) {
  const root = useRef<THREE.Group>(null);
  const visual = useRef<THREE.Group>(null);
  const legs = [
    useRef<THREE.Group>(null),
    useRef<THREE.Group>(null),
    useRef<THREE.Group>(null),
    useRef<THREE.Group>(null),
  ];
  const velocity = useMemo(() => new THREE.Vector3(), []);
  const cameraTarget = useMemo(() => new THREE.Vector3(), []);
  const desiredCamera = useMemo(() => new THREE.Vector3(), []);

  useFrame(({ camera, clock }, delta) => {
    if (!root.current || !visual.current) return;
    const state = controls.current;
    const keys = state.keys;
    const horizontal =
      (keys.has("KeyD") ? 1 : 0) - (keys.has("KeyA") ? 1 : 0) + state.move.x;
    const forward =
      (keys.has("KeyW") || keys.has("ArrowUp") ? 1 : 0) -
      (keys.has("KeyS") || keys.has("ArrowDown") ? 1 : 0) +
      state.move.y;
    const previousX = root.current.position.x;
    const previousZ = root.current.position.z;
    const sprinting = keys.has("ShiftLeft") || keys.has("ShiftRight");

    velocity.set(0, 0, 0);
    if (!state.isDead && Math.abs(horizontal) + Math.abs(forward) > 0.06) {
      const length = Math.hypot(horizontal, forward);
      const xInput = horizontal / Math.max(1, length);
      const zInput = forward / Math.max(1, length);
      const sin = Math.sin(state.cameraYaw);
      const cos = Math.cos(state.cameraYaw);
      velocity
        .set(xInput * cos - zInput * sin, 0, -xInput * sin - zInput * cos)
        .normalize();
      const speed = sprinting ? 8.2 : 5.4;
      const nextX = root.current.position.x + velocity.x * speed * delta;
      const nextZ = root.current.position.z + velocity.z * speed * delta;
      if (!isBlockedByWater(nextX, root.current.position.z))
        root.current.position.x = nextX;
      if (!isBlockedByWater(root.current.position.x, nextZ))
        root.current.position.z = nextZ;
    }

    root.current.position.y = terrainHeight(
      root.current.position.x,
      root.current.position.z,
    );
    root.current.rotation.y = state.characterYaw;
    const moving =
      !state.isDead &&
      Math.hypot(
        root.current.position.x - previousX,
        root.current.position.z - previousZ,
      ) > 0.00001;
    onPlayerFrame(
      root.current.position.x,
      root.current.position.z,
      moving,
      moving && sprinting,
    );
    const stride = moving ? Math.sin(clock.elapsedTime * 11) * 0.46 : 0;
    legs.forEach((leg, index) => {
      if (leg.current)
        leg.current.rotation.x = THREE.MathUtils.lerp(
          leg.current.rotation.x,
          stride * (index % 2 ? -1 : 1),
          delta * 10,
        );
    });

    const actionAge = performance.now() - state.actionStarted;
    let actionPitch = 0;
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
    }
    const walkBob = moving
      ? Math.abs(Math.sin(clock.elapsedTime * 11)) * 0.055
      : 0;
    visual.current.rotation.x = THREE.MathUtils.damp(
      visual.current.rotation.x,
      actionPitch,
      13,
      delta,
    );
    visual.current.rotation.z = THREE.MathUtils.damp(
      visual.current.rotation.z,
      state.isDead ? -Math.PI * 0.47 : 0,
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

    const distance = 9.4;
    const horizontalDistance = Math.cos(state.cameraPitch) * distance;
    desiredCamera.set(
      root.current.position.x + Math.sin(state.cameraYaw) * horizontalDistance,
      root.current.position.y + 2.6 + Math.sin(state.cameraPitch) * distance,
      root.current.position.z + Math.cos(state.cameraYaw) * horizontalDistance,
    );
    camera.position.lerp(desiredCamera, 1 - Math.exp(-delta * 6));
    cameraTarget.set(
      root.current.position.x,
      root.current.position.y + 1.35,
      root.current.position.z,
    );
    camera.lookAt(cameraTarget);
  });

  return (
    <group ref={root} position={[-8, terrainHeight(-8, 8), 8]}>
      <group ref={visual}>
        <group>
          <mesh position={[0, 1.22, 0]} scale={[1.05, 0.95, 1.22]} castShadow>
            <sphereGeometry args={[0.92, 32, 24]} />
            <meshStandardMaterial color="#8FCB69" roughness={0.72} />
          </mesh>
          <mesh
            position={[0, 1.02, -0.83]}
            scale={[0.66, 0.55, 0.18]}
            castShadow
          >
            <sphereGeometry args={[0.78, 28, 20]} />
            <meshStandardMaterial color="#B7DF85" roughness={0.8} />
          </mesh>
          <mesh position={[-0.39, 1.55, -0.86]}>
            <sphereGeometry args={[0.29, 24, 18]} />
            <meshStandardMaterial color="#FFF8D9" />
          </mesh>
          <mesh position={[0.39, 1.55, -0.86]}>
            <sphereGeometry args={[0.29, 24, 18]} />
            <meshStandardMaterial color="#FFF8D9" />
          </mesh>
          <mesh position={[-0.4, 1.56, -1.12]}>
            <sphereGeometry args={[0.105, 18, 14]} />
            <meshStandardMaterial color="#173F35" />
          </mesh>
          <mesh position={[0.38, 1.56, -1.12]}>
            <sphereGeometry args={[0.105, 18, 14]} />
            <meshStandardMaterial color="#173F35" />
          </mesh>
          <mesh position={[0, 1.98, -0.58]} scale={[0.72, 0.72, 0.35]}>
            <sphereGeometry args={[0.25, 22, 16]} />
            <meshStandardMaterial color="#FFF8D9" />
          </mesh>
          <mesh position={[0, 2, -0.79]}>
            <sphereGeometry args={[0.075, 16, 12]} />
            <meshStandardMaterial color="#173F35" />
          </mesh>
          <mesh
            position={[-0.57, 2.05, -0.12]}
            rotation={[0, 0, -0.34]}
            castShadow
          >
            <coneGeometry args={[0.2, 0.62, 18]} />
            <meshStandardMaterial color="#FF8D6B" />
          </mesh>
          <mesh
            position={[0.57, 2.05, -0.12]}
            rotation={[0, 0, 0.34]}
            castShadow
          >
            <coneGeometry args={[0.2, 0.62, 18]} />
            <meshStandardMaterial color="#FF8D6B" />
          </mesh>
          <mesh position={[0, 0.96, -1.02]} rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.19, 0.035, 12, 28, Math.PI]} />
            <meshStandardMaterial color="#173F35" />
          </mesh>
          <mesh position={[0, 1.12, 1.1]} rotation={[-0.75, 0, 0]} castShadow>
            <coneGeometry args={[0.24, 1.25, 18]} />
            <meshStandardMaterial color="#79B957" />
          </mesh>
        </group>
        {[
          [-0.56, 0.58, -0.52],
          [0.56, 0.58, -0.52],
          [-0.56, 0.58, 0.56],
          [0.56, 0.58, 0.56],
        ].map((position, index) => (
          <group
            key={index}
            ref={legs[index]}
            position={position as [number, number, number]}
          >
            <mesh position={[0, -0.25, 0]} castShadow>
              <capsuleGeometry args={[0.17, 0.42, 8, 14]} />
              <meshStandardMaterial color="#679D4D" roughness={0.78} />
            </mesh>
            <mesh
              position={[0, -0.52, -0.09]}
              scale={[1.3, 0.65, 1.5]}
              castShadow
            >
              <sphereGeometry args={[0.22, 20, 14]} />
              <meshStandardMaterial color="#FFB66E" roughness={0.72} />
            </mesh>
          </group>
        ))}
      </group>
    </group>
  );
}

function World({
  controls,
  eatenIds,
  monsterKey,
  onPlayerFrame,
}: {
  controls: React.RefObject<ControlState>;
  eatenIds: ReadonlySet<string>;
  monsterKey: number;
  onPlayerFrame: (
    x: number,
    z: number,
    moving: boolean,
    sprinting: boolean,
  ) => void;
}) {
  return (
    <>
      <color attach="background" args={["#9CDCE5"]} />
      <fog attach="fog" args={["#9CDCE5", 95, 285]} />
      <Sky
        distance={450000}
        sunPosition={[30, 24, -18]}
        inclination={0.54}
        azimuth={0.18}
      />
      <hemisphereLight intensity={1.35} color="#FFF2CF" groundColor="#376C58" />
      <directionalLight
        position={[-16, 24, -10]}
        intensity={2.15}
        color="#FFF4D5"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-140}
        shadow-camera-right={140}
        shadow-camera-top={140}
        shadow-camera-bottom={-140}
      />
      <Sea />
      <Terrain />
      <River />
      {ALL_TREES.map(([x, z, scale], index) =>
        eatenIds.has(`tree-${index}`) ? null : (
          <Tree key={`tree-${index}`} x={x} z={z} scale={scale} />
        ),
      )}
      {ALL_BUSHES.map(([x, z, scale], index) =>
        eatenIds.has(`bush-${index}`) ? null : (
          <Bush key={`bush-${index}`} x={x} z={z} scale={scale} />
        ),
      )}
      {ROCKS.map(([x, z, scale, rotation]) => (
        <Rock key={`${x}-${z}`} x={x} z={z} scale={scale} rotation={rotation} />
      ))}
      {EXTRA_ROCKS.map(([x, z, scale, rotation]) => (
        <Rock
          key={`extra-${x}-${z}`}
          x={x}
          z={z}
          scale={scale}
          rotation={rotation}
        />
      ))}
      {PLANTS.map(([x, z]) => (
        <Plant key={`${x}-${z}`} x={x} z={z} />
      ))}
      {EXTRA_PLANTS.map(([x, z]) => (
        <Plant key={`extra-${x}-${z}`} x={x} z={z} />
      ))}
      <Float
        speed={1.2}
        rotationIntensity={0.04}
        floatIntensity={0.45}
        position={[-20, 12, -28]}
      >
        <group scale={1.2}>
          {[-1.4, 0, 1.3].map((x, index) => (
            <mesh key={x} position={[x, index === 1 ? 0.25 : 0, 0]}>
              <sphereGeometry args={[1.45, 16, 10]} />
              <meshStandardMaterial color="#FFF8E8" roughness={1} />
            </mesh>
          ))}
        </group>
      </Float>
      <Sparkles
        count={64}
        scale={[74, 9, 74]}
        position={[0, 4, 0]}
        size={1.6}
        speed={0.24}
        color="#FFF1A8"
      />
      <CuteMonster
        key={monsterKey}
        controls={controls}
        onPlayerFrame={onPlayerFrame}
      />
    </>
  );
}

function Joystick({
  label,
  onMove,
}: {
  label: string;
  onMove: (x: number, y: number) => void;
}) {
  const base = useRef<HTMLDivElement>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });

  const update = (clientX: number, clientY: number) => {
    if (!base.current) return;
    const rect = base.current.getBoundingClientRect();
    const radius = rect.width * 0.32;
    const dx = clientX - (rect.left + rect.width / 2);
    const dy = clientY - (rect.top + rect.height / 2);
    const distance = Math.hypot(dx, dy);
    const scale = distance > radius ? radius / distance : 1;
    const x = dx * scale;
    const y = dy * scale;
    setKnob({ x, y });
    onMove(x / radius, -y / radius);
  };

  return (
    <div
      ref={base}
      className="joystick"
      role="application"
      aria-label={label}
      onPointerDown={(event) => {
        event.stopPropagation();
        event.currentTarget.setPointerCapture(event.pointerId);
        update(event.clientX, event.clientY);
      }}
      onPointerMove={(event) => {
        if (event.currentTarget.hasPointerCapture(event.pointerId))
          update(event.clientX, event.clientY);
      }}
      onPointerUp={(event) => {
        event.stopPropagation();
        setKnob({ x: 0, y: 0 });
        onMove(0, 0);
        event.currentTarget.releasePointerCapture(event.pointerId);
      }}
      onPointerCancel={() => {
        setKnob({ x: 0, y: 0 });
        onMove(0, 0);
      }}
    >
      <span className="joystick-label">{label}</span>
      <div
        className="joystick-knob"
        style={{ transform: `translate(${knob.x}px, ${knob.y}px)` }}
      />
    </div>
  );
}

export function GameExperience() {
  const controls = useRef<ControlState>({
    keys: new Set(),
    move: { x: 0, y: 0 },
    look: { x: 0, y: 0 },
    cameraYaw: 0.35,
    characterYaw: 0.35,
    cameraPitch: 0.38,
    action: null,
    actionStarted: 0,
    energy: 100,
    isDead: false,
    moving: false,
    sprinting: false,
    playerPosition: { x: -8, z: 8 },
  });
  const displayedEnergy = useRef(100);
  const eatenIdsRef = useRef<Set<string>>(new Set());
  const [pointerLocked, setPointerLocked] = useState(false);
  const [status, setStatus] = useState("Welcome to Mossmunch Island");
  const [energy, setEnergy] = useState(100);
  const [isDead, setIsDead] = useState(false);
  const [eatenIds, setEatenIds] = useState<Set<string>>(() => new Set());
  const [monsterKey, setMonsterKey] = useState(0);

  const reportPlayerFrame = useCallback(
    (x: number, z: number, moving: boolean, sprinting: boolean) => {
      controls.current.playerPosition.x = x;
      controls.current.playerPosition.z = z;
      controls.current.moving = moving;
      controls.current.sprinting = sprinting;
    },
    [],
  );

  const setEnergyLevel = useCallback((nextEnergy: number) => {
    const normalizedEnergy = THREE.MathUtils.clamp(nextEnergy, 0, 100);
    controls.current.energy = normalizedEnergy;
    const nextDisplay = Math.ceil(normalizedEnergy);
    if (displayedEnergy.current !== nextDisplay) {
      displayedEnergy.current = nextDisplay;
      setEnergy(nextDisplay);
    }
    return normalizedEnergy;
  }, []);

  const killMonster = useCallback(() => {
    if (controls.current.isDead) return;
    controls.current.isDead = true;
    controls.current.moving = false;
    controls.current.sprinting = false;
    controls.current.action = null;
    controls.current.keys.clear();
    controls.current.move = { x: 0, y: 0 };
    setEnergyLevel(0);
    setIsDead(true);
    setStatus("Moss Muncher ran out of energy.");
    if (document.pointerLockElement) document.exitPointerLock();
  }, [setEnergyLevel]);

  const triggerAction = useCallback(
    (action: Exclude<Action, null>) => {
      if (controls.current.isDead) return;

      if (action === "attack") {
        controls.current.action = action;
        controls.current.actionStarted = performance.now();
        const remainingEnergy = setEnergyLevel(
          controls.current.energy - ATTACK_ENERGY_COST,
        );
        if (remainingEnergy <= 0) {
          killMonster();
          return;
        }
        setStatus(`Tiny but mighty! Rawr! −${ATTACK_ENERGY_COST} energy`);
      } else {
        if (controls.current.energy >= 99.5) {
          setStatus("Energy is already full.");
          return;
        }

        let nearest: Edible | null = null;
        let nearestDistance = EAT_DISTANCE;
        for (const edible of EDIBLES) {
          if (eatenIdsRef.current.has(edible.id)) continue;
          const distance = Math.hypot(
            edible.x - controls.current.playerPosition.x,
            edible.z - controls.current.playerPosition.z,
          );
          if (distance <= nearestDistance) {
            nearest = edible;
            nearestDistance = distance;
          }
        }

        if (!nearest) {
          setStatus("Get closer to a bush or tree to eat.");
          return;
        }

        controls.current.action = action;
        controls.current.actionStarted = performance.now();
        eatenIdsRef.current.add(nearest.id);
        setEatenIds(new Set(eatenIdsRef.current));
        const restoredEnergy = Math.min(
          nearest.energy,
          100 - controls.current.energy,
        );
        setEnergyLevel(controls.current.energy + restoredEnergy);
        setStatus(
          nearest.kind === "bush"
            ? `Crunchy bush! +${Math.ceil(restoredEnergy)} energy`
            : `Tasty tree! +${Math.ceil(restoredEnergy)} energy`,
        );
      }

      window.setTimeout(() => {
        if (!controls.current.isDead) setStatus("Explore the island");
      }, 1400);
    },
    [killMonster, setEnergyLevel],
  );

  const resetGame = useCallback(() => {
    controls.current.keys.clear();
    controls.current.move = { x: 0, y: 0 };
    controls.current.look = { x: 0, y: 0 };
    controls.current.cameraYaw = 0.35;
    controls.current.characterYaw = 0.35;
    controls.current.cameraPitch = 0.38;
    controls.current.action = null;
    controls.current.actionStarted = 0;
    controls.current.isDead = false;
    controls.current.moving = false;
    controls.current.sprinting = false;
    controls.current.playerPosition = { x: -8, z: 8 };
    eatenIdsRef.current = new Set();
    setEatenIds(new Set());
    setEnergyLevel(100);
    setIsDead(false);
    setMonsterKey((current) => current + 1);
    setStatus("Moss Muncher is ready to explore again!");
  }, [setEnergyLevel]);

  useEffect(() => {
    let animationFrame = 0;
    let previousTime = performance.now();
    const updateLook = (time: number) => {
      const delta = Math.min(0.05, (time - previousTime) / 1000);
      previousTime = time;
      const turn =
        (controls.current.keys.has("ArrowLeft") ? 1 : 0) -
        (controls.current.keys.has("ArrowRight") ? 1 : 0);
      const turnDelta = turn * 1.75 * delta;
      controls.current.cameraYaw = normalizeAngle(
        controls.current.cameraYaw +
          turnDelta -
          controls.current.look.x * 1.9 * delta,
      );
      if (!controls.current.isDead) {
        controls.current.characterYaw = normalizeAngle(
          controls.current.characterYaw + turnDelta,
        );
      }

      const horizontal =
        (controls.current.keys.has("KeyD") ? 1 : 0) -
        (controls.current.keys.has("KeyA") ? 1 : 0) +
        controls.current.move.x;
      const forward =
        (controls.current.keys.has("KeyW") ||
        controls.current.keys.has("ArrowUp")
          ? 1
          : 0) -
        (controls.current.keys.has("KeyS") ||
        controls.current.keys.has("ArrowDown")
          ? 1
          : 0) +
        controls.current.move.y;
      if (
        !controls.current.isDead &&
        Math.abs(horizontal) + Math.abs(forward) > 0.06
      ) {
        const targetYaw =
          Math.abs(horizontal) > 0.06
            ? controls.current.cameraYaw - Math.sign(horizontal) * Math.PI * 0.5
            : controls.current.cameraYaw;
        controls.current.characterYaw = dampAngle(
          controls.current.characterYaw,
          targetYaw,
          15,
          delta,
        );
      }
      controls.current.cameraPitch = THREE.MathUtils.clamp(
        controls.current.cameraPitch + controls.current.look.y * 1.25 * delta,
        0.12,
        0.72,
      );

      if (!controls.current.isDead && controls.current.moving) {
        const energyRate = controls.current.sprinting
          ? SPRINT_ENERGY_PER_SECOND
          : WALK_ENERGY_PER_SECOND;
        const remainingEnergy = setEnergyLevel(
          controls.current.energy - energyRate * delta,
        );
        if (remainingEnergy <= 0) killMonster();
      }
      animationFrame = window.requestAnimationFrame(updateLook);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      controls.current.keys.add(event.code);
      if (
        ["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(
          event.code,
        )
      )
        event.preventDefault();
      if (!event.repeat && event.code === "Space") triggerAction("attack");
      if (!event.repeat && event.code === "KeyE") triggerAction("eat");
      if (!event.repeat && event.code === "KeyR" && controls.current.isDead)
        resetGame();
    };
    const onKeyUp = (event: KeyboardEvent) =>
      controls.current.keys.delete(event.code);
    const onMouseMove = (event: MouseEvent) => {
      if (!document.pointerLockElement) return;
      controls.current.cameraYaw -= event.movementX * 0.0024;
      controls.current.cameraYaw = Math.atan2(
        Math.sin(controls.current.cameraYaw),
        Math.cos(controls.current.cameraYaw),
      );
      controls.current.cameraPitch = THREE.MathUtils.clamp(
        controls.current.cameraPitch + event.movementY * 0.0018,
        0.12,
        0.72,
      );
    };
    const onPointerLock = () =>
      setPointerLocked(Boolean(document.pointerLockElement));
    const onBlur = () => controls.current.keys.clear();
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("blur", onBlur);
    document.addEventListener("pointerlockchange", onPointerLock);
    animationFrame = window.requestAnimationFrame(updateLook);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("pointerlockchange", onPointerLock);
      window.cancelAnimationFrame(animationFrame);
    };
  }, [killMonster, resetGame, setEnergyLevel, triggerAction]);

  return (
    <main className="game-shell">
      <Canvas
        shadows
        dpr={[1, 1.6]}
        camera={{ fov: 48, near: 0.1, far: 420, position: [8, 8, 12] }}
        gl={{ antialias: true, powerPreference: "high-performance" }}
        onPointerDown={(event) => {
          if (
            event.pointerType === "mouse" &&
            event.target instanceof HTMLCanvasElement &&
            !document.pointerLockElement
          ) {
            void event.target.requestPointerLock();
          }
        }}
      >
        <World
          controls={controls}
          eatenIds={eatenIds}
          monsterKey={monsterKey}
          onPlayerFrame={reportPlayerFrame}
        />
      </Canvas>

      <div className="game-hud" aria-live="polite">
        <div className="hud-top-left">
          <Link href="/" className="back-button" aria-label="Back to home">
            <ArrowLeft size={19} />
          </Link>
          <div className="monster-card">
            <MonsterMark className="hud-monster" />
            <div>
              <span>MOSS MUNCHER</span>
              <strong>Level 1 explorer</strong>
            </div>
          </div>
        </div>
        <div className="hud-top-right">
          <div className="dna-chip">
            <Dna size={16} />
            <span>3 eyes · herbivore · speed 6.2</span>
          </div>
          <div
            className={`energy-bar${energy <= 25 ? " energy-low" : ""}${isDead ? " energy-empty" : ""}`}
          >
            <i style={{ width: `${energy}%` }} />
            <span>ENERGY {energy}</span>
          </div>
        </div>
        <div className="status-bubble">{status}</div>

        {isDead && (
          <div className="death-card" role="dialog" aria-modal="true">
            <span>OUT OF ENERGY</span>
            <strong>Moss Muncher has collapsed!</strong>
            <p>
              Walk to forage, sprint carefully, and save energy for attacks.
            </p>
            <button type="button" onClick={resetGame}>
              Try again <kbd>R</kbd>
            </button>
          </div>
        )}

        {!pointerLocked && (
          <div className="mouse-hint">
            <MousePointer2 size={18} />
            <span>Click the world to look around</span>
          </div>
        )}

        <div className="desktop-controls">
          <div>
            <kbd>W</kbd>
            <kbd>S</kbd>
            <span>forward / back</span>
          </div>
          <div>
            <kbd>A</kbd>
            <kbd>D</kbd>
            <span>face + move sideways</span>
          </div>
          <div>
            <MousePointer2 size={16} />
            <span>camera</span>
          </div>
          <div>
            <kbd>←</kbd>
            <kbd>→</kbd>
            <span>turn + camera</span>
          </div>
          <div>
            <kbd>↑</kbd>
            <kbd>↓</kbd>
            <span>forward / back</span>
          </div>
          <div>
            <kbd>E</kbd>
            <span>eat</span>
          </div>
          <div>
            <kbd>SPACE</kbd>
            <span>attack</span>
          </div>
          <div>
            <kbd>SHIFT</kbd>
            <span>sprint</span>
          </div>
        </div>

        <div className="mobile-controls">
          <Joystick
            label="MOVE"
            onMove={(x, y) => {
              controls.current.move = { x, y };
            }}
          />
          <Joystick
            label="LOOK"
            onMove={(x, y) => {
              controls.current.look = { x, y: -y };
            }}
          />
        </div>

        <div className="action-controls">
          <button
            type="button"
            className="action-button eat-button"
            disabled={isDead}
            onPointerDown={(event) => {
              event.stopPropagation();
              triggerAction("eat");
            }}
          >
            <Leaf size={25} />
            <span>Eat</span>
            <small>E</small>
          </button>
          <button
            type="button"
            className="action-button attack-button"
            disabled={isDead}
            onPointerDown={(event) => {
              event.stopPropagation();
              triggerAction("attack");
            }}
          >
            <Swords size={25} />
            <span>Attack</span>
            <small>Space</small>
          </button>
        </div>

        <div className="water-rule">
          <Crosshair size={14} />
          <span>Water is off limits. Look for a bridge.</span>
        </div>
      </div>
    </main>
  );
}
