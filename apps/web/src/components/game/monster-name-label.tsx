"use client";

import { useMemo } from "react";
import * as THREE from "three";

const materials = new Map<string, THREE.SpriteMaterial>();

function labelMaterial(name: string) {
  const existing = materials.get(name);
  if (existing) return existing;
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 64;
  const context = canvas.getContext("2d");
  if (!context) return new THREE.SpriteMaterial({ color: "#ffffff" });
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "rgba(17, 47, 39, 0.82)";
  context.beginPath();
  context.roundRect(2, 4, 252, 56, 22);
  context.fill();
  context.font = "700 25px system-ui, sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillStyle = "#fff9e8";
  const visible = name.length > 20 ? `${name.slice(0, 19)}…` : name;
  context.fillText(visible, 128, 32, 224);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });
  materials.set(name, material);
  return material;
}

export function MonsterNameLabel({
  name,
  positionY,
}: {
  name: string;
  positionY: number;
}) {
  const material = useMemo(() => labelMaterial(name), [name]);
  return (
    <sprite
      material={material}
      position={[0, positionY, 0]}
      scale={[2.35, 0.58, 1]}
      renderOrder={20}
      frustumCulled
      dispose={null}
    />
  );
}
