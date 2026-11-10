import type { GameState } from '../game/state.js';
import type { Snapshot, Store } from './store.js';

/** In-process Store for tests. Same compare-and-set contract as Redis. */
export class MemoryStore implements Store {
  raw: unknown = null;
  version = 0;
  failing = false;
  allow = true;
  readonly penalties = new Map<string, number>();

  private guard(): void {
    if (this.failing) throw new Error('store unavailable');
  }

  async read(): Promise<Snapshot> {
    this.guard();
    await Promise.resolve();
    return { raw: this.raw === null ? null : structuredClone(this.raw), version: String(this.version) };
  }

  async compareAndSet(version: string, next: GameState): Promise<boolean> {
    this.guard();
    await Promise.resolve();
    if (String(this.version) !== version) return false;
    this.raw = structuredClone(next);
    this.version += 1;
    return true;
  }

  async allowMove(): Promise<boolean> {
    this.guard();
    return this.allow;
  }

  async penaltyCount(visitorKey: string): Promise<number> {
    this.guard();
    return this.penalties.get(visitorKey) ?? 0;
  }

  async recordPenalty(visitorKey: string): Promise<void> {
    this.guard();
    this.penalties.set(visitorKey, (this.penalties.get(visitorKey) ?? 0) + 1);
  }
}
