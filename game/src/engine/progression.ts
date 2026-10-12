// Experience, levelling, move learning and evolution. Pure functions over OwnedCreature.
import { LEVEL_CAP, calcStats, learnableMoves, xpForLevel } from './creature';
import { move as getMove, species } from './dex';
import type { BattleState, OwnedCreature, Stats } from './types';

export type ProgressEvent =
  | { t: 'xp'; uid: string; name: string; amount: number; xp: number }
  | { t: 'levelUp'; uid: string; name: string; level: number; before: Stats; after: Stats }
  | { t: 'learned'; uid: string; name: string; move: string; moveName: string }
  /** Creature already knows 4 moves: the UI should ask which to forget, then call learnMove. */
  | { t: 'moveOffer'; uid: string; name: string; move: string; moveName: string }
  | { t: 'canEvolve'; uid: string; name: string; into: string; intoName: string };

const nameOf = (c: OwnedCreature) => c.nickname ?? species(c.species).name;

/**
 * XP yield = ⌊xpYield · L · (L + XP_LEVEL_OFFSET) / XP_DIVISOR · (TRAINER_XP_BONUS if trainer)⌋.
 * The (L + offset) term makes yield grow a little faster than linearly, so late levels on the
 * level³ curve don't need several times more battles than early ones. Tuned in docs/BALANCE.md.
 */
export const XP_DIVISOR = 270;
export const XP_LEVEL_OFFSET = 25;
export const TRAINER_XP_BONUS = 1.5;
/** Fraction of a foe's yield given to each conscious party member that did not face it. */
export const BENCH_XP_SHARE = 0.5;

/** XP a defeated creature is worth. Trainer-owned foes give TRAINER_XP_BONUS×. */
export function xpYieldFor(speciesId: string, level: number, fromTrainer: boolean): number {
  const base = (species(speciesId).xpYield * level * (level + XP_LEVEL_OFFSET)) / XP_DIVISOR;
  return Math.floor(base * (fromTrainer ? TRAINER_XP_BONUS : 1));
}

/**
 * XP earned by side 0 in a finished battle, keyed by creature uid. Each fainted foe's yield is
 * split evenly (floor, min 1) among the side-0 creatures that faced it and are still conscious;
 * every other conscious party member gets ⌊yield · BENCH_XP_SHARE⌋ ("the rest of the party
 * watched and learned"), so a casual player's team keeps pace without lead micro-management.
 * PvP battles award nothing.
 */
export function awardXp(battle: BattleState): Record<string, number> {
  const out: Record<string, number> = {};
  if (battle.kind === 'pvp') return out;
  const mine = battle.sides[0].party;
  const fromTrainer = !battle.sides[1].isWild;
  for (const foe of battle.sides[1].party) {
    if (foe.hp > 0) continue;
    const faced = battle.participants[foe.uid] ?? [];
    const eligible = faced.filter((uid) => (mine.find((c) => c.uid === uid)?.hp ?? 0) > 0);
    if (eligible.length === 0) continue;
    const total = xpYieldFor(foe.species, foe.level, fromTrainer);
    const share = Math.max(1, Math.floor(total / eligible.length));
    for (const uid of eligible) out[uid] = (out[uid] ?? 0) + share;
    const bench = Math.floor(total * BENCH_XP_SHARE);
    if (bench <= 0) continue;
    for (const c of mine) {
      if (c.hp > 0 && !faced.includes(c.uid)) out[c.uid] = (out[c.uid] ?? 0) + bench;
    }
  }
  return out;
}

export function canEvolveNow(c: OwnedCreature): boolean {
  const evo = species(c.species).evolvesTo;
  return !!evo && c.level >= evo.level;
}

/** Add XP, levelling up (to LEVEL_CAP) and learning moves as the learnset allows. */
export function gainXp(c0: OwnedCreature, amount: number): { creature: OwnedCreature; events: ProgressEvent[] } {
  const c = structuredClone(c0);
  const name = nameOf(c);
  const events: ProgressEvent[] = [];
  const capXp = xpForLevel(LEVEL_CAP);
  const before = c.xp;
  c.xp = Math.min(capXp, c.xp + Math.max(0, Math.floor(amount)));
  events.push({ t: 'xp', uid: c.uid, name, amount: c.xp - before, xp: c.xp });
  let levelled = false;
  while (c.level < LEVEL_CAP && c.xp >= xpForLevel(c.level + 1)) {
    const prev = calcStats(c.species, c.level);
    c.level++;
    levelled = true;
    const next = calcStats(c.species, c.level);
    if (c.hp > 0) c.hp = Math.min(next.hp, c.hp + (next.hp - prev.hp));
    events.push({ t: 'levelUp', uid: c.uid, name, level: c.level, before: prev, after: next });
    for (const [lvl, id] of species(c.species).learnset) {
      if (lvl !== c.level || c.moves.some((m) => m.id === id)) continue;
      const m = getMove(id);
      if (c.moves.length < 4) {
        c.moves.push({ id, pp: m.pp });
        events.push({ t: 'learned', uid: c.uid, name, move: id, moveName: m.name });
      } else {
        events.push({ t: 'moveOffer', uid: c.uid, name, move: id, moveName: m.name });
      }
    }
  }
  if (levelled && canEvolveNow(c)) {
    const into = species(c.species).evolvesTo!.species;
    events.push({ t: 'canEvolve', uid: c.uid, name, into, intoName: species(into).name });
  }
  return { creature: c, events };
}

/** Evolve into the next form. HP rises by the max-HP gain; moves, XP and nickname are kept. */
export function evolve(c: OwnedCreature): OwnedCreature {
  if (!canEvolveNow(c)) throw new Error(`${nameOf(c)} cannot evolve yet`);
  const into = species(c.species).evolvesTo!.species;
  const prev = calcStats(c.species, c.level);
  const next = calcStats(into, c.level);
  const out = structuredClone(c);
  out.species = into;
  if (out.hp > 0) out.hp = Math.max(1, Math.min(next.hp, out.hp + (next.hp - prev.hp)));
  return out;
}

/**
 * Teach a move. `replaceIndex` = slot to overwrite (or any index ≥ moves.length to append when
 * fewer than 4 are known); `null` skips learning and returns an unchanged copy.
 */
export function learnMove(c: OwnedCreature, moveId: string, replaceIndex: number | null): OwnedCreature {
  const out = structuredClone(c);
  if (replaceIndex === null) return out;
  if (!learnableMoves(c.species, c.level).includes(moveId)) throw new Error(`${nameOf(c)} cannot learn ${moveId}`);
  if (c.moves.some((m) => m.id === moveId)) throw new Error(`${nameOf(c)} already knows ${moveId}`);
  if (!Number.isInteger(replaceIndex) || replaceIndex < 0 || replaceIndex > 3) throw new Error(`bad move slot ${replaceIndex}`);
  const slot = { id: moveId, pp: getMove(moveId).pp };
  if (replaceIndex < out.moves.length) out.moves[replaceIndex] = slot;
  else if (out.moves.length < 4) out.moves.push(slot);
  else throw new Error(`bad move slot ${replaceIndex}`);
  return out;
}
