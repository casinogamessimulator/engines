import { ACE, JACK, KING, SEVEN, TEN, rankAsAce, type Card } from './cards.ts';
import { Category, DEFAULT_RULES, LOW_PAIR_BASE, categoryOf, isFoul, wheelCode, type Rules } from './evaluate.ts';
import { SPLIT_COUNT, checkHand, evaluateSplits, settingAt, type Setting } from './setting.ts';

/**
 * The Foxwoods house way, as published by Wizard of Odds:
 * https://wizardofodds.com/games/pai-gow-poker/house-way/foxwoods/
 *
 * Why this one: it is the house way behind Wizard of Odds' published Pai Gow Poker figures (house edge
 * 2.7212% when player and dealer both set by it, dealer banking, 5% commission). Its strategy page
 * (wizardofodds.com/games/pai-gow-poker/strategy/foxwoods/) compares every strategy against it. House
 * ways differ "marginally and infrequently" from casino to casino (WoO), so any published one would do;
 * this one lets the precomputed odds be checked against published numbers.
 *
 * The published rules, in the order they are applied here (the joker counts as an ace for pairs):
 *
 * - Five aces: a pair of aces in front, unless a pair of kings can go in front.
 * - Four of a kind with a pair or three of a kind: the pair in front (from the trips if that's all).
 * - Four of a kind, otherwise:
 *     jacks to aces: always split (a pair in front);
 *     sevens to tens: keep the four in back if a king or better can go in front, otherwise split;
 *     sixes and below: never split.
 * - Two sets of three of a kind: a pair from the higher set in front.
 * - Full house: the highest pair in front ("highest permissible pair"); the trips stay in back.
 * - Three pair: the highest pair in front.
 * - Two pair (straights and flushes are ignored: "play according to two-pair strategy"):
 *     big pair jacks to aces: split, small pair in front;
 *     big pair sevens to tens: both pairs in back if an ace can go in front, otherwise split;
 *     big pair threes to sixes: both pairs in back if a king or better can go in front, otherwise split.
 * - Straight, flush or straight flush available (with no more than three of a kind):
 *     with three of a kind: the complete hand in back and the pair in front;
 *     with one pair or no pair: the highest possible two cards in front (a pair or not) that leave a
 *     complete hand in back;
 *     exception: with an ace and a pair of tens to kings, play the ace in front and the pair in back
 *     (the one-pair setting) if that improves the front hand.
 * - Three of a kind: aces split (an ace and the next highest card in front); kings and below stay in
 *   back with the two highest other cards in front.
 * - One pair: the pair in back, the two highest other cards in front.
 * - No pair: the highest card in back, the second and third highest in front.
 *
 * Where a rule names only the front hand's ranks, the five remaining cards are arranged into the best
 * high hand they make (so a joker in back can still complete a straight or flush). "Complete hand"
 * means a straight, flush or straight flush, the hands the rule is about.
 */

// Scratch space, reused between calls: the house way runs hundreds of millions of times in scripts.
const counts = new Int8Array(13);
const tripsList = new Int8Array(2);
const pairsList = new Int8Array(3);
const singlesList = new Int8Array(7);

const pairLow = (rank: number): number => LOW_PAIR_BASE + rank;
const singlesLow = (high: number, low: number): number => high * 13 + low;

/** The split, among those with the given low hand, with the best high hand; −1 if there is none. */
function withLow(target: number, highs: Int32Array, lows: Int32Array): number {
  let best = -1;
  for (let s = 0; s < SPLIT_COUNT; s++) {
    if (lows[s] !== target || isFoul(highs[s], lows[s])) continue;
    if (best < 0 || highs[s] > highs[best]) best = s;
  }
  return best;
}

const isComplete = (high: number): boolean => {
  const category = categoryOf(high);
  return category === Category.Straight || category === Category.Flush || category === Category.StraightFlush;
};

/** The split with a straight, flush or straight flush in back and the best low hand (then high); −1 if none. */
function bestCompleteHand(highs: Int32Array, lows: Int32Array): number {
  let best = -1;
  for (let s = 0; s < SPLIT_COUNT; s++) {
    if (!isComplete(highs[s])) continue;
    if (best < 0 || lows[s] > lows[best] || (lows[s] === lows[best] && highs[s] > highs[best])) best = s;
  }
  return best;
}

/** Safety net, never reached by the rules above in practice: the best low hand that doesn't foul. */
function bestLegal(highs: Int32Array, lows: Int32Array): number {
  let best = 0;
  let bestFoul = true;
  for (let s = 0; s < SPLIT_COUNT; s++) {
    const foul = isFoul(highs[s], lows[s]);
    if (foul) continue;
    if (bestFoul || lows[s] > lows[best] || (lows[s] === lows[best] && highs[s] > highs[best])) {
      best = s;
      bestFoul = false;
    }
  }
  return best;
}

/** Which published rule set a hand, one id per rule in the list above (for explaining the dealer's play). */
export type HouseWayRuleId =
  | 'five-aces'
  | 'four-of-a-kind-with-pair'
  | 'four-of-a-kind-split'
  | 'four-of-a-kind-together'
  | 'two-sets'
  | 'full-house'
  | 'three-pair'
  | 'two-pair-split'
  | 'two-pair-together'
  | 'complete-hand-with-trips'
  | 'complete-hand'
  | 'ace-and-pair'
  | 'trip-aces'
  | 'three-of-a-kind'
  | 'one-pair'
  | 'no-pair';

