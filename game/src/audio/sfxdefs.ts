// Every sound effect and move cue as pure data (Tone[]). Rendering lives in synth.ts.
import { noteToFreq as n } from './notes';
import type { Tone, Points } from './tone';

export const SFX_NAMES = [
  'select', 'back', 'cursor', 'hit', 'superHit', 'weakHit', 'crit', 'miss', 'faint', 'throw', 'shake',
  'click', 'caught', 'breakFree', 'levelUp', 'evolveStart', 'evolveDone', 'heal', 'status', 'statUp',
  'statDown', 'run', 'encounter', 'xpTick', 'denied', 'item', 'switch',
] as const;
export type SfxName = (typeof SFX_NAMES)[number];

export const MOVE_TYPES = ['Flame', 'Tide', 'Flora', 'Spark', 'Terra', 'Gale', 'Neutral'] as const;
export type MoveType = (typeof MOVE_TYPES)[number];

/** A run of short notes, `step` seconds apart. */
function arp(notes: string[], step: number, opts: Partial<Tone> & { len?: number; at?: number } = {}): Tone[] {
  const { len = step * 1.1, at = 0, ...rest } = opts;
  return notes.map((name, i) => ({
    wave: 'pulse25', vol: 0.32, env: 'pluck', ...rest, at: at + i * step, dur: len, freq: n(name),
  }));
}

function sweep(wave: Tone['wave'], f0: number, f1: number, dur: number, vol: number, at = 0, extra: Partial<Tone> = {}): Tone {
  return { wave, at, dur, freq: [[0, f0], [dur, f1]], vol, env: 'pluck', ...extra };
}

function noiseHit(at: number, dur: number, vol: number, filter: Tone['filter'], extra: Partial<Tone> = {}): Tone {
  return { wave: 'noise', at, dur, vol, env: 'pluck', filter, ...extra };
}

/** Gain points that pulse on/off `count` times across `dur` (tremolo / rustle). */
function tremolo(dur: number, count: number, floor = 0.15): Points {
  const pts: Points = [[0, 0]];
  for (let i = 0; i < count; i++) {
    const t = (i / count) * dur;
    pts.push([t + 0.004, 1 - (i / count) * 0.5], [t + dur / count * 0.8, floor]);
  }
  pts.push([dur, 0]);
  return pts;
}

