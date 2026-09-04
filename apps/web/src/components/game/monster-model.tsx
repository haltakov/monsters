import { useEffect, useRef, useState, type RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { MarchingCubes } from "three/addons/objects/MarchingCubes.js";
import {
  mergeGeometries,
  mergeVertices,
} from "three/addons/utils/BufferGeometryUtils.js";
import { getMonsterSurface, type MonsterSurface } from "./monster-surface";
import { createTailGeometry, taperedSweep } from "./monster-appendages";
import { createMonsterSkinMaterial } from "./monster-pattern";
import {
  SkinHorns,
  SkinEars,
  SkinAdaptation,
  SkinGills,
  SkinSmile,
} from "./monster-features";
import {
  getAccentColor,
  getMonsterBuildScale,
  getMonsterColor,
  getMonsterSizeScale,
  type MonsterDna,
} from "@/components/game/monster-dna";

type MonsterVisualProps = {
  dna: MonsterDna;
  wingRefs?: Array<RefObject<THREE.Group | null>>;
  motionRef?: RefObject<MonsterMotionState>;
  castShadow?: boolean;
  geometryQuality?: "hero" | "remote";
};

export type MonsterMotionState = {
  stride: number;
  intensity: number;
  gait: "idle" | "walk" | "sprint" | "swim" | "fly";
};

export type BodyProfile = {
  center: [number, number, number];
  scale: [number, number, number];
  face: [number, number];
  faceScale: number;
  legX: number;
  legY: number;
  legSpan: number;
  tail: [number, number];
  horn: [number, number, number];
};

export const BODY_PROFILES: Record<MonsterDna["body"], BodyProfile> = {
  round: {
    center: [0, 1.24, 0],
    scale: [1.05, 0.95, 1.22],
    face: [1.48, -1.08],
    faceScale: 1,
    legX: 0.57,
    legY: 0.58,
    legSpan: 0.7,
    tail: [1.18, 1.08],
    horn: [2.04, -0.08, 0.57],
  },
  bean: {
    center: [0, 1.34, 0],
    scale: [0.88, 1.22, 1.08],
    face: [1.62, -0.96],
    faceScale: 0.92,
    legX: 0.48,
    legY: 0.58,
    legSpan: 0.58,
    tail: [1.28, 0.98],
    horn: [2.35, -0.02, 0.5],
  },
  long: {
    center: [0, 1.16, 0.08],
    scale: [1.28, 0.76, 1.34],
    face: [1.34, -1.18],
    faceScale: 1.02,
    legX: 0.72,
    legY: 0.53,
    legSpan: 0.82,
    tail: [1.14, 1.2],
    horn: [1.88, -0.18, 0.62],
  },
  pig: {
    center: [0, 1.12, 0.16],
    scale: [1.06, 0.72, 1.42],
    face: [1.31, -1.62],
    faceScale: 0.92,
    legX: 0.62,
    legY: 0.5,
    legSpan: 0.88,
    tail: [1.18, 1.5],
    horn: [1.84, -1.02, 0.48],
  },
  biped: {
    center: [0, 1.42, 0.1],
    scale: [0.72, 1.08, 0.68],
    face: [2.28, -0.61],
    faceScale: 0.88,
    legX: 0.38,
    legY: 0.58,
    legSpan: 0.3,
    tail: [1.18, 0.72],
    horn: [2.87, -0.04, 0.42],
  },
  saurian: {
    center: [0, 1.15, 0.3],
    scale: [0.9, 0.78, 1.58],
    face: [1.53, -1.55],
    faceScale: 0.88,
    legX: 0.52,
    legY: 0.5,
    legSpan: 0.86,
    tail: [1.15, 1.72],
    horn: [2.03, -1.02, 0.46],
  },
  rhino: {
    center: [0, 1.1, 0.18],
    scale: [1.16, 0.78, 1.5],
    face: [1.3, -1.7],
    faceScale: 0.96,
    legX: 0.7,
    legY: 0.5,
    legSpan: 0.9,
    tail: [1.18, 1.55],
    horn: [1.52, -1.63, 0.52],
  },
  aquatic: {
    center: [0, 1.18, 0.12],
    scale: [0.82, 0.68, 1.68],
    face: [1.31, -1.48],
    faceScale: 0.86,
    legX: 0.55,
    legY: 0.62,
    legSpan: 0.72,
    tail: [1.2, 1.72],
    horn: [1.75, -0.74, 0.42],
  },
  slug: {
    center: [0, 0.8, 0.18],
    scale: [1.0, 0.52, 1.58],
    face: [1.08, -1.18],
    faceScale: 0.9,
    legX: 0.58,
    legY: 0.42,
    legSpan: 0.86,
    tail: [0.82, 1.58],
    horn: [1.32, -0.72, 0.52],
  },
  avian: {
    center: [0, 1.28, 0.12],
    scale: [0.78, 1.02, 1.12],
    face: [1.88, -0.84],
    faceScale: 0.82,
    legX: 0.34,
    legY: 0.55,
    legSpan: 0.44,
    tail: [1.18, 1.08],
    horn: [2.38, -0.34, 0.38],
  },
};

function eyeOffsets(count: MonsterDna["eyes"]) {
  const layouts: Record<MonsterDna["eyes"], Array<[number, number]>> = {
    1: [[0, 0.12]],
    2: [
      [-0.34, 0.08],
      [0.34, 0.08],
    ],
    3: [
      [-0.36, 0],
      [0.36, 0],
      [0, 0.42],
    ],
    4: [
      [-0.37, -0.02],
      [0.37, -0.02],
      [-0.24, 0.4],
      [0.24, 0.4],
    ],
    5: [
      [-0.42, -0.03],
      [0, 0],
      [0.42, -0.03],
      [-0.25, 0.4],
      [0.25, 0.4],
    ],
    6: [
      [-0.43, -0.04],
      [0, 0],
      [0.43, -0.04],
      [-0.43, 0.38],
      [0, 0.43],
      [0.43, 0.38],
    ],
    8: [
      [-0.47, -0.08],
      [-0.16, -0.01],
      [0.16, -0.01],
      [0.47, -0.08],
      [-0.47, 0.34],
      [-0.16, 0.42],
      [0.16, 0.42],
      [0.47, 0.34],
    ],
    10: [
      [-0.48, -0.1],
      [-0.24, -0.02],
      [0, 0],
      [0.24, -0.02],
      [0.48, -0.1],
      [-0.48, 0.34],
      [-0.24, 0.43],
      [0, 0.47],
      [0.24, 0.43],
      [0.48, 0.34],
    ],
  };
  return layouts[count];
}

function legPositions(count: MonsterDna["legs"], profile: BodyProfile) {
  if (count === 0) return [];
  const rowCount = count / 2;
  const densityMultiplier =
    count === 10 ? 2 : count === 8 ? 1.65 : count === 6 ? 1.25 : 1;
  const isDenseBiped = profile === BODY_PROFILES.biped && count >= 4;
  const denseBipedSpan = isDenseBiped
    ? profile.scale[2] * (count >= 8 ? 1.45 : count === 6 ? 1.25 : 0.95)
    : 0;
  const legSpan = Math.min(
    Math.max(profile.legSpan * densityMultiplier, denseBipedSpan),
    profile.scale[2] * (isDenseBiped ? 1.6 : 1.05),
  );
  const rows = Array.from({ length: rowCount }, (_, index) =>
    rowCount === 1 ? 0 : -legSpan / 2 + (index / (rowCount - 1)) * legSpan,
  );
  return rows.flatMap((z) => [
    [-profile.legX, profile.legY, z] as [number, number, number],
    [profile.legX, profile.legY, z] as [number, number, number],
  ]);
}

type SmoothArm = {
  shoulder: [number, number, number];
  hand: [number, number, number];
};

function smoothArmPositions(
  dna: MonsterDna,
  profile: BodyProfile,
): SmoothArm[] {
  if (dna.body !== "biped") return [];
  const [, cy, cz] = profile.center;
  const [sx, sy] = profile.scale;
  return [-1, 1].map((side) => ({
    shoulder: [side * sx * 0.72, cy + sy * 0.26, cz - 0.02],
    hand: [side * (sx + 0.34), cy - sy * 0.48, cz - 0.2],
  }));
}

function Mouth({
  shape,
  accent,
}: {
  shape: Exclude<MonsterDna["mouth"], "smile">;
  accent: string;
}) {
  if (shape === "snout") {
    return (
      <group position={[0, -0.43, -0.12]}>
        <mesh scale={[1.18, 0.72, 0.42]}>
          <sphereGeometry args={[0.34, 22, 16]} />
          <meshStandardMaterial color={accent} roughness={0.78} />
        </mesh>
        {[-0.12, 0.12].map((x) => (
          <mesh key={x} position={[x, 0, -0.14]} scale={[0.05, 0.07, 0.035]}>
            <sphereGeometry args={[1, 12, 8]} />
            <meshStandardMaterial color="#173F35" />
          </mesh>
        ))}
      </group>
    );
  }

  if (shape === "fangs" || shape === "tusks") {
    return (
      <group position={[0, -0.43, -0.1]}>
        <mesh scale={[1, 0.58, 0.18]}>
          <sphereGeometry args={[0.3, 22, 16]} />
          <meshStandardMaterial color="#173F35" />
        </mesh>
        {[-0.15, 0.15].map((x) => (
          <mesh
            key={x}
            position={[x, shape === "tusks" ? -0.01 : -0.11, -0.1]}
            rotation={[
              shape === "tusks" ? -Math.PI / 2 : Math.PI,
              0,
              shape === "tusks" ? (x < 0 ? -0.3 : 0.3) : 0,
            ]}
          >
            <coneGeometry
              args={[
                shape === "tusks" ? 0.07 : 0.055,
                shape === "tusks" ? 0.34 : 0.22,
                12,
              ]}
            />
            <meshStandardMaterial color="#FFF8E8" />
          </mesh>
        ))}
      </group>
    );
  }

  if (shape === "beak") {
    return (
      <mesh position={[0, -0.42, -0.2]} rotation={[-Math.PI / 2, 0, 0]}>
        <coneGeometry args={[0.22, 0.48, 4]} />
        <meshStandardMaterial color={accent} roughness={0.72} />
      </mesh>
    );
  }

  if (shape === "mandibles") {
    return (
      <group position={[0, -0.43, -0.13]}>
        {[-1, 1].map((side) => (
          <mesh
            key={side}
            position={[side * 0.13, -0.04, -0.08]}
            rotation={[0, 0, side * 0.72]}
          >
            <torusGeometry args={[0.16, 0.045, 10, 18, Math.PI * 1.05]} />
            <meshStandardMaterial color={accent} roughness={0.72} />
          </mesh>
        ))}
      </group>
    );
  }

  if (shape === "tongue") {
    return (
      <group position={[0, -0.44, -0.13]}>
        <mesh scale={[1, 0.5, 0.18]}>
          <sphereGeometry args={[0.29, 20, 14]} />
          <meshStandardMaterial color="#173F35" />
        </mesh>
        <mesh position={[0, -0.08, -0.2]} rotation={[Math.PI / 2, 0, 0]}>
          <capsuleGeometry args={[0.055, 0.32, 8, 12]} />
          <meshStandardMaterial color="#F58CA8" roughness={0.7} />
        </mesh>
      </group>
    );
  }

  if (shape === "grin") {
    return (
      <group position={[0, -0.43, -0.14]}>
        <mesh scale={[1.16, 0.55, 0.18]}>
          <sphereGeometry args={[0.3, 24, 16]} />
          <meshStandardMaterial color="#173F35" roughness={0.78} />
        </mesh>
        {[-0.18, -0.06, 0.06, 0.18].map((x) => (
          <mesh
            key={x}
            position={[x, -0.015, -0.052]}
            scale={[0.045, 0.075, 0.025]}
          >
            <boxGeometry args={[1, 1, 1]} />
            <meshStandardMaterial color="#FFF8E8" roughness={0.66} />
          </mesh>
        ))}
      </group>
    );
  }

  return null;
}

function Face({
  dna,
  profile,
  accent,
  surface,
}: {
  dna: MonsterDna;
  profile: BodyProfile;
  accent: string;
  surface: MonsterSurface;
}) {
  return (
    <group>
      {eyeOffsets(dna.eyes).map(([x, y], index) => {
        const eyeScale =
          dna.eyes >= 10
            ? 0.52
            : dna.eyes >= 8
              ? 0.61
              : dna.eyes >= 6
                ? 0.7
                : 1;
        return (
          <group
            key={`${x}-${y}-${index}`}
            position={
              surface.at(
                [
                  x * profile.faceScale,
                  profile.face[0] + y * profile.faceScale,
                  profile.face[1],
                ],
                [0, 0, -1],
                0.065 * eyeScale,
              ).position
            }
            scale={eyeScale * profile.faceScale}
          >
            <mesh>
              <sphereGeometry args={[0.225, 24, 18]} />
              <meshStandardMaterial color="#FFF8D9" />
            </mesh>
            <mesh position={[0, 0.01, -0.205]}>
              <sphereGeometry args={[0.084, 18, 14]} />
              <meshStandardMaterial color="#173F35" />
            </mesh>
          </group>
        );
      })}
      {dna.mouth === "smile" ? (
        <SkinSmile profile={profile} surface={surface} />
      ) : (
        <group
          position={
            surface.at(
              [0, profile.face[0] - 0.43 * profile.faceScale, profile.face[1]],
              [0, 0, -1],
              0.025,
            ).position
          }
          scale={profile.faceScale}
        >
          <group position={[0, 0.43, 0.12]}>
            <Mouth shape={dna.mouth} accent={accent} />
          </group>
        </group>
      )}
    </group>
  );
}

const SMOOTH_FIELD_SCALE = 2.15;
const SMOOTH_FIELD_ORIGIN_Y = 1.35;
const SMOOTH_GEOMETRY_CACHE_LIMIT = 64;
const SMOOTH_GEOMETRY_MOUNT_GRACE_MS = 2_000;
type SmoothGeometryCacheEntry = {
  geometry: THREE.BufferGeometry;
  mountedUsers: number;
  lastUsedAt: number;
};
const smoothGeometryCache = new Map<string, SmoothGeometryCacheEntry>();

type SmoothRig = {
  mesh: THREE.SkinnedMesh;
  cacheKey: string;
  legBones: THREE.Bone[];
  armBones: THREE.Bone[];
  tailBone?: THREE.Bone;
  material: THREE.MeshStandardMaterial;
};

function getSmoothGeometryCacheKey(
  dna: MonsterDna,
  geometryQuality: "hero" | "remote",
) {
  return `smooth-hybrid-rig-v18:${geometryQuality}:${getSmoothCoreSignature(dna)}`;
}

function getSmoothCoreSignature(dna: MonsterDna) {
  return [dna.body, dna.legs, dna.legShape, dna.tail].join(":");
}

function pruneSmoothGeometryCache() {
  if (smoothGeometryCache.size <= SMOOTH_GEOMETRY_CACHE_LIMIT) return;
  const now = Date.now();
  const disposable = [...smoothGeometryCache.entries()]
    .filter(
      ([, entry]) =>
        entry.mountedUsers === 0 &&
        now - entry.lastUsedAt >= SMOOTH_GEOMETRY_MOUNT_GRACE_MS,
    )
    .sort((first, second) => first[1].lastUsedAt - second[1].lastUsedAt);
  for (const [key, entry] of disposable) {
    if (smoothGeometryCache.size <= SMOOTH_GEOMETRY_CACHE_LIMIT) break;
    smoothGeometryCache.delete(key);
    entry.geometry.dispose();
  }
}

function retainSmoothGeometry(cacheKey: string) {
  const entry = smoothGeometryCache.get(cacheKey);
  if (!entry) return;
  entry.mountedUsers += 1;
  entry.lastUsedAt = Date.now();
}

function releaseSmoothGeometry(cacheKey: string) {
  const entry = smoothGeometryCache.get(cacheKey);
  if (!entry) return;
  entry.mountedUsers = Math.max(0, entry.mountedUsers - 1);
  entry.lastUsedAt = Date.now();
  pruneSmoothGeometryCache();
}

function addSmoothBall(
  field: MarchingCubes,
  x: number,
  y: number,
  z: number,
  strength: number,
  subtract = 9,
) {
  field.addBall(
    0.5 + x / (SMOOTH_FIELD_SCALE * 2),
    0.5 + (y - SMOOTH_FIELD_ORIGIN_Y) / (SMOOTH_FIELD_SCALE * 2),
    0.5 + z / (SMOOTH_FIELD_SCALE * 2),
    strength,
    subtract,
  );
}

/** Adds a deterministic anisotropic field primitive for readable feet. */
function addSmoothEllipsoid(
  field: MarchingCubes,
  center: [number, number, number],
  radius: [number, number, number],
  amplitude = 190,
) {
  const size = field.size;
  const worldToGrid = (value: number, origin = 0) =>
    Math.floor((0.5 + (value - origin) / (SMOOTH_FIELD_SCALE * 2)) * size);
  const [cx, cy, cz] = center;
  const [rx, ry, rz] = radius;
  const minX = THREE.MathUtils.clamp(worldToGrid(cx - rx), 1, size - 2);
  const maxX = THREE.MathUtils.clamp(worldToGrid(cx + rx) + 1, 1, size - 2);
  const minY = THREE.MathUtils.clamp(
    worldToGrid(cy - ry, SMOOTH_FIELD_ORIGIN_Y),
    1,
    size - 2,
  );
  const maxY = THREE.MathUtils.clamp(
    worldToGrid(cy + ry, SMOOTH_FIELD_ORIGIN_Y) + 1,
    1,
    size - 2,
  );
  const minZ = THREE.MathUtils.clamp(worldToGrid(cz - rz), 1, size - 2);
  const maxZ = THREE.MathUtils.clamp(worldToGrid(cz + rz) + 1, 1, size - 2);

  for (let z = minZ; z <= maxZ; z += 1) {
    const worldZ = (z / size - 0.5) * SMOOTH_FIELD_SCALE * 2;
    const dz = (worldZ - cz) / rz;
    for (let y = minY; y <= maxY; y += 1) {
      const worldY =
        (y / size - 0.5) * SMOOTH_FIELD_SCALE * 2 + SMOOTH_FIELD_ORIGIN_Y;
      const dy = (worldY - cy) / ry;
      for (let x = minX; x <= maxX; x += 1) {
        const worldX = (x / size - 0.5) * SMOOTH_FIELD_SCALE * 2;
        const dx = (worldX - cx) / rx;
        const distanceSquared = dx * dx + dy * dy + dz * dz;
        if (distanceSquared >= 1) continue;
        const fieldIndex = z * field.size2 + y * size + x;
        const falloff = 1 - distanceSquared;
        // A C1 compact kernel has a flat derivative at its support boundary.
        // Linear truncation imprinted contour rings wherever two fields met.
        field.field[fieldIndex] +=
          amplitude * falloff * falloff * (3 - 2 * falloff);
      }
    }
  }
}

function smoothScalarMin(first: number, second: number, smoothing: number) {
  const blend = THREE.MathUtils.clamp(
    0.5 + (0.5 * (second - first)) / smoothing,
    0,
    1,
  );
  return (
    THREE.MathUtils.lerp(second, first, blend) - smoothing * blend * (1 - blend)
  );
}

function smoothScalarMax(first: number, second: number, smoothing: number) {
  return -smoothScalarMin(-first, -second, smoothing);
}

function closeSmoothFieldBoundary(
  field: MarchingCubes,
  worldScale = SMOOTH_FIELD_SCALE,
) {
  const size = field.size;
  const cellSize = (worldScale * 2) / size;
  const sealedShellCells = 2;
  const fadeWidth = Math.max(0.24, cellSize * 4);

  for (let z = 0; z < size; z += 1) {
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const distanceInCells = Math.min(
          x,
          y,
          z,
          size - 1 - x,
          size - 1 - y,
          size - 1 - z,
        );
        const fieldIndex = z * field.size2 + y * size + x;
        if (distanceInCells <= sealedShellCells) {
          field.field[fieldIndex] = 0;
          continue;
        }
        const normalizedDistance = THREE.MathUtils.clamp(
          ((distanceInCells - sealedShellCells) * cellSize) / fadeWidth,
          0,
          1,
        );
        // Quintic smoothstep reaches zero with a flat derivative. Any DNA
        // feature that reaches the finite MarchingCubes volume therefore
        // tapers closed before the edge instead of exposing an open cap.
        const fade =
          normalizedDistance *
          normalizedDistance *
          normalizedDistance *
          (normalizedDistance * (normalizedDistance * 6 - 15) + 10);
        field.field[fieldIndex] *= fade;
      }
    }
  }
}

