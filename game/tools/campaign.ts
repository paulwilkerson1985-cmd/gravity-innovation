// Headless campaign simulator: plays the whole adventure (starter → wild grinding → shop →
// trainers in order → Champion) with a scripted player, using only engine + game-state
// functions. Used to tune the difficulty curve (see docs/BALANCE.md).
//
//   npx tsx tools/campaign.ts                       (30 seeds × 3 starters, summary tables)
//   npx tsx tools/campaign.ts --seeds 10 --starter ashkit --verbose
//   npx tsx tools/campaign.ts --policy smart        (Ace-advised play for the whole campaign)
//   npx tsx tools/campaign.ts --champ-trials 20     (Champion first-try trials per run)
//   npx tsx tools/campaign.ts --champ-delta -2      (analysis: shift Vale's levels in the trials)
//   npx tsx tools/campaign.ts --solo                (starter-solo variant, see below)
//   npx tsx tools/campaign.ts --pim-check 200       (lone starter at L6–9 vs Pim, first try)
//
// Casual player model ("casual" policy)
// - Battles: type-aware like a player reading the SUPER/WEAK tags: Skilled-AI move choice (best
//   expected damage incl. type), switches out of a clearly losing 1-v-1 into a bench kin that
//   clearly wins it, best-matchup replacement after a faint. In trainer battles drinks a Tonic / Mega Tonic when the active
//   kin drops below 30% HP (at most twice per kin). Never runs.
// - Catching: wants a few new species per route (1 meadow, 2 ridge, 3 coast) plus any rare
//   dual-type it meets; weakens the foe with a move that won't KO, then throws the cheapest orb
//   with a decent catch chance. A party of 6 max; when full, a clearly stronger catch replaces
//   the lowest-level member (never the starter).
// - Training: rests (free full heal) after every battle; the strongest kin leads (the starter
//   on ties) and the rest of the party levels from the bench XP share. Always evolves; takes a
//   new attack move over its weakest attack/status move; skips new status moves.
// - Grinding: wild battles round-robin over the route's hotspots until the top-3 average level
//   reaches the route's signposted upper level (or a per-route cap), then challenges trainers
//   (same-route trainers in either order, by seed). After a loss: heal, 5 more wild battles,
//   retry (max 8 attempts). The plateau has no wilds: before the Champion the player grinds on
//   the last wild route until the whole party's average level reaches the plateau's upper
//   signpost (cap 25 battles).
// - Shop: after each trainer win keeps 5 orbs and buys Tonics (meadow/ridge) or Mega Tonics
//   (coast: up to 4; before the Champion: up to 8), keeping a small reserve.
// Other policies: "basic" = casual without voluntary switches (switch only on faint);
// "smart" = battle choices from the Ace AI (the in-game advice hook).
// --solo: "starter carries" variant — no catches on the meadow and the starter always leads,
// whatever its level (the rest of the party only gets bench XP).
// Economy: wild KOs pay 6 × foe level coins (the game's wild coin reward), trainers their reward.
// Champion first-try odds are estimated with --champ-trials battle seeds per policy from the
// same pre-Champion save.
import {
  ORBS, Rng, active, catchProbability, chooseAction, expectedDamage, getDex, getTrainer, hashSeed, matchup, move as getMove,
  resolveTurn, species,
  type Action, type AiTier, type BattleState, type ItemId, type OrbId, type OwnedCreature,
} from '../src/engine';
import {
  applyBattleResult, bagCount, buyItem, chooseStarter, healParty, newPlayer, priceOf, setLead, startWildBattle, type PlayerState,
} from '../src/game/state';
import {
  CHAMPION_ID, applyBattleXp, blackout, consumeBag, evolutionQueue, evolvePartyMember, startTrainerBattle,
  teachMove, trainerVictory, withDebugParty,
} from '../src/game/progress';

