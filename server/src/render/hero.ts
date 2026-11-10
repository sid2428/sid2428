import { corruptRows } from '../game/corrupt.js';
import type { StageEffect } from '../game/decay.js';
import { PORTRAIT } from '../data/portrait.js';
import { C, MONO, Svg, appear, box, clean, esc, f, sprite, windows } from './svg.js';

const HERO = ['....HHHHH...', '...HHHHHHH..', '...HHSSSSS..', '...HSSSESE..', '...HSSSSSS..', '....SSSMMS..', '.....ssss...', '...BBBBBBB..', '..BBBWBBBBS.', '.SBBBBBBB...', '...BBBWBB...', '...BBBBBB...', '...PPPPPP...'];
const LEGS = { a: ['..PP...PP...', '.PP.....PP..', '.KK.....KK..'], b: ['....PPPP....', '....PP.PP...', '...KK..KK...'] } as const;
const HERO_C = { H: '#2A1C14', S: '#E6A16B', s: '#C88C61', E: '#2A1C14', M: '#FCF7EB', B: '#1F3E6E', W: '#FCF7EB', P: '#6E5A4A', K: '#FCF7EB' };
const BUG = ['...k...k...', '....k.k....', '...RRRRR...', '..RRWRWRR..', '.kRRRRRRRk.', '..RrRRRrR..', '.k.k...k.k.'];
const BUG_C = { R: C.red, r: '#8E2F1F', W: '#FFFFFF', k: C.ink };

const W = 1200;
const H = 600;
const X = 600;

/** Name, role, projects and contact stay outside every damage path, at every health value. */
function identity(s: Svg): void {
  s.add('<g id="identity">');
  s.text('KARTIK GAIKWAD', X, 84, 6, C.ink, { fit: W - 32 - X });
  const roles = ['BACKEND', 'FULL-STACK', 'FRONTEND', 'AI / ML'];
  const per = 2.4;
  roles.forEach((role, i) => {
    s.add(`<g opacity="${i === 0 ? 1 : 0}">${windows([[i * per, (i + 1) * per]], per * roles.length)}`);
    s.text('CLASS', X, 150, 4, C.orange);
    s.text(role, X + 6 * 24, 150, 4, C.ink);
    s.add('</g>');
  });
  const lines = [
    ['LVL 3', 'E&TC @ PICT PUNE'],
    ['QUESTS', 'AEGIS, STUDIO OAK'],
    ['STACK', 'JAVA PYTHON REACT'],
    ['TROPHY', 'IEEE TECHRUSH WINNER'],
  ] as const;
  let clock = 1;
  lines.forEach(([key, value], i) => {
    const y = 206 + i * 38;
    const line = `> ${key.padEnd(7)}${value}`;
    const start = clock;
    s.text(line, X, y, 3, C.ink, { anim: (j) => appear(start + j * 0.03) });
    s.text(`> ${key}`, X, y, 3, C.orange, { anim: (j) => appear(start + j * 0.03) });
    clock += line.length * 0.03 + 0.2;
  });
  s.add('</g>');
}

function runner(s: Svg): void {
  const groundY = 460;
  const T = 7;
  s.add(`<rect x="${X}" y="${groundY}" width="${W - 32 - X}" height="4" fill="${C.ink}"/>`);
  s.add(sprite(BUG, BUG_C, 870, groundY - 28, 4));
  const from = X;
  const to = W - 84;
  const jump = ((870 + 22 - from - 24) / (to - from)) * T * 0.85;
  s.add(
    `<g transform="translate(${from} 0)"><animateTransform attributeName="transform" type="translate" ` +
      `values="${from} 0;${to} 0;${to} 0" keyTimes="0;.85;1" dur="${T}s" repeatCount="indefinite"/><g>` +
      `<animateTransform attributeName="transform" type="translate" values="0 0;0 0;0 -70;0 0;0 0" ` +
      `keyTimes="0;${f((jump - 0.35) / T)};${f(jump / T)};${f((jump + 0.35) / T)};1" dur="${T}s" repeatCount="indefinite"/>`,
  );
  for (const [key, span] of [['a', [0, 0.15]], ['b', [0.15, 0.3]]] as const) {
    s.add(`<g opacity="${key === 'a' ? 1 : 0}">${windows([span], 0.3)}${sprite([...HERO, ...LEGS[key]], HERO_C, 0, groundY - 64, 4)}</g>`);
  }
  s.add('</g></g>');
}

