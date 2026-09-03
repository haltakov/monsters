import { describe, expect, it } from "vitest";
import {
  getInitialNetworkMonsterDetail,
  getNetworkMonsterDetail,
  getMonsterDetailDistance,
  claimMeshPromotion,
} from "@/components/game/network-detail";

describe("network monster detail selection", () => {
  it("shows full creatures much earlier, even on the lightest preset", () => {
    expect(getNetworkMonsterDetail(39, "performance", "proxy")).toBe("full");
    expect(getNetworkMonsterDetail(64, "balanced", "proxy")).toBe("full");
    expect(getNetworkMonsterDetail(95, "high", "proxy")).toBe("full");
    expect(getNetworkMonsterDetail(100, "balanced", "full")).toBe("proxy");
    expect(getNetworkMonsterDetail(180, "balanced", "proxy")).toBe("hidden");
  });

  it("uses hysteresis at both boundaries", () => {
    expect(getNetworkMonsterDetail(70, "balanced", "full")).toBe("full");
    expect(getNetworkMonsterDetail(70, "balanced", "proxy")).toBe("proxy");
    expect(getNetworkMonsterDetail(166, "balanced", "proxy")).toBe("proxy");
    expect(getNetworkMonsterDetail(166, "balanced", "hidden")).toBe("hidden");
  });

  it("never builds a smooth mesh during the initial roster mount", () => {
    expect(getInitialNetworkMonsterDetail(5, "balanced")).toBe("proxy");
    expect(getInitialNetworkMonsterDetail(180, "balanced")).toBe("hidden");
  });

  it("does not penalize an animal near the player for third-person camera offset", () => {
    const distance = getMonsterDetailDistance(
      { x: 8, z: 0 },
      { x: -40, z: 0 },
      { x: 0, z: 0 },
    );
    expect(distance).toBe(8);
    expect(getNetworkMonsterDetail(distance, "performance", "proxy")).toBe(
      "full",
    );
    expect(getMonsterDetailDistance({ x: 8, z: 0 }, { x: -40, z: 0 })).toBe(48);
    // A spectator who flies close gets detail even if a selected monster is far away.
    expect(
      getMonsterDetailDistance(
        { x: 8, z: 0 },
        { x: 10, z: 0 },
        { x: -100, z: 0 },
      ),
    ).toBe(2);
  });

  it("respects a changed manual setting in both directions", () => {
    expect(getNetworkMonsterDetail(90, "high", "proxy")).toBe("full");
    expect(getNetworkMonsterDetail(90, "performance", "full")).toBe("proxy");
  });

  it("staggers expensive distant meshes without delaying nearby interactions", () => {
    const budget = { nextAt: 0 };
    expect(claimMeshPromotion(budget, 10, 60)).toBe(true);
    expect(claimMeshPromotion(budget, 10, 40)).toBe(false);
    expect(claimMeshPromotion(budget, 10, 8)).toBe(true);
    expect(claimMeshPromotion(budget, 10.05, 40)).toBe(true);
  });
});