// ------------------------------------------------------------------ cli
const args = new Map<string, string>();
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  const k = argv[i]!;
  if (!k.startsWith('--')) continue;
  const v = argv[i + 1] && !argv[i + 1]!.startsWith('--') ? argv[++i]! : 'true';
  args.set(k.slice(2), v);
}
const SEEDS = Number(args.get('seeds') ?? 30);
const STARTER_ARG = args.get('starter');
const POLICY = (args.get('policy') ?? 'casual') as Policy;
const CHAMP_TRIALS = Number(args.get('champ-trials') ?? 10);
const VERBOSE = args.has('verbose');
const CHAMP_DELTA = Number(args.get('champ-delta') ?? 0);
const JSON_OUT = args.has('json');
const SOLO = args.has('solo');
/** Coins per wild KO, per foe level (mirrors the game's wild reward). */
const WILD_COINS_PER_LEVEL = 6;

type Policy = 'basic' | 'casual' | 'smart';

// ------------------------------------------------------------------ tunables of the player model
const CATCH_GOAL: Record<string, number> = { meadow: 1, ridge: 2, coast: 3 };
const RARES = new Set(['petalwisp', 'vulcrag', 'surgeray']);
/** Wild battles allowed on a route before the first trainer challenge, however under-levelled. */
const ROUTE_CAP: Record<string, number> = { meadow: 18, ridge: 30, coast: 35, plateau: 25 };
const RETRY_GRIND = 5;
const MAX_ATTEMPTS = 8;
const TRAINER_ORDER = ['scout-pim', 'hiker-brann', 'adept-sola', 'angler-merrow', 'rider-tavi', CHAMPION_ID];

// ------------------------------------------------------------------ helpers
const bst = (id: string) => { const b = species(id).base; return b.hp + b.atk + b.def + b.spe; };
const top3 = (p: PlayerState) => {
  const l = p.party.map((c) => c.level).sort((a, b) => b - a).slice(0, 3);
  return l.reduce((a, b) => a + b, 0) / l.length;
};
const avgLevel = (p: PlayerState) => p.party.reduce((n, c) => n + c.level, 0) / p.party.length;
const maxHp = (c: { stats: { hp: number } }) => c.stats.hp;

/** Value a casual player puts on a known move (status moves are worth nothing to them). */
function moveValue(c: OwnedCreature, id: string): number {
  const m = getMove(id);
  if (m.category !== 'attack') return 0;
  const stab = m.type !== 'Neutral' && species(c.species).types.includes(m.type) ? 1.5 : 1;
  return m.power * (m.accuracy / 100) * stab * (m.effect?.kind === 'recoil' ? 0.8 : 1);
}

interface BattleStats { items: number; orbs: number }

