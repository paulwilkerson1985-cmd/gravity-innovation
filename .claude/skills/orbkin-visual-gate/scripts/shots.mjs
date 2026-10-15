#!/usr/bin/env node
// shots.mjs - the shot list for the frozen-clock capture harness (imported by capture.mjs) and its own CLI:
//
//   node shots.mjs --list                 every built-in id: kind, viewport/tier, arena, trainer or wild foe, party
//   node shots.mjs --show cave-desk       one shot as JSON (the exact object capture.mjs will run)
//   node shots.mjs --url '?scene=battle&route=ridge&hotspot=hiker-brann&seed=5' [--id NAME] [--vp desk|phone]
//                                         derive a shot from a game URL and print it (paste into --shots-json)
//   node shots.mjs --schema               the --shots-json object schema with a worked example
//   node shots.mjs --lineups              the ?scene=model&lineup=N index table
//
// Ids are STABLE: gates compare runs by id. Built-in ids:
//   <arena>-desk / <arena>-phone   one battle per HD-2D arena (forced with ?arena=), desktop 1280x720 high
//                                  tier / phone 393x851 DPR 2.75 touch low tier. NOTE the trainer per arena:
//                                  cave = Sola (adept-sola), scrub = Brann (hiker-brann), meadow = Pim, coast =
//                                  Merrow, cliff = Tavi, summit = Vale; the others are wild (see --list).
//   fx-flame-desk, fx-tide-desk    an attack frozen mid-impact (played at 0.25 speed) - stills only; judge
//                                  MOTION with strip.mjs, never with these frames
//   hof-desk/-phone, victory-desk/-phone   Hall of Fame, Arena victory podium
//   title-, starter-, route-meadow-, route-ridge-, menu-, party- (-desk / -phone)   non-battle screens
//   lineup-<n>-desk                creature lineup n (0 flame .. 6 singles) from ?scene=model&lineup=n, frozen
//   lineup-<n>-baked-desk          the same line as toon-baked battle sprites (one wild battle per species,
//                                  foe crops tiled 3x nearest): what ships; use for ip_check
//
// Selection syntax (--ids, comma separated): exact ids, arena names (`cave` = both viewports), groups:
// all, quick, battles, arenas, fx, halls, screens, lineups, desk, phone, hd2d. Extra shots: --shots-json FILE.
//
// A shot that reproduces a game URL: the harness never loads `?scene=battle&...` as written. It loads
// `?seed=S&gfx=hd2d&q=<tier>&arena=<arena>&scene=none`, calls `debugSetParty(party)`, then `goto('battle', battle)`
// in the page, waits for idle and (menu: 'fight') opens the Fight menu. The game's own default party for a direct
// battle URL with an empty save is ONE Ashkit Lv5 (Game.debugParty -> chooseStarter 'ashkit'); --url derives
// exactly that party unless you pass one. Trainer battles ignore `foe`/`foeLevel`; wild ones use them.

export const VIEWPORTS = {
  desk: { label: 'desktop 1280x720 · high tier', q: 'high', ctx: { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 } },
  phone: { label: 'phone 393x851 @2.75 · low tier', q: 'low', ctx: { viewport: { width: 393, height: 851 }, deviceScaleFactor: 2.75, isMobile: true, hasTouch: true } },
};

const P = (species, level) => ({ species, level });

/** Route hotspots (game/src/data/routes.ts) and the trainer each one hosts, so --list / --url can say who you will see. */
export const HOTSPOTS = {
  meadow: { 'tall-grass': { kind: 'grass' }, 'flower-patch': { kind: 'grass' }, hollow: { kind: 'cave' }, 'scout-pim': { kind: 'trainer', trainer: 'Sprout Scout Pim' } },
  ridge: { scrub: { kind: 'grass' }, 'vent-cave': { kind: 'cave' }, 'hiker-brann': { kind: 'trainer', trainer: 'Ridge Hiker Brann' }, 'adept-sola': { kind: 'trainer', trainer: 'Cinder Adept Sola' } },
  coast: { 'dune-grass': { kind: 'grass' }, shallows: { kind: 'water' }, 'sea-cliff': { kind: 'cave' }, 'angler-merrow': { kind: 'trainer', trainer: 'Storm Angler Merrow' }, 'rider-tavi': { kind: 'trainer', trainer: 'Gale Rider Tavi' } },
  plateau: { 'champion-vale': { kind: 'trainer', trainer: 'Champion Vale' } },
};
/** The game's default party for a direct battle URL with an empty save (Game.debugParty). */
export const DEFAULT_URL_PARTY = [P('ashkit', 5)];

