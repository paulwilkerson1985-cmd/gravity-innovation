import type { Element, MoveElement } from './types';

/** Attacker → defender multipliers that differ from 1×. */
export const TYPE_CHART: Record<Element, { strong: Element[]; weak: Element[] }> = {
  Flame: { strong: ['Flora', 'Gale'], weak: ['Tide', 'Terra'] },
  Tide: { strong: ['Flame', 'Terra'], weak: ['Flora', 'Spark'] },
  Flora: { strong: ['Tide', 'Spark'], weak: ['Flame', 'Gale'] },
  Spark: { strong: ['Tide', 'Gale'], weak: ['Flora', 'Terra'] },
  Terra: { strong: ['Flame', 'Spark'], weak: ['Tide', 'Gale'] },
  Gale: { strong: ['Flora', 'Terra'], weak: ['Flame', 'Spark'] },
};

export function typeMultiplier(attack: MoveElement, defender: readonly Element[]): number {
  if (attack === 'Neutral') return 1;
  const row = TYPE_CHART[attack];
  let m = 1;
  for (const d of defender) {
    if (row.strong.includes(d)) m *= 2;
    else if (row.weak.includes(d)) m *= 0.5;
  }
  return m;
}