/** Pick side 0's action under a policy. Counts item uses per kin in `itemUses`. */
function playerAction(state: BattleState, p: PlayerState, policy: Policy, wantCatch: boolean, itemUses: Map<string, number>): Action {
  if (state.phase === 'replace') return chooseAction(state, 0, 'skilled');
  const me = active(state, 0);
  const foe = active(state, 1);
  // Healing in trainer battles.
  if (state.kind === 'trainer' && me.hp / maxHp(me) < 0.3 && (itemUses.get(me.uid) ?? 0) < 2) {
    const missing = maxHp(me) - me.hp;
    const order: ItemId[] = missing >= 50 ? ['mega-tonic', 'tonic', 'full-tonic'] : ['tonic', 'mega-tonic', 'full-tonic'];
    const it = order.find((i) => bagCount(p, i) > 0);
    if (it) {
      itemUses.set(me.uid, (itemUses.get(me.uid) ?? 0) + 1);
      return { type: 'item', item: it, target: state.sides[0].active };
    }
  }
  // Catching.
  if (state.kind === 'wild' && wantCatch) {
    const orbs = (Object.keys(ORBS) as OrbId[]).filter((o) => bagCount(p, o) > 0);
    if (orbs.length) {
      const sp = species(foe.species);
      const prob = (o: OrbId) => catchProbability(maxHp(foe), foe.hp, sp.catchRate, ORBS[o].bonus, foe.status);
      const best = orbs.reduce((a, b) => (prob(b) > prob(a) ? b : a));
      const cheapOk = orbs.find((o) => prob(o) >= 0.4);
      // Weaken first with the strongest move that won't KO.
      if (foe.hp / maxHp(foe) > 0.5 && prob(best) < 0.6) {
        const moves = me.moves.map((m, i) => ({ m, i })).filter(({ m }) => m.pp > 0 && getMove(m.id).category === 'attack');
        const safe = moves.map(({ i }) => ({ i, d: expectedDamage(state, 0, i) })).filter((x) => x.d * 1.2 < foe.hp).sort((a, b) => b.d - a.d);
        if (safe[0]) return { type: 'move', index: safe[0].i };
      }
      return { type: 'catch', orb: cheapOk ?? best };
    }
  }
  if (policy === 'casual') {
    // Type-aware switching (the player reads the SUPER/WEAK tags): leave a clearly losing 1-v-1
    // for a bench kin that clearly wins it.
    const last = state.sides[0].lastSwitchTurn ?? -99;
    if (state.turn - last > 2 && matchup(me, foe) < -0.3) {
      let best = -1;
      let bestScore = 0.2;
      state.sides[0].party.forEach((c, i) => {
        if (c.hp <= 0 || i === state.sides[0].active) return;
        const m = matchup(c, foe);
        if (m > bestScore) { best = i; bestScore = m; }
      });
      if (best >= 0) return { type: 'switch', to: best };
    }
  }
  const tier: AiTier = policy === 'smart' ? 'ace' : 'skilled';
  const a = chooseAction(state, 0, tier);
  if (a.type === 'move' || a.type === 'switch') return a;
  return chooseAction(state, 0, 'skilled');
}

/** Play a battle to the end; returns the final state and the bag-adjusted player. */
function playBattle(p0: PlayerState, start: BattleState, policy: Policy, wantCatch: boolean, foeTier: AiTier): { p: PlayerState; state: BattleState; stats: BattleStats } {
  let p = p0;
  let s = start;
  const itemUses = new Map<string, number>();
  const stats: BattleStats = { items: 0, orbs: 0 };
  for (let guard = 0; s.phase !== 'over'; guard++) {
    if (guard > 2000) throw new Error('battle did not end');
    const mine = playerAction(s, p, policy, wantCatch, itemUses);
    if (mine.type === 'item') { p = consumeBag(p, mine.item); stats.items++; }
    if (mine.type === 'catch') { p = consumeBag(p, mine.orb); stats.orbs++; }
    const theirs = chooseAction(s, 1, foeTier);
    s = resolveTurn(s, [mine, theirs]).state;
  }
  return { p, state: s, stats };
}

/** Level-ups, move offers (casual rule), evolutions. */
function afterWin(p0: PlayerState, state: BattleState): PlayerState {
  const xp = applyBattleXp(p0, state);
  let p = xp.player;
  for (const g of xp.gains) {
    for (const e of g.events) {
      if (e.t !== 'moveOffer') continue;
      const c = p.party.find((x) => x.uid === g.uid)!;
      if (getMove(e.move).category !== 'attack') continue;
      const vals = c.moves.map((m) => moveValue(c, m.id));
      const worst = vals.indexOf(Math.min(...vals));
      if (moveValue(c, e.move) > vals[worst]!) p = teachMove(p, g.uid, e.move, worst);
    }
  }
  for (const uid of evolutionQueue(p, xp.evolutions)) p = evolvePartyMember(p, uid).player;
  return p;
}

/** Lead: the strongest kin, preferring the starter (the casual favourite) on ties. */
function leadStrongest(p: PlayerState, uid: string): PlayerState {
  let i = 0;
  p.party.forEach((c, j) => {
    const best = p.party[i]!;
    if (c.level > best.level || (c.level === best.level && c.uid === uid)) i = j;
  });
  return i ? setLead(p, i) : p;
}