/** Evolution lines as the model scene indexes them (game/src/render/creatures/designs.ts LINES). */
export const LINEUPS = [
  { index: 0, name: 'flame', species: ['ashkit', 'cindertail', 'pyrelord'] },
  { index: 1, name: 'tide', species: ['dropple', 'rillback', 'maelstrode'] },
  { index: 2, name: 'flora', species: ['mossling', 'thistlehorn', 'verdantusk'] },
  { index: 3, name: 'spark', species: ['flickwing', 'stormoth'] },
  { index: 4, name: 'terra', species: ['pebblet', 'cragmaul'] },
  { index: 5, name: 'gale', species: ['breezel', 'cyclonyx'] },
  { index: 6, name: 'singles', species: ['vulcrag', 'surgeray', 'petalwisp'] },
];
/** `lineup=terra` is NOT valid in the game (model.ts does LINES[Number(which)] ?? LINES[0] and silently shows the
 * Flame line); this resolves names to indices and rejects anything else loudly. */
export function lineupIndex(v) {
  if (v === 'all') return 'all';
  const n = Number(v);
  if (Number.isInteger(n) && LINEUPS[n]) return n;
  const byName = LINEUPS.find((l) => l.name === String(v).toLowerCase());
  if (byName) return byName.index;
  throw new Error(`unknown lineup "${v}": use an index 0-${LINEUPS.length - 1} or a name (${LINEUPS.map((l) => l.name).join(', ')}); the game itself would silently render line 0 (flame)`);
}

/** One battle per arena. `battle` = goto('battle') params; wild foes forced with foe/foeLevel so the line-up is deterministic. */
export const ARENAS = [
  { arena: 'cave', label: 'Quarry cave · trainer Sola', battle: { route: 'ridge', hotspot: 'adept-sola' }, party: [P('ashkit', 12), P('rillback', 15), P('breezel', 9)] },
  { arena: 'volcanic', label: 'Volcanic vent cave · wild', battle: { route: 'ridge', hotspot: 'vent-cave', foe: 'vulcrag', foeLevel: 12 }, party: [P('maelstrode', 30), P('pebblet', 10)] },
  { arena: 'meadow', label: 'Meadow clearing · trainer Pim', battle: { route: 'meadow', hotspot: 'scout-pim' }, party: [P('mossling', 7), P('flickwing', 5)] },
  { arena: 'flowers', label: 'Flower field · wild', battle: { route: 'meadow', hotspot: 'flower-patch', foe: 'breezel', foeLevel: 6 }, party: [P('petalwisp', 12), P('dropple', 8)] },
  { arena: 'hollow', label: 'Mossy hollow · wild', battle: { route: 'meadow', hotspot: 'hollow', foe: 'dropple', foeLevel: 7 }, party: [P('pebblet', 9), P('ashkit', 8)] },
  { arena: 'scrub', label: 'Sunset scrub · trainer Brann', battle: { route: 'ridge', hotspot: 'hiker-brann' }, party: [P('cindertail', 16), P('mossling', 12), P('flickwing', 12)] },
  { arena: 'coast', label: 'Coast cove · trainer Merrow', battle: { route: 'coast', hotspot: 'angler-merrow' }, party: [P('thistlehorn', 22), P('stormoth', 20), P('pebblet', 18)] },
  { arena: 'shallows', label: 'Rough shallows · wild', battle: { route: 'coast', hotspot: 'shallows', foe: 'surgeray', foeLevel: 18 }, party: [P('stormoth', 22), P('cindertail', 19)] },
  { arena: 'cliff', label: 'Sea cliff · trainer Tavi', battle: { route: 'coast', hotspot: 'rider-tavi' }, party: [P('cragmaul', 22), P('rillback', 21), P('ashkit', 15)] },
  { arena: 'summit', label: 'Champion hall · Champion Vale', battle: { route: 'plateau', hotspot: 'champion-vale' }, party: [P('pyrelord', 32), P('maelstrode', 30), P('verdantusk', 30), P('cyclonyx', 28), P('surgeray', 27), P('petalwisp', 27)] },
  { arena: 'stadium', label: 'Arena stadium · hotseat', stadium: { near: ['verdantusk', 'surgeray', 'breezel'], far: ['flickwing', 'cragmaul', 'pyrelord'] } },
];

