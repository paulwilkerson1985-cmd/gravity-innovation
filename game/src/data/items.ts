import type { ItemData, ItemId } from '../engine/types';

/** Bag items (orbs live separately in engine/catch.ts). The engine never tracks counts. */
export const ITEMS: Record<ItemId, ItemData> = {
  tonic: {
    id: 'tonic', name: 'Tonic', price: 200, effect: { kind: 'heal', amount: 20 },
    blurb: 'A fizzy herbal drink. Restores 20 HP.',
  },
  'mega-tonic': {
    id: 'mega-tonic', name: 'Mega Tonic', price: 600, effect: { kind: 'heal', amount: 60 },
    blurb: 'A concentrated brew of sunberries. Restores 60 HP.',
  },
  'full-tonic': {
    id: 'full-tonic', name: 'Full Tonic', price: 1500, effect: { kind: 'heal', amount: 'full' },
    blurb: 'A rare golden draught. Restores all HP.',
  },
  remedy: {
    id: 'remedy', name: 'Remedy Leaf', price: 250, effect: { kind: 'cure' },
    blurb: 'A bitter leaf to chew on. Cures Burn, Shock and Drowsy.',
  },
  'revive-seed': {
    id: 'revive-seed', name: 'Rekindle Seed', price: 1500, effect: { kind: 'revive', fraction: 0.5 },
    blurb: 'A warm seed that rouses a fainted kin with half its HP.',
  },
};

export const ITEM_IDS = Object.keys(ITEMS) as ItemId[];
