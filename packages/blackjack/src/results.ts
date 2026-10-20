import { type Rules, rulesId } from './rules.ts';
import type { StrategyChart } from './strategy.ts';
import strategies from './strategies.json' with { type: 'json' };

/** A preset rule set's precomputed results, from scripts/compute-strategies.ts. */
export interface StrategyResult {
  rules: Rules;
  /** House edge with the chart, as a fraction of the initial bet. */
  houseEdge: number;
  /** House edge with composition-dependent perfect play. */
  houseEdgeOptimal: number;
  /** Player EV per up card with the chart, keyed by up card value (1 = ace). */
  evByUpCard: Record<string, number>;
  chart: StrategyChart;
}

const results = strategies as unknown as Record<string, StrategyResult>;

/** Precomputed results by rules id; undefined when the rule set isn't a preset (use analyzeRules). */
export function presetResult(rules: Rules | string): StrategyResult | undefined {
  return results[typeof rules === 'string' ? rules : rulesId(rules)];
}

export function presetResults(): Record<string, StrategyResult> {
  return results;
}
