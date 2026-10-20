import { describe, expect, it } from 'vitest';
import { splitHandCounts } from './analysis.ts';
import { cardValue, formatCard, parseCard, parseCards } from './cards.ts';
import { handTotal, isPair } from './hand.ts';
import { makeRules, parseRulesId, rulesId } from './rules.ts';
import { PRESET_RULES } from './presets.ts';
import { gridRuleSets } from './grid.ts';
import { cardsLeft, createShoe, drawCard, pastCutCard, shuffleShoe } from './shoe.ts';

describe('cards and hands', () => {
  it('values cards', () => {
    expect(parseCards('Ah Kd Tc 9s 2h').map(cardValue)).toEqual([1, 10, 10, 9, 2]);
    expect(formatCard(parseCard('Qs'))).toBe('Qs');
  });

  it('totals soft and hard hands', () => {
    expect(handTotal(parseCards('Ah 6d'))).toEqual({ total: 17, soft: true });
    expect(handTotal(parseCards('Ah 6d Td'))).toEqual({ total: 17, soft: false });
    expect(handTotal(parseCards('Ah Ad 9c'))).toEqual({ total: 21, soft: true });
    expect(handTotal(parseCards('Ah Ad Ac As'))).toEqual({ total: 14, soft: true });
    expect(handTotal(parseCards('Kh Qd 5c'))).toEqual({ total: 25, soft: false });
  });

  it('pairs any two ten-value cards', () => {
    expect(isPair(parseCards('Kh Qd'))).toBe(true);
    expect(isPair(parseCards('9h 9d'))).toBe(true);
    expect(isPair(parseCards('9h Td'))).toBe(false);
  });
});

describe('shoe', () => {
  it('holds every card once per deck and is reproducible by seed', () => {
    const shoe = createShoe(6, { seed: 'test' });
    expect(shoe.cards).toHaveLength(312);
    const counts = new Array(52).fill(0);
    for (const card of shoe.cards) counts[card]++;
    expect(counts.every((count) => count === 6)).toBe(true);
    expect(createShoe(6, { seed: 'test' }).cards).toEqual(shoe.cards);
    expect(createShoe(6, { seed: 'other' }).cards).not.toEqual(shoe.cards);
  });

  it('puts the cut card at the penetration and reshuffles to a new order', () => {
    let shoe = createShoe(2, { seed: 1, penetration: 0.5 });
    expect(shoe.cutCard).toBe(52);
    for (let i = 0; i < 52; i++) shoe = drawCard(shoe)[1];
    expect(pastCutCard(shoe)).toBe(true);
    expect(cardsLeft(shoe)).toBe(52);
    const reshuffled = shuffleShoe(shoe);
    expect(reshuffled.next).toBe(0);
    expect(reshuffled.cards).not.toEqual(shoe.cards);
  });
});

describe('rules', () => {
  it('names rule sets', () => {
    expect(rulesId(makeRules())).toBe('6d-h17-das-rs4-ls');
    const singleDeck = makeRules({
      decks: 1,
      dealerHitsSoft17: false,
      doubleAfterSplit: false,
      blackjackPays: '6:5',
      surrender: 'none',
    });
    expect(rulesId(singleDeck)).toBe('1d-s17-ndas-rs4-6to5');
  });

  it('parses its ids back', () => {
    const all = [...PRESET_RULES, ...gridRuleSets().map((set) => set.rules), makeRules({ resplitAces: true, hitSplitAces: true, double: '10-11', maxHands: 3, holeCard: 'none', originalBetsOnly: true })];
    for (const rules of all) expect(parseRulesId(rulesId(rules))).toEqual(rules);
    expect(parseRulesId('6d-h17')).toBeNull();
    expect(parseRulesId('3d-h17-das-rs4')).toBeNull();
    expect(parseRulesId('nonsense')).toBeNull();
  });

  it('rejects unsupported values', () => {
    expect(() => makeRules({ decks: 3 as 2 })).toThrow();
    expect(() => makeRules({ maxHands: 5 as 4 })).toThrow();
  });
});

describe('splitHandCounts', () => {
  it('is two ordinary hands without resplits', () => {
    const [x, y] = splitHandCounts(2, 2, 2, 22, 309, true);
    expect(x + y).toBeCloseTo(2, 12);
    expect(y).toBeCloseTo(2 * (22 / 309), 2);
  });

  it('expects more hands when resplitting is allowed', () => {
    const [x2, y2] = splitHandCounts(2, 2, 2, 22, 309, true);
    const [x4, y4] = splitHandCounts(4, 2, 2, 22, 309, true);
    expect(x4 + y4).toBeGreaterThan(x2 + y2);
    expect(x4 + y4).toBeLessThan(4);
  });
});