function carveSmoothArch(
  field: MarchingCubes,
  center: [number, number],
  radius: [number, number],
  baseY: number,
  topY: number,
  archAxis: "x" | "z",
) {
  const [centerX, centerZ] = center;
  const [radiusX, radiusZ] = radius;
  const size = field.size;
  const fieldCellSize = (SMOOTH_FIELD_SCALE * 2) / size;
  const csgSmoothing = fieldCellSize * 0.5;
  const boundsPadding = fieldCellSize * 2;
  const worldToGridX = (value: number) =>
    (0.5 + value / (SMOOTH_FIELD_SCALE * 2)) * size;
  const clampGrid = (value: number) =>
    THREE.MathUtils.clamp(value, 1, size - 2);
  const minX = Math.floor(
    clampGrid(worldToGridX(centerX - radiusX - boundsPadding)),
  );
  const maxX = Math.ceil(
    clampGrid(worldToGridX(centerX + radiusX + boundsPadding)),
  );
  const minZ = Math.floor(
    clampGrid(worldToGridX(centerZ - radiusZ - boundsPadding)),
  );
  const maxZ = Math.ceil(
    clampGrid(worldToGridX(centerZ + radiusZ + boundsPadding)),
  );

  for (let z = minZ; z <= maxZ; z += 1) {
    const worldZ = (z / size - 0.5) * SMOOTH_FIELD_SCALE * 2;
    for (let x = minX; x <= maxX; x += 1) {
      const worldX = (x / size - 0.5) * SMOOTH_FIELD_SCALE * 2;
      const narrowCoordinate = archAxis === "x" ? worldX : worldZ;
      const narrowCenter = archAxis === "x" ? centerX : centerZ;
      const narrowRadius = archAxis === "x" ? radiusX : radiusZ;
      const acrossCoordinate = archAxis === "x" ? worldZ : worldX;
      const acrossCenter = archAxis === "x" ? centerZ : centerX;
      const acrossRadius = archAxis === "x" ? radiusZ : radiusX;
      const normalizedNarrow =
        Math.abs(narrowCoordinate - narrowCenter) / narrowRadius;
      const domeInput = THREE.MathUtils.clamp(
        1 - normalizedNarrow * normalizedNarrow,
        0,
        1,
      );
      const dome = domeInput * domeInput * (3 - 2 * domeInput);
      const roofY = THREE.MathUtils.lerp(baseY, topY, dome);
      const distanceNarrow = (normalizedNarrow - 1) * narrowRadius;
      const distanceAcross =
        Math.abs(acrossCoordinate - acrossCenter) - acrossRadius;

      for (let y = 1; y < size - 1; y += 1) {
        const worldY =
          (y / size - 0.5) * SMOOTH_FIELD_SCALE * 2 + SMOOTH_FIELD_ORIGIN_Y;
        const distanceRoof = worldY - roofY;
        const voidDistance = smoothScalarMax(
          smoothScalarMax(distanceNarrow, distanceRoof, csgSmoothing),
          distanceAcross,
          csgSmoothing,
        );
        const limiter = field.isolation + (24 / fieldCellSize) * voidDistance;
        const fieldIndex = z * field.size2 + y * size + x;
        let nextValue = smoothScalarMin(field.field[fieldIndex], limiter, 8);
        if (voidDistance <= -fieldCellSize * 1.5) {
          nextValue = Math.min(nextValue, field.isolation - 32);
        }
        field.field[fieldIndex] = nextValue;
      }
    }
  }
}

