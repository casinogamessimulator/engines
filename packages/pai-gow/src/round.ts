import { newDeck, secureRandomInt, shuffle, type Card } from './cards.ts';
import { DEFAULT_RULES, type Rules } from './evaluate.ts';
import { houseWay } from './house-way.ts';
import { setHand, type Setting } from './setting.ts';

/** The house's 5% commission on winning bets. */
export const DEFAULT_COMMISSION = 0.05;

export type Outcome = 'win' | 'lose' | 'push';
export type HandWinner = 'player' | 'dealer';

export interface Settlement {
  outcome: Outcome;
  /** Who takes each hand: equal hands ("copies") go to the dealer. */
  high: HandWinner;
  low: HandWinner;
  /** Net result for the player: +bet × (1 − commission), −bet or 0. */
  net: number;
  /** Commission taken from a win. */
  commission: number;
}

/**
 * Settles a bet against the dealer (the house banks). The player wins by taking both hands, loses by
 * losing both, and pushes otherwise. Copies go to the dealer. A win pays even money less commission.
 * A fouled player setting loses (the caller decides whether to re-set it first; see playRound).
 */
export function settle(player: Setting, dealer: Setting, bet: number, commissionRate: number = DEFAULT_COMMISSION): Settlement {
  if (player.foul) return { outcome: 'lose', high: 'dealer', low: 'dealer', net: -bet, commission: 0 };
  const high: HandWinner = player.highValue > dealer.highValue ? 'player' : 'dealer';
  const low: HandWinner = player.lowValue > dealer.lowValue ? 'player' : 'dealer';
  if (high === 'player' && low === 'player') {
    const commission = bet * commissionRate;
    return { outcome: 'win', high, low, net: bet - commission, commission };
  }
  if (high === 'dealer' && low === 'dealer') return { outcome: 'lose', high, low, net: -bet, commission: 0 };
  return { outcome: 'push', high, low, net: 0, commission: 0 };
}

export interface Deal {
  player: Card[];
  dealer: Card[];
}

/**
 * Deals one round from a freshly shuffled 53-card deck: 7 cards to the player, then 7 to the dealer.
 * Pass seededRandomInt(seed) for a reproducible deal.
 */
export function deal(randomInt: (max: number) => number = secureRandomInt): Deal {
  const deck = shuffle(newDeck(), randomInt);
  return { player: deck.slice(0, 7), dealer: deck.slice(7, 14) };
}

export interface RoundOptions {
  rules?: Rules;
  commission?: number;
  /**
   * What happens to a fouled player setting: most casinos have the dealer re-set it by the house way
   * ('house-way'); some forfeit the bet ('lose').
   */
  foul?: 'house-way' | 'lose';
}

export interface RoundResult {
  player: Setting;
  dealer: Setting;
  /** Whether the player's own setting fouled (and was re-set or forfeited). */
  playerFouled: boolean;
  settlement: Settlement;
}

/**
 * Plays a dealt round: the player's setting is either the two cards for the low hand or 'house-way',
 * the dealer always sets by the house way, then the bet settles.
 */
export function playRound(dealt: Deal, playerLow: readonly Card[] | 'house-way', bet: number, options: RoundOptions = {}): RoundResult {
  const rules = options.rules ?? DEFAULT_RULES;
  let player = playerLow === 'house-way' ? houseWay(dealt.player, rules) : setHand(dealt.player, playerLow, rules);
  const playerFouled = player.foul;
  if (playerFouled && (options.foul ?? 'house-way') === 'house-way') player = houseWay(dealt.player, rules);
  const dealer = houseWay(dealt.dealer, rules);
  return { player, dealer, playerFouled, settlement: settle(player, dealer, bet, options.commission ?? DEFAULT_COMMISSION) };
}
