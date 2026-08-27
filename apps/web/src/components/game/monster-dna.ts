export const BODY_SHAPES = ["round", "bean", "long"] as const;
export const LEG_COUNTS = [2, 4, 6] as const;
export const LEG_SHAPES = ["stubby", "hoof", "springy"] as const;
export const EYE_COUNTS = [1, 2, 3, 4, 5] as const;
export const MOUTH_SHAPES = ["smile", "fangs", "beak"] as const;
export const MONSTER_SIZES = ["small", "medium", "large"] as const;
export const PATTERNS = ["plain", "spots", "stripes"] as const;
export const HORN_SHAPES = ["none", "buds", "spikes"] as const;

export const MONSTER_COLORS = [
  { id: "moss", label: "Moss", hex: "#8FCB69", dark: "#679D4D" },
  { id: "berry", label: "Berry", hex: "#B87BC9", dark: "#81539B" },
  { id: "lagoon", label: "Lagoon", hex: "#55B8CE", dark: "#347F9B" },
  { id: "mango", label: "Mango", hex: "#F2B85B", dark: "#C47B38" },
  { id: "coral", label: "Coral", hex: "#F18C73", dark: "#BA5E5B" },
  { id: "moon", label: "Moon", hex: "#D9D7CB", dark: "#8C928A" },
] as const;

export const ACCENT_COLORS = [
  { id: "peach", label: "Peach", hex: "#FFB66E" },
  { id: "lemon", label: "Lemon", hex: "#F3D65C" },
  { id: "mint", label: "Mint", hex: "#A9E0B1" },
  { id: "sky", label: "Sky", hex: "#9ED8E5" },
  { id: "pink", label: "Pink", hex: "#F3A6B7" },
  { id: "cream", label: "Cream", hex: "#FFF3D4" },
] as const;

export type BodyShape = (typeof BODY_SHAPES)[number];
export type LegCount = (typeof LEG_COUNTS)[number];
export type LegShape = (typeof LEG_SHAPES)[number];
export type EyeCount = (typeof EYE_COUNTS)[number];
export type MouthShape = (typeof MOUTH_SHAPES)[number];
export type MonsterSize = (typeof MONSTER_SIZES)[number];
export type Pattern = (typeof PATTERNS)[number];
export type HornShape = (typeof HORN_SHAPES)[number];
export type MonsterColor = (typeof MONSTER_COLORS)[number]["id"];
export type AccentColor = (typeof ACCENT_COLORS)[number]["id"];

export type MonsterDna = {
  body: BodyShape;
  legs: LegCount;
  legShape: LegShape;
  eyes: EyeCount;
  mouth: MouthShape;
  size: MonsterSize;
  color: MonsterColor;
  accent: AccentColor;
  pattern: Pattern;
  horns: HornShape;
};

export const DEFAULT_MONSTER_DNA: MonsterDna = {
  body: "round",
  legs: 4,
  legShape: "stubby",
  eyes: 3,
  mouth: "smile",
  size: "medium",
  color: "moss",
  accent: "peach",
  pattern: "plain",
  horns: "spikes",
};

export function encodeMonsterDna(dna: MonsterDna) {
  return [
    "M1",
    `body=${dna.body}`,
    `legs=${dna.legs}`,
    `leg=${dna.legShape}`,
    `eyes=${dna.eyes}`,
    `mouth=${dna.mouth}`,
    `size=${dna.size}`,
    `color=${dna.color}`,
    `accent=${dna.accent}`,
    `pattern=${dna.pattern}`,
    `horns=${dna.horns}`,
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

export function decodeMonsterDna(source: string): MonsterDna {
  const parts = source.trim().split(";");
  const expectedKeys = [
    "body",
    "legs",
    "leg",
    "eyes",
    "mouth",
    "size",
    "color",
    "accent",
    "pattern",
    "horns",
  ];

  if (parts[0] !== "M1") throw new Error("DNA must begin with M1");
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

  return {
    body: readOption("body", values.get("body")!, BODY_SHAPES),
    legs: readOption("legs", values.get("legs")!, LEG_COUNTS),
    legShape: readOption("leg", values.get("leg")!, LEG_SHAPES),
    eyes: readOption("eyes", values.get("eyes")!, EYE_COUNTS),
    mouth: readOption("mouth", values.get("mouth")!, MOUTH_SHAPES),
    size: readOption("size", values.get("size")!, MONSTER_SIZES),
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
  };
}

export function getMonsterColor(id: MonsterColor) {
  return MONSTER_COLORS.find((color) => color.id === id)!;
}

export function getAccentColor(id: AccentColor) {
  return ACCENT_COLORS.find((color) => color.id === id)!;
}

export function getMonsterSizeScale(size: MonsterSize) {
  return size === "small" ? 0.78 : size === "large" ? 1.24 : 1;
}
