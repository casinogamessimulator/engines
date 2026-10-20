import type { BetSpec } from './bets.ts';
import { ALL_ROLLS, type Dice } from './dice.ts';
import { analyzeBet, type BetAnalysis } from './edge.ts';
import { type CrapsRules, DEFAULT_RULES, type PointNumber } from './rules.ts';
import { roll, type TableState } from './table.ts';

export interface BetInput {
  spec: BetSpec;
  amount: number;
  odds?: number;
  /** For a line bet already on its point. */
  point?: PointNumber | null;
  /** True for a buy or lay whose upfront commission is already paid (a sunk cost from here on). */
  commissionPaid?: boolean;
}

export interface BetReport extends BetAnalysis {
  input: BetInput;
  /** `ev` spread over the bet's expected rolls: what it costs per roll to keep it up. */
  evPerRoll: number;
}

export interface BetsReport {
  bets: BetReport[];
  /** Sum of the bets' expected results until each is decided. */
  ev: number;
  /** Sum of the bets' EV per roll: expected chips per roll from keeping this set of bets up. */
  evPerRoll: number;
}

/** For a set of bets: each one's chance of winning before losing, its EV, and the EV per roll of the set. */
export function analyzeBets(bets: readonly BetInput[], rules: CrapsRules = DEFAULT_RULES): BetsReport {
  const reports = bets.map((input): BetReport => {
    const analysis = analyzeBet(
      { spec: input.spec, amount: input.amount, odds: input.odds ?? 0, point: input.point ?? null },
      rules,
      { includeUpfrontCommission: !input.commissionPaid },
    );
    return { input, ...analysis, evPerRoll: analysis.ev / analysis.expectedRolls };
  });
  return {
    bets: reports,
    ev: reports.reduce((sum, r) => sum + r.ev, 0),
    evPerRoll: reports.reduce((sum, r) => sum + r.evPerRoll, 0),
  };
}

/** `analyzeBets` for the bets on a table, as they stand (points, odds, commission already paid). */
export function analyzeTable(table: TableState): BetsReport {
  return analyzeBets(
    table.bets.map((bet) => ({
      spec: bet.spec,
      amount: bet.amount,
      odds: bet.odds,
      point: bet.point,
      commissionPaid: bet.commissionPaid > 0,
    })),
    table.rules,
  );
}

export interface RollOutcome {
  /** Low die first; covers both orders of a non-pair. */
  dice: Dice;
  probability: number;
  /** Net chips the next roll settles, with the table's working rules applied. */
  net: number;
}

/** What the next roll does to the bets on the table, for each of the 21 distinct rolls. */
export function nextRollOutcomes(table: TableState): RollOutcome[] {
  return ALL_ROLLS.filter(([a, b]) => a <= b).map((dice) => ({
    dice,
    probability: (dice[0] === dice[1] ? 1 : 2) / 36,
    net: roll(table, dice).result.net,
  }));
}

/** Expected chips settled by the next roll alone (bets not yet decided count as nothing). */
export function nextRollEv(table: TableState): number {
  return nextRollOutcomes(table).reduce((sum, o) => sum + o.probability * o.net, 0);
}
