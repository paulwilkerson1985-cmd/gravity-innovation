// Overworld/player state (everything outside a single battle). Plain JSON so it can be
// saved, exported and inspected by tests. All randomness flows from `rng`.
import {
  Rng, createBattle, getDex, healFully, makeCreature, rollEncounter, routeUnlocked, syncFromBattle, toBattle, hashSeed,
  type BattleState, type ItemId, type OrbId, type OwnedCreature,
} from '../engine';

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

export function startWildBattle(p0: PlayerState, routeId: string, hotspotId: string): WildSetup {
  const p = structuredClone(p0);
  const roll = rollEncounter(routeId, hotspotId, p.rng);
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
