import type { Card } from './cards.ts';
import { evaluateWithTwo, PAIR_OR_BETTER, suitMasks, type HandValue } from './evaluate.ts';
import { blindPays } from './paytables.ts';
import preflopTable from './results/preflop.json' with { type: 'json' };
import { startingHandIndex } from './starting-hands.ts';

/*
 * Exact expected values of each decision, by enumerating every unseen card. All EVs are per unit of
 * ante (the blind equals the ante) and cover the ante, blind and play bets; the trips side bet doesn't
 * depend on any decision and is valued separately (see trips.ts).
 *
 * Payouts per unit of ante, playing `m` units:
 *   player wins:  +m (play) + blind paytable + 1 (ante) if the dealer qualifies, else the ante pushes
 *   tie:          everything pushes
 *   player loses: −m (play) − 1 (blind) − 1 (ante) if the dealer qualifies, else the ante pushes
 *   fold:         −2 (ante and blind)
 */

export const FOLD_EV = -2;

/** Outcomes over every possible pair of dealer hole cards, for a known player hand and full board. */
export interface DealerCounts {
  /** Dealer hands considered: C(45, 2) = 990. */
  total: number;
  win: number;
  tie: number;
  lose: number;
  /** Wins against a qualifying dealer (pair or better): the ante pays. */
  winQualified: number;
  /** Losses to a qualifying dealer: the ante loses. */
  loseQualified: number;
}

function assertDistinct(cards: readonly Card[]): void {
  if (new Set(cards).size !== cards.length || cards.some((c) => !Number.isInteger(c) || c < 0 || c > 51)) {
    throw new Error('Cards must be distinct integers 0..51');
  }
}

/** Every dealer hand against `hole` on a complete 5-card `board`. */
export function dealerCounts(hole: readonly Card[], board: readonly Card[]): DealerCounts {
  if (hole.length !== 2 || board.length !== 5) throw new Error('Need 2 hole cards and a 5-card board');
  assertDistinct([...hole, ...board]);
  const masks = suitMasks(board);
  const player = evaluateWithTwo(masks, hole[0], hole[1]);
  const used = new Set([...hole, ...board]);
  const unseen: Card[] = [];
  for (let c = 0; c < 52; c++) if (!used.has(c)) unseen.push(c);
  return countDealer(masks, player, unseen);
}

function countDealer(boardMasks: ArrayLike<number>, player: HandValue, unseen: readonly Card[]): DealerCounts {
  let win = 0;
  let tie = 0;
  let lose = 0;
  let winQualified = 0;
  let loseQualified = 0;
  const n = unseen.length;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const dealer = evaluateWithTwo(boardMasks, unseen[i], unseen[j]);
      if (player > dealer) {
        win++;
        if (dealer >= PAIR_OR_BETTER) winQualified++;
      } else if (player < dealer) {
        lose++;
        if (dealer >= PAIR_OR_BETTER) loseQualified++;
      } else tie++;
    }
  }
  return { total: (n * (n - 1)) / 2, win, tie, lose, winQualified, loseQualified };
}

/** EV of playing `multiple` units given the dealer outcome counts and the player's final hand. */
export function playEv(counts: DealerCounts, player: HandValue, multiple: number): number {
  const { win, lose, winQualified, loseQualified, total } = counts;
  return (multiple * (win - lose) + win * blindPays(player) + winQualified - lose - loseQualified) / total;
}

export interface RiverEv {
  /** Play 1x. */
  bet: number;
  /** Always −2. */
  fold: number;
  best: 'bet' | 'fold';
  counts: DealerCounts;
}

/** Exact EV at the river (only when the player checked twice): enumerates the dealer's 990 hands. */
export function riverEv(hole: readonly Card[], board: readonly Card[]): RiverEv {
  const counts = dealerCounts(hole, board);
  const player = evaluateWithTwo(suitMasks(board), hole[0], hole[1]);
  const bet = playEv(counts, player, 1);
  return { bet, fold: FOLD_EV, best: bet > FOLD_EV ? 'bet' : 'fold', counts };
}

export interface FlopEv {
  /** Play 2x now. */
  bet: number;
  /** Check, then bet 1x or fold at the river, whichever is better on the cards that come. */
  check: number;
  best: 'bet' | 'check';
  /** Chance of winning / tying / losing showdown when going to the river (any play bet). */
  win: number;
  tie: number;
  lose: number;
}

/**
 * Exact EV after the flop, by enumerating all 1,081 turn-river pairs and, for each, the dealer's 990
 * hands: about a million evaluations (tens of milliseconds). Pure and allocation-light, so it can
 * run in a Web Worker as is.
 */
export function flopEv(hole: readonly Card[], flop: readonly Card[]): FlopEv {
  if (hole.length !== 2 || flop.length !== 3) throw new Error('Need 2 hole cards and a 3-card flop');
  assertDistinct([...hole, ...flop]);
  const used = new Set([...hole, ...flop]);
  const rest: Card[] = [];
  for (let c = 0; c < 52; c++) if (!used.has(c)) rest.push(c);
  const masks = new Int32Array(4);
  const unseen: Card[] = new Array(45);
  let betSum = 0;
  let checkSum = 0;
  let win = 0;
  let tie = 0;
  let lose = 0;
  let boards = 0;
  for (let t = 0; t < rest.length; t++) {
    for (let r = t + 1; r < rest.length; r++) {
      suitMasks([...flop, rest[t], rest[r]], masks);
      let k = 0;
      for (let c = 0; c < rest.length; c++) if (c !== t && c !== r) unseen[k++] = rest[c];
      const player = evaluateWithTwo(masks, hole[0], hole[1]);
      const counts = countDealer(masks, player, unseen);
      betSum += playEv(counts, player, 2);
      checkSum += Math.max(playEv(counts, player, 1), FOLD_EV);
      win += counts.win / counts.total;
      tie += counts.tie / counts.total;
      lose += counts.lose / counts.total;
      boards++;
    }
  }
  const bet = betSum / boards;
  const check = checkSum / boards;
  return { bet, check, best: bet > check ? 'bet' : 'check', win: win / boards, tie: tie / boards, lose: lose / boards };
}

export interface PreflopEv {
  /** Starting-hand class, e.g. "AKs". */
  hand: string;
  raise4: number;
  raise3: number;
  /** Check, then play optimally on the flop and river. */
  check: number;
  best: 'raise4' | 'raise3' | 'check';
}

interface PreflopRow {
  hand: string;
  raise4: number;
  raise3: number;
  check: number;
}

const PREFLOP = preflopTable.hands as PreflopRow[];

/** Exact EV before the flop, from the table scripts/compute-exact.ts enumerates for all 169 classes. */
export function preflopEv(hole: readonly Card[]): PreflopEv {
  if (hole.length !== 2) throw new Error('Need 2 hole cards');
  assertDistinct(hole);
  const row = PREFLOP[startingHandIndex(hole[0], hole[1])];
  const best = row.raise4 >= row.check && row.raise4 >= row.raise3 ? 'raise4' : row.raise3 > row.check ? 'raise3' : 'check';
  return { hand: row.hand, raise4: row.raise4, raise3: row.raise3, check: row.check, best };
}
