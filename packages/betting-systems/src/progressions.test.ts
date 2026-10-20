import { describe, expect, it } from 'vitest';
import { createProgression, nextBet, PROGRESSION_IDS, type ProgressionId, type ProgressionOptions, type Round } from './progressions.ts';

/**
 * Bets a progression makes over a history written as W (win at even money), L (loss), P (push),
 * H (half loss, la partage) and B (banker win paying 19 to 20), with a base bet of 10.
 */
function bets(id: ProgressionId, history: string, options?: ProgressionOptions): number[] {
  const state = createProgression(id, options).start(10);
  const result: number[] = [];
  for (const symbol of history) {
    const stake = state.nextBet();
    result.push(stake / 10);
    const returned = { W: 2, L: 0, P: 1, H: 0.5, B: 1.95 }[symbol]! * stake;
    state.record({ stake, returned });
  }
  result.push(state.nextBet() / 10);
  return result;
}

describe('progressions', () => {
  it('flat bets the base bet every time', () => {
    expect(bets('flat', 'LLWLW')).toEqual([1, 1, 1, 1, 1, 1]);
  });

  it('Martingale doubles after each loss and resets after a win', () => {
    expect(bets('martingale', 'LLLWL')).toEqual([1, 2, 4, 8, 1, 2]);
    expect(bets('martingale', 'LLBLL')).toEqual([1, 2, 4, 1, 2, 4]);
  });

  it('Paroli doubles after each win and resets after a loss or a 3-win streak', () => {
    expect(bets('paroli', 'WWWWL')).toEqual([1, 2, 4, 1, 2, 1]);
    expect(bets('paroli', 'WWWW', { paroliWins: 2 })).toEqual([1, 2, 1, 2, 1]);
  });

  it('Fibonacci steps up one after a loss and back two after a win', () => {
    expect(bets('fibonacci', 'LLLLWLWW')).toEqual([1, 1, 2, 3, 5, 2, 3, 1, 1]);
    expect(bets('fibonacci', 'LLLLLLLL')).toEqual([1, 1, 2, 3, 5, 8, 13, 21, 34]);
  });

  it("D'Alembert adds a unit after a loss and takes one off after a win, down to one", () => {
    expect(bets('dalembert', 'LLWWWL')).toEqual([1, 2, 3, 2, 1, 1, 2]);
  });

  it('Labouchère bets the ends of the line, adds losses and crosses off wins', () => {
    // 1 2 3 4 → L → 1 2 3 4 5 → W → 2 3 4 → W → 3 → W → done, start over with 1 2 3 4.
    expect(bets('labouchere', 'LWWW')).toEqual([5, 6, 6, 3, 5]);
    // 1 2 3 4 → W → 2 3 → L → 2 3 5 → W → 3 → L → 3 3.
    expect(bets('labouchere', 'WLWL')).toEqual([5, 5, 7, 3, 6]);
    expect(bets('labouchere', 'LL', { labouchereLine: [1, 1, 1] })).toEqual([2, 3, 4]);
  });

  it('leaves every progression in place on a push', () => {
    for (const id of PROGRESSION_IDS) expect(bets(id, 'LPPL')).toEqual(bets(id, 'LL').flatMap((b, i) => (i === 1 ? [b, b, b] : [b])));
  });

  it('counts a la partage half loss as a loss and adds what was lost to the Labouchère line', () => {
    expect(bets('martingale', 'H')).toEqual([1, 2]);
    // 1 2 3 4 → lose 2.5 units → 1 2 3 4 2.5.
    expect(bets('labouchere', 'H')).toEqual([5, 3.5]);
  });
});

describe('nextBet', () => {
  const martingale = createProgression('martingale');
  const losses = (count: number): Round[] => Array.from({ length: count }, (_, i) => ({ stake: 2 ** i, returned: 0 }));

  it('replays the history', () => {
    expect(nextBet(martingale, 1, 1_000, losses(5))).toBe(32);
    expect(nextBet(martingale, 1, 1_000, [...losses(5), { stake: 32, returned: 64 }])).toBe(1);
  });

  it('is capped by the bankroll and the table limits', () => {
    expect(nextBet(martingale, 1, 20, losses(5))).toBe(20);
    expect(nextBet(martingale, 1, 1_000, losses(9), { tableMin: 1, tableMax: 200 })).toBe(200);
    expect(nextBet(createProgression('flat'), 1, 1_000, [], { tableMin: 5, tableMax: 200 })).toBe(5);
    expect(nextBet(martingale, 1, 4, [], { tableMin: 5, tableMax: 200 })).toBe(0);
  });
});
