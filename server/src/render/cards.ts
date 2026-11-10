import { ACTION_LABELS, type Action, incidentAt } from '../data/incidents.js';
import { FACTS } from '../data/facts.js';
import { QUIZ } from '../data/quiz.js';
import { WORDS } from '../data/words.js';
import { type StageEffect, uptimePercent } from '../game/decay.js';
import type { GameState } from '../game/state.js';
import { C, Svg, box, card, wrap } from './svg.js';

const DAY_MS = 86_400_000;

function lockedCard(title: string, effect: StageEffect): string {
  const s = card(800, 150, title, effect, 'OFFLINE', `${title} is offline until the incident is fixed.`);
  s.text('503: SERVICE UNAVAILABLE', 400, 72, 4, C.red, { anchor: 'middle' });
  s.text('FIX THE LIVE INCIDENT TO BRING THIS BACK.', 400, 112, 2.6, C.muted, { anchor: 'middle', fit: 740 });
  return s.render();
}

export function renderOutage(title: string): string {
  const s = new Svg(800, 150, `${title}: temporarily unavailable.`);
  s.add(box(0, 0, 794, 144, C.screen));
  s.text('DATABASE OUTAGE', 397, 40, 5, C.red, { anchor: 'middle' });
  s.text('THE ON-CALL HAS BEEN PAGED. REFRESH SOON.', 397, 96, 2.6, C.glow, { anchor: 'middle', fit: 740 });
  return s.render();
}

export function renderIncident(st: GameState, effect: StageEffect, health: number): string {
  const item = incidentAt(st.incident.seq);
  const log = item.log.flatMap((line) => wrap(line, 52));
  const note = st.incident.note ? wrap(st.incident.note, 52) : [];
  const logH = 26 * log.length + 32;
  const h = 200 + logH + 26 * note.length;
  const s = card(800, h, `INCIDENT #${st.incident.seq + 1}: ${item.title}`, effect, effect.sev, `Incident ${st.incident.seq + 1}: ${item.title}. ${item.log.join('. ')}. Health ${Math.round(health)} percent.`);

  const barColor = health > 50 ? C.green : health > 25 ? C.yellow : C.red;
  s.text('HEALTH', 22, 72, 3, C.ink);
  s.add(`<rect x="146" y="68" width="520" height="30" fill="${C.paper2}"/>`);
  s.add(`<rect x="146" y="68" width="${(520 * health) / 100}" height="30" fill="${barColor}"/>`);
  s.text(`${Math.round(health)}%`, 772, 72, 3, C.ink, { anchor: 'end' });
  s.text(effect.label, 400, 116, 3, effect.stage === 'healthy' ? C.green : C.red, { anchor: 'middle' });

  s.add(box(18, 148, 758, logH, C.screen, C.ink, false));
  log.forEach((line, i) => s.text(`> ${line}`, 34, 164 + i * 26, 2.4, C.glow, { fit: 726 }));
  let y = 148 + logH + 16;
  note.forEach((line) => {
    s.text(line, 22, y, 2.4, C.orange, { fit: 750 });
    y += 26;
  });
  s.text('READ THE LOG. PICK THE FIX. WRONG FIXES HURT.', 400, y + 2, 2.4, C.muted, { anchor: 'middle', fit: 750 });
  return s.render();
}

