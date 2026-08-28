"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { Canvas, useFrame } from "@react-three/fiber";
import { Billboard, Float, Sky, Sparkles } from "@react-three/drei";
import {
  Activity,
  ArrowLeft,
  Crosshair,
  Dna,
  Egg,
  Heart,
  Leaf,
  Menu,
  MousePointer2,
  Pencil,
  Plus,
  Swords,
  Waves,
  Wind,
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
  getMonsterSizeScale,
  type MonsterDna,
} from "@/components/game/monster-dna";
import {
  MonsterVisual,
  type MonsterMotionState,
} from "@/components/game/monster-model";
import {
  ADULT_AGE_SECONDS,
  createBabyName,
  createInitialWildPopulation,
  createSeededRandom,
  dnaSimilarity,
  EGG_HATCH_SECONDS,
  getCreaturePower,
  getCreatureSpeed,
  MATING_COOLDOWN_SECONDS,
  MAX_WILD_MONSTERS,
  mixMonsterDna,
  type SimulatedCreature,
  type SimulationEgg,
  type SimulationEvent,
  type SimulationIntent,
  type SimulationSnapshot,
} from "@/components/game/monster-simulation";
import {
  LanguageSwitcher,
  useI18n,
  type TranslationKey,
} from "@/components/i18n";

function CreatorLoading() {
  const { t } = useI18n();
  return (
    <div className="creator-overlay" role="status" aria-live="polite">
      <div className="creator-loading">{t("loading.creator")}</div>
    </div>
  );
}

const MonsterCreator = dynamic(
  () =>
    import("@/components/game/monster-creator").then(
      (module) => module.MonsterCreator,
    ),
  {
    ssr: false,
    loading: CreatorLoading,
  },
);

type Action = "eat" | "attack" | null;
type EdibleKind = "tree" | "bush";
type SceneQuality = "mobile" | "desktop";
type LocomotionMode = "land" | "swim" | "dive" | "fly";

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

type StatusMessage = {
  key: TranslationKey;
  values?: Record<string, string | number>;
};

type SimulationAttackResult = {
  hit: boolean;
  targetName?: string;
  defeated?: boolean;
  energyReward?: number;
};

type SimulationMateResult =
  | {
      ok: true;
      partnerName: string;
      mutations: number;
      cooldownUntil: number;
    }
  | {
      ok: false;
      reason:
        "cooldown" | "noPartner" | "tooFar" | "notReady" | "populationFull";
      partnerName?: string;
      seconds?: number;
    };

type SimulationApi = {
  getTime: () => number;
  attackAt: (
    x: number,
    z: number,
    attackerDna: MonsterDna,
  ) => SimulationAttackResult;
  requestMate: (
    playerId: string,
    playerName: string,
    playerDna: MonsterDna,
    x: number,
    z: number,
    playerCooldownUntil: number,
  ) => SimulationMateResult;
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
  health: number;
  matingCooldownUntil: number;
  lastAttackedAt: number;
  isDead: boolean;
  moving: boolean;
  sprinting: boolean;
  paused: boolean;
  locomotionMode: LocomotionMode;
  playerPosition: { x: number; y: number; z: number };
};

const WORLD_AREA_MULTIPLIER = 10;
const WORLD_SCALE = Math.sqrt(WORLD_AREA_MULTIPLIER);
const WORLD_RADIUS = 40 * WORLD_SCALE;
const PLAYABLE_RADIUS = 38.2 * WORLD_SCALE;
const BRIDGE_POSITIONS = [-96, -58, -20, 20, 58, 96] as const;
const WALK_ENERGY_PER_SECOND = 1.2;
const SPRINT_ENERGY_PER_SECOND = 3.8;
const SWIM_ENERGY_PER_SECOND = 1.7;
const FLY_ENERGY_PER_SECOND = 2.6;
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

function waterBlendAt(x: number, z: number) {
  const radius = Math.hypot(x, z);
  const seaBlend = THREE.MathUtils.smoothstep(
    radius,
    PLAYABLE_RADIUS - 1.8,
    PLAYABLE_RADIUS + 2.4,
  );
  const riverDistance = Math.abs(x - riverX(z));
  const riverWidthBlend =
    1 - THREE.MathUtils.smoothstep(riverDistance, 0.95, 2.35);
  const bridgeDistance = Math.min(
    ...BRIDGE_POSITIONS.map((bridgeZ) => Math.abs(z - bridgeZ)),
  );
  const bridgeOpeningBlend = THREE.MathUtils.smoothstep(
    bridgeDistance,
    1.05,
    2.15,
  );
  return Math.max(seaBlend, riverWidthBlend * bridgeOpeningBlend);
}

function isBlockedByWater(x: number, z: number, canSwim: boolean) {
  if (canSwim) return Math.hypot(x, z) > WORLD_RADIUS + 22;
  return isWaterAt(x, z);
}

function isDeepWaterAt(x: number, z: number) {
  return Math.hypot(x, z) > PLAYABLE_RADIUS + 1.2;
}

