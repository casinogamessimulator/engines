import { DOUBLE_ZERO, pocketLabel, RED_NUMBERS, TRIPLE_ZERO, ZERO, type Pocket, type Wheel, type WheelId } from './wheels.ts';

export type InsideBetKind = 'straight' | 'split' | 'street' | 'trio' | 'corner' | 'top-line' | 'six-line';
export type EvenMoneyBetKind = 'red' | 'black' | 'odd' | 'even' | 'low' | 'high';
export type OutsideBetKind = 'dozen' | 'column' | EvenMoneyBetKind;
export type BetKind = InsideBetKind | OutsideBetKind;

export const EVEN_MONEY_KINDS: readonly EvenMoneyBetKind[] = ['red', 'black', 'odd', 'even', 'low', 'high'];

export interface Bet {
  /** Stable id, e.g. "split:0-00", "dozen:2", "red". */
  id: string;
  kind: BetKind;
  /** Covered pockets, ascending with the zeros first. */
  pockets: readonly Pocket[];
  /** Paid at `payout` to 1. */
  payout: number;
}

/**
 * Payout to 1 for a bet covering `count` numbers: the standard 36/n − 1 schedule
 * (35, 17, 11, 8, 6, 5, 2, 1), which is what makes every bet carry the same edge
 * except the 5-number top line, which pays 6 to 1 instead of 6.2.
 */
export function payoutFor(count: number): number {
  return Math.floor(36 / count) - 1;
}

export function isEvenMoney(kind: BetKind): kind is EvenMoneyBetKind {
  return (EVEN_MONEY_KINDS as readonly string[]).includes(kind);
}

const sortPockets = (pockets: readonly Pocket[]): Pocket[] =>
  [...pockets].sort((a, b) => (a === ZERO || a > 36 ? -100 + a : a) - (b === ZERO || b > 36 ? -100 + b : b));

function makeBet(kind: BetKind, pockets: readonly Pocket[], name?: string): Bet {
  const sorted = sortPockets(pockets);
  return {
    id: name ? `${kind}:${name}` : isEvenMoney(kind) ? kind : `${kind}:${sorted.map(pocketLabel).join('-')}`,
    kind,
    pockets: sorted,
    payout: payoutFor(sorted.length),
  };
}

const range = (from: number, to: number): number[] => Array.from({ length: to - from + 1 }, (_, i) => from + i);

/** The bets that involve the zeros, which depend on how each wheel's layout places them. */
const zeroBets: Record<WheelId, [InsideBetKind, Pocket[]][]> = {
  // 0 spans the head of all three columns.
  'single-zero': [
    ['split', [ZERO, 1]],
    ['split', [ZERO, 2]],
    ['split', [ZERO, 3]],
    ['trio', [ZERO, 1, 2]],
    ['trio', [ZERO, 2, 3]],
    ['top-line', [ZERO, 1, 2, 3]], // "first four" / "basket"
  ],
  // 0 heads 1 and half of 2, 00 heads the other half of 2 and 3.
  'double-zero': [
    ['split', [ZERO, DOUBLE_ZERO]],
    ['split', [ZERO, 1]],
    ['split', [ZERO, 2]],
    ['split', [DOUBLE_ZERO, 2]],
    ['split', [DOUBLE_ZERO, 3]],
    ['trio', [ZERO, 1, 2]],
    ['trio', [ZERO, DOUBLE_ZERO, 2]],
    ['trio', [DOUBLE_ZERO, 2, 3]],
    ['top-line', [ZERO, DOUBLE_ZERO, 1, 2, 3]], // the 5-number bet
  ],
  // 0, 00 and 000 head columns one, two and three.
  'triple-zero': [
    ['split', [ZERO, DOUBLE_ZERO]],
    ['split', [DOUBLE_ZERO, TRIPLE_ZERO]],
    ['split', [ZERO, 1]],
    ['split', [DOUBLE_ZERO, 2]],
    ['split', [TRIPLE_ZERO, 3]],
    ['trio', [ZERO, DOUBLE_ZERO, TRIPLE_ZERO]],
    ['corner', [ZERO, DOUBLE_ZERO, 1, 2]],
    ['corner', [DOUBLE_ZERO, TRIPLE_ZERO, 2, 3]],
    ['top-line', [ZERO, DOUBLE_ZERO, TRIPLE_ZERO, 1, 2, 3]],
  ],
};

