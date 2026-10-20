import { describe, expect, it } from 'vitest';
import { parseCards } from './cards.ts';
import {
  Category,
  categoryName,
  categoryOf,
  describeHigh,
  describeLow,
  evaluateHighHand,
  evaluateLowHand,
  highHandParts,
  isFoul,
  lowHandParts,
  type Rules,
} from './evaluate.ts';
import frequencies from './hand-frequencies.json' with { type: 'json' };

const high = (text: string, rules?: Rules): number => evaluateHighHand(parseCards(text), rules);
const low = (text: string): number => evaluateLowHand(parseCards(text));

describe('high hands', () => {
  it.each([
    ['Ah Ad Ac As Jk', 'Five aces'],
    ['As Ks Qs Js Ts', 'Royal flush'],
    ['9s 8s 7s 6s 5s', 'Straight flush, nine high'],
    ['9s 9h 9d 9c 2s', 'Four nines'],
    ['9s 9h 9d 2c 2s', 'Nines full of twos'],
    ['Kh 9h 7h 4h 2h', 'Flush, king high'],
    ['Td 9h 8c 7s 6s', 'Straight, ten high'],
    ['Ad 2h 3c 4s 5s', 'Straight, five high'],
    ['7s 7h 7d Kc 2s', 'Three sevens'],
    ['Ks Kh 4d 4c 2s', 'Two pair, kings and fours'],
    ['Qs Qh 9d 5c 2s', 'Pair of queens'],
    ['Ks Th 9d 5c 2s', 'King high'],
  ])('%s is %s', (cards, name) => {
    expect(describeHigh(high(cards))).toBe(name);
  });

  it('ranks the categories in order, five aces on top', () => {
    const ladder = ['Ks Th 9d 5c 2s', 'Qs Qh 9d 5c 2s', 'Ks Kh 4d 4c 2s', '7s 7h 7d Kc 2s', 'Td 9h 8c 7s 6s', 'Kh 9h 7h 4h 2h'];
    ladder.push('9s 9h 9d 2c 2s', '9s 9h 9d 9c 2s', '9s 8s 7s 6s 5s', 'As Ks Qs Js Ts', 'Ah Ad Ac As Jk');
    const values = ladder.map((cards) => high(cards));
    expect(values).toEqual([...values].sort((a, b) => a - b));
    expect(new Set(values).size).toBe(values.length);
  });

  it('breaks ties by rank and kickers, and equal hands are equal', () => {
    expect(high('Ks Kh Ad 5c 2s')).toBeGreaterThan(high('Kd Kc Qd 5h 2h'));
    expect(high('Ks Kh 4d 4c 3s')).toBeGreaterThan(high('Kd Kc 4h 4s 2s'));
    expect(high('Ks Kh 4d 4c 3s')).toBe(high('Kd Kc 4h 4s 3d'));
    expect(high('9s 9h 9d 3c 3s')).toBeGreaterThan(high('8s 8h 8d Ac As'));
  });
});

describe('the joker', () => {
  it('completes straights, taking the highest rank that does', () => {
    expect(describeHigh(high('Jk Kh Qd Jc Ts'))).toBe('Straight, ace high');
    expect(describeHigh(high('9h Jk Jc Ts 8d'))).toBe('Straight, queen high');
    expect(describeHigh(high('9h Jk 7c 6s 5d'))).toBe('Straight, nine high'); // inside straight
    expect(high('9h Jk Jc Ts 8d')).toBe(high('9h Qc Jc Ts 8d'));
  });

  it('completes flushes as the highest rank the flush is missing', () => {
    expect(high('Ah Jk Kh 7h 5h')).toBe(high('Ah Qh Kh 7h 5h'));
    expect(high('Jk Kh 9h 7h 5h')).toBe(high('Ah Kh 9h 7h 5h'));
    expect(describeHigh(high('Jk Kh 9h 7h 5h'))).toBe('Flush, ace high');
  });

  it('completes straight flushes and royal flushes', () => {
    expect(describeHigh(high('Jk 9s 8s 7s 6s'))).toBe('Straight flush, ten high');
    expect(describeHigh(high('Jk Ks Qs Js Ts'))).toBe('Royal flush');
    expect(describeHigh(high('As Ks Jk Js Ts'))).toBe('Royal flush');
    expect(high('Jk Ks Qs Js Ts')).toBe(high('As Ks Qs Js Ts')); // a wild royal ties a natural one
  });

  it('plays as an ace otherwise', () => {
    expect(high('Jk Kd 7c 4s 2h')).toBe(high('Ac Kd 7c 4s 2h'));
    expect(describeHigh(high('Jk Kc Qd 7s 2h'))).toBe('Ace high'); // not a pair of kings
    expect(describeHigh(high('Jk Ac 7d 7s 2h'))).toBe('Two pair, aces and sevens');
    expect(describeHigh(high('Jk Ac Ad Kh 2s'))).toBe('Three aces');
    expect(describeHigh(high('Jk Ac Ad Kh Ks'))).toBe('Aces full of kings');
    expect(describeHigh(high('Jk Ac Ad Ah 2s'))).toBe('Four aces');
    expect(high('Jk Kc Kd 7s 2h')).toBe(high('Ah Kc Kd 7s 2h'));
  });

  it('prefers the better of a straight and an ace hand', () => {
    expect(describeHigh(high('Jk Ac Kd Qs Jh'))).toBe('Straight, ace high'); // beats a pair of aces
    expect(categoryOf(high('Jk Ah Kh Qh Th'))).toBe(Category.StraightFlush); // joker as the jack
  });

  it('makes five aces, the top hand', () => {
    expect(high('Ah Ad Ac As Jk')).toBeGreaterThan(high('As Ks Qs Js Ts'));
    expect(categoryName(high('Ah Ad Ac As Jk'))).toBe('Five aces');
  });
});

