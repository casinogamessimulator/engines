import { formatCards, type Card } from './cards.ts';
import {
  DEALER_QUALIFIER,
  PAY_CLASS_COUNT,
  PLAY_THRESHOLD,
  evaluate,
  evaluateHand,
  payClassOf,
  type HandValue,
  type PayClass,
} from './evaluate.ts';
import { DEFAULT_ANTE_BONUS, DEFAULT_PAIR_PLUS, type Paytable } from './paytables.ts';
import type { Decision, Outcome } from './round.ts';

// Everything here is exact: every player hand against every dealer hand from the other 49 cards.
export const PLAYER_HANDS = 22_100; // C(52, 3)
export const DEALER_HANDS = 18_424; // C(49, 3)
export const ROUNDS = PLAYER_HANDS * DEALER_HANDS; // 407,170,400

// Hand values of every sorted triple a < b < c, at index a * 2704 + b * 52 + c.
let valueTable: Int32Array | null = null;
function values(): Int32Array {
  if (valueTable) return valueTable;
  valueTable = new Int32Array(52 * 52 * 52);
  for (let a = 0; a < 52; a++)
    for (let b = a + 1; b < 52; b++) for (let c = b + 1; c < 52; c++) valueTable[a * 2704 + b * 52 + c] = evaluate(a, b, c);
  return valueTable;
}

/** How the ante and play bets end against each of the 18,424 dealer hands, if the player plays. */
export interface DealerCounts {
  notQualified: number;
  win: number;
  tie: number;
  lose: number;
}

export function dealerCounts(cards: readonly Card[]): DealerCounts {
  const player = evaluateHand(cards);
  const table = values();
  const used = new Uint8Array(52);
  for (const card of cards) used[card] = 1;
  let notQualified = 0;
  let win = 0;
  let tie = 0;
  let lose = 0;
  for (let a = 0; a < 52; a++) {
    if (used[a]) continue;
    for (let b = a + 1; b < 52; b++) {
      if (used[b]) continue;
      const base = a * 2704 + b * 52;
      for (let c = b + 1; c < 52; c++) {
        if (used[c]) continue;
        const dealer = table[base + c];
        if (dealer < DEALER_QUALIFIER) notQualified++;
        else if (player > dealer) win++;
        else if (player < dealer) lose++;
        else tie++;
      }
    }
  }
  return { notQualified, win, tie, lose };
}

/** Expected net result of playing, per unit of ante (the play bet makes 2 units at risk). */
export function playEv(counts: DealerCounts, anteBonus: number): number {
  return anteBonus + (counts.notQualified + 2 * counts.win - 2 * counts.lose) / DEALER_HANDS;
}

/** Folding loses the ante. */
export const FOLD_EV = -1;

export interface HandAnalysis {
  counts: DealerCounts;
  /** Expected net per unit of ante, ante bonus included, pair plus excluded. */
  play: number;
  fold: number;
  best: Decision;
}

/** Exact EV of playing and folding a hand: 18,424 dealer hands, well under a millisecond. */
export function analyzeHand(cards: readonly Card[], anteBonus: Paytable = DEFAULT_ANTE_BONUS): HandAnalysis {
  const counts = dealerCounts(cards);
  const play = playEv(counts, anteBonus.pays[payClassOf(cards)]);
  return { counts, play, fold: FOLD_EV, best: play >= FOLD_EV ? 'play' : 'fold' };
}

/** The optimal strategy as players learn it: play Q-6-4 or better, fold anything less. */
export function strategyDecision(cards: readonly Card[]): Decision {
  return evaluateHand(cards) >= PLAY_THRESHOLD ? 'play' : 'fold';
}

// --- Whole-game analysis -------------------------------------------------------------------------

const SUIT_PERMUTATIONS: number[][] = [];
for (let a = 0; a < 4; a++)
  for (let b = 0; b < 4; b++)
    for (let c = 0; c < 4; c++)
      for (let d = 0; d < 4; d++) if (new Set([a, b, c, d]).size === 4) SUIT_PERMUTATIONS.push([a, b, c, d]);

