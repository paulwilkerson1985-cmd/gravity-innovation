// mulberry32: tiny, fast, good-enough 32-bit PRNG. State is a single uint32 so it
// can live inside the serializable battle state.

export function nextState(s: number): number {
  return (s + 0x6d2b79f5) >>> 0;
}

export function outputOf(s: number): number {
  let t = s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export class Rng {
  constructor(public state: number) {
    this.state = state >>> 0;
  }
  /** Uniform float in [0, 1). */
  next(): number {
    this.state = nextState(this.state);
    return outputOf(this.state);
  }
  /** Integer in [0, n). */
  int(n: number): number {
    return Math.floor(this.next() * n);
  }
  /** Integer in [min, max] inclusive. */
  range(min: number, max: number): number {
    return min + this.int(max - min + 1);
  }
  chance(p: number): boolean {
    return this.next() < p;
  }
  pick<T>(items: readonly T[]): T {
    const item = items[this.int(items.length)];
    if (item === undefined) throw new Error('pick from empty list');
    return item;
  }
}

/** Mix several integers into a well-distributed 32-bit seed (for derived streams). */
export function hashSeed(...parts: number[]): number {
  let h = 0x811c9dc5;
  for (const p of parts) {
    h ^= p >>> 0;
    h = Math.imul(h, 0x01000193) >>> 0;
    h ^= h >>> 13;
  }
  return h >>> 0;
}

/** Parse a user-supplied seed (number or string) into a uint32. */
export function seedFrom(input: string | number): number {
  if (typeof input === 'number') return input >>> 0;
  const n = Number(input);
  if (Number.isFinite(n) && input.trim() !== '') return n >>> 0;
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) h = Math.imul(h ^ input.charCodeAt(i), 16777619) >>> 0;
  return h;
}
