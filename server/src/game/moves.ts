import {
  INCIDENT_GRACE_MS,
  KEPT_SCORES,
  MAX_FEED,
  MAX_SCORES,
  MAX_VOTERS,
  QUIZ_HEAL,
  RIGHT_FIX_HEAL,
  SETTLE_MS,
  TTT_WIN_HEAL,
  WORD_SOLVE_HEAL,
  WRONG_FIX_DAMAGE,
  WRONG_FIX_FLOOR,
} from '../config.js';
import { ACTION_LABELS, type Action, incidentAt } from '../data/incidents.js';
import { QUIZ } from '../data/quiz.js';
import { WORDS } from '../data/words.js';
import { adjustHealth, healthNow } from './decay.js';
import type { GameState } from './state.js';

export type Move =
  | { game: 'fix'; action: Action }
  | { game: 'quiz'; pick: 'a' | 'b' | 'c' }
  | { game: 'word'; letter: string }
  | { game: 'ttt'; square: number }
  | { game: 'vote'; option: 'java' | 'python' }
  | { game: 'fact' };

export interface MoveContext {
  who: string;
  now: number;
  penaltyAllowed: boolean;
  random: () => number;
}

export type IgnoreReason = 'locked' | 'settling' | 'taken';
export type Outcome = { kind: 'applied'; penalized: boolean } | { kind: 'ignored'; reason: IgnoreReason };

export interface MoveResult {
  state: GameState;
  outcome: Outcome;
}

const APPLIED: Outcome = { kind: 'applied', penalized: false };
const ignored = (reason: IgnoreReason): Outcome => ({ kind: 'ignored', reason });
const settling = (openedAt: number, now: number): boolean => now >= openedAt && now - openedAt < SETTLE_MS;

function award(state: GameState, who: string, points: number): void {
  state.scores[who] = (state.scores[who] ?? 0) + points;
  if (Object.keys(state.scores).length > MAX_SCORES) {
    const kept = Object.entries(state.scores)
      .sort(([, a], [, b]) => b - a)
      .slice(0, KEPT_SCORES);
    if (!kept.some(([name]) => name === who)) kept.push([who, state.scores[who] ?? points]);
    state.scores = Object.fromEntries(kept);
  }
}

function addFeed(state: GameState, line: string): void {
  state.feed = [line, ...state.feed].slice(0, MAX_FEED);
}

function playFix(state: GameState, action: Action, ctx: MoveContext): Outcome {
  const { who, now } = ctx;
  const incident = state.incident;
  const current = incidentAt(incident.seq);
  const label = ACTION_LABELS[action];
  const number = incident.seq + 1;

  if (action === current.fix) {
    adjustHealth(state, RIGHT_FIX_HEAL, now);
    award(state, who, 5);
    state.postmortem.fixes += 1;
    state.postmortem.lastSave = { who, at: now };
    addFeed(state, `${who} CLOSED INCIDENT #${number} WITH ${label}`);
    state.incident = { seq: incident.seq + 1, openedAt: now, tried: [], note: `#${number} CLOSED BY ${who}: ${label} WORKED` };
    return APPLIED;
  }

  if (now >= incident.openedAt && now - incident.openedAt < INCIDENT_GRACE_MS) {
    incident.note = `${who} TRIED ${label}. INCIDENT IS BRAND NEW, NO DAMAGE`;
    return APPLIED;
  }
  if (incident.tried.includes(action)) return ignored('taken');

  incident.tried.push(action);
  if (!ctx.penaltyAllowed) {
    incident.note = `${who} TRIED ${label}. NO EFFECT, PAGER IS COOLING DOWN`;
    return APPLIED;
  }
  adjustHealth(state, -WRONG_FIX_DAMAGE, now, WRONG_FIX_FLOOR);
  state.postmortem.wrongs += 1;
  state.postmortem.lastBreak = { who, at: now, action: label };
  incident.note = `${who} TRIED ${label}. IT MADE THINGS WORSE`;
  addFeed(state, `${who} MADE #${number} WORSE WITH ${label}`);
  return { kind: 'applied', penalized: true };
}

function playQuiz(state: GameState, pick: 'a' | 'b' | 'c', ctx: MoveContext): Outcome {
  const quiz = state.quiz;
  if (settling(quiz.openedAt, ctx.now)) return ignored('settling');
  const item = QUIZ[quiz.i % QUIZ.length];
  if (!item) return ignored('settling');
  const ok = 'abc'.indexOf(pick) === item.a;
  const right = 'ABC'.charAt(item.a);
  if (ok) {
    award(state, ctx.who, 1);
    adjustHealth(state, QUIZ_HEAL, ctx.now);
  }
  quiz.last = { who: ctx.who, pick: pick.toUpperCase(), ok, right, why: item.why, num: quiz.num };
  addFeed(state, `${ctx.who} ANSWERED QUIZ #${quiz.num}: ${ok ? 'CORRECT' : 'WRONG'}`);
  quiz.i += 1;
  quiz.num += 1;
  quiz.openedAt = ctx.now;
  return APPLIED;
}

