import {
  createBattle, makeCreature, toBattle, chooseAction, resolveTurn, getDex,
  type Action, type BattleCreature, type BattleEvent, type BattleKind, type BattleState, type AiTier, Rng,
} from '../src/engine';

export function bc(species: string, level: number, uid = `${species}-${level}`, moves?: string[]): BattleCreature {
  const c = toBattle(makeCreature(species, level, uid));
  if (moves) c.moves = moves.map((id) => ({ id, pp: getDex().moves.get(id)!.pp, maxPp: getDex().moves.get(id)!.pp }));
  return c;
}

export function battle(kind: BattleKind, seed: number, a: BattleCreature[], b: BattleCreature[]) {
  return createBattle(kind, seed,
    { name: 'A', controller: 'human', party: a },
    { name: 'B', controller: 'ai', ai: 'rookie', isWild: kind === 'wild', party: b });
}

export function runAiBattle(state: BattleState, tiers: [AiTier, AiTier] = ['rookie', 'rookie'], maxSteps = 2000) {
  const log: BattleEvent[] = [];
  const actions: [Action, Action][] = [];
  let s = state;
  let steps = 0;
  while (s.phase !== 'over') {
    if (++steps > maxSteps) throw new Error('battle did not terminate');
    const pair: [Action, Action] = [chooseAction(s, 0, tiers[0]), chooseAction(s, 1, tiers[1])];
    // AI never runs/catches/forfeits in sims: restrict to moves/switches.
    for (const i of [0, 1] as const) {
      const a = pair[i];
      if (a.type === 'run' || a.type === 'catch' || a.type === 'forfeit') pair[i] = { type: 'move', index: 0 };
    }
    actions.push(pair);
    const r = resolveTurn(s, pair);
    log.push(...r.events);
    s = r.state;
  }
  return { state: s, log, actions };
}

export function randomTeam(rng: Rng, size: number, level: number, prefix: string): BattleCreature[] {
  const ids = [...getDex().species.keys()];
  return Array.from({ length: size }, (_, i) => bc(rng.pick(ids), level, `${prefix}${i}`));
}
