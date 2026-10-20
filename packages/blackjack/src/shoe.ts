import type { Card } from './cards.ts';
import { nextUint32, randomSeed, seedFrom, shuffled } from './rng.ts';

/** A shuffled shoe. Plain data, so it serializes to JSON; drawing returns a new shoe that shares `cards`. */
export interface Shoe {
  /** Decks in a full shoe; 0 for a stacked shoe, which is never reshuffled. */
  readonly decks: number;
  readonly cards: readonly Card[];
  /** Index of the next card to deal. */
  readonly next: number;
  /** Where the cut card sits: once `next` reaches it, the shoe is reshuffled before the next round. */
  readonly cutCard: number;
  /** Share of the shoe dealt before the cut card, e.g. 0.75. */
  readonly penetration: number;
  /** Generator state for the next shuffle. */
  readonly rng: number;
}

export interface ShoeOptions {
  /** Same seed, same sequence of shuffles. Random when left out. */
  seed?: number | string;
  /** Share of the shoe dealt before reshuffling, in (0, 1]. Default 0.75. */
  penetration?: number;
}

export function freshDecks(decks: number): Card[] {
  const cards: Card[] = [];
  for (let deck = 0; deck < decks; deck++) for (let card = 0; card < 52; card++) cards.push(card);
  return cards;
}

export function createShoe(decks: number, options: ShoeOptions = {}): Shoe {
  const penetration = options.penetration ?? 0.75;
  if (!(penetration > 0 && penetration <= 1)) throw new Error(`Penetration must be in (0, 1], not ${penetration}`);
  const rng = options.seed === undefined ? randomSeed() : seedFrom(options.seed);
  return shuffleShoe({ decks, cards: [], next: 0, cutCard: 0, penetration, rng });
}

/** All the shoe's decks reshuffled, with the cut card placed by the penetration. */
export function shuffleShoe(shoe: Shoe): Shoe {
  if (shoe.decks === 0) throw new Error('A stacked shoe ran out of cards');
  // A shoe that ran out mid-round holds only the reshuffled discards; start again from full decks.
  const full = shoe.cards.length === shoe.decks * 52 ? shoe.cards : freshDecks(shoe.decks);
  const [cards, rng] = shuffled(full, shoe.rng);
  // Step the generator once more so consecutive shuffles don't start from related states.
  const [, nextRng] = nextUint32(rng);
  return { ...shoe, cards, next: 0, cutCard: Math.floor(cards.length * shoe.penetration), rng: nextRng };
}

/** A shoe dealing exactly `cards` in order, never reshuffled: for tests and scripted demos. */
export function stackedShoe(cards: readonly Card[]): Shoe {
  return { decks: 0, cards: cards.slice(), next: 0, cutCard: cards.length, penetration: 1, rng: 0 };
}

export function cardsLeft(shoe: Shoe): number {
  return shoe.cards.length - shoe.next;
}

export function pastCutCard(shoe: Shoe): boolean {
  return shoe.next >= shoe.cutCard;
}

export function drawCard(shoe: Shoe): [Card, Shoe] {
  if (shoe.next >= shoe.cards.length) throw new Error('The shoe is empty');
  return [shoe.cards[shoe.next], { ...shoe, next: shoe.next + 1 }];
}
