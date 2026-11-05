import { type Card, cardValue } from './cards.ts';
import type { Shoe } from './shoe.ts';

/*
 * Card counting: the common systems as data (a tag per card value), the running count over the cards seen, and
 * its conversion to a true count per deck left. Pure functions over the same cards and shoes the game deals, so
 * the trainer, the drills and the content pages all count the same way.
 */

export type CountingSystemId = 'hi-lo' | 'ko' | 'hi-opt-1' | 'hi-opt-2' | 'omega-2' | 'zen' | 'halves';

export interface CountingSystem {
  id: CountingSystemId;
  name: string;
  /** The tag of each card value, indexed 1 (ace) to 10 (tens and faces); index 0 is unused. */
  tags: readonly number[];
  /** The tags sum to zero over a deck, so the running count converts to a true count per deck left. */
  balanced: boolean;
  /** The largest tag: level 1 systems only add and subtract 1. */
  level: 1 | 2 | 3;
  /**
   * Published correlations (Schlesinger, Blackjack Attack; Wong, Professional Blackjack), between 0 and 1: how
   * well the count predicts when to bet more, when to play differently, and when insurance pays.
   */
  bettingCorrelation: number;
  playingEfficiency: number;
  insuranceCorrelation: number;
  /** Aces are tagged 0 and meant to be tracked on the side. */
  acesOnSide: boolean;
  /**
   * Unbalanced systems start a shoe below zero so the pivot lands near zero; the initial running count depends on
   * the decks. Balanced systems start at 0.
   */
  initialRunningCount: (decks: number) => number;
}

/** Tags written as on the published charts, ace first then 2 to 10, turned into the value-indexed array. */
const tags = (ace: number, two: number, three: number, four: number, five: number, six: number, seven: number, eight: number, nine: number, ten: number): number[] => [
  0,
  ace,
  two,
  three,
  four,
  five,
  six,
  seven,
  eight,
  nine,
  ten,
];

const balanced = () => 0;

export const COUNTING_SYSTEMS: readonly CountingSystem[] = [
  {
    id: 'hi-lo',
    name: 'Hi-Lo',
    tags: tags(-1, 1, 1, 1, 1, 1, 0, 0, 0, -1),
    balanced: true,
    level: 1,
    bettingCorrelation: 0.97,
    playingEfficiency: 0.51,
    insuranceCorrelation: 0.76,
    acesOnSide: false,
    initialRunningCount: balanced,
  },
  {
    id: 'ko',
    name: 'KO (Knock-Out)',
    tags: tags(-1, 1, 1, 1, 1, 1, 1, 0, 0, -1),
    balanced: false,
    level: 1,
    bettingCorrelation: 0.98,
    playingEfficiency: 0.55,
    insuranceCorrelation: 0.78,
    acesOnSide: false,
    // Each deck adds 4 to the count; starting at 4 − 4 × decks puts the pivot at +4 wherever the shoe stands.
    initialRunningCount: (decks) => 4 - 4 * decks,
  },
  {
    id: 'hi-opt-1',
    name: 'Hi-Opt I',
    tags: tags(0, 0, 1, 1, 1, 1, 0, 0, 0, -1),
    balanced: true,
    level: 1,
    bettingCorrelation: 0.88,
    playingEfficiency: 0.61,
    insuranceCorrelation: 0.85,
    acesOnSide: true,
    initialRunningCount: balanced,
  },
  {
    id: 'hi-opt-2',
    name: 'Hi-Opt II',
    tags: tags(0, 1, 1, 2, 2, 1, 1, 0, 0, -2),
    balanced: true,
    level: 2,
    bettingCorrelation: 0.91,
    playingEfficiency: 0.67,
    insuranceCorrelation: 0.91,
    acesOnSide: true,
    initialRunningCount: balanced,
  },
  {
    id: 'omega-2',
    name: 'Omega II',
    tags: tags(0, 1, 1, 2, 2, 2, 1, 0, -1, -2),
    balanced: true,
    level: 2,
    bettingCorrelation: 0.92,
    playingEfficiency: 0.67,
    insuranceCorrelation: 0.85,
    acesOnSide: true,
    initialRunningCount: balanced,
  },
  {
    id: 'zen',
    name: 'Zen Count',
    tags: tags(-1, 1, 1, 2, 2, 2, 1, 0, 0, -2),
    balanced: true,
    level: 2,
    bettingCorrelation: 0.96,
    playingEfficiency: 0.63,
    insuranceCorrelation: 0.85,
    acesOnSide: false,
    initialRunningCount: balanced,
  },
  {
    id: 'halves',
    name: 'Wong Halves',
    tags: tags(-1, 0.5, 1, 1, 1.5, 1, 0.5, 0, -0.5, -1),
    balanced: true,
    level: 3,
    bettingCorrelation: 0.99,
    playingEfficiency: 0.56,
    insuranceCorrelation: 0.72,
    acesOnSide: false,
    initialRunningCount: balanced,
  },
];

export const COUNTING_SYSTEM_IDS: readonly CountingSystemId[] = COUNTING_SYSTEMS.map((system) => system.id);

export const isCountingSystemId = (id: string): id is CountingSystemId => (COUNTING_SYSTEM_IDS as readonly string[]).includes(id);