function playWord(state: GameState, letter: string, ctx: MoveContext): Outcome {
  const word = state.word;
  if (settling(word.openedAt, ctx.now)) return ignored('settling');
  if (word.guessed.includes(letter)) return ignored('taken');
  const answer = WORDS[word.i % WORDS.length]?.w;
  if (!answer) return ignored('settling');

  const next = (): void => {
    word.round += 1;
    word.i += 1;
    word.guessed = [];
    word.lives = 6;
    word.last = null;
    word.openedAt = ctx.now;
  };

  word.guessed.push(letter);
  const hit = answer.includes(letter);
  word.last = { who: ctx.who, letter, hit };
  if (hit) {
    award(state, ctx.who, 1);
    if ([...answer].every((ch) => word.guessed.includes(ch))) {
      award(state, ctx.who, 3);
      adjustHealth(state, WORD_SOLVE_HEAL, ctx.now);
      word.prev = { word: answer, solvedBy: ctx.who };
      addFeed(state, `${ctx.who} SOLVED ${answer}`);
      next();
      return APPLIED;
    }
    addFeed(state, `${ctx.who} GUESSED ${letter}: HIT`);
    return APPLIED;
  }
  word.lives -= 1;
  addFeed(state, `${ctx.who} GUESSED ${letter}: MISS`);
  if (word.lives <= 0) {
    word.prev = { word: answer, solvedBy: null };
    next();
  }
  return APPLIED;
}

const LINES = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
] as const;

type Board = GameState['ttt']['board'];

function winner(board: Board): 'X' | 'O' | 'draw' | null {
  for (const [a, b, c] of LINES) {
    const mark = board[a];
    if ((mark === 'X' || mark === 'O') && mark === board[b] && mark === board[c]) return mark;
  }
  return board.every(Boolean) ? 'draw' : null;
}

function botMove(board: Board, random: () => number): number {
  const free = board.flatMap((mark, i) => (mark ? [] : [i]));
  for (const mark of ['O', 'X'] as const) {
    for (const i of free) {
      const trial = [...board];
      trial[i] = mark;
      if (winner(trial) === mark) return i;
    }
  }
  if (random() < 0.3) return free[Math.floor(random() * free.length)] ?? free[0] ?? 0;
  return [4, 0, 2, 6, 8, 1, 3, 5, 7].find((i) => free.includes(i)) ?? 0;
}

function playTtt(state: GameState, square: number, ctx: MoveContext): Outcome {
  const ttt = state.ttt;
  if (settling(ttt.openedAt, ctx.now)) return ignored('settling');
  const board = ttt.board;
  if (board[square]) return ignored('taken');
  board[square] = 'X';
  let result = winner(board);
  let bot = -1;
  if (!result) {
    bot = botMove(board, ctx.random);
    board[bot] = 'O';
    result = winner(board);
  }
  if (!result) {
    ttt.note = `${ctx.who} TOOK ${square + 1}, BOT TOOK ${bot + 1}. YOUR MOVE!`;
    addFeed(state, `${ctx.who} PLAYED SQUARE ${square + 1}`);
    return APPLIED;
  }
  const game = ttt.game;
  const words = { X: 'BEAT THE BOT', O: 'LOST TO THE BOT', draw: 'DREW WITH THE BOT' }[result];
  if (result === 'X') {
    ttt.w += 1;
    award(state, ctx.who, 3);
    adjustHealth(state, TTT_WIN_HEAL, ctx.now);
  } else if (result === 'O') {
    ttt.l += 1;
  } else {
    ttt.d += 1;
    award(state, ctx.who, 1);
  }
  ttt.note = `GAME ${game}: ${ctx.who} ${words}`;
  addFeed(state, `${ctx.who} ${words}`);
  ttt.game += 1;
  ttt.board = ['', '', '', '', '', '', '', '', ''];
  ttt.openedAt = ctx.now;
  return APPLIED;
}

function playVote(state: GameState, option: 'java' | 'python', ctx: MoveContext): Outcome {
  const poll = state.poll;
  const previous = poll.voters[ctx.who];
  if (previous === option) return ignored('taken');
  if (previous) poll[previous] = Math.max(0, poll[previous] - 1);
  poll[option] += 1;
  delete poll.voters[ctx.who];
  poll.voters[ctx.who] = option;
  // Object keys keep insertion order, so this evicts the oldest voters while the totals stay.
  const names = Object.keys(poll.voters);
  for (const name of names.slice(0, Math.max(0, names.length - MAX_VOTERS))) delete poll.voters[name];
  addFeed(state, `${ctx.who} VOTED ${option.toUpperCase()}`);
  return APPLIED;
}

function nextFact(state: GameState, ctx: MoveContext): Outcome {
  if (settling(state.fact.bumpedAt, ctx.now)) return ignored('settling');
  state.fact.offset += 1;
  state.fact.bumpedAt = ctx.now;
  return APPLIED;
}

/** Pure: returns a new state on success and the untouched input when the move is ignored. */
export function applyMove(previous: GameState, move: Move, ctx: MoveContext): MoveResult {
  if (move.game !== 'fix' && healthNow(previous.health, ctx.now) === 0) {
    return { state: previous, outcome: ignored('locked') };
  }
  const state = structuredClone(previous);
  const outcome = dispatch(state, move, ctx);
  return { state: outcome.kind === 'applied' ? state : previous, outcome };
}

function dispatch(state: GameState, move: Move, ctx: MoveContext): Outcome {
  switch (move.game) {
    case 'fix':
      return playFix(state, move.action, ctx);
    case 'quiz':
      return playQuiz(state, move.pick, ctx);
    case 'word':
      return playWord(state, move.letter, ctx);
    case 'ttt':
      return playTtt(state, move.square, ctx);
    case 'vote':
      return playVote(state, move.option, ctx);
    case 'fact':
      return nextFact(state, ctx);
  }
}
