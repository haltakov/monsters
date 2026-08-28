import { MONSTER_ARCHETYPES } from "../dna/archetypes";
import {
  ACCENT_COLORS,
  ADAPTATIONS,
  BODY_SHAPES,
  DIETS,
  EAR_SHAPES,
  EYE_COUNTS,
  HORN_SHAPES,
  LEG_COUNTS,
  LEG_SHAPES,
  MONSTER_BUILDS,
  MONSTER_COLORS,
  MONSTER_SIZES,
  MOUTH_SHAPES,
  PATTERNS,
  RESPIRATIONS,
  SOCIAL_BEHAVIORS,
  TAIL_SHAPES,
  type MonsterDna,
} from "../dna/dna";
import { pickRandom } from "../rng";

export const INITIAL_WILD_MONSTERS = 10;
export const EGG_HATCH_SECONDS = 30;
export const MATING_COOLDOWN_SECONDS = 120;
export const ADULT_AGE_SECONDS = 45;

export type GeneticMix = {
  dna: MonsterDna;
  mutations: number;
};

const GENETIC_KEYS = [
  "body",
  "legs",
  "legShape",
  "eyes",
  "mouth",
  "size",
  "build",
  "color",
  "accent",
  "pattern",
  "horns",
  "ears",
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
  build: MONSTER_BUILDS,
  color: MONSTER_COLORS.map((color) => color.id),
  accent: ACCENT_COLORS.map((color) => color.id),
  pattern: PATTERNS,
  horns: HORN_SHAPES,
  ears: EAR_SHAPES,
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
  build: 0.9,
  color: 0.35,
  accent: 0.25,
  pattern: 0.35,
  horns: 0.55,
  ears: 0.35,
  tail: 0.6,
  adaptation: 1.1,
  diet: 1.45,
  breathing: 1.2,
  social: 1.35,
};

export const FIRST_NAMES = [
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

export const LAST_NAMES = [
  "Snout",
  "Paws",
  "Wobble",
  "Whisk",
  "Munch",
  "Ripple",
  "Thump",
  "Blink",
] as const;

function setGene(dna: MonsterDna, key: GeneticKey, value: string | number) {
  Object.assign(dna, { [key]: value });
}

function mutateGene(dna: MonsterDna, key: GeneticKey, random: () => number) {
  const current = dna[key];
  const alternatives = GENE_OPTIONS[key].filter((value) => value !== current);
  if (alternatives.length === 0) return false;
  setGene(dna, key, pickRandom(alternatives, random));
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
  const size =
    dna.size === "huge"
      ? 1.58
      : dna.size === "large"
        ? 1.35
        : dna.size === "small"
          ? 0.72
          : dna.size === "tiny"
            ? 0.52
            : 1;
  const mouth =
    dna.mouth === "fangs" || dna.mouth === "tusks"
      ? 1.28
      : dna.mouth === "beak"
        ? 1.12
        : 0.9;
  const armor =
    dna.adaptation === "shell" || dna.adaptation === "plates" ? 1.12 : 1;
  const horns = dna.horns === "none" || dna.horns === "buds" ? 1 : 1.12;
  const build = dna.build === "sturdy" ? 1.12 : dna.build === "lean" ? 0.92 : 1;
  return size * mouth * armor * horns * build;
}

export function getCreatureSpeed(dna: MonsterDna) {
  const size =
    dna.size === "huge"
      ? 0.78
      : dna.size === "large"
        ? 0.88
        : dna.size === "small"
          ? 1.16
          : dna.size === "tiny"
            ? 1.25
            : 1;
  const legs = dna.legs === 0 ? 0.9 : dna.legs >= 6 ? 1.06 : 1;
  const shape =
    dna.legShape === "springy"
      ? 1.16
      : dna.legShape === "stilt"
        ? 1.1
        : dna.legShape === "stubby"
          ? 0.92
          : 1;
  const adaptation = dna.adaptation === "wings" ? 1.12 : 1;
  const build = dna.build === "lean" ? 1.08 : dna.build === "sturdy" ? 0.94 : 1;
  return 3.05 * size * legs * shape * adaptation * build;
}

export function createRandomName(random: () => number) {
  return `${pickRandom(FIRST_NAMES, random)} ${pickRandom(LAST_NAMES, random)}`;
}

export function createBabyName(
  firstParent: string,
  secondParent: string,
  random: () => number,
) {
  const firstWord =
    firstParent.split(" ")[0] || pickRandom(FIRST_NAMES, random);
  const secondWord =
    secondParent.split(" ").at(-1) || pickRandom(LAST_NAMES, random);
  if (random() < 0.55) return `${firstWord} ${secondWord}`;
  return `${pickRandom(FIRST_NAMES, random)} ${secondWord}`;
}

export { MONSTER_ARCHETYPES };
