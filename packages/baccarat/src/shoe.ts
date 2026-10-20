import { handTotal, valueOf, type Card } from './cards.ts';
import { secureRandomInt, type RandomInt } from './rng.ts';
import { bankerDraws, isNatural, playerDraws, type CoupSummary, type Outcome } from './rules.ts';

export interface ShoeOptions {
  /** 6 or 8 in most casinos; any count from 1 works. Default 8. */
  decks?: number;
  /** Reshuffle before a coup once fewer than this many cards are left (the cut card). Default 14. */
  cutCard?: number;
  /** Source of randomness: pass createRng(seed).int to replay a shoe. Default: cryptographic. */
  randomInt?: RandomInt;
}

/** Baccarat value of each card 0..51. */
const VALUES = Uint8Array.from({ length: 52 }, (_, card) => valueOf(card));

/** BANKER_DRAWS[11 * bankerTotal + playerThird + 1]: the tableau as a lookup, with -1 for "the player stood". */
const BANKER_DRAWS = Uint8Array.from({ length: 110 }, (_, i) =>
  bankerDraws(Math.floor(i / 11), i % 11 === 0 ? null : (i % 11) - 1) ? 1 : 0,
);

const freshShoes = new Map<number, Uint8Array>();
const freshShoe = (decks: number): Uint8Array => {
  let cards = freshShoes.get(decks);
  if (!cards) freshShoes.set(decks, (cards = Uint8Array.from({ length: 52 * decks }, (_, i) => i % 52)));
  return cards;
};

/**
 * A shuffled multi-deck shoe that reshuffles itself at the cut card.
 *
 * The shuffle is a Fisher–Yates shuffle done lazily: each card dealt is drawn uniformly from the cards not yet
 * dealt. That deals exactly the same uniformly random sequence as shuffling the whole shoe up front, but only
 * pays for the cards that come out before the cut card, which makes simulations about twice as fast.
 */
export class Shoe {
  readonly decks: number;
  readonly cutCard: number;
  readonly #randomInt: RandomInt;
  readonly #cards: Uint8Array;
  #next = 0;
  /** Shuffles so far, counting the first one. */
  shuffles = 1;

  constructor({ decks = 8, cutCard = 14, randomInt = secureRandomInt }: ShoeOptions = {}) {
    if (!(Number.isInteger(decks) && decks >= 1)) throw new Error(`Invalid deck count ${decks}`);
    this.decks = decks;
    this.cutCard = Math.max(6, cutCard);
    this.#randomInt = randomInt;
    this.#cards = freshShoe(decks).slice();
  }

  get remaining(): number {
    return this.#cards.length - this.#next;
  }

  /** Gathers every card back into the shoe and shuffles it. */
  shuffle(): void {
    this.#next = 0;
    this.shuffles++;
  }

  /** Reshuffles if the cut card has come out. Call before each coup. */
  prepareCoup(): void {
    if (this.remaining < this.cutCard) this.shuffle();
  }

  draw(): Card {
    const cards = this.#cards;
    const i = this.#next;
    if (i >= cards.length) throw new Error('The shoe is empty');
    const j = i + this.#randomInt(cards.length - i);
    const card = cards[j];
    cards[j] = cards[i];
    cards[i] = card;
    this.#next = i + 1;
    return card;
  }

  /** Next card's baccarat value. */
  drawValue(): number {
    return VALUES[this.draw()];
  }
}

export interface Coup extends CoupSummary {
  player: Card[];
  banker: Card[];
  playerTotal: number;
  bankerTotal: number;
  natural: boolean;
}

/** Deals one coup from `draw`, following the tableau. */
export function dealCoup(draw: () => Card): Coup {
  const player = [draw()];
  const banker = [draw()];
  player.push(draw());
  banker.push(draw());
  let playerTotal = handTotal(player);
  let bankerTotal = handTotal(banker);
  const natural = isNatural(playerTotal) || isNatural(bankerTotal);
  if (!natural) {
    let playerThird: number | null = null;
    if (playerDraws(playerTotal)) {
      const card = draw();
      player.push(card);
      playerThird = valueOf(card);
      playerTotal = handTotal(player);
    }
    if (bankerDraws(bankerTotal, playerThird)) {
      banker.push(draw());
      bankerTotal = handTotal(banker);
    }
  }
  const outcome: Outcome = bankerTotal > playerTotal ? 'banker' : playerTotal > bankerTotal ? 'player' : 'tie';
  return {
    player,
    banker,
    playerTotal,
    bankerTotal,
    natural,
    outcome,
    bankerThreeCardSeven: outcome === 'banker' && banker.length === 3 && bankerTotal === 7,
  };
}

/** Plays one coup from the shoe, reshuffling first if the cut card has come out. */
export function playCoup(shoe: Shoe): Coup {
  shoe.prepareCoup();
  return dealCoup(() => shoe.draw());
}

/** Coup result codes from playCoupFast. */
export const PLAYER_WINS = 0;
export const BANKER_WINS = 1;
export const TIE = 2;
/** Banker wins with a three-card 7. */
export const BANKER_WINS_THREE_CARD_SEVEN = 3;

/** playCoup without the cards: returns one of the result codes above. For simulations running millions of coups. */
export function playCoupFast(shoe: Shoe): number {
  shoe.prepareCoup();
  const p1 = shoe.drawValue();
  const b1 = shoe.drawValue();
  let player = (p1 + shoe.drawValue()) % 10;
  let banker = (b1 + shoe.drawValue()) % 10;
  let bankerCards = 2;
  if (player < 8 && banker < 8) {
    let playerThird = -1;
    if (player <= 5) {
      playerThird = shoe.drawValue();
      player = (player + playerThird) % 10;
    }
    if (BANKER_DRAWS[11 * banker + playerThird + 1]) {
      banker = (banker + shoe.drawValue()) % 10;
      bankerCards = 3;
    }
  }
  if (banker > player) return bankerCards === 3 && banker === 7 ? BANKER_WINS_THREE_CARD_SEVEN : BANKER_WINS;
  return player > banker ? PLAYER_WINS : TIE;
}
