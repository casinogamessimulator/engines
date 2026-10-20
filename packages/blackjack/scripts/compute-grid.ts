// Basic strategy and house edge for every combination of the five rules players change most (decks, soft 17,
// double after split, surrender, blackjack payout), plus the 6-deck Strip game with one other rule changed at a
// time. Writes src/rule-grid.json, which the site uses to switch rules instantly. pnpm grid (about 30 s)
import { writeFileSync } from 'node:fs';
import { DealerCache } from '../src/analysis.ts';
import { GRID_DECKS, gridKey, encodeChart, RULE_VARIANTS, type RuleGrid } from '../src/grid.ts';
import { makeRules } from '../src/rules.ts';
import { analyzeRules } from '../src/strategy.ts';

const round = (value: number): number => Math.round(value * 1e8) / 1e8;
const caches = new Map<string, DealerCache>();
const cacheFor = (decks: number, hitsSoft17: boolean): DealerCache => {
  const id = `${decks}-${hitsSoft17}`;
  if (!caches.has(id)) caches.set(id, new DealerCache(decks, hitsSoft17));
  return caches.get(id)!;
};

const grid: RuleGrid = { rules: {}, variants: {} };
const started = performance.now();
for (const decks of GRID_DECKS)
  for (const dealerHitsSoft17 of [false, true])
    for (const doubleAfterSplit of [true, false])
      for (const surrender of ['none', 'late', 'early'] as const)
        for (const blackjackPays of ['3:2', '6:5'] as const) {
          const rules = makeRules({ decks, dealerHitsSoft17, doubleAfterSplit, surrender, blackjackPays });
          const result = analyzeRules(rules, { dealerCache: cacheFor(decks, dealerHitsSoft17) });
          grid.rules[gridKey(rules)!] =[round(result.houseEdge), round(result.houseEdgeOptimal), encodeChart(result.chart)];
        }
for (const [id, overrides] of Object.entries(RULE_VARIANTS)) {
  const rules = makeRules(overrides);
  const result = analyzeRules(rules, { dealerCache: cacheFor(rules.decks, rules.dealerHitsSoft17) });
  grid.variants[id] = [round(result.houseEdge), round(result.houseEdgeOptimal)];
  console.log(id.padEnd(16), `${(result.houseEdge * 100).toFixed(4)}%`);
}
console.log(`${Object.keys(grid.rules).length} rule sets in ${((performance.now() - started) / 1000).toFixed(1)}s`);
writeFileSync(new URL('../src/rule-grid.json', import.meta.url), JSON.stringify(grid) + '\n');
