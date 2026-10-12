import { describe, expect, it } from 'vitest';
import { MOVES } from '../src/data/moves';
import { ROUTES } from '../src/data/routes';
import { SPECIES, STARTERS } from '../src/data/species';
import { ITEMS } from '../src/data/items';
import { TRAINERS } from '../src/data/trainers';
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
    const names = [
      ...SPECIES.map((s) => s.name), ...MOVES.map((m) => m.name), ...Object.values(ITEMS).map((i) => i.name),
      ...TRAINERS.flatMap((t) => [t.name, t.title, t.intro, t.defeat]),
    ];
    for (const n of names) expect(n).not.toMatch(banned);
  });
  it('creatures know at most 4 moves and starters begin with 2', () => {
    for (const s of SPECIES) for (let l = 1; l <= 30; l++) expect(movesAtLevel(s.id, l).length).toBeLessThanOrEqual(4);
    for (const st of STARTERS) expect(makeCreature(st, 5, 'x').moves).toHaveLength(2);
  });
  it('every non-starter species is found in the wild, with sensible level bands', () => {
    const starterLines = new Set<string>();
    for (const st of STARTERS) {
      let s = SPECIES.find((x) => x.id === st);
      while (s) { starterLines.add(s.id); s = s.evolvesTo ? SPECIES.find((x) => x.id === s!.evolvesTo!.species) : undefined; }
    }
    const wild = new Set(ROUTES.flatMap((r) => r.hotspots.flatMap((h) => h.table.map((t) => t.species))));
    for (const s of SPECIES) expect(wild.has(s.id), s.id).toBe(!starterLines.has(s.id)); // starter lines stay starter-only
    for (const r of ROUTES) for (const h of r.hotspots) {
      const total = h.table.reduce((n, t) => n + t.weight, 0);
      for (const t of h.table) {
        // Bands sit inside the route's signpost (rare/evolved kin may run up to 2 levels above it).
        expect(t.min, `${r.id}/${h.id}/${t.species}`).toBeGreaterThanOrEqual(r.levelRange[0]);
        expect(t.max, `${r.id}/${h.id}/${t.species}`).toBeLessThanOrEqual(r.levelRange[1] + 2);
        // A wild kin below its own evolution level is never already evolved.
        const pre = SPECIES.find((x) => x.evolvesTo?.species === t.species);
        if (pre) expect(t.min, `${t.species} below its evolution level`).toBeGreaterThanOrEqual(pre.evolvesTo!.level);
        if (t.species === 'petalwisp' || t.species === 'vulcrag' || t.species === 'surgeray') expect(t.weight / total).toBeLessThanOrEqual(0.15);
      }
    }
  });
  it('no move strictly dominates another of the same type and category', () => {
    type M = (typeof MOVES)[number];
    const good = (m: M) => (m.effect && m.effect.kind !== 'recoil' ? m.effect : null);
    const effectAtLeast = (a: M, b: M) => {
      if (a.effect?.kind === 'recoil' && b.effect?.kind !== 'recoil') return false;
      const eb = good(b);
      if (!eb) return true;
      const ea = good(a);
      return !!ea && JSON.stringify({ ...ea, chance: 0 }) === JSON.stringify({ ...eb, chance: 0 })
        && ('chance' in ea ? ea.chance : 1) >= ('chance' in eb ? eb.chance : 1);
    };
    const keys = ['power', 'accuracy', 'pp', 'priority'] as const;
    for (const a of MOVES) for (const b of MOVES) {
      if (a === b || a.type !== b.type || a.category !== b.category) continue;
      const notWorse = keys.every((k) => a[k] >= b[k]) && effectAtLeast(a, b);
      const better = keys.some((k) => a[k] > b[k]) || JSON.stringify(a.effect) !== JSON.stringify(b.effect);
      expect(notWorse && better, `${a.id} dominates ${b.id}`).toBe(false);
    }
  });
  it('stats grow with level', () => {
    const a = calcStats('ashkit', 5);
    const b = calcStats('ashkit', 30);
    for (const k of ['hp', 'atk', 'def', 'spe'] as const) expect(b[k]).toBeGreaterThan(a[k]);
  });
});
