import { Redis } from '@upstash/redis';
import { MOVES_PER_HOUR, MOVE_COOLDOWN_SECONDS } from '../config.js';
import type { GameState } from '../game/state.js';

export interface Snapshot {
  raw: unknown;
  version: string;
}

export interface Store {
  read(): Promise<Snapshot>;
  /** Writes only if the version is unchanged since it was read. Returns false on a lost race. */
  compareAndSet(version: string, next: GameState): Promise<boolean>;
  /** Returns false when this visitor is moving too fast. */
  allowMove(visitorKey: string): Promise<boolean>;
  penaltyCount(visitorKey: string): Promise<number>;
  recordPenalty(visitorKey: string): Promise<void>;
}

const CAS_SCRIPT = `
local current = redis.call('GET', KEYS[2]) or '0'
if current ~= ARGV[1] then return 0 end
redis.call('SET', KEYS[1], ARGV[2])
redis.call('SET', KEYS[2], ARGV[3])
return 1`;

const RATE_SCRIPT = `
if redis.call('SET', KEYS[1], '1', 'NX', 'EX', ARGV[1]) == false then return 0 end
local hourly = redis.call('INCR', KEYS[2])
if hourly == 1 then redis.call('EXPIRE', KEYS[2], 3600) end
if hourly > tonumber(ARGV[2]) then return 0 end
return 1`;

const PENALTY_SCRIPT = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then redis.call('EXPIRE', KEYS[1], 3600) end
return count`;

function parseJson(text: unknown): unknown {
  if (typeof text !== 'string') return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export function redisStore(url: string, token: string, prefix = 'oncall'): Store {
  const redis = new Redis({ url, token, automaticDeserialization: false, retry: { retries: 1, backoff: () => 100 } });
  const stateKey = `${prefix}:state`;
  const versionKey = `${prefix}:version`;
  return {
    async read() {
      const [raw, version] = await redis.mget<[string | null, string | null]>(stateKey, versionKey);
      return { raw: parseJson(raw), version: version ?? '0' };
    },
    async compareAndSet(version, next) {
      const written = await redis.eval(CAS_SCRIPT, [stateKey, versionKey], [version, JSON.stringify(next), String(Number(version) + 1)]);
      return Number(written) === 1;
    },
    async allowMove(visitorKey) {
      const allowed = await redis.eval(RATE_SCRIPT, [`${prefix}:cool:${visitorKey}`, `${prefix}:hour:${visitorKey}`], [String(MOVE_COOLDOWN_SECONDS), String(MOVES_PER_HOUR)]);
      return Number(allowed) === 1;
    },
    async penaltyCount(visitorKey) {
      const value = await redis.get<string>(`${prefix}:pen:${visitorKey}`);
      return Number(value ?? 0) || 0;
    },
    async recordPenalty(visitorKey) {
      await redis.eval(PENALTY_SCRIPT, [`${prefix}:pen:${visitorKey}`], []);
    },
  };
}
