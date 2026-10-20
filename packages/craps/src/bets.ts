import { type Dice, diceTotal, isDie, isDoubles } from './dice.ts';
import {
  commission,
  type CrapsRules,
  isPointNumber,
  PLACE_PAYS,
  PLACE_TO_LOSE_PAYS,
  payout,
  type PointNumber,
  POINT_NUMBERS,
  roundWin,
  TRUE_ODDS,
} from './rules.ts';

export type HardwayNumber = 4 | 6 | 8 | 10;
export type PropTotal = 2 | 3 | 11 | 12;

export type BetSpec =
  | { type: 'pass' }
  | { type: 'dontPass' }
  | { type: 'come' }
  | { type: 'dontCome' }
  | { type: 'place'; number: PointNumber }
  | { type: 'placeToLose'; number: PointNumber }
  | { type: 'buy'; number: PointNumber }
  | { type: 'lay'; number: PointNumber }
  | { type: 'big'; number: 6 | 8 }
  | { type: 'field' }
  | { type: 'hardway'; number: HardwayNumber }
  | { type: 'any7' }
  | { type: 'anyCraps' }
  /** A single total: 2 (aces), 3 (ace-deuce), 11 (yo) or 12 (boxcars). */
  | { type: 'prop'; total: PropTotal }
  /** 2, 3, 11 and 12 at once, a quarter of the bet on each. */
  | { type: 'horn' }
  /** Craps and eleven: half on any craps, half on 11. */
  | { type: 'cAndE' }
  /** One exact roll, e.g. [2, 5] wins on 2-5 or 5-2. */
  | { type: 'hop'; dice: readonly [number, number] };

export type BetType = BetSpec['type'];

/** A bet as resolution sees it. `point` is where a line bet sits: null before its come-out. */
export interface BetState {
  readonly spec: BetSpec;
  readonly amount: number;
  /** Free odds behind a line bet (taken or laid), 0 if none. */
  readonly odds: number;
  readonly point: PointNumber | null;
}

export type Outcome = 'win' | 'lose' | 'push';

export interface Resolution {
  /** What happened to the bet (the flat part, for a line bet). null: no decision this roll. */
  action: Outcome | 'travel' | null;
  /** Where a line bet traveled to. */
  point?: PointNumber;
  /** Winnings of the bet itself, after any commission taken on the win. */
  win: number;
  /** Commission taken from this win (commission on the win only; upfront commission is paid when betting). */
  commission: number;
  /** What happened to the odds, when the bet has odds and the flat part was decided. */
  odds: { action: Outcome; win: number } | null;
}

export interface Working {
  /** False for a bet that is off: it takes no action this roll. */
  bet: boolean;
  /** For line bets: false when the odds are off, so they come back as a push if the flat bet is decided. */
  odds: boolean;
}

export const ALWAYS_WORKING: Working = { bet: true, odds: true };

const NO_ACTION: Resolution = { action: null, win: 0, commission: 0, odds: null };

export type LineBetSpec = Extract<BetSpec, { type: 'pass' | 'dontPass' | 'come' | 'dontCome' }>;

export function isLineBet(spec: BetSpec): spec is LineBetSpec {
  return spec.type === 'pass' || spec.type === 'dontPass' || spec.type === 'come' || spec.type === 'dontCome';
}

/** Right side (pass, come) as opposed to wrong side (don't pass, don't come). */
export function isRightSide(spec: BetSpec): boolean {
  return spec.type === 'pass' || spec.type === 'come';
}

/** Decided on the very next roll. */
export function isOneRoll(spec: BetSpec): boolean {
  return ['field', 'any7', 'anyCraps', 'prop', 'horn', 'cAndE', 'hop'].includes(spec.type);
}

/** Bets that stay up after they win: only the winnings are paid. Every other bet comes down when decided. */
export function staysUpAfterWin(spec: BetSpec): boolean {
  return ['place', 'placeToLose', 'buy', 'lay', 'big', 'hardway'].includes(spec.type);
}

/** Pass and come bets with a point: the player can't take them down (they'd give up their advantage). */
export function isContractBet(bet: BetState): boolean {
  return isRightSide(bet.spec) && bet.point !== null;
}

