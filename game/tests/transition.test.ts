import { describe, expect, it } from 'vitest';
import { animClock, flushTweens, stepTweens } from '../src/render/anim';
import { BATTLE_IN, PULSE_MAX, battleCover, battleReveal, covered, screenFx, wipeFor } from '../src/render/hd2d/transition';

describe('HD-2D battle-in transition', () => {
  it('picks the wipe by terrain x threat', () => {
    expect(wipeFor({ kind: 'grass' })).toBe('shards');
    expect(wipeFor({ kind: 'cave' })).toBe('iris');
    expect(wipeFor({ kind: 'water' })).toBe('mosaic');
    expect(wipeFor({ kind: 'trainer', trainer: true })).toBe('shards2');
    expect(wipeFor({ kind: 'cave', threat: true })).toBe('dissolve');
  });

  it('stays inside the flash limits: <= 2 pulses per second, <= 50% toward the pulse colour', () => {
    expect(PULSE_MAX).toBeLessThanOrEqual(0.5);
    expect(BATTLE_IN.pulsePeriod).toBeGreaterThanOrEqual(30); // 60 fps frames: <= 2 per second
    expect(BATTLE_IN.wipeFrames + BATTLE_IN.pulsePeriod + BATTLE_IN.pulseFrames + BATTLE_IN.revealFrames).toBeLessThanOrEqual(110);
  });

  it('covers in whole steps, then the reveal opens and clears the state', async () => {
    animClock.instant = false; animClock.speed = 1;
    const seen = new Set<number>();
    let maxPulse = 0;
    const cover = battleCover({ kind: 'grass' });
    for (let i = 0; i < 200 && !covered(); i++) { stepTweens(1 / 60); await Promise.resolve(); seen.add(screenFx.k); maxPulse = Math.max(maxPulse, screenFx.pulse); }
    for (let i = 0; i < 60; i++) { stepTweens(1 / 60); await Promise.resolve(); seen.add(screenFx.k); }
    await cover;
    expect(screenFx.k).toBe(1);
    expect(maxPulse).toBeLessThanOrEqual(PULSE_MAX + 1e-9);
    for (const k of seen) expect(Math.abs(k * BATTLE_IN.steps - Math.round(k * BATTLE_IN.steps))).toBeLessThan(1e-6);
    const reveal = battleReveal(() => [0.6, 0.4]);
    for (let i = 0; i < 60; i++) { stepTweens(1 / 60); await Promise.resolve(); }
    await reveal;
    expect(covered()).toBe(false);
    expect(screenFx.mode).toBe(0);
    flushTweens();
  });
});
