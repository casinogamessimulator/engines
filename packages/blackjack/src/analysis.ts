import { ACE, BLACKJACK, BUST, dealerOutcomes, KEY_STEP, TEN } from './dealer.ts';
import { blackjackPayout, dealerBlackjackTakesOriginalOnly, doubleAllowedOn, type Rules } from './rules.ts';

/*
 * Player expected values against one dealer up card, by exact recursion over the shoe composition.
 *
 * Every hand is played out card by card from the actual cards left, and every standing hand is compared with the
 * dealer's exact outcome probabilities for the cards left at that moment (dealer.ts). For hands that don't split
 * this is exact, the same as a combinatorial analyzer's composition-dependent results.
 *
 * Dealer blackjack. When a dealer blackjack only takes the original bet (a peek game, or no hole card with OBO), the
 * player's decisions only matter when the dealer doesn't have one. Values are then kept "unnormalized":
 * E[payoff · 1{no dealer blackjack}], drawing the player's cards from the unconditioned shoe. Because the hole card
 * is exchangeable with the cards the player draws, that is exactly P(no blackjack) times the conditional EV the
 * player faces after the peek, and every option at a decision point shares the same factor, so comparisons are
 * unaffected. A round's EV is then −P(dealer blackjack) + that value. With no hole card and no OBO, the dealer's
 * blackjack is just one more dealer outcome, which takes doubles and splits too.
 *
 * Splits (the one approximation). Each split hand is played from the shoe minus both pair cards, its own cards and
 * the up card, ignoring the cards that went to the other split hands; that is the usual CA simplification and moves
 * the house edge by thousandths of a percent. Resplits: X is the EV of a split hand whose second card isn't another
 * pair card, Y the EV of one that is but can't be resplit; the expected number of each kind comes from a small chain
 * over second cards that tracks how many pair cards are left (splitHandCounts). Players always resplit when they can.
 */

/** Contexts for memoized hand values: 0 for unsplit hands, 1 + i for hands made by splitting value index i. */
const CONTEXTS = 11;

/** Options for an initial pair in a total-dependent strategy; after the first decision it plays by its total. */
export const PAIR_HIT = 0;
export const PAIR_STAND = 1;
export const PAIR_DOUBLE = 2;
export const PAIR_SPLIT = 3;
export const PAIR_SURRENDER = 4;
const PAIR_OPTIONS = 5;

/**
 * A total-dependent strategy against one up card, indexed by [soft ? 1 : 0][total].
 * hit: hit or stand, for any hand. double: double whenever allowed. surrender: surrender a two-card non-pair hand
 * when allowed. pair: what to do with an initial pair (PAIR_*), by value index.
 */
export interface UpStrategy {
  hit: [Uint8Array, Uint8Array];
  double: [Uint8Array, Uint8Array];
  surrender: [Uint8Array, Uint8Array];
  pair: Uint8Array;
  /** Best pair option among hit, stand and split: the "else" of a pair's surrender. */
  pairFallback: Uint8Array;
  /** Whether hitting a pair beats standing: the "else" of a pair's double. */
  pairHitBeatsStand: Uint8Array;
}

function initialStrategy(): UpStrategy {
  const hit: [Uint8Array, Uint8Array] = [new Uint8Array(22), new Uint8Array(22)];
  for (let total = 0; total < 22; total++) {
    hit[0][total] = total < 17 ? 1 : 0;
    hit[1][total] = total < 18 ? 1 : 0;
  }
  return {
    hit,
    double: [new Uint8Array(22), new Uint8Array(22)],
    surrender: [new Uint8Array(22), new Uint8Array(22)],
    pair: Uint8Array.from({ length: 10 }, (_, r) => (r === TEN ? PAIR_STAND : PAIR_HIT)),
    pairFallback: new Uint8Array(10),
    pairHitBeatsStand: new Uint8Array(10),
  };
}

