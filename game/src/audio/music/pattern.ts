// Pure step-sequencer pattern language. One step = a 16th note; a 4/4 bar = 16 steps.
//
// Melody:  "C5:4 E5:2 G5 r:2 | ..."  NOTE[:len]; `r` is a rest; len (steps) carries over to the
//          following tokens until changed; `|` is a bar line (ignored, but checked by tests).
// Chords:  "Am F:8 G:8 | ..."        SYMBOL[:len]; len defaults to 16 (one bar) and does NOT carry.
// Drums:   "k...s...k.k.s..." one char per step: k kick, s snare, h closed hat, o open hat,
//          c crash, t tom, `.` rest. Whitespace and `|` are ignored.
import { noteToMidi, parseChord, pcAtOrAbove, type Chord } from '../notes';
import type { Wave } from '../tone';

export interface NoteEvent { step: number; len: number; midi: number }
export type DrumKind = 'k' | 's' | 'h' | 'o' | 'c' | 't';
export interface DrumEvent { step: number; kind: DrumKind }
export interface ChordSpan { step: number; len: number; chord: Chord }

export type BassStyle = 'octave' | 'pulse' | 'rootfifth' | 'walk' | 'long' | 'gallop';
export type HarmStyle = 'arp16' | 'arp8' | 'stab' | 'pad';

export interface VoiceDef { wave: Wave; vol: number; pan?: number }

export interface TrackDef {
  bpm: number;
  loop: boolean;
  /** Chord progression shared by bass and harmony generators. */
  chords: string;
  lead: VoiceDef & { notes: string; /** vibrato on long notes */ vibrato?: boolean };
  harm?: VoiceDef & ({ notes: string } | { style: HarmStyle; /** lowest MIDI note of the arpeggio */ floor: number });
  bass: VoiceDef & ({ notes: string } | { style: BassStyle });
  drums?: { vol: number; pattern: string };
}

export interface CompiledTrack {
  bpm: number;
  loop: boolean;
  steps: number;
  lead: NoteEvent[];
  harm: NoteEvent[];
  bass: NoteEvent[];
  drums: DrumEvent[];
  def: TrackDef;
}

function tokens(src: string): string[] {
  return src.split(/\s+/).filter((t) => t.length > 0);
}

export function parseMelody(src: string): { events: NoteEvent[]; steps: number } {
  const events: NoteEvent[] = [];
  let step = 0;
  let len = 4;
  for (const tok of tokens(src)) {
    if (tok === '|') continue;
    const [name, l] = tok.split(':');
    if (l !== undefined) {
      len = Number(l);
      if (!Number.isInteger(len) || len <= 0) throw new Error(`bad length in ${tok}`);
    }
    if (name !== 'r') events.push({ step, len, midi: noteToMidi(name!) });
    step += len;
  }
  return { events, steps: step };
}

/** Length in steps of each `|`-separated bar of a melody or chord string. */
export function barLengths(src: string, defaultLen: 'carry' | number): number[] {
  const out: number[] = [];
  let cur = 0;
  let len = 4;
  for (const tok of tokens(src)) {
    if (tok === '|') { out.push(cur); cur = 0; continue; }
    const l = tok.split(':')[1];
    if (defaultLen === 'carry') { if (l !== undefined) len = Number(l); cur += len; }
    else cur += l !== undefined ? Number(l) : defaultLen;
  }
  if (cur > 0) out.push(cur);
  return out;
}

export function parseChords(src: string): { spans: ChordSpan[]; steps: number } {
  const spans: ChordSpan[] = [];
  let step = 0;
  for (const tok of tokens(src)) {
    if (tok === '|') continue;
    const [sym, l] = tok.split(':');
    const len = l !== undefined ? Number(l) : 16;
    spans.push({ step, len, chord: parseChord(sym!) });
    step += len;
  }
  return { spans, steps: step };
}

