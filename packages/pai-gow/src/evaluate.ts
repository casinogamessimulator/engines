import { ACE, JOKER, RANKS, type Card } from './cards.ts';

/**
 * House rules that change how hands rank. The A-2-3-4-5 straight ("the wheel") is the second-highest
 * straight in most casinos (Wizard of Odds: "most still use it"); some rank it as the lowest.
 */
export interface Rules {
  wheel: 'second-highest' | 'lowest';
}

export const DEFAULT_RULES: Rules = { wheel: 'second-highest' };

/** High-hand (5-card) categories, weakest first. A royal flush is the top straight flush. */
export const Category = {
  HighCard: 0,
  Pair: 1,
  TwoPair: 2,
  ThreeOfAKind: 3,
  Straight: 4,
  Flush: 5,
  FullHouse: 6,
  FourOfAKind: 7,
  StraightFlush: 8,
  FiveAces: 9, // four aces and the joker: the top hand
} as const;

export type Category = (typeof Category)[keyof typeof Category];

export const CATEGORY_NAMES = [
  'High card',
  'Pair',
  'Two pair',
  'Three of a kind',
  'Straight',
  'Flush',
  'Full house',
  'Four of a kind',
  'Straight flush',
  'Five aces',
] as const;

/**
 * A hand value is an integer: higher wins, equal is a copy. category << 20, then the ranks that break
 * ties, most significant first, one 4-bit nibble per distinct rank (grouped by count, then by rank). A
 * straight or straight flush stores a single straight code instead (see straightCode).
 */
const CATEGORY_SHIFT = 20;
export const categoryOf = (value: number): Category => (value >> CATEGORY_SHIFT) as Category;

// The wheel's straight code: other straights score twice their top rank (8 for 6-high ... 24 for
// ace-high), so 23 slots the wheel between the king-high and ace-high straights and 6 below 6-high.
const WHEEL_SECOND_HIGHEST = 23;
const WHEEL_LOWEST = 6;
const ACE_HIGH_STRAIGHT = 2 * ACE;
export const wheelCode = (rules: Rules): number => (rules.wheel === 'lowest' ? WHEEL_LOWEST : WHEEL_SECOND_HIGHEST);

const WHEEL_MASK = 0b1_0000_0000_1111; // A 2 3 4 5
const FULL_MASK = (1 << 13) - 1;

// Lookup tables over 13-bit rank masks: number of distinct ranks, whether 5 ranks form a straight, and
// the set ranks as descending nibbles (only ever needed for masks of up to 5 ranks).
const BIT_COUNT = new Uint8Array(1 << 13);
const IS_STRAIGHT = new Uint8Array(1 << 13);
const DESCENDING = new Int32Array(1 << 13);
for (let mask = 1; mask < 1 << 13; mask++) BIT_COUNT[mask] = BIT_COUNT[mask >> 1] + (mask & 1);
for (let low = 0; low <= 8; low++) IS_STRAIGHT[0b11111 << low] = 1;
IS_STRAIGHT[WHEEL_MASK] = 1;
for (let mask = 1; mask < 1 << 13; mask++) {
  if (BIT_COUNT[mask] > 5) continue;
  let nibbles = 0;
  for (let rank = 12; rank >= 0; rank--) if (mask & (1 << rank)) nibbles = (nibbles << 4) | rank;
  DESCENDING[mask] = nibbles;
}

const topRank = (mask: number): number => 31 - Math.clz32(mask);
const straightCode = (mask: number, wheel: number): number => (mask === WHEEL_MASK ? wheel : 2 * topRank(mask));

/**
 * Values five ranks, plus whether they share a suit. Rank counts are tracked as nested bit masks:
 * seen[k] holds the ranks that appear more than k times.
 */
function rankedValue(r0: number, r1: number, r2: number, r3: number, r4: number, flush: boolean, wheel: number): number {
  let s1 = 0;
  let s2 = 0;
  let s3 = 0;
  let s4 = 0;
  let s5 = 0;
  for (let i = 0; i < 5; i++) {
    const bit = 1 << (i === 0 ? r0 : i === 1 ? r1 : i === 2 ? r2 : i === 3 ? r3 : r4);
    if (s4 & bit) s5 |= bit;
    else if (s3 & bit) s4 |= bit;
    else if (s2 & bit) s3 |= bit;
    else if (s1 & bit) s2 |= bit;
    else s1 |= bit;
  }
  if (s5) return Category.FiveAces << CATEGORY_SHIFT;

  if (BIT_COUNT[s1] === 5) {
    const straight = IS_STRAIGHT[s1] === 1;
    if (straight && flush) return (Category.StraightFlush << CATEGORY_SHIFT) | straightCode(s1, wheel);
    if (flush) return (Category.Flush << CATEGORY_SHIFT) | DESCENDING[s1];
    if (straight) return (Category.Straight << CATEGORY_SHIFT) | straightCode(s1, wheel);
    return DESCENDING[s1];
  }

  const quads = s4;
  const trips = s3 & ~s4;
  const pairs = s2 & ~s3;
  const singles = s1 & ~s2;
  let payload = DESCENDING[quads];
  payload = (payload << (4 * BIT_COUNT[trips])) | DESCENDING[trips];
  payload = (payload << (4 * BIT_COUNT[pairs])) | DESCENDING[pairs];
  payload = (payload << (4 * BIT_COUNT[singles])) | DESCENDING[singles];
  const category = quads
    ? Category.FourOfAKind
    : trips
      ? pairs
        ? Category.FullHouse
        : Category.ThreeOfAKind
      : BIT_COUNT[pairs] === 2
        ? Category.TwoPair
        : Category.Pair;
  return (category << CATEGORY_SHIFT) | payload;
}

