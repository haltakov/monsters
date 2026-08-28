import { createSeededRandom } from "../rng";
import { PLAYABLE_RADIUS, riverX } from "./terrain";

export type EdibleKind = "tree" | "bush";

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

export const TREES: Array<[number, number, number]> = [
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
  [-31, -16, 1.1],
  [-29, 10, 0.94],
  [-24, 25, 1.18],
  [-12, 31, 0.86],
  [5, 33, 1.08],
  [23, 27, 0.96],
  [31, 14, 1.16],
  [32, -11, 0.88],
  [24, -28, 1.06],
  [-19, -29, 0.92],
];

export const BUSHES: Array<[number, number, number]> = [
  [-16, 2, 0.9],
  [-12, -15, 0.75],
  [-6, 11, 0.8],
  [8, 20, 0.9],
  [15, 6, 0.75],
  [18, -13, 0.8],
  [7, -18, 0.65],
  [-20, -5, 0.75],
  [-31, 2, 0.86],
  [-26, -24, 0.72],
  [-18, 29, 0.82],
  [1, 29, 0.76],
  [18, 28, 0.9],
  [30, 5, 0.78],
  [28, -22, 0.84],
  [8, -32, 0.7],
];

export const ROCKS: Array<[number, number, number, number]> = [
  [-17, 9, 0.8, 0.4],
  [-9, -17, 1.1, -0.3],
  [-4, 15, 0.65, 0.2],
  [10, 11, 0.9, 0.6],
  [17, -2, 1.2, -0.2],
  [4, -14, 0.7, 0.35],
  [-30, -8, 1.1, 0.2],
  [-25, 22, 0.82, -0.45],
  [-6, 31, 1.28, 0.1],
  [21, 26, 0.92, 0.52],
  [31, -14, 1.16, -0.18],
  [17, -30, 0.88, 0.36],
];

export const PLANTS: Array<[number, number]> = [
  [-8, 7],
  [-14, -8],
  [-18, 15],
  [8, 6],
  [14, 13],
  [16, -10],
  [4, -19],
  [-2, 19],
  [-29, 7],
  [-25, -21],
  [-16, 30],
  [0, 33],
  [20, 29],
  [30, 9],
  [27, -23],
  [-3, -32],
];

export const PREY: Prey[] = [
  { id: "critter-0", x: -4.5, z: 8 },
  { id: "critter-1", x: -15, z: -5 },
  { id: "critter-2", x: 12, z: 9 },
  { id: "critter-3", x: 20, z: -18 },
  { id: "critter-4", x: -27, z: 20 },
  { id: "critter-5", x: 32, z: 27 },
  { id: "critter-6", x: -43, z: -34 },
  { id: "critter-7", x: 51, z: 38 },
  { id: "critter-8", x: -62, z: 49 },
  { id: "critter-9", x: 72, z: -52 },
];

/** Deterministic scatter used for both the visual props and the food graph. */
export function scatterPositions(count: number, seed: number) {
  const random = createSeededRandom(seed);
  const positions: Array<[number, number]> = [];
  const innerRadius = 36;
  const outerRadius = PLAYABLE_RADIUS - 5;

  while (positions.length < count) {
    const angle = random() * Math.PI * 2;
    const radius = Math.sqrt(
      innerRadius ** 2 + random() * (outerRadius ** 2 - innerRadius ** 2),
    );
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    if (Math.abs(x - riverX(z)) < 4.2) continue;
    positions.push([x, z]);
  }

  return positions;
}

export const EXTRA_TREES: Array<[number, number, number]> = scatterPositions(
  78,
  1847,
).map(([x, z], index) => [x, z, 0.72 + (index % 7) * 0.075]);

export const EXTRA_BUSHES: Array<[number, number, number]> = scatterPositions(
  68,
  7319,
).map(([x, z], index) => [x, z, 0.62 + (index % 6) * 0.06]);

export const EXTRA_ROCKS: Array<[number, number, number, number]> =
  scatterPositions(52, 9923).map(([x, z], index) => [
    x,
    z,
    0.62 + (index % 8) * 0.08,
    ((index * 1.71) % Math.PI) - Math.PI / 2,
  ]);

export const EXTRA_PLANTS = scatterPositions(86, 4213);
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

/**
 * Seconds a resource stays depleted before the persistent world regrows it.
 * The single-player prototype removed food permanently; a world that runs for
 * days needs it back.
 */
export const EDIBLE_REGROW_SECONDS = 150;
export const PREY_REGROW_SECONDS = 210;
