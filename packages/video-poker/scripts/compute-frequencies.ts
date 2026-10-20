// How often each final hand comes up under perfect play at max bet, for every paytable. Writes
// src/frequencies.json (probability per HandClass), shown on the strategy pages. About a minute per
// paytable. Re-run after adding or changing a paytable: pnpm frequencies
import { writeFileSync } from 'node:fs';
import { handDistribution, MAX_COINS, payouts, paytables } from '../src/index.ts';

const frequencies: Record<string, number[]> = {};
for (const table of paytables) {
  const started = performance.now();
  const pays = payouts(table, MAX_COINS);
  const distribution = handDistribution(pays);
  frequencies[table.id] = distribution.map((p) => Number(p.toPrecision(10)));
  const total = distribution.reduce((sum, p) => sum + p, 0);
  const result = distribution.reduce((sum, p, handClass) => sum + p * pays[handClass], 0) / MAX_COINS;
  const seconds = ((performance.now() - started) / 1000).toFixed(1);
  console.log(`${table.id.padEnd(26)} total ${total.toFixed(10)}, return ${(result * 100).toFixed(4)}% (${seconds}s)`);
}

writeFileSync(new URL('../src/frequencies.json', import.meta.url), JSON.stringify(frequencies, null, 2) + '\n');
