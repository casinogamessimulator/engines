/**
 * Cards use the same encoding as @cgs/video-poker so the site can share card images:
 * an integer 0..51 with rank = card >> 2 (0 = deuce ... 12 = ace) and suit = card & 3.
 */
export type Card = number;

export const RANKS = '23456789TJQKA';
export const SUITS = 'cdhs';

export const rankOf = (card: Card): number => card >> 2;
export const suitOf = (card: Card): number => card & 3;
export const makeCard = (rank: number, suit: number): Card => (rank << 2) | suit;

/** Baccarat value: ace 1, two to nine at face value, tens and faces 0. */
export function valueOf(card: Card): number {
  const rank = card >> 2;
  if (rank < 8) return rank + 2;
  return rank === 12 ? 1 : 0;
}

/** Hand total: the sum of the values, last digit only. */
export function handTotal(cards: readonly Card[]): number {
  let total = 0;
  for (const card of cards) total += valueOf(card);
  return total % 10;
}

/** "Ah", "Tc", "2s" → card. */
export function parseCard(text: string): Card {
  const rank = RANKS.indexOf(text[0]?.toUpperCase() ?? '');
  const suit = SUITS.indexOf(text[1]?.toLowerCase() ?? '');
  if (text.length !== 2 || rank < 0 || suit < 0) throw new Error(`Invalid card "${text}"`);
  return makeCard(rank, suit);
}

export function parseCards(text: string): Card[] {
  return text.trim().split(/\s+/).filter(Boolean).map(parseCard);
}

export function formatCard(card: Card): string {
  return RANKS[rankOf(card)] + SUITS[suitOf(card)];
}
