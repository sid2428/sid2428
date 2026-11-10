import { describe, expect, it } from 'vitest';
import { PROFILE_URL } from '../src/config.js';
import { incidentAt, ACTIONS } from '../src/data/incidents.js';
import { summarize, fetchActivity } from '../src/github/activity.js';
import { parseState } from '../src/game/state.js';
import { clientIp, fromGitHub, identify, isAutomated, sameOrigin } from '../src/http/guards.js';
import { handle } from '../src/http/router.js';
import { anchorFor, parseImage, parseMove } from '../src/http/routes.js';
import { BROWSER, DAY, T0, click, freshState, testDeps } from './helpers.js';

const seeded = (now = T0) => {
  const deps = testDeps(now);
  deps.store.raw = freshState(T0);
  return deps;
};
const saved = (deps: ReturnType<typeof testDeps>) => parseState(deps.store.raw, deps.now());
const later = T0 + DAY;
const rightFix = `/play/fix/${incidentAt(0).fix}`;

describe('allowlists', () => {
  it.each([[['fix', 'nuke']], [['word', 'AB']], [['ttt', '0']], [['ttt', '10']], [['quiz', 'd']], [['vote', 'rust']], [['fix']], [['fix', 'dns', 'x']], [['../../etc', 'passwd']]])('rejects move %j', (seg) => {
    expect(parseMove(seg)).toBeNull();
  });

  it.each([[['nope.svg']], [['key', 'a.svg']], [['key', 'AA.svg']], [['cell', '0.svg']], [['hero']], [['link', 'evil.svg']], [['fold', 'x.svg']]])('rejects image %j', (seg) => {
    expect(parseImage(seg)).toBeNull();
  });

  it('uses the anchor that really reopens a fold', () => {
    expect(anchorFor({ game: 'word', letter: 'A' })).toBe('user-content-word');
  });
});

describe('guards', () => {
  const h = (init: Record<string, string>) => new Headers(init);

  it.each(['Googlebot/2.1', 'Mozilla/5.0 (compatible; bingbot/2.0;)', 'curl/8.1', 'Slackbot-LinkExpanding 1.0', 'HeadlessChrome/120', 'python-requests/2.31'])('treats %s as automated', (ua) => {
    expect(isAutomated(h({ 'user-agent': ua }))).toBe(true);
  });

  it('allows real browsers, including phones with bot-like names', () => {
    expect(isAutomated(h({ 'user-agent': BROWSER }))).toBe(false);
    expect(isAutomated(h({ 'user-agent': 'Mozilla/5.0 (Linux; Android 10; CUBOT Note 20 Build/QP1A) Chrome/120 Mobile Safari/537.36' }))).toBe(false);
  });

  it('treats a missing user agent and prefetches as automated', () => {
    expect(isAutomated(h({}))).toBe(true);
    expect(isAutomated(h({ 'user-agent': BROWSER, 'sec-purpose': 'prefetch' }))).toBe(true);
  });

  it('only trusts an exact github.com referrer', () => {
    expect(fromGitHub(h({ referer: 'https://github.com/sid2428' }))).toBe(true);
    expect(fromGitHub(h({ referer: 'https://github.com.evil.io/' }))).toBe(false);
    expect(fromGitHub(h({ referer: 'http://github.com/' }))).toBe(false);
    expect(fromGitHub(h({ referer: 'not a url' }))).toBe(false);
    expect(fromGitHub(h({}))).toBe(false);
  });

  it('checks POST origin against this host', () => {
    expect(sameOrigin(h({ origin: 'https://a.test' }), 'https://a.test/play/x')).toBe(true);
    expect(sameOrigin(h({ origin: 'https://b.test' }), 'https://a.test/play/x')).toBe(false);
    expect(sameOrigin(h({}), 'https://a.test/play/x')).toBe(false);
  });

  it('builds stable callsigns that differ per visitor and hide the IP', () => {
    const a = identify('1.2.3.4', 's');
    expect(identify('1.2.3.4', 's')).toEqual(a);
    expect(identify('5.6.7.8', 's').key).not.toBe(a.key);
    expect(identify('1.2.3.4', 'other').key).not.toBe(a.key);
    expect(a.callsign).toMatch(/^[A-Z]+-[A-Z]+-\d{1,2}$/);
    expect(JSON.stringify(a)).not.toContain('1.2.3.4');
  });

  it('reads the first forwarded address and tolerates none', () => {
    expect(clientIp(h({ 'x-forwarded-for': '9.9.9.9, 8.8.8.8' }))).toBe('9.9.9.9');
    expect(clientIp(h({}))).toBe('unknown');
  });
});

