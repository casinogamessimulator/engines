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

describe('Bonus Poker 8/5 chart', () => {
  const play = playWith('bonus-poker-8-5');
  it.each([
    ['Ac Ad Ah As 3c', 'pat-royal-straight-flush-quads', [0, 1, 2, 3]],
    ['Kh Qh Jh Th 3c', 'four-to-royal', [0, 1, 2, 3]],
    ['Ac Ad Ah 9s 2c', 'pat-full-house-flush-straight-trips', [0, 1, 2]],
    ['9c 9d 4h 4s Kc', 'two-pair', [0, 1, 2, 3]],
    ['Qs Qh 4h 8h 2h', 'high-pair', [0, 1]],
    ['Kh Qh Jh 4h 9c', 'three-to-royal', [0, 1, 2]],
    ['2d 6d 9d Kd 9c', 'four-to-flush', [0, 1, 2, 3]],
    ['Tc Jd Qh Ks 2c', 'unsuited-tjqk', [0, 1, 2, 3]],
    ['5s 5h 6d 7c 8h', 'low-pair', [0, 1]],
    ['2d 3c Td Jd Kc', 'unsuited-kq-kj', [3, 4]],
    ['As 6s 4d 5d Kd', 'unsuited-ak-aq-aj', [0, 4]],
    ['2c 3d 4d 7d Jc', 'one-j-q-k', [4]],
    ['2h 4c 6d 8s 9h', 'discard-all', []],
  ])('%s → %s', (hand, rule, held) => {
    expect(play(hand)).toEqual({ rule, held });
  });
});

describe('Bonus Poker Deluxe 9/6 chart', () => {
  const play = playWith('bonus-poker-deluxe-9-6');
  it.each([
    ['Ac Ad Ah As 3c', 'pat-royal-straight-flush-quads', [0, 1, 2, 3]],
    ['7c 7d 7h 2s Kc', 'pat-full-house-flush-straight-trips', [0, 1, 2]],
    ['9c 9d 4h 4s Kc', 'two-pair', [0, 1, 2, 3]],
    ['Js Jh 4h 8h 2h', 'high-pair', [0, 1]],
    ['Ac Jc Tc 6c 2d', 'four-to-flush-ace-ten-royal', [0, 1, 2, 3]],
    ['Kc Qc Tc 6c 2d', 'three-to-royal', [0, 1, 2]],
    ['5s 5h 6d 7c 8h', 'low-pair', [0, 1]],
    ['2c 9d Tc Qd Kc', 'four-to-inside-straight-2-high', [1, 2, 3, 4]],
    ['2c 8d Tc Jd Qc', 'four-to-inside-straight-2-high', [1, 2, 3, 4]],
    ['Kd Qs 2c 5h 9d', 'unsuited-kq-kj', [0, 1]],
    ['2c 3d 4d 7d Jc', 'one-j-q-k', [4]],
    ['2c 3d 5d 6c 7c', 'four-to-inside-straight-no-high', [0, 1, 2, 3]],
    ['2h 4c 6d 8s 9h', 'discard-all', []],
  ])('%s → %s', (hand, rule, held) => {
    expect(play(hand)).toEqual({ rule, held });
  });
});