function getMonsterSpawn(dna: MonsterDna) {
  if (canMonsterSwim(dna) && dna.adaptation !== "wings") {
    const x = PLAYABLE_RADIUS + 4.5;
    return { x, y: -0.9, z: 0, mode: "swim" as const };
  }
  return {
    x: -8,
    y: terrainHeight(-8, 8),
    z: 8,
    mode: "land" as const,
  };
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
        side={THREE.DoubleSide}
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
  const root = useRef<THREE.Group>(null);
  const y = terrainHeight(prey.x, prey.z);
  const phase = Number(prey.id.split("-").at(-1) ?? 0) * 1.37;

  useFrame(({ clock }, delta) => {
    if (!root.current) return;
    const time = clock.elapsedTime;
    const x = prey.x + Math.sin(time * 0.65 + phase) * 1.15;
    const z = prey.z + Math.cos(time * 0.52 + phase) * 0.9;
    if (isWaterAt(x, z)) return;
    const dx = x - root.current.position.x;
    const dz = z - root.current.position.z;
    root.current.position.x = THREE.MathUtils.damp(
      root.current.position.x,
      x,
      5,
      delta,
    );
    root.current.position.z = THREE.MathUtils.damp(
      root.current.position.z,
      z,
      5,
      delta,
    );
    root.current.position.y =
      terrainHeight(root.current.position.x, root.current.position.z) +
      0.38 +
      Math.abs(Math.sin(time * 6.5 + phase)) * 0.06;
    if (Math.hypot(dx, dz) > 0.002) {
      root.current.rotation.y = dampAngle(
        root.current.rotation.y,
        Math.atan2(-dx, -dz),
        6,
        delta,
      );
    }
  });

  return (
    <group
      ref={root}
      position={[prey.x, y + 0.38, prey.z]}
      rotation={[0, -0.4, 0]}
    >
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
  const wings = [useRef<THREE.Group>(null), useRef<THREE.Group>(null)];
  const smoothMotion = useRef<MonsterMotionState>({
    stride: 0,
    intensity: 0,
    gait: "idle",
  });
  const target = useMemo(() => new THREE.Vector3(), []);
  const [homeX, homeZ, scale] =
    FAMILY_POSITIONS[index % FAMILY_POSITIONS.length];
  const phase = index * 1.73 + 0.8;
  const canFly = profile.dna.adaptation === "wings";
  const livesInWater =
    profile.dna.body === "aquatic" || profile.dna.breathing === "gills";
  const startX = livesInWater ? riverX(homeZ) : homeX;
  const startY = livesInWater
    ? -0.72
    : terrainHeight(startX, homeZ) + (canFly ? 4.4 : 0);

  useFrame(({ clock }, delta) => {
    if (!root.current || !visual.current) return;
    const time = clock.elapsedTime;
    const wanderSpeed = 0.22 + index * 0.018;
    let x = homeX + Math.sin(time * wanderSpeed + phase) * (4.5 + index);
    let z = homeZ + Math.cos(time * wanderSpeed * 0.78 + phase) * 4.2;
    let y = terrainHeight(x, z);

    if (livesInWater) {
      z = homeZ + Math.sin(time * wanderSpeed + phase) * 9;
      x = riverX(z) + Math.sin(time * 0.8 + phase) * 0.42;
      y = -0.72 + Math.sin(time * 2.2 + phase) * 0.09;
    } else if (canFly) {
      y = terrainHeight(x, z) + 4.4 + Math.sin(time * 1.5 + phase) * 0.45;
    } else if (isWaterAt(x, z)) {
      x = homeX;
      z = homeZ;
      y = terrainHeight(x, z);
    }

    target.set(x, y, z);
    const dx = target.x - root.current.position.x;
    const dz = target.z - root.current.position.z;
    root.current.position.lerp(target, 1 - Math.exp(-delta * 1.25));
    if (Math.hypot(dx, dz) > 0.002) {
      root.current.rotation.y = dampAngle(
        root.current.rotation.y,
        Math.atan2(-dx, -dz),
        4.5,
        delta,
      );
    }

    const stride = Math.sin(time * (canFly ? 7 : 8.5) + phase);
    smoothMotion.current.stride =
      stride * (canFly ? 0.16 : livesInWater ? 0.3 : 0.46);
    smoothMotion.current.intensity = 1;
    smoothMotion.current.gait = canFly ? "fly" : livesInWater ? "swim" : "walk";
    legs.forEach((leg, legIndex) => {
      if (leg.current) {
        leg.current.rotation.x = THREE.MathUtils.damp(
          leg.current.rotation.x,
          canFly || livesInWater
            ? stride * 0.12
            : stride * (legIndex % 2 ? -0.38 : 0.38),
          9,
          delta,
        );
      }
    });
    wings.forEach((wing, wingIndex) => {
      if (wing.current) {
        const side = wingIndex === 0 ? -1 : 1;
        wing.current.rotation.z =
          side * -(0.38 + Math.abs(Math.sin(time * 8 + phase)) * 0.62);
      }
    });
    visual.current.position.y = THREE.MathUtils.damp(
      visual.current.position.y,
      Math.abs(stride) * (canFly ? 0.11 : 0.045),
      9,
      delta,
    );
    visual.current.rotation.x = THREE.MathUtils.damp(
      visual.current.rotation.x,
      canFly ? -0.14 : livesInWater ? 0.08 : 0,
      7,
      delta,
    );
    visual.current.rotation.z = THREE.MathUtils.damp(
      visual.current.rotation.z,
      stride * (canFly || livesInWater ? 0.035 : 0.065),
      8,
      delta,
    );
  });

  return (
    <group
      ref={root}
      position={[startX, startY, homeZ]}
      rotation={[0, 1.4 + index * 0.7, 0]}
      scale={scale}
    >
      <group ref={visual}>
        <MonsterVisual
          dna={profile.dna}
          legRefs={legs}
          wingRefs={wings}
          motionRef={smoothMotion}
          castShadow={quality === "desktop"}
        />
      </group>
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
    y: number,
    z: number,
    moving: boolean,
    sprinting: boolean,
    mode: LocomotionMode,
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
  const wings = [useRef<THREE.Group>(null), useRef<THREE.Group>(null)];
  const smoothMotion = useRef<MonsterMotionState>({
    stride: 0,
    intensity: 0,
    gait: "idle",
  });
  const velocity = useMemo(() => new THREE.Vector3(), []);
  const cameraTarget = useMemo(() => new THREE.Vector3(), []);
  const desiredCamera = useMemo(() => new THREE.Vector3(), []);
  const canSwim = canMonsterSwim(dna);
  const canFly = dna.adaptation === "wings";
  const spawn = getMonsterSpawn(dna);

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
      const flying = state.locomotionMode === "fly" && canFly;
      const speed = flying ? (sprinting ? 13.2 : 9.2) : sprinting ? 8.2 : 5.4;
      const nextX = root.current.position.x + velocity.x * speed * delta;
      const nextZ = root.current.position.z + velocity.z * speed * delta;
      if (flying || !isBlockedByWater(nextX, root.current.position.z, canSwim))
        root.current.position.x = nextX;
      if (flying || !isBlockedByWater(root.current.position.x, nextZ, canSwim))
        root.current.position.z = nextZ;
    }

    const overWater = isWaterAt(
      root.current.position.x,
      root.current.position.z,
    );
    let resolvedMode = state.locomotionMode;
    if (resolvedMode === "fly" && !canFly) {
      resolvedMode = overWater && canSwim ? "swim" : "land";
    } else if (
      resolvedMode === "dive" &&
      (!canSwim ||
        !isDeepWaterAt(root.current.position.x, root.current.position.z))
    ) {
      resolvedMode = overWater && canSwim ? "swim" : "land";
    } else if (resolvedMode !== "fly") {
      resolvedMode =
        overWater && canSwim
          ? resolvedMode === "dive"
            ? "dive"
            : "swim"
          : "land";
    }
    const flying = resolvedMode === "fly";
    const diving = resolvedMode === "dive";
    const swimming = resolvedMode === "swim";
    const targetHeight = flying
      ? terrainHeight(root.current.position.x, root.current.position.z) +
        7.4 +
        Math.sin(clock.elapsedTime * 1.8) * 0.22
      : diving
        ? -3.55 + Math.sin(clock.elapsedTime * 2.1) * 0.16
        : swimming
          ? (isDeepWaterAt(root.current.position.x, root.current.position.z)
              ? -1.05
              : -0.72) +
            Math.sin(clock.elapsedTime * 2.4) * 0.08
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
      root.current.position.y,
      root.current.position.z,
      moving,
      moving && sprinting,
      resolvedMode,
    );
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
    smoothMotion.current.stride = stride;
    smoothMotion.current.intensity = moving ? (sprinting ? 1 : 0.78) : 0;
    smoothMotion.current.gait = flying
      ? "fly"
      : swimming || diving
        ? "swim"
        : sprinting && moving
          ? "sprint"
          : moving
            ? "walk"
            : "idle";
    legs.forEach((leg, index) => {
      if (leg.current)
        leg.current.rotation.x = THREE.MathUtils.lerp(
          leg.current.rotation.x,
          stride * (index % 2 ? -1 : 1),
          delta * 10,
        );
    });
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
    <group ref={root} position={[spawn.x, spawn.y, spawn.z]}>
      <group ref={visual}>
        <MonsterVisual
          dna={dna}
          legRefs={legs}
          wingRefs={wings}
          motionRef={smoothMotion}
        />
      </group>
    </group>
  );
}

type SimulationParent = {
  id: string;
  name: string;
  dna: MonsterDna;
  generation: number;
  x: number;
  z: number;
};

function settleCreatureHabitat(creature: SimulatedCreature, index = 0) {
  const aquatic =
    canMonsterSwim(creature.dna) && creature.dna.adaptation !== "wings";
  if (aquatic) {
    creature.z = THREE.MathUtils.clamp(creature.z, -96, 96);
    creature.x = riverX(creature.z) + ((index % 3) - 1) * 0.35;
    creature.y = -0.72;
    return creature;
  }

  let attempts = 0;
  while (
    (isWaterAt(creature.x, creature.z) ||
      Math.hypot(creature.x, creature.z) > PLAYABLE_RADIUS - 8) &&
    attempts < 12
  ) {
    const angle = creature.wanderAngle + attempts * 0.83;
    const radius = 14 + ((index * 13 + attempts * 7) % 42);
    creature.x = Math.cos(angle) * radius;
    creature.z = Math.sin(angle) * radius;
    attempts += 1;
  }
  creature.y =
    terrainHeight(creature.x, creature.z) +
    (creature.dna.adaptation === "wings" ? 4.2 : 0);
  return creature;
}

function direction(fromX: number, fromZ: number, toX: number, toZ: number) {
  const dx = toX - fromX;
  const dz = toZ - fromZ;
  const distance = Math.hypot(dx, dz);
  return {
    x: distance > 0.0001 ? dx / distance : 0,
    z: distance > 0.0001 ? dz / distance : 0,
    distance,
  };
}

