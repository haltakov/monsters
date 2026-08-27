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

const BODY_SCALES: Record<MonsterDna["body"], [number, number, number]> = {
  round: [1.05, 0.95, 1.22],
  bean: [0.88, 1.22, 1.08],
  long: [1.28, 0.82, 1.12],
};

function eyePositions(count: MonsterDna["eyes"]) {
  if (count === 1) return [[0, 1.62]];
  if (count === 2)
    return [
      [-0.38, 1.56],
      [0.38, 1.56],
    ];
  if (count === 3)
    return [
      [-0.4, 1.5],
      [0.4, 1.5],
      [0, 1.92],
    ];
  if (count === 4)
    return [
      [-0.42, 1.43],
      [0.42, 1.43],
      [-0.27, 1.84],
      [0.27, 1.84],
    ];
  return [
    [-0.47, 1.43],
    [0, 1.48],
    [0.47, 1.43],
    [-0.25, 1.86],
    [0.25, 1.86],
  ];
}

function legPositions(count: MonsterDna["legs"]) {
  const rows =
    count === 2 ? [0.28] : count === 4 ? [-0.48, 0.54] : [-0.62, 0.06, 0.7];
  return rows.flatMap((z) => [
    [-0.57, 0.58, z] as [number, number, number],
    [0.57, 0.58, z] as [number, number, number],
  ]);
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
  if (shape === "hoof") {
    return (
      <>
        <mesh position={[0, -0.25, 0]} castShadow={castShadow}>
          <capsuleGeometry args={[0.14, 0.6, 8, 14]} />
          <meshStandardMaterial color={bodyColor} roughness={0.8} />
        </mesh>
        <mesh
          position={[0, -0.58, -0.08]}
          scale={[0.34, 0.19, 0.42]}
          castShadow={castShadow}
        >
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
        <mesh
          position={[0, -0.53, -0.1]}
          scale={[1.2, 0.58, 1.55]}
          castShadow={castShadow}
        >
          <sphereGeometry args={[0.19, 18, 12]} />
          <meshStandardMaterial color={accentColor} roughness={0.75} />
        </mesh>
      </>
    );
  }

  return (
    <>
      <mesh position={[0, -0.25, 0]} castShadow={castShadow}>
        <capsuleGeometry args={[0.17, 0.42, 8, 14]} />
        <meshStandardMaterial color={bodyColor} roughness={0.78} />
      </mesh>
      <mesh
        position={[0, -0.52, -0.09]}
        scale={[1.3, 0.65, 1.5]}
        castShadow={castShadow}
      >
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
  if (shape === "fangs") {
    return (
      <group position={[0, 1.03, -1.08]}>
        <mesh scale={[1, 0.6, 0.18]}>
          <sphereGeometry args={[0.3, 22, 16]} />
          <meshStandardMaterial color="#173F35" />
        </mesh>
        {[-0.13, 0.13].map((x) => (
          <mesh key={x} position={[x, -0.11, -0.09]} rotation={[0, 0, Math.PI]}>
            <coneGeometry args={[0.055, 0.22, 12]} />
            <meshStandardMaterial color="#FFF8E8" />
          </mesh>
        ))}
      </group>
    );
  }

  if (shape === "beak") {
    return (
      <mesh position={[0, 1.02, -1.16]} rotation={[-Math.PI / 2, 0, 0]}>
        <coneGeometry args={[0.22, 0.48, 4]} />
        <meshStandardMaterial color={accent} roughness={0.72} />
      </mesh>
    );
  }

  return (
    <mesh position={[0, 1.02, -1.06]} rotation={[Math.PI / 2, 0, 0]}>
      <torusGeometry args={[0.2, 0.038, 12, 28, Math.PI]} />
      <meshStandardMaterial color="#173F35" />
    </mesh>
  );
}

function PatternMarks({
  pattern,
  accent,
  bodyScale,
}: {
  pattern: MonsterDna["pattern"];
  accent: string;
  bodyScale: [number, number, number];
}) {
  if (pattern === "spots") {
    return (
      <group>
        {[
          [-0.55, 1.1, -0.91, 0.18],
          [0.58, 1.2, -0.88, 0.14],
          [-0.48, 1.85, -0.68, 0.13],
          [0.5, 1.76, -0.72, 0.2],
          [0.03, 1.32, -1.02, 0.11],
        ].map(([x, y, z, scale], index) => (
          <mesh key={index} position={[x, y, z]} scale={[scale, scale, 0.06]}>
            <sphereGeometry args={[1, 18, 14]} />
            <meshStandardMaterial color={accent} roughness={0.82} />
          </mesh>
        ))}
      </group>
    );
  }

  if (pattern === "stripes") {
    return (
      <group>
        {[0.99, 1.25, 1.51].map((y, index) => (
          <mesh
            key={y}
            position={[0, y, 0]}
            rotation={[Math.PI / 2, 0, 0]}
            scale={[
              bodyScale[0] * (index === 1 ? 1 : 0.92),
              bodyScale[2] * (index === 1 ? 1 : 0.92),
              1,
            ]}
          >
            <torusGeometry args={[0.88, 0.055, 12, 36]} />
            <meshStandardMaterial color={accent} roughness={0.82} />
          </mesh>
        ))}
      </group>
    );
  }

  return null;
}

function Horns({
  shape,
  accent,
  castShadow,
}: {
  shape: MonsterDna["horns"];
  accent: string;
  castShadow: boolean;
}) {
  if (shape === "none") return null;

  if (shape === "buds") {
    return (
      <group>
        {[-0.56, 0.56].map((x) => (
          <mesh key={x} position={[x, 2.02, -0.04]} castShadow={castShadow}>
            <sphereGeometry args={[0.22, 18, 14]} />
            <meshStandardMaterial color={accent} roughness={0.76} />
          </mesh>
        ))}
      </group>
    );
  }

  return (
    <group>
      <mesh
        position={[-0.57, 2.06, -0.08]}
        rotation={[0, 0, -0.34]}
        castShadow={castShadow}
      >
        <coneGeometry args={[0.2, 0.62, 18]} />
        <meshStandardMaterial color={accent} roughness={0.72} />
      </mesh>
      <mesh
        position={[0.57, 2.06, -0.08]}
        rotation={[0, 0, 0.34]}
        castShadow={castShadow}
      >
        <coneGeometry args={[0.2, 0.62, 18]} />
        <meshStandardMaterial color={accent} roughness={0.72} />
      </mesh>
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
  const bodyScale = BODY_SCALES[dna.body];
  const sizeScale = getMonsterSizeScale(dna.size);

  return (
    <group scale={sizeScale}>
      <group>
        <mesh position={[0, 1.24, 0]} scale={bodyScale} castShadow={castShadow}>
          <sphereGeometry args={[0.92, 32, 24]} />
          <meshStandardMaterial color={primary.hex} roughness={0.72} />
        </mesh>
        <mesh
          position={[0, 1.03, -0.86]}
          scale={[0.66, 0.55, 0.18]}
          castShadow={castShadow}
        >
          <sphereGeometry args={[0.78, 28, 20]} />
          <meshStandardMaterial color={accent.hex} roughness={0.84} />
        </mesh>
        <PatternMarks
          pattern={dna.pattern}
          accent={accent.hex}
          bodyScale={bodyScale}
        />
        {eyePositions(dna.eyes).map(([x, y], index) => (
          <group key={`${x}-${y}-${index}`}>
            <mesh position={[x, y, -1.02]}>
              <sphereGeometry args={[0.235, 24, 18]} />
              <meshStandardMaterial color="#FFF8D9" />
            </mesh>
            <mesh position={[x, y + 0.01, -1.235]}>
              <sphereGeometry args={[0.088, 18, 14]} />
              <meshStandardMaterial color="#173F35" />
            </mesh>
          </group>
        ))}
        <Horns shape={dna.horns} accent={accent.hex} castShadow={castShadow} />
        <Mouth shape={dna.mouth} accent={accent.hex} />
        <mesh
          position={[0, 1.12, 1.1]}
          rotation={[-0.75, 0, 0]}
          castShadow={castShadow}
        >
          <coneGeometry args={[0.24, 1.25, 18]} />
          <meshStandardMaterial color={primary.dark} roughness={0.8} />
        </mesh>
      </group>
      {legPositions(dna.legs).map((position, index) => (
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
