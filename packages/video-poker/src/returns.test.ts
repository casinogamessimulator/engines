import { describe, expect, it } from 'vitest';
import { getPaytable, MAX_COINS, payouts } from './paytables.ts';
import { computeReturn } from './returns.ts';

// Published returns under perfect play at max bet (e.g. Wizard of Odds' video poker tables).
describe('computeReturn', () => {
  it.each([
    ['jacks-or-better-9-6', 0.995439],
    ['jacks-or-better-8-5', 0.972984],
    ['bonus-poker-8-5', 0.99166],
    ['double-bonus-10-7', 1.001725],
    ['double-double-bonus-9-6', 0.989808], // exercises the kicker quads
  ])(
    '%s',
    (id, expected) => {
      const result = computeReturn(payouts(getPaytable(id), MAX_COINS), MAX_COINS);
      expect(result).toBeCloseTo(expected, 6);
    },
    // A few seconds per paytable locally, more on shared CI runners.
    60_000,
  );
});
