// Sets every one of the C(53, 7) = 154,143,080 seven-card hands the house way and writes:
// - src/dealer-distribution.json: how often the dealer ends up with each (high hand, low hand) pair, which
//   the optimal setter compares a player's settings against;
// - src/hand-frequencies.json: how often each best 5-card poker hand occurs among 7 cards, checked against
//   Wizard of Odds' published table in the tests.
// Splits the enumeration across worker threads; about a minute and a half on 8 cores. Re-run after changing the
// evaluator or the house way: pnpm dealer-distribution
import { availableParallelism } from 'node:os';
import { isMainThread, parentPort, Worker } from 'node:worker_threads';
import { writeFileSync } from 'node:fs';
import { DECK_SIZE, JOKER } from '../src/cards.ts';
import { Category, DEFAULT_RULES, categoryOf, wheelCode } from '../src/evaluate.ts';
import { houseWayRule, houseWaySplit } from '../src/house-way.ts';
import { SPLITS, SPLIT_COUNT, evaluateSplits } from '../src/setting.ts';
import { LOW_VALUES, type DealerDistribution } from '../src/optimal.ts';

const LOW_SPAN = 182; // low values are 0..181

interface Job {
  first: number;
  second: number;
}

interface Tally {
  cells: [number, number][]; // [high * LOW_SPAN + low, hands]
  categories: number[]; // best 5 of 7, indexed by Category
  royals: number;
  naturalRoyals: number;
  ruleMisses: number; // hands the published rules failed to set (expected 0)
  hands: number;
}

if (isMainThread) {
  const started = performance.now();
  const jobs: Job[] = [];
  for (let first = 0; first < DECK_SIZE - 6; first++) for (let second = first + 1; second < DECK_SIZE - 5; second++) jobs.push({ first, second });

  const cells = new Map<number, number>();
  const categories = new Array<number>(10).fill(0);
  let royals = 0;
  let naturalRoyals = 0;
  let ruleMisses = 0;
  let hands = 0;

  const workers = Array.from({ length: availableParallelism() }, () => new Worker(new URL(import.meta.url)));
  await Promise.all(
    workers.map(
      (worker) =>
        new Promise<void>((resolve, reject) => {
          const next = (): void => {
            const job = jobs.shift();
            if (job) worker.postMessage(job);
            else worker.postMessage(null);
          };
          worker.on('message', (tally: Tally | 'ready') => {
            if (tally !== 'ready') {
              for (const [key, count] of tally.cells) cells.set(key, (cells.get(key) ?? 0) + count);
              tally.categories.forEach((count, category) => (categories[category] += count));
              royals += tally.royals;
              naturalRoyals += tally.naturalRoyals;
              ruleMisses += tally.ruleMisses;
              hands += tally.hands;
            }
            next();
          });
          worker.on('error', reject);
          worker.on('exit', () => resolve());
        }),
    ),
  );

  if (ruleMisses) throw new Error(`The house way rules failed to set ${ruleMisses} hands`);

  const highs = [...new Set([...cells.keys()].map((key) => Math.floor(key / LOW_SPAN)))].sort((a, b) => a - b);
  const highIndex = new Map(highs.map((value, index) => [value, index]));
  const lowIndex = new Map(LOW_VALUES.map((value, index) => [value, index]));
  // Row per high hand: [low index, hands, low index, hands, ...].
  const rows: number[][] = highs.map(() => []);
  for (const [key, count] of [...cells].sort((a, b) => a[0] - b[0])) {
    const row = rows[highIndex.get(Math.floor(key / LOW_SPAN))!];
    row.push(lowIndex.get(key % LOW_SPAN)!, count);
  }
  const distribution: DealerDistribution = { houseWay: 'foxwoods', wheel: DEFAULT_RULES.wheel, hands, highs, rows };
  writeFileSync(new URL('../src/dealer-distribution.json', import.meta.url), JSON.stringify(distribution) + '\n');

  const frequencies = {
    hands,
    fiveAces: categories[Category.FiveAces],
    straightFlush: categories[Category.StraightFlush], // royals included
    royalFlush: royals,
    naturalRoyalFlush: naturalRoyals,
    fourOfAKind: categories[Category.FourOfAKind],
    fullHouse: categories[Category.FullHouse],
    flush: categories[Category.Flush],
    straight: categories[Category.Straight],
    threeOfAKind: categories[Category.ThreeOfAKind],
    twoPair: categories[Category.TwoPair],
    pair: categories[Category.Pair],
    highCard: categories[Category.HighCard],
  };
  writeFileSync(new URL('../src/hand-frequencies.json', import.meta.url), JSON.stringify(frequencies, null, 2) + '\n');

  console.log(frequencies);
  console.log(`${highs.length} dealer high hands, ${cells.size} (high, low) pairs`);
  console.log(`${((performance.now() - started) / 1000).toFixed(1)}s`);
} else {
  const wheel = wheelCode(DEFAULT_RULES);
  const ROYAL = (Category.StraightFlush << 20) | 24;
  const highs = new Int32Array(SPLIT_COUNT);
  const lows = new Int32Array(SPLIT_COUNT);
  const hand = new Int32Array(7);

  parentPort!.on('message', (job: Job | null) => {
    if (!job) return process.exit(0);
    const cells = new Map<number, number>();
    const categories = new Array<number>(10).fill(0);
    let royals = 0;
    let naturalRoyals = 0;
    let ruleMisses = 0;
    let hands = 0;
    hand[0] = job.first;
    hand[1] = job.second;
    for (let c = job.second + 1; c < DECK_SIZE; c++) {
      hand[2] = c;
      for (let d = c + 1; d < DECK_SIZE; d++) {
        hand[3] = d;
        for (let e = d + 1; e < DECK_SIZE; e++) {
          hand[4] = e;
          for (let f = e + 1; f < DECK_SIZE; f++) {
            hand[5] = f;
            for (let g = f + 1; g < DECK_SIZE; g++) {
              hand[6] = g;
              evaluateSplits(hand, wheel, highs, lows);
              let best = 0;
              for (let s = 0; s < SPLIT_COUNT; s++) if (highs[s] > best) best = highs[s];
              categories[categoryOf(best)]++;
              if (best === ROYAL) {
                royals++;
                // Natural if there is no joker or some royal leaves it out (the joker, card 52, sorts last).
                let natural = g !== JOKER;
                for (let s = 0; s < SPLIT_COUNT && !natural; s++) natural = highs[s] === ROYAL && SPLITS[s][1] === 6;
                if (natural) naturalRoyals++;
              }
              let split = houseWayRule(hand, highs, lows);
              if (split < 0) {
                ruleMisses++;
                split = houseWaySplit(hand, highs, lows);
              }
              const key = highs[split] * LOW_SPAN + lows[split];
              cells.set(key, (cells.get(key) ?? 0) + 1);
              hands++;
            }
          }
        }
      }
    }
    const tally: Tally = { cells: [...cells], categories, royals, naturalRoyals, ruleMisses, hands };
    parentPort!.postMessage(tally);
  });
  parentPort!.postMessage('ready');
}
