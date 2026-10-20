import { type Card, cardValue } from './cards.ts';

export interface HandTotal {
  /** Best total: an ace counts 11 when that doesn't bust the hand. */
  total: number;
  /** True when an ace is counted as 11. */
  soft: boolean;
}

/** Total of card values (1 = ace ... 10). */
export function totalOfValues(values: readonly number[]): HandTotal {
  let hard = 0;
  let hasAce = false;
  for (const value of values) {
    hard += value;
    if (value === 1) hasAce = true;
  }
  return hasAce && hard <= 11 ? { total: hard + 10, soft: true } : { total: hard, soft: false };
}

export function handTotal(cards: readonly Card[]): HandTotal {
  return totalOfValues(cards.map(cardValue));
}

/** Two cards totalling 21. A hand made by splitting is never a blackjack; callers check that. */
export function isTwoCardTwentyOne(cards: readonly Card[]): boolean {
  return cards.length === 2 && handTotal(cards).total === 21;
}

export function isBust(cards: readonly Card[]): boolean {
  return handTotal(cards).total > 21;
}

/** Two cards of the same value (any two ten-value cards count as a pair, as in most casinos). */
export function isPair(cards: readonly Card[]): boolean {
  return cards.length === 2 && cardValue(cards[0]) === cardValue(cards[1]);
}
