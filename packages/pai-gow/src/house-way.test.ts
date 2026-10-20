import { describe, expect, it } from 'vitest';
import { newDeck, parseCards, seededRandomInt, shuffle } from './cards.ts';
import { describeHigh, lowRanks } from './evaluate.ts';
import { houseWay, houseWayExplained, houseWayRule } from './house-way.ts';
import { SPLIT_COUNT, allSettings, evaluateSplits } from './setting.ts';

const set = (text: string) => {
  const setting = houseWay(parseCards(text));
  return { low: lowRanks(setting.lowValue), high: describeHigh(setting.highValue) };
};

describe('splits', () => {
  it('enumerates all 21 ways to set a hand, each card in exactly one hand', () => {
    const cards = parseCards('Ah Kd 9c 7s 5h 4c 2d');
    const settings = allSettings(cards);
    expect(settings).toHaveLength(21);
    const lows = new Set(settings.map((setting) => setting.low.slice().sort().join()));
    expect(lows.size).toBe(21);
    for (const setting of settings) expect([...setting.high, ...setting.low].sort()).toEqual(cards.slice().sort());
    // With no pair, any front holding the ace (6 splits) outranks the ace-less back.
    expect(settings.filter((setting) => setting.foul)).toHaveLength(6);
  });
});

// Foxwoods house way (wizardofodds.com/games/pai-gow-poker/house-way/foxwoods/), one case per rule.
describe('house way', () => {
  it.each([
    // [hand, low hand ranks, high hand]
    ['Ah Kd 9c 7s 5h 4c 2d', 'K9', 'Ace high'], // no pair: second and third highest in front
    ['Jk Kd 9c 7s 5h 4c 2d', 'K9', 'Ace high'], // the joker is the ace
    ['8h 8d Ac Ts 5h 4c 2d', 'AT', 'Pair of eights'], // one pair: two highest others in front
    ['Jh Jd 4c 4s Ah 9c 2d', '44', 'Pair of jacks'], // two pair, jacks or better: split
    ['Jk Ad 9c 9s 5h 4c 2d', '99', 'Straight, five high'], // aces (with the joker) and nines split; the joker then completes the wheel
    ['Th Td 4c 4s Ah 9c 2d', 'A9', 'Two pair, tens and fours'], // tens to sevens, with an ace: keep together
    ['Th Td 4c 4s Kh 9c 2d', '44', 'Pair of tens'], // no ace: split
    ['6h 6d 4c 4s Kh 9c 2d', 'K9', 'Two pair, sixes and fours'], // sixes and below, with a king: keep together
    ['6h 6d 4c 4s Qh 9c 2d', '44', 'Pair of sixes'], // no king or ace: split
    ['Jh Jd 9c 9s Th 8c 7d', '99', 'Pair of jacks'], // two pair ignores the straight
    ['Kh Kd 9c 9s 4h 4c 2d', 'KK', 'Two pair, nines and fours'], // three pair: highest pair in front
    ['Ah Ad Ac Ks 9h 5c 2d', 'AK', 'Pair of aces'], // trip aces split
    ['Kh Kd Kc Qs 9h 5c 2d', 'Q9', 'Three kings'], // other trips stay together
    ['Kh Kd Kc 5s 5h 5c 2d', 'KK', 'Three fives'], // two sets: pair from the higher set in front
    ['9h 9d 9c 5s 5h Ac 2d', '55', 'Three nines'], // full house: the pair in front
    ['9h 9d 9c 5s 5h 3c 3d', '55', 'Nines full of threes'], // trips and two pair: the higher pair in front
    ['Jh Jd Jc Js Ah 9c 2d', 'JJ', 'Pair of jacks'], // quad jacks or better: split
    ['8h 8d 8c 8s Kh 9c 2d', 'K9', 'Four eights'], // quad sevens to tens with a king: keep
    ['8h 8d 8c 8s Qh 9c 2d', '88', 'Pair of eights'], // without one: split
    ['5h 5d 5c 5s Qh 9c 2d', 'Q9', 'Four fives'], // sixes and below: never split
    ['5h 5d 5c 5s Qh Qc 2d', 'QQ', 'Four fives'], // quads and a pair: the pair in front
    ['Ah Ad Ac As Jk Kh Kc', 'KK', 'Five aces'], // five aces with kings
    ['Ah Ad Ac As Jk Qh 2c', 'AA', 'Three aces'], // five aces: aces in front
    ['9h 8d 7c 6s 5h Kc 2d', 'K2', 'Straight, nine high'], // straight, no pair
    ['Th 9d 8c 7s 6h 5c 4d', 'T9', 'Straight, eight high'], // the highest front that keeps a straight
    ['9h 9d 8c 7s 6h 5c Kd', 'K9', 'Straight, nine high'], // straight and one pair
    ['7d Jk 7h Qd 2d 6d 8d', '77', 'Flush, ace high'], // flush and a pair: the pair can go in front
    ['Ah Kh Kd Qc Js Td 3c', 'AQ', 'Pair of kings'], // ace and kings: ace in front beats K-3 in front
    ['7h 7d 7c 8s 9h Tc Jd', '77', 'Straight, jack high'], // trips and a straight: the pair in front
    ['Jk 5h Qd Td 2s Jh 9h', '52', 'Straight, king high'], // the joker completes the straight
  ])('%s → %s in front', (hand, low, high) => {
    expect(set(hand)).toEqual({ low, high });
  });

  it.each([
    ['Ah Ad Ac As Jk Kh Kc', 'five-aces'],
    ['5h 5d 5c 5s Qh Qc 2d', 'four-of-a-kind-with-pair'],
    ['Jh Jd Jc Js Ah 9c 2d', 'four-of-a-kind-split'],
    ['8h 8d 8c 8s Kh 9c 2d', 'four-of-a-kind-together'],
    ['Kh Kd Kc 5s 5h 5c 2d', 'two-sets'],
    ['9h 9d 9c 5s 5h Ac 2d', 'full-house'],
    ['Kh Kd 9c 9s 4h 4c 2d', 'three-pair'],
    ['Jh Jd 4c 4s Ah 9c 2d', 'two-pair-split'],
    ['Th Td 4c 4s Ah 9c 2d', 'two-pair-together'],
    ['7h 7d 7c 8s 9h Tc Jd', 'complete-hand-with-trips'],
    ['9h 8d 7c 6s 5h Kc 2d', 'complete-hand'],
    ['Ah Kh Kd Qc Js Td 3c', 'ace-and-pair'],
    ['Ah Ad Ac Ks 9h 5c 2d', 'trip-aces'],
    ['Kh Kd Kc Qs 9h 5c 2d', 'three-of-a-kind'],
    ['8h 8d Ac Ts 5h 4c 2d', 'one-pair'],
    ['Ah Kd 9c 7s 5h 4c 2d', 'no-pair'],
  ])('explains %s by the rule %s', (hand, rule) => {
    const explained = houseWayExplained(parseCards(hand));
    expect(explained.rule).toBe(rule);
    expect(explained.setting).toEqual(houseWay(parseCards(hand)));
  });

  it('never fouls and always follows a published rule', () => {
    const randomInt = seededRandomInt(7);
    const deck = newDeck();
    const highs = new Int32Array(SPLIT_COUNT);
    const lows = new Int32Array(SPLIT_COUNT);
    for (let i = 0; i < 20_000; i++) {
      const hand = shuffle(deck, randomInt).slice(0, 7);
      expect(houseWay(hand).foul).toBe(false);
      evaluateSplits(hand, 23, highs, lows);
      expect(houseWayRule(hand, highs, lows)).toBeGreaterThanOrEqual(0);
    }
  });
});