describe('the A-2-3-4-5 rule', () => {
  const lowest: Rules = { wheel: 'lowest' };

  it('ranks the wheel second-highest by default', () => {
    expect(high('Ad 2h 3c 4s 5s')).toBeGreaterThan(high('Kd Qh Jc Ts 9s'));
    expect(high('Ad 2h 3c 4s 5s')).toBeLessThan(high('Ad Kh Qc Js Ts'));
    expect(high('As 2s 3s 4s 5s')).toBeGreaterThan(high('Ks Qs Js Ts 9s'));
    expect(high('As 2s 3s 4s 5s')).toBeLessThan(high('As Ks Qs Js Ts'));
  });

  it('ranks it lowest when configured', () => {
    expect(high('Ad 2h 3c 4s 5s', lowest)).toBeLessThan(high('6d 2h 3c 4s 5s', lowest));
    expect(high('As 2s 3s 4s 5s', lowest)).toBeLessThan(high('6s 2s 3s 4s 5s', lowest));
    expect(high('Ad 2h 3c 4s 5s', lowest)).toBeGreaterThan(high('Ad Ah Ac 4s 5s', lowest));
  });

  it('decides what the joker completes', () => {
    // 2-3-4-5 and the joker: the wheel when it ranks second-highest, else six-high.
    expect(high('Jk 2h 3c 4s 5s')).toBe(high('Ad 2h 3c 4s 5s'));
    expect(describeHigh(high('Jk 2h 3c 4s 5s', lowest))).toBe('Straight, six high');
  });
});

describe('low hands', () => {
  it('ranks pairs above singles, then by rank', () => {
    expect(low('2c 2d')).toBeGreaterThan(low('Ac Kd'));
    expect(low('3c 3d')).toBeGreaterThan(low('2c 2d'));
    expect(low('Ac Kd')).toBeGreaterThan(low('Ac Qd'));
    expect(low('Ac 2d')).toBeGreaterThan(low('Kc Qd'));
    expect(low('Ac Kd')).toBe(low('Kh As')); // a copy
  });

  it('plays the joker as an ace', () => {
    expect(describeLow(low('Jk Ah'))).toBe('Pair of aces');
    expect(low('Jk Kd')).toBe(low('Ac Kd'));
    expect(describeLow(low('Jk Kd'))).toBe('Ace-king');
  });
});

describe('hand parts', () => {
  it('names the ranks that matter', () => {
    expect(highHandParts(high('Ks Kh 4d 4c 2s'))).toEqual({ category: Category.TwoPair, royal: false, ranks: [11, 2, 0] });
    expect(highHandParts(high('9s 9h 9d 2c 2s'))).toEqual({ category: Category.FullHouse, royal: false, ranks: [7, 0] });
    expect(highHandParts(high('Ad 2h 3c 4s 5s')).ranks).toEqual([3]);
    expect(highHandParts(high('Jk Ks Qs Js Ts')).royal).toBe(true);
    expect(highHandParts(high('Jk Kh 9h 7h 5h'))).toEqual({ category: Category.Flush, royal: false, ranks: [12, 11, 7, 5, 3] });
    expect(lowHandParts(low('Jk Kd'))).toEqual({ pair: false, ranks: [12, 11] });
    expect(lowHandParts(low('Th Td'))).toEqual({ pair: true, ranks: [8] });
  });
});

describe('fouls', () => {
  it.each([
    ['9s 9h 7d 5c 2s', '5c 5d', false],
    ['5s 5h 7d 9c 2s', '9h 9d', true], // the low pair outranks the high pair
    ['Ks Th 9d 5c 2s', '3h 3d', true], // any low pair beats a high-card high hand
    ['As Kh 9d 5c 2s', 'Ah Qd', false],
    ['As Kh 9d 5c 2s', 'Ad Kd', false], // A-K-x-x-x outranks A-K
    ['As Qh 9d 5c 2s', 'Ah Kd', true],
    ['Ks Qh 9d 5c 2s', 'Ah 3d', true],
    ['4s 4h 3d 3c 2s', 'Ah Ad', false], // two pair outranks any pair
    ['As Ah 9d 5c 2s', 'Ad Jk', false], // equal pairs: the kickers keep the high hand higher
  ])('%s over %s: foul %s', (back, front, foul) => {
    expect(isFoul(high(back), low(front))).toBe(foul);
  });
});

// Wizard of Odds, "Probabilities in Pai Gow Poker": the best 5-card hand among all C(53, 7) seven-card
// hands, counted by scripts/compute-dealer-distribution.ts.
describe('seven-card hand frequencies', () => {
  it('match the published table exactly', () => {
    expect(frequencies.hands).toBe(154_143_080);
    expect(frequencies.fiveAces).toBe(1_128);
    expect(frequencies.straightFlush).toBe(210_964); // royals included
    expect(frequencies.royalFlush).toBe(26_132);
    expect(frequencies.naturalRoyalFlush).toBe(4_512);
    expect(frequencies.fourOfAKind).toBe(307_472);
    expect(frequencies.fullHouse).toBe(4_188_528);
    expect(frequencies.flush).toBe(6_172_088);
    expect(frequencies.straight).toBe(11_236_028);
    expect(frequencies.threeOfAKind).toBe(7_470_676);
    expect(frequencies.twoPair).toBe(35_553_816);
    expect(frequencies.pair).toBe(64_221_960);
    expect(frequencies.highCard).toBe(24_780_420);
  });
});
