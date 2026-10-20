import { describe, expect, it } from 'vitest';
import { getBet, getBetById, listBets, payoutFor, type BetKind } from './bets.ts';
import { DOUBLE_ZERO, TRIPLE_ZERO, wheels } from './wheels.ts';

const countByKind = (id: keyof typeof wheels) => {
  const counts: Partial<Record<BetKind, number>> = {};
  for (const bet of listBets(wheels[id])) counts[bet.kind] = (counts[bet.kind] ?? 0) + 1;
  return counts;
};

describe('payouts', () => {
  it('follows the standard schedule', () => {
    expect([1, 2, 3, 4, 5, 6, 12, 18].map(payoutFor)).toEqual([35, 17, 11, 8, 6, 5, 2, 1]);
  });

  it('pays every bet by how many numbers it covers', () => {
    for (const wheel of Object.values(wheels))
      for (const bet of listBets(wheel)) expect(bet.payout).toBe(payoutFor(bet.pockets.length));
  });
});

describe('listBets', () => {
  it('has every single-zero bet', () => {
    expect(countByKind('single-zero')).toEqual({
      straight: 37,
      split: 60, // 57 on the grid + 0-1, 0-2, 0-3
      street: 12,
      trio: 2,
      corner: 22,
      'top-line': 1,
      'six-line': 11,
      dozen: 3,
      column: 3,
      red: 1,
      black: 1,
      odd: 1,
      even: 1,
      low: 1,
      high: 1,
    });
  });

  it('has every double-zero bet, including the 5-number top line', () => {
    expect(countByKind('double-zero')).toMatchObject({ straight: 38, split: 62, trio: 3, corner: 22, 'top-line': 1 });
    expect(getBet(wheels['double-zero'], 'top-line', [3, 2, 1, DOUBLE_ZERO, 0])).toMatchObject({
      id: 'top-line:0-00-1-2-3',
      payout: 6,
    });
  });

  it('has the triple-zero zero bets', () => {
    expect(countByKind('triple-zero')).toMatchObject({ straight: 39, split: 62, trio: 1, corner: 24, 'top-line': 1 });
    expect(getBet(wheels['triple-zero'], 'trio', [0, DOUBLE_ZERO, TRIPLE_ZERO]).payout).toBe(11);
    expect(getBet(wheels['triple-zero'], 'top-line', [0, DOUBLE_ZERO, TRIPLE_ZERO, 1, 2, 3]).payout).toBe(5);
  });

  it('gives every bet a unique id', () => {
    for (const wheel of Object.values(wheels)) {
      const ids = listBets(wheel).map((bet) => bet.id);
      expect(new Set(ids).size).toBe(ids.length);
      for (const id of ids) expect(getBetById(wheel, id).id).toBe(id);
    }
  });

  it('covers the right numbers with the outside bets', () => {
    const wheel = wheels['single-zero'];
    expect(getBet(wheel, 'dozen', 2).pockets).toEqual([13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24]);
    expect(getBet(wheel, 'column', 1).pockets.slice(0, 3)).toEqual([1, 4, 7]);
    expect(getBet(wheel, 'column', 3).pockets.at(-1)).toBe(36);
    expect(getBet(wheel, 'red').pockets).toContain(1);
    expect(getBet(wheel, 'black').pockets).toContain(2);
    for (const kind of ['red', 'black', 'odd', 'even', 'low', 'high'] as const) {
      expect(getBet(wheel, kind).pockets).toHaveLength(18);
      expect(getBet(wheel, kind).payout).toBe(1);
    }
  });

  it('rejects bets the layout does not have', () => {
    expect(() => getBet(wheels['single-zero'], 'split', [1, 5])).toThrow();
    expect(() => getBet(wheels['single-zero'], 'split', [0, DOUBLE_ZERO])).toThrow();
    expect(() => getBet(wheels['double-zero'], 'split', [0, 3])).toThrow();
    expect(() => getBet(wheels['single-zero'], 'corner', [3, 4, 6, 7])).toThrow();
    expect(getBet(wheels['single-zero'], 'corner', [8, 5, 4, 7]).id).toBe('corner:4-5-7-8');
  });
});
