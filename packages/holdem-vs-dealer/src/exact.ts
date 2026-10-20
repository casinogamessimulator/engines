import type { Card } from './cards.ts';
import { evaluateMasks, evaluateWithTwo, PAIR_OR_BETTER } from './evaluate.ts';
import { blindPays } from './paytables.ts';
import { hasHiddenPairOrBetter, simpleFlopBets, SIMPLE_STRATEGY_OUTS_LIMIT } from './strategy.ts';

/*
 * The core of the exact preflop analysis (scripts/compute-exact.ts): for one flop, the outcome of every
 * player hand on every turn and river against every dealer hand.
 *
 * Done naively that's 1,176 player hands × 1,081 turn-rivers × 990 dealer hands per flop. Instead, for
 * each of the 1,081 complete boards, every two-card hand from the 47 remaining cards is evaluated once
 * and sorted. A player hand's dealer opponents are all the other hands that share no card with it, so
 * its wins, ties and losses follow by inclusion–exclusion from running counts: hands below it overall,
 * minus those holding its first card, minus those holding its second. One evaluation per hand instead
 * of 990, and the whole game (1,755 flops up to suit symmetry) takes seconds per core.
 *
 * Units: everything is summed over the 1,081 boards in "doubled dealer-hand" units, i.e. EV × 990 × 2
 * per board, so every sum is an integer (the blind's 3:2 flush is the only half) and exact in a double.
 */

/** Scale of one board's values: 990 dealer hands × 2. */
export const BOARD_SCALE = 990 * 2;
const FOLD_SCALED = -2 * BOARD_SCALE;

/** Player hands from the 49 cards off the flop: C(49, 2). */
export const FLOP_HOLES = 1176;
/** Turn-river pairs for a given player hand: C(47, 2). */
export const FLOP_BOARDS = 1081;

const PAIR_I = new Uint8Array(FLOP_HOLES);
const PAIR_J = new Uint8Array(FLOP_HOLES);
const HOLE_AT = new Int16Array(49 * 49);
for (let i = 0, h = 0; i < 49; i++) {
  for (let j = i + 1; j < 49; j++, h++) {
    PAIR_I[h] = i;
    PAIR_J[h] = j;
    HOLE_AT[i * 49 + j] = h;
  }
}

export interface FlopAnalysis {
  flop: Card[];
  /** The 49 cards off the flop, ascending; hole `h` is `[rest[holeI(h)], rest[holeJ(h)]]`. */
  rest: Card[];
  /** Σ over boards of (wins − losses) × 2: the part of the play bet's EV that scales with its size. */
  sumD: Float64Array;
  /** Σ over boards of the ante and blind results when playing: EV(play m) = (m·sumD + sumC) / scale. */
  sumC: Float64Array;
  /** Σ over boards of max(play 1x, fold): checking the flop, then playing the river optimally. */
  optimalRiver: Float64Array;
  /** Boards on which optimal river play bets. */
  optimalRiverBets: Float64Array;
  /** Σ over boards of the simple strategy's river result. */
  simpleRiver: Float64Array;
  simpleRiverBets: Float64Array;
  /** 1 where the simple strategy bets 2x on this flop. */
  simpleFlopBets: Uint8Array;
}

export const holeI = (h: number): number => PAIR_I[h];
export const holeJ = (h: number): number => PAIR_J[h];

/** Index of a player hand in a FlopAnalysis, from its two cards. */
export function flopHoleIndex(analysis: FlopAnalysis, a: Card, b: Card): number {
  const i = analysis.rest.indexOf(Math.min(a, b));
  const j = analysis.rest.indexOf(Math.max(a, b));
  if (i < 0 || j < 0 || i === j) throw new Error('Hole cards must be two distinct cards off the flop');
  return HOLE_AT[i * 49 + j];
}

