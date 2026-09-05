import { clamp, smoothstep } from "../mathx";
import { canMonsterSwim, type MonsterDna } from "../dna/dna";

export const WORLD_AREA_MULTIPLIER = 10;
export const WORLD_SCALE = Math.sqrt(WORLD_AREA_MULTIPLIER);
/** Radius of the original island, retained for existing scenery coordinates. */
export const WORLD_RADIUS = 40 * WORLD_SCALE;
export const PLAYABLE_RADIUS = 38.2 * WORLD_SCALE;
export const OCEAN_RADIUS = 620;
export const SEA_LEVEL = -0.42;
export const FLIGHT_CEILING = 85;
export const BRIDGE_POSITIONS = [-96, -58, -20, 20, 58, 96] as const;
export const ISLANDS = [
  { id: "home", x: 0, z: 0, radius: PLAYABLE_RADIUS, color: "#72B95A" },
  { id: "lakes", x: -330, z: -80, radius: 102, color: "#69AA78" },
  { id: "peaks", x: 250, z: 260, radius: 106, color: "#8CA278" },
] as const;
export type Island = (typeof ISLANDS)[number];

export function islandAt(x: number, z: number): Island | undefined {
  return ISLANDS.find(
    (island) => Math.hypot(x - island.x, z - island.z) <= island.radius,
  );
}

export function riverX(z: number) {
  return 3.8 + Math.sin(z * 0.12) * 2.7;
}

function homeHeight(x: number, z: number) {
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

function inlandWaterDepth(x: number, z: number, island: Island) {
  const lx = x - island.x;
  const lz = z - island.z;
  if (island.id === "home") {
    const bridge = BRIDGE_POSITIONS.some(
      (bridgeZ) => Math.abs(z - bridgeZ) < 1.45,
    );
    return Math.abs(x - riverX(z)) < 1.48 && !bridge ? 3.8 : 0;
  }
  if (island.id === "lakes") {
    const lakeA = Math.hypot((lx + 28) / 25, (lz - 18) / 32);
    const lakeB = Math.hypot((lx - 28) / 20, (lz + 26) / 24);
    const lake = Math.min(lakeA, lakeB);
    if (lake < 1) return 2 + (1 - lake) * 12;
    if (Math.abs(lx - Math.sin(lz * 0.045) * 18) < 3.4) return 4.5;
  }
  return 0;
}

export function isWaterAt(x: number, z: number) {
  const island = islandAt(x, z);
  return !island || inlandWaterDepth(x, z, island) > 0;
}

/** Solid ground on islands, river/lake beds inland, and an actual ocean floor. */
export function terrainHeight(x: number, z: number) {
  const island = islandAt(x, z);
  if (!island) {
    const shore = Math.min(
      ...ISLANDS.map(
        (item) => Math.hypot(x - item.x, z - item.z) - item.radius,
      ),
    );
    return (
      SEA_LEVEL -
      2 -
      smoothstep(shore, 0, 35) *
        (24 + 5 * Math.sin(x * 0.018) * Math.cos(z * 0.022))
    );
  }
  const depth = inlandWaterDepth(x, z, island);
  if (depth > 0) return SEA_LEVEL - depth;
  if (island.id === "home") return homeHeight(x, z);
  const lx = x - island.x;
  const lz = z - island.z;
  const edge = smoothstep(island.radius - Math.hypot(lx, lz), 0, 16);
  if (island.id === "lakes")
    return (
      0.12 + edge * (0.7 + Math.sin(lx * 0.05) * Math.cos(lz * 0.045) * 0.65)
    );
  const peak = (cx: number, cz: number, height: number, width: number) =>
    height * Math.exp(-((lx - cx) ** 2 + (lz - cz) ** 2) / width);
  return (
    0.12 +
    edge *
      (peak(-24, 16, 29, 470) + peak(26, -18, 23, 380) + peak(8, 42, 17, 310))
  );
}

export function waterBlendAt(x: number, z: number) {
  return isWaterAt(x, z) ? 1 : 0;
}

export function isBlockedByWater(x: number, z: number, canSwim: boolean) {
  return Math.hypot(x, z) > OCEAN_RADIUS || (!canSwim && isWaterAt(x, z));
}

export function isDeepWaterAt(x: number, z: number) {
  return isWaterAt(x, z) && SEA_LEVEL - terrainHeight(x, z) > 2.5;
}

export function swimmingFloor(x: number, z: number) {
  return Math.min(SEA_LEVEL - 0.75, terrainHeight(x, z) + 0.9);
}

export function isInsideWorldBounds(x: number, z: number, canSwim: boolean) {
  return !isBlockedByWater(x, z, canSwim);
}

export function clampToWorld(x: number, z: number) {
  const radius = Math.hypot(x, z);
  if (radius <= OCEAN_RADIUS) return { x, z };
  const scale = OCEAN_RADIUS / radius;
  return { x: x * scale, z: z * scale };
}

export function getMonsterSpawn(dna: MonsterDna) {
  if (canMonsterSwim(dna) && dna.adaptation !== "wings") {
    return {
      x: PLAYABLE_RADIUS + 8,
      y: SEA_LEVEL - 1,
      z: 0,
      mode: "swim" as const,
    };
  }
  return { x: -8, y: terrainHeight(-8, 8), z: 8, mode: "land" as const };
}

export { clamp };
