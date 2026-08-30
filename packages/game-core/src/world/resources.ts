import { createSeededRandom } from "../rng";
import { PLAYABLE_RADIUS, isWaterAt, riverX } from "./terrain";

export type EdibleKind = "tree" | "bush";
export type ResourceKind = EdibleKind | "prey";
export type ResourceHabitat = ResourceKind | "rock" | "plant" | "mixed";

export type Edible = {
  id: string;
  kind: EdibleKind;
  x: number;
  z: number;
  energy: number;
};

export type Prey = {
  id: string;
  x: number;
  z: number;
};

type HabitatRegion = {
  x: number;
  z: number;
  radiusX: number;
  radiusZ: number;
  strength: number;
};

const HABITAT_REGIONS: Record<ResourceHabitat, HabitatRegion[]> = {
  tree: [
    { x: -68, z: 45, radiusX: 45, radiusZ: 38, strength: 1 },
    { x: 67, z: 49, radiusX: 38, radiusZ: 48, strength: 0.94 },
    { x: 63, z: -61, radiusX: 44, radiusZ: 34, strength: 0.9 },
    { x: -75, z: -66, radiusX: 32, radiusZ: 38, strength: 0.72 },
  ],
  bush: [
    { x: -52, z: -52, radiusX: 48, radiusZ: 34, strength: 1 },
    { x: 35, z: 8, radiusX: 35, radiusZ: 42, strength: 0.92 },
    { x: -10, z: 76, radiusX: 44, radiusZ: 30, strength: 0.88 },
    { x: 76, z: -20, radiusX: 30, radiusZ: 45, strength: 0.7 },
  ],
  plant: [
    { x: -23, z: -34, radiusX: 47, radiusZ: 32, strength: 1 },
    { x: -5, z: 76, radiusX: 52, radiusZ: 27, strength: 0.94 },
    { x: 58, z: 16, radiusX: 38, radiusZ: 45, strength: 0.82 },
  ],
  rock: [
    { x: -82, z: 3, radiusX: 31, radiusZ: 54, strength: 1 },
    { x: 72, z: -62, radiusX: 42, radiusZ: 31, strength: 0.92 },
    { x: 18, z: 91, radiusX: 42, radiusZ: 25, strength: 0.76 },
  ],
  prey: [
    { x: -20, z: -34, radiusX: 54, radiusZ: 38, strength: 1 },
    { x: 44, z: 7, radiusX: 42, radiusZ: 46, strength: 0.9 },
    { x: -6, z: 78, radiusX: 50, radiusZ: 27, strength: 0.76 },
  ],
  mixed: [
    { x: -48, z: 34, radiusX: 62, radiusZ: 55, strength: 0.82 },
    { x: 52, z: -35, radiusX: 59, radiusZ: 58, strength: 0.82 },
  ],
};

const NO_GROWTH_REGIONS: Partial<Record<ResourceHabitat, HabitatRegion[]>> = {
  tree: [
    { x: -17, z: -33, radiusX: 31, radiusZ: 25, strength: 1 },
    { x: 39, z: 7, radiusX: 20, radiusZ: 28, strength: 1 },
  ],
  bush: [
    { x: -80, z: 2, radiusX: 25, radiusZ: 38, strength: 1 },
    { x: 68, z: 52, radiusX: 23, radiusZ: 30, strength: 1 },
  ],
  plant: [
    { x: -69, z: 46, radiusX: 28, radiusZ: 25, strength: 1 },
    { x: 72, z: -63, radiusX: 28, radiusZ: 23, strength: 1 },
  ],
  rock: [
    { x: -18, z: -33, radiusX: 32, radiusZ: 24, strength: 1 },
    { x: 35, z: 8, radiusX: 24, radiusZ: 30, strength: 1 },
  ],
  prey: [
    { x: -69, z: 46, radiusX: 27, radiusZ: 25, strength: 1 },
    { x: 71, z: -63, radiusX: 25, radiusZ: 22, strength: 1 },
  ],
};

const HABITAT_BASE_DENSITY: Record<ResourceHabitat, number> = {
  tree: 0.045,
  bush: 0.075,
  plant: 0.08,
  rock: 0.055,
  prey: 0.07,
  mixed: 0.18,
};

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value));
}

function regionInfluence(region: HabitatRegion, x: number, z: number) {
  const distanceSquared =
    ((x - region.x) / region.radiusX) ** 2 +
    ((z - region.z) / region.radiusZ) ** 2;
  return clamp01(1 - distanceSquared) * region.strength;
}

/**
 * Continuous habitat score used by both deterministic placement and regrowth.
 * The island deliberately has recognizable dense habitats and true clearings.
 */
export function resourceHabitatDensity(
  habitat: ResourceHabitat,
  x: number,
  z: number,
) {
  if (Math.hypot(x, z) >= PLAYABLE_RADIUS - 4 || isWaterAt(x, z)) return 0;
  if (Math.abs(x - riverX(z)) < 4.2) return 0;

  const exclusions = NO_GROWTH_REGIONS[habitat] ?? [];
  if (exclusions.some((region) => regionInfluence(region, x, z) > 0.58)) {
    return 0;
  }

  const regionalStrength = Math.max(
    0,
    ...HABITAT_REGIONS[habitat].map((region) => regionInfluence(region, x, z)),
  );
  const coastFade = clamp01((PLAYABLE_RADIUS - Math.hypot(x, z) - 4) / 13);
  return clamp01(
    (HABITAT_BASE_DENSITY[habitat] + regionalStrength * 0.95) *
      (0.55 + coastFade * 0.45),
  );
}

