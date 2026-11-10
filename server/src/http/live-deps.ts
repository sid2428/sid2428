import { StateReader } from '../store/state-reader.js';
import { type Store, redisStore } from '../store/store.js';
import type { Deps } from './router.js';

function unavailableStore(): Store {
  const fail = (): never => {
    throw new Error('redis is not configured');
  };
  return { read: async () => fail(), compareAndSet: async () => fail(), allowMove: async () => fail(), penaltyCount: async () => fail(), recordPenalty: async () => fail() };
}

let cached: Deps | undefined;

/** Built once per instance, so the state cache is shared across requests. */
export function liveDeps(): Deps {
  if (cached) return cached;
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  const store = url && token ? redisStore(url, token) : unavailableStore();
  const now = (): number => Date.now();
  cached = {
    store,
    reader: new StateReader(store, now),
    now,
    random: Math.random,
    fetchImpl: fetch,
    ipSecret: process.env.IP_HASH_SECRET,
    cronSecret: process.env.CRON_SECRET,
    githubToken: process.env.GITHUB_TOKEN,
  };
  return cached;
}
