import { ACE, type Card } from './cards.ts';

/*
 * Best-5-of-N poker hand evaluator (5, 6 or 7 cards), built for the hot loops in scripts/.
 *
 * A hand is four 13-bit rank masks, one per suit. Pairs, trips and quads fall out of bitwise AND/XOR
 * across the suits, and 8192-entry lookup tables give popcounts, top-k ranks and straights, so an
 * evaluation is a few dozen integer operations with no allocation and no branching on card order.
 *
 * The result is a HandValue: a positive int32 where a higher value beats a lower one and equal values
 * tie. Layout: category << 26 | details, where details hold the deciding ranks (as a rank or a rank
 * mask) in comparison order. Rank masks with the same number of bits compare like their sorted ranks,
 * which is exactly how kickers compare.
 */

export const HandCategory = {
  HighCard: 0,
  Pair: 1,
  TwoPair: 2,
  ThreeOfAKind: 3,
  Straight: 4,
  Flush: 5,
  FullHouse: 6,
  FourOfAKind: 7,
  StraightFlush: 8, // a royal flush is the ace-high straight flush
} as const;

export type HandCategory = (typeof HandCategory)[keyof typeof HandCategory];

export const HAND_CATEGORY_NAMES = [
  'High card',
  'Pair',
  'Two pair',
  'Three of a kind',
  'Straight',
  'Flush',
  'Full house',
  'Four of a kind',
  'Straight flush',
] as const;

/** Comparable hand strength: higher wins, equal ties. */
export type HandValue = number;

const SHIFT = 26;
const DETAIL = 13;

/** Smallest value of each category, e.g. `value >= CATEGORY_MIN[HandCategory.Pair]` means a pair or better. */
export const CATEGORY_MIN: readonly number[] = Array.from({ length: 9 }, (_, category) => category << SHIFT);
export const PAIR_OR_BETTER = 1 << SHIFT;
export const ROYAL_FLUSH_VALUE: HandValue = (HandCategory.StraightFlush << SHIFT) | ACE;

export const categoryOf = (value: HandValue): HandCategory => (value >>> SHIFT) as HandCategory;
export const isRoyalFlush = (value: HandValue): boolean => value === ROYAL_FLUSH_VALUE;

const WHEEL_MASK = 0b1_0000_0000_1111; // A 2 3 4 5

export const POPCOUNT = new Uint8Array(1 << 13);
const HIGH_RANK = new Uint8Array(1 << 13); // rank of the highest set bit
const TOP1 = new Uint16Array(1 << 13); // mask keeping only the highest k set bits
const TOP2 = new Uint16Array(1 << 13);
const TOP3 = new Uint16Array(1 << 13);
const TOP5 = new Uint16Array(1 << 13);
const STRAIGHT_HIGH = new Uint8Array(1 << 13); // top rank of the best straight in the mask, 0 = none

for (let mask = 1; mask < 1 << 13; mask++) {
  POPCOUNT[mask] = POPCOUNT[mask >> 1] + (mask & 1);
  HIGH_RANK[mask] = 31 - Math.clz32(mask);
  const tops = [0, 0, 0, 0, 0];
  let kept = 0;
  for (let rank = 12, count = 0; rank >= 0 && count < 5; rank--) {
    if (mask & (1 << rank)) {
      kept |= 1 << rank;
      tops[count++] = kept;
    }
  }
  // Fewer set bits than k: keep them all.
  for (let k = 1; k < 5; k++) if (!tops[k]) tops[k] = tops[k - 1];
  TOP1[mask] = tops[0];
  TOP2[mask] = tops[1];
  TOP3[mask] = tops[2];
  TOP5[mask] = tops[4];
  for (let high = 12; high >= 4; high--) {
    const run = 0b11111 << (high - 4);
    if ((mask & run) === run) {
      STRAIGHT_HIGH[mask] = high;
      break;
    }
  }
  if (!STRAIGHT_HIGH[mask] && (mask & WHEEL_MASK) === WHEEL_MASK) STRAIGHT_HIGH[mask] = 3; // five-high
}

/** Evaluates a hand from its per-suit rank masks (clubs, diamonds, hearts, spades). Hot path. */
export function evaluateMasks(s0: number, s1: number, s2: number, s3: number): HandValue {
  // With at most 7 cards a flush rules out quads and full houses, so it can be settled first.
  const flush = POPCOUNT[s0] >= 5 ? s0 : POPCOUNT[s1] >= 5 ? s1 : POPCOUNT[s2] >= 5 ? s2 : POPCOUNT[s3] >= 5 ? s3 : 0;
  if (flush) {
    const high = STRAIGHT_HIGH[flush];
    if (high) return (HandCategory.StraightFlush << SHIFT) | high;
    return (HandCategory.Flush << SHIFT) | TOP5[flush];
  }

  const ranks = s0 | s1 | s2 | s3;
  const quads = s0 & s1 & s2 & s3;
  if (quads) return (HandCategory.FourOfAKind << SHIFT) | (HIGH_RANK[quads] << DETAIL) | TOP1[ranks & ~quads];

  const odd = s0 ^ s1 ^ s2 ^ s3; // ranks held once or three times
  const twoOrMore = (s0 & s1) | (s2 & s3) | ((s0 | s1) & (s2 | s3));
  const trips = odd & twoOrMore;
  const pairs = twoOrMore & ~odd;

  if (trips) {
    const trip = HIGH_RANK[trips];
    const rest = (trips & ~(1 << trip)) | pairs; // a second set of trips plays as the pair
    if (rest) return (HandCategory.FullHouse << SHIFT) | (trip << DETAIL) | HIGH_RANK[rest];
  }

  const straight = STRAIGHT_HIGH[ranks];
  if (straight) return (HandCategory.Straight << SHIFT) | straight;

  if (trips) return (HandCategory.ThreeOfAKind << SHIFT) | (HIGH_RANK[trips] << DETAIL) | TOP2[ranks & ~trips];

  if (pairs) {
    if (POPCOUNT[pairs] >= 2) {
      const top = TOP2[pairs];
      return (HandCategory.TwoPair << SHIFT) | (top << DETAIL) | TOP1[ranks & ~top];
    }
    return (HandCategory.Pair << SHIFT) | (HIGH_RANK[pairs] << DETAIL) | TOP3[ranks & ~pairs];
  }

  return (HandCategory.HighCard << SHIFT) | TOP5[ranks];
}

