import {
  DealerCache,
  fullShoe,
  PAIR_DOUBLE,
  PAIR_SPLIT,
  PAIR_STAND,
  PAIR_SURRENDER,
  UpCardAnalysis,
  type UpStrategy,
} from './analysis.ts';
import { cardValue } from './cards.ts';
import { type Action, type Game, legalActions } from './game.ts';
import { doubleAllowedOn, type Rules, validateRules } from './rules.ts';

/**
 * A chart cell, as on printed charts: H hit, S stand, Dh double (else hit), Ds double (else stand), P split,
 * Rh / Rs / Rp surrender (else hit / stand / split). The "else" is what to do when the first option isn't available,
 * e.g. after drawing a third card.
 */
export type ChartAction = 'H' | 'S' | 'Dh' | 'Ds' | 'P' | 'Rh' | 'Rs' | 'Rp';

/** Dealer up card values for the chart columns, left to right: 2..9, ten, ace. */
export const UP_CARDS: readonly number[] = [2, 3, 4, 5, 6, 7, 8, 9, 10, 1];

/** Rows keyed by player total (hard 4..21, soft 12..21) or pair card value (1 = aces ... 10 = tens). */
export interface StrategyChart {
  hard: Record<number, ChartAction[]>;
  soft: Record<number, ChartAction[]>;
  pairs: Record<number, ChartAction[]>;
}

export interface RulesAnalysis {
  /** House edge with the total-dependent chart, as a fraction of the initial bet (0.005 = 0.5%). */
  houseEdge: number;
  /** House edge with composition-dependent perfect play, the same figure combinatorial analyzers publish. */
  houseEdgeOptimal: number;
  chart: StrategyChart;
  /** Player EV per up card with the chart, keyed by up card value. */
  evByUpCard: Record<number, number>;
}

export interface AnalyzeOptions {
  /** Reuse dealer probabilities between rule sets with the same decks and soft 17 rule. */
  dealerCache?: DealerCache;
}

/**
 * Basic strategy and house edge for a rule set, every hand played out against the exact shoe composition with
 * the dealer's exact outcome probabilities (see analysis.ts for the split approximation). Assumes a full shoe each
 * round, like a continuous shuffler. About a second for a shoe game.
 */
export function analyzeRules(rules: Rules, options: AnalyzeOptions = {}): RulesAnalysis {
  validateRules(rules);
  const cache =
    options.dealerCache && options.dealerCache.decks === rules.decks && options.dealerCache.hitsSoft17 === rules.dealerHitsSoft17
      ? options.dealerCache
      : new DealerCache(rules.decks, rules.dealerHitsSoft17);
  const shoe = fullShoe(rules.decks);
  const cards = 52 * rules.decks;
  let ev = 0;
  let optimal = 0;
  const strategies: UpStrategy[] = [];
  const evByUpCard: Record<number, number> = {};
  for (let up = 0; up < 10; up++) {
    const base = shoe.slice();
    base[up]--;
    const analysis = new UpCardAnalysis(rules, up, base, cache);
    const upChance = shoe[up] / cards;
    optimal += upChance * analysis.optimalEv();
    strategies[up] = analysis.solveStrategy();
    const upEv = analysis.strategyEv();
    evByUpCard[up + 1] = upEv;
    ev += upChance * upEv;
  }
  return { houseEdge: -ev, houseEdgeOptimal: -optimal, chart: buildChart(rules, strategies), evByUpCard };
}

function buildChart(rules: Rules, strategies: UpStrategy[]): StrategyChart {
  const chart: StrategyChart = { hard: {}, soft: {}, pairs: {} };
  const surrenders = rules.surrender !== 'none';
  const cell = (strategy: UpStrategy, total: number, soft: number, allowSurrender: boolean): ChartAction => {
    const hits = strategy.hit[soft][total] === 1;
    if (allowSurrender && surrenders && strategy.surrender[soft][total]) return hits ? 'Rh' : 'Rs';
    if (doubleAllowedOn(rules, total, soft === 1) && strategy.double[soft][total]) return hits ? 'Dh' : 'Ds';
    return hits ? 'H' : 'S';
  };
  const columns = (row: (strategy: UpStrategy) => ChartAction): ChartAction[] =>
    UP_CARDS.map((value) => row(strategies[value - 1]));
  for (let total = 4; total <= 21; total++) chart.hard[total] = columns((s) => cell(s, total, 0, true));
  for (let total = 12; total <= 21; total++) chart.soft[total] = columns((s) => cell(s, total, 1, true));
  for (let value = 1; value <= 10; value++) {
    const r = value - 1;
    chart.pairs[value] = columns((s) => {
      switch (s.pair[r]) {
        case PAIR_SPLIT:
          return 'P';
        case PAIR_SURRENDER:
          return s.pairFallback[r] === PAIR_SPLIT ? 'Rp' : s.pairFallback[r] === PAIR_STAND ? 'Rs' : 'Rh';
        case PAIR_DOUBLE:
          return s.pairHitBeatsStand[r] ? 'Dh' : 'Ds';
        case PAIR_STAND:
          return 'S';
        default:
          return 'H';
      }
    });
  }
  return chart;
}

/** Chart cell for a hand: the pair row when it can split, otherwise its total. */
export function chartCell(chart: StrategyChart, values: readonly number[], up: number, canSplit: boolean): ChartAction {
  const column = UP_CARDS.indexOf(up);
  if (column < 0) throw new Error(`Invalid up card value ${up}`);
  if (canSplit && values.length === 2 && values[0] === values[1]) return chart.pairs[values[0]][column];
  let hard = 0;
  let ace = false;
  for (const value of values) {
    hard += value;
    if (value === 1) ace = true;
  }
  if (ace && hard <= 11) return chart.soft[hard + 10][column];
  if (hard < 4) return 'H';
  return hard > 21 ? 'S' : chart.hard[hard][column];
}

/** What the chart says to do in a game's current decision, falling back as the cell says when an option isn't legal. */
export function basicStrategyAction(chart: StrategyChart, game: Game): Action {
  const legal = legalActions(game);
  if (legal.length === 0) throw new Error('No decision to make');
  if (legal.includes('noInsurance')) return 'noInsurance';
  const round = game.round!;
  const values = round.hands[round.active].cards.map(cardValue);
  const up = cardValue(round.dealer[0]);
  const canSplit = legal.includes('split');
  const allowed = (action: Action): Action | null => (legal.includes(action) ? action : null);
  const hitOrStand = (hit: boolean): Action => (hit ? (allowed('hit') ?? 'stand') : 'stand');
  const cell = chartCell(chart, values, up, canSplit);
  switch (cell) {
    case 'H':
      return hitOrStand(true);
    case 'S':
      return 'stand';
    case 'Dh':
    case 'Ds':
      return allowed('double') ?? hitOrStand(cell === 'Dh');
    case 'P':
      return 'split';
    case 'Rh':
    case 'Rs':
      return allowed('surrender') ?? hitOrStand(cell === 'Rh');
    case 'Rp': {
      const fallback = allowed('surrender') ?? allowed('split');
      if (fallback) return fallback;
      const asTotal = chartCell(chart, values, up, false);
      if (asTotal === 'Dh' || asTotal === 'Ds') return allowed('double') ?? hitOrStand(asTotal === 'Dh');
      return hitOrStand(asTotal === 'H' || asTotal === 'Rh');
    }
  }
}
