import { type Card, cardValue } from './cards.ts';
import { handTotal, isPair } from './hand.ts';
import { blackjackPayout, doubleAllowedOn, type Rules, validateRules } from './rules.ts';
import { createShoe, drawCard, freshDecks, pastCutCard, type Shoe, type ShoeOptions, shuffleShoe } from './shoe.ts';
import { shuffled } from './rng.ts';

/*
 * One player against the dealer, as a small state machine over plain data: every function takes a Game and returns
 * a new one, so the UI can keep history, replay a seed or save to JSON. Bankroll lives outside; a round only knows
 * what was staked and what came back.
 *
 * Order of play: player card, dealer up card, player card, then the hole card in peek games. With an ace up the
 * player first decides on insurance (even money with a blackjack is the same bet). In peek games the dealer then
 * checks under an ace or ten; with early surrender the check waits for the player's first decision, and if that
 * decision isn't a surrender and the dealer has blackjack, the round ends before it's carried out. With no hole card
 * the dealer's second card comes after the players are done.
 */

export type Action = 'hit' | 'stand' | 'double' | 'split' | 'surrender' | 'insurance' | 'noInsurance';

/** insurance: waiting for the insurance decision. player: waiting for a decision on the active hand. */
export type Phase = 'insurance' | 'player' | 'done';

export interface PlayerHand {
  cards: Card[];
  /** Total staked on this hand, doubling included. */
  bet: number;
  doubled: boolean;
  /** Made by splitting: never a blackjack, can't surrender, doubles only with DAS. */
  fromSplit: boolean;
  surrendered: boolean;
  /** No more decisions on this hand. */
  done: boolean;
}

export type HandOutcome = 'blackjack' | 'win' | 'push' | 'lose' | 'bust' | 'surrender';

export interface HandResult {
  outcome: HandOutcome;
  /** What was staked on the hand. */
  staked: number;
  /** Won (positive) or lost (negative), not counting the returned stake. */
  net: number;
}

export interface Settlement {
  hands: HandResult[];
  /** Net result of the insurance bet (0 when none was taken). */
  insurance: number;
  /** Net result of the whole round. */
  net: number;
  dealerTotal: number;
  dealerBlackjack: boolean;
}

export interface Round {
  /** The original bet. */
  bet: number;
  /** Up card first. In peek games the hole card is dealt at once but stays face down until the round is done. */
  dealer: Card[];
  hands: PlayerHand[];
  /** Index of the hand being played. */
  active: number;
  phase: Phase;
  /** Amount staked on insurance; 0 when not taken. */
  insurance: number;
  /** The dealer has checked for blackjack. */
  peeked: boolean;
  settlement: Settlement | null;
}

export interface Game {
  rules: Rules;
  shoe: Shoe;
  round: Round | null;
}

export function newGame(rules: Rules, options: ShoeOptions = {}): Game {
  validateRules(rules);
  return { rules, shoe: createShoe(rules.decks, options), round: null };
}

/** A game dealing from a given shoe, e.g. a stacked one in tests. */
export function newGameWithShoe(rules: Rules, shoe: Shoe): Game {
  validateRules(rules);
  return { rules, shoe, round: null };
}

/** Starts a round, reshuffling first if the cut card came out. */
export function deal(game: Game, bet: number): Game {
  if (game.round && game.round.phase !== 'done') throw new Error('The round is still being played');
  if (!(bet > 0)) throw new Error(`Invalid bet ${bet}`);
  const table = new Table(game.rules, pastCutCard(game.shoe) ? shuffleShoe(game.shoe) : game.shoe, null);
  const first = table.draw();
  const up = table.draw();
  const second = table.draw();
  const dealer = [up];
  if (game.rules.holeCard === 'peek') dealer.push(table.draw());
  const round: Round = {
    bet,
    dealer,
    hands: [{ cards: [first, second], bet, doubled: false, fromSplit: false, surrendered: false, done: false }],
    active: 0,
    phase: 'player',
    insurance: 0,
    peeked: false,
    settlement: null,
  };
  table.round = round;
  if (cardValue(up) === 1) round.phase = 'insurance';
  else table.afterInsurance();
  return table.game();
}

