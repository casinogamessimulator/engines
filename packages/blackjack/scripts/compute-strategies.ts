// Computes basic strategy and house edge for every preset rule set and writes src/strategies.json, which the site
// imports. Re-run after changing the presets or the analysis: pnpm strategies (about 1-2 s per rule set)
import { writeFileSync } from 'node:fs';
import { DealerCache } from '../src/analysis.ts';
import { PRESET_RULES } from '../src/presets.ts';
import { rulesId } from '../src/rules.ts';
import { analyzeRules } from '../src/strategy.ts';
import type { StrategyResult } from '../src/results.ts';

const round = (value: number): number => Math.round(value * 1e8) / 1e8;
const caches = new Map<string, DealerCache>();
const results: Record<string, StrategyResult> = {};
for (const rules of PRESET_RULES) {
  const started = performance.now();
  const cacheId = `${rules.decks}-${rules.dealerHitsSoft17}`;
  if (!caches.has(cacheId)) caches.set(cacheId, new DealerCache(rules.decks, rules.dealerHitsSoft17));
  const analysis = analyzeRules(rules, { dealerCache: caches.get(cacheId) });
  const id = rulesId(rules);
  results[id] = {
    rules,
    houseEdge: round(analysis.houseEdge),
    houseEdgeOptimal: round(analysis.houseEdgeOptimal),
    evByUpCard: Object.fromEntries(Object.entries(analysis.evByUpCard).map(([up, ev]) => [up, round(ev)])),
    chart: analysis.chart,
  };
  const seconds = ((performance.now() - started) / 1000).toFixed(1);
  console.log(
    id.padEnd(32),
    `basic ${(analysis.houseEdge * 100).toFixed(4)}%`,
    `perfect ${(analysis.houseEdgeOptimal * 100).toFixed(4)}%`,
    `(${seconds}s)`,
  );
}

// One chart row per line.
const json = JSON.stringify(results, null, 2).replace(/\[\n\s+("[^\]]+?)\n\s+\]/g, (_, cells: string) =>
  `[${cells.split(/,\n\s+/).join(', ')}]`,
);
writeFileSync(new URL('../src/strategies.json', import.meta.url), json + '\n');
