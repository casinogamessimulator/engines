import { describe, expect, it } from 'vitest';
import { analyzeBets, analyzeTable, nextRollEv, nextRollOutcomes } from './analyze.ts';
import { allBetSpecs, isOneRoll } from './bets.ts';
import { houseEdge } from './edge.ts';
import { createTable, placeBet, roll, setOdds } from './table.ts';

describe('analyzeBets', () => {
  it('gives the chance of each bet winning before losing', () => {
    const report = analyzeBets([
      { spec: { type: 'place', number: 6 }, amount: 6 },
      { spec: { type: 'pass' }, amount: 10, point: 4 },
      { spec: { type: 'dontPass' }, amount: 10, point: 4 },
      { spec: { type: 'hardway', number: 8 }, amount: 1 },
      { spec: { type: 'pass' }, amount: 10 },
    ]);
    const pWin = report.bets.map((b) => b.pWin);
    expect(pWin[0]).toBeCloseTo(5 / 11, 12);
    expect(pWin[1]).toBeCloseTo(1 / 3, 12);
    expect(pWin[2]).toBeCloseTo(2 / 3, 12);
    expect(pWin[3]).toBeCloseTo(1 / 11, 12);
    expect(pWin[4]).toBeCloseTo(244 / 495, 12);
    // Pass on the 4: win 10 a third of the time, lose 10 otherwise.
    expect(report.bets[1].ev).toBeCloseTo(-10 / 3, 12);
    expect(report.bets[1].expectedRolls).toBeCloseTo(4, 12);
  });

  it('adds up EV and EV per roll', () => {
    const report = analyzeBets([
      { spec: { type: 'place', number: 8 }, amount: 6 },
      { spec: { type: 'field' }, amount: 5 },
    ]);
    expect(report.ev).toBeCloseTo(-6 / 66 - 5 / 36, 12);
    // Place 8 takes 36/11 rolls to decide; the field one.
    expect(report.evPerRoll).toBeCloseTo((-6 / 66) * (11 / 36) - 5 / 36, 12);
  });

  it('counts odds behind a bet at its point', () => {
    const [report] = analyzeBets([{ spec: { type: 'come' }, amount: 10, odds: 30, point: 10 }]).bets;
    expect(report.ev).toBeCloseTo(-10 / 3, 12); // the odds are a fair bet
    expect(report.wagered).toBe(40);
  });

  it('leaves out upfront commission already paid', () => {
    const rules = { ...createTable().rules, buyCommission: 'upfront' as const };
    const fresh = analyzeBets([{ spec: { type: 'buy', number: 4 }, amount: 20 }], rules);
    const paid = analyzeBets([{ spec: { type: 'buy', number: 4 }, amount: 20, commissionPaid: true }], rules);
    expect(fresh.ev).toBeCloseTo(-1, 12);
    expect(paid.ev).toBeCloseTo(0, 12);
  });
});

describe('analyzeTable', () => {
  it('reads bets as they stand on the table', () => {
    let t = placeBet(createTable(), { type: 'pass' }, 10);
    t = roll(t, [3, 3]).table;
    t = setOdds(t, t.bets[0].id, 50);
    t = placeBet(t, { type: 'place', number: 8 }, 12);
    const report = analyzeTable(t);
    expect(report.bets[0].pWin).toBeCloseTo(5 / 11, 12);
    expect(report.bets[0].ev).toBeCloseTo(10 * (5 / 11 - 6 / 11), 12);
    expect(report.bets[1].ev).toBeCloseTo(12 * (-1 / 66), 12);
  });
});

describe('nextRollOutcomes', () => {
  it('covers the 36 rolls', () => {
    const outcomes = nextRollOutcomes(createTable());
    expect(outcomes).toHaveLength(21);
    expect(outcomes.reduce((sum, o) => sum + o.probability, 0)).toBeCloseTo(1, 12);
  });

  it('agrees with the exact house edge for every one-roll bet', () => {
    for (const spec of allBetSpecs().filter(isOneRoll)) {
      const t = placeBet(createTable(), spec, 120);
      expect(nextRollEv(t), JSON.stringify(spec)).toBeCloseTo(-120 * houseEdge(spec, t.rules).edge, 9);
    }
  });

  it('applies the working rules: place bets off on the come-out settle nothing', () => {
    const t = placeBet(createTable(), { type: 'place', number: 6 }, 6);
    expect(nextRollEv(t)).toBe(0);
  });
});
