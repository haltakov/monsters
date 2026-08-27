import { MONSTER_ARCHETYPES } from "@/components/game/monster-archetypes";
import {
  ACCENT_COLORS,
  ADAPTATIONS,
  BODY_SHAPES,
  DIETS,
  EYE_COUNTS,
  HORN_SHAPES,
  LEG_COUNTS,
  LEG_SHAPES,
  MONSTER_COLORS,
  MONSTER_SIZES,
  MOUTH_SHAPES,
  PATTERNS,
  RESPIRATIONS,
  SOCIAL_BEHAVIORS,
  TAIL_SHAPES,
  type MonsterDna,
} from "@/components/game/monster-dna";

export const INITIAL_WILD_MONSTERS = 10;
export const EGG_HATCH_SECONDS = 30;
export const MATING_COOLDOWN_SECONDS = 120;
export const ADULT_AGE_SECONDS = 45;
export const MAX_WILD_MONSTERS = 24;

export type SimulationIntent =
  | "wander"
  | "forage"
  | "hunt"
  | "flee"
  | "socialize"
  | "mate"
  | "defend"
  | "rest";

export type SimulatedCreature = {
  id: string;
  name: string;
  dna: MonsterDna;
  generation: number;
  parentIds: [string, string] | null;
  x: number;
  y: number;
  z: number;
  yaw: number;
  energy: number;
  health: number;
  age: number;
  intent: SimulationIntent;
  targetId: string | null;
  wanderAngle: number;
  nextDecisionAt: number;
  attackCooldownUntil: number;
  forageCooldownUntil: number;
  mateCooldownUntil: number;
  lastAttackedAt: number;
  lastAttackerId: string | null;
  alive: boolean;
  deathAt: number | null;
};

export type SimulationEgg = {
  id: string;
  dna: MonsterDna;
  parentIds: [string, string];
  parentNames: [string, string];
  generation: number;
  x: number;
  y: number;
  z: number;
  laidAt: number;
  hatchAt: number;
  mutations: number;
};

export type GeneticMix = {
  dna: MonsterDna;
  mutations: number;
};

export type SimulationEvent = {
  kind: "birth" | "egg" | "fight" | "death";
  names: string[];
  mutations?: number;
};

export type SimulationSnapshot = {
  living: number;
  eggs: number;
  births: number;
  deaths: number;
  event: SimulationEvent | null;
};

const GENETIC_KEYS = [
  "body",
  "legs",
  "legShape",
  "eyes",
  "mouth",
  "size",
  "color",
  "accent",
  "pattern",
  "horns",
  "tail",
  "adaptation",
  "diet",
  "breathing",
  "social",
] as const satisfies ReadonlyArray<keyof MonsterDna>;

type GeneticKey = (typeof GENETIC_KEYS)[number];

const GENE_OPTIONS: Record<GeneticKey, readonly (string | number)[]> = {
  body: BODY_SHAPES,
  legs: LEG_COUNTS,
  legShape: LEG_SHAPES,
  eyes: EYE_COUNTS,
  mouth: MOUTH_SHAPES,
  size: MONSTER_SIZES,
  color: MONSTER_COLORS.map((color) => color.id),
  accent: ACCENT_COLORS.map((color) => color.id),
  pattern: PATTERNS,
  horns: HORN_SHAPES,
  tail: TAIL_SHAPES,
  adaptation: ADAPTATIONS,
  diet: DIETS,
  breathing: RESPIRATIONS,
  social: SOCIAL_BEHAVIORS,
};

const SIMILARITY_WEIGHTS: Record<GeneticKey, number> = {
  body: 1.5,
  legs: 1,
  legShape: 0.8,
  eyes: 0.45,
  mouth: 0.8,
  size: 1.15,
  color: 0.35,
  accent: 0.25,
  pattern: 0.35,
  horns: 0.55,
  tail: 0.6,
  adaptation: 1.1,
  diet: 1.45,
  breathing: 1.2,
  social: 1.35,
};

const FIRST_NAMES = [
  "Bramble",
  "Pebble",
  "Tumble",
  "Noodle",
  "Miso",
  "Sprout",
  "Mochi",
  "Puddle",
  "Cricket",
  "Bumble",
  "Truffle",
  "Ziggy",
] as const;

const LAST_NAMES = [
  "Snout",
  "Paws",
  "Wobble",
  "Whisk",
  "Munch",
  "Ripple",
  "Thump",
  "Blink",
] as const;

