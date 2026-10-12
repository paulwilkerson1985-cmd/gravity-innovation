// The battle rules engine: resolveTurn(state, actions) → { state, events }.
// Pure: never mutates its input, all randomness from state.rng.
import { ORBS, catchProbability, rollCatch } from './catch';
import { MAX_STAGE, effectiveStat, rollDamage } from './damage';
import { move as getMove, species } from './dex';
import { DESPERATION } from '../data/moves';
import { Rng } from './rng';
import type {
  Action, BattleCreature, BattleEvent, BattleKind, BattleState, MoveData, Side, TurnResult,
} from './types';

export const DEFAULT_TURN_LIMIT = 300;

export interface SideInit {
  name: string;
  controller: 'human' | 'ai';
  ai?: Side['ai'];
  isWild?: boolean;
  party: BattleCreature[];
}

export function createBattle(kind: BattleKind, seed: number, a: SideInit, b: SideInit): { state: BattleState; events: BattleEvent[] } {
  const mk = (s: SideInit): Side => {
    const first = s.party.findIndex((c) => c.hp > 0);
    if (first < 0) throw new Error(`${s.name} has no conscious creatures`);
    return {
      name: s.name,
      controller: s.controller,
      ...(s.ai ? { ai: s.ai } : {}),
      isWild: s.isWild ?? false,
      party: structuredClone(s.party),
      active: first,
    };
  };
  const state: BattleState = {
    v: 1, kind, rng: seed >>> 0, turn: 0, phase: 'choose',
    sides: [mk(a), mk(b)], runAttempts: 0, participants: {}, outcome: null, turnLimit: DEFAULT_TURN_LIMIT,
  };
  const events: BattleEvent[] = [sendEvent(state, 1), sendEvent(state, 0)];
  noteParticipation(state);
  return { state, events };
}

export function active(state: BattleState, side: 0 | 1): BattleCreature {
  const s = state.sides[side];
  const c = s.party[s.active];
  if (!c) throw new Error('no active creature');
  return c;
}

const other = (side: 0 | 1): 0 | 1 => (side === 0 ? 1 : 0);

function sendEvent(state: BattleState, side: 0 | 1): BattleEvent {
  const c = active(state, side);
  return { t: 'send', side, slot: state.sides[side].active, name: c.name, species: c.species, hp: c.hp, maxHp: c.stats.hp, level: c.level, status: c.status };
}

function noteParticipation(state: BattleState) {
  const foe = active(state, 1);
  const mine = active(state, 0);
  const list = (state.participants[foe.uid] ??= []);
  if (mine.hp > 0 && !list.includes(mine.uid)) list.push(mine.uid);
}

export function needsReplacement(state: BattleState, side: 0 | 1): boolean {
  const s = state.sides[side];
  return active(state, side).hp <= 0 && s.party.some((c) => c.hp > 0);
}

/** All actions a side may legally submit right now. */
export function legalActions(state: BattleState, side: 0 | 1): Action[] {
  if (state.phase === 'over') return [];
  const s = state.sides[side];
  const switches: Action[] = s.party
    .map((c, i) => ({ c, i }))
    .filter(({ c, i }) => c.hp > 0 && i !== s.active)
    .map(({ i }) => ({ type: 'switch', to: i }));
  if (state.phase === 'replace') {
    return needsReplacement(state, side) ? switches : [{ type: 'pass' }];
  }
  const me = active(state, side);
  const moves: Action[] = me.moves.map((m, i) => ({ m, i })).filter(({ m }) => m.pp > 0).map(({ i }) => ({ type: 'move', index: i }));
  const out: Action[] = moves.length ? moves : [{ type: 'move', index: -1 }];
  out.push(...switches);
  const foeSide = state.sides[other(side)];
  if (state.kind === 'wild' && !s.isWild && foeSide.isWild) {
    out.push({ type: 'run' });
    for (const orb of Object.keys(ORBS) as (keyof typeof ORBS)[]) out.push({ type: 'catch', orb });
  }
  if (state.kind !== 'wild' && s.controller === 'human') out.push({ type: 'forfeit' });
  return out;
}

export function isLegal(state: BattleState, side: 0 | 1, action: Action): boolean {
  return legalActions(state, side).some((a) => JSON.stringify(a) === JSON.stringify(action));
}

export class IllegalActionError extends Error {}

interface Queued { side: 0 | 1; action: Action; priority: number; speed: number; tie: number }

