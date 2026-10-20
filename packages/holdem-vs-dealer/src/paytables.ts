import { ACE } from './cards.ts';
import { categoryOf, HandCategory, type HandValue } from './evaluate.ts';

/** Payout to 1 for each hand, best first. A hand worse than all of them loses (trips) or pushes (blind). */
export interface HandPaytable {
  royalFlush: number;
  straightFlush: number;
  fourOfAKind: number;
  fullHouse: number;
  flush: number;
  straight: number;
  threeOfAKind: number;
}

/** The blind's standard paytable, paid when the player beats the dealer; below a straight it pushes. */
export const BLIND_PAYTABLE: Readonly<HandPaytable> = {
  royalFlush: 500,
  straightFlush: 50,
  fourOfAKind: 10,
  fullHouse: 3,
  flush: 1.5,
  straight: 1,
  threeOfAKind: 0,
};

export interface TripsPaytable extends HandPaytable {
  id: string;
}

/** Trips paytables seen in casinos (pays per Wizard of Odds' survey). The first is the default. */
export const TRIPS_PAYTABLES: readonly TripsPaytable[] = [
  { id: '50-40-30-9-7-4-3', royalFlush: 50, straightFlush: 40, fourOfAKind: 30, fullHouse: 9, flush: 7, straight: 4, threeOfAKind: 3 },
  { id: '50-40-30-8-6-5-3', royalFlush: 50, straightFlush: 40, fourOfAKind: 30, fullHouse: 8, flush: 6, straight: 5, threeOfAKind: 3 },
  { id: '50-40-30-8-7-4-3', royalFlush: 50, straightFlush: 40, fourOfAKind: 30, fullHouse: 8, flush: 7, straight: 4, threeOfAKind: 3 },
  { id: '50-40-20-7-6-5-3', royalFlush: 50, straightFlush: 40, fourOfAKind: 20, fullHouse: 7, flush: 6, straight: 5, threeOfAKind: 3 },
];

export const DEFAULT_TRIPS_PAYTABLE: TripsPaytable = TRIPS_PAYTABLES[0];

export function getTripsPaytable(id: string): TripsPaytable {
  const table = TRIPS_PAYTABLES.find((t) => t.id === id);
  if (!table) throw new Error(`Unknown trips paytable "${id}"`);
  return table;
}

/** The payout to 1 a paytable gives a hand, or 0 when the hand isn't on it. */
export function paytablePays(table: HandPaytable, value: HandValue): number {
  switch (categoryOf(value)) {
    case HandCategory.StraightFlush:
      return (value & 15) === ACE ? table.royalFlush : table.straightFlush;
    case HandCategory.FourOfAKind:
      return table.fourOfAKind;
    case HandCategory.FullHouse:
      return table.fullHouse;
    case HandCategory.Flush:
      return table.flush;
    case HandCategory.Straight:
      return table.straight;
    case HandCategory.ThreeOfAKind:
      return table.threeOfAKind;
    default:
      return 0;
  }
}

/** What the blind wins, per unit, when the player's hand beats the dealer's (0 = push). */
export const blindPays = (value: HandValue): number => paytablePays(BLIND_PAYTABLE, value);
