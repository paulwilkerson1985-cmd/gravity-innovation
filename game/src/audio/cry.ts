// Deterministic creature cries: species id → hash → parameters → Tone[]. Pure.
import type { Tone, Points, Wave } from './tone';

/** 32-bit FNV-1a hash of a string. */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Small seeded PRNG (mulberry32) returning floats in [0, 1). */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const CRY_WAVES: readonly Wave[] = ['square', 'pulse25', 'pulse12', 'sawtooth', 'triangle'];
export const CRY_CONTOURS = ['rise', 'fall', 'arch', 'dip', 'warble', 'yelp', 'trill', 'growl'] as const;
export type CryContour = (typeof CRY_CONTOURS)[number];

export interface CryParams {
  wave: Wave;
  /** Base pitch in Hz. */
  base: number;
  contour: CryContour;
  /** Pitch range of the contour as a ratio (>1). */
  range: number;
  /** Total length in seconds. */
  dur: number;
  /** Number of syllables (1..3). */
  syllables: number;
  vibratoRate: number;
  /** Vibrato depth in cents. */
  vibratoDepth: number;
  /** Noise layer volume 0..0.35 (raspiness). */
  grit: number;
  /** Frequency ratio of a quieter second voice, or 0 for none. */
  harmony: number;
}

export function cryParams(speciesId: string): CryParams {
  const rnd = seededRandom(hashString(speciesId));
  const pick = <T>(arr: readonly T[]): T => arr[Math.floor(rnd() * arr.length)]!;
  const wave = pick(CRY_WAVES);
  const contour = pick(CRY_CONTOURS);
  return {
    wave,
    base: Math.round(200 * Math.pow(2, rnd() * 2.3)),
    contour,
    range: 1.25 + rnd() * 1.1,
    dur: 0.34 + rnd() * 0.4,
    syllables: 1 + Math.floor(rnd() * rnd() * 3),
    vibratoRate: 5 + rnd() * 14,
    vibratoDepth: rnd() < 0.4 ? 0 : 15 + rnd() * 70,
    grit: rnd() < 0.45 ? 0 : 0.08 + rnd() * 0.27,
    harmony: pick([0, 0, 0, 1.5, 1.25, 0.5, 1.007, 2]),
  };
}

function contourPoints(c: CryContour, base: number, range: number, dur: number): Points {
  const hi = base * range;
  const lo = base / Math.sqrt(range);
  switch (c) {
    case 'rise': return [[0, lo], [dur * 0.7, hi], [dur, hi * 0.95]];
    case 'fall': return [[0, hi], [dur * 0.15, hi], [dur, lo]];
    case 'arch': return [[0, base], [dur * 0.4, hi], [dur, lo]];
    case 'dip': return [[0, hi], [dur * 0.5, lo], [dur, base * 1.1]];
    case 'warble': {
      const pts: Points = [];
      for (let i = 0; i <= 6; i++) pts.push([(i / 6) * dur, i % 2 ? hi : base]);
      return pts;
    }
    case 'yelp': return [[0, base], [dur * 0.08, hi * 1.2], [dur * 0.3, base], [dur, lo]];
    case 'trill': {
      const pts: Points = [];
      for (let i = 0; i <= 10; i++) pts.push([(i / 10) * dur, (i % 2 ? hi : base) * (1 - i * 0.02)]);
      return pts;
    }
    case 'growl': return [[0, lo * 0.7], [dur * 0.5, base * 0.8], [dur, lo * 0.6]];
  }
}

const clampPitch = (p: number) => (Number.isFinite(p) ? Math.min(4, Math.max(0.25, p)) : 1);

/** Render a cry. `pitch` multiplies frequency (e.g. 0.85 for a faint cry, 1.1 for a baby form). */
export function cryTones(p: CryParams, pitch = 1): Tone[] {
  const k = clampPitch(pitch);
  const total = p.dur / Math.sqrt(k);
  const gap = 0.04;
  const syl = (total - gap * (p.syllables - 1)) / p.syllables;
  const out: Tone[] = [];
  const vol = p.wave === 'triangle' ? 0.5 : p.wave === 'sawtooth' ? 0.24 : 0.3;
  for (let s = 0; s < p.syllables; s++) {
    const at = s * (syl + gap);
    // Later syllables drift down a little so multi-part cries feel like phrases.
    const base = p.base * k * (1 - s * 0.08);
    const freq = contourPoints(p.contour, base, p.range, syl);
    const vibrato = p.vibratoDepth > 0 ? { rate: p.vibratoRate, depth: p.vibratoDepth } : undefined;
    out.push({ wave: p.wave, at, dur: syl, freq, vol, env: 'hold', vibrato });
    if (p.harmony > 0) {
      out.push({
        wave: p.wave === 'triangle' ? 'pulse12' : 'triangle', at, dur: syl, vol: vol * 0.45, env: 'hold', vibrato,
        freq: freq.map(([t, f]) => [t, f * p.harmony] as [number, number]),
      });
    }
    if (p.grit > 0) {
      out.push({ wave: 'noise', at, dur: syl, vol: p.grit, env: 'hold', rate: 0.6 + k * 0.3, filter: { type: 'bandpass', freq: base * 2, q: 1.5 } });
    }
  }
  return out;
}
