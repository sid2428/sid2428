import { describe, expect, it } from 'vitest';
import { INCIDENT_GRACE_MS, MAX_SCORES, MAX_VOTERS, SETTLE_MS } from '../src/config.js';
import { ACTIONS, INCIDENTS, incidentAt } from '../src/data/incidents.js';
import { QUIZ } from '../src/data/quiz.js';
import { WORDS } from '../src/data/words.js';
import { healthNow } from '../src/game/decay.js';
import { applyMove } from '../src/game/moves.js';
import { DAY, T0, ctx, freshState } from './helpers.js';

const NOW = T0 + DAY;
const wrongAction = (seq: number) => ACTIONS.find((a) => a !== incidentAt(seq).fix)!;

describe('incident data', () => {
  it('has at least 20 valid scenarios', () => {
    expect(INCIDENTS.length).toBeGreaterThanOrEqual(20);
    for (const item of INCIDENTS) {
      expect(ACTIONS).toContain(item.fix);
      expect(item.log.length).toBeGreaterThan(1);
    }
  });

  it('uses every runbook action reasonably often', () => {
    for (const action of ACTIONS) expect(INCIDENTS.filter((i) => i.fix === action).length).toBeGreaterThanOrEqual(5);
  });

  it('wraps around safely', () => {
    expect(incidentAt(INCIDENTS.length)).toBe(INCIDENTS[0]);
  });
});

describe('fixing incidents', () => {
  it('heals, scores and opens the next incident on the right fix', () => {
    const st = freshState();
    st.health = { value: 40, at: NOW };
    const r = applyMove(st, { game: 'fix', action: incidentAt(0).fix }, ctx());
    expect(r.outcome.kind).toBe('applied');
    expect(r.state.health.value).toBe(65);
    expect(r.state.incident.seq).toBe(1);
    expect(r.state.postmortem.fixes).toBe(1);
    expect(r.state.scores['TEST-USER-1']).toBe(5);
    expect(st.incident.seq).toBe(0);
  });

  it('hurts on a wrong fix and records who did it', () => {
    const st = freshState();
    st.health = { value: 40, at: NOW };
    const r = applyMove(st, { game: 'fix', action: wrongAction(0) }, ctx());
    expect(r.outcome).toEqual({ kind: 'applied', penalized: true });
    expect(r.state.health.value).toBe(30);
    expect(r.state.postmortem.lastBreak?.who).toBe('TEST-USER-1');
  });

  it('cannot take health below 1 with wrong fixes', () => {
    const st = freshState();
    st.health = { value: 3, at: NOW };
    expect(applyMove(st, { game: 'fix', action: wrongAction(0) }, ctx()).state.health.value).toBe(1);
  });

  it('does not punish a wrong fix inside the stale-page grace window', () => {
    const st = freshState();
    st.health = { value: 40, at: NOW };
    st.incident.openedAt = NOW - INCIDENT_GRACE_MS + 1;
    const r = applyMove(st, { game: 'fix', action: wrongAction(0) }, ctx());
    expect(r.state.health.value).toBe(40);
    expect(r.state.incident.tried).toEqual([]);
  });

  it('penalises again once the grace window has passed', () => {
    const st = freshState();
    st.health = { value: 40, at: NOW };
    st.incident.openedAt = NOW - INCIDENT_GRACE_MS;
    expect(applyMove(st, { game: 'fix', action: wrongAction(0) }, ctx()).state.health.value).toBe(30);
  });

  it('never double-penalises the same wrong action', () => {
    const st = freshState();
    st.health = { value: 40, at: NOW };
    const action = wrongAction(0);
    const once = applyMove(st, { game: 'fix', action }, ctx());
    const twice = applyMove(once.state, { game: 'fix', action }, ctx());
    expect(twice.outcome).toEqual({ kind: 'ignored', reason: 'taken' });
    expect(twice.state.health.value).toBe(30);
  });

  it('stops a griefer once their hourly penalty cap is used', () => {
    const st = freshState();
    st.health = { value: 40, at: NOW };
    const r = applyMove(st, { game: 'fix', action: wrongAction(0) }, ctx({ penaltyAllowed: false }));
    expect(r.state.health.value).toBe(40);
    expect(r.state.postmortem.wrongs).toBe(0);
  });

  it('can bring a dead site back', () => {
    const r = applyMove(freshState(), { game: 'fix', action: incidentAt(0).fix }, ctx({ now: T0 + 10 * DAY }));
    expect(r.state.health.value).toBe(25);
    expect(r.state.postmortem.downtimeMs).toBeGreaterThan(0);
  });
});

