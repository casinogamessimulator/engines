import { describe, expect, it } from 'vitest';
import { ruleVariantEdges } from './grid.ts';
import { PRESET_IDS } from './presets.ts';
import { presetResult, presetResults } from './results.ts';
import { makeRules, type Rules } from './rules.ts';
import { analyzeRules, type ChartAction, type StrategyChart, UP_CARDS } from './strategy.ts';

/*
 * Published figures: Wizard of Odds' blackjack house edge calculator (wizardofodds.com/games/blackjack/calculator/).
 * Its "optimal" figure is composition-dependent perfect play with a full shoe every round, from a combinatorial
 * analyzer; that is our houseEdgeOptimal. Its "basic strategy with continuous shuffler" figure adds a fixed
 * total-dependent penalty per deck count (1D 0.0387%, 2D 0.014%, 6D 0.0031%, 8D 0.0019%); that is our houseEdge.
 * 6:5 adds its per-deck constant. Values in percent.
 */
const PUBLISHED: [id: string, optimal: number, basic: number][] = [
  ['6d-h17-das-rs4-ls', 0.527409, 0.5305],
  ['6d-h17-das-rs4', 0.615626, 0.6187],
  ['6d-h17-ndas-rs4', 0.760168, 0.7633],
  ['6d-s17-das-rs4-ls', 0.330512, 0.3336],
  ['6d-s17-das-rs4', 0.403115, 0.4062],
  ['6d-s17-ndas-rs4', 0.544889, 0.548],
  ['8d-h17-das-rs4-ls', 0.553356, 0.5553],
  ['8d-h17-das-rs4', 0.644928, 0.6468],
  ['8d-h17-ndas-rs4', 0.789206, 0.7911],
  ['8d-s17-das-rs4-ls', 0.355143, 0.357],
  ['8d-s17-das-rs4', 0.430961, 0.4329],
  ['8d-s17-ndas-rs4', 0.572499, 0.5744],
  ['6d-h17-das-rs4-6to5', 1.975316, 1.9784],
  ['8d-h17-das-rs4-6to5', 2.002912, 2.0048],
  ['1d-h17-ndas-rs4-6to5', 1.546535, 1.5852],
  ['2d-h17-das-rs4', 0.379879, 0.3939],
  ['2d-s17-das-rs4', 0.178315, 0.1923],
  ['2d-h17-ndas-rs4', 0.525253, 0.5393],
  ['1d-h17-ndas-rs4', 0.151762, 0.1905],
  ['1d-s17-ndas-rs4', -0.04162, -0.0029],
  ['1d-s17-das-rs4', -0.182895, -0.1442],
  ['6d-s17-d911-das-rs2-enhc', 0.66119, 0.6643],
];

/** Analytic results agree with the published ones to 0.005% of the bet (the task asked for 0.02%). */
const TOLERANCE = 0.005;

/*
 * Presets without a published exact figure, checked against what Wizard of Odds' rule variations table says the
 * rule they add is worth (wizardofodds.com/games/blackjack/rule-variations/, 8 decks; values in percent). Splitting
 * only once has no reliable published figure, so it is checked against the same rule in a peek game instead.
 */
const RULE_EFFECTS: [id: string, base: string, effect: number, tolerance: number][] = [
  ['6d-s17-das-rs4-rsa-ls', '6d-s17-das-rs4-ls', -0.08, 0.02],
  ['6d-h17-das-rs4-rsa-ls', '6d-h17-das-rs4-ls', -0.08, 0.02],
  ['6d-s17-das-rs4-enhc', '6d-s17-das-rs4', 0.11, 0.02],
  ['6d-s17-d911-das-rs4-enhc', '6d-s17-das-rs4-enhc', 0.09, 0.02],
  // Doubling on 10-11 costs more with fewer decks: 0.18% is the 8-deck figure.
  ['2d-h17-d1011-ndas-rs4', '2d-h17-ndas-rs4', 0.18, 0.05],
];

