import { describe, expect, it } from 'vitest';
import { createRng } from './rng.ts';
import { colorOf, DOUBLE_ZERO, parsePocket, pocketLabel, spin, TRIPLE_ZERO, wheels, type Wheel } from './wheels.ts';

const numbersOnly = (wheel: Wheel) => wheel.order.filter((pocket) => colorOf(pocket) !== 'green');

describe('wheels', () => {
  it.each([
    ['single-zero', 37],
    ['double-zero', 38],
    ['triple-zero', 39],
  ] as const)('%s has %i distinct pockets: 1-36 plus its zeros', (id, size) => {
    const wheel = wheels[id];
    expect(wheel.order).toHaveLength(size);
    expect(new Set(wheel.order).size).toBe(size);
    expect([...wheel.order].sort((a, b) => a - b)).toEqual(
      [...Array.from({ length: 37 }, (_, n) => n), DOUBLE_ZERO, TRIPLE_ZERO].slice(0, size),
    );
    expect(wheel.zeros.every((zero) => colorOf(zero) === 'green')).toBe(true);
  });

  it('has 18 red and 18 black numbers, alternating between neighboring numbers on every wheel', () => {
    for (const wheel of Object.values(wheels)) {
      expect(numbersOnly(wheel).map(colorOf).filter((c) => c === 'red')).toHaveLength(18);
      const colors = wheel.order.map(colorOf);
      for (let i = 0; i < colors.length; i++) {
        const [here, next] = [colors[i], colors[(i + 1) % colors.length]];
        if (here !== 'green' && next !== 'green') expect(next).not.toBe(here);
      }
    }
  });

  it('starts the European wheel 0-32-15-19-4 and ends it 3-26', () => {
    const order = wheels['single-zero'].order;
    expect(order.slice(0, 5)).toEqual([0, 32, 15, 19, 4]);
    expect(order.slice(-2)).toEqual([3, 26]);
  });

  it('puts every odd number opposite the next even one on the American wheel, and 0 opposite 00', () => {
    const order = wheels['double-zero'].order;
    const at = (pocket: number) => order.indexOf(pocket);
    expect((at(DOUBLE_ZERO) - at(0) + 38) % 38).toBe(19);
    for (let n = 1; n <= 35; n += 2) expect(Math.abs(at(n) - at(n + 1))).toBe(19);
  });

  it('labels and parses the zeros', () => {
    expect([0, DOUBLE_ZERO, TRIPLE_ZERO, 17].map(pocketLabel)).toEqual(['0', '00', '000', '17']);
    expect(['0', '00', '000', '36'].map(parsePocket)).toEqual([0, DOUBLE_ZERO, TRIPLE_ZERO, 36]);
    expect(() => parsePocket('37')).toThrow();
  });
});

describe('spin', () => {
  it('replays the same pockets from the same seed', () => {
    const a = createRng('table-7');
    const b = createRng('table-7');
    const wheel = wheels['double-zero'];
    const first = Array.from({ length: 50 }, () => spin(wheel, a.int));
    expect(Array.from({ length: 50 }, () => spin(wheel, b.int))).toEqual(first);
    const c = createRng('table-8');
    expect(Array.from({ length: 50 }, () => spin(wheel, c.int))).not.toEqual(first);
  });

  it('hits every pocket about equally often', () => {
    const rng = createRng(1);
    const wheel = wheels['single-zero'];
    const counts = new Map<number, number>();
    const spins = 370_000;
    for (let i = 0; i < spins; i++) {
      const pocket = spin(wheel, rng.int);
      counts.set(pocket, (counts.get(pocket) ?? 0) + 1);
    }
    // Expected 10,000 each with a standard deviation of about 99.
    for (const pocket of wheel.order) expect(Math.abs((counts.get(pocket) ?? 0) - 10_000)).toBeLessThan(500);
  });

  it('spins with the cryptographic RNG by default', () => {
    expect(wheels['triple-zero'].order).toContain(spin(wheels['triple-zero']));
  });
});
