"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import {
  ALL_BUSHES,
  ALL_TREES,
  BRIDGE_POSITIONS,
  BUSHES,
  EXTRA_PLANTS,
  EXTRA_ROCKS,
  PLANTS,
  PLAYABLE_RADIUS,
  PREY,
  ROCKS,
  TREES,
  WORLD_RADIUS,
  dampAngle,
  isWaterAt,
  riverX,
  terrainHeight,
  type Prey,
} from "@monsters/game-core";

export type SceneQuality = "mobile" | "desktop";

/**
 * Mobile draws the hand-placed props plus every fifth scattered one. The food
 * graph itself is server-side and always complete; this only thins geometry.
 */
const MOBILE_SCENERY_STEP = 5;

export function isVisibleSceneryItem(
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

/** Every static prop on the island, in one component. */
export function Scenery({
  quality,
  depletedResources,
}: {
  quality: SceneQuality;
  depletedResources: ReadonlySet<string>;
}) {
  return (
    <>
      <Sea quality={quality} />
      <Terrain quality={quality} />
      <River quality={quality} />
      {ALL_TREES.map(([x, z, scale], index) =>
        depletedResources.has(`tree-${index}`) ||
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
        depletedResources.has(`bush-${index}`) ||
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
        depletedResources.has(prey.id) ? null : (
          <SnackCritter key={prey.id} prey={prey} quality={quality} />
        ),
      )}
    </>
  );
}
