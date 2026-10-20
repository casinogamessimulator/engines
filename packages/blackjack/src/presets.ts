import { makeRules, type Rules, rulesId } from './rules.ts';

/**
 * Rule sets with precomputed basic strategy and house edge (strategies.json, from scripts/compute-strategies.ts).
 * Unless stated: double on any two cards, resplit to 4 hands, no resplitting or hitting split aces, 3:2, peek.
 */
export const PRESET_RULES: readonly Rules[] = [
  // 6 decks: the most common shoe game.
  makeRules({ decks: 6, dealerHitsSoft17: true, doubleAfterSplit: true, surrender: 'late' }),
  makeRules({ decks: 6, dealerHitsSoft17: true, doubleAfterSplit: true, surrender: 'none' }),
  makeRules({ decks: 6, dealerHitsSoft17: true, doubleAfterSplit: false, surrender: 'none' }),
  makeRules({ decks: 6, dealerHitsSoft17: false, doubleAfterSplit: true, surrender: 'late' }),
  makeRules({ decks: 6, dealerHitsSoft17: false, doubleAfterSplit: true, surrender: 'none' }),
  makeRules({ decks: 6, dealerHitsSoft17: false, doubleAfterSplit: false, surrender: 'none' }),
  // 8 decks.
  makeRules({ decks: 8, dealerHitsSoft17: true, doubleAfterSplit: true, surrender: 'late' }),
  makeRules({ decks: 8, dealerHitsSoft17: true, doubleAfterSplit: true, surrender: 'none' }),
  makeRules({ decks: 8, dealerHitsSoft17: true, doubleAfterSplit: false, surrender: 'none' }),
  makeRules({ decks: 8, dealerHitsSoft17: false, doubleAfterSplit: true, surrender: 'late' }),
  makeRules({ decks: 8, dealerHitsSoft17: false, doubleAfterSplit: true, surrender: 'none' }),
  makeRules({ decks: 8, dealerHitsSoft17: false, doubleAfterSplit: false, surrender: 'none' }),
  // 6:5 blackjack.
  makeRules({ decks: 6, dealerHitsSoft17: true, doubleAfterSplit: true, surrender: 'none', blackjackPays: '6:5' }),
  makeRules({ decks: 8, dealerHitsSoft17: true, doubleAfterSplit: true, surrender: 'none', blackjackPays: '6:5' }),
  makeRules({ decks: 1, dealerHitsSoft17: true, doubleAfterSplit: false, surrender: 'none', blackjackPays: '6:5' }),
  // Double deck.
  makeRules({ decks: 2, dealerHitsSoft17: true, doubleAfterSplit: true, surrender: 'none' }),
  makeRules({ decks: 2, dealerHitsSoft17: false, doubleAfterSplit: true, surrender: 'none' }),
  makeRules({ decks: 2, dealerHitsSoft17: true, doubleAfterSplit: false, surrender: 'none' }),
  // Single deck.
  makeRules({ decks: 1, dealerHitsSoft17: true, doubleAfterSplit: false, surrender: 'none' }),
  makeRules({ decks: 1, dealerHitsSoft17: false, doubleAfterSplit: false, surrender: 'none' }),
  makeRules({ decks: 1, dealerHitsSoft17: false, doubleAfterSplit: true, surrender: 'none' }),
  // European no hole card: double on 9-11, split once, the dealer's blackjack takes doubles and splits.
  makeRules({
    decks: 6,
    dealerHitsSoft17: false,
    double: '9-11',
    doubleAfterSplit: true,
    maxHands: 2,
    surrender: 'none',
    holeCard: 'none',
  }),
  // Off the rule grid, for the site's strategy pages and what each of their rules is worth.
  // Resplitting aces: Strip high-limit shoes.
  makeRules({ decks: 6, dealerHitsSoft17: false, doubleAfterSplit: true, surrender: 'late', resplitAces: true }),
  makeRules({ decks: 6, dealerHitsSoft17: true, doubleAfterSplit: true, surrender: 'late', resplitAces: true }),
  // "Reno rules": double on 10 or 11 only.
  makeRules({ decks: 2, dealerHitsSoft17: true, double: '10-11', doubleAfterSplit: false, surrender: 'none' }),
  // No hole card, doubling on any two cards (Australia, much of continental Europe), and the European game with one
  // of its two restrictions at a time.
  makeRules({ decks: 6, dealerHitsSoft17: false, doubleAfterSplit: true, surrender: 'none', holeCard: 'none' }),
  makeRules({ decks: 6, dealerHitsSoft17: false, double: '9-11', doubleAfterSplit: true, surrender: 'none', holeCard: 'none' }),
  makeRules({ decks: 6, dealerHitsSoft17: false, doubleAfterSplit: true, maxHands: 2, surrender: 'none', holeCard: 'none' }),
];

export const PRESET_IDS: readonly string[] = PRESET_RULES.map(rulesId);
