#!/usr/bin/env node
// Frame-exact battle FX timeline for Orbkin (HD-2D, virtual 60 fps clock).
//
// Drives the built game in headless Chromium (SwiftShader WebGL) one frame at a time: the page's
// requestAnimationFrame + performance.now are replaced by a virtual clock that only advances when
// this script steps it, so every capture is deterministic and repeat runs are pixel-identical.
// Per frame it logs the battle text, FX scene objects added/removed (classified), draw calls,
// linked programs, lights, live points, both kin's poses, the target's hit flash, the foe HP bar
// and the camera view offset. From the log it derives the beat frames (text, launch, impact,
// flash, reaction, hit-stop, shake, HP drain, settle) and takes an 8-frame strip (launch -> +70 f)
// plus a frozen mid-impact frame.
//
// Usage (normally through fx_timeline.sh):
//   node timeline.mjs --dist game/dist --out /tmp/tl --move storm-lance [--lead stormoth --lead-level 30]
//        [--foe mossling --foe-level 12] [--route ridge --hotspot vent-cave] [--arena cave] [--seed 13]
//        [--qs "a=b&c=d"] [--every 0] [--max-frames 420] [--crop x0,y0,x1,y1] [--base http://host:port]
// Output: <out>/timeline.json (frames + events + counters), <out>/events.txt, <out>/frames/f####.png,
//         <out>/strip-frames.json; prints the summary JSON on stdout. Exit 0 = ran, 2 = usage/harness error.
import { createRequire } from 'node:module';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const args = parseArgs(process.argv.slice(2));
if (args.help || args.h) { usage(); process.exit(0); }
const repoRoot = findRepoRoot(process.cwd());
const gameDir = path.join(repoRoot, 'game');
const dist = path.resolve(args.dist ?? path.join(gameDir, 'dist'));
const out = path.resolve(args.out ?? 'tl-out');
const move = String(args.move ?? 'storm-lance');
const moveName = args['move-name'] ?? move.split('-').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');
const lead = args.lead ?? 'stormoth', leadLevel = Number(args['lead-level'] ?? 24);
const foe = args.foe ?? 'cindertail', foeLevel = Number(args['foe-level'] ?? 30);
const route = args.route ?? 'ridge', hotspot = args.hotspot ?? 'vent-cave';
const arena = args.arena ?? '';
const seed = Number(args.seed ?? 13);
const every = Number(args.every ?? 0);
const maxFrames = Number(args['max-frames'] ?? 420);
const [vw, vh] = String(args.viewport ?? '1280x720').split('x').map(Number);
const FPS = 60, STEP_MS = 1000 / FPS;
const STRIP_EVERY = 10, STRIP_N = 8;

fs.mkdirSync(path.join(out, 'frames'), { recursive: true });

let require;
try { require = createRequire(path.join(gameDir, 'package.json')); } catch { die(`no game/package.json under ${gameDir}`); }
let chromium;
try { ({ chromium } = require('playwright')); } catch { die('playwright not installed: run `cd game && npm ci` first'); }

// ---- static server for the built game (or an external --base)
let server = null;
let base = args.base;
if (!base) {
  if (!fs.existsSync(path.join(dist, 'index.html'))) die(`no build at ${dist}: run \`cd game && npx vite build\` (or pass --dist / --base)`);
  const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.wasm': 'application/wasm', '.png': 'image/png', '.json': 'application/json', '.woff2': 'font/woff2', '.svg': 'image/svg+xml' };
  server = http.createServer((req, res) => {
    let p = path.join(dist, decodeURIComponent(new URL(req.url, 'http://x').pathname));
    if (p.endsWith('/')) p += 'index.html';
    fs.readFile(p, (err, data) => {
      if (err) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'content-type': MIME[path.extname(p)] || 'application/octet-stream' }); res.end(data);
    });
  }).listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
}