/**
 * Values a 5-card high hand. The joker is a "bug": it plays as an ace, or as whatever card completes a
 * straight, flush or straight flush, whichever makes the best hand. In a flush it is the highest rank
 * the flush is missing (Wizard of Odds' MGM Grand house way: "A, Joker, K, 7, 5" plays the joker as a
 * queen). Four aces and the joker are five aces, the top hand. Hot path: called billions of times by the
 * precompute scripts.
 */
export function evaluateHigh(a: Card, b: Card, c: Card, d: Card, e: Card, wheel: number = WHEEL_SECOND_HIGHEST): number {
  if (a !== JOKER && b !== JOKER && c !== JOKER && d !== JOKER && e !== JOKER) {
    const suit = a & 3;
    const flush = (b & 3) === suit && (c & 3) === suit && (d & 3) === suit && (e & 3) === suit;
    return rankedValue(a >> 2, b >> 2, c >> 2, d >> 2, e >> 2, flush, wheel);
  }
  // Move the joker last; the other four are natural cards (the deck has one joker).
  if (a === JOKER) [a, e] = [e, a];
  else if (b === JOKER) [b, e] = [e, b];
  else if (c === JOKER) [c, e] = [e, c];
  else if (d === JOKER) [d, e] = [e, d];
  const ra = a >> 2;
  const rb = b >> 2;
  const rc = c >> 2;
  const rd = d >> 2;
  const suit = a & 3;
  const suited = (b & 3) === suit && (c & 3) === suit && (d & 3) === suit;

  // As an ace (this also completes K-Q-J-T and 5-4-3-2 straights).
  let best = rankedValue(ra, rb, rc, rd, ACE, false, wheel);
  const mask = (1 << ra) | (1 << rb) | (1 << rc) | (1 << rd);
  if (BIT_COUNT[mask] !== 4) return best;

  // As any missing rank that completes a straight (a straight flush if the four share a suit).
  const category = suited ? Category.StraightFlush : Category.Straight;
  for (let rank = 0; rank <= ACE; rank++) {
    const filled = mask | (1 << rank);
    if (filled === mask || !IS_STRAIGHT[filled]) continue;
    const value = (category << CATEGORY_SHIFT) | straightCode(filled, wheel);
    if (value > best) best = value;
  }
  // As the highest rank a flush is missing.
  if (suited) {
    const value = (Category.Flush << CATEGORY_SHIFT) | DESCENDING[mask | (1 << topRank(FULL_MASK & ~mask))];
    if (value > best) best = value;
  }
  return best;
}

export function evaluateHighHand(cards: readonly Card[], rules: Rules = DEFAULT_RULES): number {
  if (cards.length !== 5) throw new Error(`A high hand has 5 cards, got ${cards.length}`);
  return evaluateHigh(cards[0], cards[1], cards[2], cards[3], cards[4], wheelCode(rules));
}

/**
 * Values a 2-card low hand: a pair beats any two singles, then ranks compare high card first. The joker
 * plays as an ace (it can't complete anything in two cards). Values run 0..181: 13 × high + low for two
 * singles (≤ 167), 169 + rank for a pair.
 */
export const LOW_PAIR_BASE = 169;
export function evaluateLow(a: Card, b: Card): number {
  const ra = a === JOKER ? ACE : a >> 2;
  const rb = b === JOKER ? ACE : b >> 2;
  if (ra === rb) return LOW_PAIR_BASE + ra;
  return ra > rb ? ra * 13 + rb : rb * 13 + ra;
}

export function evaluateLowHand(cards: readonly Card[]): number {
  if (cards.length !== 2) throw new Error(`A low hand has 2 cards, got ${cards.length}`);
  return evaluateLow(cards[0], cards[1]);
}

/**
 * Whether a setting is a foul: the 5-card hand must outrank the 2-card hand. A 2-card hand is a pair or
 * two singles, so only a 5-card high card or pair can lose to it: compare the pair rank, or the top two
 * ranks. Equal top ranks don't foul (A-K-x-x-x outranks A-K).
 */
