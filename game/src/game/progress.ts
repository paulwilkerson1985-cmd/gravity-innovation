// Adventure progression on top of PlayerState: XP after battles, move offers, evolution
// queueing, trainer battles and rewards, route unlocks. Pure functions — no DOM, no three —
// so every rule here is unit-tested (tests/progress.test.ts).
import {
  LEVEL_CAP, Rng, awardXp, canEvolveNow, createBattle, evolve, gainXp, getDex, getTrainer, learnMove, makeCreature,
  species, toBattle, trainerSide, xpForLevel,
  type BattleEvent, type BattleState, type OwnedCreature, type ProgressEvent, type RouteData, type TrainerData,
} from '../engine';
import { healParty, isRouteUnlocked, type BagId, type PlayerState } from './state';

/** The trainer whose victory makes the player Champion. */
export const CHAMPION_ID = 'champion-vale';

export interface CreatureGain {
  uid: string;
  amount: number;
  before: OwnedCreature;
  after: OwnedCreature;
  /** Engine progress events for this creature, in order (xp, levelUp, learned, moveOffer, canEvolve). */
  events: ProgressEvent[];
}

export interface BattleXp {
  player: PlayerState;
  gains: CreatureGain[];
  /** uids that became able to evolve during this battle, party order. */
  evolutions: string[];
}

const nameOf = (c: OwnedCreature) => c.nickname ?? species(c.species).name;

/**
 * Award battle XP to the party (engine `awardXp` + `gainXp`). Auto-learned moves are applied;
 * move offers are returned in `events` for the UI to resolve with `teachMove`. Catching gives
 * no XP (only fainted foes count).
 */
export function applyBattleXp(p0: PlayerState, battle: BattleState): BattleXp {
  const p = structuredClone(p0);
  const awards = awardXp(battle);
  const gains: CreatureGain[] = [];
  const evolutions: string[] = [];
  p.party = p.party.map((c) => {
    const amount = awards[c.uid] ?? 0;
    if (amount <= 0) return c;
    const { creature, events } = gainXp(c, amount);
    gains.push({ uid: c.uid, amount, before: c, after: creature, events });
    if (events.some((e) => e.t === 'canEvolve')) evolutions.push(c.uid);
    return creature;
  });
  return { player: p, gains, evolutions };
}

/** Resolve a move offer: forget `slot` (0–3) to learn `moveId`, or `null` to skip. */
export function teachMove(p0: PlayerState, uid: string, moveId: string, slot: number | null): PlayerState {
  const p = structuredClone(p0);
  const i = p.party.findIndex((c) => c.uid === uid);
  if (i < 0) throw new Error(`no party member ${uid}`);
  p.party[i] = learnMove(p.party[i]!, moveId, slot);
  return p;
}

/** Evolution candidates still valid right now (in party and level high enough). */
export function evolutionQueue(p: PlayerState, uids: readonly string[]): string[] {
  const out: string[] = [];
  for (const uid of uids) {
    const c = p.party.find((x) => x.uid === uid);
    if (c && canEvolveNow(c) && !out.includes(uid)) out.push(uid);
  }
  return out;
}

export interface EvolutionResult { player: PlayerState; from: string; into: string; name: string }

/** Evolve a party member and register the new form in the bestiary. */
export function evolvePartyMember(p0: PlayerState, uid: string): EvolutionResult {
  const p = structuredClone(p0);
  const i = p.party.findIndex((c) => c.uid === uid);
  if (i < 0) throw new Error(`no party member ${uid}`);
  const before = p.party[i]!;
  const after = evolve(before);
  p.party[i] = after;
  markCaught(p, after.species);
  return { player: p, from: before.species, into: after.species, name: nameOf(before) };
}

export function markSeen(p: PlayerState, speciesId: string) {
  if (!p.seen.includes(speciesId)) p.seen.push(speciesId);
}

function markCaught(p: PlayerState, speciesId: string) {
  markSeen(p, speciesId);
  if (!p.caught.includes(speciesId)) p.caught.push(speciesId);
}

/** Copy of the player with `speciesId` marked as seen (used as foes are sent out). */
export function withSeen(p0: PlayerState, speciesId: string): PlayerState {
  if (p0.seen.includes(speciesId)) return p0;
  const p = structuredClone(p0);
  markSeen(p, speciesId);
  return p;
}

// ------------------------------------------------------------------ trainers

