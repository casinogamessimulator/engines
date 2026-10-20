/**
 * A card is an integer 0..51: rank = card >> 2 (0 = deuce ... 12 = ace), suit = card & 3.
 * Same encoding as @cgs/video-poker.
 */
export type Card = number;

export const RANKS = '23456789TJQKA';
export const SUITS = 'cdhs';

export const ACE = 12;
export const KING = 11;
export const QUEEN = 10;
export const SPADES = 3;

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

/** "Qh 6c 4d" → cards. */
export function parseCards(text: string): Card[] {
  return text.trim().split(/\s+/).map(parseCard);
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