function relaxSmoothGeometry(geometry: THREE.BufferGeometry, iterations = 2) {
  const index = geometry.getIndex();
  const position = geometry.getAttribute("position");
  if (!index || !position || position.count === 0) return;

  const neighbors = Array.from(
    { length: position.count },
    () => new Set<number>(),
  );
  const connect = (first: number, second: number) => {
    neighbors[first].add(second);
    neighbors[second].add(first);
  };

  for (let offset = 0; offset < index.count; offset += 3) {
    const a = index.getX(offset);
    const b = index.getX(offset + 1);
    const c = index.getX(offset + 2);
    connect(a, b);
    connect(b, c);
    connect(c, a);
  }

  const coordinates = position.array as Float32Array;
  const relaxed = new Float32Array(coordinates.length);
  const pass = (amount: number) => {
    relaxed.set(coordinates);
    neighbors.forEach((adjacent, vertex) => {
      if (adjacent.size === 0) return;
      let averageX = 0;
      let averageY = 0;
      let averageZ = 0;
      adjacent.forEach((neighbor) => {
        averageX += coordinates[neighbor * 3];
        averageY += coordinates[neighbor * 3 + 1];
        averageZ += coordinates[neighbor * 3 + 2];
      });
      const inverseCount = 1 / adjacent.size;
      const offset = vertex * 3;
      relaxed[offset] +=
        (averageX * inverseCount - coordinates[offset]) * amount;
      relaxed[offset + 1] +=
        (averageY * inverseCount - coordinates[offset + 1]) * amount;
      relaxed[offset + 2] +=
        (averageZ * inverseCount - coordinates[offset + 2]) * amount;
    });
    coordinates.set(relaxed);
  };

  // Taubin's positive/negative pair removes voxel ripples without shrinking
  // paws, snouts, or tails into the body.
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    pass(0.43);
    pass(-0.45);
  }
  position.needsUpdate = true;
  geometry.computeVertexNormals();
}