function habitatSpacing(habitat: ResourceHabitat) {
  if (habitat === "tree") return 5.1;
  if (habitat === "rock") return 4.3;
  if (habitat === "bush") return 3.15;
  if (habitat === "prey") return 5.5;
  return 2.5;
}

/** Deterministic, habitat-weighted scatter shared by visuals and food AI. */
export function scatterPositions(
  count: number,
  seed: number,
  habitat: ResourceHabitat = "mixed",
) {
  const random = createSeededRandom(seed);
  const positions: Array<[number, number]> = [];
  const innerRadius = 9;
  const outerRadius = PLAYABLE_RADIUS - 5;
  const minimumSpacing = habitatSpacing(habitat);
  let attempts = 0;

  while (positions.length < count && attempts < count * 1800) {
    attempts += 1;
    const angle = random() * Math.PI * 2;
    const radius = Math.sqrt(
      innerRadius ** 2 + random() * (outerRadius ** 2 - innerRadius ** 2),
    );
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    if (random() > resourceHabitatDensity(habitat, x, z)) continue;
    if (
      positions.some(
        ([otherX, otherZ]) =>
          Math.hypot(x - otherX, z - otherZ) < minimumSpacing,
      )
    ) {
      continue;
    }
    positions.push([x, z]);
  }

  if (positions.length !== count) {
    throw new Error(`Unable to place ${count} ${habitat} resources`);
  }
  return positions;
}

function scaledPositions(
  count: number,
  seed: number,
  habitat: ResourceHabitat,
  base: number,
  step: number,
  variants: number,
): Array<[number, number, number]> {
  return scatterPositions(count, seed, habitat).map(([x, z], index) => [
    x,
    z,
    base + (index % variants) * step,
  ]);
}

const TREE_POSITIONS = scaledPositions(128, 1847, "tree", 0.68, 0.065, 8);
export const TREES = TREE_POSITIONS.slice(0, 28);
export const EXTRA_TREES = TREE_POSITIONS.slice(28);

const BUSH_POSITIONS = scaledPositions(108, 7319, "bush", 0.58, 0.055, 7);
export const BUSHES = BUSH_POSITIONS.slice(0, 24);
export const EXTRA_BUSHES = BUSH_POSITIONS.slice(24);

const ROCK_POSITIONS: Array<[number, number, number, number]> =
  scatterPositions(80, 9923, "rock").map(([x, z], index) => [
    x,
    z,
    0.58 + (index % 8) * 0.075,
    ((index * 1.71) % Math.PI) - Math.PI / 2,
  ]);
export const ROCKS = ROCK_POSITIONS.slice(0, 16);
export const EXTRA_ROCKS = ROCK_POSITIONS.slice(16);

const PLANT_POSITIONS = scatterPositions(136, 4213, "plant");
export const PLANTS = PLANT_POSITIONS.slice(0, 24);
export const EXTRA_PLANTS = PLANT_POSITIONS.slice(24);

export const PREY: Prey[] = scatterPositions(16, 8191, "prey").map(
  ([x, z], index) => ({ id: `critter-${index}`, x, z }),
);

export const ALL_TREES = [...TREES, ...EXTRA_TREES];
export const ALL_BUSHES = [...BUSHES, ...EXTRA_BUSHES];

export const EDIBLES: Edible[] = [
  ...ALL_TREES.map(([x, z], index) => ({
    id: `tree-${index}`,
    kind: "tree" as const,
    x,
    z,
    energy: 42,
  })),
  ...ALL_BUSHES.map(([x, z], index) => ({
    id: `bush-${index}`,
    kind: "bush" as const,
    x,
    z,
    energy: 28,
  })),
];

export const EDIBLES_BY_ID: ReadonlyMap<string, Edible> = new Map(
  EDIBLES.map((edible) => [edible.id, edible]),
);

export const PREY_BY_ID: ReadonlyMap<string, Prey> = new Map(
  PREY.map((prey) => [prey.id, prey]),
);

/** Baseline seconds; actual regrowth adapts to scarcity and local habitat. */
export const EDIBLE_REGROW_SECONDS = 78;
export const BUSH_REGROW_SECONDS = 54;
export const PREY_REGROW_SECONDS = 108;

function stableResourceJitter(id: string) {
  let hash = 2166136261;
  for (const char of id) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return 0.9 + ((hash >>> 0) % 201) / 1000;
}

/**
 * Scarce resources return quickly; abundant ones pause longer. Fertile habitat
 * also regrows a little faster, while stable id jitter avoids mass pop-ins.
 */
export function adaptiveResourceRegrowSeconds(
  kind: ResourceKind,
  availableRatio: number,
  x: number,
  z: number,
  id: string,
) {
  const base =
    kind === "tree"
      ? EDIBLE_REGROW_SECONDS
      : kind === "bush"
        ? BUSH_REGROW_SECONDS
        : PREY_REGROW_SECONDS;
  const abundanceFactor = 0.48 + clamp01(availableRatio) * 0.98;
  const habitatFactor = 1.08 - resourceHabitatDensity(kind, x, z) * 0.22;
  return Math.max(
    18,
    base * abundanceFactor * habitatFactor * stableResourceJitter(id),
  );
}
