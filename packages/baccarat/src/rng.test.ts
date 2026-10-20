import { describe, expect, it } from 'vitest';
import { createRng } from './rng.ts';

describe('createRng', () => {
  // Shared result URLs replay from the seed, so the stream must never change: update these only on purpose.
  it('produces a fixed stream for a seed', () => {
    const rng = createRng('cgs');
    expect([rng.next(), rng.next(), rng.next(), rng.int(37), rng.int(416), rng.int(2 ** 21)]).toEqual([
      4087581980, 3346552087, 2289811159, 15, 354, 1652716,
    ]);
    const numeric = createRng(42);
    expect([numeric.next(), numeric.int(6)]).toEqual([2258495261, 1]);
  });

  it('draws integers uniformly in range', () => {
    const rng = createRng('uniform');
    for (const max of [1, 2, 6, 37, 416, 1000]) {
      const counts = new Array<number>(max).fill(0);
      for (let i = 0; i < max * 2_000; i++) counts[rng.int(max)]++;
      // Every draw landed in range, and each count is about 2,000 ± 45.
      expect(counts).toHaveLength(max);
      expect(counts.reduce((sum, count) => sum + count, 0)).toBe(max * 2_000);
      const worst = Math.max(...counts.map((count) => Math.abs(count - 2_000)));
      expect(worst).toBeLessThan(250);
    }
  });

  it('draws floats in [0, 1)', () => {
    const rng = createRng(7);
    const values = Array.from({ length: 100_000 }, () => rng.float());
    expect(Math.min(...values)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...values)).toBeLessThan(1);
    expect(Math.abs(values.reduce((sum, value) => sum + value, 0) / 100_000 - 0.5)).toBeLessThan(0.005);
  });

  it('rejects ranges it cannot draw from without bias', () => {
    const rng = createRng(1);
    for (const max of [0, -1, 1.5, NaN, 2 ** 21 + 1]) expect(() => rng.int(max)).toThrow();
  });
});
