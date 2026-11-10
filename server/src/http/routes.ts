import { ACTIONS, type Action } from '../data/incidents.js';
import type { Move } from '../game/moves.js';
import type { FoldSection } from '../render/cards.js';

export type ImageSpec =
  | { kind: 'hero' | 'incident' | 'postmortem' | 'fact' | 'activity' | 'quiz' | 'word' | 'ttt' | 'poll' | 'next' }
  | { kind: 'fold'; section: FoldSection }
  | { kind: 'key'; letter: string }
  | { kind: 'cell'; square: number }
  | { kind: 'ans'; pick: 'a' | 'b' | 'c' }
  | { kind: 'vote'; option: 'java' | 'python' }
  | { kind: 'fix'; action: Action }
  | { kind: 'link'; name: LinkName };

export const LINK_LABELS = { linkedin: 'LINKEDIN', email: 'EMAIL', aegis: 'AEGIS', 'studio-oak': 'STUDIO OAK' } as const;
export type LinkName = keyof typeof LINK_LABELS;

const CARDS = ['hero', 'incident', 'postmortem', 'fact', 'activity', 'quiz', 'word', 'ttt', 'poll', 'next'] as const;
const FOLDS: readonly FoldSection[] = ['quiz', 'word', 'ttt', 'poll', 'bughunt'];

function isOneOf<T extends string>(list: readonly T[], value: string): value is T {
  return (list as readonly string[]).includes(value);
}

/** Allowlist parser. Anything it does not recognise returns null. */
export function parseImage(segments: readonly string[]): ImageSpec | null {
  const [first, second, extra] = segments;
  if (extra !== undefined || first === undefined) return null;
  if (second === undefined) {
    const name = first.replace(/\.svg$/, '');
    if (!first.endsWith('.svg')) return null;
    if (isOneOf(CARDS, name)) return { kind: name };
    return null;
  }
  if (!second.endsWith('.svg')) return null;
  const arg = second.slice(0, -4);
  if (first === 'fold' && isOneOf(FOLDS, arg)) return { kind: 'fold', section: arg };
  if (first === 'key' && /^[A-Z]$/.test(arg)) return { kind: 'key', letter: arg };
  if (first === 'cell' && /^[1-9]$/.test(arg)) return { kind: 'cell', square: Number(arg) - 1 };
  if (first === 'ans' && isOneOf(['a', 'b', 'c'] as const, arg)) return { kind: 'ans', pick: arg };
  if (first === 'vote' && isOneOf(['java', 'python'] as const, arg)) return { kind: 'vote', option: arg };
  if (first === 'fix' && isOneOf(ACTIONS, arg)) return { kind: 'fix', action: arg };
  if (first === 'link' && isOneOf(Object.keys(LINK_LABELS) as LinkName[], arg)) return { kind: 'link', name: arg };
  return null;
}

/** Allowlist parser. Anything it does not recognise returns null. */
export function parseMove(segments: readonly string[]): Move | null {
  const [game, arg, extra] = segments;
  if (extra !== undefined || game === undefined || arg === undefined) return null;
  switch (game) {
    case 'fix':
      return isOneOf(ACTIONS, arg) ? { game, action: arg } : null;
    case 'quiz':
      return isOneOf(['a', 'b', 'c'] as const, arg) ? { game, pick: arg } : null;
    case 'word':
      return /^[a-zA-Z]$/.test(arg) ? { game, letter: arg.toUpperCase() } : null;
    case 'ttt':
      return /^[1-9]$/.test(arg) ? { game, square: Number(arg) - 1 } : null;
    case 'vote':
      return isOneOf(['java', 'python'] as const, arg) ? { game, option: arg } : null;
    case 'fact':
      return arg === 'next' ? { game } : null;
    default:
      return null;
  }
}

/** Fragment that reopens the section the player was in. Must include GitHub's user-content- prefix. */
export function anchorFor(move: Move | null): string {
  if (!move) return 'user-content-incident';
  const map: Record<Move['game'], string> = {
    fix: 'user-content-incident',
    quiz: 'user-content-quiz',
    word: 'user-content-word',
    ttt: 'user-content-ttt',
    vote: 'user-content-poll',
    fact: 'user-content-fact',
  };
  return map[move.game];
}

export function movePath(move: Move): string {
  switch (move.game) {
    case 'fix':
      return `/play/fix/${move.action}`;
    case 'quiz':
      return `/play/quiz/${move.pick}`;
    case 'word':
      return `/play/word/${move.letter}`;
    case 'ttt':
      return `/play/ttt/${move.square + 1}`;
    case 'vote':
      return `/play/vote/${move.option}`;
    case 'fact':
      return '/play/fact/next';
  }
}