/** Dealer outcome distributions keyed by up card and cards removed; share one across analyses of the same shoe. */
export class DealerCache {
  readonly decks: number;
  readonly hitsSoft17: boolean;
  readonly byUp: Map<number, Float64Array>[] = Array.from({ length: 10 }, () => new Map());

  constructor(decks: number, hitsSoft17: boolean) {
    this.decks = decks;
    this.hitsSoft17 = hitsSoft17;
  }
}

/** Shoe composition by value index for a number of decks. */
export function fullShoe(decks: number): Int32Array {
  const counts = new Int32Array(10).fill(4 * decks);
  counts[TEN] = 16 * decks;
  return counts;
}

/**
 * Expected number of finished split hands whose second card is not another pair card (x) and is one that couldn't
 * be resplit (y), starting from `hands` hands of which `pending` still need a second card. `pairCards` and
 * `cardsLeft` describe the shoe when the split is made; each second card dealt depletes it.
 */
export function splitHandCounts(
  maxHands: number,
  hands: number,
  pending: number,
  pairCards: number,
  cardsLeft: number,
  canResplit: boolean,
): [x: number, y: number] {
  const visit = (handCount: number, open: number, pairsDrawn: number, drawn: number): [number, number] => {
    if (open === 0) return [0, 0];
    const p = Math.max(0, pairCards - pairsDrawn) / (cardsLeft - drawn);
    const [x1, y1] = visit(handCount, open - 1, pairsDrawn, drawn + 1);
    let x = (1 - p) * (1 + x1);
    let y = (1 - p) * y1;
    if (p > 0) {
      if (canResplit && handCount < maxHands) {
        const [x2, y2] = visit(handCount + 1, open + 1, pairsDrawn + 1, drawn + 1);
        x += p * x2;
        y += p * y2;
      } else {
        const [x2, y2] = visit(handCount, open - 1, pairsDrawn + 1, drawn + 1);
        x += p * x2;
        y += p * (1 + y2);
      }
    }
    return [x, y];
  };
  return visit(hands, pending, 0, 0);
}

const totalOf = (hard: number, ace: boolean): number => (ace && hard <= 11 ? hard + 10 : hard);
const softOf = (hard: number, ace: boolean): number => (ace && hard <= 11 ? 1 : 0);

export class UpCardAnalysis {
  readonly rules: Rules;
  /** Up card value index. */
  readonly up: number;
  /** The shoe the player's cards come from: the up card (and any other seen cards) removed. */
  readonly base: Int32Array;
  readonly baseLeft: number;
  /** Working composition, base minus the cards of the hand being looked at. */
  private readonly counts: Int32Array;
  private left: number;
  private readonly originalOnly: boolean;
  private readonly bjPays: number;
  private readonly dealerOutcomeCache: Map<number, Float64Array>;
  private readonly standTables = new Map<number, Float64Array>();
  private readonly optimalMemo: Map<number, number>[] = Array.from({ length: CONTEXTS }, () => new Map());
  private tdMemo: Map<number, number>[] = Array.from({ length: CONTEXTS }, () => new Map());
  strategy: UpStrategy = initialStrategy();

  constructor(rules: Rules, up: number, base: Int32Array, dealerCache?: DealerCache) {
    this.rules = rules;
    this.up = up;
    this.base = base;
    this.baseLeft = base.reduce((sum, count) => sum + count, 0);
    this.counts = base.slice();
    this.left = this.baseLeft;
    this.originalOnly = dealerBlackjackTakesOriginalOnly(rules);
    this.bjPays = blackjackPayout(rules);
    this.dealerOutcomeCache = dealerCache ? dealerCache.byUp[up] : new Map();
  }

  // ---- Primitives. Each works on the current composition; keys identify the cards removed from `base`. ----

  private remove(i: number): void {
    this.counts[i]--;
    this.left--;
  }

  private restore(i: number): void {
    this.counts[i]++;
    this.left++;
  }

  private setRemoved(key: number): void {
    let rest = key;
    this.left = this.baseLeft;
    for (let i = 0; i < 10; i++) {
      const digit = rest % 32;
      rest = (rest - digit) / 32;
      this.counts[i] = this.base[i] - digit;
      this.left -= digit;
    }
  }

