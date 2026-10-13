// Mossy Meadow flower field: the meadow set (meadow.ts) dressed with dense flower beds in
// varied colours, butterflies and drifting petals, a warm low afternoon sun from the back-right
// and a windmill on a low shelf at the back.
import { buildMeadowSet, meadowGrade } from './meadow';
import type { ArenaDef } from './index';

export const ARENA: ArenaDef = {
  id: 'flowers',
  label: 'Flower field',
  match: [{ route: 'meadow', hotspot: 'flower-patch' }],
  build: (o) => buildMeadowSet(o, 'flowers'),
  grade: () => meadowGrade(true),
  background: '#f2c99a',
  fog: '#e8c8a0',
  fogRange: [10, 40],
};
