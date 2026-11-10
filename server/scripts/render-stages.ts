/** Writes one HTML contact sheet per damage stage into stage-previews/ for visual review. */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DECAY_PER_MS } from '../src/config.js';
import { defaultState } from '../src/game/state.js';
import { renderImage } from '../src/http/images.js';
import { parseImage } from '../src/http/routes.js';

const out = resolve(dirname(fileURLToPath(import.meta.url)), '../stage-previews');
mkdirSync(out, { recursive: true });

const NOW = 1_800_000_000_000;
const CARDS = ['hero.svg', 'incident.svg', 'postmortem.svg', 'quiz.svg', 'word.svg', 'ttt.svg', 'poll.svg', 'fact.svg'];

for (const health of [100, 62, 38, 12, 0]) {
  const state = defaultState(NOW);
  state.health = { value: 100, at: NOW - (100 - health) / DECAY_PER_MS };
  state.incident.note = 'SLEEPY-KERNEL-42 TRIED ROLLBACK. IT MADE THINGS WORSE';
  state.scores = { 'BRAVE-SOCKET-7': 14, 'SLEEPY-KERNEL-42': 9 };
  state.feed = ['BRAVE-SOCKET-7 CLOSED INCIDENT #1 WITH ROLLBACK', 'SLEEPY-KERNEL-42 GUESSED E: HIT'];
  state.postmortem.fixes = 3;
  state.postmortem.wrongs = 1;
  state.postmortem.lastSave = { who: 'BRAVE-SOCKET-7', at: NOW };
  state.postmortem.lastBreak = { who: 'SLEEPY-KERNEL-42', at: NOW, action: 'ROLLBACK' };
  state.word.guessed = ['K', 'E', 'Z'];
  state.word.lives = 5;
  state.ttt.board = ['X', '', 'O', '', 'X', '', '', '', 'O'];
  const body = CARDS.map((path) => {
    const spec = parseImage([path]);
    if (!spec) throw new Error(`bad preview path ${path}`);
    return `<div style="width:${path === 'hero.svg' ? 1200 : 800}px;margin:10px">${renderImage(spec, state, NOW)}</div>`;
  }).join('');
  writeFileSync(`${out}/health-${health}.html`, `<!doctype html><body style="margin:0;background:#fff;width:1240px">${body}</body>`, 'utf8');
}
console.log(`Wrote previews to ${out}`);
