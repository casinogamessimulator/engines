import { ACE, JACK } from '../cards.ts';
import type { HandClass } from '../evaluate.ts';

/*
 * Building blocks for strategy rules. A rule looks at the dealt hand and returns the hold it calls for
 * (bit i = keep card i), or null when it doesn't apply.
 */

export const TEN = 8;
export const QUEEN = 10;
export const KING = 11;
export { ACE, JACK };

export interface Hand {
  ranks: number[];
  suits: number[];
  handClass: HandClass;
}

export const ALL = 0b11111;
/** Every set of card indexes, by size: INDEX_SETS[3] lists all 10 three-card sets. */
export const INDEX_SETS: number[][][] = [[], [], [], [], [], []];
for (let mask = 0; mask < 32; mask++) {
  const indexes = [0, 1, 2, 3, 4].filter((i) => mask & (1 << i));
  INDEX_SETS[indexes.length].push(indexes);
}
export const maskOf = (indexes: number[]) => indexes.reduce((m, i) => m | (1 << i), 0);
export const isHigh = (rank: number) => rank >= JACK;
export const suited = (hand: Hand, indexes: number[]) => indexes.every((i) => hand.suits[i] === hand.suits[indexes[0]]);
export const distinctRanks = (hand: Hand, indexes: number[]) =>
  new Set(indexes.map((i) => hand.ranks[i])).size === indexes.length;
export const highCount = (hand: Hand, indexes: number[]) => indexes.filter((i) => isHigh(hand.ranks[i])).length;

/** Indexes of the cards whose rank appears `count` times. */
export function ofAKind(hand: Hand, count: number): number[] {
  return [0, 1, 2, 3, 4].filter((i) => hand.ranks.filter((r) => r === hand.ranks[i]).length === count);
}

/** Cards with exactly these ranks (one each), or null. */
export function withRanks(hand: Hand, ranks: number[], mustBeSuited: boolean): number | null {
  for (const indexes of INDEX_SETS[ranks.length]) {
    const held = indexes.map((i) => hand.ranks[i]).sort((a, b) => a - b);
    const wanted = [...ranks].sort((a, b) => a - b);
    if (held.every((r, k) => r === wanted[k]) && (!mustBeSuited || suited(hand, indexes))) return maskOf(indexes);
  }
  return null;
}

export interface StraightFit {
  /** Fewest missing ranks between the lowest and highest card, over every 5-rank window they fit. */
  gaps: number;
  /** Fits a window from 3-7 up, so no ace-low or deuce straight is needed. */
  fitsAboveDeuce: boolean;
}

/** Whether distinct ranks fit within a straight (A counts high or low), and how tightly. */
export function straightFit(ranks: number[]): StraightFit | null {
  let gaps = Infinity;
  let fitsAboveDeuce = false;
  // Windows from A-2-3-4-5 (low = -1, ace counted low) to 10-J-Q-K-A (low = 8).
  for (let low = -1; low <= TEN; low++) {
    const positions = ranks.map((r) => (r === ACE && low === -1 ? -1 : r));
    if (positions.every((p) => p >= low && p <= low + 4)) {
      gaps = Math.min(gaps, Math.max(...positions) - Math.min(...positions) + 1 - ranks.length);
      if (low >= 1) fitsAboveDeuce = true;
    }
  }
  return gaps === Infinity ? null : { gaps, fitsAboveDeuce };
}

/** First suited 3-card straight flush draw matching `accept`, as a hold mask. */
export function threeToStraightFlush(hand: Hand, accept: (fit: StraightFit, high: number) => boolean): number | null {
  for (const indexes of INDEX_SETS[3]) {
    if (!suited(hand, indexes) || !distinctRanks(hand, indexes)) continue;
    const fit = straightFit(indexes.map((i) => hand.ranks[i]));
    if (fit && accept(fit, highCount(hand, indexes))) return maskOf(indexes);
  }
  return null;
}

/** First set of 4 distinct ranks that fit a straight, matching `accept`. */
export function fourToStraight(hand: Hand, accept: (ranks: number[], high: number) => boolean): number | null {
  for (const indexes of INDEX_SETS[4]) {
    if (!distinctRanks(hand, indexes)) continue;
    const ranks = indexes.map((i) => hand.ranks[i]);
    if (straightFit(ranks) && accept(ranks, highCount(hand, indexes))) return maskOf(indexes);
  }
  return null;
}

export const isOutsideStraightDraw = (ranks: number[]) => {
  const sorted = [...ranks].sort((a, b) => a - b);
  return !sorted.includes(ACE) && sorted[3] - sorted[0] === 3;
};
