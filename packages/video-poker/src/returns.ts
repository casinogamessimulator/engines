import { binomial } from './analyze.ts';
import type { Card } from './cards.ts';
import { classify, HAND_CLASS_COUNT } from './evaluate.ts';

/*
 * Exact return of a paytable under perfect play, by counting instead of simulating.
 *
 * Pass 1 adds every final hand's payout to each of its 32 subsets, so `sums[S]` is the total payout of
 * all final hands that contain the cards in S. Pass 2 then gets, for any deal D and hold H, the total
 * payout of the draws that keep H and discard the rest of D by inclusion-exclusion over the discards:
 *   sum over T ⊆ D∖H of (−1)^|T| · sums[H ∪ T]
 * That's 243 lookups per deal instead of playing out ~2.6M draws.
 */

const HANDS = binomial(52, 5);

// Index of a k-card subset (sorted ascending) = OFFSET[k] + Σ C(card_i, i+1): the combinatorial
// number system, which numbers each subset size densely from 0.
const C: number[][] = Array.from({ length: 53 }, (_, n) => Array.from({ length: 6 }, (_, k) => binomial(n, k)));
const OFFSET = [0, 1, 53, 1379, 23479, 294204];
const SUBSET_COUNT = 294204 + HANDS;

// For each hold mask: the submasks of its complement (the discards) and their inclusion-exclusion signs.
const DISCARD_SUBSETS: { mask: number; sign: number }[][] = Array.from({ length: 32 }, (_, hold) => {
  const discards = ~hold & 31;
  const subsets: { mask: number; sign: number }[] = [];
  for (let t = discards; ; t = (t - 1) & discards) {
    subsets.push({ mask: t, sign: popcount(t) % 2 === 0 ? 1 : -1 });
    if (t === 0) break;
  }
  return subsets;
});
const DRAWS_FOR_HOLD = Array.from({ length: 32 }, (_, hold) => binomial(47, 5 - popcount(hold)));

function popcount(mask: number): number {
  let count = 0;
  for (; mask; mask &= mask - 1) count++;
  return count;
}

/** Indexes of all 32 subsets of a sorted 5-card hand, by mask over its positions. */
function subsetIndexes(hand: readonly Card[], out: Int32Array): void {
  for (let mask = 0; mask < 32; mask++) {
    let index = 0;
    let size = 0;
    for (let i = 0; i < 5; i++) {
      if (mask & (1 << i)) {
        size++;
        index += C[hand[i]][size];
      }
    }
    out[mask] = OFFSET[size] + index;
  }
}

export class ReturnTable {
  private readonly sums = new Float64Array(SUBSET_COUNT);
  private readonly indexes = new Int32Array(32);

  /** `pays`: total payout per HandClass for the bet size being analyzed. */
  constructor(pays: readonly number[]) {
    const hand = [0, 0, 0, 0, 0];
    for (let e = 4; e < 52; e++)
      for (let d = 3; d < e; d++)
        for (let c = 2; c < d; c++)
          for (let b = 1; b < c; b++)
            for (let a = 0; a < b; a++) {
              const pay = pays[classify(a, b, c, d, e)];
              if (pay === 0) continue;
              hand[0] = a; hand[1] = b; hand[2] = c; hand[3] = d; hand[4] = e;
              subsetIndexes(hand, this.indexes);
              for (let mask = 0; mask < 32; mask++) this.sums[this.indexes[mask]] += pay;
            }
  }

  /** Expected payout of each hold mask (bit i = keep the i-th card of the *sorted* hand). */
  holdEvs(sortedHand: readonly Card[], out = new Float64Array(32)): Float64Array {
    subsetIndexes(sortedHand, this.indexes);
    for (let hold = 0; hold < 32; hold++) {
      let total = 0;
      for (const { mask, sign } of DISCARD_SUBSETS[hold]) total += sign * this.sums[this.indexes[hold | mask]];
      out[hold] = total / DRAWS_FOR_HOLD[hold];
    }
    return out;
  }

  /** Average payout per deal with the best hold every time. Divide by the bet to get the return. */
  expectedPayout(): number {
    const hand = [0, 0, 0, 0, 0];
    const evs = new Float64Array(32);
    let total = 0;
    for (let e = 4; e < 52; e++)
      for (let d = 3; d < e; d++)
        for (let c = 2; c < d; c++)
          for (let b = 1; b < c; b++)
            for (let a = 0; a < b; a++) {
              hand[0] = a; hand[1] = b; hand[2] = c; hand[3] = d; hand[4] = e;
              this.holdEvs(hand, evs);
              let best = 0;
              for (let hold = 0; hold < 32; hold++) if (evs[hold] > best) best = evs[hold];
              total += best;
            }
    return total / HANDS;
  }
}

/**
 * How often each final hand comes up under perfect play: probability per HandClass, summing to 1.
 * Same counting as ReturnTable, with one count per hand class instead of one payout total. Takes about
 * a minute; scripts/compute-frequencies.ts stores the results.
 */
export function handDistribution(pays: readonly number[]): number[] {
  const table = new ReturnTable(pays);
  const counts = Array.from({ length: HAND_CLASS_COUNT }, () => new Int32Array(SUBSET_COUNT));
  const indexes = new Int32Array(32);
  const hand = [0, 0, 0, 0, 0];
  for (let e = 4; e < 52; e++)
    for (let d = 3; d < e; d++)
      for (let c = 2; c < d; c++)
        for (let b = 1; b < c; b++)
          for (let a = 0; a < b; a++) {
            const handCounts = counts[classify(a, b, c, d, e)];
            hand[0] = a; hand[1] = b; hand[2] = c; hand[3] = d; hand[4] = e;
            subsetIndexes(hand, indexes);
            for (let mask = 0; mask < 32; mask++) handCounts[indexes[mask]]++;
          }

  const totals = new Float64Array(HAND_CLASS_COUNT);
  const evs = new Float64Array(32);
  for (let e = 4; e < 52; e++)
    for (let d = 3; d < e; d++)
      for (let c = 2; c < d; c++)
        for (let b = 1; b < c; b++)
          for (let a = 0; a < b; a++) {
            hand[0] = a; hand[1] = b; hand[2] = c; hand[3] = d; hand[4] = e;
            table.holdEvs(hand, evs);
            let hold = 0;
            for (let h = 1; h < 32; h++) if (evs[h] > evs[hold]) hold = h;
            subsetIndexes(hand, indexes);
            for (let handClass = 0; handClass < HAND_CLASS_COUNT; handClass++) {
              let count = 0;
              for (const { mask, sign } of DISCARD_SUBSETS[hold]) count += sign * counts[handClass][indexes[hold | mask]];
              totals[handClass] += count / DRAWS_FOR_HOLD[hold];
            }
          }
  return [...totals].map((total) => total / HANDS);
}

/** Return to player under perfect play, e.g. 0.995439 for 9/6 Jacks or Better at max bet. */
export function computeReturn(pays: readonly number[], bet: number): number {
  return new ReturnTable(pays).expectedPayout() / bet;
}