const sortedKey = (x: Card, y: Card, z: Card): number => {
  if (x > y) [x, y] = [y, x];
  if (y > z) [y, z] = [z, y];
  if (x > y) [x, y] = [y, x];
  return x * 2704 + y * 52 + z;
};

/** Smallest sorted key over the 24 relabellings of the suits: hands equal up to suits share it. */
function canonicalKey(a: Card, b: Card, c: Card): number {
  let best = Infinity;
  for (const p of SUIT_PERMUTATIONS) {
    const key = sortedKey((a & ~3) | p[a & 3], (b & ~3) | p[b & 3], (c & ~3) | p[c & 3]);
    if (key < best) best = key;
  }
  return best;
}

// Highest card first, as hands are usually written.
const keyCards = (key: number): Card[] => [key % 52, Math.floor(key / 52) % 52, Math.floor(key / 2704)];

export interface HandClassResult {
  /** A representative hand, e.g. "Qd 6c 4c"; the rest of the class differ only by suits. */
  hand: string;
  value: HandValue;
  /** How many of the 22,100 hands are in this class. */
  combinations: number;
  counts: DealerCounts;
  /** EV of playing per unit of ante; folding is -1. */
  play: number;
  best: Decision;
}

export interface OutcomeEvent {
  payClass: PayClass;
  outcome: Outcome;
  /** Net result per unit of ante, ante bonus included. */
  net: number;
  /** Out of 407,170,400 equally likely (player hand, dealer hand) deals. */
  combinations: number;
}

export interface GameAnalysis {
  anteBonus: string;
  /** The player's expected loss per unit of ante under optimal play. */
  houseEdge: number;
  /** The expected loss per unit of total money bet (ante plus play). */
  elementOfRisk: number;
  playProbability: number;
  dealerQualifiesProbability: number;
  /** Chance the round ends ahead, even, or behind for the player, ante bonus included. */
  winProbability: number;
  pushProbability: number;
  lossProbability: number;
  /** Combinations of each (pay class, outcome) pair, Wizard of Odds style. */
  events: OutcomeEvent[];
  netDistribution: { net: number; combinations: number; probability: number }[];
  /**
   * The derived strategy: the weakest hand optimal play plays and the strongest it folds. When
   * `separates`, one threshold describes the optimal decision for all 22,100 hands.
   */
  threshold: { lowestPlayed: string; highestFolded: string; separates: boolean };
  /** Every hand up to suits (1,755 classes), strongest first. */
  hands: HandClassResult[];
}

/**
 * Plays every possible deal under optimal play: each player hand against every dealer hand. Uses suit
 * symmetry (1,755 hand classes instead of 22,100) and takes about half a second.
 */
