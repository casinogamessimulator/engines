// Plays strategy charts over all 2,598,960 deals and compares them with perfect play. Writes each family's
// src/strategy/results/<family>.json (shown with the charts) and prints the costliest disagreements, which
// is how the charts are tuned.
//   pnpm verify-strategy                      every chart
//   pnpm verify-strategy bonus-poker          one family
//   pnpm verify-strategy bonus-poker easy     one family, one level
import { readFileSync, writeFileSync } from 'node:fs';
import {
  chartPlay,
  formatCard,
  getPaytable,
  MAX_COINS,
  payouts,
  ReturnTable,
  strategyFamilies,
  type StrategyLevel,
  type StrategyResults,
} from '../src/index.ts';

const DEALS = 2598960;
const [onlyFamily, onlyLevel] = process.argv.slice(2) as [string | undefined, StrategyLevel | undefined];
const families = strategyFamilies.filter((family) => !onlyFamily || family.id === onlyFamily);
if (families.length === 0) {
  console.error(`No family "${onlyFamily}". Families: ${strategyFamilies.map((f) => f.id).join(', ')}`);
  process.exit(1);
}

for (const family of families) {
  const file = new URL(`../src/strategy/results/${family.id}.json`, import.meta.url);
  const results = JSON.parse(readFileSync(file, 'utf8')) as StrategyResults;

  for (const chart of family.charts) {
    if (onlyLevel && chart.level !== onlyLevel) continue;
    for (const paytableId of chart.paytableIds) {
      const started = performance.now();
      const table = new ReturnTable(payouts(getPaytable(paytableId), MAX_COINS));
      const evs = new Float64Array(32);
      const hand = [0, 0, 0, 0, 0];
      let chartTotal = 0;
      let perfectTotal = 0;
      let agree = 0;
      const lossByRule = new Map<string, { loss: number; count: number; example: string; better: string }>();

      for (let e = 4; e < 52; e++)
        for (let d = 3; d < e; d++)
          for (let c = 2; c < d; c++)
            for (let b = 1; b < c; b++)
              for (let a = 0; a < b; a++) {
                hand[0] = a; hand[1] = b; hand[2] = c; hand[3] = d; hand[4] = e;
                table.holdEvs(hand, evs);
                let best = 0;
                let bestHold = 0;
                for (let hold = 0; hold < 32; hold++) if (evs[hold] > best) { best = evs[hold]; bestHold = hold; }
                const play = chartPlay(hand, chart.rules);
                const ev = evs[play.hold];
                chartTotal += ev;
                perfectTotal += best;
                if (ev >= best - 1e-9) {
                  agree++;
                } else {
                  const entry = lossByRule.get(play.rule.id) ?? { loss: 0, count: 0, example: '', better: '' };
                  entry.loss += best - ev;
                  entry.count++;
                  if (!entry.example) {
                    entry.example = hand.map(formatCard).join(' ');
                    entry.better = hand.filter((_, i) => bestHold & (1 << i)).map(formatCard).join(' ') || 'discard all';
                  }
                  lossByRule.set(play.rule.id, entry);
                }
              }

      const chartReturn = chartTotal / DEALS / MAX_COINS;
      const perfectReturn = perfectTotal / DEALS / MAX_COINS;
      results[paytableId] = {
        ...results[paytableId],
        [chart.level]: {
          chartReturn: Math.round(chartReturn * 1e8) / 1e8,
          perfectReturn: Math.round(perfectReturn * 1e8) / 1e8,
          agreement: Math.round((agree / DEALS) * 1e6) / 1e6,
        },
      };
      const seconds = ((performance.now() - started) / 1000).toFixed(1);
      console.log(
        `${paytableId} ${chart.level} (${chart.rules.length} rules): chart ${(chartReturn * 100).toFixed(4)}%` +
          ` vs perfect ${(perfectReturn * 100).toFixed(4)}%, same play on ${((agree / DEALS) * 100).toFixed(2)}% of deals (${seconds}s)`,
      );
      const worst = [...lossByRule.entries()].sort((x, y) => y[1].loss - x[1].loss).slice(0, 10);
      for (const [rule, { loss, count, example, better }] of worst) {
        console.log(
          `  ${rule.padEnd(36)} ${count.toString().padStart(7)} deals, ${((loss / DEALS / MAX_COINS) * 100).toFixed(4)}% lost` +
            `  e.g. ${example} → better: ${better}`,
        );
      }
    }
  }

  // Keep the file in a stable order: paytables as listed, easy before best.
  const ordered: StrategyResults = {};
  for (const id of Object.keys(results)) {
    const { easy, best } = results[id];
    ordered[id] = { ...(easy && { easy }), ...(best && { best }) };
  }
  writeFileSync(file, JSON.stringify(ordered, null, 2) + '\n');
}
