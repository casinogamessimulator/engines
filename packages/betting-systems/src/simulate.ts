import { createRng } from '@cgs/roulette';
import { createGame, type Game, type GameSpec } from './games.ts';
import { createProgression, placeBet, type ProgressionId, type ProgressionOptions } from './progressions.ts';

export interface SimulationInput {
  /** The game and bet, as plain data (see GameSpec) or any Game implementation. */
  game: GameSpec | Game;
  progression: ProgressionId;
  progressionOptions?: ProgressionOptions;
  /** Starting bankroll for every session. */
  bankroll: number;
  /** The progression's unit. */
  baseBet: number;
  tableMin: number;
  tableMax: number;
  /** End a session once it is up by this much. Null or absent: no target. */
  stopWin?: number | null;
  /** End a session once it is down by this much. Null or absent: play until bust or maxRounds. */
  stopLoss?: number | null;
  /** Bets per session at most. */
  maxRounds: number;
  sessions: number;
  /** The same seed and inputs always give the same results. */
  seed: number | string;
  /** Final-bankroll histogram buckets. Default 20. */
  histogramBuckets?: number;
  /** How many sessions (the first ones) to return the bankroll path of. Default 1. */
  samplePaths?: number;
  /** Called every 250 sessions and at the end, e.g. to report progress from a worker. */
  onProgress?: (sessionsDone: number) => void;
}

export type SessionEnd = 'stop-win' | 'stop-loss' | 'bust' | 'max-rounds';

export interface HistogramBucket {
  /** Inclusive lower bound. */
  from: number;
  /** Exclusive upper bound, except the last bucket's, which includes the maximum. */
  to: number;
  count: number;
}

export interface SimulationResult {
  sessions: number;
  /** Share of sessions by how they ended; bust means the bankroll could no longer cover the table minimum. */
  ended: Record<SessionEnd, number>;
  bustRate: number;
  /** Share of sessions that finished above, below and exactly at the starting bankroll. */
  upRate: number;
  downRate: number;
  evenRate: number;
  /** Share of sessions in which the system wanted a bet above the table maximum. */
  hitTableMaxRate: number;
  averageFinalBankroll: number;
  medianFinalBankroll: number;
  minFinalBankroll: number;
  maxFinalBankroll: number;
  histogram: HistogramBucket[];
  /** Bets per session. */
  averageRounds: number;
  /** Spins or hands per session (more than bets when roulette bets go to prison). */
  averageSpins: number;
  totalWagered: number;
  averageWageredPerSession: number;
  /** Total lost over total wagered: converges to the game's house edge whatever the system. */
  lossPerUnitWagered: number;
  /** The game's exact house edge, for comparison. */
  houseEdge: number;
  /** Bankroll before the first bet and after each bet, for the first sessions. */
  samplePaths: number[][];
  /** Loss per unit wagered after 10, 20, 50, 100, 200, 500… sessions and at the end: how it settles on the edge. */
  convergence: { sessions: number; lossPerUnitWagered: number }[];
}

/** 10, 20, 50, 100, 200, 500, 1,000…: checkpoints for SimulationResult.convergence. */
function isCheckpoint(sessions: number): boolean {
  const scale = 10 ** Math.floor(Math.log10(sessions));
  const lead = sessions / scale;
  return sessions >= 10 && (lead === 1 || lead === 2 || lead === 5);
}

const EPSILON = 1e-9;

function validate(input: SimulationInput): void {
  const { bankroll, baseBet, tableMin, tableMax, maxRounds, sessions, stopWin, stopLoss } = input;
  const positive = { bankroll, baseBet, tableMin, tableMax };
  for (const [name, value] of Object.entries(positive))
    if (!(Number.isFinite(value) && value > 0)) throw new Error(`${name} must be a positive number`);
  if (tableMax < tableMin) throw new Error('tableMax must be at least tableMin');
  if (baseBet < tableMin || baseBet > tableMax) throw new Error('baseBet must be within the table limits');
  if (!(Number.isInteger(maxRounds) && maxRounds >= 1)) throw new Error('maxRounds must be a positive integer');
  if (!(Number.isInteger(sessions) && sessions >= 1)) throw new Error('sessions must be a positive integer');
  if (stopWin != null && !(stopWin > 0)) throw new Error('stopWin must be positive');
  if (stopLoss != null && !(stopLoss > 0)) throw new Error('stopLoss must be positive');
}

