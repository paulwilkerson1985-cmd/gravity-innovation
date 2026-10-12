import { describe, expect, it } from 'vitest';
import { Rng, resolveTurn } from '../src/engine';
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
  it('different seeds diverge', () => {
    const rng = new Rng(5);
    const a = randomTeam(rng, 3, 30, 'a');
    const b = randomTeam(rng, 3, 30, 'b');
    const logs = [11, 12, 13].map((seed) => JSON.stringify(runAiBattle(battle('pvp', seed, a, b).state).log));
    expect(new Set(logs).size).toBeGreaterThan(1);
  });
});
