import type { RefObject } from "react";
import * as THREE from "three";
import {
  getAccentColor,
  getMonsterColor,
  getMonsterSizeScale,
  type MonsterDna,
} from "@/components/game/monster-dna";

type MonsterVisualProps = {
  dna: MonsterDna;
  legRefs?: Array<RefObject<THREE.Group | null>>;
  castShadow?: boolean;
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
  const rows = Array.from({ length: rowCount }, (_, index) =>
    rowCount === 1
      ? 0
      : -profile.legSpan / 2 + (index / (rowCount - 1)) * profile.legSpan,
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
}: {
  shape: MonsterDna["horns"];
  profile: BodyProfile;
  accent: string;
  castShadow: boolean;
}) {
  if (shape === "none") return null;
  const [y, z, spread] = profile.horn;

  if (shape === "rhino") {
    return (
      <mesh position={[0, y - 0.05, z - 0.28]} rotation={[-Math.PI / 2, 0, 0]}>
        <coneGeometry args={[0.16, 0.68, 18]} />
        <meshStandardMaterial color={accent} roughness={0.7} />
      </mesh>
    );
  }

  if (shape === "buds") {
    return (
      <group>
        {[-spread, spread].map((x) => (
          <mesh key={x} position={[x, y, z]} castShadow={castShadow}>
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
          <group key={side} position={[side * spread, y + 0.15, z]}>
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
          position={[x, y + 0.08, z]}
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
}: {
  type: MonsterDna["adaptation"];
  profile: BodyProfile;
  accent: string;
  castShadow: boolean;
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
            position={[cx + side * sx * 0.92, cy, cz - 0.05]}
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
        {[-1, 1].map((side) => (
          <mesh
            key={side}
            position={[cx + side * sx * 0.92, cy + sy * 0.25, cz + 0.15]}
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
        position={[cx, cy + sy * 0.22, cz + sz * 0.45]}
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
            cy + sy * 0.78,
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

export function MonsterVisual({
  dna,
  legRefs,
  castShadow = true,
}: MonsterVisualProps) {
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
