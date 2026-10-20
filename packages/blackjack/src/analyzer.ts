import { fullShoe, UpCardAnalysis } from './analysis.ts';
import { type Card, cardValue } from './cards.ts';
import type { Action } from './game.ts';
import { blackjackPayout, type Rules, validateRules } from './rules.ts';

export interface ActionEv {
  action: Action;
  /** Expected result per unit of the original bet (−0.5 = lose half the bet on average). */
  ev: number;
}

export interface HandAnalysis {
  /** Every legal action with its EV, best first. Play after this decision is perfect (composition-dependent). */
  actions: ActionEv[];
  /** EV of taking insurance (half the bet) per unit of the original bet, when it's offered; else null. */
  insurance: number | null;
  /**
   * True when the EVs are given the dealer has already checked and has no blackjack (peek games after the check).
   * Otherwise they include the chance of a dealer blackjack still to come.
   */
  afterPeek: boolean;
}

export interface HandToAnalyze {
  /** The player's hand, in the order dealt. */
  cards: readonly Card[];
  up: Card;
  /** How many hands the player has; more than 1 means this hand came from a split. Default 1. */
  hands?: number;
  /** Other cards known to be out of the shoe: other split hands, other players' cards. */
  seen?: readonly Card[];
}

const EV_EPSILON = 1e-12;

/**
 * EV of each legal action for a hand against an up card, computed exactly from the cards left in the shoe (splits
 * use the approximation described in analysis.ts). A two-card hand takes a few milliseconds; splitting, up to a few
 * hundred.
 */
export function analyzeHand(rules: Rules, hand: HandToAnalyze): HandAnalysis {
  validateRules(rules);
  const hands = hand.hands ?? 1;
  if (hand.cards.length < 2) throw new Error('A hand has at least two cards');
  const values = hand.cards.map((card) => cardValue(card) - 1);
  const up = cardValue(hand.up) - 1;
  const base = fullShoe(rules.decks);
  base[up]--;
  for (const card of hand.seen ?? []) base[cardValue(card) - 1]--;
  const removed = new Int32Array(10);
  for (const i of values) removed[i]++;
  for (let i = 0; i < 10; i++)
    if (base[i] - removed[i] < 0) throw new Error(`More cards of value ${i + 1} than a ${rules.decks}-deck shoe holds`);

  const options = new UpCardAnalysis(rules, up, base).handOptions(values, hands);
  const initial = hands === 1 && values.length === 2;
  const afterPeek = rules.holeCard === 'peek' && !(rules.surrender === 'early' && initial);
  const p = options.blackjackChance;
  // Unnormalized values (see analysis.ts): divide by P(no blackjack) after the peek, add the offset before it.
  const ev = (value: number): number => (afterPeek ? value / (1 - p) : options.offset + value);

  const actions: ActionEv[] = [];
  if (options.natural) {
    actions.push({ action: 'stand', ev: afterPeek ? blackjackPayout(rules) : blackjackPayout(rules) * (1 - p) });
  } else {
    actions.push({ action: 'stand', ev: ev(options.stand) });
    if (options.hit !== undefined) actions.push({ action: 'hit', ev: ev(options.hit) });
    if (options.double !== undefined) actions.push({ action: 'double', ev: ev(options.double) });
    if (options.split !== undefined) actions.push({ action: 'split', ev: ev(options.split) });
    if (options.surrender !== undefined) actions.push({ action: 'surrender', ev: ev(options.surrender) });
  }
  actions.sort((a, b) => b.ev - a.ev);
  // Insurance pays 2:1 on half the bet: 0.5 × (2p − (1 − p)).
  const insurance = initial && up === 0 ? 0.5 * (3 * p - 1) : null;
  return { actions, insurance, afterPeek };
}

/** The actions that tie for the best EV (usually one). */
export function bestActions(analysis: HandAnalysis): Action[] {
  const best = analysis.actions[0].ev;
  return analysis.actions.filter((option) => option.ev >= best - EV_EPSILON).map((option) => option.action);
}
