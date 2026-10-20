// Seeded simulation of whole rounds through the round engine, playing the simple strategy, as an
// independent check on the exact house edge from compute-exact.ts (which never touches round.ts).
// Also checks the trips bet. Usage: pnpm simulate [rounds, default 4,000,000] [seed, default 1]
import { availableParallelism } from 'node:os';
import { isMainThread, parentPort, Worker, workerData } from 'node:worker_threads';
import { simpleAction } from '../src/advisor.ts';
import { applyAction, createRound } from '../src/round.ts';
import houseEdge from '../src/results/house-edge.json' with { type: 'json' };
import trips from '../src/results/trips.json' with { type: 'json' };

interface Totals {
  rounds: number;
  sum: number;
  sumSquares: number;
  tripsSum: number;
  tripsSumSquares: number;
}

function simulate(firstSeed: number, rounds: number): Totals {
  const totals: Totals = { rounds, sum: 0, sumSquares: 0, tripsSum: 0, tripsSumSquares: 0 };
  for (let i = 0; i < rounds; i++) {
    let round = createRound({ ante: 1, trips: 1, seed: (firstSeed + i) >>> 0 });
    while (round.street !== 'complete') round = applyAction(round, simpleAction(round)!);
    const s = round.settlement!;
    const main = s.total - s.trips;
    totals.sum += main;
    totals.sumSquares += main * main;
    totals.tripsSum += s.trips;
    totals.tripsSumSquares += s.trips * s.trips;
  }
  return totals;
}

if (!isMainThread) {
  const { firstSeed, rounds } = workerData as { firstSeed: number; rounds: number };
  parentPort!.postMessage(simulate(firstSeed, rounds));
} else {
  const rounds = Number(process.argv[2] ?? 4_000_000);
  const seed = Number(process.argv[3] ?? 1);
  const threads = availableParallelism();
  const started = performance.now();
  const per = Math.ceil(rounds / threads);
  const parts = await Promise.all(
    Array.from({ length: threads }, (_, t) => {
      const worker = new Worker(new URL(import.meta.url), { workerData: { firstSeed: seed + t * per, rounds: Math.min(per, rounds - t * per) } });
      return new Promise<Totals>((resolve, reject) => {
        worker.on('message', resolve);
        worker.on('error', reject);
      });
    }),
  );
  const n = parts.reduce((s, p) => s + p.rounds, 0);
  const report = (label: string, sum: number, sumSquares: number, exact: number): void => {
    const mean = sum / n;
    const halfWidth = 1.96 * Math.sqrt((sumSquares / n - mean * mean) / n);
    const pct = (x: number): string => `${(x * 100).toFixed(3)}%`;
    const inside = Math.abs(-mean - exact) <= halfWidth ? 'inside' : 'OUTSIDE';
    console.log(`${label}: house edge ${pct(-mean)} ± ${pct(halfWidth)} (95%); exact ${pct(exact)}, ${inside} the interval`);
  };
  report('Simple strategy', parts.reduce((s, p) => s + p.sum, 0), parts.reduce((s, p) => s + p.sumSquares, 0), houseEdge.simple.houseEdge);
  report('Trips 50-40-30-9-7-4-3', parts.reduce((s, p) => s + p.tripsSum, 0), parts.reduce((s, p) => s + p.tripsSumSquares, 0), trips.houseEdge['50-40-30-9-7-4-3']);
  console.log(`${n.toLocaleString('en-US')} rounds from seed ${seed} in ${((performance.now() - started) / 1000).toFixed(0)}s`);
}
