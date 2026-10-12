// Turning trainer data into a battle side.
import type { SideInit } from './battle';
import { makeCreature, toBattle } from './creature';
import { getTrainer, move as getMove } from './dex';
import type { BattleCreature } from './types';

/** The trainer's party as battle creatures (uids `${trainerId}-${index}`), full HP. */
export function trainerParty(trainerId: string): BattleCreature[] {
  const t = getTrainer(trainerId);
  return t.party.map((p, i) => {
    const owned = makeCreature(p.species, p.level, `${t.id}-${i}`);
    if (p.moves) owned.moves = p.moves.map((id) => ({ id, pp: getMove(id).pp }));
    return toBattle(owned);
  });
}

/** Ready-to-use side 1 for createBattle('trainer', …). */
export function trainerSide(trainerId: string): SideInit {
  const t = getTrainer(trainerId);
  return { name: `${t.title} ${t.name}`, controller: 'ai', ai: t.ai, isWild: false, party: trainerParty(trainerId) };
}

/** Whether a route is open given the set of defeated trainer ids. */
export function routeUnlocked(unlockAfter: readonly string[] | undefined, defeated: readonly string[]): boolean {
  return (unlockAfter ?? []).every((id) => defeated.includes(id));
}
