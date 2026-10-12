// Original Orbkin soundtrack, written in the pattern language from pattern.ts.
// Each tune has its own key, tempo and lead timbre. 16 steps per bar.
import type { TrackDef } from './pattern';

export const TRACK_NAMES = ['title', 'route', 'battle', 'trainer', 'champion', 'victory', 'evolution', 'arena'] as const;
export type TrackName = (typeof TRACK_NAMES)[number];

const rep = (s: string, n: number) => Array.from({ length: n }, () => s).join(' | ');

export const TRACKS: Record<TrackName, TrackDef> = {
  // Bb major, bright and heroic: the "adventure begins" theme.
  title: {
    bpm: 132, loop: true,
    chords: 'Bb | F | Gm | Eb | Bb | F | Eb | F | Gm | Eb | Bb | F | Cm | F | Bb | F',
    lead: {
      wave: 'pulse25', vol: 0.2, pan: -0.15, vibrato: true, notes: `
        F4:4 Bb4:2 C5:2 D5:6 Bb4:2 | C5:4 A4:2 F4:2 C5:4 D5:2 C5:2 | Bb4:4 D5:2 G5:2 F5:6 D5:2 | Eb5:4 D5:2 C5:2 Bb4:4 G4:4 |
        F4:4 Bb4:2 C5:2 D5:4 F5:4 | G5:2 F5:2 Eb5:2 D5:2 C5:4 A4:4 | G4:2 Bb4:2 Eb5:4 D5:2 C5:2 Bb4:2 C5:2 | C5:8 r:4 F4:2 A4:2 |
        Bb4:4 G4:2 Bb4:2 D5:4 G5:4 | G5:4 F5:2 Eb5:2 Bb4:8 | D5:4 C5:2 Bb4:2 F5:4 D5:4 | C5:6 A4:2 F4:8 |
        Eb5:4 D5:2 C5:2 G4:4 C5:4 | F5:4 Eb5:2 D5:2 C5:4 A4:4 | Bb4:2 C5:2 D5:2 F5:2 Bb5:8 | A5:4 F5:4 C5:4 A4:4`,
    },
    harm: { wave: 'pulse12', vol: 0.07, pan: 0.25, style: 'arp16', floor: 62 },
    bass: { wave: 'triangle', vol: 0.32, style: 'octave' },
    drums: { vol: 0.5, pattern: rep('k...h.h.s...h.h.', 7) + ' | k...h.h.s...s.ss | ' + rep('k...h.h.s...h.hk', 7) + ' | k.k.s.s.s.s.ssss' },
  },

  // G major, relaxed stroll through the grass.
  route: {
    bpm: 112, loop: true,
    chords: 'G | Em | C | D | G | Em | Am | D | C | D | Bm | Em | C | D | G | G',
    lead: {
      wave: 'square', vol: 0.15, pan: -0.1, vibrato: true, notes: `
        D5:3 B4:1 G4:4 A4:2 B4:2 D5:4 | E5:6 D5:2 B4:8 | C5:3 B4:1 A4:2 G4:2 E4:4 G4:4 | A4:12 r:4 |
        D5:3 B4:1 G4:4 A4:2 B4:2 G5:4 | E5:4 G5:2 E5:2 D5:4 B4:4 | C5:2 B4:2 A4:2 B4:2 C5:4 E5:4 | D5:8 r:4 F#4:2 A4:2 |
        G4:2 C5:2 E5:4 E5:2 D5:2 C5:4 | D5:2 A4:2 F#4:4 A4:2 D5:2 F#5:4 | F#5:6 E5:2 D5:4 B4:4 | E5:12 r:4 |
        E5:3 D5:1 C5:4 G4:4 C5:4 | D5:3 C5:1 B4:4 A4:4 F#4:4 | G4:4 B4:2 D5:2 G5:4 D5:4 | B4:8 r:8`,
    },
    harm: { wave: 'pulse12', vol: 0.06, pan: 0.3, style: 'arp8', floor: 55 },
    bass: { wave: 'triangle', vol: 0.32, style: 'rootfifth' },
    drums: { vol: 0.35, pattern: rep('k...h...s...h..h', 15) + ' | k...h...s..hs.h.' },
  },

  // A minor, driving wild-encounter battle.
  battle: {
    bpm: 160, loop: true,
    chords: 'Am | Am | F | G | Am | Am | F | E | Dm | Dm | Am | Am | F | G | E | E',
    lead: {
      wave: 'pulse25', vol: 0.19, pan: -0.15, vibrato: true, notes: `
        A4:2 A4:1 A4:1 C5:2 E5:2 A5:4 G5:2 E5:2 | F5:2 E5:2 D5:2 C5:2 D5:4 E5:4 | F5:2 F5:1 F5:1 E5:2 C5:2 A4:4 C5:2 F5:2 | G5:6 F5:2 E5:2 D5:2 B4:4 |
        A4:2 A4:1 A4:1 C5:2 E5:2 A5:4 B5:2 C6:2 | B5:2 A5:2 G5:2 E5:2 A5:8 | A5:2 G5:2 F5:2 E5:2 F5:2 A5:2 C6:4 | B5:4 G#5:4 E5:4 B4:4 |
        D5:2 F5:2 A5:4 G5:2 F5:2 E5:2 D5:2 | E5:4 F5:4 A5:8 | C6:2 B5:2 A5:2 E5:2 C5:2 E5:2 A5:4 | G5:2 A5:2 G5:2 E5:2 D5:4 C5:4 |
        C5:2 D5:2 F5:4 A5:4 F5:4 | D5:2 G5:2 B5:4 D6:4 B5:4 | G#5:4 B5:4 E6:4 D6:2 B5:2 | G#5:8 E5:4 B4:4`,
    },
    harm: { wave: 'pulse12', vol: 0.06, pan: 0.3, style: 'arp16', floor: 57 },
    bass: { wave: 'triangle', vol: 0.36, style: 'octave' },
    drums: { vol: 0.55, pattern: rep('k.h.s.h.k.k.s.hh', 7) + ' | k.h.s.h.k.s.s.ss | ' + rep('k.h.s.hkk.h.s.hh', 7) + ' | k.s.s.s.ssssssss' },
  },

  // D minor, syncopated 3+3+2 rhythms for rival tamers.
  trainer: {
    bpm: 168, loop: true,
    chords: 'Dm | Bb | C | A | Dm | Bb | Gm | A | Bb | C | Dm | Dm | Gm | A | Dm | A7',
    lead: {
      wave: 'square', vol: 0.16, pan: -0.15, vibrato: true, notes: `
        D5:3 F5:3 A5:2 G5:2 F5:2 E5:2 F5:2 | D5:3 F5:3 Bb5:2 A5:4 F5:4 | E5:3 G5:3 C6:2 Bb5:2 A5:2 G5:4 | A5:6 C#5:2 E5:4 A5:4 |
        D6:3 A5:3 F5:2 D5:2 F5:2 A5:4 | Bb5:3 A5:3 G5:2 F5:4 D5:4 | G5:3 Bb5:3 D6:2 C6:2 Bb5:2 A5:2 G5:2 | A5:4 G5:2 F5:2 E5:4 C#5:4 |
        F5:2 F5:2 F5:2 D5:2 Bb4:4 D5:4 | G5:2 G5:2 G5:2 E5:2 C5:4 E5:4 | A5:3 G5:3 F5:2 E5:3 F5:3 D5:2 | D5:4 A4:2 D5:2 F5:4 A5:4 |
        Bb5:4 A5:2 G5:2 D5:4 G5:4 | C#6:4 Bb5:2 A5:2 E5:4 G5:4 | F5:2 E5:2 D5:2 F5:2 A5:4 D6:4 | C#6:4 A5:4 G5:4 E5:4`,
    },
    harm: { wave: 'pulse25', vol: 0.06, pan: 0.3, style: 'stab', floor: 62 },
    bass: { wave: 'triangle', vol: 0.38, style: 'gallop' },
    drums: { vol: 0.55, pattern: rep('k..k..s.k..k..s.', 3) + ' | k..k..s.k.s.ssss | ' + rep('k..kh.s.k..kh.sh', 11) + ' | ksksksksssssssss' },
  },

  // C minor, relentless: the final showdown.
  champion: {
    bpm: 178, loop: true,
    chords: 'Cm | Cm | Ab | Bb | Cm | Cm | Db | G | Fm | Ab | Cm | Cm | Ab | Bb | G | G7',
    lead: {
      wave: 'pulse12', vol: 0.2, pan: -0.15, vibrato: true, notes: `
        C5:1 C5:1 r:2 C5:1 C5:1 r:2 Eb5:2 G5:2 C6:4 | Bb5:2 G5:2 Ab5:2 G5:2 F5:2 Eb5:2 D5:2 Eb5:2 | C5:2 Eb5:2 Ab5:4 G5:2 Ab5:2 C6:4 | D6:4 C6:2 Bb5:2 F5:4 D5:4 |
        C5:1 C5:1 r:2 C5:1 C5:1 r:2 Eb5:2 G5:2 C6:4 | G5:2 C6:2 Eb6:4 D6:2 C6:2 B5:4 | Ab5:2 F5:2 Db5:2 F5:2 Ab5:4 Db6:4 | B5:4 D6:4 G6:4 F6:2 D6:2 |
        C6:4 Ab5:2 F5:2 Ab5:4 C6:4 | Eb6:4 C6:2 Ab5:2 Eb5:4 C5:4 | G5:6 F5:2 Eb5:4 D5:4 | Eb5:4 F5:2 G5:2 C6:8 |
        Ab5:2 Bb5:2 C6:2 Eb6:2 D6:4 C6:4 | Bb5:2 C6:2 D6:2 F6:2 Eb6:4 D6:4 | D6:2 B5:2 G5:2 B5:2 D6:2 F6:2 Ab6:4 | G6:4 F6:2 D6:2 B5:4 G5:4`,
    },
    harm: { wave: 'pulse25', vol: 0.06, pan: 0.3, style: 'arp16', floor: 60 },
    bass: { wave: 'triangle', vol: 0.38, style: 'pulse' },
    drums: { vol: 0.6, pattern: rep('k.hks.hkk.hks.hk', 7) + ' | k.s.s.s.ssssssss | ' + rep('khhkshhkkhhkshhk', 7) + ' | c...c...ssssssss' },
  },

  // C major fanfare after a win. Does not loop.
  victory: {
    bpm: 140, loop: false,
    chords: 'C | F | F:8 G:8 | C',
    lead: { wave: 'pulse25', vol: 0.22, vibrato: true, notes: 'C5:2 E5:2 G5:2 C6:6 G5:2 C6:2 | A5:2 F5:2 A5:2 C6:4 B5:2 A5:2 G5:2 | F5:2 A5:2 C6:2 E6:4 D6:2 B5:2 G5:2 | C6:12 r:4' },
    harm: { wave: 'pulse12', vol: 0.08, pan: 0.3, notes: 'E4:2 G4:2 C5:2 E5:6 C5:2 E5:2 | F4:2 A4:2 C5:2 F5:4 E5:2 C5:2 E5:2 | A4:2 C5:2 F5:2 C5:4 B4:2 G4:2 B4:2 | E5:12 r:4' },
    bass: { wave: 'triangle', vol: 0.36, notes: 'C3:2 C3:2 G3:2 C4:6 G3:2 C3:2 | F3:2 F3:2 C4:2 F3:4 C3:2 F3:2 A3:2 | F3:2 F3:2 F3:2 F3:2 G3:2 G3:2 G3:2 G2:2 | C3:12 r:4' },
    drums: { vol: 0.5, pattern: 'k.h.s.h.k.h.s.h. | k.h.s.h.k.h.s.s. | k.s.k.s.k.s.ssss | c............... ' },
  },

  // Mysterious A minor, then bursting into A major as the change completes.
  evolution: {
    bpm: 100, loop: true,
    chords: 'Am | F | Dm | E7 | Am | F | Bdim | E7 | A | D | E | A | F#m | D | E | E',
    lead: {
      wave: 'pulse12', vol: 0.18, vibrato: true, notes: `
        E5:8 C5:4 B4:4 | A4:12 r:4 | F5:8 E5:4 D5:4 | G#4:12 r:4 |
        A5:8 G5:4 E5:4 | F5:4 E5:4 C5:8 | D5:4 F5:4 B5:8 | B5:4 G#5:4 E5:4 D5:4 |
        E5:2 A5:2 C#6:4 B5:2 A5:2 E5:4 | F#5:4 A5:4 D6:6 C#6:2 | B5:4 G#5:2 E5:2 B5:4 E6:4 | C#6:8 A5:4 E5:4 |
        A5:2 C#6:2 F#6:4 E6:2 C#6:2 A5:4 | F#6:4 E6:2 D6:2 A5:4 F#5:4 | G#5:2 B5:2 E6:4 D6:2 B5:2 G#5:4 | A5:8 r:8`,
    },
    harm: { wave: 'triangle', vol: 0.12, pan: 0.25, style: 'arp8', floor: 57 },
    bass: { wave: 'triangle', vol: 0.34, style: 'long' },
    drums: { vol: 0.4, pattern: rep('........h.......', 4) + ' | ' + rep('t.......t...h...', 3) + ' | t...t...t.t.tttt | ' + rep('k...h.h.s...h.h.', 7) + ' | k.s.s.s.ssssssss' },
  },

  // F major, a proud march for the tournament hall.
  arena: {
    bpm: 124, loop: true,
    chords: 'F | C | Dm | Bb | F | C | Bb | C | Dm | Am | Bb | F | Gm | C | F | C7',
    lead: {
      wave: 'pulse25', vol: 0.19, pan: -0.1, vibrato: true, notes: `
        C5:4 F5:2 G5:2 A5:4 F5:4 | G5:4 E5:2 F5:2 G5:4 C5:4 | D5:2 E5:2 F5:4 A5:4 D6:4 | C6:4 Bb5:2 A5:2 G5:4 F5:4 |
        A5:4 C6:2 A5:2 F5:4 A5:4 | G5:2 A5:2 G5:2 E5:2 C5:8 | D5:2 F5:2 Bb5:4 A5:2 G5:2 F5:4 | E5:8 G5:4 C5:4 |
        F5:4 E5:2 D5:2 A5:8 | C6:4 Bb5:2 A5:2 E5:8 | D6:4 C6:2 Bb5:2 F5:4 D5:4 | C5:4 F5:4 A5:8 |
        Bb5:4 A5:2 G5:2 D5:4 G5:4 | E5:2 G5:2 C6:4 Bb5:4 G5:4 | A5:4 F5:2 G5:2 A5:2 C6:2 F6:4 | E6:4 C6:4 Bb5:4 G5:4`,
    },
    harm: { wave: 'pulse12', vol: 0.07, pan: 0.3, style: 'stab', floor: 60 },
    bass: { wave: 'triangle', vol: 0.34, style: 'walk' },
    drums: { vol: 0.45, pattern: rep('k...s.s.k...s...', 7) + ' | k...s.s.k.s.ssss | ' + rep('k...s.s.k.k.s...', 7) + ' | k.k.s.s.ssssc...' },
  },
};
