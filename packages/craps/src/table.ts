import {
  type BetSpec,
  type BetState,
  betKey,
  isContractBet,
  isLineBet,
  isRightSide,
  type Outcome,
  resolutionNet,
  resolveBet,
  specError,
  staysUpAfterWin,
  upfrontCommission,
  type Working,
} from './bets.ts';
import { type Dice, diceTotal, isDie } from './dice.ts';
import { type CrapsRules, createRules, isPointNumber, maxOdds, type PointNumber, type RulesOverrides } from './rules.ts';

/** 'auto' follows the table rules; 'on' and 'off' are the player calling the bet (or a line bet's odds) on or off. */
export type WorkingOverride = 'auto' | 'on' | 'off';

export interface TableBet extends BetState {
  readonly id: number;
  readonly working: WorkingOverride;
  /** Upfront commission paid on a buy or lay, refunded if the bet is taken down. */
  readonly commissionPaid: number;
}

export interface TableState {
  readonly rules: CrapsRules;
  /** The point, or null on a come-out roll. */
  readonly point: PointNumber | null;
  readonly bankroll: number;
  readonly bets: readonly TableBet[];
  readonly nextBetId: number;
  readonly rolls: number;
}

export type RollEvent = 'natural' | 'craps' | 'point-set' | 'point-made' | 'seven-out' | 'no-decision';

export interface Settlement {
  betId: number;
  spec: BetSpec;
  key: string;
  /** 'travel': a come or pass bet moved to its point. */
  action: Outcome | 'travel';
  point?: PointNumber;
  amount: number;
  odds: number;
  oddsAction: Outcome | null;
  /** Winnings of the bet and its odds, after commission taken on the win. */
  win: number;
  /** Commission charged on this roll (on a win, or upfront again for a buy or lay that stays up). */
  commission: number;
  /** Chips paid back to the bankroll: the winnings, plus whatever stake comes down. */
  returned: number;
  /** Result in chips: the winnings, or minus what was lost. 0 for a push or travel. */
  net: number;
  /** The bet is still on the layout after this roll. */
  staysUp: boolean;
}

export interface RollResult {
  dice: Dice;
  total: number;
  pointBefore: PointNumber | null;
  pointAfter: PointNumber | null;
  event: RollEvent;
  settlements: Settlement[];
  /** Sum of the settlements' net results (commission charged upfront again included). */
  net: number;
}

export type CrapsErrorCode =
  | 'invalid-bet'
  | 'invalid-amount'
  | 'insufficient-funds'
  | 'come-out-only'
  | 'point-required'
  | 'no-such-bet'
  | 'contract-bet'
  | 'not-line-bet'
  | 'odds-need-point'
  | 'odds-limit'
  | 'invalid-dice';

export class CrapsError extends Error {
  readonly code: CrapsErrorCode;
  constructor(code: CrapsErrorCode, message: string) {
    super(message);
    this.name = 'CrapsError';
    this.code = code;
  }
}

const EPSILON = 1e-9;

export function createTable(options: { rules?: RulesOverrides; bankroll?: number } = {}): TableState {
  return { rules: createRules(options.rules), point: null, bankroll: options.bankroll ?? 1000, bets: [], nextBetId: 1, rolls: 0 };
}

export function isComeOut(table: TableState): boolean {
  return table.point === null;
}

export function getBet(table: TableState, id: number): TableBet {
  const bet = table.bets.find((b) => b.id === id);
  if (!bet) throw new CrapsError('no-such-bet', `No bet ${id}`);
  return bet;
}

/** Whether a bet (and its odds) will act on the next roll. */
export function workingFor(table: TableState, bet: TableBet): Working {
  const comeOut = isComeOut(table);
  const called = (byRule: boolean) => (bet.working === 'on' ? true : bet.working === 'off' ? false : byRule);
  const rule = table.rules.workingOnComeOut;
  switch (bet.spec.type) {
    case 'pass':
    case 'dontPass':
      return { bet: true, odds: called(true) };
    case 'come':
      return { bet: true, odds: called(!comeOut || rule.comeOdds) };
    case 'dontCome':
      return { bet: true, odds: called(!comeOut || rule.dontComeOdds) };
    case 'place':
    case 'placeToLose':
    case 'buy':
    case 'lay':
    case 'big':
      return { bet: called(!comeOut || rule[bet.spec.type]), odds: true };
    case 'hardway':
      return { bet: called(!comeOut || rule.hardways), odds: true };
    default:
      return { bet: called(true), odds: true };
  }
}

