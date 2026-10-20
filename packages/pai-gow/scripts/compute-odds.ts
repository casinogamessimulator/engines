// Simulates seeded rounds against a house-way dealer (the house banks, 5% commission) and writes
// src/odds.json with the win, push and loss rates and the house edge, each with a 95% confidence
// interval, for two player strategies played on the same deals:
// - the house way (Wizard of Odds' exact figure: 2.7212% house edge, 40.4958% pushes);
// - the optimal setter (WoO's exact optimal strategy: 2.5122%).
// An exact count would pair every player hand with every dealer hand, 8.25 × 10^15 deals, so this
// samples instead. Each chunk of rounds has its own seed, so the result doesn't depend on how chunks
// land on worker threads. Needs src/dealer-distribution.json (pnpm dealer-distribution) first.
// About 14 minutes on 8 cores for the default 400 million rounds: pnpm odds [rounds]
import { readFileSync, writeFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { isMainThread, parentPort, Worker } from 'node:worker_threads';
import { DECK_SIZE, seededRandomInt } from '../src/cards.ts';
import { DEFAULT_RULES, wheelCode } from '../src/evaluate.ts';
import { houseWaySplit } from '../src/house-way.ts';
import { createOptimalSetter, type DealerDistribution } from '../src/optimal.ts';
import { DEFAULT_COMMISSION } from '../src/round.ts';
import { SPLIT_COUNT, evaluateSplits } from '../src/setting.ts';

const SEED = 20261019;
const CHUNK = 1_000_000;
const Z95 = 1.959964;

// Published by Wizard of Odds (wizardofodds.com/games/pai-gow-poker/), dealer banking, exact.
const PUBLISHED = {
  houseWay: { win: 0.291195, push: 0.404958, lose: 0.303847, houseEdge: 0.027212 },
  optimal: { win: 0.292486, push: 0.404529, lose: 0.302984, houseEdge: 0.025122 },
};

interface Counts {
  win: number;
  push: number;
  lose: number;
}

interface ChunkResult {
  houseWay: Counts;
  optimal: Counts;
  /** Rounds where the two strategies set the player's hand differently. */
  differentSettings: number;
}

if (isMainThread) {
  const rounds = Number(process.argv[2] ?? 400_000_000);
  const chunks = Math.ceil(rounds / CHUNK);
  const started = performance.now();
  const total: ChunkResult = { houseWay: { win: 0, push: 0, lose: 0 }, optimal: { win: 0, push: 0, lose: 0 }, differentSettings: 0 };
  let nextChunk = 0;
  let done = 0;

  const workers = Array.from({ length: Math.min(availableParallelism(), chunks) }, () => new Worker(new URL(import.meta.url)));
  await Promise.all(
    workers.map(
      (worker) =>
        new Promise<void>((resolve, reject) => {
          worker.on('message', (result: ChunkResult | 'ready') => {
            if (result !== 'ready') {
              for (const strategy of ['houseWay', 'optimal'] as const) {
                total[strategy].win += result[strategy].win;
                total[strategy].push += result[strategy].push;
                total[strategy].lose += result[strategy].lose;
              }
              total.differentSettings += result.differentSettings;
              done++;
              if (done % 20 === 0) console.log(`${done}/${chunks} chunks, ${((performance.now() - started) / 1000).toFixed(0)}s`);
            }
            if (nextChunk < chunks) {
              const chunk = nextChunk++;
              worker.postMessage({ seed: SEED + chunk, rounds: Math.min(CHUNK, rounds - chunk * CHUNK) });
            } else worker.postMessage(null);
          });
          worker.on('error', reject);
          worker.on('exit', () => resolve());
        }),
    ),
  );

  const summarize = (counts: Counts) => {
    const n = counts.win + counts.push + counts.lose;
    const win = counts.win / n;
    const push = counts.push / n;
    const lose = counts.lose / n;
    const ev = (1 - DEFAULT_COMMISSION) * win - lose;
    const variance = (1 - DEFAULT_COMMISSION) ** 2 * win + lose - ev * ev;
    const proportionError = (p: number): number => Z95 * Math.sqrt((p * (1 - p)) / n);
    const round = (x: number): number => Math.round(x * 1e7) / 1e7;
    const interval = (x: number, margin: number): [number, number] => [round(x - margin), round(x + margin)];
    const edgeMargin = Z95 * Math.sqrt(variance / n);
    return {
      rounds: n,
      win: round(win),
      push: round(push),
      lose: round(lose),
      houseEdge: round(-ev),
      ci95: {
        win: interval(win, proportionError(win)),
        push: interval(push, proportionError(push)),
        lose: interval(lose, proportionError(lose)),
        houseEdge: interval(-ev, edgeMargin),
      },
    };
  };

  const odds = {
    method: `Seeded simulation of ${rounds.toLocaleString('en-US')} rounds (seed ${SEED}), both strategies on the same deals, against a Foxwoods house-way dealer who banks; 5% commission on wins; A-2-3-4-5 is the second-highest straight. Confidence intervals are 95% (normal approximation).`,
    houseWay: summarize(total.houseWay),
    optimal: summarize(total.optimal),
    differentSettings: Math.round((total.differentSettings / rounds) * 1e7) / 1e7,
    published: PUBLISHED,
  };
  writeFileSync(new URL('../src/odds.json', import.meta.url), JSON.stringify(odds, null, 2) + '\n');
  console.log(JSON.stringify(odds, null, 2));
  console.log(`${((performance.now() - started) / 1000).toFixed(1)}s`);
} else {
  const distribution: DealerDistribution = JSON.parse(readFileSync(new URL('../src/dealer-distribution.json', import.meta.url), 'utf8'));
  const optimal = createOptimalSetter(distribution);
  const wheel = wheelCode(DEFAULT_RULES);
  const deck = new Int32Array(DECK_SIZE);
  const player = new Int32Array(7);
  const dealer = new Int32Array(7);
  const highs = new Int32Array(SPLIT_COUNT);
  const lows = new Int32Array(SPLIT_COUNT);

  const tally = (counts: Counts, high: number, low: number, dealerHigh: number, dealerLow: number): void => {
    const wonHigh = high > dealerHigh;
    const wonLow = low > dealerLow;
    if (wonHigh && wonLow) counts.win++;
    else if (!wonHigh && !wonLow) counts.lose++;
    else counts.push++;
  };

  parentPort!.on('message', (job: { seed: number; rounds: number } | null) => {
    if (!job) return process.exit(0);
    const randomInt = seededRandomInt(job.seed);
    const result: ChunkResult = { houseWay: { win: 0, push: 0, lose: 0 }, optimal: { win: 0, push: 0, lose: 0 }, differentSettings: 0 };
    for (let i = 0; i < DECK_SIZE; i++) deck[i] = i;
    for (let round = 0; round < job.rounds; round++) {
      // Partial Fisher–Yates: the first 14 positions become a uniform random deal.
      for (let i = 0; i < 14; i++) {
        const j = i + randomInt(DECK_SIZE - i);
        const card = deck[j];
        deck[j] = deck[i];
        deck[i] = card;
        if (i < 7) player[i] = card;
        else dealer[i - 7] = card;
      }
      evaluateSplits(dealer, wheel, highs, lows);
      const dealerSplit = houseWaySplit(dealer, highs, lows);
      const dealerHigh = highs[dealerSplit];
      const dealerLow = lows[dealerSplit];

      // The optimal setter re-values the splits into its own buffers.
      const optimalSplit = optimal.bestSplit(player);
      evaluateSplits(player, wheel, highs, lows);
      const houseSplit = houseWaySplit(player, highs, lows);
      tally(result.houseWay, highs[houseSplit], lows[houseSplit], dealerHigh, dealerLow);
      tally(result.optimal, highs[optimalSplit], lows[optimalSplit], dealerHigh, dealerLow);
      if (highs[optimalSplit] !== highs[houseSplit] || lows[optimalSplit] !== lows[houseSplit]) result.differentSettings++;
    }
    parentPort!.postMessage(result);
  });
  parentPort!.postMessage('ready');
}