export function renderPostmortem(st: GameState, effect: StageEffect, now: number): string {
  const pm = st.postmortem;
  const top = Object.entries(st.scores)
    .sort(([a, x], [b, y]) => y - x || a.localeCompare(b))
    .slice(0, 5);
  const feed = st.feed.slice(0, 5);
  const rows = Math.max(1, top.length);
  const h = 72 + 34 * 3 + 30 + 34 * rows + 40 + 28 * Math.max(1, feed.length) + 20;
  const uptime = uptimePercent(st, now).toFixed(1);
  const s = card(800, h, 'POSTMORTEM', effect, `UPTIME ${uptime}%`, `Postmortem: uptime ${uptime} percent. ${pm.fixes} incidents fixed, ${pm.wrongs} made worse. Scores: ${top.map(([u, p]) => `${u} ${p}`).join(', ')}`);
  let y = 72;
  s.text(`FIXED ${pm.fixes}   MADE WORSE ${pm.wrongs}`, 22, y, 3, C.ink, { fit: 750 });
  y += 34;
  s.text(`LAST SAVED BY ${pm.lastSave?.who ?? 'NOBODY YET'}`, 22, y, 3, C.green, { fit: 750 });
  y += 34;
  s.text(`LAST BROKEN BY ${pm.lastBreak ? `${pm.lastBreak.who} (${pm.lastBreak.action})` : 'NOBODY YET'}`, 22, y, 3, C.red, { fit: 750 });
  y += 44;
  s.add(`<rect x="18" y="${y - 14}" width="758" height="4" fill="${C.ink}" opacity=".15"/>`);
  if (!top.length) {
    s.text('NO RESPONDERS YET. BE THE FIRST!', 22, y, 3, C.muted);
    y += 34;
  }
  top.forEach(([who, points], i) => {
    s.text(`${i + 1}. ${who}`, 22, y, 3, i === 0 ? C.orange : C.ink, { fit: 560 });
    s.text(`${points} PTS`, 772, y, 3, C.ink, { anchor: 'end' });
    y += 34;
  });
  y += 12;
  s.text('LATEST PAGES', 22, y, 2.4, C.muted);
  y += 28;
  for (const line of feed.length ? feed : ['WAITING FOR THE FIRST RESPONDER...']) {
    s.text(line, 22, y, 2.4, C.ink, { fit: 750 });
    y += 28;
  }
  return s.render();
}

export function factIndex(st: GameState, now: number): number {
  const count = FACTS.length;
  return (Math.floor(now / DAY_MS) + st.fact.offset) % count;
}

export function renderFact(st: GameState, effect: StageEffect, now: number): string {
  const i = factIndex(st, now);
  const fact = FACTS[i] ?? '';
  const lines = wrap(fact, 40);
  const s = card(800, 74 + 32 * lines.length + 12, 'DEV FACT OF THE DAY', effect, `#${i + 1}`, `Dev fact: ${fact}`);
  lines.forEach((line, k) => s.text(line, 22, 72 + 32 * k, 3, C.ink));
  return s.render();
}

function ago(iso: string, now: number): string {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return '';
  const hours = Math.max(0, now - then) / 3_600_000;
  return hours >= 24 ? `${Math.floor(hours / 24)}D AGO` : `${Math.max(1, Math.floor(hours))}H AGO`;
}

export function renderActivity(st: GameState, effect: StageEffect, now: number): string {
  const items = st.activity.items.slice(0, 5);
  const h = 72 + 30 * Math.max(1, items.length) + 16;
  const s = card(800, h, 'LATEST FROM SID2428', effect, '', `Recent GitHub activity: ${items.map((a) => a.text).join('; ')}`);
  let y = 72;
  if (!items.length) s.text('NOTHING PUBLIC IN THE LAST FEW DAYS', 22, y, 2.6, C.ink, { fit: 750 });
  for (const item of items) {
    s.text(item.text, 22, y, 2.6, C.ink, { fit: 640 });
    s.text(ago(item.at, now), 772, y, 2.6, C.muted, { anchor: 'end' });
    y += 30;
  }
  return s.render();
}

