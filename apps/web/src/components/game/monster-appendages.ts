import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { MonsterDna } from "./monster-dna";
import type { Point3 } from "./monster-surface";

/** Closed, tapered sweep. Unlike a chain of metaballs, small horns and tails
 * keep their designed curvature and tips without voxel ripples or clipping. */
export function taperedSweep(
  points: Point3[],
  radii: number[],
  segments = 28,
  sides = 12,
) {
  const curve = new THREE.CatmullRomCurve3(
    points.map((p) => new THREE.Vector3(...p)),
  );
  const frames = curve.computeFrenetFrames(segments, false);
  const positions: number[] = [];
  const indices: number[] = [];
  for (let ring = 0; ring <= segments; ring++) {
    const t = ring / segments;
    const center = curve.getPointAt(t);
    const r = t * (radii.length - 1);
    const radius = THREE.MathUtils.lerp(
      radii[Math.floor(r)],
      radii[Math.min(radii.length - 1, Math.floor(r) + 1)],
      THREE.MathUtils.smoothstep(r % 1, 0, 1),
    );
    for (let side = 0; side < sides; side++) {
      const angle = (side / sides) * Math.PI * 2;
      const point = center
        .clone()
        .addScaledVector(frames.normals[ring], Math.cos(angle) * radius)
        .addScaledVector(frames.binormals[ring], Math.sin(angle) * radius);
      positions.push(point.x, point.y, point.z);
      if (ring < segments) {
        const a = ring * sides + side;
        const b = ring * sides + ((side + 1) % sides);
        indices.push(a, b, a + sides, b, b + sides, a + sides);
      }
    }
  }
  for (const end of [0, segments]) {
    const center = curve.getPointAt(end / segments);
    const cap = positions.length / 3;
    positions.push(center.x, center.y, center.z);
    for (let side = 0; side < sides; side++) {
      const a = end * sides + side;
      const b = end * sides + ((side + 1) % sides);
      indices.push(...(end === 0 ? [cap, b, a] : [cap, a, b]));
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

export function createTailGeometry(shape: MonsterDna["tail"], root: Point3) {
  if (shape === "none") return new THREE.BufferGeometry();
  const pieces: THREE.BufferGeometry[] = [];
  const sweep = (points: Point3[], radii: number[], flatten = 1) => {
    const geometry = taperedSweep(points, radii, 36);
    geometry.scale(flatten, 1, 1);
    pieces.push(geometry);
  };
  if (shape === "curly") {
    // A genuine open curl in side profile, not an indistinct spiral sausage.
    sweep(
      [
        [0, 0, -0.28],
        [0, 0.03, 0.26],
        [0, 0.34, 0.73],
        [0, 0.79, 0.61],
        [0, 0.83, 0.19],
        [0, 0.53, 0.09],
        [0, 0.43, 0.35],
      ],
      [0.24, 0.17, 0.12, 0.075, 0.015],
    );
  } else if (shape === "forked") {
    sweep(
      [
        [0, 0, -0.28],
        [0, 0.08, 0.4],
        [0, 0.2, 0.78],
      ],
      [0.26, 0.17, 0.12],
    );
    for (const side of [-1, 1]) {
      sweep(
        [
          [0, 0.17, 0.66],
          [side * 0.24, 0.28, 1],
          [side * 0.5, 0.45, 1.25],
        ],
        [0.15, 0.1, 0.01],
      );
    }
  } else if (shape === "fin") {
    sweep(
      [
        [0, 0, -0.28],
        [0, 0.04, 0.4],
        [0, 0.04, 0.82],
      ],
      [0.26, 0.15, 0.11],
    );
    for (const side of [-1, 1]) {
      sweep(
        [
          [0, 0.04, 0.66],
          [0, side * 0.27, 1],
          [0, side * 0.64, 1.24],
        ],
        [0.18, 0.27, 0.018],
        0.28,
      );
    }
  } else {
    const reach = shape === "whip" ? 1.8 : 1.18;
    sweep(
      [
        [0, 0, -0.28],
        [0, 0.02, 0.28],
        [0.08, 0.18, reach * 0.72],
        [0.18, 0.38, reach],
      ],
      [0.26, 0.18, 0.09, shape === "whip" ? 0.008 : 0.06],
    );
    if (shape === "club") {
      const club = new THREE.SphereGeometry(1, 24, 16);
      club.deleteAttribute("uv");
      club.scale(0.3, 0.32, 0.4);
      club.translate(0.16, 0.34, reach - 0.08);
      pieces.push(club);
    } else if (shape === "tuft") {
      sweep(
        [
          [0.08, 0.18, 0.83],
          [0.15, 0.4, 1.17],
          [0.16, 0.63, 1.39],
        ],
        [0.13, 0.28, 0.005],
        0.8,
      );
    }
  }
  const geometry = mergeGeometries(pieces)!;
  pieces.forEach((piece) => piece.dispose());
  geometry.translate(...root);
  return geometry;
}
