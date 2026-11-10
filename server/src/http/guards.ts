import { createHmac, timingSafeEqual } from 'node:crypto';

// "bot" must end a token: real phone models such as "CUBOT Note 20" contain those letters.
const BOT_UA = /\bbot\b|bot[/;]|crawl|spider|slurp|preview|fetch|monitor|headless|curl|wget|python-requests|httpclient|facebookexternalhit|embedly|whatsapp|telegram|discord|slack/i;

export function isAutomated(headers: Headers): boolean {
  const ua = headers.get('user-agent');
  if (!ua || BOT_UA.test(ua)) return true;
  const purpose = `${headers.get('sec-purpose') ?? ''} ${headers.get('purpose') ?? ''} ${headers.get('x-purpose') ?? ''}`;
  return /prefetch|preview/i.test(purpose);
}

export function fromGitHub(headers: Headers): boolean {
  const referer = headers.get('referer');
  if (!referer) return false;
  try {
    const url = new URL(referer);
    return url.protocol === 'https:' && url.hostname === 'github.com';
  } catch {
    return false;
  }
}

/** A POST from the confirm page must originate on this same host. */
export function sameOrigin(headers: Headers, requestUrl: string): boolean {
  const origin = headers.get('origin');
  if (!origin) return false;
  try {
    return new URL(origin).host === new URL(requestUrl).host;
  } catch {
    return false;
  }
}

export function clientIp(headers: Headers): string {
  const direct = headers.get('x-real-ip') ?? headers.get('x-vercel-forwarded-for');
  const forwarded = headers.get('x-forwarded-for')?.split(',')[0];
  return (direct ?? forwarded ?? 'unknown').trim() || 'unknown';
}

export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

const ADJECTIVES = ['SLEEPY', 'BRAVE', 'SNEAKY', 'CALM', 'FUZZY', 'SPICY', 'TINY', 'LOUD', 'SHY', 'SWIFT', 'GRUMPY', 'JOLLY', 'RUSTY', 'SHINY', 'LUCKY', 'WILD', 'COZY', 'NOBLE', 'WOBBLY', 'DARING', 'CRISPY', 'MIGHTY', 'QUIET', 'ZESTY'];
const NOUNS = ['KERNEL', 'SOCKET', 'MUTEX', 'CACHE', 'COMPILER', 'DAEMON', 'PACKET', 'THREAD', 'BUFFER', 'ROUTER', 'POINTER', 'LAMBDA', 'CONTAINER', 'SHELL', 'BRANCH', 'TOKEN', 'CURSOR', 'PIXEL', 'SCHEMA', 'STACK', 'QUEUE', 'BIT', 'BYTE', 'PROXY'];

export interface Identity {
  key: string;
  callsign: string;
}

/** Derives a stable, friendly identity. The raw IP goes no further than this function. */
export function identify(ip: string, secret: string): Identity {
  const digest = createHmac('sha256', secret).update(ip).digest();
  const adjective = ADJECTIVES[digest.readUInt16BE(0) % ADJECTIVES.length] ?? 'ANON';
  const noun = NOUNS[digest.readUInt16BE(2) % NOUNS.length] ?? 'USER';
  return { key: digest.subarray(4, 16).toString('hex'), callsign: `${adjective}-${noun}-${digest.readUInt16BE(16) % 100}` };
}
