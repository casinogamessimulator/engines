import { isEvenMoney, type Bet } from './bets.ts';
import { isZero, type Pocket, type Wheel } from './wheels.ts';

/**
 * What happens to even-money bets (red/black, odd/even, low/high) when the ball lands on a zero:
 * - none: they lose, like every other bet.
 * - la-partage: half the stake is returned.
 * - en-prison: the bet is held for the next spin; a win frees it (stake back, no winnings), anything else loses it.
 * - en-prison-repeat: as en-prison, but another zero keeps the bet imprisoned for one more spin.
 * - en-prison-multi: every further zero sinks the bet one level deeper; it needs one win per level to come out.
 */
export type EvenMoneyRule = 'none' | 'la-partage' | 'en-prison' | 'en-prison-repeat' | 'en-prison-multi';

export const EVEN_MONEY_RULES: readonly EvenMoneyRule[] = [
  'none',
  'la-partage',
  'en-prison',
  'en-prison-repeat',
  'en-prison-multi',
];

export interface Rules {
  evenMoney: EvenMoneyRule;
}

export const STANDARD_RULES: Rules = { evenMoney: 'none' };

export const isEnPrison = (rule: EvenMoneyRule): boolean => rule.startsWith('en-prison');

export interface Wager {
  bet: Bet;
  amount: number;
  /** How many wins the bet still needs to leave prison; 0 or absent for a free bet. */
  prison?: number;
}

export type WagerOutcome = 'win' | 'lose' | 'half' | 'imprisoned' | 'released';

export interface WagerResult {
  wager: Wager;
  outcome: WagerOutcome;
  /** Paid back to the player, stake included (0 when lost or still imprisoned). */
  returned: number;
}

export interface Settlement {
  pocket: Pocket;
  results: WagerResult[];
  /** Total paid back to the player. */
  returned: number;
  /** Bets left on the layout in prison, to pass to the next settle(). */
  imprisoned: Wager[];
}

function settleOne(rules: Rules, wager: Wager, pocket: Pocket): WagerResult {
  const { bet, amount } = wager;
  const level = wager.prison ?? 0;
  const won = bet.pockets.includes(pocket);
  if (level > 0) {
    if (won) {
      if (level === 1) return { wager, outcome: 'released', returned: amount };
      return { wager: { ...wager, prison: level - 1 }, outcome: 'imprisoned', returned: 0 };
    }
    if (!isZero(pocket) || rules.evenMoney === 'en-prison') return { wager, outcome: 'lose', returned: 0 };
    const deeper = rules.evenMoney === 'en-prison-multi' ? level + 1 : level;
    return { wager: { ...wager, prison: deeper }, outcome: 'imprisoned', returned: 0 };
  }
  if (won) return { wager, outcome: 'win', returned: amount * (bet.payout + 1) };
  if (isZero(pocket) && isEvenMoney(bet.kind)) {
    if (rules.evenMoney === 'la-partage') return { wager, outcome: 'half', returned: amount / 2 };
    if (isEnPrison(rules.evenMoney)) return { wager: { ...wager, prison: 1 }, outcome: 'imprisoned', returned: 0 };
  }
  return { wager, outcome: 'lose', returned: 0 };
}

/**
 * Settles a whole layout against the winning pocket. Stakes are taken when bets are placed, so `returned`
 * is what goes back to the player; imprisoned bets come back in `imprisoned` for the next spin.
 */
export function settle(rules: Rules, wagers: readonly Wager[], pocket: Pocket): Settlement {
  const results = wagers.map((wager) => settleOne(rules, wager, pocket));
  return {
    pocket,
    results,
    returned: results.reduce((sum, result) => sum + result.returned, 0),
    imprisoned: results.filter((result) => result.outcome === 'imprisoned').map((result) => result.wager),
  };
}

/**
 * Expected value of one unit sitting in prison (one win away from release), as a fraction of the stake.
 * p = chance the bet wins a spin, z = chance of a zero.
 */
export function prisonValue(rule: EvenMoneyRule, p: number, z: number): number {
  switch (rule) {
    case 'en-prison':
      return p;
    case 'en-prison-repeat':
      // V = p + z·V
      return p / (1 - z);
    case 'en-prison-multi':
      // Needing k wins is worth r^k, where r = p + z·r²: the smaller root.
      return (1 - Math.sqrt(1 - 4 * p * z)) / (2 * z);
    default:
      throw new Error(`"${rule}" is not an en prison rule`);
  }
}

/** Expected return of a one-unit bet, stake included (1 would be a fair game). Exact up to float rounding. */
export function expectedReturn(wheel: Wheel, bet: Bet, rules: Rules = STANDARD_RULES): number {
  const n = wheel.order.length;
  const p = bet.pockets.length / n;
  const win = p * (bet.payout + 1);
  if (!isEvenMoney(bet.kind) || rules.evenMoney === 'none') return win;
  const z = wheel.zeros.length / n;
  if (rules.evenMoney === 'la-partage') return win + z / 2;
  return win + z * prisonValue(rules.evenMoney, p, z);
}

/** House edge as a fraction of the amount bet: 1 − expected return. */
export function houseEdge(wheel: Wheel, bet: Bet, rules: Rules = STANDARD_RULES): number {
  return 1 - expectedReturn(wheel, bet, rules);
}
