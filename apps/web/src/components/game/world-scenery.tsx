"use client";

import { useFrame } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import {
  ALL_BUSHES,
  ALL_TREES,
  BRIDGE_POSITIONS,
  BUSHES,
  EXTRA_PLANTS,
  EXTRA_ROCKS,
  PLANTS,
  LAND_PREY,
  FISH,
  KELP,
  resourceHeight,
  ISLANDS,
  OCEAN_RADIUS,
  SEA_LEVEL,
  islandAt,
  type Island,
  ROCKS,
  TREES,
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

function Terrain({
  quality,
  island,
}: {
  quality: SceneQuality;
  island: Island;
}) {
  const geometry = useMemo(() => {
    const size = island.radius * 2 + 24;
    const segments = quality === "mobile" ? 128 : 208;
    const result = new THREE.PlaneGeometry(size, size, segments, segments);
    result.rotateX(-Math.PI / 2);
    const position = result.attributes.position;
    const colors: number[] = [];
    for (let index = 0; index < position.count; index++) {
      const x = position.getX(index) + island.x;
      const z = position.getZ(index) + island.z;
      const y = terrainHeight(x, z);
      position.setXYZ(index, x, y, z);
      const color = new THREE.Color(
        y < SEA_LEVEL
          ? "#C8B783"
          : y > 24
            ? "#E6E8D9"
            : y > 12
              ? "#8C9080"
              : island.color,
      );
      colors.push(color.r, color.g, color.b);
    }
    result.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    result.computeVertexNormals();
    return result;
  }, [quality, island]);
  return (
    <mesh geometry={geometry} receiveShadow={quality === "desktop"}>
      <meshStandardMaterial vertexColors roughness={0.95} />
    </mesh>
  );
}

function OceanFloor() {
  const geometry = useMemo(() => {
    const result = new THREE.PlaneGeometry(
      OCEAN_RADIUS * 2 + 100,
      OCEAN_RADIUS * 2 + 100,
      128,
      128,
    );
    result.rotateX(-Math.PI / 2);
    const position = result.attributes.position;
    for (let index = 0; index < position.count; index++) {
      const x = position.getX(index),
        z = position.getZ(index);
      position.setY(index, islandAt(x, z) ? -35 : terrainHeight(x, z) - 0.1);
    }
    const clipped: number[] = [];
    const indices = result.index!;
    for (let index = 0; index < indices.count; index += 3) {
      const a = indices.getX(index),
        b = indices.getX(index + 1),
        c = indices.getX(index + 2);
      if (
        [a, b, c].every(
          (vertex) =>
            Math.hypot(position.getX(vertex), position.getZ(vertex)) <
            OCEAN_RADIUS + 60,
        )
      )
        clipped.push(a, b, c);
    }
    result.setIndex(clipped);
    result.computeVertexNormals();
    return result;
  }, []);
  return (
    <mesh geometry={geometry}>
      <meshStandardMaterial color="#A5B89C" roughness={1} />
    </mesh>
  );
}

function Sea({ quality }: { quality: SceneQuality }) {
  const sea = useRef<THREE.Mesh>(null);
  useFrame(({ camera, clock }) => {
    if (!sea.current) return;
    sea.current.position.y =
      SEA_LEVEL + Math.sin(clock.elapsedTime * 0.7) * 0.025;
    (sea.current.material as THREE.MeshStandardMaterial).opacity =
      camera.position.y < SEA_LEVEL ? 0.28 : 0.7;
  });

  return (
    <mesh
      ref={sea}
      position={[0, -0.42, 0]}
      rotation={[-Math.PI / 2, 0, 0]}
      receiveShadow={quality === "desktop"}
    >
      <circleGeometry
        args={[OCEAN_RADIUS + 100, quality === "mobile" ? 96 : 192]}
      />
      <meshStandardMaterial
        color="#4AAFC5"
        roughness={0.32}
        metalness={0.05}
        side={THREE.DoubleSide}
        transparent
        opacity={0.7}
        depthWrite={false}
      />
    </mesh>
  );
}

function River({ quality }: { quality: SceneQuality }) {
  return quality === "mobile" ? (
    <MobileBridges />
  ) : (
    <>
      {BRIDGE_POSITIONS.map((z) => (
        <Bridge key={z} z={z} quality={quality} />
      ))}
    </>
  );
}

function MobileBridges() {
  const lightPlanks = useRef<THREE.InstancedMesh>(null);
  const darkPlanks = useRef<THREE.InstancedMesh>(null);
  const supports = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    let lightIndex = 0;
    let darkIndex = 0;
    let supportIndex = 0;
    for (const z of BRIDGE_POSITIONS) {
      const x = riverX(z);
      const y = terrainHeight(x, z) + 0.27;
      for (let index = 0; index < 7; index += 1) {
        const target = index % 2 ? darkPlanks.current : lightPlanks.current;
        const targetIndex = index % 2 ? darkIndex++ : lightIndex++;
        setInstanceTransform(
          target,
          targetIndex,
          [x, y, z + (index - 3) * 0.36],
          [1, 1, 1],
        );
      }
      for (const offset of [-1.62, 1.62]) {
        setInstanceTransform(
          supports.current,
          supportIndex++,
          [x + offset, y - 0.18, z],
          [1, 1, 1],
        );
      }
    }
    finishInstances(lightPlanks.current, darkPlanks.current, supports.current);
  }, []);
  return (
    <>
      <instancedMesh
        ref={lightPlanks}
        args={[undefined, undefined, BRIDGE_POSITIONS.length * 4]}
      >
        <boxGeometry args={[3.65, 0.18, 0.3]} />
        <meshLambertMaterial color="#BC7B48" />
      </instancedMesh>
      <instancedMesh
        ref={darkPlanks}
        args={[undefined, undefined, BRIDGE_POSITIONS.length * 3]}
      >
        <boxGeometry args={[3.65, 0.18, 0.3]} />
        <meshLambertMaterial color="#A8683D" />
      </instancedMesh>
      <instancedMesh
        ref={supports}
        args={[undefined, undefined, BRIDGE_POSITIONS.length * 2]}
      >
        <boxGeometry args={[0.18, 0.25, 2.6]} />
        <meshLambertMaterial color="#70452F" />
      </instancedMesh>
    </>
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
  const branchSegments = quality === "mobile" ? 8 : 12;
  return (
    <group position={[x, terrainHeight(x, z), z]} scale={scale}>
      {[-0.62, 0, 0.62].map((rotation, index) => (
        <mesh
          key={rotation}
          position={[Math.sin(rotation) * 0.22, 0.18, Math.cos(rotation) * 0.2]}
          rotation={[0, rotation, index === 1 ? 0 : rotation * 0.42]}
          scale={[1, 0.72, 1]}
          castShadow={castsShadow}
        >
          <capsuleGeometry args={[0.17, 0.65, 3, branchSegments]} />
          <meshStandardMaterial color="#68402D" roughness={1} />
        </mesh>
      ))}
      <mesh position={[0, 1.25, 0]} castShadow={castsShadow}>
        <cylinderGeometry
          args={[0.28, 0.42, 2.5, quality === "mobile" ? 10 : 18]}
        />
        <meshStandardMaterial color="#855333" roughness={1} />
      </mesh>
      {[
        { position: [-0.35, 2.03, 0], rotation: [0, 0, -0.83] },
        { position: [0.32, 2.28, 0.08], rotation: [0.1, 0, 0.78] },
        { position: [0.02, 2.5, 0.28], rotation: [0.82, 0, 0.08] },
      ].map((branch, index) => (
        <mesh
          key={index}
          position={branch.position as [number, number, number]}
          rotation={branch.rotation as [number, number, number]}
          castShadow={castsShadow}
        >
          <cylinderGeometry args={[0.08, 0.16, 1.2, branchSegments]} />
          <meshStandardMaterial color="#7B4A30" roughness={1} />
        </mesh>
      ))}
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
      <mesh
        position={[0.18, 3.9, 0.1]}
        scale={[0.72, 0.58, 0.68]}
        castShadow={castsShadow}
      >
        <sphereGeometry
          args={[
            1.05,
            quality === "mobile" ? 12 : 20,
            quality === "mobile" ? 9 : 15,
          ]}
        />
        <meshStandardMaterial color="#397F43" roughness={0.98} />
      </mesh>
      {[
        [-0.82, 3.08, -0.72],
        [0.62, 3.28, -0.82],
        [0.1, 2.68, -1.2],
      ].map((position, index) => (
        <mesh
          key={index}
          position={position as [number, number, number]}
          castShadow={castsShadow}
        >
          <sphereGeometry args={[0.13, 9, 7]} />
          <meshStandardMaterial
            color={index === 1 ? "#E6B443" : "#D97843"}
            roughness={0.8}
          />
        </mesh>
      ))}
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
      <mesh position={[0, -0.18, 0]} castShadow={castsShadow}>
        <cylinderGeometry args={[0.08, 0.13, 1.15, 9]} />
        <meshStandardMaterial color="#5E5631" roughness={1} />
      </mesh>
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
      {[
        [-0.65, 0.05, -0.65, -0.65],
        [0.58, 0.18, -0.7, 0.72],
        [-0.12, 0.58, -0.67, -0.08],
      ].map(([leafX, leafY, leafZ, rotation], index) => (
        <mesh
          key={index}
          position={[leafX, leafY, leafZ]}
          rotation={[0.18, rotation, 0]}
          scale={[0.34, 0.12, 0.58]}
          castShadow={castsShadow}
        >
          <sphereGeometry args={[0.62, 10, 7]} />
          <meshStandardMaterial
            color={index === 1 ? "#75BF5D" : "#317E46"}
            roughness={0.94}
          />
        </mesh>
      ))}
      {[
        [-0.24, 0.5, -0.68],
        [0.28, 0.42, -0.72],
        [0.02, 0.72, -0.52],
        [0.62, 0.22, -0.5],
      ].map((position, index) => (
        <mesh key={index} position={position as [number, number, number]}>
          <sphereGeometry args={[0.085, 8, 6]} />
          <meshStandardMaterial
            color={index % 2 ? "#743D78" : "#B9485C"}
            roughness={0.72}
          />
        </mesh>
      ))}
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
    <group position={[x, terrainHeight(x, z), z]} rotation={[0, rotation, 0]}>
      <mesh
        position={[0, scale * 0.35, 0]}
        rotation={[0.1, 0, -0.08]}
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
      <mesh
        position={[scale * 0.72, scale * 0.18, scale * 0.2]}
        rotation={[0.2, -0.4, 0.18]}
        scale={[scale * 0.42, scale * 0.32, scale * 0.5]}
        castShadow={quality === "desktop"}
      >
        <dodecahedronGeometry args={[0.72, quality === "mobile" ? 0 : 1]} />
        <meshStandardMaterial color="#87998D" roughness={0.94} />
      </mesh>
    </group>
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
      {Array.from({ length: 5 }, (_, index) => {
        const angle = (index / 5) * Math.PI * 2;
        return (
          <mesh
            key={angle}
            position={[Math.cos(angle) * 0.17, 0.68, Math.sin(angle) * 0.17]}
            rotation={[0, -angle, Math.PI / 2]}
            scale={[1, 0.46, 1]}
          >
            <sphereGeometry args={[0.12, 8, 6]} />
            <meshStandardMaterial
              color={index % 2 ? "#FFF0A8" : "#F8D873"}
              roughness={0.82}
            />
          </mesh>
        );
      })}
    </group>
  );
}