export function createSeededRandom(seed: number) {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

function pick<T>(options: readonly T[], random: () => number) {
  return options[
    Math.min(options.length - 1, Math.floor(random() * options.length))
  ];
}

function setGene(dna: MonsterDna, key: GeneticKey, value: string | number) {
  Object.assign(dna, { [key]: value });
}

function mutateGene(dna: MonsterDna, key: GeneticKey, random: () => number) {
  const current = dna[key];
  const alternatives = GENE_OPTIONS[key].filter((value) => value !== current);
  if (alternatives.length === 0) return false;
  setGene(dna, key, pick(alternatives, random));
  return true;
}

export function mixMonsterDna(
  first: MonsterDna,
  second: MonsterDna,
  random: () => number,
  mutationChance = 0.075,
): GeneticMix {
  const dna: MonsterDna = { ...first, mesh: "smooth" };
  let mutations = 0;

  for (const key of GENETIC_KEYS) {
    setGene(dna, key, random() < 0.5 ? first[key] : second[key]);
    const behavioralGene = key === "diet" || key === "social";
    const chance = mutationChance * (behavioralGene ? 0.7 : 1);
    if (random() < chance && mutateGene(dna, key, random)) mutations += 1;
  }

  // Organic mesh is the simulation's canonical phenotype. It is inherited as
  // an implementation detail rather than allowed to mutate into legacy parts.
  dna.mesh = "smooth";
  return { dna, mutations };
}

export function dnaSimilarity(first: MonsterDna, second: MonsterDna) {
  let matchingWeight = 0;
  let totalWeight = 0;
  for (const key of GENETIC_KEYS) {
    const weight = SIMILARITY_WEIGHTS[key];
    totalWeight += weight;
    if (first[key] === second[key]) matchingWeight += weight;
  }
  return matchingWeight / totalWeight;
}

export function getCreaturePower(dna: MonsterDna) {
  const size = dna.size === "large" ? 1.35 : dna.size === "small" ? 0.72 : 1;
  const mouth =
    dna.mouth === "fangs" || dna.mouth === "tusks"
      ? 1.28
      : dna.mouth === "beak"
        ? 1.12
        : 0.9;
  const armor =
    dna.adaptation === "shell" || dna.adaptation === "plates" ? 1.12 : 1;
  const horns = dna.horns === "none" || dna.horns === "buds" ? 1 : 1.12;
  return size * mouth * armor * horns;
}

export function getCreatureSpeed(dna: MonsterDna) {
  const size = dna.size === "large" ? 0.88 : dna.size === "small" ? 1.16 : 1;
  const legs = dna.legs === 0 ? 0.9 : dna.legs >= 6 ? 1.06 : 1;
  const shape =
    dna.legShape === "springy" ? 1.16 : dna.legShape === "stubby" ? 0.92 : 1;
  const adaptation = dna.adaptation === "wings" ? 1.12 : 1;
  return 3.05 * size * legs * shape * adaptation;
}

export function createInitialWildPopulation(
  count = INITIAL_WILD_MONSTERS,
  seed = 0x4d4f4e53,
) {
  const random = createSeededRandom(seed);
  const shuffled = [...MONSTER_ARCHETYPES]
    .map((archetype) => ({ archetype, order: random() }))
    .sort((first, second) => first.order - second.order)
    .slice(0, Math.min(6, MONSTER_ARCHETYPES.length));

  const population: SimulatedCreature[] = [];
  for (let index = 0; index < count; index += 1) {
    const base = shuffled[index % shuffled.length].archetype;
    const angle = random() * Math.PI * 2;
    const radius = 14 + random() * 34;
    const matchingAdult =
      index >= shuffled.length ? population[index % shuffled.length] : null;
    const creature: SimulatedCreature = {
      id: `wild-${index + 1}`,
      name: `${pick(FIRST_NAMES, random)} ${pick(LAST_NAMES, random)}`,
      dna: { ...base.dna, mesh: "smooth" },
      generation: 0,
      parentIds: null,
      x: matchingAdult
        ? matchingAdult.x + Math.cos(angle) * 4.2
        : Math.cos(angle) * radius,
      y: 0,
      z: matchingAdult
        ? matchingAdult.z + Math.sin(angle) * 4.2
        : Math.sin(angle) * radius,
      yaw: random() * Math.PI * 2,
      energy: 58 + random() * 38,
      health: 74 + random() * 26,
      age: ADULT_AGE_SECONDS + 20 + random() * 120,
      intent: "wander",
      targetId: null,
      wanderAngle: random() * Math.PI * 2,
      nextDecisionAt: 0,
      attackCooldownUntil: 0,
      forageCooldownUntil: 0,
      mateCooldownUntil:
        index === 0 || index === shuffled.length
          ? 6 + random() * 4
          : 18 + random() * 58,
      lastAttackedAt: -100,
      lastAttackerId: null,
      alive: true,
      deathAt: null,
    };
    population.push(creature);
  }
  return population;
}

export function createBabyName(
  firstParent: string,
  secondParent: string,
  random: () => number,
) {
  const firstWord = firstParent.split(" ")[0] || pick(FIRST_NAMES, random);
  const secondWord = secondParent.split(" ").at(-1) || pick(LAST_NAMES, random);
  if (random() < 0.55) return `${firstWord} ${secondWord}`;
  return `${pick(FIRST_NAMES, random)} ${secondWord}`;
}
