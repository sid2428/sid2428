import { MAX_BATCH, MOVE_ATTEMPTS, MOVE_BUDGET_MS, PENALTIES_PER_HOUR } from '../config.js';
import { type Move, applyMove } from '../game/moves.js';
import { parseState } from '../game/state.js';
import type { Identity } from './guards.js';
import type { Deps } from './router.js';

interface Pending {
  move: Move;
  identity: Identity;
  resolve: () => void;
  reject: (reason: unknown) => void;
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Group commit. Clicks that arrive while a write is in flight are applied together in the next
 * single atomic write, so same-instance clicks cannot collide. Conflicts with other instances
 * retry with jittered backoff, inside a time budget that fits the function timeout.
 */
class MoveBatcher {
  private readonly queue: Pending[] = [];
  private draining = false;

  constructor(private readonly deps: Deps) {}

  submit(move: Move, identity: Identity): Promise<void> {
    return new Promise((resolve, reject) => {
      this.queue.push({ move, identity, resolve, reject });
      void this.drain();
    });
  }

  private async drain(): Promise<void> {
    if (this.draining) return;
    this.draining = true;
    try {
      while (this.queue.length) {
        const batch = this.queue.splice(0, MAX_BATCH);
        try {
          await this.commit(batch);
          batch.forEach((item) => item.resolve());
        } catch (error) {
          batch.forEach((item) => item.reject(error));
        }
      }
    } finally {
      this.draining = false;
    }
  }

  private async commit(batch: readonly Pending[]): Promise<void> {
    const { deps } = this;
    const deadline = deps.now() + MOVE_BUDGET_MS;
    for (let attempt = 0; attempt < MOVE_ATTEMPTS && (attempt === 0 || deps.now() < deadline); attempt++) {
      if (attempt > 0) await sleep(deps.random() * Math.min(25 * 2 ** attempt, 400));
      if (await this.tryCommit(batch)) return;
    }
    console.warn('moves dropped after repeated conflicts', batch.length);
  }

  private async tryCommit(batch: readonly Pending[]): Promise<boolean> {
    const { deps } = this;
    const { raw, version } = await deps.store.read();
    const now = deps.now();
    const fixers = [...new Set(batch.filter((b) => b.move.game === 'fix').map((b) => b.identity.key))];
    const counts = new Map(await Promise.all(fixers.map(async (key) => [key, await deps.store.penaltyCount(key)] as const)));

    let state = parseState(raw, now);
    let changed = false;
    const penalized: string[] = [];
    for (const { move, identity } of batch) {
      const used = counts.get(identity.key) ?? 0;
      const result = applyMove(state, move, { who: identity.callsign, now, penaltyAllowed: used < PENALTIES_PER_HOUR, random: deps.random });
      if (result.outcome.kind === 'ignored') continue;
      state = result.state;
      changed = true;
      if (result.outcome.penalized) {
        counts.set(identity.key, used + 1);
        penalized.push(identity.key);
      }
    }
    if (!changed) return true;
    if (!(await deps.store.compareAndSet(version, state))) return false;
    deps.reader.put(state);
    await Promise.all(penalized.map((key) => deps.store.recordPenalty(key)));
    return true;
  }
}

const batchers = new WeakMap<Deps, MoveBatcher>();

export function submitMove(deps: Deps, move: Move, identity: Identity): Promise<void> {
  let batcher = batchers.get(deps);
  if (!batcher) {
    batcher = new MoveBatcher(deps);
    batchers.set(deps, batcher);
  }
  return batcher.submit(move, identity);
}