function leadUid(p: PlayerState, uid: string): PlayerState {
  const i = p.party.findIndex((c) => c.uid === uid);
  return i > 0 ? setLead(p, i) : p;
}

function shop(p0: PlayerState, routeId: string): PlayerState {
  let p = p0;
  const orbs = bagCount(p, 'orb') + bagCount(p, 'bright') + bagCount(p, 'star');
  const reserve = 100;
  const buy = (id: Parameters<typeof buyItem>[1], want: number) => {
    const n = Math.min(want, Math.floor((p.money - reserve) / priceOf(id)));
    if (n > 0) p = buyItem(p, id, n);
  };
  if (orbs < 5) buy('orb', 5 - orbs);
  if (routeId === 'meadow' || routeId === 'ridge') buy('tonic', Math.max(0, 5 - bagCount(p, 'tonic')));
  else if (routeId === 'coast') buy('mega-tonic', Math.max(0, 4 - bagCount(p, 'mega-tonic')));
  else buy('mega-tonic', Math.max(0, 8 - bagCount(p, 'mega-tonic'))); // stock up for the Champion
  return p;
}

// ------------------------------------------------------------------ campaign
interface TrainerLog {
  id: string;
  attempts: number;
  firstWin: boolean;
  won: boolean;
  levelsAtFirst: number[];
  wildBefore: number;
}
interface RunLog {
  starter: string;
  seed: number;
  trainers: TrainerLog[];
  wild: number;
  trainerBattles: number;
  caught: string[];
  coins: number;
  coinsEarned: number;
  finalLevels: number[];
  finalParty: string[];
  champ: Partial<Record<Policy, number>>;
  champLevels: number[];
  champParty: string[];
  completed: boolean;
  wildByRoute: Record<string, number>;
  /** XP the lead earned per won wild battle, by route. */
  leadXp: Record<string, number[]>;
  /** Starter level when it first reached each trainer. */
  starterAt: Record<string, number>;
}

