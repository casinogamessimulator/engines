/**
 * A card is an integer: 0..51 for the standard deck (rank = card >> 2 with 0 = deuce ... 12 = ace,
 * suit = card & 3), the same encoding as @cgs/video-poker, plus 52 for the joker. Pai Gow Poker deals
 * from a 53-card deck. Integers keep the evaluator and the precompute scripts fast and allocation-free.
 */
export type Card = number;

export const JOKER: Card = 52;
export const DECK_SIZE = 53;

export const RANKS = '23456789TJQKA';
export const SUITS = 'cdhs';

export const SIX = 4;
export const SEVEN = 5;
export const TEN = 8;
export const JACK = 9;
export const QUEEN = 10;
export const KING = 11;
export const ACE = 12;

export const isJoker = (card: Card): boolean => card === JOKER;
export const rankOf = (card: Card): number => card >> 2;
export const suitOf = (card: Card): number => card & 3;
export const makeCard = (rank: number, suit: number): Card => (rank << 2) | suit;

/** Rank used when the joker plays as an ace: everywhere except completing a straight or flush. */
export const rankAsAce = (card: Card): number => (card === JOKER ? ACE : card >> 2);

/** "Ah", "Tc", "2s" → card; "Jk" or "W" → the joker. */
export function parseCard(text: string): Card {
  if (/^(jk|w)$/i.test(text)) return JOKER;
  const rank = RANKS.indexOf(text[0]?.toUpperCase() ?? '');
  const suit = SUITS.indexOf(text[1]?.toLowerCase() ?? '');
  if (text.length !== 2 || rank < 0 || suit < 0) throw new Error(`Invalid card "${text}"`);
  return makeCard(rank, suit);
}

/** "Ah Kh Qh Jh Jk" → cards. */
export function parseCards(text: string): Card[] {
  return text.trim().split(/\s+/).map(parseCard);
}

export function formatCard(card: Card): string {
  return card === JOKER ? 'Jk' : RANKS[rankOf(card)] + SUITS[suitOf(card)];
}

export function formatCards(cards: readonly Card[]): string {
  return cards.map(formatCard).join(' ');
}

export function newDeck(): Card[] {
  return Array.from({ length: DECK_SIZE }, (_, card) => card);
}

/** Uniform integer in [0, max) from the platform's cryptographic RNG, without modulo bias. */
export function secureRandomInt(max: number): number {
  const limit = Math.floor(0x1_0000_0000 / max) * max;
  const buffer = new Uint32Array(1);
  for (;;) {
    globalThis.crypto.getRandomValues(buffer);
    if (buffer[0] < limit) return buffer[0] % max;
  }
}

/**
 * Seeded generator for reproducible deals, tests and simulations: xoshiro128** (period 2^128 − 1)
 * seeded through splitmix32, returning uniform integers in [0, max) without modulo bias.
 */
export function seededRandomInt(seed: number): (max: number) => number {
  let s = seed >>> 0;
  const splitmix = (): number => {
    s = (s + 0x9e3779b9) >>> 0;
    let z = s;
    z = Math.imul(z ^ (z >>> 16), 0x85ebca6b) >>> 0;
    z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35) >>> 0;
    return (z ^ (z >>> 16)) >>> 0;
  };
  let a = splitmix();
  let b = splitmix();
  let c = splitmix();
  let d = splitmix();
  const next = (): number => {
    const result = Math.imul(rotl(Math.imul(b, 5), 7), 9) >>> 0;
    const t = b << 9;
    c ^= a;
    d ^= b;
    b ^= c;
    a ^= d;
    c ^= t;
    d = rotl(d, 11);
    return result;
  };
  return (max: number): number => {
    const limit = Math.floor(0x1_0000_0000 / max) * max;
    for (;;) {
      const value = next();
      if (value < limit) return value % max;
    }
  };
}

const rotl = (x: number, k: number): number => (x << k) | (x >>> (32 - k));

/** Fisher–Yates shuffle in place. */
export function shuffle<T>(items: T[], randomInt: (max: number) => number = secureRandomInt): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}
