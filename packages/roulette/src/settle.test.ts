import { describe, expect, it } from 'vitest';
import { getBet, isEvenMoney, listBets } from './bets.ts';
import { createRng } from './rng.ts';
import { EVEN_MONEY_RULES, houseEdge, isEnPrison, settle, type EvenMoneyRule, type Wager } from './settle.ts';
import { DOUBLE_ZERO, spin, wheels, type Wheel } from './wheels.ts';

const single = wheels['single-zero'];
const double = wheels['double-zero'];
const triple = wheels['triple-zero'];
const percent = (edge: number) => edge * 100;

describe('houseEdge', () => {
  // Published figures, e.g. Wizard of Odds' roulette pages.
  it.each([
    [single, 2.7027], // 1/37
    [double, 5.2632], // 2/38
    [triple, 7.6923], // 3/39
  ])('is the same for every %s bet but the 5-number top line', (wheel: Wheel, expected) => {
    for (const bet of listBets(wheel)) {
      if (bet.pockets.length === 5) continue;
      expect(percent(houseEdge(wheel, bet))).toBeCloseTo(expected, 4);
    }
  });

  it('is 7.89% on the double-zero 5-number bet', () => {
    expect(percent(houseEdge(double, getBet(double, 'top-line', [0, DOUBLE_ZERO, 1, 2, 3])))).toBeCloseTo(7.8947, 4);
  });

  it.each([
    [single, 'la-partage', 1.3514], // 1/74
    [single, 'en-prison-repeat', 1.3514], // same as la partage
    [single, 'en-prison-multi', 1.3701],
    [single, 'en-prison', 1.3879], // a second zero loses the bet: 19/1369
    [double, 'la-partage', 2.6316], // Atlantic City "surrender"
    [triple, 'la-partage', 3.8462],
  ] as [Wheel, EvenMoneyRule, number][])('%s even-money bets with %s', (wheel, rule, expected) => {
    for (const kind of ['red', 'black', 'odd', 'even', 'low', 'high'] as const)
      expect(percent(houseEdge(wheel, getBet(wheel, kind), { evenMoney: rule }))).toBeCloseTo(expected, 4);
  });

  it('leaves the other bets alone under la partage and en prison', () => {
    for (const rule of EVEN_MONEY_RULES)
      expect(percent(houseEdge(single, getBet(single, 'dozen', 1), { evenMoney: rule }))).toBeCloseTo(2.7027, 4);
  });

  it('agrees with settling every pocket, following imprisoned bets until they resolve', () => {
    for (const wheel of Object.values(wheels)) {
      for (const evenMoney of EVEN_MONEY_RULES) {
        const rules = { evenMoney };
        for (const bet of listBets(wheel)) {
          // Reaching level 12 takes 12 zeros in a row, so deeper levels cannot move the result.
          const imprisonable = isEnPrison(evenMoney) && isEvenMoney(bet.kind);
          const MAX_LEVEL = imprisonable ? 12 : 0;
          // value[k] = expected return of a unit needing k wins to leave prison (value[0] = a free bet),
          // found by value iteration over settle() itself rather than the closed forms.
          let value = new Array<number>(MAX_LEVEL + 2).fill(0);
          for (let round = 0; round < (imprisonable ? 40 : 1); round++) {
            const next = value.map((_, level) => {
              if (level > MAX_LEVEL) return 0;
              let total = 0;
              for (const pocket of wheel.order) {
                const [result] = settle(rules, [{ bet, amount: 1, prison: level }], pocket).results;
                total += result.outcome === 'imprisoned' ? value[result.wager.prison ?? 0] : result.returned;
              }
              return total / wheel.order.length;
            });
            value = next;
          }
          expect(value[0]).toBeCloseTo(1 - houseEdge(wheel, bet, rules), 12);
        }
      }
    }
  });
});

describe('settle', () => {
  const layout: Wager[] = [
    { bet: getBet(single, 'straight', [17]), amount: 5 },
    { bet: getBet(single, 'split', [17, 20]), amount: 10 },
    { bet: getBet(single, 'corner', [13, 14, 16, 17]), amount: 10 },
    { bet: getBet(single, 'dozen', 2), amount: 20 },
    { bet: getBet(single, 'red'), amount: 50 },
    { bet: getBet(single, 'odd'), amount: 50 },
  ];

  it('pays a whole layout', () => {
    const settlement = settle({ evenMoney: 'none' }, layout, 17);
    expect(settlement.results.map((r) => r.outcome)).toEqual(['win', 'win', 'win', 'win', 'lose', 'win']);
    // 5×36 + 10×18 + 10×9 + 20×3 + 0 + 50×2
    expect(settlement.returned).toBe(180 + 180 + 90 + 60 + 0 + 100);
    expect(settlement.imprisoned).toEqual([]);
  });

  it('returns half of the even-money bets on zero under la partage', () => {
    const settlement = settle({ evenMoney: 'la-partage' }, layout, 0);
    expect(settlement.results.map((r) => r.outcome)).toEqual(['lose', 'lose', 'lose', 'lose', 'half', 'half']);
    expect(settlement.returned).toBe(50);
  });

  it('imprisons even-money bets on zero, then frees them on a win', () => {
    const rules = { evenMoney: 'en-prison' as const };
    const first = settle(rules, layout, 0);
    expect(first.returned).toBe(0);
    expect(first.imprisoned.map((w) => [w.bet.id, w.prison])).toEqual([
      ['red', 1],
      ['odd', 1],
    ]);
    const second = settle(rules, first.imprisoned, 3); // red and odd
    expect(second.results.map((r) => r.outcome)).toEqual(['released', 'released']);
    expect(second.returned).toBe(100);
    const lost = settle(rules, first.imprisoned, 2); // black and even
    expect(lost.returned).toBe(0);
    expect(lost.imprisoned).toEqual([]);
  });

  it('handles a second zero by rule', () => {
    const red: Wager = { bet: getBet(single, 'red'), amount: 10, prison: 1 };
    expect(settle({ evenMoney: 'en-prison' }, [red], 0).results[0].outcome).toBe('lose');
    expect(settle({ evenMoney: 'en-prison-repeat' }, [red], 0).imprisoned).toEqual([red]);
    const deeper = settle({ evenMoney: 'en-prison-multi' }, [red], 0).imprisoned[0];
    expect(deeper.prison).toBe(2);
    const up = settle({ evenMoney: 'en-prison-multi' }, [deeper], 1);
    expect(up.results[0].outcome).toBe('imprisoned');
    expect(up.imprisoned[0].prison).toBe(1);
  });

  it('converges to the house edge over seeded spins', () => {
    const rng = createRng('converge');
    const bet = getBet(double, 'top-line', [0, DOUBLE_ZERO, 1, 2, 3]);
    let returned = 0;
    const spins = 400_000;
    for (let i = 0; i < spins; i++) returned += settle({ evenMoney: 'none' }, [{ bet, amount: 1 }], spin(double, rng.int)).returned;
    // Standard deviation of the mean ≈ 2.6 / √400,000 ≈ 0.004.
    expect(Math.abs(1 - returned / spins - houseEdge(double, bet))).toBeLessThan(0.016);
  });
});
