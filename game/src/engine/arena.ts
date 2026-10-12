// Arena (PvP) rules: fixed level, 3-kin teams, no items/catching/running.
import { createBattle } from './battle';
import { calcStats, learnableMoves } from './creature';
import { getDex, move as getMove, species } from './dex';
import type { BattleCreature, BattleEvent, BattleState, OwnedCreature } from './types';

export const ARENA_LEVEL = 30;
export const ARENA_TEAM_SIZE = 3;

export interface ArenaEntry { species: string; moves: string[]; nickname?: string; uid: string }

/** A battle-ready creature at ARENA_LEVEL with full HP and PP. */
export function arenaCreature(entry: ArenaEntry): BattleCreature {
  const s = species(entry.species);
  const stats = calcStats(entry.species, ARENA_LEVEL);
  return {
    uid: entry.uid,
    species: entry.species,
    name: entry.nickname ?? s.name,
    level: ARENA_LEVEL,
    types: [...s.types],
    stats,
    hp: stats.hp,
    moves: entry.moves.map((id) => {
      const pp = getMove(id).pp;
      return { id, pp, maxPp: pp };
    }),
    status: null,
    sleepTurns: 0,
    stages: { atk: 0, def: 0, spe: 0 },
  };
}

/** Problems with a single entry (empty when valid). */
export function validateArenaEntry(e: ArenaEntry): string[] {
  const errors: string[] = [];
  const sp = getDex().species.get(e.species);
  if (!sp) return [`unknown species ${e.species}`];
  if (!e.uid) errors.push(`${sp.name}: missing uid`);
  if (e.moves.length < 1 || e.moves.length > 4) errors.push(`${sp.name}: needs 1–4 moves`);
  if (new Set(e.moves).size !== e.moves.length) errors.push(`${sp.name}: repeated move`);
  const ok = learnableMoves(e.species, ARENA_LEVEL);
  for (const m of e.moves) if (!ok.includes(m)) errors.push(`${sp.name}: cannot learn ${m}`);
  return errors;
}

/** Problems with a team (empty when valid). */
export function validateArenaTeam(team: ArenaEntry[]): string[] {
  const errors: string[] = [];
  if (team.length !== ARENA_TEAM_SIZE) errors.push(`team needs exactly ${ARENA_TEAM_SIZE} kin (has ${team.length})`);
  const seen = new Set<string>();
  const uids = new Set<string>();
  for (const e of team) {
    if (seen.has(e.species)) errors.push(`duplicate species ${e.species}`);
    seen.add(e.species);
    if (uids.has(e.uid)) errors.push(`duplicate uid ${e.uid}`);
    uids.add(e.uid);
    errors.push(...validateArenaEntry(e));
  }
  return errors;
}

/** Owned creature → arena entry (keeps species, moves, nickname, uid; level/HP are normalised). */
export function fromOwned(c: OwnedCreature): ArenaEntry {
  return { species: c.species, moves: c.moves.map((m) => m.id), uid: c.uid, ...(c.nickname ? { nickname: c.nickname } : {}) };
}

/**
 * A PvP battle between two validated teams. Both sides are human-controlled; no items,
 * catching or running. Side B's uids are prefixed if they collide with side A's.
 * Throws if either team is invalid.
 */
export function createArenaBattle(
  seed: number, nameA: string, teamA: ArenaEntry[], nameB: string, teamB: ArenaEntry[],
): { state: BattleState; events: BattleEvent[] } {
  for (const [name, team] of [[nameA, teamA], [nameB, teamB]] as const) {
    const errs = validateArenaTeam(team);
    if (errs.length) throw new Error(`${name}'s team is invalid: ${errs.join('; ')}`);
  }
  const aUids = new Set(teamA.map((e) => e.uid));
  const partyB = teamB.map((e) => arenaCreature(aUids.has(e.uid) ? { ...e, uid: `b:${e.uid}` } : e));
  return createBattle('pvp', seed,
    { name: nameA, controller: 'human', party: teamA.map(arenaCreature) },
    { name: nameB, controller: 'human', party: partyB },
    { rules: { items: false, catch: false, run: false } });
}