describe('POST-free click path', () => {
  it('plays the move and redirects to the right section', async () => {
    const deps = seeded(later);
    const res = await handle(click(rightFix), deps);
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe(`${PROFILE_URL}#user-content-incident`);
    expect(saved(deps).incident.seq).toBe(1);
  });

  it('is case-insensitive for word letters', async () => {
    const deps = seeded(later);
    await handle(click('/play/word/k'), deps);
    expect(saved(deps).word.guessed).toEqual(['K']);
  });

  it('never moves for crawlers or HEAD requests', async () => {
    const deps = seeded(later);
    await handle(click(rightFix, '1.1.1.1', { 'user-agent': 'Googlebot/2.1' }), deps);
    await handle(click(rightFix, '1.1.1.1', {}, 'HEAD'), deps);
    await handle(click(rightFix, '1.1.1.1', { 'sec-purpose': 'prefetch' }), deps);
    expect(deps.store.version).toBe(0);
  });

  it('shows a confirm page without a referrer, then plays on POST', async () => {
    const deps = seeded(later);
    const page = await handle(click(rightFix, '1.1.1.1', { referer: '' }), deps);
    expect(page.status).toBe(200);
    expect(await page.text()).toContain(`action="${rightFix}"`);
    expect(deps.store.version).toBe(0);
    const posted = await handle(click(rightFix, '1.1.1.1', { referer: '', origin: 'https://oncall.test' }, 'POST'), deps);
    expect(posted.status).toBe(302);
    expect(deps.store.version).toBe(1);
  });

  it('refuses a cross-site POST', async () => {
    const deps = seeded(later);
    await handle(click(rightFix, '1.1.1.1', { origin: 'https://evil.test' }, 'POST'), deps);
    expect(deps.store.version).toBe(0);
  });

  it('redirects invalid moves home, with no open redirect', async () => {
    const deps = seeded(later);
    const res = await handle(click('/play/fix/https%3A%2F%2Fevil.test'), deps);
    expect(res.headers.get('location')).toBe(`${PROFILE_URL}#user-content-incident`);
  });

  it('respects the rate limit but still redirects', async () => {
    const deps = seeded(later);
    deps.store.allow = false;
    const res = await handle(click(rightFix), deps);
    expect(res.status).toBe(302);
    expect(deps.store.version).toBe(0);
  });

  it('does nothing if the IP secret is missing', async () => {
    const deps = seeded(later);
    deps.ipSecret = undefined;
    expect((await handle(click(rightFix), deps)).status).toBe(302);
    expect(deps.store.version).toBe(0);
  });

  it('caps penalties per visitor per hour', async () => {
    const deps = seeded(later);
    const wrong = ACTIONS.filter((a) => a !== incidentAt(0).fix);
    deps.store.penalties.clear();
    await handle(click(`/play/fix/${wrong[0]}`), deps);
    const key = [...deps.store.penalties.keys()][0]!;
    expect(deps.store.penalties.get(key)).toBe(1);
    deps.store.penalties.set(key, 3);
    const before = saved(deps).health.value;
    await handle(click(`/play/fix/${wrong[1]}`), deps);
    expect(saved(deps).health.value).toBeCloseTo(before, 1);
  });
});

describe('concurrency', () => {
  it('loses no moves when different players click together', async () => {
    const deps = seeded(later);
    await Promise.all(['java', 'python', 'java'].map((option, i) => handle(click(`/play/vote/${option}`, `10.0.0.${i}`), deps)));
    const { java, python } = saved(deps).poll;
    expect(java + python).toBe(3);
  });

  it('groups a burst of clicks into very few writes', async () => {
    const deps = seeded(later);
    await Promise.all(Array.from({ length: 30 }, (_, i) => handle(click('/play/vote/java', `10.2.0.${i}`), deps)));
    expect(saved(deps).poll.java).toBe(30);
    expect(deps.store.version).toBeLessThanOrEqual(3);
  });

  it('retries past writers on other instances without losing moves', async () => {
    const deps = seeded(later);
    let conflicts = 0;
    const original = deps.store.compareAndSet.bind(deps.store);
    deps.store.compareAndSet = async (version, next) => {
      if (conflicts++ < 8) {
        deps.store.version += 1;
        return false;
      }
      return original(String(deps.store.version), next);
    };
    deps.random = () => 0;
    await handle(click('/play/vote/python'), deps);
    expect(saved(deps).poll.python).toBe(1);
    expect(conflicts).toBe(9);
  });

  it('gives up cleanly and still redirects if conflicts never end', async () => {
    const deps = seeded(later);
    deps.store.compareAndSet = async () => false;
    deps.random = () => 0;
    const res = await handle(click('/play/vote/java'), deps);
    expect(res.status).toBe(302);
    expect(saved(deps).poll.java).toBe(0);
  });

  it('enforces the penalty cap inside one batch', async () => {
    const deps = seeded(later);
    const wrong = ACTIONS.filter((a) => a !== incidentAt(0).fix);
    deps.store.raw = { ...freshState(T0), health: { value: 80, at: later } };
    const ip = '10.3.0.1';
    await Promise.all(wrong.map((action) => handle(click(`/play/fix/${action}`, ip), deps)));
    const st = saved(deps);
    expect(st.health.value).toBe(80 - 10 * wrong.length);
    expect([...deps.store.penalties.values()][0]).toBe(wrong.length);
  });

  it('applies a fix once when many responders click at the same instant', async () => {
    const deps = seeded(later);
    deps.store.raw = { ...freshState(T0), health: { value: 40, at: later } };
    await Promise.all(Array.from({ length: 12 }, (_, i) => handle(click(rightFix, `10.1.0.${i}`), deps)));
    const st = saved(deps);
    expect(st.incident.seq).toBeGreaterThanOrEqual(1);
    expect(st.postmortem.fixes).toBe(st.incident.seq);
    expect(st.health.value).toBeLessThanOrEqual(100);
  });
});

