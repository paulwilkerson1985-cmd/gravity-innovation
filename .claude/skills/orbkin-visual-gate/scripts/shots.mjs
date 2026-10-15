// Shot list for the frozen-clock capture harness. Ids are STABLE: gates compare runs by id.
// Usage: imported by capture.mjs; `node capture.mjs --list` prints every id with its label.
//
//   <arena>-desk / <arena>-phone   one battle per HD-2D arena (forced with ?arena=), desktop 1280x720 high
//                                  tier / phone 393x851 DPR 2.75 touch low tier
//   fx-flame-desk, fx-tide-desk    an attack frozen mid-impact (played at 0.25 speed) - stills only; judge
//                                  MOTION with strip.mjs, never with these frames
//   hof-desk/-phone, victory-desk/-phone   Hall of Fame, Arena victory podium
//   title-, starter-, route-meadow-, route-ridge-, menu-, party- (-desk / -phone)   non-battle screens
//
// Selection syntax (--ids, comma separated): exact ids, arena names (`cave` = both viewports), groups:
// all, quick, battles, arenas, fx, halls, screens, desk, phone, hd2d. Extra shots: --shots-json FILE
// (an array of shot objects shaped like the ones below; use it for a new arena or a new kin as the foe).

export const VIEWPORTS = {
  desk: { label: 'desktop 1280x720 · high tier', q: 'high', ctx: { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 } },
  phone: { label: 'phone 393x851 @2.75 · low tier', q: 'low', ctx: { viewport: { width: 393, height: 851 }, deviceScaleFactor: 2.75, isMobile: true, hasTouch: true } },
};

const P = (species, level) => ({ species, level });

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
