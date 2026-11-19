// Seeded randomness: everything in game/ draws from one Rng, so a seed replays a whole session (tests, ?trace).

/** mulberry32: small, fast, good enough for movement. */
export class Rng {
  private s: number;

  constructor(seed: number) {
    this.s = seed >>> 0;
  }

  /** 0 <= x < 1 */
  next(): number {
    let t = (this.s = (this.s + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** a <= x < b */
  range(a: number, b: number): number {
    return a + (b - a) * this.next();
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  /** -1 or 1 */
  sign(): number {
    return this.next() < 0.5 ? -1 : 1;
  }

  int(n: number): number {
    return Math.floor(this.next() * n);
  }

  pick<T>(list: readonly T[]): T {
    return list[this.int(list.length)];
  }

  /** A key drawn in proportion to its weight; zero and negative weights never come. */
  weighted<K extends string>(weights: Partial<Record<K, number>>): K {
    const entries = Object.entries(weights) as [K, number][];
    let total = 0;
    for (const [, w] of entries) if (w > 0) total += w;
    let x = this.next() * total;
    for (const [k, w] of entries) {
      if (w <= 0) continue;
      x -= w;
      if (x < 0) return k;
    }
    // Rounding at the top end: the last key with weight.
    for (let i = entries.length - 1; i >= 0; i--) if (entries[i][1] > 0) return entries[i][0];
    throw new Error('weighted: no positive weight');
  }
}
