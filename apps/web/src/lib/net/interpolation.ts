/**
 * Remote entities arrive at ~10 Hz. Rendering them at display rate needs a
 * small buffer plus a fixed render delay so there is always a future sample to
 * interpolate towards.
 */
export const RENDER_DELAY_MS = 130;
export const MAX_SAMPLES = 12;

export type MotionSample = {
  /** Local receive timestamp in milliseconds. */
  t: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
};

export function pushSample(
  buffer: MotionSample[],
  sample: MotionSample,
  maxSamples = MAX_SAMPLES,
) {
  const last = buffer[buffer.length - 1];
  if (last && sample.t <= last.t) {
    buffer[buffer.length - 1] = sample;
  } else {
    buffer.push(sample);
  }
  while (buffer.length > maxSamples) buffer.shift();
  return buffer;
}

function shortestAngle(from: number, to: number) {
  const difference = Math.atan2(Math.sin(to - from), Math.cos(to - from));
  return from + difference;
}

/**
 * Samples the buffer at `time`. Before the first sample it clamps to the
 * oldest entry; after the last one it holds the newest rather than
 * extrapolating, which keeps a stalled entity still instead of drifting.
 */
export function sampleAt(
  buffer: readonly MotionSample[],
  time: number,
): MotionSample | null {
  if (buffer.length === 0) return null;
  if (buffer.length === 1) return buffer[0];
  if (time <= buffer[0].t) return buffer[0];
  const newest = buffer[buffer.length - 1];
  if (time >= newest.t) return newest;

  for (let index = 1; index < buffer.length; index += 1) {
    const next = buffer[index];
    if (next.t < time) continue;
    const previous = buffer[index - 1];
    const span = next.t - previous.t;
    const alpha = span <= 0 ? 1 : (time - previous.t) / span;
    return {
      t: time,
      x: previous.x + (next.x - previous.x) * alpha,
      y: previous.y + (next.y - previous.y) * alpha,
      z: previous.z + (next.z - previous.z) * alpha,
      yaw:
        previous.yaw +
        (shortestAngle(previous.yaw, next.yaw) - previous.yaw) * alpha,
    };
  }
  return newest;
}

export function renderTime(now: number, delay = RENDER_DELAY_MS) {
  return now - delay;
}
