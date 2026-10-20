import type { Hand } from './hand.ts';

/** Easy: a short chart you can memorize. Best: the full chart, as close to perfect play as a chart gets. */
export type StrategyLevel = 'easy' | 'best';
export const STRATEGY_LEVELS: StrategyLevel[] = ['easy', 'best'];

export type StrategyLocale = 'en' | 'es' | 'pt-br';

export interface RuleDefinition {
  /** What the player holds, in each language. */
  text: Record<StrategyLocale, string>;
  /** A typical hold for the rule (cards to keep, e.g. "Kh Qh Jh"); empty for "discard all". */
  example: string;
  /** The hold this rule calls for, or null when it doesn't apply. */
  match: (hand: Hand) => number | null;
}

export interface StrategyRule extends RuleDefinition {
  id: string;
}

export interface StrategyChart {
  /** Paytables this chart is written for. */
  paytableIds: string[];
  level: StrategyLevel;
  /** Hold the first rule that applies. */
  rules: StrategyRule[];
}

/** From scripts/verify-strategy.ts: the chart played over all 2,598,960 deals. */
export interface StrategyResult {
  chartReturn: number;
  perfectReturn: number;
  /** Share of deals where the chart's hold is as good as the best one. */
  agreement: number;
}

/** paytableId → level → result. */
export type StrategyResults = Record<string, Partial<Record<StrategyLevel, StrategyResult>>>;

/** A game family's charts and their verified results (one file each, under src/strategy/). */
export interface StrategyFamily {
  id: string;
  charts: StrategyChart[];
  results: StrategyResults;
}

/** Turns { id: definition } into { id: rule }, keeping the ids typed. */
export function defineRules<T extends Record<string, RuleDefinition>>(definitions: T): { [K in keyof T]: StrategyRule } {
  return Object.fromEntries(Object.entries(definitions).map(([id, d]) => [id, { id, ...d }])) as {
    [K in keyof T]: StrategyRule;
  };
}