export function getCountingSystem(id: CountingSystemId): CountingSystem {
  const system = COUNTING_SYSTEMS.find((s) => s.id === id);
  if (!system) throw new Error(`Unknown counting system "${id}"`);
  return system;
}

/** The tag of a card: +1 for a five in Hi-Lo, −1 for a king. */
export const cardTag = (system: CountingSystem, card: Card): number => system.tags[cardValue(card)];

/** The running count after these cards, starting from the system's initial count for the shoe's decks. */
export function runningCount(system: CountingSystem, cards: readonly Card[], decks = 1): number {
  let count = system.initialRunningCount(decks);
  for (const card of cards) count += system.tags[cardValue(card)];
  // Half-tags can leave binary noise (0.1 + 0.2); the count is a multiple of 0.5.
  return Math.round(count * 2) / 2;
}

/** Decks left as a fraction, e.g. 4.5 with 234 cards left. */
export const decksLeft = (cardsLeft: number): number => cardsLeft / 52;

/**
 * The true count: the running count per deck left, which is what the betting and playing indices of a balanced
 * system are written for. Never divides by less than one card.
 */
export function trueCount(running: number, cardsLeft: number): number {
  return running / decksLeft(Math.max(cardsLeft, 1));
}

/** The cards the shoe has dealt so far, in order. */
export const dealtCards = (shoe: Shoe): Card[] => shoe.cards.slice(0, shoe.next);

/** How many cards of each tag a deck holds, highest tag first: Hi-Lo has 20 at +1, 12 at 0 and 20 at −1. */
export function tagCounts(system: CountingSystem): { tag: number; cards: number }[] {
  const counts = new Map<number, number>();
  for (let value = 1; value <= 10; value++) {
    const tag = system.tags[value];
    const cards = value === 10 ? 16 : 4;
    counts.set(tag, (counts.get(tag) ?? 0) + cards);
  }
  return [...counts.entries()].sort(([a], [b]) => b - a).map(([tag, cards]) => ({ tag, cards }));
}

/** The sum of the tags over one deck: 0 for a balanced system, +4 for KO. */
export const deckSum = (system: CountingSystem): number => tagCounts(system).reduce((sum, { tag, cards }) => sum + tag * cards, 0);

/** How many cards of each value (1 = ace … 10) a shoe holds; index 0 unused. */
const fullCounts = (decks: number): number[] => [0, ...Array.from({ length: 9 }, () => 4 * decks), 16 * decks];

/** A card of a value: aces, the 2 to 9, or a ten/face (the ranks cycle with `n`), suits cycling with `n` too. */
const cardOf = (value: number, n: number): Card => ((value === 1 ? 12 : value === 10 ? 8 + (n % 4) : value - 2) << 2) | (n & 3);

/**
 * The cards a shoe has dealt when a balanced count stands at `trueCount` with `decksLeft` decks still to come: a
 * representative composition, dealt in proportion to the full shoe and then shifted between tags until the dealt
 * cards' tags sum to the running count. Feed it to analyzeHand as `seen` to get exact EVs at that count.
 */
export function dealtAtCount(system: CountingSystem, decks: number, decksLeft: number, trueCount: number): Card[] {
  if (!system.balanced) throw new Error('A representative shoe needs a balanced count');
  const full = fullCounts(decks);
  const total = 52 * decks;
  const left = Math.max(1, Math.min(total - 1, Math.round(decksLeft * 52)));
  const dealtTotal = total - left;
  // The running count the true count implies, on the system's own grid (halves for Wong Halves, whole otherwise).
  const unit = system.tags.some((tag) => tag % 1 !== 0) ? 0.5 : 1;
  const target = Math.round((trueCount * left) / 52 / unit) * unit;
  // In proportion, then fix the rounding on the tens, the largest bucket.
  const dealt = full.map((n) => Math.round((n * dealtTotal) / total));
  dealt[10] += dealtTotal - dealt.reduce((sum, n) => sum + n, 0);
  const sum = () => dealt.reduce((acc, n, value) => acc + n * system.tags[value], 0);
  // Swap a dealt card for an undealt one of another value until the tags add up, each swap chosen to leave the
  // composition as even as possible (the most room on both sides).
  for (let guard = 0; guard < 4 * total; guard++) {
    const delta = target - sum();
    if (Math.abs(delta) < 1e-9) break;
    let best: { v: number; w: number; room: number } | null = null;
    for (let v = 1; v <= 10; v++) {
      if (dealt[v] >= full[v]) continue;
      for (let w = 1; w <= 10; w++) {
        if (w === v || dealt[w] <= 0) continue;
        const step = system.tags[v] - system.tags[w];
        // Only steps that move toward the target without passing it.
        if (step === 0 || Math.sign(step) !== Math.sign(delta) || Math.abs(step) > Math.abs(delta) + 1e-9) continue;
        const room = ((full[v] - dealt[v]) / full[v]) * (dealt[w] / full[w]);
        if (!best || room > best.room) best = { v, w, room };
      }
    }
    if (!best) throw new Error(`No shoe of ${decks} decks has a true count of ${trueCount} with ${decksLeft} decks left`);
    dealt[best.v]++;
    dealt[best.w]--;
  }
  const cards: Card[] = [];
  for (let value = 1; value <= 10; value++) for (let n = 0; n < dealt[value]; n++) cards.push(cardOf(value, n));
  return cards;
}
