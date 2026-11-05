import { type Card, cardValue } from './cards.ts';
import type { Action } from './game.ts';
import type { Rules } from './rules.ts';

/*
 * Index plays: the handful of basic strategy decisions that change with the Hi-Lo true count. The Illustrious 18
 * (Don Schlesinger, Blackjack Attack) are the eighteen that matter most in a multi-deck game, insurance first; the
 * Fab 4 are the late surrender indices. Each entry says what to do at or above its index and below it, and which
 * side basic strategy is on, so the trainer can flag a decision as an index play and the content pages can put a
 * number on each one with the exact engine (analyzer.ts, with a shoe composition from counting.ts's dealtAtCount).
 *
 * Indices are the published Hi-Lo ones for multi-deck games. A few depend on the table: the stand indices for 16
 * and 15 against a ten and 16 against a 9 are for tables without surrender (with it, basic strategy surrenders
 * those hands), and 11 against an ace and 15 against an ace only apply where the dealer stands on soft 17 (when the
 * dealer hits soft 17, basic strategy already doubles the 11 and surrenders the 15).
 */

export type DeviationGroup = 'illustrious-18' | 'fab-4';

export type DeviationHand = { kind: 'hard'; total: number } | { kind: 'pair'; value: number } | { kind: 'insurance' };

export interface Deviation {
  id: string;
  group: DeviationGroup;
  hand: DeviationHand;
  /** Dealer up card value: 1 for an ace, 2 to 10. Insurance is always against an ace. */
  up: number;
  /** The Hi-Lo true count at which the play changes. */
  index: number;
  /** The play at or above the index, and the play below it. */
  above: Action;
  below: Action;
  /** Which side of the index basic strategy is on: the other side's play is the deviation. */
  basic: 'above' | 'below';
  /** Only on tables where the hand can't be surrendered, or where the dealer stands on soft 17. */
  when?: { noSurrender?: boolean; s17?: boolean };
}

const hard = (total: number): DeviationHand => ({ kind: 'hard', total });

const i18 = (id: string, hand: DeviationHand, up: number, index: number, above: Action, below: Action, basic: 'above' | 'below', when?: Deviation['when']): Deviation => ({
  id,
  group: 'illustrious-18',
  hand,
  up,
  index,
  above,
  below,
  basic,
  ...(when ? { when } : {}),
});

const fab4 = (id: string, total: number, up: number, index: number, when?: Deviation['when']): Deviation => ({
  id,
  group: 'fab-4',
  hand: hard(total),
  up,
  index,
  above: 'surrender',
  below: 'hit',
  // Basic strategy surrenders 15 against a ten (and an ace, when the dealer hits soft 17) and never 14 or 15 vs 9.
  basic: id === '15v10r' ? 'above' : 'below',
  ...(when ? { when } : {}),
});

/** Schlesinger's Illustrious 18, in his order (insurance first, then by value to the player). */
export const ILLUSTRIOUS_18: readonly Deviation[] = [
  i18('insurance', { kind: 'insurance' }, 1, 3, 'insurance', 'noInsurance', 'below'),
  i18('16v10', hard(16), 10, 0, 'stand', 'hit', 'below', { noSurrender: true }),
  i18('15v10', hard(15), 10, 4, 'stand', 'hit', 'below', { noSurrender: true }),
  i18('TTv5', { kind: 'pair', value: 10 }, 5, 5, 'split', 'stand', 'below'),
  i18('TTv6', { kind: 'pair', value: 10 }, 6, 4, 'split', 'stand', 'below'),
  i18('10v10', hard(10), 10, 4, 'double', 'hit', 'below'),
  i18('12v3', hard(12), 3, 2, 'stand', 'hit', 'below'),
  i18('12v2', hard(12), 2, 3, 'stand', 'hit', 'below'),
  i18('11vA', hard(11), 1, 1, 'double', 'hit', 'below', { s17: true }),
  i18('9v2', hard(9), 2, 1, 'double', 'hit', 'below'),
  i18('10vA', hard(10), 1, 4, 'double', 'hit', 'below'),
  i18('9v7', hard(9), 7, 3, 'double', 'hit', 'below'),
  i18('16v9', hard(16), 9, 5, 'stand', 'hit', 'below', { noSurrender: true }),
  i18('13v2', hard(13), 2, -1, 'stand', 'hit', 'above'),
  i18('12v4', hard(12), 4, 0, 'stand', 'hit', 'above'),
  i18('12v5', hard(12), 5, -2, 'stand', 'hit', 'above'),
  i18('12v6', hard(12), 6, -1, 'stand', 'hit', 'above'),
  i18('13v3', hard(13), 3, -2, 'stand', 'hit', 'above'),
];