/** The bet already on that spot, which a new bet adds to. Line bets merge only before they have a point. */
function sameSpot(table: TableState, spec: BetSpec): TableBet | undefined {
  const key = betKey(spec);
  return table.bets.find((b) => betKey(b.spec) === key && (!isLineBet(spec) || b.point === null));
}

/** Why `amount` can't go on `spec` right now, or null if it can. */
export function validateBet(table: TableState, spec: BetSpec, amount: number): CrapsError | null {
  const problem = specError(spec);
  if (problem) return new CrapsError('invalid-bet', problem);
  if (!Number.isFinite(amount) || amount <= 0) return new CrapsError('invalid-amount', `Invalid amount ${amount}`);
  if ((spec.type === 'pass' || spec.type === 'dontPass') && !isComeOut(table)) {
    return new CrapsError('come-out-only', `${spec.type} bets go down before the come-out roll`);
  }
  if ((spec.type === 'come' || spec.type === 'dontCome') && isComeOut(table)) {
    return new CrapsError('point-required', `${spec.type} bets need a point`);
  }
  if (betCost(table, spec, amount) > table.bankroll + EPSILON) return new CrapsError('insufficient-funds', 'Not enough chips');
  return null;
}

/** Chips `amount` more on `spec` takes from the bankroll, upfront commission included. */
export function betCost(table: TableState, spec: BetSpec, amount: number): number {
  const existing = sameSpot(table, spec);
  const total = (existing?.amount ?? 0) + amount;
  return amount + upfrontCommission(spec, total, table.rules) - (existing?.commissionPaid ?? 0);
}

/** Put `amount` on a spot, adding to any bet already there. */
export function placeBet(table: TableState, spec: BetSpec, amount: number): TableState {
  const error = validateBet(table, spec, amount);
  if (error) throw error;
  const cost = betCost(table, spec, amount);
  const existing = sameSpot(table, spec);
  if (existing) {
    const updated: TableBet = { ...existing, amount: existing.amount + amount, commissionPaid: existing.commissionPaid + cost - amount };
    return { ...table, bankroll: table.bankroll - cost, bets: table.bets.map((b) => (b === existing ? updated : b)) };
  }
  const stored = spec.type === 'hop' ? { ...spec, dice: [...spec.dice].sort((a, b) => a - b) as [number, number] } : spec;
  const bet: TableBet = { id: table.nextBetId, spec: stored, amount, odds: 0, point: null, working: 'auto', commissionPaid: cost - amount };
  return { ...table, bankroll: table.bankroll - cost, bets: [...table.bets, bet], nextBetId: table.nextBetId + 1 };
}

/** Take a bet down (with its odds and any upfront commission). Pass and come bets can't come down once they have a point. */
export function removeBet(table: TableState, id: number): TableState {
  const bet = getBet(table, id);
  if (isContractBet(bet)) throw new CrapsError('contract-bet', `A ${bet.spec.type} bet with a point is a contract bet`);
  return {
    ...table,
    bankroll: table.bankroll + bet.amount + bet.odds + bet.commissionPaid,
    bets: table.bets.filter((b) => b !== bet),
  };
}

/** Most odds the line bet `id` can have under the table's odds limit. */
export function maxOddsFor(table: TableState, id: number): number {
  const bet = getBet(table, id);
  if (!isLineBet(bet.spec)) throw new CrapsError('not-line-bet', 'Only line bets take odds');
  if (bet.point === null) return 0;
  return maxOdds(bet.amount, bet.point, table.rules.oddsLimit, isRightSide(bet.spec) ? 'right' : 'wrong');
}