// ---- virtual clock, installed before any page script runs
const INIT = `(() => {
  const realRaf = window.requestAnimationFrame.bind(window);
  const realNow = performance.now.bind(performance);
  const q = new Map(); let nextId = 1; let frozen = false; let vt = 0; let frame = 0;
  window.__fxEvents = window.__fxEvents || [];
  window.requestAnimationFrame = (cb) => { const id = nextId++; q.set(id, cb); if (!frozen) realRaf(() => { if (q.delete(id)) cb(realNow()); }); return id; };
  window.cancelAnimationFrame = (id) => { q.delete(id); };
  performance.now = () => (frozen ? vt : realNow());
  window.__vclock = {
    freeze() { if (frozen) return; vt = realNow(); frozen = true; },
    get frame() { return frame; }, get time() { return vt; },
    step(n = 1) {
      if (!frozen) throw new Error('vclock not frozen');
      for (let i = 0; i < n; i++) {
        vt += ${STEP_MS}; frame++;
        const cbs = [...q.values()]; q.clear();
        for (const cb of cbs) cb(vt);
      }
      return frame;
    },
  };
})();`;

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: vw, height: vh }, deviceScaleFactor: 1 });
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e.message || e)));
page.on('console', (m) => { if (m.type() === 'error') pageErrors.push(m.text()); });
await page.addInitScript(INIT);

const qs = new URLSearchParams({ seed: String(seed), gfx: 'hd2d', scene: 'title' });
if (arena) qs.set('arena', arena);
const extra = args.qs ? `&${String(args.qs).replace(/^[?&]/, '')}` : '';
await page.goto(`${base}/?${qs}${extra}`);
await page.waitForFunction(() => !!window.__game?.scene?.(), null, { timeout: 60000 }).catch(() => die('game did not boot (no window.__game); check the build and the console'));
// Party lead that knows the move, then into the battle.
await page.evaluate(([lead, lvl, params]) => {
  window.__game.debugSetParty([{ species: lead, level: lvl }]);
  return window.__game.goto('battle', params);
}, [lead, leadLevel, { route, hotspot, foe, foeLevel }]);
const idleOk = await page.evaluate(() => window.__game.waitIdle(90000));
if (!idleOk) die('battle intro never became idle (90 s)');
await page.waitForFunction(() => !!window.__hd2d, null, { timeout: 5000 }).catch(() => die('no HD-2D stage (window.__hd2d): is ?gfx=hd2d supported for this route/hotspot/arena?'));
// A few real frames so sprite bakes settle, then freeze the clock.
await page.waitForTimeout(400);
await page.evaluate(() => window.__vclock.freeze());

// ---- per-frame sampler (runs in the page)
const SAMPLER = `(() => {
  const g = window.__game, st = window.__hd2d, scene = st.scene, cam = st.camera, gl = st.game.renderer.gl;
  const T = window.__tl || (window.__tl = { prev: new Map() });
  window.__vclock.step(1);
  const kind = (o) => o.isLight ? 'light' : o.isPoints ? 'points' : o.geometry?.attributes?.aCorner ? 'flip' : o.material?.uniforms?.uRing ? 'decal' : o.material?.uniforms?.uAmt ? 'glow' : o.isMesh ? 'mesh3d' : 'other';
  const cur = new Map(); let pointsAlive = 0, pointsCap = 0;
  const fxs = [];
  scene.traverse((o) => {
    if (!o.userData?.fx && !(o.isLight && o !== st.rig?.key)) return;
    if (o.isLight && !o.userData?.fx) return;
    const k = kind(o);
    cur.set(o.uuid, { k, ro: o.renderOrder, add: o.material?.blending === 2, name: o.name || '' });
    if (o.isPoints) { const a = o.geometry.attributes.aSize?.array; if (a) { pointsCap += a.length; for (let i = 0; i < a.length; i++) if (a[i] > 0.5) pointsAlive++; } }
    fxs.push(k);
  });
  const added = [], removed = [];
  for (const [id, v] of cur) if (!T.prev.has(id)) added.push(v);
  for (const [id, v] of T.prev) if (!cur.has(id)) removed.push(v.k);
  T.prev = cur;
  let lights = 0, lit = 0, pointLights = 0;
  scene.traverse((o) => { if (o.isLight) { lights++; if (o.isPointLight) { pointLights++; if (o.intensity > 0) lit++; } } });
  const pose = (v) => v ? [v.inner.position.x, v.inner.position.y, v.inner.position.z, v.body.quaternion.x, v.body.quaternion.y, v.body.quaternion.z, v.body.quaternion.w, v.body.scale.x, v.body.scale.y].map((x) => Math.round(x * 1e4) / 1e4) : null;
  const views = st.views || [];
  const foeV = views[1], mineV = views[0];
  const hpFill = document.querySelector('[data-testid="panel-foe"] .hpghost')?.parentElement?.firstElementChild;
  const hp = hpFill ? parseFloat(hpFill.style.width) : NaN;
  const ghost = document.querySelector('[data-testid="panel-foe"] .hpghost');
  const text = document.querySelector('[data-testid="battle-text"]')?.textContent ?? '';
  const bo = st.baseOffset, view = cam.view;
  const s = bo ? bo[3] / Math.max(1, gl.getDrawingBufferSize(new (Object.getPrototypeOf(cam.position).constructor)()).y) : 1;
  const dx = bo && view ? Math.round((view.offsetX - bo[0]) / s) : 0, dy = bo && view ? Math.round((view.offsetY - bo[1]) / s) : 0;
  const perf = g.perf?.();
  const ev = window.__fxEvents.splice(0);
  const keyI = st.rig?.key?.intensity ?? null;
  let liveSubjects = 0;
  for (const v of views) if (v && ((v.acting ?? 0) > 0 || v.busy)) liveSubjects++;
  const emis = foeV?.material?.emissive;
  return {
    frame: window.__vclock.frame, text, added, removed, fx: fxs.length, fxKinds: fxs, pointsAlive, pointsCap,
    calls: perf?.calls ?? gl.info.render.calls, programs: gl.info.programs.length, lights, pointLights, litPointLights: lit,
    foeActing: (foeV?.acting ?? 0) > 0 || !!foeV?.busy, mineActing: (mineV?.acting ?? 0) > 0,
    foe: pose(foeV), mine: pose(mineV), foeEmissive: emis ? Math.round(Math.max(emis.r, emis.g, emis.b) * 100) / 100 : 0, foeBlinkOff: !!foeV?.blinkOff,
    foeVisible: foeV ? foeV.root.visible : null, hp, ghost: ghost ? parseFloat(ghost.style.width) : NaN,
    shake: [dx, dy], idle: g.idle(), fxEvents: ev, keyI, liveSubjects,
  };
})()`;