/** Moves for the arena teams (hotseat needs explicit move lists). */
export const ARENA_MOVES = {
  pyrelord: ['pyre-crash', 'searing-fang', 'smolder-cloud', 'quick-jab'],
  maelstrode: ['breaker-crush', 'riptide-slam', 'brine-mist', 'second-wind'],
  verdantusk: ['grove-hammer', 'thorn-lash', 'spore-puff', 'second-wind'],
  stormoth: ['storm-lance', 'volt-lunge', 'jolt-wave', 'breeze-cut'],
  cragmaul: ['landslide', 'quake-stomp', 'bedrock-brace', 'ram-charge'],
  cyclonyx: ['cyclone-slam', 'talon-dive', 'updraft', 'quick-jab'],
  surgeray: ['volt-lunge', 'riptide-slam', 'jolt-wave', 'static-nip'],
  breezel: ['breeze-cut', 'talon-dive', 'quick-jab', 'stare-down'],
  flickwing: ['static-nip', 'volt-lunge', 'jolt-wave', 'quick-jab'],
};

const shots = [];
for (const a of ARENAS) {
  for (const vp of ['desk', 'phone']) {
    shots.push({
      id: `${a.arena}-${vp}`, vp, kind: a.stadium ? 'stadium' : 'battle', arena: a.arena, label: `${a.label} — ${VIEWPORTS[vp].label}`,
      seed: 11, battle: a.battle, party: a.party, stadium: a.stadium, menu: 'fight', hd2d: true,
      groups: ['battles', 'arenas', vp, 'hd2d', a.arena],
    });
  }
}

// FX stills: speed 1 until the projectile launches, 0.25 until the impact burst spawns, then `afterImpact`
// frames more and frozen; `<id>.late.png` is 6 frames later. Seed 13 hits with both moves; a miss retries.
shots.push(
  { id: 'fx-flame-desk', vp: 'desk', kind: 'fx', arena: 'cave', label: 'FX Flame (Pyre Crash) mid-impact · cave — desktop high', seed: 13,
    battle: { route: 'ridge', hotspot: 'vent-cave', foe: 'mossling', foeLevel: 12 }, party: [P('pyrelord', 30), P('dropple', 10)],
    move: 'pyre-crash', afterImpact: 3, hd2d: true, groups: ['fx', 'desk', 'hd2d'] },
  { id: 'fx-tide-desk', vp: 'desk', kind: 'fx', arena: 'coast', label: 'FX Tide (Breaker Crush) mid-impact · coast — desktop high', seed: 13,
    battle: { route: 'coast', hotspot: 'dune-grass', foe: 'pebblet', foeLevel: 12 }, party: [P('maelstrode', 30), P('ashkit', 10)],
    move: 'breaker-crush', afterImpact: 3, hd2d: true, groups: ['fx', 'desk', 'hd2d'] },
);

for (const vp of ['desk', 'phone']) {
  shots.push(
    { id: `hof-${vp}`, vp, kind: 'hof', label: `Hall of Fame — ${VIEWPORTS[vp].label}`, seed: 11,
      party: [P('pyrelord', 40), P('maelstrode', 38), P('verdantusk', 37), P('stormoth', 36), P('petalwisp', 35), P('cindertail', 33)],
      hd2d: true, groups: ['halls', vp, 'hd2d'] },
    { id: `victory-${vp}`, vp, kind: 'arenaVictory', label: `Arena victory podium — ${VIEWPORTS[vp].label}`, seed: 11,
      hd2d: true, groups: ['halls', vp, 'hd2d'] },
  );
}

const PARTY6 = [P('pyrelord', 32), P('rillback', 18), P('mossling', 6), P('cyclonyx', 20), P('surgeray', 19), P('petalwisp', 21)];
for (const vp of ['desk', 'phone']) {
  shots.push(
    { id: `title-${vp}`, vp, kind: 'screen', screen: 'title', label: `Title — ${VIEWPORTS[vp].label}`, seed: 5, groups: ['screens', vp] },
    { id: `starter-${vp}`, vp, kind: 'screen', screen: 'starter', label: `Starter pick — ${VIEWPORTS[vp].label}`, seed: 5, groups: ['screens', vp] },
    { id: `route-meadow-${vp}`, vp, kind: 'screen', screen: 'route', route: 'meadow', party: PARTY6, label: `Route map: Mossy Meadow — ${VIEWPORTS[vp].label}`, seed: 5, groups: ['screens', vp] },
    { id: `route-ridge-${vp}`, vp, kind: 'screen', screen: 'route', route: 'ridge', party: PARTY6, defeat: ['scout-pim'], label: `Route map: Ember Ridge — ${VIEWPORTS[vp].label}`, seed: 5, groups: ['screens', vp] },
    { id: `menu-${vp}`, vp, kind: 'screen', screen: 'menu', route: 'meadow', party: PARTY6, label: `Game menu hub — ${VIEWPORTS[vp].label}`, seed: 5, groups: ['screens', vp] },
    { id: `party-${vp}`, vp, kind: 'screen', screen: 'party', route: 'meadow', party: PARTY6, label: `Party screen — ${VIEWPORTS[vp].label}`, seed: 5, groups: ['screens', vp] },
  );
}

