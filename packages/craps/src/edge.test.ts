import { describe, expect, it } from 'vitest';
import type { BetSpec } from './bets.ts';
import { houseEdge, houseEdges, lineOddsEdges } from './edge.ts';
import edges from './edges.json' with { type: 'json' };
import { createRules, ODDS_LIMITS, type RulesOverrides } from './rules.ts';

// Published house edges, per bet decided (Wizard of Odds' craps appendix and every craps book since).
describe('house edge per bet decided', () => {
  it.each<[string, BetSpec, number, RulesOverrides?]>([
    ['pass', { type: 'pass' }, 7 / 495],
    ['come', { type: 'come' }, 7 / 495],
    ["don't pass", { type: 'dontPass' }, 3 / 220],
    ["don't come", { type: 'dontCome' }, 3 / 220],
    ["don't pass barring 2", { type: 'dontPass' }, 3 / 220, { dontBar: 2 }],
    ['place 4', { type: 'place', number: 4 }, 0.06667],
    ['place 5', { type: 'place', number: 5 }, 0.04],
    ['place 6', { type: 'place', number: 6 }, 0.01515],
    ['place 8', { type: 'place', number: 8 }, 0.01515],
    ['place 9', { type: 'place', number: 9 }, 0.04],
    ['place 10', { type: 'place', number: 10 }, 0.06667],
    ['place to lose 4', { type: 'placeToLose', number: 4 }, 0.0303],
    ['place to lose 5', { type: 'placeToLose', number: 5 }, 0.025],
    ['place to lose 6', { type: 'placeToLose', number: 6 }, 0.01818],
    ['buy 4, commission on win', { type: 'buy', number: 4 }, 0.01667],
    ['buy 5, commission on win', { type: 'buy', number: 5 }, 0.02],
    ['buy 6, commission on win', { type: 'buy', number: 6 }, 0.02273],
    ['buy 4, commission upfront', { type: 'buy', number: 4 }, 0.04762, { buyCommission: 'upfront' }],
    ['buy 6, commission upfront', { type: 'buy', number: 6 }, 0.04762, { buyCommission: 'upfront' }],
    ['lay 4, commission on win', { type: 'lay', number: 4 }, 0.01667],
    ['lay 5, commission on win', { type: 'lay', number: 5 }, 0.02],
    ['lay 6, commission on win', { type: 'lay', number: 6 }, 0.02273],
    ['lay 4, commission upfront', { type: 'lay', number: 4 }, 0.02439, { layCommission: 'upfront' }],
    ['lay 5, commission upfront', { type: 'lay', number: 5 }, 0.03226, { layCommission: 'upfront' }],
    ['lay 6, commission upfront', { type: 'lay', number: 6 }, 0.04, { layCommission: 'upfront' }],
    ['big 6', { type: 'big', number: 6 }, 0.09091],
    ['big 8', { type: 'big', number: 8 }, 0.09091],
    ['field, 2 and 12 pay double', { type: 'field' }, 0.05556, { fieldTwo: 2, fieldTwelve: 2 }],
    ['field, 12 pays triple', { type: 'field' }, 0.02778, { fieldTwo: 2, fieldTwelve: 3 }],
    ['field, 2 and 12 pay triple', { type: 'field' }, 0, { fieldTwo: 3, fieldTwelve: 3 }],
    ['hard 4', { type: 'hardway', number: 4 }, 0.11111],
    ['hard 6', { type: 'hardway', number: 6 }, 0.09091],
    ['hard 8', { type: 'hardway', number: 8 }, 0.09091],
    ['hard 10', { type: 'hardway', number: 10 }, 0.11111],
    ['any 7', { type: 'any7' }, 0.16667],
    ['any craps', { type: 'anyCraps' }, 0.11111],
    ['2 at 30:1', { type: 'prop', total: 2 }, 0.13889],
    ['3 at 15:1', { type: 'prop', total: 3 }, 0.11111],
    ['11 at 15:1', { type: 'prop', total: 11 }, 0.11111],
    ['12 at 30:1', { type: 'prop', total: 12 }, 0.13889],
    ['2 at 30 for 1', { type: 'prop', total: 2 }, 0.16667, { propPays: { two: 29 } }],
    ['horn', { type: 'horn' }, 0.125],
    ['C&E', { type: 'cAndE' }, 0.11111],
    ['hop 1-2 at 15:1', { type: 'hop', dice: [1, 2] }, 0.11111],
    ['hop 3-3 at 30:1', { type: 'hop', dice: [3, 3] }, 0.13889],
  ])('%s', (_, spec, expected, overrides) => {
    expect(houseEdge(spec, createRules(overrides)).edge).toBeCloseTo(expected, 5);
  });

  it("don't pass without ties", () => {
    expect(houseEdge({ type: 'dontPass' }).edgeExcludingTies).toBeCloseTo(0.01403, 5);
  });

  it('pass takes 557/165 rolls on average', () => {
    expect(houseEdge({ type: 'pass' }).expectedRolls).toBeCloseTo(557 / 165, 12);
  });

  it('is the same at any bet size under exact rounding', () => {
    expect(houseEdge({ type: 'place', number: 6 }, undefined, { amount: 5 }).edge).toBeCloseTo(1 / 66, 12);
  });

  it('rounds like a casino when asked: $5 on the 6 wins $5, not $5.83', () => {
    const floor = createRules({ rounding: 'floor' });
    // Win 5 with probability 5/11, lose 5 with 6/11.
    expect(houseEdge({ type: 'place', number: 6 }, floor, { amount: 5 }).edge).toBeCloseTo(1 / 11, 12);
    expect(houseEdge({ type: 'place', number: 6 }, floor, { amount: 6 }).edge).toBeCloseTo(1 / 66, 12);
    // $1 minimum commission: a $10 buy on the 4 pays $1, 10%.
    expect(houseEdge({ type: 'buy', number: 4 }, floor, { amount: 10 }).edge).toBeCloseTo(0.1 / 3, 12);
  });
});