function actionPriority(state: BattleState, side: 0 | 1, action: Action): number {
  switch (action.type) {
    case 'forfeit': return 100;
    case 'run': case 'catch': return 50;
    case 'switch': return 20;
    case 'move': return action.index < 0 ? 0 : getMove(active(state, side).moves[action.index]!.id).priority;
    default: return -100;
  }
}

export function resolveTurn(input: BattleState, actions: [Action, Action]): TurnResult {
  if (input.phase === 'over') throw new IllegalActionError('battle is over');
  for (const side of [0, 1] as const) {
    if (!isLegal(input, side, actions[side])) {
      throw new IllegalActionError(`illegal action for side ${side}: ${JSON.stringify(actions[side])}`);
    }
  }
  const state = structuredClone(input);
  const rng = new Rng(state.rng);
  const events: BattleEvent[] = [];

  if (state.phase === 'replace') {
    for (const side of [0, 1] as const) {
      const a = actions[side];
      if (a.type === 'switch') doSwitch(state, side, a.to, events);
    }
    state.phase = 'choose';
    noteParticipation(state);
    state.rng = rng.state;
    return { state, events };
  }

  state.turn++;
  events.push({ t: 'turn', turn: state.turn });

  const queue: Queued[] = ([0, 1] as const).map((side) => ({
    side,
    action: actions[side],
    priority: actionPriority(state, side, actions[side]),
    speed: effectiveStat(active(state, side), 'spe'),
    tie: rng.next(),
  }));
  queue.sort((x, y) => y.priority - x.priority || y.speed - x.speed || x.tie - y.tie);
  const fainted = new Set<string>();

  for (const q of queue) {
    if (state.outcome) break;
    const { side, action } = q;
    const me = active(state, side);
    if (action.type === 'pass') continue;
    if (action.type === 'forfeit') {
      events.push({ t: 'forfeit', side });
      end(state, events, other(side), 'forfeit');
      break;
    }
    if (action.type === 'switch') {
      doSwitch(state, side, action.to, events);
      noteParticipation(state);
      continue;
    }
    if (me.hp <= 0) continue; // fainted earlier this turn
    if (action.type === 'run') {
      state.runAttempts++;
      const mine = effectiveStat(me, 'spe');
      const theirs = effectiveStat(active(state, other(side)), 'spe');
      const odds = mine >= theirs ? 1 : ((mine * 128) / theirs + 30 * state.runAttempts) / 256;
      const success = rng.chance(odds);
      events.push({ t: 'run', success });
      if (success) end(state, events, null, 'ran');
      continue;
    }
    if (action.type === 'catch') {
      const target = active(state, other(side));
      const p = catchProbability(target.stats.hp, target.hp, species(target.species).catchRate, ORBS[action.orb].bonus, target.status);
      const { shakes, caught } = rollCatch(p, rng);
      events.push({ t: 'catch', orb: action.orb, shakes, caught, name: target.name, probability: p });
      if (caught) end(state, events, side, 'caught');
      continue;
    }
    useMove(state, side, action.index, rng, events);
    checkFaints(state, events, fainted);
  }

  // End of turn: burn damage.
  if (!state.outcome) {
    for (const side of [0, 1] as const) {
      const c = active(state, side);
      if (c.hp > 0 && c.status === 'burn') {
        const amount = Math.min(c.hp, Math.max(1, Math.floor(c.stats.hp / 16)));
        c.hp -= amount;
        events.push({ t: 'damage', side, name: c.name, amount, hp: c.hp, maxHp: c.stats.hp, mult: 1, crit: false, source: 'burn' });
      }
    }
    checkFaints(state, events, fainted);
  }

  if (!state.outcome && state.turn >= state.turnLimit) end(state, events, null, 'turnLimit');

  if (!state.outcome) {
    const need = ([0, 1] as const).filter((s) => needsReplacement(state, s));
    if (need.length) {
      state.phase = 'replace';
      for (const s of need) events.push({ t: 'needReplace', side: s });
    }
  }
  state.rng = rng.state;
  return { state, events };
}

function end(state: BattleState, events: BattleEvent[], winner: 0 | 1 | null, reason: NonNullable<BattleState['outcome']>['reason']) {
  state.outcome = { winner, reason };
  state.phase = 'over';
  events.push({ t: 'end', winner, reason });
}

function doSwitch(state: BattleState, side: 0 | 1, to: number, events: BattleEvent[]) {
  const s = state.sides[side];
  const leaving = active(state, side);
  leaving.stages = { atk: 0, def: 0, spe: 0 };
  s.active = to;
  events.push(sendEvent(state, side));
}

