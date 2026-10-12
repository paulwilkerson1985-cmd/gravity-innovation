import { describe, expect, it } from 'vitest';
import { MOVES } from '../src/data/moves';
import { ROUTES } from '../src/data/routes';
import { SPECIES } from '../src/data/species';
import { TRAINERS } from '../src/data/trainers';
import {
  createBattle, getTrainer, routeUnlocked, trainerParty, trainerSide, validateContent, chooseAction, resolveTurn,
} from '../src/engine';
import { bc } from './helpers';

const route = (id: string) => ROUTES.find((r) => r.id === id)!;
const onRoute = (id: string) => TRAINERS.filter((t) => t.routeId === id);

describe('trainers', () => {
  it('content validates', () => {
    expect(validateContent(SPECIES, MOVES, ROUTES, TRAINERS)).toEqual([]);
  });

  it('has the required roster per route', () => {
    expect(onRoute('meadow')).toHaveLength(1);
    expect(onRoute('ridge')).toHaveLength(2);
    expect(onRoute('coast')).toHaveLength(2);
    expect(onRoute('plateau')).toHaveLength(1);
    const pim = onRoute('meadow')[0]!;
    expect(pim.ai).toBe('rookie');
    expect(pim.party).toHaveLength(3); // one Terra, Spark and Gale kin: every starter has one bad matchup
    for (const p of pim.party) expect(p.level >= 3 && p.level <= 5).toBe(true);
    for (const t of onRoute('ridge')) {
      expect(t.ai).toBe('skilled');
      for (const p of t.party) expect(p.level >= 11 && p.level <= 15).toBe(true);
    }
    for (const t of onRoute('coast')) {
      expect(['skilled', 'ace']).toContain(t.ai);
      for (const p of t.party) expect(p.level >= 18 && p.level <= 23).toBe(true);
    }
    const champ = onRoute('plateau')[0]!;
    expect(champ.ai).toBe('ace');
    expect(champ.title).toBe('Champion');
    expect(champ.party).toHaveLength(6);
    for (const p of champ.party) expect(p.level >= 21 && p.level <= 26).toBe(true);
    // The Champion tops every other trainer and the plateau signpost matches its party.
    const top = (t: typeof champ) => Math.max(...t.party.map((p) => p.level));
    for (const t of TRAINERS) if (t !== champ) expect(top(champ)).toBeGreaterThan(top(t));
    expect(route('plateau').levelRange).toEqual([Math.min(...champ.party.map((p) => p.level)), top(champ)]);
    const types = new Set(champ.party.flatMap((p) => SPECIES.find((s) => s.id === p.species)!.types));
    expect(types.size).toBeGreaterThanOrEqual(5);
    expect(route('plateau').theme).toBe('summit');
    expect(route('plateau').hotspots.every((h) => h.kind === 'trainer')).toBe(true);
  });

  it('routes unlock in order', () => {
    const ids = (r: string) => onRoute(r).map((t) => t.id).sort();
    expect(route('meadow').unlockAfter ?? []).toEqual([]);
    expect([...route('ridge').unlockAfter!].sort()).toEqual(ids('meadow'));
    expect([...route('coast').unlockAfter!].sort()).toEqual(ids('ridge'));
    expect([...route('plateau').unlockAfter!].sort()).toEqual(ids('coast'));
    expect(routeUnlocked(route('coast').unlockAfter, ['hiker-brann'])).toBe(false);
    expect(routeUnlocked(route('coast').unlockAfter, ['hiker-brann', 'adept-sola'])).toBe(true);
    expect(routeUnlocked(undefined, [])).toBe(true);
  });

  it('validation catches broken trainers and routes', () => {
    const t = structuredClone(TRAINERS);
    t[0]!.party.push({ species: 'nope', level: 5 });
    t[1]!.party[2]!.moves = ['landslide']; // cragmaul L14 cannot know landslide (L24)
    t[2]!.party[0]!.level = 31;
    t[3]!.party = [];
    const r = structuredClone(ROUTES);
    r[1]!.unlockAfter = ['ghost'];
    r[0]!.hotspots.push({ id: 'x', kind: 'trainer', label: 'x', trainer: 'missing', table: [] });
    const errs = validateContent(SPECIES, MOVES, r, t);
    for (const frag of ['unknown species nope', 'cannot know landslide', 'bad level 31', 'party must have 1–6', 'unlockAfter unknown trainer ghost', 'unknown trainer missing']) {
      expect(errs.some((e) => e.includes(frag))).toBe(true);
    }
    const tooBig = structuredClone(TRAINERS);
    tooBig[5]!.party.push({ species: 'breezel', level: 20 });
    expect(validateContent(SPECIES, MOVES, ROUTES, tooBig).some((e) => e.includes('1–6'))).toBe(true);
  });

  it('getTrainer / trainerSide build a battle-ready side', () => {
    expect(getTrainer('champion-vale').name).toBe('Vale');
    expect(() => getTrainer('nobody')).toThrow();
    const party = trainerParty('champion-vale');
    expect(party).toHaveLength(6);
    expect(party[5]!.moves.map((m) => m.id)).toEqual(['breaker-crush', 'riptide-slam', 'brine-mist', 'stare-down']);
    expect(party.every((c) => c.hp === c.stats.hp)).toBe(true);
    const side = trainerSide('rider-tavi');
    expect(side.ai).toBe('ace');
    const { state } = createBattle('trainer', 9, { name: 'You', controller: 'human', party: [bc('pyrelord', 30, 'me')] }, side);
    let s = state;
    for (let i = 0; i < 400 && s.phase !== 'over'; i++) {
      const mine = s.phase === 'replace' ? { type: 'pass' as const } : { type: 'move' as const, index: 3 };
      s = resolveTurn(s, [mine, chooseAction(s, 1, 'ace')]).state;
    }
    expect(s.phase).toBe('over');
  });
});