/** Shade the body from the scalar field rather than uneven triangle sizes.
 * The latter produces visible latitude-like bands on broad smooth torsos. */
function applyFieldNormals(
  geometry: THREE.BufferGeometry,
  field: MarchingCubes,
) {
  const positions = geometry.getAttribute("position");
  const normals = geometry.getAttribute("normal");
  const parts = geometry.getAttribute("surfacePart");
  const normal = new THREE.Vector3();
  for (let i = 0; i < positions.count; i++) {
    if (parts.getX(i) !== 0) continue;
    const x = THREE.MathUtils.clamp(
      (positions.getX(i) * 0.5 + 0.5) * field.size,
      2,
      field.size - 3,
    );
    const y = THREE.MathUtils.clamp(
      (positions.getY(i) * 0.5 + 0.5) * field.size,
      2,
      field.size - 3,
    );
    const z = THREE.MathUtils.clamp(
      (positions.getZ(i) * 0.5 + 0.5) * field.size,
      2,
      field.size - 3,
    );
    const ix = Math.floor(x),
      iy = Math.floor(y),
      iz = Math.floor(z);
    normal.set(0, 0, 0);
    for (let dz = 0; dz <= 1; dz++)
      for (let dy = 0; dy <= 1; dy++)
        for (let dx = 0; dx <= 1; dx++) {
          const weight =
            (dx ? x - ix : 1 - x + ix) *
            (dy ? y - iy : 1 - y + iy) *
            (dz ? z - iz : 1 - z + iz);
          const q = (iz + dz) * field.size2 + (iy + dy) * field.size + ix + dx;
          normal.x += (field.field[q - 1] - field.field[q + 1]) * weight;
          normal.y +=
            (field.field[q - field.size] - field.field[q + field.size]) *
            weight;
          normal.z +=
            (field.field[q - field.size2] - field.field[q + field.size2]) *
            weight;
        }
    if (normal.lengthSq() > 1e-12) {
      normal.normalize();
      normals.setXYZ(i, normal.x, normal.y, normal.z);
    }
  }
  normals.needsUpdate = true;
  geometry.deleteAttribute("surfacePart");
}