function SimulatedMonsterActor({
  creature,
  quality,
}: {
  creature: SimulatedCreature;
  quality: SceneQuality;
}) {
  const root = useRef<THREE.Group>(null);
  const visual = useRef<THREE.Group>(null);
  const vitals = useRef<THREE.Group>(null);
  const healthFill = useRef<THREE.Mesh>(null);
  const energyFill = useRef<THREE.Mesh>(null);
  const lastPosition = useRef({ x: creature.x, z: creature.z });
  const motion = useRef<MonsterMotionState>({
    stride: 0,
    intensity: 0,
    gait: "idle",
  });

  useFrame(({ clock }, delta) => {
    if (!root.current || !visual.current) return;
    const waterBlend = canMonsterSwim(creature.dna)
      ? waterBlendAt(creature.x, creature.z)
      : 0;
    const landHeight = terrainHeight(creature.x, creature.z);
    const swimmingHeight = THREE.MathUtils.lerp(
      landHeight,
      -0.72 + Math.sin(clock.elapsedTime * 2.1) * 0.07,
      waterBlend,
    );
    const targetY = creature.alive
      ? creature.dna.adaptation === "wings"
        ? landHeight + 4.2 + Math.sin(clock.elapsedTime * 1.6) * 0.22
        : swimmingHeight
      : landHeight;
    root.current.position.x = THREE.MathUtils.damp(
      root.current.position.x,
      creature.x,
      10,
      delta,
    );
    const dampedY = THREE.MathUtils.damp(
      root.current.position.y,
      targetY,
      9,
      delta,
    );
    const maximumVerticalStep =
      (creature.dna.adaptation === "wings" ? 4.8 : 2.8) * delta;
    root.current.position.y += THREE.MathUtils.clamp(
      dampedY - root.current.position.y,
      -maximumVerticalStep,
      maximumVerticalStep,
    );
    root.current.position.z = THREE.MathUtils.damp(
      root.current.position.z,
      creature.z,
      10,
      delta,
    );
    root.current.rotation.y = dampAngle(
      root.current.rotation.y,
      creature.yaw,
      8,
      delta,
    );

    const moved = Math.hypot(
      creature.x - lastPosition.current.x,
      creature.z - lastPosition.current.z,
    );
    lastPosition.current = { x: creature.x, z: creature.z };
    const swimming = waterBlend > 0.52;
    const flying = creature.dna.adaptation === "wings";
    const cadence =
      creature.intent === "flee" || creature.intent === "hunt" ? 14 : 9;
    motion.current.stride =
      moved > 0.0005 ? Math.sin(clock.elapsedTime * cadence) * 0.48 : 0;
    motion.current.intensity = moved > 0.0005 ? 0.82 : 0;
    motion.current.gait = flying
      ? "fly"
      : swimming
        ? "swim"
        : creature.intent === "flee" || creature.intent === "hunt"
          ? "sprint"
          : moved > 0.0005
            ? "walk"
            : "idle";

    const juvenileScale = THREE.MathUtils.lerp(
      0.48,
      0.66,
      THREE.MathUtils.smoothstep(creature.age, 0, ADULT_AGE_SECONDS),
    );
    visual.current.scale.setScalar(juvenileScale);
    visual.current.rotation.z = THREE.MathUtils.damp(
      visual.current.rotation.z,
      creature.alive ? 0 : -Math.PI * 0.46,
      6,
      delta,
    );
    const actionPulse =
      creature.intent === "hunt" || creature.intent === "defend"
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
        creature.alive && (creature.health < 98 || creature.energy < 72);
    }
    const healthRatio = THREE.MathUtils.clamp(creature.health / 100, 0.015, 1);
    const energyRatio = THREE.MathUtils.clamp(creature.energy / 100, 0.015, 1);
    if (healthFill.current) {
      healthFill.current.scale.x = healthRatio;
      healthFill.current.position.x = -(1 - healthRatio) * 0.52;
    }
    if (energyFill.current) {
      energyFill.current.scale.x = energyRatio;
      energyFill.current.position.x = -(1 - energyRatio) * 0.52;
    }
  });

  const barHeight = 2.25 * getMonsterSizeScale(creature.dna.size);
  return (
    <group ref={root} position={[creature.x, creature.y, creature.z]}>
      <group ref={visual}>
        <MonsterVisual
          dna={creature.dna}
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

function SimulationEggActor({ egg }: { egg: SimulationEgg }) {
  const root = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (!root.current) return;
    const age = Math.max(0, clock.elapsedTime - egg.laidAt);
    const urgency = THREE.MathUtils.smoothstep(
      age,
      EGG_HATCH_SECONDS * 0.6,
      EGG_HATCH_SECONDS,
    );
    root.current.rotation.z =
      Math.sin(clock.elapsedTime * (2.2 + urgency * 5)) *
      (0.04 + urgency * 0.09);
    root.current.position.y =
      egg.y + 0.42 + Math.sin(clock.elapsedTime * 1.8) * 0.025;
  });
  return (
    <group ref={root} position={[egg.x, egg.y + 0.42, egg.z]}>
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

function SimulationPopulation({
  controls,
  apiRef,
  playerName,
  playerDna,
  quality,
  onPlayerDamage,
  onSnapshot,
}: {
  controls: React.RefObject<ControlState>;
  apiRef: React.MutableRefObject<SimulationApi | null>;
  playerName: string;
  playerDna: MonsterDna;
  quality: SceneQuality;
  onPlayerDamage: (amount: number, attackerName: string) => void;
  onSnapshot: (snapshot: SimulationSnapshot) => void;
}) {
  const [creatures, setCreatures] = useState(() =>
    createInitialWildPopulation().map((creature, index) =>
      settleCreatureHabitat(creature, index),
    ),
  );
  const [eggs, setEggs] = useState<SimulationEgg[]>([]);
  const creaturesRef = useRef(creatures);
  const eggsRef = useRef(eggs);
  const randomRef = useRef(createSeededRandom(0x45434f53));
  const simulationTime = useRef(0);
  const accumulator = useRef(0);
  const nextSnapshotAt = useRef(0);
  const births = useRef(0);
  const deaths = useRef(0);
  const latestEvent = useRef<SimulationEvent | null>(null);
  const nextEggId = useRef(1);
  const nextCreatureId = useRef(1);

  const publishCreatures = useCallback((next: SimulatedCreature[]) => {
    creaturesRef.current = next;
    setCreatures(next);
  }, []);

  const publishEggs = useCallback((next: SimulationEgg[]) => {
    eggsRef.current = next;
    setEggs(next);
  }, []);

  const layEgg = useCallback(
    (first: SimulationParent, second: SimulationParent, now: number) => {
      const random = randomRef.current;
      const mix = mixMonsterDna(first.dna, second.dna, random);
      const x = (first.x + second.x) / 2;
      const z = (first.z + second.z) / 2;
      const egg: SimulationEgg = {
        id: `egg-${nextEggId.current++}`,
        dna: mix.dna,
        parentIds: [first.id, second.id],
        parentNames: [first.name, second.name],
        generation: Math.max(first.generation, second.generation) + 1,
        x,
        y: terrainHeight(x, z),
        z,
        laidAt: now,
        hatchAt: now + EGG_HATCH_SECONDS,
        mutations: mix.mutations,
      };
      publishEggs([...eggsRef.current, egg]);
      latestEvent.current = {
        kind: "egg",
        names: [first.name, second.name],
        mutations: mix.mutations,
      };
      return mix.mutations;
    },
    [publishEggs],
  );

  const markDead = useCallback((creature: SimulatedCreature, now: number) => {
    if (!creature.alive) return;
    creature.alive = false;
    creature.health = 0;
    creature.deathAt = now;
    deaths.current += 1;
    latestEvent.current = { kind: "death", names: [creature.name] };
  }, []);

  const attackAt = useCallback(
    (x: number, z: number, attackerDna: MonsterDna): SimulationAttackResult => {
      let nearest: SimulatedCreature | null = null;
      let nearestDistance = HUNT_DISTANCE;
      for (const creature of creaturesRef.current) {
        if (!creature.alive) continue;
        const distance = Math.hypot(creature.x - x, creature.z - z);
        if (distance < nearestDistance) {
          nearest = creature;
          nearestDistance = distance;
        }
      }
      if (!nearest) return { hit: false };
      const damage = 7.5 + getCreaturePower(attackerDna) * 5.2;
      const nextHealth = Math.max(0, nearest.health - damage);
      const updated: SimulatedCreature = {
        ...nearest,
        health: nextHealth,
        lastAttackedAt: simulationTime.current,
        lastAttackerId: "player",
        intent: nextHealth < 28 ? "flee" : "defend",
        targetId: "player",
      };
      const defeated = nextHealth <= 0;
      if (defeated) markDead(updated, simulationTime.current);
      publishCreatures(
        creaturesRef.current.map((creature) =>
          creature.id === updated.id ? updated : creature,
        ),
      );
      latestEvent.current = {
        kind: "fight",
        names: [playerName, nearest.name],
      };
      return {
        hit: true,
        targetName: nearest.name,
        defeated,
        energyReward:
          defeated && canMonsterHunt(attackerDna)
            ? attackerDna.diet === "carnivore"
              ? 34
              : 20
            : 0,
      };
    },
    [markDead, playerName, publishCreatures],
  );

  const requestMate = useCallback(
    (
      requestPlayerId: string,
      requestPlayerName: string,
      requestPlayerDna: MonsterDna,
      x: number,
      z: number,
      playerCooldownUntil: number,
    ): SimulationMateResult => {
      const now = simulationTime.current;
      const living = creaturesRef.current.filter(
        (creature) => creature.alive,
      ).length;
      if (living + eggsRef.current.length >= MAX_WILD_MONSTERS)
        return { ok: false, reason: "populationFull" };
      if (playerCooldownUntil > now) {
        return {
          ok: false,
          reason: "cooldown",
          seconds: Math.ceil(playerCooldownUntil - now),
        };
      }
      if (controls.current.health < 55 || controls.current.energy < 55)
        return { ok: false, reason: "notReady" };

      let nearest: SimulatedCreature | null = null;
      let nearestDistance = 18;
      for (const creature of creaturesRef.current) {
        if (
          !creature.alive ||
          creature.age < ADULT_AGE_SECONDS ||
          creature.health < 55 ||
          creature.energy < 55 ||
          creature.mateCooldownUntil > now
        )
          continue;
        const distance = Math.hypot(creature.x - x, creature.z - z);
        if (distance < nearestDistance) {
          nearest = creature;
          nearestDistance = distance;
        }
      }
      if (!nearest) return { ok: false, reason: "noPartner" };
      if (nearestDistance > 6.2)
        return {
          ok: false,
          reason: "tooFar",
          partnerName: nearest.name,
        };

      const cooldownUntil = now + MATING_COOLDOWN_SECONDS;
      const updatedPartner: SimulatedCreature = {
        ...nearest,
        mateCooldownUntil: cooldownUntil,
        energy: Math.max(0, nearest.energy - 16),
      };
      publishCreatures(
        creaturesRef.current.map((creature) =>
          creature.id === updatedPartner.id ? updatedPartner : creature,
        ),
      );
      const mutations = layEgg(
        {
          id: requestPlayerId,
          name: requestPlayerName,
          dna: requestPlayerDna,
          generation: 0,
          x,
          z,
        },
        updatedPartner,
        now,
      );
      return {
        ok: true,
        partnerName: nearest.name,
        mutations,
        cooldownUntil,
      };
    },
    [controls, layEgg, publishCreatures],
  );

  useEffect(() => {
    apiRef.current = {
      getTime: () => simulationTime.current,
      attackAt,
      requestMate,
    };
    return () => {
      apiRef.current = null;
    };
  }, [apiRef, attackAt, requestMate]);

  useFrame(({ clock }, delta) => {
    simulationTime.current = clock.elapsedTime;
    accumulator.current += Math.min(delta, 0.1);
    if (accumulator.current < 0.1) return;
    const step = Math.min(0.3, accumulator.current);
    accumulator.current = 0;
    const now = clock.elapsedTime;
    const random = randomRef.current;
    const population = creaturesRef.current;
    const living = population.filter((creature) => creature.alive);
    const resourcePool = quality === "mobile" ? MOBILE_EDIBLES : EDIBLES;

    for (const creature of living) {
      // Another creature earlier in this same simulation step may have killed
      // this one. The `living` snapshot is intentionally stable for iteration,
      // so re-check the mutable flag before evaluating any objectives.
      if (!creature.alive) continue;
      creature.age += step;
      const recentlyHurt = now - creature.lastAttackedAt < 4;
      if (!recentlyHurt && creature.energy > 4) {
        const recovery = 0.12 + (creature.energy / 100) * 1.02;
        creature.health = Math.min(100, creature.health + recovery * step);
      }
      creature.energy = Math.max(0, creature.energy - 0.045 * step);
      if (creature.energy <= 0) {
        markDead(creature, now);
        continue;
      }

      let steerX = Math.cos(creature.wanderAngle) * 0.16;
      let steerZ = Math.sin(creature.wanderAngle) * 0.16;
      const scores: Array<[SimulationIntent, number]> = [["wander", 0.16]];
      const hunger = THREE.MathUtils.clamp((72 - creature.energy) / 72, 0, 1);
      const lowHealth = THREE.MathUtils.clamp(
        (60 - creature.health) / 60,
        0,
        1,
      );
      const power = getCreaturePower(creature.dna);

      if (now >= creature.nextDecisionAt) {
        creature.wanderAngle += (random() - 0.5) * 1.3;
        creature.nextDecisionAt = now + 0.7 + random() * 1.4;
      }

      let nearestThreat: SimulatedCreature | null = null;
      let threatDistance = 16;
      for (const other of living) {
        if (other.id === creature.id) continue;
        if (!canMonsterHunt(other.dna)) continue;
        const separation = direction(creature.x, creature.z, other.x, other.z);
        const dangerous =
          other.lastAttackerId === creature.id ||
          (other.dna.diet === "carnivore" &&
            (creature.dna.diet === "herbivore" ||
              getCreaturePower(other.dna) > power * 1.08));
        if (dangerous && separation.distance < threatDistance) {
          nearestThreat = other;
          threatDistance = separation.distance;
        }
      }

      if (nearestThreat) {
        const away = direction(
          nearestThreat.x,
          nearestThreat.z,
          creature.x,
          creature.z,
        );
        const fleeScore =
          THREE.MathUtils.clamp((16 - threatDistance) / 12, 0, 1) *
          (0.8 + lowHealth * 1.4);
        steerX += away.x * fleeScore * 1.9;
        steerZ += away.z * fleeScore * 1.9;
        scores.push(["flee", fleeScore]);
      }

      const playerSeparation = direction(
        creature.x,
        creature.z,
        controls.current.playerPosition.x,
        controls.current.playerPosition.z,
      );
      const socialCandidates = [
        ...living
          .filter((other) => other.id !== creature.id)
          .map((other) => ({
            id: other.id,
            dna: other.dna,
            x: other.x,
            z: other.z,
            distance: Math.hypot(other.x - creature.x, other.z - creature.z),
          })),
        ...(!controls.current.isDead
          ? [
              {
                id: "player",
                dna: playerDna,
                x: controls.current.playerPosition.x,
                z: controls.current.playerPosition.z,
                distance: playerSeparation.distance,
              },
            ]
          : []),
      ];

      if (creature.dna.social === "solitary") {
        let repelX = 0;
        let repelZ = 0;
        let nearby = 0;
        for (const other of socialCandidates) {
          if (other.distance > 11 || other.distance < 0.001) continue;
          const away = direction(other.x, other.z, creature.x, creature.z);
          const strength = (11 - other.distance) / 11;
          repelX += away.x * strength;
          repelZ += away.z * strength;
          nearby += strength;
        }
        if (nearby > 0) {
          steerX += repelX * 0.95;
          steerZ += repelZ * 0.95;
          scores.push(["socialize", Math.min(0.78, nearby * 0.42)]);
        }
      } else {
        const desiredNeighbors =
          creature.dna.social === "pair"
            ? 1
            : creature.dna.social === "pack"
              ? 3
              : 7;
        const preferred = socialCandidates
          .map((other) => ({
            ...other,
            similarity: dnaSimilarity(creature.dna, other.dna),
          }))
          .sort(
            (first, second) =>
              second.similarity / (1 + second.distance * 0.025) -
              first.similarity / (1 + first.distance * 0.025),
          )
          .slice(0, desiredNeighbors);
        let socialX = 0;
        let socialZ = 0;
        let socialWeight = 0;
        for (const other of preferred) {
          const toward = direction(creature.x, creature.z, other.x, other.z);
          const idealDistance = creature.dna.social === "pair" ? 4.2 : 5.5;
          const distanceError = THREE.MathUtils.clamp(
            (toward.distance - idealDistance) / 12,
            -0.7,
            1,
          );
          const weight = 0.18 + other.similarity ** 2 * 0.82;
          socialX += toward.x * distanceError * weight;
          socialZ += toward.z * distanceError * weight;
          socialWeight += Math.abs(distanceError) * weight;
        }
        if (socialWeight > 0.02) {
          steerX += socialX * 0.9;
          steerZ += socialZ * 0.9;
          scores.push(["socialize", Math.min(0.82, socialWeight * 0.45)]);
        }
      }

      if (canMonsterEatPlants(creature.dna) && hunger > 0.05) {
        let nearestFood: Edible | null = null;
        let foodDistance = 52;
        for (const edible of resourcePool) {
          const distance = Math.hypot(
            edible.x - creature.x,
            edible.z - creature.z,
          );
          if (distance < foodDistance) {
            foodDistance = distance;
            nearestFood = edible;
          }
        }
        if (nearestFood) {
          const towardFood = direction(
            creature.x,
            creature.z,
            nearestFood.x,
            nearestFood.z,
          );
          const forageScore =
            hunger * (0.72 + Math.min(0.28, foodDistance / 80));
          steerX += towardFood.x * forageScore * 1.55;
          steerZ += towardFood.z * forageScore * 1.55;
          scores.push(["forage", forageScore]);
          if (foodDistance < 2.5 && now >= creature.forageCooldownUntil) {
            const dietFactor = creature.dna.diet === "omnivore" ? 0.72 : 1;
            creature.energy = Math.min(
              100,
              creature.energy + nearestFood.energy * 0.5 * dietFactor,
            );
            creature.forageCooldownUntil = now + 5.5;
          }
        }
      }

      let prey: SimulatedCreature | null = null;
      let preyDistance = 34;
      const shouldHunt =
        canMonsterHunt(creature.dna) &&
        (creature.dna.diet === "carnivore"
          ? creature.energy < 68
          : creature.energy < 38);
      if (shouldHunt) {
        for (const other of living) {
          if (other.id === creature.id) continue;
          const otherPower = getCreaturePower(other.dna);
          const distance = Math.hypot(
            other.x - creature.x,
            other.z - creature.z,
          );
          if (distance < preyDistance && otherPower < power * 1.22) {
            prey = other;
            preyDistance = distance;
          }
        }
      }

      const defending =
        now - creature.lastAttackedAt < 7 && creature.lastAttackerId !== null;
      let combatTarget: SimulatedCreature | "player" | null = prey;
      if (defending) {
        combatTarget =
          creature.lastAttackerId === "player"
            ? "player"
            : (living.find((other) => other.id === creature.lastAttackerId) ??
              null);
      }
      if (combatTarget) {
        const targetX =
          combatTarget === "player"
            ? controls.current.playerPosition.x
            : combatTarget.x;
        const targetZ =
          combatTarget === "player"
            ? controls.current.playerPosition.z
            : combatTarget.z;
        const towardTarget = direction(
          creature.x,
          creature.z,
          targetX,
          targetZ,
        );
        const combatScore = defending
          ? creature.health < 25
            ? 0
            : 0.9
          : hunger * 1.08;
        if (defending && creature.health < 25) {
          steerX -= towardTarget.x * 1.8;
          steerZ -= towardTarget.z * 1.8;
          scores.push(["flee", 1]);
        } else {
          steerX += towardTarget.x * combatScore * 1.8;
          steerZ += towardTarget.z * combatScore * 1.8;
          scores.push([defending ? "defend" : "hunt", combatScore]);
          creature.targetId =
            combatTarget === "player" ? "player" : combatTarget.id;
          if (
            towardTarget.distance < 2.8 &&
            now >= creature.attackCooldownUntil
          ) {
            creature.attackCooldownUntil = now + 1.35 + random() * 0.35;
            creature.energy = Math.max(0, creature.energy - 3.6);
            const damage = 4.5 + power * (3.2 + random() * 2.4);
            if (combatTarget === "player") {
              if (!controls.current.isDead)
                onPlayerDamage(damage, creature.name);
            } else {
              combatTarget.health = Math.max(0, combatTarget.health - damage);
              combatTarget.lastAttackedAt = now;
              combatTarget.lastAttackerId = creature.id;
              if (combatTarget.health <= 0) {
                markDead(combatTarget, now);
                creature.energy = Math.min(
                  100,
                  creature.energy +
                    (creature.dna.diet === "carnivore" ? 38 : 22),
                );
              }
            }
            latestEvent.current = {
              kind: "fight",
              names: [
                creature.name,
                combatTarget === "player" ? playerName : combatTarget.name,
              ],
            };
          }
        }
      }

      const readyToMate =
        creature.age >= ADULT_AGE_SECONDS &&
        creature.energy >= 62 &&
        creature.health >= 62 &&
        creature.mateCooldownUntil <= now &&
        living.length + eggsRef.current.length < MAX_WILD_MONSTERS;
      if (readyToMate) {
        const partner = living
          .filter(
            (other) =>
              other.id !== creature.id &&
              other.age >= ADULT_AGE_SECONDS &&
              other.energy >= 60 &&
              other.health >= 60 &&
              other.mateCooldownUntil <= now,
          )
          .map((other) => ({
            other,
            similarity: dnaSimilarity(creature.dna, other.dna),
            distance: Math.hypot(other.x - creature.x, other.z - creature.z),
          }))
          .filter((candidate) => candidate.similarity >= 0.28)
          .sort(
            (first, second) =>
              second.similarity / (1 + second.distance * 0.035) -
              first.similarity / (1 + first.distance * 0.035),
          )[0];
        if (partner) {
          const towardPartner = direction(
            creature.x,
            creature.z,
            partner.other.x,
            partner.other.z,
          );
          const mateScore = 0.42 + partner.similarity * 0.48;
          steerX += towardPartner.x * mateScore;
          steerZ += towardPartner.z * mateScore;
          scores.push(["mate", mateScore]);
          creature.targetId = partner.other.id;
          if (partner.distance < 2.8) {
            const cooldownUntil = now + MATING_COOLDOWN_SECONDS;
            creature.mateCooldownUntil = cooldownUntil;
            partner.other.mateCooldownUntil = cooldownUntil;
            creature.energy = Math.max(0, creature.energy - 16);
            partner.other.energy = Math.max(0, partner.other.energy - 16);
            layEgg(creature, partner.other, now);
          }
        }
      }

      // Local separation is always active, even for armies, so a group stays a
      // readable cluster rather than collapsing into one overlapping mesh.
      for (const other of living) {
        if (other.id === creature.id) continue;
        const separation = direction(other.x, other.z, creature.x, creature.z);
        if (separation.distance < 2.6 && separation.distance > 0.001) {
          const strength = (2.6 - separation.distance) / 2.6;
          steerX += separation.x * strength * 1.4;
          steerZ += separation.z * strength * 1.4;
        }
      }

      const radius = Math.hypot(creature.x, creature.z);
      if (radius > PLAYABLE_RADIUS - 12) {
        steerX += (-creature.x / radius) * 2;
        steerZ += (-creature.z / radius) * 2;
      }
      const length = Math.hypot(steerX, steerZ);
      const dominant = scores.sort((first, second) => second[1] - first[1])[0];
      creature.intent = dominant?.[0] ?? "wander";
      if (length > 0.0001) {
        const speedScale =
          creature.intent === "flee"
            ? 1.28
            : creature.intent === "hunt" || creature.intent === "defend"
              ? 1.12
              : creature.intent === "rest"
                ? 0.2
                : 0.82;
        const speed = getCreatureSpeed(creature.dna) * speedScale;
        const moveX = (steerX / length) * speed * step;
        const moveZ = (steerZ / length) * speed * step;
        const nextX = creature.x + moveX;
        const nextZ = creature.z + moveZ;
        const blocked = isBlockedByWater(
          nextX,
          nextZ,
          canMonsterSwim(creature.dna),
        );
        if (!blocked) {
          creature.x = nextX;
          creature.z = nextZ;
          creature.yaw = Math.atan2(-moveX, -moveZ);
          creature.energy = Math.max(
            0,
            creature.energy -
              (creature.intent === "flee" || creature.intent === "hunt"
                ? 0.42
                : 0.2) *
                step,
          );
        } else {
          creature.wanderAngle += Math.PI * (0.45 + random() * 0.4);
        }
      }
    }

    const dueEggs = eggsRef.current.filter((egg) => egg.hatchAt <= now);
    if (dueEggs.length > 0) {
      const nextPopulation = [...population];
      for (const egg of dueEggs) {
        if (
          nextPopulation.filter((creature) => creature.alive).length >=
          MAX_WILD_MONSTERS
        )
          break;
        const baby = settleCreatureHabitat(
          {
            id: `baby-${nextCreatureId.current++}`,
            name: createBabyName(
              egg.parentNames[0],
              egg.parentNames[1],
              random,
            ),
            dna: egg.dna,
            generation: egg.generation,
            parentIds: egg.parentIds,
            x: egg.x + (random() - 0.5) * 1.2,
            y: egg.y,
            z: egg.z + (random() - 0.5) * 1.2,
            yaw: random() * Math.PI * 2,
            energy: 78,
            health: 100,
            age: 0,
            intent: "socialize",
            targetId: egg.parentIds[0],
            wanderAngle: random() * Math.PI * 2,
            nextDecisionAt: now + 1,
            attackCooldownUntil: now + 8,
            forageCooldownUntil: now + 3,
            mateCooldownUntil: now + ADULT_AGE_SECONDS,
            lastAttackedAt: -100,
            lastAttackerId: null,
            alive: true,
            deathAt: null,
          },
          nextCreatureId.current,
        );
        nextPopulation.push(baby);
        births.current += 1;
        latestEvent.current = {
          kind: "birth",
          names: [baby.name],
          mutations: egg.mutations,
        };
      }
      publishCreatures(nextPopulation);
      publishEggs(eggsRef.current.filter((egg) => egg.hatchAt > now));
    }

    const populationAfterHatching = creaturesRef.current;
    const expiredBodies = populationAfterHatching.some(
      (creature) =>
        !creature.alive &&
        creature.deathAt !== null &&
        now - creature.deathAt > 8,
    );
    if (expiredBodies) {
      publishCreatures(
        populationAfterHatching.filter(
          (creature) =>
            creature.alive ||
            creature.deathAt === null ||
            now - creature.deathAt <= 8,
        ),
      );
    }

    if (now >= nextSnapshotAt.current) {
      nextSnapshotAt.current = now + 1;
      onSnapshot({
        living:
          creaturesRef.current.filter((creature) => creature.alive).length +
          (controls.current.isDead ? 0 : 1),
        eggs: eggsRef.current.length,
        births: births.current,
        deaths: deaths.current,
        event: latestEvent.current,
      });
    }
  });

  return (
    <group>
      {creatures.map((creature) => (
        <SimulatedMonsterActor
          key={creature.id}
          creature={creature}
          quality={quality}
        />
      ))}
      {eggs.map((egg) => (
        <SimulationEggActor key={egg.id} egg={egg} />
      ))}
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
  onPlayerDamage,
  onSimulationSnapshot,
  playerName,
  simulationApi,
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
  playerName: string;
  simulationApi: React.MutableRefObject<SimulationApi | null>;
  onPlayerDamage: (amount: number, attackerName: string) => void;
  onSimulationSnapshot: (snapshot: SimulationSnapshot) => void;
  onPlayerFrame: (
    x: number,
    y: number,
    z: number,
    moving: boolean,
    sprinting: boolean,
    mode: LocomotionMode,
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
        shadow-bias={-0.00012}
        shadow-normalBias={0.04}
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
      <SimulationPopulation
        controls={controls}
        apiRef={simulationApi}
        playerName={playerName}
        playerDna={dna}
        quality={quality}
        onPlayerDamage={onPlayerDamage}
        onSnapshot={onSimulationSnapshot}
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
  const { t, option } = useI18n();
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
    health: 100,
    matingCooldownUntil: 0,
    lastAttackedAt: -100_000,
    isDead: false,
    moving: false,
    sprinting: false,
    paused: false,
    locomotionMode: "land",
    playerPosition: { x: -8, y: terrainHeight(-8, 8), z: 8 },
  });
  const displayedEnergy = useRef(100);
  const displayedHealth = useRef(100);
  const displayedMatingCooldown = useRef(0);
  const displayedLocomotion = useRef<LocomotionMode>("land");
  const simulationApi = useRef<SimulationApi | null>(null);
  const playerMatingCooldowns = useRef<Map<string, number>>(new Map());
  const eatenIdsRef = useRef<Set<string>>(new Set());
  const huntedIdsRef = useRef<Set<string>>(new Set());
  const nextMonsterId = useRef(2);
  const [pointerLocked, setPointerLocked] = useState(false);
  const [status, setStatus] = useState<StatusMessage>({
    key: "game.welcome",
  });
  const [energy, setEnergy] = useState(100);
  const [health, setHealth] = useState(100);
  const [matingCooldown, setMatingCooldown] = useState(0);
  const [locomotionMode, setLocomotionMode] = useState<LocomotionMode>("land");
  const [isDead, setIsDead] = useState(false);
  const [deathReason, setDeathReason] = useState<"energy" | "health">("energy");
  const [simulationSnapshot, setSimulationSnapshot] =
    useState<SimulationSnapshot>({
      living: 11,
      eggs: 0,
      births: 0,
      deaths: 0,
      event: null,
    });
  const [eatenIds, setEatenIds] = useState<Set<string>>(() => new Set());
  const [huntedIds, setHuntedIds] = useState<Set<string>>(() => new Set());
  const [monsterKey, setMonsterKey] = useState(0);
  const [monsterFamily, setMonsterFamily] = useState<MonsterProfile[]>([
    { id: "monster-1", name: "Moss Muncher", dna: DEFAULT_MONSTER_DNA },
  ]);
  const [activeMonsterId, setActiveMonsterId] = useState("monster-1");
  const [creatorDraft, setCreatorDraft] = useState<CreatorDraft | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const activeMonster =
    monsterFamily.find((profile) => profile.id === activeMonsterId) ??
    monsterFamily[0];
  const monsterDna = activeMonster.dna;
  const sceneQuality = useSyncExternalStore(
    subscribeToDeviceProfile,
    getDeviceProfile,
    getServerDeviceProfile,
  );

  const setMovementMode = useCallback((mode: LocomotionMode) => {
    controls.current.locomotionMode = mode;
    displayedLocomotion.current = mode;
    setLocomotionMode(mode);
  }, []);

  const resetMonsterMovement = useCallback(
    (dna: MonsterDna) => {
      const spawn = getMonsterSpawn(dna);
      controls.current.playerPosition = {
        x: spawn.x,
        y: spawn.y,
        z: spawn.z,
      };
      setMovementMode(spawn.mode);
    },
    [setMovementMode],
  );

  const reportPlayerFrame = useCallback(
    (
      x: number,
      y: number,
      z: number,
      moving: boolean,
      sprinting: boolean,
      mode: LocomotionMode,
    ) => {
      controls.current.playerPosition.x = x;
      controls.current.playerPosition.y = y;
      controls.current.playerPosition.z = z;
      controls.current.moving = moving;
      controls.current.sprinting = sprinting;
      controls.current.locomotionMode = mode;
      if (displayedLocomotion.current !== mode) {
        displayedLocomotion.current = mode;
        setLocomotionMode(mode);
      }
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

  const setHealthLevel = useCallback((nextHealth: number) => {
    const normalizedHealth = THREE.MathUtils.clamp(nextHealth, 0, 100);
    controls.current.health = normalizedHealth;
    const nextDisplay = Math.ceil(normalizedHealth);
    if (displayedHealth.current !== nextDisplay) {
      displayedHealth.current = nextDisplay;
      setHealth(nextDisplay);
    }
    return normalizedHealth;
  }, []);

  const killMonster = useCallback(
    (reason: "energy" | "health" = "energy") => {
      if (controls.current.isDead) return;
      controls.current.isDead = true;
      controls.current.moving = false;
      controls.current.sprinting = false;
      controls.current.action = null;
      controls.current.keys.clear();
      controls.current.move = { x: 0, y: 0 };
      setMovementMode("land");
      if (reason === "energy") setEnergyLevel(0);
      if (reason === "health") setHealthLevel(0);
      setDeathReason(reason);
      setIsDead(true);
      setStatus({
        key: reason === "energy" ? "game.ranOut" : "game.lostHealth",
        values: { name: activeMonster.name },
      });
      if (document.pointerLockElement) document.exitPointerLock();
    },
    [activeMonster.name, setEnergyLevel, setHealthLevel, setMovementMode],
  );

  const handlePlayerDamage = useCallback(
    (amount: number, attackerName: string) => {
      if (controls.current.isDead) return;
      controls.current.lastAttackedAt = performance.now();
      const remainingHealth = setHealthLevel(controls.current.health - amount);
      setStatus({
        key: "game.attackedBy",
        values: { name: attackerName, damage: Math.ceil(amount) },
      });
      if (remainingHealth <= 0) killMonster("health");
    },
    [killMonster, setHealthLevel],
  );

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

        const wildAttack = simulationApi.current?.attackAt(
          controls.current.playerPosition.x,
          controls.current.playerPosition.z,
          monsterDna,
        );
        if (wildAttack?.hit) {
          const restoredEnergy = Math.min(
            wildAttack.energyReward ?? 0,
            100 - remainingEnergy,
          );
          if (restoredEnergy > 0)
            setEnergyLevel(remainingEnergy + restoredEnergy);
          setStatus({
            key: wildAttack.defeated
              ? "game.defeatedMonster"
              : "game.hitMonster",
            values: {
              name: wildAttack.targetName ?? t("game.genericMonster"),
              energy: Math.ceil(restoredEnergy),
            },
          });
        } else {
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
            setStatus({
              key:
                monsterDna.diet === "carnivore"
                  ? "game.carnivoreFeast"
                  : "game.omnivoreSnack",
              values: { energy: Math.ceil(restoredEnergy) },
            });
          } else if (canMonsterHunt(monsterDna)) {
            setStatus({
              key: "game.noPrey",
              values: { cost: ATTACK_ENERGY_COST },
            });
          } else {
            setStatus({
              key: "game.herbivoreAttack",
              values: { cost: ATTACK_ENERGY_COST },
            });
          }
        }
      } else {
        if (!canMonsterEatPlants(monsterDna)) {
          setStatus({ key: "game.noPlants" });
          return;
        }
        if (controls.current.energy >= 99.5) {
          setStatus({ key: "game.energyFull" });
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
          setStatus({ key: "game.getCloser" });
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
        setStatus({
          key: nearest.kind === "bush" ? "game.crunchyBush" : "game.tastyTree",
          values: { energy: Math.ceil(restoredEnergy) },
        });
      }

      window.setTimeout(() => {
        if (!controls.current.isDead) setStatus({ key: "game.explore" });
      }, 1400);
    },
    [killMonster, monsterDna, sceneQuality, setEnergyLevel, t],
  );

  const triggerMate = useCallback(() => {
    if (controls.current.isDead || controls.current.paused) return;
    const result = simulationApi.current?.requestMate(
      activeMonsterId,
      activeMonster.name,
      monsterDna,
      controls.current.playerPosition.x,
      controls.current.playerPosition.z,
      controls.current.matingCooldownUntil,
    );
    if (!result) return;
    if (result.ok) {
      controls.current.matingCooldownUntil = result.cooldownUntil;
      playerMatingCooldowns.current.set(activeMonsterId, result.cooldownUntil);
      displayedMatingCooldown.current = MATING_COOLDOWN_SECONDS;
      setMatingCooldown(MATING_COOLDOWN_SECONDS);
      const remainingEnergy = setEnergyLevel(controls.current.energy - 18);
      setStatus({
        key: "game.eggLaid",
        values: {
          name: result.partnerName,
          mutations: result.mutations,
        },
      });
      if (remainingEnergy <= 0) killMonster("energy");
      return;
    }

    const statusByReason: Record<
      Exclude<SimulationMateResult, { ok: true }>["reason"],
      TranslationKey
    > = {
      cooldown: "game.mateCooldown",
      noPartner: "game.noMate",
      tooFar: "game.mateCloser",
      notReady: "game.mateNeeds",
      populationFull: "game.populationFull",
    };
    setStatus({
      key: statusByReason[result.reason],
      values: {
        name: result.partnerName ?? t("game.genericMonster"),
        seconds: result.seconds ?? 0,
      },
    });
  }, [
    activeMonster.name,
    activeMonsterId,
    killMonster,
    monsterDna,
    setEnergyLevel,
    t,
  ]);

  const resetGame = useCallback(() => {
    controls.current.keys.clear();
    controls.current.move = { x: 0, y: 0 };
    controls.current.look = { x: 0, y: 0 };
    controls.current.cameraYaw = 0.35;
    controls.current.characterYaw = 0.35;
    controls.current.cameraPitch = 0.38;
    controls.current.action = null;
    controls.current.actionStarted = 0;
    controls.current.matingCooldownUntil =
      playerMatingCooldowns.current.get(activeMonsterId) ?? 0;
    controls.current.lastAttackedAt = -100_000;
    controls.current.isDead = false;
    controls.current.moving = false;
    controls.current.sprinting = false;
    controls.current.paused = false;
    resetMonsterMovement(activeMonster.dna);
    eatenIdsRef.current = new Set();
    huntedIdsRef.current = new Set();
    setEatenIds(new Set());
    setHuntedIds(new Set());
    setEnergyLevel(100);
    setHealthLevel(100);
    const cooldownSeconds = Math.max(
      0,
      Math.ceil(
        controls.current.matingCooldownUntil -
          (simulationApi.current?.getTime() ?? 0),
      ),
    );
    displayedMatingCooldown.current = cooldownSeconds;
    setMatingCooldown(cooldownSeconds);
    setIsDead(false);
    setDeathReason("energy");
    setMonsterKey((current) => current + 1);
    setStatus({
      key: "game.ready",
      values: { name: activeMonster.name },
    });
  }, [
    activeMonster.dna,
    activeMonsterId,
    activeMonster.name,
    resetMonsterMovement,
    setEnergyLevel,
    setHealthLevel,
  ]);

  const openCreator = useCallback(() => {
    setMobileMenuOpen(false);
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
      setStatus({
        key: "game.familyFull",
        values: { count: MAX_FAMILY_SIZE },
      });
      return;
    }
    setMobileMenuOpen(false);
    controls.current.paused = true;
    controls.current.keys.clear();
    controls.current.move = { x: 0, y: 0 };
    controls.current.look = { x: 0, y: 0 };
    if (document.pointerLockElement) document.exitPointerLock();
    setCreatorDraft({
      mode: "new",
      dna: DEFAULT_MONSTER_DNA,
      name: `${t("game.genericMonster")} ${monsterFamily.length + 1}`,
    });
  }, [monsterFamily.length, t]);

  const closeCreator = useCallback(() => {
    controls.current.paused = false;
    controls.current.keys.clear();
    setCreatorDraft(null);
  }, []);

  const openMobileMenu = useCallback(() => {
    controls.current.paused = true;
    controls.current.keys.clear();
    controls.current.move = { x: 0, y: 0 };
    controls.current.look = { x: 0, y: 0 };
    if (document.pointerLockElement) document.exitPointerLock();
    setMobileMenuOpen(true);
  }, []);

  const closeMobileMenu = useCallback(() => {
    controls.current.paused = false;
    controls.current.keys.clear();
    controls.current.move = { x: 0, y: 0 };
    controls.current.look = { x: 0, y: 0 };
    setMobileMenuOpen(false);
  }, []);

  const applyMonsterDna = useCallback(
    (nextDna: MonsterDna, name: string) => {
      controls.current.paused = false;
      controls.current.keys.clear();
      resetMonsterMovement(nextDna);
      setMonsterKey((current) => current + 1);

      if (creatorDraft?.mode === "new") {
        const id = `monster-${nextMonsterId.current}`;
        nextMonsterId.current += 1;
        controls.current.matingCooldownUntil = 0;
        displayedMatingCooldown.current = 0;
        setMatingCooldown(0);
        setMonsterFamily((current) => [...current, { id, name, dna: nextDna }]);
        setActiveMonsterId(id);
        setStatus({ key: "game.joined", values: { name } });
      } else {
        setMonsterFamily((current) =>
          current.map((profile) =>
            profile.id === activeMonsterId
              ? { ...profile, name, dna: nextDna }
              : profile,
          ),
        );
        setStatus({ key: "game.dnaReady", values: { name } });
      }
      setCreatorDraft(null);
    },
    [activeMonsterId, creatorDraft?.mode, resetMonsterMovement],
  );

  const switchMonster = useCallback(
    (id: string) => {
      const nextMonster = monsterFamily.find((profile) => profile.id === id);
      if (!nextMonster || nextMonster.id === activeMonsterId) return;
      controls.current.keys.clear();
      controls.current.move = { x: 0, y: 0 };
      controls.current.action = null;
      controls.current.isDead = false;
      controls.current.matingCooldownUntil =
        playerMatingCooldowns.current.get(id) ?? 0;
      controls.current.lastAttackedAt = -100_000;
      resetMonsterMovement(nextMonster.dna);
      setActiveMonsterId(id);
      setMonsterKey((current) => current + 1);
      setEnergyLevel(100);
      setHealthLevel(100);
      const cooldownSeconds = Math.max(
        0,
        Math.ceil(
          controls.current.matingCooldownUntil -
            (simulationApi.current?.getTime() ?? 0),
        ),
      );
      displayedMatingCooldown.current = cooldownSeconds;
      setMatingCooldown(cooldownSeconds);
      setIsDead(false);
      setDeathReason("energy");
      setStatus({
        key: "game.nowPlaying",
        values: { name: nextMonster.name },
      });
    },
    [
      activeMonsterId,
      monsterFamily,
      resetMonsterMovement,
      setEnergyLevel,
      setHealthLevel,
    ],
  );

  const toggleFlight = useCallback(() => {
    if (
      monsterDna.adaptation !== "wings" ||
      controls.current.isDead ||
      controls.current.paused
    )
      return;
    if (controls.current.locomotionMode === "fly") {
      const overWater = isWaterAt(
        controls.current.playerPosition.x,
        controls.current.playerPosition.z,
      );
      if (overWater && !canMonsterSwim(monsterDna)) {
        setStatus({ key: "game.cannotLandWater" });
        return;
      }
      setMovementMode(overWater ? "swim" : "land");
      setStatus({ key: "game.landed" });
      return;
    }
    setMovementMode("fly");
    setStatus({ key: "game.tookOff" });
  }, [monsterDna, setMovementMode]);

  const toggleDive = useCallback(() => {
    if (
      !canMonsterSwim(monsterDna) ||
      controls.current.isDead ||
      controls.current.paused
    )
      return;
    if (controls.current.locomotionMode === "dive") {
      setMovementMode("swim");
      setStatus({ key: "game.surfaced" });
      return;
    }
    if (
      !isDeepWaterAt(
        controls.current.playerPosition.x,
        controls.current.playerPosition.z,
      )
    ) {
      setStatus({ key: "game.findDeepWater" });
      return;
    }
    setMovementMode("dive");
    setStatus({ key: "game.dived" });
  }, [monsterDna, setMovementMode]);

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
        const energyRate =
          controls.current.locomotionMode === "fly"
            ? FLY_ENERGY_PER_SECOND * (controls.current.sprinting ? 1.75 : 1)
            : controls.current.locomotionMode === "swim" ||
                controls.current.locomotionMode === "dive"
              ? SWIM_ENERGY_PER_SECOND * (controls.current.sprinting ? 1.6 : 1)
              : controls.current.sprinting
                ? SPRINT_ENERGY_PER_SECOND
                : WALK_ENERGY_PER_SECOND;
        const remainingEnergy = setEnergyLevel(
          controls.current.energy - energyRate * delta,
        );
        if (remainingEnergy <= 0) killMonster();
      }
      if (
        !controls.current.isDead &&
        time - controls.current.lastAttackedAt > 4_000 &&
        controls.current.health < 100 &&
        controls.current.energy > 0
      ) {
        const recoveryRate = 0.12 + (controls.current.energy / 100) * 1.02;
        setHealthLevel(controls.current.health + recoveryRate * delta);
      }
      const simulationNow = simulationApi.current?.getTime() ?? 0;
      const cooldownSeconds = Math.max(
        0,
        Math.ceil(controls.current.matingCooldownUntil - simulationNow),
      );
      if (displayedMatingCooldown.current !== cooldownSeconds) {
        displayedMatingCooldown.current = cooldownSeconds;
        setMatingCooldown(cooldownSeconds);
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
      if (!event.repeat && event.code === "KeyM") triggerMate();
      if (!event.repeat && event.code === "KeyF") toggleFlight();
      if (!event.repeat && event.code === "KeyC") toggleDive();
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
  }, [
    killMonster,
    resetGame,
    setEnergyLevel,
    setHealthLevel,
    toggleDive,
    toggleFlight,
    triggerAction,
    triggerMate,
  ]);

  useEffect(() => {
    if (!mobileMenuOpen) return;
    const onMenuKeyDown = (event: KeyboardEvent) => {
      if (event.code === "Escape") closeMobileMenu();
    };
    window.addEventListener("keydown", onMenuKeyDown);
    return () => window.removeEventListener("keydown", onMenuKeyDown);
  }, [closeMobileMenu, mobileMenuOpen]);

  const ecosystemEvent = simulationSnapshot.event
    ? simulationSnapshot.event.kind === "birth"
      ? t("game.simBirth", {
          name: simulationSnapshot.event.names[0],
          mutations: simulationSnapshot.event.mutations ?? 0,
        })
      : simulationSnapshot.event.kind === "egg"
        ? t("game.simEgg", {
            first: simulationSnapshot.event.names[0],
            second: simulationSnapshot.event.names[1],
          })
        : simulationSnapshot.event.kind === "fight"
          ? t("game.simFight", {
              first: simulationSnapshot.event.names[0],
              second: simulationSnapshot.event.names[1],
            })
          : t("game.simDeath", {
              name: simulationSnapshot.event.names[0],
            })
    : t("game.simWatching");

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
            onPlayerDamage={handlePlayerDamage}
            onSimulationSnapshot={setSimulationSnapshot}
            playerName={activeMonster.name}
            simulationApi={simulationApi}
            dna={monsterDna}
            quality={sceneQuality}
          />
        </Canvas>
      ) : (
        <div className="scene-loading" role="status" aria-live="polite">
          {t("loading.island")}
        </div>
      )}

      <div
        className={`game-hud${mobileMenuOpen ? " mobile-menu-open" : ""}`}
        aria-live="polite"
      >
        <div className="mobile-compact-hud">
          <div className="mobile-player-status">
            <MonsterMark className="mobile-player-mark" />
            <div className="mobile-player-vitals">
              <strong>{activeMonster.name}</strong>
              <div className="mobile-vital-row">
                <Heart size={13} aria-hidden="true" />
                <div
                  className={`mobile-vital-track health${health <= 25 ? " low" : ""}`}
                  title={`${t("game.health")} ${health}`}
                >
                  <i style={{ width: `${health}%` }} />
                </div>
                <span>{health}</span>
              </div>
              <div className="mobile-vital-row">
                <Activity size={13} aria-hidden="true" />
                <div
                  className={`mobile-vital-track energy${energy <= 25 ? " low" : ""}`}
                  title={`${t("game.energy")} ${energy}`}
                >
                  <i style={{ width: `${energy}%` }} />
                </div>
                <span>{energy}</span>
              </div>
            </div>
          </div>
          <button
            type="button"
            className="mobile-menu-toggle"
            aria-label={t("game.openMenu")}
            aria-expanded={mobileMenuOpen}
            aria-controls="mobile-game-menu"
            onClick={openMobileMenu}
          >
            <Menu size={23} />
          </button>
        </div>
        <div className="hud-top-left">
          <Link href="/" className="back-button" aria-label={t("game.home")}>
            <ArrowLeft size={19} />
          </Link>
          <div className="monster-card">
            <MonsterMark className="hud-monster" />
            <div>
              <span>{activeMonster.name.toUpperCase()}</span>
              <strong>
                {option(monsterDna.diet)} · {t("game.explorer")}
              </strong>
            </div>
          </div>
          <LanguageSwitcher className="game-language-switcher" />
        </div>
        <div className="hud-top-right">
          <div className="dna-hud-row">
            <div className="dna-chip">
              <Dna size={16} />
              <span>
                {monsterDna.eyes}{" "}
                {monsterDna.eyes === 1 ? t("creator.eye") : t("creator.eyes")} ·{" "}
                {option(monsterDna.diet)} · {option(monsterDna.social)}
              </span>
            </div>
            <label className="family-picker">
              <span>{t("game.monster")}</span>
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
              <Plus size={14} /> {t("game.new")}
            </button>
            <button
              type="button"
              className="dna-lab-button"
              onClick={openCreator}
            >
              {t("game.edit")}
            </button>
          </div>
          <div className="survival-bars">
            <div
              className={`health-bar${health <= 25 ? " health-low" : ""}${isDead && deathReason === "health" ? " health-empty" : ""}`}
            >
              <i style={{ width: `${health}%` }} />
              <span>
                {t("game.health")} {health}
              </span>
            </div>
            <div
              className={`energy-bar${energy <= 25 ? " energy-low" : ""}${isDead && deathReason === "energy" ? " energy-empty" : ""}`}
            >
              <i style={{ width: `${energy}%` }} />
              <span>
                {t("game.energy")} {energy}
              </span>
            </div>
          </div>
          <div className="locomotion-chip" data-mode={locomotionMode}>
            <span>{t("game.movementMode")}</span>
            <strong>
              {t(`game.mode.${locomotionMode}` as TranslationKey)}
            </strong>
          </div>
        </div>
        <div className="status-bubble">{t(status.key, status.values)}</div>
        <div className="ecosystem-pulse">
          <span className="ecosystem-live">
            <Activity size={13} /> {t("game.ecosystem")}
          </span>
          <strong>{simulationSnapshot.living}</strong>
          <span>{t("game.living")}</span>
          <i />
          <Egg size={13} />
          <strong>{simulationSnapshot.eggs}</strong>
          <span>{t("game.eggs")}</span>
          <small>{ecosystemEvent}</small>
        </div>

        {mobileMenuOpen && (
          <div
            className="mobile-menu-backdrop"
            onPointerDown={(event) => {
              event.stopPropagation();
              if (event.target === event.currentTarget) closeMobileMenu();
            }}
          >
            <section
              id="mobile-game-menu"
              className="mobile-game-menu"
              role="dialog"
              aria-modal="true"
              aria-labelledby="mobile-game-menu-title"
            >
              <header className="mobile-game-menu-header">
                <div>
                  <span>{t("game.menuKicker")}</span>
                  <h2 id="mobile-game-menu-title">{t("game.menu")}</h2>
                </div>
                <button
                  type="button"
                  className="mobile-menu-close"
                  onClick={closeMobileMenu}
                  aria-label={t("game.closeMenu")}
                >
                  <span aria-hidden="true">×</span>
                </button>
              </header>

              <div className="mobile-menu-creature">
                <MonsterMark className="mobile-menu-monster" />
                <div>
                  <span>{t("game.yourMonster")}</span>
                  <strong>{activeMonster.name}</strong>
                  <small>
                    {option(monsterDna.diet)} · {option(monsterDna.social)} ·{" "}
                    {monsterDna.eyes}{" "}
                    {monsterDna.eyes === 1
                      ? t("creator.eye")
                      : t("creator.eyes")}
                  </small>
                </div>
                <div className="mobile-menu-mode" data-mode={locomotionMode}>
                  {t(`game.mode.${locomotionMode}` as TranslationKey)}
                </div>
              </div>

              <div className="mobile-menu-section">
                <span className="mobile-menu-label">
                  {t("game.monsterFamily")}
                </span>
                <label className="mobile-family-picker">
                  <span>{t("game.monster")}</span>
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
                <div className="mobile-menu-button-row">
                  <button type="button" onClick={openCreator}>
                    <Pencil size={16} /> {t("game.edit")}
                  </button>
                  <button
                    type="button"
                    onClick={openNewMonster}
                    disabled={monsterFamily.length >= MAX_FAMILY_SIZE}
                  >
                    <Plus size={16} /> {t("game.new")}
                  </button>
                </div>
              </div>

              <div className="mobile-menu-grid">
                <div className="mobile-menu-section mobile-island-status">
                  <span className="mobile-menu-label">
                    {t("game.islandStatus")}
                  </span>
                  <div>
                    <Activity size={17} />
                    <strong>{simulationSnapshot.living}</strong>
                    <span>{t("game.living")}</span>
                  </div>
                  <div>
                    <Egg size={17} />
                    <strong>{simulationSnapshot.eggs}</strong>
                    <span>{t("game.eggs")}</span>
                  </div>
                </div>
                <div className="mobile-menu-section mobile-language-section">
                  <span className="mobile-menu-label">{t("language.label")}</span>
                  <LanguageSwitcher className="mobile-menu-language" />
                </div>
              </div>

              <div className="mobile-menu-section">
                <span className="mobile-menu-label">{t("game.moreActions")}</span>
                <div className="mobile-menu-actions">
                  <button
                    type="button"
                    disabled={isDead || matingCooldown > 0}
                    onClick={() => {
                      closeMobileMenu();
                      triggerMate();
                    }}
                  >
                    {matingCooldown > 0 ? <Egg size={18} /> : <Heart size={18} />}
                    <span>
                      {matingCooldown > 0
                        ? t("game.mateReadyIn", { seconds: matingCooldown })
                        : t("game.mateButton")}
                    </span>
                  </button>
                  {monsterDna.adaptation === "wings" && (
                    <button
                      type="button"
                      disabled={isDead}
                      onClick={() => {
                        closeMobileMenu();
                        toggleFlight();
                      }}
                    >
                      <Wind size={18} />
                      <span>
                        {locomotionMode === "fly"
                          ? t("game.landButton")
                          : t("game.flyButton")}
                      </span>
                    </button>
                  )}
                  {canMonsterSwim(monsterDna) && (
                    <button
                      type="button"
                      disabled={isDead}
                      onClick={() => {
                        closeMobileMenu();
                        toggleDive();
                      }}
                    >
                      <Waves size={18} />
                      <span>
                        {locomotionMode === "dive"
                          ? t("game.surfaceButton")
                          : t("game.diveButton")}
                      </span>
                    </button>
                  )}
                </div>
                <p className="mobile-menu-event">{ecosystemEvent}</p>
              </div>

              <div className="mobile-menu-footer">
                <Link href="/" className="mobile-menu-exit">
                  <ArrowLeft size={17} /> {t("game.exitIsland")}
                </Link>
                <button
                  type="button"
                  className="mobile-menu-continue"
                  onClick={closeMobileMenu}
                >
                  {t("game.continue")}
                </button>
              </div>
            </section>
          </div>
        )}

        {isDead && (
          <div className="death-card" role="dialog" aria-modal="true">
            <span>
              {deathReason === "energy"
                ? t("game.outOfEnergy")
                : t("game.outOfHealth")}
            </span>
            <strong>{t("game.collapsed", { name: activeMonster.name })}</strong>
            <p>
              {deathReason === "energy"
                ? t("game.deathHint")
                : t("game.healthDeathHint")}
            </p>
            <button type="button" onClick={resetGame}>
              {t("game.tryAgain")} <kbd>R</kbd>
            </button>
          </div>
        )}

        {!pointerLocked && (
          <div className="mouse-hint">
            <MousePointer2 size={18} />
            <span>{t("game.mouseHint")}</span>
          </div>
        )}

        <div className="desktop-controls">
          <div>
            <kbd>W</kbd>
            <kbd>S</kbd>
            <span>{t("game.forwardBack")}</span>
          </div>
          <div>
            <kbd>A</kbd>
            <kbd>D</kbd>
            <span>{t("game.sideways")}</span>
          </div>
          <div>
            <MousePointer2 size={16} />
            <span>{t("game.camera")}</span>
          </div>
          <div>
            <kbd>←</kbd>
            <kbd>→</kbd>
            <span>{t("game.turnCamera")}</span>
          </div>
          <div>
            <kbd>↑</kbd>
            <kbd>↓</kbd>
            <span>{t("game.forwardBack")}</span>
          </div>
          <div>
            <kbd>E</kbd>
            <span>{t("game.eat")}</span>
          </div>
          <div>
            <kbd>SPACE</kbd>
            <span>{t("game.attack")}</span>
          </div>
          <div>
            <kbd>M</kbd>
            <span>{t("game.mate")}</span>
          </div>
          <div>
            <kbd>SHIFT</kbd>
            <span>{t("game.sprint")}</span>
          </div>
        </div>

        <div className="mobile-controls">
          <Joystick
            label={t("game.move")}
            onMove={(x, y) => {
              controls.current.move = { x, y };
            }}
          />
          <Joystick
            label={t("game.look")}
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
            <span>{t("game.eatButton")}</span>
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
            <span>
              {canMonsterHunt(monsterDna)
                ? t("game.huntButton")
                : t("game.attackButton")}
            </span>
            <small>{t("game.space")}</small>
          </button>
          <button
            type="button"
            className="action-button mate-button"
            disabled={isDead || matingCooldown > 0}
            onPointerDown={(event) => {
              event.stopPropagation();
              triggerMate();
            }}
          >
            {matingCooldown > 0 ? <Egg size={24} /> : <Heart size={24} />}
            <span>
              {matingCooldown > 0
                ? t("game.mateReadyIn", { seconds: matingCooldown })
                : t("game.mateButton")}
            </span>
            <small>M</small>
          </button>
        </div>

        {(monsterDna.adaptation === "wings" || canMonsterSwim(monsterDna)) && (
          <div className="ability-controls">
            {monsterDna.adaptation === "wings" && (
              <button
                type="button"
                className={`ability-button${locomotionMode === "fly" ? " active" : ""}`}
                disabled={isDead}
                onPointerDown={(event) => {
                  event.stopPropagation();
                  toggleFlight();
                }}
              >
                <Wind size={18} />
                <span>
                  {locomotionMode === "fly"
                    ? t("game.landButton")
                    : t("game.flyButton")}
                </span>
                <small>F</small>
              </button>
            )}
            {canMonsterSwim(monsterDna) && (
              <button
                type="button"
                className={`ability-button${locomotionMode === "dive" ? " active" : ""}`}
                disabled={isDead}
                onPointerDown={(event) => {
                  event.stopPropagation();
                  toggleDive();
                }}
              >
                <Waves size={18} />
                <span>
                  {locomotionMode === "dive"
                    ? t("game.surfaceButton")
                    : t("game.diveButton")}
                </span>
                <small>C</small>
              </button>
            )}
          </div>
        )}

        <div className="water-rule">
          <Crosshair size={14} />
          <span>
            {canMonsterSwim(monsterDna)
              ? t("game.waterOpen")
              : t("game.waterClosed")}
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
