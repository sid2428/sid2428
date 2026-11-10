import type { Deps } from '../src/http/router.js';
import { defaultState, type GameState } from '../src/game/state.js';
import type { MoveContext } from '../src/game/moves.js';
import { MemoryStore } from '../src/store/memory-store.js';
import { StateReader } from '../src/store/state-reader.js';

export const T0 = 1_800_000_000_000;
export const DAY = 86_400_000;

export function freshState(now = T0): GameState {
  return defaultState(now);
}

export function ctx(overrides: Partial<MoveContext> = {}): MoveContext {
  return { who: 'TEST-USER-1', now: T0 + DAY, penaltyAllowed: true, random: () => 0.99, ...overrides };
}

export interface TestDeps extends Deps {
  store: MemoryStore;
  setNow(value: number): void;
}

export function testDeps(start = T0): TestDeps {
  const store = new MemoryStore();
  let current = start;
  const now = (): number => current;
  return {
    store,
    reader: new StateReader(store, now),
    now,
    setNow(value: number) {
      current = value;
    },
    random: () => 0.99,
    fetchImpl: (async () => new Response('[]')) as typeof fetch,
    ipSecret: 'test-secret',
    cronSecret: 'cron-secret',
    githubToken: undefined,
  };
}

export const BROWSER = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36';

export function click(path: string, ip = '1.2.3.4', headers: Record<string, string> = {}, method = 'GET'): Request {
  return new Request(`https://oncall.test${path}`, {
    method,
    headers: { 'user-agent': BROWSER, referer: 'https://github.com/sid2428', 'x-real-ip': ip, ...headers },
  });
}