export function legalActions(game: Game): Action[] {
  const { rules, round } = game;
  if (!round || round.phase === 'done') return [];
  if (round.phase === 'insurance') return ['insurance', 'noInsurance'];
  const hand = round.hands[round.active];
  const { total, soft } = handTotal(hand.cards);
  const splitAce = hand.fromSplit && cardValue(hand.cards[0]) === 1;
  const actions: Action[] = [];
  if (!splitAce || rules.hitSplitAces) actions.push('hit');
  actions.push('stand');
  if (
    hand.cards.length === 2 &&
    doubleAllowedOn(rules, total, soft) &&
    (!hand.fromSplit || rules.doubleAfterSplit) &&
    (!splitAce || rules.hitSplitAces)
  )
    actions.push('double');
  if (canSplit(rules, round, hand)) actions.push('split');
  if (rules.surrender !== 'none' && !hand.fromSplit && round.hands.length === 1 && hand.cards.length === 2)
    actions.push('surrender');
  return actions;
}

export function act(game: Game, action: Action): Game {
  if (!legalActions(game).includes(action)) throw new Error(`"${action}" isn't allowed now`);
  const table = new Table(game.rules, game.shoe, cloneRound(game.round!));
  const round = table.round!;
  if (round.phase === 'insurance') {
    if (action === 'insurance') round.insurance = round.bet / 2;
    table.afterInsurance();
    return table.game();
  }

  const hand = round.hands[round.active];
  if (action === 'surrender') {
    hand.surrendered = true;
    hand.done = true;
    table.finish();
    return table.game();
  }
  // Early surrender: the dealer checks for blackjack once the player decides not to surrender.
  if (table.peekPending() && table.peek()) return table.game();

  switch (action) {
    case 'hit':
      hand.cards.push(table.draw());
      if (handTotal(hand.cards).total >= 21) hand.done = true;
      break;
    case 'stand':
      hand.done = true;
      break;
    case 'double':
      hand.bet *= 2;
      hand.doubled = true;
      hand.cards.push(table.draw());
      hand.done = true;
      break;
    case 'split': {
      const moved = hand.cards.pop()!;
      hand.fromSplit = true;
      round.hands.splice(round.active + 1, 0, {
        cards: [moved],
        bet: round.bet,
        doubled: false,
        fromSplit: true,
        surrendered: false,
        done: false,
      });
      break;
    }
  }
  table.advance();
  return table.game();
}

/** The dealer's cards the player can see: the up card until the round is done. */
export function visibleDealerCards(round: Round): Card[] {
  return round.phase === 'done' ? round.dealer : round.dealer.slice(0, 1);
}

/** The hand is an unsplit two-card 21. */
export function isNatural(round: Round, hand: PlayerHand): boolean {
  return !hand.fromSplit && round.hands.length === 1 && hand.cards.length === 2 && handTotal(hand.cards).total === 21;
}

function cloneRound(round: Round): Round {
  return {
    ...round,
    dealer: round.dealer.slice(),
    hands: round.hands.map((hand) => ({ ...hand, cards: hand.cards.slice() })),
  };
}

function canSplit(rules: Rules, round: Round, hand: PlayerHand): boolean {
  if (!isPair(hand.cards) || round.hands.length >= rules.maxHands) return false;
  return cardValue(hand.cards[0]) !== 1 || !hand.fromSplit || rules.resplitAces;
}

/** Mutable working copy for one transition. */
class Table {
  readonly rules: Rules;
  shoe: Shoe;
  round: Round | null;

  constructor(rules: Rules, shoe: Shoe, round: Round | null) {
    this.rules = rules;
    this.shoe = shoe;
    this.round = round;
  }

  game(): Game {
    return { rules: this.rules, shoe: this.shoe, round: this.round };
  }

  draw(): Card {
    if (this.shoe.next >= this.shoe.cards.length) this.reshuffleDiscards();
    const [card, shoe] = drawCard(this.shoe);
    this.shoe = shoe;
    return card;
  }

  /** The shoe ran out mid-round: shuffle every card not on the table, as a dealer would. */
  private reshuffleDiscards(): void {
    if (this.shoe.decks === 0) throw new Error('A stacked shoe ran out of cards');
    const rest = freshDecks(this.shoe.decks);
    const onTable = [...(this.round?.dealer ?? []), ...(this.round?.hands.flatMap((hand) => hand.cards) ?? [])];
    for (const card of onTable) rest.splice(rest.indexOf(card), 1);
    const [cards, rng] = shuffled(rest, this.shoe.rng);
    this.shoe = { ...this.shoe, cards, next: 0, cutCard: 0, rng };
  }