function checkFaints(state: BattleState, events: BattleEvent[], reported: Set<string>) {
  for (const side of [0, 1] as const) {
    const c = active(state, side);
    if (c.hp <= 0 && !reported.has(c.uid)) {
      reported.add(c.uid);
      c.hp = 0;
      events.push({ t: 'faint', side, name: c.name });
    }
  }
  const out = ([0, 1] as const).map((side) => state.sides[side].party.every((c) => c.hp <= 0));
  if (out[0] && out[1]) end(state, events, null, 'ko');
  else if (out[0]) end(state, events, 1, 'ko');
  else if (out[1]) end(state, events, 0, 'ko');
}

function useMove(state: BattleState, side: 0 | 1, index: number, rng: Rng, events: BattleEvent[]) {
  const me = active(state, side);
  const foeSide = other(side);
  const foe = active(state, foeSide);

  // Status checks before acting.
  if (me.status === 'drowsy') {
    me.sleepTurns--;
    if (me.sleepTurns > 0) {
      events.push({ t: 'cantMove', side, name: me.name, reason: 'asleep' });
      return;
    }
    me.status = null;
    events.push({ t: 'wake', side, name: me.name });
  }
  if (me.status === 'shock' && rng.chance(0.25)) {
    events.push({ t: 'cantMove', side, name: me.name, reason: 'shocked' });
    return;
  }

  let m: MoveData;
  if (index < 0) {
    m = DESPERATION;
  } else {
    const slot = me.moves[index]!;
    slot.pp--;
    m = getMove(slot.id);
  }
  events.push({ t: 'move', side, name: me.name, move: m.id, moveName: m.name, moveType: m.type });

  const targetsFoe = m.category === 'attack' || (m.effect?.kind === 'status') || (m.effect?.kind === 'stage' && m.effect.who === 'foe');
  if (targetsFoe && foe.hp <= 0) {
    events.push({ t: 'miss', side, name: me.name });
    return;
  }
  if (targetsFoe && m.accuracy < 100 && !rng.chance(m.accuracy / 100)) {
    events.push({ t: 'miss', side, name: me.name });
    return;
  }

  if (m.category === 'attack') {
    const { damage, mult, crit } = rollDamage(me, foe, m, rng);
    const dealt = Math.min(foe.hp, damage);
    foe.hp -= dealt;
    events.push({ t: 'damage', side: foeSide, name: foe.name, amount: dealt, hp: foe.hp, maxHp: foe.stats.hp, mult, crit, source: 'move' });
    const e = m.effect;
    if (e?.kind === 'recoil') {
      const r = Math.min(me.hp, Math.max(1, Math.floor(dealt * e.fraction)));
      me.hp -= r;
      events.push({ t: 'damage', side, name: me.name, amount: r, hp: me.hp, maxHp: me.stats.hp, mult: 1, crit: false, source: 'recoil' });
    } else if (e && foe.hp > 0 && (e.kind === 'status' || e.kind === 'stage') && rng.chance(e.chance)) {
      applyEffect(state, side, m, rng, events, true);
    }
    return;
  }
  applyEffect(state, side, m, rng, events, false);
}

function applyEffect(state: BattleState, side: 0 | 1, m: MoveData, rng: Rng, events: BattleEvent[], secondary: boolean) {
  const e = m.effect;
  if (!e) return;
  const me = active(state, side);
  if (e.kind === 'heal') {
    const amount = Math.min(me.stats.hp - me.hp, Math.max(1, Math.floor(me.stats.hp * e.fraction)));
    if (amount <= 0) {
      events.push({ t: 'statusFail', side, name: me.name });
      return;
    }
    me.hp += amount;
    events.push({ t: 'heal', side, name: me.name, amount, hp: me.hp, maxHp: me.stats.hp });
    return;
  }
  if (e.kind === 'status') {
    const foeSide = other(side);
    const foe = active(state, foeSide);
    if (foe.status) {
      if (!secondary) events.push({ t: 'statusFail', side: foeSide, name: foe.name });
      return;
    }
    foe.status = e.status;
    if (e.status === 'drowsy') foe.sleepTurns = rng.range(2, 4); // loses 1–3 turns
    events.push({ t: 'status', side: foeSide, name: foe.name, status: e.status });
    return;
  }
  if (e.kind === 'stage') {
    const tSide = e.who === 'self' ? side : other(side);
    const t = active(state, tSide);
    const before = t.stages[e.stat];
    const after = Math.max(-MAX_STAGE, Math.min(MAX_STAGE, before + e.delta));
    t.stages[e.stat] = after;
    events.push({ t: 'stage', side: tSide, name: t.name, stat: e.stat, delta: after - before, value: after, capped: after === before });
  }
}
