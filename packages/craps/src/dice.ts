export type Die = 1 | 2 | 3 | 4 | 5 | 6;
export type Dice = readonly [Die, Die];
/** Uniform integer in [0, max). */
export type RandomInt = (max: number) => number;

export const DIE_FACES: readonly Die[] = [1, 2, 3, 4, 5, 6];

/** All 36 equally likely rolls, ordered (1-2 and 2-1 are different rolls). */
export const ALL_ROLLS: readonly Dice[] = DIE_FACES.flatMap((a) => DIE_FACES.map((b) => [a, b] as Dice));

export function diceTotal(dice: Dice): number {
  return dice[0] + dice[1];
}

export function isDoubles(dice: Dice): boolean {
  return dice[0] === dice[1];
}

/** Number of the 36 rolls that make `total` (6 for a seven, 1 for a two). */
export function waysToRoll(total: number): number {
  if (!Number.isInteger(total) || total < 2 || total > 12) return 0;
  return 6 - Math.abs(total - 7);
}

export function isDie(value: unknown): value is Die {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 6;
}

/** Uniform integer in [0, max) from the platform's cryptographic RNG, without modulo bias. */
export function secureRandomInt(max: number): number {
  return uniformInt(() => {
    const buffer = new Uint32Array(1);
    globalThis.crypto.getRandomValues(buffer);
    return buffer[0];
  }, max);
}

/**
 * Reproducible RandomInt for a seed (any number or string): the same seed always rolls the same dice.
 * sfc32 seeded through splitmix32, which is fast and passes PractRand; not for anything security related.
 */
export function createSeededRandom(seed: number | string): RandomInt {
  const next = sfc32(hashSeed(String(seed)));
  return (max) => uniformInt(next, max);
}

export function rollDice(randomInt: RandomInt = secureRandomInt): Dice {
  return [(randomInt(6) + 1) as Die, (randomInt(6) + 1) as Die];
}

function uniformInt(nextUint32: () => number, max: number): number {
  if (!Number.isInteger(max) || max < 1 || max > 0x1_0000_0000) throw new Error(`Invalid range ${max}`);
  const limit = Math.floor(0x1_0000_0000 / max) * max;
  for (;;) {
    const value = nextUint32();
    if (value < limit) return value % max;
  }
}

/** FNV-1a over the seed's characters. */
function hashSeed(seed: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) hash = Math.imul(hash ^ seed.charCodeAt(i), 0x01000193);
  return hash >>> 0;
}

function sfc32(seed: number): () => number {
  let state = seed;
  const splitmix32 = () => {
    state = (state + 0x9e3779b9) | 0;
    let z = state;
    z = Math.imul(z ^ (z >>> 16), 0x85ebca6b);
    z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35);
    return (z ^ (z >>> 16)) >>> 0;
  };
  let a = splitmix32();
  let b = splitmix32();
  let c = splitmix32();
  let d = 1;
  const next = () => {
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    return t >>> 0;
  };
  for (let i = 0; i < 12; i++) next();
  return next;
}
