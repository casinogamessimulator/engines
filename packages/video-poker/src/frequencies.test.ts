import { describe, expect, it } from 'vitest';
import { HAND_CLASS_COUNT } from './evaluate.ts';
import frequencies from './frequencies.json' with { type: 'json' };
import { MAX_COINS, payouts, paytables } from './paytables.ts';
import returns from './returns.json' with { type: 'json' };

// frequencies.json comes from scripts/compute-frequencies.ts (handDistribution, about 7 s per paytable).
describe('hand frequencies under perfect play', () => {
  it.each(paytables.map((table) => [table.id, table] as const))('%s', (id, table) => {
    const distribution = (frequencies as Record<string, number[]>)[id];
    expect(distribution, `${id} missing: run pnpm frequencies`).toHaveLength(HAND_CLASS_COUNT);
    expect(distribution.reduce((sum, p) => sum + p, 0)).toBeCloseTo(1, 8);
    const pays = payouts(table, MAX_COINS);
    const result = distribution.reduce((sum, p, handClass) => sum + p * pays[handClass], 0) / MAX_COINS;
    expect(result).toBeCloseTo((returns as Record<string, number>)[id], 7);
  });
});
