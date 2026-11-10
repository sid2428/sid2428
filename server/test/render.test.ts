import { describe, expect, it } from 'vitest';
import { corruptLine, corruptRows } from '../src/game/corrupt.js';
import { effectFor, healthNow } from '../src/game/decay.js';
import { parseState } from '../src/game/state.js';
import { renderImage } from '../src/http/images.js';
import { parseImage } from '../src/http/routes.js';
import { renderHero } from '../src/render/hero.js';
import { clean, esc, wrap } from '../src/render/svg.js';
import { PORTRAIT } from '../src/data/portrait.js';
import { DAY, T0, freshState } from './helpers.js';

const identityBlock = (svg: string): string => {
  const start = svg.indexOf('<g id="identity">');
  const end = svg.indexOf('<rect x="600" y="460"');
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return svg.slice(start, end);
};

describe('corruption', () => {
  it('leaves text alone at ratio 0', () => {
    expect(corruptLine('HELLO', 0, 1)).toBe('HELLO');
  });

  it('is deterministic', () => {
    expect(corruptRows(PORTRAIT, 0.3, 42)).toEqual(corruptRows(PORTRAIT, 0.3, 42));
  });

  it('is monotonic: anything corrupted stays corrupted at higher ratios', () => {
    const low = corruptRows(PORTRAIT, 0.12, 42);
    const high = corruptRows(PORTRAIT, 0.55, 42);
    low.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) {
        if (row.charAt(x) !== PORTRAIT[y]!.charAt(x)) expect(high[y]!.charAt(x)).toBe(row.charAt(x));
      }
    });
  });

  it('never touches spaces, so the portrait keeps its outline', () => {
    corruptRows(PORTRAIT, 1, 42).forEach((row, y) => {
      for (let x = 0; x < row.length; x++) if (PORTRAIT[y]!.charAt(x) === ' ') expect(row.charAt(x)).toBe(' ');
    });
  });

  it('corrupts about the requested share', () => {
    const line = 'X'.repeat(4000);
    const changed = [...corruptLine(line, 0.3, 42)].filter((c) => c !== 'X').length;
    expect(changed / line.length).toBeGreaterThan(0.25);
    expect(changed / line.length).toBeLessThan(0.35);
  });
});

describe('protected identity', () => {
  it('is byte-identical at every health value, including fully down', () => {
    const healthy = identityBlock(renderHero(effectFor(100), 100));
    for (const value of [75, 50, 25, 1, 0]) expect(identityBlock(renderHero(effectFor(value), value))).toBe(healthy);
  });

  it('keeps the name and projects in the accessible label when down', () => {
    const svg = renderHero(effectFor(0), 0);
    expect(svg).toContain('Kartik Gaikwad');
    expect(svg).toContain('AEGIS');
    expect(svg).toContain('Studio Oak');
  });
});

describe('text safety', () => {
  it('escapes markup', () => {
    expect(esc(`<a href="x">&'`)).toBe('&lt;a href=&quot;x&quot;&gt;&amp;&#39;');
  });

  it('replaces glyphs the pixel font lacks', () => {
    expect(clean('héllo→')).toBe('H?LLO?');
  });

  it('wraps long words and handles empty input', () => {
    expect(wrap('', 10)).toEqual(['']);
    expect(wrap('AAAAAAAAAAAAAAA BB', 10)).toEqual(['AAAAAAAAAA', 'AAAAA BB']);
  });
});

describe('every image renders in every stage', () => {
  const paths = [
    ['hero.svg'], ['incident.svg'], ['postmortem.svg'], ['fact.svg'], ['activity.svg'], ['quiz.svg'], ['word.svg'], ['ttt.svg'], ['poll.svg'], ['next.svg'],
    ['fold', 'quiz.svg'], ['fold', 'bughunt.svg'], ['key', 'A.svg'], ['cell', '5.svg'], ['ans', 'b.svg'], ['vote', 'java.svg'], ['fix', 'dns.svg'], ['link', 'email.svg'],
  ];

  it.each(paths)('%s', (...segments) => {
    const parts = segments.filter((s): s is string => typeof s === 'string');
    const spec = parseImage(parts);
    expect(spec).not.toBeNull();
    for (const days of [0, 2.5, 4.5, 6.5, 9]) {
      const svg = renderImage(spec!, freshState(), T0 + days * DAY);
      expect(svg.startsWith('<svg')).toBe(true);
      expect(svg).not.toMatch(/NaN|undefined/);
    }
    expect(renderImage(spec!, null, T0).startsWith('<svg')).toBe(true);
  });

  it('draws every stage from healthy to down on the hero', () => {
    const stages = [0, 2.5, 4.5, 6.5, 9].map((d) => effectFor(healthNow(freshState().health, T0 + d * DAY)).stage);
    expect(stages).toEqual(['healthy', 'degraded', 'major', 'critical', 'down']);
  });
});

describe('state validation', () => {
  it('returns defaults for garbage', () => {
    for (const raw of [null, 7, 'x', [], {}]) expect(parseState(raw, T0)).toEqual(freshState(T0));
  });

  it('repairs one damaged section and keeps the rest', () => {
    const good = freshState();
    good.quiz.num = 42;
    const raw = { ...good, ttt: { board: 'broken' }, health: { value: 999, at: 'soon' } };
    const parsed = parseState(raw, T0);
    expect(parsed.quiz.num).toBe(42);
    expect(parsed.ttt).toEqual(freshState().ttt);
    expect(parsed.health).toEqual(freshState().health);
  });

  it('rejects boards of the wrong size', () => {
    const st = { ...freshState(), ttt: { ...freshState().ttt, board: ['', 'X'] } };
    expect(parseState(st, T0).ttt.board).toHaveLength(9);
  });
});
