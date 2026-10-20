import { describe, expect, it } from 'vitest';
import { parseCards } from '../cards.ts';
import { paytables } from '../paytables.ts';
import returns from '../returns.json' with { type: 'json' };
import { strategyCharts, strategyResult } from './index.ts';

// What a chart may give up against perfect play, by level.
const MAX_LOSS = { best: 0.0001, easy: 0.005 };

describe('every strategy chart', () => {
  it.each(strategyCharts.map((chart) => [`${chart.paytableIds.join(', ')} ${chart.level}`, chart] as const))(
    '%s',
    (_, chart) => {
      for (const id of chart.paytableIds) {
        expect(paytables.some((p) => p.id === id), `unknown paytable ${id}`).toBe(true);
        const result = strategyResult(id, chart.level);
        expect(result, `${id} ${chart.level} has no results: run pnpm verify-strategy`).not.toBeNull();
        expect(result!.perfectReturn).toBeCloseTo((returns as Record<string, number>)[id], 6);
        expect(result!.perfectReturn - result!.chartReturn).toBeLessThan(MAX_LOSS[chart.level]);
      }
      expect(chart.rules.at(-1)!.id, 'the last rule should catch every hand').toBe('discard-all');
      expect(new Set(chart.rules).size, 'a rule appears twice').toBe(chart.rules.length);
      for (const rule of chart.rules) {
        for (const text of Object.values(rule.text)) expect(text.trim(), rule.id).not.toBe('');
        expect(Object.keys(rule.text).sort()).toEqual(['en', 'es', 'pt-br']);
        if (rule.example) expect(parseCards(rule.example).length, rule.id).toBeGreaterThan(0);
      }
    },
  );

  it('charts each paytable at most once per level', () => {
    const seen = new Set<string>();
    for (const chart of strategyCharts) {
      for (const id of chart.paytableIds) {
        const key = `${id} ${chart.level}`;
        expect(seen.has(key), key).toBe(false);
        seen.add(key);
      }
    }
  });
});