describe('house edge per roll', () => {
  it.each<[string, BetSpec, number]>([
    ['pass', { type: 'pass' }, 0.00419],
    ["don't pass", { type: 'dontPass' }, 0.00404],
    ['place 4', { type: 'place', number: 4 }, 0.01667],
    ['place 5', { type: 'place', number: 5 }, 0.01111],
    ['place 6', { type: 'place', number: 6 }, 0.00463],
    ['hard 4', { type: 'hardway', number: 4 }, 0.02778],
    ['hard 8', { type: 'hardway', number: 8 }, 0.02778],
    ['big 6', { type: 'big', number: 6 }, 0.02778],
    ['any 7', { type: 'any7' }, 0.16667],
  ])('%s', (_, spec, expected) => {
    expect(houseEdge(spec).edgePerRoll).toBeCloseTo(expected, 5);
  });
});

describe('line bets with full odds', () => {
  // Combined edge per chip wagered, flat bet plus odds. Don't players lay enough to win the odds multiple.
  const published: Record<string, [pass: number, dontPass: number]> = {
    '1x': [0.00848, 0.00682],
    '2x': [0.00606, 0.00455],
    '3x': [0.00471, 0.00341],
    '3-4-5x': [0.00374, 0.00273],
    '5x': [0.00326, 0.00227],
    '10x': [0.00184, 0.00124],
    '20x': [0.00099, 0.00065],
    '100x': [0.00021, 0.00014],
  };
  it.each(lineOddsEdges().map((row) => [row.limit, row] as const))('%s', (limit, row) => {
    expect(row.pass).toBeCloseTo(published[limit][0], 5);
    expect(row.dontPass).toBeCloseTo(published[limit][1], 5);
  });

  it('covers every odds limit', () => {
    expect(Object.keys(published)).toEqual(ODDS_LIMITS);
  });

  it('the odds alone have no house edge', () => {
    const flat = houseEdge({ type: 'pass' });
    const withOdds = houseEdge({ type: 'pass' }, undefined, { odds: '10x' });
    expect(withOdds.ev).toBeCloseTo(flat.ev, 10);
    expect(withOdds.wagered).toBeCloseTo(flat.wagered * (1 + (2 / 3) * 10), 10);
  });
});

describe('edges.json', () => {
  // Written by scripts/compute-edges.ts; run pnpm edges if this fails.
  it('is up to date', () => {
    for (const e of houseEdges(createRules())) {
      expect((edges.bets as Record<string, { edge: number }>)[e.key]?.edge, e.key).toBeCloseTo(e.edge, 9);
    }
    for (const row of lineOddsEdges()) expect(edges.odds[row.limit].pass).toBeCloseTo(row.pass, 9);
  });
});
