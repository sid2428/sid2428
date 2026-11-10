import { corruptLine } from '../game/corrupt.js';
import type { StageEffect } from '../game/decay.js';
import { FONT } from './font.js';

export const C = {
  bg: '#F3ECDC',
  paper: '#FCF7EB',
  paper2: '#EFE3CC',
  ink: '#3B2A20',
  muted: '#7A6553',
  faint: '#CDBB9C',
  orange: '#E07A1F',
  yellow: '#E8A317',
  red: '#C2452D',
  green: '#4F8A3A',
  shadow: '#D8C8AA',
  dots: '#E6DBC4',
  screen: '#2E211A',
  glow: '#F2D3A6',
} as const;

export const MONO = "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace";

export function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function f(value: number): string {
  return String(Number(value.toFixed(3)));
}

export function clean(text: string): string {
  return [...text.toUpperCase()].map((ch) => (ch === ' ' || FONT[ch] ? ch : '?')).join('');
}

export function textWidth(text: string, scale: number): number {
  return (text.length * 6 - 1) * scale;
}

/** Greedy word wrap that also breaks words longer than the line. */
export function wrap(text: string, width: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (let word of clean(text).split(/\s+/).filter(Boolean)) {
    while (word.length > width) {
      if (line) {
        lines.push(line);
        line = '';
      }
      lines.push(word.slice(0, width));
      word = word.slice(width);
    }
    if (!line) line = word;
    else if (line.length + 1 + word.length <= width) line += ` ${word}`;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [''];
}

export function runsPath(rows: readonly string[], on = '#'): string {
  const out: string[] = [];
  rows.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      if (row.charAt(x) === on) {
        const start = x;
        while (x < row.length && row.charAt(x) === on) x++;
        out.push(`M${start} ${y}h${x - start}v1h-${x - start}z`);
      } else x++;
    }
  });
  return out.join('');
}

export function notch(x: number, y: number, w: number, h: number, n = 4): string {
  return (
    `M${f(x + n)} ${f(y)}H${f(x + w - n)}V${f(y + n)}H${f(x + w)}V${f(y + h - n)}H${f(x + w - n)}V${f(y + h)}` +
    `H${f(x + n)}V${f(y + h - n)}H${f(x)}V${f(y + n)}H${f(x + n)}Z`
  );
}

export function box(x: number, y: number, w: number, h: number, fill: string, border: string = C.ink, shadow = true, b = 4): string {
  const drop = shadow ? `<path d="${notch(x + 6, y + 6, w, h)}" fill="${C.shadow}"/>` : '';
  return `${drop}<path d="${notch(x, y, w, h)}" fill="${border}"/><path d="${notch(x + b, y + b, w - 2 * b, h - 2 * b)}" fill="${fill}"/>`;
}

export function sprite(rows: readonly string[], colors: Readonly<Record<string, string>>, x: number, y: number, scale: number): string {
  const keys = [...new Set(rows.join(''))].filter((k) => k !== '.').sort();
  const paths = keys.map((k) => `<path d="${runsPath(rows, k)}" fill="${colors[k] ?? C.ink}"/>`).join('');
  return `<g transform="translate(${f(x)} ${f(y)}) scale(${f(scale)})">${paths}</g>`;
}

export function appear(seconds: number): string {
  const sec = Math.max(seconds, 0.01);
  return `<animate attributeName="opacity" values="0;1" keyTimes="0;.999" calcMode="discrete" dur="${f(sec)}s" fill="freeze"/>`;
}

export function windows(spans: ReadonlyArray<readonly [number, number]>, period: number): string {
  const times = [...new Set([0, ...spans.flatMap(([a, b]) => [a, b]).filter((t) => t < period)])].sort((a, b) => a - b);
  const keys: number[] = [];
  const values: number[] = [];
  for (const t of times) {
    const on = spans.some(([a, b]) => a <= t && t < b) ? 1 : 0;
    if (values.at(-1) !== on) {
      keys.push(t);
      values.push(on);
    }
  }
  return `<animate attributeName="opacity" values="${values.join(';')}" keyTimes="${keys.map((k) => f(k / period)).join(';')}" calcMode="discrete" dur="${f(period)}s" repeatCount="indefinite"/>`;
}