function runCampaign(starter: string, seed: number, policy: Policy): RunLog {
  let p = chooseStarter(newPlayer(seed), starter);
  const starterUid = p.party[0]!.uid;
  const log: RunLog = {
    starter, seed, trainers: [], wild: 0, trainerBattles: 0, caught: [], coins: 0, coinsEarned: 0, finalLevels: [], finalParty: [],
    champ: {}, champLevels: [], champParty: [], completed: false, wildByRoute: {}, leadXp: {}, starterAt: {},
  };
  const routes = [...getDex().routes.values()];
  const caughtOnRoute: Record<string, number> = {};
  let spotCursor = 0;
  let lastWildRoute = 'meadow';

  const wildBattle = (routeId: string) => {
    const route = getDex().routes.get(routeId)!;
    const spots = route.hotspots.filter((h) => h.kind !== 'trainer');
    const spot = spots[spotCursor++ % spots.length]!;
    p = SOLO ? leadUid(healParty(p), starterUid) : leadStrongest(healParty(p), starterUid);
    const setup = startWildBattle(p, routeId, spot.id);
    p = setup.player;
    const foe = active(setup.battle, 1);
    const already = p.caught.includes(foe.species);
    const goal = SOLO && routeId === 'meadow' ? 0 : CATCH_GOAL[routeId] ?? 0;
    let want = !already && ((caughtOnRoute[routeId] ?? 0) < goal || RARES.has(foe.species));
    // A full party only catches clear upgrades.
    if (want && p.party.length >= 6) {
      const weakest = Math.min(...p.party.map((c) => bst(c.species)));
      const lowest = Math.min(...p.party.map((c) => c.level));
      want = bst(foe.species) > weakest + 40 || foe.level > lowest + 3;
    }
    const r = playBattle(p, setup.battle, policy, want, 'rookie');
    p = r.p;
    const res = applyBattleResult(p, r.state);
    p = res.player;
    if (r.state.outcome?.reason === 'caught') {
      caughtOnRoute[routeId] = (caughtOnRoute[routeId] ?? 0) + 1;
      log.caught.push(foe.species);
      if (res.caughtInto === 'box') {
        // Swap the lowest-level party member (never the starter) for the new catch.
        const newKin = p.box[p.box.length - 1]!;
        const score = (c: OwnedCreature) => c.level * 10 + bst(c.species) / 100 + (c.uid === starterUid ? 1e6 : 0);
        let wi = 0;
        p.party.forEach((c, j) => { if (score(c) < score(p.party[wi]!)) wi = j; });
        const party = [...p.party];
        const out = party[wi]!;
        party[wi] = newKin;
        p = { ...p, party, box: [...p.box.slice(0, -1), out] };
      }
    } else if (r.state.outcome?.winner === 0) {
      const leadUidNow = r.state.sides[0].party[0]!.uid;
      const before = p.party.find((c) => c.uid === leadUidNow)?.xp ?? 0;
      p = afterWin(p, r.state);
      const gained = (p.party.find((c) => c.uid === leadUidNow)?.xp ?? before) - before;
      (log.leadXp[routeId] ??= []).push(gained);
      p = { ...p, money: p.money + WILD_COINS_PER_LEVEL * foe.level };
      log.coinsEarned += WILD_COINS_PER_LEVEL * foe.level;
    }
    p = healParty(p);
    log.wild++;
    log.wildByRoute[routeId] = (log.wildByRoute[routeId] ?? 0) + 1;
  };

  const trainerBattle = (id: string, pol: Policy, commit: boolean): boolean => {
    p = SOLO ? leadUid(healParty(p), starterUid) : leadStrongest(healParty(p), starterUid);
    const setup = startTrainerBattle(p, id);
    const r = playBattle(setup.player, setup.battle, pol, false, getTrainer(id).ai);
    if (!commit) return r.state.outcome?.winner === 0;
    p = r.p;
    log.trainerBattles++;
    if (r.state.outcome?.winner === 0) {
      p = applyBattleResult(p, r.state).player;
      p = afterWin(p, r.state);
      const v = trainerVictory(p, id);
      log.coinsEarned += v.reward;
      p = healParty(v.player);
      return true;
    }
    p = blackout(applyBattleResult(p, r.state).player);
    return false;
  };

  // Same-route trainers are taken in either order (by seed parity) so both get a fair sample.
  const order = [...TRAINER_ORDER];
  if (seed % 2) { [order[1], order[2]] = [order[2]!, order[1]!]; [order[3], order[4]] = [order[4]!, order[3]!]; }
  for (const tid of order) {
    const t = getTrainer(tid);
    const route = routes.find((r) => r.id === t.routeId)!;
    const hasWild = route.hotspots.some((h) => h.kind !== 'trainer');
    const grindRoute = hasWild ? route.id : lastWildRoute;
    if (hasWild) lastWildRoute = route.id;
    const target = route.levelRange[1];
    const cap = ROUTE_CAP[route.id] ?? 20;
    // Grind until ready (only before the first trainer of a route counts toward the cap).
    const routeStart = log.wildByRoute[grindRoute] ?? 0;
    // Before the Champion (no wilds on the plateau) the whole party is brought up to the signpost.
    const ready = () => (hasWild ? top3(p) : avgLevel(p)) >= target;
    while (!ready() && (log.wildByRoute[grindRoute] ?? 0) - routeStart < cap) wildBattle(grindRoute);
    p = shop(p, route.id);
    log.starterAt[tid] = p.party.find((c) => c.uid === starterUid)?.level ?? 0;
    const entry: TrainerLog = { id: tid, attempts: 0, firstWin: false, won: false, levelsAtFirst: p.party.map((c) => c.level), wildBefore: log.wild };
    if (tid === CHAMPION_ID) {
      log.champLevels = p.party.map((c) => c.level);
      log.champParty = p.party.map((c) => `${c.species}@${c.level}`);
      // First-try estimate: many battle seeds from the same pre-Champion state.
      const save = p;
      // Analysis only: shift the Champion's levels for the trials (--champ-delta N).
      const vale = getTrainer(tid);
      const orig = vale.party.map((x) => x.level);
      vale.party.forEach((x, k) => { x.level = orig[k]! + CHAMP_DELTA; });
      for (const pol of ['basic', 'casual', 'smart'] as Policy[]) {
        let w = 0;
        for (let k = 0; k < CHAMP_TRIALS; k++) {
          p = { ...save, rng: hashSeed(seed, 0xc4a, k) };
          if (trainerBattle(tid, pol, false)) w++;
        }
        log.champ[pol] = w / CHAMP_TRIALS;
      }
      vale.party.forEach((x, k) => { x.level = orig[k]!; });
      p = save;
    }
    while (entry.attempts < MAX_ATTEMPTS) {
      entry.attempts++;
      const won = trainerBattle(tid, policy, true);
      if (entry.attempts === 1) entry.firstWin = won;
      if (won) { entry.won = true; break; }
      for (let k = 0; k < RETRY_GRIND; k++) wildBattle(grindRoute);
      p = shop(p, route.id);
    }
    log.trainers.push(entry);
    if (!entry.won) break;
  }
  log.completed = log.trainers.length === TRAINER_ORDER.length && log.trainers.every((t) => t.won);
  log.coins = p.money;
  log.finalLevels = p.party.map((c) => c.level);
  log.finalParty = p.party.map((c) => `${c.species}@${c.level}`);
  return log;
}


