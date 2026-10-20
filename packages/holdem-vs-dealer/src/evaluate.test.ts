import { describe, expect, it } from 'vitest';
import { formatCards, parseCards, seededRandomInt, shuffle, newDeck } from './cards.ts';
import { bestFive, categoryOf, compareHands, evaluate, HandCategory, handName } from './evaluate.ts';
import { sevenCardCounts } from './seven-card-counts.ts';

const value = (text: string): number => evaluate(parseCards(text));
const category = (text: string): HandCategory => categoryOf(value(text));
const compare = (a: string, b: string): number => compareHands(parseCards(a), parseCards(b));

describe('evaluate', () => {
  it('ranks every category in order', () => {
    const hands = [
      '2c 4d 7h 9s Jc', // high card
      '2c 2d 7h 9s Jc',
      '2c 2d 7h 7s Jc',
      '2c 2d 2h 9s Jc',
      '5c 6d 7h 8s 9c',
      '2c 4c 7c 9c Jc',
      '2c 2d 2h 9s 9c',
      '2c 2d 2h 2s Jc',
      '5c 6c 7c 8c 9c',
      'Tc Jc Qc Kc Ac',
    ];
    const categories = hands.map(category);
    expect(categories).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 8]);
    for (let i = 1; i < hands.length; i++) expect(compare(hands[i], hands[i - 1])).toBe(1);
    expect(handName(value('Tc Jc Qc Kc Ac'))).toBe('Royal flush');
    expect(handName(value('9c Tc Jc Qc Kc'))).toBe('Straight flush');
  });

  it('handles the wheel as the lowest straight', () => {
    expect(category('Ac 2d 3h 4s 5c')).toBe(HandCategory.Straight);
    expect(compare('Ac 2d 3h 4s 5c', '2c 3d 4h 5s 6c')).toBe(-1);
    expect(compare('Ac 2d 3h 4s 5c', 'Ac Ad Ah Kc Qd')).toBe(1); // a straight beats trips
    // With a 6 too, the six-high straight plays, not the wheel.
    expect(compare('Ac 2d 3h 4s 5c 6d Kh', '2c 3d 4h 5s 6c 9d 9h')).toBe(0);
    // Steel wheel is a straight flush, below a six-high straight flush.
    expect(category('Ah 2h 3h 4h 5h Kd Kc')).toBe(HandCategory.StraightFlush);
    expect(compare('Ah 2h 3h 4h 5h Kd Kc', '2s 3s 4s 5s 6s Kd Kc')).toBe(-1);
    // K-A-2-3-4 doesn't wrap around.
    expect(category('Kc Ad 2h 3s 4c 9d 7h')).toBe(HandCategory.HighCard);
  });

  it('prefers the flush when 7 cards make both a straight and a flush', () => {
    // 5-6-7-8-9 straight, plus five hearts that aren't a straight flush.
    expect(category('5h 6d 7h 8s 9h Kh 2h')).toBe(HandCategory.Flush);
    // Straight and flush in the same 7 cards but in different cards: still a flush, not a straight flush.
    expect(category('4h 5h 6h 7h 8d 9s Kh')).toBe(HandCategory.Flush);
    // Six suited cards with a straight flush inside: the straight flush, and its highest version.
    expect(compare('4h 5h 6h 7h 8h 9h 2c', '5c 6c 7c 8c 9c 2h 3h')).toBe(0);
    // A higher straight in other suits doesn't beat the flush.
    expect(compare('2h 4h 6h 8h Th Jd Qc', '8c 9d Th Js Qc 2h 3d')).toBe(1);
  });

  it('compares kickers and lets the board play', () => {
    expect(compare('Ac Ad Kh 7s 3c', 'Ah As Qh Js Tc')).toBe(1);
    expect(compare('Ac Ad Kh 7s 4c', 'Ah As Kd 7c 3c')).toBe(1); // fifth card decides
    expect(compare('Ac Ad Kh 7s 3c', 'Ah As Kd 7c 3d')).toBe(0);
    // Two pair: the higher pair, then the second pair, then the kicker.
    expect(compare('Kc Kd 3h 3s Ac', 'Qc Qd Jh Js Ac')).toBe(1);
    expect(compare('Kc Kd 4h 4s 2c', 'Kh Ks 3h 3s Ac')).toBe(1);
    // Three pairs in 7 cards: the third pair's rank can be the kicker.
    expect(compare('Kc Kd 8h 8s 6c 6d 2h', 'Kh Ks 8c 8d 5h 4c 3h')).toBe(1);
    expect(compare('Kc Kd 8h 8s 6c 6d 2h', 'Kh Ks 8c 8d 6h 5c 3h')).toBe(0);
    // Board plays: same best five → tie, whatever the hole cards.
    expect(compare('2c 3d Ah Kh Qh Jh Td', '4s 5s Ah Kh Qh Jh Td')).toBe(0);
    // Trips kickers.
    expect(compare('7c 7d 7h Ac 2d', '7c 7d 7s Kc Qd')).toBe(1);
  });

  it('handles full houses and quads in 7 cards', () => {
    // Two sets of trips: a full house, the higher trips full of the lower.
    expect(category('9c 9d 9h 4s 4c 4d 2h')).toBe(HandCategory.FullHouse);
    expect(compare('9c 9d 9h 4s 4c 4d 2h', '9c 9d 9s 5h 5c 2d 3h')).toBe(-1);
    // Trips and two pairs: full of the higher pair.
    expect(compare('9c 9d 9h 4s 4c Kd Kh', '9c 9d 9s Kc Ks 2d 3h')).toBe(0);
    // Quads: the kicker is the best remaining card, even from a pair or trips.
    expect(compare('8c 8d 8h 8s 3c 3d 3h', '8c 8d 8h 8s 5c 2d 2h')).toBe(-1);
    expect(compare('8c 8d 8h 8s Ac Kd Kh', '8c 8d 8h 8s Ah 2d 3h')).toBe(0);
  });

  it('is the best 5 of the 7 cards, on random hands', () => {
    const random = seededRandomInt(42);
    for (let n = 0; n < 2000; n++) {
      const cards = shuffle(newDeck(), random).slice(0, 7);
      let best = 0;
      for (let i = 0; i < 7; i++) {
        for (let j = i + 1; j < 7; j++) best = Math.max(best, evaluate(cards.filter((_, k) => k !== i && k !== j)));
      }
      expect(evaluate(cards), formatCards(cards)).toBe(best);
      expect(evaluate(bestFive(cards).cards)).toBe(best);
    }
  });

  it('shows the best five in a natural order', () => {
    expect(formatCards(bestFive(parseCards('2c 9d 4h 9s 4c Kd Th')).cards)).toBe('9s 9d 4h 4c Kd');
    expect(formatCards(bestFive(parseCards('Ac 2d 3h 4s 5c Kd Kh')).cards)).toBe('5c 4s 3h 2d Ac');
  });

  it('rejects bad input', () => {
    expect(() => evaluate(parseCards('Ac Kd'))).toThrow();
    expect(() => evaluate(parseCards('Ac Ac Kd Qh Js'))).toThrow();
  });

  it('counts every 5-card hand like the published frequencies', () => {
    const counts = new Array(9).fill(0);
    let royals = 0;
    const deck = newDeck();
    for (let a = 0; a < 48; a++)
      for (let b = a + 1; b < 49; b++)
        for (let c = b + 1; c < 50; c++)
          for (let d = c + 1; d < 51; d++)
            for (let e = d + 1; e < 52; e++) {
              const v = evaluate([deck[a], deck[b], deck[c], deck[d], deck[e]]);
              counts[categoryOf(v)]++;
              if (handName(v) === 'Royal flush') royals++;
            }
    expect(counts).toEqual([1302540, 1098240, 123552, 54912, 10200, 5108, 3744, 624, 40]);
    expect(royals).toBe(4);
  });

  it(
    'counts every 7-card hand like the published frequencies',
    () => {
      expect(sevenCardCounts()).toEqual({
        royalFlush: 4324,
        straightFlush: 37260,
        fourOfAKind: 224848,
        fullHouse: 3473184,
        flush: 4047644,
        straight: 6180020,
        threeOfAKind: 6461620,
        twoPair: 31433400,
        pair: 58627800,
        highCard: 23294460,
      });
    },
    60_000,
  );
});
