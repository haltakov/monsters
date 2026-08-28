/**
 * Compatibility surface for the browser. The ecosystem simulation itself now
 * runs on the server; the client keeps only the shared constants and pure
 * helpers it needs for HUD text and rendering.
 */
export {
  ADULT_AGE_SECONDS,
  EGG_HATCH_SECONDS,
  INITIAL_WILD_MONSTERS,
  MATING_COOLDOWN_SECONDS,
  createBabyName,
  createSeededRandom,
  dnaSimilarity,
  getCreaturePower,
  getCreatureSpeed,
  mixMonsterDna,
} from "@monsters/game-core";

export type { GeneticMix } from "@monsters/game-core";
