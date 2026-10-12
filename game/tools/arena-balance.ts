// Arena (PvP) balance survey: Ace vs Ace over random 3-kin teams, reporting each species' and
// move's win share. A species/move is flagged when its win share leaves 40–60% (dominant or weak)
// or a move is almost never chosen when available.
//
//   npx tsx tools/arena-balance.ts                    (rentals pool, 1500 battles)
//   npx tsx tools/arena-balance.ts --pool finals      (only fully evolved rentals)
//   npx tsx tools/arena-balance.ts --battles 3000 --seed 7
import { RENTALS } from '../src/data/rentals';
import { MOVES } from '../src/data/moves';
import { Rng, chooseAction, createArenaBattle, resolveTurn, getDex, type ArenaEntry } from '../src/engine';

const args = new Map<string, string>();
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  const k = argv[i]!;
  if (!k.startsWith('--')) continue;
  const v = argv[i + 1] && !argv[i + 1]!.startsWith('--') ? argv[++i]! : 'true';
  args.set(k.slice(2), v);
}
const BATTLES = Number(args.get('battles') ?? 1500);
const SEED = Number(args.get('seed') ?? 1);
const POOL = args.get('pool') ?? 'rentals';
const TIER = (args.get('tier') ?? 'ace') as 'ace' | 'skilled';

const dex = getDex();
const isFinal = (id: string) => !dex.species.get(id)!.evolvesTo;
const pool = RENTALS.filter((r) => POOL !== 'finals' || isFinal(r.species));

interface Tally { games: number; wins: number }
const bump = (m: Map<string, Tally>, k: string, win: boolean) => {
  const t = m.get(k) ?? { games: 0, wins: 0 };
  t.games++;
  if (win) t.wins++;
  m.set(k, t);
};
const bySpecies = new Map<string, Tally>();
const byMoveUsed = new Map<string, Tally>();
const moveOffered = new Map<string, number>();
const moveUses = new Map<string, number>();
let turns = 0;
let draws = 0;

const rng = new Rng(SEED);
const t0 = performance.now();
for (let b = 0; b < BATTLES; b++) {
  const pick = (): typeof pool => {
    const out: typeof pool = [];
    while (out.length < 3) {
      const r = rng.pick(pool);
      if (!out.some((x) => x.species === r.species)) out.push(r);
    }
    return out;
  };
  const a = pick();
  const c = pick();
  const team = (rs: typeof pool, p: string): ArenaEntry[] => rs.map((r, i) => ({ species: r.species, moves: r.moves, uid: `${p}${i}` }));
  let { state } = createArenaBattle(rng.int(2 ** 31), 'A', team(a, 'a'), 'B', team(c, 'b'));
  const used: [Set<string>, Set<string>] = [new Set(), new Set()];
  for (let guard = 0; state.phase !== 'over' && guard < 1000; guard++) {
    const acts = [chooseAction(state, 0, TIER), chooseAction(state, 1, TIER)] as const;
    for (const side of [0, 1] as const) {
      const act = acts[side];
      const me = state.sides[side].party[state.sides[side].active]!;
      if (state.phase === 'choose') for (const m of me.moves) if (m.pp > 0) moveOffered.set(m.id, (moveOffered.get(m.id) ?? 0) + 1);
      if (act.type === 'move' && act.index >= 0) {
        const id = me.moves[act.index]!.id;
        used[side].add(id);
        moveUses.set(id, (moveUses.get(id) ?? 0) + 1);
      }
    }
    state = resolveTurn(state, [acts[0], acts[1]]).state;
  }
  turns += state.turn;
  const w = state.outcome?.winner ?? null;
  if (w === null) { draws++; continue; }
  for (const r of a) bump(bySpecies, r.species, w === 0);
  for (const r of c) bump(bySpecies, r.species, w === 1);
  for (const id of used[0]) bump(byMoveUsed, id, w === 0);
  for (const id of used[1]) bump(byMoveUsed, id, w === 1);
}
const ms = performance.now() - t0;
const pct = (t: Tally) => (t.games ? (100 * t.wins) / t.games : NaN);

console.log(`${BATTLES} battles, pool ${POOL} (${pool.length} kin), ${TIER} vs ${TIER}, avg ${(turns / BATTLES).toFixed(1)} turns, ${draws} draws, ${(ms / BATTLES).toFixed(1)} ms/battle`);
console.log('\n| Species | games | win share | flag |\n|---|---|---|---|');
for (const [k, t] of [...bySpecies].sort((x, y) => pct(y[1]) - pct(x[1]))) {
  const p = pct(t);
  console.log(`| ${k} | ${t.games} | ${p.toFixed(1)}% | ${p > 60 ? 'DOMINANT' : p < 40 ? 'weak' : ''} |`);
}
console.log('\n| Move | used in games | win share when used | pick rate when available | flag |\n|---|---|---|---|---|');
for (const m of MOVES) {
  const t = byMoveUsed.get(m.id);
  const offered = moveOffered.get(m.id) ?? 0;
  if (!offered) continue;
  const pick = (moveUses.get(m.id) ?? 0) / offered;
  const p = t ? pct(t) : NaN;
  const flag = p > 60 ? 'strong' : p < 40 ? 'weak' : pick < 0.03 ? 'rarely picked' : '';
  console.log(`| ${m.name} | ${t?.games ?? 0} | ${Number.isFinite(p) ? p.toFixed(1) : '–'}% | ${(100 * pick).toFixed(1)}% | ${flag} |`);
}
