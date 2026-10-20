import { ACE, JACK, type Card } from './cards.ts';

/**
 * Every distinction any supported paytable pays differently. Paytables that don't care (e.g. Jacks or
 * Better pays all quads alike) map several classes to the same payout.
 */
export const HandClass = {
  Nothing: 0,
  LowPair: 1,
  HighPair: 2, // jacks or better
  TwoPair: 3,
  ThreeOfAKind: 4,
  Straight: 5,
  Flush: 6,
  FullHouse: 7,
  Quads5ToK: 8,
  Quads2To4: 9,
  Quads2To4WithAToFour: 10, // kicker A, 2, 3 or 4
  QuadAces: 11,
  QuadAcesWith2To4: 12, // kicker 2, 3 or 4
  StraightFlush: 13,
  RoyalFlush: 14,
} as const;

export type HandClass = (typeof HandClass)[keyof typeof HandClass];
export const HAND_CLASS_COUNT = 15;

const ROYAL_MASK = 0b1_1111_0000_0000; // T J Q K A
const WHEEL_MASK = 0b1_0000_0000_1111; // A 2 3 4 5

// Lookup tables over 13-bit rank masks: number of distinct ranks, and whether 5 ranks form a straight.
const BIT_COUNT = new Uint8Array(1 << 13);
const IS_STRAIGHT = new Uint8Array(1 << 13);
for (let mask = 1; mask < 1 << 13; mask++) BIT_COUNT[mask] = BIT_COUNT[mask >> 1] + (mask & 1);
for (let low = 0; low <= 8; low++) IS_STRAIGHT[0b11111 << low] = 1;
IS_STRAIGHT[WHEEL_MASK] = 1;

/** Classifies a 5-card hand (no wild cards). Hot path: called millions of times per analysis. */
export function classify(a: Card, b: Card, c: Card, d: Card, e: Card): HandClass {
  const ra = a >> 2;
  const rb = b >> 2;
  const rc = c >> 2;
  const rd = d >> 2;
  const re = e >> 2;
  const mask = (1 << ra) | (1 << rb) | (1 << rc) | (1 << rd) | (1 << re);
  const distinct = BIT_COUNT[mask];

  if (distinct === 5) {
    const suit = a & 3;
    const flush = (b & 3) === suit && (c & 3) === suit && (d & 3) === suit && (e & 3) === suit;
    const straight = IS_STRAIGHT[mask] === 1;
    if (flush && straight) return mask === ROYAL_MASK ? HandClass.RoyalFlush : HandClass.StraightFlush;
    if (flush) return HandClass.Flush;
    if (straight) return HandClass.Straight;
    return HandClass.Nothing;
  }

  if (distinct === 4) {
    // Exactly one rank appears twice: the first rank that matches a later card.
    const pair = ra === rb || ra === rc || ra === rd || ra === re ? ra : rb === rc || rb === rd || rb === re ? rb : rc === rd || rc === re ? rc : rd;
    return pair >= JACK ? HandClass.HighPair : HandClass.LowPair;
  }

  // Count how many cards share the first card's rank, and the second distinct rank's.
  const countA = 1 + +(rb === ra) + +(rc === ra) + +(rd === ra) + +(re === ra);

  if (distinct === 3) {
    // Trips (3-1-1) or two pair (2-2-1). Some rank has 3 copies iff trips.
    if (countA === 3) return HandClass.ThreeOfAKind;
    if (countA === 2) return HandClass.TwoPair; // a's rank is a pair; the other ranks are 2-1 → two pair
    // a is a singleton: the other four cards are 3-1 or 2-2.
    const countB = 1 + +(rc === rb) + +(rd === rb) + +(re === rb);
    if (countB === 3) return HandClass.ThreeOfAKind;
    if (countB === 2) return HandClass.TwoPair;
    // b is also a singleton, so c, d, e share a rank.
    return HandClass.ThreeOfAKind;
  }

  // distinct === 2: full house (3-2) or quads (4-1).
  if (countA === 2 || countA === 3) return HandClass.FullHouse;
  const quad = countA === 4 ? ra : rb === rc ? rb : rc;
  const kicker = countA === 1 ? ra : ra === rb && rb === rc && rc === rd ? re : ra === rb && rb === rc ? rd : ra === rb ? rc : rb;
  if (quad === ACE) return kicker <= 2 ? HandClass.QuadAcesWith2To4 : HandClass.QuadAces;
  if (quad <= 2) return kicker <= 2 || kicker === ACE ? HandClass.Quads2To4WithAToFour : HandClass.Quads2To4;
  return HandClass.Quads5ToK;
}

export function classifyHand(cards: readonly Card[]): HandClass {
  if (cards.length !== 5) throw new Error(`A hand has 5 cards, got ${cards.length}`);
  return classify(cards[0], cards[1], cards[2], cards[3], cards[4]);
}
