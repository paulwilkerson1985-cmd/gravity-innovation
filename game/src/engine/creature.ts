import { move, species } from './dex';
import type { BattleCreature, OwnedCreature, Stats } from './types';

export const LEVEL_CAP = 30;

export function calcStats(speciesId: string, level: number): Stats {
  const b = species(speciesId).base;
  const other = (base: number) => Math.floor((2 * base * level) / 100) + 5;
  return {
    hp: Math.floor((2 * b.hp * level) / 100) + level + 10,
    atk: other(b.atk),
    def: other(b.def),
    spe: other(b.spe),
  };
}

/** The (up to) four most recent moves a species knows at a level. */
export function movesAtLevel(speciesId: string, level: number): string[] {
  const known: string[] = [];
  for (const [lvl, id] of species(speciesId).learnset) {
    if (lvl > level) break;
    if (known.includes(id)) continue;
    known.push(id);
    if (known.length > 4) known.shift();
  }
  return known;
}

export function makeCreature(speciesId: string, level: number, uid: string): OwnedCreature {
  const stats = calcStats(speciesId, level);
  return {
    uid,
    species: speciesId,
    level,
    xp: xpForLevel(level),
    hp: stats.hp,
    moves: movesAtLevel(speciesId, level).map((id) => ({ id, pp: move(id).pp })),
    status: null,
  };
}

/** Medium-fast style curve: level³. */
export function xpForLevel(level: number): number {
  return level ** 3;
}

export function toBattle(c: OwnedCreature): BattleCreature {
  const s = species(c.species);
  const stats = calcStats(c.species, c.level);
  return {
    uid: c.uid,
    species: c.species,
    name: c.nickname ?? s.name,
    level: c.level,
    types: [...s.types],
    stats,
    hp: Math.min(c.hp, stats.hp),
    moves: c.moves.map((m) => ({ id: m.id, pp: m.pp, maxPp: move(m.id).pp })),
    status: c.status,
    sleepTurns: c.status === 'drowsy' ? 2 : 0,
    stages: { atk: 0, def: 0, spe: 0 },
  };
}

/** Copy battle results (HP, PP, status) back onto an owned creature. */
export function syncFromBattle(owned: OwnedCreature, b: BattleCreature): OwnedCreature {
  return {
    ...owned,
    hp: b.hp,
    status: b.status,
    moves: b.moves.map((m) => ({ id: m.id, pp: m.pp })),
  };
}

export function healFully(c: OwnedCreature): OwnedCreature {
  return {
    ...c,
    hp: calcStats(c.species, c.level).hp,
    status: null,
    moves: c.moves.map((m) => ({ id: m.id, pp: move(m.id).pp })),
  };
}
