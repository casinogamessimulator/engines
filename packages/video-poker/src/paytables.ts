import { HAND_CLASS_COUNT, HandClass } from './evaluate.ts';

export const MAX_COINS = 5;
/** Royal flush pays 250 per coin, except 800 per coin (4,000) on a max bet. */
const ROYAL_PER_COIN = 250;
const ROYAL_PER_COIN_MAX_BET = 800;

export type GameId =
  | 'jacks-or-better'
  | 'bonus-poker'
  | 'bonus-poker-deluxe'
  | 'double-bonus'
  | 'double-double-bonus';

/** Payout per coin bet for each hand. Quad tiers that aren't given pay like the next tier down. */
interface PayInput {
  straightFlush: number;
  quadAcesWith2To4?: number;
  quadAces?: number;
  quads2To4WithAToFour?: number;
  quads2To4?: number;
  quads5ToK: number;
  fullHouse: number;
  flush: number;
  straight: number;
  threeOfAKind: number;
  twoPair: number;
  highPair: number;
}

export interface Paytable {
  /** e.g. "jacks-or-better-9-6" */
  id: string;
  game: GameId;
  /** Game name; video poker names stay in English in Spanish and Portuguese casinos too. */
  gameName: string;
  /** Short paytable label players use, e.g. "9/6" (full house / flush). */
  label: string;
  /** Payout per coin, indexed by HandClass, for bets below the max. */
  perCoin: readonly number[];
}

function payTable(game: GameId, gameName: string, label: string, p: PayInput): Paytable {
  const quads2To4 = p.quads2To4 ?? p.quads5ToK;
  const quadAces = p.quadAces ?? p.quads5ToK;
  const perCoin = new Array<number>(HAND_CLASS_COUNT).fill(0);
  perCoin[HandClass.HighPair] = p.highPair;
  perCoin[HandClass.TwoPair] = p.twoPair;
  perCoin[HandClass.ThreeOfAKind] = p.threeOfAKind;
  perCoin[HandClass.Straight] = p.straight;
  perCoin[HandClass.Flush] = p.flush;
  perCoin[HandClass.FullHouse] = p.fullHouse;
  perCoin[HandClass.Quads5ToK] = p.quads5ToK;
  perCoin[HandClass.Quads2To4] = quads2To4;
  perCoin[HandClass.Quads2To4WithAToFour] = p.quads2To4WithAToFour ?? quads2To4;
  perCoin[HandClass.QuadAces] = quadAces;
  perCoin[HandClass.QuadAcesWith2To4] = p.quadAcesWith2To4 ?? quadAces;
  perCoin[HandClass.StraightFlush] = p.straightFlush;
  perCoin[HandClass.RoyalFlush] = ROYAL_PER_COIN;
  return { id: `${game}-${label.replace('/', '-')}`, game, gameName, label, perCoin };
}

/** Total payout (including the returned bet) for each HandClass at `coins` coins bet. */
export function payouts(table: Paytable, coins: number): number[] {
  const pays = table.perCoin.map((perCoin) => perCoin * coins);
  pays[HandClass.RoyalFlush] = (coins === MAX_COINS ? ROYAL_PER_COIN_MAX_BET : ROYAL_PER_COIN) * coins;
  return pays;
}

