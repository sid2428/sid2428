/** Every tunable game and service rule lives here. */
const DAY_MS = 86_400_000;

export const PROFILE_URL = 'https://github.com/sid2428';
export const OWNER = 'sid2428';
export const PROFILE_REPO = 'sid2428/sid2428';

export const DAYS_TO_DARK = 7;
export const DECAY_PER_MS = 100 / (DAYS_TO_DARK * DAY_MS);

export const RIGHT_FIX_HEAL = 25;
export const WRONG_FIX_DAMAGE = 10;
export const WRONG_FIX_FLOOR = 1;
export const QUIZ_HEAL = 3;
export const WORD_SOLVE_HEAL = 5;
export const TTT_WIN_HEAL = 4;

/** A wrong fix this soon after an incident opens may be a click on a stale page. */
export const INCIDENT_GRACE_MS = 90_000;
/** Moves this soon after a game rolls over were probably aimed at the previous board. */
export const SETTLE_MS = 10_000;

export const PENALTIES_PER_HOUR = 3;
export const MOVE_COOLDOWN_SECONDS = 2;
export const MOVES_PER_HOUR = 60;
export const CAS_ATTEMPTS = 3;
export const MOVE_ATTEMPTS = 25;
export const MOVE_BUDGET_MS = 7_000;
export const MAX_BATCH = 50;
export const STATE_CACHE_MS = 1_500;

export const MAX_FEED = 5;
export const MAX_SCORES = 200;
export const KEPT_SCORES = 100;
export const MAX_VOTERS = 1_000;
