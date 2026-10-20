/*
 * Seeded random numbers for shuffling. The whole generator state is one 32-bit integer (mulberry32), so a shoe can
 * be saved as JSON and replayed exactly.
 */

/** Seed from a number or a string (hashed with FNV-1a). */
export function seedFrom(seed: number | string): number {
  if (typeof seed === 'number') return seed >>> 0;
  let hash = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) hash = Math.imul(hash ^ seed.charCodeAt(i), 0x01000193);
  return hash >>> 0;
}

/** A fresh seed from the platform's cryptographic RNG. */
export function randomSeed(): number {
  return globalThis.crypto.getRandomValues(new Uint32Array(1))[0];
}

/** One step of mulberry32: a uniform 32-bit integer and the next state. */
export function nextUint32(state: number): [value: number, state: number] {
  const next = (state + 0x6d2b79f5) | 0;
  let x = Math.imul(next ^ (next >>> 15), next | 1);
  x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
  return [(x ^ (x >>> 14)) >>> 0, next >>> 0];
}

/** Uniform integer in [0, max), without modulo bias. */
export function nextInt(state: number, max: number): [value: number, state: number] {
  const limit = Math.floor(0x1_0000_0000 / max) * max;
  for (;;) {
    const [value, next] = nextUint32(state);
    state = next;
    if (value < limit) return [value % max, state];
  }
}

/** Fisher–Yates shuffle of a copy of `items`; returns the shuffled copy and the next generator state. */
export function shuffled<T>(items: readonly T[], state: number): [items: T[], state: number] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const [j, next] = nextInt(state, i + 1);
    state = next;
    [out[i], out[j]] = [out[j], out[i]];
  }
  return [out, state];
}
