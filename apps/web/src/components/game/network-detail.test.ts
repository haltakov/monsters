import { describe, expect, it } from "vitest";
import {
  getInitialNetworkMonsterDetail,
  getNetworkMonsterDetail,
} from "./network-detail";

describe("network monster detail selection", () => {
  it("keeps mobile smooth meshes close to the camera", () => {
    expect(getNetworkMonsterDetail(12, "mobile", "proxy")).toBe("full");
    expect(getNetworkMonsterDetail(40, "mobile", "full")).toBe("proxy");
    expect(getNetworkMonsterDetail(80, "mobile", "proxy")).toBe("hidden");
  });

  it("uses hysteresis at both boundaries", () => {
    expect(getNetworkMonsterDetail(23, "mobile", "full")).toBe("full");
    expect(getNetworkMonsterDetail(67, "mobile", "proxy")).toBe("proxy");
  });

  it("never builds a smooth mesh during the initial roster mount", () => {
    expect(getInitialNetworkMonsterDetail(5, "mobile")).toBe("proxy");
    expect(getInitialNetworkMonsterDetail(90, "mobile")).toBe("hidden");
  });

  it("allows a wider desktop detail radius", () => {
    expect(getNetworkMonsterDetail(28, "desktop", "proxy")).toBe("full");
    expect(getNetworkMonsterDetail(90, "desktop", "hidden")).toBe("proxy");
  });
});