const SFX: Record<SfxName, () => Tone[]> = {
  select: () => [
    { wave: 'pulse25', at: 0, dur: 0.05, freq: n('B5'), vol: 0.28, env: 'hold' },
    { wave: 'pulse25', at: 0.05, dur: 0.09, freq: n('E6'), vol: 0.28, env: 'pluck' },
  ],
  back: () => [
    { wave: 'pulse25', at: 0, dur: 0.05, freq: n('E6'), vol: 0.22, env: 'hold' },
    { wave: 'pulse25', at: 0.05, dur: 0.09, freq: n('A5'), vol: 0.22, env: 'pluck' },
  ],
  cursor: () => [{ wave: 'pulse12', at: 0, dur: 0.035, freq: n('A6'), vol: 0.16, env: 'pluck' }],
  hit: () => [
    noiseHit(0, 0.14, 0.55, { type: 'lowpass', freq: [[0, 3200], [0.14, 600]] }),
    sweep('square', 240, 70, 0.09, 0.3),
  ],
  superHit: () => [
    noiseHit(0, 0.26, 0.55, { type: 'lowpass', freq: [[0, 6000], [0.26, 500]] }),
    sweep('square', 360, 55, 0.18, 0.38),
    sweep('triangle', 160, 40, 0.3, 0.5, 0.02),
    noiseHit(0.08, 0.12, 0.35, { type: 'highpass', freq: 2500 }),
  ],
  weakHit: () => [
    noiseHit(0, 0.07, 0.35, { type: 'lowpass', freq: 900 }),
    sweep('triangle', 170, 90, 0.08, 0.3),
  ],
  crit: () => [
    noiseHit(0, 0.18, 0.65, { type: 'lowpass', freq: [[0, 5000], [0.18, 700]] }),
    sweep('square', 420, 60, 0.13, 0.34),
    { wave: 'pulse12', at: 0.05, dur: 0.22, freq: n('E7'), vol: 0.2, env: 'pluck' },
    { wave: 'pulse12', at: 0.09, dur: 0.22, freq: n('B7'), vol: 0.14, env: 'pluck' },
  ],
  miss: () => [
    { wave: 'noise', at: 0, dur: 0.24, vol: 0.32, env: 'swell', filter: { type: 'bandpass', freq: [[0, 2200], [0.24, 350]], q: 3 } },
  ],
  faint: () => [
    { wave: 'square', at: 0, dur: 0.7, freq: [[0, 900], [0.7, 90]], vol: 0.28, env: 'hold', vibrato: { rate: 14, depth: 60 } },
    noiseHit(0.66, 0.2, 0.4, { type: 'lowpass', freq: 400 }),
    sweep('triangle', 110, 40, 0.24, 0.5, 0.66),
  ],
  throw: () => [
    { wave: 'noise', at: 0, dur: 0.3, vol: 0.3, env: 'swell', filter: { type: 'bandpass', freq: [[0, 500], [0.3, 3500]], q: 2.5 } },
    sweep('triangle', 300, 1000, 0.28, 0.25, 0, { env: 'swell' }),
  ],
  shake: () => [
    sweep('triangle', 200, 120, 0.06, 0.45),
    noiseHit(0, 0.04, 0.3, { type: 'bandpass', freq: 1200, q: 2 }),
    sweep('triangle', 180, 110, 0.06, 0.4, 0.1),
    noiseHit(0.1, 0.04, 0.25, { type: 'bandpass', freq: 1000, q: 2 }),
  ],
  click: () => [
    { wave: 'metal', at: 0, dur: 0.05, vol: 0.4, env: 'pluck', rate: 1.4, filter: { type: 'highpass', freq: 1500 } },
    { wave: 'square', at: 0, dur: 0.03, freq: 1760, vol: 0.22, env: 'pluck' },
    { wave: 'square', at: 0.07, dur: 0.05, freq: 2350, vol: 0.25, env: 'pluck' },
    { wave: 'metal', at: 0.07, dur: 0.06, vol: 0.35, env: 'pluck', rate: 1.8, filter: { type: 'highpass', freq: 2000 } },
  ],
  caught: () => [
    ...arp(['G5', 'C6', 'E6', 'G6'], 0.075),
    { wave: 'pulse25', at: 0.3, dur: 0.5, freq: n('C7'), vol: 0.3, env: 'hold', vibrato: { rate: 6, depth: 18 } },
    ...arp(['C4', 'G4', 'C5'], 0.1, { wave: 'triangle', vol: 0.45, len: 0.12 }),
    { wave: 'triangle', at: 0.3, dur: 0.5, freq: n('E5'), vol: 0.4, env: 'hold' },
  ],
  breakFree: () => [
    noiseHit(0, 0.16, 0.55, { type: 'lowpass', freq: [[0, 7000], [0.16, 1200]] }),
    sweep('square', 180, 1300, 0.12, 0.3),
    ...arp(['E6', 'C6', 'A5'], 0.06, { at: 0.14, vol: 0.2, wave: 'pulse12' }),
  ],
  levelUp: () => [
    ...arp(['C5', 'E5', 'G5', 'C6', 'E6', 'G6'], 0.065, { vol: 0.28 }),
    { wave: 'pulse25', at: 0.39, dur: 0.45, freq: n('C7'), vol: 0.3, env: 'hold', vibrato: { rate: 7, depth: 20 } },
    { wave: 'pulse12', at: 0.39, dur: 0.45, freq: n('G6'), vol: 0.16, env: 'hold' },
    { wave: 'triangle', at: 0.39, dur: 0.45, freq: n('C5'), vol: 0.4, env: 'hold' },
  ],
  evolveStart: () => [
    { wave: 'triangle', at: 0, dur: 1.8, freq: [[0, 110], [1.8, 440]], vol: 0.45, env: 'swell' },
    { wave: 'pulse12', at: 0, dur: 1.8, freq: [[0, 440], [1.8, 1760]], vol: 0.14, env: tremolo(1.8, 18, 0.2), vibrato: { rate: 9, depth: 30 } },
    { wave: 'noise', at: 0.2, dur: 1.6, vol: 0.16, env: 'swell', filter: { type: 'bandpass', freq: [[0, 800], [1.6, 6000]], q: 4 } },
  ],
  evolveDone: () => [
    noiseHit(0, 0.6, 0.22, { type: 'highpass', freq: 3000 }),
    ...arp(['A5', 'C#6', 'E6', 'A6'], 0.08, { vol: 0.3 }),
    { wave: 'pulse25', at: 0.32, dur: 0.7, freq: n('C#7'), vol: 0.3, env: 'hold', vibrato: { rate: 6, depth: 20 } },
    { wave: 'pulse12', at: 0.32, dur: 0.7, freq: n('E6'), vol: 0.18, env: 'hold' },
    ...arp(['A3', 'E4', 'A4'], 0.1, { wave: 'triangle', vol: 0.45, len: 0.12 }),
    { wave: 'triangle', at: 0.32, dur: 0.7, freq: n('A4'), vol: 0.45, env: 'hold' },
  ],
  heal: () => {
    const notes = ['E6', 'G#6', 'B6', 'E7'];
    return [
      ...arp(notes, 0.09, { wave: 'pulse12', vol: 0.24, len: 0.2 }),
      ...arp(notes, 0.09, { wave: 'pulse12', vol: 0.09, len: 0.2, at: 0.13 }),
      { wave: 'triangle', at: 0, dur: 0.6, freq: [[0, n('E5')], [0.6, n('B5')]], vol: 0.25, env: 'swell' },
    ];
  },
  status: () => [
    { wave: 'square', at: 0, dur: 0.38, freq: [[0, 700], [0.38, 380]], vol: 0.22, env: 'hold', vibrato: { rate: 13, depth: 90 } },
    { wave: 'metal', at: 0.02, dur: 0.3, vol: 0.12, env: tremolo(0.3, 5), rate: 0.6, filter: { type: 'bandpass', freq: 2000, q: 3 } },
  ],
  statUp: () => [0, 1, 2].map((i) => sweep('pulse25', 380 + i * 160, 1100 + i * 260, 0.1, 0.24, i * 0.1)),
  statDown: () => [0, 1, 2].map((i) => sweep('pulse25', 1300 - i * 220, 380 - i * 80, 0.12, 0.24, i * 0.12)),
  run: () => [
    ...[0, 0.08, 0.16, 0.24].map((t, i) => noiseHit(t, 0.04, 0.3 - i * 0.05, { type: 'lowpass', freq: 1400 })),
    { wave: 'noise', at: 0.18, dur: 0.25, vol: 0.25, env: 'swell', filter: { type: 'bandpass', freq: [[0, 3000], [0.25, 600]], q: 2 } },
  ],
  encounter: () => [
    ...arp(['E6', 'B5', 'E6', 'B5', 'E6', 'B5'], 0.055, { wave: 'pulse12', vol: 0.22, len: 0.05 }),
    { wave: 'noise', at: 0.3, dur: 0.4, vol: 0.3, env: 'swell', filter: { type: 'bandpass', freq: [[0, 300], [0.4, 5000]], q: 2 } },
    sweep('square', 110, 880, 0.4, 0.2, 0.3, { env: 'swell' }),
  ],
  xpTick: () => [{ wave: 'pulse12', at: 0, dur: 0.03, freq: n('C7'), vol: 0.12, env: 'pluck' }],
  denied: () => [
    { wave: 'square', at: 0, dur: 0.09, freq: 140, vol: 0.24, env: 'hold' },
    { wave: 'square', at: 0, dur: 0.09, freq: 148, vol: 0.18, env: 'hold' },
    { wave: 'square', at: 0.12, dur: 0.12, freq: 140, vol: 0.24, env: 'hold' },
    { wave: 'square', at: 0.12, dur: 0.12, freq: 148, vol: 0.18, env: 'hold' },
  ],
  item: () => [
    ...arp(['G5', 'B5', 'D6'], 0.07),
    { wave: 'pulse25', at: 0.21, dur: 0.3, freq: n('G6'), vol: 0.3, env: 'hold', vibrato: { rate: 7, depth: 15 } },
    { wave: 'triangle', at: 0.21, dur: 0.3, freq: n('G4'), vol: 0.35, env: 'hold' },
  ],
  switch: () => [
    { wave: 'noise', at: 0, dur: 0.2, vol: 0.22, env: 'swell', filter: { type: 'bandpass', freq: [[0, 800], [0.2, 4000]], q: 3 } },
    sweep('triangle', 300, 900, 0.16, 0.3),
    { wave: 'pulse25', at: 0.16, dur: 0.06, freq: n('A6'), vol: 0.2, env: 'pluck' },
  ],
};

