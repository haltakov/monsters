import { describe, expect, it } from "vitest";
import {
  SNAP_DISTANCE,
  reconcilePosition,
} from "@/lib/net/reconciliation";

describe("controlled player reconciliation", () => {
  it("eases towards the server without teleporting for small errors", () => {
    const predicted = { x: 0, y: 0, z: 0 };
    const authoritative = { x: 1, y: 0, z: 0 };
    const result = reconcilePosition(predicted, authoritative, 1 / 60);

    expect(result.snapped).toBe(false);
    expect(result.error).toBeCloseTo(1, 6);
    expect(result.position.x).toBeGreaterThan(0);
    expect(result.position.x).toBeLessThan(0.5);
  });

  it("converges over a few frames", () => {
    let position = { x: 0, y: 0, z: 0 };
    const authoritative = { x: 2, y: 0, z: 0 };
    for (let frame = 0; frame < 90; frame += 1) {
      position = reconcilePosition(position, authoritative, 1 / 60).position;
    }
    expect(position.x).toBeCloseTo(2, 2);
  });

  it("snaps only for a large divergence such as a respawn", () => {
    const result = reconcilePosition(
      { x: 0, y: 0, z: 0 },
      { x: SNAP_DISTANCE + 5, y: 3, z: 0 },
      1 / 60,
    );
    expect(result.snapped).toBe(true);
    expect(result.position).toEqual({ x: SNAP_DISTANCE + 5, y: 3, z: 0 });
  });

  it("tolerates a stalled frame without overshooting", () => {
    const result = reconcilePosition(
      { x: 0, y: 0, z: 0 },
      { x: 1, y: 0, z: 0 },
      10,
    );
    expect(result.position.x).toBeLessThanOrEqual(1);
    expect(result.position.x).toBeGreaterThan(0.7);
  });
});
