import { describe, it, expect } from 'vitest';
import { noteToMidi, midiToFreq, noteToFreq, parseChord, pcAtOrAbove } from '../src/audio/notes';
import { pulseCoefficients, lfsrNoise } from '../src/audio/waves';
import { SFX_NAMES, MOVE_TYPES, sfxTones, moveTones } from '../src/audio/sfxdefs';
import { cryParams, cryTones, hashString, CRY_CONTOURS } from '../src/audio/cry';
import { compileTrack, parseMelody, parseDrums, parseChords, barLengths, chordTones, bassFromChords, harmFromChords } from '../src/audio/music/pattern';
import { TRACKS, TRACK_NAMES } from '../src/audio/music/tracks';
import { flattenTrack } from '../src/audio/sequencer';
import { loadVolume, saveVolume, mergeVolume, DEFAULT_VOLUME, STORAGE_KEY } from '../src/audio/settings';
import { tonesDuration, type Tone } from '../src/audio/tone';
import { SPECIES } from '../src/data/species';

function checkTones(tones: Tone[], maxLen: number): void {
  expect(tones.length).toBeGreaterThan(0);
  for (const t of tones) {
    expect(Number.isFinite(t.at) && t.at >= 0).toBe(true);
    expect(t.dur).toBeGreaterThan(0);
    expect(t.vol).toBeGreaterThan(0);
    expect(t.vol).toBeLessThanOrEqual(1);
    const freqs = t.freq === undefined ? [] : typeof t.freq === 'number' ? [t.freq] : t.freq.map((p) => p[1]);
    for (const f of freqs) expect(f > 0 && f < 20000).toBe(true);
    if (Array.isArray(t.freq)) for (const [tt] of t.freq) expect(tt >= 0 && tt <= t.dur + 1e-9).toBe(true);
    if (t.filter) {
      const ff = typeof t.filter.freq === 'number' ? [t.filter.freq] : t.filter.freq.map((p) => p[1]);
      for (const f of ff) expect(f).toBeGreaterThan(0);
    }
    if (t.wave !== 'noise' && t.wave !== 'metal') expect(t.freq).toBeDefined();
  }
  expect(tonesDuration(tones)).toBeLessThanOrEqual(maxLen);
}

describe('notes', () => {
  it('converts note names to MIDI and Hz', () => {
    expect(noteToMidi('C4')).toBe(60);
    expect(noteToMidi('A4')).toBe(69);
    expect(noteToMidi('Bb3')).toBe(58);
    expect(noteToMidi('F#5')).toBe(78);
    expect(midiToFreq(69)).toBe(440);
    expect(noteToFreq('A5')).toBeCloseTo(880);
    expect(noteToFreq('C4')).toBeCloseTo(261.63, 1);
    expect(() => noteToMidi('H2')).toThrow();
  });

  it('parses chord symbols', () => {
    expect(parseChord('Am')).toEqual({ root: 9, intervals: [0, 3, 7] });
    expect(parseChord('F#m7')).toEqual({ root: 6, intervals: [0, 3, 7, 10] });
    expect(parseChord('Bb').root).toBe(10);
    expect(parseChord('Cb').root).toBe(11);
    expect(parseChord('Bdim').intervals).toEqual([0, 3, 6]);
    expect(() => parseChord('Cfoo')).toThrow();
    expect(pcAtOrAbove(0, 40)).toBe(48);
    expect(pcAtOrAbove(4, 40)).toBe(40);
    expect(chordTones(parseChord('C'), 60)).toEqual([60, 64, 67]);
    expect(chordTones(parseChord('Am'), 62)).toEqual([64, 69, 72]);
  });
});

