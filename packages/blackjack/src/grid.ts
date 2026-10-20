import { DEFAULT_RULES, makeRules, type Rules } from './rules.ts';
import type { ChartAction, StrategyChart } from './strategy.ts';
import grid from './rule-grid.json' with { type: 'json' };

/*
 * Precomputed results (scripts/compute-grid.ts) for every combination of the five rules players change most:
 * decks, soft 17, double after split, surrender and the blackjack payout. The other rules are the defaults:
 * double on any two cards, resplit to 4 hands, no resplitting or hitting split aces, dealer peeks.
 */

export const GRID_DECKS = [1, 2, 4, 6, 8] as const;

/** One rule changed from the 6-deck Strip game (DEFAULT_RULES), to show what each rule is worth. */
export const RULE_VARIANTS: Record<string, Partial<Rules>> = {
  base: {},
  'double-9-11': { double: '9-11' },
  'double-10-11': { double: '10-11' },
  'split-once': { maxHands: 2 },
  'resplit-3': { maxHands: 3 },
  'resplit-aces': { resplitAces: true },
  'hit-split-aces': { hitSplitAces: true },
  'no-hole-card': { holeCard: 'none' },
  'no-hole-card-obo': { holeCard: 'none', originalBetsOnly: true },
};

export interface RuleGrid {
  /** gridKey → [house edge with the chart, house edge with perfect play, encoded chart]. */
  rules: Record<string, [number, number, string]>;
  /** RULE_VARIANTS id → [house edge with the chart, with perfect play]. */
  variants: Record<string, [number, number]>;
}

const data = grid as unknown as RuleGrid;

export interface GridResult {
  houseEdge: number;
  houseEdgeOptimal: number;
  chart: StrategyChart;
}

/** The grid key, or null when a rule outside the five is not the default. */
export function gridKey(rules: Rules): string | null {
  const d = DEFAULT_RULES;
  const standard =
    rules.double === d.double &&
    rules.maxHands === d.maxHands &&
    rules.resplitAces === d.resplitAces &&
    rules.hitSplitAces === d.hitSplitAces &&
    rules.holeCard === d.holeCard &&
    !rules.originalBetsOnly;
  if (!standard) return null;
  return [rules.decks, rules.dealerHitsSoft17 ? 'h17' : 's17', rules.doubleAfterSplit ? 'das' : 'ndas', rules.surrender, rules.blackjackPays].join('|');
}

/** Precomputed basic strategy and house edges, when the rules are on the grid. */
export function gridResult(rules: Rules): GridResult | undefined {
  const key = gridKey(rules);
  const entry = key ? data.rules[key] : undefined;
  if (!entry) return undefined;
  return { houseEdge: entry[0], houseEdgeOptimal: entry[1], chart: decodeChart(entry[2]) };
}

/** Every grid rule set with its house edges, for tables. */
export function gridRuleSets(): { rules: Rules; houseEdge: number; houseEdgeOptimal: number }[] {
  return Object.entries(data.rules).map(([key, [houseEdge, houseEdgeOptimal]]) => {
    const [decks, soft17, das, surrender, pays] = key.split('|');
    const rules = makeRules({
      decks: Number(decks) as Rules['decks'],
      dealerHitsSoft17: soft17 === 'h17',
      doubleAfterSplit: das === 'das',
      surrender: surrender as Rules['surrender'],
      blackjackPays: pays as Rules['blackjackPays'],
    });
    return { rules, houseEdge, houseEdgeOptimal };
  });
}

/** House edges of RULE_VARIANTS, by id. */
export function ruleVariantEdges(): Record<string, { houseEdge: number; houseEdgeOptimal: number }> {
  return Object.fromEntries(
    Object.entries(data.variants).map(([id, [houseEdge, houseEdgeOptimal]]) => [id, { houseEdge, houseEdgeOptimal }]),
  );
}

// Charts as one character per cell: rows hard 4..21, soft 12..21, pairs 1..10, ten columns each.
const CODES: Record<ChartAction, string> = { H: 'h', S: 's', Dh: 'D', Ds: 'd', P: 'p', Rh: 'R', Rs: 'r', Rp: 'q' };
const ACTIONS = Object.fromEntries(Object.entries(CODES).map(([action, code]) => [code, action])) as Record<string, ChartAction>;
const ROWS: [keyof StrategyChart, number][] = [
  ...Array.from({ length: 18 }, (_, i) => ['hard', 4 + i] as [keyof StrategyChart, number]),
  ...Array.from({ length: 10 }, (_, i) => ['soft', 12 + i] as [keyof StrategyChart, number]),
  ...Array.from({ length: 10 }, (_, i) => ['pairs', 1 + i] as [keyof StrategyChart, number]),
];

export function encodeChart(chart: StrategyChart): string {
  return ROWS.map(([table, row]) => chart[table][row].map((action) => CODES[action]).join('')).join('');
}

export function decodeChart(text: string): StrategyChart {
  const chart: StrategyChart = { hard: {}, soft: {}, pairs: {} };
  ROWS.forEach(([table, row], i) => {
    chart[table][row] = [...text.slice(i * 10, i * 10 + 10)].map((code) => ACTIONS[code]);
  });
  return chart;
}
