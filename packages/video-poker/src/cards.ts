/**
 * A card is an integer 0..51: rank = card >> 2 (0 = deuce ... 12 = ace), suit = card & 3.
 * Integers keep the evaluator and the analyzers fast and allocation-free.
 */
export type Card = number;

export const RANKS = '23456789TJQKA';
export const SUITS = 'cdhs';

export const ACE = 12;
export const JACK = 9;

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
  return text.trim().split(/\s+/).map(parseCard);
}

export function formatCard(card: Card): string {
  return RANKS[rankOf(card)] + SUITS[suitOf(card)];
}

export function newDeck(): Card[] {
  return Array.from({ length: 52 }, (_, card) => card);
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

/** Fisher–Yates shuffle in place. */
export function shuffle<T>(items: T[], randomInt: (max: number) => number = secureRandomInt): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}
