export const BODY_SHAPES = [
  "round",
  "bean",
  "long",
  "pig",
  "biped",
  "saurian",
  "rhino",
  "aquatic",
  "slug",
  "avian",
] as const;
export const LEG_COUNTS = [0, 2, 4, 6, 8, 10] as const;
export const LEG_SHAPES = [
  "stubby",
  "hoof",
  "springy",
  "clawed",
  "flippers",
  "paws",
  "stilt",
] as const;
export const EYE_COUNTS = [1, 2, 3, 4, 5, 6, 8, 10] as const;
export const MOUTH_SHAPES = [
  "smile",
  "fangs",
  "beak",
  "snout",
  "tusks",
  "mandibles",
  "tongue",
] as const;
export const MONSTER_SIZES = [
  "tiny",
  "small",
  "medium",
  "large",
  "huge",
] as const;
export const MONSTER_BUILDS = ["lean", "balanced", "sturdy"] as const;
export const PATTERNS = [
  "plain",
  "spots",
  "stripes",
  "patches",
  "scales",
  "rings",
  "belly",
] as const;
export const HORN_SHAPES = [
  "none",
  "buds",
  "spikes",
  "rhino",
  "antlers",
  "single",
  "ram",
] as const;
export const EAR_SHAPES = [
  "none",
  "round",
  "pointed",
  "floppy",
  "fan",
] as const;
export const TAIL_SHAPES = [
  "none",
  "tuft",
  "curly",
  "club",
  "fin",
  "whip",
  "forked",
] as const;
export const ADAPTATIONS = [
  "none",
  "fins",
  "wings",
  "shell",
  "plates",
  "mane",
  "antennae",
] as const;
export const DIETS = ["herbivore", "carnivore", "omnivore"] as const;
export const RESPIRATIONS = ["lungs", "gills", "both"] as const;
export const SOCIAL_BEHAVIORS = ["solitary", "pair", "pack", "army"] as const;
export const MESH_STYLES = ["classic", "smooth"] as const;

export const MONSTER_COLORS = [
  { id: "moss", label: "Moss", hex: "#8FCB69", dark: "#679D4D" },
  { id: "berry", label: "Berry", hex: "#B87BC9", dark: "#81539B" },
  { id: "lagoon", label: "Lagoon", hex: "#55B8CE", dark: "#347F9B" },
  { id: "mango", label: "Mango", hex: "#F2B85B", dark: "#C47B38" },
  { id: "coral", label: "Coral", hex: "#F18C73", dark: "#BA5E5B" },
  { id: "moon", label: "Moon", hex: "#D9D7CB", dark: "#8C928A" },
  { id: "midnight", label: "Midnight", hex: "#53618F", dark: "#333B66" },
  { id: "glacier", label: "Glacier", hex: "#A9DCE8", dark: "#5F9EB2" },
  { id: "ember", label: "Ember", hex: "#D9684B", dark: "#98422F" },
  { id: "bubblegum", label: "Bubblegum", hex: "#EF9BC0", dark: "#B8618B" },
  { id: "cocoa", label: "Cocoa", hex: "#A97855", dark: "#684936" },
  { id: "lime", label: "Lime", hex: "#B6D94A", dark: "#758F2D" },
  { id: "obsidian", label: "Obsidian", hex: "#434A57", dark: "#232833" },
  { id: "snow", label: "Snow", hex: "#F1EFE8", dark: "#A6A9A4" },
  { id: "gold", label: "Gold", hex: "#E8C04F", dark: "#A97924" },
  { id: "ocean", label: "Ocean", hex: "#357FB8", dark: "#234F78" },
  { id: "plum", label: "Plum", hex: "#87537E", dark: "#573650" },
  { id: "rust", label: "Rust", hex: "#B75F3A", dark: "#743820" },
] as const;

export const ACCENT_COLORS = [
  { id: "peach", label: "Peach", hex: "#FFB66E" },
  { id: "lemon", label: "Lemon", hex: "#F3D65C" },
  { id: "mint", label: "Mint", hex: "#A9E0B1" },
  { id: "sky", label: "Sky", hex: "#9ED8E5" },
  { id: "pink", label: "Pink", hex: "#F3A6B7" },
  { id: "cream", label: "Cream", hex: "#FFF3D4" },
  { id: "violet", label: "Violet", hex: "#AFA0E8" },
  { id: "cherry", label: "Cherry", hex: "#E76363" },
  { id: "aqua", label: "Aqua", hex: "#66D8CF" },
  { id: "white", label: "White", hex: "#FFFDF5" },
  { id: "ink", label: "Ink", hex: "#24303D" },
  { id: "silver", label: "Silver", hex: "#C3CBD1" },
  { id: "orange", label: "Orange", hex: "#F28A3C" },
  { id: "teal", label: "Teal", hex: "#2B9B91" },
] as const;