function portrait(s: Svg, effect: StageEffect): void {
  s.add(box(32, 76, 528, 500, C.screen));
  if (effect.stage === 'down') {
    s.text('503', 296, 260, 16, C.red, { anchor: 'middle' });
    s.text('PORTRAIT OFFLINE', 296, 400, 4, C.glow, { anchor: 'middle' });
    s.text('FIX THE INCIDENT BELOW', 296, 446, 3, C.glow, { anchor: 'middle' });
    return;
  }
  const rows = corruptRows(PORTRAIT, effect.ratio, 42);
  const cellW = 5.2;
  const rowH = 9.3;
  rows.forEach((row, i) => {
    if (!row.trim()) return;
    s.add(
      `<text x="46" y="${f(92 + i * rowH + 7)}" font-family="${MONO}" font-size="8.8" fill="${C.glow}" ` +
        `textLength="${f(row.length * cellW)}" lengthAdjust="spacing" xml:space="preserve">${esc(row)}${appear(0.3 + i * 0.035)}</text>`,
    );
  });
  s.add(`<rect x="36" y="80" width="520" height="2" fill="${C.glow}" opacity=".18"><animateTransform attributeName="transform" type="translate" values="0 0;0 488" dur="6s" repeatCount="indefinite"/></rect>`);
}

export function renderHero(effect: StageEffect, health: number): string {
  const s = new Svg(
    W,
    H,
    `Kartik Gaikwad (sid2428): ASCII portrait on an arcade screen; 3rd-year E&TC student at PICT Pune; backend, full-stack, frontend and AI/ML; projects AEGIS and Studio Oak; IEEE TechRush winner. Profile health ${Math.round(health)} percent.`,
  );
  s.add(
    `<defs><pattern id="dots" width="16" height="16" patternUnits="userSpaceOnUse"><rect width="4" height="4" fill="${C.dots}"/></pattern></defs>`,
    `<rect width="${W}" height="${H}" fill="${C.bg}"/><rect width="${W}" height="${H}" fill="url(#dots)"/>`,
  );
  s.text('1UP', 32, 22, 3, C.orange);
  s.text('SID2428', 104, 22, 3, C.ink);
  s.add('<g>');
  s.text('INSERT COIN TO HIRE', 600, 22, 3, C.orange, { anchor: 'middle' });
  s.add('<animate attributeName="opacity" values="1;0" keyTimes="0;.62" calcMode="discrete" dur="1.3s" repeatCount="indefinite"/></g>');
  s.text('PUNE, INDIA', W - 32, 22, 3, C.muted, { anchor: 'end' });
  const dashes = Array.from({ length: Math.ceil((W - 64) / 16) }, (_, i) => `M${32 + i * 16} 54h8v4h-8z`).join('');
  s.add(`<path d="${dashes}" fill="${C.ink}" opacity=".5"/>`);

  portrait(s, effect);
  identity(s);
  runner(s);

  s.add('<g>');
  s.text(clean(effect.stage === 'healthy' ? 'YOU ARE ON-CALL ↓' : `${effect.label}: TAP TO HELP ↓`), X, 504, 4, effect.stage === 'healthy' ? C.orange : C.red, { fit: W - 32 - X });
  s.add('<animateTransform attributeName="transform" type="translate" values="0 0;0 4" keyTimes="0;.5" calcMode="discrete" dur=".9s" repeatCount="indefinite"/></g>');

  const barW = W - 32 - X;
  s.add(`<rect x="${X}" y="548" width="${barW}" height="16" fill="${C.paper2}"/>`);
  s.add(`<rect x="${X}" y="548" width="${f((barW * Math.max(0, Math.min(100, health))) / 100)}" height="16" fill="${health > 50 ? C.green : health > 25 ? C.yellow : C.red}"/>`);
  return s.render();
}