export function buildSmoothGeometry(
  dna: MonsterDna,
  geometryQuality: "hero" | "remote" = "hero",
) {
  const profile = BODY_PROFILES[dna.body];
  const cacheKey = getSmoothGeometryCacheKey(dna, geometryQuality);
  const cached = smoothGeometryCache.get(cacheKey);
  if (cached) {
    cached.lastUsedAt = Date.now();
    return cached.geometry;
  }

  const temporaryMaterial = new THREE.MeshStandardMaterial();
  const fieldResolution =
    geometryQuality === "remote"
      ? dna.legs >= 8
        ? 52
        : dna.legs === 6
          ? 48
          : dna.legs >= 2
            ? 44
            : 40
      : dna.legs === 10
        ? 92
        : dna.legs === 8
          ? 88
          : dna.legs === 6
            ? 76
            : dna.legs >= 2
              ? 64
              : 56;
  const field = new MarchingCubes(
    fieldResolution,
    temporaryMaterial,
    false,
    false,
    180_000,
  );
  const [cx, cy, cz] = profile.center;
  const [sx, sy, sz] = profile.scale;

  if (dna.legs === 0) {
    // A single convex body gives legless creatures an honest silhouette.
    // The generic side/front satellite balls read as phantom feet once their
    // lower surfaces were grounded, especially on aquatic and biped profiles.
    addSmoothEllipsoid(
      field,
      [cx, cy, cz],
      [
        Math.max(1.15, sx * 1.15),
        Math.max(dna.body === "slug" ? 0.62 : 0.78, sy * 1.05),
        Math.max(1.3, sz * 1.02),
      ],
      300,
    );
  } else {
    // Honor all three body axes. Identical spherical strengths previously
    // made long, bean, slug and aquatic bodies converge on the same blob.
    addSmoothEllipsoid(
      field,
      [cx, cy, cz],
      [sx * 1.18, sy * 1.18, sz * 1.18],
      300,
    );
    addSmoothEllipsoid(
      field,
      [cx, cy, cz - sz * 0.3],
      [sx * 0.88, sy * 0.92, sz * 0.75],
      150,
    );
  }
  addSmoothEllipsoid(
    field,
    [cx, cy + sy * 0.35, cz],
    [sx * 0.75, sy * 0.75, sz * 0.78],
    150,
  );

  const [faceY, faceZ] = profile.face;
  const headStrength = dna.body === "biped" ? 0.72 : 0.82;
  addSmoothBall(field, 0, faceY - 0.08, faceZ + 0.2, headStrength, 8.4);
  if (dna.body === "pig" || dna.body === "rhino") {
    addSmoothBall(field, 0, faceY - 0.18, faceZ - 0.18, 0.5, 9.5);
  }
  if (dna.body === "saurian" || dna.body === "aquatic") {
    addSmoothBall(field, 0, faceY - 0.12, faceZ - 0.26, 0.56, 9.2);
  }

  const armHips = smoothArmPositions(dna, profile).map((arm, index) => {
    for (let step = 0; step < 6; step += 1) {
      const progress = step / 5;
      const elbowBend = Math.sin(progress * Math.PI) * 0.12;
      addSmoothBall(
        field,
        THREE.MathUtils.lerp(arm.shoulder[0], arm.hand[0], progress),
        THREE.MathUtils.lerp(arm.shoulder[1], arm.hand[1], progress),
        THREE.MathUtils.lerp(arm.shoulder[2], arm.hand[2], progress) -
          elbowBend,
        THREE.MathUtils.lerp(0.26, 0.2, progress),
        10.4,
      );
    }
    addSmoothBall(field, ...arm.hand, 0.3, 10.6);
    return { ...arm, index };
  });

  const legFootY =
    dna.legShape === "stilt"
      ? -0.28
      : dna.legShape === "springy"
        ? -0.02
        : dna.legShape === "paws" || dna.legShape === "clawed"
          ? 0.04
          : 0.12;
  const legHips = legPositions(dna.legs, profile).map(([x, , z], index) => {
    const hipY = cy - sy * 0.52;
    const outward =
      dna.legShape === "springy"
        ? x < 0
          ? -0.16
          : 0.16
        : dna.legShape === "paws" || dna.legShape === "clawed"
          ? x < 0
            ? -0.15
            : 0.15
          : 0;
    const footX = x + outward;
    const legDensityScale =
      dna.legs === 10
        ? 0.62
        : dna.legs === 8
          ? 0.72
          : dna.legs === 6
            ? 0.84
            : 1;
    const footReachScale = legDensityScale;
    const shaftRadius =
      (dna.legShape === "stubby"
        ? 0.36
        : dna.legShape === "paws"
          ? 0.3
          : dna.legShape === "clawed"
            ? 0.22
            : dna.legShape === "stilt"
              ? 0.14
              : 0.24) * legDensityScale;
    const kneePush =
      dna.legShape === "springy"
        ? 0.42
        : dna.legShape === "clawed"
          ? 0.18
          : 0.05;
    for (let step = 0; step < 5; step += 1) {
      const progress = step / 4;
      addSmoothEllipsoid(
        field,
        [
          THREE.MathUtils.lerp(x, footX, progress),
          THREE.MathUtils.lerp(hipY, legFootY, progress),
          z - Math.sin(progress * Math.PI) * kneePush,
        ],
        [
          shaftRadius * (1.25 - progress * 0.35),
          Math.max(0.18, (hipY - legFootY) * 0.32),
          shaftRadius * (1.25 - progress * 0.35),
        ],
        220,
      );
    }
    const scaledRadius = (
      radius: [number, number, number],
    ): [number, number, number] => [
      radius[0] * legDensityScale,
      radius[1],
      radius[2] * footReachScale,
    ];

    if (dna.legShape === "stubby") {
      addSmoothEllipsoid(
        field,
        [footX, legFootY - 0.01, z - 0.08],
        scaledRadius([0.31, 0.23, 0.3]),
      );
    } else if (dna.legShape === "hoof") {
      for (const side of [-1, 1]) {
        addSmoothEllipsoid(
          field,
          [
            footX + side * 0.13 * legDensityScale,
            legFootY - 0.035,
            z - 0.23 * footReachScale,
          ],
          scaledRadius([0.145, 0.14, 0.32]),
          205,
        );
      }
    } else if (dna.legShape === "springy") {
      addSmoothEllipsoid(
        field,
        [footX, legFootY + 0.11, z + 0.18 * footReachScale],
        scaledRadius([0.18, 0.2, 0.24]),
      );
      addSmoothEllipsoid(
        field,
        [footX, legFootY - 0.035, z - 0.34 * footReachScale],
        scaledRadius([0.21, 0.12, 0.54]),
        205,
      );
    } else if (dna.legShape === "clawed") {
      addSmoothEllipsoid(
        field,
        [footX, legFootY, z - 0.18 * footReachScale],
        scaledRadius([0.27, 0.13, 0.29]),
      );
      for (const toe of [-1, 0, 1]) {
        addSmoothEllipsoid(
          field,
          [
            footX + toe * 0.17 * legDensityScale,
            legFootY - 0.045,
            z - 0.48 * footReachScale,
          ],
          scaledRadius([0.075, 0.075, 0.38]),
          215,
        );
      }
    } else if (dna.legShape === "paws") {
      addSmoothEllipsoid(
        field,
        [footX, legFootY - 0.02, z - 0.22 * footReachScale],
        scaledRadius([0.39, 0.17, 0.4]),
        195,
      );
      for (const toe of [-1, 0, 1]) {
        addSmoothBall(
          field,
          footX + toe * 0.17 * legDensityScale,
          legFootY - 0.025,
          z - 0.43 * footReachScale,
          0.13 * legDensityScale,
          11.4,
        );
      }
    } else if (dna.legShape === "stilt") {
      addSmoothEllipsoid(
        field,
        [footX, legFootY - 0.035, z - 0.18 * footReachScale],
        scaledRadius([0.14, 0.085, 0.3]),
        205,
      );
    } else {
      addSmoothEllipsoid(
        field,
        [footX, legFootY - 0.04, z - 0.3 * footReachScale],
        scaledRadius([0.45, 0.11, 0.58]),
        205,
      );
    }
    return { x, y: hipY, z, index, footX, density: legDensityScale };
  });

  const legRows = [...new Set(legHips.map((hip) => hip.z))].sort(
    (first, second) => first - second,
  );

  // Relax the scalar field before polygonization as well as the final mesh.
  // This removes the concentric metaball/voxel contouring visible under soft
  // lighting; the second, lighter pass preserves small features.
  field.blur(0.9);
  field.blur(0.55);
  closeSmoothFieldBoundary(field);

  if (legRows.length > 0) {
    const fieldCellSize = (SMOOTH_FIELD_SCALE * 2) / field.size;
    const hipY = cy - sy * 0.52;
    const archBaseY = legFootY - Math.max(0.42, fieldCellSize * 6);
    const archTopY = Math.max(
      hipY - Math.max(0.1, fieldCellSize * 2),
      legFootY + fieldCellSize * 4,
    );

    // One front-to-back tunnel separates the left and right columns without
    // leaving deeper body rows projected into the gap.
    const firstLegRow = legRows[0];
    const lastLegRow = legRows[legRows.length - 1];
    carveSmoothArch(
      field,
      [0, (firstLegRow + lastLegRow) / 2],
      [
        Math.max(profile.legX * 0.72, fieldCellSize * 3),
        SMOOTH_FIELD_SCALE * 1.05,
      ],
      archBaseY,
      archTopY,
      "x",
    );

    // Longitudinal arches separate front/rear legs on each side. Without
    // these, the side view still reads as one solid wall even if every row
    // has a left/right opening.
    for (let row = 0; row < legRows.length - 1; row += 1) {
      const firstRow = legRows[row];
      const secondRow = legRows[row + 1];
      const gapZ = (firstRow + secondRow) / 2;
      const rowGap = secondRow - firstRow;
      const gapRadiusZ = Math.min(
        Math.max(rowGap * 0.28, fieldCellSize * 1.25),
        Math.max(fieldCellSize, rowGap * 0.5 - fieldCellSize * 0.45),
      );
      // Cut one continuous tunnel across the whole body width. Two localized
      // side cuts leave a central belly web that projects into the opening
      // from a side camera and still reads as connected legs.
      carveSmoothArch(
        field,
        [0, gapZ],
        [SMOOTH_FIELD_SCALE * 1.05, gapRadiusZ],
        archBaseY,
        archTopY,
        "z",
      );
    }
  }
  if (dna.legShape === "hoof") {
    const cell = (SMOOTH_FIELD_SCALE * 2) / field.size;
    for (const hip of legHips) {
      // The cloven front must be cut after smoothing, or the two lobes fuse.
      carveSmoothArch(
        field,
        [hip.footX, hip.z - 0.42 * hip.density],
        [Math.max(0.05 * hip.density, cell * 0.65), 0.22 * hip.density],
        legFootY - 0.25,
        legFootY + 0.1,
        "x",
      );
    }
  }
  field.update();
  const sourcePosition = field.geometry.getAttribute("position");
  const sourceVertexCount = field.geometry.drawRange.count;
  // Fit a closed analytic tail to the finished body, then merge it into the
  // same skinned draw call. The old small voxel field erased forks and curls.
  const probeGeometry = new THREE.BufferGeometry();
  probeGeometry.setAttribute(
    "position",
    new THREE.BufferAttribute(
      new Float32Array(sourcePosition.array.slice(0, sourceVertexCount * 3)),
      3,
    ),
  );
  probeGeometry.computeVertexNormals();
  const tailRoot = getMonsterSurface(probeGeometry).at(
    [0, profile.tail[0], profile.tail[1]],
    [0, 0, 1],
    0.1,
  ).position;
  const appendages: THREE.BufferGeometry[] = [];
  if (dna.tail !== "none")
    appendages.push(createTailGeometry(dna.tail, tailRoot));
  if (dna.legShape === "clawed") {
    for (const hip of legHips) {
      for (const toe of [-1, 0, 1]) {
        const x = hip.footX + toe * 0.17 * hip.density;
        const z = hip.z - 0.47 * hip.density;
        appendages.push(
          taperedSweep(
            [
              [x, legFootY - 0.015, z],
              [x + toe * 0.02, legFootY + 0.015, z - 0.17 * hip.density],
              [x + toe * 0.045, legFootY - 0.055, z - 0.33 * hip.density],
            ],
            [0.064 * hip.density, 0.046 * hip.density, 0.004],
            12,
            8,
          ),
        );
      }
    }
  }
  const tailShape = appendages.length
    ? mergeGeometries(appendages)!
    : new THREE.BufferGeometry();
  appendages.forEach((geometry) => geometry.dispose());
  const tailGeometry = tailShape.index ? tailShape.toNonIndexed() : tailShape;
  const tailSource = tailGeometry.getAttribute("position");
  const tailPositions = new Float32Array((tailSource?.count ?? 0) * 3);
  for (let i = 0; i < (tailSource?.count ?? 0); i++) {
    tailPositions[i * 3] = tailSource.getX(i) / SMOOTH_FIELD_SCALE;
    tailPositions[i * 3 + 1] =
      (tailSource.getY(i) - SMOOTH_FIELD_ORIGIN_Y) / SMOOTH_FIELD_SCALE;
    tailPositions[i * 3 + 2] = tailSource.getZ(i) / SMOOTH_FIELD_SCALE;
  }
  probeGeometry.dispose();
  tailGeometry.dispose();
  if (tailGeometry !== tailShape) tailShape.dispose();
  const positions = new Float32Array(
    sourceVertexCount * 3 + tailPositions.length,
  );

  for (let index = 0; index < sourceVertexCount; index += 1) {
    positions[index * 3] = sourcePosition.getX(index);
    positions[index * 3 + 1] = sourcePosition.getY(index);
    positions[index * 3 + 2] = sourcePosition.getZ(index);
  }
  positions.set(tailPositions, sourceVertexCount * 3);

  const rawGeometry = new THREE.BufferGeometry();
  rawGeometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const parts = new Float32Array(positions.length / 3);
  parts.fill(1, sourceVertexCount);
  rawGeometry.setAttribute("surfacePart", new THREE.BufferAttribute(parts, 1));
  const geometry = mergeVertices(rawGeometry, 0.0001);
  rawGeometry.dispose();
  relaxSmoothGeometry(geometry);
  applyFieldNormals(geometry, field);

  const relaxedPosition = geometry.getAttribute("position");
  const vertexCount = relaxedPosition.count;
  const skinIndices = new Uint16Array(vertexCount * 4);
  const skinWeights = new Float32Array(vertexCount * 4);
  let minimumWorldY = Number.POSITIVE_INFINITY;

  for (let index = 0; index < vertexCount; index += 1) {
    const px = relaxedPosition.getX(index);
    const py = relaxedPosition.getY(index);
    const pz = relaxedPosition.getZ(index);

    const localX = px * SMOOTH_FIELD_SCALE;
    const localY = py * SMOOTH_FIELD_SCALE + SMOOTH_FIELD_ORIGIN_Y;
    const localZ = pz * SMOOTH_FIELD_SCALE;
    minimumWorldY = Math.min(minimumWorldY, localY);
    const isTailVertex =
      dna.tail !== "none" &&
      localZ > tailRoot[2] - 0.14 &&
      Math.abs(localX) <
        (dna.tail === "curly" ? 0.82 : dna.tail === "forked" ? 0.72 : 0.52);
    if (isTailVertex) {
      const tailInfluence = THREE.MathUtils.clamp(
        (localZ - tailRoot[2] + 0.14) / 0.65,
        0,
        1,
      );
      skinIndices[index * 4] = legHips.length + armHips.length + 1;
      skinIndices[index * 4 + 1] = 0;
      skinWeights[index * 4] = tailInfluence;
      skinWeights[index * 4 + 1] = 1 - tailInfluence;
      continue;
    }

    let nearestArm = -1;
    let nearestArmDistance = Number.POSITIVE_INFINITY;
    armHips.forEach((arm, armIndex) => {
      const [shoulderX, shoulderY, shoulderZ] = arm.shoulder;
      const [handX, handY, handZ] = arm.hand;
      const segmentX = handX - shoulderX;
      const segmentY = handY - shoulderY;
      const segmentZ = handZ - shoulderZ;
      const segmentLengthSquared =
        segmentX * segmentX + segmentY * segmentY + segmentZ * segmentZ;
      const progress = THREE.MathUtils.clamp(
        ((localX - shoulderX) * segmentX +
          (localY - shoulderY) * segmentY +
          (localZ - shoulderZ) * segmentZ) /
          segmentLengthSquared,
        0,
        1,
      );
      const distance = Math.hypot(
        localX - (shoulderX + segmentX * progress),
        localY - (shoulderY + segmentY * progress),
        localZ - (shoulderZ + segmentZ * progress),
      );
      if (distance < nearestArmDistance) {
        nearestArmDistance = distance;
        nearestArm = armIndex;
      }
    });
    if (nearestArm >= 0 && nearestArmDistance < 0.43) {
      const arm = armHips[nearestArm];
      const reach = Math.hypot(
        localX - arm.shoulder[0],
        localY - arm.shoulder[1],
        localZ - arm.shoulder[2],
      );
      const influence =
        THREE.MathUtils.clamp(reach / 0.72, 0.08, 0.92) *
        (1 -
          THREE.MathUtils.smoothstep(
            localY,
            arm.shoulder[1] - 0.15,
            arm.shoulder[1] + 0.08,
          ));
      skinIndices[index * 4] = legHips.length + nearestArm + 1;
      skinIndices[index * 4 + 1] = 0;
      skinWeights[index * 4] = influence;
      skinWeights[index * 4 + 1] = 1 - influence;
      continue;
    }

    let nearestLeg = -1;
    let nearestDistance = Number.POSITIVE_INFINITY;
    if (localY < cy - sy * 0.16) {
      legHips.forEach((hip, legIndex) => {
        const distance = Math.hypot(localX - hip.x, localZ - hip.z);
        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearestLeg = legIndex;
        }
      });
    }
    if (nearestLeg >= 0 && nearestDistance < 0.95) {
      const hipY = legHips[nearestLeg].y;
      const influence = THREE.MathUtils.clamp(
        1 - THREE.MathUtils.smoothstep(localY, legFootY + 0.15, hipY + 0.06),
        0,
        1,
      );
      if (influence > 0.01) {
        skinIndices[index * 4] = nearestLeg + 1;
        skinIndices[index * 4 + 1] = 0;
        skinWeights[index * 4] = influence;
        skinWeights[index * 4 + 1] = 1 - influence;
      } else {
        skinIndices[index * 4] = 0;
        skinWeights[index * 4] = 1;
      }
    } else {
      skinIndices[index * 4] = 0;
      skinWeights[index * 4] = 1;
    }
  }

  geometry.setAttribute(
    "skinIndex",
    new THREE.Uint16BufferAttribute(skinIndices, 4),
  );
  geometry.setAttribute(
    "skinWeight",
    new THREE.Float32BufferAttribute(skinWeights, 4),
  );
  geometry.userData.minimumWorldY = minimumWorldY;
  geometry.userData.footY = legFootY;
  geometry.userData.tailRoot = tailRoot;
  geometry.computeBoundingSphere();
  temporaryMaterial.dispose();
  smoothGeometryCache.set(cacheKey, {
    geometry,
    mountedUsers: 0,
    lastUsedAt: Date.now(),
  });
  pruneSmoothGeometryCache();
  return geometry;
}

