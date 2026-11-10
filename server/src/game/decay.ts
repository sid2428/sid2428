import { DECAY_PER_MS } from '../config.js';
import type { GameState } from './state.js';

export type Stage = 'healthy' | 'degraded' | 'major' | 'critical' | 'down';

export interface StageEffect {
  stage: Stage;
  ratio: number;
  sev: string;
  label: string;
}

const EFFECTS: Readonly<Record<Stage, StageEffect>> = {
  healthy: { stage: 'healthy', ratio: 0, sev: 'SEV-4', label: 'ALL SYSTEMS NOMINAL' },
  degraded: { stage: 'degraded', ratio: 0.12, sev: 'SEV-3', label: 'DEGRADED' },
  major: { stage: 'major', ratio: 0.3, sev: 'SEV-2', label: 'MAJOR OUTAGE' },
  critical: { stage: 'critical', ratio: 0.55, sev: 'SEV-1', label: 'CRITICAL' },
  down: { stage: 'down', ratio: 1, sev: 'SEV-0', label: 'SITE DOWN' },
};

type Health = GameState['health'];

export function healthNow(health: Health, now: number): number {
  const elapsed = Math.max(0, now - health.at);
  return Math.min(100, Math.max(0, health.value - elapsed * DECAY_PER_MS));
}

export function effectFor(value: number): StageEffect {
  if (value <= 0) return EFFECTS.down;
  if (value <= 25) return EFFECTS.critical;
  if (value <= 50) return EFFECTS.major;
  if (value <= 75) return EFFECTS.degraded;
  return EFFECTS.healthy;
}

/** The moment this health value reaches zero if nobody touches it. */
function zeroAt(health: Health): number {
  return health.at + health.value / DECAY_PER_MS;
}

export function uptimePercent(state: Pick<GameState, 'health' | 'postmortem'>, now: number): number {
  const total = Math.max(1, now - state.postmortem.since);
  const ongoing = Math.max(0, now - zeroAt(state.health));
  const down = state.postmortem.downtimeMs + ongoing;
  return Math.min(100, Math.max(0, 100 * (1 - down / total)));
}

/**
 * Applies a health change, banking any outage that the change ends or interrupts.
 * `floor` stops damage from pushing health below it, but never raises health to it.
 */
export function adjustHealth(state: GameState, delta: number, now: number, floor = 0): void {
  const current = healthNow(state.health, now);
  if (current === 0) {
    state.postmortem.downtimeMs += Math.max(0, now - zeroAt(state.health));
  }
  const lowest = Math.min(current, floor);
  state.health = { value: Math.min(100, Math.max(lowest, current + delta)), at: now };
}
