// Computes every paytable's return under perfect play at max bet and writes src/returns.json, which the
// game shows next to each paytable. Re-run after adding or changing a paytable: pnpm returns
import { writeFileSync } from 'node:fs';
import { computeReturn, MAX_COINS, payouts, paytables } from '../src/index.ts';

const returns: Record<string, number> = {};
for (const table of paytables) {
  const started = performance.now();
  const result = computeReturn(payouts(table, MAX_COINS), MAX_COINS);
  returns[table.id] = Math.round(result * 1e8) / 1e8;
  const seconds = ((performance.now() - started) / 1000).toFixed(1);
  console.log(`${table.gameName} ${table.label}`.padEnd(34), `${(result * 100).toFixed(4)}%`, `(${seconds}s)`);
}

writeFileSync(new URL('../src/returns.json', import.meta.url), JSON.stringify(returns, null, 2) + '\n');
