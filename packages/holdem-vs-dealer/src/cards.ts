/**
 * A card is an integer 0..51: rank = card >> 2 (0 = deuce ... 12 = ace), suit = card & 3.
 * Same encoding as @cgs/video-poker; integers keep the evaluator and the enumerations allocation-free.
 */
export type Card = number;

export const RANKS = '23456789TJQKA';
export const SUITS = 'cdhs';

export const ACE = 12;
export const KING = 11;
export const QUEEN = 10;
export const JACK = 9;
export const TEN = 8;

export const rankOf = (card: Card): number => card >> 2;
export const suitOf = (card: Card): number => card & 3;
export const makeCard = (rank: number, suit: number): Card => (rank << 2) | suit;

/** "Ah", "Tc", "2s" → card. */
export function parseCard(text: string): Card {
  const rank = RANKS.indexOf(text[0]?.toUpperCase() ?? '');
  const suit = SUITS.indexOf(text[1]?.toLowerCase() ?? '');
  if (text.length !== 2 || rank < 0 || suit < 0) throw new Error(`Invalid card "${text}"`);
  return makeCard(rank, suit);
}

/** "Ah Kh Qh Jh Th" → cards. */
export function parseCards(text: string): Card[] {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/).map(parseCard) : [];
}

export function formatCard(card: Card): string {
  return RANKS[rankOf(card)] + SUITS[suitOf(card)];
}

export function formatCards(cards: readonly Card[]): string {
  return cards.map(formatCard).join(' ');
}

export function newDeck(): Card[] {
  return Array.from({ length: 52 }, (_, card) => card);
}

/**
 * Seeded PRNG (mulberry32): a uniform integer in [0, max) per call. The whole generator state is the
 * 32-bit seed, so a round dealt from a seed can be replayed and serialized exactly.
 */
export function seededRandomInt(seed: number): (max: number) => number {
  let state = seed >>> 0;
  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 0x1_0000_0000;
  };
  return (max) => Math.floor(next() * max);
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

/** A fresh 32-bit seed from the cryptographic RNG, for rounds that should be unpredictable. */
export function randomSeed(): number {
  return secureRandomInt(0x1_0000_0000);
}

/** Fisher–Yates shuffle in place. */
export function shuffle<T>(items: T[], randomInt: (max: number) => number = secureRandomInt): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}