export function isFoul(high: number, low: number): boolean {
  const category = categoryOf(high);
  if (category >= Category.TwoPair) return false;
  if (low >= LOW_PAIR_BASE) {
    if (category === Category.HighCard) return true;
    return ((high >> 12) & 15) < low - LOW_PAIR_BASE; // the high hand's pair rank
  }
  if (category === Category.Pair) return false;
  const lowTop = Math.floor(low / 13);
  const highTop = (high >> 16) & 15;
  return lowTop > highTop || (lowTop === highTop && low % 13 > ((high >> 12) & 15));
}

/** A high hand's category and the ranks that name it, most significant first. */
export interface HighHandParts {
  category: Category;
  royal: boolean;
  /**
   * Straights and straight flushes: the top card (five for the wheel). Five aces: [ace]. Otherwise one
   * rank per group, by count then rank: [pair, kickers…], [high pair, low pair, kicker], [trips, pair]…
   */
  ranks: number[];
}

// How many rank nibbles each category's value carries (straights carry a code instead).
const NIBBLES = [5, 4, 3, 3, 0, 5, 2, 2];

export function highHandParts(value: number): HighHandParts {
  const category = categoryOf(value);
  if (category === Category.FiveAces) return { category, royal: false, ranks: [ACE] };
  if (category === Category.Straight || category === Category.StraightFlush) {
    const code = value & 0xff;
    const top = code === WHEEL_SECOND_HIGHEST || code === WHEEL_LOWEST ? 3 : code / 2;
    return { category, royal: category === Category.StraightFlush && code === ACE_HIGH_STRAIGHT, ranks: [top] };
  }
  const ranks: number[] = [];
  for (let i = NIBBLES[category] - 1; i >= 0; i--) ranks.push((value >> (4 * i)) & 15);
  return { category, royal: false, ranks };
}

/** A low hand as a pair ([rank]) or two singles ([high, low]). */
export function lowHandParts(value: number): { pair: boolean; ranks: number[] } {
  if (value >= LOW_PAIR_BASE) return { pair: true, ranks: [value - LOW_PAIR_BASE] };
  return { pair: false, ranks: [Math.floor(value / 13), value % 13] };
}

/** "Straight flush, king high", "Pair of aces", "Ace-king". */
export function describeHigh(value: number): string {
  const category = categoryOf(value);
  const top = RANKS_LONG[(value >> 16) & 15];
  switch (category) {
    case Category.FiveAces:
      return 'Five aces';
    case Category.StraightFlush:
    case Category.Straight: {
      const code = value & 0xff;
      const name = category === Category.Straight ? 'Straight' : code === ACE_HIGH_STRAIGHT ? 'Royal flush' : 'Straight flush';
      if (code === ACE_HIGH_STRAIGHT && category === Category.StraightFlush) return name;
      return `${name}, ${code === WHEEL_SECOND_HIGHEST || code === WHEEL_LOWEST ? 'five' : RANKS_LONG[code / 2]} high`;
    }
    case Category.FourOfAKind:
      return `Four ${PLURAL[(value >> 4) & 15]}`;
    case Category.FullHouse:
      return `${capitalize(PLURAL[(value >> 4) & 15])} full of ${PLURAL[value & 15]}`;
    case Category.Flush:
      return `Flush, ${top} high`;
    case Category.ThreeOfAKind:
      return `Three ${PLURAL[(value >> 8) & 15]}`;
    case Category.TwoPair:
      return `Two pair, ${PLURAL[(value >> 8) & 15]} and ${PLURAL[(value >> 4) & 15]}`;
    case Category.Pair:
      return `Pair of ${PLURAL[(value >> 12) & 15]}`;
    default:
      return `${capitalize(top)} high`;
  }
}

export function describeLow(value: number): string {
  if (value >= LOW_PAIR_BASE) return `Pair of ${PLURAL[value - LOW_PAIR_BASE]}`;
  return `${capitalize(RANKS_LONG[Math.floor(value / 13)])}-${RANKS_LONG[value % 13]}`;
}

/** Category name, with a royal flush told apart from other straight flushes. */
export function categoryName(value: number): string {
  if (categoryOf(value) === Category.StraightFlush && (value & 0xff) === ACE_HIGH_STRAIGHT) return 'Royal flush';
  return CATEGORY_NAMES[categoryOf(value)];
}

const RANKS_LONG = ['two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'jack', 'queen', 'king', 'ace'];
const PLURAL = ['twos', 'threes', 'fours', 'fives', 'sixes', 'sevens', 'eights', 'nines', 'tens', 'jacks', 'queens', 'kings', 'aces'];
const capitalize = (text: string): string => text[0].toUpperCase() + text.slice(1);

/** Rank characters of a low hand value, high card first ("AK", "QQ"). */
export function lowRanks(value: number): string {
  if (value >= LOW_PAIR_BASE) return RANKS[value - LOW_PAIR_BASE].repeat(2);
  return RANKS[Math.floor(value / 13)] + RANKS[value % 13];
}