export type BodyShape = (typeof BODY_SHAPES)[number];
export type LegCount = (typeof LEG_COUNTS)[number];
export type LegShape = (typeof LEG_SHAPES)[number];
export type EyeCount = (typeof EYE_COUNTS)[number];
export type MouthShape = (typeof MOUTH_SHAPES)[number];
export type MonsterSize = (typeof MONSTER_SIZES)[number];
export type MonsterBuild = (typeof MONSTER_BUILDS)[number];
export type Pattern = (typeof PATTERNS)[number];
export type HornShape = (typeof HORN_SHAPES)[number];
export type EarShape = (typeof EAR_SHAPES)[number];
export type TailShape = (typeof TAIL_SHAPES)[number];
export type Adaptation = (typeof ADAPTATIONS)[number];
export type Diet = (typeof DIETS)[number];
export type Respiration = (typeof RESPIRATIONS)[number];
export type SocialBehavior = (typeof SOCIAL_BEHAVIORS)[number];
export type MeshStyle = (typeof MESH_STYLES)[number];
export type MonsterColor = (typeof MONSTER_COLORS)[number]["id"];
export type AccentColor = (typeof ACCENT_COLORS)[number]["id"];

export type MonsterDna = {
  body: BodyShape;
  legs: LegCount;
  legShape: LegShape;
  eyes: EyeCount;
  mouth: MouthShape;
  size: MonsterSize;
  build: MonsterBuild;
  color: MonsterColor;
  accent: AccentColor;
  pattern: Pattern;
  horns: HornShape;
  ears: EarShape;
  tail: TailShape;
  adaptation: Adaptation;
  diet: Diet;
  breathing: Respiration;
  social: SocialBehavior;
  mesh: MeshStyle;
};

export const DEFAULT_MONSTER_DNA: MonsterDna = {
  body: "round",
  legs: 4,
  legShape: "stubby",
  eyes: 3,
  mouth: "smile",
  size: "medium",
  build: "balanced",
  color: "moss",
  accent: "peach",
  pattern: "plain",
  horns: "spikes",
  ears: "round",
  tail: "tuft",
  adaptation: "none",
  diet: "herbivore",
  breathing: "lungs",
  social: "solitary",
  mesh: "smooth",
};

export function encodeMonsterDna(dna: MonsterDna) {
  return [
    "M6",
    `body=${dna.body}`,
    `legs=${dna.legs}`,
    `leg=${dna.legShape}`,
    `eyes=${dna.eyes}`,
    `mouth=${dna.mouth}`,
    `size=${dna.size}`,
    `build=${dna.build}`,
    `color=${dna.color}`,
    `accent=${dna.accent}`,
    `pattern=${dna.pattern}`,
    `horns=${dna.horns}`,
    `ears=${dna.ears}`,
    `tail=${dna.tail}`,
    `adapt=${dna.adaptation}`,
    `diet=${dna.diet}`,
    `breathe=${dna.breathing}`,
    `social=${dna.social}`,
    `mesh=${dna.mesh}`,
  ].join(";");
}

function readOption<T extends string | number>(
  label: string,
  value: string,
  options: readonly T[],
): T {
  const match = options.find((option) => String(option) === value);
  if (match === undefined) {
    throw new Error(`${label} must be one of: ${options.join(", ")}`);
  }
  return match;
}

function readGenes(
  source: string,
  version: "M1" | "M2" | "M3" | "M4" | "M5" | "M6",
) {
  const parts = source.trim().split(";");
  const expectedKeys = [
    "body",
    "legs",
    "leg",
    "eyes",
    "mouth",
    "size",
    ...(version === "M6" ? ["build"] : []),
    "color",
    "accent",
    "pattern",
    "horns",
    ...(version === "M6" ? ["ears"] : []),
    ...(version !== "M1" ? ["tail", "adapt"] : []),
    ...(version === "M3" ? ["diet"] : []),
    ...(version === "M4" || version === "M5"
      ? ["diet", "breathe", "social"]
      : []),
    ...(version === "M5" ? ["mesh"] : []),
    ...(version === "M6" ? ["diet", "breathe", "social", "mesh"] : []),
  ];

  if (parts.length !== expectedKeys.length + 1) {
    throw new Error("DNA must contain every gene exactly once");
  }

  const values = new Map<string, string>();
  expectedKeys.forEach((expectedKey, index) => {
    const [key, value, ...extra] = parts[index + 1].split("=");
    if (key !== expectedKey || !value || extra.length > 0) {
      throw new Error(`Expected ${expectedKey}=… at gene ${index + 1}`);
    }
    values.set(key, value);
  });
  return values;
}

