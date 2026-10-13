// The Ember Ridge cave/quarry arena (builder in ../arena.ts): the fallback for every `cave`
// hotspot and every Ember Ridge battle that no more specific arena claims.
import { buildCaveArena } from '../arena';
import { warmCaveGrade, type Grade } from '../pipeline';
import type { ArenaDef } from './index';

/**
 * The cave's own grade, on top of the shared warm cave grade: brighter exposure for the lit
 * shelves, earthier saturation, a light, wide vignette (the corners stay readable), and a softer
 * tilt-shift band that starts a little lower so the far tiers recede.
 */
export function caveGrade(): Grade {
  return { ...warmCaveGrade(), exposure: 1.2, saturation: 0.8, vignette: 0.18, vignetteSoft: 0.7, tiltTop: 1.8, focusTop: 0.72 };
}

export const ARENA: ArenaDef = {
  id: 'cave',
  label: 'Quarry cave',
  match: [{ kind: 'cave' }, { route: 'ridge' }],
  build: (o) => buildCaveArena({ seed: o.seed, quality: o.quality }),
  grade: caveGrade,
  background: '#120a07',
  // A warm mid-haze: far tiers lift into dusty air instead of sinking to black.
  fog: '#5a3a24',
  fogRange: [0, 18],
};
