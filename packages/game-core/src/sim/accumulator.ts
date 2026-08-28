import { MAX_TICKS_PER_UPDATE, TICK_SECONDS } from "./constants";

/**
 * Fixed-step accumulator. Real elapsed time arrives in arbitrary chunks; the
 * simulation only ever advances in whole `stepSeconds` ticks, so the result of
 * feeding 1 second as one chunk or as ten chunks is identical.
 */
export type FixedStepAccumulator = {
  stepSeconds: number;
  pending: number;
  /** Ticks dropped because the process stalled beyond the catch-up budget. */
  dropped: number;
};

export function createAccumulator(
  stepSeconds = TICK_SECONDS,
): FixedStepAccumulator {
  return { stepSeconds, pending: 0, dropped: 0 };
}

export function accumulate(
  accumulator: FixedStepAccumulator,
  elapsedSeconds: number,
  maxTicks = MAX_TICKS_PER_UPDATE,
) {
  if (!Number.isFinite(elapsedSeconds) || elapsedSeconds <= 0) return 0;
  accumulator.pending += elapsedSeconds;
  let ticks = Math.floor(accumulator.pending / accumulator.stepSeconds + 1e-9);
  if (ticks <= 0) return 0;
  accumulator.pending -= ticks * accumulator.stepSeconds;
  if (accumulator.pending < 0) accumulator.pending = 0;
  if (ticks > maxTicks) {
    accumulator.dropped += ticks - maxTicks;
    ticks = maxTicks;
    // A long stall is absorbed rather than replayed: the runner reports the
    // gap and the world simply loses that wall-clock time.
    accumulator.pending = 0;
  }
  return ticks;
}
