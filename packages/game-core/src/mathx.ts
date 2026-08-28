/**
 * Small math helpers with exactly the semantics of the `THREE.MathUtils`
 * functions the browser prototype used, so moving simulation code out of the
 * renderer cannot change any numeric result.
 */

export function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function lerp(from: number, to: number, alpha: number) {
  return from + (to - from) * alpha;
}

export function smoothstep(value: number, min: number, max: number) {
  if (value <= min) return 0;
  if (value >= max) return 1;
  const normalized = (value - min) / (max - min);
  return normalized * normalized * (3 - 2 * normalized);
}

export function damp(
  current: number,
  target: number,
  lambda: number,
  delta: number,
) {
  return lerp(current, target, 1 - Math.exp(-lambda * delta));
}

export function normalizeAngle(angle: number) {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

export function dampAngle(
  current: number,
  target: number,
  smoothing: number,
  delta: number,
) {
  const difference = normalizeAngle(target - current);
  return normalizeAngle(
    current + difference * (1 - Math.exp(-smoothing * delta)),
  );
}

/** Unit direction and distance from one planar point to another. */
export function direction(
  fromX: number,
  fromZ: number,
  toX: number,
  toZ: number,
) {
  const dx = toX - fromX;
  const dz = toZ - fromZ;
  const distance = Math.hypot(dx, dz);
  return {
    x: distance > 0.0001 ? dx / distance : 0,
    z: distance > 0.0001 ? dz / distance : 0,
    distance,
  };
}

/** Rounds to a fixed number of decimals so serialized snapshots stay compact. */
export function round(value: number, decimals = 3) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}
