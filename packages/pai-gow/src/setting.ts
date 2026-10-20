import type { Card } from './cards.ts';
import { DEFAULT_RULES, evaluateHigh, evaluateLow, isFoul, wheelCode, type Rules } from './evaluate.ts';

/** A 7-card hand split into a 5-card high hand (the "back") and a 2-card low hand (the "front"). */
export interface Setting {
  high: Card[];
  low: Card[];
  highValue: number;
  lowValue: number;
  foul: boolean;
}

export const SPLIT_COUNT = 21; // C(7, 2): pick the two cards for the low hand

/** Positions of the low hand's two cards for each split, in a fixed order (0-1, 0-2, ..., 5-6). */
export const SPLITS: readonly (readonly [number, number])[] = (() => {
  const splits: [number, number][] = [];
  for (let i = 0; i < 7; i++) for (let j = i + 1; j < 7; j++) splits.push([i, j]);
  return splits;
})();

// For each split, the positions of the five high-hand cards.
const BACKS: readonly number[][] = SPLITS.map(([i, j]) => [0, 1, 2, 3, 4, 5, 6].filter((k) => k !== i && k !== j));

/**
 * Values all 21 splits into reusable buffers: the hot path of the house way and the precompute scripts.
 * cards must hold 7 distinct cards.
 */
export function evaluateSplits(cards: ArrayLike<Card>, wheel: number, highs: Int32Array, lows: Int32Array): void {
  for (let s = 0; s < SPLIT_COUNT; s++) {
    const back = BACKS[s];
    highs[s] = evaluateHigh(cards[back[0]], cards[back[1]], cards[back[2]], cards[back[3]], cards[back[4]], wheel);
    const [i, j] = SPLITS[s];
    lows[s] = evaluateLow(cards[i], cards[j]);
  }
}

export function settingAt(cards: readonly Card[], split: number, rules: Rules = DEFAULT_RULES): Setting {
  const [i, j] = SPLITS[split];
  const high = BACKS[split].map((k) => cards[k]);
  const low = [cards[i], cards[j]];
  const highValue = evaluateHigh(high[0], high[1], high[2], high[3], high[4], wheelCode(rules));
  const lowValue = evaluateLow(low[0], low[1]);
  return { high, low, highValue, lowValue, foul: isFoul(highValue, lowValue) };
}

/** All 21 ways to set a 7-card hand, fouls included (flagged). */
export function allSettings(cards: readonly Card[], rules: Rules = DEFAULT_RULES): Setting[] {
  checkHand(cards);
  return SPLITS.map((_, split) => settingAt(cards, split, rules));
}

/** Builds a setting from a player's chosen low-hand cards; the other five form the high hand. */
export function setHand(cards: readonly Card[], low: readonly Card[], rules: Rules = DEFAULT_RULES): Setting {
  checkHand(cards);
  if (low.length !== 2) throw new Error(`A low hand has 2 cards, got ${low.length}`);
  const i = cards.indexOf(low[0]);
  const j = cards.indexOf(low[1]);
  if (i < 0 || j < 0 || i === j) throw new Error('The low hand must be two different cards from the hand');
  const split = SPLITS.findIndex(([a, b]) => (a === i && b === j) || (a === j && b === i));
  return settingAt(cards, split, rules);
}

export function checkHand(cards: readonly Card[]): void {
  if (cards.length !== 7) throw new Error(`A Pai Gow hand has 7 cards, got ${cards.length}`);
  if (new Set(cards).size !== 7) throw new Error('A Pai Gow hand has 7 different cards');
  for (const card of cards) if (!Number.isInteger(card) || card < 0 || card > 52) throw new Error(`Invalid card ${card}`);
}
