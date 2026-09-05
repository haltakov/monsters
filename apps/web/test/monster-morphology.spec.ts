import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";
import {
  ADAPTATIONS,
  DEFAULT_MONSTER_DNA,
  TAIL_SHAPES,
} from "@/components/game/monster-dna";
import {
  AUDIT_COMPARISONS,
  AUDIT_SPECIMENS,
} from "@/components/game/monster-audit-data";
import {
  BODY_PROFILES,
  buildSmoothGeometry,
} from "@/components/game/monster-model";
import {
  MonsterSurface,
  getMonsterSurface,
} from "@/components/game/monster-surface";
import {
  createTailGeometry,
  taperedSweep,
} from "@/components/game/monster-appendages";
import { createMonsterSkinMaterial } from "@/components/game/monster-pattern";

function openEdges(geometry: THREE.BufferGeometry) {
  const edges = new Map<string, number>();
  const index = geometry.index!;
  for (let i = 0; i < index.count; i += 3) {
    const triangle = [index.getX(i), index.getX(i + 1), index.getX(i + 2)];
    if (new Set(triangle).size < 3) continue;
    for (let edge = 0; edge < 3; edge++) {
      const a = triangle[edge],
        b = triangle[(edge + 1) % 3];
      const key = a < b ? `${a}:${b}` : `${b}:${a}`;
      edges.set(key, (edges.get(key) ?? 0) + 1);
    }
  }
  return [...edges.values()].filter((count) => count === 1).length;
}

describe("skin-fitted monster morphology", () => {
  it("exercises every adaptation in the deterministic random gallery", () => {
    expect(new Set(AUDIT_SPECIMENS.map(({ dna }) => dna.adaptation))).toEqual(
      new Set(ADAPTATIONS),
    );
  });
  it("projects to the finished skin and falls back to it for off-silhouette requests", () => {
    const geometry = new THREE.SphereGeometry(1, 24, 16);
    const surface = new MonsterSurface(geometry, 1, 0);
    const top = surface.at([0, 2, 0], [0, 1, 0], 0.04);
    expect(top.position[1]).toBeCloseTo(0.96, 4);
    expect(top.normal.length()).toBeCloseTo(1);
    const fallback = surface.at([8, 8, 8], [0, 1, 0], 0);
    expect(new THREE.Vector3(...fallback.position).length()).toBeCloseTo(1, 4);
    expect(surface.at([0, 2, 0], [0, 1, 0], 0.04)).toBe(top);
    geometry.dispose();
  });

  it("builds valid, closed, normalized skins for 100 DNA at both detail levels", () => {
    const failures: string[] = [];
    for (const quality of ["hero", "remote"] as const) {
      for (const { id, dna } of AUDIT_SPECIMENS) {
        const geometry = buildSmoothGeometry(dna, quality);
        const positions = geometry.getAttribute("position");
        const normals = geometry.getAttribute("normal");
        const indices = geometry.getAttribute("skinIndex");
        const weights = geometry.getAttribute("skinWeight");
        const boneCount =
          1 +
          dna.legs +
          (dna.body === "biped" ? 2 : 0) +
          (dna.tail === "none" ? 0 : 1);
        if (
          positions.count < 100 ||
          !Number.isFinite(geometry.userData.minimumWorldY)
        )
          failures.push(`${quality}/${id}: empty skin`);
        for (let i = 0; i < positions.count; i++) {
          const values = [
            positions.getX(i),
            positions.getY(i),
            positions.getZ(i),
            normals.getX(i),
            normals.getY(i),
            normals.getZ(i),
          ];
          const sum =
            weights.getX(i) +
            weights.getY(i) +
            weights.getZ(i) +
            weights.getW(i);
          if (
            !values.every(Number.isFinite) ||
            Math.abs(sum - 1) > 1e-5 ||
            indices.getX(i) >= boneCount
          ) {
            failures.push(`${quality}/${id}: invalid vertex ${i}`);
            break;
          }
        }
        const holes = openEdges(geometry);
        if (holes) failures.push(`${quality}/${id}: ${holes} open edges`);
        const profile = BODY_PROFILES[dna.body];
        const anchor = getMonsterSurface(geometry).at(
          [0, profile.horn[0], profile.horn[1]],
          [0, 1, 0],
        );
        if (!anchor.position.every(Number.isFinite))
          failures.push(`${quality}/${id}: invalid horn anchor`);
      }
    }
    expect(failures).toEqual([]);
  }, 120_000);

  it("shares topology across colors/patterns without sharing material state", () => {
    const a = buildSmoothGeometry(DEFAULT_MONSTER_DNA, "remote");
    const b = buildSmoothGeometry(
      {
        ...DEFAULT_MONSTER_DNA,
        color: "berry",
        pattern: "scales",
        accent: "ink",
      },
      "remote",
    );
    expect(a).toBe(b);
    expect(a.getAttribute("color")).toBeUndefined();
    const profile = BODY_PROFILES.round;
    const material = createMonsterSkinMaterial(
      DEFAULT_MONSTER_DNA,
      profile.center,
      profile.scale,
      "#8FCB69",
      "#FFB66E",
      0.12,
      1,
    );
    const shader = {
      uniforms: {},
      vertexShader: "#include <common>\n#include <begin_vertex>",
      fragmentShader: "#include <common>\n#include <color_fragment>",
    };
    material.onBeforeCompile(
      shader as unknown as THREE.WebGLProgramParametersWithUniforms,
      {} as THREE.WebGLRenderer,
    );
    expect(shader.vertexShader).toContain("vMonsterRest = position");
    expect(shader.fragmentShader).toContain("fwidth");
    expect(shader.fragmentShader).toContain("monsterAccent");
    material.dispose();
  });

  it("keeps every visible foot shape geometrically distinct", () => {
    const signatures = AUDIT_COMPARISONS.feet.map(({ dna }) => {
      const geometry = buildSmoothGeometry(dna);
      const position = geometry.getAttribute("position");
      return `${position.count}:${geometry.userData.minimumWorldY}`;
    });
    expect(new Set(signatures).size).toBe(AUDIT_COMPARISONS.feet.length);
    const stubby = buildSmoothGeometry(AUDIT_COMPARISONS.feet[0].dna);
    const stilt = buildSmoothGeometry(AUDIT_COMPARISONS.feet[6].dna);
    expect(stilt.userData.minimumWorldY).toBeLessThan(
      stubby.userData.minimumWorldY - 0.2,
    );
  });

  it("does not drag the upper torso's attachment roots with the arms", () => {
    const dna = { ...DEFAULT_MONSTER_DNA, body: "biped" as const };
    const profile = BODY_PROFILES.biped;
    const geometry = buildSmoothGeometry(dna, "remote");
    const positions = geometry.getAttribute("position");
    const indices = geometry.getAttribute("skinIndex");
    const weights = geometry.getAttribute("skinWeight");
    const shoulderTop = profile.center[1] + profile.scale[1] * 0.26 + 0.08;
    let weightedUpperVertices = 0;
    for (let i = 0; i < positions.count; i++) {
      const armIndex = indices.getX(i);
      if (
        positions.getY(i) * 2.15 + 1.35 > shoulderTop &&
        armIndex > dna.legs &&
        armIndex <= dna.legs + 2 &&
        weights.getX(i) > 0.00001
      )
        weightedUpperVertices++;
    }
    expect(weightedUpperVertices).toBe(0);
  });
});