  /** Chance the dealer has blackjack, given the current composition. */
  private dealerBlackjackChance(): number {
    if (this.up === ACE) return this.counts[TEN] / this.left;
    if (this.up === TEN) return this.counts[ACE] / this.left;
    return 0;
  }

  /** [total ≤ 16, 17, 18, 19, 20, 21] → EV of standing for one unit; then the dealer blackjack chance. */
  private standTable(key: number): Float64Array {
    let table = this.standTables.get(key);
    if (table) return table;
    let d = this.dealerOutcomeCache.get(key);
    if (!d) {
      d = dealerOutcomes(this.counts, this.up, this.rules.dealerHitsSoft17);
      this.dealerOutcomeCache.set(key, d);
    }
    const blackjackLoss = this.originalOnly ? 0 : d[BLACKJACK];
    table = new Float64Array(7);
    table[0] = d[BUST] - (d[0] + d[1] + d[2] + d[3] + d[4]) - blackjackLoss;
    for (let total = 17; total <= 21; total++) {
      let value = d[BUST];
      for (let k = 0; k < 5; k++) {
        if (17 + k < total) value += d[k];
        else if (17 + k > total) value -= d[k];
      }
      table[total - 16] = value - blackjackLoss;
    }
    table[6] = d[BLACKJACK];
    this.standTables.set(key, table);
    return table;
  }

  private stand(key: number, total: number): number {
    const table = this.standTable(key);
    return total <= 16 ? table[0] : table[total - 16];
  }

  /** Value of a busted hand (one unit), after the busting card was drawn. */
  private bust(): number {
    return this.originalOnly ? this.dealerBlackjackChance() - 1 : -1;
  }

  private double(hard: number, ace: boolean, key: number): number {
    const left = this.left;
    let ev = 0;
    for (let i = 0; i < 10; i++) {
      const count = this.counts[i];
      if (count === 0) continue;
      this.remove(i);
      const nextHard = hard + i + 1;
      ev += (count / left) * (nextHard > 21 ? this.bust() : this.stand(key + KEY_STEP[i], totalOf(nextHard, ace || i === ACE)));
      this.restore(i);
    }
    return 2 * ev;
  }

  /** Surrender's value in the same units as the other options of an initial hand. */
  private surrenderValue(): number {
    const blackjack = this.dealerBlackjackChance();
    if (this.rules.surrender === 'early') return this.originalOnly ? blackjack - 0.5 : -0.5;
    return this.originalOnly ? -0.5 * (1 - blackjack) : -0.5 * (1 - blackjack) - blackjack;
  }

  /** What every non-surrender option of an initial hand adds to its value to make a full EV. */
  private initialOffset(): number {
    return this.originalOnly ? -this.dealerBlackjackChance() : 0;
  }

  private canDoubleAfterSplit(pairIndex: number, total: number, soft: boolean): boolean {
    const { rules } = this;
    return rules.doubleAfterSplit && doubleAllowedOn(rules, total, soft) && (pairIndex !== ACE || rules.hitSplitAces);
  }

  private canResplit(pairIndex: number): boolean {
    return pairIndex !== ACE || this.rules.resplitAces;
  }

  private initialHandChance(i: number, j: number): number {
    const n = this.baseLeft;
    return i === j
      ? (this.base[i] * (this.base[i] - 1)) / (n * (n - 1))
      : (2 * this.base[i] * this.base[j]) / (n * (n - 1));
  }

  // ---- Composition-dependent optimal play. ----

  private optimalHitStand(context: number, hard: number, ace: boolean, key: number): number {
    const memo = this.optimalMemo[context];
    const cached = memo.get(key);
    if (cached !== undefined) return cached;
    const total = totalOf(hard, ace);
    let value = this.stand(key, total);
    if (total < 21) {
      const hit = this.optimalHit(context, hard, ace, key);
      if (hit > value) value = hit;
    }
    memo.set(key, value);
    return value;
  }