export function analyzeGame(anteBonus: Paytable = DEFAULT_ANTE_BONUS): GameAnalysis {
  // Dealer counts don't depend on suits, so compute them once per class.
  const classes = new Map<number, { combinations: number; counts: DealerCounts }>();
  const hands: { cards: Card[]; key: number }[] = [];
  for (let a = 0; a < 52; a++)
    for (let b = a + 1; b < 52; b++)
      for (let c = b + 1; c < 52; c++) {
        const key = canonicalKey(a, b, c);
        hands.push({ cards: [c, b, a], key });
        const entry = classes.get(key);
        if (entry) entry.combinations++;
        else classes.set(key, { combinations: 1, counts: dealerCounts(keyCards(key)) });
      }

  // The ante bonus may depend on suits (spade mini royal), so decide and tally hand by hand.
  const events = new Map<string, OutcomeEvent>();
  const add = (payClass: PayClass, outcome: Outcome, net: number, combinations: number) => {
    if (combinations === 0) return;
    const id = `${payClass}:${outcome}`;
    const event = events.get(id);
    if (event) event.combinations += combinations;
    else events.set(id, { payClass, outcome, net, combinations });
  };
  let lowestPlayed = Infinity;
  let highestFolded = -Infinity;
  let lowestPlayedHand: Card[] = [];
  let highestFoldedHand: Card[] = [];
  let notQualified = 0;
  for (const { cards, key } of hands) {
    const { counts } = classes.get(key)!;
    const payClass = payClassOf(cards);
    const bonus = anteBonus.pays[payClass];
    const value = evaluateHand(cards);
    notQualified += counts.notQualified;
    if (playEv(counts, bonus) >= FOLD_EV) {
      if (value < lowestPlayed) [lowestPlayed, lowestPlayedHand] = [value, cards];
      add(payClass, 'dealer-not-qualified', 1 + bonus, counts.notQualified);
      add(payClass, 'win', 2 + bonus, counts.win);
      add(payClass, 'tie', bonus, counts.tie);
      add(payClass, 'lose', -2 + bonus, counts.lose);
    } else {
      if (value > highestFolded) [highestFolded, highestFoldedHand] = [value, cards];
      add(payClass, 'fold', -1, DEALER_HANDS);
    }
  }

  const sorted = [...events.values()].sort((x, y) => y.net - x.net || y.payClass - x.payClass);
  let ev = 0;
  let played = 0;
  const byNet = new Map<number, number>();
  for (const e of sorted) {
    ev += e.net * e.combinations;
    if (e.outcome !== 'fold') played += e.combinations;
    byNet.set(e.net, (byNet.get(e.net) ?? 0) + e.combinations);
  }
  ev /= ROUNDS;
  const playProbability = played / ROUNDS;
  const netDistribution = [...byNet.entries()]
    .sort((x, y) => y[0] - x[0])
    .map(([net, combinations]) => ({ net, combinations, probability: combinations / ROUNDS }));
  const probability = (test: (net: number) => boolean) =>
    netDistribution.filter((n) => test(n.net)).reduce((sum, n) => sum + n.probability, 0);

  const handResults: HandClassResult[] = [...classes.entries()]
    .map(([key, { combinations, counts }]) => {
      const cards = keyCards(key);
      const play = playEv(counts, anteBonus.pays[payClassOf(cards)]);
      return {
        hand: formatCards(cards),
        value: evaluateHand(cards),
        combinations,
        counts,
        play,
        best: play >= FOLD_EV ? ('play' as const) : ('fold' as const),
      };
    })
    .sort((x, y) => y.value - x.value || y.play - x.play);

  return {
    anteBonus: anteBonus.id,
    houseEdge: -ev,
    elementOfRisk: -ev / (1 + playProbability),
    playProbability,
    dealerQualifiesProbability: 1 - notQualified / ROUNDS,
    winProbability: probability((net) => net > 0),
    pushProbability: probability((net) => net === 0),
    lossProbability: probability((net) => net < 0),
    events: sorted,
    netDistribution,
    threshold: {
      lowestPlayed: formatCards(lowestPlayedHand),
      highestFolded: formatCards(highestFoldedHand),
      separates: highestFolded < lowestPlayed,
    },
    hands: handResults,
  };
}

export interface PairPlusAnalysis {
  paytable: string;
  /** The player's expected loss per unit bet. */
  houseEdge: number;
  /** Combinations of each pay class out of 22,100 hands. */
  combinations: number[];
}

/** Pair plus depends on the player's 3 cards only: 22,100 hands. */
export function analyzePairPlus(paytable: Paytable = DEFAULT_PAIR_PLUS): PairPlusAnalysis {
  const combinations = new Array<number>(PAY_CLASS_COUNT).fill(0);
  for (let a = 0; a < 52; a++)
    for (let b = a + 1; b < 52; b++) for (let c = b + 1; c < 52; c++) combinations[payClassOf([a, b, c])]++;
  let ev = 0;
  combinations.forEach((count, payClass) => {
    const pays = paytable.pays[payClass];
    ev += count * (pays > 0 ? pays : -1);
  });
  return { paytable: paytable.id, houseEdge: -ev / PLAYER_HANDS, combinations };
}