// Where the kin stand on screen (before anything moves): the strip crop is built from this.
const layout = await page.evaluate(() => window.__game.layout());
const foeBox = layout.subjects.find((s) => s.name === 'foe') ?? null;
const mineBox = layout.subjects.find((s) => s.name === 'mine') ?? null;

// Idle reference frames.
const frames = [];
for (let i = 0; i < 6; i++) frames.push(await page.evaluate(SAMPLER));
// Idle reference = the quietest idle frame: sprite bake ticks (+2 calls) land on some idle frames.
const idleCalls = Math.min(...frames.map((f) => f.calls));
const idleKeyI = frames[0].keyI;
const idleFx = frames[frames.length - 1].fx;

// Pick the move through the real UI.
await page.getByTestId('btn-fight').click();
const btn = page.locator('.btn-move', { hasText: moveName }).first();
if (!(await btn.count())) {
  const names = await page.locator('.btn-move .mn').allTextContents();
  die(`move "${moveName}" is not on ${lead} L${leadLevel}'s menu (has: ${names.join(', ')}); pass --move-name or another --lead/--lead-level`);
}
await btn.click();

// ---- step the turn
const shots = new Map(); // frame -> file
let textFrame = null, launch = null, impact = null, impactMarked = false;
let secondUse = null;
const stripFrames = [];
const start = frames.length ? frames[frames.length - 1].frame : 0;
for (let i = 0; i < maxFrames; i++) {
  const f = await page.evaluate(SAMPLER);
  frames.push(f);
  const used = / used /.test(f.text);
  if (textFrame === null && used) textFrame = f.frame;
  else if (textFrame !== null && used && secondUse === null && f.frame > textFrame + 20 && !f.text.includes(moveName)) secondUse = f.frame;
  if (textFrame !== null && launch === null && f.added.length > 0) {
    launch = f.frame;
    for (let k = 0; k < STRIP_N; k++) stripFrames.push(launch + k * STRIP_EVERY);
  }
  if (launch !== null && impact === null) {
    if (f.fxEvents.some((e) => e.ev === 'impact')) { impact = f.frame; impactMarked = true; }
    else if (f.added.length >= 3) impact = f.frame;
  }
  // Capture: the 8 strip frames (launch, +10 .. +70), every frame from launch until impact + 8 (the
  // impact strip: impact-2, impact, +1, +2, +4, +8), then impact + 16 and + 32.
  const inWindow = launch !== null && f.frame >= launch && (impact === null || f.frame <= impact + 8);
  const want = stripFrames.includes(f.frame) || inWindow || (impact !== null && [16, 32].includes(f.frame - impact)) || (every > 0 && launch !== null && (f.frame - launch) % every === 0);
  if (want) {
    const file = path.join(out, 'frames', `f${String(f.frame).padStart(4, '0')}.png`);
    await page.screenshot({ path: file });
    shots.set(f.frame, file);
  }
  if (secondUse !== null && f.frame > secondUse + 2) break;
  if (launch !== null && f.idle && f.fx <= idleFx && f.frame > launch + 30) break;
  if (textFrame === null && i > 240) die('the move text never appeared: did the click land? (see events.txt)');
}