  private optimalHit(context: number, hard: number, ace: boolean, key: number): number {
    const left = this.left;
    let ev = 0;
    for (let i = 0; i < 10; i++) {
      const count = this.counts[i];
      if (count === 0) continue;
      this.remove(i);
      const nextHard = hard + i + 1;
      ev +=
        (count / left) * (nextHard > 21 ? this.bust() : this.optimalHitStand(context, nextHard, ace || i === ACE, key + KEY_STEP[i]));
      this.restore(i);
    }
    return ev;
  }

  /** A split hand of value index r receiving second card c; the pair is already removed from the composition. */
  private postSplitOptimal(r: number, c: number): number {
    this.remove(c);
    const hard = r + c + 2;
    const ace = r === ACE || c === ACE;
    const key = 2 * KEY_STEP[r] + KEY_STEP[c];
    const total = totalOf(hard, ace);
    let value: number;
    if (r === ACE && !this.rules.hitSplitAces) value = this.stand(key, total);
    else {
      value = this.optimalHitStand(1 + r, hard, ace, key);
      if (this.canDoubleAfterSplit(r, total, softOf(hard, ace) === 1)) value = Math.max(value, this.double(hard, ace, key));
    }
    this.restore(c);
    return value;
  }

  /** Total value of splitting a pair into `hands` hands; the pair is already removed from the composition. */
  private splitValue(r: number, hands: number, postSplit: (r: number, c: number) => number): number {
    const pairChance = this.counts[r] / this.left;
    let nonPair = 0;
    for (let c = 0; c < 10; c++) {
      if (c === r || this.counts[c] === 0) continue;
      nonPair += (this.counts[c] / this.left) * postSplit(r, c);
    }
    const x = pairChance < 1 ? nonPair / (1 - pairChance) : 0;
    const y = this.counts[r] > 0 ? postSplit(r, r) : 0;
    const [xCount, yCount] = splitHandCounts(this.rules.maxHands, hands, 2, this.counts[r], this.left, this.canResplit(r));
    return xCount * x + yCount * y;
  }

  /** Full EV of an initial two-card hand under composition-dependent optimal play. */
  private initialOptimal(i: number, j: number): number {
    this.remove(i);
    this.remove(j);
    const key = KEY_STEP[i] + KEY_STEP[j];
    const hard = i + j + 2;
    const ace = i === ACE || j === ACE;
    const total = totalOf(hard, ace);
    let ev: number;
    if (total === 21) ev = this.bjPays * (1 - this.dealerBlackjackChance());
    else {
      let best = this.optimalHitStand(0, hard, ace, key);
      if (doubleAllowedOn(this.rules, total, softOf(hard, ace) === 1)) best = Math.max(best, this.double(hard, ace, key));
      if (i === j) best = Math.max(best, this.splitValue(i, 2, (r, c) => this.postSplitOptimal(r, c)));
      if (this.rules.surrender !== 'none') best = Math.max(best, this.surrenderValue());
      ev = this.initialOffset() + best;
    }
    this.restore(j);
    this.restore(i);
    return ev;
  }

  /** EV per unit bet against this up card with composition-dependent optimal play. */
  optimalEv(): number {
    let ev = 0;
    for (let i = 0; i < 10; i++) for (let j = i; j < 10; j++) ev += this.initialHandChance(i, j) * this.initialOptimal(i, j);
    return ev;
  }

  // ---- Total-dependent strategy. ----

  private tdHitStand(context: number, hard: number, ace: boolean, key: number): number {
    const memo = this.tdMemo[context];
    const cached = memo.get(key);
    if (cached !== undefined) return cached;
    const total = totalOf(hard, ace);
    const value =
      total < 21 && this.strategy.hit[softOf(hard, ace)][total] ? this.tdHit(context, hard, ace, key) : this.stand(key, total);
    memo.set(key, value);
    return value;
  }

