import type { MonsterDna } from "../dna/dna";
import { clamp, smoothstep } from "../mathx";

export const SECONDS_PER_HOUR = 3600;
export const MAX_LIFESPAN_HOURS = 12;
export const OLD_AGE_START = 0.75;

/** Functional DNA, not cosmetic genes, determines a reproducible lifespan. */
export function getCreatureLifespanHours(dna: MonsterDna): number {
  const bodyHours = {
    round: 6,
    bean: 5.5,
    long: 5,
    pig: 6,
    biped: 5,
    saurian: 7,
    rhino: 7.5,
    aquatic: 5,
    slug: 3,
    avian: 3.5,
  }[dna.body];
  const size = { tiny: 0.65, small: 0.8, medium: 1, large: 1.15, huge: 1.35 }[
    dna.size
  ];
  const build = dna.build === "sturdy" ? 1.2 : dna.build === "lean" ? 0.85 : 1;
  const armor =
    dna.adaptation === "shell" || dna.adaptation === "plates" ? 1.25 : 1;
  const metabolism =
    dna.adaptation === "wings" || dna.legShape === "springy" ? 0.9 : 1;
  const diet =
    dna.diet === "carnivore" ? 0.85 : dna.diet === "omnivore" ? 0.95 : 1;
  return (
    Math.round(
      clamp(
        bodyHours * size * build * armor * metabolism * diet,
        2,
        MAX_LIFESPAN_HOURS,
      ) * 100,
    ) / 100
  );
}

export function getCreatureMaxAge(dna: MonsterDna): number {
  return getCreatureLifespanHours(dna) * SECONDS_PER_HOUR;
}

/** Full speed for the first 75% of life, easing down to 40% at maximum age. */
export function getAgeSpeedMultiplier(
  dna: MonsterDna,
  ageSeconds: number,
): number {
  const fraction = Math.max(0, ageSeconds) / getCreatureMaxAge(dna);
  return 1 - 0.6 * smoothstep(fraction, OLD_AGE_START, 1);
}
