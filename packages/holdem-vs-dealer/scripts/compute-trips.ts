// Counts every 7-card hand by category and writes src/results/trips.json: the counts the trips side
// bet's return is computed from, plus the exact house edge of each known paytable. pnpm trips
import { writeFileSync } from 'node:fs';
import { TRIPS_PAYTABLES } from '../src/paytables.ts';
import { sevenCardCounts } from '../src/seven-card-counts.ts';
import { tripsExpectedValue } from '../src/trips.ts';

const started = performance.now();
const counts = sevenCardCounts();
const houseEdge = Object.fromEntries(TRIPS_PAYTABLES.map((table) => [table.id, -tripsExpectedValue(table, counts)]));

writeFileSync(
  new URL('../src/results/trips.json', import.meta.url),
  JSON.stringify({ method: 'Exhaustive count of all 133,784,560 seven-card hands; exact.', counts, houseEdge }, null, 2) + '\n',
);
console.log(counts);
for (const [id, edge] of Object.entries(houseEdge)) console.log(id.padEnd(18), `${(edge * 100).toFixed(4)}%`);
console.log(`Done in ${((performance.now() - started) / 1000).toFixed(1)}s`);
