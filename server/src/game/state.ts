import { z } from 'zod';

const whoAt = z.object({ who: z.string(), at: z.number() });

const sections = {
  health: z.object({ value: z.number().min(0).max(100), at: z.number() }),
  incident: z.object({
    seq: z.number().int().min(0),
    openedAt: z.number(),
    tried: z.array(z.string()),
    note: z.string(),
  }),
  postmortem: z.object({
    since: z.number(),
    downtimeMs: z.number().min(0),
    fixes: z.number().int().min(0),
    wrongs: z.number().int().min(0),
    lastSave: whoAt.nullable(),
    lastBreak: whoAt.extend({ action: z.string() }).nullable(),
  }),
  quiz: z.object({
    i: z.number().int().min(0),
    num: z.number().int().min(1),
    openedAt: z.number(),
    last: z
      .object({ who: z.string(), pick: z.string(), ok: z.boolean(), right: z.string(), why: z.string(), num: z.number() })
      .nullable(),
  }),
  word: z.object({
    round: z.number().int().min(1),
    i: z.number().int().min(0),
    guessed: z.array(z.string().regex(/^[A-Z]$/)),
    lives: z.number().int().min(0).max(6),
    openedAt: z.number(),
    last: z.object({ who: z.string(), letter: z.string(), hit: z.boolean() }).nullable(),
    prev: z.object({ word: z.string(), solvedBy: z.string().nullable() }).nullable(),
  }),
  ttt: z.object({
    game: z.number().int().min(1),
    board: z.array(z.enum(['', 'X', 'O'])).length(9),
    w: z.number().int().min(0),
    l: z.number().int().min(0),
    d: z.number().int().min(0),
    openedAt: z.number(),
    note: z.string(),
  }),
  poll: z.object({
    java: z.number().int().min(0),
    python: z.number().int().min(0),
    voters: z.record(z.string(), z.enum(['java', 'python'])),
  }),
  scores: z.record(z.string(), z.number()),
  feed: z.array(z.string()),
  fact: z.object({ offset: z.number().int().min(0), bumpedAt: z.number() }),
  activity: z.object({
    items: z.array(z.object({ text: z.string(), at: z.string() })),
    fetchedAt: z.number(),
  }),
};

type Sections = typeof sections;
export type GameState = { [K in keyof Sections]: z.infer<Sections[K]> };
type SectionKey = keyof Sections;

export function defaultState(now: number): GameState {
  return {
    health: { value: 100, at: now },
    incident: { seq: 0, openedAt: 0, tried: [], note: '' },
    postmortem: { since: now, downtimeMs: 0, fixes: 0, wrongs: 0, lastSave: null, lastBreak: null },
    quiz: { i: 0, num: 1, openedAt: 0, last: null },
    word: { round: 1, i: 0, guessed: [], lives: 6, openedAt: 0, last: null, prev: null },
    ttt: { game: 1, board: ['', '', '', '', '', '', '', '', ''], w: 0, l: 0, d: 0, openedAt: 0, note: '' },
    poll: { java: 0, python: 0, voters: {} },
    scores: {},
    feed: [],
    fact: { offset: 0, bumpedAt: 0 },
    activity: { items: [], fetchedAt: 0 },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Validates section by section, so one damaged section cannot wipe the others. */
export function parseState(raw: unknown, now: number): GameState {
  const defaults = defaultState(now);
  const input = isRecord(raw) ? raw : {};
  const output: Record<string, unknown> = {};
  for (const key of Object.keys(sections) as SectionKey[]) {
    const parsed = sections[key].safeParse(input[key]);
    output[key] = parsed.success ? parsed.data : defaults[key];
  }
  return output as GameState;
}