type TreeItem = (typeof ALL_TREES)[number];
type BushItem = (typeof ALL_BUSHES)[number];
type RockItem = (typeof ROCKS)[number];
type PlantItem = (typeof PLANTS)[number];
const INSTANCE_TRANSFORM = new THREE.Object3D();

function setInstanceTransform(
  mesh: THREE.InstancedMesh | null,
  index: number,
  position: [number, number, number],
  scale: [number, number, number],
  rotation: [number, number, number] = [0, 0, 0],
) {
  if (!mesh) return;
  const transform = INSTANCE_TRANSFORM;
  transform.position.set(...position);
  transform.rotation.set(...rotation);
  transform.scale.set(...scale);
  transform.updateMatrix();
  mesh.setMatrixAt(index, transform.matrix);
}

function finishInstances(...meshes: Array<THREE.InstancedMesh | null>) {
  for (const mesh of meshes) {
    if (!mesh) continue;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }
}

function MobileTrees({ items }: { items: TreeItem[] }) {
  const trunk = useRef<THREE.InstancedMesh>(null);
  const branchLeft = useRef<THREE.InstancedMesh>(null);
  const branchRight = useRef<THREE.InstancedMesh>(null);
  const crown = useRef<THREE.InstancedMesh>(null);
  const crownLeft = useRef<THREE.InstancedMesh>(null);
  const crownRight = useRef<THREE.InstancedMesh>(null);
  const crownTop = useRef<THREE.InstancedMesh>(null);
  const fruit = useRef<THREE.InstancedMesh>(null);

  useLayoutEffect(() => {
    items.forEach(([x, z, scale], index) => {
      const y = terrainHeight(x, z);
      setInstanceTransform(
        trunk.current,
        index,
        [x, y + 1.25 * scale, z],
        [scale, scale, scale],
      );
      setInstanceTransform(
        branchLeft.current,
        index,
        [x - 0.32 * scale, y + 2.03 * scale, z],
        [scale, scale, scale],
        [0, 0, -0.83],
      );
      setInstanceTransform(
        branchRight.current,
        index,
        [x + 0.31 * scale, y + 2.27 * scale, z + 0.08 * scale],
        [scale, scale, scale],
        [0.1, 0, 0.78],
      );
      setInstanceTransform(
        crown.current,
        index,
        [x, y + 3.15 * scale, z],
        [scale, scale * 1.05, scale * 0.96],
      );
      setInstanceTransform(
        crownLeft.current,
        index,
        [x - 0.8 * scale, y + 2.75 * scale, z + 0.3 * scale],
        [scale, scale, scale],
      );
      setInstanceTransform(
        crownRight.current,
        index,
        [x + 0.78 * scale, y + 2.75 * scale, z + 0.2 * scale],
        [scale, scale, scale],
      );
      setInstanceTransform(
        crownTop.current,
        index,
        [x + 0.18 * scale, y + 3.9 * scale, z + 0.1 * scale],
        [scale * 0.76, scale * 0.61, scale * 0.72],
      );
      setInstanceTransform(
        fruit.current,
        index,
        [
          x + (index % 2 ? 0.62 : -0.72) * scale,
          y + (3.08 + (index % 3) * 0.11) * scale,
          z - 0.78 * scale,
        ],
        [scale, scale, scale],
      );
    });
    finishInstances(
      trunk.current,
      branchLeft.current,
      branchRight.current,
      crown.current,
      crownLeft.current,
      crownRight.current,
      crownTop.current,
      fruit.current,
    );
  }, [items]);

  return (
    <>
      <instancedMesh ref={trunk} args={[undefined, undefined, items.length]}>
        <cylinderGeometry args={[0.28, 0.42, 2.5, 10]} />
        <meshLambertMaterial color="#855333" />
      </instancedMesh>
      <instancedMesh
        ref={branchLeft}
        args={[undefined, undefined, items.length]}
      >
        <cylinderGeometry args={[0.08, 0.16, 1.2, 8]} />
        <meshLambertMaterial color="#75472F" />
      </instancedMesh>
      <instancedMesh
        ref={branchRight}
        args={[undefined, undefined, items.length]}
      >
        <cylinderGeometry args={[0.08, 0.16, 1.2, 8]} />
        <meshLambertMaterial color="#7B4A30" />
      </instancedMesh>
      <instancedMesh ref={crown} args={[undefined, undefined, items.length]}>
        <sphereGeometry args={[1.45, 12, 9]} />
        <meshLambertMaterial color="#2F7D4A" />
      </instancedMesh>
      <instancedMesh
        ref={crownLeft}
        args={[undefined, undefined, items.length]}
      >
        <sphereGeometry args={[0.9, 12, 9]} />
        <meshLambertMaterial color="#3E9152" />
      </instancedMesh>
      <instancedMesh
        ref={crownRight}
        args={[undefined, undefined, items.length]}
      >
        <sphereGeometry args={[0.85, 12, 9]} />
        <meshLambertMaterial color="#4BA15A" />
      </instancedMesh>
      <instancedMesh ref={crownTop} args={[undefined, undefined, items.length]}>
        <sphereGeometry args={[1.05, 12, 9]} />
        <meshLambertMaterial color="#397F43" />
      </instancedMesh>
      <instancedMesh ref={fruit} args={[undefined, undefined, items.length]}>
        <sphereGeometry args={[0.13, 8, 6]} />
        <meshLambertMaterial color="#D97843" />
      </instancedMesh>
    </>
  );
}