/** Stable id of a bet spot, e.g. "pass", "place-6", "hop-2-5". */
export function betKey(spec: BetSpec): string {
  switch (spec.type) {
    case 'place':
    case 'placeToLose':
    case 'buy':
    case 'lay':
    case 'big':
    case 'hardway':
      return `${spec.type}-${spec.number}`;
    case 'prop':
      return `prop-${spec.total}`;
    case 'hop': {
      const [a, b] = sortedHop(spec.dice);
      return `hop-${a}-${b}`;
    }
    default:
      return spec.type;
  }
}

/** Null if the spec names a real bet, else why not. */
export function specError(spec: BetSpec): string | null {
  switch (spec.type) {
    case 'place':
    case 'placeToLose':
    case 'buy':
    case 'lay':
      return isPointNumber(spec.number) ? null : `No ${spec.type} bet on ${spec.number}`;
    case 'big':
      return spec.number === 6 || spec.number === 8 ? null : `No big ${spec.number}`;
    case 'hardway':
      return [4, 6, 8, 10].includes(spec.number) ? null : `No hard ${spec.number}`;
    case 'prop':
      return [2, 3, 11, 12].includes(spec.total) ? null : `No single-roll bet on ${spec.total}`;
    case 'hop':
      return spec.dice.length === 2 && spec.dice.every(isDie) ? null : `No hop on ${spec.dice.join('-')}`;
    case 'pass':
    case 'dontPass':
    case 'come':
    case 'dontCome':
    case 'field':
    case 'any7':
    case 'anyCraps':
    case 'horn':
    case 'cAndE':
      return null;
    default:
      return `Unknown bet ${(spec as { type: string }).type}`;
  }
}

/** One of every bet on the layout: 4 line bets, 6 each of place/place-to-lose/buy/lay, and 21 hops. */
export function allBetSpecs(): BetSpec[] {
  const specs: BetSpec[] = [{ type: 'pass' }, { type: 'dontPass' }, { type: 'come' }, { type: 'dontCome' }];
  for (const type of ['place', 'placeToLose', 'buy', 'lay'] as const) {
    for (const number of POINT_NUMBERS) specs.push({ type, number });
  }
  specs.push({ type: 'big', number: 6 }, { type: 'big', number: 8 }, { type: 'field' });
  for (const number of [4, 6, 8, 10] as const) specs.push({ type: 'hardway', number });
  specs.push({ type: 'any7' }, { type: 'anyCraps' });
  for (const total of [2, 3, 11, 12] as const) specs.push({ type: 'prop', total });
  specs.push({ type: 'horn' }, { type: 'cAndE' });
  for (let a = 1; a <= 6; a++) for (let b = a; b <= 6; b++) specs.push({ type: 'hop', dice: [a, b] });
  return specs;
}

/** Commission a buy or lay pays when it's made, under upfront commission (0 otherwise). */
export function upfrontCommission(spec: BetSpec, amount: number, rules: CrapsRules): number {
  if (spec.type === 'buy' && rules.buyCommission === 'upfront') return commission(amount, rules);
  if (spec.type === 'lay' && rules.layCommission === 'upfront') return commission(layWin(amount, spec.number), rules);
  return 0;
}

/** What a lay bet would win before commission. */
function layWin(amount: number, number: PointNumber): number {
  const [n, d] = TRUE_ODDS[number];
  return (amount * d) / n;
}

