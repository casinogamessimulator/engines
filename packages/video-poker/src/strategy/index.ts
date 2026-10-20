import type { Card } from '../cards.ts';
import { classify } from '../evaluate.ts';
import { bonusPoker } from './bonus-poker.ts';
import { COMMON_RULES } from './common-rules.ts';
import { doubleBonus } from './double-bonus.ts';
import type { Hand } from './hand.ts';
import { jacksOrBetter } from './jacks-or-better.ts';
import type { StrategyChart, StrategyFamily, StrategyLevel, StrategyResult, StrategyRule } from './types.ts';

/*
 * Strategy charts: an ordered list of rules, "hold the first one that applies". Each game family keeps its
 * charts, extra rules and verified results in its own file here; scripts/verify-strategy.ts checks every
 * chart against perfect play over all 2,598,960 deals.
 */

export * from './types.ts';
export { COMMON_RULES };

export const strategyFamilies: StrategyFamily[] = [jacksOrBetter, bonusPoker, doubleBonus];
export const strategyCharts: StrategyChart[] = strategyFamilies.flatMap((family) => family.charts);

export function chartFor(paytableId: string, level: StrategyLevel = 'best'): StrategyChart | null {
  return strategyCharts.find((chart) => chart.level === level && chart.paytableIds.includes(paytableId)) ?? null;
}

/** The levels charted for a paytable, easy first. */
export function chartLevels(paytableId: string): StrategyLevel[] {
  return (['easy', 'best'] as const).filter((level) => chartFor(paytableId, level));
}

export function strategyResult(paytableId: string, level: StrategyLevel = 'best'): StrategyResult | null {
  for (const family of strategyFamilies) {
    const result = family.results[paytableId]?.[level];
    if (result) return result;
  }
  return null;
}

const DISCARD_ALL = COMMON_RULES['discard-all'];

/** The chart's play for a dealt hand: which rule applies and what it holds. */
export function chartPlay(cards: readonly Card[], rules: readonly StrategyRule[]): { rule: StrategyRule; hold: number } {
  const hand: Hand = {
    ranks: cards.map((c) => c >> 2),
    suits: cards.map((c) => c & 3),
    handClass: classify(cards[0], cards[1], cards[2], cards[3], cards[4]),
  };
  for (const rule of rules) {
    const hold = rule.match(hand);
    if (hold !== null) return { rule, hold };
  }
  return { rule: DISCARD_ALL, hold: 0 };
}