// The rule behind the latest houseWayRule call.
let lastRule: HouseWayRuleId = 'no-pair';

/**
 * The house way's split (an index into SPLITS) for 7 cards whose splits are already valued by
 * evaluateSplits. Hot path for the precompute scripts.
 */
export function houseWaySplit(cards: ArrayLike<Card>, highs: Int32Array, lows: Int32Array): number {
  const split = houseWayRule(cards, highs, lows);
  return split >= 0 ? split : bestLegal(highs, lows);
}

/** The published rules alone: −1 if none of them yields a legal setting (the scripts check it never does). */
export function houseWayRule(cards: ArrayLike<Card>, highs: Int32Array, lows: Int32Array): number {
  counts.fill(0);
  for (let i = 0; i < 7; i++) counts[rankAsAce(cards[i])]++;
  let quad = -1;
  let fiveAces = false;
  let trips = 0;
  let pairs = 0;
  let singles = 0;
  for (let rank = ACE; rank >= 0; rank--) {
    const count = counts[rank];
    if (count === 5) fiveAces = true;
    else if (count === 4) quad = rank;
    else if (count === 3) tripsList[trips++] = rank;
    else if (count === 2) pairsList[pairs++] = rank;
    else if (count === 1) singlesList[singles++] = rank;
  }

  if (fiveAces) {
    lastRule = 'five-aces';
    return withLow(pairLow(counts[KING] >= 2 ? KING : ACE), highs, lows);
  }

  if (quad >= 0) {
    if (trips || pairs) {
      lastRule = 'four-of-a-kind-with-pair';
      return withLow(pairLow(trips ? tripsList[0] : pairsList[0]), highs, lows);
    }
    const kingOrBetterFront = singlesList[0] >= KING;
    if (quad >= JACK || (quad >= SEVEN && !kingOrBetterFront)) {
      lastRule = 'four-of-a-kind-split';
      return withLow(pairLow(quad), highs, lows);
    }
    lastRule = 'four-of-a-kind-together';
    return withLow(singlesLow(singlesList[0], singlesList[1]), highs, lows);
  }

  if (trips === 2) {
    lastRule = 'two-sets';
    return withLow(pairLow(tripsList[0]), highs, lows);
  }
  if (trips && pairs) {
    lastRule = 'full-house';
    return withLow(pairLow(pairsList[0]), highs, lows);
  }
  if (pairs === 3) {
    lastRule = 'three-pair';
    return withLow(pairLow(pairsList[0]), highs, lows);
  }

  if (pairs === 2) {
    const big = pairsList[0];
    const keepBoth = big >= JACK ? false : big >= SEVEN ? singlesList[0] === ACE : singlesList[0] >= KING;
    lastRule = keepBoth ? 'two-pair-together' : 'two-pair-split';
    if (keepBoth) return withLow(singlesLow(singlesList[0], singlesList[1]), highs, lows);
    return withLow(pairLow(pairsList[1]), highs, lows);
  }

  const complete = bestCompleteHand(highs, lows);
  if (complete >= 0) {
    if (trips) {
      lastRule = 'complete-hand-with-trips';
      const pairFront = withLow(pairLow(tripsList[0]), highs, lows);
      return pairFront >= 0 && isComplete(highs[pairFront]) ? pairFront : complete;
    }
    if (pairs && singlesList[0] === ACE && pairsList[0] >= TEN && pairsList[0] <= KING) {
      const aceFront = withLow(singlesLow(ACE, singlesList[1]), highs, lows);
      if (aceFront >= 0 && lows[aceFront] > lows[complete]) {
        lastRule = 'ace-and-pair';
        return aceFront;
      }
    }
    lastRule = 'complete-hand';
    return complete;
  }

  if (trips) {
    lastRule = tripsList[0] === ACE ? 'trip-aces' : 'three-of-a-kind';
    if (tripsList[0] === ACE) return withLow(singlesLow(ACE, singlesList[0]), highs, lows);
    return withLow(singlesLow(singlesList[0], singlesList[1]), highs, lows);
  }
  if (pairs) {
    lastRule = 'one-pair';
    return withLow(singlesLow(singlesList[0], singlesList[1]), highs, lows);
  }
  lastRule = 'no-pair';
  return withLow(singlesLow(singlesList[1], singlesList[2]), highs, lows);
}

const highsBuffer = new Int32Array(SPLIT_COUNT);
const lowsBuffer = new Int32Array(SPLIT_COUNT);

/** Sets a 7-card hand the house way (Foxwoods; see above). */
export function houseWay(cards: readonly Card[], rules: Rules = DEFAULT_RULES): Setting {
  return houseWayExplained(cards, rules).setting;
}

/** The house way's setting and the rule that produced it. */
export function houseWayExplained(cards: readonly Card[], rules: Rules = DEFAULT_RULES): { setting: Setting; rule: HouseWayRuleId } {
  checkHand(cards);
  evaluateSplits(cards, wheelCode(rules), highsBuffer, lowsBuffer);
  const split = houseWaySplit(cards, highsBuffer, lowsBuffer);
  return { setting: settingAt(cards, split, rules), rule: lastRule };
}