const catalogs = new Map<WheelId, Bet[]>();

/** Every bet the wheel's layout accepts. */
export function listBets(wheel: Wheel): readonly Bet[] {
  const cached = catalogs.get(wheel.id);
  if (cached) return cached;
  const bets: Bet[] = [];
  for (const pocket of wheel.order.slice().sort((a, b) => a - b)) bets.push(makeBet('straight', [pocket]));
  // The grid: row r holds 3r+1..3r+3; column c (1..3) holds the numbers ≡ c (mod 3).
  for (let n = 1; n <= 36; n++) {
    if (n % 3 !== 0) bets.push(makeBet('split', [n, n + 1]));
    if (n <= 33) bets.push(makeBet('split', [n, n + 3]));
  }
  for (let row = 0; row < 12; row++) bets.push(makeBet('street', range(3 * row + 1, 3 * row + 3)));
  for (let n = 1; n <= 32; n++) if (n % 3 !== 0) bets.push(makeBet('corner', [n, n + 1, n + 3, n + 4]));
  for (let row = 0; row < 11; row++) bets.push(makeBet('six-line', range(3 * row + 1, 3 * row + 6)));
  for (const [kind, pockets] of zeroBets[wheel.id]) bets.push(makeBet(kind, pockets));
  for (let i = 1; i <= 3; i++) bets.push(makeBet('dozen', range(12 * i - 11, 12 * i), String(i)));
  for (let i = 1; i <= 3; i++) bets.push(makeBet('column', range(1, 36).filter((n) => n % 3 === i % 3), String(i)));
  const numbers = range(1, 36);
  bets.push(makeBet('red', numbers.filter((n) => RED_NUMBERS.has(n))));
  bets.push(makeBet('black', numbers.filter((n) => !RED_NUMBERS.has(n))));
  bets.push(makeBet('odd', numbers.filter((n) => n % 2 === 1)));
  bets.push(makeBet('even', numbers.filter((n) => n % 2 === 0)));
  bets.push(makeBet('low', range(1, 18)));
  bets.push(makeBet('high', range(19, 36)));
  catalogs.set(wheel.id, bets);
  return bets;
}

/**
 * Finds a bet on the wheel's layout.
 * - Inside bets: pass the covered pockets in any order, e.g. getBet(wheel, 'split', [0, 37]).
 * - Dozens and columns: pass 1, 2 or 3.
 * - Even-money bets: no argument.
 * Throws when the layout has no such bet.
 */
export function getBet(wheel: Wheel, kind: BetKind, which?: readonly Pocket[] | number): Bet {
  const bets = listBets(wheel);
  let found: Bet | undefined;
  if (isEvenMoney(kind)) found = bets.find((bet) => bet.kind === kind);
  else if (kind === 'dozen' || kind === 'column') found = bets.find((bet) => bet.id === `${kind}:${which}`);
  else if (Array.isArray(which)) {
    const key = sortPockets(which).join(',');
    found = bets.find((bet) => bet.kind === kind && bet.pockets.join(',') === key);
  }
  if (!found) throw new Error(`No ${kind} bet ${JSON.stringify(which ?? '')} on the ${wheel.name} layout`);
  return found;
}

export function getBetById(wheel: Wheel, id: string): Bet {
  const found = listBets(wheel).find((bet) => bet.id === id);
  if (!found) throw new Error(`No bet "${id}" on the ${wheel.name} layout`);
  return found;
}