export const paytables: Paytable[] = [
  payTable('jacks-or-better', 'Jacks or Better', '9/6', {
    straightFlush: 50, quads5ToK: 25, fullHouse: 9, flush: 6, straight: 4, threeOfAKind: 3, twoPair: 2, highPair: 1,
  }),
  payTable('jacks-or-better', 'Jacks or Better', '8/5', {
    straightFlush: 50, quads5ToK: 25, fullHouse: 8, flush: 5, straight: 4, threeOfAKind: 3, twoPair: 2, highPair: 1,
  }),
  payTable('bonus-poker', 'Bonus Poker', '8/5', {
    straightFlush: 50, quadAces: 80, quads2To4: 40, quads5ToK: 25,
    fullHouse: 8, flush: 5, straight: 4, threeOfAKind: 3, twoPair: 2, highPair: 1,
  }),
  payTable('bonus-poker-deluxe', 'Bonus Poker Deluxe', '9/6', {
    straightFlush: 50, quads5ToK: 80, fullHouse: 9, flush: 6, straight: 4, threeOfAKind: 3, twoPair: 1, highPair: 1,
  }),
  payTable('double-bonus', 'Double Bonus Poker', '10/7', {
    straightFlush: 50, quadAces: 160, quads2To4: 80, quads5ToK: 50,
    fullHouse: 10, flush: 7, straight: 5, threeOfAKind: 3, twoPair: 1, highPair: 1,
  }),
  payTable('double-double-bonus', 'Double Double Bonus Poker', '9/6', {
    straightFlush: 50, quadAcesWith2To4: 400, quadAces: 160, quads2To4WithAToFour: 160, quads2To4: 80, quads5ToK: 50,
    fullHouse: 9, flush: 6, straight: 4, threeOfAKind: 3, twoPair: 1, highPair: 1,
  }),
];

export type PaytableRowId =
  | 'royal-flush'
  | 'straight-flush'
  | 'four-aces-with-2-4'
  | 'four-2-4-with-a-4'
  | 'four-aces'
  | 'four-2-4'
  | 'four-5-k'
  | 'four-of-a-kind'
  | 'full-house'
  | 'flush'
  | 'straight'
  | 'three-of-a-kind'
  | 'two-pair'
  | 'jacks-or-better';

export interface PaytableRow {
  id: PaytableRowId;
  /** Hand classes this row pays (all at the same amount). */
  classes: HandClass[];
}

/**
 * The rows a machine shows for this paytable, top to bottom. Quad tiers that pay the same are merged,
 * so Jacks or Better shows one "Four of a Kind" row and Double Double Bonus shows five.
 */
export function paytableRows(table: Paytable): PaytableRow[] {
  const pay = table.perCoin;
  const H = HandClass;
  const row = (id: PaytableRowId, ...classes: HandClass[]): PaytableRow => ({ id, classes });
  const quads = [H.QuadAcesWith2To4, H.QuadAces, H.Quads2To4WithAToFour, H.Quads2To4, H.Quads5ToK];

  const rows = [row('royal-flush', H.RoyalFlush), row('straight-flush', H.StraightFlush)];
  if (quads.every((c) => pay[c] === pay[H.Quads5ToK])) {
    rows.push(row('four-of-a-kind', ...quads));
  } else {
    const acesKicker = pay[H.QuadAcesWith2To4] !== pay[H.QuadAces];
    const lowKicker = pay[H.Quads2To4WithAToFour] !== pay[H.Quads2To4];
    const quadRows = [
      ...(acesKicker ? [row('four-aces-with-2-4', H.QuadAcesWith2To4)] : []),
      ...(lowKicker ? [row('four-2-4-with-a-4', H.Quads2To4WithAToFour)] : []),
      acesKicker ? row('four-aces', H.QuadAces) : row('four-aces', H.QuadAcesWith2To4, H.QuadAces),
      lowKicker ? row('four-2-4', H.Quads2To4) : row('four-2-4', H.Quads2To4WithAToFour, H.Quads2To4),
      row('four-5-k', H.Quads5ToK),
    ];
    rows.push(...quadRows.sort((a, b) => pay[b.classes[0]] - pay[a.classes[0]]));
  }
  rows.push(
    row('full-house', H.FullHouse),
    row('flush', H.Flush),
    row('straight', H.Straight),
    row('three-of-a-kind', H.ThreeOfAKind),
    row('two-pair', H.TwoPair),
    row('jacks-or-better', H.HighPair),
  );
  return rows;
}

export function getPaytable(id: string): Paytable {
  const table = paytables.find((t) => t.id === id);
  if (!table) throw new Error(`Unknown paytable "${id}"`);
  return table;
}