export function decodeMonsterDna(source: string): MonsterDna {
  const version = source.trim().split(";", 1)[0];
  if (
    version !== "M1" &&
    version !== "M2" &&
    version !== "M3" &&
    version !== "M4" &&
    version !== "M5" &&
    version !== "M6"
  ) {
    throw new Error("DNA must begin with M6 (old M1–M5 codes also work)");
  }
  const values = readGenes(source, version);

  return {
    body: readOption("body", values.get("body")!, BODY_SHAPES),
    legs: readOption("legs", values.get("legs")!, LEG_COUNTS),
    legShape: readOption("leg", values.get("leg")!, LEG_SHAPES),
    eyes: readOption("eyes", values.get("eyes")!, EYE_COUNTS),
    mouth: readOption("mouth", values.get("mouth")!, MOUTH_SHAPES),
    size: readOption("size", values.get("size")!, MONSTER_SIZES),
    build:
      version === "M6"
        ? readOption("build", values.get("build")!, MONSTER_BUILDS)
        : "balanced",
    color: readOption(
      "color",
      values.get("color")!,
      MONSTER_COLORS.map((color) => color.id),
    ),
    accent: readOption(
      "accent",
      values.get("accent")!,
      ACCENT_COLORS.map((color) => color.id),
    ),
    pattern: readOption("pattern", values.get("pattern")!, PATTERNS),
    horns: readOption("horns", values.get("horns")!, HORN_SHAPES),
    ears:
      version === "M6"
        ? readOption("ears", values.get("ears")!, EAR_SHAPES)
        : "none",
    tail:
      version !== "M1"
        ? readOption("tail", values.get("tail")!, TAIL_SHAPES)
        : "tuft",
    adaptation:
      version !== "M1"
        ? readOption("adapt", values.get("adapt")!, ADAPTATIONS)
        : "none",
    diet:
      version === "M3" ||
      version === "M4" ||
      version === "M5" ||
      version === "M6"
        ? readOption("diet", values.get("diet")!, DIETS)
        : "herbivore",
    breathing:
      version === "M4" || version === "M5" || version === "M6"
        ? readOption("breathe", values.get("breathe")!, RESPIRATIONS)
        : "lungs",
    social:
      version === "M4" || version === "M5" || version === "M6"
        ? readOption("social", values.get("social")!, SOCIAL_BEHAVIORS)
        : "solitary",
    mesh:
      version === "M5" || version === "M6"
        ? readOption("mesh", values.get("mesh")!, MESH_STYLES)
        : "classic",
  };
}

export function getMonsterColor(id: MonsterColor) {
  return MONSTER_COLORS.find((color) => color.id === id)!;
}

export function getAccentColor(id: AccentColor) {
  return ACCENT_COLORS.find((color) => color.id === id)!;
}

export function getMonsterSizeScale(size: MonsterSize) {
  return size === "tiny"
    ? 0.6
    : size === "small"
      ? 0.78
      : size === "large"
        ? 1.24
        : size === "huge"
          ? 1.48
          : 1;
}

export function getMonsterBuildScale(
  build: MonsterBuild,
): [number, number, number] {
  return build === "lean"
    ? [0.82, 1.08, 0.94]
    : build === "sturdy"
      ? [1.16, 0.94, 1.08]
      : [1, 1, 1];
}

export function canMonsterSwim(dna: MonsterDna) {
  return (
    dna.breathing === "gills" ||
    dna.breathing === "both" ||
    dna.body === "aquatic" ||
    dna.adaptation === "fins" ||
    dna.tail === "fin" ||
    dna.legShape === "flippers"
  );
}

export function canMonsterEatPlants(dna: MonsterDna) {
  return dna.diet === "herbivore" || dna.diet === "omnivore";
}

export function canMonsterHunt(dna: MonsterDna) {
  return dna.diet === "carnivore" || dna.diet === "omnivore";
}

export function getMonsterFollowerCount(dna: MonsterDna) {
  if (dna.size === "large" && dna.diet === "carnivore") return 0;
  if (dna.social === "solitary") return 0;
  if (dna.social === "pair") return 1;
  if (dna.social === "pack") {
    return dna.size === "tiny"
      ? 4
      : dna.size === "small"
        ? 3
        : dna.size === "medium"
          ? 2
          : 1;
  }
  return dna.size === "tiny"
    ? 7
    : dna.size === "small"
      ? 5
      : dna.size === "medium"
        ? 3
        : 1;
}
