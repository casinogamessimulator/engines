import type { Card } from './cards.ts';
import { DEFAULT_RULES, LOW_PAIR_BASE, isFoul, wheelCode, type Rules } from './evaluate.ts';
import { DEFAULT_COMMISSION } from './round.ts';
import { SPLIT_COUNT, checkHand, evaluateSplits, settingAt, type Setting } from './setting.ts';

/**
 * How often the house-way dealer ends up with each (high hand, low hand) pair, over all C(53, 7)
 * dealer hands. Written by scripts/compute-dealer-distribution.ts to src/dealer-distribution.json.
 */
export interface DealerDistribution {
  houseWay: string;
  wheel: Rules['wheel'];
  hands: number;
  /** Distinct dealer high-hand values, ascending. */
  highs: number[];
  /** One row per entry of highs: [index into LOW_VALUES, hands, index, hands, ...]. */
  rows: number[][];
}

/** Every low-hand value, ascending: two singles (13 × high + low), then pairs. */
export const LOW_VALUES: readonly number[] = (() => {
  const values: number[] = [];
  for (let high = 1; high < 13; high++) for (let low = 0; low < high; low++) values.push(high * 13 + low);
  for (let rank = 0; rank < 13; rank++) values.push(LOW_PAIR_BASE + rank);
  return values.sort((a, b) => a - b);
})();

export interface SettingOdds {
  setting: Setting;
  win: number;
  push: number;
  lose: number;
  /** Expected net result per unit bet, after commission on wins. */
  ev: number;
}

export interface OptimalSetter {
  /** All legal settings of the hand with their odds against the house-way dealer, best first. */
  rank(cards: readonly Card[]): SettingOdds[];
  /** The setting with the highest expected value. */
  best(cards: readonly Card[]): SettingOdds;
  /** Index into SPLITS of the best setting, without validation or allocation: for simulations. */
  bestSplit(cards: ArrayLike<Card>): number;
}

/**
 * The "optimal" setter: tries the hand's (up to 21) legal settings and picks the one with the highest
 * expected value against a dealer who sets by the house way.
 *
 * A setting wins if both its hands beat the dealer's, loses if neither does (copies go to the dealer),
 * and pushes otherwise, so its odds only depend on how often the dealer's (high, low) pair falls in
 * each quadrant around it. Those counts come from the exact distribution of the house-way dealer's
 * settings over all 154,143,080 seven-card hands (precomputed), summed in a 2D prefix table so each
 * setting costs two binary searches.
 *
 * The one approximation: the dealer's hand is drawn from the full 53-card deck, ignoring that the
 * player's own 7 cards can't be in it (card removal). Exact card removal would mean setting all
 * C(46, 7) = 53,524,680 possible dealer hands for every player hand, about a minute and a half per hand,
 * far too slow for play or for a precomputed table over all 154 million hands. Card removal mostly
 * shifts every setting's odds the same way, so it rarely changes which one is best; scripts/compute-odds.ts
 * measures how close the result comes to Wizard of Odds' exact optimal strategy.
 */
export function createOptimalSetter(
  distribution: DealerDistribution,
  options: { rules?: Rules; commission?: number } = {},
): OptimalSetter {
  const rules = options.rules ?? DEFAULT_RULES;
  const commission = options.commission ?? DEFAULT_COMMISSION;
  if (rules.wheel !== distribution.wheel) {
    throw new Error(`The dealer distribution was computed with the wheel ${distribution.wheel}, not ${rules.wheel}`);
  }
  const { highs, rows, hands } = distribution;
  const columns = LOW_VALUES.length + 1;
  // below[i * columns + j]: dealer hands whose high is below highs[i] and whose low is below LOW_VALUES[j].
  const below = new Float64Array((highs.length + 1) * columns);
  for (let i = 0; i < highs.length; i++) {
    const rowCounts = new Float64Array(LOW_VALUES.length);
    const row = rows[i];
    for (let k = 0; k < row.length; k += 2) rowCounts[row[k]] += row[k + 1];
    let running = 0;
    for (let j = 0; j < columns; j++) {
      below[(i + 1) * columns + j] = below[i * columns + j] + running;
      if (j < LOW_VALUES.length) running += rowCounts[j];
    }
  }
  const lowIndex = new Map(LOW_VALUES.map((value, index) => [value, index]));
  const lastRow = highs.length * columns;
  const wheel = wheelCode(rules);
  const highValues = new Int32Array(SPLIT_COUNT);
  const lowValues = new Int32Array(SPLIT_COUNT);

  const odds = (high: number, low: number): { win: number; push: number; lose: number; ev: number } => {
    const i = lowerBound(highs, high) * columns;
    const j = lowIndex.get(low)!;
    const winCount = below[i + j];
    const loseCount = hands - below[i + columns - 1] - below[lastRow + j] + winCount;
    const win = winCount / hands;
    const lose = loseCount / hands;
    return { win, push: 1 - win - lose, lose, ev: (1 - commission) * win - lose };
  };

  const rank = (cards: readonly Card[]): SettingOdds[] => {
    checkHand(cards);
    evaluateSplits(cards, wheel, highValues, lowValues);
    const ranked: SettingOdds[] = [];
    for (let s = 0; s < SPLIT_COUNT; s++) {
      if (isFoul(highValues[s], lowValues[s])) continue;
      ranked.push({ setting: settingAt(cards, s, rules), ...odds(highValues[s], lowValues[s]) });
    }
    // Best first; between equal settings (the same hands from different suits) keep the deal order.
    return ranked.sort((a, b) => b.ev - a.ev);
  };

  const bestSplit = (cards: ArrayLike<Card>): number => {
    evaluateSplits(cards, wheel, highValues, lowValues);
    let best = -1;
    let bestEv = -Infinity;
    for (let s = 0; s < SPLIT_COUNT; s++) {
      if (isFoul(highValues[s], lowValues[s])) continue;
      const ev = odds(highValues[s], lowValues[s]).ev;
      if (ev > bestEv) {
        best = s;
        bestEv = ev;
      }
    }
    return best;
  };

  return { rank, best: (cards) => rank(cards)[0], bestSplit };
}

/** Index of the first value ≥ target in an ascending array. */
function lowerBound(values: readonly number[], target: number): number {
  let low = 0;
  let high = values.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (values[middle] < target) low = middle + 1;
    else high = middle;
  }
  return low;
}
