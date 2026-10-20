import { describe, expect, it } from 'vitest';
import { parseCards } from './cards.ts';
import {
  categoryOf,
  compareHands,
  DEALER_QUALIFIER,
  dealerQualifies,
  evaluateHand,
  HAND_CATEGORY_COUNT,
  HandCategory,
  PAY_CLASS_COUNT,
  PayClass,
  payClassOf,
  PLAY_THRESHOLD,
  tieBreakRanks,
} from './evaluate.ts';

const of = (text: string) => evaluateHand(parseCards(text));
const compare = (a: string, b: string) => compareHands(of(a), of(b));

describe('evaluateHand', () => {
  it.each([
    ['Ah Kh Qh', HandCategory.StraightFlush],
    ['2d 3d Ad', HandCategory.StraightFlush],
    ['7s 7h 7d', HandCategory.ThreeOfAKind],
    ['Qc Ks Ad', HandCategory.Straight],
    ['Ac 2s 3d', HandCategory.Straight],
    ['4h 3c 2s', HandCategory.Straight],
    ['Kc Ad 2s', HandCategory.HighCard], // no wrapping round the ace
    ['2c 7c Jc', HandCategory.Flush],
    ['9h 9c 2d', HandCategory.Pair],
    ['2d 9h 9c', HandCategory.Pair],
    ['Ah Qc 9d', HandCategory.HighCard],
  ])('%s', (hand, category) => {
    expect(categoryOf(of(hand))).toBe(category);
  });

  it('ignores card order', () => {
    expect(of('Qh 6c 4d')).toBe(of('4d Qh 6c'));
    expect(of('5s 5h Kd')).toBe(of('Kd 5h 5s'));
  });

  it('rejects anything but 3 different cards', () => {
    expect(() => evaluateHand(parseCards('Ah Kh'))).toThrow();
    expect(() => evaluateHand(parseCards('Ah Ah Kh'))).toThrow();
  });

  it('matches the known frequency of every category over all 22,100 hands', () => {
    const counts = new Array<number>(HAND_CATEGORY_COUNT).fill(0);
    for (let a = 0; a < 52; a++)
      for (let b = a + 1; b < 52; b++) for (let c = b + 1; c < 52; c++) counts[categoryOf(evaluateHand([a, b, c]))]++;
    expect(counts).toEqual([16_440, 3_744, 1_096, 720, 52, 48]);
  });
});

describe('rankings', () => {
  it('ranks straights above flushes and trips above straights', () => {
    expect(compare('2c 3d 4h', 'Ac Kc Jc')).toBe(1);
    expect(compare('2c 2d 2h', 'Ac Kd Qh')).toBe(1);
    expect(compare('Ah Kh Qh', '2c 2d 2h')).toBe(1);
    expect(compare('2c 5c 7c', 'Ac Ad Kh')).toBe(1);
  });

  it('counts A-2-3 as the lowest straight', () => {
    expect(compare('Ac 2d 3h', '2s 3s 4d')).toBe(-1);
    expect(compare('Ac 2d 3h', 'Ah Kc Qd')).toBe(-1);
    expect(compare('Ac 2c 3c', '2d 3d 4d')).toBe(-1);
    expect(compare('Ac 2c 3c', 'Kd Kh Ks')).toBe(1);
    expect(tieBreakRanks(of('Ac 2d 3h'))).toEqual([1]);
  });

  it('breaks ties rank by rank', () => {
    expect(compare('Ah Kc 2d', 'Ad Qh Jc')).toBe(1);
    expect(compare('Ah Kc 3d', 'Ad Kh 2c')).toBe(1);
    expect(compare('9h 9c Ad', '9d 9s Kh')).toBe(1); // kicker
    expect(compare('Th Tc 2d', '9d 9s Ah')).toBe(1); // pair rank first
    expect(compare('Ac 9c 2c', 'Kd Qd 9d')).toBe(1); // flush high card
    expect(compare('Kc Qd Jh', 'Qc Jd Th')).toBe(1);
  });

  it('ties hands that differ only by suits', () => {
    expect(compare('Ah Kc 2d', 'Ac Kd 2h')).toBe(0);
    expect(compare('9h 9c 4d', '9d 9s 4h')).toBe(0);
    expect(compare('Ac 2d 3h', 'As 2h 3c')).toBe(0);
    expect(compare('2c 5c 7c', '2h 5h 7h')).toBe(0);
  });

  it('qualifies the dealer with queen high or better', () => {
    expect(DEALER_QUALIFIER).toBe(of('Qc 3d 2h'));
    expect(dealerQualifies(of('Qc 3d 2h'))).toBe(true);
    expect(dealerQualifies(of('Jc Td 8h'))).toBe(false);
    expect(dealerQualifies(of('2c 2d 3h'))).toBe(true);
    expect(dealerQualifies(of('2c 5c 7c'))).toBe(true);
    expect(PLAY_THRESHOLD).toBe(of('Qc 6d 4h'));
  });
});

describe('payClassOf', () => {
  it('singles out mini royals and spade mini royals', () => {
    expect(payClassOf(parseCards('Ah Kh Qh'))).toBe(PayClass.MiniRoyal);
    expect(payClassOf(parseCards('Qs As Ks'))).toBe(PayClass.MiniRoyalSpades);
    expect(payClassOf(parseCards('Kh Qh Jh'))).toBe(PayClass.StraightFlush);
    expect(payClassOf(parseCards('Ah Kd Qh'))).toBe(PayClass.Straight);
    expect(payClassOf(parseCards('7h 2d Qh'))).toBe(PayClass.Nothing);
  });

  it('covers every hand', () => {
    const counts = new Array<number>(PAY_CLASS_COUNT).fill(0);
    for (let a = 0; a < 52; a++)
      for (let b = a + 1; b < 52; b++) for (let c = b + 1; c < 52; c++) counts[payClassOf([a, b, c])]++;
    expect(counts).toEqual([16_440, 3_744, 1_096, 720, 52, 44, 3, 1]);
  });
});