describe('waves', () => {
  it('builds band-limited pulse coefficients', () => {
    const { real, imag } = pulseCoefficients(0.5, 16);
    expect(real[0]).toBe(0);
    expect(imag[0]).toBe(0);
    for (let n = 1; n <= 16; n++) {
      expect(Math.abs(real[n]!)).toBeLessThan(1e-9); // square wave: odd-symmetric
      if (n % 2 === 0) expect(Math.abs(imag[n]!)).toBeLessThan(1e-9); // no even harmonics
    }
    const p12 = pulseCoefficients(0.125, 16);
    expect(Math.abs(p12.imag[2]!)).toBeGreaterThan(0.01); // narrow pulse has even harmonics
  });

  it('LFSR noise is deterministic, ±1, and short mode loops every 127 samples', () => {
    const a = lfsrNoise(1000);
    expect(Array.from(a)).toEqual(Array.from(lfsrNoise(1000)));
    expect(a.every((v) => v === 1 || v === -1)).toBe(true);
    const ones = a.filter((v) => v === 1).length;
    expect(ones).toBeGreaterThan(400);
    expect(ones).toBeLessThan(600);
    const s = lfsrNoise(600, true);
    for (let i = 200; i < 400; i++) expect(s[i]).toBe(s[i + 127]);
  });
});

describe('sfx and move cues', () => {
  it('every sfx renders valid tones', () => {
    expect(SFX_NAMES.length).toBe(27);
    for (const name of SFX_NAMES) checkTones(sfxTones(name), name === 'evolveStart' ? 2.5 : 1.3);
  });

  it('every element has a distinct move cue; unknown falls back to Neutral', () => {
    const seen = new Set<string>();
    for (const t of MOVE_TYPES) {
      const tones = moveTones(t);
      checkTones(tones, 1);
      seen.add(JSON.stringify(tones));
    }
    expect(seen.size).toBe(MOVE_TYPES.length);
    expect(moveTones('Bogus')).toEqual(moveTones('Neutral'));
  });
});

describe('creature cries', () => {
  it('is deterministic per species', () => {
    expect(hashString('ashkit')).toBe(hashString('ashkit'));
    expect(hashString('ashkit')).not.toBe(hashString('ashkiu'));
    expect(cryParams('dropple')).toEqual(cryParams('dropple'));
    expect(cryTones(cryParams('dropple'))).toEqual(cryTones(cryParams('dropple')));
  });

  it('every species gets a distinct, sane cry', () => {
    const seen = new Set<string>();
    for (const s of SPECIES) {
      const p = cryParams(s.id);
      expect(p.base).toBeGreaterThanOrEqual(200);
      expect(p.base).toBeLessThanOrEqual(1000);
      expect(p.dur).toBeGreaterThan(0.3);
      expect(p.dur).toBeLessThan(0.8);
      expect(p.syllables).toBeGreaterThanOrEqual(1);
      expect(p.syllables).toBeLessThanOrEqual(3);
      expect(CRY_CONTOURS).toContain(p.contour);
      checkTones(cryTones(p), 1);
      seen.add(`${p.wave}|${p.contour}|${p.base}`);
    }
    expect(seen.size).toBe(SPECIES.length);
  });

  it('pitch scales frequency and is clamped', () => {
    const p = { ...cryParams('mossling'), harmony: 0, grit: 0 };
    const f = (tones: Tone[]) => (tones[0]!.freq as [number, number][])[0]![1];
    expect(f(cryTones(p, 2)) / f(cryTones(p, 1))).toBeCloseTo(2);
    expect(f(cryTones(p, 100))).toBeCloseTo(f(cryTones(p, 4)));
    expect(f(cryTones(p, Number.NaN))).toBeCloseTo(f(cryTones(p, 1)));
  });
});

describe('pattern language', () => {
  it('parses melodies with carried lengths and rests', () => {
    const m = parseMelody('C4:2 D4 r:4 E4 | G4:8');
    expect(m.steps).toBe(20);
    expect(m.events).toEqual([
      { step: 0, len: 2, midi: 60 }, { step: 2, len: 2, midi: 62 }, { step: 8, len: 4, midi: 64 }, { step: 12, len: 8, midi: 67 },
    ]);
    expect(barLengths('C4:2 D4 r:4 E4 | G4:8', 'carry')).toEqual([12, 8]);
    expect(() => parseMelody('C4:0')).toThrow();
  });

  it('parses drums and chords', () => {
    const d = parseDrums('k.h. s...|');
    expect(d.steps).toBe(8);
    expect(d.events).toEqual([{ step: 0, kind: 'k' }, { step: 2, kind: 'h' }, { step: 4, kind: 's' }]);
    expect(() => parseDrums('kx')).toThrow();
    const c = parseChords('C | F:8 G:8');
    expect(c.steps).toBe(32);
    expect(c.spans.map((s) => s.step)).toEqual([0, 16, 24]);
  });

  it('generates bass and arpeggios inside each chord span', () => {
    const spans = parseChords('C | Am').spans;
    for (const style of ['octave', 'pulse', 'rootfifth', 'walk', 'long', 'gallop'] as const) {
      const notes = bassFromChords(spans, style);
      expect(notes.length).toBeGreaterThan(0);
      for (const n of notes) {
        expect(n.step + n.len).toBeLessThanOrEqual(32);
        expect(n.midi).toBeGreaterThanOrEqual(28);
        expect(n.midi).toBeLessThanOrEqual(64);
      }
    }
    expect(bassFromChords(spans, 'long')).toEqual([{ step: 0, len: 16, midi: 48 }, { step: 16, len: 16, midi: 45 }]);
    const arp = harmFromChords(spans, 'arp16', 60);
    expect(arp.length).toBe(32);
    expect(arp.slice(0, 4).map((n) => n.midi)).toEqual([60, 64, 67, 72]);
  });
});