/** Per-suit rank masks of some cards, written into `out` (length 4). */
export function suitMasks(cards: readonly Card[], out: Int32Array | number[] = new Int32Array(4)): Int32Array | number[] {
  out[0] = out[1] = out[2] = out[3] = 0;
  for (const card of cards) out[card & 3] |= 1 << (card >> 2);
  return out;
}

/** Value of the best 5-card hand among 5 to 7 cards. */
export function evaluate(cards: readonly Card[]): HandValue {
  if (cards.length < 5 || cards.length > 7) throw new Error(`Evaluate 5 to 7 cards, got ${cards.length}`);
  if (new Set(cards).size !== cards.length) throw new Error('Duplicate card');
  const m = suitMasks(cards);
  return evaluateMasks(m[0], m[1], m[2], m[3]);
}

/** Evaluates seven cards without validation or allocation. */
export function evaluate7(a: Card, b: Card, c: Card, d: Card, e: Card, f: Card, g: Card): HandValue {
  const m = [0, 0, 0, 0];
  m[a & 3] |= 1 << (a >> 2);
  m[b & 3] |= 1 << (b >> 2);
  m[c & 3] |= 1 << (c >> 2);
  m[d & 3] |= 1 << (d >> 2);
  m[e & 3] |= 1 << (e >> 2);
  m[f & 3] |= 1 << (f >> 2);
  m[g & 3] |= 1 << (g >> 2);
  return evaluateMasks(m[0], m[1], m[2], m[3]);
}

/** -1, 0 or 1: how hand `a` compares with hand `b`. */
export function compareHands(a: readonly Card[], b: readonly Card[]): number {
  return Math.sign(evaluate(a) - evaluate(b));
}

/** The five cards that make the best hand, strongest first (for display), with their value. */
export function bestFive(cards: readonly Card[]): { cards: Card[]; value: HandValue } {
  const value = evaluate(cards);
  const n = cards.length;
  for (let i = 0; i < n; i++) {
    for (let j = i; j < n; j++) {
      // Drop cards i and j (the same card when only one must go, or none when n is 5).
      if (n === 5 && (i > 0 || j > 0)) continue;
      if (n === 6 && i !== j) continue;
      if (n === 7 && i === j) continue;
      const five = n === 5 ? [...cards] : cards.filter((_, k) => k !== i && k !== j);
      if (evaluate(five) === value) return { cards: orderForDisplay(five, value), value };
    }
  }
  throw new Error('unreachable');
}

/** Grouped by rank multiplicity, then rank; a wheel shows its ace last. */
function orderForDisplay(five: Card[], value: HandValue): Card[] {
  const count = new Map<number, number>();
  for (const card of five) count.set(card >> 2, (count.get(card >> 2) ?? 0) + 1);
  const category = categoryOf(value);
  const wheel = (category === HandCategory.Straight || category === HandCategory.StraightFlush) && (value & 15) === 3;
  const key = (card: Card): number => {
    const rank = card >> 2;
    return (count.get(rank) ?? 0) * 16 + (wheel && rank === ACE ? -1 : rank);
  };
  return five.sort((x, y) => key(y) - key(x) || y - x);
}

/** Display name of a hand's category, distinguishing the royal flush. */
export function handName(value: HandValue): string {
  return isRoyalFlush(value) ? 'Royal flush' : HAND_CATEGORY_NAMES[categoryOf(value)];
}

/** Value of `masks` (per-suit rank masks, e.g. a board) plus two more cards. Hot path for enumerations. */
export function evaluateWithTwo(masks: ArrayLike<number>, x: Card, y: Card): HandValue {
  let s0 = masks[0];
  let s1 = masks[1];
  let s2 = masks[2];
  let s3 = masks[3];
  const bx = 1 << (x >> 2);
  const by = 1 << (y >> 2);
  switch (x & 3) {
    case 0: s0 |= bx; break;
    case 1: s1 |= bx; break;
    case 2: s2 |= bx; break;
    default: s3 |= bx;
  }
  switch (y & 3) {
    case 0: s0 |= by; break;
    case 1: s1 |= by; break;
    case 2: s2 |= by; break;
    default: s3 |= by;
  }
  return evaluateMasks(s0, s1, s2, s3);
}

/** Value of `masks` plus one more card. */
export function evaluateWithOne(masks: ArrayLike<number>, x: Card): HandValue {
  const bx = 1 << (x >> 2);
  const suit = x & 3;
  return evaluateMasks(
    suit === 0 ? masks[0] | bx : masks[0],
    suit === 1 ? masks[1] | bx : masks[1],
    suit === 2 ? masks[2] | bx : masks[2],
    suit === 3 ? masks[3] | bx : masks[3],
  );
}