function MobileBushes({ items }: { items: BushItem[] }) {
  const stem = useRef<THREE.InstancedMesh>(null);
  const left = useRef<THREE.InstancedMesh>(null);
  const right = useRef<THREE.InstancedMesh>(null);
  const top = useRef<THREE.InstancedMesh>(null);
  const leaf = useRef<THREE.InstancedMesh>(null);
  const berries = useRef<THREE.InstancedMesh>(null);
  const flowerLeft = useRef<THREE.InstancedMesh>(null);
  const flowerRight = useRef<THREE.InstancedMesh>(null);

  useLayoutEffect(() => {
    items.forEach(([x, z, scale], index) => {
      const y = terrainHeight(x, z) + 0.48 * scale;
      setInstanceTransform(
        stem.current,
        index,
        [x, y - 0.18 * scale, z],
        [scale, scale, scale],
      );
      setInstanceTransform(
        left.current,
        index,
        [x - 0.48 * scale, y, z],
        [scale, scale * 0.9, scale * 1.05],
      );
      setInstanceTransform(
        right.current,
        index,
        [x + 0.42 * scale, y + 0.05 * scale, z],
        [scale * 1.05, scale * 0.92, scale],
      );
      setInstanceTransform(
        top.current,
        index,
        [x, y + 0.38 * scale, z + 0.12 * scale],
        [scale, scale, scale],
      );
      setInstanceTransform(
        leaf.current,
        index,
        [
          x + (index % 2 ? 0.5 : -0.5) * scale,
          y + 0.2 * scale,
          z - 0.67 * scale,
        ],
        [scale * 0.34, scale * 0.12, scale * 0.58],
        [0.18, index % 2 ? 0.72 : -0.65, 0],
      );
      setInstanceTransform(
        berries.current,
        index,
        [
          x + ((index % 3) - 1) * 0.24 * scale,
          y + 0.52 * scale,
          z - 0.7 * scale,
        ],
        [scale, scale, scale],
      );
      setInstanceTransform(
        flowerLeft.current,
        index,
        [x - 0.46 * scale, y + 0.42 * scale, z - 0.48 * scale],
        [scale, scale, scale],
      );
      setInstanceTransform(
        flowerRight.current,
        index,
        [x + 0.55 * scale, y + 0.28 * scale, z - 0.45 * scale],
        [scale, scale, scale],
      );
    });
    finishInstances(
      stem.current,
      left.current,
      right.current,
      top.current,
      leaf.current,
      berries.current,
      flowerLeft.current,
      flowerRight.current,
    );
  }, [items]);

  return (
    <>
      <instancedMesh ref={stem} args={[undefined, undefined, items.length]}>
        <cylinderGeometry args={[0.08, 0.13, 1.15, 8]} />
        <meshLambertMaterial color="#5E5631" />
      </instancedMesh>
      <instancedMesh ref={left} args={[undefined, undefined, items.length]}>
        <sphereGeometry args={[0.7, 10, 8]} />
        <meshLambertMaterial color="#3F9850" />
      </instancedMesh>
      <instancedMesh ref={right} args={[undefined, undefined, items.length]}>
        <sphereGeometry args={[0.78, 10, 8]} />
        <meshLambertMaterial color="#54AA57" />
      </instancedMesh>
      <instancedMesh ref={top} args={[undefined, undefined, items.length]}>
        <sphereGeometry args={[0.72, 10, 8]} />
        <meshLambertMaterial color="#68B95C" />
      </instancedMesh>
      <instancedMesh ref={leaf} args={[undefined, undefined, items.length]}>
        <sphereGeometry args={[0.62, 10, 7]} />
        <meshLambertMaterial color="#317E46" />
      </instancedMesh>
      <instancedMesh ref={berries} args={[undefined, undefined, items.length]}>
        <sphereGeometry args={[0.09, 7, 5]} />
        <meshLambertMaterial color="#B9485C" />
      </instancedMesh>
      <instancedMesh
        ref={flowerLeft}
        args={[undefined, undefined, items.length]}
      >
        <sphereGeometry args={[0.1, 6, 5]} />
        <meshBasicMaterial color="#F4CF5A" />
      </instancedMesh>
      <instancedMesh
        ref={flowerRight}
        args={[undefined, undefined, items.length]}
      >
        <sphereGeometry args={[0.1, 6, 5]} />
        <meshBasicMaterial color="#F4CF5A" />
      </instancedMesh>
    </>
  );
}

