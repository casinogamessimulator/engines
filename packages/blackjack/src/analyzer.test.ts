import { describe, expect, it } from 'vitest';
import { fullShoe, UpCardAnalysis } from './analysis.ts';
import { analyzeHand, bestActions } from './analyzer.ts';
import { cardOfValue, parseCard, parseCards } from './cards.ts';
import { presetResult } from './results.ts';
import { makeRules, type Rules } from './rules.ts';
import { chartCell } from './strategy.ts';

const evOf = (analysis: ReturnType<typeof analyzeHand>, action: string): number =>
  analysis.actions.find((option) => option.action === action)!.ev;

const sixDeck = makeRules(); // 6D H17 DAS LS
const singleDeck = makeRules({ decks: 1, dealerHitsSoft17: false, doubleAfterSplit: false, surrender: 'none' });

describe('analyzeHand', () => {
  it('lists every legal action, best first', () => {
    const analysis = analyzeHand(sixDeck, { cards: parseCards('Th 6s'), up: parseCard('Kd') });
    expect(analysis.actions.map((option) => option.action)).toEqual(['surrender', 'hit', 'stand', 'double']);
    expect(analysis.afterPeek).toBe(true);
    // Late surrender after the peek is exactly half the bet; 16 vs T hits rather than stands.
    expect(evOf(analysis, 'surrender')).toBe(-0.5);
    expect(evOf(analysis, 'hit')).toBeCloseTo(-0.5347, 4);
    expect(evOf(analysis, 'stand')).toBeCloseTo(-0.541, 3);
  });

  it('finds composition-dependent plays the chart misses', () => {
    // Multi-deck: 16 of three or more cards stands against a ten.
    const multiCard = analyzeHand(sixDeck, { cards: parseCards('7h 5s 4c'), up: parseCard('Kd') });
    expect(bestActions(multiCard)).toEqual(['stand']);
    expect(chartCell(presetResult(sixDeck)!.chart, [7, 5, 4], 10, false)).toBe('Rh');
    // Single deck: 6-2 against a 6 hits instead of doubling like other 8s.
    const eight = analyzeHand(singleDeck, { cards: parseCards('6h 2s'), up: parseCard('6d') });
    expect(bestActions(eight)).toEqual(['hit']);
    expect(chartCell(presetResult(singleDeck)!.chart, [6, 2], 6, true)).toBe('Dh');
  });

  it('values a blackjack at the payout, or the payout times the chance the dealer has none', () => {
    const afterPeek = analyzeHand(sixDeck, { cards: parseCards('Ah Ts'), up: parseCard('Ad') });
    expect(afterPeek.actions).toEqual([{ action: 'stand', ev: 1.5 }]);
    const european = makeRules({ holeCard: 'none', surrender: 'none' });
    const noHoleCard = analyzeHand(european, { cards: parseCards('Ah Ts'), up: parseCard('Ad') });
    expect(noHoleCard.afterPeek).toBe(false);
    expect(noHoleCard.actions[0].ev).toBeCloseTo(1.5 * (1 - 95 / 309), 12);
  });

  it('prices insurance from the tens left', () => {
    // Single deck, two tens in the player's hand: 14 of the 49 unseen cards are tens.
    const analysis = analyzeHand(singleDeck, { cards: parseCards('Th Ts'), up: parseCard('Ad') });
    expect(analysis.insurance).toBeCloseTo(0.5 * ((3 * 14) / 49 - 1), 12);
    expect(analyzeHand(singleDeck, { cards: parseCards('Th Ts'), up: parseCard('9d') }).insurance).toBeNull();
  });

  it('early surrender is valued before the peek', () => {
    const rules = makeRules({ surrender: 'early' });
    const analysis = analyzeHand(rules, { cards: parseCards('Th 6s'), up: parseCard('Ad') });
    expect(analysis.afterPeek).toBe(false);
    expect(bestActions(analysis)).toEqual(['surrender']);
    expect(evOf(analysis, 'surrender')).toBe(-0.5);
    // Standing loses to every dealer blackjack too, on top of the after-peek EV.
    const late = analyzeHand(makeRules({ surrender: 'late' }), { cards: parseCards('Th 6s'), up: parseCard('Ad') });
    const p = 95 / 309;
    expect(evOf(analysis, 'stand')).toBeCloseTo(-p + (1 - p) * evOf(late, 'stand'), 12);
  });

  it('follows split rules for split hands', () => {
    const das = analyzeHand(sixDeck, { cards: parseCards('5h 6s'), up: parseCard('6d'), hands: 2 });
    expect(bestActions(das)).toEqual(['double']);
    expect(das.actions.map((option) => option.action)).not.toContain('surrender');
    const noDas = analyzeHand(makeRules({ doubleAfterSplit: false }), { cards: parseCards('5h 6s'), up: parseCard('6d'), hands: 2 });
    expect(noDas.actions.map((option) => option.action).sort()).toEqual(['hit', 'stand']);
    const splitAce = analyzeHand(sixDeck, { cards: parseCards('Ah 7s'), up: parseCard('6d'), hands: 2 });
    expect(splitAce.actions.map((option) => option.action)).toEqual(['stand']);
    const resplit = analyzeHand(sixDeck, { cards: parseCards('8h 8s'), up: parseCard('6d'), hands: 4 });
    expect(resplit.actions.map((option) => option.action)).not.toContain('split');
  });

  it('removes seen cards from the shoe', () => {
    const tens = Array.from({ length: 15 }, () => parseCard('Kc'));
    const rich = analyzeHand(singleDeck, { cards: parseCards('Th 6s'), up: parseCard('7d') });
    const poor = analyzeHand(singleDeck, { cards: parseCards('Th 6s'), up: parseCard('7d'), seen: tens });
    // With every other ten gone, hitting 16 can't bust.
    expect(evOf(poor, 'hit')).toBeGreaterThan(evOf(rich, 'hit'));
    expect(() => analyzeHand(singleDeck, { cards: parseCards('Th 6s'), up: parseCard('7d'), seen: [...tens, ...tens] })).toThrow();
  });

  // Best-play EVs of all two-card hands, weighted by their chances, must add up to the composition-dependent EV
  // of the whole up card.
  it.each([
    ['single deck', singleDeck, 6],
    ['single deck', singleDeck, 10],
    ['six decks', sixDeck, 1],
  ] as [string, Rules, number][])('adds up to the up card EV (%s vs %i)', (_, rules, upValue) => {
    const up = upValue - 1;
    const shoe = fullShoe(rules.decks);
    shoe[up]--;
    const expected = new UpCardAnalysis(rules, up, shoe.slice()).optimalEv();
    const n = shoe.reduce((sum, count) => sum + count, 0);
    let total = 0;
    for (let i = 0; i < 10; i++)
      for (let j = i; j < 10; j++) {
        const chance = i === j ? (shoe[i] * (shoe[i] - 1)) / (n * (n - 1)) : (2 * shoe[i] * shoe[j]) / (n * (n - 1));
        const analysis = analyzeHand(rules, { cards: [cardOfValue(i + 1), cardOfValue(j + 1)], up: cardOfValue(upValue) });
        const best = analysis.actions[0].ev;
        // Back to a full EV: the dealer's blackjack chance after these two cards.
        const tens = shoe[9] - (i === 9 ? 1 : 0) - (j === 9 ? 1 : 0);
        const aces = shoe[0] - (i === 0 ? 1 : 0) - (j === 0 ? 1 : 0);
        const p = up === 0 ? tens / (n - 2) : up === 9 ? aces / (n - 2) : 0;
        const natural = (i === 0 && j === 9) || (i === 9 && j === 0);
        total += chance * (natural ? best * (1 - p) : analysis.afterPeek ? -p + (1 - p) * best : best);
      }
    expect(total).toBeCloseTo(expected, 12);
  });
});