const MOVES: Record<MoveType, () => Tone[]> = {
  Flame: () => {
    const crackles = [0.03, 0.09, 0.13, 0.2, 0.26, 0.31, 0.38, 0.43];
    return [
      { wave: 'noise', at: 0, dur: 0.5, vol: 0.4, env: 'swell', filter: { type: 'bandpass', freq: [[0, 500], [0.3, 2600], [0.5, 900]], q: 1.4 } },
      { wave: 'sawtooth', at: 0, dur: 0.5, freq: [[0, 120], [0.5, 70]], vol: 0.16, env: 'swell', filter: { type: 'lowpass', freq: 500 } },
      ...crackles.map((t, i) => noiseHit(t, 0.025, 0.3 + (i % 3) * 0.08, { type: 'highpass', freq: 3000 + (i % 4) * 900 }, { rate: 1.5 })),
    ];
  },
  Tide: () => [
    noiseHit(0, 0.55, 0.5, { type: 'lowpass', freq: [[0, 6500], [0.55, 400]] }),
    ...[0.06, 0.13, 0.21, 0.3, 0.37].map((t, i) => sweep('sine', 380 + i * 70, 1100 + i * 120, 0.06, 0.32, t)),
    { wave: 'triangle', at: 0, dur: 0.45, freq: [[0, 200], [0.45, 120]], vol: 0.25, env: 'swell' },
  ],
  Flora: () => [
    { wave: 'noise', at: 0, dur: 0.5, vol: 0.32, env: tremolo(0.5, 7, 0.1), filter: { type: 'bandpass', freq: 3200, q: 2 } },
    ...arp(['G5', 'A5', 'C6', 'D6', 'E6', 'G6'], 0.06, { wave: 'pulse12', vol: 0.16, len: 0.1, at: 0.08 }),
    { wave: 'triangle', at: 0, dur: 0.4, freq: [[0, 260], [0.4, 520]], vol: 0.2, env: 'swell' },
  ],
  Spark: () => [
    { wave: 'square', at: 0, dur: 0.32, freq: [[0, 1800], [0.04, 300], [0.08, 2200], [0.12, 260], [0.17, 1900], [0.22, 240], [0.32, 1200]], vol: 0.2, env: 'hold' },
    sweep('sawtooth', 2000, 150, 0.28, 0.14, 0.02),
    { wave: 'noise', at: 0, dur: 0.3, vol: 0.28, env: tremolo(0.3, 9, 0.05), filter: { type: 'highpass', freq: 4000 }, rate: 1.3 },
    { wave: 'metal', at: 0.04, dur: 0.22, vol: 0.12, env: 'pluck', rate: 2 },
  ],
  Terra: () => [
    sweep('square', 130, 40, 0.16, 0.35),
    { wave: 'triangle', at: 0, dur: 0.65, freq: [[0, 75], [0.65, 32]], vol: 0.45, env: 'hold' },
    { wave: 'noise', at: 0, dur: 0.65, vol: 0.4, env: 'swell', rate: 0.5, filter: { type: 'lowpass', freq: 320 } },
    ...[0.18, 0.32, 0.45].map((t) => noiseHit(t, 0.08, 0.28, { type: 'lowpass', freq: 700 }, { rate: 0.7 })),
  ],
  Gale: () => [
    { wave: 'noise', at: 0, dur: 0.6, vol: 0.45, env: 'swell', filter: { type: 'bandpass', freq: [[0, 300], [0.3, 2600], [0.6, 450]], q: 5 } },
    { wave: 'sine', at: 0.05, dur: 0.5, freq: [[0, 900], [0.25, 1700], [0.5, 1050]], vol: 0.12, env: 'swell', vibrato: { rate: 8, depth: 25 } },
  ],
  Neutral: () => [
    sweep('square', 620, 120, 0.1, 0.3),
    noiseHit(0, 0.12, 0.45, { type: 'lowpass', freq: 3000 }),
    sweep('triangle', 220, 60, 0.14, 0.45),
  ],
};

export function sfxTones(name: SfxName): Tone[] {
  const f = SFX[name];
  return f ? f() : [];
}

export function moveTones(type: string): Tone[] {
  const f = (MOVES as Record<string, () => Tone[]>)[type] ?? MOVES.Neutral;
  return f();
}
