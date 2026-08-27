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
} from "@/components/game/monster-dna";
import { createSeededRandom } from "@/components/game/monster-simulation";

export type AuditSpecimen = {
  id: number;
  dna: MonsterDna;
};

function pick<T>(options: readonly T[], random: () => number) {
  return options[
    Math.min(options.length - 1, Math.floor(random() * options.length))
  ];
}

export function createAuditSpecimens(count = 100, seed = 0x5a17c0de) {
  const random = createSeededRandom(seed);
  const seen = new Set<string>();
  const specimens: AuditSpecimen[] = [];

  for (let index = 0; index < count; index += 1) {
    let attempt = 0;
    let dna: MonsterDna;
    let signature: string;
    do {
      dna = {
        body: pick(BODY_SHAPES, random),
        legs: pick(LEG_COUNTS, random),
        legShape: pick(LEG_SHAPES, random),
        eyes: pick(EYE_COUNTS, random),
        mouth: pick(MOUTH_SHAPES, random),
        size: pick(MONSTER_SIZES, random),
        build: pick(MONSTER_BUILDS, random),
        color: pick(MONSTER_COLORS, random).id,
        accent: pick(ACCENT_COLORS, random).id,
        pattern: pick(PATTERNS, random),
        // Attachment genes deliberately cycle as well as randomize so every
        // family is exercised repeatedly in each reproducible 100-model run.
        horns:
          HORN_SHAPES[
            (index + attempt + Math.floor(random() * 3)) % HORN_SHAPES.length
          ],
        ears: EAR_SHAPES[
          (index * 2 + attempt + Math.floor(random() * 2)) % EAR_SHAPES.length
        ],
        tail: TAIL_SHAPES[
          (index * 3 + attempt + Math.floor(random() * 3)) % TAIL_SHAPES.length
        ],
        adaptation:
          ADAPTATIONS[
            (index * 4 + attempt + Math.floor(random() * 3)) %
              ADAPTATIONS.length
          ],
        diet: pick(DIETS, random),
        breathing: pick(RESPIRATIONS, random),
        social: pick(SOCIAL_BEHAVIORS, random),
        mesh: "smooth",
      };
      signature = JSON.stringify(dna);
      attempt += 1;
    } while (seen.has(signature));

    seen.add(signature);
    specimens.push({ id: index + 1, dna });
  }

  return specimens;
}

export const AUDIT_SPECIMENS = createAuditSpecimens();
