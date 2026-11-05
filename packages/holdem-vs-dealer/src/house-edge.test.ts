import { describe, expect, it } from 'vitest';
import { HOUSE_EDGE } from './advisor.ts';
import { getTripsPaytable, TRIPS_PAYTABLES } from './paytables.ts';
import preflop from './results/preflop.json' with { type: 'json' };
import trips from './results/trips.json' with { type: 'json' };
import { tripsHouseEdge } from './trips.ts';

// Published figures: Wizard of Odds, "Ultimate Texas Hold 'Em" (the casino game these rules follow).
describe('stored house edges', () => {
  it('optimal play: 2.185% of the ante, 0.526% element of risk', () => {
    expect(HOUSE_EDGE.optimal.houseEdge).toBeCloseTo(0.02185, 5);
    expect(HOUSE_EDGE.optimal.elementOfRisk).toBeCloseTo(0.00526, 5);
  });

  it('simple strategy: matches the published 2.43% and 0.58%', () => {
    // With the readings listed in strategy.ts, the enumeration gives 2.433% and 0.584%.
    expect((HOUSE_EDGE.simple.houseEdge * 100).toFixed(2)).toBe('2.43');
    expect((HOUSE_EDGE.simple.elementOfRisk * 100).toFixed(2)).toBe('0.58');
    expect(HOUSE_EDGE.simple.houseEdge).toBeGreaterThan(HOUSE_EDGE.optimal.houseEdge);
  });

  it('is consistent with the preflop table', () => {
    let ev = 0;
    for (const row of preflop.hands) ev += (row.combos / 1326) * Math.max(row.raise4, row.raise3, row.check);
    expect(-ev).toBeCloseTo(HOUSE_EDGE.optimal.houseEdge, 12);
    for (const s of [HOUSE_EDGE.optimal, HOUSE_EDGE.simple]) {
      expect(s.raisePreflop + s.betFlop + s.betRiver + s.fold).toBeCloseTo(1, 12);
      expect(s.averagePlayBet).toBeCloseTo(4 * s.raisePreflop + 2 * s.betFlop + s.betRiver, 12);
    }
  });

  it.each([
    ['50-40-30-9-7-4-3', 0.009],
    ['50-40-30-8-6-5-3', 0.019],
    ['50-40-30-8-7-4-3', 0.035],
    ['50-40-20-7-6-5-3', 0.0618],
  ])('trips %s: %f', (id, published) => {
    const edge = tripsHouseEdge(getTripsPaytable(id));
    expect(edge).toBeCloseTo(published, 4);
    expect(edge).toBe(trips.houseEdge[id as keyof typeof trips.houseEdge]);
  });

  it('values custom trips paytables exactly', () => {
    // 50-40-30-9-7-4-3: 112,149,144 paid on 20,428,900 winners; 113,355,660 losers; all of C(52, 7).
    expect(tripsHouseEdge(TRIPS_PAYTABLES[0])).toBe(1_206_516 / 133_784_560);
    const evenMoney = { royalFlush: 1, straightFlush: 1, fourOfAKind: 1, fullHouse: 1, flush: 1, straight: 1, threeOfAKind: 1 };
    expect(tripsHouseEdge(evenMoney)).toBeCloseTo((113_355_660 - 20_428_900) / 133_784_560, 15);
  });
});
