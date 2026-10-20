import { describe, expect, it } from 'vitest';
import { presetResult } from './results.ts';
import { simulate } from './simulate.ts';

describe('simulate', () => {
  // A smoke test of engine and chart together; scripts/simulate.ts runs millions of rounds for a tight interval.
  it('plays the chart through the engine close to the analytic edge', () => {
    const preset = presetResult('6d-h17-das-rs4-ls')!;
    const result = simulate(preset.rules, preset.chart, { rounds: 40_000, seed: 'smoke', continuousShuffle: true });
    expect(Math.abs(result.mean + preset.houseEdge)).toBeLessThan(4 * result.standardError);
    expect(result.standardError).toBeGreaterThan(0.004);
    expect(result.standardError).toBeLessThan(0.007);
  });

  it('is reproducible by seed', () => {
    const preset = presetResult('1d-s17-ndas-rs4')!;
    const options = { rounds: 2_000, seed: 7, penetration: 0.6 };
    expect(simulate(preset.rules, preset.chart, options)).toEqual(simulate(preset.rules, preset.chart, options));
  });
});