  private tdHit(context: number, hard: number, ace: boolean, key: number): number {
    const left = this.left;
    let ev = 0;
    for (let i = 0; i < 10; i++) {
      const count = this.counts[i];
      if (count === 0) continue;
      this.remove(i);
      const nextHard = hard + i + 1;
      ev += (count / left) * (nextHard > 21 ? this.bust() : this.tdHitStand(context, nextHard, ace || i === ACE, key + KEY_STEP[i]));
      this.restore(i);
    }
    return ev;
  }

  /** A two-card hand played by the strategy's double and hit/stand decisions. */
  private tdTwoCard(context: number, hard: number, ace: boolean, key: number, canDouble: boolean): number {
    if (canDouble && this.strategy.double[softOf(hard, ace)][totalOf(hard, ace)]) return this.double(hard, ace, key);
    return this.tdHitStand(context, hard, ace, key);
  }

  private postSplitTd(r: number, c: number): number {
    this.remove(c);
    const hard = r + c + 2;
    const ace = r === ACE || c === ACE;
    const key = 2 * KEY_STEP[r] + KEY_STEP[c];
    const total = totalOf(hard, ace);
    const value =
      r === ACE && !this.rules.hitSplitAces
        ? this.stand(key, total)
        : this.tdTwoCard(1 + r, hard, ace, key, this.canDoubleAfterSplit(r, total, softOf(hard, ace) === 1));
    this.restore(c);
    return value;
  }

  private initialTd(i: number, j: number): number {
    this.remove(i);
    this.remove(j);
    const key = KEY_STEP[i] + KEY_STEP[j];
    const hard = i + j + 2;
    const ace = i === ACE || j === ACE;
    const total = totalOf(hard, ace);
    const soft = softOf(hard, ace);
    let ev: number;
    if (total === 21) ev = this.bjPays * (1 - this.dealerBlackjackChance());
    else {
      let value: number;
      if (i === j) value = this.pairOptionTd(i, this.strategy.pair[i], hard, ace, key);
      else if (this.rules.surrender !== 'none' && this.strategy.surrender[soft][total]) value = this.surrenderValue();
      else value = this.tdTwoCard(0, hard, ace, key, doubleAllowedOn(this.rules, total, soft === 1));
      ev = this.initialOffset() + value;
    }
    this.restore(j);
    this.restore(i);
    return ev;
  }

  /** Value of an option for an initial pair (−Infinity when the rules don't allow it); the pair is removed. */
  private pairOptionTd(r: number, option: number, hard: number, ace: boolean, key: number): number {
    const total = totalOf(hard, ace);
    switch (option) {
      case PAIR_HIT:
        return this.tdHit(0, hard, ace, key);
      case PAIR_STAND:
        return this.stand(key, total);
      case PAIR_DOUBLE:
        return doubleAllowedOn(this.rules, total, softOf(hard, ace) === 1) ? this.double(hard, ace, key) : -Infinity;
      case PAIR_SPLIT:
        return this.splitValue(r, 2, (pair, c) => this.postSplitTd(pair, c));
      default:
        return this.rules.surrender !== 'none' ? this.surrenderValue() : -Infinity;
    }
  }

  /** EV per unit bet against this up card playing `this.strategy`. */
  strategyEv(): number {
    this.tdMemo = Array.from({ length: CONTEXTS }, () => new Map());
    let ev = 0;
    for (let i = 0; i < 10; i++) for (let j = i; j < 10; j++) ev += this.initialHandChance(i, j) * this.initialTd(i, j);
    return ev;
  }

  /**
   * Finds the best total-dependent strategy by policy iteration: play the current strategy forward to get how
   * often each decision comes up and with which compositions, total each option's value over them, switch every
   * decision to its best option, and repeat until nothing changes.
   *
   * Hit/stand and double decisions are weighed over every hand that reaches them, including two-card hands that
   * would rather surrender (or double), so "Rh" means what charts mean by it: surrender, otherwise hit, and hit this
   * total after drawing too. Pairs have their own first decision, then play by their total.
   */
  solveStrategy(maxRounds = 30): UpStrategy {
    for (let round = 0; round < maxRounds; round++) {
      this.tdMemo = Array.from({ length: CONTEXTS }, () => new Map());
      const sums = this.weighDecisions();
      if (!this.improve(sums)) break;
    }
    return this.strategy;
  }

