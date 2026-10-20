import { secureRandomInt, type RandomInt } from './rng.ts';

/**
 * A pocket is an integer: 0..36 are the numbers, 37 is "00" and 38 is "000".
 * Integers keep settlement a table lookup.
 */
export type Pocket = number;

export const ZERO: Pocket = 0;
export const DOUBLE_ZERO: Pocket = 37;
export const TRIPLE_ZERO: Pocket = 38;

export type WheelId = 'single-zero' | 'double-zero' | 'triple-zero';

export interface Wheel {
  id: WheelId;
  name: string;
  /** The green pockets, in layout order (0, 00, 000). */
  zeros: readonly Pocket[];
  /** Every pocket, clockwise around the wheel starting at 0. */
  order: readonly Pocket[];
}

export const RED_NUMBERS: ReadonlySet<number> = new Set([
  1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36,
]);

export type Color = 'red' | 'black' | 'green';

export function colorOf(pocket: Pocket): Color {
  if (pocket === ZERO || pocket > 36) return 'green';
  return RED_NUMBERS.has(pocket) ? 'red' : 'black';
}

export function isZero(pocket: Pocket): boolean {
  return pocket === ZERO || pocket > 36;
}

export function pocketLabel(pocket: Pocket): string {
  if (pocket === DOUBLE_ZERO) return '00';
  if (pocket === TRIPLE_ZERO) return '000';
  return String(pocket);
}

/** "0", "00", "000", "17" → pocket. */
export function parsePocket(text: string): Pocket {
  if (text === '00') return DOUBLE_ZERO;
  if (text === '000') return TRIPLE_ZERO;
  const n = Number(text);
  if (!/^\d{1,2}$/.test(text) || n > 36) throw new Error(`Invalid pocket "${text}"`);
  return n;
}

// European wheel.
const SINGLE_ZERO_ORDER = [
  0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29,
  7, 28, 12, 35, 3, 26,
];

// American wheel: each pair n, n+1 (odd, even) sits directly opposite, as do 0 and 00.
const DOUBLE_ZERO_ORDER = [
  0, 28, 9, 26, 30, 11, 7, 20, 32, 17, 5, 22, 34, 15, 3, 24, 36, 13, 1, DOUBLE_ZERO, 27, 10, 25, 29, 12, 8, 19, 31, 18,
  6, 21, 33, 16, 4, 23, 35, 14, 2,
];

// Triple-zero wheel (Sands and others in Las Vegas): the European sequence with 000 and 00 after 0.
const TRIPLE_ZERO_ORDER = [0, TRIPLE_ZERO, DOUBLE_ZERO, ...SINGLE_ZERO_ORDER.slice(1)];

export const wheels: Record<WheelId, Wheel> = {
  'single-zero': { id: 'single-zero', name: 'Single zero', zeros: [ZERO], order: SINGLE_ZERO_ORDER },
  'double-zero': { id: 'double-zero', name: 'Double zero', zeros: [ZERO, DOUBLE_ZERO], order: DOUBLE_ZERO_ORDER },
  'triple-zero': {
    id: 'triple-zero',
    name: 'Triple zero',
    zeros: [ZERO, DOUBLE_ZERO, TRIPLE_ZERO],
    order: TRIPLE_ZERO_ORDER,
  },
};

export function getWheel(id: WheelId): Wheel {
  const wheel = wheels[id];
  if (!wheel) throw new Error(`Unknown wheel "${id}"`);
  return wheel;
}

/** Spins the wheel: every pocket is equally likely. Pass a seeded `randomInt` (see createRng) to replay spins. */
export function spin(wheel: Wheel, randomInt: RandomInt = secureRandomInt): Pocket {
  return wheel.order[randomInt(wheel.order.length)];
}
