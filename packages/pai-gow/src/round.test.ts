import { describe, expect, it } from 'vitest';
import { JOKER, parseCards, seededRandomInt } from './cards.ts';
import { houseWay } from './house-way.ts';
import { deal, playRound, settle } from './round.ts';
import { setHand } from './setting.ts';

const player = (hand: string, low: string) => setHand(parseCards(hand), parseCards(low));
const dealer = (hand: string) => houseWay(parseCards(hand));

describe('settle', () => {
  // No pair: the dealer sets K-T-7-4-2 behind Q-J.
  const dealerHand = dealer('Kc Qd Jh Ts 7c 4d 2s');

  it('pays a win even money less 5% commission', () => {
    const result = settle(player('Ah Ad 9c 8s 5h Ks Qh', 'Ks Qh'), dealerHand, 100);
    expect(result).toEqual({ outcome: 'win', high: 'player', low: 'player', net: 95, commission: 5 });
  });

  it('takes the bet when both hands lose', () => {
    expect(settle(player('Qh 9d 8c 6s 4h 3c 2d', '9d 8c'), dealerHand, 100)).toMatchObject({ outcome: 'lose', net: -100 });
  });

  it('pushes when each side takes one hand', () => {
    expect(settle(player('Ah Ad 9c 8s 5h 3c 2d', '3c 2d'), dealerHand, 100)).toMatchObject({ outcome: 'push', high: 'player', low: 'dealer', net: 0 });
  });

  it('gives copies to the dealer', () => {
    // Both high hands are K-T-7-4-2; the player's K-9 low hand wins: a push, not a win.
    const copy = settle(player('Kh Th 7d 4h 2c Kd 9s', 'Kd 9s'), dealerHand, 100);
    expect(copy).toMatchObject({ outcome: 'push', high: 'dealer', low: 'player' });
    // Copies on both hands lose.
    const both = settle(player('Kh Th 7d 4h 2c Qs Jc', 'Qs Jc'), dealerHand, 100);
    expect(both).toMatchObject({ outcome: 'lose', high: 'dealer', low: 'dealer', net: -100 });
  });

  it('applies a custom commission rate', () => {
    expect(settle(player('Ah Ad 9c 8s 5h Ks Qh', 'Ks Qh'), dealerHand, 20, 0.04).net).toBeCloseTo(19.2, 10);
  });

  it('loses a fouled setting', () => {
    const fouled = player('Ah Ad Kc Ks 5h 3c 2d', 'Ah Ad'); // aces in front of kings
    expect(fouled.foul).toBe(true);
    expect(settle(fouled, dealerHand, 100)).toMatchObject({ outcome: 'lose', net: -100 });
  });
});

describe('rounds', () => {
  it('deals 14 different cards, reproducibly from a seed', () => {
    const first = deal(seededRandomInt(42));
    expect(deal(seededRandomInt(42))).toEqual(first);
    expect(new Set([...first.player, ...first.dealer]).size).toBe(14);
    expect([...first.player, ...first.dealer].every((card) => card >= 0 && card <= JOKER)).toBe(true);
    expect(deal(seededRandomInt(43))).not.toEqual(first);
  });

  it('sets the dealer by the house way and settles', () => {
    const dealt = { player: parseCards('Ah Ad 9c 8s 5h Ks Qh'), dealer: parseCards('Kc Qd Jh Ts 7c 4d 2s') };
    const result = playRound(dealt, parseCards('Ks Qh'), 10);
    expect(result.dealer.low).toEqual(parseCards('Qd Jh'));
    expect(result.settlement).toMatchObject({ outcome: 'win', net: 9.5 });
  });

  it('re-sets a fouled hand by the house way, or forfeits it', () => {
    const dealt = { player: parseCards('Ah Ad Kc Ks 5h 3c 2d'), dealer: parseCards('Qc Jd 9h 8s 7c 4d 2s') };
    const reset = playRound(dealt, parseCards('Ah Ad'), 10);
    expect(reset.playerFouled).toBe(true);
    expect(reset.player.foul).toBe(false);
    expect(reset.player).toEqual(houseWay(dealt.player));
    expect(playRound(dealt, parseCards('Ah Ad'), 10, { foul: 'lose' }).settlement.outcome).toBe('lose');
  });

  it('can set the player by the house way', () => {
    const dealt = deal(seededRandomInt(1));
    expect(playRound(dealt, 'house-way', 10).player).toEqual(houseWay(dealt.player));
  });
});