describe('failure handling', () => {
  it('still redirects clicks while the store is down', async () => {
    const deps = seeded(later);
    deps.store.failing = true;
    const res = await handle(click(rightFix), deps);
    expect(res.status).toBe(302);
  });

  it('draws an outage image when nothing has ever been read', async () => {
    const deps = seeded(later);
    deps.store.failing = true;
    const res = await handle(click('/img/incident.svg'), deps);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('image/svg+xml');
    expect(await res.text()).toContain('temporarily unavailable');
  });

  it('serves the last good state during a blip', async () => {
    const deps = seeded(later);
    await handle(click('/img/poll.svg'), deps);
    deps.store.failing = true;
    deps.setNow(later + 60_000);
    expect(await (await handle(click('/img/poll.svg'), deps)).text()).toContain('Poll: Java 0');
  });

  it('shares one read across a burst of images', async () => {
    const deps = seeded(later);
    let reads = 0;
    const original = deps.store.read.bind(deps.store);
    deps.store.read = async () => {
      reads += 1;
      return original();
    };
    await Promise.all(Array.from({ length: 40 }, (_, i) => handle(click(`/img/key/${String.fromCharCode(65 + (i % 26))}.svg`), deps)));
    expect(reads).toBe(1);
  });

  it('sends no-cache headers on images', async () => {
    const res = await handle(click('/img/hero.svg'), seeded(later));
    expect(res.headers.get('cache-control')).toContain('no-store');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
  });

  it('answers unknown images with an image and a 404', async () => {
    const res = await handle(click('/img/secret.svg'), seeded(later));
    expect(res.status).toBe(404);
    expect(res.headers.get('content-type')).toContain('image/svg+xml');
  });
});

describe('cron', () => {
  const cron = (auth?: string) => new Request('https://oncall.test/api/cron/daily', { headers: auth ? { authorization: auth } : {} });

  it('rejects missing or wrong credentials', async () => {
    expect((await handle(cron(), seeded(later))).status).toBe(401);
    expect((await handle(cron('Bearer nope'), seeded(later))).status).toBe(401);
  });

  it('refuses everything when no secret is configured', async () => {
    const deps = seeded(later);
    deps.cronSecret = undefined;
    expect((await handle(cron('Bearer undefined'), deps)).status).toBe(401);
  });

  it('keeps the last good activity when GitHub fails, and does not change health', async () => {
    const deps = seeded(later);
    const start = freshState(T0);
    start.activity = { items: [{ text: 'OLD', at: '2026-01-01T00:00:00Z' }], fetchedAt: 1 };
    deps.store.raw = start;
    deps.fetchImpl = (async () => new Response('nope', { status: 500 })) as typeof fetch;
    expect((await handle(cron('Bearer cron-secret'), deps)).status).toBe(200);
    expect(saved(deps).activity.items[0]?.text).toBe('OLD');
    expect(saved(deps).health).toEqual(start.health);
  });
});

describe('activity', () => {
  it('skips the profile repo, unknown events and duplicates', () => {
    const at = '2026-11-01T00:00:00Z';
    const push = { type: 'PushEvent', created_at: at, repo: { name: 'sid2428/app' }, payload: { size: 2 } };
    expect(summarize([{ ...push, repo: { name: 'sid2428/sid2428' } }, push, push, { type: 'ForkEvent', created_at: at, repo: { name: 'a/b' } }])).toEqual([{ text: 'PUSHED 2 COMMITS TO APP', at }]);
  });

  it('survives network failure and non-array bodies', async () => {
    expect(await fetchActivity((async () => { throw new Error('down'); }) as typeof fetch, undefined)).toBeNull();
    expect(await fetchActivity((async () => new Response('{}')) as typeof fetch, undefined)).toBeNull();
  });
});