export function parseDrums(src: string): { events: DrumEvent[]; steps: number } {
  const chars = src.replace(/[\s|]/g, '');
  const events: DrumEvent[] = [];
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i]!;
    if (c === '.') continue;
    if (!'kshoct'.includes(c)) throw new Error(`bad drum char ${c}`);
    events.push({ step: i, kind: c as DrumKind });
  }
  return { events, steps: chars.length };
}

/** Chord tones as MIDI notes, ascending from the first chord tone at or above `floor`. */
export function chordTones(chord: Chord, floor: number): number[] {
  return chord.intervals
    .map((iv) => pcAtOrAbove((chord.root + iv) % 12, floor))
    .sort((a, b) => a - b);
}

export function bassFromChords(spans: ChordSpan[], style: BassStyle): NoteEvent[] {
  const out: NoteEvent[] = [];
  for (const { step, len, chord } of spans) {
    const root = pcAtOrAbove(chord.root, 40); // E2..D#3
    const fifth = root + (chord.intervals.includes(7) ? 7 : chord.intervals[2] ?? 7);
    const third = root + (chord.intervals[1] ?? 4);
    const push = (s: number, l: number, m: number) => { if (s < step + len) out.push({ step: s, len: Math.min(l, step + len - s), midi: m }); };
    switch (style) {
      case 'long': push(step, len, root); break;
      case 'octave': for (let s = 0; s < len; s += 2) push(step + s, 2, (s / 2) % 2 ? root + 12 : root); break;
      case 'pulse': for (let s = 0; s < len; s += 2) push(step + s, 2, root); break;
      case 'rootfifth': for (let s = 0; s < len; s += 4) push(step + s, 4, (s / 4) % 2 ? fifth - 12 : root); break;
      case 'walk': {
        const seq = [root, third, fifth, root + 12];
        for (let s = 0; s < len; s += 4) push(step + s, 4, seq[(s / 4) % 4]!);
        break;
      }
      case 'gallop': for (let s = 0; s < len; s += 4) { push(step + s, 2, root); push(step + s + 2, 1, root); push(step + s + 3, 1, root + 12); } break;
    }
  }
  return out;
}

export function harmFromChords(spans: ChordSpan[], style: HarmStyle, floor: number): NoteEvent[] {
  const out: NoteEvent[] = [];
  for (const { step, len, chord } of spans) {
    const tones = chordTones(chord, floor);
    const cycle = [...tones.slice(0, 3), tones[0]! + 12];
    switch (style) {
      case 'arp16': for (let s = 0; s < len; s++) out.push({ step: step + s, len: 1, midi: cycle[s % cycle.length]! }); break;
      case 'arp8': {
        const ud = [cycle[0]!, cycle[1]!, cycle[2]!, cycle[3]!, cycle[2]!, cycle[1]!];
        for (let s = 0; s < len; s += 2) out.push({ step: step + s, len: 2, midi: ud[(s / 2) % ud.length]! });
        break;
      }
      case 'stab': for (let s = 2; s < len; s += 4) out.push({ step: step + s, len: 1, midi: tones[((s - 2) / 4) % 2 ? 2 : 1] ?? tones[0]! }); break;
      case 'pad': out.push({ step, len, midi: tones[1] ?? tones[0]! }); break;
    }
  }
  return out;
}

export function compileTrack(def: TrackDef): CompiledTrack {
  const chords = parseChords(def.chords);
  const lead = parseMelody(def.lead.notes);
  const harm = !def.harm ? { events: [] as NoteEvent[] }
    : 'notes' in def.harm ? parseMelody(def.harm.notes)
      : { events: harmFromChords(chords.spans, def.harm.style, def.harm.floor) };
  const bass = 'notes' in def.bass ? parseMelody(def.bass.notes).events : bassFromChords(chords.spans, def.bass.style);
  const drums = def.drums ? parseDrums(def.drums.pattern).events : [];
  return {
    bpm: def.bpm, loop: def.loop, steps: Math.max(chords.steps, lead.steps),
    lead: lead.events, harm: harm.events, bass, drums, def,
  };
}

/** Seconds per 16th-note step. */
export function stepSeconds(bpm: number): number {
  return 60 / bpm / 4;
}
