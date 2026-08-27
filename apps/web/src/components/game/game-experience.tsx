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

type ControlState = {
  keys: Set<string>;
  move: { x: number; y: number };
  look: { x: number; y: number };
  cameraYaw: number;
  cameraPitch: number;
  action: Action;
  actionStarted: number;
};

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
];

const ROCKS: Array<[number, number, number, number]> = [
  [-17, 9, 0.8, 0.4],
  [-9, -17, 1.1, -0.3],
  [-4, 15, 0.65, 0.2],
  [10, 11, 0.9, 0.6],
  [17, -2, 1.2, -0.2],
  [4, -14, 0.7, 0.35],
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
];

function riverX(z: number) {
  return 3.3 + Math.sin(z * 0.16) * 2.2;
}

function terrainHeight(x: number, z: number) {
  const radius = Math.hypot(x, z);
  const edge = THREE.MathUtils.smoothstep(27 - radius, 0, 5);
  const hillA = Math.exp(-((x + 12) ** 2 + (z - 8) ** 2) / 70) * 2.7;
  const hillB = Math.exp(-((x - 13) ** 2 + (z + 10) ** 2) / 95) * 2.1;
  const hillC = Math.exp(-((x - 15) ** 2 + (z - 15) ** 2) / 85) * 1.65;
  const ripple = (Math.sin(x * 0.36) + Math.cos(z * 0.31)) * 0.08;
  const riverFlatten = THREE.MathUtils.smoothstep(
    Math.abs(x - riverX(z)),
    0.7,
    4,
  );
  return Math.max(
    -0.12,
    (0.12 + (hillA + hillB + hillC + ripple) * riverFlatten) * edge,
  );
}

function isBlockedByWater(x: number, z: number) {
  if (Math.hypot(x, z) > 25.4) return true;
  const bridge = Math.abs(z - 8) < 1.25 || Math.abs(z + 8) < 1.25;
  return Math.abs(x - riverX(z)) < 1.48 && !bridge;
}

function Terrain() {
  const geometry = useMemo(() => {
    const size = 54;
    const segments = 58;
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
        if (Math.hypot(x, z) > 26.65) continue;
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
        <meshStandardMaterial color="#72B95A" roughness={0.95} flatShading />
      </mesh>
      <mesh position={[0, -0.42, 0]} receiveShadow>
        <cylinderGeometry args={[27, 25.8, 0.9, 64]} />
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
      <circleGeometry args={[115, 96]} />
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
      Array.from({ length: 30 }, (_, index) => {
        const z = -25 + index * (50 / 29);
        const nextZ = Math.min(25, z + 50 / 29);
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
          <boxGeometry args={[2.75, 0.09, 2.15]} />
          <meshStandardMaterial
            color="#55B8CE"
            roughness={0.2}
            metalness={0.06}
          />
        </mesh>
      ))}
      <Bridge z={-8} />
      <Bridge z={8} />
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
        <cylinderGeometry args={[0.28, 0.42, 2.5, 7]} />
        <meshStandardMaterial color="#855333" roughness={1} />
      </mesh>
      <mesh position={[0, 3.15, 0]} castShadow>
        <icosahedronGeometry args={[1.45, 1]} />
        <meshStandardMaterial color="#2F7D4A" roughness={0.95} flatShading />
      </mesh>
      <mesh position={[-0.8, 2.75, 0.3]} castShadow>
        <icosahedronGeometry args={[0.9, 1]} />
        <meshStandardMaterial color="#3E9152" roughness={1} flatShading />
      </mesh>
      <mesh position={[0.78, 2.75, 0.2]} castShadow>
        <icosahedronGeometry args={[0.85, 1]} />
        <meshStandardMaterial color="#4BA15A" roughness={1} flatShading />
      </mesh>
    </group>
  );
}