// Creature lineups: the model scene (unbaked meshes, grey stage, frozen idle) and the toon-baked battle sprites.
for (const l of LINEUPS) {
  shots.push(
    { id: `lineup-${l.index}-desk`, vp: 'desk', kind: 'lineup', line: l.index, label: `Lineup ${l.index} ${l.name} (${l.species.join(' → ')}) · model scene, unbaked — desktop`, seed: 5,
      hd2d: false, groups: ['lineups', 'desk', l.name] },
    { id: `lineup-${l.index}-baked-desk`, vp: 'desk', kind: 'baked', line: l.index, label: `Lineup ${l.index} ${l.name} (${l.species.join(' → ')}) · toon-baked battle sprites, 3x — desktop`, seed: 5,
      arena: 'meadow', battle: { route: 'meadow', hotspot: 'tall-grass' }, party: [P('dropple', 30)], hd2d: true, groups: ['lineups', 'baked', 'desk', 'hd2d', l.name] },
  );
}

export const SHOTS = shots;

export const GROUPS = {
  quick: ['cave-desk', 'cave-phone', 'meadow-desk', 'coast-desk', 'summit-desk', 'fx-flame-desk'],
};

/** Resolve a comma list of ids / arena names / group names into shots (list order kept, de-duplicated). */
export function selectShots(spec, extra = []) {
  const all = [...SHOTS, ...extra];
  const want = (spec ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!want.length || want.includes('all')) return { shots: all, unknown: [] };
  const picked = new Set();
  const unknown = [];
  for (const w of want) {
    const byId = all.filter((s) => s.id === w);
    const byGroup = GROUPS[w] ? all.filter((s) => GROUPS[w].includes(s.id)) : all.filter((s) => s.groups?.includes(w));
    const hit = byId.length ? byId : byGroup;
    if (!hit.length) unknown.push(w);
    for (const s of hit) picked.add(s);
  }
  return { shots: all.filter((s) => picked.has(s)), unknown };
}

/** Schema of one --shots-json entry (an array of these). */
export const SHOT_SCHEMA = {
  id: 'string, unique, stable (gates compare runs by id)',
  vp: "'desk' | 'phone'",
  kind: "'battle' | 'fx' | 'stadium' | 'hof' | 'arenaVictory' | 'screen' | 'lineup' | 'baked'",
  label: 'string shown in --list and the report',
  seed: 'integer, the ?seed= of the page (default 11)',
  arena: "HD-2D arena id forced with ?arena= (battle/fx/baked): cave volcanic meadow flowers hollow scrub coast shallows cliff summit stadium",
  battle: "goto('battle') params: { route, hotspot, foe?, foeLevel? } (battle/fx/baked)",
  party: 'REQUIRED for battle/fx/hof/screen(route|menu|party)/baked: [{ species, level, hp?, status?, xp? }, ...] (<= 6); the harness always injects it',
  menu: "'fight' opens the Fight menu after idle (battle/stadium); omit for the plain command menu",
  move: 'fx only: move id forced into the lead\'s slot 0 and clicked',
  afterImpact: 'fx only: frames after the impact burst (default 3)',
  stadium: 'stadium only: { near: [species x3], far: [species x3] }',
  screen: "screen only: 'title' | 'starter' | 'route' | 'menu' | 'party'; route screens need `route` and `party`",
  line: 'lineup/baked only: evolution line index 0-6 or name (see --lineups)',
  qs: 'extra query params merged into the page URL, e.g. { post: "nobloom" }',
  hd2d: 'true when the HD-2D pipeline is expected (warns if perf() is null); false for the model scene',
  minFrame: 'absolute alignment frame override (default --min-frame 200)',
  settle: 'settle frames override (default --settle 8)',
  groups: 'string[] for --ids selection',
};
export const SHOT_EXAMPLE = [
  { id: 'cavebrann-desk', vp: 'desk', kind: 'battle', arena: 'cave', seed: 5, label: 'Cave · trainer Brann (seed 5) — desktop high',
    battle: { route: 'ridge', hotspot: 'hiker-brann' }, party: [P('ashkit', 5)], menu: 'fight', hd2d: true, groups: ['cavebrann'] },
  { id: 'cavebrann-phone', vp: 'phone', kind: 'battle', arena: 'cave', seed: 5, label: 'Cave · trainer Brann (seed 5) — phone low',
    battle: { route: 'ridge', hotspot: 'hiker-brann' }, party: [P('ashkit', 5)], menu: 'fight', hd2d: true, groups: ['cavebrann'] },
];