// ---- derive the beats
const E = deriveEvents(frames, { textFrame, launch, impact, impactMarked, idleCalls, idleFx, secondUse, idleKeyI });
const crop = args.crop ? String(args.crop).split(',').map(Number) : defaultCrop(foeBox, mineBox, vw, vh);
const result = {
  config: { move, moveName, lead, leadLevel, foe, foeLevel, route, hotspot, arena, seed, viewport: [vw, vh], qs: args.qs ?? '', base, fps: FPS },
  events: E.events, counters: E.counters, crop, foeBox, mineBox,
  strip: stripFrames.map((fr) => shots.get(fr) ?? null), midImpact: E.events.impact !== null ? shots.get(E.events.impact + 2) ?? null : null,
  impactStrip: E.events.impact !== null ? [-2, 0, 1, 2, 4, 8, 16, 32].map((d) => ({ d, file: shots.get(E.events.impact + d) ?? null })) : [],
  pageErrors, frames,
};
fs.writeFileSync(path.join(out, 'timeline.json'), JSON.stringify(result));
fs.writeFileSync(path.join(out, 'strip-frames.json'), JSON.stringify({ frames: result.strip, midImpact: result.midImpact, crop, launch: E.events.launch, every: STRIP_EVERY, impact: E.events.impact, impactStrip: result.impactStrip, foeBox, mineBox, launchFrame: shots.get(E.events.launch) ?? null }, null, 1));
fs.writeFileSync(path.join(out, 'events.txt'), eventsText(result));
const summary = { out, events: E.events, counters: E.counters, strip: result.strip.filter(Boolean).length, pageErrors: pageErrors.length };
console.log(JSON.stringify(summary, null, 1));
await browser.close();
server?.close();

// ---------------------------------------------------------------- helpers

