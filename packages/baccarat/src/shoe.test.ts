import { describe, expect, it } from 'vitest';
import { formatCard, handTotal, parseCards, valueOf } from './cards.ts';
import { exactOdds } from './odds.ts';
import { createRng } from './rng.ts';
import { bankerDraws, DEFAULT_RULES, payBet, type CoupSummary } from './rules.ts';
import {
  BANKER_WINS,
  BANKER_WINS_THREE_CARD_SEVEN,
  dealCoup,
  playCoup,
  playCoupFast,
  PLAYER_WINS,
  Shoe,
  TIE,
} from './shoe.ts';

/** Deals from a fixed sequence, in dealing order: player, banker, player, banker, third cards. */
const deal = (cards: string) => {
  const queue = parseCards(cards);
  return dealCoup(() => {
    const card = queue.shift();
    if (card === undefined) throw new Error('Out of cards');
    return card;
  });
};
const show = (cards: number[]) => cards.map(formatCard).join(' ');

describe('cards', () => {
  it('counts tens and faces as 0 and aces as 1', () => {
    expect(parseCards('Ac 2d 9h Ts Jc Qd Kh').map(valueOf)).toEqual([1, 2, 9, 0, 0, 0, 0]);
    expect(handTotal(parseCards('7c 8d'))).toBe(5);
  });
});

describe('dealCoup', () => {
  it('stands both hands on a natural', () => {
    const coup = deal('9c 2d Kh 3s 5c');
    expect([show(coup.player), show(coup.banker)]).toEqual(['9c Kh', '2d 3s']);
    expect(coup).toMatchObject({ natural: true, outcome: 'player', playerTotal: 9, bankerTotal: 5 });
  });

  it('draws for the player on 5 and stands on 6', () => {
    expect(deal('2c Tc 3d Td 4h 9h').player).toHaveLength(3);
    expect(deal('2c Tc 4d Td 4h 9h').player).toHaveLength(2);
  });

  it('draws for the banker on 0-5 when the player stands', () => {
    const coup = deal('3c 2d 4h 3s 2c');
    expect(coup).toMatchObject({ playerTotal: 7, bankerTotal: 7, outcome: 'tie' });
    expect(coup.banker).toHaveLength(3);
    expect(deal('3c 3d 4h 3s 2c').banker).toHaveLength(2);
  });

  it('stands the banker on 3 against a player third card of 8', () => {
    const coup = deal('Tc 2d Td As 8h 5c');
    expect(show(coup.player)).toBe('Tc Td 8h');
    expect(coup.banker).toHaveLength(2);
    expect(coup.outcome).toBe('player');
  });

  it('flags a banker win with three cards totaling 7', () => {
    const coup = deal('Tc 2d Td 2s 4h 3c'); // player 0+4 = 4, banker 4 draws on 4 → 7
    expect(coup).toMatchObject({ playerTotal: 4, bankerTotal: 7, outcome: 'banker', bankerThreeCardSeven: true });
  });

  it('follows the whole banker tableau', () => {
    // Banker total → player third-card values on which the banker draws.
    const draws: Record<number, number[]> = {
      0: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
      1: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
      2: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
      3: [0, 1, 2, 3, 4, 5, 6, 7, 9],
      4: [2, 3, 4, 5, 6, 7],
      5: [4, 5, 6, 7],
      6: [6, 7],
      7: [],
    };
    for (let total = 0; total <= 7; total++)
      for (let third = 0; third <= 9; third++) expect(bankerDraws(total, third)).toBe(draws[total].includes(third));
  });
});