/** Decide one bet on one roll. Pure: the table and the house-edge solver both go through here. */
export function resolveBet(bet: BetState, dice: Dice, rules: CrapsRules, working: Working = ALWAYS_WORKING): Resolution {
  if (!working.bet) return NO_ACTION;
  const total = diceTotal(dice);
  const { spec, amount } = bet;
  const win = (value: number, taken = 0): Resolution => ({ action: 'win', win: value, commission: taken, odds: null });
  const lose: Resolution = { action: 'lose', win: 0, commission: 0, odds: null };

  switch (spec.type) {
    case 'pass':
    case 'dontPass':
    case 'come':
    case 'dontCome':
      return resolveLineBet(bet, total, rules, working);

    case 'place':
      if (total === spec.number) return win(payout(amount, PLACE_PAYS[spec.number], rules));
      return total === 7 ? lose : NO_ACTION;

    case 'placeToLose':
      if (total === 7) return win(payout(amount, PLACE_TO_LOSE_PAYS[spec.number], rules));
      return total === spec.number ? lose : NO_ACTION;

    case 'buy': {
      if (total === 7) return lose;
      if (total !== spec.number) return NO_ACTION;
      const gross = payout(amount, TRUE_ODDS[spec.number], rules);
      const taken = rules.buyCommission === 'win' ? commission(amount, rules) : 0;
      return win(gross - taken, taken);
    }

    case 'lay': {
      if (total === spec.number) return lose;
      if (total !== 7) return NO_ACTION;
      const [n, d] = TRUE_ODDS[spec.number];
      const gross = payout(amount, [d, n], rules);
      const taken = rules.layCommission === 'win' ? commission(layWin(amount, spec.number), rules) : 0;
      return win(gross - taken, taken);
    }

    case 'big':
      if (total === spec.number) return win(amount);
      return total === 7 ? lose : NO_ACTION;

    case 'hardway':
      if (total === spec.number) {
        return isDoubles(dice) ? win(payout(amount, spec.number === 4 || spec.number === 10 ? [7, 1] : [9, 1], rules)) : lose;
      }
      return total === 7 ? lose : NO_ACTION;

    case 'field':
      if (total === 2) return win(payout(amount, [rules.fieldTwo, 1], rules));
      if (total === 12) return win(payout(amount, [rules.fieldTwelve, 1], rules));
      return [3, 4, 9, 10, 11].includes(total) ? win(amount) : lose;

    case 'any7':
      return total === 7 ? win(payout(amount, [rules.propPays.any7, 1], rules)) : lose;

    case 'anyCraps':
      return total === 2 || total === 3 || total === 12 ? win(payout(amount, [rules.propPays.anyCraps, 1], rules)) : lose;

    case 'prop':
      return total === spec.total ? win(payout(amount, [propPay(total, rules), 1], rules)) : lose;

    case 'horn': {
      if (![2, 3, 11, 12].includes(total)) return lose;
      const unit = amount / 4;
      return win(roundWin(unit * propPay(total, rules), rules) - 3 * unit);
    }

    case 'cAndE': {
      const half = amount / 2;
      if (total === 11) return win(roundWin(half * rules.propPays.eleven, rules) - half);
      if (total === 2 || total === 3 || total === 12) return win(roundWin(half * rules.propPays.anyCraps, rules) - half);
      return lose;
    }

    case 'hop': {
      const [a, b] = sortedHop(spec.dice);
      const [x, y] = dice[0] <= dice[1] ? dice : [dice[1], dice[0]];
      if (a !== x || b !== y) return lose;
      return win(payout(amount, [a === b ? rules.propPays.hopHard : rules.propPays.hopEasy, 1], rules));
    }
  }
}

function resolveLineBet(bet: BetState, total: number, rules: CrapsRules, working: Working): Resolution {
  const right = isRightSide(bet.spec);
  let action: Outcome | 'travel' | null;
  if (bet.point === null) {
    if (total === 7 || total === 11) action = right ? 'win' : 'lose';
    else if (total === 2 || total === 3 || total === 12) action = right ? 'lose' : total === rules.dontBar ? 'push' : 'win';
    else action = 'travel';
  } else if (total === bet.point) action = right ? 'win' : 'lose';
  else if (total === 7) action = right ? 'lose' : 'win';
  else action = null;

  if (action === null) return NO_ACTION;
  if (action === 'travel') return { action, point: total as PointNumber, win: 0, commission: 0, odds: null };

  let odds: Resolution['odds'] = null;
  if (bet.odds > 0 && bet.point !== null) {
    if (!working.odds || action === 'push') odds = { action: 'push', win: 0 };
    else if (action === 'lose') odds = { action: 'lose', win: 0 };
    else {
      const [n, d] = TRUE_ODDS[bet.point];
      odds = { action: 'win', win: payout(bet.odds, right ? [n, d] : [d, n], rules) };
    }
  }
  return { action, win: action === 'win' ? bet.amount : 0, commission: 0, odds };
}

function propPay(total: number, rules: CrapsRules): number {
  const pays = rules.propPays;
  return total === 2 ? pays.two : total === 3 ? pays.three : total === 11 ? pays.eleven : pays.twelve;
}

function sortedHop(dice: readonly [number, number]): [number, number] {
  return dice[0] <= dice[1] ? [dice[0], dice[1]] : [dice[1], dice[0]];
}

/** Net result of a decided bet in chips: winnings, or minus the stake (and odds) lost. */
export function resolutionNet(bet: BetState, resolution: Resolution): number {
  let net = resolution.action === 'win' ? resolution.win : resolution.action === 'lose' ? -bet.amount : 0;
  if (resolution.odds) net += resolution.odds.action === 'win' ? resolution.odds.win : resolution.odds.action === 'lose' ? -bet.odds : 0;
  return net;
}
