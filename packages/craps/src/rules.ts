export type PointNumber = 4 | 5 | 6 | 8 | 9 | 10;
export const POINT_NUMBERS: readonly PointNumber[] = [4, 5, 6, 8, 9, 10];

export function isPointNumber(total: number): total is PointNumber {
  return (POINT_NUMBERS as readonly number[]).includes(total);
}

/** A payout as [to win, for every]: 7:6 is [7, 6]. */
export type Ratio = readonly [number, number];

/** True odds of a point number against the seven, which pass/come odds and buy bets pay. */
export const TRUE_ODDS: Readonly<Record<PointNumber, Ratio>> = { 4: [2, 1], 5: [3, 2], 6: [6, 5], 8: [6, 5], 9: [3, 2], 10: [2, 1] };
export const PLACE_PAYS: Readonly<Record<PointNumber, Ratio>> = { 4: [9, 5], 5: [7, 5], 6: [7, 6], 8: [7, 6], 9: [7, 5], 10: [9, 5] };
export const PLACE_TO_LOSE_PAYS: Readonly<Record<PointNumber, Ratio>> = {
  4: [5, 11],
  5: [5, 8],
  6: [4, 5],
  8: [4, 5],
  9: [5, 8],
  10: [5, 11],
};

/** Maximum free odds, as a multiple of the flat bet. 3-4-5x means 3x on 4/10, 4x on 5/9 and 5x on 6/8. */
export type OddsLimit = '1x' | '2x' | '3x' | '3-4-5x' | '5x' | '10x' | '20x' | '100x';
export const ODDS_LIMITS: readonly OddsLimit[] = ['1x', '2x', '3x', '3-4-5x', '5x', '10x', '20x', '100x'];

export type CommissionTiming = 'win' | 'upfront';
/**
 * 'exact' pays fractions of a chip (a $5 place 6 wins $5.83). 'floor' rounds winnings down to whole chips and
 * charges commission in whole chips with a 1-chip minimum, as casinos do; edges then depend on the bet size.
 */
export type Rounding = 'exact' | 'floor';

export interface CrapsRules {
  oddsLimit: OddsLimit;
  /** The come-out total that pushes don't pass and don't come instead of winning (almost always 12). */
  dontBar: 2 | 12;
  /** The field pays this many to one on a 2, and on a 12: 2 is double, 3 triple. */
  fieldTwo: number;
  fieldTwelve: number;
  /** Commission on buy and lay bets: 0.05 is 5%, of the bet for buys and of the win for lays. */
  commissionRate: number;
  buyCommission: CommissionTiming;
  layCommission: CommissionTiming;
  rounding: Rounding;
  /** Whether each kind of bet is working on a come-out roll, unless the player calls it on or off. */
  workingOnComeOut: {
    place: boolean;
    placeToLose: boolean;
    buy: boolean;
    lay: boolean;
    big: boolean;
    hardways: boolean;
    comeOdds: boolean;
    dontComeOdds: boolean;
  };
  /** One-roll proposition payouts, to one. */
  propPays: {
    any7: number;
    anyCraps: number;
    two: number;
    three: number;
    eleven: number;
    twelve: number;
    /** Hop on a non-pair, e.g. 1-2 or 2-5. */
    hopEasy: number;
    /** Hop on a pair, e.g. 3-3. */
    hopHard: number;
  };
}

export const DEFAULT_RULES: CrapsRules = {
  oddsLimit: '3-4-5x',
  dontBar: 12,
  fieldTwo: 2,
  fieldTwelve: 3,
  commissionRate: 0.05,
  buyCommission: 'win',
  layCommission: 'win',
  rounding: 'exact',
  workingOnComeOut: {
    place: false,
    placeToLose: true,
    buy: false,
    lay: true,
    big: true,
    hardways: false,
    comeOdds: false,
    dontComeOdds: true,
  },
  propPays: { any7: 4, anyCraps: 7, two: 30, three: 15, eleven: 15, twelve: 30, hopEasy: 15, hopHard: 30 },
};

export interface RulesOverrides extends Partial<Omit<CrapsRules, 'workingOnComeOut' | 'propPays'>> {
  workingOnComeOut?: Partial<CrapsRules['workingOnComeOut']>;
  propPays?: Partial<CrapsRules['propPays']>;
}

export function createRules(overrides: RulesOverrides = {}, base: CrapsRules = DEFAULT_RULES): CrapsRules {
  return {
    ...base,
    ...overrides,
    workingOnComeOut: { ...base.workingOnComeOut, ...overrides.workingOnComeOut },
    propPays: { ...base.propPays, ...overrides.propPays },
  };
}

/** Maximum odds behind a pass or come bet, as a multiple of the flat bet. */
export function oddsMultiple(limit: OddsLimit, point: PointNumber): number {
  if (limit === '3-4-5x') return point === 4 || point === 10 ? 3 : point === 5 || point === 9 ? 4 : 5;
  return Number(limit.slice(0, -1));
}

/**
 * Maximum odds behind a line bet. Right bettors (pass, come) may take `oddsMultiple` times the flat bet; wrong
 * bettors (don't pass, don't come) may lay enough to win that much, e.g. lay 6x on every point at 3-4-5x.
 */
export function maxOdds(flat: number, point: PointNumber, limit: OddsLimit, side: 'right' | 'wrong'): number {
  const win = flat * oddsMultiple(limit, point);
  if (side === 'right') return win;
  const [n, d] = TRUE_ODDS[point];
  return (win * n) / d;
}

const EPSILON = 1e-9;

/** Winnings of `amount` at `ratio`, rounded per the rules. */
export function payout(amount: number, ratio: Ratio, rules: CrapsRules): number {
  return roundWin((amount * ratio[0]) / ratio[1], rules);
}

export function roundWin(win: number, rules: CrapsRules): number {
  return rules.rounding === 'floor' ? Math.floor(win + EPSILON) : win;
}

/** Commission on `base` (the bet for a buy, the win for a lay). */
export function commission(base: number, rules: CrapsRules): number {
  const exact = base * rules.commissionRate;
  if (rules.rounding === 'exact' || exact === 0) return exact;
  return Math.max(1, Math.floor(exact + EPSILON));
}
