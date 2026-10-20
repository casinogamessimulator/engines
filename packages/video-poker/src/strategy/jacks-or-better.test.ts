import { describe, expect, it } from 'vitest';
import { holdToIndexes } from '../analyze.ts';
import { parseCards } from '../cards.ts';
import { chartFor, chartPlay } from './index.ts';

const jacks96 = chartFor('jacks-or-better-9-6')!.rules;
const play = (hand: string) => {
  const { rule, hold } = chartPlay(parseCards(hand), jacks96);
  return { rule: rule.id, held: holdToIndexes(hold) };
};

describe('Jacks or Better 9/6 chart', () => {
  it.each([
    ['Ah Kh Qh Jh Th', 'pat-royal-straight-flush-quads', [0, 1, 2, 3, 4]],
    ['9c 9d 9h 9s 2c', 'pat-royal-straight-flush-quads', [0, 1, 2, 3]],
    ['Ah Kh Qh Jh 3h', 'four-to-royal', [0, 1, 2, 3]],
    ['7c 7d 7h 2s Kc', 'pat-full-house-flush-straight-trips', [0, 1, 2]],
    ['5h 6h 7h 8h Jc', 'four-to-straight-flush', [0, 1, 2, 3]],
    ['Js Jh 4h 8h 2h', 'high-pair', [0, 1]],
    ['Kh Qh Jh 4h 9c', 'three-to-royal', [0, 1, 2]],
    ['5s 5h 6d 7c 8h', 'low-pair', [0, 1]],
    ['2s 5h 6d 7c 8h', 'four-to-outside-straight', [1, 2, 3, 4]],
    ['As 6s 4d 5d Kd', 'unsuited-ak-aq-aj', [0, 4]],
    ['2c 3d 4d 7d Jc', 'one-j-q-k', [4]],
    ['2d 3d 4d 6c 8c', 'three-to-straight-flush-b', [0, 1, 2]],
    ['2h 4c 6d 8s 9h', 'discard-all', []],
  ])('%s → %s', (hand, rule, held) => {
    expect(play(hand)).toEqual({ rule, held });
  });
});
