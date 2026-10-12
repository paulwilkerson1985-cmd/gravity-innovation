// Declarative description of a synthesized sound. SFX, move cues and creature cries are all
// pure data (arrays of Tone) so they can be unit-tested without an AudioContext.

export type Wave = 'square' | 'pulse25' | 'pulse12' | 'triangle' | 'sawtooth' | 'sine' | 'noise' | 'metal';

/** Breakpoints as [secondsFromToneStart, value]. Frequencies ramp exponentially between points. */
export type Points = Array<[number, number]>;

export interface Tone {
  wave: Wave;
  /** Start offset in seconds from the moment the sound is triggered. */
  at: number;
  /** Total length in seconds (including release). */
  dur: number;
  /** Oscillator frequency in Hz, or a contour. Ignored by noise waves (use `rate`/`filter`). */
  freq?: number | Points;
  /** Peak gain 0..1. */
  vol: number;
  /** Amplitude envelope. pluck = fast attack + exponential decay; hold = sustain then short release;
   *  swell = rise then fall; or explicit gain points (0..1, scaled by vol). */
  env?: 'pluck' | 'hold' | 'swell' | Points;
  /** Noise playback rate (pitch of the noise; < 1 is darker, > 1 brighter). */
  rate?: number;
  filter?: { type: BiquadFilterType; freq: number | Points; q?: number };
  /** Pitch vibrato: rate in Hz, depth in cents. */
  vibrato?: { rate: number; depth: number };
  /** Stereo position -1..1. */
  pan?: number;
}

/** Latest end time of a set of tones. */
export function tonesDuration(tones: readonly Tone[]): number {
  let end = 0;
  for (const t of tones) end = Math.max(end, t.at + t.dur);
  return end;
}

/** Shift tones in time and scale their volume — handy for composing sounds. */
export function shift(tones: readonly Tone[], dt: number, volScale = 1): Tone[] {
  return tones.map((t) => ({ ...t, at: t.at + dt, vol: t.vol * volScale }));
}