function deriveEvents(frames, s) {
  const byFrame = new Map(frames.map((f) => [f.frame, f]));
  const F = (n) => byFrame.get(n);
  const { textFrame, launch, impact } = s;
  const last = frames[frames.length - 1].frame;
  // Idle breathing drifts scale/pitch by ~1e-3 per frame; hits, lunges and knockbacks move 0.01+.
  const changed = (a, b) => !!a && !!b && a.some((x, i) => Math.abs(x - b[i]) > (i < 3 ? 0.004 : 0.012));
  // "Frozen" = bit-identical pose (a real hit-stop stops the idle breathing too).
  const frozen = (a, b) => !!a && !!b && a.every((x, i) => Math.abs(x - b[i]) < 1e-5);
  const held = (a, b) => !!a && !!b && a.every((x, i) => Math.abs(x - b[i]) < (i < 3 ? 1e-3 : 4e-3));
  // First visible target feedback on/after the impact (or launch when no impact was found).
  const from = impact ?? launch ?? textFrame ?? frames[0].frame;
  let flash = null, reaction = null, hpStart = null, hpEnd = null, lastFx = null, lastFoeMove = null;
  const hp0 = F(from)?.hp;
  let prev = F(from - 1) ?? F(from);
  for (let n = from; n <= last; n++) {
    const f = F(n); if (!f) continue;
    if (flash === null && f.foeEmissive >= 0.8) flash = n; // hit(): 1.0 strong, 0.85 normal
    // The target reacts when its hit/pulse animation starts (CreatureView.acting), its flash or
    // blink shows, or its HP bar drops. Idle bobs (bounce landings move the body 0.03/frame) do not count.
    const foeReacts = f.foeActing || f.foeEmissive > 0.05 || f.foeBlinkOff || (Number.isFinite(hp0) && f.hp < hp0 - 0.01);
    if (reaction === null && foeReacts) reaction = n;
    if (Number.isFinite(hp0) && f.hp < hp0 - 0.01) { if (hpStart === null) hpStart = n; if (f.hp !== prev.hp) hpEnd = n; }
    if (f.fx > s.idleFx) lastFx = n;
    if (f.foeActing && (s.secondUse === null || n < s.secondUse)) lastFoeMove = n;
    prev = f;
  }
  // Hit-stop: the number of frames (the flash frame included) on which the target's pose stays
  // bit-identical while its flash is on: a hold of N frames reads N. attackerHeld = how many of
  // those frames the attacker did not move either.
  let hitStop = 0, attackerHeld = 0;
  if (flash !== null) {
    for (let n = flash + 1; n <= Math.min(last, flash + 24); n++) {
      const a = F(n), b = F(n - 1);
      if (!a || !b || !frozen(a.foe, b.foe) || a.foeEmissive <= 0.05) break;
      hitStop++;
      if (held(a.mine, b.mine) || !a.mineActing) attackerHeld++;
    }
    if (hitStop > 0) { hitStop++; attackerHeld++; }
  }
  // Set dim: the key light's intensity drop vs idle (sprites and FX are unlit by it, so this is the set).
  let dimPeak = 0, dimFrames = 0;
  if (s.idleKeyI) for (const f of frames) { const d = 1 - f.keyI / s.idleKeyI; if (d > 0.02) { dimFrames++; dimPeak = Math.max(dimPeak, d); } }
  // Severity, from the battle text that follows the hit.
  const allText = frames.map((f) => f.text).join('\n');
  const severity = /critical hit/i.test(allText) ? 'critical' : /super effective/i.test(allText) ? 'super-effective' : /not very effective/i.test(allText) ? 'not-very-effective' : 'normal';
  const ko = Number.isFinite(hp0) && frames.some((f) => f.frame >= from && f.hp <= 0.01);
  // Shake: non-zero view offsets after the impact.
  const sh = { start: null, frames: 0, peakPx: 0, directional: null, pattern: [] };
  for (let n = from - 1; n <= last; n++) {
    const f = F(n); if (!f) continue;
    const [dx, dy] = f.shake;
    if (dx || dy) { if (sh.start === null) sh.start = n; sh.frames++; sh.peakPx = Math.max(sh.peakPx, Math.abs(dx), Math.abs(dy)); if (sh.pattern.length < 8) sh.pattern.push([dx, dy]); }
  }
  if (sh.pattern.length >= 2) { const sx = sh.pattern.map((p) => Math.sign(p[0] || p[1])); sh.directional = sx[0] === sx[1]; }
  const settle = lastFx === null && lastFoeMove === null ? null : Math.max(lastFx ?? 0, lastFoeMove ?? 0);
  // Counters over the move window.
  const win = frames.filter((f) => launch !== null && f.frame >= launch && (settle === null || f.frame <= settle + 1));
  const peakCalls = win.length ? Math.max(...win.map((f) => f.calls)) : null;
  // FX draw calls = FX meshes/points in the scene (one call each; the light is none). Raw calls also
  // move with sprite re-bakes (+2 per acting kin per frame, +2 on bake ticks), so the budget uses this.
  const fxDraws = (f) => f.fxKinds.filter((k) => k !== 'light').length;
  const fxDrawsPeak = win.length ? Math.max(...win.map(fxDraws)) : 0;
  const liveSubjectsPeak = win.length ? Math.max(...win.map((f) => f.liveSubjects ?? 0)) : 0;
  const progIdle = frames[0].programs, progPeak = win.length ? Math.max(...win.map((f) => f.programs)) : progIdle;
  const meshes3d = win.reduce((n, f) => n + f.added.filter((a) => a.k === 'mesh3d').length, 0);
  const kindsAdded = {};
  for (const f of win) for (const a of f.added) kindsAdded[a.k] = (kindsAdded[a.k] ?? 0) + 1;
  const events = {
    text: textFrame, launch, impact, impactMarked: s.impactMarked, flash, reaction, hitStop, attackerHeld, severity, ko, hpBefore: hp0, hpAfter: F(last)?.hp, hpDrainStart: hpStart, hpDrainEnd: hpEnd, settle,
    textToLaunch: launch !== null && textFrame !== null ? launch - textFrame : null,
    launchToImpact: impact !== null && launch !== null ? impact - launch : null,
    impactToReaction: impact !== null && reaction !== null ? reaction - impact : null,
    impactToFlash: impact !== null && flash !== null ? flash - impact : null,
    launchToSettle: settle !== null && launch !== null ? settle - launch : null,
    aftermath: settle !== null && impact !== null ? settle - impact : null,
    hpDrainFrames: hpStart !== null && hpEnd !== null ? hpEnd - hpStart : null,
    shake: sh, setDimPeak: Math.round(dimPeak * 100) / 100, setDimFrames: dimFrames, secondMoveText: s.secondUse, end: last,
  };
  const counters = {
    idleCalls: s.idleCalls, peakCalls, extraCalls: peakCalls !== null ? peakCalls - s.idleCalls : null, fxDrawsPeak, liveSubjectsPeak,
    programsIdle: progIdle, programsPeak: progPeak,
    pointLights: Math.max(...frames.map((f) => f.pointLights)), litPointLightsPeak: Math.max(...frames.map((f) => f.litPointLights)),
    pointsAlivePeak: win.length ? Math.max(...win.map((f) => f.pointsAlive)) : 0, pointsCapPeak: win.length ? Math.max(...win.map((f) => f.pointsCap)) : 0,
    fxObjectsPeak: win.length ? Math.max(...win.map((f) => f.fx)) : 0, meshes3dAdded: meshes3d, fxAddedByKind: kindsAdded,
  };
  return { events, counters };
}

