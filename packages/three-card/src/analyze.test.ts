import { describe, expect, it } from 'vitest';
import analysis from './analysis.json' with { type: 'json' };
import { analyzeGame, analyzeHand, analyzePairPlus, DEALER_HANDS, ROUNDS, strategyDecision, type GameAnalysis } from './analyze.ts';
import { parseCards } from './cards.ts';
import { PayClass } from './evaluate.ts';
import handEvs from './hand-evs.json' with { type: 'json' };
import { anteBonusPaytables, DEFAULT_ANTE_BONUS, getAnteBonusPaytable, getPairPlusPaytable, pairPlusPaytables } from './paytables.ts';

const game = analyzeGame(); // about half a second
const stored = analysis.anteBonus as Record<string, Omit<GameAnalysis, 'hands'>>;

describe('analyzeHand', () => {
  it('counts all 18,424 dealer hands', () => {
    const { counts } = analyzeHand(parseCards('Qh 6c 4d'));
    expect(counts.notQualified + counts.win + counts.tie + counts.lose).toBe(DEALER_HANDS);
  });

  it('puts the play-or-fold line between Q-6-4 and Q-6-3', () => {
    for (const hand of ['Qh 6c 4d', 'Qh 6h 4d', 'Qh 6d 4h', 'Qc 6h 4h', 'Qh 6c 5d']) {
      const result = analyzeHand(parseCards(hand));
      expect(result.best, hand).toBe('play');
      expect(result.play, hand).toBeGreaterThan(-1);
    }
    for (const hand of ['Qh 6c 3d', 'Qh 6h 3d', 'Qc 6h 3h', 'Qh 5c 4d', 'Jh Tc 8d']) {
      const result = analyzeHand(parseCards(hand));
      expect(result.best, hand).toBe('fold');
      expect(result.play, hand).toBeLessThan(-1);
    }
  });

  it('agrees with the whole-game table', () => {
    for (const row of handEvs.slice(0, 50).concat(handEvs.slice(1200, 1300))) {
      const result = analyzeHand(parseCards(row.hand));
      expect(result.counts).toEqual(row.counts);
      expect(result.play).toBeCloseTo(row.play, 10);
    }
  });
});

describe('optimal strategy', () => {
  it('is exactly "play Q-6-4 or better" for every hand', () => {
    expect(game.threshold.lowestPlayed).toMatch(/^Q. 6. 4.$/);
    expect(game.threshold.highestFolded).toMatch(/^Q. 6. 3.$/);
    expect(game.threshold.separates).toBe(true);
    for (const row of game.hands) expect(strategyDecision(parseCards(row.hand)), row.hand).toBe(row.best);
  });

  it('keeps the same threshold under every ante bonus table', () => {
    for (const table of anteBonusPaytables) {
      const { threshold } = stored[table.id];
      expect(threshold.separates, table.id).toBe(true);
      expect(threshold.lowestPlayed, table.id).toMatch(/^Q. 6. 4.$/);
    }
  });

  it('plays 67.42% of hands', () => {
    expect(game.playProbability).toBeCloseTo(14_900 / 22_100, 12);
  });
});

