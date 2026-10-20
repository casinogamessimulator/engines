import { ACE, JACK, KING, QUEEN, TEN, type Card } from './cards.ts';
import { categoryOf, evaluateMasks, evaluateWithOne, evaluateWithTwo, HandCategory, suitMasks, type HandValue } from './evaluate.ts';

/*
 * The simple strategy published by the Wizard of Odds (Michael Shackleford) for this game, whose rules
 * follow the casino game sold as Ultimate Texas Hold'em. Source: wizardofodds.com, "Ultimate Texas Hold
 * 'Em", section "Wizard strategy", which gives it a house edge of 2.43% (vs 2.185% for optimal play);
 * scripts/compute-exact.ts reproduces that figure by exhaustive enumeration.
 *
 * Before the flop, raise 4x with:
 *   - any pair 3-3 or higher (check 2-2)
 *   - any ace
 *   - king with any suited card; K-5 offsuit or better
 *   - Q-6 suited or better; Q-8 offsuit or better
 *   - J-8 suited or better; J-T offsuit
 * After the flop, bet 2x with:
 *   - two pair or better (hole cards must help: trips on the board alone don't count)
 *   - a hidden pair, except pocket deuces (hidden = at least one of the pair's cards is a hole card)
 *   - four to a flush, including a hole card of that suit ranked 10 or higher
 * After the river, bet 1x with:
 *   - a hidden pair or better
 *   - fewer than 21 dealer "outs" that beat you; otherwise fold.
 *
 * Interpretation notes, where the source leaves room:
 *   - "Hidden pair or better" at the river: a pocket pair, a hole card matching a board rank, or a
 *     straight or better that beats the board alone.
 *   - A dealer out is an unseen card that, added to the board, makes a hand that beats yours (the
 *     source: "a dealer hole card that will cause you to lose"; ties don't count). There are 45 unseen
 *     cards.
 */

export const SIMPLE_STRATEGY_OUTS_LIMIT = 21;

/** Before the flop: raise 4x (true) or check. */
export function simplePreflopRaises(hole: readonly Card[]): boolean {
  const ra = hole[0] >> 2;
  const rb = hole[1] >> 2;
  const high = Math.max(ra, rb);
  const low = Math.min(ra, rb);
  const suited = (hole[0] & 3) === (hole[1] & 3);
  if (high === low) return high >= 1; // 3-3 and up
  if (high === ACE) return true;
  if (high === KING) return suited || low >= 3; // K-5 offsuit and up
  if (high === QUEEN) return suited ? low >= 4 : low >= 6; // Q-6 suited, Q-8 offsuit
  if (high === JACK) return suited ? low >= 6 : low >= 8; // J-8 suited, J-T offsuit
  return false;
}

/** After the flop (having checked): bet 2x (true) or check. */
export function simpleFlopBets(hole: readonly Card[], flop: readonly Card[]): boolean {
  const masks = suitMasks([...hole, ...flop]);
  const value = evaluateMasks(masks[0], masks[1], masks[2], masks[3]);
  const flopMasks = suitMasks(flop);
  const flopValue = evaluateMasks(flopMasks[0], flopMasks[1], flopMasks[2], flopMasks[3]);
  if (categoryOf(value) >= HandCategory.TwoPair && categoryOf(value) > categoryOf(flopValue)) return true;

  const ra = hole[0] >> 2;
  const rb = hole[1] >> 2;
  const flopRanks = flopMasks[0] | flopMasks[1] | flopMasks[2] | flopMasks[3];
  if (ra === rb ? ra > 0 : ((flopRanks >> ra) & 1) === 1 || ((flopRanks >> rb) & 1) === 1) return true;

  for (let suit = 0; suit < 4; suit++) {
    let count = 0;
    for (let k = 0; k < 5; k++) if ((((k < 2 ? hole[k] : flop[k - 2]) as number) & 3) === suit) count++;
    if (count !== 4) continue;
    if (hole.some((c) => (c & 3) === suit && c >> 2 >= TEN)) return true;
  }
  return false;
}

/**
 * Hidden pair or better at the river, from precomputed pieces (the enumeration calls this in its hot
 * loop): the hole cards, the board's rank mask, the player's value and the board's own value.
 */
export function hasHiddenPairOrBetter(a: Card, b: Card, boardRanks: number, player: HandValue, board: HandValue): boolean {
  const ra = a >> 2;
  const rb = b >> 2;
  if (ra === rb || ((boardRanks >> ra) & 1) === 1 || ((boardRanks >> rb) & 1) === 1) return true;
  return categoryOf(player) >= HandCategory.Straight && player > board;
}

/** Unseen cards (of 45) that, added to the board, beat the player's hand. */
export function dealerOuts(hole: readonly Card[], board: readonly Card[]): number {
  const masks = suitMasks(board);
  const player = evaluateWithTwo(masks, hole[0], hole[1]);
  const used = new Set([...hole, ...board]);
  let outs = 0;
  for (let c = 0; c < 52; c++) if (!used.has(c) && evaluateWithOne(masks, c) > player) outs++;
  return outs;
}

/** After the river (having checked twice): bet 1x (true) or fold. */
export function simpleRiverBets(hole: readonly Card[], board: readonly Card[]): boolean {
  const masks = suitMasks(board);
  const player = evaluateWithTwo(masks, hole[0], hole[1]);
  const boardValue = evaluateMasks(masks[0], masks[1], masks[2], masks[3]);
  const boardRanks = masks[0] | masks[1] | masks[2] | masks[3];
  if (hasHiddenPairOrBetter(hole[0], hole[1], boardRanks, player, boardValue)) return true;
  return dealerOuts(hole, board) < SIMPLE_STRATEGY_OUTS_LIMIT;
}
