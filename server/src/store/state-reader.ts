import { STATE_CACHE_MS } from '../config.js';
import { type GameState, parseState } from '../game/state.js';
import type { Store } from './store.js';

/**
 * One page view requests dozens of images at once. This shares a single Redis read between them
 * and remembers the last good state, so a brief outage serves slightly old data instead of errors.
 */
export class StateReader {
  private latest: { state: GameState; readAt: number } | null = null;
  private inFlight: Promise<GameState> | null = null;

  constructor(
    private readonly store: Store,
    private readonly now: () => number,
  ) {}

  /** Returns null only when the store is failing and nothing has ever been read. */
  async get(): Promise<GameState | null> {
    const at = this.now();
    if (this.latest && at >= this.latest.readAt && at - this.latest.readAt < STATE_CACHE_MS) return this.latest.state;
    this.inFlight ??= this.fetch().finally(() => {
      this.inFlight = null;
    });
    try {
      return await this.inFlight;
    } catch (error) {
      console.error('state read failed', error instanceof Error ? error.message : error);
      return this.latest?.state ?? null;
    }
  }

  /** Called after a successful move, so that instance serves the new state straight away. */
  put(state: GameState): void {
    this.latest = { state, readAt: this.now() };
  }

  private async fetch(): Promise<GameState> {
    const { raw } = await this.store.read();
    const state = parseState(raw, this.now());
    this.put(state);
    return state;
  }
}
