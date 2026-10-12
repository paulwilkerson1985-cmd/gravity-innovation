import { describe, expect, it } from 'vitest';
import { ITEMS, ITEM_IDS } from '../src/data/items';
import {
  active, calcStats, createBattle, isLegal, itemHasEffect, legalActions, makeCreature, resolveTurn,
  useItemOnCreature, IllegalActionError, type BattleEvent,
} from '../src/engine';
import { battle, bc } from './helpers';

const kinds = (es: BattleEvent[]) => es.map((e) => e.t);

describe('items', () => {
  it('have original names, prices and blurbs', () => {
    expect(ITEM_IDS).toEqual(['tonic', 'mega-tonic', 'full-tonic', 'remedy', 'revive-seed']);
    for (const id of ITEM_IDS) {
      const it = ITEMS[id];
      expect(it.id).toBe(id);
      expect(it.name.length).toBeGreaterThan(2);
      expect(it.price).toBeGreaterThan(0);
      expect(it.blurb.length).toBeGreaterThan(5);
      expect(it.name).not.toMatch(/potion|revive|full heal|antidote|max /i);
    }
  });

  it('out of battle: heal amounts, cure, revive, and no-effect errors', () => {
    const c = makeCreature('cragmaul', 25, 'c');
    const max = calcStats('cragmaul', 25).hp;
    expect(itemHasEffect(c, 'tonic')).toBe(false);
    expect(() => useItemOnCreature(c, 'tonic')).toThrow();
    const hurt = { ...c, hp: 10 };
    expect(useItemOnCreature(hurt, 'tonic').hp).toBe(30);
    expect(useItemOnCreature(hurt, 'mega-tonic').hp).toBe(Math.min(max, 70));
    expect(useItemOnCreature(hurt, 'full-tonic').hp).toBe(max);
    expect(useItemOnCreature({ ...c, hp: max - 5 }, 'tonic').hp).toBe(max);
    expect(itemHasEffect(hurt, 'remedy')).toBe(false);
    const burnt = { ...c, status: 'burn' as const };
    expect(useItemOnCreature(burnt, 'remedy').status).toBeNull();
    const down = { ...c, hp: 0, status: 'shock' as const };
    expect(itemHasEffect(down, 'tonic')).toBe(false);
    expect(itemHasEffect(down, 'remedy')).toBe(false);
    expect(itemHasEffect(c, 'revive-seed')).toBe(false);
    const up = useItemOnCreature(down, 'revive-seed');
    expect(up.hp).toBe(Math.floor(max / 2));
    expect(up.status).toBeNull();
    expect(down.hp).toBe(0); // not mutated
  });

  it('rules default per kind and can be overridden', () => {
    const w = battle('wild', 1, [bc('ashkit', 10)], [bc('breezel', 3)]).state;
    const t = battle('trainer', 1, [bc('ashkit', 10)], [bc('breezel', 3)]).state;
    const p = battle('pvp', 1, [bc('ashkit', 10)], [bc('breezel', 3)]).state;
    expect(w.rules).toEqual({ items: true, catch: true, run: true });
    expect(t.rules).toEqual({ items: true, catch: false, run: false });
    expect(p.rules).toEqual({ items: false, catch: false, run: false });
    const noCatch = createBattle('wild', 1, { name: 'A', controller: 'human', party: [bc('ashkit', 10)] },
      { name: 'W', controller: 'ai', isWild: true, party: [bc('breezel', 3)] }, { rules: { catch: false, items: false } });
    expect(noCatch.state.rules).toEqual({ items: false, catch: false, run: true });
    const types = new Set(legalActions(noCatch.state, 0).map((a) => a.type));
    expect(types.has('catch')).toBe(false);
    expect(types.has('run')).toBe(true);
  });

  it('item legality: only when it has an effect, human sides only, not in pvp', () => {
    const a = bc('cragmaul', 25, 'a');
    const b = bc('breezel', 20, 'b');
    const f = bc('pebblet', 20, 'f');
    b.hp = 0;
    const { state } = battle('trainer', 1, [a, b], [f]);
    expect(isLegal(state, 0, { type: 'item', item: 'tonic', target: 0 })).toBe(false); // full HP
    expect(isLegal(state, 0, { type: 'item', item: 'tonic', target: 1 })).toBe(false); // fainted
    expect(isLegal(state, 0, { type: 'item', item: 'revive-seed', target: 1 })).toBe(true);
    expect(isLegal(state, 0, { type: 'item', item: 'revive-seed', target: 0 })).toBe(false);
    expect(isLegal(state, 0, { type: 'item', item: 'remedy', target: 0 })).toBe(false);
    expect(isLegal(state, 0, { type: 'item', item: 'revive-seed', target: 5 })).toBe(false);
    expect(isLegal(state, 1, { type: 'item', item: 'revive-seed', target: 0 })).toBe(false); // AI side
    const pvp = battle('pvp', 1, [structuredClone(a), structuredClone(b)], [f]).state;
    expect(legalActions(pvp, 0).some((x) => x.type === 'item')).toBe(false);
    expect(() => resolveTurn(pvp, [{ type: 'item', item: 'revive-seed', target: 1 }, { type: 'move', index: 0 }])).toThrow(IllegalActionError);
  });

  it('in battle: item acts before switches and moves and emits item + effect events', () => {
    const a = bc('cragmaul', 25, 'a');
    a.hp = 10;
    a.status = 'drowsy';
    a.sleepTurns = 3;
    const fainted = bc('breezel', 20, 'b');
    fainted.hp = 0;
    const foe = bc('cyclonyx', 25, 'f', ['quick-jab']);
    const { state } = battle('trainer', 4, [a, fainted], [foe]);
    const r = resolveTurn(state, [{ type: 'item', item: 'mega-tonic', target: 0 }, { type: 'move', index: 0 }]);
    expect(kinds(r.events).slice(0, 3)).toEqual(['turn', 'item', 'heal']);
    const heal = r.events[2]!;
    expect(heal.t === 'heal' && heal.amount === 60 && heal.slot === 0).toBe(true);
    const ev = r.events[1]!;
    expect(ev).toEqual({ t: 'item', side: 0, item: 'mega-tonic', itemName: 'Mega Tonic', target: 0, name: 'Cragmaul' });

    const r2 = resolveTurn(state, [{ type: 'item', item: 'remedy', target: 0 }, { type: 'move', index: 0 }]);
    expect(r2.events[2]).toEqual({ t: 'cure', side: 0, slot: 0, name: 'Cragmaul', status: 'drowsy' });
    expect(r2.state.sides[0].party[0]!.status).toBeNull();
    expect(r2.state.sides[0].party[0]!.sleepTurns).toBe(0);

    const r3 = resolveTurn(state, [{ type: 'item', item: 'revive-seed', target: 1 }, { type: 'move', index: 0 }]);
    const half = Math.floor(fainted.stats.hp / 2);
    expect(r3.events[2]).toEqual({ t: 'revive', side: 0, slot: 1, name: 'Breezel', hp: half, maxHp: fainted.stats.hp });
    expect(r3.state.sides[0].party[1]!.hp).toBe(half);
    expect(active(r3.state, 0).uid).toBe('a');
    // Revived creature can now be switched in.
    if (r3.state.phase === 'choose') expect(isLegal(r3.state, 0, { type: 'switch', to: 1 })).toBe(true);
  });

  it('items are usable in wild battles but the wild side never gets them', () => {
    const a = bc('ashkit', 10, 'a');
    a.hp = 3;
    const { state } = battle('wild', 1, [a], [bc('breezel', 3)]);
    expect(legalActions(state, 0)).toContainEqual({ type: 'item', item: 'tonic', target: 0 });
    expect(legalActions(state, 1).some((x) => x.type === 'item')).toBe(false);
  });
});