describe("analytic appendages", () => {
  it.each(TAIL_SHAPES.filter((shape) => shape !== "none"))(
    "keeps %s tails closed and deterministic",
    (shape) => {
      const first = createTailGeometry(shape, [0, 1, 1]);
      const second = createTailGeometry(shape, [0, 1, 1]);
      expect(first.getAttribute("position").array).toEqual(
        second.getAttribute("position").array,
      );
      const positionsOnly = new THREE.BufferGeometry();
      positionsOnly.setAttribute("position", first.getAttribute("position"));
      positionsOnly.setIndex(first.index);
      const welded = mergeVertices(positionsOnly, 0.00001);
      expect(openEdges(welded)).toBe(0);
      first.computeBoundingBox();
      const bounds = first.boundingBox!;
      expect(bounds.max.z - bounds.min.z).toBeGreaterThan(1);
      if (shape === "fin")
        expect(bounds.max.y - bounds.min.y).toBeGreaterThan(1.1);
      if (shape === "forked")
        expect(bounds.max.x - bounds.min.x).toBeGreaterThan(0.95);
      first.dispose();
      second.dispose();
      positionsOnly.dispose();
      welded.dispose();
    },
  );

  it("winds the sweep outward and caps both ends", () => {
    const geometry = taperedSweep(
      [
        [0, 0, 0],
        [0, 1, 0],
        [0, 2, 0],
      ],
      [0.2, 0.15, 0.01],
    );
    expect(openEdges(geometry)).toBe(0);
    const p = geometry.getAttribute("position"),
      n = geometry.getAttribute("normal");
    expect(p.getX(20) * n.getX(20) + p.getZ(20) * n.getZ(20)).toBeGreaterThan(
      0,
    );
    geometry.dispose();
  });
});