function MobileRocks({ items }: { items: RockItem[] }) {
  const rocks = useRef<THREE.InstancedMesh>(null);
  const pebbles = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    items.forEach(([x, z, scale, rotation], index) => {
      setInstanceTransform(
        rocks.current,
        index,
        [x, terrainHeight(x, z) + scale * 0.35, z],
        [scale, scale * 0.72, scale * 0.9],
        [0.1, rotation, -0.08],
      );
      setInstanceTransform(
        pebbles.current,
        index,
        [
          x + Math.cos(rotation) * scale * 0.72,
          terrainHeight(x, z) + scale * 0.18,
          z + Math.sin(rotation) * scale * 0.72,
        ],
        [scale * 0.42, scale * 0.32, scale * 0.5],
        [0.2, rotation - 0.4, 0.18],
      );
    });
    finishInstances(rocks.current, pebbles.current);
  }, [items]);
  return (
    <>
      <instancedMesh ref={rocks} args={[undefined, undefined, items.length]}>
        <sphereGeometry args={[0.9, 12, 9]} />
        <meshLambertMaterial color="#718A7D" />
      </instancedMesh>
      <instancedMesh ref={pebbles} args={[undefined, undefined, items.length]}>
        <dodecahedronGeometry args={[0.72, 0]} />
        <meshLambertMaterial color="#87998D" />
      </instancedMesh>
    </>
  );
}

