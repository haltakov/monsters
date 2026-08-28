/** Authoritative tick rate of the world runner. */
export const TICK_RATE = 10;
export const TICK_SECONDS = 1 / TICK_RATE;

/** Movement energy costs, unchanged from the single-player prototype. */
export const WALK_ENERGY_PER_SECOND = 1.2;
export const SPRINT_ENERGY_PER_SECOND = 3.8;
export const SWIM_ENERGY_PER_SECOND = 1.7;
export const FLY_ENERGY_PER_SECOND = 2.6;
export const ATTACK_ENERGY_COST = 7;
export const MATE_ENERGY_COST = 18;
export const AI_IDLE_ENERGY_PER_SECOND = 0.045;

export const EAT_DISTANCE = 4.2;
export const HUNT_DISTANCE = 4.8;
export const MATE_DISTANCE = 6.2;
export const MATE_SEARCH_DISTANCE = 18;

export const PLAYER_WALK_SPEED = 5.4;
export const PLAYER_SPRINT_SPEED = 8.2;
export const PLAYER_FLY_SPEED = 9.2;
export const PLAYER_FLY_SPRINT_SPEED = 13.2;

export const HEALTH_REGEN_DELAY_SECONDS = 4;
export const PLAYER_ATTACK_COOLDOWN_SECONDS = 0.45;
export const PLAYER_EAT_COOLDOWN_SECONDS = 0.6;

export const CORPSE_LINGER_SECONDS = 12;
export const PAIR_REQUEST_TIMEOUT_SECONDS = 20;

export const DEFAULT_MAX_POPULATION = 100;
export const DEFAULT_CONTROL_GRACE_SECONDS = 12;

/** Movement input deadzone shared by the client prediction and the server. */
export const INPUT_DEADZONE = 0.06;
export const TURN_RATE_PER_SECOND = 1.75;

/** Catch-up bounds so a long API outage cannot stall startup. */
export const FINE_CATCHUP_SECONDS = 30;
export const COARSE_CATCHUP_DT = 1;
export const MAX_COARSE_CATCHUP_STEPS = 1800;
export const MAX_CATCHUP_SECONDS =
  COARSE_CATCHUP_DT * MAX_COARSE_CATCHUP_STEPS;
/** Hard cap on ticks a single live update may replay after a stall. */
export const MAX_TICKS_PER_UPDATE = 20;
