/**
 * Seeded, serializable random numbers for reproducible deals: sfc32 (Chris Doty-Humphrey's Small Fast
 * Counting generator), whose whole state is four 32-bit words. The state is a plain array, so a round
 * and the generator that dealt it can be saved as JSON and resumed exactly.
 */
export type RngState = readonly [number, number, number, number];

/** Builds a generator state from any 32-bit integer or string seed. */
export function seedRng(seed: number | string): RngState {
  // Hash the seed to 32 bits (FNV-1a over the text), then expand with splitmix32.
  const text = String(seed);
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  const words: number[] = [];
  for (let i = 0; i < 4; i++) {
    h = (h + 0x9e3779b9) | 0;
    let z = h;
    z = Math.imul(z ^ (z >>> 16), 0x85ebca6b);
    z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35);
    words.push((z ^ (z >>> 16)) >>> 0);
  }
  const state: [number, number, number, number] = [words[0], words[1], words[2], words[3]];
  // Discard the first outputs, as sfc32's reference seeding does.
  const rng = new Rng(state);
  for (let i = 0; i < 12; i++) rng.nextUint32();
  return rng.state;
}

/** A mutable cursor over an RngState; read `state` to save where it is. */
export class Rng {
  private a: number;
  private b: number;
  private c: number;
  private d: number;

  constructor(state: RngState) {
    [this.a, this.b, this.c, this.d] = state;
  }

  get state(): RngState {
    return [this.a >>> 0, this.b >>> 0, this.c >>> 0, this.d >>> 0];
  }

  nextUint32(): number {
    const t = (((this.a + this.b) | 0) + this.d) | 0;
    this.d = (this.d + 1) | 0;
    this.a = this.b ^ (this.b >>> 9);
    this.b = (this.c + (this.c << 3)) | 0;
    this.c = (this.c << 21) | (this.c >>> 11);
    this.c = (this.c + t) | 0;
    return t >>> 0;
  }

  /** Uniform integer in [0, max), without modulo bias. */
  int(max: number): number {
    if (!Number.isInteger(max) || max < 1 || max > 0x1_0000_0000) throw new Error(`Invalid range ${max}`);
    const limit = Math.floor(0x1_0000_0000 / max) * max;
    for (;;) {
      const value = this.nextUint32();
      if (value < limit) return value % max;
    }
  }

  /** Fisher–Yates shuffle in place. */
  shuffle<T>(items: T[]): T[] {
    for (let i = items.length - 1; i > 0; i--) {
      const j = this.int(i + 1);
      [items[i], items[j]] = [items[j], items[i]];
    }
    return items;
  }
}

/** A fresh seed from the platform's cryptographic RNG, for rounds that don't need replaying. */
export function randomSeed(): number {
  const buffer = new Uint32Array(1);
  globalThis.crypto.getRandomValues(buffer);
  return buffer[0];
}
