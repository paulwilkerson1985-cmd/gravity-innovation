// Battle AI. Decisions use a PRNG derived from (battle rng, turn, side) so that
// choosing an action never advances the battle's own random stream.
//
// Tiers
// - rookie:  random legal move; random replacement.
// - skilled: best expected damage; replacement with the best matchup.
// - ace:     shallow search. Every candidate (each usable move, plus one switch when the
//            current matchup is clearly bad) is played against the foe's two most likely
//            replies on cloned states via resolveTurn, under derived seeds, and the resulting
//            positions are scored (HP, KOs, statuses, stat stages, who wins the active 1-v-1).
//            Status and setup moves therefore get picked exactly when they pay off.
import { active, legalActions, resolveTurn } from './battle';
import { baseDamage, effectiveStat } from './damage';
import { move as getMove } from './dex';
import { DESPERATION } from '../data/moves';
import { Rng, hashSeed } from './rng';
import type { Action, AiTier, BattleCreature, BattleState, MoveData } from './types';

type MoveAction = Extract<Action, { type: 'move' }>;
type SwitchAction = Extract<Action, { type: 'switch' }>;

const other = (side: 0 | 1): 0 | 1 => (side === 0 ? 1 : 0);

function aiRng(state: BattleState, side: 0 | 1): Rng {
  return new Rng(hashSeed(state.rng, state.turn, side, state.phase === 'replace' ? 7 : 3));
}

/** Expected damage of move `m` from `att` to `def` (accuracy, STAB, type; mean roll, no crit). */
function expectedHit(att: BattleCreature, def: BattleCreature, m: MoveData): number {
  if (m.category !== 'attack') return 0;
  const { base, mult, stab } = baseDamage(att, def, m);
  return base * stab * mult * 0.925 * (m.accuracy / 100);
}

/** Expected damage of a move including accuracy, STAB and type (no crit, mean roll). */
export function expectedDamage(state: BattleState, side: 0 | 1, moveIndex: number): number {
  const me = active(state, side);
  const foe = active(state, other(side));
  const m = moveIndex < 0 ? DESPERATION : getMove(me.moves[moveIndex]!.id);
  return expectedHit(me, foe, m);
}

/** Best expected damage per turn `att` can deal to `def` with the moves it has PP for. */
function bestDamage(att: BattleCreature, def: BattleCreature): number {
  let best = 0;
  let any = false;
  for (const slot of att.moves) {
    if (slot.pp <= 0) continue;
    any = true;
    best = Math.max(best, expectedHit(att, def, getMove(slot.id)));
  }
  return any ? best : expectedHit(att, def, DESPERATION);
}

/**
 * Who wins a straight 1-v-1 between `mine` and `foe`, in [-1, 1] (positive = mine).
 * Compares expected turns-to-KO each way, with speed as a tie-breaker and status folded in.
 */
export function matchup(mine: BattleCreature, foe: BattleCreature): number {
  if (mine.hp <= 0) return -1;
  if (foe.hp <= 0) return 1;
  let myDmg = bestDamage(mine, foe) + (foe.status === 'burn' ? foe.stats.hp / 16 : 0);
  let foeDmg = bestDamage(foe, mine) + (mine.status === 'burn' ? mine.stats.hp / 16 : 0);
  if (mine.status === 'shock') myDmg *= 0.75;
  if (foe.status === 'shock') foeDmg *= 0.75;
  let myTurns = foe.hp / Math.max(myDmg, 0.5);
  let foeTurns = mine.hp / Math.max(foeDmg, 0.5);
  if (mine.status === 'drowsy') myTurns += Math.max(0, mine.sleepTurns - 1);
  if (foe.status === 'drowsy') foeTurns += Math.max(0, foe.sleepTurns - 1);
  const ms = effectiveStat(mine, 'spe');
  const fs = effectiveStat(foe, 'spe');
  const tempo = ms > fs ? 0.5 : ms < fs ? -0.5 : 0;
  return Math.max(-1, Math.min(1, (foeTurns - myTurns + tempo) / (foeTurns + myTurns + 1)));
}

/** Matchup of a (benched or active) creature against the foe's active, or its whole team if that one is down. */
function matchupVsSide(state: BattleState, c: BattleCreature, foeSide: 0 | 1): number {
  const foe = active(state, foeSide);
  if (foe.hp > 0) return matchup(c, foe);
  const alive = state.sides[foeSide].party.filter((x) => x.hp > 0);
  if (!alive.length) return 1;
  return alive.reduce((n, f) => n + matchup(c, f), 0) / alive.length;
}

function bestSwitch(state: BattleState, side: 0 | 1, options: SwitchAction[]): { a: SwitchAction; score: number } | null {
  let best: { a: SwitchAction; score: number } | null = null;
  for (const a of options) {
    const c = state.sides[side].party[a.to]!;
    const score = matchupVsSide(state, c, other(side)) + 0.1 * (c.hp / c.stats.hp);
    if (!best || score > best.score) best = { a, score };
  }
  return best;
}

// ------------------------------------------------------------------ ace search

const WIN = 1000;

