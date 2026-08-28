/**
 * Deterministic linear congruential generator. The state is a single unsigned
 * 32-bit integer so it serializes into a checkpoint without any class
 * instances, and resuming a world reproduces the exact same random stream.
 */

export type RandomState = { value: number };

export function createRandomState(seed: number): RandomState {
  return { value: seed >>> 0 };
}

export function nextRandom(state: RandomState) {
  state.value = (state.value * 1664525 + 1013904223) >>> 0;
  return state.value / 4294967296;
}

/** Binds a random state to the `() => number` shape used by helper functions. */
export function randomFn(state: RandomState) {
  return () => nextRandom(state);
}

/** Standalone closure kept for callers that do not persist their state. */
export function createSeededRandom(seed: number) {
  const state = createRandomState(seed);
  return () => nextRandom(state);
}

export function pickRandom<T>(options: readonly T[], random: () => number) {
  return options[
    Math.min(options.length - 1, Math.floor(random() * options.length))
  ];
}
