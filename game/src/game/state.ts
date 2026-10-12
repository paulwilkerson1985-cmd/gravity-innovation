// Overworld/player state (everything outside a single battle). Plain JSON so it can be
// saved, exported and inspected by tests. All randomness flows from `rng`.
import {
  ORBS, Rng, createBattle, getDex, getItem, healFully, itemHasEffect, makeCreature, rollEncounter, routeUnlocked, syncFromBattle,
  toBattle, hashSeed, useItemOnCreature,
  type BattleState, type ItemId, type OrbId, type OwnedCreature,
} from '../engine';
import { ITEMS } from '../data/items';

export const PARTY_MAX = 6;

export const PLAYER_STATE_VERSION = 2;

export type BagId = OrbId | ItemId;

export interface PlayerSettings {
  textSpeed: 'slow' | 'normal' | 'fast';
}

/** Save schema v2. Bump PLAYER_STATE_VERSION and add a migration in save.ts for any change. */
export interface PlayerState {
  v: 2;
  seed: number;
  rng: number;
  nextUid: number;
  name: string;
  party: OwnedCreature[];
  box: OwnedCreature[];
  /** Orbs and items. Missing keys mean 0. */
  bag: Partial<Record<BagId, number>>;
  seen: string[];
  caught: string[];
  money: number;
  defeatedTrainers: string[];
  champion: boolean;
  /** Seconds played. */
  playTime: number;
  lastRoute: string;
  settings: PlayerSettings;
}

export function newPlayer(seed: number): PlayerState {
  return {
    v: 2, seed, rng: hashSeed(seed, 0x5eed), nextUid: 1, name: 'You',
    party: [], box: [], bag: { orb: 10, bright: 3, star: 1, tonic: 3 },
    seen: [], caught: [], money: 500, defeatedTrainers: [], champion: false, playTime: 0, lastRoute: 'meadow',
    settings: { textSpeed: 'normal' },
  };
}

export function bagCount(p: PlayerState, id: BagId): number {
  return p.bag[id] ?? 0;
}

export function isRouteUnlocked(p: PlayerState, routeId: string): boolean {
  const r = getDex().routes.get(routeId);
  return !!r && routeUnlocked(r.unlockAfter, p.defeatedTrainers);
}

function uid(p: PlayerState): string {
  return `c${p.nextUid++}`;
}

function markSeen(p: PlayerState, species: string) {
  if (!p.seen.includes(species)) p.seen.push(species);
}

function markCaught(p: PlayerState, species: string) {
  markSeen(p, species);
  if (!p.caught.includes(species)) p.caught.push(species);
}

export function chooseStarter(p0: PlayerState, species: string): PlayerState {
  const p = structuredClone(p0);
  const c = makeCreature(species, 5, uid(p));
  p.party = [c];
  markCaught(p, species);
  return p;
}

export function partyAlive(p: PlayerState): boolean {
  return p.party.some((c) => c.hp > 0);
}

export interface WildSetup { player: PlayerState; battle: BattleState; events: ReturnType<typeof createBattle>['events'] }

export function startWildBattle(p0: PlayerState, routeId: string, hotspotId: string, debugFoe?: { species: string; level: number }): WildSetup {
  const p = structuredClone(p0);
  // Test/debug hook (battle scene `foe=` param): meet a given species on any route's theme.
  const roll = debugFoe ? { species: debugFoe.species, level: debugFoe.level, rng: p.rng } : rollEncounter(routeId, hotspotId, p.rng);
  const rng = new Rng(roll.rng);
  const battleSeed = (rng.next() * 2 ** 32) >>> 0;
  p.rng = rng.state;
  const wild = makeCreature(roll.species, roll.level, uid(p));
  markSeen(p, roll.species);
  const { state, events } = createBattle('wild', battleSeed,
    { name: p.name, controller: 'human', party: p.party.map(toBattle) },
    { name: 'Wild', controller: 'ai', ai: 'rookie', isWild: true, party: [toBattle(wild)] });
  return { player: p, battle: state, events };
}

/** Fold a finished (or abandoned) battle back into the player state. */
export function applyBattleResult(p0: PlayerState, battle: BattleState): { player: PlayerState; caughtInto?: 'party' | 'box' } {
  const p = structuredClone(p0);
  const mine = battle.sides[0].party;
  p.party = p.party.map((c) => {
    const b = mine.find((x) => x.uid === c.uid);
    return b ? syncFromBattle(c, b) : c;
  });
  let caughtInto: 'party' | 'box' | undefined;
  if (battle.outcome?.reason === 'caught') {
    const w = battle.sides[1].party[battle.sides[1].active]!;
    const owned: OwnedCreature = {
      ...makeCreature(w.species, w.level, w.uid),
      hp: w.hp,
      status: w.status,
      moves: w.moves.map((m) => ({ id: m.id, pp: m.pp })),
    };
    markCaught(p, w.species);
    if (p.party.length < PARTY_MAX) { p.party.push(owned); caughtInto = 'party'; }
    else { p.box.push(owned); caughtInto = 'box'; }
  }
  return { player: p, ...(caughtInto ? { caughtInto } : {}) };
}

export function useOrb(p0: PlayerState, orb: OrbId): PlayerState {
  if ((p0.bag[orb] ?? 0) <= 0) throw new Error(`no ${orb} left`);
  const p = structuredClone(p0);
  p.bag[orb] = (p.bag[orb] ?? 0) - 1;
  return p;
}

export function healParty(p0: PlayerState): PlayerState {
  const p = structuredClone(p0);
  p.party = p.party.map(healFully);
  return p;
}