describe('locked games while the site is down', () => {
  const DOWN = T0 + 8 * DAY;
  it.each([
    [{ game: 'quiz', pick: 'a' } as const],
    [{ game: 'word', letter: 'A' } as const],
    [{ game: 'ttt', square: 0 } as const],
    [{ game: 'vote', option: 'java' } as const],
    [{ game: 'fact' } as const],
  ])('ignores %o', (move) => {
    const st = freshState();
    const r = applyMove(st, move, ctx({ now: DOWN }));
    expect(r.outcome).toEqual({ kind: 'ignored', reason: 'locked' });
    expect(r.state).toBe(st);
  });
});

describe('quiz', () => {
  const right = 'abc'.charAt(QUIZ[0]!.a) as 'a' | 'b' | 'c';
  const wrong = 'abc'.charAt((QUIZ[0]!.a + 1) % 3) as 'a' | 'b' | 'c';

  it('scores and heals on a right answer', () => {
    const st = freshState();
    st.health = { value: 50, at: NOW };
    const r = applyMove(st, { game: 'quiz', pick: right }, ctx());
    expect(r.state.scores['TEST-USER-1']).toBe(1);
    expect(r.state.health.value).toBe(53);
    expect(r.state.quiz.num).toBe(2);
  });

  it('advances without scoring on a wrong answer', () => {
    const r = applyMove(freshState(), { game: 'quiz', pick: wrong }, ctx());
    expect(r.state.scores).toEqual({});
    expect(r.state.quiz.last?.ok).toBe(false);
  });

  it('ignores answers aimed at the previous question', () => {
    const st = freshState();
    st.quiz.openedAt = NOW - SETTLE_MS + 1;
    expect(applyMove(st, { game: 'quiz', pick: right }, ctx()).outcome).toEqual({ kind: 'ignored', reason: 'settling' });
  });

  it('loops past the end of the question list', () => {
    const st = freshState();
    st.quiz.i = QUIZ.length * 3 - 1;
    expect(applyMove(st, { game: 'quiz', pick: 'a' }, ctx()).outcome.kind).toBe('applied');
  });
});

describe('word game', () => {
  const word = WORDS[0]!.w;
  const hit = word.charAt(0);
  const misses = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'].filter((l) => !word.includes(l));

  it('rejects a repeated letter', () => {
    const once = applyMove(freshState(), { game: 'word', letter: hit }, ctx());
    expect(applyMove(once.state, { game: 'word', letter: hit }, ctx()).outcome).toEqual({ kind: 'ignored', reason: 'taken' });
  });

  it('solves and rolls to a new word', () => {
    const st = freshState();
    st.health = { value: 50, at: NOW };
    st.word.guessed = [...new Set(word)].slice(1);
    const r = applyMove(st, { game: 'word', letter: hit }, ctx());
    expect(r.state.word.round).toBe(2);
    expect(r.state.word.guessed).toEqual([]);
    expect(r.state.word.prev).toEqual({ word, solvedBy: 'TEST-USER-1' });
    expect(r.state.health.value).toBe(55);
  });

  it('rolls over after the last life and names nobody', () => {
    const st = freshState();
    st.word.lives = 1;
    const r = applyMove(st, { game: 'word', letter: misses[0]! }, ctx());
    expect(r.state.word.round).toBe(2);
    expect(r.state.word.lives).toBe(6);
    expect(r.state.word.prev?.solvedBy).toBeNull();
  });

  it('every word is solvable with letters alone', () => {
    for (const { w } of WORDS) expect(w).toMatch(/^[A-Z]+$/);
  });
});

