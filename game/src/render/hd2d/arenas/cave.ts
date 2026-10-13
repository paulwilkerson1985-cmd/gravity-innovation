// The Ember Ridge cave/quarry arena (builder in ../arena.ts): the fallback for every `cave`
// hotspot and every Ember Ridge battle that no more specific arena claims.
import { buildCaveArena } from '../arena';
import { warmCaveGrade, type Grade } from '../pipeline';
import type { ArenaDef } from './index';

/**
 * The cave's own grade, on top of the shared warm cave grade: brighter exposure for the lit
 * shelves, earthier saturation, a light, wide vignette (the corners stay readable), and only a
 * whisper of top tilt-shift so the lodge shelves and windows stay crisp.
 */
export function caveGrade(): Grade {
  return { ...warmCaveGrade(), exposure: 1.18, saturation: 0.84, vignette: 0.16, vignetteSoft: 0.7, tiltTop: 0.45, focusTop: 0.88 };
}

export const ARENA: ArenaDef = {
  id: 'cave',
  label: 'Quarry cave',
  match: [{ kind: 'cave' }, { route: 'ridge' }],
  build: (o) => buildCaveArena({ seed: o.seed, quality: o.quality }),
  grade: caveGrade,
  background: '#120a07',
  // A faint warm haze far back only: the lodge and the window wall stay crisp and readable.
  fog: '#5a3a24',
  fogRange: [8, 34],
  // A higher, pulled-back camera: the floor reads as a wide open stage (≈ 35–40% of the frame),
  // the lodge platform and its stair sit whole in the upper right, the windows at the top left.
  camera: {
    wide: { elev: 0.72, person: 0.17 },
    land: { elev: 0.8, person: 0.13 },
    portrait: { elev: 0.6 },
  },
};
