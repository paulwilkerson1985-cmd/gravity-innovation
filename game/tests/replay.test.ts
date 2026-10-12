import { describe, expect, it } from 'vitest';
import { Rng, chooseAction, legalActions, resolveTurn, type Action, type BattleEvent } from '../src/engine';
import { battle, randomTeam, runAiBattle } from './helpers';

describe('determinism', () => {
  it('same seed + same actions → identical event log', () => {
    for (let seed = 1; seed <= 25; seed++) {
      const rng = new Rng(seed * 77);
      const start = battle('pvp', seed, randomTeam(rng, 3, 30, 'a'), randomTeam(rng, 3, 30, 'b'));
      const first = runAiBattle(start.state, ['skilled', 'rookie']);
      // Replay the recorded actions without the AI.
      let s = start.state;
      const log = [];
      for (const pair of first.actions) {
        const r = resolveTurn(s, pair);
        log.push(...r.events);
        s = r.state;
      }
      expect(log).toEqual(first.log);
      expect(s).toEqual(first.state);
    }
  });
  it('replays with ace AI and item actions are identical', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const rng = new Rng(seed * 31);
      const start = battle('trainer', seed, randomTeam(rng, 3, 20, 'a'), randomTeam(rng, 3, 22, 'b'));
      const actions: [Action, Action][] = [];
      const log: BattleEvent[] = [];
      let s = start.state;
      let items = 0;
      while (s.phase !== 'over') {
        const item = s.phase === 'choose' && s.turn % 3 === 2 ? legalActions(s, 0).find((a) => a.type === 'item') : undefined;
        let mine = item ?? chooseAction(s, 0, 'ace');
        if (mine.type === 'forfeit') mine = { type: 'move', index: 0 };
        if (item) items++;
        const pair: [Action, Action] = [mine, chooseAction(s, 1, 'ace')];
        actions.push(pair);
        const r = resolveTurn(s, pair);
        log.push(...r.events);
        s = r.state;
      }
      expect(log.some((e) => e.t === 'item')).toBe(items > 0);
      let t = start.state;
      const log2: BattleEvent[] = [];
      for (const pair of actions) {
        const r = resolveTurn(t, pair);
        log2.push(...r.events);
        t = r.state;
      }
      expect(log2).toEqual(log);
      expect(t).toEqual(s);
    }
  });
  it('different seeds diverge', () => {
    const rng = new Rng(5);
    const a = randomTeam(rng, 3, 30, 'a');
    const b = randomTeam(rng, 3, 30, 'b');
    const logs = [11, 12, 13].map((seed) => JSON.stringify(runAiBattle(battle('pvp', seed, a, b).state).log));
    expect(new Set(logs).size).toBeGreaterThan(1);
  });
});
