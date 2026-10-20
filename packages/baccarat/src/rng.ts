/**
 * Seeded pseudo-random numbers, so a spin, a shoe or a whole simulation can be replayed from a seed
 * (shareable result URLs encode the seed). sfc32 seeded through a 128-bit string hash: fast, small,
 * and identical on every JavaScript engine because it only uses 32-bit integer arithmetic.
 * Not for real-money gaming; the games use the platform's cryptographic RNG when no seed is given.
 */

/** Uniform integer in [0, max). */
export type RandomInt = (max: number) => number;

export interface Rng {
  /** Next raw 32-bit unsigned integer. */
  next(): number;
  /** Uniform integer in [0, max) for max up to 2²¹, without bias. */
  int: RandomInt;
  /** Uniform float in [0, 1) with 32 bits of precision. */
  float(): number;
}

/** cyrb128: hashes any seed text into four well-mixed 32-bit words. */
function hashSeed(text: string): [number, number, number, number] {
  let h1 = 1779033703;
  let h2 = 3144134277;
  let h3 = 1013904242;
  let h4 = 2773480762;
  for (let i = 0; i < text.length; i++) {
    const k = text.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  h1 ^= h2 ^ h3 ^ h4;
  h2 ^= h1;
  h3 ^= h1;
  h4 ^= h1;
  return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
}

/** A seeded generator. The same seed always gives the same sequence. */
export function createRng(seed: number | string): Rng {
  let [a, b, c, d] = hashSeed(String(seed));
  const next = (): number => {
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    return t >>> 0;
  };
  for (let i = 0; i < 15; i++) next();
  // Lemire's multiply-shift: the high 32 bits of next() × max, rejecting the few products that would bias it.
  // Everything stays exact in doubles while max ≤ 2²¹ and avoids the slow floating-point modulo of `% max`.
  const int = (max: number): number => {
    if (!(max >= 1 && max <= 0x20_0000 && Number.isInteger(max))) throw new RangeError(`Invalid max ${max}`);
    for (;;) {
      const product = next() * max;
      const high = Math.floor(product * 2 ** -32);
      const low = product - high * 0x1_0000_0000;
      if (low >= max || low >= (0x1_0000_0000 - max) % max) return high;
    }
  };
  return { next, int, float: () => next() / 0x1_0000_0000 };
}

/** Uniform integer in [0, max) from the platform's cryptographic RNG, without modulo bias. */
export function secureRandomInt(max: number): number {
  const limit = Math.floor(0x1_0000_0000 / max) * max;
  const buffer = new Uint32Array(1);
  for (;;) {
    globalThis.crypto.getRandomValues(buffer);
    if (buffer[0] < limit) return buffer[0] % max;
  }
}
