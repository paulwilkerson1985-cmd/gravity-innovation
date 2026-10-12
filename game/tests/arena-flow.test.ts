import { describe, expect, it } from 'vitest';
import { TurnCollector, curtainBefore, curtainBeforePlayback, needsChoice } from '../src/scenes/arenaFlow';
import { randomRentalTeam } from '../src/scenes/arenaTeam';
import { createArenaBattle, legalActions, resolveTurn, type Action, type BattleState } from '../src/engine';

function battle(seed = 3): BattleState {
  return createArenaBattle(seed, 'Ember', randomRentalTeam(1), 'Rill', randomRentalTeam(2)).state;
}

describe('hotseat turn flow', () => {
  it('asks P1 then P2, with a curtain before P2 and before playback', () => {
    const st = battle();
    const c = new TurnCollector(st, [0, 1]);
    expect(c.next()).toBe(0);
    expect(curtainBefore('hotseat', c, 0)).toBe(false);
    expect(() => c.submit(1, { type: 'move', index: 0 })).toThrow(/not seat 1/);
    c.submit(0, { type: 'move', index: 0 });
    expect(c.next()).toBe(1);
    expect(curtainBefore('hotseat', c, 1)).toBe(true);
    expect(() => c.submit(1, { type: 'switch', to: st.sides[1].active })).toThrow(/illegal/);
    c.submit(1, { type: 'move', index: 1 });
    expect(c.done()).toBe(true);
    expect(curtainBeforePlayback('hotseat', c)).toBe(true);
    expect(c.result()).toEqual([{ type: 'move', index: 0 }, { type: 'move', index: 1 }]);
  });

  it('lets the CPU decide up front and never curtains', () => {
    const st = battle();
    let seen: BattleState | null = null;
    const c = new TurnCollector(st, [0], (s, seat) => { seen = s; return legalActions(s, seat)[0]!; });
    expect(seen).toBe(st);
    expect(c.actions[1]).not.toBeNull();
    expect(c.next()).toBe(0);
    expect(curtainBefore('cpu', c, 0)).toBe(false);
    c.submit(0, { type: 'move', index: 0 });
    expect(curtainBeforePlayback('cpu', c)).toBe(false);
  });

  it('only asks the side that must replace a fainted kin', () => {
    let st = battle(11);
    // Play until somebody needs a replacement.
    for (let i = 0; i < 100 && st.phase === 'choose'; i++) {
      const acts = [0, 1].map((s) => legalActions(st, s as 0 | 1).find((a) => a.type === 'move')!) as [Action, Action];
      st = resolveTurn(st, acts).state;
    }
    expect(st.phase).toBe('replace');
    const c = new TurnCollector(st, [0, 1]);
    const askers = c.humans;
    expect(askers.length).toBeGreaterThanOrEqual(1);
    for (const seat of [0, 1] as const) expect(askers.includes(seat)).toBe(needsChoice(st, seat));
    if (askers.length === 1) {
      expect(curtainBefore('hotseat', c, askers[0]!)).toBe(false);
      expect(curtainBeforePlayback('hotseat', c)).toBe(false);
    }
  });
});
