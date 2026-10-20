import { newDeck, type Card } from './cards.ts';
import { compareHands, dealerQualifies, evaluateHand, payClassOf, type HandValue, type PayClass } from './evaluate.ts';
import { DEFAULT_ANTE_BONUS, DEFAULT_PAIR_PLUS, type Paytable } from './paytables.ts';
import { Rng, type RngState } from './rng.ts';

/**
 * One round of 3-card vs. dealer (the rules of the casino game sold as Three Card Poker):
 * 1. The player bets an ante, a pair plus side bet, or both, and gets 3 cards. The dealer gets 3 face down.
 * 2. With an ante up, the player folds (losing the ante) or plays, adding a play bet equal to the ante.
 * 3. Played hands get the ante bonus for a straight or better, whatever the dealer holds. Then the
 *    dealer needs queen high or better to qualify. If not, the ante pays 1:1 and the play pushes.
 *    If so, the better hand wins both bets 1:1; a tie pushes both.
 * 4. Pair plus pays on the player's hand alone: the dealer's hand doesn't matter.
 *
 * Every function is pure and every value is plain JSON, so the UI can save and restore rounds freely.
 */

export interface Rules {
  pairPlus: Paytable;
  anteBonus: Paytable;
  /**
   * Whether folding also forfeits a pair plus bet. Wizard of Odds' rules settle pair plus on the hand
   * whatever the player does, the default here; some casinos take it on a fold. It never matters to
   * a player following the optimal strategy, which plays every hand that pair plus pays.
   */
  pairPlusLostOnFold: boolean;
}

export const DEFAULT_RULES: Rules = {
  pairPlus: DEFAULT_PAIR_PLUS,
  anteBonus: DEFAULT_ANTE_BONUS,
  pairPlusLostOnFold: false,
};

export interface Bets {
  ante: number;
  pairPlus: number;
}

export type Decision = 'play' | 'fold';

/** How the ante and play bets ended. */
export type Outcome = 'fold' | 'dealer-not-qualified' | 'win' | 'tie' | 'lose';

export interface Settlement {
  /** Null when there was no ante (a pair-plus-only round). */
  outcome: Outcome | null;
  playerHand: HandValue;
  dealerHand: HandValue;
  dealerQualifies: boolean;
  /** Net result of each bet: positive is a win, negative a loss, 0 a push or no bet. */
  ante: number;
  play: number;
  anteBonus: number;
  pairPlus: number;
  /** Sum of the nets above. */
  net: number;
  /** Everything the player put on the table: ante, play and pair plus. */
  wagered: number;
  /** Everything handed back: the bets that won or pushed plus their winnings. wagered + net. */
  returned: number;
}

export interface Round {
  rules: Rules;
  bets: Bets;
  player: Card[];
  /** Dealt at the start like at the table; the UI keeps them face down until the round settles. */
  dealer: Card[];
  /** 'decide' waits for play or fold; a pair-plus-only round settles straight away. */
  phase: 'decide' | 'settled';
  decision: Decision | null;
  settlement: Settlement | null;
}

function validateBets(bets: Bets): void {
  for (const [name, amount] of Object.entries(bets)) {
    if (!Number.isFinite(amount) || amount < 0) throw new Error(`Invalid ${name} bet ${amount}`);
  }
  if (bets.ante === 0 && bets.pairPlus === 0) throw new Error('A round needs an ante or a pair plus bet');
}

/**
 * Shuffles a fresh deck with `rng` and deals a round. Returns the round and the generator state to deal
 * the next one from, so a whole session replays from a single seed.
 */
export function dealRound(
  rng: RngState,
  bets: Bets,
  rules: Rules = DEFAULT_RULES,
): { round: Round; rng: RngState } {
  validateBets(bets);
  const generator = new Rng(rng);
  const deck = generator.shuffle(newDeck());
  const round = dealCards(deck.slice(0, 3), deck.slice(3, 6), bets, rules);
  return { round, rng: generator.state };
}

/** Starts a round from given cards: for tests, replays and the trainer's practice hands. */
export function dealCards(player: Card[], dealer: Card[], bets: Bets, rules: Rules = DEFAULT_RULES): Round {
  validateBets(bets);
  if (player.length !== 3 || dealer.length !== 3 || new Set([...player, ...dealer]).size !== 6) {
    throw new Error('Player and dealer each need 3 cards, all different');
  }
  const round: Round = {
    rules,
    bets: { ...bets },
    player: [...player],
    dealer: [...dealer],
    phase: 'decide',
    decision: null,
    settlement: null,
  };
  return bets.ante === 0 ? { ...round, phase: 'settled', settlement: settle(round, null) } : round;
}

/** Applies the player's decision and settles every bet. */
export function decide(round: Round, decision: Decision): Round {
  if (round.phase !== 'decide') throw new Error('This round has already been settled');
  if (decision !== 'play' && decision !== 'fold') throw new Error(`Invalid decision "${decision}"`);
  return { ...round, phase: 'settled', decision, settlement: settle(round, decision) };
}

export const play = (round: Round): Round => decide(round, 'play');
export const fold = (round: Round): Round => decide(round, 'fold');

function settle(round: Round, decision: Decision | null): Settlement {
  const { rules, bets } = round;
  const playerHand = evaluateHand(round.player);
  const dealerHand = evaluateHand(round.dealer);
  const qualifies = dealerQualifies(dealerHand);
  const payClass: PayClass = payClassOf(round.player);

  let outcome: Outcome | null = null;
  let ante = 0;
  let playBet = 0;
  let anteBonus = 0;
  if (decision === 'fold') {
    outcome = 'fold';
    ante = -bets.ante;
  } else if (decision === 'play') {
    playBet = bets.ante;
    anteBonus = bets.ante * rules.anteBonus.pays[payClass];
    if (!qualifies) {
      outcome = 'dealer-not-qualified';
      ante = bets.ante;
    } else {
      const result = compareHands(playerHand, dealerHand);
      outcome = result > 0 ? 'win' : result < 0 ? 'lose' : 'tie';
      ante = bets.ante * result;
    }
  }
  const playNet = outcome === 'win' || outcome === 'lose' ? ante : 0;

  let pairPlus = 0;
  if (bets.pairPlus > 0) {
    const forfeited = decision === 'fold' && rules.pairPlusLostOnFold;
    const pays = rules.pairPlus.pays[payClass];
    pairPlus = !forfeited && pays > 0 ? bets.pairPlus * pays : -bets.pairPlus;
  }

  const net = ante + playNet + anteBonus + pairPlus;
  const wagered = bets.ante + playBet + bets.pairPlus;
  return {
    outcome,
    playerHand,
    dealerHand,
    dealerQualifies: qualifies,
    ante,
    play: playNet,
    anteBonus,
    pairPlus,
    net,
    wagered,
    returned: wagered + net,
  };
}
