// Exact analysis of the whole game by exhaustive enumeration: every starting hand, flop, turn-river and
// dealer hand. Writes src/results/preflop.json (EV of each preflop decision for the 169 starting-hand
// classes) and src/results/house-edge.json (house edge under optimal play and under the simple
// strategy). Runs on every core; a few minutes on a laptop. Re-run after changing the rules or the
// simple strategy: pnpm exact
import { writeFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { isMainThread, parentPort, Worker } from 'node:worker_threads';
import { analyzeFlop, BOARD_SCALE, FLOP_BOARDS, FLOP_HOLES, holeI, holeJ } from '../src/exact.ts';
import { simplePreflopRaises } from '../src/strategy.ts';
import { exampleHole, STARTING_HAND_COUNT, STARTING_HANDS, startingHandIndex } from '../src/starting-hands.ts';

// Per-class sums, each STARTING_HAND_COUNT long, in this order.
const FIELDS = ['sumD', 'sumC', 'optimalCheck', 'optimalFlopBets', 'optimalRiverBets', 'simpleCheck', 'simpleFlopBets', 'simpleRiverBets', 'flopCount'] as const;
type Field = (typeof FIELDS)[number];
const FIELD_INDEX = Object.fromEntries(FIELDS.map((f, i) => [f, i])) as Record<Field, number>;

/** The 1,755 flops distinct up to a change of suits, each with how many of the 22,100 flops it stands for. */
function canonicalFlops(): { cards: number[]; weight: number }[] {
  const perms: number[][] = [];
  const permute = (prefix: number[]): void => {
    if (prefix.length === 4) perms.push(prefix);
    for (let s = 0; s < 4; s++) if (!prefix.includes(s)) permute([...prefix, s]);
  };
  permute([]);
  const classes = new Map<number, { cards: number[]; weight: number }>();
  for (let a = 0; a < 52; a++) {
    for (let b = a + 1; b < 52; b++) {
      for (let c = b + 1; c < 52; c++) {
        let best = Infinity;
        let bestCards: number[] = [];
        for (const p of perms) {
          const mapped = [a, b, c].map((x) => (x & ~3) | p[x & 3]).sort((x, y) => x - y);
          const key = (mapped[0] * 52 + mapped[1]) * 52 + mapped[2];
          if (key < best) {
            best = key;
            bestCards = mapped;
          }
        }
        const entry = classes.get(best);
        if (entry) entry.weight++;
        else classes.set(best, { cards: bestCards, weight: 1 });
      }
    }
  }
  return [...classes.values()];
}

function analyzeFlops(flops: { cards: number[]; weight: number }[]): Float64Array {
  const sums = new Float64Array(FIELDS.length * STARTING_HAND_COUNT);
  const add = (field: Field, hand: number, amount: number): void => {
    sums[FIELD_INDEX[field] * STARTING_HAND_COUNT + hand] += amount;
  };
  for (const { cards, weight: w } of flops) {
    const a = analyzeFlop(cards);
    for (let h = 0; h < FLOP_HOLES; h++) {
      const hand = startingHandIndex(a.rest[holeI(h)], a.rest[holeJ(h)]);
      const bet = 2 * a.sumD[h] + a.sumC[h];
      const optimalBets = bet > a.optimalRiver[h];
      const simpleBets = a.simpleFlopBets[h] === 1;
      add('sumD', hand, w * a.sumD[h]);
      add('sumC', hand, w * a.sumC[h]);
      add('optimalCheck', hand, w * Math.max(bet, a.optimalRiver[h]));
      add('optimalFlopBets', hand, optimalBets ? w : 0);
      add('optimalRiverBets', hand, optimalBets ? 0 : w * a.optimalRiverBets[h]);
      add('simpleCheck', hand, w * (simpleBets ? bet : a.simpleRiver[h]));
      add('simpleFlopBets', hand, simpleBets ? w : 0);
      add('simpleRiverBets', hand, simpleBets ? 0 : w * a.simpleRiverBets[h]);
      add('flopCount', hand, w);
    }
  }
  return sums;
}

if (!isMainThread) {
  parentPort!.on('message', (flops: { cards: number[]; weight: number }[] | null) => {
    if (flops === null) process.exit(0);
    parentPort!.postMessage(analyzeFlops(flops));
  });
} else {
  const started = performance.now();
  const flops = canonicalFlops();
  console.log(`${flops.length} canonical flops (of ${flops.reduce((s, f) => s + f.weight, 0)})`);

  const total = new Float64Array(FIELDS.length * STARTING_HAND_COUNT);
  const CHUNK = 5;
  let next = 0;
  let done = 0;
  const threads = availableParallelism();
  await Promise.all(
    Array.from({ length: threads }, () => {
      const worker = new Worker(new URL(import.meta.url));
      return new Promise<void>((resolve, reject) => {
        const feed = (): void => {
          if (next >= flops.length) {
            worker.postMessage(null);
            return;
          }
          worker.postMessage(flops.slice(next, next + CHUNK));
          next += CHUNK;
        };
        worker.on('message', (sums: Float64Array) => {
          for (let i = 0; i < sums.length; i++) total[i] += sums[i];
          done = Math.min(done + CHUNK, flops.length);
          if (done % 100 < CHUNK) {
            const seconds = (performance.now() - started) / 1000;
            console.log(`${done}/${flops.length} flops, ${seconds.toFixed(0)}s`);
          }
          feed();
        });
        worker.on('error', reject);
        worker.on('exit', () => resolve());
        feed();
      });
    }),
  );

  const get = (field: Field, hand: number): number => total[FIELD_INDEX[field] * STARTING_HAND_COUNT + hand];
  const hands = STARTING_HANDS.map((info) => {
    const flopsSeen = info.combos * 19600;
    if (get('flopCount', info.index) !== flopsSeen) throw new Error(`Flop count mismatch for ${info.label}`);
    const scale = flopsSeen * FLOP_BOARDS * BOARD_SCALE;
    const raise = (m: number): number => (m * get('sumD', info.index) + get('sumC', info.index)) / scale;
    const raise4 = raise(4);
    const raise3 = raise(3);
    const check = get('optimalCheck', info.index) / scale;
    const best = raise4 >= check && raise4 >= raise3 ? 'raise4' : raise3 > check ? 'raise3' : 'check';
    const simpleRaises = simplePreflopRaises(exampleHole(info));
    const simpleCheck = get('simpleCheck', info.index) / scale;
    return {
      hand: info.label,
      combos: info.combos,
      raise4,
      raise3,
      check,
      best,
      simpleRaises,
      simpleCheck,
      // Given a check before the flop: chance to bet 2x on the flop, and to check it and bet 1x at the river.
      optimalFlopBet: get('optimalFlopBets', info.index) / flopsSeen,
      optimalRiverBet: get('optimalRiverBets', info.index) / (flopsSeen * FLOP_BOARDS),
      simpleFlopBet: get('simpleFlopBets', info.index) / flopsSeen,
      simpleRiverBet: get('simpleRiverBets', info.index) / (flopsSeen * FLOP_BOARDS),
    };
  });

  const summarize = (strategy: 'optimal' | 'simple') => {
    let ev = 0;
    let play = 0;
    let preflop = 0;
    let flop = 0;
    let river = 0;
    for (const h of hands) {
      const p = h.combos / 1326;
      const raises = strategy === 'optimal' ? h.best !== 'check' : h.simpleRaises;
      if (raises) {
        const m = strategy === 'optimal' && h.best === 'raise3' ? 3 : 4;
        ev += p * (m === 4 ? h.raise4 : h.raise3);
        play += p * m;
        preflop += p;
        continue;
      }
      const flopBet = strategy === 'optimal' ? h.optimalFlopBet : h.simpleFlopBet;
      const riverBet = strategy === 'optimal' ? h.optimalRiverBet : h.simpleRiverBet;
      ev += p * (strategy === 'optimal' ? h.check : h.simpleCheck);
      play += p * (2 * flopBet + riverBet);
      flop += p * flopBet;
      river += p * riverBet;
    }
    const averageWager = 2 + play; // ante + blind + play
    return {
      expectedValue: ev,
      houseEdge: -ev,
      elementOfRisk: -ev / averageWager,
      averagePlayBet: play,
      averageWager,
      raisePreflop: preflop,
      betFlop: flop,
      betRiver: river,
      fold: 1 - preflop - flop - river,
    };
  };

  const meta = {
    method: 'Exhaustive enumeration of every deal (1,755 flops up to suit symmetry), so these figures are exact.',
    units: 'EVs per unit of ante, with the blind equal to the ante; trips side bet excluded.',
  };
  const result = { ...meta, optimal: summarize('optimal'), simple: summarize('simple') };
  const dir = new URL('../src/results/', import.meta.url);
  writeFileSync(new URL('preflop.json', dir), JSON.stringify({ ...meta, hands }, null, 1) + '\n');
  writeFileSync(new URL('house-edge.json', dir), JSON.stringify(result, null, 2) + '\n');

  for (const strategy of ['optimal', 'simple'] as const) {
    const s = result[strategy];
    console.log(
      `${strategy.padEnd(8)} house edge ${(s.houseEdge * 100).toFixed(4)}% of ante, ` +
        `element of risk ${(s.elementOfRisk * 100).toFixed(4)}%, average wager ${s.averageWager.toFixed(4)}`,
    );
  }
  const disagree = hands.filter((h) => (h.best !== 'check') !== h.simpleRaises).map((h) => h.hand);
  console.log(`Simple strategy preflop differs from optimal on: ${disagree.join(' ') || 'none'}`);
  console.log(`Done in ${((performance.now() - started) / 1000).toFixed(0)}s`);
}
