// Battle AI. Decisions use a PRNG derived from (battle rng, turn, side) so that
// choosing an action never advances the battle's own random stream.
import { active, legalActions } from './battle';
import { baseDamage } from './damage';
import { move as getMove } from './dex';
import { DESPERATION } from '../data/moves';
import { Rng, hashSeed } from './rng';
import type { Action, AiTier, BattleState } from './types';

function aiRng(state: BattleState, side: 0 | 1): Rng {
  return new Rng(hashSeed(state.rng, state.turn, side, state.phase === 'replace' ? 7 : 3));
}

/** Expected damage of a move including accuracy, STAB and type (no crit, mean roll). */
export function expectedDamage(state: BattleState, side: 0 | 1, moveIndex: number): number {
  const me = active(state, side);
  const foe = active(state, side === 0 ? 1 : 0);
  const m = moveIndex < 0 ? DESPERATION : getMove(me.moves[moveIndex]!.id);
  if (m.category !== 'attack') return 0;
  const { base, mult, stab } = baseDamage(me, foe, m);
  return base * stab * mult * 0.925 * (m.accuracy / 100);
}

export function chooseAction(state: BattleState, side: 0 | 1, tier: AiTier = 'rookie'): Action {
  const legal = legalActions(state, side);
  if (legal.length === 0) throw new Error('no legal actions');
  const rng = aiRng(state, side);
  // Replacement after a faint: pick a random healthy creature (rookie) or the first one.
  if (state.phase === 'replace') return tier === 'rookie' ? rng.pick(legal) : legal[0]!;

  const moves = legal.filter((a): a is Extract<Action, { type: 'move' }> => a.type === 'move');
  if (tier === 'rookie' || moves.length === 0) return rng.pick(moves.length ? moves : legal);

  // Skilled (and Ace until M4): best expected damage, small chance to use a status move early.
  const scored = moves.map((a) => ({ a, score: expectedDamage(state, side, a.index) }));
  scored.sort((x, y) => y.score - x.score);
  return scored[0]!.a;
}