// ------------------------------------------------------------------ report
const starters = STARTER_ARG ? [STARTER_ARG] : ['ashkit', 'dropple', 'mossling'];

// --pim-check: a lone starter (moves of its level, fresh bag) vs Scout Pim, first try.
if (args.has('pim-check')) {
  const n = Number(args.get('pim-check') === 'true' ? 200 : args.get('pim-check'));
  console.log(`Starter alone vs ${getTrainer('scout-pim').name}, ${n} tries per cell (policy ${POLICY}):`);
  console.log('| Starter | L6 | L7 | L8 | L9 |\n|---|---|---|---|---|');
  for (const st of starters) {
    const cells: string[] = [];
    for (const lv of [6, 7, 8, 9]) {
      let w = 0;
      for (let k = 0; k < n; k++) {
        let p = withDebugParty(newPlayer(hashSeed(77, k, lv)), [{ species: st, level: lv }]);
        p = healParty(p);
        const setup = startTrainerBattle(p, 'scout-pim');
        if (playBattle(setup.player, setup.battle, POLICY, false, 'rookie').state.outcome?.winner === 0) w++;
      }
      cells.push(`${Math.round((100 * w) / n)}%`);
    }
    console.log(`| ${st} | ${cells.join(' | ')} |`);
  }
  process.exit(0);
}
const all: RunLog[] = [];
const t0 = performance.now();
for (const st of starters) {
  for (let i = 0; i < SEEDS; i++) {
    const seed = new Rng(hashSeed(1234, i)).state;
    const r = runCampaign(st, seed, POLICY);
    all.push(r);
    if (VERBOSE) {
      console.log(`  pre-Champion: ${r.champParty.join(' ')}  basic ${r.champ.basic} casual ${r.champ.casual} smart ${r.champ.smart}`);
      console.log(`${st} seed ${i}: wild ${r.wild}, trainer battles ${r.trainerBattles}, ${r.completed ? 'CHAMPION' : 'stuck'}; party ${r.finalParty.join(' ')}; caught ${r.caught.join(',')}`);
      for (const t of r.trainers) console.log(`   ${t.id.padEnd(14)} lv[${t.levelsAtFirst.join(',')}] wild≤${t.wildBefore} attempts ${t.attempts}${t.won ? '' : ' LOST'}`);
    }
  }
}
const ms = performance.now() - t0;

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
const pct = (x: number) => `${Math.round(x * 100)}%`;
const f1 = (x: number) => (Number.isFinite(x) ? x.toFixed(1) : '–');

