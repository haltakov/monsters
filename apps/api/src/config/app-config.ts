/** Stable key of the single permanent public world. */
export const PUBLIC_WORLD_SLUG = 'public';
export const PUBLIC_WORLD_NAME = 'Monster Island';
export const PUBLIC_WORLD_SEED = 0x4d4f4e53;

/** How often the runner writes a routine recovery checkpoint. */
export const CHECKPOINT_INTERVAL_MS = 15_000;

/** Bounded backoff while another process still owns the world. */
export const LOCK_RETRY_MIN_MS = 2_000;
export const LOCK_RETRY_MAX_MS = 30_000;

/**
 * Namespace for the PostgreSQL advisory lock. The pair (namespace, world key)
 * is what makes a world single-owner across a rolling deployment.
 */
export const WORLD_LOCK_NAMESPACE = 0x4d4f4e;

export function getWebOrigins(): string[] {
  const configured = (process.env.WEB_ORIGIN ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  if (configured.length > 0) return configured;
  return ['http://localhost:3100', 'http://127.0.0.1:3100'];
}

/**
 * Wild monsters created the first time a world is seeded. The product default
 * is ten; the load-test harness raises it to validate the 100-monster target.
 */
export function getSeedPopulation() {
  const configured = Number(process.env.WORLD_SEED_POPULATION);
  return Number.isFinite(configured) && configured > 0
    ? Math.floor(configured)
    : undefined;
}

/**
 * New anonymous identities allowed per minute per client. Kept deliberately
 * low in production; the load-test harness raises it.
 */
export function getGuestBootstrapLimit() {
  const configured = Number(process.env.GUEST_BOOTSTRAP_LIMIT);
  return Number.isFinite(configured) && configured > 0
    ? Math.floor(configured)
    : 10;
}

export function isWorldRunnerDisabled() {
  return process.env.WORLD_RUNNER_ENABLED === 'false';
}
