import { describe, expect, it } from 'vitest';
import { MOVES } from '../src/data/moves';
import { ROUTES } from '../src/data/routes';
import { SPECIES, STARTERS } from '../src/data/species';
import { ELEMENTS, getDex, validateContent, movesAtLevel, makeCreature, calcStats } from '../src/engine';

describe('content', () => {
  it('passes schema validation', () => {
    expect(validateContent(SPECIES, MOVES, ROUTES)).toEqual([]);
    expect(() => getDex()).not.toThrow();
  });
  it('validation catches broken data', () => {
    const bad = structuredClone(SPECIES);
    bad[0]!.learnset.push([5, 'no-such-move']);
    bad[1]!.types = [];
    expect(validateContent(bad, MOVES, ROUTES).length).toBeGreaterThanOrEqual(2);
  });
  it('has 15–18 species and the required line structure', () => {
    expect(SPECIES.length).toBeGreaterThanOrEqual(15);
    expect(SPECIES.length).toBeLessThanOrEqual(18);
    const lineLength = (id: string) => {
      let n = 1;
      let s = SPECIES.find((x) => x.id === id)!;
      while (s.evolvesTo) { n++; s = SPECIES.find((x) => x.id === s.evolvesTo!.species)!; }
      return n;
    };
    for (const st of STARTERS) expect(lineLength(st)).toBe(3);
    expect(['flickwing', 'pebblet', 'breezel'].map(lineLength)).toEqual([2, 2, 2]);
    expect(SPECIES.filter((s) => s.types.length === 2).length).toBeGreaterThanOrEqual(1);
  });
  it('has 4 moves per type plus 6 Neutral', () => {
    for (const t of ELEMENTS) expect(MOVES.filter((m) => m.type === t)).toHaveLength(4);
    expect(MOVES.filter((m) => m.type === 'Neutral')).toHaveLength(6);
  });
  it('uses no franchise names', () => {
    const banned = /pok[eé]|ball|pikachu|charmander|squirtle|bulbasaur|tackle|ember\b|growl|harden|thunderbolt|flamethrower|surf\b|gust\b|razor leaf|hydro pump|earthquake|rock slide|quick attack|struggle|recover|sleep powder|thunder wave|will-o/i;
    const names = [...SPECIES.map((s) => s.name), ...MOVES.map((m) => m.name)];
    for (const n of names) expect(n).not.toMatch(banned);
  });
  it('creatures know at most 4 moves and starters begin with 2', () => {
    for (const s of SPECIES) for (let l = 1; l <= 30; l++) expect(movesAtLevel(s.id, l).length).toBeLessThanOrEqual(4);
    for (const st of STARTERS) expect(makeCreature(st, 5, 'x').moves).toHaveLength(2);
  });
  it('stats grow with level', () => {
    const a = calcStats('ashkit', 5);
    const b = calcStats('ashkit', 30);
    for (const k of ['hp', 'atk', 'def', 'spe'] as const) expect(b[k]).toBeGreaterThan(a[k]);
  });
});