  private weighDecisions(): DecisionSums {
    const sums = new DecisionSums();
    const { rules, strategy } = this;
    const canSurrender = rules.surrender !== 'none';
    // Frontier of hands still drawing, per context: removed-cards key → hand.
    let frontier: Map<number, FrontierHand>[] = Array.from({ length: CONTEXTS }, () => new Map());
    // Chance of each pair being split, by value index.
    const splits = new Float64Array(10);

    const weighTwoCard = (
      context: number,
      hard: number,
      ace: boolean,
      key: number,
      weight: number,
      canDouble: boolean,
      playing: boolean,
    ): void => {
      const total = totalOf(hard, ace);
      const soft = softOf(hard, ace);
      const slot = soft * 22 + total;
      let doubles = false;
      if (canDouble) {
        sums.addDouble(slot, weight, this.double(hard, ace, key), this.tdHitStand(context, hard, ace, key));
        doubles = strategy.double[soft][total] === 1;
      }
      this.weighHitStand(sums, context, frontier[context], hard, ace, key, weight, playing && !doubles);
    };

    for (let i = 0; i < 10; i++)
      for (let j = i; j < 10; j++) {
        const weight = this.initialHandChance(i, j);
        if (weight === 0) continue;
        const key = KEY_STEP[i] + KEY_STEP[j];
        this.setRemoved(key);
        const hard = i + j + 2;
        const ace = i === ACE || j === ACE;
        const total = totalOf(hard, ace);
        if (total === 21) continue;
        const soft = softOf(hard, ace);
        const canDouble = doubleAllowedOn(rules, total, soft === 1);
        if (i === j) {
          for (let option = 0; option < PAIR_OPTIONS; option++)
            sums.addPair(i, option, weight, this.pairOptionTd(i, option, hard, ace, key));
          const choice = strategy.pair[i];
          if (choice === PAIR_SPLIT) splits[i] += weight;
          else if (choice === PAIR_HIT) this.queueHits(frontier[0], hard, ace, key, weight);
        } else {
          let surrenders = false;
          if (canSurrender) {
            sums.addSurrender(soft * 22 + total, weight, this.surrenderValue(), this.tdTwoCard(0, hard, ace, key, canDouble));
            surrenders = strategy.surrender[soft][total] === 1;
          }
          weighTwoCard(0, hard, ace, key, weight, canDouble, !surrenders);
        }
      }

    // Split hands' second cards. Hands from splitting value r: weight × expected hands of each kind.
    for (let r = 0; r < 10; r++) {
      const pending = splits[r];
      if (pending === 0) continue;
      this.setRemoved(2 * KEY_STEP[r]);
      const pairChance = this.counts[r] / this.left;
      const [xCount, yCount] = splitHandCounts(rules.maxHands, 2, 2, this.counts[r], this.left, this.canResplit(r));
      const left = this.left;
      for (let c = 0; c < 10; c++) {
        const count = this.counts[c];
        if (count === 0) continue;
        const weight = c === r ? pending * yCount : (pending * xCount * (count / left)) / (1 - pairChance);
        if (weight === 0 || (r === ACE && !rules.hitSplitAces)) continue;
        this.remove(c);
        const hard = r + c + 2;
        const ace = r === ACE || c === ACE;
        const total = totalOf(hard, ace);
        const canDouble = this.canDoubleAfterSplit(r, total, softOf(hard, ace) === 1);
        if (total < 21) weighTwoCard(1 + r, hard, ace, 2 * KEY_STEP[r] + KEY_STEP[c], weight, canDouble, true);
        this.restore(c);
      }
    }

    // Hands that hit, one card at a time, merging hands with the same cards.
    while (frontier.some((hands) => hands.size > 0)) {
      const next: Map<number, FrontierHand>[] = Array.from({ length: CONTEXTS }, () => new Map());
      for (let context = 0; context < CONTEXTS; context++)
        for (const [key, hand] of frontier[context]) {
          this.setRemoved(key);
          this.weighHitStand(sums, context, next[context], hand.hard, hand.ace, key, hand.weight, true);
        }
      frontier = next;
    }
    this.setRemoved(0);
    return sums;
  }

