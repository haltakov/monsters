import { describe, expect, it } from "vitest";
import {
  ALL_BUSHES,
  ALL_TREES,
  EDIBLES,
  EXTRA_PLANTS,
  EXTRA_ROCKS,
  PREY,
  adaptiveResourceRegrowSeconds,
  resourceHabitatDensity,
} from "../src/world/resources";
import { isWaterAt } from "../src/world/terrain";

describe("resource ecology", () => {
  it("creates recognizable fertile regions and true clearings", () => {
    expect(resourceHabitatDensity("tree", -68, 45)).toBeGreaterThan(0.75);
    expect(resourceHabitatDensity("tree", -17, -33)).toBe(0);
    expect(resourceHabitatDensity("bush", -52, -52)).toBeGreaterThan(0.75);
    expect(resourceHabitatDensity("bush", -80, 2)).toBe(0);
  });

  it("places every resource on land inside its matching habitat", () => {
    expect(ALL_TREES).toHaveLength(128);
    expect(ALL_BUSHES).toHaveLength(108);
    expect(EXTRA_PLANTS).toHaveLength(112);
    expect(EXTRA_ROCKS).toHaveLength(64);
    expect(PREY).toHaveLength(16);

    for (const edible of EDIBLES) {
      expect(isWaterAt(edible.x, edible.z)).toBe(false);
      expect(
        resourceHabitatDensity(edible.kind, edible.x, edible.z),
      ).toBeGreaterThan(0);
    }
  });

  it("regrows scarce resources faster than abundant resources", () => {
    const tree = EDIBLES.find((resource) => resource.kind === "tree")!;
    const scarce = adaptiveResourceRegrowSeconds(
      "tree",
      0.15,
      tree.x,
      tree.z,
      tree.id,
    );
    const abundant = adaptiveResourceRegrowSeconds(
      "tree",
      0.95,
      tree.x,
      tree.z,
      tree.id,
    );

    expect(scarce).toBeLessThan(abundant);
    expect(abundant).toBeLessThan(150);
  });
});
