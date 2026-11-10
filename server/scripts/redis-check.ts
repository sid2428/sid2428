/** Exercises the real Redis scripts under throwaway keys. Needs KV_REST_API_URL and KV_REST_API_TOKEN. */
import { randomUUID } from 'node:crypto';
import { Redis } from '@upstash/redis';
import { defaultState, parseState } from '../src/game/state.js';
import type { Identity } from '../src/http/guards.js';
import { submitMove } from '../src/http/move-batcher.js';
import type { Deps } from '../src/http/router.js';
import { StateReader } from '../src/store/state-reader.js';
import { redisStore } from '../src/store/store.js';

const url = process.env.KV_REST_API_URL;
const token = process.env.KV_REST_API_TOKEN;
if (!url || !token) {
  console.error('KV_REST_API_URL and KV_REST_API_TOKEN are required');
  process.exit(1);
}

const prefix = `oncall-test-${randomUUID().slice(0, 8)}`;
const store = redisStore(url, token, prefix);
const redis = new Redis({ url, token, automaticDeserialization: false });
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
const now = (): number => Date.now();

let failures = 0;
function check(name: string, ok: boolean, detail: unknown = ''): void {
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} ${detail === '' ? '' : JSON.stringify(detail)}`);
}

const deps: Deps = {
  store,
  reader: new StateReader(store, now),
  now,
  random: Math.random,
  fetchImpl: fetch,
  ipSecret: 'x',
  cronSecret: 'x',
  githubToken: undefined,
};

const instance = (): Deps => ({ ...deps, reader: new StateReader(store, now) });

async function burst(label: string, instances: number, perInstance: number): Promise<void> {
  const before = parseState((await store.read()).raw, now()).poll;
  const started = Date.now();
  const size = instances * perInstance;
  const fleet = Array.from({ length: instances }, instance);
  await Promise.all(
    fleet.flatMap((server, s) =>
      Array.from({ length: perInstance }, (_, i): Promise<void> => {
        const who: Identity = { key: `${label}-${s}-${i}`, callsign: `V-${label}-${s}-${i}` };
        return submitMove(server, { game: 'vote', option: i % 2 ? 'java' : 'python' }, who);
      }),
    ),
  );
  const after = parseState((await store.read()).raw, now()).poll;
  const landed = after.java + after.python - before.java - before.python;
  check(`${label}: ${size} simultaneous moves on ${instances} instance(s)`, landed === size, { landed, ms: Date.now() - started });
}

async function main(): Promise<void> {
  const empty = await store.read();
  check('empty database reads as version 0', empty.version === '0' && empty.raw === null, empty.version);

  check('first write lands', await store.compareAndSet('0', defaultState(now())));
  check('stale write is refused', !(await store.compareAndSet('0', defaultState(now()))));
  const after = await store.read();
  check('version advanced and state round-trips', after.version === '1' && parseState(after.raw, now()).quiz.num === 1, after.version);

  check('first move allowed', await store.allowMove('rate'));
  check('immediate second move refused', !(await store.allowMove('rate')));
  await sleep(2300);
  check('move allowed after the cooldown', await store.allowMove('rate'));

  check('penalties start at zero', (await store.penaltyCount('pen')) === 0);
  await store.recordPenalty('pen');
  await store.recordPenalty('pen');
  check('penalties count up', (await store.penaltyCount('pen')) === 2);
  const ttl = await redis.ttl(`${prefix}:pen:pen`);
  check('penalty counter expires within the hour', ttl > 0 && ttl <= 3600, ttl);

  await burst('a', 1, 5);
  await burst('b', 1, 25);
  await burst('c', 1, 60);
  await burst('d', 2, 10);
  await burst('e', 4, 5);
  await burst('f', 4, 15);

  await redis.set(`${prefix}:state`, '{not json');
  const garbled = await store.read();
  check('malformed stored JSON is survivable', parseState(garbled.raw, now()).health.value === 100);
}

async function cleanup(): Promise<void> {
  let cursor = '0';
  let removed = 0;
  do {
    const [next, keys] = await redis.scan(cursor, { match: `${prefix}:*`, count: 200 });
    cursor = String(next);
    if (keys.length) removed += await redis.del(...keys);
  } while (cursor !== '0');
  const live = await redis.exists('oncall:state');
  console.log(`cleaned ${removed} test keys; live game key present: ${live === 1}`);
}

main()
  .catch((error: unknown) => {
    failures += 1;
    console.error('CHECK CRASHED', error instanceof Error ? error.message : error);
  })
  .finally(async () => {
    await cleanup();
    console.log(failures ? `${failures} FAILED` : 'ALL PASSED');
    process.exit(failures ? 1 : 0);
  });