describe('soundtrack', () => {
  it('has every requested track', () => {
    expect([...TRACK_NAMES].sort()).toEqual(['arena', 'battle', 'champion', 'evolution', 'route', 'title', 'trainer', 'victory']);
  });

  for (const name of TRACK_NAMES) {
    it(`${name}: channels line up bar by bar`, () => {
      const def = TRACKS[name];
      const t = compileTrack(def);
      expect(t.steps % 16).toBe(0);
      expect(barLengths(def.lead.notes, 'carry').every((l) => l === 16)).toBe(true);
      expect(barLengths(def.chords, 16).every((l) => l === 16)).toBe(true);
      expect(parseMelody(def.lead.notes).steps).toBe(t.steps);
      expect(parseChords(def.chords).steps).toBe(t.steps);
      if (def.drums) expect(parseDrums(def.drums.pattern).steps).toBe(t.steps);
      if (def.harm && 'notes' in def.harm) expect(parseMelody(def.harm.notes).steps).toBe(t.steps);
      if ('notes' in def.bass) expect(parseMelody(def.bass.notes).steps).toBe(t.steps);
      for (const n of t.lead) { expect(n.midi).toBeGreaterThanOrEqual(55); expect(n.midi).toBeLessThanOrEqual(96); }
      for (const n of t.bass) { expect(n.midi).toBeGreaterThanOrEqual(28); expect(n.midi).toBeLessThanOrEqual(64); }
      expect(t.lead.length).toBeGreaterThan(8);
      const flat = flattenTrack(t);
      for (let i = 1; i < flat.length; i++) expect(flat[i]!.step).toBeGreaterThanOrEqual(flat[i - 1]!.step);
    });
  }

  it('tracks differ in tempo, and only the victory fanfare is one-shot', () => {
    const bpms = TRACK_NAMES.map((n) => TRACKS[n].bpm);
    expect(new Set(bpms).size).toBe(bpms.length);
    for (const n of TRACK_NAMES) expect(TRACKS[n].loop).toBe(n !== 'victory');
    expect(TRACKS.champion.bpm).toBeGreaterThan(TRACKS.battle.bpm);
    expect(TRACKS.route.bpm).toBeLessThan(TRACKS.battle.bpm);
  });
});

describe('volume settings', () => {
  function memStore() {
    const m = new Map<string, string>();
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m };
  }

  it('clamps, persists and survives garbage', () => {
    const s = memStore();
    expect(loadVolume(s)).toEqual(DEFAULT_VOLUME);
    const v = mergeVolume(DEFAULT_VOLUME, { master: 2, music: -1, sfx: Number.NaN });
    expect(v).toEqual({ ...DEFAULT_VOLUME, master: 1, music: 0 });
    saveVolume(v, s);
    expect(loadVolume(s)).toEqual(v);
    s.m.set(STORAGE_KEY, '{not json');
    expect(loadVolume(s)).toEqual(DEFAULT_VOLUME);
    const throwing = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('full'); } };
    expect(loadVolume(throwing)).toEqual(DEFAULT_VOLUME);
    expect(() => saveVolume(v, throwing)).not.toThrow();
    expect(() => loadVolume(null)).not.toThrow();
  });
});