  private get round_(): Round {
    return this.round!;
  }

  private dealerCanHaveBlackjack(): boolean {
    const up = cardValue(this.round_.dealer[0]);
    return up === 1 || up === 10;
  }

  peekPending(): boolean {
    return this.rules.holeCard === 'peek' && this.dealerCanHaveBlackjack() && !this.round_.peeked;
  }

  /** Checks the hole card; on a dealer blackjack the round ends. Returns true when it did. */
  peek(): boolean {
    const round = this.round_;
    round.peeked = true;
    if (handTotal(round.dealer).total !== 21) return false;
    for (const hand of round.hands) hand.done = true;
    this.finish();
    return true;
  }

  afterInsurance(): void {
    const round = this.round_;
    round.phase = 'player';
    const hand = round.hands[0];
    const blackjack = isNatural(round, hand);
    if (this.peekPending() && (this.rules.surrender !== 'early' || blackjack) && this.peek()) return;
    if (blackjack) {
      hand.done = true;
      this.finish();
    }
  }

  /** Moves to the next hand that needs a decision, dealing split hands their second card; then the dealer plays. */
  advance(): void {
    const round = this.round_;
    while (round.active < round.hands.length) {
      const hand = round.hands[round.active];
      if (hand.cards.length === 1) this.dealSecondCard(hand);
      if (!hand.done) return;
      round.active++;
    }
    this.finish();
  }

  private dealSecondCard(hand: PlayerHand): void {
    hand.cards.push(this.draw());
    const splitAce = cardValue(hand.cards[0]) === 1;
    if (handTotal(hand.cards).total === 21) hand.done = true;
    else if (splitAce && !this.rules.hitSplitAces && !canSplit(this.rules, this.round_, hand)) hand.done = true;
  }

  /** The dealer completes their hand if anything is left to play for, then everything is settled. */
  finish(): void {
    const { rules } = this;
    const round = this.round_;
    round.phase = 'done';
    round.active = round.hands.length;
    if (round.dealer.length === 1) round.dealer.push(this.draw());
    const dealerBlackjack = handTotal(round.dealer).total === 21;
    const live = round.hands.some(
      (hand) => !hand.surrendered && handTotal(hand.cards).total <= 21 && !isNatural(round, hand),
    );
    if (live && !dealerBlackjack) {
      for (;;) {
        const { total, soft } = handTotal(round.dealer);
        if (total > 17 || (total === 17 && !(soft && rules.dealerHitsSoft17))) break;
        round.dealer.push(this.draw());
      }
    }
    round.settlement = settle(rules, round, dealerBlackjack);
  }
}

function settle(rules: Rules, round: Round, dealerBlackjack: boolean): Settlement {
  const dealerTotal = handTotal(round.dealer).total;
  const originalOnly = rules.holeCard === 'none' && rules.originalBetsOnly;
  const hands = round.hands.map((hand, index): HandResult => {
    const staked = hand.bet;
    const total = handTotal(hand.cards).total;
    const result = (outcome: HandOutcome, net: number): HandResult => ({ outcome, staked, net });
    if (hand.surrendered) {
      // Late surrender without a hole card can't escape a dealer blackjack.
      const whole = dealerBlackjack && rules.holeCard === 'none' && rules.surrender === 'late';
      return result(whole ? 'lose' : 'surrender', whole ? -staked : -staked / 2);
    }
    if (isNatural(round, hand)) return dealerBlackjack ? result('push', 0) : result('blackjack', staked * blackjackPayout(rules));
    if (dealerBlackjack) {
      // OBO: the round costs the original bet and nothing more.
      if (originalOnly) return index === 0 ? result('lose', -round.bet) : result('push', 0);
      return result(total > 21 ? 'bust' : 'lose', -staked);
    }
    if (total > 21) return result('bust', -staked);
    if (dealerTotal > 21 || total > dealerTotal) return result('win', staked);
    return total === dealerTotal ? result('push', 0) : result('lose', -staked);
  });
  const insurance = round.insurance === 0 ? 0 : dealerBlackjack ? 2 * round.insurance : -round.insurance;
  const net = hands.reduce((sum, hand) => sum + hand.net, insurance);
  return { hands, insurance, net, dealerTotal, dealerBlackjack };
}
