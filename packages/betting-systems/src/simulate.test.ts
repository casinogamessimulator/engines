import { describe, expect, it } from 'vitest';
import { createGame, type GameSpec } from './games.ts';
import { PROGRESSION_IDS } from './progressions.ts';
import { simulate, type SimulationInput } from './simulate.ts';

const european: GameSpec = { type: 'roulette', wheel: 'single-zero', bet: 'red' };

const martingale: SimulationInput = {
  game: european,
  progression: 'martingale',
  bankroll: 200,
  baseBet: 5,
  tableMin: 5,
  tableMax: 500,
  stopWin: 50,
  stopLoss: null,
  maxRounds: 500,
  sessions: 2_000,
  seed: 'share-me',
};

describe('simulate', () => {
  it('gives the same results from the same seed', () => {
    const input = { ...martingale, samplePaths: 3 };
    expect(simulate(input)).toEqual(simulate(input));
    expect(simulate({ ...input, seed: 'other' })).not.toEqual(simulate(input));
  });

  it('plays each session from its own stream, so runs can be split by session', () => {
    const few = simulate({ ...martingale, sessions: 5, samplePaths: 5 });
    const many = simulate({ ...martingale, sessions: 50, samplePaths: 5 });
    expect(many.samplePaths).toEqual(few.samplePaths);
  });

  it('accounts for every session', () => {
    const result = simulate({ ...martingale, stopLoss: 150, samplePaths: 10 });
    const ended = Object.values(result.ended).reduce((sum, share) => sum + share, 0);
    expect(ended).toBeCloseTo(1, 12);
    expect(result.upRate + result.downRate + result.evenRate).toBeCloseTo(1, 12);
    expect(result.histogram.reduce((sum, bucket) => sum + bucket.count, 0)).toBe(result.sessions);
    expect(result.histogram[0].from).toBe(result.minFinalBankroll);
    expect(result.histogram.at(-1)!.to).toBe(result.maxFinalBankroll);
    expect(result.maxFinalBankroll).toBeLessThanOrEqual(200 + 50 + 5);
    expect(result.minFinalBankroll).toBeGreaterThanOrEqual(0);
    expect(result.samplePaths).toHaveLength(10);
    for (const path of result.samplePaths) expect(path[0]).toBe(200);
    // Martingale with a stop-win wins most sessions and loses the rest big.
    expect(result.ended['stop-win']).toBeGreaterThan(0.6);
    expect(result.ended['stop-loss'] + result.bustRate).toBeGreaterThan(0.1);
  });

  it('stops at the table maximum, the bankroll and the round limit', () => {
    const capped = simulate({ ...martingale, bankroll: 100_000, stopWin: null, tableMax: 40, maxRounds: 300 });
    expect(capped.hitTableMaxRate).toBeGreaterThan(0.5);
    expect(capped.ended['max-rounds']).toBe(1);
    expect(capped.averageRounds).toBe(300);
    expect(capped.averageSpins).toBe(300);
    const busted = simulate({ ...martingale, bankroll: 20, stopWin: null, maxRounds: 100_000, sessions: 200 });
    expect(busted.bustRate).toBe(1);
    expect(busted.maxFinalBankroll).toBeLessThan(5);
  });

  it('takes extra spins when bets go to prison', () => {
    const result = simulate({
      ...martingale,
      game: { ...european, evenMoney: 'en-prison' },
      progression: 'flat',
      bankroll: 100_000,
      stopWin: null,
      maxRounds: 1_000,
      sessions: 100,
    });
    // One extra spin for each zero: 1,000 × (1 + 1/37).
    expect(result.averageRounds).toBe(1_000);
    expect(result.averageSpins).toBeGreaterThan(1_010);
    expect(result.averageSpins).toBeLessThan(1_045);
  });

  it('tracks the loss per unit wagered as sessions add up', () => {
    const result = simulate({ ...martingale, sessions: 2_500 });
    expect(result.convergence.map((point) => point.sessions)).toEqual([10, 20, 50, 100, 200, 500, 1_000, 2_000, 2_500]);
    expect(result.convergence.at(-1)!.lossPerUnitWagered).toBeCloseTo(result.lossPerUnitWagered, 12);
  });

  it('reports progress', () => {
    const done: number[] = [];
    simulate({ ...martingale, sessions: 600, onProgress: (n) => done.push(n) });
    expect(done).toEqual([250, 500, 600]);
  });

  it('rejects inputs it cannot play', () => {
    expect(() => simulate({ ...martingale, baseBet: 1 })).toThrow();
    expect(() => simulate({ ...martingale, tableMax: 1 })).toThrow();
    expect(() => simulate({ ...martingale, sessions: 0 })).toThrow();
    expect(() => simulate({ ...martingale, stopWin: -5 })).toThrow();
  });
});

describe('loss per unit wagered', () => {
  // A deep bankroll and no stops, so every session plays all its rounds: about 1,000,000 bets per case.
  const longRun = (game: GameSpec, progression: SimulationInput['progression']) =>
    simulate({
      game,
      progression,
      bankroll: 1_000_000,
      baseBet: 1,
      tableMin: 1,
      tableMax: 100,
      maxRounds: 1_000,
      sessions: 1_000,
      seed: `edge-${progression}`,
    });

  it.each([
    [european, 0.027027],
    [{ type: 'roulette', wheel: 'double-zero', bet: 'black' }, 0.052632],
    [{ type: 'roulette', wheel: 'triple-zero', bet: 'odd' }, 0.076923],
    [{ ...european, evenMoney: 'la-partage' }, 0.013514],
    [{ ...european, evenMoney: 'en-prison-multi' }, 0.013701],
    [{ type: 'baccarat', decks: 8, bet: 'banker' }, 0.010579],
    [{ type: 'baccarat', decks: 6, bet: 'player' }, 0.012374],
    [{ type: 'baccarat', decks: 8, bet: 'banker', variant: 'no-commission' }, 0.010183],
  ] as [GameSpec, number][])('converges to the house edge, flat betting: %o', (game, edge) => {
    expect(createGame(game).houseEdge).toBeCloseTo(edge, 6);
    const result = longRun(game, 'flat');
    expect(result.houseEdge).toBeCloseTo(edge, 6);
    // Standard error ≈ 1/√1,000,000 = 0.001.
    expect(Math.abs(result.lossPerUnitWagered - edge)).toBeLessThan(0.004);
  });

  it.each(PROGRESSION_IDS.filter((id) => id !== 'flat'))('converges to the house edge whatever the system: %s', (id) => {
    const result = longRun(european, id);
    // Progressions spread bets between 1 and 100 units, which widens the error to a few thousandths.
    expect(Math.abs(result.lossPerUnitWagered - 0.027027)).toBeLessThan(0.012);
  });
});
