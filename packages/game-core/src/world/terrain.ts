import { clamp, smoothstep } from "../mathx";
import { canMonsterSwim, type MonsterDna } from "../dna/dna";

export const WORLD_AREA_MULTIPLIER = 10;
export const WORLD_SCALE = Math.sqrt(WORLD_AREA_MULTIPLIER);
export const WORLD_RADIUS = 40 * WORLD_SCALE;
export const PLAYABLE_RADIUS = 38.2 * WORLD_SCALE;
export const BRIDGE_POSITIONS = [-96, -58, -20, 20, 58, 96] as const;

export function riverX(z: number) {
  return 3.8 + Math.sin(z * 0.12) * 2.7;
}

export function terrainHeight(x: number, z: number) {
  const radius = Math.hypot(x, z);
  const edge = smoothstep(WORLD_RADIUS - radius, 0, 10);
  const hillA = Math.exp(-((x + 19) ** 2 + (z - 12) ** 2) / 130) * 3.1;
  const hillB = Math.exp(-((x - 20) ** 2 + (z + 15) ** 2) / 155) * 2.75;
  const hillC = Math.exp(-((x - 23) ** 2 + (z - 23) ** 2) / 145) * 2.2;
  const hillD = Math.exp(-((x + 15) ** 2 + (z + 24) ** 2) / 175) * 1.8;
  const hillE = Math.exp(-((x + 72) ** 2 + (z - 48) ** 2) / 510) * 2.65;
  const hillF = Math.exp(-((x - 77) ** 2 + (z + 54) ** 2) / 620) * 3.2;
  const hillG = Math.exp(-((x - 68) ** 2 + (z - 72) ** 2) / 560) * 2.4;
  const hillH = Math.exp(-((x + 79) ** 2 + (z + 66) ** 2) / 680) * 2.9;
  const hillI = Math.exp(-((x + 8) ** 2 + (z - 88) ** 2) / 470) * 2.15;
  const hillJ = Math.exp(-((x - 14) ** 2 + (z + 91) ** 2) / 530) * 2.35;
  const ripple = (Math.sin(x * 0.25) + Math.cos(z * 0.23)) * 0.07;
  const riverFlatten = smoothstep(Math.abs(x - riverX(z)), 0.7, 4);
  return Math.max(
    -0.12,
    (0.12 +
      (hillA +
        hillB +
        hillC +
        hillD +
        hillE +
        hillF +
        hillG +
        hillH +
        hillI +
        hillJ +
        ripple) *
        riverFlatten) *
      edge,
  );
}

export function isWaterAt(x: number, z: number) {
  if (Math.hypot(x, z) > PLAYABLE_RADIUS) return true;
  const bridge = BRIDGE_POSITIONS.some(
    (bridgeZ) => Math.abs(z - bridgeZ) < 1.45,
  );
  return Math.abs(x - riverX(z)) < 1.48 && !bridge;
}

export function waterBlendAt(x: number, z: number) {
  const radius = Math.hypot(x, z);
  const seaBlend = smoothstep(
    radius,
    PLAYABLE_RADIUS - 1.8,
    PLAYABLE_RADIUS + 2.4,
  );
  const riverDistance = Math.abs(x - riverX(z));
  const riverWidthBlend = 1 - smoothstep(riverDistance, 0.95, 2.35);
  const bridgeDistance = Math.min(
    ...BRIDGE_POSITIONS.map((bridgeZ) => Math.abs(z - bridgeZ)),
  );
  const bridgeOpeningBlend = smoothstep(bridgeDistance, 1.05, 2.15);
  return Math.max(seaBlend, riverWidthBlend * bridgeOpeningBlend);
}

/**
 * Authoritative movement gate. Swimmers may leave the island but never the
 * simulated ocean; everyone else is stopped by the river and the shoreline.
 */
export function isBlockedByWater(x: number, z: number, canSwim: boolean) {
  if (canSwim) return Math.hypot(x, z) > WORLD_RADIUS + 22;
  return isWaterAt(x, z);
}

export function isDeepWaterAt(x: number, z: number) {
  return Math.hypot(x, z) > PLAYABLE_RADIUS + 1.2;
}

/** Hard outer bound used to reject any position the server would not accept. */
export function isInsideWorldBounds(x: number, z: number, canSwim: boolean) {
  return !isBlockedByWater(x, z, canSwim);
}

export function clampToWorld(x: number, z: number) {
  const radius = Math.hypot(x, z);
  const limit = WORLD_RADIUS + 22;
  if (radius <= limit) return { x, z };
  const scale = limit / radius;
  return { x: x * scale, z: z * scale };
}

export function getMonsterSpawn(dna: MonsterDna) {
  if (canMonsterSwim(dna) && dna.adaptation !== "wings") {
    const x = PLAYABLE_RADIUS + 4.5;
    return { x, y: -0.9, z: 0, mode: "swim" as const };
  }
  return {
    x: -8,
    y: terrainHeight(-8, 8),
    z: 8,
    mode: "land" as const,
  };
}

export { clamp };
