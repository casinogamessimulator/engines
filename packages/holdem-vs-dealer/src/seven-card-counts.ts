import { evaluateMasks, isRoyalFlush } from './evaluate.ts';

/*
 * How often each poker hand comes up in 7 random cards, counted over all C(52, 7) = 133,784,560 hands.
 * The trips side bet's return follows from these counts alone (see trips.ts).
 */

export interface SevenCardCounts {
  royalFlush: number;
  straightFlush: number; // excluding royals
  fourOfAKind: number;
  fullHouse: number;
  flush: number;
  straight: number;
  threeOfAKind: number;
  twoPair: number;
  pair: number;
  highCard: number;
}

export const SEVEN_CARD_HANDS = 133_784_560;

const CATEGORY_KEYS: (keyof SevenCardCounts)[] = [
  'highCard',
  'pair',
  'twoPair',
  'threeOfAKind',
  'straight',
  'flush',
  'fullHouse',
  'fourOfAKind',
  'straightFlush',
];

/** Counts every 7-card hand by category. Exhaustive: about 133 million evaluations (seconds). */
export function sevenCardCounts(): SevenCardCounts {
  const byCategory = new Float64Array(9);
  let royals = 0;
  const m = new Int32Array(4 * 8); // suit masks after adding each of the 7 cards
  const add = (level: number, card: number): void => {
    const from = (level - 1) * 4;
    const to = level * 4;
    m[to] = m[from];
    m[to + 1] = m[from + 1];
    m[to + 2] = m[from + 2];
    m[to + 3] = m[from + 3];
    m[to + (card & 3)] |= 1 << (card >> 2);
  };
  for (let a = 0; a < 46; a++) {
    add(1, a);
    for (let b = a + 1; b < 47; b++) {
      add(2, b);
      for (let c = b + 1; c < 48; c++) {
        add(3, c);
        for (let d = c + 1; d < 49; d++) {
          add(4, d);
          for (let e = d + 1; e < 50; e++) {
            add(5, e);
            for (let f = e + 1; f < 51; f++) {
              add(6, f);
              const s0 = m[24];
              const s1 = m[25];
              const s2 = m[26];
              const s3 = m[27];
              for (let g = f + 1; g < 52; g++) {
                const bit = 1 << (g >> 2);
                const suit = g & 3;
                const v = evaluateMasks(
                  suit === 0 ? s0 | bit : s0,
                  suit === 1 ? s1 | bit : s1,
                  suit === 2 ? s2 | bit : s2,
                  suit === 3 ? s3 | bit : s3,
                );
                byCategory[v >>> 26]++;
                if (isRoyalFlush(v)) royals++;
              }
            }
          }
        }
      }
    }
  }
  const counts = Object.fromEntries(CATEGORY_KEYS.map((key, category) => [key, byCategory[category]])) as unknown as SevenCardCounts;
  counts.straightFlush -= royals;
  counts.royalFlush = royals;
  return counts;
}
