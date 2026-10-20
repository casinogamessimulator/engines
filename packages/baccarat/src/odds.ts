import { bankerDraws, DEFAULT_RULES, isNatural, playerDraws, type Bet, type TableRules } from './rules.ts';

/**
 * Shoe composition by baccarat value: index 0 counts tens and faces, 1..9 count aces to nines.
 * A full deck is [16, 4, 4, 4, 4, 4, 4, 4, 4, 4].
 */
export type Composition = readonly number[];

export function shoeComposition(decks: number): number[] {
  return [16 * decks, ...Array.from({ length: 9 }, () => 4 * decks)];
}

/**
 * Exact outcome counts. Like Wizard of Odds' tables, every coup is counted as an ordered draw of six
 * cards (hands that use four or five are extended with every possible unused card), so the counts are
 * integers that sum to n·(n−1)·…·(n−5) for an n-card shoe.
 */
export interface OutcomeCounts {
  total: number;
  banker: number;
  player: number;
  tie: number;
  /** Banker wins with three cards totaling 7: part of `banker`. */
  bankerThreeCardSeven: number;
}

export interface Odds {
  banker: number;
  player: number;
  tie: number;
  bankerThreeCardSeven: number;
}

/**
 * Counts every possible coup from a shoe by exhaustive enumeration over card values: at most 10⁶
 * value sequences, a few milliseconds. Counts stay exact (below 2⁵³) for shoes up to 8 decks.
 */
export function countOutcomes(composition: Composition): OutcomeCounts {
  if (composition.length !== 10) throw new Error('A composition has 10 values');
  const left = [...composition];
  const n = left.reduce((sum, count) => sum + count, 0);
  if (n < 6) throw new Error('A coup needs at least six cards in the shoe');
  if (n * (n - 1) * (n - 2) * (n - 3) * (n - 4) * (n - 5) > Number.MAX_SAFE_INTEGER)
    throw new Error('Shoe too large to count exactly (8 decks at most)');

  const counts: OutcomeCounts = { total: 0, banker: 0, player: 0, tie: 0, bankerThreeCardSeven: 0 };
  const record = (player: number, banker: number, bankerCards: number, ways: number) => {
    counts.total += ways;
    if (banker > player) {
      counts.banker += ways;
      if (banker === 7 && bankerCards === 3) counts.bankerThreeCardSeven += ways;
    } else if (player > banker) counts.player += ways;
    else counts.tie += ways;
  };

  // Deal order: player, banker, player, banker, then the third cards.
  for (let p1 = 0; p1 < 10; p1++) {
    const w1 = left[p1];
    if (!w1) continue;
    left[p1]--;
    for (let b1 = 0; b1 < 10; b1++) {
      const w2 = w1 * left[b1];
      if (!w2) continue;
      left[b1]--;
      for (let p2 = 0; p2 < 10; p2++) {
        const w3 = w2 * left[p2];
        if (!w3) continue;
        left[p2]--;
        for (let b2 = 0; b2 < 10; b2++) {
          const w4 = w3 * left[b2];
          if (!w4) continue;
          left[b2]--;
          const player = (p1 + p2) % 10;
          const banker = (b1 + b2) % 10;
          if (isNatural(player) || isNatural(banker)) {
            record(player, banker, 2, w4 * (n - 4) * (n - 5));
          } else if (playerDraws(player)) {
            for (let p3 = 0; p3 < 10; p3++) {
              const w5 = w4 * left[p3];
              if (!w5) continue;
              const playerFinal = (player + p3) % 10;
              if (bankerDraws(banker, p3)) {
                left[p3]--;
                for (let b3 = 0; b3 < 10; b3++) {
                  const w6 = w5 * left[b3];
                  if (w6) record(playerFinal, (banker + b3) % 10, 3, w6);
                }
                left[p3]++;
              } else record(playerFinal, banker, 2, w5 * (n - 5));
            }
          } else if (bankerDraws(banker, null)) {
            for (let b3 = 0; b3 < 10; b3++) {
              const w5 = w4 * left[b3];
              if (w5) record(player, (banker + b3) % 10, 3, w5 * (n - 5));
            }
          } else record(player, banker, 2, w4 * (n - 4) * (n - 5));
          left[b2]++;
        }
        left[p2]++;
      }
      left[b1]++;
    }
    left[p1]++;
  }
  return counts;
}

export function oddsFromCounts(counts: OutcomeCounts): Odds {
  return {
    banker: counts.banker / counts.total,
    player: counts.player / counts.total,
    tie: counts.tie / counts.total,
    bankerThreeCardSeven: counts.bankerThreeCardSeven / counts.total,
  };
}

const oddsByDecks = new Map<number, Odds>();

/** Exact probabilities off the top of a fresh shoe of `decks` decks (memoized). */
export function exactOdds(decks: number): Odds {
  let odds = oddsByDecks.get(decks);
  if (!odds) {
    odds = oddsFromCounts(countOutcomes(shoeComposition(decks)));
    oddsByDecks.set(decks, odds);
  }
  return odds;
}

/** Expected return of a one-unit bet, stake included (1 would be a fair game). Ties push banker and player. */
export function expectedReturn(odds: Odds, bet: Bet, rules: TableRules = DEFAULT_RULES): number {
  switch (bet) {
    case 'tie':
      return odds.tie * (rules.tiePays + 1);
    case 'player':
      return 2 * odds.player + odds.tie;
    case 'banker':
      if (rules.variant === 'no-commission')
        return 2 * (odds.banker - odds.bankerThreeCardSeven) + odds.bankerThreeCardSeven + odds.tie;
      return (2 - rules.commission) * odds.banker + odds.tie;
  }
}

/** House edge per bet made, ties included as pushes (the usual way to quote it: 1.06% on banker, 8 decks). */
export function houseEdge(odds: Odds, bet: Bet, rules: TableRules = DEFAULT_RULES): number {
  return 1 - expectedReturn(odds, bet, rules);
}

/** House edge per bet resolved, leaving out the hands where it pushed. */
export function houseEdgeExcludingPushes(odds: Odds, bet: Bet, rules: TableRules = DEFAULT_RULES): number {
  let pushes = 0;
  if (bet !== 'tie') pushes += odds.tie;
  if (bet === 'banker' && rules.variant === 'no-commission') pushes += odds.bankerThreeCardSeven;
  return houseEdge(odds, bet, rules) / (1 - pushes);
}