/** The Fab 4 late surrender indices. */
export const FAB_4: readonly Deviation[] = [
  fab4('14v10r', 14, 10, 3),
  fab4('15v10r', 15, 10, 0),
  fab4('15v9', 15, 9, 2),
  fab4('15vA', 15, 1, 1, { s17: true }),
];

export const DEVIATIONS: readonly Deviation[] = [...ILLUSTRIOUS_18, ...FAB_4];

export function getDeviation(id: string): Deviation {
  const deviation = DEVIATIONS.find((d) => d.id === id);
  if (!deviation) throw new Error(`Unknown deviation "${id}"`);
  return deviation;
}

/** The play an index calls for at this true count. */
export const indexPlay = (deviation: Deviation, trueCount: number): Action => (trueCount >= deviation.index ? deviation.above : deviation.below);

/** The play on basic strategy's side of the index. */
export const basicPlay = (deviation: Deviation): Action => (deviation.basic === 'above' ? deviation.above : deviation.below);

/** The deviation's own play: the one taken away from basic strategy's side. */
export const deviationPlay = (deviation: Deviation): Action => (deviation.basic === 'above' ? deviation.below : deviation.above);

/** A true count clearly on the deviation's side of its index, for showing what the deviation is worth. */
export const deviationCount = (deviation: Deviation, distance = 2): number => (deviation.basic === 'above' ? deviation.index - distance : deviation.index + distance);

/** The decision as the trainer sees it: the hand's cards, the up card and what the player may do now. */
export interface DecisionSpot {
  cards: readonly Card[];
  up: Card;
  legal: readonly Action[];
}

/** Whether an entry's table conditions hold here. */
export function deviationApplies(deviation: Deviation, rules: Rules, legal: readonly Action[]): boolean {
  if (deviation.when?.noSurrender && legal.includes('surrender')) return false;
  if (deviation.when?.s17 && rules.dealerHitsSoft17) return false;
  if (deviation.above === 'surrender' && !legal.includes('surrender')) return false;
  return true;
}

/**
 * The index play in effect for a decision, or null when no index covers it. Hard totals match any hand without a
 * usable ace that can't be split (a pair of 8s is a split, not a 16); doubles need the first two cards.
 */
export function deviationFor(rules: Rules, spot: DecisionSpot, trueCount: number): { deviation: Deviation; play: Action } | null {
  const up = cardValue(spot.up);
  const values = spot.cards.map(cardValue);
  const hardTotal = values.reduce((sum, v) => sum + v, 0);
  const soft = values.includes(1) && hardTotal + 10 <= 21;
  const pair = values.length === 2 && values[0] === values[1];
  for (const deviation of DEVIATIONS) {
    if (deviation.up !== up || !deviationApplies(deviation, rules, spot.legal)) continue;
    const { hand } = deviation;
    if (hand.kind === 'insurance') {
      if (!spot.legal.includes('insurance')) continue;
    } else if (!spot.legal.includes('hit') && !spot.legal.includes('stand')) continue;
    else if (hand.kind === 'pair') {
      if (!pair || values[0] !== hand.value || !spot.legal.includes('split')) continue;
    } else {
      if (soft || hardTotal !== hand.total || (pair && spot.legal.includes('split'))) continue;
      if ((deviation.above === 'double' || deviation.below === 'double') && !spot.legal.includes('double')) continue;
    }
    const play = indexPlay(deviation, trueCount);
    return spot.legal.includes(play) ? { deviation, play } : null;
  }
  return null;
}

/** A sample hand for a deviation (two cards making the total, or the pair), in engine card codes. */
export function deviationCards(deviation: Deviation, variant = 0): Card[] {
  const { hand } = deviation;
  const card = (value: number, suit: number): Card => ((value === 1 ? 12 : value === 10 ? 8 + (suit % 4) : value - 2) << 2) | (suit & 3);
  if (hand.kind === 'insurance') return [card(10, variant), card(6, variant + 1)];
  if (hand.kind === 'pair') return [card(hand.value, variant), card(hand.value, variant + 1)];
  // Two-card hard totals without an ace and without a pair: 16 = 10+6 or 9+7, 15 = 10+5 or 9+6, …
  const splits: [number, number][] = [];
  for (let a = 2; a <= 10; a++) {
    const b = hand.total - a;
    if (b >= 2 && b <= 10 && b !== a) splits.push([a, b]);
  }
  const [a, b] = splits[variant % splits.length] ?? [hand.total - 10, 10];
  return [card(a, variant), card(b, variant + 1)];
}

/** The dealer's up card for a deviation, as a card. */
export const deviationUpCard = (deviation: Deviation, suit = 0): Card => ((deviation.up === 1 ? 12 : deviation.up === 10 ? 8 : deviation.up - 2) << 2) | (suit & 3);
