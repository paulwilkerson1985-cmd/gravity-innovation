import { describe, expect, it } from 'vitest';
import { Rng, damageRange, getDex, rollDamage, stageMultiplier, CRIT_MULT, baseDamage } from '../src/engine';
import { bc } from './helpers';

const mv = (id: string) => getDex().moves.get(id)!;

describe('damage', () => {
  it('stays within [min, max] (×1.5 on crit) over many rolls', () => {
    const species = [...getDex().species.keys()];
    const attacks = [...getDex().moves.values()].filter((m) => m.category === 'attack');
    const rng = new Rng(1234);
    for (let i = 0; i < 3000; i++) {
      const a = bc(rng.pick(species), rng.range(2, 30));
      const d = bc(rng.pick(species), rng.range(2, 30));
      const m = rng.pick(attacks);
      const [lo, hi] = damageRange(a, d, m);
      const r = rollDamage(a, d, m, rng);
      expect(r.damage).toBeGreaterThanOrEqual(1);
      if (r.crit) {
        expect(r.damage).toBeLessThanOrEqual(Math.floor(hi * CRIT_MULT) + 1);
      } else {
        expect(r.damage).toBeGreaterThanOrEqual(lo);
        expect(r.damage).toBeLessThanOrEqual(hi);
      }
    }
  });
  it('applies STAB and type effectiveness', () => {
    const ash = bc('ashkit', 20, 'a', ['cinder-spit', 'bump']);
    const moss = bc('mossling', 20, 'm');
    const drop = bc('dropple', 20, 'd');
    const vsFlora = baseDamage(ash, moss, mv('cinder-spit'));
    expect(vsFlora.stab).toBe(1.5);
    expect(vsFlora.mult).toBe(2);
    expect(baseDamage(ash, drop, mv('cinder-spit')).mult).toBe(0.5);
    expect(baseDamage(ash, moss, mv('bump')).stab).toBe(1);
    expect(damageRange(ash, moss, mv('cinder-spit'))[1]).toBeGreaterThan(damageRange(ash, drop, mv('cinder-spit'))[1] * 3);
  });
  it('stat stages follow (2+s)/2 and 2/(2-s)', () => {
    expect(stageMultiplier(0)).toBe(1);
    expect(stageMultiplier(1)).toBe(1.5);
    expect(stageMultiplier(3)).toBe(2.5);
    expect(stageMultiplier(-1)).toBeCloseTo(2 / 3);
    expect(stageMultiplier(-3)).toBe(0.4);
  });
  it('burn halves attack', () => {
    const a = bc('cragmaul', 25, 'a');
    const d = bc('cragmaul', 25, 'd');
    const normal = damageRange(a, d, mv('landslide'))[1];
    a.status = 'burn';
    expect(damageRange(a, d, mv('landslide'))[1]).toBeLessThan(normal * 0.6);
  });
});
