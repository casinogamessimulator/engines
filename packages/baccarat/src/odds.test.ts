import { describe, expect, it } from 'vitest';
import { countOutcomes, exactOdds, houseEdge, houseEdgeExcludingPushes, shoeComposition } from './odds.ts';
import { DEFAULT_RULES, type TableRules } from './rules.ts';

const percent = (edge: number) => edge * 100;
const noCommission: TableRules = { ...DEFAULT_RULES, variant: 'no-commission' };

// Published figures: Wizard of Odds, baccarat basics and appendix 1 (combinations by total).
describe('countOutcomes', () => {
  it('matches the published 8-deck combination counts exactly', () => {
    const counts = countOutcomes(shoeComposition(8));
    expect(counts.total).toBe(416 * 415 * 414 * 413 * 412 * 411);
    expect(counts.total).toBe(4_998_398_275_503_360);
    expect(counts.banker).toBe(2_292_252_566_437_888);
    expect(counts.player).toBe(2_230_518_282_592_256);
    expect(counts.tie).toBe(475_627_426_473_216);
  });

  it('works on a depleted shoe', () => {
    const composition = shoeComposition(1);
    composition[0] -= 10; // ten 10-value cards gone
    const counts = countOutcomes(composition);
    const n = 42;
    expect(counts.total).toBe(n * (n - 1) * (n - 2) * (n - 3) * (n - 4) * (n - 5));
    expect(counts.banker + counts.player + counts.tie).toBe(counts.total);
  });
});

describe('exactOdds', () => {
  it.each([
    [8, 0.458597, 0.446247, 0.095156],
    [6, 0.458653, 0.446279, 0.095069],
  ])('%i decks: banker, player, tie', (decks, banker, player, tie) => {
    const odds = exactOdds(decks);
    expect(odds.banker).toBeCloseTo(banker, 6);
    expect(odds.player).toBeCloseTo(player, 6);
    expect(odds.tie).toBeCloseTo(tie, 6);
  });

  it('gives the banker a three-card 7 win 2.2534% of the time with 8 decks', () => {
    expect(exactOdds(8).bankerThreeCardSeven).toBeCloseTo(0.022534, 6);
  });
});

describe('houseEdge', () => {
  it.each([
    // decks, banker, player, tie 8:1
    [8, 1.06, 1.24, 14.36],
    [6, 1.06, 1.24, 14.44],
    [1, 1.01, 1.29, 15.75],
  ])('%i decks: banker %f%, player %f%, tie %f%', (decks, banker, player, tie) => {
    const odds = exactOdds(decks);
    expect(percent(houseEdge(odds, 'banker'))).toBeCloseTo(banker, 2);
    expect(percent(houseEdge(odds, 'player'))).toBeCloseTo(player, 2);
    expect(percent(houseEdge(odds, 'tie'))).toBeCloseTo(tie, 2);
  });

  it('is 4.84% on a tie paying 9 to 1', () => {
    expect(percent(houseEdge(exactOdds(8), 'tie', { ...DEFAULT_RULES, tiePays: 9 }))).toBeCloseTo(4.844, 3);
  });

  it('is 1.02% on banker and 1.24% on player in the no-commission game', () => {
    const odds = exactOdds(8);
    expect(percent(houseEdge(odds, 'banker', noCommission))).toBeCloseTo(1.0183, 4);
    expect(percent(houseEdge(odds, 'player', noCommission))).toBeCloseTo(1.2351, 4);
  });

  it('is 1.17% on banker and 1.365% on player per resolved bet, without ties', () => {
    const odds = exactOdds(8);
    expect(percent(houseEdgeExcludingPushes(odds, 'banker'))).toBeCloseTo(1.17, 2);
    expect(percent(houseEdgeExcludingPushes(odds, 'player'))).toBeCloseTo(1.365, 3);
  });
});
