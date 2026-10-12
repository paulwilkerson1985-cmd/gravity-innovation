// Headless battle simulator.
//   npm run sim -- --battles 200 --seed 7 --level 25 --size 3 --a skilled --b rookie
//   npm run sim -- --verbose --battles 1   (prints a full play-by-play)
import {
  Rng, chooseAction, createBattle, getDex, makeCreature, resolveTurn, toBattle,
  type Action, type AiTier, type BattleEvent, type BattleState,
} from '../src/engine';

const args = new Map<string, string>();
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  const k = argv[i]!;
  if (!k.startsWith('--')) continue;
  const v = argv[i + 1] && !argv[i + 1]!.startsWith('--') ? argv[++i]! : 'true';
  args.set(k.slice(2), v);
}
const num = (k: string, d: number) => Number(args.get(k) ?? d);
const battles = num('battles', 100);
const seed = num('seed', 1);
const level = num('level', 25);
const size = num('size', 3);
const tierA = (args.get('a') ?? 'skilled') as AiTier;
const tierB = (args.get('b') ?? 'rookie') as AiTier;
const verbose = args.has('verbose');

const dex = getDex();
const ids = [...dex.species.keys()];

function describe(e: BattleEvent, s: BattleState): string | null {
  const who = (side: 0 | 1) => `${s.sides[side].name}'s`;
  switch (e.t) {
    case 'turn': return `-- turn ${e.turn}`;
    case 'send': return `${who(e.side)} ${e.name} (L${e.level}) enters: ${e.hp}/${e.maxHp}`;
    case 'move': return `${who(e.side)} ${e.name} used ${e.moveName}`;
    case 'miss': return '  …it missed';
    case 'damage': return `  ${e.name} took ${e.amount}${e.crit ? ' (crit)' : ''}${e.mult > 1 ? ' (super)' : e.mult < 1 ? ' (resisted)' : ''} [${e.source}] → ${e.hp}/${e.maxHp}`;
    case 'heal': return `  ${e.name} healed ${e.amount} → ${e.hp}/${e.maxHp}`;
    case 'status': return `  ${e.name} is now ${e.status}`;
    case 'statusFail': return '  …but it failed';
    case 'stage': return `  ${e.name} ${e.stat} ${e.delta >= 0 ? '+' : ''}${e.delta} (now ${e.value})`;
    case 'cantMove': return `  ${e.name} can't move (${e.reason})`;
    case 'wake': return `  ${e.name} woke up`;
    case 'faint': return `  ${e.name} fainted!`;
    case 'end': return `== winner: ${e.winner === null ? 'draw' : s.sides[e.winner].name} (${e.reason})`;
    default: return null;
  }
}

const wins = [0, 0, 0];
let turns = 0;
const t0 = performance.now();
for (let i = 0; i < battles; i++) {
  const rng = new Rng(seed + i * 101);
  const team = (p: string) => Array.from({ length: size }, (_, j) => toBattle(makeCreature(rng.pick(ids), level, `${p}${j}`)));
  let { state, events } = createBattle('pvp', seed * 7919 + i,
    { name: `A(${tierA})`, controller: 'ai', ai: tierA, party: team('a') },
    { name: `B(${tierB})`, controller: 'ai', ai: tierB, party: team('b') });
  if (verbose) for (const e of events) { const l = describe(e, state); if (l) console.log(l); }
  while (state.phase !== 'over') {
    const pick = (side: 0 | 1, t: AiTier): Action => chooseAction(state, side, t);
    const r = resolveTurn(state, [pick(0, tierA), pick(1, tierB)]);
    state = r.state;
    events = r.events;
    if (verbose) for (const e of events) { const l = describe(e, state); if (l) console.log(l); }
  }
  turns += state.turn;
  wins[state.outcome!.winner ?? 2]!++;
}
const ms = performance.now() - t0;
console.log(`${battles} battles, ${size}v${size} at L${level}: A(${tierA}) ${wins[0]} – B(${tierB}) ${wins[1]} – draws ${wins[2]}`);
console.log(`avg ${(turns / battles).toFixed(1)} turns, ${(ms / battles).toFixed(2)} ms/battle`);