function eventsText(r) {
  const e = r.events, c = r.counters;
  const L = [];
  L.push(`# fx timeline: ${r.config.moveName} (${r.config.lead} L${r.config.leadLevel} -> ${r.config.foe} L${r.config.foeLevel}), seed ${r.config.seed}, ${r.config.arena || r.config.route + '/' + r.config.hotspot}`);
  L.push(`text ${e.text}  launch ${e.launch}  impact ${e.impact}${e.impactMarked ? ' (marked)' : ''}  flash ${e.flash}  reaction ${e.reaction}  hp ${e.hpDrainStart}..${e.hpDrainEnd}  settle ${e.settle}`);
  L.push(`text->launch ${e.textToLaunch} f | launch->impact ${e.launchToImpact} f | impact->flash ${e.impactToFlash} f | impact->reaction ${e.impactToReaction} f | hit-stop ${e.hitStop} f (attacker held ${e.attackerHeld}) | launch->settle ${e.launchToSettle} f | aftermath (impact->settle) ${e.aftermath} f | hp drain ${e.hpDrainFrames} f`);
  L.push(`severity ${e.severity}${e.ko ? ' (KO)' : ''}: foe HP ${e.hpBefore} -> ${e.hpAfter} %`);
  L.push(`shake: start ${e.shake.start} frames ${e.shake.frames} peak ${e.shake.peakPx} px ${e.shake.directional === null ? '' : e.shake.directional ? 'directional kick' : 'alternating buzz'} ${JSON.stringify(e.shake.pattern)}`);
  L.push(`set dim peak ${Math.round((e.setDimPeak ?? 0) * 100)} % over ${e.setDimFrames ?? 0} f (key light intensity vs idle)`);
  L.push(`FX draw calls peak ${c.fxDrawsPeak} (FX meshes/points in the scene; the budget counts these) | raw draw calls idle ${c.idleCalls} peak ${c.peakCalls} (+${c.extraCalls}, includes +2 per acting kin re-bake, up to ${c.liveSubjectsPeak} acting) | programs ${c.programsIdle} -> ${c.programsPeak} | point lights ${c.pointLights} (lit peak ${c.litPointLightsPeak}) | points alive peak ${c.pointsAlivePeak}/${c.pointsCapPeak} | fx objects peak ${c.fxObjectsPeak} | 3D fx meshes added ${c.meshes3dAdded} | added by kind ${JSON.stringify(c.fxAddedByKind)}`);
  if (r.pageErrors.length) L.push(`PAGE ERRORS: ${r.pageErrors.join(' | ')}`);
  L.push('');
  L.push('frame  calls prog fx pts | foeEmis blink hp    ghost shake   | text / added / removed');
  for (const f of r.frames) {
    const adds = f.added.map((a) => `+${a.k}${a.add ? '(add)' : ''}@${a.ro}`).join(' ');
    const rems = f.removed.map((k) => `-${k}`).join(' ');
    const mark = [f.frame === e.launch ? 'LAUNCH' : '', f.frame === e.impact ? 'IMPACT' : '', f.frame === e.flash ? 'FLASH' : '', f.frame === e.reaction ? 'REACT' : '', f.frame === e.settle ? 'SETTLE' : ''].filter(Boolean).join(' ');
    const note = [mark, f.text && f.frame === e.text ? JSON.stringify(f.text) : '', adds, rems, f.fxEvents.length ? JSON.stringify(f.fxEvents) : ''].filter(Boolean).join('  ');
    if (!note && f.frame !== e.text && !f.shake[0] && !f.shake[1] && f.foeEmissive === 0 && !f.foeBlinkOff && f.frame % 5 !== 0) continue;
    L.push(`${String(f.frame).padStart(5)}  ${String(f.calls).padStart(5)} ${String(f.programs).padStart(4)} ${String(f.fx).padStart(2)} ${String(f.pointsAlive).padStart(3)} | ${String(f.foeEmissive).padStart(7)} ${f.foeBlinkOff ? 'off  ' : 'on   '} ${String(Number.isFinite(f.hp) ? f.hp.toFixed(1) : '-').padStart(5)} ${String(Number.isFinite(f.ghost) ? f.ghost.toFixed(1) : '-').padStart(5)} ${String(f.shake[0]).padStart(3)},${String(f.shake[1]).padEnd(3)} | ${note}`);
  }
  return L.join('\n') + '\n';
}