function median(sorted: Float64Array): number {
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function histogramOf(sorted: Float64Array, buckets: number): HistogramBucket[] {
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  if (max - min < EPSILON) return [{ from: min, to: max, count: sorted.length }];
  const width = (max - min) / buckets;
  const result = Array.from({ length: buckets }, (_, i) => ({
    from: min + i * width,
    to: i === buckets - 1 ? max : min + (i + 1) * width,
    count: 0,
  }));
  for (const value of sorted) result[Math.min(buckets - 1, Math.floor((value - min) / width))].count++;
  return result;
}

/**
 * Plays `sessions` sessions of a betting system and summarizes them. Session i draws from its own stream
 * seeded by (seed, i), so results are reproducible and a run can be split across workers by session range.
 */
export function simulate(input: SimulationInput): SimulationResult {
  validate(input);
  const { bankroll: start, baseBet, tableMin, tableMax, maxRounds, sessions, seed } = input;
  const game = 'open' in input.game ? input.game : createGame(input.game);
  const progression = createProgression(input.progression, input.progressionOptions);
  const limits = { tableMin, tableMax };
  const winAt = input.stopWin == null ? Infinity : start + input.stopWin;
  const lossAt = input.stopLoss == null ? -Infinity : start - input.stopLoss;
  const pathCount = Math.min(sessions, input.samplePaths ?? 1);

  const finals = new Float64Array(sessions);
  const ended: Record<SessionEnd, number> = { 'stop-win': 0, 'stop-loss': 0, bust: 0, 'max-rounds': 0 };
  const samplePaths: number[][] = [];
  const round = { stake: 0, returned: 0 };
  let totalWagered = 0;
  let totalRounds = 0;
  let totalSpins = 0;
  let hitTableMax = 0;
  let lostSoFar = 0;
  const convergence: SimulationResult['convergence'] = [];

  for (let s = 0; s < sessions; s++) {
    const rng = createRng(`${seed}#${s}`);
    const table = game.open(rng.int);
    const state = progression.start(baseBet);
    const path = s < pathCount ? [start] : null;
    let bankroll = start;
    let rounds = 0;
    let cappedByTable = false;
    let end: SessionEnd = 'max-rounds';
    for (;;) {
      if (bankroll >= winAt - EPSILON) {
        end = 'stop-win';
        break;
      }
      if (bankroll <= lossAt + EPSILON) {
        end = 'stop-loss';
        break;
      }
      if (bankroll < tableMin - EPSILON) {
        end = 'bust';
        break;
      }
      if (rounds === maxRounds) break;
      const wanted = state.nextBet();
      if (wanted > tableMax) cappedByTable = true;
      // The loop has checked the bankroll covers the minimum (up to float rounding).
      const stake = placeBet(wanted, Math.max(bankroll, tableMin), limits);
      const returned = table.play(stake);
      bankroll += returned - stake;
      totalWagered += stake;
      rounds++;
      round.stake = stake;
      round.returned = returned;
      state.record(round);
      path?.push(bankroll);
    }
    finals[s] = bankroll;
    ended[end]++;
    totalRounds += rounds;
    totalSpins += table.rounds;
    if (cappedByTable) hitTableMax++;
    if (path) samplePaths.push(path);
    lostSoFar += start - bankroll;
    if ((isCheckpoint(s + 1) || s + 1 === sessions) && totalWagered > 0)
      convergence.push({ sessions: s + 1, lossPerUnitWagered: lostSoFar / totalWagered });
    if (input.onProgress && ((s + 1) % 250 === 0 || s + 1 === sessions)) input.onProgress(s + 1);
  }

  let up = 0;
  let down = 0;
  let sum = 0;
  for (const final of finals) {
    sum += final;
    if (final > start + EPSILON) up++;
    else if (final < start - EPSILON) down++;
  }
  const sorted = finals.slice().sort();
  const share = (count: number) => count / sessions;
  return {
    sessions,
    ended: {
      'stop-win': share(ended['stop-win']),
      'stop-loss': share(ended['stop-loss']),
      bust: share(ended.bust),
      'max-rounds': share(ended['max-rounds']),
    },
    bustRate: share(ended.bust),
    upRate: share(up),
    downRate: share(down),
    evenRate: share(sessions - up - down),
    hitTableMaxRate: share(hitTableMax),
    averageFinalBankroll: sum / sessions,
    medianFinalBankroll: median(sorted),
    minFinalBankroll: sorted[0],
    maxFinalBankroll: sorted[sorted.length - 1],
    histogram: histogramOf(sorted, input.histogramBuckets ?? 20),
    averageRounds: totalRounds / sessions,
    averageSpins: totalSpins / sessions,
    totalWagered,
    averageWageredPerSession: totalWagered / sessions,
    lossPerUnitWagered: totalWagered > 0 ? (start * sessions - sum) / totalWagered : 0,
    houseEdge: game.houseEdge,
    samplePaths,
    convergence,
  };
}
