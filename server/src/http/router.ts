import { CAS_ATTEMPTS, PROFILE_URL } from '../config.js';
import { fetchActivity } from '../github/activity.js';
import type { Move } from '../game/moves.js';
import { parseState } from '../game/state.js';
import { renderOutage } from '../render/cards.js';
import type { StateReader } from '../store/state-reader.js';
import type { Store } from '../store/store.js';
import { clientIp, fromGitHub, identify, isAutomated, safeEqual, sameOrigin } from './guards.js';
import { renderImage } from './images.js';
import { submitMove } from './move-batcher.js';
import { anchorFor, movePath, parseImage, parseMove } from './routes.js';

export interface Deps {
  store: Store;
  reader: StateReader;
  now: () => number;
  random: () => number;
  fetchImpl: typeof fetch;
  ipSecret: string | undefined;
  cronSecret: string | undefined;
  githubToken: string | undefined;
}

const SVG_HEADERS = {
  'Content-Type': 'image/svg+xml; charset=utf-8',
  'Cache-Control': 'no-cache, no-store, must-revalidate, max-age=0',
  Pragma: 'no-cache',
  Expires: '0',
  'X-Content-Type-Options': 'nosniff',
  'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'",
};

function svg(body: string, status = 200): Response {
  return new Response(body, { status, headers: SVG_HEADERS });
}

function backToProfile(move: Move | null): Response {
  return new Response(null, { status: 302, headers: { Location: `${PROFILE_URL}#${anchorFor(move)}`, 'Cache-Control': 'no-store' } });
}

function confirmPage(move: Move): Response {
  const action = movePath(move);
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Confirm move</title><style>
body{margin:0;min-height:100vh;display:grid;place-items:center;background:#F3ECDC;color:#3B2A20;font-family:ui-monospace,Menlo,Consolas,monospace;padding:16px}
main{background:#FCF7EB;border:4px solid #3B2A20;box-shadow:6px 6px 0 #D8C8AA;padding:28px;max-width:420px;text-align:center}
button{font:inherit;font-weight:700;font-size:20px;background:#E07A1F;color:#FCF7EB;border:4px solid #3B2A20;padding:14px 28px;cursor:pointer}
a{color:#3B2A20;display:block;margin-top:18px}</style></head>
<body><main><h1>Confirm your move</h1><p>Your browser did not say this click came from the profile, so one more tap is needed.</p>
<form method="post" action="${action}"><button type="submit">PLAY MOVE</button></form><a href="${PROFILE_URL}">Back to the profile</a></main></body></html>`;
  return new Response(html, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' } });
}

async function handlePlay(req: Request, segments: readonly string[], deps: Deps): Promise<Response> {
  const move = parseMove(segments);
  if (!move || req.method === 'HEAD' || isAutomated(req.headers) || !deps.ipSecret) return backToProfile(move);
  if (req.method === 'POST' ? !sameOrigin(req.headers, req.url) : req.method !== 'GET') return backToProfile(move);
  if (req.method === 'GET' && !fromGitHub(req.headers)) return confirmPage(move);
  const identity = identify(clientIp(req.headers), deps.ipSecret);
  try {
    if (await deps.store.allowMove(identity.key)) await submitMove(deps, move, identity);
  } catch (error) {
    console.error('move failed', error instanceof Error ? error.message : error);
  }
  return backToProfile(move);
}

async function handleImage(segments: readonly string[], deps: Deps): Promise<Response> {
  const spec = parseImage(segments);
  if (!spec) return svg(renderOutage('NOT FOUND'), 404);
  const state = await deps.reader.get();
  return svg(renderImage(spec, state, deps.now()));
}

async function handleCron(req: Request, deps: Deps): Promise<Response> {
  const header = req.headers.get('authorization') ?? '';
  if (!deps.cronSecret || !safeEqual(header, `Bearer ${deps.cronSecret}`)) return new Response('unauthorized', { status: 401 });
  const items = await fetchActivity(deps.fetchImpl, deps.githubToken);
  for (let attempt = 0; attempt < CAS_ATTEMPTS; attempt++) {
    const { raw, version } = await deps.store.read();
    const now = deps.now();
    const state = parseState(raw, now);
    if (items) state.activity = { items, fetchedAt: now };
    if (await deps.store.compareAndSet(version, state)) {
      deps.reader.put(state);
      return Response.json({ ok: true, activity: items?.length ?? 'kept last good' });
    }
  }
  return Response.json({ ok: false, reason: 'conflict' }, { status: 503 });
}

/** Top-level boundary: images always answer with an image, and moves always land back on the profile. */
export async function handle(req: Request, deps: Deps): Promise<Response> {
  const segments = new URL(req.url).pathname.split('/').filter(Boolean);
  const [root, ...rest] = segments;
  try {
    if (root === 'img') return await handleImage(rest, deps);
    if (root === 'play') return await handlePlay(req, rest, deps);
    if (root === 'api' && rest[0] === 'cron' && rest[1] === 'daily') return await handleCron(req, deps);
    if (root === 'api' && rest[0] === 'health') return Response.json({ ok: true });
    return backToProfile(null);
  } catch (error) {
    console.error('request failed', error instanceof Error ? error.message : error);
    if (root === 'img') return svg(renderOutage('OUTAGE'));
    if (root === 'play') return backToProfile(null);
    return new Response('error', { status: 500 });
  }
}