/** Static evaluation of a position from `side`'s point of view. */
export function evaluate(state: BattleState, side: 0 | 1): number {
  if (state.outcome) {
    if (state.outcome.winner === side) return WIN;
    if (state.outcome.winner === null) return 0;
    return -WIN;
  }
  let score = 0;
  for (const s of [0, 1] as const) {
    const sign = s === side ? 1 : -1;
    for (const c of state.sides[s].party) {
      if (c.hp <= 0) continue;
      score += sign * (1 + c.hp / c.stats.hp);
      if (c.status) score -= sign * 0.25;
    }
    const a = active(state, s);
    if (a.hp > 0) score += sign * (0.15 * a.stages.atk + 0.1 * a.stages.def + 0.08 * a.stages.spe);
  }
  const mine = activeOrBest(state, side);
  const foe = activeOrBest(state, other(side));
  if (mine && foe) score += 1.0 * matchup(mine, foe);
  return score;
}

/** The active creature, or (if it is down) the bench creature most likely to be sent next. */
function activeOrBest(state: BattleState, side: 0 | 1): BattleCreature | null {
  const a = active(state, side);
  if (a.hp > 0) return a;
  const alive = state.sides[side].party.filter((c) => c.hp > 0);
  if (!alive.length) return null;
  const foe = active(state, other(side));
  return alive.reduce((b, c) => (matchup(c, foe) > matchup(b, foe) ? c : b));
}

/** The foe's most plausible replies: its two strongest-looking moves. */
function likelyReplies(state: BattleState, foeSide: 0 | 1): Action[] {
  const legal = legalActions(state, foeSide).filter((a): a is MoveAction => a.type === 'move');
  if (legal.length <= 2) return legal.length ? legal : [{ type: 'pass' }];
  const me = active(state, foeSide);
  const target = active(state, other(foeSide));
  const score = (a: MoveAction) => {
    if (a.index < 0) return 0;
    const m = getMove(me.moves[a.index]!.id);
    if (m.category === 'attack') return expectedHit(me, target, m);
    const e = m.effect;
    if (e?.kind === 'status') return target.status ? 0 : target.stats.hp * 0.15;
    if (e?.kind === 'heal') return me.hp < me.stats.hp / 2 ? me.stats.hp * 0.3 : 0;
    return target.stats.hp * 0.08;
  };
  return legal.map((a) => ({ a, s: score(a) })).sort((x, y) => y.s - x.s).slice(0, 2).map((x) => x.a);
}

const SEARCH_SEEDS = 2;

function aceChoose(state: BattleState, side: 0 | 1, legal: Action[]): Action {
  const foeSide = other(side);
  const me = active(state, side);
  const foe = active(state, foeSide);
  const candidates: Action[] = legal.filter((a) => a.type === 'move');

  // Consider one switch, only out of a clearly bad matchup and never right after switching.
  const switches = legal.filter((a): a is SwitchAction => a.type === 'switch');
  const recentlySwitched = state.turn - (state.sides[side].lastSwitchTurn ?? -99) <= 2;
  const now = matchup(me, foe);
  if (switches.length && !recentlySwitched && now < -0.25 && me.hp / me.stats.hp > 0.25) {
    const best = bestSwitch(state, side, switches);
    if (best && best.score > now + 0.5 && best.score > 0) candidates.push(best.a);
  }
  if (candidates.length === 1) return candidates[0]!;

  const replies = likelyReplies(state, foeSide);
  const seeds = Array.from({ length: SEARCH_SEEDS }, (_, k) => hashSeed(state.rng, state.turn, side, 0xace, k));
  let bestA = candidates[0]!;
  let bestScore = -Infinity;
  for (const a of candidates) {
    let sum = 0;
    let worst = Infinity;
    for (const r of replies) {
      let v = 0;
      for (const seed of seeds) {
        const pair: [Action, Action] = side === 0 ? [a, r] : [r, a];
        v += evaluate(resolveTurn({ ...state, rng: seed }, pair).state, side);
      }
      v /= seeds.length;
      sum += v;
      worst = Math.min(worst, v);
    }
    const score = 0.5 * (sum / replies.length) + 0.5 * worst;
    if (score > bestScore + 1e-9) { bestScore = score; bestA = a; }
  }
  return bestA;
}

export function chooseAction(state: BattleState, side: 0 | 1, tier: AiTier = 'rookie'): Action {
  const legal = legalActions(state, side);
  if (legal.length === 0) throw new Error('no legal actions');
  const rng = aiRng(state, side);
  if (state.phase === 'replace') {
    if (tier === 'rookie') return rng.pick(legal);
    const switches = legal.filter((a): a is SwitchAction => a.type === 'switch');
    return bestSwitch(state, side, switches)?.a ?? legal[0]!;
  }

  const moves = legal.filter((a): a is MoveAction => a.type === 'move');
  if (tier === 'rookie' || moves.length === 0) return rng.pick(moves.length ? moves : legal);
  if (tier === 'ace') return aceChoose(state, side, legal);

  // Skilled: best expected damage.
  const scored = moves.map((a) => ({ a, score: expectedDamage(state, side, a.index) }));
  scored.sort((x, y) => y.score - x.score);
  return scored[0]!.a;
}
