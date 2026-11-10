/**
 * Writes the profile README. Links are permanent because the server decides what each click means.
 * Usage: npm run readme -- https://your-deployment.vercel.app
 */
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ACTIONS } from '../src/data/incidents.js';

const base = process.argv[2]?.replace(/\/$/, '');
if (!base || !/^https:\/\/[a-z0-9.-]+$/i.test(base)) {
  console.error('Usage: npm run readme -- https://your-deployment.vercel.app');
  process.exit(1);
}

const here = dirname(fileURLToPath(import.meta.url));
const output = resolve(here, '../../README.md');
const PROFILE = 'https://github.com/sid2428';

const pic = (src: string, alt: string, width: number | string = 800): string =>
  `<picture><img src="${src}" width="${width}" alt="${alt}"></picture>`;
const img = (path: string, alt: string, width: number | string = 800): string => `<img src="${base}/img/${path}" width="${width}" alt="${alt}">`;
const link = (href: string, path: string, alt: string, width: number | string = 800): string => `<a href="${href}">${img(path, alt, width)}</a>`;
const play = (path: string, image: string, alt: string, width: number): string => link(`${base}/play/${path}`, image, alt, width);

function fold(anchor: string, section: string, alt: string, body: string): string {
  return [`<details><summary>${pic(`${base}/img/fold/${section}.svg`, alt)}</summary>`, '', `<a name="${anchor}"></a>`, '', body, '', '</details>'].join('\n');
}

const LETTERS = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'];
const keys = LETTERS.map((ch) => play(`word/${ch}`, `key/${ch}.svg`, `guess ${ch}`, 58));
const cells = Array.from({ length: 9 }, (_, i) => play(`ttt/${i + 1}`, `cell/${i + 1}.svg`, `play square ${i + 1}`, 126));

const FILES = [
  ['billing/price.py', 'CLEAN: DECIMAL, NOT FLOAT. MONEY MATH DONE RIGHT.'],
  ['ui/sort.js', 'BUG: SORT() COMPARES AS STRINGS. USE SORT((A, B) =&gt; A - B).'],
  ['auth/guard.ts', 'CLEAN: STRICT EQUALITY, OPTIONAL CHAINING.'],
  ['db/user.sql', 'CLEAN: PARAMETERISED. NO SQL INJECTION TODAY.'],
  ['shop/cart.py', 'BUG: THE DEFAULT LIST IS SHARED BY EVERY CALL. USE CART=NONE.'],
  ['net/retry.js', 'CLEAN: BOUNDED RETRIES WITH BACKOFF.'],
  ['lib/sum.c', 'BUG: OFF-BY-ONE. I &lt;= N READS A[N], PAST THE END.'],
  ['.github/ci.yml', 'CLEAN: BORING CI CONFIG. BORING IS GOOD.'],
] as const;

const bugFiles = FILES.map(
  ([path, verdict], i) =>
    `<details><summary>${pic(`assets/static/files/${i + 1}.svg`, `open ${path}`, 766)}</summary>${pic(`assets/static/files/${i + 1}-open.svg`, `${path}: ${verdict}`, 766)}</details>`,
).join('\n');

const readme = [
  '<div align="center">',
  '',
  link('#user-content-incident', 'hero.svg', 'Kartik Gaikwad, on an arcade screen. Jump to the live incident', '100%'),
  '',
  '<a name="incident"></a>',
  '',
  link('#user-content-postmortem', 'incident.svg', 'The live incident on this profile'),
  '',
  ACTIONS.map((action) => play(`fix/${action}`, `fix/${action}.svg`, `fix with ${action}`, 196)).join(' '),
  '',
  '<a name="postmortem"></a>',
  '',
  link('#user-content-incident', 'postmortem.svg', 'Postmortem: uptime, who saved it, who broke it, and high scores'),
  '',
  '<a name="fact"></a>',
  '',
  play('fact/next', 'fact.svg', 'Dev fact of the day. Click for the next one', 800),
  '',
  play('fact/next', 'next.svg', 'next fact', 390),
  '',
  link(`${PROFILE}?tab=repositories`, 'activity.svg', 'Latest GitHub activity. Click to browse repositories'),
  '',
  fold('quiz', 'quiz', 'Open the quiz', [img('quiz.svg', 'Current quiz question'), '', (['a', 'b', 'c'] as const).map((k) => play(`quiz/${k}`, `ans/${k}.svg`, `answer ${k.toUpperCase()}`, 258)).join(' ')].join('\n')),
  '',
  fold('word', 'word', 'Open the word game', [img('word.svg', 'Word game'), '', `${keys.slice(0, 13).join(' ')}<br>${keys.slice(13).join(' ')}`].join('\n')),
  '',
  fold('ttt', 'ttt', 'Open tic-tac-toe', [img('ttt.svg', 'Tic-tac-toe'), '', `${cells.slice(0, 3).join(' ')}<br>${cells.slice(3, 6).join(' ')}<br>${cells.slice(6).join(' ')}`].join('\n')),
  '',
  fold('poll', 'poll', 'Open the poll', [img('poll.svg', 'Poll results'), '', (['java', 'python'] as const).map((o) => play(`vote/${o}`, `vote/${o}.svg`, `vote ${o}`, 390)).join(' ')].join('\n')),
  '',
  fold('bughunt', 'bughunt', 'Open the bug hunt', [pic('assets/static/bughunt.svg', 'Bug hunt: open the files to find 3 bugs'), '', bugFiles].join('\n')),
  '',
  `<a href="${PROFILE}?tab=repositories"><img src="https://raw.githubusercontent.com/sid2428/sid2428/output/snake.svg" width="800" alt="A snake eating the contribution graph. Click to browse repositories"></a>`,
  '',
  [
    link('https://www.linkedin.com/in/kartikgaikwad', 'link/linkedin.svg', 'LinkedIn', 196),
    link('mailto:kartikgaikwad2828@gmail.com', 'link/email.svg', 'Email', 196),
    link('https://github.com/sid2428/finance2', 'link/aegis.svg', 'AEGIS repo', 196),
    link('https://github.com/sid2428/Studio__Oak', 'link/studio-oak.svg', 'Studio Oak repo', 196),
  ].join(' '),
  '',
  '</div>',
  '',
].join('\n');

writeFileSync(output, readme, 'utf8');
console.log(`Wrote ${output} using ${base}`);