describe('Shoe', () => {
  it('holds 52 cards per deck, each card once per deck', () => {
    const shoe = new Shoe({ decks: 6, randomInt: createRng(1).int });
    const cards = Array.from({ length: 312 }, () => shoe.draw());
    for (let card = 0; card < 52; card++) expect(cards.filter((c) => c === card)).toHaveLength(6);
    expect(() => shoe.draw()).toThrow();
  });

  it('replays the same coups from the same seed', () => {
    const play = (seed: string) => {
      const shoe = new Shoe({ randomInt: createRng(seed).int });
      return Array.from({ length: 200 }, () => {
        const coup = playCoup(shoe);
        return `${show(coup.player)}|${show(coup.banker)}`;
      });
    };
    expect(play('shoe-1')).toEqual(play('shoe-1'));
    expect(play('shoe-1')).not.toEqual(play('shoe-2'));
  });

  it('reshuffles at the cut card', () => {
    const shoe = new Shoe({ decks: 1, cutCard: 14, randomInt: createRng(3).int });
    for (let i = 0; i < 30; i++) {
      playCoup(shoe);
      expect(shoe.remaining).toBeGreaterThanOrEqual(14 - 6);
    }
    expect(shoe.shuffles).toBeGreaterThan(1);
  });

  it('plays the same coups with or without the cards', () => {
    const slow = new Shoe({ randomInt: createRng('same').int });
    const fast = new Shoe({ randomInt: createRng('same').int });
    for (let i = 0; i < 5_000; i++) {
      const coup = playCoup(slow);
      const code = coup.bankerThreeCardSeven
        ? BANKER_WINS_THREE_CARD_SEVEN
        : { player: PLAYER_WINS, banker: BANKER_WINS, tie: TIE }[coup.outcome];
      expect(playCoupFast(fast)).toBe(code);
    }
  });

  it('deals outcomes at the exact odds', () => {
    const shoe = new Shoe({ decks: 8, randomInt: createRng('odds').int });
    const counts = [0, 0, 0, 0];
    const coups = 400_000;
    for (let i = 0; i < coups; i++) counts[playCoupFast(shoe)]++;
    const odds = exactOdds(8);
    // Standard deviations ≈ 0.0008; the cut card shifts the odds by far less.
    expect(Math.abs((counts[BANKER_WINS] + counts[BANKER_WINS_THREE_CARD_SEVEN]) / coups - odds.banker)).toBeLessThan(0.004);
    expect(Math.abs(counts[PLAYER_WINS] / coups - odds.player)).toBeLessThan(0.004);
    expect(Math.abs(counts[TIE] / coups - odds.tie)).toBeLessThan(0.003);
    expect(Math.abs(counts[BANKER_WINS_THREE_CARD_SEVEN] / coups - odds.bankerThreeCardSeven)).toBeLessThan(0.002);
  });
});

describe('payBet', () => {
  const coup = (outcome: CoupSummary['outcome'], bankerThreeCardSeven = false): CoupSummary => ({
    outcome,
    bankerThreeCardSeven,
  });
  const noCommission = { ...DEFAULT_RULES, variant: 'no-commission' as const };

  it('pays banker 19 to 20, player even money and tie 8 to 1', () => {
    expect(payBet('banker', 100, coup('banker'))).toBe(195);
    expect(payBet('player', 100, coup('player'))).toBe(200);
    expect(payBet('tie', 100, coup('tie'))).toBe(900);
    expect(payBet('tie', 100, coup('tie'), { ...DEFAULT_RULES, tiePays: 9 })).toBe(1000);
  });

  it('pushes banker and player on a tie', () => {
    expect(payBet('banker', 100, coup('tie'))).toBe(100);
    expect(payBet('player', 100, coup('tie'))).toBe(100);
    expect(payBet('player', 100, coup('banker'))).toBe(0);
    expect(payBet('tie', 100, coup('banker'))).toBe(0);
  });

  it('pays banker even money without commission, but pushes a three-card 7', () => {
    expect(payBet('banker', 100, coup('banker'), noCommission)).toBe(200);
    expect(payBet('banker', 100, coup('banker', true), noCommission)).toBe(100);
    expect(payBet('banker', 100, coup('banker', true))).toBe(195);
  });
});
