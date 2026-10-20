import type { Card } from './cards.ts';
import { classify } from './evaluate.ts';

export interface HoldOption {
  /** Bit i set means keep cards[i]. */
  hold: number;
  /** Expected payout of this hold, in the units of `pays` (e.g. coins returned for the bet made). */
  ev: number;
}

/** EVs within this distance of each other are the same play (floating-point noise). */
const EV_EPSILON = 1e-9;

/**
 * Expected payout of all 32 ways to hold the dealt hand, best first. Every possible draw is played out:
 * 2,598,960 hands across the 32 holds, a few hundred milliseconds in a browser worker.
 */
export function analyzeHand(cards: readonly Card[], pays: readonly number[]): HoldOption[] {
  if (cards.length !== 5 || new Set(cards).size !== 5) throw new Error('A hand has 5 different cards');
  const rest: Card[] = [];
  for (let card = 0; card < 52; card++) if (!cards.includes(card)) rest.push(card);

  const options: HoldOption[] = [];
  for (let hold = 0; hold < 32; hold++) {
    const held = cards.filter((_, i) => hold & (1 << i));
    const draws = binomial(rest.length, 5 - held.length);
    options.push({ hold, ev: sumOfDraws(held, rest, pays) / draws });
  }
  return options.sort((x, y) => y.ev - x.ev);
}

/** The holds that tie for the best EV (usually one). Expects `analyzeHand`'s output. */
export function bestHolds(options: readonly HoldOption[]): HoldOption[] {
  return options.filter((option) => option.ev >= options[0].ev - EV_EPSILON);
}

/** True when `hold` is as good as the best play. */
export function isOptimalHold(options: readonly HoldOption[], hold: number): boolean {
  const option = options.find((o) => o.hold === hold);
  if (!option) throw new Error(`Invalid hold ${hold}`);
  return option.ev >= options[0].ev - EV_EPSILON;
}

export function holdToIndexes(hold: number): number[] {
  return [0, 1, 2, 3, 4].filter((i) => hold & (1 << i));
}

export function indexesToHold(indexes: readonly number[]): number {
  return indexes.reduce((hold, i) => hold | (1 << i), 0);
}

export function binomial(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  let result = 1;
  for (let i = 1; i <= k; i++) result = (result * (n - k + i)) / i;
  return Math.round(result);
}

/** Sum of payouts over every way to complete `held` from `rest`. One loop nest per draw size, for speed. */
function sumOfDraws(held: readonly Card[], rest: readonly Card[], pays: readonly number[]): number {
  const m = rest.length;
  let total = 0;
  switch (5 - held.length) {
    case 0:
      return pays[classify(held[0], held[1], held[2], held[3], held[4])];
    case 1: {
      const [a, b, c, d] = held;
      for (let i = 0; i < m; i++) total += pays[classify(a, b, c, d, rest[i])];
      return total;
    }
    case 2: {
      const [a, b, c] = held;
      for (let i = 0; i < m; i++)
        for (let j = i + 1; j < m; j++) total += pays[classify(a, b, c, rest[i], rest[j])];
      return total;
    }
    case 3: {
      const [a, b] = held;
      for (let i = 0; i < m; i++)
        for (let j = i + 1; j < m; j++)
          for (let k = j + 1; k < m; k++) total += pays[classify(a, b, rest[i], rest[j], rest[k])];
      return total;
    }
    case 4: {
      const [a] = held;
      for (let i = 0; i < m; i++)
        for (let j = i + 1; j < m; j++)
          for (let k = j + 1; k < m; k++)
            for (let l = k + 1; l < m; l++) total += pays[classify(a, rest[i], rest[j], rest[k], rest[l])];
      return total;
    }
    default:
      for (let i = 0; i < m; i++)
        for (let j = i + 1; j < m; j++)
          for (let k = j + 1; k < m; k++)
            for (let l = k + 1; l < m; l++)
              for (let n = l + 1; n < m; n++) total += pays[classify(rest[i], rest[j], rest[k], rest[l], rest[n])];
      return total;
  }
}
