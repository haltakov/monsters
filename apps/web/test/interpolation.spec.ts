import { describe, expect, it } from "vitest";
import {
  MAX_SAMPLES,
  RENDER_DELAY_MS,
  pushSample,
  renderTime,
  sampleAt,
} from "@/lib/net/interpolation";

const sample = (t: number, x: number, yaw = 0) => ({ t, x, y: 0, z: 0, yaw });

describe("entity interpolation", () => {
  it("keeps a bounded buffer in arrival order", () => {
    const buffer: ReturnType<typeof sample>[] = [];
    for (let index = 0; index < MAX_SAMPLES + 5; index += 1) {
      pushSample(buffer, sample(index * 100, index));
    }
    expect(buffer).toHaveLength(MAX_SAMPLES);
    expect(buffer[buffer.length - 1].x).toBe(MAX_SAMPLES + 4);
  });

  it("replaces rather than reorders an out-of-order sample", () => {
    const buffer = [sample(1000, 1)];
    pushSample(buffer, sample(900, 9));
    expect(buffer).toHaveLength(1);
    expect(buffer[0].x).toBe(9);
  });

  it("interpolates linearly between two updates", () => {
    const buffer = [sample(0, 0), sample(100, 10)];
    expect(sampleAt(buffer, 50)?.x).toBeCloseTo(5, 6);
    expect(sampleAt(buffer, 25)?.x).toBeCloseTo(2.5, 6);
  });

  it("clamps outside the buffer instead of extrapolating", () => {
    const buffer = [sample(100, 1), sample(200, 2)];
    expect(sampleAt(buffer, 0)?.x).toBe(1);
    expect(sampleAt(buffer, 9999)?.x).toBe(2);
    expect(sampleAt([], 10)).toBeNull();
  });

  it("takes the short way around when yaw wraps", () => {
    const buffer = [sample(0, 0, Math.PI - 0.1), sample(100, 0, -Math.PI + 0.1)];
    const middle = sampleAt(buffer, 50)!;
    expect(Math.abs(middle.yaw)).toBeGreaterThan(Math.PI - 0.11);
  });

  it("renders one network tick in the past", () => {
    expect(renderTime(1000)).toBe(1000 - RENDER_DELAY_MS);
    expect(RENDER_DELAY_MS).toBeGreaterThanOrEqual(100);
  });
});