  /**
   * Adds a hand's hit and stand values to its hit/stand decision; when it's still drawing under the current
   * strategy, queues its next hands on `next`.
   */
  private weighHitStand(
    sums: DecisionSums,
    context: number,
    next: Map<number, FrontierHand>,
    hard: number,
    ace: boolean,
    key: number,
    weight: number,
    playing: boolean,
  ): void {
    const total = totalOf(hard, ace);
    if (total >= 21) return;
    const soft = softOf(hard, ace);
    sums.addHit(soft * 22 + total, weight, this.tdHit(context, hard, ace, key), this.stand(key, total));
    if (playing && this.strategy.hit[soft][total]) this.queueHits(next, hard, ace, key, weight);
  }

  /** Queues the hands a hit leads to (busts and 21s need no more decisions). */
  private queueHits(next: Map<number, FrontierHand>, hard: number, ace: boolean, key: number, weight: number): void {
    const left = this.left;
    for (let i = 0; i < 10; i++) {
      const count = this.counts[i];
      if (count === 0) continue;
      const nextHard = hard + i + 1;
      if (nextHard > 21) continue;
      const nextKey = key + KEY_STEP[i];
      const nextWeight = (weight * count) / left;
      const queued = next.get(nextKey);
      if (queued) queued.weight += nextWeight;
      else next.set(nextKey, { hard: nextHard, ace: ace || i === ACE, weight: nextWeight });
    }
  }

  private improve(sums: DecisionSums): boolean {
    const { strategy, rules } = this;
    let changed = false;
    const choose = (current: number, values: number[], weight: number): number => {
      if (weight === 0) return current;
      let best = current;
      for (let option = 0; option < values.length; option++)
        if (values[option] > values[best] + 1e-13 * weight) best = option;
      return best;
    };
    for (let soft = 0; soft < 2; soft++)
      for (let total = 0; total < 22; total++) {
        const slot = soft * 22 + total;
        const pick = (decision: Uint8Array, yes: Float64Array, no: Float64Array, weight: Float64Array): void => {
          const next = choose(decision[total] ? 0 : 1, [yes[slot], no[slot]], weight[slot]) === 0 ? 1 : 0;
          if (next !== decision[total]) {
            decision[total] = next;
            changed = true;
          }
        };
        pick(strategy.hit[soft], sums.hitYes, sums.hitNo, sums.hitWeight);
        pick(strategy.double[soft], sums.doubleYes, sums.doubleNo, sums.doubleWeight);
        if (rules.surrender !== 'none') pick(strategy.surrender[soft], sums.surrenderYes, sums.surrenderNo, sums.surrenderWeight);
      }
    for (let r = 0; r < 10; r++) {
      const values = Array.from(sums.pairValues.subarray(r * PAIR_OPTIONS, (r + 1) * PAIR_OPTIONS));
      const next = choose(strategy.pair[r], values, sums.pairWeight[r]);
      if (next !== strategy.pair[r]) {
        strategy.pair[r] = next;
        changed = true;
      }
      let fallback = PAIR_HIT;
      for (const option of [PAIR_STAND, PAIR_SPLIT]) if (values[option] > values[fallback]) fallback = option;
      strategy.pairFallback[r] = fallback;
      strategy.pairHitBeatsStand[r] = values[PAIR_HIT] > values[PAIR_STAND] ? 1 : 0;
    }
    return changed;
  }

  // ---- Analyzer support. ----

