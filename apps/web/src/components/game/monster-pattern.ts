import * as THREE from "three";
import { PATTERNS, type MonsterDna } from "./monster-dna";
import type { Point3 } from "./monster-surface";

// Object-space fragment patterns stay crisp at either geometry LOD and follow
// the skin during animation. Vertex paint previously erased freckles/scales
// and made stripe edges depend on marching-cubes triangle density.
const patternShader = /* glsl */ `
varying vec3 vMonsterRest;
varying vec3 vMonsterNormal;
uniform vec3 monsterCenter;
uniform vec3 monsterExtent;
uniform vec3 monsterAccent;
uniform float monsterPattern;
uniform float monsterFoot;
uniform float monsterHasFeet;
uniform float monsterTailTip;

float edge(float threshold, float value) {
  float width = max(fwidth(value), 0.015);
  return smoothstep(threshold - width, threshold + width, value);
}
float dots(vec2 uv, float radius) {
  vec2 cell = floor(uv);
  vec2 jitter = vec2(sin(dot(cell, vec2(127.1, 311.7))), sin(dot(cell, vec2(269.5, 183.3)))) * 0.14;
  return 1.0 - edge(radius, length(fract(uv) - 0.5 - jitter));
}
float spotCoat(vec3 p, vec3 normal, float frequency, float radius) {
  vec3 weights = pow(abs(normal), vec3(6.0));
  weights /= max(dot(weights, vec3(1.0)), 0.001);
  return dot(weights, vec3(dots(p.yz * frequency, radius), dots(p.xz * frequency, radius), dots(p.xy * frequency, radius)));
}
float scallops(vec2 uv) {
  uv.x += mod(floor(uv.y), 2.0) * 0.5;
  vec2 tile = fract(uv) - vec2(0.5, 0.9);
  float arc = abs(length(tile * vec2(1.0, 0.85)) - 0.48);
  return (1.0 - edge(0.065, arc)) * smoothstep(-0.02, 0.12, fract(uv.y));
}
float coat(vec3 p, vec3 normal) {
  if (monsterPattern < 0.5) return 0.0;
  if (monsterPattern < 1.5) return spotCoat(p, normal, 2.8, 0.24);
  if (monsterPattern < 2.5) return edge(0.38, cos(p.z * 18.0 + sin(p.y * 3.0) * 0.6 + p.x * 0.5));
  if (monsterPattern < 3.5) {
    float patchField = sin(p.x * 3.1 + sin(p.z * 2.0)) + cos(p.y * 3.7 - p.z * 2.9);
    return smoothstep(0.1, 0.4, patchField);
  }
  if (monsterPattern < 4.5) {
    vec3 w = pow(abs(normal), vec3(6.0));
    w /= max(dot(w, vec3(1.0)), 0.001);
    return dot(w, vec3(scallops(p.zy * 4.5), scallops(p.xz * 4.5), scallops(p.xy * 4.5))) * 0.85;
  }
  if (monsterPattern < 5.5) return edge(0.55, cos(p.z * 22.0));
  if (monsterPattern < 6.5) {
    // Belly means underside, including the chest, not a face-only sticker.
    float under = 1.0 - smoothstep(-0.48, 0.12, p.y);
    float chest = (1.0 - smoothstep(0.2, 0.65, abs(p.x))) * (1.0 - smoothstep(-0.75, -0.2, p.z)) * (1.0 - smoothstep(0.1, 0.65, p.y));
    return max(under, chest) * (1.0 - smoothstep(1.05, 1.3, abs(p.z)));
  }
  if (monsterPattern < 7.5) return spotCoat(p, normal, 7.5, 0.17) * (1.0 - smoothstep(-0.2, 0.6, p.z));
  return smoothstep(0.05, 0.45, p.y) * (1.0 - smoothstep(0.4, 0.72, abs(p.z - 0.1)));
}
`;

export function createMonsterSkinMaterial(
  dna: MonsterDna,
  center: Point3,
  extent: Point3,
  primary: string,
  accent: string,
  footY: number,
  tailZ: number,
) {
  const material = new THREE.MeshStandardMaterial({
    color: primary,
    roughness: 0.72,
    metalness: 0,
  });
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, {
      monsterCenter: { value: new THREE.Vector3(...center) },
      monsterExtent: { value: new THREE.Vector3(...extent) },
      monsterAccent: { value: new THREE.Color(accent) },
      monsterPattern: { value: PATTERNS.indexOf(dna.pattern) },
      monsterFoot: { value: footY },
      monsterHasFeet: { value: dna.legs > 0 ? 1 : 0 },
      monsterTailTip: {
        value: ["tuft", "club", "fin"].includes(dna.tail) ? tailZ + 0.65 : 100,
      },
    });
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nvarying vec3 vMonsterRest;\nvarying vec3 vMonsterNormal;",
      )
      .replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\nvMonsterRest = position * 2.15 + vec3(0.0, 1.35, 0.0);\nvMonsterNormal = normal;",
      );
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\n${patternShader}`)
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        vec3 coatPosition = (vMonsterRest - monsterCenter) / monsterExtent;
        float pigment = coat(coatPosition, normalize(vMonsterNormal));
        float feet = monsterHasFeet * (1.0 - smoothstep(monsterFoot - 0.04, monsterFoot + 0.16, vMonsterRest.y));
        float tip = smoothstep(monsterTailTip, monsterTailTip + 0.25, vMonsterRest.z);
        diffuseColor.rgb = mix(diffuseColor.rgb, monsterAccent, clamp(max(pigment, max(feet * 0.82, tip)), 0.0, 1.0));`,
      );
  };
  material.customProgramCacheKey = () => "monster-skin-pattern-v1";
  return material;
}
