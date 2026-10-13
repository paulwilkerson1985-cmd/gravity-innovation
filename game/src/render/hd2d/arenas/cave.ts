// The Ember Ridge cave/quarry arena (builder in ../arena.ts): the fallback for every `cave`
// hotspot and every Ember Ridge battle that no more specific arena claims.
import { buildCaveArena } from '../arena';
import { warmCaveGrade } from '../pipeline';
import type { ArenaDef } from './index';

export const ARENA: ArenaDef = {
  id: 'cave',
  label: 'Quarry cave',
  match: [{ kind: 'cave' }, { route: 'ridge' }],
  build: (o) => buildCaveArena({ seed: o.seed, quality: o.quality }),
  grade: warmCaveGrade,
  background: '#120a07',
  fog: '#2a160d',
};