describe('house edge against published figures', () => {
  it('covers every preset', () => {
    const checked = [...PUBLISHED.map(([id]) => id), ...RULE_EFFECTS.map(([id]) => id), '6d-s17-das-rs2-enhc'];
    expect(checked.sort()).toEqual([...PRESET_IDS].sort());
  });

  it.each(RULE_EFFECTS)('%s against %s', (id, base, effect, tolerance) => {
    const change = (presetResult(id)!.houseEdge - presetResult(base)!.houseEdge) * 100;
    expect(Math.abs(change - effect)).toBeLessThan(tolerance);
  });

  it('6d-s17-das-rs2-enhc: splitting once costs what it does in a peek game', () => {
    const variants = ruleVariantEdges();
    const peek = variants['split-once'].houseEdge - variants.base.houseEdge;
    const enhc = presetResult('6d-s17-das-rs2-enhc')!.houseEdge - presetResult('6d-s17-das-rs4-enhc')!.houseEdge;
    expect(Math.abs(enhc - peek) * 100).toBeLessThan(0.01);
  });

  it.each(PUBLISHED)('%s', (id, optimal, basic) => {
    const result = presetResult(id)!;
    expect(Math.abs(result.houseEdgeOptimal * 100 - optimal)).toBeLessThan(TOLERANCE);
    expect(Math.abs(result.houseEdge * 100 - basic)).toBeLessThan(TOLERANCE);
    expect(result.houseEdge).toBeGreaterThan(result.houseEdgeOptimal);
  });
});

describe('strategies.json', () => {
  // Recomputing everything takes ~20 s (pnpm strategies); two rule sets keep the check quick.
  it.each(['6d-h17-das-rs4-ls', '1d-s17-ndas-rs4'])(
    '%s is up to date',
    (id) => {
      const stored = presetResult(id)!;
      const fresh = analyzeRules(stored.rules);
      expect(fresh.houseEdge).toBeCloseTo(stored.houseEdge, 8);
      expect(fresh.houseEdgeOptimal).toBeCloseTo(stored.houseEdgeOptimal, 8);
      expect(fresh.chart).toEqual(stored.chart);
    },
    30_000,
  );

  it('stores rules matching their ids', () => {
    for (const [id, result] of Object.entries(presetResults())) expect(presetResult(result.rules)).toBe(presetResults()[id]);
  });
});

