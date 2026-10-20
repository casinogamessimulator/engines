import { describe, expect, it } from 'vitest';
import { parseCards } from './cards.ts';
import { classify, classifyHand, HAND_CLASS_COUNT, HandClass } from './evaluate.ts';

const of = (text: string) => classifyHand(parseCards(text));

describe('classify', () => {
  it.each([
    ['Ah Kh Qh Jh Th', HandClass.RoyalFlush],
    ['9c Kc Qc Jc Tc', HandClass.StraightFlush],
    ['Ad 2d 3d 4d 5d', HandClass.StraightFlush],
    ['As Ah Ad Ac 3h', HandClass.QuadAcesWith2To4],
    ['As Ah Ad Ac 5h', HandClass.QuadAces],
    ['As Ah Ad Ac Kh', HandClass.QuadAces],
    ['3s 3h 3d 3c Ah', HandClass.Quads2To4WithAToFour],
    ['2s 2h 2d 2c 4h', HandClass.Quads2To4WithAToFour],
    ['4s 4h 4d 4c Kh', HandClass.Quads2To4],
    ['9h 9s 9d 9c 2h', HandClass.Quads5ToK],
    ['Kh 3s 3h 3d 3c', HandClass.Quads2To4],
    ['Kh Ks Kd 2c 2h', HandClass.FullHouse],
    ['2c Kh 2h Ks Kd', HandClass.FullHouse],
    ['2c 7c 9c Jc Ac', HandClass.Flush],
    ['Ah 2c 3d 4s 5h', HandClass.Straight],
    ['Th Jc Qd Ks Ah', HandClass.Straight],
    ['Jh Qc Kd As 2h', HandClass.Nothing],
    ['7h 7c 7d 2s Ah', HandClass.ThreeOfAKind],
    ['2s Ah 7h 7c 7d', HandClass.ThreeOfAKind],
    ['2s Ah 7h 7c 2d', HandClass.TwoPair],
    ['Jh Jc 2d 5s 9h', HandClass.HighPair],
    ['2d 5s 9h Ah Ac', HandClass.HighPair],
    ['Th Tc 2d 5s 9h', HandClass.LowPair],
    ['2h 4c 6d 8s Th', HandClass.Nothing],
  ])('%s', (hand, expected) => {
    expect(of(hand)).toBe(expected);
  });

  it('matches the known frequency of every hand over all 2,598,960 hands', () => {
    const counts = new Array<number>(HAND_CLASS_COUNT).fill(0);
    for (let e = 4; e < 52; e++)
      for (let d = 3; d < e; d++)
        for (let c = 2; c < d; c++)
          for (let b = 1; b < c; b++) for (let a = 0; a < b; a++) counts[classify(a, b, c, d, e)]++;

    expect(counts[HandClass.RoyalFlush]).toBe(4);
    expect(counts[HandClass.StraightFlush]).toBe(36);
    // 13 ranks × 48 kickers = 624 quads; aces: 12 with a 2-4 kicker, 36 other.
    expect(counts[HandClass.QuadAcesWith2To4]).toBe(12);
    expect(counts[HandClass.QuadAces]).toBe(36);
    expect(counts[HandClass.Quads2To4WithAToFour]).toBe(3 * 12);
    expect(counts[HandClass.Quads2To4]).toBe(3 * 36);
    expect(counts[HandClass.Quads5ToK]).toBe(9 * 48);
    expect(counts[HandClass.FullHouse]).toBe(3744);
    expect(counts[HandClass.Flush]).toBe(5108);
    expect(counts[HandClass.Straight]).toBe(10200);
    expect(counts[HandClass.ThreeOfAKind]).toBe(54912);
    expect(counts[HandClass.TwoPair]).toBe(123552);
    expect(counts[HandClass.HighPair]).toBe(337920); // 4 of 13 ranks of 1,098,240 pairs
    expect(counts[HandClass.LowPair]).toBe(760320);
    expect(counts[HandClass.Nothing]).toBe(1302540);
  });
});
