// Arena team-builder logic (pure: no DOM, no three). The builder UI in arena.ts only calls
// these helpers, so the rules are unit-tested in tests/arena-team.test.ts.
import { RENTALS, type RentalData } from '../data/rentals';
import {
  ARENA_LEVEL, ARENA_TEAM_SIZE, Rng, calcStats, fromOwned, getDex, learnableMoves, movesAtLevel, species, validateArenaTeam,
  type ArenaEntry, type OwnedCreature, type Stats,
} from '../engine';

export type PickSource = 'rental' | 'owned';

/** One pickable kin in the builder's lists. */
export interface Pick {
  key: string;
  source: PickSource;
  entry: ArenaEntry;
  /** Level in the player's collection (owned only) — the arena normalises it to ARENA_LEVEL. */
  ownedLevel?: number;
}

export const MAX_MOVES = 4;

export function rentalPick(r: RentalData): Pick {
  return { key: r.id, source: 'rental', entry: { species: r.species, moves: [...r.moves], uid: r.id } };
}

export function rentalPicks(): Pick[] {
  return RENTALS.map(rentalPick);
}

/** The player's collection (party first, then box) as arena picks. Moves are cleaned to what is legal at L30. */
export function ownedPicks(party: OwnedCreature[], box: OwnedCreature[]): Pick[] {
  return [...party, ...box].filter((c) => getDex().species.has(c.species)).map((c) => {
    const e = fromOwned(c);
    const ok = learnableMoves(c.species, ARENA_LEVEL);
    let moves = [...new Set(e.moves)].filter((m) => ok.includes(m)).slice(0, MAX_MOVES);
    if (moves.length === 0) moves = defaultMoves(c.species);
    return { key: `own-${c.uid}`, source: 'owned', entry: { ...e, uid: `own-${c.uid}`, moves }, ownedLevel: c.level };
  });
}

/** Moves a species would know at the arena level by default. */
export function defaultMoves(speciesId: string): string[] {
  return movesAtLevel(speciesId, ARENA_LEVEL);
}

export function arenaStats(speciesId: string): Stats {
  return calcStats(speciesId, ARENA_LEVEL);
}

export function displayName(e: ArenaEntry): string {
  return e.nickname ?? species(e.species).name;
}

export type ToggleResult = { moves: string[]; error?: string };

/** Toggle a move on an entry, keeping 1..4 moves (in learnset order of selection). */
export function toggleMove(entry: ArenaEntry, moveId: string): ToggleResult {
  const has = entry.moves.includes(moveId);
  if (has) {
    if (entry.moves.length <= 1) return { moves: entry.moves, error: 'Each kin needs at least one move.' };
    return { moves: entry.moves.filter((m) => m !== moveId) };
  }
  if (!learnableMoves(entry.species, ARENA_LEVEL).includes(moveId)) return { moves: entry.moves, error: `${species(entry.species).name} can't learn that move by Lv ${ARENA_LEVEL}.` };
  if (entry.moves.length >= MAX_MOVES) return { moves: entry.moves, error: `Up to ${MAX_MOVES} moves — tap one to drop it first.` };
  return { moves: [...entry.moves, moveId] };
}

export type AddResult = { team: ArenaEntry[]; index: number; error?: string };

/** Add a pick to the team (or report why not). Returns the index of the pick in the team. */
export function addToTeam(team: ArenaEntry[], pick: Pick): AddResult {
  const at = team.findIndex((e) => e.uid === pick.entry.uid);
  if (at >= 0) return { team, index: at };
  if (team.length >= ARENA_TEAM_SIZE) return { team, index: -1, error: `Your team is full (${ARENA_TEAM_SIZE} kin). Remove one first.` };
  const dup = team.find((e) => e.species === pick.entry.species);
  if (dup) return { team, index: -1, error: `You already have a ${species(dup.species).name} — each kin on a team must be a different species.` };
  return { team: [...team, structuredClone(pick.entry)], index: team.length };
}

export function removeFromTeam(team: ArenaEntry[], index: number): ArenaEntry[] {
  return team.filter((_, i) => i !== index);
}

/** Move an entry from one slot to another (slot 0 is the lead). */
export function moveSlot(team: ArenaEntry[], from: number, to: number): ArenaEntry[] {
  if (from === to || from < 0 || to < 0 || from >= team.length || to >= team.length) return team;
  const out = [...team];
  const [e] = out.splice(from, 1);
  out.splice(to, 0, e!);
  return out;
}

export function setMoves(team: ArenaEntry[], index: number, moves: string[]): ArenaEntry[] {
  return team.map((e, i) => (i === index ? { ...e, moves } : e));
}

/** Player-facing problems with a team, most important first (empty = ready to lock in). */
export function teamProblems(team: ArenaEntry[]): string[] {
  const out: string[] = [];
  if (team.length < ARENA_TEAM_SIZE) {
    const n = ARENA_TEAM_SIZE - team.length;
    out.push(`Pick ${n} more kin (${team.length}/${ARENA_TEAM_SIZE}).`);
  }
  const seen = new Set<string>();
  for (const e of team) {
    const name = displayName(e);
    if (seen.has(e.species)) out.push(`Two ${species(e.species).name} — every kin must be a different species.`);
    seen.add(e.species);
    if (e.moves.length === 0) out.push(`${name} needs at least one move.`);
    if (e.moves.length > MAX_MOVES) out.push(`${name} can only bring ${MAX_MOVES} moves.`);
    const ok = learnableMoves(e.species, ARENA_LEVEL);
    const bad = e.moves.filter((m) => !ok.includes(m));
    if (bad.length) out.push(`${name} can't learn ${bad.length === 1 ? 'one of its moves' : 'some of its moves'} by Lv ${ARENA_LEVEL}.`);
  }
  // Belt and braces: the engine's validator is the final word.
  if (out.length === 0 && validateArenaTeam(team).length) out.push('This team breaks the arena rules.');
  return out;
}

/** A random valid rental team (for the CPU), deterministic for a seed. */
export function randomRentalTeam(seed: number, avoidSpecies: string[] = []): ArenaEntry[] {
  const rng = new Rng(seed);
  const pool = RENTALS.filter((r) => !avoidSpecies.includes(r.species));
  const src = pool.length >= ARENA_TEAM_SIZE ? pool : [...RENTALS];
  const picks: RentalData[] = [];
  while (picks.length < ARENA_TEAM_SIZE) {
    const r = rng.pick(src);
    if (!picks.includes(r)) picks.push(r);
  }
  return picks.map((r) => rentalPick(r).entry);
}