function table(runs: RunLog[], label: string) {
  console.log(`\n### ${label} (${runs.length} runs, policy ${POLICY})`);
  console.log('| Trainer | starter lvl | top lvl | top-3 avg | party size | wild before | 1st-try win | avg attempts | beaten |');
  console.log('|---|---|---|---|---|---|---|---|---|');
  for (const tid of TRAINER_ORDER) {
    const ts = runs.map((r) => r.trainers.find((t) => t.id === tid)).filter((t): t is TrainerLog => !!t);
    if (!ts.length) continue;
    const tops = ts.map((t) => Math.max(...t.levelsAtFirst));
    const t3 = ts.map((t) => { const l = [...t.levelsAtFirst].sort((a, b) => b - a).slice(0, 3); return mean(l); });
    const foeMax = Math.max(...getTrainer(tid).party.map((x) => x.level));
    console.log(`| ${tid} (≤L${foeMax}) | ${f1(mean(runs.filter((r) => r.starterAt[tid]).map((r) => r.starterAt[tid]!)))} | ${f1(mean(tops))} | ${f1(mean(t3))} | ${f1(mean(ts.map((t) => t.levelsAtFirst.length)))} | ${f1(mean(ts.map((t) => t.wildBefore)))} | ${pct(mean(ts.map((t) => (t.firstWin ? 1 : 0))))} | ${f1(mean(ts.map((t) => t.attempts)))} | ${pct(ts.filter((t) => t.won).length / runs.length)} |`);
  }
  const done = runs.filter((r) => r.completed);
  const champ = (pol: Policy) => pct(mean(runs.filter((r) => r.champ[pol] !== undefined).map((r) => r.champ[pol]!)));
  console.log(`\nChampion first-try (${CHAMP_TRIALS} trials each from the pre-Champion save): basic ${champ('basic')}, casual ${champ('casual')}, smart ${champ('smart')}`);
  console.log(`Completed ${done.length}/${runs.length}; total battles ${f1(mean(runs.map((r) => r.wild + r.trainerBattles)))} (wild ${f1(mean(runs.map((r) => r.wild)))}: ${Object.keys(ROUTE_CAP).map((k) => `${k} ${f1(mean(runs.map((r) => r.wildByRoute[k] ?? 0)))}`).join(', ')}); coins earned ${f1(mean(runs.map((r) => r.coinsEarned)))}, left ${f1(mean(runs.map((r) => r.coins)))}`);
  console.log(`Final levels: top ${f1(mean(runs.map((r) => Math.max(...r.finalLevels))))}, avg ${f1(mean(runs.map((r) => mean(r.finalLevels))))}; reached L30: ${pct(runs.filter((r) => r.finalLevels.includes(30)).length / runs.length)}; caught/run ${f1(mean(runs.map((r) => r.caught.length)))}`);
  const xpLine = Object.keys(ROUTE_CAP).filter((k) => runs.some((r) => r.leadXp[k]?.length)).map((k) => {
    const xs = runs.flatMap((r) => r.leadXp[k] ?? []).sort((a, b) => a - b);
    const q = (f: number) => xs[Math.floor(f * (xs.length - 1))]!;
    return `${k} mean ${Math.round(mean(xs))} (p10 ${q(0.1)}, p90 ${q(0.9)})`;
  });
  console.log(`Lead XP per won wild battle: ${xpLine.join('; ')}`);
  const species: Record<string, number> = {};
  for (const r of runs) for (const s of new Set(r.caught)) species[s] = (species[s] ?? 0) + 1;
  console.log(`Catches (runs): ${Object.entries(species).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', ')}`);
}

if (JSON_OUT) console.log(JSON.stringify(all));
else {
  for (const st of starters) table(all.filter((r) => r.starter === st), `Starter ${st}`);
  if (starters.length > 1) table(all, 'All starters');
  console.log(`\n${(ms / 1000).toFixed(1)} s`);
}
