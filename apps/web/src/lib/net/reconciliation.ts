/**
 * Local prediction keeps the controlled monster responsive; the server stays
 * authoritative. Small differences are eased away over a few frames and only a
 * genuinely large divergence (a respawn, a rejected move, a long stall) snaps.
 */
export const SNAP_DISTANCE = 6;
export const CORRECTION_SMOOTHING = 6;

export type Vec3 = { x: number; y: number; z: number };

export type Reconciliation = {
  position: Vec3;
  snapped: boolean;
  error: number;
};

function damp(current: number, target: number, lambda: number, dt: number) {
  return current + (target - current) * (1 - Math.exp(-lambda * dt));
}

export function reconcilePosition(
  predicted: Vec3,
  authoritative: Vec3,
  dt: number,
  options: { snapDistance?: number; smoothing?: number } = {},
): Reconciliation {
  const snapDistance = options.snapDistance ?? SNAP_DISTANCE;
  const smoothing = options.smoothing ?? CORRECTION_SMOOTHING;
  const error = Math.hypot(
    authoritative.x - predicted.x,
    authoritative.z - predicted.z,
  );

  if (error > snapDistance) {
    return { position: { ...authoritative }, snapped: true, error };
  }
  const safeDt = Math.max(0, Math.min(dt, 0.25));
  return {
    position: {
      x: damp(predicted.x, authoritative.x, smoothing, safeDt),
      y: damp(predicted.y, authoritative.y, smoothing, safeDt),
      z: damp(predicted.z, authoritative.z, smoothing, safeDt),
    },
    snapped: false,
    error,
  };
}
