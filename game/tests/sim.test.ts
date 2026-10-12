import { describe, expect, it } from 'vitest';
import { Rng, type AiTier } from '../src/engine';
import { battle, randomTeam, runAiBattle } from './helpers';

describe('AI vs AI', () => {
  it('1,000 random battles finish with no errors or infinite loops', () => {
    const tiers: AiTier[] = ['rookie', 'skilled'];
    const reasons: Record<string, number> = {};
    for (let i = 0; i < 1000; i++) {
      const rng = new Rng(i + 1);
      const size = rng.range(1, 6);
      const lvA = rng.range(2, 30);
      const lvB = rng.range(2, 30);
      const start = battle('pvp', i * 7919 + 1, randomTeam(rng, size, lvA, 'a'), randomTeam(rng, rng.range(1, 6), lvB, 'b'));
      const { state } = runAiBattle(start.state, [rng.pick(tiers), rng.pick(tiers)]);
      expect(state.phase).toBe('over');
      reasons[state.outcome!.reason] = (reasons[state.outcome!.reason] ?? 0) + 1;
      for (const side of state.sides) for (const c of side.party) {
        expect(c.hp).toBeGreaterThanOrEqual(0);
        expect(c.hp).toBeLessThanOrEqual(c.stats.hp);
        for (const m of c.moves) expect(m.pp).toBeGreaterThanOrEqual(0);
        for (const v of Object.values(c.stages)) expect(Math.abs(v)).toBeLessThanOrEqual(3);
      }
    }
    expect(reasons.turnLimit ?? 0).toBeLessThan(10);
  });
  it('skilled AI beats rookie AI more often than not in mirror matches', () => {
    let skilledWins = 0;
    const n = 300;
    for (let i = 0; i < n; i++) {
      const rng = new Rng(1000 + i);
      const team = randomTeam(rng, 3, 25, 'x');
      const mirror = team.map((c, j) => ({ ...structuredClone(c), uid: `y${j}` }));
      const { state } = runAiBattle(battle('pvp', i, team, mirror).state, ['skilled', 'rookie']);
      if (state.outcome?.winner === 0) skilledWins++;
    }
    expect(skilledWins / n).toBeGreaterThan(0.55);
  });
});
