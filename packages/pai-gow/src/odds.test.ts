import { describe, expect, it } from 'vitest';
import odds from './odds.json' with { type: 'json' };

// odds.json comes from scripts/compute-odds.ts: 400 million seeded rounds against a house-way dealer.
// The published figures are Wizard of Odds' exact counts (wizardofodds.com/games/pai-gow-poker/), for the
// same Foxwoods house way, dealer banking, 5% commission.
const inside = (value: number, [low, high]: number[]): boolean => value >= low && value <= high;

describe('house way vs house way', () => {
  it('reproduces the published house edge within the 95% confidence interval', () => {
    expect(odds.published.houseWay.houseEdge).toBe(0.027212);
    expect(inside(odds.published.houseWay.houseEdge, odds.houseWay.ci95.houseEdge)).toBe(true);
    // The interval itself is tight: ±0.008 percentage points.
    expect(odds.houseWay.ci95.houseEdge[1] - odds.houseWay.ci95.houseEdge[0]).toBeLessThan(0.0002);
  });

  it('reproduces the published win, push and loss rates', () => {
    expect(inside(odds.published.houseWay.win, odds.houseWay.ci95.win)).toBe(true);
    expect(inside(odds.published.houseWay.push, odds.houseWay.ci95.push)).toBe(true);
    expect(inside(odds.published.houseWay.lose, odds.houseWay.ci95.lose)).toBe(true);
    expect(odds.houseWay.push).toBeCloseTo(0.405, 3);
  });
});

describe('optimal setter vs house way', () => {
  it('beats the house way, within 0.05 percentage points of the exact optimal strategy', () => {
    // WoO's exact optimal strategy accounts for card removal; the setter doesn't (see optimal.ts).
    expect(odds.optimal.ci95.houseEdge[1]).toBeLessThan(odds.houseWay.ci95.houseEdge[0]);
    expect(odds.optimal.houseEdge).toBeGreaterThan(odds.published.optimal.houseEdge);
    expect(odds.optimal.houseEdge - odds.published.optimal.houseEdge).toBeLessThan(0.0005);
  });
});
