import { WORDS } from '../data/words.js';
import { type StageEffect, effectFor, healthNow } from '../game/decay.js';
import type { GameState } from '../game/state.js';
import * as cards from '../render/cards.js';
import { renderHero } from '../render/hero.js';
import { LINK_LABELS, type ImageSpec } from './routes.js';

const HEALTHY = effectFor(100);

function needsState(title: string, st: GameState | null, draw: (state: GameState) => string): string {
  return st ? draw(st) : cards.renderOutage(title);
}

function renderKey(letter: string, st: GameState | null, effect: StageEffect): string {
  if (!st || effect.stage === 'down') return cards.renderButton(letter, 58, 58, effect.stage === 'down' ? 'miss' : 'idle', 4);
  if (!st.word.guessed.includes(letter)) return cards.renderButton(letter, 58, 58, 'idle', 4);
  const answer = WORDS[st.word.i % WORDS.length]?.w ?? '';
  return cards.renderButton(letter, 58, 58, answer.includes(letter) ? 'hit' : 'miss', 4);
}

/** `st` is null only when the database is unreachable and no earlier state is available. */
export function renderImage(spec: ImageSpec, st: GameState | null, now: number): string {
  const health = st ? healthNow(st.health, now) : 100;
  const effect = st ? effectFor(health) : HEALTHY;
  const down = effect.stage === 'down';
  switch (spec.kind) {
    case 'hero':
      return renderHero(effect, health);
    case 'incident':
      return needsState('INCIDENT', st, (s) => cards.renderIncident(s, effect, health));
    case 'postmortem':
      return needsState('POSTMORTEM', st, (s) => cards.renderPostmortem(s, effect, now));
    case 'fact':
      return needsState('DEV FACT', st, (s) => cards.renderFact(s, effect, now));
    case 'activity':
      return needsState('ACTIVITY', st, (s) => cards.renderActivity(s, effect, now));
    case 'quiz':
      return needsState('QUIZ', st, (s) => cards.renderQuiz(s, effect));
    case 'word':
      return needsState('WORD GAME', st, (s) => cards.renderWord(s, effect));
    case 'ttt':
      return needsState('TIC-TAC-TOE', st, (s) => cards.renderTtt(s, effect));
    case 'poll':
      return needsState('POLL', st, (s) => cards.renderPoll(s, effect));
    case 'next':
      return cards.renderButton('NEXT FACT', 390, 64, down ? 'miss' : 'idle');
    case 'fold':
      return cards.renderFold(spec.section, st, effect);
    case 'key':
      return renderKey(spec.letter, st, effect);
    case 'cell':
      return cards.renderCell(down ? '' : (st?.ttt.board[spec.square] ?? ''), String(spec.square + 1));
    case 'ans':
      return cards.renderButton(`ANSWER ${spec.pick.toUpperCase()}`, 258, 64, down ? 'miss' : 'idle');
    case 'vote':
      return cards.renderButton(`VOTE ${spec.option.toUpperCase()}`, 390, 64, down ? 'miss' : 'idle');
    case 'fix':
      return cards.renderFixButton(spec.action, st?.incident.tried.includes(spec.action) ?? false);
    case 'link':
      return cards.renderButton(LINK_LABELS[spec.name], 196, 64);
  }
}