describe('tic-tac-toe', () => {
  it('rejects a taken square', () => {
    const st = freshState();
    st.ttt.board[0] = 'X';
    expect(applyMove(st, { game: 'ttt', square: 0 }, ctx()).outcome).toEqual({ kind: 'ignored', reason: 'taken' });
  });

  it('awards a win and resets the board', () => {
    const st = freshState();
    st.health = { value: 50, at: NOW };
    st.ttt.board = ['X', 'X', '', 'O', 'O', '', '', '', ''];
    const r = applyMove(st, { game: 'ttt', square: 2 }, ctx());
    expect(r.state.ttt.w).toBe(1);
    expect(r.state.ttt.game).toBe(2);
    expect(r.state.ttt.board.every((c) => c === '')).toBe(true);
    expect(r.state.health.value).toBe(54);
  });

  it('lets the bot win when it can', () => {
    const st = freshState();
    st.ttt.board = ['O', 'O', '', 'X', 'X', '', '', '', ''];
    const r = applyMove(st, { game: 'ttt', square: 8 }, ctx());
    expect(r.state.ttt.l).toBe(1);
  });

  it('records a draw on a full board', () => {
    const st = freshState();
    st.ttt.board = ['X', 'O', 'X', 'X', 'O', 'O', 'O', 'X', ''];
    const r = applyMove(st, { game: 'ttt', square: 8 }, ctx());
    expect(r.state.ttt.d).toBe(1);
    expect(r.state.scores['TEST-USER-1']).toBe(1);
  });
});

describe('poll', () => {
  it('moves a changed vote instead of counting twice', () => {
    const one = applyMove(freshState(), { game: 'vote', option: 'java' }, ctx());
    const two = applyMove(one.state, { game: 'vote', option: 'python' }, ctx());
    expect(two.state.poll).toMatchObject({ java: 0, python: 1 });
  });

  it('ignores an identical repeat vote', () => {
    const one = applyMove(freshState(), { game: 'vote', option: 'java' }, ctx());
    expect(applyMove(one.state, { game: 'vote', option: 'java' }, ctx()).outcome.kind).toBe('ignored');
  });

  it('bounds the voter list but keeps the totals', () => {
    const st = freshState();
    st.poll.java = MAX_VOTERS;
    st.poll.voters = Object.fromEntries(Array.from({ length: MAX_VOTERS }, (_, i) => [`U${i}`, 'java' as const]));
    const r = applyMove(st, { game: 'vote', option: 'python' }, ctx());
    expect(Object.keys(r.state.poll.voters).length).toBe(MAX_VOTERS);
    expect(r.state.poll.voters['U0']).toBeUndefined();
    expect(r.state.poll).toMatchObject({ java: MAX_VOTERS, python: 1 });
  });
});

describe('bounds', () => {
  it('prunes the scoreboard but keeps the current player', () => {
    const st = freshState();
    st.scores = Object.fromEntries(Array.from({ length: MAX_SCORES }, (_, i) => [`P${i}`, i + 100]));
    const r = applyMove(st, { game: 'vote', option: 'java' }, ctx());
    expect(Object.keys(r.state.scores).length).toBe(MAX_SCORES);
    const q = applyMove(st, { game: 'quiz', pick: 'abc'.charAt(QUIZ[0]!.a) as 'a' }, ctx({ who: 'NEWBIE-X-1' }));
    expect(Object.keys(q.state.scores).length).toBeLessThanOrEqual(101);
    expect(q.state.scores['NEWBIE-X-1']).toBe(1);
  });

  it('keeps only the five newest feed lines', () => {
    let st = freshState();
    (['A', 'B', 'C', 'D', 'E', 'F', 'G'] as const).forEach((letter) => {
      st = applyMove(st, { game: 'word', letter }, ctx()).state;
      st.word.lives = 6;
    });
    expect(st.feed.length).toBe(5);
  });

  it('decays while nobody plays', () => {
    expect(healthNow(freshState().health, T0 + DAY)).toBeLessThan(86);
  });
});