/** Derive a shot from a game URL such as '?scene=battle&route=ridge&hotspot=hiker-brann&seed=5&arena=cave'. */
export function shotFromUrl(url, { id, vp = 'desk', party, menu } = {}) {
  const q = new URLSearchParams(url.includes('?') ? url.slice(url.indexOf('?') + 1) : url);
  const scene = q.get('scene') ?? 'title';
  const seed = q.has('seed') ? Number(q.get('seed')) : 11;
  const notes = [];
  if (scene === 'model') {
    if (!q.has('lineup')) throw new Error('--url: only ?scene=model&lineup=N is supported for the model scene (species/battle views are not shot kinds)');
    const line = lineupIndex(q.get('lineup'));
    const sid = id ?? `lineup-${line}-${vp}`;
    notes.push(`lineup ${q.get('lineup')} -> index ${line} (${LINEUPS[line]?.species.join(' → ') ?? 'all'})`);
    return { shot: { id: sid, vp, kind: 'lineup', line, label: `Lineup ${line} from URL — ${VIEWPORTS[vp].label}`, seed, hd2d: false, groups: ['lineups', vp] }, notes };
  }
  if (scene !== 'battle') throw new Error(`--url: scene "${scene}" has no shot kind; supported: scene=battle, scene=model&lineup=N`);
  const route = q.get('route') ?? 'meadow';
  const hotspot = q.get('hotspot') ?? 'tall-grass';
  const h = HOTSPOTS[route]?.[hotspot];
  if (!HOTSPOTS[route]) notes.push(`WARNING: unknown route "${route}" (known: ${Object.keys(HOTSPOTS).join(', ')})`);
  else if (!h) notes.push(`WARNING: unknown hotspot "${hotspot}" on ${route}; the game falls back to the first wild hotspot`);
  const battle = { route, hotspot };
  if (h?.kind === 'trainer') { notes.push(`trainer battle: ${h.trainer}`); if (q.has('foe')) notes.push('foe/foeLevel ignored for a trainer battle'); }
  else {
    if (q.has('foe')) battle.foe = q.get('foe');
    if (q.has('foeLevel')) battle.foeLevel = Number(q.get('foeLevel'));
    notes.push(battle.foe ? `wild battle: foe ${battle.foe} Lv${battle.foeLevel ?? 20}` : 'wild battle from the hotspot table (seeded)');
  }
  const arena = q.get('arena') ?? null;
  if (!arena) notes.push('no ?arena=: the arena resolves from route/hotspot/trainer (docs/HD2D.md); pass arena= to force one');
  const p = party ?? DEFAULT_URL_PARTY;
  notes.push(party ? `party as given (${p.map((x) => `${x.species} Lv${x.level}`).join(', ')})` : `party = the game's default for a direct battle URL: ${p.map((x) => `${x.species} Lv${x.level}`).join(', ')} (pass --party to change)`);
  notes.push(menu === 'fight' ? 'Fight menu opened after idle' : 'command menu as the URL would show it (no Fight menu); pass --menu fight to open it');
  const passthrough = {};
  for (const [k, v] of q) if (!['scene', 'seed', 'route', 'hotspot', 'foe', 'foeLevel', 'arena', 'gfx', 'q'].includes(k)) passthrough[k] = v;
  if (Object.keys(passthrough).length) notes.push(`other params kept as page qs: ${JSON.stringify(passthrough)}`);
  const sid = id ?? `${hotspot}-${vp}`;
  const shot = { id: sid, vp, kind: 'battle', arena, seed, label: `${h?.trainer ?? `${route}/${hotspot}`} from URL — ${VIEWPORTS[vp].label}`, battle, party: p, hd2d: true, groups: ['url', vp] };
  if (menu) shot.menu = menu;
  if (Object.keys(passthrough).length) shot.qs = passthrough;
  if (!arena) delete shot.arena;
  return { shot, notes };
}

