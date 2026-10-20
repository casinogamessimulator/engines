import { ACE, QUEEN, SPADES, type Card } from './cards.ts';

/**
 * 3-card poker categories, weakest first. With only three cards a straight is rarer than a flush, so it
 * ranks higher, and three of a kind beats both.
 */
export const HandCategory = {
  HighCard: 0,
  Pair: 1,
  Flush: 2,
  Straight: 3,
  ThreeOfAKind: 4,
  StraightFlush: 5,
} as const;

export type HandCategory = (typeof HandCategory)[keyof typeof HandCategory];
export const HAND_CATEGORY_COUNT = 6;

/**
 * A hand's strength as one integer: category << 12, then up to three 4-bit ranks that break ties within
 * the category, most significant first. Comparing two values compares the hands; equal values tie.
 * - High card and flush: the three ranks, highest first.
 * - Pair: the pair's rank, then the kicker.
 * - Straight and straight flush: the top card, with A-2-3 counting as 3-high (the lowest straight).
 * - Three of a kind: the rank.
 */
export type HandValue = number;

const value = (category: HandCategory, r1: number, r2 = 0, r3 = 0): HandValue =>
  (category << 12) | (r1 << 8) | (r2 << 4) | r3;

/** Evaluates a 3-card hand. Hot path: called hundreds of millions of times by the exact analysis. */
export function evaluate(a: Card, b: Card, c: Card): HandValue {
  let x = a >> 2;
  let y = b >> 2;
  let z = c >> 2;
  // Sort the ranks high to low.
  if (x < y) [x, y] = [y, x];
  if (y < z) [y, z] = [z, y];
  if (x < y) [x, y] = [y, x];

  if (x === z) return value(HandCategory.ThreeOfAKind, x);
  if (x === y) return value(HandCategory.Pair, x, z);
  if (y === z) return value(HandCategory.Pair, y, x);

  const flush = (a & 3) === (b & 3) && (b & 3) === (c & 3);
  const top = x - z === 2 ? x : x === ACE && y === 1 && z === 0 ? 1 : -1;
  if (top >= 0) return value(flush ? HandCategory.StraightFlush : HandCategory.Straight, top);
  return value(flush ? HandCategory.Flush : HandCategory.HighCard, x, y, z);
}

export function evaluateHand(cards: readonly Card[]): HandValue {
  if (cards.length !== 3 || new Set(cards).size !== 3) throw new Error('A hand has 3 different cards');
  return evaluate(cards[0], cards[1], cards[2]);
}

export const categoryOf = (hand: HandValue): HandCategory => (hand >> 12) as HandCategory;

/** The ranks that break ties within the category (see HandValue), most significant first. */
export function tieBreakRanks(hand: HandValue): number[] {
  const ranks = [(hand >> 8) & 15, (hand >> 4) & 15, hand & 15];
  switch (categoryOf(hand)) {
    case HandCategory.HighCard:
    case HandCategory.Flush:
      return ranks;
    case HandCategory.Pair:
      return ranks.slice(0, 2);
    default:
      return ranks.slice(0, 1);
  }
}

/** Positive when `a` beats `b`, negative when `b` wins, 0 for a tie. */
export const compareHands = (a: HandValue, b: HandValue): number => Math.sign(a - b);

/** The weakest qualifying dealer hand, Q-3-2 (queen high). */
export const DEALER_QUALIFIER: HandValue = value(HandCategory.HighCard, QUEEN, 1, 0);
export const dealerQualifies = (hand: HandValue): boolean => hand >= DEALER_QUALIFIER;

/** The weakest hand worth playing under optimal strategy, Q-6-4 (see analyze.ts for the derivation). */
export const PLAY_THRESHOLD: HandValue = value(HandCategory.HighCard, QUEEN, 4, 2);

/**
 * The distinctions the paytables pay on. A mini royal is A-K-Q suited, a straight flush that some
 * paytables pay extra; some ante bonus tables pay a spade mini royal more still.
 */
export const PayClass = {
  Nothing: 0,
  Pair: 1,
  Flush: 2,
  Straight: 3,
  ThreeOfAKind: 4,
  StraightFlush: 5,
  MiniRoyal: 6,
  MiniRoyalSpades: 7,
} as const;

export type PayClass = (typeof PayClass)[keyof typeof PayClass];
export const PAY_CLASS_COUNT = 8;

const MINI_ROYAL: HandValue = value(HandCategory.StraightFlush, ACE);

export function payClassOf(cards: readonly Card[]): PayClass {
  const hand = evaluateHand(cards);
  if (hand === MINI_ROYAL) return (cards[0] & 3) === SPADES ? PayClass.MiniRoyalSpades : PayClass.MiniRoyal;
  return categoryOf(hand); // categories and the remaining pay classes share numbers
}