function getSmoothGeometryMetrics(
  dna: MonsterDna,
  geometryQuality: "hero" | "remote",
) {
  const geometry = buildSmoothGeometry(dna, geometryQuality);
  const cachedMinimumY = geometry.userData.minimumWorldY;
  return {
    vertices: geometry.getAttribute("position").count,
    minimumY: typeof cachedMinimumY === "number" ? cachedMinimumY : 0,
    surface: getMonsterSurface(geometry),
  };
}

function createSmoothRig(
  dna: MonsterDna,
  profile: BodyProfile,
  bodyColor: string,
  accentColor: string,
  castShadow: boolean,
  geometryQuality: "hero" | "remote",
): SmoothRig {
  const cacheKey = getSmoothGeometryCacheKey(dna, geometryQuality);
  const geometry = buildSmoothGeometry(dna, geometryQuality);
  const material = createMonsterSkinMaterial(
    dna,
    profile.center,
    profile.scale,
    bodyColor,
    accentColor,
    geometry.userData.footY,
    geometry.userData.tailRoot[2],
  );
  const mesh = new THREE.SkinnedMesh(geometry, material);
  mesh.castShadow = castShadow;
  // Dense procedural surfaces show shadow-map contour bands when receiving
  // their own shadow. It still casts a full world/contact shadow.
  mesh.receiveShadow = false;
  const rootBone = new THREE.Bone();
  const [cx, cy] = profile.center;
  const [, sy] = profile.scale;
  const legBones = legPositions(dna.legs, profile).map(([x, , z]) => {
    const bone = new THREE.Bone();
    bone.position.set(
      x / SMOOTH_FIELD_SCALE,
      (cy - sy * 0.52 - SMOOTH_FIELD_ORIGIN_Y) / SMOOTH_FIELD_SCALE,
      z / SMOOTH_FIELD_SCALE,
    );
    rootBone.add(bone);
    return bone;
  });
  const armBones = smoothArmPositions(dna, profile).map(({ shoulder }) => {
    const bone = new THREE.Bone();
    bone.position.set(
      shoulder[0] / SMOOTH_FIELD_SCALE,
      (shoulder[1] - SMOOTH_FIELD_ORIGIN_Y) / SMOOTH_FIELD_SCALE,
      shoulder[2] / SMOOTH_FIELD_SCALE,
    );
    rootBone.add(bone);
    return bone;
  });
  let tailBone: THREE.Bone | undefined;
  if (dna.tail !== "none") {
    const [, tailY, tailZ] = geometry.userData.tailRoot;
    tailBone = new THREE.Bone();
    tailBone.position.set(
      cx / SMOOTH_FIELD_SCALE,
      (tailY - SMOOTH_FIELD_ORIGIN_Y) / SMOOTH_FIELD_SCALE,
      (tailZ - 0.22) / SMOOTH_FIELD_SCALE,
    );
    rootBone.add(tailBone);
  }
  mesh.add(rootBone);
  mesh.bind(
    new THREE.Skeleton([
      rootBone,
      ...legBones,
      ...armBones,
      ...(tailBone ? [tailBone] : []),
    ]),
  );
  return { mesh, cacheKey, legBones, armBones, tailBone, material };
}

