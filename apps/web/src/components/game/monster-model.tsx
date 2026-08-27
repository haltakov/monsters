import { useEffect, useRef, useState, type RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { MarchingCubes } from "three/addons/objects/MarchingCubes.js";
import { mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";
import {
  getAccentColor,
  getMonsterColor,
  getMonsterSizeScale,
  type MonsterDna,
} from "@/components/game/monster-dna";

type MonsterVisualProps = {
  dna: MonsterDna;
  legRefs?: Array<RefObject<THREE.Group | null>>;
  wingRefs?: Array<RefObject<THREE.Mesh | null>>;
  motionRef?: RefObject<MonsterMotionState>;
  castShadow?: boolean;
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
  };
  return layouts[count];
}

function legPositions(count: MonsterDna["legs"], profile: BodyProfile) {
  if (count === 0) return [];
  const rowCount = count / 2;
  const densityMultiplier = count === 8 ? 1.65 : count === 6 ? 1.25 : 1;
  const isDenseBiped = profile === BODY_PROFILES.biped && count >= 6;
  const denseBipedSpan = isDenseBiped
    ? profile.scale[2] * (count === 8 ? 1.45 : 1.25)
    : 0;
  const legSpan = Math.min(
    Math.max(profile.legSpan * densityMultiplier, denseBipedSpan),
    profile.scale[2] * (isDenseBiped ? 1.6 : 1.05),
  );
  const rows = Array.from({ length: rowCount }, (_, index) =>
    rowCount === 1
      ? 0
      : -legSpan / 2 + (index / (rowCount - 1)) * legSpan,
  );
  return rows.flatMap((z) => [
    [-profile.legX, profile.legY, z] as [number, number, number],
    [profile.legX, profile.legY, z] as [number, number, number],
  ]);
}

function BodyCore({
  dna,
  profile,
  bodyColor,
  darkColor,
  accent,
  castShadow,
}: {
  dna: MonsterDna;
  profile: BodyProfile;
  bodyColor: string;
  darkColor: string;
  accent: string;
  castShadow: boolean;
}) {
  return (
    <group>
      <mesh
        position={profile.center}
        scale={profile.scale}
        castShadow={castShadow}
      >
        <sphereGeometry args={[0.92, 32, 24]} />
        <meshStandardMaterial color={bodyColor} roughness={0.72} />
      </mesh>

      {dna.body === "pig" && (
        <group>
          <mesh position={[0, 1.28, -1.02]} scale={[0.74, 0.65, 0.72]}>
            <sphereGeometry args={[0.78, 26, 18]} />
            <meshStandardMaterial color={bodyColor} roughness={0.76} />
          </mesh>
          {[-0.48, 0.48].map((x) => (
            <mesh
              key={x}
              position={[x, 1.84, -1.04]}
              rotation={[0.12, 0, x < 0 ? -0.45 : 0.45]}
              scale={[0.7, 1, 0.34]}
            >
              <coneGeometry args={[0.25, 0.55, 18]} />
              <meshStandardMaterial color={darkColor} roughness={0.8} />
            </mesh>
          ))}
        </group>
      )}

      {dna.body === "biped" && (
        <group>
          <mesh position={[0, 2.3, -0.05]} scale={[0.72, 0.72, 0.68]}>
            <sphereGeometry args={[0.82, 28, 20]} />
            <meshStandardMaterial color={bodyColor} roughness={0.72} />
          </mesh>
          {[-0.78, 0.78].map((x) => (
            <mesh
              key={x}
              position={[x, 1.45, 0]}
              rotation={[0, 0, x < 0 ? -0.26 : 0.26]}
              castShadow={castShadow}
            >
              <capsuleGeometry args={[0.14, 0.74, 7, 12]} />
              <meshStandardMaterial color={darkColor} roughness={0.78} />
            </mesh>
          ))}
        </group>
      )}

      {(dna.body === "saurian" || dna.body === "rhino") && (
        <group>
          <mesh
            position={[0, dna.body === "saurian" ? 1.46 : 1.28, -1.12]}
            scale={
              dna.body === "saurian" ? [0.68, 0.62, 0.9] : [0.78, 0.62, 0.88]
            }
          >
            <sphereGeometry args={[0.8, 26, 18]} />
            <meshStandardMaterial color={bodyColor} roughness={0.78} />
          </mesh>
          {dna.body === "saurian" && (
            <mesh position={[0, 1.38, -1.65]} scale={[0.66, 0.38, 0.72]}>
              <sphereGeometry args={[0.65, 24, 16]} />
              <meshStandardMaterial color={darkColor} roughness={0.8} />
            </mesh>
          )}
          {dna.body === "rhino" &&
            [-0.5, 0.5].map((x) => (
              <mesh key={x} position={[x, 1.68, -1.11]} scale={[0.72, 1, 0.35]}>
                <coneGeometry args={[0.2, 0.46, 16]} />
                <meshStandardMaterial color={darkColor} roughness={0.82} />
              </mesh>
            ))}
        </group>
      )}

      {dna.body === "aquatic" && (
        <group>
          {[-1, 1].map((side) => (
            <mesh
              key={side}
              position={[side * 0.67, 1.18, -0.42]}
              rotation={[0, side * 0.12, side * 0.28]}
              scale={[0.06, 0.42, 0.5]}
            >
              <sphereGeometry args={[1, 16, 12]} />
              <meshStandardMaterial color={accent} roughness={0.7} />
            </mesh>
          ))}
        </group>
      )}
    </group>
  );
}

function Leg({
  shape,
  bodyColor,
  accentColor,
  castShadow,
}: {
  shape: MonsterDna["legShape"];
  bodyColor: string;
  accentColor: string;
  castShadow: boolean;
}) {
  if (shape === "flippers") {
    return (
      <mesh
        position={[0, -0.28, -0.13]}
        rotation={[0.2, 0, 0]}
        scale={[0.58, 0.14, 0.86]}
        castShadow={castShadow}
      >
        <sphereGeometry args={[0.55, 18, 12]} />
        <meshStandardMaterial color={accentColor} roughness={0.7} />
      </mesh>
    );
  }

  if (shape === "hoof") {
    return (
      <>
        <mesh position={[0, -0.25, 0]} castShadow={castShadow}>
          <capsuleGeometry args={[0.14, 0.6, 8, 14]} />
          <meshStandardMaterial color={bodyColor} roughness={0.8} />
        </mesh>
        <mesh position={[0, -0.58, -0.08]} scale={[0.34, 0.19, 0.42]}>
          <boxGeometry args={[1, 1, 1]} />
          <meshStandardMaterial color={accentColor} roughness={0.9} />
        </mesh>
      </>
    );
  }

  if (shape === "springy") {
    return (
      <>
        <mesh position={[0, -0.28, 0]} castShadow={castShadow}>
          <capsuleGeometry args={[0.115, 0.6, 8, 14]} />
          <meshStandardMaterial color={bodyColor} roughness={0.76} />
        </mesh>
        <mesh position={[0, -0.53, -0.1]} scale={[1.2, 0.58, 1.55]}>
          <sphereGeometry args={[0.19, 18, 12]} />
          <meshStandardMaterial color={accentColor} roughness={0.75} />
        </mesh>
      </>
    );
  }

  if (shape === "clawed") {
    return (
      <>
        <mesh position={[0, -0.24, 0]} castShadow={castShadow}>
          <capsuleGeometry args={[0.15, 0.56, 8, 14]} />
          <meshStandardMaterial color={bodyColor} roughness={0.8} />
        </mesh>
        <mesh position={[0, -0.53, -0.13]} scale={[0.42, 0.18, 0.5]}>
          <sphereGeometry args={[1, 16, 12]} />
          <meshStandardMaterial color={accentColor} roughness={0.76} />
        </mesh>
        {[-0.18, 0, 0.18].map((x) => (
          <mesh
            key={x}
            position={[x, -0.54, -0.55]}
            rotation={[-Math.PI / 2, 0, 0]}
          >
            <coneGeometry args={[0.045, 0.2, 9]} />
            <meshStandardMaterial color="#FFF8E8" roughness={0.6} />
          </mesh>
        ))}
      </>
    );
  }

  return (
    <>
      <mesh position={[0, -0.25, 0]} castShadow={castShadow}>
        <capsuleGeometry args={[0.17, 0.42, 8, 14]} />
        <meshStandardMaterial color={bodyColor} roughness={0.78} />
      </mesh>
      <mesh position={[0, -0.52, -0.09]} scale={[1.3, 0.65, 1.5]}>
        <sphereGeometry args={[0.22, 20, 14]} />
        <meshStandardMaterial color={accentColor} roughness={0.72} />
      </mesh>
    </>
  );
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
}: {
  dna: MonsterDna;
  profile: BodyProfile;
  accent: string;
}) {
  return (
    <group
      position={[0, profile.face[0], profile.face[1]]}
      scale={profile.faceScale}
    >
      {eyeOffsets(dna.eyes).map(([x, y], index) => {
        const eyeScale = dna.eyes >= 6 ? 0.78 : 1;
        return (
          <group
            key={`${x}-${y}-${index}`}
            position={[x, y, 0]}
            scale={eyeScale}
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
      <Mouth shape={dna.mouth} accent={accent} />
    </group>
  );
}

function PatternMarks({
  dna,
  profile,
  accent,
}: {
  dna: MonsterDna;
  profile: BodyProfile;
  accent: string;
}) {
  if (dna.pattern === "plain") return null;
  const [cx, cy, cz] = profile.center;
  const [sx, sy, sz] = profile.scale;
  const front = cz - sz * 0.86;

  if (dna.pattern === "spots" || dna.pattern === "patches") {
    const marks = dna.pattern === "spots" ? 7 : 4;
    return (
      <group>
        {Array.from({ length: marks }, (_, index) => {
          const column = (index % 3) - 1;
          const row = Math.floor(index / 3);
          const size =
            dna.pattern === "patches"
              ? 0.22 + (index % 2) * 0.08
              : 0.12 + (index % 3) * 0.035;
          return (
            <mesh
              key={index}
              position={[
                cx + column * sx * 0.45,
                cy + (row - 0.5) * sy * 0.42,
                front - index * 0.002,
              ]}
              scale={[
                size * (dna.pattern === "patches" ? 1.35 : 1),
                size,
                0.045,
              ]}
            >
              <sphereGeometry args={[1, 16, 12]} />
              <meshStandardMaterial color={accent} roughness={0.82} />
            </mesh>
          );
        })}
      </group>
    );
  }

  if (dna.pattern === "stripes") {
    return (
      <group>
        {[-0.34, 0, 0.34].map((offset, index) => (
          <mesh
            key={offset}
            position={[cx, cy + offset * sy, cz]}
            rotation={[Math.PI / 2, 0, 0]}
            scale={[
              sx * (index === 1 ? 1 : 0.93),
              sz * (index === 1 ? 1 : 0.93),
              1,
            ]}
          >
            <torusGeometry args={[0.88, 0.05, 10, 32]} />
            <meshStandardMaterial color={accent} roughness={0.82} />
          </mesh>
        ))}
      </group>
    );
  }

  return (
    <group>
      {Array.from({ length: 8 }, (_, index) => (
        <mesh
          key={index}
          position={[
            cx + ((index % 4) - 1.5) * 0.26 * sx,
            cy + (Math.floor(index / 4) - 0.45) * 0.38 * sy,
            front,
          ]}
          rotation={[Math.PI / 2, 0, 0]}
          scale={[1, 0.55, 1]}
        >
          <coneGeometry args={[0.11, 0.08, 6]} />
          <meshStandardMaterial color={accent} roughness={0.72} />
        </mesh>
      ))}
    </group>
  );
}

function Horns({
  shape,
  profile,
  accent,
  castShadow,
  surfaceInset = 0,
}: {
  shape: MonsterDna["horns"];
  profile: BodyProfile;
  accent: string;
  castShadow: boolean;
  surfaceInset?: number;
}) {
  if (shape === "none") return null;
  const [y, z, spread] = profile.horn;

  if (shape === "rhino") {
    return (
      <mesh
        position={[0, y - 0.05, z - 0.28 + surfaceInset * 0.7]}
        rotation={[-Math.PI / 2, 0, 0]}
      >
        <coneGeometry args={[0.16, 0.68, 18]} />
        <meshStandardMaterial color={accent} roughness={0.7} />
      </mesh>
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

  return (
    <group>
      {[-spread, spread].map((x) => (
        <mesh
          key={x}
          position={[x, y + 0.08 - surfaceInset, z]}
          rotation={[0, 0, x < 0 ? -0.34 : 0.34]}
          castShadow={castShadow}
        >
          <coneGeometry args={[0.19, 0.62, 18]} />
          <meshStandardMaterial color={accent} roughness={0.72} />
        </mesh>
      ))}
    </group>
  );
}

function Tail({
  shape,
  profile,
  bodyColor,
  accent,
  castShadow,
}: {
  shape: MonsterDna["tail"];
  profile: BodyProfile;
  bodyColor: string;
  accent: string;
  castShadow: boolean;
}) {
  if (shape === "none") return null;
  const [y, z] = profile.tail;

  if (shape === "curly") {
    return (
      <mesh
        position={[0, y, z + 0.22]}
        rotation={[0, 0, 0.16]}
        castShadow={castShadow}
      >
        <torusGeometry args={[0.3, 0.075, 10, 26, Math.PI * 1.72]} />
        <meshStandardMaterial color={accent} roughness={0.76} />
      </mesh>
    );
  }

  if (shape === "club") {
    return (
      <group position={[0, y, z]} rotation={[Math.PI / 2, 0, 0]}>
        <mesh position={[0, 0.42, 0]}>
          <capsuleGeometry args={[0.1, 0.72, 7, 12]} />
          <meshStandardMaterial color={bodyColor} roughness={0.8} />
        </mesh>
        <mesh position={[0, 0.88, 0]} scale={[0.46, 0.62, 0.46]}>
          <sphereGeometry args={[0.48, 18, 14]} />
          <meshStandardMaterial color={accent} roughness={0.82} />
        </mesh>
      </group>
    );
  }

  if (shape === "fin") {
    return (
      <group position={[0, y, z + 0.28]}>
        <mesh rotation={[Math.PI / 2, 0, 0]} scale={[1, 0.32, 1]}>
          <coneGeometry args={[0.58, 0.95, 3]} />
          <meshStandardMaterial
            color={accent}
            roughness={0.68}
            side={THREE.DoubleSide}
          />
        </mesh>
      </group>
    );
  }

  return (
    <group position={[0, y, z]} rotation={[-0.75, 0, 0]}>
      <mesh castShadow={castShadow}>
        <coneGeometry args={[0.2, 1.08, 18]} />
        <meshStandardMaterial color={bodyColor} roughness={0.8} />
      </mesh>
      <mesh position={[0, 0.5, 0]} scale={[0.7, 0.55, 0.7]}>
        <sphereGeometry args={[0.28, 16, 12]} />
        <meshStandardMaterial color={accent} roughness={0.76} />
      </mesh>
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
}: {
  type: MonsterDna["adaptation"];
  profile: BodyProfile;
  accent: string;
  castShadow: boolean;
  wingRefs?: Array<RefObject<THREE.Mesh | null>>;
  surfaceInset?: number;
}) {
  if (type === "none") return null;
  const [cx, cy, cz] = profile.center;
  const [sx, sy, sz] = profile.scale;

  if (type === "fins") {
    return (
      <group>
        {[-1, 1].map((side) => (
          <mesh
            key={side}
            position={[
              cx + side * Math.max(sx * 0.68, sx * 0.92 - surfaceInset),
              cy,
              cz - 0.05,
            ]}
            rotation={[0, 0, side * -0.9]}
            scale={[0.9, 0.22, 0.62]}
          >
            <coneGeometry args={[0.4, 0.9, 3]} />
            <meshStandardMaterial
              color={accent}
              roughness={0.68}
              side={THREE.DoubleSide}
            />
          </mesh>
        ))}
      </group>
    );
  }

  if (type === "wings") {
    return (
      <group>
        {[-1, 1].map((side, index) => (
          <mesh
            key={side}
            ref={wingRefs?.[index]}
            position={[
              cx + side * Math.max(sx * 0.68, sx * 0.92 - surfaceInset),
              cy + sy * 0.25,
              cz + 0.15,
            ]}
            rotation={[0.15, side * 0.18, side * -0.38]}
            scale={[0.85, 0.16, 0.72]}
            castShadow={castShadow}
          >
            <sphereGeometry args={[0.72, 18, 12]} />
            <meshStandardMaterial color={accent} roughness={0.72} />
          </mesh>
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
            rotation={[
              0.04,
              side * 0.12,
              side * (-0.18 - depthOffset * 0.22),
            ]}
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
const smoothGeometryCache = new Map<string, THREE.BufferGeometry>();

type SmoothRig = {
  mesh: THREE.SkinnedMesh;
  legBones: THREE.Bone[];
  tailBone?: THREE.Bone;
  material: THREE.MeshStandardMaterial;
};

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
    THREE.MathUtils.lerp(second, first, blend) -
    smoothing * blend * (1 - blend)
  );
}

function smoothScalarMax(first: number, second: number, smoothing: number) {
  return -smoothScalarMin(-first, -second, smoothing);
}

function closeSmoothFieldBoundary(field: MarchingCubes) {
  const size = field.size;
  const cellSize = (SMOOTH_FIELD_SCALE * 2) / size;
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
          (y / size - 0.5) * SMOOTH_FIELD_SCALE * 2 +
          SMOOTH_FIELD_ORIGIN_Y;
        const distanceRoof = worldY - roofY;
        const voidDistance = smoothScalarMax(
          smoothScalarMax(distanceNarrow, distanceRoof, csgSmoothing),
          distanceAcross,
          csgSmoothing,
        );
        const limiter =
          field.isolation + (24 / fieldCellSize) * voidDistance;
        const fieldIndex = z * field.size2 + y * size + x;
        let nextValue = smoothScalarMin(
          field.field[fieldIndex],
          limiter,
          8,
        );
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

function smoothPatternMix(dna: MonsterDna, x: number, y: number, z: number) {
  if (dna.pattern === "plain") return 0;
  if (dna.pattern === "stripes") {
    return Math.sin((z + y * 0.34) * 8.5) > 0.25 ? 0.72 : 0;
  }
  if (dna.pattern === "spots") {
    const spots = Math.sin(x * 8.1 + z * 2.3) * Math.cos(y * 7.4 - z * 3.1);
    return spots > 0.48 ? 0.82 : 0;
  }
  if (dna.pattern === "patches") {
    const patches = Math.sin(x * 3.2 + y * 2.1) + Math.cos(z * 3.7 - y);
    return patches > 0.75 ? 0.68 : 0;
  }
  const scales = Math.sin((x + z) * 11) * Math.sin((y - z) * 10);
  return scales > 0.28 ? 0.48 : 0.08;
}

function buildSmoothGeometry(
  dna: MonsterDna,
  profile: BodyProfile,
  bodyColor: string,
  accentColor: string,
) {
  const cacheKey = `smooth-csg-arch-v5:${JSON.stringify(dna)}`;
  const cached = smoothGeometryCache.get(cacheKey);
  if (cached) return cached;

  const temporaryMaterial = new THREE.MeshStandardMaterial();
  const fieldResolution =
    dna.legs === 8 ? 88 : dna.legs === 6 ? 76 : dna.legs >= 2 ? 64 : 56;
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

  const legFootY = dna.legShape === "springy" ? 0.08 : 0.14;
  const legHips = legPositions(dna.legs, profile).map(([x, , z], index) => {
    const hipY = cy - sy * 0.52;
    const outward = dna.legShape === "springy" ? (x < 0 ? -0.16 : 0.16) : 0;
    const footX = x + outward;
    const legDensityScale = dna.legs === 8 ? 0.72 : dna.legs === 6 ? 0.84 : 1;
    const legStrength =
      (dna.legShape === "stubby" ? 0.3 : 0.24) * legDensityScale;
    const kneePush =
      dna.legShape === "springy"
        ? 0.22
        : dna.legShape === "clawed"
          ? 0.11
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
      z - (dna.legShape === "clawed" ? 0.12 : 0),
      (dna.legShape === "hoof" || dna.legShape === "flippers" ? 0.34 : 0.25) *
        legDensityScale,
      10.8,
    );
    if (dna.legShape === "flippers") {
      const flipperReach = dna.legs >= 6 ? 0.18 : 0.32;
      addSmoothBall(
        field,
        footX,
        legFootY,
        z - flipperReach,
        0.34 * legDensityScale,
        10.4,
      );
    }
    return { x, y: hipY, z, index };
  });

  const legRows = [...new Set(legHips.map((hip) => hip.z))].sort(
    (first, second) => first - second,
  );

  const [tailY, tailZ] = profile.tail;
  if (dna.tail !== "none") {
    const curve = dna.tail === "curly" ? 0.42 : 0;
    addSmoothBall(field, 0, tailY, tailZ - 0.2, 0.42, 9.5);
    addSmoothBall(field, curve * 0.45, tailY + 0.08, tailZ + 0.22, 0.34, 10);
    addSmoothBall(
      field,
      curve,
      tailY + (dna.tail === "tuft" ? 0.22 : 0),
      tailZ + 0.65,
      dna.tail === "club" ? 0.52 : dna.tail === "fin" ? 0.4 : 0.32,
      10,
    );
    if (dna.tail === "fin") {
      addSmoothBall(field, 0, tailY + 0.34, tailZ + 0.72, 0.3, 10.5);
      addSmoothBall(field, 0, tailY - 0.26, tailZ + 0.72, 0.3, 10.5);
    }
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
      const gapRadiusZ = Math.max(
        (secondRow - firstRow) * 0.32,
        fieldCellSize * 2.5,
      );
      // Cut one continuous tunnel across the whole body width. Two localized
      // side cuts leave a central belly web that projects into the opening
      // from a side camera and still reads as connected legs.
      carveSmoothArch(
        field,
        [0, gapZ],
        [
          SMOOTH_FIELD_SCALE * 1.05,
          gapRadiusZ,
        ],
        archBaseY,
        archTopY,
        "z",
      );
    }
  }
  field.update();
  const sourcePosition = field.geometry.getAttribute("position");
  const sourceVertexCount = field.geometry.drawRange.count;
  const positions = new Float32Array(sourceVertexCount * 3);

  for (let index = 0; index < sourceVertexCount; index += 1) {
    positions[index * 3] = sourcePosition.getX(index);
    positions[index * 3 + 1] = sourcePosition.getY(index);
    positions[index * 3 + 2] = sourcePosition.getZ(index);
  }

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

  for (let index = 0; index < vertexCount; index += 1) {
    const px = relaxedPosition.getX(index);
    const py = relaxedPosition.getY(index);
    const pz = relaxedPosition.getZ(index);

    const localX = px * SMOOTH_FIELD_SCALE;
    const localY = py * SMOOTH_FIELD_SCALE + SMOOTH_FIELD_ORIGIN_Y;
    const localZ = pz * SMOOTH_FIELD_SCALE;
    mixed
      .copy(primary)
      .lerp(accent, smoothPatternMix(dna, localX, localY, localZ));
    colors[index * 3] = mixed.r;
    colors[index * 3 + 1] = mixed.g;
    colors[index * 3 + 2] = mixed.b;

    const isTailVertex =
      dna.tail !== "none" &&
      localZ > tailZ - 0.06 &&
      Math.abs(localX) < (dna.tail === "curly" ? 0.82 : 0.52);
    if (isTailVertex) {
      const tailInfluence = THREE.MathUtils.clamp(
        (localZ - tailZ + 0.1) / 0.8,
        0.16,
        0.9,
      );
      skinIndices[index * 4] = legHips.length + 1;
      skinIndices[index * 4 + 1] = 0;
      skinWeights[index * 4] = tailInfluence;
      skinWeights[index * 4 + 1] = 1 - tailInfluence;
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
  geometry.computeBoundingSphere();
  temporaryMaterial.dispose();
  smoothGeometryCache.set(cacheKey, geometry);
  return geometry;
}

function createSmoothRig(
  dna: MonsterDna,
  profile: BodyProfile,
  bodyColor: string,
  accentColor: string,
  castShadow: boolean,
): SmoothRig {
  const geometry = buildSmoothGeometry(dna, profile, bodyColor, accentColor);
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
      ...(tailBone ? [tailBone] : []),
    ]),
  );
  return { mesh, legBones, tailBone, material };
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
}: {
  dna: MonsterDna;
  profile: BodyProfile;
  bodyColor: string;
  accentColor: string;
  castShadow: boolean;
  motionRef?: RefObject<MonsterMotionState>;
}) {
  const [rig] = useState(() =>
    createSmoothRig(dna, profile, bodyColor, accentColor, castShadow),
  );
  const meshRef = useRef<THREE.SkinnedMesh>(null);
  const legBonesRef = useRef<THREE.Bone[]>([]);
  const tailBoneRef = useRef<THREE.Bone>(null);

  useEffect(() => {
    legBonesRef.current = rig.legBones;
    tailBoneRef.current = rig.tailBone ?? null;
    return () => rig.material.dispose();
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
}: MonsterVisualProps & { castShadow: boolean }) {
  const primary = getMonsterColor(dna.color);
  const accent = getAccentColor(dna.accent);
  const profile = BODY_PROFILES[dna.body];
  const sizeScale = getMonsterSizeScale(dna.size);

  return (
    <group scale={sizeScale}>
      <SmoothMonsterCore
        key={JSON.stringify(dna)}
        dna={dna}
        profile={profile}
        bodyColor={primary.hex}
        accentColor={accent.hex}
        castShadow={castShadow}
        motionRef={motionRef}
      />
      <group position={[0, 0, -0.2]}>
        <Face dna={dna} profile={profile} accent={accent.hex} />
      </group>
      <Horns
        shape={dna.horns}
        profile={profile}
        accent={accent.hex}
        castShadow={castShadow}
        surfaceInset={0.12}
      />
      <Adaptation
        type={dna.adaptation}
        profile={profile}
        accent={accent.hex}
        castShadow={castShadow}
        wingRefs={wingRefs}
        surfaceInset={0.12}
      />
      <RespirationDetails
        breathing={dna.breathing}
        profile={profile}
        grooveColor={primary.dark}
        surfaceInset={0.08}
      />
    </group>
  );
}

export function MonsterVisual({
  dna,
  legRefs,
  wingRefs,
  motionRef,
  castShadow = true,
}: MonsterVisualProps) {
  if (dna.mesh === "smooth") {
    return (
      <SmoothMonsterVisual
        dna={dna}
        wingRefs={wingRefs}
        motionRef={motionRef}
        castShadow={castShadow}
      />
    );
  }
  const primary = getMonsterColor(dna.color);
  const accent = getAccentColor(dna.accent);
  const profile = BODY_PROFILES[dna.body];
  const sizeScale = getMonsterSizeScale(dna.size);

  return (
    <group scale={sizeScale}>
      <BodyCore
        dna={dna}
        profile={profile}
        bodyColor={primary.hex}
        darkColor={primary.dark}
        accent={accent.hex}
        castShadow={castShadow}
      />
      <PatternMarks dna={dna} profile={profile} accent={accent.hex} />
      <Face dna={dna} profile={profile} accent={accent.hex} />
      <Horns
        shape={dna.horns}
        profile={profile}
        accent={accent.hex}
        castShadow={castShadow}
      />
      <Tail
        shape={dna.tail}
        profile={profile}
        bodyColor={primary.dark}
        accent={accent.hex}
        castShadow={castShadow}
      />
      <Adaptation
        type={dna.adaptation}
        profile={profile}
        accent={accent.hex}
        castShadow={castShadow}
        wingRefs={wingRefs}
      />
      <RespirationDetails
        breathing={dna.breathing}
        profile={profile}
        grooveColor={primary.dark}
      />
      {legPositions(dna.legs, profile).map((position, index) => (
        <group key={index} ref={legRefs?.[index]} position={position}>
          <Leg
            shape={dna.legShape}
            bodyColor={primary.dark}
            accentColor={accent.hex}
            castShadow={castShadow}
          />
        </group>
      ))}
    </group>
  );
}