function MobilePlants({ items }: { items: PlantItem[] }) {
  const left = useRef<THREE.InstancedMesh>(null);
  const middle = useRef<THREE.InstancedMesh>(null);
  const right = useRef<THREE.InstancedMesh>(null);
  const flowers = useRef<THREE.InstancedMesh>(null);
  const petals = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    items.forEach(([x, z], index) => {
      const y = terrainHeight(x, z);
      setInstanceTransform(
        left.current,
        index,
        [x - 0.22, y + 0.32, z],
        [1, 1, 1],
        [0, 0, -0.352],
      );
      setInstanceTransform(middle.current, index, [x, y + 0.38, z], [1, 1, 1]);
      setInstanceTransform(
        right.current,
        index,
        [x + 0.22, y + 0.44, z],
        [1, 1, 1],
        [0, 0, 0.352],
      );
      setInstanceTransform(flowers.current, index, [x, y + 0.68, z], [1, 1, 1]);
      setInstanceTransform(
        petals.current,
        index,
        [x, y + 0.68, z],
        [1, 1, 1],
        [Math.PI / 2, 0, 0],
      );
    });
    finishInstances(
      left.current,
      middle.current,
      right.current,
      flowers.current,
      petals.current,
    );
  }, [items]);
  return (
    <>
      <instancedMesh ref={left} args={[undefined, undefined, items.length]}>
        <capsuleGeometry args={[0.11, 0.45, 2, 5]} />
        <meshLambertMaterial color="#62AC52" />
      </instancedMesh>
      <instancedMesh ref={middle} args={[undefined, undefined, items.length]}>
        <capsuleGeometry args={[0.11, 0.45, 2, 5]} />
        <meshLambertMaterial color="#82C95E" />
      </instancedMesh>
      <instancedMesh ref={right} args={[undefined, undefined, items.length]}>
        <capsuleGeometry args={[0.11, 0.45, 2, 5]} />
        <meshLambertMaterial color="#62AC52" />
      </instancedMesh>
      <instancedMesh ref={flowers} args={[undefined, undefined, items.length]}>
        <sphereGeometry args={[0.14, 8, 6]} />
        <meshBasicMaterial color="#F3C453" />
      </instancedMesh>
      <instancedMesh ref={petals} args={[undefined, undefined, items.length]}>
        <torusGeometry args={[0.17, 0.055, 5, 10]} />
        <meshLambertMaterial color="#FFF0A8" />
      </instancedMesh>
    </>
  );
}

