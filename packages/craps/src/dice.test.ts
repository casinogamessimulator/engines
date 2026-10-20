import { describe, expect, it } from 'vitest';
import { ALL_ROLLS, createSeededRandom, diceTotal, rollDice, secureRandomInt, waysToRoll } from './dice.ts';

describe('dice', () => {
  it('has 36 rolls with the usual ways per total', () => {
    expect(ALL_ROLLS).toHaveLength(36);
    for (let total = 2; total <= 12; total++) {
      expect(ALL_ROLLS.filter((d) => diceTotal(d) === total)).toHaveLength(waysToRoll(total));
    }
  });

  it('rolls fair dice from a seed', () => {
    const random = createSeededRandom(42);
    const counts = new Array(13).fill(0);
    const n = 360_000;
    for (let i = 0; i < n; i++) counts[diceTotal(rollDice(random))]++;
    let chiSquare = 0;
    for (let total = 2; total <= 12; total++) {
      const expected = (n * waysToRoll(total)) / 36;
      chiSquare += (counts[total] - expected) ** 2 / expected;
    }
    // 10 degrees of freedom: 29.6 is the 0.1% critical value.
    expect(chiSquare).toBeLessThan(29.6);
  });

  it('repeats a seed and differs between seeds', () => {
    const sequence = (seed: number | string) => {
      const random = createSeededRandom(seed);
      return Array.from({ length: 50 }, () => rollDice(random).join(''));
    };
    expect(sequence('table-7')).toEqual(sequence('table-7'));
    expect(sequence(1)).not.toEqual(sequence(2));
  });

  it('rolls from the secure RNG by default', () => {
    for (let i = 0; i < 100; i++) {
      const [a, b] = rollDice();
      expect(a >= 1 && a <= 6 && b >= 1 && b <= 6).toBe(true);
    }
    expect(secureRandomInt(1)).toBe(0);
  });
});