/** One human line per shot for --list. */
export function describe(s) {
  const who = s.kind === 'battle' || s.kind === 'fx' || s.kind === 'baked'
    ? (HOTSPOTS[s.battle?.route]?.[s.battle?.hotspot]?.trainer ? `trainer ${HOTSPOTS[s.battle.route][s.battle.hotspot].trainer}` : `wild ${s.battle?.foe ?? 'table'}${s.battle?.foeLevel ? ' Lv' + s.battle.foeLevel : ''} @ ${s.battle?.route}/${s.battle?.hotspot}`)
    : s.kind === 'stadium' ? `hotseat ${s.stadium.near.join('/')} vs ${s.stadium.far.join('/')}`
      : s.kind === 'lineup' ? `model scene line ${s.line}: ${LINEUPS[s.line]?.species.join(' → ')}`
        : s.kind === 'screen' ? `screen ${s.screen}${s.route ? ' ' + s.route : ''}` : s.kind;
  const party = s.party ? s.party.map((p) => `${p.species}${p.level}`).join(',') : '-';
  return `${s.id.padEnd(22)} ${s.kind.padEnd(12)} ${s.vp.padEnd(5)} ${VIEWPORTS[s.vp].q.padEnd(4)} ${(s.arena ?? '-').padEnd(9)} seed ${String(s.seed ?? 11).padEnd(3)} ${who.padEnd(44)} party ${party}${s.menu ? ' menu:' + s.menu : ''}${s.move ? ' move:' + s.move : ''}`;
}

// ------------------------------------------------------------------ CLI
if (process.argv[1] && /shots\.mjs$/.test(process.argv[1])) {
  const fs = await import('node:fs');
  const { fileURLToPath } = await import('node:url');
  const argv = process.argv.slice(2);
  const get = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : undefined; };
  if (!argv.length || argv.includes('--help') || argv.includes('-h')) {
    console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').filter((l) => l.startsWith('//')).map((l) => l.slice(3)).join('\n'));
  } else if (argv.includes('--list')) {
    console.log('id                     kind         vp    tier arena     seed    who                                          party');
    for (const s of SHOTS) console.log(describe(s));
    console.log(`\ngroups: all, quick, battles, arenas, fx, halls, screens, lineups, baked, desk, phone, hd2d, <arena>, <line name>`);
  } else if (argv.includes('--show')) {
    const sel = selectShots(get('--show'));
    if (!sel.shots.length) { console.error(`no shot ${get('--show')}`); process.exit(2); }
    console.log(JSON.stringify(sel.shots, null, 1));
  } else if (argv.includes('--schema')) {
    console.log('// --shots-json FILE holds an ARRAY of shot objects. Fields:');
    console.log(JSON.stringify(SHOT_SCHEMA, null, 1));
    console.log('// Worked example (trainer Brann in the cave, seed 5, desk + phone; the built-in cave-* shots are trainer Sola):');
    console.log(JSON.stringify(SHOT_EXAMPLE, null, 1));
  } else if (argv.includes('--lineups')) {
    console.log('?scene=model&lineup=N  (N must be the INDEX; a name is not accepted by the game and silently shows line 0)');
    for (const l of LINEUPS) console.log(`  ${l.index}  ${l.name.padEnd(8)} ${l.species.join(' → ')}`);
    console.log('  all      every line, one row each');
    console.log('capture ids: lineup-<N>-desk (model scene) and lineup-<N>-baked-desk (toon-baked battle sprites)');
  } else if (argv.includes('--url')) {
    let party;
    if (get('--party')) party = get('--party').split(',').map((t) => { const [sp, lv] = t.split(':'); return P(sp, Number(lv ?? 5)); });
    try {
      const { shot, notes } = shotFromUrl(get('--url'), { id: get('--id'), vp: get('--vp') ?? 'desk', party, menu: get('--menu') });
      for (const n of notes) console.error(`[url] ${n}`);
      console.log(JSON.stringify([shot], null, 1));
    } catch (e) { console.error(`error: ${e.message}`); process.exit(2); }
  } else { console.error('unknown option; --help'); process.exit(2); }
}
