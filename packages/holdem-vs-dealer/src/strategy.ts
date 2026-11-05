import { ACE, JACK, KING, QUEEN, TEN, type Card } from './cards.ts';
import { categoryOf, evaluateMasks, evaluateWithOne, evaluateWithTwo, HandCategory, suitMasks, type HandValue } from './evaluate.ts';

/*
 * The simple strategy published by the Wizard of Odds (Michael Shackleford) for this game, whose rules
 * follow the casino game sold as Ultimate Texas Hold'em. Source: wizardofodds.com, "Ultimate Texas Hold
 * 'Em", section "Wizard strategy", which gives it a house edge of 2.43% and an element of risk of 0.58%
 * (vs 2.185% for optimal play). Exhaustive enumeration (scripts/compute-exact.ts) of the strategy as
 * read below gives 2.433% and 0.584%.
 *
 * Before the flop, raise 4x with:
 *   - any pair 3-3 or higher (check 2-2)
 *   - any ace
 *   - king with any suited card; K-5 offsuit or better
 *   - Q-6 suited or better; Q-8 offsuit or better
 *   - J-8 suited or better; J-T offsuit
 * After the flop, bet 2x with:
 *   - two pair or better (as published: trips on the flop alone count)
 *   - a hidden pair, except pocket deuces (hidden = at least one of the pair's cards is a hole card)
 *   - four to a flush, including a hole card of that suit ranked 10 or higher
 * After the river, bet 1x with:
 *   - a hidden pair or better
 *   - fewer than 21 dealer "outs" that beat you; otherwise fold.
 *
 * Interpretation notes, where the source leaves room:
 *   - "Hidden pair or better" at the river: the hole cards make a better kind of hand than the board
 *     alone (pocket 3s on A-A-K-K don't count). Of the readings tried, this one together with the
 *     literal flop "two pair or better" is the only one that reproduces both published figures; the
 *     others land between 2.38% and 2.46%.
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
  if (categoryOf(value) >= HandCategory.TwoPair) return true;

  const ra = hole[0] >> 2;
  const rb = hole[1] >> 2;
  const flopRanks = flop.reduce((ranks, c) => ranks | (1 << (c >> 2)), 0);
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
 * Hidden pair or better at the river, from the player's value and the board's own value (the
 * enumeration calls this in its hot loop): the hole cards make a better kind of hand than the board.
 */
export function hasHiddenPairOrBetter(player: HandValue, board: HandValue): boolean {
  return categoryOf(player) > categoryOf(board);
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
  if (hasHiddenPairOrBetter(player, boardValue)) return true;
  return dealerOuts(hole, board) < SIMPLE_STRATEGY_OUTS_LIMIT;
}