  /**
   * Values of each option for a hand of value indexes (composition-dependent optimal play afterwards), in the units
   * of this file: see the header. `hands` is how many hands the player has (more than 1 means this one is split).
   */
  handOptions(hand: readonly number[], hands: number): HandOptionValues {
    const { rules } = this;
    let key = 0;
    let hard = 0;
    let ace = false;
    for (const i of hand) {
      key += KEY_STEP[i];
      hard += i + 1;
      if (i === ACE) ace = true;
    }
    this.setRemoved(key);
    const total = totalOf(hard, ace);
    const soft = softOf(hard, ace) === 1;
    const fromSplit = hands > 1;
    const twoCards = hand.length === 2;
    const splitAce = fromSplit && hand[0] === ACE;
    const blackjackChance = this.dealerBlackjackChance();
    if (total > 21) throw new Error('The hand is bust');
    const natural = twoCards && total === 21 && !fromSplit;
    const options: HandOptionValues = { natural, stand: 0, blackjackChance, offset: this.initialOffset() };
    if (natural) {
      options.stand = this.bjPays * (1 - blackjackChance) - this.initialOffset();
      return options;
    }
    options.stand = this.stand(key, total);
    if (!splitAce || rules.hitSplitAces) options.hit = this.optimalHit(0, hard, ace, key);
    if (
      twoCards &&
      doubleAllowedOn(rules, total, soft) &&
      (!fromSplit || rules.doubleAfterSplit) &&
      (!splitAce || rules.hitSplitAces)
    )
      options.double = this.double(hard, ace, key);
    if (twoCards && hand[0] === hand[1] && hands < rules.maxHands && (!fromSplit || this.canResplit(hand[0]))) {
      const r = hand[0];
      options.split = this.splitValue(r, hands + 1, (pair, c) => this.postSplitOptimal(pair, c));
    }
    if (twoCards && !fromSplit && rules.surrender !== 'none') options.surrender = this.surrenderValue();
    return options;
  }
}

export interface HandOptionValues {
  /** An unsplit two-card 21: standing is the only option. */
  natural: boolean;
  stand: number;
  hit?: number;
  double?: number;
  split?: number;
  surrender?: number;
  /** Dealer blackjack chance given the cards seen. */
  blackjackChance: number;
  /** Added to non-surrender options of an initial hand to make its full EV (−blackjack chance in peek games). */
  offset: number;
}

interface FrontierHand {
  hard: number;
  ace: boolean;
  weight: number;
}

/** Weighted option values for every decision, summed over the hands that reach it. Slots: soft * 22 + total. */
class DecisionSums {
  readonly hitYes = new Float64Array(44);
  readonly hitNo = new Float64Array(44);
  readonly hitWeight = new Float64Array(44);
  readonly doubleYes = new Float64Array(44);
  readonly doubleNo = new Float64Array(44);
  readonly doubleWeight = new Float64Array(44);
  readonly surrenderYes = new Float64Array(44);
  readonly surrenderNo = new Float64Array(44);
  readonly surrenderWeight = new Float64Array(44);
  /** By value index × PAIR_OPTIONS + option. */
  readonly pairValues = new Float64Array(10 * PAIR_OPTIONS);
  readonly pairWeight = new Float64Array(10);

  addHit(slot: number, weight: number, hit: number, stand: number): void {
    this.hitYes[slot] += weight * hit;
    this.hitNo[slot] += weight * stand;
    this.hitWeight[slot] += weight;
  }

  addDouble(slot: number, weight: number, yes: number, no: number): void {
    this.doubleYes[slot] += weight * yes;
    this.doubleNo[slot] += weight * no;
    this.doubleWeight[slot] += weight;
  }

  addSurrender(slot: number, weight: number, yes: number, no: number): void {
    this.surrenderYes[slot] += weight * yes;
    this.surrenderNo[slot] += weight * no;
    this.surrenderWeight[slot] += weight;
  }

  addPair(r: number, option: number, weight: number, value: number): void {
    this.pairValues[r * PAIR_OPTIONS + option] += value === -Infinity ? -Infinity : weight * value;
    if (option === 0) this.pairWeight[r] += weight;
  }
}