function Bush({ x, z, scale }: { x: number; z: number; scale: number }) {
  return (
    <group position={[x, terrainHeight(x, z) + 0.48 * scale, z]} scale={scale}>
      <mesh position={[-0.48, 0, 0]} castShadow>
        <dodecahedronGeometry args={[0.7, 0]} />
        <meshStandardMaterial color="#3F9850" flatShading />
      </mesh>
      <mesh position={[0.42, 0.05, 0]} castShadow>
        <dodecahedronGeometry args={[0.78, 0]} />
        <meshStandardMaterial color="#54AA57" flatShading />
      </mesh>
      <mesh position={[0, 0.38, 0.12]} castShadow>
        <dodecahedronGeometry args={[0.72, 0]} />
        <meshStandardMaterial color="#68B95C" flatShading />
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
      <dodecahedronGeometry args={[0.9, 0]} />
      <meshStandardMaterial color="#718A7D" roughness={0.9} flatShading />
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
}: {
  controls: React.RefObject<ControlState>;
}) {
  const root = useRef<THREE.Group>(null);
  const body = useRef<THREE.Group>(null);
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
    if (!root.current || !body.current) return;
    const state = controls.current;
    const keys = state.keys;
    const horizontal =
      (keys.has("KeyD") || keys.has("ArrowRight") ? 1 : 0) -
      (keys.has("KeyA") || keys.has("ArrowLeft") ? 1 : 0) +
      state.move.x;
    const forward =
      (keys.has("KeyW") || keys.has("ArrowUp") ? 1 : 0) -
      (keys.has("KeyS") || keys.has("ArrowDown") ? 1 : 0) +
      state.move.y;

    velocity.set(0, 0, 0);
    if (Math.abs(horizontal) + Math.abs(forward) > 0.06) {
      const length = Math.hypot(horizontal, forward);
      const xInput = horizontal / Math.max(1, length);
      const zInput = forward / Math.max(1, length);
      const sin = Math.sin(state.cameraYaw);
      const cos = Math.cos(state.cameraYaw);
      velocity
        .set(xInput * cos - zInput * sin, 0, -xInput * sin - zInput * cos)
        .normalize();
      const speed = keys.has("ShiftLeft") || keys.has("ShiftRight") ? 8.2 : 5.4;
      const nextX = root.current.position.x + velocity.x * speed * delta;
      const nextZ = root.current.position.z + velocity.z * speed * delta;
      if (!isBlockedByWater(nextX, root.current.position.z))
        root.current.position.x = nextX;
      if (!isBlockedByWater(root.current.position.x, nextZ))
        root.current.position.z = nextZ;
      root.current.rotation.y = THREE.MathUtils.lerp(
        root.current.rotation.y,
        Math.atan2(-velocity.x, -velocity.z),
        Math.min(1, delta * 10),
      );
    }

    root.current.position.y = terrainHeight(
      root.current.position.x,
      root.current.position.z,
    );
    const moving = velocity.lengthSq() > 0.1;
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
    if (state.action === "attack" && actionAge < 520) {
      body.current.rotation.x = -Math.sin((actionAge / 520) * Math.PI) * 0.48;
      body.current.position.z = -Math.sin((actionAge / 520) * Math.PI) * 0.35;
    } else if (state.action === "eat" && actionAge < 700) {
      body.current.rotation.x = Math.sin((actionAge / 700) * Math.PI) * 0.58;
      body.current.scale.y = 1 - Math.sin((actionAge / 700) * Math.PI) * 0.12;
    } else {
      body.current.rotation.x = THREE.MathUtils.lerp(
        body.current.rotation.x,
        0,
        delta * 10,
      );
      body.current.position.z = THREE.MathUtils.lerp(
        body.current.position.z,
        0,
        delta * 10,
      );
      body.current.scale.y = THREE.MathUtils.lerp(
        body.current.scale.y,
        1,
        delta * 10,
      );
    }

    const distance = 8.2;
    const horizontalDistance = Math.cos(state.cameraPitch) * distance;
    desiredCamera.set(
      root.current.position.x + Math.sin(state.cameraYaw) * horizontalDistance,
      root.current.position.y + 2.4 + Math.sin(state.cameraPitch) * distance,
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
    <group ref={root} position={[-6, terrainHeight(-6, 5), 5]}>
      <group ref={body}>
        <mesh position={[0, 1.22, 0]} scale={[1.05, 0.95, 1.22]} castShadow>
          <sphereGeometry args={[0.92, 20, 16]} />
          <meshStandardMaterial color="#8FCB69" roughness={0.72} />
        </mesh>
        <mesh position={[0, 1.02, -0.83]} scale={[0.66, 0.55, 0.18]} castShadow>
          <sphereGeometry args={[0.78, 18, 14]} />
          <meshStandardMaterial color="#B7DF85" roughness={0.8} />
        </mesh>
        <mesh position={[-0.39, 1.55, -0.86]}>
          <sphereGeometry args={[0.29, 16, 12]} />
          <meshStandardMaterial color="#FFF8D9" />
        </mesh>
        <mesh position={[0.39, 1.55, -0.86]}>
          <sphereGeometry args={[0.29, 16, 12]} />
          <meshStandardMaterial color="#FFF8D9" />
        </mesh>
        <mesh position={[-0.4, 1.56, -1.12]}>
          <sphereGeometry args={[0.105, 12, 10]} />
          <meshStandardMaterial color="#173F35" />
        </mesh>
        <mesh position={[0.38, 1.56, -1.12]}>
          <sphereGeometry args={[0.105, 12, 10]} />
          <meshStandardMaterial color="#173F35" />
        </mesh>
        <mesh position={[0, 1.98, -0.58]} scale={[0.72, 0.72, 0.35]}>
          <sphereGeometry args={[0.25, 14, 12]} />
          <meshStandardMaterial color="#FFF8D9" />
        </mesh>
        <mesh position={[0, 2, -0.79]}>
          <sphereGeometry args={[0.075, 10, 8]} />
          <meshStandardMaterial color="#173F35" />
        </mesh>
        <mesh
          position={[-0.57, 2.05, -0.12]}
          rotation={[0, 0, -0.34]}
          castShadow
        >
          <coneGeometry args={[0.2, 0.62, 8]} />
          <meshStandardMaterial color="#FF8D6B" />
        </mesh>
        <mesh position={[0.57, 2.05, -0.12]} rotation={[0, 0, 0.34]} castShadow>
          <coneGeometry args={[0.2, 0.62, 8]} />
          <meshStandardMaterial color="#FF8D6B" />
        </mesh>
        <mesh position={[0, 0.96, -1.02]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.19, 0.035, 8, 18, Math.PI]} />
          <meshStandardMaterial color="#173F35" />
        </mesh>
        <mesh position={[0, 1.12, 1.1]} rotation={[-0.75, 0, 0]} castShadow>
          <coneGeometry args={[0.24, 1.25, 10]} />
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
            <capsuleGeometry args={[0.17, 0.42, 5, 8]} />
            <meshStandardMaterial color="#679D4D" />
          </mesh>
          <mesh
            position={[0, -0.52, -0.09]}
            scale={[1.3, 0.65, 1.5]}
            castShadow
          >
            <sphereGeometry args={[0.22, 12, 8]} />
            <meshStandardMaterial color="#FFB66E" />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function World({ controls }: { controls: React.RefObject<ControlState> }) {
  return (
    <>
      <color attach="background" args={["#9CDCE5"]} />
      <fog attach="fog" args={["#9CDCE5", 38, 95]} />
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
        shadow-camera-left={-34}
        shadow-camera-right={34}
        shadow-camera-top={34}
        shadow-camera-bottom={-34}
      />
      <Sea />
      <Terrain />
      <River />
      {TREES.map(([x, z, scale]) => (
        <Tree key={`${x}-${z}`} x={x} z={z} scale={scale} />
      ))}
      {BUSHES.map(([x, z, scale]) => (
        <Bush key={`${x}-${z}`} x={x} z={z} scale={scale} />
      ))}
      {ROCKS.map(([x, z, scale, rotation]) => (
        <Rock key={`${x}-${z}`} x={x} z={z} scale={scale} rotation={rotation} />
      ))}
      {PLANTS.map(([x, z]) => (
        <Plant key={`${x}-${z}`} x={x} z={z} />
      ))}
      <Float
        speed={1.2}
        rotationIntensity={0.04}
        floatIntensity={0.45}
        position={[-12, 11, -18]}
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
        count={42}
        scale={[48, 8, 48]}
        position={[0, 4, 0]}
        size={1.6}
        speed={0.24}
        color="#FFF1A8"
      />
      <CuteMonster controls={controls} />
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
    cameraPitch: 0.38,
    action: null,
    actionStarted: 0,
  });
  const [pointerLocked, setPointerLocked] = useState(false);
  const [status, setStatus] = useState("Welcome to Mossmunch Island");

  const triggerAction = useCallback((action: Exclude<Action, null>) => {
    controls.current.action = action;
    controls.current.actionStarted = performance.now();
    setStatus(
      action === "eat" ? "Mmm. That looks leafy!" : "Tiny but mighty! Rawr!",
    );
    window.setTimeout(() => setStatus("Explore the island"), 1400);
  }, []);

  useEffect(() => {
    let animationFrame = 0;
    let previousTime = performance.now();
    const updateTouchLook = (time: number) => {
      const delta = Math.min(0.05, (time - previousTime) / 1000);
      previousTime = time;
      controls.current.cameraYaw -= controls.current.look.x * delta * 1.9;
      controls.current.cameraPitch = THREE.MathUtils.clamp(
        controls.current.cameraPitch + controls.current.look.y * delta * 1.25,
        0.12,
        0.72,
      );
      animationFrame = window.requestAnimationFrame(updateTouchLook);
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
    };
    const onKeyUp = (event: KeyboardEvent) =>
      controls.current.keys.delete(event.code);
    const onMouseMove = (event: MouseEvent) => {
      if (!document.pointerLockElement) return;
      controls.current.cameraYaw -= event.movementX * 0.0024;
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
    animationFrame = window.requestAnimationFrame(updateTouchLook);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("pointerlockchange", onPointerLock);
      window.cancelAnimationFrame(animationFrame);
    };
  }, [triggerAction]);

  return (
    <main className="game-shell">
      <Canvas
        shadows
        dpr={[1, 1.6]}
        camera={{ fov: 48, near: 0.1, far: 180, position: [8, 8, 12] }}
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
        <World controls={controls} />
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
          <div className="energy-bar">
            <i />
            <span>ENERGY</span>
          </div>
        </div>
        <div className="status-bubble">{status}</div>

        {!pointerLocked && (
          <div className="mouse-hint">
            <MousePointer2 size={18} />
            <span>Click the world to look around</span>
          </div>
        )}

        <div className="desktop-controls">
          <div>
            <kbd>W</kbd>
            <kbd>A</kbd>
            <kbd>S</kbd>
            <kbd>D</kbd>
            <span>move</span>
          </div>
          <div>
            <MousePointer2 size={16} />
            <span>look</span>
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
