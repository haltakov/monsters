import {
  COARSE_CATCHUP_DT,
  FINE_CATCHUP_SECONDS,
  MAX_CATCHUP_SECONDS,
  MAX_COARSE_CATCHUP_STEPS,
  TICK_SECONDS,
} from "./constants";
import { stepWorld } from "./engine";
import { isCriticalEvent, type SimEvent, type WorldSimState } from "./types";

export type CatchUpResult = {
  /** Simulated seconds actually applied to the world. */
  simulatedSeconds: number;
  steps: number;
  mode: "none" | "fine" | "coarse";
  /** True when the downtime exceeded the bounded catch-up budget. */
  truncated: boolean;
  /** Only lifecycle-relevant events; movement chatter is dropped. */
  events: SimEvent[];
};

/**
 * Advances a restored world across API downtime.
 *
 * Short gaps replay at the normal 10 Hz fixed step. Longer gaps switch to one
 * coarse second-long step so a multi-hour outage cannot spend minutes
 * replaying tiny ticks at startup, and the total advance is hard-capped at
 * {@link MAX_CATCHUP_SECONDS}. The result is deterministic for the same
 * checkpoint and the same elapsed value.
 */
export function catchUpWorld(
  state: WorldSimState,
  elapsedSeconds: number,
): CatchUpResult {
  if (!Number.isFinite(elapsedSeconds) || elapsedSeconds <= TICK_SECONDS) {
    return {
      simulatedSeconds: 0,
      steps: 0,
      mode: "none",
      truncated: false,
      events: [],
    };
  }

  const events: SimEvent[] = [];
  if (elapsedSeconds <= FINE_CATCHUP_SECONDS) {
    const steps = Math.floor(elapsedSeconds / TICK_SECONDS);
    for (let index = 0; index < steps; index += 1) {
      for (const event of stepWorld(state, TICK_SECONDS)) {
        if (isCriticalEvent(event)) events.push(event);
      }
    }
    return {
      simulatedSeconds: steps * TICK_SECONDS,
      steps,
      mode: "fine",
      truncated: false,
      events,
    };
  }

  const requestedSteps = Math.floor(elapsedSeconds / COARSE_CATCHUP_DT);
  const steps = Math.min(requestedSteps, MAX_COARSE_CATCHUP_STEPS);
  for (let index = 0; index < steps; index += 1) {
    for (const event of stepWorld(state, COARSE_CATCHUP_DT)) {
      if (isCriticalEvent(event)) events.push(event);
    }
  }
  return {
    simulatedSeconds: steps * COARSE_CATCHUP_DT,
    steps,
    mode: "coarse",
    truncated: requestedSteps > steps,
    events,
  };
}

export { MAX_CATCHUP_SECONDS };
