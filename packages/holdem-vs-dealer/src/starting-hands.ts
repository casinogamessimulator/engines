import { RANKS, type Card } from './cards.ts';

/**
 * The 169 starting-hand classes (e.g. "AKs", "AKo", "77"): hole cards that are the same up to a
 * change of suits, and so have the same value before the flop.
 *
 * Index layout is the usual 13×13 grid: `high * 13 + low` for suited hands and pairs, `low * 13 + high`
 * for offsuit hands (rank 0 = deuce ... 12 = ace).
 */
export interface StartingHand {
  index: number;
  label: string;
  high: number;
  low: number;
  pair: boolean;
  suited: boolean;
  /** Distinct two-card combinations in the class: 6 for a pair, 4 suited, 12 offsuit. */
  combos: number;
}

export const STARTING_HAND_COUNT = 169;

export function startingHandIndex(a: Card, b: Card): number {
  const ra = a >> 2;
  const rb = b >> 2;
  const high = ra > rb ? ra : rb;
  const low = ra > rb ? rb : ra;
  if (high === low || (a & 3) === (b & 3)) return high * 13 + low;
  return low * 13 + high;
}

function describe(index: number): StartingHand {
  const row = Math.floor(index / 13);
  const col = index % 13;
  const pair = row === col;
  const suited = row > col;
  const high = Math.max(row, col);
  const low = Math.min(row, col);
  const label = RANKS[high] + RANKS[low] + (pair ? '' : suited ? 's' : 'o');
  return { index, label, high, low, pair, suited, combos: pair ? 6 : suited ? 4 : 12 };
}

/** All 169 classes, by index. */
export const STARTING_HANDS: readonly StartingHand[] = Array.from({ length: STARTING_HAND_COUNT }, (_, i) => describe(i));

export function startingHand(a: Card, b: Card): StartingHand {
  return STARTING_HANDS[startingHandIndex(a, b)];
}

/** "AKs", "T9o", "77" → class. */
export function parseStartingHand(label: string): StartingHand {
  const hand = STARTING_HANDS.find((h) => h.label === label);
  if (!hand) throw new Error(`Invalid starting hand "${label}"`);
  return hand;
}

/** A representative pair of hole cards for a class (clubs, plus diamonds when offsuit or paired). */
export function exampleHole(hand: StartingHand): [Card, Card] {
  const second = hand.suited ? 0 : 1;
  return [(hand.high << 2) | 0, (hand.low << 2) | second];
}
