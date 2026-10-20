import { describe, expect, it } from 'vitest';
import { holdToIndexes } from '../analyze.ts';
import { parseCards } from '../cards.ts';
import { chartFor, chartPlay } from './index.ts';

const playWith = (paytableId: string) => {
  const rules = chartFor(paytableId)!.rules;
  return (hand: string) => {
    const { rule, hold } = chartPlay(parseCards(hand), rules);
    return { rule: rule.id, held: holdToIndexes(hold) };
  };
};

describe('Double Bonus 10/7 chart', () => {
  const play = playWith('double-bonus-10-7');
  it.each([
    ['Ac Ad Ah Kc Ks', 'three-aces', [0, 1, 2]],
    ['Kc Kd Kh Ks 3c', 'pat-royal-straight-flush-quads', [0, 1, 2, 3]],
    ['Ac Ad 9h 9s 4c', 'two-pair', [0, 1, 2, 3]],
    ['Ac Ad Kh Qh 5h', 'pair-of-aces', [0, 1]],
    ['2c Jc Jd Qc Ac', 'four-to-flush-three-high', [0, 1, 3, 4]],
    ['Jd Qd Kd Kc 4s', 'suited-kqj-qjt', [0, 1, 2]],
    ['Kh Kd 4h 8h 2h', 'high-pair', [0, 1]],
    ['5s 5h 6d 7c 8h', 'four-to-outside-straight', [0, 2, 3, 4]],
    ['9c Tc Jc 9d 3h', 'suited-9tj-9jq', [0, 1, 2]],
    ['2d 7d Jd 4c 9s', 'three-to-flush-one-high', [0, 1, 2]],
    ['Tc Jd Qh 3s 6c', 'unsuited-tjq', [0, 1, 2]],
    ['Ah Td 6c 3s 2d', 'one-ace', [0]],
    ['3c 4d 6h 7s 9c', 'four-to-inside-straight', [0, 1, 2, 3]],
    ['2h 4c 6d 8s 9h', 'discard-all', []],
  ])('%s → %s', (hand, rule, held) => {
    expect(play(hand)).toEqual({ rule, held });
  });
});

describe('Double Double Bonus 9/6 chart', () => {
  const play = playWith('double-double-bonus-9-6');
  it.each([
    ['Ac Ad Ah As 3c', 'pat-royal-straight-flush-quads-kicker', [0, 1, 2, 3, 4]],
    ['Ac Ad Ah As Kc', 'pat-royal-straight-flush-quads-kicker', [0, 1, 2, 3]],
    ['4c 4d 4h 4s Ac', 'pat-royal-straight-flush-quads-kicker', [0, 1, 2, 3, 4]],
    ['Ac Ad Ah 3c 3s', 'three-aces', [0, 1, 2]],
    ['Ac Ad 9h 9s 4c', 'pair-of-aces', [0, 1]],
    ['Jh Jd 4h 8h 2h', 'high-pair', [0, 1]],
    ['Ac Kc Qc 5c 9d', 'suited-akq-akj-aqj', [0, 1, 2]],
    ['Ac Kc Tc 5c 9d', 'four-to-flush', [0, 1, 2, 3]],
    ['9c Td Jh Qs 9h', 'unsuited-9tjq', [0, 1, 2, 3]],
    ['5s 5h 6d 7c 8h', 'low-pair', [0, 1]],
    ['Ac Kd 7h 4s 2c', 'one-ace', [0]],
    ['Ac Kd Qh 7s 2c', 'one-ace', [0]],
    ['Td Jd 4c 7s 2h', 'suited-tj', [0, 1]],
    ['3c 4d 6h 7s 9c', 'four-to-inside-straight', [0, 1, 2, 3]],
  ])('%s → %s', (hand, rule, held) => {
    expect(play(hand)).toEqual({ rule, held });
  });
});
