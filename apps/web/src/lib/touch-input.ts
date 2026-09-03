import { clamp, normalizeAngle } from "@monsters/game-core";

/** Circular dead zone and a gentle response curve; never snap to an axis. */
export function sampleJoystick(dx: number, dy: number, radius: number) {
  if (!(radius > 0)) return { knobX: 0, knobY: 0, x: 0, y: 0 };
  const distance = Math.hypot(dx, dy);
  const travel = Math.min(distance / radius, 1);
  const strength = Math.pow(Math.max(0, (travel - 0.12) / 0.88), 1.25);
  const unitX = distance ? dx / distance : 0;
  const unitY = distance ? dy / distance : 0;
  return {
    knobX: unitX * travel * radius,
    knobY: unitY * travel * radius,
    x: unitX * strength,
    y: -unitY * strength,
  };
}

/** Only camera angles change. Creature facing is handled when it walks. */
export function swipeCamera(
  yaw: number,
  pitch: number,
  dx: number,
  dy: number,
  spectating: boolean,
) {
  return {
    yaw: normalizeAngle(yaw - dx * 0.003),
    pitch: clamp(pitch + dy * 0.0024, spectating ? -0.72 : 0.12, 0.72),
  };
}
