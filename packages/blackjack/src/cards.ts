/**
 * A card is an integer 0..51: rank = card >> 2 (0 = deuce ... 12 = ace), suit = card & 3, the same encoding as
 * @cgs/video-poker so both games share card images. A shoe holds several copies of each card.
 */
export type Card = number;

export const RANKS = '23456789TJQKA';
export const SUITS = 'cdhs';

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

/** "Ah Kh 5s" → cards. */
export function parseCards(text: string): Card[] {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/).map(parseCard) : [];
}

export function formatCard(card: Card): string {
  return RANKS[rankOf(card)] + SUITS[suitOf(card)];
}

/**
 * The card's blackjack value: 1 for an ace, 2..9, and 10 for tens and faces. The math works on these values only,
 * since suits and the ten/face difference never matter.
 */
export function cardValue(card: Card): number {
  const rank = rankOf(card);
  return rank === 12 ? 1 : Math.min(rank + 2, 10);
}

/** A card of the given value (1 = ace, 10 = ten), in clubs: handy for tests and the analyzer. */
export function cardOfValue(value: number): Card {
  if (!Number.isInteger(value) || value < 1 || value > 10) throw new Error(`Invalid card value ${value}`);
  return makeCard(value === 1 ? 12 : value - 2, 0);
}
