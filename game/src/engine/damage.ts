import { typeMultiplier } from './typechart';
import type { Rng } from './rng';
import type { BattleCreature, MoveData, StageKey } from './types';

export const CRIT_CHANCE = 1 / 16;
export const CRIT_MULT = 1.5;
export const STAB = 1.5;
export const MAX_STAGE = 3;

export function stageMultiplier(stage: number): number {
  return stage >= 0 ? (2 + stage) / 2 : 2 / (2 - stage);
}

export function effectiveStat(c: BattleCreature, stat: StageKey): number {
  let v = c.stats[stat] * stageMultiplier(c.stages[stat]);
  if (stat === 'atk' && c.status === 'burn') v *= 0.5;
  if (stat === 'spe' && c.status === 'shock') v *= 0.5;
  return Math.max(1, Math.floor(v));
}

/** Damage before the random roll and crit (used by the AI and for bounds). */
export function baseDamage(attacker: BattleCreature, defender: BattleCreature, m: MoveData): { base: number; mult: number; stab: number } {
  const a = effectiveStat(attacker, 'atk');
  const d = effectiveStat(defender, 'def');
  const levelFactor = Math.floor((2 * attacker.level) / 5) + 2;
  const base = Math.floor(Math.floor((levelFactor * m.power * a) / d) / 50) + 2;
  const mult = typeMultiplier(m.type, defender.types);
  const stab = m.type !== 'Neutral' && attacker.types.includes(m.type) ? STAB : 1;
  return { base, mult, stab };
}

export function rollDamage(attacker: BattleCreature, defender: BattleCreature, m: MoveData, rng: Rng): { damage: number; mult: number; crit: boolean } {
  const { base, mult, stab } = baseDamage(attacker, defender, m);
  const crit = rng.chance(CRIT_CHANCE);
  const roll = 0.85 + rng.int(16) / 100; // 0.85 … 1.00
  const dmg = Math.floor(base * stab * mult * (crit ? CRIT_MULT : 1) * roll);
  return { damage: Math.max(1, dmg), mult, crit };
}

/** Deterministic min/max damage (no crit) — used by tests and the AI. */
export function damageRange(attacker: BattleCreature, defender: BattleCreature, m: MoveData): [number, number] {
  const { base, mult, stab } = baseDamage(attacker, defender, m);
  return [Math.max(1, Math.floor(base * stab * mult * 0.85)), Math.max(1, Math.floor(base * stab * mult))];
}
