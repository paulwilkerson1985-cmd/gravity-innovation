import { describe, expect, it } from 'vitest';
import { chooseAction, matchup, resolveTurn } from '../src/engine';
import { battle, bc } from './helpers';

describe('ace AI', () => {
  it('choosing never changes the battle state (rng untouched, deterministic)', () => {
    const { state } = battle('pvp', 77, [bc('ashkit', 20, 'a'), bc('dropple', 20, 'b')], [bc('mossling', 20, 'c'), bc('breezel', 20, 'd')]);
    const snap = JSON.stringify(state);
    const a1 = chooseAction(state, 0, 'ace');
    const a2 = chooseAction(state, 0, 'ace');
    expect(a1).toEqual(a2);
    expect(JSON.stringify(state)).toBe(snap);
  });

  it('switches out of a clearly bad matchup to the member that handles the foe', () => {
    // Flora vs a Flame attacker is bad; Tide handles Flame.
    const moss = bc('mossling', 22, 'moss', ['seed-sling', 'bump']);
    const tide = bc('rillback', 22, 'tide', ['riptide-slam', 'bump']);
    const bird = bc('breezel', 22, 'bird', ['breeze-cut', 'bump']);
    const foe = bc('cindertail', 22, 'foe', ['searing-fang', 'cinder-spit']);
    const { state } = battle('pvp', 5, [moss, bird, tide], [foe]);
    expect(matchup(moss, foe)).toBeLessThan(-0.25);
    expect(chooseAction(state, 0, 'ace')).toEqual({ type: 'switch', to: 2 });
  });

  it('does not ping-pong: no voluntary switch right after switching', () => {
    const moss = bc('mossling', 22, 'moss', ['seed-sling', 'bump']);
    const tide = bc('rillback', 22, 'tide', ['riptide-slam', 'bump']);
    const foe = bc('cindertail', 22, 'foe', ['searing-fang', 'cinder-spit']);
    const { state } = battle('pvp', 5, [tide, moss], [foe]);
    const s = { ...state, turn: 4, sides: [{ ...state.sides[0], lastSwitchTurn: 3 }, state.sides[1]] as typeof state.sides };
    expect(chooseAction(s, 0, 'ace').type).toBe('move');
  });

  it('uses a status move on an unstatused foe when it pays off', () => {
    // Bulky attacker with a burn move vs a strong physical foe it cannot hurt much.
    const me = bc('cragmaul', 25, 'me', ['smolder-cloud', 'bump']);
    const foe = bc('cyclonyx', 25, 'foe', ['talon-dive', 'quick-jab']);
    const { state } = battle('pvp', 3, [me], [foe]);
    const a = chooseAction(state, 0, 'ace');
    expect(a).toEqual({ type: 'move', index: 0 });
    const burnt = resolveTurn(state, [a, { type: 'move', index: 0 }]).state;
    if (burnt.phase === 'choose' && burnt.sides[1].party[0]!.status) {
      expect(chooseAction(burnt, 0, 'ace')).toEqual({ type: 'move', index: 1 }); // already statused → attack
    }
  });

  it('skilled and ace replace with the best matchup; rookie may not', () => {
    const p = bc('pyrelord', 30, 'p', ['pyre-crash']);
    const { state } = battle('pvp', 2, [p], [bc('mossling', 2, 'm1'), bc('thistlehorn', 20, 't1'), bc('dropple', 20, 'd1')]);
    const r = resolveTurn(state, [{ type: 'move', index: 0 }, { type: 'move', index: 0 }]);
    expect(r.state.phase).toBe('replace');
    expect(chooseAction(r.state, 1, 'skilled')).toEqual({ type: 'switch', to: 2 });
    expect(chooseAction(r.state, 1, 'ace')).toEqual({ type: 'switch', to: 2 });
  });
});
