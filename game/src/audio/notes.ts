// Pure pitch helpers: note names, MIDI numbers, frequencies and chord spelling.

const PITCH_CLASS: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** Parse "C4", "F#5", "Bb3", "Eb6" → MIDI note number (C4 = 60, A4 = 69). Throws on bad input. */
export function noteToMidi(name: string): number {
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(name.trim());
  if (!m) throw new Error(`bad note name: ${name}`);
  const pc = PITCH_CLASS[m[1]!]! + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
  return (Number(m[3]) + 1) * 12 + pc;
}

/** Equal temperament, A4 = 440 Hz. */
export function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export function noteToFreq(name: string): number {
  return midiToFreq(noteToMidi(name));
}

export interface Chord {
  /** Pitch class of the root, 0..11 (C = 0). */
  root: number;
  /** Semitone offsets from the root, ascending, starting at 0. */
  intervals: number[];
}

const QUALITIES: Record<string, number[]> = {
  '': [0, 4, 7],
  m: [0, 3, 7],
  '7': [0, 4, 7, 10],
  m7: [0, 3, 7, 10],
  maj7: [0, 4, 7, 11],
  dim: [0, 3, 6],
  aug: [0, 4, 8],
  sus4: [0, 5, 7],
  sus2: [0, 2, 7],
  '5': [0, 7],
};

/** Parse a chord symbol such as "C", "Am", "F#m7", "Bbmaj7", "Bdim", "G7". */
export function parseChord(symbol: string): Chord {
  const m = /^([A-G])([#b]?)(.*)$/.exec(symbol.trim());
  if (!m) throw new Error(`bad chord: ${symbol}`);
  const intervals = QUALITIES[m[3]!];
  if (!intervals) throw new Error(`unknown chord quality: ${symbol}`);
  const root = (PITCH_CLASS[m[1]!]! + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + 12) % 12;
  return { root, intervals };
}

/** Lowest MIDI note with the given pitch class that is >= `min`. */
export function pcAtOrAbove(pc: number, min: number): number {
  const base = min - (((min % 12) + 12) % 12) + pc;
  return base >= min ? base : base + 12;
}