function legGaitDirection(index: number) {
  // legPositions is row-major. Alternating both side and row produces
  // diagonal pairs for quadrupeds and a readable tripod/wave rhythm for
  // denser creatures instead of moving every leg on one side as a rigid comb.
  const row = Math.floor(index / 2);
  const side = index % 2;
  return (row + side) % 2 === 0 ? 1 : -1;
}

function SmoothMonsterCore({
  dna,
  profile,
  bodyColor,
  accentColor,
  castShadow,
  motionRef,
  geometryQuality,
}: {
  dna: MonsterDna;
  profile: BodyProfile;
  bodyColor: string;
  accentColor: string;
  castShadow: boolean;
  motionRef?: RefObject<MonsterMotionState>;
  geometryQuality: "hero" | "remote";
}) {
  const [rig] = useState(() =>
    createSmoothRig(
      dna,
      profile,
      bodyColor,
      accentColor,
      castShadow,
      geometryQuality,
    ),
  );
  const meshRef = useRef<THREE.SkinnedMesh>(null);
  const legBonesRef = useRef<THREE.Bone[]>([]);
  const armBonesRef = useRef<THREE.Bone[]>([]);
  const tailBoneRef = useRef<THREE.Bone>(null);

  useEffect(() => {
    retainSmoothGeometry(rig.cacheKey);
    legBonesRef.current = rig.legBones;
    armBonesRef.current = rig.armBones;
    tailBoneRef.current = rig.tailBone ?? null;
    return () => {
      rig.material.dispose();
      rig.mesh.skeleton.dispose();
      releaseSmoothGeometry(rig.cacheKey);
    };
  }, [rig]);

  useFrame(({ clock }, delta) => {
    const time = clock.elapsedTime;
    const fallbackStride = Math.sin(time * 5.2) * 0.72;
    const motion = motionRef?.current;
    const gait = motion?.gait ?? "walk";
    const stride = motion?.stride ?? fallbackStride;
    const intensity = motion?.intensity ?? 0.78;
    legBonesRef.current.forEach((bone, index) => {
      const direction = legGaitDirection(index);
      const foldedPose = gait === "fly" ? 0.48 : gait === "swim" ? 0.2 : 0;
      const gaitScale = gait === "fly" ? 0.28 : gait === "swim" ? 0.62 : 1;
      bone.rotation.x = THREE.MathUtils.damp(
        bone.rotation.x,
        foldedPose + stride * direction * gaitScale,
        gait === "sprint" ? 16 : 12,
        delta,
      );
      const outward = index % 2 === 0 ? -1 : 1;
      bone.rotation.z = THREE.MathUtils.damp(
        bone.rotation.z,
        outward * intensity * (gait === "swim" ? 0.13 : 0.035),
        10,
        delta,
      );
    });
    armBonesRef.current.forEach((bone, index) => {
      const side = index === 0 ? -1 : 1;
      const foldedPose = gait === "fly" ? -0.38 : gait === "swim" ? -0.14 : 0;
      bone.rotation.x = THREE.MathUtils.damp(
        bone.rotation.x,
        foldedPose - stride * side * (gait === "sprint" ? 0.78 : 0.58),
        gait === "sprint" ? 15 : 11,
        delta,
      );
      bone.rotation.z = THREE.MathUtils.damp(
        bone.rotation.z,
        side * (0.035 + intensity * 0.025),
        9,
        delta,
      );
    });
    if (tailBoneRef.current) {
      const tailSpeed = gait === "sprint" ? 7 : gait === "swim" ? 5.4 : 2.4;
      const tailAmount = gait === "swim" ? 0.3 : 0.12 + intensity * 0.08;
      tailBoneRef.current.rotation.y = THREE.MathUtils.damp(
        tailBoneRef.current.rotation.y,
        Math.sin(time * tailSpeed) * tailAmount,
        10,
        delta,
      );
      tailBoneRef.current.rotation.x = THREE.MathUtils.damp(
        tailBoneRef.current.rotation.x,
        gait === "fly" ? -0.12 : Math.sin(time * 1.1) * 0.035,
        8,
        delta,
      );
    }
    if (meshRef.current) {
      // Keep the organic idle motion subtle: external sockets (eyes, horns,
      // ears and adaptations) intentionally overlap the skin, and large core-
      // only squash used to expose those joins while walking.
      const breath = Math.sin(time * 1.9) * 0.003;
      const movementCompression = Math.abs(stride) * intensity * 0.006;
      meshRef.current.scale.y = 1 + breath - movementCompression;
      meshRef.current.scale.x = 1 - breath * 0.5 + movementCompression * 0.45;
    }
  });

  return (
    <group position={[0, SMOOTH_FIELD_ORIGIN_Y, 0]} scale={SMOOTH_FIELD_SCALE}>
      <primitive ref={meshRef} object={rig.mesh} />
    </group>
  );
}

