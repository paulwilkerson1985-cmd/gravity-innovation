import { describe, expect, it } from 'vitest';
import { RENTALS } from '../src/data/rentals';
import {
  ARENA_LEVEL, ARENA_TEAM_SIZE, arenaCreature, calcStats, chooseAction, createArenaBattle, fromOwned, isLegal,
  legalActions, makeCreature, resolveTurn, species, validateArenaEntry, validateArenaTeam, type ArenaEntry,
} from '../src/engine';

const rental = (id: string, uid: string): ArenaEntry => {
  const r = RENTALS.find((x) => x.id === id)!;
  return { species: r.species, moves: [...r.moves], uid };
};

describe('arena', () => {
  it('has 12 valid, varied rentals including fully evolved forms', () => {
    expect(RENTALS).toHaveLength(12);
    expect(new Set(RENTALS.map((r) => r.id)).size).toBe(12);
    expect(new Set(RENTALS.map((r) => r.species)).size).toBe(12);
    for (const r of RENTALS) expect(validateArenaEntry({ species: r.species, moves: r.moves, uid: r.id })).toEqual([]);
    const types = new Set(RENTALS.flatMap((r) => species(r.species).types));
    expect(types.size).toBe(6);
    expect(RENTALS.filter((r) => !species(r.species).evolvesTo).length).toBeGreaterThanOrEqual(6);
  });

  it('arenaCreature is level 30 at full HP/PP', () => {
    const c = arenaCreature({ species: 'pyrelord', moves: ['pyre-crash', 'bump'], uid: 'u', nickname: 'Blaze' });
    expect(c.level).toBe(ARENA_LEVEL);
    expect(c.hp).toBe(calcStats('pyrelord', 30).hp);
    expect(c.name).toBe('Blaze');
    expect(c.moves).toEqual([{ id: 'pyre-crash', pp: 5, maxPp: 5 }, { id: 'bump', pp: 35, maxPp: 35 }]);
  });

  it('validates teams', () => {
    const good = [rental('r-pyrelord', 'a'), rental('r-maelstrode', 'b'), rental('r-cyclonyx', 'c')];
    expect(validateArenaTeam(good)).toEqual([]);
    expect(validateArenaTeam(good.slice(0, 2))[0]).toMatch(/exactly 3/);
    expect(validateArenaTeam([...good, rental('r-stormoth', 'd')]).length).toBeGreaterThan(0);
    expect(validateArenaTeam([good[0]!, { ...good[0]!, uid: 'z' }, good[2]!]).some((e) => e.includes('duplicate species'))).toBe(true);
    const errs = (m: string[]) => validateArenaTeam([{ ...good[0]!, moves: m }, good[1]!, good[2]!]);
    expect(errs([])).not.toEqual([]);
    expect(errs(['bump', 'bump'])).not.toEqual([]);
    expect(errs(['bump', 'cinder-spit', 'quick-jab', 'battle-cry', 'pyre-crash'])).not.toEqual([]);
    expect(errs(['storm-lance']).some((e) => e.includes('cannot learn storm-lance'))).toBe(true);
    expect(validateArenaTeam([{ species: 'nope', moves: ['bump'], uid: 'q' }, good[1]!, good[2]!])).toContain('unknown species nope');
    expect(ARENA_TEAM_SIZE).toBe(3);
  });

  it('fromOwned keeps species, moves, nickname and uid', () => {
    const c = { ...makeCreature('ashkit', 12, 'c7'), nickname: 'Pip' };
    expect(fromOwned(c)).toEqual({ species: 'ashkit', moves: c.moves.map((m) => m.id), uid: 'c7', nickname: 'Pip' });
    expect(validateArenaEntry(fromOwned(c))).toEqual([]);
  });

  it('creates a pvp battle with no items/catch/run, both human, and plays to the end', () => {
    const a = [rental('r-pyrelord', 'x1'), rental('r-maelstrode', 'x2'), rental('r-cyclonyx', 'x3')];
    const b = [rental('r-verdantusk', 'x1'), rental('r-stormoth', 'x2'), rental('r-cragmaul', 'x3')];
    const { state, events } = createArenaBattle(42, 'Ana', a, 'Bo', b);
    expect(state.kind).toBe('pvp');
    expect(state.rules).toEqual({ items: false, catch: false, run: false });
    expect(state.sides.map((s) => s.controller)).toEqual(['human', 'human']);
    expect(events.filter((e) => e.t === 'send')).toHaveLength(2);
    expect(new Set(state.sides.flatMap((s) => s.party.map((c) => c.uid))).size).toBe(6);
    const types = new Set(legalActions(state, 0).map((x) => x.type));
    expect([...types].sort()).toEqual(['forfeit', 'move', 'switch']);
    expect(isLegal(state, 0, { type: 'run' })).toBe(false);
    let s = state;
    while (s.phase !== 'over') s = resolveTurn(s, [chooseAction(s, 0, 'ace'), chooseAction(s, 1, 'skilled')]).state;
    expect(s.outcome?.reason).toBe('ko');
    expect(() => createArenaBattle(1, 'A', a.slice(0, 2), 'B', b)).toThrow(/invalid/);
  });
});
