import { describe, expect, it } from 'vitest';
import { evolutionChain, habitatsOf } from '../src/scenes/bestiary';

describe('bestiary derivations', () => {
  it('evolution chains include levels from any stage', () => {
    expect(evolutionChain('cindertail')).toEqual([{ id: 'ashkit' }, { id: 'cindertail', level: 14 }, { id: 'pyrelord', level: 26 }]);
    expect(evolutionChain('petalwisp')).toEqual([{ id: 'petalwisp' }]);
  });
  it('habitats come from route encounter tables', () => {
    const h = habitatsOf('breezel');
    expect(h.length).toBeGreaterThan(2);
    expect(h[0]).toMatchObject({ route: 'Mossy Meadow', spot: 'Tall grass', min: 2, max: 5, rarity: 'Common' });
    expect(habitatsOf('ashkit')).toEqual([]);
    expect(habitatsOf('petalwisp').some((x) => x.rarity === 'Rare')).toBe(true);
  });
});