export function analyzeFlop(flop: readonly Card[]): FlopAnalysis {
  const rest: Card[] = [];
  for (let c = 0; c < 52; c++) if (!flop.includes(c)) rest.push(c);
  if (rest.length !== 49) throw new Error('A flop is 3 distinct cards');

  const sumD = new Float64Array(FLOP_HOLES);
  const sumC = new Float64Array(FLOP_HOLES);
  const optimalRiver = new Float64Array(FLOP_HOLES);
  const optimalRiverBets = new Float64Array(FLOP_HOLES);
  const simpleRiver = new Float64Array(FLOP_HOLES);
  const simpleRiverBets = new Float64Array(FLOP_HOLES);
  const simpleFlop = new Uint8Array(FLOP_HOLES);
  for (let h = 0; h < FLOP_HOLES; h++) simpleFlop[h] = simpleFlopBets([rest[PAIR_I[h]], rest[PAIR_J[h]]], flop) ? 1 : 0;

  const flopMasks = [0, 0, 0, 0];
  for (const card of flop) flopMasks[card & 3] |= 1 << (card >> 2);

  const value = new Int32Array(FLOP_HOLES);
  const wins = new Int32Array(FLOP_HOLES);
  const ties = new Int32Array(FLOP_HOLES);
  const keys = new Float64Array(FLOP_BOARDS);
  const cardBelow = new Int32Array(49);
  const cardNotQualified = new Int32Array(49);
  const sixValue = new Int32Array(49);
  const sixSorted = new Int32Array(47);
  const board = new Int32Array(4);

  for (let t = 0; t < 49; t++) {
    for (let r = t + 1; r < 49; r++) {
      board[0] = flopMasks[0];
      board[1] = flopMasks[1];
      board[2] = flopMasks[2];
      board[3] = flopMasks[3];
      board[rest[t] & 3] |= 1 << (rest[t] >> 2);
      board[rest[r] & 3] |= 1 << (rest[r] >> 2);
      const boardValue = evaluateMasks(board[0], board[1], board[2], board[3]);
      const boardRanks = board[0] | board[1] | board[2] | board[3];

      // Board plus one card, for counting the simple strategy's dealer outs.
      for (let c = 0, k = 0; c < 49; c++) {
        if (c === t || c === r) continue;
        const card = rest[c];
        const bit = 1 << (card >> 2);
        const s = card & 3;
        const v = evaluateMasks(
          s === 0 ? board[0] | bit : board[0],
          s === 1 ? board[1] | bit : board[1],
          s === 2 ? board[2] | bit : board[2],
          s === 3 ? board[3] | bit : board[3],
        );
        sixValue[c] = v;
        sixSorted[k++] = v;
      }
      sixSorted.sort();

      // Every two-card hand on this board, sorted by value (hole index in the low 11 bits).
      let n = 0;
      for (let i = 0; i < 49; i++) {
        if (i === t || i === r) continue;
        const ci = rest[i];
        for (let j = i + 1; j < 49; j++) {
          if (j === t || j === r) continue;
          const h = HOLE_AT[i * 49 + j];
          const v = evaluateWithTwo(board, ci, rest[j]);
          value[h] = v;
          keys[n++] = v * 2048 + h;
        }
      }
      keys.sort();

      // Walk the hands from weakest to strongest, one group of equal values at a time.
      cardBelow.fill(0);
      let below = 0;
      let notQualified = -1;
      for (let g = 0; g < n; ) {
        const v = Math.floor(keys[g] / 2048);
        let e = g + 1;
        while (e < n && Math.floor(keys[e] / 2048) === v) e++;
        if (notQualified < 0 && v >= PAIR_OR_BETTER) {
          notQualified = below;
          cardNotQualified.set(cardBelow);
        }
        for (let k = g; k < e; k++) {
          const h = keys[k] % 2048;
          wins[h] = below - cardBelow[PAIR_I[h]] - cardBelow[PAIR_J[h]];
        }
        for (let k = g; k < e; k++) {
          const h = keys[k] % 2048;
          cardBelow[PAIR_I[h]]++;
          cardBelow[PAIR_J[h]]++;
        }
        below += e - g;
        for (let k = g; k < e; k++) {
          const h = keys[k] % 2048;
          // Hands at or below this one, sharing no card with it (it holds both of its own cards: +1).
          ties[h] = below - cardBelow[PAIR_I[h]] - cardBelow[PAIR_J[h]] + 1 - wins[h];
        }
        g = e;
      }
      if (notQualified < 0) {
        notQualified = below;
        cardNotQualified.set(cardBelow);
      }

      for (let k = 0; k < n; k++) {
        const h = keys[k] % 2048;
        const i = PAIR_I[h];
        const j = PAIR_J[h];
        const v = value[h];
        const win = wins[h];
        const tie = ties[h];
        const lose = 990 - win - tie;
        let winQualified: number;
        let loseQualified: number;
        if (v >= PAIR_OR_BETTER) {
          winQualified = win - (notQualified - cardNotQualified[i] - cardNotQualified[j]);
          loseQualified = lose;
        } else {
          winQualified = 0;
          const loseNotQualified = notQualified - cardNotQualified[i] - cardNotQualified[j] + 1 - win - tie;
          loseQualified = lose - loseNotQualified;
        }
        const d = 2 * (win - lose);
        const c = 2 * win * blindPays(v) + 2 * (winQualified - lose - loseQualified);
        sumD[h] += d;
        sumC[h] += c;
        const bet = d + c;
        if (bet > FOLD_SCALED) {
          optimalRiver[h] += bet;
          optimalRiverBets[h]++;
        } else optimalRiver[h] += FOLD_SCALED;

        let simpleBets = hasHiddenPairOrBetter(rest[i], rest[j], boardRanks, v, boardValue);
        if (!simpleBets) {
          // Outs: board-plus-one values above the player's, not counting the player's own two cards.
          let lo = 0;
          let hi = 47;
          while (lo < hi) {
            const mid = (lo + hi) >> 1;
            if (sixSorted[mid] > v) hi = mid;
            else lo = mid + 1;
          }
          const outs = 47 - lo - +(sixValue[i] > v) - +(sixValue[j] > v);
          simpleBets = outs < SIMPLE_STRATEGY_OUTS_LIMIT;
        }
        if (simpleBets) {
          simpleRiver[h] += bet;
          simpleRiverBets[h]++;
        } else simpleRiver[h] += FOLD_SCALED;
      }
    }
  }

  return {
    flop: [...flop],
    rest,
    sumD,
    sumC,
    optimalRiver,
    optimalRiverBets,
    simpleRiver,
    simpleRiverBets,
    simpleFlopBets: simpleFlop,
  };
}
