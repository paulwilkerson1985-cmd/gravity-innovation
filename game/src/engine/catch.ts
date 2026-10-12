import type { Rng } from './rng';
import type { OrbId, StatusId } from './types';

export const ORBS: Record<OrbId, { name: string; bonus: number; price: number }> = {
  orb: { name: 'Orb', bonus: 1, price: 200 },
  bright: { name: 'Bright Orb', bonus: 1.5, price: 600 },
  star: { name: 'Star Orb', bonus: 2, price: 1200 },
};

export function catchProbability(maxHp: number, curHp: number, catchRate: number, orbBonus: number, status: StatusId | null): number {
  const statusBonus = status ? 1.5 : 1;
  const a = ((3 * maxHp - 2 * curHp) * catchRate * orbBonus * statusBonus) / (3 * maxHp);
  return Math.min(1, Math.max(0, a / 255));
}

/** Three shake checks, each passing with p^(1/3). Returns how many passed. */
export function rollCatch(p: number, rng: Rng): { shakes: number; caught: boolean } {
  const per = Math.cbrt(p);
  let shakes = 0;
  for (let i = 0; i < 3; i++) {
    if (!rng.chance(per)) break;
    shakes++;
  }
  return { shakes, caught: shakes === 3 };
}
