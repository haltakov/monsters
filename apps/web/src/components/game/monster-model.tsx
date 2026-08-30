import { useEffect, useRef, useState, type RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { MarchingCubes } from "three/addons/objects/MarchingCubes.js";
import { mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";
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

type BodyProfile = {
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

const BODY_PROFILES: Record<MonsterDna["body"], BodyProfile> = {
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
  shape: MonsterDna["mouth"];
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

  return (
    <mesh position={[0, -0.43, -0.13]} rotation={[Math.PI / 2, 0, 0]}>
      <torusGeometry args={[0.2, 0.038, 12, 28, Math.PI]} />
      <meshStandardMaterial color="#173F35" />
    </mesh>
  );
}

function Face({
  dna,
  profile,
  accent,
  bodyColor,
}: {
  dna: MonsterDna;
  profile: BodyProfile;
  accent: string;
  bodyColor?: string;
}) {
  return (
    <group
      position={[0, profile.face[0], profile.face[1]]}
      scale={profile.faceScale}
    >
      {eyeOffsets(dna.eyes).map(([x, y], index) => {
        const eyeScale = dna.eyes >= 10 ? 0.62 : dna.eyes >= 6 ? 0.78 : 1;
        return (
          <group
            key={`${x}-${y}-${index}`}
            position={[x, y, 0]}
            scale={eyeScale}
          >
            {bodyColor && (
              <mesh position={[0, -0.01, 0.11]} scale={[1.04, 1, 0.78]}>
                <sphereGeometry args={[0.17, 18, 14]} />
                <meshStandardMaterial color={bodyColor} roughness={0.76} />
              </mesh>
            )}
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
      <Mouth shape={dna.mouth} accent={accent} />
    </group>
  );
}

function Horns({
  shape,
  profile,
  accent,
  bodyColor,
  castShadow,
  surfaceInset = 0,
}: {
  shape: MonsterDna["horns"];
  profile: BodyProfile;
  accent: string;
  bodyColor?: string;
  castShadow: boolean;
  surfaceInset?: number;
}) {
  if (shape === "none") return null;
  const [y, z, spread] = profile.horn;

  if (shape === "rhino") {
    return (
      <group>
        <mesh position={[0, y - 0.05, z + 0.04]} scale={[0.24, 0.2, 0.3]}>
          <sphereGeometry args={[1, 18, 14]} />
          <meshStandardMaterial color={bodyColor ?? accent} roughness={0.76} />
        </mesh>
        <mesh
          position={[0, y - 0.05, z - 0.28 + surfaceInset * 0.7]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <coneGeometry args={[0.16, 0.68, 18]} />
          <meshStandardMaterial color={accent} roughness={0.7} />
        </mesh>
      </group>
    );
  }

  if (shape === "buds") {
    return (
      <group>
        {[-spread, spread].map((x) => (
          <mesh
            key={x}
            position={[x, y - surfaceInset, z]}
            castShadow={castShadow}
          >
            <sphereGeometry args={[0.21, 18, 14]} />
            <meshStandardMaterial color={accent} roughness={0.76} />
          </mesh>
        ))}
      </group>
    );
  }

  if (shape === "antlers") {
    return (
      <group>
        {[-1, 1].map((side) => (
          <group
            key={side}
            position={[side * spread, y + 0.15 - surfaceInset, z]}
          >
            <mesh position={[0, -0.34, 0]} scale={[0.2, 0.24, 0.2]}>
              <sphereGeometry args={[1, 16, 12]} />
              <meshStandardMaterial
                color={bodyColor ?? accent}
                roughness={0.78}
              />
            </mesh>
            <mesh rotation={[0, 0, side * -0.28]}>
              <cylinderGeometry args={[0.055, 0.09, 0.74, 10]} />
              <meshStandardMaterial color={accent} roughness={0.85} />
            </mesh>
            {[-0.2, 0.15].map((branchY) => (
              <mesh
                key={branchY}
                position={[side * 0.16, branchY, 0]}
                rotation={[0, 0, side * -0.9]}
              >
                <cylinderGeometry args={[0.04, 0.055, 0.34, 9]} />
                <meshStandardMaterial color={accent} roughness={0.85} />
              </mesh>
            ))}
          </group>
        ))}
      </group>
    );
  }

  if (shape === "single") {
    return (
      <group position={[0, y - surfaceInset, z]}>
        <mesh position={[0, -0.2, 0]} scale={[0.25, 0.22, 0.25]}>
          <sphereGeometry args={[1, 18, 14]} />
          <meshStandardMaterial color={bodyColor ?? accent} roughness={0.76} />
        </mesh>
        <mesh position={[0, 0.08, 0]} castShadow={castShadow}>
          <coneGeometry args={[0.22, 0.78, 20]} />
          <meshStandardMaterial color={accent} roughness={0.72} />
        </mesh>
      </group>
    );
  }

  if (shape === "ram") {
    return (
      <group>
        {[-1, 1].map((side) => (
          <group
            key={side}
            position={[side * spread, y - 0.12 - surfaceInset, z]}
          >
            <mesh scale={[0.24, 0.28, 0.24]}>
              <sphereGeometry args={[1, 18, 14]} />
              <meshStandardMaterial
                color={bodyColor ?? accent}
                roughness={0.76}
              />
            </mesh>
            <mesh
              position={[side * 0.1, 0.08, 0.03]}
              rotation={[Math.PI / 2, 0, side * Math.PI]}
              scale={[1, 1, 0.8]}
            >
              <torusGeometry args={[0.26, 0.075, 12, 28, Math.PI * 1.55]} />
              <meshStandardMaterial color={accent} roughness={0.78} />
            </mesh>
          </group>
        ))}
      </group>
    );
  }

  return (
    <group>
      {[-spread, spread].map((x) => (
        <group key={x} position={[x, y - surfaceInset, z]}>
          <mesh position={[0, -0.2, 0]} scale={[0.23, 0.22, 0.23]}>
            <sphereGeometry args={[1, 18, 14]} />
            <meshStandardMaterial
              color={bodyColor ?? accent}
              roughness={0.76}
            />
          </mesh>
          <mesh
            position={[0, 0.08, 0]}
            rotation={[0, 0, x < 0 ? -0.34 : 0.34]}
            castShadow={castShadow}
          >
            <coneGeometry args={[0.19, 0.62, 18]} />
            <meshStandardMaterial color={accent} roughness={0.72} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function Ears({
  shape,
  profile,
  accent,
  bodyColor,
  castShadow,
}: {
  shape: MonsterDna["ears"];
  profile: BodyProfile;
  accent: string;
  bodyColor: string;
  castShadow: boolean;
}) {
  if (shape === "none") return null;
  const anchorY = profile.face[0] + 0.22 * profile.faceScale;
  const anchorZ = profile.face[1] + 0.3;
  const anchorX = Math.min(0.82, Math.max(0.46, profile.scale[0] * 0.68));

  return (
    <group>
      {[-1, 1].map((side) => (
        <group key={side} position={[side * anchorX, anchorY, anchorZ]}>
          <mesh scale={[0.28, 0.24, 0.3]}>
            <sphereGeometry args={[1, 18, 14]} />
            <meshStandardMaterial color={bodyColor} roughness={0.78} />
          </mesh>
          {shape === "round" && (
            <mesh
              position={[side * 0.14, 0.06, 0]}
              scale={[0.3, 0.34, 0.22]}
              castShadow={castShadow}
            >
              <sphereGeometry args={[1, 20, 16]} />
              <meshStandardMaterial color={accent} roughness={0.76} />
            </mesh>
          )}
          {shape === "pointed" && (
            <mesh
              position={[side * 0.14, 0.24, 0]}
              rotation={[0, 0, side * -0.42]}
              castShadow={castShadow}
            >
              <coneGeometry args={[0.24, 0.66, 18]} />
              <meshStandardMaterial color={accent} roughness={0.74} />
            </mesh>
          )}
          {shape === "floppy" && (
            <mesh
              position={[side * 0.18, -0.2, 0.02]}
              rotation={[0.1, 0, side * -0.22]}
              scale={[1, 1.25, 0.72]}
              castShadow={castShadow}
            >
              <capsuleGeometry args={[0.16, 0.42, 8, 14]} />
              <meshStandardMaterial color={accent} roughness={0.8} />
            </mesh>
          )}
          {shape === "fan" && (
            <mesh
              position={[side * 0.17, 0.06, 0.02]}
              rotation={[0, side * 0.12, side * -0.18]}
              scale={[0.2, 0.48, 0.34]}
              castShadow={castShadow}
            >
              <sphereGeometry args={[1, 22, 16]} />
              <meshStandardMaterial color={accent} roughness={0.76} />
            </mesh>
          )}
        </group>
      ))}
    </group>
  );
}

function Adaptation({
  type,
  profile,
  accent,
  castShadow,
  wingRefs,
  surfaceInset = 0,
  bodyColor,
}: {
  type: MonsterDna["adaptation"];
  profile: BodyProfile;
  accent: string;
  castShadow: boolean;
  wingRefs?: Array<RefObject<THREE.Group | null>>;
  surfaceInset?: number;
  bodyColor?: string;
}) {
  if (type === "none") return null;
  const [cx, cy, cz] = profile.center;
  const [sx, sy, sz] = profile.scale;

  if (type === "fins") {
    return (
      <group>
        {[-1, 1].map((side) => (
          <group
            key={side}
            position={[
              cx + side * Math.max(sx * 0.68, sx * 0.92 - surfaceInset),
              cy,
              cz - 0.05,
            ]}
          >
            {bodyColor && (
              <mesh scale={[0.2, 0.16, 0.25]}>
                <sphereGeometry args={[1, 18, 14]} />
                <meshStandardMaterial color={bodyColor} roughness={0.78} />
              </mesh>
            )}
            <mesh
              position={[side * 0.3, 0, -0.02]}
              rotation={[0.08, side * 0.08, side * -0.62]}
              scale={[0.62, 0.12, 0.36]}
            >
              <sphereGeometry args={[0.72, 20, 14]} />
              <meshStandardMaterial
                color={accent}
                roughness={0.68}
                side={THREE.DoubleSide}
              />
            </mesh>
          </group>
        ))}
      </group>
    );
  }

  if (type === "wings") {
    return (
      <group>
        {[-1, 1].map((side, index) => (
          <group
            key={side}
            ref={wingRefs?.[index]}
            position={[
              cx + side * Math.max(sx * 0.68, sx * 0.92 - surfaceInset),
              cy + sy * 0.25,
              cz + 0.15,
            ]}
            rotation={[0, 0, side * -0.38]}
          >
            {bodyColor && (
              <mesh scale={[0.24, 0.2, 0.3]}>
                <sphereGeometry args={[1, 18, 14]} />
                <meshStandardMaterial color={bodyColor} roughness={0.76} />
              </mesh>
            )}
            <mesh
              position={[side * 0.34, 0.03, 0]}
              rotation={[0.15, side * 0.18, 0]}
              scale={[0.85, 0.16, 0.72]}
              castShadow={castShadow}
            >
              <sphereGeometry args={[0.72, 18, 12]} />
              <meshStandardMaterial color={accent} roughness={0.72} />
            </mesh>
          </group>
        ))}
      </group>
    );
  }

  if (type === "mane") {
    return (
      <group>
        {Array.from({ length: 9 }, (_, index) => {
          const angle = (index / 9) * Math.PI * 2;
          return (
            <mesh
              key={index}
              position={[
                Math.sin(angle) * Math.min(0.68, sx * 0.7),
                profile.face[0] - 0.3 + Math.cos(angle) * 0.48,
                profile.face[1] + 0.36,
              ]}
              scale={[0.27, 0.32, 0.25]}
              castShadow={castShadow}
            >
              <sphereGeometry args={[1, 18, 14]} />
              <meshStandardMaterial color={accent} roughness={0.86} />
            </mesh>
          );
        })}
      </group>
    );
  }

  if (type === "antennae") {
    return (
      <group>
        {[-1, 1].map((side) => (
          <group
            key={side}
            position={[
              side * Math.min(0.38, sx * 0.42),
              profile.face[0] + 0.3,
              profile.face[1] + 0.12,
            ]}
          >
            <mesh position={[0, -0.08, 0]} scale={[0.16, 0.14, 0.16]}>
              <sphereGeometry args={[1, 16, 12]} />
              <meshStandardMaterial
                color={bodyColor ?? accent}
                roughness={0.78}
              />
            </mesh>
            <mesh
              position={[side * 0.08, 0.24, -0.05]}
              rotation={[0.12, 0, side * -0.24]}
            >
              <cylinderGeometry args={[0.035, 0.055, 0.55, 10]} />
              <meshStandardMaterial color={accent} roughness={0.76} />
            </mesh>
            <mesh position={[side * 0.15, 0.52, -0.1]}>
              <sphereGeometry args={[0.11, 16, 12]} />
              <meshStandardMaterial color={accent} roughness={0.72} />
            </mesh>
          </group>
        ))}
      </group>
    );
  }

  if (type === "shell") {
    return (
      <mesh
        position={[
          cx,
          cy + sy * 0.22 - surfaceInset * 0.6,
          cz + sz * 0.45 - surfaceInset * 0.4,
        ]}
        scale={[sx * 0.88, sy * 0.78, sz * 0.48]}
        castShadow={castShadow}
      >
        <sphereGeometry args={[0.9, 24, 18]} />
        <meshStandardMaterial color={accent} roughness={0.9} />
      </mesh>
    );
  }

  return (
    <group>
      {Array.from({ length: 6 }, (_, index) => (
        <mesh
          key={index}
          position={[
            0,
            cy + sy * 0.78 - surfaceInset,
            cz - sz * 0.62 + index * ((sz * 1.2) / 5),
          ]}
          rotation={[0.06, 0, 0]}
          scale={[1, 1 - index * 0.06, 0.55]}
          castShadow={castShadow}
        >
          <coneGeometry args={[0.2, 0.58, 4]} />
          <meshStandardMaterial color={accent} roughness={0.78} />
        </mesh>
      ))}
    </group>
  );
}

function RespirationDetails({
  breathing,
  profile,
  grooveColor,
  surfaceInset = 0,
}: {
  breathing: MonsterDna["breathing"];
  profile: BodyProfile;
  grooveColor: string;
  surfaceInset?: number;
}) {
  if (breathing === "lungs") return null;
  const faceY = profile.face[0];
  const faceZ = profile.face[1];
  const spread = Math.min(0.78, profile.scale[0] * 0.8);

  return (
    <group>
      {[-1, 1].flatMap((side) =>
        [-0.14, 0, 0.14].map((depthOffset) => (
          <mesh
            key={`${side}-${depthOffset}`}
            position={[
              side * (spread - surfaceInset * 0.18),
              faceY - 0.2 + depthOffset * 0.15,
              faceZ + 0.38 + depthOffset,
            ]}
            rotation={[0.04, side * 0.12, side * (-0.18 - depthOffset * 0.22)]}
            scale={[0.034, 0.095, 0.018]}
          >
            <capsuleGeometry args={[1, 0.46, 6, 10]} />
            <meshStandardMaterial color={grooveColor} roughness={1} />
          </mesh>
        )),
      )}
    </group>
  );
}

const SMOOTH_FIELD_SCALE = 2.15;
const SMOOTH_FIELD_ORIGIN_Y = 1.35;
const SMOOTH_TAIL_FIELD_SCALE = 1.25;
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
  return `smooth-hybrid-rig-v14:${geometryQuality}:${JSON.stringify(dna)}`;
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

function buildSmoothTailPositions(dna: MonsterDna, profile: BodyProfile) {
  if (dna.tail === "none") return new Float32Array();

  const material = new THREE.MeshStandardMaterial();
  const field = new MarchingCubes(36, material, false, false, 36_000);
  const [tailY, tailZ] = profile.tail;
  const origin: [number, number, number] = [0, tailY + 0.1, tailZ + 0.44];
  const addTailBall = (
    x: number,
    y: number,
    z: number,
    radius: number,
    subtract = 10,
  ) => {
    const normalizedRadius = radius / (SMOOTH_TAIL_FIELD_SCALE * 2);
    const strength =
      normalizedRadius * normalizedRadius * (field.isolation + subtract);
    field.addBall(
      0.5 + (x - origin[0]) / (SMOOTH_TAIL_FIELD_SCALE * 2),
      0.5 + (y - origin[1]) / (SMOOTH_TAIL_FIELD_SCALE * 2),
      0.5 + (z - origin[2]) / (SMOOTH_TAIL_FIELD_SCALE * 2),
      strength,
      subtract,
    );
  };

  const baseZ = tailZ - 0.12;
  addTailBall(0, tailY, baseZ, 0.24);

  if (dna.tail === "curly") {
    for (let step = 1; step <= 9; step += 1) {
      const progress = step / 9;
      const angle = progress * Math.PI * 1.72;
      addTailBall(
        Math.sin(angle) * 0.34 * progress,
        tailY + (1 - Math.cos(angle)) * 0.22,
        baseZ + progress * 0.56,
        THREE.MathUtils.lerp(0.21, 0.12, progress),
      );
    }
  } else if (dna.tail === "forked") {
    for (let step = 1; step <= 4; step += 1) {
      const progress = step / 4;
      addTailBall(
        0,
        tailY + progress * 0.1,
        baseZ + progress * 0.48,
        THREE.MathUtils.lerp(0.22, 0.15, progress),
      );
    }
    for (const side of [-1, 1]) {
      for (let step = 1; step <= 4; step += 1) {
        const progress = step / 4;
        addTailBall(
          side * progress * 0.34,
          tailY + 0.1 + progress * 0.18,
          baseZ + 0.48 + progress * 0.38,
          THREE.MathUtils.lerp(0.15, 0.09, progress),
        );
      }
    }
  } else {
    const lift = dna.tail === "tuft" ? 0.24 : dna.tail === "fin" ? 0.02 : 0.1;
    const tailSteps = dna.tail === "whip" ? 8 : 5;
    const tailReach = dna.tail === "whip" ? 1.08 : 0.78;
    for (let step = 1; step <= tailSteps; step += 1) {
      const progress = step / tailSteps;
      addTailBall(
        0,
        tailY + lift * progress,
        baseZ + progress * tailReach,
        THREE.MathUtils.lerp(
          0.22,
          dna.tail === "club" ? 0.18 : dna.tail === "whip" ? 0.075 : 0.13,
          progress,
        ),
      );
    }
    if (dna.tail === "tuft") {
      addTailBall(0, tailY + 0.28, baseZ + 0.84, 0.23, 10.5);
    } else if (dna.tail === "club") {
      addTailBall(0, tailY + 0.12, baseZ + 0.86, 0.28, 10.5);
    } else if (dna.tail === "fin") {
      addTailBall(0, tailY + 0.3, baseZ + 0.84, 0.2, 10.5);
      addTailBall(0, tailY - 0.28, baseZ + 0.84, 0.2, 10.5);
    }
  }

  field.blur(0.72);
  closeSmoothFieldBoundary(field, SMOOTH_TAIL_FIELD_SCALE);
  field.update();
  const source = field.geometry.getAttribute("position");
  const vertexCount = field.geometry.drawRange.count;
  const positions = new Float32Array(vertexCount * 3);
  for (let index = 0; index < vertexCount; index += 1) {
    const worldX = source.getX(index) * SMOOTH_TAIL_FIELD_SCALE + origin[0];
    const worldY = source.getY(index) * SMOOTH_TAIL_FIELD_SCALE + origin[1];
    const worldZ = source.getZ(index) * SMOOTH_TAIL_FIELD_SCALE + origin[2];
    positions[index * 3] = worldX / SMOOTH_FIELD_SCALE;
    positions[index * 3 + 1] =
      (worldY - SMOOTH_FIELD_ORIGIN_Y) / SMOOTH_FIELD_SCALE;
    positions[index * 3 + 2] = worldZ / SMOOTH_FIELD_SCALE;
  }
  material.dispose();
  return positions;
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

function smoothPatternMix(
  dna: MonsterDna,
  profile: BodyProfile,
  x: number,
  y: number,
  z: number,
) {
  if (dna.pattern === "plain") return 0;
  const [cx, cy, cz] = profile.center;
  const [sx, sy, sz] = profile.scale;
  const nx = (x - cx) / Math.max(0.6, sx);
  const ny = (y - cy) / Math.max(0.6, sy);
  const nz = (z - cz) / Math.max(0.7, sz);

  if (dna.pattern === "stripes") {
    const wave = 0.5 + 0.5 * Math.cos((nz * 3.35 + ny * 0.18) * Math.PI * 2);
    return THREE.MathUtils.smoothstep(wave, 0.38, 0.68) * 0.7;
  }
  if (dna.pattern === "spots") {
    const signal =
      0.5 +
      0.5 *
        Math.sin(nx * 6.4 + nz * 1.7) *
        Math.cos(ny * 6.1 - nz * 2.2) *
        Math.sin(nz * 5.2 + nx * 1.3);
    return THREE.MathUtils.smoothstep(signal, 0.66, 0.84) * 0.8;
  }
  if (dna.pattern === "patches") {
    const signal =
      0.5 +
      (Math.sin(nx * 2.3 + ny * 1.1) +
        Math.cos(nz * 2.5 - ny * 0.9) +
        Math.sin((nx - nz) * 1.8)) /
        6;
    return THREE.MathUtils.smoothstep(signal, 0.5, 0.72) * 0.66;
  }
  if (dna.pattern === "rings") {
    const wave = 0.5 + 0.5 * Math.cos(nz * Math.PI * 7.2);
    return THREE.MathUtils.smoothstep(wave, 0.56, 0.78) * 0.72;
  }
  if (dna.pattern === "belly") {
    const frontness = THREE.MathUtils.smoothstep(-nz, 0.35, 0.92);
    const vertical =
      1 - THREE.MathUtils.smoothstep(Math.abs(ny + 0.15), 0.28, 0.86);
    const horizontal = 1 - THREE.MathUtils.smoothstep(Math.abs(nx), 0.38, 0.82);
    return frontness * vertical * horizontal * 0.78;
  }
  const scales =
    0.5 + 0.5 * Math.sin((nx + nz) * 11.5) * Math.sin((ny - nz * 0.72) * 10.5);
  return 0.1 + THREE.MathUtils.smoothstep(scales, 0.56, 0.8) * 0.38;
}

function buildSmoothGeometry(
  dna: MonsterDna,
  profile: BodyProfile,
  bodyColor: string,
  accentColor: string,
  geometryQuality: "hero" | "remote",
) {
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

  addSmoothBall(field, cx, cy, cz, 1.18, 7.5);
  addSmoothBall(field, cx - sx * 0.4, cy, cz, 0.7, 8.5);
  addSmoothBall(field, cx + sx * 0.4, cy, cz, 0.7, 8.5);
  addSmoothBall(field, cx, cy - sy * 0.24, cz, 0.58, 8.8);
  addSmoothBall(field, cx, cy + sy * 0.38, cz, 0.72, 8.5);
  addSmoothBall(field, cx, cy, cz - sz * 0.42, 0.82, 8.2);
  addSmoothBall(field, cx, cy, cz + sz * 0.42, 0.82, 8.2);

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
    const legStrength =
      (dna.legShape === "stubby"
        ? 0.3
        : dna.legShape === "paws"
          ? 0.33
          : dna.legShape === "clawed"
            ? 0.23
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
      addSmoothBall(
        field,
        THREE.MathUtils.lerp(x, footX, progress),
        THREE.MathUtils.lerp(hipY, legFootY, progress),
        z - Math.sin(progress * Math.PI) * kneePush,
        legStrength * (1 - progress * 0.16),
        10.8,
      );
    }
    addSmoothBall(
      field,
      footX,
      legFootY,
      z - (dna.legShape === "clawed" ? 0.18 * footReachScale : 0),
      (dna.legShape === "hoof"
        ? 0.21
        : dna.legShape === "flippers"
          ? 0.34
          : dna.legShape === "paws"
            ? 0.36
            : dna.legShape === "stilt"
              ? 0.16
              : 0.25) * legDensityScale,
      10.8,
    );

    if (dna.legShape === "hoof") {
      for (const side of [-1, 1]) {
        addSmoothBall(
          field,
          footX + side * 0.16 * legDensityScale,
          legFootY - 0.01,
          z - 0.19 * footReachScale,
          0.21 * legDensityScale,
          11.2,
        );
        if (geometryQuality === "hero") {
          addSmoothBall(
            field,
            footX + side * 0.17 * legDensityScale,
            legFootY - 0.02,
            z - 0.34 * footReachScale,
            0.16 * legDensityScale,
            11.4,
          );
        }
      }
    } else if (dna.legShape === "springy") {
      addSmoothBall(
        field,
        footX,
        legFootY + 0.15,
        z + 0.25 * footReachScale,
        0.23 * legDensityScale,
        10.9,
      );
      addSmoothBall(
        field,
        footX,
        legFootY - 0.02,
        z - 0.38 * footReachScale,
        0.22 * legDensityScale,
        10.9,
      );
      if (geometryQuality === "hero") {
        addSmoothBall(
          field,
          footX,
          legFootY - 0.025,
          z - 0.55 * footReachScale,
          0.15 * legDensityScale,
          11.2,
        );
      }
    } else if (dna.legShape === "clawed") {
      for (const toe of [-1, 0, 1]) {
        const toeX = footX + toe * 0.18 * legDensityScale;
        addSmoothBall(
          field,
          toeX,
          legFootY - 0.01,
          z - 0.34 * footReachScale,
          0.17 * legDensityScale,
          11.4,
        );
        if (geometryQuality === "hero") {
          addSmoothBall(
            field,
            toeX,
            legFootY - 0.025,
            z - 0.55 * footReachScale,
            0.13 * legDensityScale,
            11.5,
          );
        }
      }
    } else if (dna.legShape === "paws") {
      for (const toe of [-1, 0, 1]) {
        addSmoothBall(
          field,
          footX + toe * 0.16 * legDensityScale,
          legFootY - 0.015,
          z - 0.36 * footReachScale,
          0.18 * legDensityScale,
          11.2,
        );
      }
    } else if (dna.legShape === "stilt") {
      addSmoothBall(
        field,
        footX,
        legFootY - 0.015,
        z - 0.22 * footReachScale,
        0.14 * legDensityScale,
        11.2,
      );
    } else if (dna.legShape === "flippers") {
      const flipperReach = dna.legs >= 6 ? 0.18 : 0.32;
      addSmoothBall(
        field,
        footX,
        legFootY,
        z - flipperReach,
        0.34 * legDensityScale,
        10.4,
      );
      for (const side of [-1, 1]) {
        addSmoothBall(
          field,
          footX + side * 0.2 * legDensityScale,
          legFootY - 0.01,
          z - flipperReach * 1.25,
          0.25 * legDensityScale,
          10.7,
        );
      }
      if (geometryQuality === "hero") {
        addSmoothBall(
          field,
          footX,
          legFootY - 0.02,
          z - flipperReach * 1.75,
          0.24 * legDensityScale,
          10.6,
        );
      }
    }
    return { x, y: hipY, z, index };
  });

  const legRows = [...new Set(legHips.map((hip) => hip.z))].sort(
    (first, second) => first - second,
  );

  const [tailY, tailZ] = profile.tail;
  if (dna.tail !== "none") {
    // Only the buried socket belongs to the main field. The visible tail is
    // generated in a compact local field and merged into this same mesh,
    // avoiding both a giant mobile voxel volume and clipped tail tips.
    addSmoothBall(field, 0, tailY, Math.min(tailZ - 0.18, 1.58), 0.42, 9.5);
  }

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
  field.update();
  const sourcePosition = field.geometry.getAttribute("position");
  const sourceVertexCount = field.geometry.drawRange.count;
  const tailPositions = buildSmoothTailPositions(dna, profile);
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
  const geometry = mergeVertices(rawGeometry, 0.0001);
  rawGeometry.dispose();
  relaxSmoothGeometry(geometry);

  const relaxedPosition = geometry.getAttribute("position");
  const vertexCount = relaxedPosition.count;
  const colors = new Float32Array(vertexCount * 3);
  const skinIndices = new Uint16Array(vertexCount * 4);
  const skinWeights = new Float32Array(vertexCount * 4);
  const primary = new THREE.Color(bodyColor);
  const accent = new THREE.Color(accentColor);
  const mixed = new THREE.Color();
  let minimumWorldY = Number.POSITIVE_INFINITY;

  for (let index = 0; index < vertexCount; index += 1) {
    const px = relaxedPosition.getX(index);
    const py = relaxedPosition.getY(index);
    const pz = relaxedPosition.getZ(index);

    const localX = px * SMOOTH_FIELD_SCALE;
    const localY = py * SMOOTH_FIELD_SCALE + SMOOTH_FIELD_ORIGIN_Y;
    const localZ = pz * SMOOTH_FIELD_SCALE;
    minimumWorldY = Math.min(minimumWorldY, localY);
    mixed
      .copy(primary)
      .lerp(accent, smoothPatternMix(dna, profile, localX, localY, localZ));
    if (dna.legs > 0) {
      const footAccent =
        (1 -
          THREE.MathUtils.smoothstep(localY, legFootY + 0.05, legFootY + 0.3)) *
        0.7;
      mixed.lerp(accent, footAccent);
    }
    colors[index * 3] = mixed.r;
    colors[index * 3 + 1] = mixed.g;
    colors[index * 3 + 2] = mixed.b;

    const isTailVertex =
      dna.tail !== "none" &&
      localZ > tailZ - 0.14 &&
      Math.abs(localX) <
        (dna.tail === "curly" ? 0.82 : dna.tail === "forked" ? 0.72 : 0.52);
    if (isTailVertex) {
      const tailInfluence = THREE.MathUtils.clamp(
        (localZ - tailZ + 0.16) / 0.86,
        0.16,
        0.9,
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
      const influence = THREE.MathUtils.clamp(reach / 0.72, 0.08, 0.92);
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
    if (nearestLeg >= 0 && nearestDistance < 0.56) {
      const hipY = legHips[nearestLeg].y;
      const influence = THREE.MathUtils.clamp(
        1 - THREE.MathUtils.smoothstep(localY, 0.1, hipY + 0.06),
        0,
        0.94,
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

  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute(
    "skinIndex",
    new THREE.Uint16BufferAttribute(skinIndices, 4),
  );
  geometry.setAttribute(
    "skinWeight",
    new THREE.Float32BufferAttribute(skinWeights, 4),
  );
  geometry.userData.minimumWorldY = minimumWorldY;
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
  const profile = BODY_PROFILES[dna.body];
  const primary = getMonsterColor(dna.color);
  const accent = getAccentColor(dna.accent);
  const geometry = buildSmoothGeometry(
    dna,
    profile,
    primary.hex,
    accent.hex,
    geometryQuality,
  );
  const cachedMinimumY = geometry.userData.minimumWorldY;
  return {
    vertices: geometry.getAttribute("position").count,
    minimumY: typeof cachedMinimumY === "number" ? cachedMinimumY : 0,
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
  const geometry = buildSmoothGeometry(
    dna,
    profile,
    bodyColor,
    accentColor,
    geometryQuality,
  );
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.64,
    metalness: 0.02,
    side: THREE.DoubleSide,
  });
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
    const [tailY, tailZ] = profile.tail;
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
  // legPositions is row-major: even indices are one side, odd indices the
  // other. Keeping every leg on a side in phase prevents adjacent rows from
  // crossing and visually closing their guaranteed openings.
  return index % 2 === 0 ? 1 : -1;
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
      const breath = Math.sin(time * 1.9) * 0.008;
      const movementCompression = Math.abs(stride) * intensity * 0.025;
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
  const surfaceColorAt = (x: number, y: number, z: number) =>
    new THREE.Color(primary.hex)
      .lerp(
        new THREE.Color(accent.hex),
        smoothPatternMix(dna, profile, x, y, z),
      )
      .getStyle();
  const faceSocketColor = surfaceColorAt(
    0,
    profile.face[0],
    profile.face[1] + 0.18,
  );
  const adaptationSocketColor = surfaceColorAt(
    profile.scale[0] * 0.72,
    profile.center[1],
    profile.center[2],
  );
  const hornSocketColor = surfaceColorAt(0, profile.horn[0], profile.horn[1]);
  const earSocketColor = surfaceColorAt(
    profile.scale[0] * 0.68,
    profile.face[0] + 0.2,
    profile.face[1] + 0.3,
  );

  return (
    <group scale={sizeScale}>
      <group position={[0, groundOffset, 0]} scale={buildScale}>
        <SmoothMonsterCore
          key={`${geometryQuality}:${JSON.stringify(dna)}`}
          dna={dna}
          profile={profile}
          bodyColor={primary.hex}
          accentColor={accent.hex}
          castShadow={castShadow}
          motionRef={motionRef}
          geometryQuality={geometryQuality}
        />
        <group position={[0, 0, -0.2]}>
          <Face
            dna={dna}
            profile={profile}
            accent={accent.hex}
            bodyColor={faceSocketColor}
          />
        </group>
        <Horns
          shape={dna.horns}
          profile={profile}
          accent={accent.hex}
          bodyColor={hornSocketColor}
          castShadow={castShadow}
          surfaceInset={0.3}
        />
        <Ears
          shape={dna.ears}
          profile={profile}
          accent={accent.hex}
          bodyColor={earSocketColor}
          castShadow={castShadow}
        />
        <Adaptation
          type={dna.adaptation}
          profile={profile}
          accent={accent.hex}
          castShadow={castShadow}
          wingRefs={wingRefs}
          surfaceInset={0.12}
          bodyColor={adaptationSocketColor}
        />
        <RespirationDetails
          breathing={dna.breathing}
          profile={profile}
          grooveColor={primary.dark}
          surfaceInset={0.08}
        />
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