/** Set the odds behind a line bet with a point (0 takes them down). Odds can change at any time. */
export function setOdds(table: TableState, id: number, odds: number): TableState {
  const bet = getBet(table, id);
  if (!isLineBet(bet.spec)) throw new CrapsError('not-line-bet', 'Only line bets take odds');
  if (bet.point === null) throw new CrapsError('odds-need-point', 'Odds go behind a bet with a point');
  if (!Number.isFinite(odds) || odds < 0) throw new CrapsError('invalid-amount', `Invalid odds ${odds}`);
  if (odds > maxOddsFor(table, id) + EPSILON) throw new CrapsError('odds-limit', `Odds above the ${table.rules.oddsLimit} limit`);
  const cost = odds - bet.odds;
  if (cost > table.bankroll + EPSILON) throw new CrapsError('insufficient-funds', 'Not enough chips');
  return { ...table, bankroll: table.bankroll - cost, bets: table.bets.map((b) => (b === bet ? { ...b, odds } : b)) };
}

/** Call a bet on or off (for line bets: their odds), or back to the table's default. */
export function setWorking(table: TableState, id: number, working: WorkingOverride): TableState {
  const bet = getBet(table, id);
  return { ...table, bets: table.bets.map((b) => (b === bet ? { ...b, working } : b)) };
}

/** Throw the dice: decide every bet, pay the bankroll, then move the puck. */
export function roll(table: TableState, dice: Dice): { table: TableState; result: RollResult } {
  if (dice.length !== 2 || !dice.every(isDie)) throw new CrapsError('invalid-dice', `Invalid dice ${dice.join('-')}`);
  const total = diceTotal(dice);
  const pointBefore = table.point;
  const settlements: Settlement[] = [];
  const bets: TableBet[] = [];
  let bankroll = table.bankroll;

  for (const bet of table.bets) {
    const resolution = resolveBet(bet, dice, table.rules, workingFor(table, bet));
    if (resolution.action === null) {
      bets.push(bet);
      continue;
    }
    const base = {
      betId: bet.id,
      spec: bet.spec,
      key: betKey(bet.spec),
      amount: bet.amount,
      odds: bet.odds,
      oddsAction: resolution.odds?.action ?? null,
    };
    if (resolution.action === 'travel') {
      const point = resolution.point!;
      bets.push({ ...bet, point });
      settlements.push({ ...base, action: 'travel', point, win: 0, commission: 0, returned: 0, net: 0, staysUp: true });
      continue;
    }

    const oddsWin = resolution.odds?.action === 'win' ? resolution.odds.win : 0;
    const oddsBack = resolution.odds && resolution.odds.action !== 'lose' ? bet.odds : 0;
    const staysUp = resolution.action === 'win' && staysUpAfterWin(bet.spec);
    let returned: number;
    let charged = resolution.commission;
    let net = resolutionNet(bet, resolution);
    if (staysUp) {
      // Upfront commission is due again for the bet's next decision; it comes out of the win.
      const again = bet.commissionPaid > 0 ? upfrontCommission(bet.spec, bet.amount, table.rules) : 0;
      charged += again;
      net -= again;
      returned = resolution.win - again;
      bets.push(bet);
    } else {
      const stakeBack = resolution.action === 'lose' ? 0 : bet.amount;
      returned = stakeBack + (resolution.action === 'win' ? resolution.win : 0) + oddsBack + oddsWin;
    }
    bankroll += returned;
    settlements.push({
      ...base,
      action: resolution.action,
      win: (resolution.action === 'win' ? resolution.win : 0) + oddsWin,
      commission: charged,
      returned,
      net,
      staysUp,
    });
  }

  let pointAfter: PointNumber | null;
  let event: RollEvent;
  if (pointBefore === null) {
    pointAfter = isPointNumber(total) ? total : null;
    event = pointAfter !== null ? 'point-set' : total === 7 || total === 11 ? 'natural' : 'craps';
  } else if (total === pointBefore || total === 7) {
    pointAfter = null;
    event = total === 7 ? 'seven-out' : 'point-made';
  } else {
    pointAfter = pointBefore;
    event = 'no-decision';
  }

  return {
    table: { ...table, point: pointAfter, bankroll, bets, rolls: table.rolls + 1 },
    result: {
      dice,
      total,
      pointBefore,
      pointAfter,
      event,
      settlements,
      net: settlements.reduce((sum, s) => sum + s.net, 0),
    },
  };
}

/** Chips on the layout: bets and odds. Upfront commission counts as spent, though taking the bet down refunds it. */
export function chipsOnTable(table: TableState): number {
  return table.bets.reduce((sum, bet) => sum + bet.amount + bet.odds, 0);
}
