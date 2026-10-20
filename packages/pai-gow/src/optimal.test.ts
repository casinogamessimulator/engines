import { describe, expect, it } from 'vitest';
import { newDeck, parseCards, seededRandomInt, shuffle } from './cards.ts';
import { lowRanks } from './evaluate.ts';
import { houseWay } from './house-way.ts';
import { createOptimalSetter, type DealerDistribution } from './optimal.ts';
import distributionJson from './dealer-distribution.json' with { type: 'json' };

const distribution = distributionJson as DealerDistribution;
const setter = createOptimalSetter(distribution);

describe('dealer distribution', () => {
  it('covers every 7-card hand once', () => {
    expect(distribution.hands).toBe(154_143_080);
    let total = 0;
    for (const row of distribution.rows) for (let k = 1; k < row.length; k += 2) total += row[k];
    expect(total).toBe(distribution.hands);
  });

  it('refuses rules it was not computed for', () => {
    expect(() => createOptimalSetter(distribution, { rules: { wheel: 'lowest' } })).toThrow();
  });
});

describe('optimal setter', () => {
  it('ranks every legal setting, best first, with consistent odds', () => {
    const ranked = setter.rank(parseCards('Th Td 4c 4s Kh 9c 2d'));
    expect(ranked.length).toBeGreaterThan(0);
    for (const odds of ranked) {
      expect(odds.setting.foul).toBe(false);
      expect(odds.win + odds.push + odds.lose).toBeCloseTo(1, 12);
      expect(odds.ev).toBeCloseTo(0.95 * odds.win - odds.lose, 12);
    }
    for (let i = 1; i < ranked.length; i++) expect(ranked[i].ev).toBeLessThanOrEqual(ranked[i - 1].ev);
  });

  it('is never worse than the house way by its own measure', () => {
    const randomInt = seededRandomInt(11);
    const deck = newDeck();
    let better = 0;
    for (let i = 0; i < 2_000; i++) {
      const hand = shuffle(deck, randomInt).slice(0, 7);
      const ranked = setter.rank(hand);
      const house = houseWay(hand);
      const houseOdds = ranked.find((odds) => odds.setting.highValue === house.highValue && odds.setting.lowValue === house.lowValue)!;
      expect(ranked[0].ev).toBeGreaterThanOrEqual(houseOdds.ev);
      if (ranked[0].ev > houseOdds.ev) better++;
      expect(setter.best(hand)).toEqual(ranked[0]);
    }
    // It disagrees with the house way on roughly one hand in seven.
    expect(better / 2_000).toBeGreaterThan(0.08);
    expect(better / 2_000).toBeLessThan(0.2);
  });

  it('agrees with bestSplit', () => {
    const randomInt = seededRandomInt(12);
    const deck = newDeck();
    for (let i = 0; i < 500; i++) {
      const hand = shuffle(deck, randomInt).slice(0, 7);
      const best = setter.best(hand);
      expect(setter.rank(hand)[0].ev).toBe(best.ev);
      expect(setter.bestSplit(hand)).toBeGreaterThanOrEqual(0);
    }
  });

  it('makes sensible calls on clear-cut hands', () => {
    // Five aces and kings: aces in front and aces full of kings behind is a near-certain win, safer
    // than the house way's kings in front of five aces.
    const fiveAces = setter.best(parseCards('Ah Ad Ac As Jk Kh Kc'));
    expect(lowRanks(fiveAces.setting.lowValue)).toBe('AA');
    expect(fiveAces.win).toBeGreaterThan(0.9);
    // Aces and kings: split them, aces behind.
    expect(lowRanks(setter.best(parseCards('Ah Ad Kc Ks 9h 5c 2d')).setting.lowValue)).toBe('KK');
    // No pair with a king and queen behind the ace: king-queen in front.
    expect(lowRanks(setter.best(parseCards('Ah Kd Qc 7s 5h 4c 2d')).setting.lowValue)).toBe('KQ');
  });
});
