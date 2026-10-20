import { allBetSpecs, type BetSpec, type BetState, betKey, isLineBet, isRightSide, resolutionNet, resolveBet, upfrontCommission } from './bets.ts';
import { ALL_ROLLS } from './dice.ts';
import { type CrapsRules, DEFAULT_RULES, maxOdds, ODDS_LIMITS, type OddsLimit, type PointNumber } from './rules.ts';

export interface BetAnalysis {
  /** Probability the bet wins before it loses (the flat part, for a line bet). */
  pWin: number;
  pLose: number;
  pPush: number;
  /** Expected net result in chips until the bet is decided: odds, commission and all. */
  ev: number;
  /** Expected chips put at risk: the bet, upfront commission, and odds added at the point. */
  wagered: number;
  /** Expected number of rolls until the bet is decided, counting only rolls it's working. */
  expectedRolls: number;
}

export interface AnalyzeOptions {
  /** Odds to put behind a line bet when it gets a point. */
  oddsAtPoint?: (point: PointNumber) => number;
  /** Count upfront commission as a cost (true for a new bet; false for one whose commission is already paid). */
  includeUpfrontCommission?: boolean;
}

const P_ROLL = 1 / 36;

/**
 * Exact analysis of a bet from its current state, assuming it works every roll. Each bet is a small Markov chain
 * over the 36 rolls: a roll decides it, sends a line bet to a point, or leaves it where it was. Bets that are off
 * on some rolls have the same odds per decision; they only take more rolls.
 */
export function analyzeBet(bet: BetState, rules: CrapsRules = DEFAULT_RULES, options: AnalyzeOptions = {}): BetAnalysis {
  const result = solve(bet, rules, options.oddsAtPoint);
  const upfront = options.includeUpfrontCommission === false ? 0 : upfrontCommission(bet.spec, bet.amount, rules);
  return {
    pWin: result.pWin,
    pLose: result.pLose,
    pPush: result.pPush,
    ev: result.ev - upfront,
    wagered: bet.amount + bet.odds + upfront + result.oddsAdded,
    expectedRolls: result.rolls,
  };
}

interface Solved {
  pWin: number;
  pLose: number;
  pPush: number;
  ev: number;
  rolls: number;
  oddsAdded: number;
}

function solve(bet: BetState, rules: CrapsRules, oddsAtPoint: ((point: PointNumber) => number) | undefined): Solved {
  const sum: Solved = { pWin: 0, pLose: 0, pPush: 0, ev: 0, rolls: 1, oddsAdded: 0 };
  let pStay = 0;
  for (const dice of ALL_ROLLS) {
    const resolution = resolveBet(bet, dice, rules);
    if (resolution.action === null) {
      pStay += P_ROLL;
    } else if (resolution.action === 'travel') {
      const point = resolution.point!;
      const odds = oddsAtPoint ? oddsAtPoint(point) : 0;
      const next = solve({ ...bet, point, odds }, rules, undefined);
      sum.pWin += P_ROLL * next.pWin;
      sum.pLose += P_ROLL * next.pLose;
      sum.pPush += P_ROLL * next.pPush;
      sum.ev += P_ROLL * next.ev;
      sum.rolls += P_ROLL * next.rolls;
      sum.oddsAdded += P_ROLL * odds;
    } else {
      if (resolution.action === 'win') sum.pWin += P_ROLL;
      else if (resolution.action === 'lose') sum.pLose += P_ROLL;
      else sum.pPush += P_ROLL;
      sum.ev += P_ROLL * resolutionNet(bet, resolution);
    }
  }
  if (pStay >= 1 - 1e-12) throw new Error(`${betKey(bet.spec)} is never decided`);
  // Rolls that leave the bet where it was repeat the same chain: divide them out.
  const scale = 1 / (1 - pStay);
  return {
    pWin: sum.pWin * scale,
    pLose: sum.pLose * scale,
    pPush: sum.pPush * scale,
    ev: sum.ev * scale,
    rolls: sum.rolls * scale,
    oddsAdded: sum.oddsAdded * scale,
  };
}

export interface HouseEdge extends BetAnalysis {
  spec: BetSpec;
  key: string;
  /** Expected loss over expected chips wagered, per bet decided: the usual "house edge". */
  edge: number;
  /** Same, with pushes left out of the count (only differs for don't pass/come). */
  edgeExcludingTies: number;
  /** Edge spread over the rolls the bet takes to be decided. */
  edgePerRoll: number;
}

/**
 * Bet size used for edges. Under exact rounding any size gives the same edge; under 'floor' rounding 120 is the
 * smallest size every payout and commission divides evenly, so the edge matches the exact one.
 */
export const EDGE_UNIT = 120;

export interface HouseEdgeOptions {
  amount?: number;
  /** For line bets: take (or lay) the maximum odds the rules allow, or this limit, at the point. */
  odds?: boolean | OddsLimit;
}

/** Exact house edge of a fresh bet under `rules`. */
export function houseEdge(spec: BetSpec, rules: CrapsRules = DEFAULT_RULES, options: HouseEdgeOptions = {}): HouseEdge {
  const amount = options.amount ?? EDGE_UNIT;
  let oddsAtPoint: AnalyzeOptions['oddsAtPoint'];
  if (options.odds && isLineBet(spec)) {
    const limit = options.odds === true ? rules.oddsLimit : options.odds;
    oddsAtPoint = (point) => maxOdds(amount, point, limit, isRightSide(spec) ? 'right' : 'wrong');
  }
  const analysis = analyzeBet({ spec, amount, odds: 0, point: null }, rules, { oddsAtPoint });
  const edge = -analysis.ev / analysis.wagered;
  return {
    spec,
    key: betKey(spec),
    ...analysis,
    edge,
    edgeExcludingTies: edge / (1 - analysis.pPush),
    edgePerRoll: edge / analysis.expectedRolls,
  };
}

/** House edge of every bet on the layout. */
export function houseEdges(rules: CrapsRules = DEFAULT_RULES): HouseEdge[] {
  return allBetSpecs().map((spec) => houseEdge(spec, rules));
}

export interface OddsEdge {
  limit: OddsLimit;
  /** Combined edge of pass (or come) with full odds, per chip wagered including the odds. */
  pass: number;
  /** Combined edge of don't pass (or don't come) laying full odds. */
  dontPass: number;
}

/** Combined edge of the line bets with full odds, at every odds limit. */
export function lineOddsEdges(rules: CrapsRules = DEFAULT_RULES): OddsEdge[] {
  return ODDS_LIMITS.map((limit) => ({
    limit,
    pass: houseEdge({ type: 'pass' }, rules, { odds: limit }).edge,
    dontPass: houseEdge({ type: 'dontPass' }, rules, { odds: limit }).edge,
  }));
}