function SmoothMonsterVisual({
  dna,
  wingRefs,
  motionRef,
  castShadow,
  geometryQuality = "hero",
}: MonsterVisualProps & { castShadow: boolean }) {
  const primary = getMonsterColor(dna.color);
  const accent = getAccentColor(dna.accent);
  const profile = BODY_PROFILES[dna.body];
  const sizeScale = getMonsterSizeScale(dna.size);
  const buildScale = getMonsterBuildScale(dna.build);
  const geometryMetrics = getSmoothGeometryMetrics(dna, geometryQuality);
  const groundOffset = 0.025 - geometryMetrics.minimumY * buildScale[1];
  const features = {
    dna,
    profile,
    surface: geometryMetrics.surface,
    accent: accent.hex,
    bodyColor: primary.hex,
    castShadow,
    wingRefs,
  };
  return (
    <group scale={sizeScale}>
      <group position={[0, groundOffset, 0]} scale={buildScale}>
        <SmoothMonsterCore
          key={`${geometryQuality}:${getSmoothCoreSignature(dna)}:${dna.pattern}:${dna.color}:${dna.accent}`}
          dna={dna}
          profile={profile}
          bodyColor={primary.hex}
          accentColor={accent.hex}
          castShadow={castShadow}
          motionRef={motionRef}
          geometryQuality={geometryQuality}
        />
        <Face
          dna={dna}
          profile={profile}
          accent={accent.hex}
          surface={geometryMetrics.surface}
        />
        <SkinHorns {...features} />
        <SkinEars {...features} />
        <SkinAdaptation {...features} />
        <SkinGills {...features} />
      </group>
    </group>
  );
}

export function MonsterVisual({
  dna,
  wingRefs,
  motionRef,
  castShadow = true,
  geometryQuality = "hero",
}: MonsterVisualProps) {
  return (
    <SmoothMonsterVisual
      dna={dna}
      wingRefs={wingRefs}
      motionRef={motionRef}
      castShadow={castShadow}
      geometryQuality={geometryQuality}
    />
  );
}