export function renderQuiz(st: GameState, effect: StageEffect): string {
  const quiz = st.quiz;
  if (effect.stage === 'down') return lockedCard('QUIZ', effect);
  const item = QUIZ[quiz.i % QUIZ.length];
  if (!item) return lockedCard('QUIZ', effect);
  const qLines = wrap(item.q, 40);
  const last = quiz.last;
  const lastLines = last
    ? [...wrap(`#${last.num}: ${last.who} PICKED ${last.pick}. ${last.ok ? 'CORRECT!' : `WRONG, IT WAS ${last.right}.`}`, 44), ...wrap(last.why, 44)]
    : [];
  const h = 70 + 32 * qLines.length + 162 + 20 + (lastLines.length ? 24 * lastLines.length + 30 : 0) + 10;
  const s = card(800, h, `QUIZ #${quiz.num}`, effect, '+1 PT IF RIGHT', `Quiz question ${quiz.num}: ${item.q} A: ${item.o[0]}. B: ${item.o[1]}. C: ${item.o[2]}.`);
  let y = 72;
  for (const line of qLines) {
    s.text(line, 22, y, 3, C.ink);
    y += 32;
  }
  y += 6;
  item.o.forEach((option, k) => {
    s.add(`<rect x="18" y="${y}" width="758" height="44" fill="${C.paper2}"/>`);
    s.text('ABC'.charAt(k), 34, y + 12, 3, C.orange);
    s.text(option, 74, y + 12, 3, C.ink, { fit: 690 });
    y += 54;
  });
  if (last) {
    y += 8;
    s.add(`<rect x="18" y="${y}" width="758" height="4" fill="${C.ink}" opacity=".15"/>`);
    y += 18;
    lastLines.forEach((line, i) => {
      s.text(line, 22, y, 2.4, i === 0 ? (last.ok ? C.green : C.red) : C.muted, { fit: 750 });
      y += 24;
    });
  }
  return s.render();
}

export function renderWord(st: GameState, effect: StageEffect): string {
  const w = st.word;
  if (effect.stage === 'down') return lockedCard('WORD GAME', effect);
  const entry = WORDS[w.i % WORDS.length];
  if (!entry) return lockedCard('WORD GAME', effect);
  const word = [...entry.w];
  const h = 214 + (w.last ? 32 : 0) + (w.prev ? 32 : 0);
  const shown = word.map((ch) => (w.guessed.includes(ch) ? ch : '_')).join(' ');
  const s = card(800, h, `WORD GAME · ROUND ${w.round}`, effect, '', `Word game round ${w.round}: ${shown}. Hint: ${entry.h}`);
  s.text('♥'.repeat(w.lives) + '·'.repeat(6 - w.lives), 772, 20, 3, C.red, { anchor: 'end' });
  const slot = word.length <= 12 ? 50 : 44;
  const x0 = (794 - slot * word.length) / 2;
  word.forEach((ch, i) => {
    const x = x0 + i * slot;
    s.add(`<rect x="${x + 4}" y="114" width="${slot - 12}" height="5" fill="${C.ink}"/>`);
    if (w.guessed.includes(ch)) s.text(ch, x + 4 + (slot - 12) / 2, 72, 5, C.ink, { anchor: 'middle' });
  });
  s.text(`HINT: ${entry.h}`, 400, 138, 3, C.muted, { anchor: 'middle', fit: 740 });
  const misses = w.guessed.filter((g) => !word.includes(g));
  s.text(`MISSES: ${misses.length ? misses.join(' ') : 'NONE YET'}`, 400, 172, 3, C.ink, { anchor: 'middle', fit: 740 });
  const y = 212;
  if (w.last) {
    s.text(`${w.last.who} GUESSED ${w.last.letter}: ${w.last.hit ? 'HIT!' : 'MISS'}`, 400, y, 2.6, w.last.hit ? C.green : C.red, { anchor: 'middle', fit: 740 });
  }
  if (w.prev) {
    const message = w.prev.solvedBy ? `LAST WORD ${w.prev.word} SOLVED BY ${w.prev.solvedBy}` : `LAST WORD WAS ${w.prev.word}. NOBODY GOT IT`;
    s.text(message, 400, y + (w.last ? 32 : 0), 2.4, C.muted, { anchor: 'middle', fit: 740 });
  }
  return s.render();
}

export function renderTtt(st: GameState, effect: StageEffect): string {
  const t = st.ttt;
  if (effect.stage === 'down') return lockedCard('TIC-TAC-TOE', effect);
  const s = card(800, 170, `TIC-TAC-TOE · GAME ${t.game}`, effect, `W${t.w} L${t.l} D${t.d}`, `Tic-tac-toe game ${t.game}. Visitors have won ${t.w}, lost ${t.l}, drawn ${t.d}.`);
  s.text('YOU ARE X. THE BOT IS O.', 22, 74, 3, C.ink);
  s.text(t.note || 'CLICK AN EMPTY SQUARE TO MOVE.', 22, 116, 2.6, C.orange, { fit: 750 });
  return s.render();
}

