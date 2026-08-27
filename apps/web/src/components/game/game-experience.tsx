"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { Canvas, useFrame } from "@react-three/fiber";
import { Float, Sky, Sparkles } from "@react-three/drei";
import {
  ArrowLeft,
  Crosshair,
  Dna,
  Leaf,
  MousePointer2,
  Plus,
  Swords,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import * as THREE from "three";
import { MonsterMark } from "@/components/monster-mark";
import {
  canMonsterEatPlants,
  canMonsterHunt,
  canMonsterSwim,
  DEFAULT_MONSTER_DNA,
  type MonsterDna,
} from "@/components/game/monster-dna";
import { MonsterVisual } from "@/components/game/monster-model";

const MonsterCreator = dynamic(
  () =>
    import("@/components/game/monster-creator").then(
      (module) => module.MonsterCreator,
    ),
  {
    ssr: false,
    loading: () => (
      <div className="creator-overlay" role="status" aria-live="polite">
        <div className="creator-loading">Opening the DNA lab…</div>
      </div>
    ),
  },
);

type Action = "eat" | "attack" | null;
type EdibleKind = "tree" | "bush";
type SceneQuality = "mobile" | "desktop";

type MonsterProfile = {
  id: string;
  name: string;
  dna: MonsterDna;
};

type CreatorDraft = {
  mode: "edit" | "new";
  dna: MonsterDna;
  name: string;
};

function subscribeToDeviceProfile() {
  return () => undefined;
}

function getDeviceProfile(): SceneQuality {
  return window.matchMedia("(pointer: coarse)").matches ||
    window.matchMedia("(max-width: 900px)").matches
    ? "mobile"
    : "desktop";
}

function getServerDeviceProfile() {
  return null;
}

type Edible = {
  id: string;
  kind: EdibleKind;
  x: number;
  z: number;
  energy: number;
};

type Prey = {
  id: string;
  x: number;
  z: number;
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
  paused: boolean;
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
const HUNT_DISTANCE = 4.8;
const MAX_FAMILY_SIZE = 6;
const PREY: Prey[] = [
  { id: "critter-0", x: -4.5, z: 8 },
  { id: "critter-1", x: -15, z: -5 },
  { id: "critter-2", x: 12, z: 9 },
  { id: "critter-3", x: 20, z: -18 },
  { id: "critter-4", x: -27, z: 20 },
  { id: "critter-5", x: 32, z: 27 },
  { id: "critter-6", x: -43, z: -34 },
  { id: "critter-7", x: 51, z: 38 },
  { id: "critter-8", x: -62, z: 49 },
  { id: "critter-9", x: 72, z: -52 },
];

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

function isWaterAt(x: number, z: number) {
  if (Math.hypot(x, z) > PLAYABLE_RADIUS) return true;
  const bridge = BRIDGE_POSITIONS.some(
    (bridgeZ) => Math.abs(z - bridgeZ) < 1.45,
  );
  return Math.abs(x - riverX(z)) < 1.48 && !bridge;
}

function isBlockedByWater(x: number, z: number, canSwim: boolean) {
  if (canSwim) return Math.hypot(x, z) > WORLD_RADIUS + 22;
  return isWaterAt(x, z);
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
const MOBILE_SCENERY_STEP = 5;

function isVisibleSceneryItem(
  quality: SceneQuality,
  index: number,
  baseCount: number,
) {
  return (
    quality === "desktop" ||
    index < baseCount ||
    (index - baseCount) % MOBILE_SCENERY_STEP === 0
  );
}

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
const MOBILE_EDIBLES = EDIBLES.filter((edible) => {
  const index = Number(edible.id.slice(edible.id.lastIndexOf("-") + 1));
  const baseCount = edible.kind === "tree" ? TREES.length : BUSHES.length;
  return isVisibleSceneryItem("mobile", index, baseCount);
});

function Terrain({ quality }: { quality: SceneQuality }) {
  const geometry = useMemo(() => {
    const size = WORLD_RADIUS * 2 + 4;
    const segments = quality === "mobile" ? 112 : 184;
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
  }, [quality]);

  return (
    <>
      <mesh geometry={geometry} receiveShadow={quality === "desktop"}>
        <meshStandardMaterial color="#72B95A" roughness={0.92} />
      </mesh>
      <mesh position={[0, -0.5, 0]} receiveShadow={quality === "desktop"}>
        <cylinderGeometry
          args={[
            WORLD_RADIUS,
            WORLD_RADIUS - 1.4,
            1.08,
            quality === "mobile" ? 96 : 192,
          ]}
        />
        <meshStandardMaterial color="#E4C16E" roughness={1} />
      </mesh>
    </>
  );
}

function Sea({ quality }: { quality: SceneQuality }) {
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
      receiveShadow={quality === "desktop"}
    >
      <circleGeometry args={[420, quality === "mobile" ? 96 : 192]} />
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

function River({ quality }: { quality: SceneQuality }) {
  const segments = useMemo(() => {
    const segmentCount = quality === "mobile" ? 64 : 128;
    return Array.from({ length: segmentCount }, (_, index) => {
      const riverExtent = PLAYABLE_RADIUS + 0.5;
      const segmentLength = (riverExtent * 2) / (segmentCount - 1);
      const z = -riverExtent + index * segmentLength;
      const nextZ = Math.min(riverExtent, z + segmentLength);
      const x = riverX(z);
      const nextX = riverX(nextZ);
      return {
        x: (x + nextX) / 2,
        z: (z + nextZ) / 2,
        angle: Math.atan2(nextX - x, nextZ - z),
        length: segmentLength + 0.25,
      };
    });
  }, [quality]);

  return (
    <group>
      {segments.map((segment, index) => (
        <mesh
          key={index}
          position={[segment.x, 0.16, segment.z]}
          rotation={[0, segment.angle, 0]}
          receiveShadow={quality === "desktop"}
        >
          <boxGeometry args={[2.85, 0.09, segment.length]} />
          <meshStandardMaterial
            color="#55B8CE"
            roughness={0.2}
            metalness={0.06}
          />
        </mesh>
      ))}
      {BRIDGE_POSITIONS.map((z) => (
        <Bridge key={z} z={z} quality={quality} />
      ))}
    </group>
  );
}

function Bridge({ z, quality }: { z: number; quality: SceneQuality }) {
  const x = riverX(z);
  return (
    <group position={[x, terrainHeight(x, z) + 0.27, z]}>
      {Array.from({ length: 7 }, (_, index) => (
        <mesh
          key={index}
          position={[0, 0, (index - 3) * 0.36]}
          castShadow={quality === "desktop"}
          receiveShadow={quality === "desktop"}
        >
          <boxGeometry args={[3.65, 0.18, 0.3]} />
          <meshStandardMaterial
            color={index % 2 ? "#A8683D" : "#BC7B48"}
            roughness={0.95}
          />
        </mesh>
      ))}
      <mesh position={[-1.62, -0.18, 0]} castShadow={quality === "desktop"}>
        <boxGeometry args={[0.18, 0.25, 2.6]} />
        <meshStandardMaterial color="#70452F" />
      </mesh>
      <mesh position={[1.62, -0.18, 0]} castShadow={quality === "desktop"}>
        <boxGeometry args={[0.18, 0.25, 2.6]} />
        <meshStandardMaterial color="#70452F" />
      </mesh>
    </group>
  );
}

function Tree({
  x,
  z,
  scale,
  quality,
}: {
  x: number;
  z: number;
  scale: number;
  quality: SceneQuality;
}) {
  const castsShadow = quality === "desktop";
  return (
    <group position={[x, terrainHeight(x, z), z]} scale={scale}>
      <mesh position={[0, 1.25, 0]} castShadow={castsShadow}>
        <cylinderGeometry
          args={[0.28, 0.42, 2.5, quality === "mobile" ? 10 : 18]}
        />
        <meshStandardMaterial color="#855333" roughness={1} />
      </mesh>
      <mesh
        position={[0, 3.15, 0]}
        scale={[1, 1.05, 0.96]}
        castShadow={castsShadow}
      >
        <sphereGeometry
          args={[
            1.45,
            quality === "mobile" ? 12 : 24,
            quality === "mobile" ? 9 : 18,
          ]}
        />
        <meshStandardMaterial color="#2F7D4A" roughness={0.95} />
      </mesh>
      <mesh position={[-0.8, 2.75, 0.3]} castShadow={castsShadow}>
        <sphereGeometry
          args={[
            0.9,
            quality === "mobile" ? 12 : 22,
            quality === "mobile" ? 9 : 16,
          ]}
        />
        <meshStandardMaterial color="#3E9152" roughness={1} />
      </mesh>
      <mesh position={[0.78, 2.75, 0.2]} castShadow={castsShadow}>
        <sphereGeometry
          args={[
            0.85,
            quality === "mobile" ? 12 : 22,
            quality === "mobile" ? 9 : 16,
          ]}
        />
        <meshStandardMaterial color="#4BA15A" roughness={1} />
      </mesh>
    </group>
  );
}

function Bush({
  x,
  z,
  scale,
  quality,
}: {
  x: number;
  z: number;
  scale: number;
  quality: SceneQuality;
}) {
  const castsShadow = quality === "desktop";
  const segments: [number, number] = quality === "mobile" ? [10, 8] : [20, 14];
  return (
    <group position={[x, terrainHeight(x, z) + 0.48 * scale, z]} scale={scale}>
      <mesh
        position={[-0.48, 0, 0]}
        scale={[1, 0.9, 1.05]}
        castShadow={castsShadow}
      >
        <sphereGeometry args={[0.7, ...segments]} />
        <meshStandardMaterial color="#3F9850" roughness={0.92} />
      </mesh>
      <mesh
        position={[0.42, 0.05, 0]}
        scale={[1.05, 0.92, 1]}
        castShadow={castsShadow}
      >
        <sphereGeometry args={[0.78, ...segments]} />
        <meshStandardMaterial color="#54AA57" roughness={0.92} />
      </mesh>
      <mesh position={[0, 0.38, 0.12]} castShadow={castsShadow}>
        <sphereGeometry args={[0.72, ...segments]} />
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
  quality,
}: {
  x: number;
  z: number;
  scale: number;
  rotation: number;
  quality: SceneQuality;
}) {
  return (
    <mesh
      position={[x, terrainHeight(x, z) + scale * 0.35, z]}
      rotation={[0.1, rotation, -0.08]}
      scale={[scale, scale * 0.72, scale * 0.9]}
      castShadow={quality === "desktop"}
      receiveShadow={quality === "desktop"}
    >
      <sphereGeometry
        args={[
          0.9,
          quality === "mobile" ? 12 : 22,
          quality === "mobile" ? 9 : 15,
        ]}
      />
      <meshStandardMaterial color="#718A7D" roughness={0.9} />
    </mesh>
  );
}

function Plant({
  x,
  z,
  quality,
}: {
  x: number;
  z: number;
  quality: SceneQuality;
}) {
  return (
    <group position={[x, terrainHeight(x, z), z]}>
      {[-0.22, 0, 0.22].map((offset, index) => (
        <mesh
          key={offset}
          position={[offset, 0.32 + index * 0.06, 0]}
          rotation={[0, 0, offset * 1.6]}
          castShadow={quality === "desktop"}
        >
          <capsuleGeometry
            args={[
              0.11,
              0.45,
              quality === "mobile" ? 2 : 3,
              quality === "mobile" ? 5 : 7,
            ]}
          />
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

function SnackCritter({
  prey,
  quality,
}: {
  prey: Prey;
  quality: SceneQuality;
}) {
  const y = terrainHeight(prey.x, prey.z);
  return (
    <group position={[prey.x, y + 0.38, prey.z]} rotation={[0, -0.4, 0]}>
      <mesh scale={[0.62, 0.48, 0.72]} castShadow={quality === "desktop"}>
        <sphereGeometry args={[0.58, 14, 10]} />
        <meshStandardMaterial color="#D8B07A" roughness={0.88} />
      </mesh>
      {[-0.28, 0.28].map((x) => (
        <group key={x}>
          <mesh
            position={[x, 0.34, -0.22]}
            rotation={[0.1, 0, x < 0 ? -0.35 : 0.35]}
          >
            <coneGeometry args={[0.13, 0.34, 10]} />
            <meshStandardMaterial color="#A97855" roughness={0.9} />
          </mesh>
          <mesh position={[x * 0.62, 0.12, -0.45]}>
            <sphereGeometry args={[0.075, 10, 8]} />
            <meshStandardMaterial color="#173F35" />
          </mesh>
        </group>
      ))}
      <mesh position={[0, -0.02, 0.52]} scale={[1, 0.72, 1]}>
        <sphereGeometry args={[0.18, 12, 9]} />
        <meshStandardMaterial color="#FFF3D4" roughness={0.85} />
      </mesh>
    </group>
  );
}

const FAMILY_POSITIONS: Array<[number, number, number]> = [
  [-13, 5, 0.58],
  [-14, 11, 0.64],
  [-6, 14, 0.56],
  [-3, 4, 0.61],
  [-18, 8, 0.54],
];

function FamilyMonster({
  profile,
  index,
  quality,
}: {
  profile: MonsterProfile;
  index: number;
  quality: SceneQuality;
}) {
  const [x, z, scale] = FAMILY_POSITIONS[index % FAMILY_POSITIONS.length];
  return (
    <group
      position={[x, terrainHeight(x, z), z]}
      rotation={[0, 1.4 + index * 0.7, 0]}
      scale={scale}
    >
      <MonsterVisual dna={profile.dna} castShadow={quality === "desktop"} />
    </group>
  );
}

function CuteMonster({
  controls,
  onPlayerFrame,
  dna,
}: {
  controls: React.RefObject<ControlState>;
  dna: MonsterDna;
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
    useRef<THREE.Group>(null),
    useRef<THREE.Group>(null),
    useRef<THREE.Group>(null),
    useRef<THREE.Group>(null),
  ];
  const velocity = useMemo(() => new THREE.Vector3(), []);
  const cameraTarget = useMemo(() => new THREE.Vector3(), []);
  const desiredCamera = useMemo(() => new THREE.Vector3(), []);
  const canSwim = canMonsterSwim(dna);

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
    if (
      !state.isDead &&
      !state.paused &&
      Math.abs(horizontal) + Math.abs(forward) > 0.06
    ) {
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
      if (!isBlockedByWater(nextX, root.current.position.z, canSwim))
        root.current.position.x = nextX;
      if (!isBlockedByWater(root.current.position.x, nextZ, canSwim))
        root.current.position.z = nextZ;
    }

    const swimming =
      canSwim && isWaterAt(root.current.position.x, root.current.position.z);
    const targetHeight = swimming
      ? -1.5 + Math.sin(clock.elapsedTime * 2.4) * 0.08
      : terrainHeight(root.current.position.x, root.current.position.z);
    root.current.position.y = THREE.MathUtils.damp(
      root.current.position.y,
      targetHeight,
      7,
      delta,
    );
    root.current.rotation.y = state.characterYaw;
    const moving =
      !state.isDead &&
      !state.paused &&
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
    let actionPitch = swimming ? Math.sin(clock.elapsedTime * 2.4) * 0.055 : 0;
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
        <MonsterVisual dna={dna} legRefs={legs} />
      </group>
    </group>
  );
}

function World({
  controls,
  eatenIds,
  huntedIds,
  family,
  monsterKey,
  onPlayerFrame,
  dna,
  quality,
}: {
  controls: React.RefObject<ControlState>;
  eatenIds: ReadonlySet<string>;
  huntedIds: ReadonlySet<string>;
  family: MonsterProfile[];
  monsterKey: number;
  dna: MonsterDna;
  quality: SceneQuality;
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
        castShadow={quality === "desktop"}
        shadow-mapSize={quality === "desktop" ? [2048, 2048] : [512, 512]}
        shadow-camera-left={-140}
        shadow-camera-right={140}
        shadow-camera-top={140}
        shadow-camera-bottom={-140}
      />
      <Sea quality={quality} />
      <Terrain quality={quality} />
      <River quality={quality} />
      {ALL_TREES.map(([x, z, scale], index) =>
        eatenIds.has(`tree-${index}`) ||
        !isVisibleSceneryItem(quality, index, TREES.length) ? null : (
          <Tree
            key={`tree-${index}`}
            x={x}
            z={z}
            scale={scale}
            quality={quality}
          />
        ),
      )}
      {ALL_BUSHES.map(([x, z, scale], index) =>
        eatenIds.has(`bush-${index}`) ||
        !isVisibleSceneryItem(quality, index, BUSHES.length) ? null : (
          <Bush
            key={`bush-${index}`}
            x={x}
            z={z}
            scale={scale}
            quality={quality}
          />
        ),
      )}
      {ROCKS.map(([x, z, scale, rotation]) => (
        <Rock
          key={`${x}-${z}`}
          x={x}
          z={z}
          scale={scale}
          rotation={rotation}
          quality={quality}
        />
      ))}
      {EXTRA_ROCKS.map(([x, z, scale, rotation], index) =>
        !isVisibleSceneryItem(quality, index, 0) ? null : (
          <Rock
            key={`extra-${x}-${z}`}
            x={x}
            z={z}
            scale={scale}
            rotation={rotation}
            quality={quality}
          />
        ),
      )}
      {PLANTS.map(([x, z]) => (
        <Plant key={`${x}-${z}`} x={x} z={z} quality={quality} />
      ))}
      {EXTRA_PLANTS.map(([x, z], index) =>
        !isVisibleSceneryItem(quality, index, 0) ? null : (
          <Plant key={`extra-${x}-${z}`} x={x} z={z} quality={quality} />
        ),
      )}
      {PREY.map((prey) =>
        huntedIds.has(prey.id) ? null : (
          <SnackCritter key={prey.id} prey={prey} quality={quality} />
        ),
      )}
      {family.map((profile, index) => (
        <FamilyMonster
          key={profile.id}
          profile={profile}
          index={index}
          quality={quality}
        />
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
        count={quality === "mobile" ? 16 : 64}
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
        dna={dna}
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
    paused: false,
    playerPosition: { x: -8, z: 8 },
  });
  const displayedEnergy = useRef(100);
  const eatenIdsRef = useRef<Set<string>>(new Set());
  const huntedIdsRef = useRef<Set<string>>(new Set());
  const nextMonsterId = useRef(2);
  const [pointerLocked, setPointerLocked] = useState(false);
  const [status, setStatus] = useState("Welcome to Mossmunch Island");
  const [energy, setEnergy] = useState(100);
  const [isDead, setIsDead] = useState(false);
  const [eatenIds, setEatenIds] = useState<Set<string>>(() => new Set());
  const [huntedIds, setHuntedIds] = useState<Set<string>>(() => new Set());
  const [monsterKey, setMonsterKey] = useState(0);
  const [monsterFamily, setMonsterFamily] = useState<MonsterProfile[]>([
    { id: "monster-1", name: "Moss Muncher", dna: DEFAULT_MONSTER_DNA },
  ]);
  const [activeMonsterId, setActiveMonsterId] = useState("monster-1");
  const [creatorDraft, setCreatorDraft] = useState<CreatorDraft | null>(null);
  const activeMonster =
    monsterFamily.find((profile) => profile.id === activeMonsterId) ??
    monsterFamily[0];
  const monsterDna = activeMonster.dna;
  const sceneQuality = useSyncExternalStore(
    subscribeToDeviceProfile,
    getDeviceProfile,
    getServerDeviceProfile,
  );

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
    setStatus(`${activeMonster.name} ran out of energy.`);
    if (document.pointerLockElement) document.exitPointerLock();
  }, [activeMonster.name, setEnergyLevel]);

  const triggerAction = useCallback(
    (action: Exclude<Action, null>) => {
      if (controls.current.isDead || controls.current.paused) return;

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

        let nearestPrey: Prey | null = null;
        let nearestDistance = HUNT_DISTANCE;
        if (canMonsterHunt(monsterDna)) {
          for (const prey of PREY) {
            if (huntedIdsRef.current.has(prey.id)) continue;
            const distance = Math.hypot(
              prey.x - controls.current.playerPosition.x,
              prey.z - controls.current.playerPosition.z,
            );
            if (distance <= nearestDistance) {
              nearestPrey = prey;
              nearestDistance = distance;
            }
          }
        }

        if (nearestPrey) {
          huntedIdsRef.current.add(nearestPrey.id);
          setHuntedIds(new Set(huntedIdsRef.current));
          const huntEnergy = monsterDna.diet === "carnivore" ? 45 : 28;
          const restoredEnergy = Math.min(huntEnergy, 100 - remainingEnergy);
          setEnergyLevel(remainingEnergy + restoredEnergy);
          setStatus(
            `${monsterDna.diet === "carnivore" ? "Carnivore feast" : "Omnivore snack"}! +${Math.ceil(restoredEnergy)} energy`,
          );
        } else if (canMonsterHunt(monsterDna)) {
          setStatus(
            `No prey in range. The attack still cost ${ATTACK_ENERGY_COST} energy.`,
          );
        } else {
          setStatus(
            `Herbivores attack only to defend themselves. −${ATTACK_ENERGY_COST} energy`,
          );
        }
      } else {
        if (!canMonsterEatPlants(monsterDna)) {
          setStatus("Carnivores cannot digest plants. Hunt a small critter.");
          return;
        }
        if (controls.current.energy >= 99.5) {
          setStatus("Energy is already full.");
          return;
        }

        let nearest: Edible | null = null;
        let nearestDistance = EAT_DISTANCE;
        const ediblePool = sceneQuality === "mobile" ? MOBILE_EDIBLES : EDIBLES;
        for (const edible of ediblePool) {
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
        const plantEnergy =
          nearest.energy * (monsterDna.diet === "omnivore" ? 0.7 : 1);
        const restoredEnergy = Math.min(
          plantEnergy,
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
    [killMonster, monsterDna, sceneQuality, setEnergyLevel],
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
    controls.current.paused = false;
    controls.current.playerPosition = { x: -8, z: 8 };
    eatenIdsRef.current = new Set();
    huntedIdsRef.current = new Set();
    setEatenIds(new Set());
    setHuntedIds(new Set());
    setEnergyLevel(100);
    setIsDead(false);
    setMonsterKey((current) => current + 1);
    setStatus(`${activeMonster.name} is ready to explore again!`);
  }, [activeMonster.name, setEnergyLevel]);

  const openCreator = useCallback(() => {
    controls.current.paused = true;
    controls.current.keys.clear();
    controls.current.move = { x: 0, y: 0 };
    controls.current.look = { x: 0, y: 0 };
    if (document.pointerLockElement) document.exitPointerLock();
    setCreatorDraft({
      mode: "edit",
      dna: activeMonster.dna,
      name: activeMonster.name,
    });
  }, [activeMonster]);

  const openNewMonster = useCallback(() => {
    if (monsterFamily.length >= MAX_FAMILY_SIZE) {
      setStatus(`The family can hold up to ${MAX_FAMILY_SIZE} monsters.`);
      return;
    }
    controls.current.paused = true;
    controls.current.keys.clear();
    controls.current.move = { x: 0, y: 0 };
    controls.current.look = { x: 0, y: 0 };
    if (document.pointerLockElement) document.exitPointerLock();
    setCreatorDraft({
      mode: "new",
      dna: DEFAULT_MONSTER_DNA,
      name: `Monster ${monsterFamily.length + 1}`,
    });
  }, [monsterFamily.length]);

  const closeCreator = useCallback(() => {
    controls.current.paused = false;
    controls.current.keys.clear();
    setCreatorDraft(null);
  }, []);

  const applyMonsterDna = useCallback(
    (nextDna: MonsterDna, name: string) => {
      controls.current.paused = false;
      controls.current.keys.clear();

      if (creatorDraft?.mode === "new") {
        const id = `monster-${nextMonsterId.current}`;
        nextMonsterId.current += 1;
        setMonsterFamily((current) => [...current, { id, name, dna: nextDna }]);
        setActiveMonsterId(id);
        setMonsterKey((current) => current + 1);
        setStatus(`${name} joined the monster family!`);
      } else {
        setMonsterFamily((current) =>
          current.map((profile) =>
            profile.id === activeMonsterId
              ? { ...profile, name, dna: nextDna }
              : profile,
          ),
        );
        setStatus(`${name}'s new DNA is ready to test!`);
      }
      setCreatorDraft(null);
    },
    [activeMonsterId, creatorDraft?.mode],
  );

  const switchMonster = useCallback(
    (id: string) => {
      const nextMonster = monsterFamily.find((profile) => profile.id === id);
      if (!nextMonster || nextMonster.id === activeMonsterId) return;
      controls.current.keys.clear();
      controls.current.move = { x: 0, y: 0 };
      controls.current.action = null;
      controls.current.isDead = false;
      controls.current.playerPosition = { x: -8, z: 8 };
      setActiveMonsterId(id);
      setMonsterKey((current) => current + 1);
      setEnergyLevel(100);
      setIsDead(false);
      setStatus(`Now playing as ${nextMonster.name}.`);
    },
    [activeMonsterId, monsterFamily, setEnergyLevel],
  );

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
        !controls.current.paused &&
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

      if (
        !controls.current.isDead &&
        !controls.current.paused &&
        controls.current.moving
      ) {
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
      if (controls.current.paused) return;
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
      {sceneQuality ? (
        <Canvas
          shadows={sceneQuality === "desktop"}
          dpr={sceneQuality === "mobile" ? 1 : [1, 1.6]}
          camera={{ fov: 48, near: 0.1, far: 420, position: [8, 8, 12] }}
          gl={{
            antialias: sceneQuality === "desktop",
            powerPreference: "high-performance",
          }}
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
            huntedIds={huntedIds}
            family={monsterFamily.filter(
              (profile) => profile.id !== activeMonsterId,
            )}
            monsterKey={monsterKey}
            onPlayerFrame={reportPlayerFrame}
            dna={monsterDna}
            quality={sceneQuality}
          />
        </Canvas>
      ) : (
        <div className="scene-loading" role="status" aria-live="polite">
          Growing the island…
        </div>
      )}

      <div className="game-hud" aria-live="polite">
        <div className="hud-top-left">
          <Link href="/" className="back-button" aria-label="Back to home">
            <ArrowLeft size={19} />
          </Link>
          <div className="monster-card">
            <MonsterMark className="hud-monster" />
            <div>
              <span>{activeMonster.name.toUpperCase()}</span>
              <strong>{monsterDna.diet} · level 1 explorer</strong>
            </div>
          </div>
        </div>
        <div className="hud-top-right">
          <div className="dna-hud-row">
            <div className="dna-chip">
              <Dna size={16} />
              <span>
                {monsterDna.eyes} {monsterDna.eyes === 1 ? "eye" : "eyes"} ·{" "}
                {monsterDna.legs} legs · {monsterDna.diet}
              </span>
            </div>
            <label className="family-picker">
              <span>Monster</span>
              <select
                value={activeMonsterId}
                onChange={(event) => switchMonster(event.target.value)}
              >
                {monsterFamily.map((profile) => (
                  <option key={profile.id} value={profile.id}>
                    {profile.name}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="new-monster-button"
              onClick={openNewMonster}
              disabled={monsterFamily.length >= MAX_FAMILY_SIZE}
            >
              <Plus size={14} /> New
            </button>
            <button
              type="button"
              className="dna-lab-button"
              onClick={openCreator}
            >
              Edit monster
            </button>
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
            <strong>{activeMonster.name} has collapsed!</strong>
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
            <span>{canMonsterHunt(monsterDna) ? "Hunt" : "Attack"}</span>
            <small>Space</small>
          </button>
        </div>

        <div className="water-rule">
          <Crosshair size={14} />
          <span>
            {canMonsterSwim(monsterDna)
              ? "Aquatic DNA: rivers and sea are open."
              : "Water is off limits. Look for a bridge."}
          </span>
        </div>
      </div>
      {creatorDraft && (
        <MonsterCreator
          key={`${creatorDraft.mode}-${activeMonsterId}`}
          dna={creatorDraft.dna}
          name={creatorDraft.name}
          onApply={applyMonsterDna}
          onClose={closeCreator}
        />
      )}
    </main>
  );
}
