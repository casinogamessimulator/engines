import { PAY_CLASS_COUNT, PayClass } from './evaluate.ts';

/**
 * Paytables are plain data (ids, labels, numbers), so rules travel inside a serialized round.
 * `pays` is indexed by PayClass and gives the win per unit bet, "to 1"; 0 means the bet loses (pair
 * plus) or nothing extra is paid (ante bonus).
 */
export interface Paytable {
  id: string;
  /** The short label players use. */
  label: string;
  pays: readonly number[];
}

interface PairPlusInput {
  miniRoyal?: number;
  straightFlush: number;
  threeOfAKind: number;
  straight: number;
  flush: number;
  pair: number;
}

function pairPlus(p: PairPlusInput): Paytable {
  const pays = new Array<number>(PAY_CLASS_COUNT).fill(0);
  pays[PayClass.Pair] = p.pair;
  pays[PayClass.Flush] = p.flush;
  pays[PayClass.Straight] = p.straight;
  pays[PayClass.ThreeOfAKind] = p.threeOfAKind;
  pays[PayClass.StraightFlush] = p.straightFlush;
  pays[PayClass.MiniRoyal] = pays[PayClass.MiniRoyalSpades] = p.miniRoyal ?? p.straightFlush;
  // Labelled as players read the felt, smallest pay first: 1/3/6/30/40, then the mini royal if any.
  const parts = [p.pair, p.flush, p.straight, p.threeOfAKind, p.straightFlush];
  if (p.miniRoyal !== undefined) parts.push(p.miniRoyal);
  const label = parts.join('/');
  return { id: `pair-plus-${parts.join('-')}`, label, pays };
}

/**
 * Pair plus paytables seen in casinos, as catalogued by Wizard of Odds. The first is the default and
 * the most common. Those with a sixth number pay a mini royal (A-K-Q suited) above other straight flushes.
 */
export const pairPlusPaytables: Paytable[] = [
  pairPlus({ straightFlush: 40, threeOfAKind: 30, straight: 6, flush: 3, pair: 1 }),
  pairPlus({ straightFlush: 40, threeOfAKind: 30, straight: 6, flush: 4, pair: 1 }),
  pairPlus({ straightFlush: 35, threeOfAKind: 33, straight: 6, flush: 4, pair: 1 }),
  pairPlus({ straightFlush: 40, threeOfAKind: 25, straight: 6, flush: 4, pair: 1 }),
  pairPlus({ straightFlush: 35, threeOfAKind: 25, straight: 6, flush: 4, pair: 1 }),
  pairPlus({ straightFlush: 50, threeOfAKind: 30, straight: 6, flush: 3, pair: 1 }),
  pairPlus({ straightFlush: 40, threeOfAKind: 30, straight: 5, flush: 4, pair: 1 }),
  pairPlus({ straightFlush: 40, threeOfAKind: 25, straight: 5, flush: 4, pair: 1 }),
  pairPlus({ straightFlush: 40, threeOfAKind: 32, straight: 6, flush: 4, pair: 1 }),
  pairPlus({ straightFlush: 42, threeOfAKind: 38, straight: 6, flush: 4, pair: 1 }),
  pairPlus({ miniRoyal: 80, straightFlush: 40, threeOfAKind: 25, straight: 6, flush: 3, pair: 1 }),
  pairPlus({ miniRoyal: 50, straightFlush: 40, threeOfAKind: 30, straight: 6, flush: 3, pair: 1 }),
  pairPlus({ miniRoyal: 50, straightFlush: 40, threeOfAKind: 30, straight: 5, flush: 4, pair: 1 }),
  pairPlus({ miniRoyal: 200, straightFlush: 40, threeOfAKind: 30, straight: 6, flush: 3, pair: 1 }),
  pairPlus({ miniRoyal: 100, straightFlush: 50, threeOfAKind: 30, straight: 6, flush: 3, pair: 1 }),
  pairPlus({ miniRoyal: 50, straightFlush: 40, threeOfAKind: 30, straight: 6, flush: 4, pair: 1 }),
];

interface AnteBonusInput {
  miniRoyalSpades?: number;
  miniRoyal?: number;
  straightFlush: number;
  threeOfAKind: number;
  straight: number;
}

function anteBonus(p: AnteBonusInput): Paytable {
  const pays = new Array<number>(PAY_CLASS_COUNT).fill(0);
  pays[PayClass.Straight] = p.straight;
  pays[PayClass.ThreeOfAKind] = p.threeOfAKind;
  pays[PayClass.StraightFlush] = p.straightFlush;
  pays[PayClass.MiniRoyal] = p.miniRoyal ?? p.straightFlush;
  pays[PayClass.MiniRoyalSpades] = p.miniRoyalSpades ?? pays[PayClass.MiniRoyal];
  // Labelled biggest pay first, as ante bonus tables are usually quoted: 5/4/1.
  const parts = [p.straightFlush, p.threeOfAKind, p.straight];
  if (p.miniRoyal !== undefined) parts.unshift(p.miniRoyal);
  if (p.miniRoyalSpades !== undefined) parts.unshift(p.miniRoyalSpades);
  const label = parts.join('/');
  return { id: `ante-bonus-${parts.join('-')}`, label, pays };
}

/**
 * Ante bonus paytables, paid on the ante when the player plays, whatever the dealer holds. The first is
 * the default and the standard. Five-number tables pay a mini royal, then a spade mini royal, extra.
 */
export const anteBonusPaytables: Paytable[] = [
  anteBonus({ straightFlush: 5, threeOfAKind: 4, straight: 1 }),
  anteBonus({ straightFlush: 4, threeOfAKind: 3, straight: 1 }),
  anteBonus({ straightFlush: 3, threeOfAKind: 2, straight: 1 }),
  anteBonus({ straightFlush: 5, threeOfAKind: 3, straight: 1 }),
  anteBonus({ straightFlush: 9, threeOfAKind: 8, straight: 1 }),
  anteBonus({ straightFlush: 12.5, threeOfAKind: 10, straight: 1 }),
  anteBonus({ miniRoyalSpades: 50, miniRoyal: 10, straightFlush: 4, threeOfAKind: 3, straight: 0 }),
  anteBonus({ miniRoyalSpades: 50, miniRoyal: 50, straightFlush: 8, threeOfAKind: 6, straight: 0 }),
  anteBonus({ miniRoyalSpades: 10, miniRoyal: 10, straightFlush: 5, threeOfAKind: 4, straight: 1 }),
];

export const DEFAULT_PAIR_PLUS = pairPlusPaytables[0];
export const DEFAULT_ANTE_BONUS = anteBonusPaytables[0];

function find(tables: Paytable[], id: string): Paytable {
  const table = tables.find((t) => t.id === id);
  if (!table) throw new Error(`Unknown paytable "${id}"`);
  return table;
}

export const getPairPlusPaytable = (id: string): Paytable => find(pairPlusPaytables, id);
export const getAnteBonusPaytable = (id: string): Paytable => find(anteBonusPaytables, id);
