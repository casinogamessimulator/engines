import { describe, expect, it } from 'vitest';
import { decodeChart, encodeChart, gridKey, gridResult, gridRuleSets, ruleVariantEdges } from './grid.ts';
import { PRESET_RULES } from './presets.ts';
import { presetResult } from './results.ts';
import { DEFAULT_RULES, makeRules } from './rules.ts';

describe('rule grid', () => {
  it('covers all 120 combinations', () => {
    expect(gridRuleSets()).toHaveLength(120);
  });

  it('agrees with every preset on the grid', () => {
    for (const rules of PRESET_RULES) {
      const fromGrid = gridResult(rules);
      if (!gridKey(rules)) {
        expect(fromGrid).toBeUndefined();
        continue;
      }
      const preset = presetResult(rules)!;
      expect(fromGrid!.houseEdge).toBeCloseTo(preset.houseEdge, 8);
      expect(fromGrid!.houseEdgeOptimal).toBeCloseTo(preset.houseEdgeOptimal, 8);
      expect(fromGrid!.chart).toEqual(preset.chart);
    }
  });

  it('round-trips charts', () => {
    const chart = presetResult(DEFAULT_RULES)!.chart;
    expect(decodeChart(encodeChart(chart))).toEqual(chart);
  });

  it('leaves rule sets off the grid to the analysis', () => {
    expect(gridResult(makeRules({ resplitAces: true }))).toBeUndefined();
  });

  it('prices single rule changes from the default game', () => {
    const variants = ruleVariantEdges();
    expect(variants.base.houseEdge).toBeCloseTo(presetResult(DEFAULT_RULES)!.houseEdge, 8);
    expect(variants['resplit-aces'].houseEdge).toBeLessThan(variants.base.houseEdge);
    expect(variants['no-hole-card'].houseEdge).toBeGreaterThan(variants.base.houseEdge);
    // The OBO rule plays exactly like a peek game.
    expect(variants['no-hole-card-obo'].houseEdge).toBeCloseTo(variants.base.houseEdge, 8);
  });
});
