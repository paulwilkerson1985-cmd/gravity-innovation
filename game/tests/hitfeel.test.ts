import { describe, expect, it } from 'vitest';
import { KICK_FRAMES, Kick, kickPx } from '../src/render/hitfeel';

describe('hit feel', () => {
  it('only strong hits kick, harder for crits', () => {
    expect(kickPx({ mult: 1, crit: false })).toBe(0);
    expect(kickPx({ mult: 0.5, crit: false })).toBe(0);
    expect(kickPx({ mult: 2, crit: false })).toBe(4);
    expect(kickPx({ mult: 1, crit: true })).toBe(5);
    expect(kickPx({ mult: 2, crit: true })).toBe(6);
  });

  it('the kick is a whole-pixel directional push that settles within 8 frames', () => {
    const k = new Kick();
    k.start(4, 1, 0);
    const xs: number[] = [];
    for (let f = 0; f < 20; f++) {
      const [x, y] = k.step(1 / 60);
      expect(Number.isInteger(x) && Number.isInteger(y)).toBe(true);
      expect(y).toBe(0);
      xs.push(x);
    }
    expect(xs[0]).toBe(4); // the push lands on the impact frame, along the blow
    expect(xs.slice(KICK_FRAMES).every((x) => x === 0)).toBe(true);
    expect(k.active).toBe(false);
    // No buzzing: the sign changes at most twice (push, rebound, settle).
    let flips = 0;
    const nz = xs.filter((x) => x !== 0);
    for (let i = 1; i < nz.length; i++) if (Math.sign(nz[i]!) !== Math.sign(nz[i - 1]!)) flips++;
    expect(flips).toBeLessThanOrEqual(2);
  });
});
