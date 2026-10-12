import { describe, expect, it } from 'vitest';
import { resolveTurn, active, legalActions, IllegalActionError } from '../src/engine';
import { battle, bc } from './helpers';

describe('battle engine', () => {
  it('does not mutate input and state round-trips through JSON', () => {
    const { state } = battle('wild', 5, [bc('ashkit', 10)], [bc('breezel', 8)]);
    const snapshot = JSON.stringify(state);
    const r = resolveTurn(state, [{ type: 'move', index: 0 }, { type: 'move', index: 0 }]);
    expect(JSON.stringify(state)).toBe(snapshot);
    expect(JSON.parse(JSON.stringify(r.state))).toEqual(r.state);
  });
  it('faster creature acts first; priority beats speed', () => {
    const fast = bc('cyclonyx', 20, 'f', ['bump', 'breeze-cut']);
    const slow = bc('pebblet', 20, 's', ['bump', 'quick-jab']);
    const { state } = battle('trainer', 3, [slow], [fast]);
    const r1 = resolveTurn(state, [{ type: 'move', index: 0 }, { type: 'move', index: 0 }]);
    const firstMove = r1.events.find((e) => e.t === 'move');
    expect(firstMove?.t === 'move' && firstMove.side).toBe(1);
    const r2 = resolveTurn(state, [{ type: 'move', index: 1 }, { type: 'move', index: 0 }]);
    const first2 = r2.events.find((e) => e.t === 'move');
    expect(first2?.t === 'move' && first2.side).toBe(0);
  });
  it('spends PP and falls back to Desperation when empty', () => {
    const a = bc('ashkit', 10, 'a', ['bump']);
    a.moves[0]!.pp = 1;
    const { state } = battle('trainer', 9, [a], [bc('cragmaul', 30)]);
    const r = resolveTurn(state, [{ type: 'move', index: 0 }, { type: 'move', index: 0 }]);
    expect(active(r.state, 0).moves[0]!.pp).toBe(0);
    if (r.state.phase !== 'over') {
      expect(legalActions(r.state, 0)).toContainEqual({ type: 'move', index: -1 });
      expect(() => resolveTurn(r.state, [{ type: 'move', index: 0 }, { type: 'move', index: 0 }])).toThrow(IllegalActionError);
    }
  });
  it('a KO ends the battle with a winner', () => {
    const { state } = battle('trainer', 2, [bc('pyrelord', 30)], [bc('mossling', 2)]);
    const r = resolveTurn(state, [{ type: 'move', index: 3 }, { type: 'move', index: 0 }]);
    expect(r.state.outcome?.winner).toBe(0);
    expect(r.events.some((e) => e.t === 'faint' && e.side === 1)).toBe(true);
    expect(() => resolveTurn(r.state, [{ type: 'pass' }, { type: 'pass' }])).toThrow();
  });
  it('requests a replacement when a party member faints', () => {
    const { state } = battle('trainer', 2, [bc('pyrelord', 30)], [bc('mossling', 2, 'm1'), bc('breezel', 2, 'b1')]);
    const r = resolveTurn(state, [{ type: 'move', index: 3 }, { type: 'move', index: 0 }]);
    expect(r.state.phase).toBe('replace');
    expect(legalActions(r.state, 0)).toEqual([{ type: 'pass' }]);
    expect(legalActions(r.state, 1)).toEqual([{ type: 'switch', to: 1 }]);
    const r2 = resolveTurn(r.state, [{ type: 'pass' }, { type: 'switch', to: 1 }]);
    expect(r2.state.phase).toBe('choose');
    expect(active(r2.state, 1).uid).toBe('b1');
  });
  it('stat stages clamp at ±3', () => {
    const a = bc('pebblet', 20, 'a', ['bedrock-brace']);
    let { state } = battle('trainer', 4, [a], [bc('pebblet', 20, 'b', ['bedrock-brace'])]);
    for (let i = 0; i < 3; i++) state = resolveTurn(state, [{ type: 'move', index: 0 }, { type: 'move', index: 0 }]).state;
    expect(active(state, 0).stages.def).toBe(3);
  });
  it('burn deals 1/16 max HP at end of turn', () => {
    const a = bc('ashkit', 20, 'a', ['smolder-cloud']);
    const b = bc('pebblet', 20, 'b', ['bedrock-brace']);
    b.status = 'burn';
    const { state } = battle('trainer', 4, [a], [b]);
    const r = resolveTurn(state, [{ type: 'move', index: 0 }, { type: 'move', index: 0 }]);
    const burn = r.events.find((e) => e.t === 'damage' && e.source === 'burn');
    expect(burn?.t === 'damage' && burn.amount).toBe(Math.floor(b.stats.hp / 16));
    expect(r.events.some((e) => e.t === 'statusFail')).toBe(true);
  });
  it('running from a slower wild creature always works', () => {
    const { state } = battle('wild', 4, [bc('cyclonyx', 20)], [bc('pebblet', 3)]);
    const r = resolveTurn(state, [{ type: 'run' }, { type: 'move', index: 0 }]);
    expect(r.state.outcome).toEqual({ winner: null, reason: 'ran' });
  });
  it('cannot run from trainer battles', () => {
    const { state } = battle('trainer', 4, [bc('cyclonyx', 20)], [bc('pebblet', 3)]);
    expect(() => resolveTurn(state, [{ type: 'run' }, { type: 'move', index: 0 }])).toThrow(IllegalActionError);
  });
});