export interface TextOptions {
  anchor?: 'start' | 'middle' | 'end';
  fit?: number;
  anim?: (index: number) => string;
}

export class Svg {
  private readonly parts: string[] = [];
  private readonly overlay: string[] = [];
  private readonly glyphs = new Set<string>();

  constructor(
    readonly w: number,
    readonly h: number,
    private readonly label: string,
  ) {}

  add(...items: string[]): this {
    this.parts.push(...items);
    return this;
  }

  addOverlay(...items: string[]): this {
    this.overlay.push(...items);
    return this;
  }

  text(raw: string, x: number, y: number, scale: number, color: string, options: TextOptions = {}): number {
    const text = clean(raw);
    const { anchor = 'start', fit, anim } = options;
    let sc = scale;
    if (fit && text.length > 0 && textWidth(text, sc) > fit) sc = fit / textWidth(text, 1);
    const width = textWidth(text, sc);
    const left = anchor === 'middle' ? x - width / 2 : anchor === 'end' ? x - width : x;
    const uses: string[] = [];
    [...text].forEach((ch, i) => {
      if (ch === ' ') return;
      this.glyphs.add(ch);
      const id = `g${ch.codePointAt(0)}`;
      const motion = anim ? anim(i) : '';
      uses.push(motion ? `<use href="#${id}" x="${i * 6}">${motion}</use>` : `<use href="#${id}" x="${i * 6}"/>`);
    });
    this.parts.push(`<g transform="translate(${f(left)} ${f(y)}) scale(${f(sc)})" fill="${color}">${uses.join('')}</g>`);
    return width;
  }

  render(): string {
    const defs = [...this.glyphs]
      .sort()
      .map((ch) => `<path id="g${ch.codePointAt(0)}" d="${runsPath(FONT[ch] ?? [])}"/>`)
      .join('');
    return (
      `<svg xmlns="http://www.w3.org/2000/svg" width="${this.w}" height="${this.h}" viewBox="0 0 ${this.w} ${this.h}" ` +
      `role="img" aria-label="${esc(this.label)}"><defs>${defs}</defs>${this.parts.join('')}${this.overlay.join('')}</svg>`
    );
  }
}

/** Deterministic horizontal tears that grow with the damage stage. */
function tears(w: number, h: number, effect: StageEffect): string {
  const count = Math.round(effect.ratio * 10);
  let out = '';
  for (let i = 0; i < count; i++) {
    const y = ((i + 1) * 97) % Math.max(1, h - 12);
    const x = 8 + ((i * 163) % Math.max(1, w - 140));
    const width = Math.min(60 + ((i * 41) % 120), w - x - 8);
    const fill = i % 2 ? C.red : C.ink;
    out += `<rect x="${x}" y="${y + 6}" width="${width}" height="${3 + (i % 3)}" fill="${fill}" opacity=".35"/>`;
  }
  return out;
}

/** Standard card: cream panel, ink border, hard shadow, orange title bar. Damage hits the title and adds tears. */
export function card(w: number, h: number, title: string, effect: StageEffect, right = '', label = ''): Svg {
  const s = new Svg(w, h, label || title);
  s.add(box(0, 0, w - 6, h - 6, C.paper));
  s.text(corruptLine(clean(title), effect.ratio * 0.6, 11), 22, 20, 3, C.orange, { fit: right ? w - 280 : w - 50 });
  if (right) s.text(right, w - 28, 20, 3, C.muted, { anchor: 'end', fit: 220 });
  s.add(`<rect x="4" y="50" width="${w - 14}" height="4" fill="${C.ink}"/>`);
  s.addOverlay(tears(w - 6, h - 6, effect));
  return s;
}
