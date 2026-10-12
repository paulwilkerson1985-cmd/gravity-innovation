import { describe, expect, it } from 'vitest';
import { applyBattleResult, chooseStarter, healParty, newPlayer, startWildBattle, useOrb } from '../src/game/state';
import { resolveTurn } from '../src/engine';

describe('player state', () => {
  it('starter → wild encounter → catch adds to party and bestiary', () => {
    let p = chooseStarter(newPlayer(42), 'ashkit');
    expect(p.party).toHaveLength(1);
    let caught = false;
    for (let i = 0; i < 40 && !caught; i++) {
      const setup = startWildBattle(p, 'meadow', 'tall-grass');
      p = setup.player;
      expect(setup.battle.sides[1].isWild).toBe(true);
      p = useOrb(p, 'orb');
      const r = resolveTurn(setup.battle, [{ type: 'catch', orb: 'orb' }, { type: 'move', index: 0 }]);
      const res = applyBattleResult(p, r.state);
      p = res.player;
      if (r.state.outcome?.reason === 'caught') {
        caught = true;
        expect(res.caughtInto).toBe('party');
        expect(p.party).toHaveLength(2);
        expect(p.caught).toContain(p.party[1]!.species);
      }
      p = healParty(p);
      if (p.bag.orb === 0) p.bag.orb = 10;
    }
    expect(caught).toBe(true);
    expect(p.seen.length).toBeGreaterThanOrEqual(2);
  });
  it('encounters are deterministic for a seed', () => {
    const a = startWildBattle(chooseStarter(newPlayer(7), 'dropple'), 'meadow', 'hollow');
    const b = startWildBattle(chooseStarter(newPlayer(7), 'dropple'), 'meadow', 'hollow');
    expect(a.battle).toEqual(b.battle);
  });
  it('cannot use orbs you do not have', () => {
    const p = { ...newPlayer(1), bag: { orb: 0, bright: 0, star: 0 } };
    expect(() => useOrb(p, 'orb')).toThrow();
  });
});