// Published by Wizard of Odds on its page for this game, as percentages.
describe('house edge under optimal play', () => {
  it('is 3.37% of the ante and 2.01% of the total bet for 5/4/1', () => {
    expect(game.houseEdge * 100).toBeCloseTo(3.37, 2);
    expect(game.elementOfRisk * 100).toBeCloseTo(2.01, 2);
  });

  it.each([
    ['ante-bonus-5-4-1', 3.37, 2.01],
    ['ante-bonus-4-3-1', 3.83, 2.28],
    ['ante-bonus-3-2-1', 4.28, 2.56],
    ['ante-bonus-5-3-1', 3.61, 2.16],
    ['ante-bonus-9-8-1', 1.56, 0.93],
    ['ante-bonus-12.5-10-1', 0.33, 0.2],
    ['ante-bonus-50-10-4-3-0', 6.79, 4.06],
    ['ante-bonus-50-50-8-6-0', 4.75, 2.84],
    ['ante-bonus-10-10-5-4-1', 3.28, 1.96],
  ])('%s: %f% of the ante, %f% of the total bet', (id, houseEdge, elementOfRisk) => {
    const result = analyzeGame(getAnteBonusPaytable(id));
    // Within 0.01 percentage points, beyond the rounding of the published figures.
    expect(Math.abs(result.houseEdge * 100 - houseEdge)).toBeLessThan(0.01);
    expect(Math.abs(result.elementOfRisk * 100 - elementOfRisk)).toBeLessThan(0.01);
  });

  it('matches the published combination count of every outcome', () => {
    const count = (classes: number[], outcome: string) =>
      game.events
        .filter((e) => classes.includes(e.payClass) && e.outcome === outcome)
        .reduce((sum, e) => sum + e.combinations, 0);
    const SF = [PayClass.StraightFlush, PayClass.MiniRoyal, PayClass.MiniRoyalSpades];
    const TRIPS = [PayClass.ThreeOfAKind];
    const STRAIGHT = [PayClass.Straight];
    const FLUSH_OR_LESS = [PayClass.Flush, PayClass.Pair, PayClass.Nothing];
    expect(count(SF, 'win')).toBe(617_044);
    expect(count(SF, 'dealer-not-qualified')).toBe(266_196);
    expect(count(TRIPS, 'win')).toBe(665_776);
    expect(count(SF, 'tie')).toBe(144);
    expect(count(TRIPS, 'dealer-not-qualified')).toBe(288_960);
    expect(count(TRIPS, 'tie')).toBe(0);
    expect(count(SF, 'lose')).toBe(968);
    expect(count(STRAIGHT, 'win')).toBe(8_975_484);
    expect(count(TRIPS, 'lose')).toBe(3_312);
    expect(count(STRAIGHT, 'dealer-not-qualified')).toBe(4_001_004);
    expect(count(FLUSH_OR_LESS, 'win')).toBe(87_096_380);
    expect(count(STRAIGHT, 'tie')).toBe(18_288);
    expect(count(FLUSH_OR_LESS, 'dealer-not-qualified')).toBe(80_937_492);
    expect(count(FLUSH_OR_LESS, 'tie')).toBe(249_216);
    expect(count(STRAIGHT, 'lose')).toBe(270_504);
    expect(count(FLUSH_OR_LESS, 'fold')).toBe(132_652_800);
    expect(count(FLUSH_OR_LESS, 'lose')).toBe(91_126_832);
    expect(game.events.reduce((sum, e) => sum + e.combinations, 0)).toBe(ROUNDS);
  });

  it('gives the published win, push and loss chances', () => {
    expect(game.winProbability * 100).toBeCloseTo(44.91, 2);
    expect(game.pushProbability * 100).toBeCloseTo(0.06, 2);
    expect(game.lossProbability * 100).toBeCloseTo(55.03, 2);
    expect(game.netDistribution.reduce((sum, n) => sum + n.probability, 0)).toBeCloseTo(1, 12);
  });

  it('has the dealer qualifying 69.59% of the time', () => {
    // Queen high or better: 15,380 of the 22,100 hands, whatever the player holds.
    expect(game.dealerQualifiesProbability).toBeCloseTo(15_380 / 22_100, 12);
  });
});

describe('pair plus house edge', () => {
  it.each([
    ['pair-plus-1-3-6-30-40', 7.28],
    ['pair-plus-1-4-6-30-40', 2.32],
    ['pair-plus-1-4-6-33-35', 2.7],
    ['pair-plus-1-4-6-25-40', 3.49],
    ['pair-plus-1-4-6-25-35', 4.58],
    ['pair-plus-1-3-6-30-50', 5.1],
    ['pair-plus-1-4-5-30-40', 5.57],
    ['pair-plus-1-4-5-25-40', 6.75],
    ['pair-plus-1-4-6-32-40', 1.85],
    ['pair-plus-1-4-6-38-42', 0],
    ['pair-plus-1-3-6-25-40-80', 7.73],
    ['pair-plus-1-3-6-30-40-50', 7.1],
    ['pair-plus-1-4-5-30-40-50', 5.39],
    ['pair-plus-1-3-6-30-40-200', 4.38],
    ['pair-plus-1-3-6-30-50-100', 4.2],
    ['pair-plus-1-4-6-30-40-50', 2.14],
  ])('%s: %f%', (id, published) => {
    const { houseEdge } = analyzePairPlus(getPairPlusPaytable(id));
    expect(Math.abs(houseEdge * 100 - published)).toBeLessThan(0.01);
  });

  it('is exactly 1,608 / 22,100 for the default 1/3/6/30/40', () => {
    expect(analyzePairPlus().houseEdge).toBeCloseTo(1_608 / 22_100, 14);
  });

  it('covers every listed paytable', () => {
    expect(Object.keys(analysis.pairPlus).sort()).toEqual(pairPlusPaytables.map((t) => t.id).sort());
  });
});

// analysis.json and hand-evs.json come from scripts/compute-analysis.ts (pnpm analysis).
describe('precomputed results', () => {
  it('match a fresh computation', () => {
    const defaults = stored[DEFAULT_ANTE_BONUS.id];
    expect(defaults.houseEdge).toBeCloseTo(game.houseEdge, 10);
    expect(defaults.events).toEqual(game.events);
    expect(handEvs).toHaveLength(1_755);
    expect(handEvs.map((h) => h.hand)).toEqual(game.hands.map((h) => h.hand));
    expect(handEvs.reduce((sum, h) => sum + h.combinations, 0)).toBe(22_100);
    for (const table of anteBonusPaytables) expect(analysis.anteBonus, `run pnpm analysis`).toHaveProperty([table.id]);
  });
});
