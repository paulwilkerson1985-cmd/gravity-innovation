import { describe, expect, it } from 'vitest';
import {
  LEVEL_CAP, awardXp, calcStats, canEvolveNow, evolve, gainXp, learnMove, makeCreature, resolveTurn,
  xpForLevel, xpYieldFor, species, active, type ProgressEvent,
} from '../src/engine';
import { battle, bc } from './helpers';

describe('progression', () => {
  it('xpYieldFor follows the formula with a 1.5× trainer bonus', () => {
    const y = species('breezel').xpYield;
    expect(xpYieldFor('breezel', 7, false)).toBe(Math.floor((y * 7) / 7));
    expect(xpYieldFor('breezel', 10, true)).toBe(Math.floor(((y * 10) / 7) * 1.5));
  });

  it('Ashkit at L13 levels to 14 and becomes ready to evolve into Cindertail', () => {
    const c = makeCreature('ashkit', 13, 'a1');
    const need = xpForLevel(14) - c.xp;
    const { creature, events } = gainXp(c, need);
    expect(creature.level).toBe(14);
    expect(events.map((e) => e.t)).toEqual(['xp', 'levelUp', 'canEvolve']);
    const evo = events.find((e): e is Extract<ProgressEvent, { t: 'canEvolve' }> => e.t === 'canEvolve')!;
    expect(evo.into).toBe('cindertail');
    expect(canEvolveNow(creature)).toBe(true);
    expect(c.level).toBe(13); // input untouched

    const hurt = { ...creature, hp: creature.hp - 10, nickname: 'Sparky' };
    const ev = evolve(hurt);
    expect(ev.species).toBe('cindertail');
    expect(ev.nickname).toBe('Sparky');
    expect(ev.moves).toEqual(hurt.moves);
    expect(ev.xp).toBe(hurt.xp);
    const before = calcStats('ashkit', 14);
    const after = calcStats('cindertail', 14);
    for (const k of ['hp', 'atk', 'def', 'spe'] as const) expect(after[k]).toBeGreaterThan(before[k]);
    expect(ev.hp).toBe(hurt.hp + (after.hp - before.hp));
    expect(() => evolve(makeCreature('ashkit', 10, 'x'))).toThrow();
    expect(() => evolve(makeCreature('pyrelord', 30, 'x'))).toThrow();
  });

  it('level ups raise current HP by the max-HP delta and auto-learn moves when < 4 known', () => {
    const c = makeCreature('ashkit', 6, 'a');
    expect(c.moves).toHaveLength(2);
    const hurt = { ...c, hp: 5 };
    const { creature, events } = gainXp(hurt, xpForLevel(7) - c.xp);
    const d = calcStats('ashkit', 7).hp - calcStats('ashkit', 6).hp;
    expect(creature.hp).toBe(5 + d);
    expect(events).toContainEqual(expect.objectContaining({ t: 'learned', move: 'battle-cry' }));
    expect(creature.moves.map((m) => m.id)).toContain('battle-cry');
  });

  it('offers (does not learn) a move when 4 are known; learnMove replaces or skips', () => {
    const c = makeCreature('ashkit', 15, 'a');
    expect(c.moves).toHaveLength(4);
    const { creature, events } = gainXp(c, xpForLevel(16) - c.xp);
    expect(events).toContainEqual(expect.objectContaining({ t: 'moveOffer', move: 'smolder-cloud' }));
    expect(creature.moves.map((m) => m.id)).not.toContain('smolder-cloud');
    const skipped = learnMove(creature, 'smolder-cloud', null);
    expect(skipped).toEqual(creature);
    const learned = learnMove(creature, 'smolder-cloud', 0);
    expect(learned.moves[0]).toEqual({ id: 'smolder-cloud', pp: 15 });
    expect(learned.moves).toHaveLength(4);
    expect(() => learnMove(creature, 'pyre-crash', 0)).toThrow(); // not yet learnable
    expect(() => learnMove(learned, 'smolder-cloud', 1)).toThrow(); // already known
  });

  it('caps at level 30 and stops XP at xpForLevel(30)', () => {
    const c = makeCreature('breezel', 28, 'b');
    const { creature, events } = gainXp(c, 10_000_000);
    expect(creature.level).toBe(LEVEL_CAP);
    expect(creature.xp).toBe(xpForLevel(LEVEL_CAP));
    expect(events.filter((e) => e.t === 'levelUp')).toHaveLength(2);
    const again = gainXp(creature, 500);
    expect(again.creature.xp).toBe(xpForLevel(LEVEL_CAP));
    expect(again.events).toEqual([expect.objectContaining({ t: 'xp', amount: 0 })]);
  });

  it('multi-level gains emit one levelUp per level', () => {
    const c = makeCreature('pebblet', 5, 'p');
    const { creature, events } = gainXp(c, xpForLevel(9) - c.xp + 3);
    expect(creature.level).toBe(9);
    expect(events.filter((e) => e.t === 'levelUp').map((e) => e.t === 'levelUp' && e.level)).toEqual([6, 7, 8, 9]);
  });

  it('XP is split among conscious participants of each fainted foe', () => {
    const a = bc('cragmaul', 30, 'A1');
    const b = bc('cyclonyx', 30, 'A2', ['bump', 'cyclone-slam']);
    const foe = bc('breezel', 10, 'F1');
    const { state } = battle('trainer', 3, [a, b], [foe]);
    // Turn 1: switch to A2 (foe acts), turn 2: A2 KOs.
    let s = resolveTurn(state, [{ type: 'switch', to: 1 }, { type: 'move', index: 0 }]).state;
    expect(s.participants.F1).toEqual(['A1', 'A2']);
    while (s.phase !== 'over') s = resolveTurn(s, [{ type: 'move', index: 1 }, { type: 'move', index: 0 }]).state;
    expect(s.outcome?.winner).toBe(0);
    const total = xpYieldFor('breezel', 10, true);
    expect(awardXp(s)).toEqual({ A1: Math.floor(total / 2), A2: Math.floor(total / 2) });

    // A fainted participant gets nothing; the survivor gets it all.
    const s2 = structuredClone(s);
    s2.sides[0].party[0]!.hp = 0;
    expect(awardXp(s2)).toEqual({ A2: total });
    // Wild foes give the plain yield.
    const w = battle('wild', 3, [bc('pyrelord', 30, 'W1')], [bc('breezel', 10, 'F2')]);
    let ws = w.state;
    while (ws.phase !== 'over') ws = resolveTurn(ws, [{ type: 'move', index: 3 }, { type: 'move', index: 0 }]).state;
    expect(active(ws, 1).hp).toBe(0);
    expect(awardXp(ws)).toEqual({ W1: xpYieldFor('breezel', 10, false) });
  });

  it('participants are recorded on replacement sends', () => {
    const { state } = battle('trainer', 2, [bc('pyrelord', 30, 'P')], [bc('mossling', 2, 'm1'), bc('breezel', 2, 'b1')]);
    const r = resolveTurn(state, [{ type: 'move', index: 3 }, { type: 'move', index: 0 }]);
    const r2 = resolveTurn(r.state, [{ type: 'pass' }, { type: 'switch', to: 1 }]);
    expect(r2.state.participants).toEqual({ m1: ['P'], b1: ['P'] });
  });
});
