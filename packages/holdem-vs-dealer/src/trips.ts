import type { HandPaytable } from './paytables.ts';
import tripsResults from './results/trips.json' with { type: 'json' };
import type { SevenCardCounts } from './seven-card-counts.ts';

/*
 * The trips side bet pays on the player's final 7-card hand (hole cards plus board), whatever the
 * dealer holds and even if the player folds. So its return depends only on how often each hand comes
 * up in 7 random cards: sevenCardCounts(), stored by scripts/compute-trips.ts.
 */

/** Stored by scripts/compute-trips.ts. */
export const SEVEN_CARD_COUNTS: SevenCardCounts = tripsResults.counts;

/** Expected return per unit of the trips bet (e.g. −0.009 = 0.9% house edge), exactly. */
export function tripsExpectedValue(table: HandPaytable, counts: SevenCardCounts = SEVEN_CARD_COUNTS): number {
  const paid: [number, number][] = [
    [counts.royalFlush, table.royalFlush],
    [counts.straightFlush, table.straightFlush],
    [counts.fourOfAKind, table.fourOfAKind],
    [counts.fullHouse, table.fullHouse],
    [counts.flush, table.flush],
    [counts.straight, table.straight],
    [counts.threeOfAKind, table.threeOfAKind],
  ];
  let total = 0;
  let net = 0;
  for (const [count, pays] of paid) {
    total += count;
    net += count * (pays > 0 ? pays : -1);
  }
  const losers = counts.twoPair + counts.pair + counts.highCard;
  total += losers;
  return (net - losers) / total;
}

/** House edge of a trips paytable: −EV. */
export const tripsHouseEdge = (table: HandPaytable): number => -tripsExpectedValue(table);