function defaultCrop(foe, mine, w, h) {
  // A crop around the target that keeps the attacker's near edge and room above for projectiles.
  if (!foe) return [Math.round(w * 0.35), 0, Math.round(w * 0.95), Math.round(h * 0.8)];
  const cx = foe.x + foe.w / 2, cy = foe.y + foe.h / 2;
  const half = Math.max(foe.w, foe.h) * 2.2;
  let x0 = cx - half, x1 = cx + half, y0 = cy - half * 1.15, y1 = cy + half * 0.85;
  if (mine) { x0 = Math.min(x0, mine.x + mine.w * 0.5); }
  return [Math.max(0, Math.round(x0)), Math.max(0, Math.round(y0)), Math.min(w, Math.round(x1)), Math.min(h, Math.round(y1))];
}

function median(a) { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; }
function parseArgs(argv) {
  const o = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const k = a.slice(2);
    const v = argv[i + 1] !== undefined && !argv[i + 1].startsWith('--') ? argv[++i] : true;
    o[k] = v;
  }
  return o;
}
function findRepoRoot(d) {
  for (let i = 0; i < 8; i++) { if (fs.existsSync(path.join(d, 'game', 'package.json'))) return d; const p = path.dirname(d); if (p === d) break; d = p; }
  return path.resolve(process.cwd(), '..');
}
function die(msg) { console.error(`timeline: ${msg}`); process.exit(2); }
function usage() {
  console.log(`node timeline.mjs --out DIR --move storm-lance [--lead stormoth --lead-level 24] [--foe cindertail --foe-level 30]
  [--route ridge --hotspot vent-cave] [--arena cave] [--seed 13] [--dist game/dist | --base URL] [--qs "k=v&k2=v2"]
  [--every N] [--max-frames 420] [--crop x0,y0,x1,y1] [--viewport 1280x720] [--move-name "Storm Lance"]
Frame-exact (virtual 60 fps) log of one attack: beats, counters, the 8-frame motion strip (launch -> +70 f), every
frame from launch to impact + 8 plus impact + 16 / + 32 (the impact strip), and the mid-impact frame.
Defaults: Stormoth L24 moves first; foe cindertail L30 takes a plain 1x hit (~46%), --foe maelstrode --foe-level 30 a super-effective one (~50%).
Seed 13 rolls a CRITICAL on the first Storm Lance (both foes); seed 14 rolls a plain hit; seeds 8, 9, 11, 12 miss.
Mark the impact frame explicitly from game code with window.__fxEvents.push({ev:'impact'}) (else: first frame with >= 3 FX objects added).`);
}