export function renderPoll(st: GameState, effect: StageEffect): string {
  const p = st.poll;
  if (effect.stage === 'down') return lockedCard('POLL', effect);
  const total = p.java + p.python;
  const s = card(800, 190, 'POLL: JAVA OR PYTHON FOR A NEW BACKEND?', effect, '', `Poll: Java ${p.java}, Python ${p.python}`);
  (['java', 'python'] as const).forEach((key, i) => {
    const y = 74 + i * 46;
    s.text(key, 22, y, 3, C.ink);
    s.add(`<rect x="170" y="${y - 4}" width="460" height="30" fill="${C.paper2}"/>`);
    if (total && p[key]) s.add(`<rect x="170" y="${y - 4}" width="${(460 * p[key]) / total}" height="30" fill="${C.orange}"/>`);
    s.text(String(p[key]), 772, y, 3, C.ink, { anchor: 'end' });
  });
  s.text(`${total} VOTES. VOTING AGAIN CHANGES YOUR VOTE.`, 22, 160, 2.2, C.muted);
  return s.render();
}

export type FoldSection = 'quiz' | 'word' | 'ttt' | 'poll' | 'bughunt';

export function renderFold(section: FoldSection, st: GameState | null, effect: StageEffect): string {
  const down = effect.stage === 'down';
  const labels: Record<FoldSection, string> = {
    quiz: st ? `QUIZ #${st.quiz.num}` : 'QUIZ',
    word: st ? `WORD GAME · ROUND ${st.word.round}` : 'WORD GAME',
    ttt: st ? `TIC-TAC-TOE · GAME ${st.ttt.game}` : 'TIC-TAC-TOE',
    poll: st ? `POLL · JAVA ${st.poll.java} · PYTHON ${st.poll.python}` : 'POLL',
    bughunt: 'BUG HUNT · 3 BUGS · 8 FILES',
  };
  const s = new Svg(800, 62, `Open ${labels[section]}`);
  s.add(box(0, 0, 794, 56, C.paper));
  s.text(`> ${labels[section]}`, 20, 18, 3, C.ink, { fit: 590 });
  s.text(down && section !== 'bughunt' ? 'OFFLINE' : 'OPEN', 770, 20, 2.4, down && section !== 'bughunt' ? C.red : C.muted, { anchor: 'end' });
  return s.render();
}

export type ButtonLook = 'idle' | 'hit' | 'miss';

export function renderButton(label: string, w: number, h: number, look: ButtonLook = 'idle', scale = 3): string {
  const fill = look === 'hit' ? C.orange : look === 'miss' ? C.paper2 : C.paper;
  const color = look === 'hit' ? C.paper : look === 'miss' ? C.faint : C.ink;
  const s = new Svg(w, h, label);
  s.add(box(0, 0, w - 6, h - 6, fill));
  s.text(label, (w - 6) / 2, (h - 6) / 2 - (7 * scale) / 2, scale, color, { anchor: 'middle', fit: w - 30 });
  return s.render();
}

export function renderFixButton(action: Action, tried: boolean, locked = false): string {
  return renderButton(ACTION_LABELS[action], 196, 64, tried || locked ? 'miss' : 'idle');
}

export function renderCell(mark: '' | 'X' | 'O', hint: string): string {
  const s = new Svg(126, 126, mark || `square ${hint}`);
  s.add(box(0, 0, 120, 120, mark ? C.paper2 : C.paper));
  if (mark === 'X') s.text('X', 60, 39, 7, C.orange, { anchor: 'middle' });
  else if (mark === 'O') s.text('O', 60, 39, 7, C.ink, { anchor: 'middle' });
  else s.text(hint, 60, 50, 3, C.faint, { anchor: 'middle' });
  return s.render();
}
