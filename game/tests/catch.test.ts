import { describe, expect, it } from 'vitest';
import { Rng, catchProbability, rollCatch, resolveTurn, IllegalActionError, legalActions } from '../src/engine';
import { battle, bc } from './helpers';

describe('catching', () => {
  it('matches the formula', () => {
    // Full HP, rate 255, plain orb: a = (3h-2h)·255/(3h) = 85 → p = 1/3
    expect(catchProbability(30, 30, 255, 1, null)).toBeCloseTo(1 / 3);
    // 1 HP of 30, rate 45, star orb, status: a = 88·45·2·1.5/90 = 132 → p≈0.5176
    expect(catchProbability(30, 1, 45, 2, 'burn')).toBeCloseTo((88 * 45 * 2 * 1.5) / 90 / 255);
    expect(catchProbability(30, 1, 255, 2, 'burn')).toBe(1);
  });
  it('is monotonic in HP, orb and status', () => {
    expect(catchProbability(50, 10, 120, 1, null)).toBeGreaterThan(catchProbability(50, 40, 120, 1, null));
    expect(catchProbability(50, 40, 120, 1.5, null)).toBeGreaterThan(catchProbability(50, 40, 120, 1, null));
    expect(catchProbability(50, 40, 120, 1, 'shock')).toBeGreaterThan(catchProbability(50, 40, 120, 1, null));
  });
  it('empirical success rate over seeded trials matches p (3 shakes of p^(1/3))', () => {
    for (const p of [0.1, 1 / 3, 0.62, 0.9]) {
      const rng = new Rng(99);
      const n = 40000;
      let ok = 0;
      const shakeHist = [0, 0, 0, 0];
      for (let i = 0; i < n; i++) {
        const r = rollCatch(p, rng);
        if (r.caught) ok++;
        shakeHist[r.shakes]!++;
      }
      const sigma = Math.sqrt((p * (1 - p)) / n);
      expect(Math.abs(ok / n - p)).toBeLessThan(4 * sigma);
      // P(at least one shake) = p^(1/3)
      expect(Math.abs((n - shakeHist[0]!) / n - Math.cbrt(p))).toBeLessThan(0.01);
    }
  });
  it('catch ends a wild battle and reports shakes', () => {
    let caughtOnce = false;
    for (let seed = 1; seed < 60 && !caughtOnce; seed++) {
      const { state } = battle('wild', seed, [bc('ashkit', 10)], [bc('flickwing', 3)]);
      const r = resolveTurn(state, [{ type: 'catch', orb: 'star' }, { type: 'move', index: 0 }]);
      const ev = r.events.find((e) => e.t === 'catch');
      expect(ev).toBeDefined();
      if (ev?.t === 'catch' && ev.caught) {
        caughtOnce = true;
        expect(r.state.outcome).toEqual({ winner: 0, reason: 'caught' });
        expect(ev.shakes).toBe(3);
      }
    }
    expect(caughtOnce).toBe(true);
  });
  it('trainer-owned creatures cannot be caught', () => {
    const { state } = battle('trainer', 1, [bc('ashkit', 10)], [bc('flickwing', 3)]);
    expect(legalActions(state, 0).some((a) => a.type === 'catch')).toBe(false);
    expect(() => resolveTurn(state, [{ type: 'catch', orb: 'orb' }, { type: 'move', index: 0 }])).toThrow(IllegalActionError);
  });
});