function MobileScenery({
  depletedResources,
}: {
  depletedResources: ReadonlySet<string>;
}) {
  const trees = useMemo(
    () =>
      ALL_TREES.filter(
        (_, index) =>
          !depletedResources.has(`tree-${index}`) &&
          isVisibleSceneryItem("mobile", index, TREES.length),
      ),
    [depletedResources],
  );
  const bushes = useMemo(
    () =>
      ALL_BUSHES.filter(
        (_, index) =>
          !depletedResources.has(`bush-${index}`) &&
          isVisibleSceneryItem("mobile", index, BUSHES.length),
      ),
    [depletedResources],
  );
  const rocks = useMemo(
    () => [
      ...ROCKS,
      ...EXTRA_ROCKS.filter((_, index) =>
        isVisibleSceneryItem("mobile", index, 0),
      ),
    ],
    [],
  );
  const plants = useMemo(
    () => [
      ...PLANTS,
      ...EXTRA_PLANTS.filter((_, index) =>
        isVisibleSceneryItem("mobile", index, 0),
      ),
    ],
    [],
  );

  return (
    <>
      <MobileTrees items={trees} />
      <MobileBushes items={bushes} />
      <MobileRocks items={rocks} />
      <MobilePlants items={plants} />
    </>
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

  useFrame(({ clock }) => {
    if (!root.current) return;
    const time = clock.elapsedTime;
    // Keep the visible critter on the exact authoritative interaction point.
    // A small idle hop preserves life without making attacks miss an animal
    // that the player can plainly see.
    root.current.position.y =
      y + 0.38 + Math.abs(Math.sin(time * 6.5 + phase)) * 0.06;
    root.current.rotation.y = -0.4 + Math.sin(time * 0.72 + phase) * 0.08;
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
      {[
        [-0.25, -0.3, -0.24],
        [0.25, -0.3, -0.24],
        [-0.25, -0.3, 0.28],
        [0.25, -0.3, 0.28],
      ].map((position, index) => (
        <mesh
          key={index}
          position={position as [number, number, number]}
          scale={[0.82, 1, 0.72]}
          castShadow={quality === "desktop"}
        >
          <capsuleGeometry args={[0.09, 0.2, 2, 7]} />
          <meshStandardMaterial color="#B98960" roughness={0.92} />
        </mesh>
      ))}
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
      <mesh position={[0, 0.01, 0.68]} scale={[1, 0.7, 0.75]}>
        <sphereGeometry args={[0.08, 9, 7]} />
        <meshStandardMaterial color="#5B4032" roughness={0.82} />
      </mesh>
      <mesh
        position={[0.44, 0.04, 0.06]}
        rotation={[0.15, 0, -0.68]}
        castShadow={quality === "desktop"}
      >
        <torusGeometry args={[0.18, 0.045, 6, 12, Math.PI * 1.35]} />
        <meshStandardMaterial color="#B98960" roughness={0.9} />
      </mesh>
    </group>
  );
}

/** Instancing keeps the underwater food graph visible without hundreds of draw calls. */
function MarineLife({
  depletedResources,
}: {
  depletedResources: ReadonlySet<string>;
}) {
  const kelp = useRef<THREE.InstancedMesh>(null);
  const frond = useMemo(() => {
    const geometry = new THREE.PlaneGeometry(0.75, 2.8, 1, 8);
    geometry.translate(0, 1.4, 0);
    const position = geometry.attributes.position;
    for (let index = 0; index < position.count; index++) {
      const y = position.getY(index);
      position.setX(
        index,
        position.getX(index) * Math.sin((Math.PI * y) / 2.8) +
          Math.sin(y * 2) * 0.22,
      );
      position.setZ(index, Math.sin(y * 1.8) * 0.15);
    }
    geometry.computeVertexNormals();
    return geometry;
  }, []);
  const fish = useRef<THREE.InstancedMesh>(null);
  const tails = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    KELP.forEach((food, index) => {
      const visible = !depletedResources.has(food.id);
      for (let blade = 0; blade < 3; blade++)
        setInstanceTransform(
          kelp.current,
          index * 3 + blade,
          [food.x + (blade - 1) * 0.2, resourceHeight(food) - 1.5, food.z],
          visible ? [0.8, 0.85 + blade * 0.12, 0.8] : [0, 0, 0],
          [0, index * 1.7 + blade * 1.1, (blade - 1) * 0.22],
        );
    });
    FISH.forEach((food, index) => {
      const visible = !depletedResources.has(food.id);
      const y = resourceHeight(food);
      setInstanceTransform(
        fish.current,
        index,
        [food.x, y, food.z],
        visible ? [0.65, 0.32, 0.28] : [0, 0, 0],
      );
      setInstanceTransform(
        tails.current,
        index,
        [food.x + 0.7, y, food.z],
        visible ? [0.45, 0.4, 0.15] : [0, 0, 0],
        [0, 0, Math.PI / 2],
      );
    });
    finishInstances(kelp.current, fish.current, tails.current);
  }, [depletedResources]);
  return (
    <>
      <instancedMesh ref={kelp} args={[frond, undefined, KELP.length * 3]}>
        <meshStandardMaterial
          side={THREE.DoubleSide}
          color="#55C99C"
          emissive="#174D3A"
          emissiveIntensity={0.25}
        />
      </instancedMesh>
      <instancedMesh ref={fish} args={[undefined, undefined, FISH.length]}>
        <sphereGeometry args={[1, 10, 7]} />
        <meshStandardMaterial
          color="#FFD37A"
          emissive="#796431"
          emissiveIntensity={0.2}
        />
      </instancedMesh>
      <instancedMesh ref={tails} args={[undefined, undefined, FISH.length]}>
        <coneGeometry args={[1, 1, 3]} />
        <meshStandardMaterial color="#EF9970" />
      </instancedMesh>
    </>
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
      <OceanFloor />
      {ISLANDS.map((island) => (
        <Terrain key={island.id} quality={quality} island={island} />
      ))}
      <MarineLife depletedResources={depletedResources} />
      <River quality={quality} />
      {quality === "mobile" ? (
        <MobileScenery depletedResources={depletedResources} />
      ) : (
        <>
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
        </>
      )}
      {LAND_PREY.map((prey) =>
        depletedResources.has(prey.id) ? null : (
          <SnackCritter key={prey.id} prey={prey} quality={quality} />
        ),
      )}
    </>
  );
}