const COLUMN: Record<string, number> = { '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, T: 10, A: 1 };

/** "16 vs T: Rh" style decisions from a published chart. Rows: H16, S18 (soft), P8 (pair of 8s), PA, PT. */
function expectDecisions(chart: StrategyChart, decisions: string): void {
  for (const decision of decisions.trim().split(/\s*,\s*/)) {
    const match = /^([HSP])(\w+) vs ([2-9TA]+): (\w+)$/.exec(decision);
    if (!match) throw new Error(`Bad decision "${decision}"`);
    const [, kind, row, ups, expected] = match;
    const table = kind === 'H' ? chart.hard : kind === 'S' ? chart.soft : chart.pairs;
    const key = row === 'A' ? 1 : row === 'T' ? 10 : Number(row);
    for (const up of ups) {
      const actual = table[key][UP_CARDS.indexOf(COLUMN[up])];
      expect(actual, `${kind}${row} vs ${up}`).toBe(expected as ChartAction);
    }
  }
}

describe('basic strategy charts against published charts', () => {
  // Wizard of Odds' 4-8 deck, dealer hits soft 17, DAS, late surrender chart.
  it('6 decks, H17, DAS, late surrender', () => {
    expectDecisions(
      presetResult('6d-h17-das-rs4-ls')!.chart,
      `H8 vs 23456789TA: H, H9 vs 2789TA: H, H9 vs 3456: Dh, H10 vs 23456789: Dh, H10 vs TA: H,
       H11 vs 23456789TA: Dh, H12 vs 23789TA: H, H12 vs 456: S, H13 vs 23456: S, H13 vs 789TA: H,
       H15 vs 23456: S, H15 vs 789: H, H15 vs TA: Rh, H16 vs 23456: S, H16 vs 78: H, H16 vs 9TA: Rh,
       H17 vs 23456789T: S, H17 vs A: Rs, H18 vs 23456789TA: S,
       S13 vs 234789TA: H, S13 vs 56: Dh, S14 vs 56: Dh, S15 vs 456: Dh, S16 vs 456: Dh, S16 vs 23: H,
       S17 vs 3456: Dh, S17 vs 2789TA: H, S18 vs 23456: Ds, S18 vs 78: S, S18 vs 9TA: H,
       S19 vs 6: Ds, S19 vs 2345789TA: S, S20 vs 23456789TA: S,
       PA vs 23456789TA: P, PT vs 23456789TA: S, P9 vs 2345689: P, P9 vs 7TA: S, P8 vs 23456789T: P, P8 vs A: Rp,
       P7 vs 234567: P, P7 vs 89TA: H, P6 vs 23456: P, P6 vs 789TA: H, P5 vs 23456789: Dh, P5 vs TA: H,
       P4 vs 56: P, P4 vs 234789TA: H, P3 vs 234567: P, P3 vs 89TA: H, P2 vs 234567: P, P2 vs 89TA: H`,
    );
  });

  it('6 decks, S17, DAS, no surrender', () => {
    expectDecisions(
      presetResult('6d-s17-das-rs4')!.chart,
      `H11 vs 23456789T: Dh, H11 vs A: H, H15 vs TA: H, H16 vs 9TA: H, H17 vs A: S,
       S18 vs 2: S, S18 vs 3456: Ds, S19 vs 6: S, S17 vs 2: H, P8 vs A: P, P9 vs A: S`,
    );
  });

  it('6 decks, S17, no DAS', () => {
    expectDecisions(
      presetResult('6d-s17-ndas-rs4')!.chart,
      `P2 vs 4567: P, P2 vs 23: H, P3 vs 4567: P, P3 vs 23: H, P4 vs 23456789TA: H, P6 vs 3456: P, P6 vs 2: H,
       P7 vs 234567: P`,
    );
  });

  // Wizard of Odds' single deck chart, dealer stands on soft 17, no DAS.
  it('1 deck, S17, no DAS', () => {
    expectDecisions(
      presetResult('1d-s17-ndas-rs4')!.chart,
      `H8 vs 56: Dh, H8 vs 234789TA: H, H9 vs 23456: Dh, H10 vs 23456789: Dh, H11 vs 23456789TA: Dh,
       H12 vs 456: S, H12 vs 23: H, H16 vs T: H,
       S13 vs 456: Dh, S15 vs 456: Dh, S17 vs 23456: Dh, S18 vs 2: S, S18 vs 3456: Ds, S18 vs 78A: S, S18 vs 9T: H,
       S19 vs 6: Ds, S19 vs 2345: S,
       P2 vs 34567: P, P2 vs 2: H, P3 vs 4567: P, P4 vs 56: Dh, P6 vs 23456: P, P7 vs 234567: P, P7 vs T: S,
       P8 vs 23456789TA: P, P9 vs 2345689: P, P9 vs 7TA: S`,
    );
  });

  it('1 deck, H17: hit soft 18 and double 11 against an ace', () => {
    expectDecisions(presetResult('1d-h17-ndas-rs4')!.chart, 'S18 vs A: H, H11 vs A: Dh');
  });

  it('early surrender gives up more hands against an ace and a ten', () => {
    const rules: Rules = makeRules({ dealerHitsSoft17: false, surrender: 'early' });
    expectDecisions(
      analyzeRules(rules).chart,
      `H5 vs A: Rh, H6 vs A: Rh, H7 vs A: Rh, H12 vs A: Rh, H13 vs A: Rh, H17 vs A: Rs, H14 vs T: Rh, H16 vs T: Rh,
       H13 vs T: H, H8 vs A: H, P8 vs A: Rp`,
    );
  }, 30_000);
});