// ---------------------------------------------------------------- meta helpers (party, box, bag, shop)
// All pure: they return a new PlayerState and throw a friendly Error when the action is not allowed.

export const TEXT_SPEEDS: PlayerSettings['textSpeed'][] = ['slow', 'normal', 'fast'];

/** Multiplier for battle-text hold times: slow 1.6×, normal 1×, fast 0.45×. */
export function textSpeedFactor(p: Pick<PlayerState, 'settings'> | null | undefined): number {
  const s = p?.settings?.textSpeed;
  return s === 'slow' ? 1.6 : s === 'fast' ? 0.45 : 1;
}

export function setTextSpeed(p0: PlayerState, speed: PlayerSettings['textSpeed']): PlayerState {
  if (!TEXT_SPEEDS.includes(speed)) throw new Error(`bad text speed ${speed}`);
  const p = structuredClone(p0);
  p.settings = { ...p.settings, textSpeed: speed };
  return p;
}

/** "12m", "1h 05m". */
export function formatPlayTime(seconds: number): string {
  const total = Math.max(0, Math.floor((Number.isFinite(seconds) ? seconds : 0) / 60));
  const hrs = Math.floor(total / 60);
  const mins = total % 60;
  return hrs > 0 ? `${hrs}h ${String(mins).padStart(2, '0')}m` : `${mins}m`;
}

/** Move a party member from one slot to another (the others shift). */
export function moveInParty(p0: PlayerState, from: number, to: number): PlayerState {
  const n = p0.party.length;
  if (!(Number.isInteger(from) && from >= 0 && from < n)) throw new Error(`bad party slot ${from}`);
  if (!(Number.isInteger(to) && to >= 0 && to < n)) throw new Error(`bad party slot ${to}`);
  const p = structuredClone(p0);
  const [c] = p.party.splice(from, 1);
  p.party.splice(to, 0, c!);
  return p;
}

/** Make a party member the lead (slot 0). */
export function setLead(p0: PlayerState, index: number): PlayerState {
  return moveInParty(p0, index, 0);
}

/** Why a party member can't go to the box, or null if it can. */
export function depositBlocker(p: PlayerState, index: number): string | null {
  const c = p.party[index];
  if (!c) return 'No kin in that slot.';
  if (p.party.length <= 1) return 'You need at least one kin with you.';
  if (!p.party.some((o, i) => i !== index && o.hp > 0)) return 'Keep at least one kin that can still battle.';
  return null;
}

export function depositToBox(p0: PlayerState, index: number): PlayerState {
  const why = depositBlocker(p0, index);
  if (why) throw new Error(why);
  const p = structuredClone(p0);
  const [c] = p.party.splice(index, 1);
  p.box.push(c!);
  return p;
}

export function withdrawBlocker(p: PlayerState, boxIndex: number): string | null {
  if (!p.box[boxIndex]) return 'No kin in that box slot.';
  if (p.party.length >= PARTY_MAX) return `Your party is full (${PARTY_MAX}). Deposit a kin first.`;
  return null;
}

export function withdrawFromBox(p0: PlayerState, boxIndex: number): PlayerState {
  const why = withdrawBlocker(p0, boxIndex);
  if (why) throw new Error(why);
  const p = structuredClone(p0);
  const [c] = p.box.splice(boxIndex, 1);
  p.party.push(c!);
  return p;
}

const ORB_IDS: OrbId[] = ['orb', 'bright', 'star'];

export function isOrb(id: string): id is OrbId {
  return (ORB_IDS as string[]).includes(id);
}

/** Every purchasable/ownable bag id in display order (orbs first). */
export function allBagIds(): BagId[] {
  return [...ORB_IDS, ...(Object.keys(ITEMS) as ItemId[])];
}

export function bagName(id: BagId): string {
  return isOrb(id) ? ORBS[id].name : getItem(id).name;
}

export function priceOf(id: BagId): number {
  return isOrb(id) ? ORBS[id].price : getItem(id).price;
}

export const BAG_STACK_MAX = 99;

/** Largest quantity of `id` the player can buy right now (money and the 99 stack cap). */
export function maxAffordable(p: PlayerState, id: BagId): number {
  return Math.max(0, Math.min(Math.floor(p.money / priceOf(id)), BAG_STACK_MAX - bagCount(p, id)));
}

export function buyItem(p0: PlayerState, id: BagId, qty: number): PlayerState {
  if (!allBagIds().includes(id)) throw new Error(`unknown item ${id}`);
  if (!(Number.isInteger(qty) && qty >= 1)) throw new Error(`bad quantity ${qty}`);
  const cost = priceOf(id) * qty;
  if (cost > p0.money) throw new Error('Not enough money.');
  if (bagCount(p0, id) + qty > BAG_STACK_MAX) throw new Error(`You can carry at most ${BAG_STACK_MAX}.`);
  const p = structuredClone(p0);
  p.money -= cost;
  p.bag[id] = bagCount(p0, id) + qty;
  return p;
}

/** Out of battle: use an item from the bag on a party member. Throws if none left or no effect. */
export function useBagItem(p0: PlayerState, item: ItemId, partyIndex: number): PlayerState {
  if (bagCount(p0, item) <= 0) throw new Error(`No ${getItem(item).name} left.`);
  const c = p0.party[partyIndex];
  if (!c) throw new Error('No kin in that slot.');
  if (!itemHasEffect(c, item)) throw new Error('It won\'t have any effect.');
  const p = structuredClone(p0);
  p.party[partyIndex] = useItemOnCreature(c, item);
  p.bag[item] = bagCount(p0, item) - 1;
  return p;
}
