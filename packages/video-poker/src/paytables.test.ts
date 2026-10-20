import { describe, expect, it } from 'vitest';
import { HAND_CLASS_COUNT, HandClass } from './evaluate.ts';
import { getPaytable, payouts, paytableRows, paytables } from './paytables.ts';

describe('payouts', () => {
  it('pays the royal bonus only on a max bet', () => {
    const table = getPaytable('jacks-or-better-9-6');
    expect(payouts(table, 4)[HandClass.RoyalFlush]).toBe(1000);
    expect(payouts(table, 5)[HandClass.RoyalFlush]).toBe(4000);
    expect(payouts(table, 5)[HandClass.FullHouse]).toBe(45);
  });
});

describe('paytableRows', () => {
  it.each(paytables.map((t) => [t.id, t] as const))('%s lists every paying hand once', (_, table) => {
    const classes = paytableRows(table).flatMap((row) => row.classes);
    const paying = Array.from({ length: HAND_CLASS_COUNT }, (_, c) => c).filter((c) => table.perCoin[c] > 0);
    expect([...classes].sort((a, b) => a - b)).toEqual(paying);
    for (const row of paytableRows(table)) {
      expect(new Set(row.classes.map((c) => table.perCoin[c])).size).toBe(1);
    }
  });

  it('shows one quads row for Jacks or Better and five for Double Double Bonus', () => {
    const ids = (id: string) => paytableRows(getPaytable(id)).map((row) => row.id).filter((r) => r.startsWith('four'));
    expect(ids('jacks-or-better-9-6')).toEqual(['four-of-a-kind']);
    expect(ids('bonus-poker-8-5')).toEqual(['four-aces', 'four-2-4', 'four-5-k']);
    expect(ids('double-double-bonus-9-6')).toEqual([
      'four-aces-with-2-4',
      'four-2-4-with-a-4',
      'four-aces',
      'four-2-4',
      'four-5-k',
    ]);
  });
});
