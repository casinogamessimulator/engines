import { newDeck, randomSeed, seededRandomInt, shuffle, type Card } from './cards.ts';
import { bestFive, evaluate, handName, PAIR_OR_BETTER, type HandValue } from './evaluate.ts';
import { blindPays, DEFAULT_TRIPS_PAYTABLE, paytablePays, type TripsPaytable } from './paytables.ts';

/*
 * One round, as plain data: every function here is pure and returns a new Round, so a round can be
 * stored, sent and replayed as JSON. The deck is shuffled once from the seed; the player's cards are
 * deck[0..1], the dealer's deck[2..3] and the board deck[4..8].
 *
 * Streets and the player's options:
 *   preflop: check, or play 3x or 4x the ante
 *   flop:    (3 board cards showing) check, or play 2x
 *   river:   (all 5 showing) play 1x, or fold
 * Playing ends the decisions: the rest of the board comes and the round settles.
 */

export type Street = 'preflop' | 'flop' | 'river' | 'complete';

export type Action = { type: 'check' } | { type: 'play'; multiple: 1 | 2 | 3 | 4 } | { type: 'fold' };

export type Outcome = 'win' | 'lose' | 'tie' | 'fold';

export interface Settlement {
  outcome: Outcome;
  playerValue: HandValue;
  dealerValue: HandValue;
  playerHand: string;
  dealerHand: string;
  /** The five cards each side plays, strongest first. */
  playerBest: Card[];
  dealerBest: Card[];
  /** Pair or better; otherwise the ante pushes. */
  dealerQualifies: boolean;
  /** Net result of each bet (positive = won, negative = lost, 0 = push). */
  ante: number;
  blind: number;
  play: number;
  trips: number;
  total: number;
}

export interface Round {
  version: 1;
  seed: number;
  deck: Card[];
  ante: number;
  /** Always equal to the ante. */
  blind: number;
  /** Trips side bet, 0 for none. */
  trips: number;
  tripsPaytable: TripsPaytable;
  street: Street;
  /** The play bet (multiple × ante), 0 until the player plays. */
  play: number;
  actions: Action[];
  settlement: Settlement | null;
}

export interface RoundOptions {
  ante: number;
  trips?: number;
  /** Omit for an unpredictable deal from the cryptographic RNG. */
  seed?: number;
  tripsPaytable?: TripsPaytable;
}

export function createRound({ ante, trips = 0, seed = randomSeed(), tripsPaytable = DEFAULT_TRIPS_PAYTABLE }: RoundOptions): Round {
  if (!(ante > 0) || !Number.isFinite(ante)) throw new Error('The ante must be a positive amount');
  if (!(trips >= 0) || !Number.isFinite(trips)) throw new Error('The trips bet must be zero or a positive amount');
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffff_ffff) throw new Error('The seed must be a 32-bit unsigned integer');
  return {
    version: 1,
    seed,
    deck: shuffle(newDeck(), seededRandomInt(seed)),
    ante,
    blind: ante,
    trips,
    tripsPaytable: { ...tripsPaytable },
    street: 'preflop',
    play: 0,
    actions: [],
    settlement: null,
  };
}

export const playerCards = (round: Round): Card[] => round.deck.slice(0, 2);

/** The dealer's cards, once the round is over. */
export const dealerCards = (round: Round): Card[] | null => (round.street === 'complete' ? round.deck.slice(2, 4) : null);

const BOARD_SHOWN: Record<Street, number> = { preflop: 0, flop: 3, river: 5, complete: 5 };

/** The board cards showing on the round's street. */
export const visibleBoard = (round: Round): Card[] => round.deck.slice(4, 4 + BOARD_SHOWN[round.street]);

export function legalActions(round: Round): Action[] {
  switch (round.street) {
    case 'preflop':
      return [{ type: 'check' }, { type: 'play', multiple: 3 }, { type: 'play', multiple: 4 }];
    case 'flop':
      return [{ type: 'check' }, { type: 'play', multiple: 2 }];
    case 'river':
      return [{ type: 'play', multiple: 1 }, { type: 'fold' }];
    case 'complete':
      return [];
  }
}

const sameAction = (a: Action, b: Action): boolean => a.type === b.type && (a.type !== 'play' || (b.type === 'play' && a.multiple === b.multiple));

export function isLegal(round: Round, action: Action): boolean {
  return legalActions(round).some((legal) => sameAction(legal, action));
}

const NEXT_STREET: Record<'preflop' | 'flop', Street> = { preflop: 'flop', flop: 'river' };

export function applyAction(round: Round, action: Action): Round {
  if (!isLegal(round, action)) throw new Error(`Can't ${describeAction(action)} on the ${round.street}`);
  const actions = [...round.actions, action];
  if (action.type === 'check') return { ...round, actions, street: NEXT_STREET[round.street as 'preflop' | 'flop'] };
  const play = action.type === 'play' ? action.multiple * round.ante : 0;
  const finished: Round = { ...round, actions, play, street: 'complete' };
  return { ...finished, settlement: settle(finished, action.type === 'fold') };
}

export function describeAction(action: Action): string {
  return action.type === 'play' ? `play ${action.multiple}x` : action.type;
}

/** Settles a round whose decisions are over: the play bet is set, or the player folded. */
export function settle(round: Round, folded: boolean): Settlement {
  const board = round.deck.slice(4, 9);
  const player = [...round.deck.slice(0, 2), ...board];
  const dealer = [...round.deck.slice(2, 4), ...board];
  const playerValue = evaluate(player);
  const dealerValue = evaluate(dealer);
  const dealerQualifies = dealerValue >= PAIR_OR_BETTER;
  const tripsPays = paytablePays(round.tripsPaytable, playerValue);
  const trips = round.trips === 0 ? 0 : tripsPays > 0 ? round.trips * tripsPays : -round.trips;

  let outcome: Outcome;
  let ante: number;
  let blind: number;
  let play: number;
  if (folded) {
    outcome = 'fold';
    ante = -round.ante;
    blind = -round.blind;
    play = 0;
  } else if (playerValue > dealerValue) {
    outcome = 'win';
    ante = dealerQualifies ? round.ante : 0;
    blind = round.blind * blindPays(playerValue);
    play = round.play;
  } else if (playerValue < dealerValue) {
    outcome = 'lose';
    ante = dealerQualifies ? -round.ante : 0;
    blind = -round.blind;
    play = -round.play;
  } else {
    outcome = 'tie';
    ante = blind = play = 0;
  }

  return {
    outcome,
    playerValue,
    dealerValue,
    playerHand: handName(playerValue),
    dealerHand: handName(dealerValue),
    playerBest: bestFive(player).cards,
    dealerBest: bestFive(dealer).cards,
    dealerQualifies,
    ante,
    blind,
    play,
    trips,
    total: ante + blind + play + trips,
  };
}

/** Total staked on the round: ante, blind, play and trips. */
export const totalWagered = (round: Round): number => round.ante + round.blind + round.play + round.trips;
