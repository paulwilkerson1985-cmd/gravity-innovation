// Bag items: pure effect rules shared by battle and the overworld.
// The engine never tracks how many of an item the player owns — the game layer does.
import { ITEMS } from '../data/items';
import { calcStats } from './creature';
import type { ItemData, ItemId, OwnedCreature, StatusId } from './types';

export function getItem(id: ItemId): ItemData {
  const it = ITEMS[id];
  if (!it) throw new Error(`unknown item ${id}`);
  return it;
}

interface Vitals { hp: number; maxHp: number; status: StatusId | null }

export interface ItemOutcome {
  hp: number;
  status: StatusId | null;
  healed: number;
  cured: StatusId | null;
  revived: boolean;
}

/** Whether using `item` on a creature in this condition would do anything. */
export function itemAffects(v: Vitals, item: ItemId): boolean {
  const e = getItem(item).effect;
  switch (e.kind) {
    case 'heal': return v.hp > 0 && v.hp < v.maxHp;
    case 'cure': return v.hp > 0 && v.status !== null;
    case 'revive': return v.hp <= 0;
  }
}

/** Apply an item to vitals. Throws if it would have no effect. */
export function applyItem(v: Vitals, item: ItemId): ItemOutcome {
  if (!itemAffects(v, item)) throw new Error(`${getItem(item).name} would have no effect`);
  const e = getItem(item).effect;
  switch (e.kind) {
    case 'heal': {
      const want = e.amount === 'full' ? v.maxHp : e.amount;
      const healed = Math.min(v.maxHp - v.hp, want);
      return { hp: v.hp + healed, status: v.status, healed, cured: null, revived: false };
    }
    case 'cure':
      return { hp: v.hp, status: null, healed: 0, cured: v.status, revived: false };
    case 'revive': {
      const hp = Math.max(1, Math.floor(v.maxHp * e.fraction));
      return { hp, status: null, healed: hp, cured: null, revived: true };
    }
  }
}

const vitalsOf = (c: OwnedCreature): Vitals => ({ hp: c.hp, maxHp: calcStats(c.species, c.level).hp, status: c.status });

/** Out of battle: would this item do anything to this creature? */
export function itemHasEffect(c: OwnedCreature, item: ItemId): boolean {
  return itemAffects(vitalsOf(c), item);
}

/** Out of battle: returns a new creature with the item applied. Throws if it has no effect. */
export function useItemOnCreature(c: OwnedCreature, item: ItemId): OwnedCreature {
  const r = applyItem(vitalsOf(c), item);
  return { ...structuredClone(c), hp: r.hp, status: r.status };
}