export function isTrainerDefeated(p: PlayerState, trainerId: string): boolean {
  return p.defeatedTrainers.includes(trainerId);
}

export interface TrainerSetup { player: PlayerState; battle: BattleState; events: BattleEvent[]; trainer: TrainerData }

/** Start a trainer battle. The battle seed is drawn from the player's rng stream. */
export function startTrainerBattle(p0: PlayerState, trainerId: string): TrainerSetup {
  const trainer = getTrainer(trainerId);
  const p = structuredClone(p0);
  const rng = new Rng(p.rng);
  const seed = (rng.next() * 2 ** 32) >>> 0;
  p.rng = rng.state;
  const { state, events } = createBattle('trainer', seed,
    { name: p.name, controller: 'human', party: p.party.map(toBattle) },
    trainerSide(trainerId));
  return { player: p, battle: state, events, trainer };
}

export interface TrainerVictory {
  player: PlayerState;
  reward: number;
  /** Route ids that were locked before this win and are open now. */
  unlocked: string[];
  /** True when this win made the player Champion for the first time. */
  crowned: boolean;
}

/** Record a trainer win: money, defeated list, Champion flag, newly opened routes. */
export function trainerVictory(p0: PlayerState, trainerId: string): TrainerVictory {
  const t = getTrainer(trainerId);
  const routes = [...getDex().routes.values()];
  const lockedBefore = routes.filter((r) => !isRouteUnlocked(p0, r.id)).map((r) => r.id);
  const p = structuredClone(p0);
  const first = !p.defeatedTrainers.includes(trainerId);
  const reward = first ? t.reward : 0;
  p.money += reward;
  if (first) p.defeatedTrainers.push(trainerId);
  const crowned = trainerId === CHAMPION_ID && !p.champion;
  if (trainerId === CHAMPION_ID) p.champion = true;
  const unlocked = lockedBefore.filter((id) => isRouteUnlocked(p, id));
  return { player: p, reward, unlocked, crowned };
}

/** Trainers still standing between the player and a route ("Beat Pim" on a locked tab). */
export function routeBlockers(p: PlayerState, route: RouteData): TrainerData[] {
  return (route.unlockAfter ?? []).filter((id) => !p.defeatedTrainers.includes(id)).map(getTrainer);
}

/** Whiteout after losing: heal everything, no penalty. */
export function blackout(p: PlayerState): PlayerState {
  return healParty(p);
}

// ------------------------------------------------------------------ bag & xp display

/** Remove one of a bag item / orb. Throws if none are left. */
export function consumeBag(p0: PlayerState, id: BagId): PlayerState {
  if ((p0.bag[id] ?? 0) <= 0) throw new Error(`no ${id} left`);
  const p = structuredClone(p0);
  p.bag[id] = (p.bag[id] ?? 0) - 1;
  return p;
}

/** 0..1 progress through the current level (1 at the level cap). */
export function xpProgress(level: number, xp: number): number {
  if (level >= LEVEL_CAP) return 1;
  const lo = xpForLevel(level);
  const hi = xpForLevel(level + 1);
  return Math.max(0, Math.min(1, (xp - lo) / (hi - lo)));
}

/** "m:ss" or "h:mm:ss" for a play time in seconds. */
export function formatPlayTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  const two = (n: number) => String(n).padStart(2, '0');
  return hh > 0 ? `${hh}:${two(mm)}:${two(ss)}` : `${mm}:${two(ss)}`;
}

// ------------------------------------------------------------------ debug

export interface DebugEntry { species: string; level: number }

/** Replace the party with fresh creatures (debug/test hook). */
export function withDebugParty(p0: PlayerState, entries: readonly DebugEntry[]): PlayerState {
  const p = structuredClone(p0);
  p.party = entries.slice(0, 6).map((e) => makeCreature(e.species, e.level, `c${p.nextUid++}`));
  for (const c of p.party) markCaught(p, c.species);
  return p;
}

/** Mark trainers as defeated without battling (debug/test hook). Champion sets the flag too. */
export function withDefeated(p0: PlayerState, trainerIds: readonly string[]): PlayerState {
  const p = structuredClone(p0);
  for (const id of trainerIds) {
    getTrainer(id);
    if (!p.defeatedTrainers.includes(id)) p.defeatedTrainers.push(id);
    if (id === CHAMPION_ID) p.champion = true;
  }
  return p;
}
