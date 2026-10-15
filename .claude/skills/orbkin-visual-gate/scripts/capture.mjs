#!/usr/bin/env node
// capture.mjs - deterministic FROZEN-CLOCK screenshots of the Orbkin build (desk 1280x720, phone 393x851,
// canvas-only clean frame, 2x nearest creature crop, creature boxes), ready for artgate_compare / visual_judge.
//
//   node capture.mjs --out DIR [--ids cave-desk,cave-phone] [--game game] [--dist DIR | --no-build]
//        [--baseline DIR] [--qs "post=nobloom"] [--self-check first|all|none] [--workers 2]
//        [--dt 100] [--settle 8] [--min-frame 200] [--shots-json extra.json] [--no-crop] [--timeout-s 420]
//   node capture.mjs --out DIR --url '?scene=battle&route=ridge&hotspot=hiker-brann&seed=5&arena=cave'
//        [--id cavebrann] [--vp desk,phone] [--party ashkit:5,rillback:15] [--menu fight]
//   node capture.mjs --list | --schema | --lineups        (same as `node shots.mjs --list | --schema | --lineups`)
//
// --url derives a shot from a game URL (battle, or scene=model&lineup=N) and prints what it will do on stderr:
// the trainer or wild foe it resolves to, the party it injects (the game's own default for a bare battle URL
// is ONE Ashkit Lv5, because the harness always calls debugSetParty) and whether the Fight menu is opened
// (only with --menu fight; a plain URL shows the command menu). --vp desk,phone makes one shot per viewport
// with ids <id>-desk / <id>-phone. A shot that needs a party and has none is an error (no silent default).
// --shots-json FILE: an ARRAY of shot objects; `node shots.mjs --schema` prints every field and a worked
// example (trainer Brann in the cave). Built-in `cave-*` is trainer Sola, not Brann: check `--list`.
//
// Shot kinds: battle, fx, stadium, hof, arenaVictory, screen, lineup, baked.
//   lineup  ?scene=model&lineup=N (N = 0 flame, 1 tide, 2 flora, 3 spark, 4 terra, 5 gale, 6 singles; names are
//           resolved here, the game itself would silently show line 0 for a name) under the frozen clock with
//           &freeze=<t>; writes <id>.png (unbaked meshes on the grey stage). Ids lineup-<N>-desk.
//   baked   the toon-baked battle sprite of every species of a line: one wild battle per species in a neutral
//           arena, the foe box cropped and tiled 3x nearest into <id>.png (+ <id>.<species>.png). This is what
//           ships; use it for ip_check. ~1 battle load per species (2-4 min each on the loaded cloud box).
//
// What it does: `vite build` of --game (default ./game) into DIR/dist (never game/dist), serves it on a
// random local port, and for every shot: opens the page with a VIRTUAL FRAME CLOCK (requestAnimationFrame
// advances the game clock by exactly --dt ms per frame, nothing depends on machine load), drives the scene
// to idle, then runs to an ABSOLUTE frame number max(idle frame, --min-frame) + --settle so every variant
// shares one animation phase, and screenshots with CSS animations disabled.
// Writes DIR/raw/<id>.png, <id>.clean.png (UI hidden), <id>.crop.png (2x nearest creature crop, battle
// shots), <id>.fail.png on error, and DIR/capture.json: per shot {ok, frame, layout: creature boxes in CSS px,
// calls, triangles, warnings, errors, url}. --baseline DIR adds DIR/compare.json: per id changed % and
// whether the capture frame matched (pixdiff.py). --self-check re-captures a shot in a fresh browser and
// asserts pixel identity (default: the first shot; "all" doubles the time).
// Rules it serves: frozen clock or the capture is invalid; repeat captures must be pixel-identical (repeat.sh
// proves it for every id: two captures from one dist, sha256 + pixdiff tol 0); desk AND phone for every arena
// change. Needs: node 22, the game's node_modules (playwright 1.56 + chromium), python3 with Pillow + numpy.
// Measured on the 4-core cloud box (SwiftShader) at load 20-40: build 12-60 s, desk battle shot 4-7 min (361-444 s),
// phone 1.5-2 min, each self-check adds the same again; at load < 4 about half that. Use --workers 1 when the
// load average is above 8 and never run strip.mjs in parallel with a capture (both are CPU-bound). Cost $0.
// Exit 0 all shots ok, 1 some failed, 2 usage/build error. The last stdout line is a JSON summary; per-shot
// wall time is capture.json shots[].ms.
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import http from 'node:http';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ARENA_MOVES, LINEUPS, SHOTS, SHOT_EXAMPLE, SHOT_SCHEMA, VIEWPORTS, describe, lineupIndex, selectShots, shotFromUrl } from './shots.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => {
  if (a.startsWith('--')) acc.push([a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : 'true']);
  return acc;
}, []));
if (args.help) { console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').filter((l) => l.startsWith('//')).map((l) => l.slice(3)).join('\n')); process.exit(0); }
if (args.list) { for (const s of SHOTS) console.log(describe(s)); process.exit(0); }
if (args.schema) { console.log('// --shots-json FILE: an ARRAY of these objects'); console.log(JSON.stringify(SHOT_SCHEMA, null, 1)); console.log('// example:'); console.log(JSON.stringify(SHOT_EXAMPLE, null, 1)); process.exit(0); }
if (args.lineups) { for (const l of LINEUPS) console.log(`${l.index}  ${l.name.padEnd(8)} ${l.species.join(' → ')}`); process.exit(0); }
if (!args.out) { console.error('usage: node capture.mjs --out DIR [--ids ...] (--help for all options)'); process.exit(2); }

const GAME = path.resolve(args.game ?? process.env.ORBKIN_GAME ?? 'game');
const OUT = path.resolve(args.out);
const DIST = path.resolve(args.dist ?? path.join(OUT, 'dist'));
const WORKERS = Math.max(1, Number(args.workers ?? 2));
const DT = Number(args.dt ?? 100);               // ms of game time per frame (the game's dt cap)
const SETTLE = Number(args.settle ?? 8);
const MIN_FRAME = Number(args['min-frame'] ?? 200); // absolute alignment frame (detcap.mjs convention)
const EXTRA_QS = args.qs ?? '';
const SELF = args['self-check'] ?? 'first';
const TIMEOUT_S = Number(args['timeout-s'] ?? 420); // per shot; SwiftShader on a loaded 4-core box needs 2-6 min for a desk shot
const RAW = path.join(OUT, 'raw');
const SHOT_OPTS = { timeout: 60000, animations: 'disabled' };
const PY = process.env.ORBKIN_PY ?? 'python3';

if (!fs.existsSync(path.join(GAME, 'package.json'))) { console.error(`error: no game at ${GAME} (pass --game)`); process.exit(2); }
for (const bad of [path.join(GAME, 'dist'), GAME]) if (path.resolve(DIST) === path.resolve(bad)) { console.error(`error: refusing to build into ${DIST}`); process.exit(2); }
const require = createRequire(path.join(GAME, 'package.json'));
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { console.error(`error: playwright not found in ${GAME}/node_modules (${e.message})`); process.exit(2); }

// ------------------------------------------------------------------ build + serve
const T0 = Date.now();
fs.mkdirSync(RAW, { recursive: true });
if (args['no-build'] !== 'true' && !args.dist) {
  const log = path.join(OUT, 'build.log');
  const r = spawnSync('npx', ['vite', 'build', '--outDir', DIST, '--emptyOutDir'], { cwd: GAME, encoding: 'utf8' });
  fs.writeFileSync(log, (r.stdout ?? '') + (r.stderr ?? ''));
  if (r.status !== 0) { console.log(JSON.stringify({ ok: false, error: `vite build failed, see ${log}` })); process.exit(2); }
  console.error(`[capture] built ${GAME} -> ${DIST} in ${((Date.now() - T0) / 1000).toFixed(0)}s`);
}
if (!fs.existsSync(path.join(DIST, 'index.html'))) { console.log(JSON.stringify({ ok: false, error: `no build at ${DIST}` })); process.exit(2); }
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json', '.otf': 'font/otf', '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.glb': 'model/gltf-binary', '.webp': 'image/webp', '.bin': 'application/octet-stream', '.wasm': 'application/wasm', '.svg': 'image/svg+xml', '.ogg': 'audio/ogg', '.mp3': 'audio/mpeg' };
const server = http.createServer((req, res) => {
  let p = path.join(DIST, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (p.endsWith('/')) p += 'index.html';
  fs.readFile(p, (err, data) => { if (err) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'content-type': MIME[path.extname(p)] || 'application/octet-stream' }); res.end(data); });
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}`;

let extra = [];
if (args['shots-json']) {
  extra = JSON.parse(fs.readFileSync(args['shots-json'], 'utf8'));
  if (!Array.isArray(extra)) { console.log(JSON.stringify({ ok: false, error: '--shots-json must hold an ARRAY of shot objects (node shots.mjs --schema)' })); process.exit(2); }
}
let urlIds = null;
if (args.url) {
  let party;
  if (args.party) party = args.party.split(',').map((t) => { const [sp, lv] = t.split(':'); return { species: sp, level: Number(lv ?? 5) }; });
  urlIds = [];
  for (const vp of (args.vp ?? 'desk').split(',')) {
    const base = args.id ?? null;
    try {
      const { shot, notes } = shotFromUrl(args.url, { id: base ? `${base}-${vp}` : undefined, vp, party, menu: args.menu });
      for (const n of notes) console.error(`[capture --url ${vp}] ${n}`);
      extra.push(shot); urlIds.push(shot.id);
    } catch (e) { console.log(JSON.stringify({ ok: false, error: `--url: ${e.message}` })); process.exit(2); }
  }
}
const sel = selectShots(args.ids ?? (urlIds ? urlIds.join(',') : 'cave-desk,cave-phone'), extra);
if (sel.unknown.length) console.error(`[capture] unknown ids/groups ignored: ${sel.unknown.join(', ')}`);
const shots = sel.shots;
// validate before spending minutes: party where the kind needs one, lineup index, known kinds
const NEEDS_PARTY = { battle: true, fx: true, hof: true, baked: true };
const problems = [];
for (const s of shots) {
  if (!s.id || !s.vp || !VIEWPORTS[s.vp]) problems.push(`${s.id ?? '?'}: vp must be desk|phone`);
  if (NEEDS_PARTY[s.kind] && !(Array.isArray(s.party) && s.party.length)) problems.push(`${s.id}: kind ${s.kind} needs "party": [{species, level}, ...]; the harness always injects it (the game's own default for a bare battle URL is [{"species":"ashkit","level":5}]) - no silent default here`);
  if (s.kind === 'screen' && ['route', 'menu', 'party'].includes(s.screen) && !(Array.isArray(s.party) && s.party.length)) problems.push(`${s.id}: screen ${s.screen} needs a party`);
  if (s.kind === 'lineup' || s.kind === 'baked') { try { s.line = lineupIndex(s.line); if (s.line === 'all' && s.kind === 'baked') problems.push(`${s.id}: baked needs one line, not all`); } catch (e) { problems.push(`${s.id}: ${e.message}`); } }
}
if (problems.length) { console.log(JSON.stringify({ ok: false, error: 'shot validation failed', problems })); process.exit(2); }

// ------------------------------------------------------------------ in-page frame clock
function clockInit(dt) {
  if (window.__cap) return;
  const realRaf = window.requestAnimationFrame.bind(window);
  const cap = { dt, vt: 0, frames: 0, paused: true, queue: [], scheduled: false, nextId: 1, pre: null, onPause: null, errors: [] };
  window.__cap = cap;
  const schedule = () => { if (!cap.scheduled && !cap.paused) { cap.scheduled = true; realRaf(tick); } };
  const doPause = () => { cap.paused = true; cap.pre = null; const f = cap.onPause; cap.onPause = null; if (f) f(); };
  function tick(realT) {
    cap.scheduled = false;
    if (cap.paused) return;
    if (cap.pre) {
      let r;
      try { r = cap.pre(); } catch (e) { cap.errors.push(String((e && e.stack) || e)); r = 'pause'; }
      if (r === 'pause') { doPause(); return; }
    }
    const q = cap.queue; cap.queue = [];
    cap.vt = cap.vt ? cap.vt + cap.dt : realT;
    for (const entry of q) { try { entry[1](cap.vt); } catch (e) { setTimeout(() => { throw e; }); } }
    cap.frames++;
    schedule();
  }
  window.requestAnimationFrame = (cb) => { const id = cap.nextId++; cap.queue.push([id, cb]); schedule(); return id; };
  window.cancelAnimationFrame = (id) => { cap.queue = cap.queue.filter((e) => e[0] !== id); };
  cap.resume = () => { cap.paused = false; schedule(); };
  cap.run = (n) => new Promise((res) => { const end = cap.frames + n; cap.pre = () => (cap.frames >= end ? 'pause' : undefined); cap.onPause = () => res(cap.frames); cap.resume(); });
  cap.runTo = (n) => new Promise((res) => { cap.pre = () => (cap.frames >= n ? 'pause' : undefined); cap.onPause = () => res(cap.frames); cap.resume(); });
  cap.runUntil = (pred, max) => new Promise((res) => {
    const start = cap.frames; let ok = false;
    cap.pre = () => { if (pred()) { ok = true; return 'pause'; } return cap.frames - start >= max ? 'pause' : undefined; };
    cap.onPause = () => res({ ok, frames: cap.frames - start }); cap.resume();
  });
}

// ------------------------------------------------------------------ helpers
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function withTimeout(p, ms, what) {
  let timer;
  const t = new Promise((_, rej) => { timer = setTimeout(() => rej(new Error(`timeout after ${Math.round(ms / 1000)}s (${what})`)), ms); });
  return Promise.race([p, t]).finally(() => clearTimeout(timer));
}
async function until(page, predSrc, max, what) {
  const r = await page.evaluate(([src, max]) => window.__cap.runUntil(new Function(`return (${src});`), max), [predSrc, max]);
  if (!r.ok) throw new Error(`${what}: not reached in ${max} frames`);
  return r.frames;
}
const frames = (page, n) => page.evaluate((n) => window.__cap.run(n), n);
const runTo = (page, n) => page.evaluate((n) => window.__cap.runTo(n), n);
const SETTLE_CSS = `for (const a of document.getAnimations()) { try { const e = a.effect && a.effect.getComputedTiming(); if (e && Number.isFinite(e.endTime)) a.finish(); } catch (_) {} }`;
const click = (page, testid) => page.evaluate(([t, settle]) => {
  new Function(settle)();
  const el = document.querySelector(`[data-testid="${t}"]`);
  if (!el) throw new Error(`no element [data-testid=${t}]`);
  el.click();
}, [testid, SETTLE_CSS]);

function urlFor(shot, scene) {
  const vp = VIEWPORTS[shot.vp];
  const qs = new URLSearchParams({ seed: String(shot.seed ?? 11), q: vp.q });
  if (shot.hd2d !== false) qs.set('gfx', 'hd2d');
  if (shot.arena && (shot.kind === 'battle' || shot.kind === 'fx' || shot.kind === 'baked')) qs.set('arena', shot.arena);
  if (shot.kind === 'lineup') { qs.set('lineup', String(shot.line)); qs.set('freeze', String(shot.freeze ?? 0.6)); }
  for (const [k, v] of new URLSearchParams(EXTRA_QS)) qs.set(k, v);
  for (const [k, v] of Object.entries(shot.qs ?? {})) qs.set(k, String(v));
  qs.set('scene', scene);
  return `${BASE}/?${qs}`;
}
async function setParty(page, party, forceMove) {
  await page.evaluate(([party, forceMove]) => {
    const g = window.__game;
    g.debugSetParty(party);
    if (forceMove) {
      const p = g.player(); const lead = p.party[0];
      if (!lead.moves.some((m) => m.id === forceMove)) { lead.moves[0] = { id: forceMove, pp: 5 }; g.patchPlayer({ party: p.party }); }
    }
  }, [party, forceMove ?? null]);
}
const IDLE = 'window.__game && window.__game.idle()';
/** Absolute-frame alignment: every variant is shot at the same frame number, so idle phase/blinks/particles match. */
async function settleTo(page, shot) {
  const now = await page.evaluate(() => window.__cap.frames);
  const target = Math.max(now, shot.minFrame ?? MIN_FRAME) + (shot.settle ?? SETTLE);
  await runTo(page, target);
  return target;
}

async function battleSetup(page, shot) {
  await setParty(page, shot.party, shot.move);
  await page.evaluate(async (battle) => { const g = window.__game; g.setFast(true); await g.goto('battle', battle); }, shot.battle);
  await until(page, IDLE, 400, 'battle idle');
  await page.evaluate(() => { window.__game.setFast(false); window.__game.setSpeed(1); });
}

const KINDS = {
  async battle(page, shot, ctx) {
    await battleSetup(page, shot);
    if (shot.menu === 'fight') await click(page, 'btn-fight');
    ctx.frame = await settleTo(page, shot);
  },
  async fx(page, shot, ctx) {
    await battleSetup(page, shot);
    const idx = await page.evaluate((id) => window.__game.player().party[0].moves.findIndex((m) => m.id === id), shot.move);
    if (idx < 0) throw new Error(`move ${shot.move} not in the lead's set`);
    await click(page, 'btn-fight');
    await frames(page, 2);
    const r = await page.evaluate(([idx, afterImpact, maxFrames, settle]) => new Promise((res) => {
      const cap = window.__cap, g = window.__game, scene = window.__hd2d && window.__hd2d.scene;
      if (!scene) throw new Error('no HD-2D scene (window.__hd2d.scene)');
      const name = (document.querySelector('[data-testid="panel-mine"] .pname')?.textContent ?? '').trim();
      let prev = new Set(scene.children), phase = 'text', n = 0, after = 0;
      new Function(settle)();
      document.querySelector(`[data-testid="move-${idx}"]`).click();
      cap.pre = () => {
        n++;
        const now = new Set(scene.children);
        let added = 0; for (const o of now) if (!prev.has(o)) added++; prev = now;
        const text = document.querySelector('[data-testid="battle-text"]')?.textContent ?? '';
        if (phase !== 'impact' && /missed/.test(text)) { phase = 'missed'; return 'pause'; }
        if (phase === 'text') { if (text.startsWith(`${name} used`)) phase = 'flight'; }
        else if (phase === 'flight') { if (added > 0) { phase = 'launch'; g.setSpeed(0.25); } }
        else if (phase === 'launch') { if (added >= 3) phase = 'impact'; }
        if (phase === 'impact') { if (after >= afterImpact) return 'pause'; after++; }
        return n >= maxFrames ? 'pause' : undefined;
      };
      cap.onPause = () => res({ phase, frames: n });
      cap.resume();
    }), [idx, shot.afterImpact ?? 3, 160, SETTLE_CSS]);
    ctx.info.fx = r;
    if (r.phase === 'missed') { ctx.retry = 'the attack missed'; return; }
    if (r.phase !== 'impact') ctx.warnings.push(`impact not detected (phase ${r.phase}, ${r.frames} frames); frame is whatever was on screen`);
    ctx.late = shot.lateFrames ?? 6;
    ctx.frame = await page.evaluate(() => window.__cap.frames);
  },
  async stadium(page, shot, ctx) {
    const mk = (ids, k) => ids.map((sp, i) => ({ species: sp, moves: ARENA_MOVES[sp], uid: `u${k}${i}` }));
    const teams = [mk(shot.stadium.near, 0), mk(shot.stadium.far, 1)];
    await page.evaluate(async (teams) => { const g = window.__game; g.setFast(true); await g.goto('arenaBattle', { setup: { mode: 'hotseat', names: ['Ember', 'Rill'], teams, seed: 7, round: 1 } }); }, teams);
    for (let i = 0; i < 6; i++) {
      await until(page, `(() => { const s = window.__game.arena(); return !!s && (s.curtain || (s.asking !== null && !s.playing)); })()`, 400, 'arena prompt');
      const s = await page.evaluate(() => window.__game.arena());
      if (s.curtain) { await click(page, 'arena-curtain-go'); continue; }
      if (s.menuButtons.includes('btn-fight')) break;
    }
    await page.evaluate(() => { window.__game.setFast(false); window.__game.setSpeed(1); });
    if (shot.menu === 'fight') await click(page, 'btn-fight');
    ctx.frame = await settleTo(page, shot);
  },
  async hof(page, shot, ctx) {
    await setParty(page, shot.party);
    await page.evaluate(async () => {
      const g = window.__game;
      g.debugDefeat('scout-pim', 'hiker-brann', 'adept-sola', 'angler-merrow', 'rider-tavi', 'champion-vale');
      g.patchPlayer({ champion: true }); g.setFast(true); await g.goto('victory', { route: 'plateau' });
    });
    await until(page, IDLE, 400, 'hall idle');
    await page.evaluate(() => { window.__game.setFast(false); window.__game.setSpeed(1); });
    ctx.frame = await settleTo(page, { ...shot, settle: (shot.settle ?? SETTLE) + 4 });
  },
  async arenaVictory(page, shot, ctx) {
    await page.evaluate(async () => {
      const t = (ids) => ids.map((sp, i) => ({ species: sp, moves: ['quick-jab'], uid: 'v' + sp + i }));
      const summary = { mode: 'hotseat', names: ['Ember', 'Rill'], teams: [t(['pyrelord', 'maelstrode', 'verdantusk']), t(['stormoth', 'cragmaul', 'cyclonyx'])], winner: 0, reason: 'ko', turns: 9, kos: [3, 1], hp: [[0.6, 0, 0.3], [0, 0, 0]] };
      const g = window.__game; g.setFast(true); await g.goto('arenaVictory', { summary, setup: null, near: 0 });
    });
    await until(page, IDLE, 400, 'victory idle');
    await page.evaluate(() => { window.__game.setFast(false); window.__game.setSpeed(1); });
    ctx.frame = await settleTo(page, { ...shot, settle: (shot.settle ?? SETTLE) + 4 });
  },
  async lineup(page, shot, ctx) {
    await until(page, `window.__game && window.__game.scene() === 'model'`, 300, 'model scene');
    await frames(page, 12);
    const label = await page.evaluate(() => (document.body.innerText || '').trim().split('\n')[0]);
    ctx.info.lineup = { line: shot.line, label, species: LINEUPS[shot.line]?.species ?? null };
    const want = LINEUPS[shot.line]?.species ?? [];
    if (want.length && !want.some((sp) => label.toLowerCase().includes(sp.slice(0, 5)))) ctx.warnings.push(`lineup label "${label}" does not mention ${want.join('/')}: wrong line on screen?`);
    ctx.frame = await settleTo(page, { ...shot, settle: 0 });
  },
  async baked(page, shot, ctx) {
    // one wild battle per species of the line; the foe box (the front-facing toon-baked sprite) is cropped per species
    const species = LINEUPS[shot.line].species;
    ctx.info.baked = { line: shot.line, species, parts: [] };
    for (const sp of species) {
      await setParty(page, shot.party);
      await page.evaluate(async (battle) => { const g = window.__game; g.setFast(true); await g.goto('battle', battle); }, { ...shot.battle, foe: sp, foeLevel: shot.foeLevel ?? 20 });
      await until(page, IDLE, 400, `battle idle (${sp})`);
      await page.evaluate(() => { window.__game.setFast(false); window.__game.setSpeed(1); });
      const frame = await settleTo(page, shot);
      const lay = await page.evaluate(() => window.__game.layout());
      const foe = (lay.subjects || []).find((b) => b.name === 'foe');
      if (!foe) throw new Error(`no foe box for ${sp}`);
      const pad = 10;
      const clip = { x: Math.max(0, foe.x - pad), y: Math.max(0, foe.y - pad), width: foe.w + 2 * pad, height: foe.h + 2 * pad };
      const file = path.join(RAW, `${shot.id}.${sp}.png`);
      await page.screenshot({ path: file, clip, ...SHOT_OPTS });
      ctx.info.baked.parts.push({ species: sp, file, box: foe, frame });
      ctx.frame = frame;
    }
    ctx.sheet = ctx.info.baked.parts.map((p) => p.file);
  },
  async screen(page, shot, ctx) {
    const sc = shot.screen;
    if (sc === 'title' || sc === 'starter') {
      await until(page, `window.__game && window.__game.scene() === '${sc}'`, 300, `${sc} scene`);
      await frames(page, 12);
      if (sc === 'starter') { await click(page, 'starter-mossling'); await frames(page, 8); }
      ctx.frame = await settleTo(page, { ...shot, settle: 0 });
      return;
    }
    await setParty(page, shot.party);
    await page.evaluate(async ([sc, route, defeat]) => {
      const g = window.__game;
      if (defeat?.length) g.debugDefeat(...defeat);
      g.setFast(true);
      if (sc === 'party') await g.goto('party', { from: 'menu', route }); else await g.goto('route', { route });
    }, [sc, shot.route, shot.defeat ?? []]);
    const want = sc === 'party' ? 'party' : 'route';
    await until(page, `window.__game.scene() === '${want}'`, 300, `${want} scene`);
    await page.evaluate(() => { window.__game.setFast(false); window.__game.setSpeed(1); });
    await frames(page, 12);
    if (sc === 'menu') { await page.evaluate(() => window.__game.openMenu()); await frames(page, 4); }
    ctx.frame = await settleTo(page, { ...shot, settle: 0 });
  },
};

// ------------------------------------------------------------------ one shot
async function runShot(browser, shot, suffix = '') {
  const vp = VIEWPORTS[shot.vp];
  const t0 = Date.now();
  const ctx = { warnings: [], errors: [], notes: [], info: {} };
  const context = await browser.newContext({ ...vp.ctx });
  await context.addInitScript(clockInit, DT);
  const page = await context.newPage();
  page.on('pageerror', (e) => { if (!/unknown scene none/.test(e.message)) ctx.errors.push(`pageerror: ${e.message.split('\n')[0]}`); });
  page.on('console', (m) => { if (m.type() === 'error') ctx.errors.push(`console: ${m.text().slice(0, 300)}`); });
  page.on('crash', () => ctx.errors.push('page crashed'));
  const raw = path.join(RAW, `${shot.id}${suffix}.png`);
  if (!suffix) for (const f of fs.readdirSync(RAW)) if (f === `${shot.id}.png` || (f.startsWith(`${shot.id}.`) && f.endsWith('.png'))) fs.rmSync(path.join(RAW, f), { force: true });
  const result = { id: shot.id, label: shot.label, kind: shot.kind, vp: shot.vp, arena: shot.arena ?? null, ok: false };
  try {
    const scene = shot.kind === 'lineup' ? 'model' : shot.kind === 'screen' && (shot.screen === 'title' || shot.screen === 'starter') ? shot.screen : 'none';
    const seeds = shot.kind === 'fx' ? [0, 1, 2, 3].map((k) => (shot.seed ?? 11) + k) : [shot.seed ?? 11];
    for (const seed of seeds) {
      ctx.retry = null; result.seed = seed; result.url = urlFor({ ...shot, seed }, scene);
      await page.goto(result.url, { waitUntil: 'load', timeout: 60000 });
      await page.waitForFunction(() => !!window.__game && !!window.__cap, null, { timeout: 60000 });
      await page.evaluate(() => document.fonts.ready.then(() => 0));
      if (!KINDS[shot.kind]) throw new Error(`unknown shot kind ${shot.kind}`);
      await KINDS[shot.kind](page, shot, ctx);
      if (!ctx.retry) break;
      ctx.notes.push(`seed ${seed}: ${ctx.retry}, retried`);
    }
    if (ctx.retry) throw new Error(`${ctx.retry} with every seed (${seeds.join(', ')})`);
    const st = await page.evaluate(() => ({ perf: window.__game.perf ? window.__game.perf() : null, ri: window.__game.renderInfo(), arenaId: window.__hd2d?.terrain?.def?.id ?? null, frames: window.__cap.frames, capErrors: window.__cap.errors }));
    if (shot.hd2d && !st.perf) ctx.warnings.push('expected the HD-2D pipeline but perf() is null (default renderer?)');
    if (shot.arena && (shot.kind === 'battle' || shot.kind === 'fx') && st.arenaId !== shot.arena) ctx.warnings.push(`arena is ${st.arenaId}, expected ${shot.arena}`);
    if (st.ri.calls >= 100) ctx.warnings.push(`draw calls ${st.ri.calls} >= 100 budget`);
    ctx.errors.push(...st.capErrors.map((e) => `frame-hook: ${e}`));
    await page.evaluate(() => document.fonts.ready.then(() => 0));
    if (ctx.sheet) {
      // tile the per-species crops 3x nearest into one sheet (what ip_check wants)
      const py = `
import sys, json
from PIL import Image, ImageDraw
files = json.loads(sys.argv[1]); out = sys.argv[2]; scale = 3
ims = [Image.open(f).convert('RGB') for f in files]
ims = [im.resize((im.width * scale, im.height * scale), Image.NEAREST) for im in ims]
gap = 24; h = max(im.height for im in ims) + 28; w = sum(im.width for im in ims) + gap * (len(ims) + 1)
sheet = Image.new('RGB', (w, h), (72, 74, 80)); d = ImageDraw.Draw(sheet); x = gap
for f, im in zip(files, ims):
    sheet.paste(im, (x, h - im.height - 4)); d.text((x, 4), f.rsplit('.', 2)[-2], fill=(235, 235, 235)); x += im.width + gap
sheet.save(out); print(json.dumps({'sheet': out, 'size': sheet.size}))`;
      const r = spawnSync(PY, ['-I', '-c', py, JSON.stringify(ctx.sheet), raw], { encoding: 'utf8' });
      if (r.status !== 0) throw new Error(`sheet composition failed: ${(r.stderr || '').slice(-300)}`);
    } else {
      await page.screenshot({ path: raw, ...SHOT_OPTS });
    }
    result.raw = raw; result.frame = ctx.frame ?? st.frames;
    if (shot.kind === 'fx' && ctx.late && !suffix) {
      await frames(page, ctx.late);
      result.late = path.join(RAW, `${shot.id}.late.png`);
      await page.screenshot({ path: result.late, ...SHOT_OPTS });
    }
    if (shot.hd2d !== false && !suffix && !ctx.sheet) {
      const id = await page.evaluate(() => {
        const s = document.createElement('style'); s.id = '__clean';
        s.textContent = 'body > *:not(#app), #app > *:not(#view) { opacity: 0 !important; }';
        document.head.appendChild(s); return s.id;
      });
      result.clean = path.join(RAW, `${shot.id}.clean.png`);
      await page.screenshot({ path: result.clean, ...SHOT_OPTS });
      await page.evaluate((id) => document.getElementById(id)?.remove(), id);
    }
    result.calls = st.ri.calls; result.triangles = st.ri.triangles; result.perf = st.perf; result.arenaId = st.arenaId;
    try { result.layout = (await page.evaluate(() => window.__game.layout())).subjects; } catch { /* optional */ }
    result.ok = true;
  } catch (e) {
    ctx.errors.unshift(String(e.message ?? e).split('\n')[0]);
    try { await page.screenshot({ path: path.join(RAW, `${shot.id}.fail.png`), timeout: 15000 }); result.failShot = path.join(RAW, `${shot.id}.fail.png`); } catch { /* page gone */ }
  } finally {
    await withTimeout(context.close(), 20000, 'context close').catch(() => {});
  }
  if (ctx.info.fx) result.fx = ctx.info.fx;
  if (ctx.info.lineup) result.lineup = ctx.info.lineup;
  if (ctx.info.baked) result.baked = ctx.info.baked;
  result.warnings = ctx.warnings; result.notes = ctx.notes; result.errors = ctx.errors; result.ms = Date.now() - t0;
  return result;
}

// ------------------------------------------------------------------ worker pool
const COST = (s) => (s.kind === 'baked' ? 8 : s.kind === 'fx' ? 5 : s.kind === 'screen' || s.kind === 'lineup' ? 0 : s.vp === 'desk' ? 3 : 1);
const queue = [...shots].sort((a, b) => COST(b) - COST(a));
const results = new Map();
const launch = () => chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
async function launchRetry() { for (let i = 0; ; i++) { try { return await launch(); } catch (e) { if (i >= 2) throw e; await sleep(2000); } } }
const selfIds = new Set(SELF === 'all' ? shots.map((s) => s.id) : SELF === 'none' ? [] : shots.length ? [shots[0].id] : []);

async function worker(w) {
  let browser;
  try { browser = await launchRetry(); } catch (e) { console.error(`[capture w${w}] browser launch failed: ${e.message}`); return; }
  while (queue.length) {
    const shot = queue.shift();
    const limit = TIMEOUT_S * 1000 * (shot.kind === 'fx' ? 1.5 : shot.kind === 'baked' ? Math.max(2, (LINEUPS[shot.line]?.species.length ?? 2)) : 1);
    let r;
    try { r = await withTimeout(runShot(browser, shot), limit, shot.id); } catch (e) {
      r = { id: shot.id, label: shot.label, kind: shot.kind, vp: shot.vp, arena: shot.arena ?? null, ok: false, errors: [String(e.message ?? e)], warnings: [], ms: limit };
      await browser.close().catch(() => {}); browser = null;
    }
    if (r.ok && selfIds.has(shot.id)) {
      // pixel-identity self-check: same shot, fresh browser context (fresh browser for the first worker shot)
      try {
        const r2 = await withTimeout(runShot(browser, shot, '.again'), limit, shot.id + ' self-check');
        if (r2.ok) {
          const d = spawnSync(PY, ['-I', path.join(HERE, 'pixdiff.py'), r.raw, r2.raw], { encoding: 'utf8' });
          let j = null; try { j = JSON.parse(d.stdout.trim().split('\n').pop()); } catch { /* no json */ }
          r.selfCheck = { identical: !!(j && j.identical), changed_pct: j ? j.changed_pct : null, frame2: r2.frame };
          if (!r.selfCheck.identical) r.warnings.push(`SELF-CHECK FAILED: repeat capture differs by ${j ? j.changed_pct : '?'}% (frames ${r.frame} vs ${r2.frame}); the clock is not frozen for this shot`);
          fs.rmSync(r2.raw, { force: true });
        } else r.warnings.push('self-check capture failed: ' + (r2.errors ?? []).join(' | '));
      } catch (e) { r.warnings.push('self-check error: ' + e.message); }
    }
    if (!browser || !browser.isConnected()) {
      try { browser = await launchRetry(); } catch (e) { console.error(`[capture w${w}] browser relaunch failed: ${e.message}`); results.set(shot.id, r); return; }
    }
    results.set(shot.id, r);
    const t = ((Date.now() - T0) / 1000).toFixed(0);
    console.error(`[capture w${w} ${t}s] ${r.ok ? 'ok  ' : 'FAIL'} ${shot.id} ${(r.ms / 1000).toFixed(1)}s frame=${r.frame ?? '-'}${r.calls != null ? ` calls=${r.calls}` : ''}${r.selfCheck ? ` self-check=${r.selfCheck.identical ? 'identical' : 'DIFFERS'}` : ''}${r.warnings?.length ? ` WARN ${r.warnings.join(' | ')}` : ''}${r.errors?.length ? ` ERR ${r.errors.slice(0, 3).join(' | ')}` : ''}`);
  }
  await browser?.close().catch(() => {});
}

await Promise.all(Array.from({ length: Math.min(WORKERS, shots.length) }, (_, i) => worker(i)));
server.close();
const ordered = shots.map((s) => results.get(s.id) ?? { id: s.id, label: s.label, kind: s.kind, vp: s.vp, arena: s.arena ?? null, ok: false, errors: ['not captured (no browser)'], warnings: [], ms: 0 });
// incremental runs into the same OUT dir keep earlier shots (same settings only: dt/settle/minFrame/qs must match)
let kept = [];
try {
  const prev = JSON.parse(fs.readFileSync(path.join(OUT, 'capture.json'), 'utf8'));
  const same = prev.frameDt === DT && prev.settleFrames === SETTLE && prev.minFrame === MIN_FRAME && (prev.extraQs ?? '') === EXTRA_QS;
  if (same) kept = (prev.shots ?? []).filter((s) => s.ok && !results.has(s.id) && fs.existsSync(s.raw ?? ''));
  else console.error('[capture] settings differ from the earlier run in this dir; earlier shots dropped from capture.json');
} catch { /* first run */ }
const out = { base: BASE, game: GAME, dist: DIST, out: OUT, frameDt: DT, settleFrames: SETTLE, minFrame: MIN_FRAME, extraQs: EXTRA_QS, workers: WORKERS,
  seconds: Math.round((Date.now() - T0) / 1000), unknown: sel.unknown, shots: [...kept, ...ordered] };
fs.writeFileSync(path.join(OUT, 'capture.json'), JSON.stringify(out, null, 1));

// crops (2x nearest creature crop) and the before/after diff, via the Python helpers
if (args['no-crop'] !== 'true') {
  const c = spawnSync(PY, ['-I', path.join(HERE, 'crop.py'), OUT], { encoding: 'utf8' });
  if (c.status !== 0) console.error(`[capture] crop.py failed: ${(c.stderr || c.stdout).slice(-300)}`);
}
let compare = null;
if (args.baseline) {
  const c = spawnSync(PY, ['-I', path.join(HERE, 'crop.py'), OUT, '--compare', path.resolve(args.baseline)], { encoding: 'utf8' });
  try { compare = JSON.parse(c.stdout.trim().split('\n').pop()); } catch { console.error(`[capture] compare failed: ${(c.stderr || c.stdout).slice(-300)}`); }
}
const okN = ordered.filter((r) => r.ok).length;
const summary = { ok: okN === ordered.length, captured: okN, total: ordered.length, seconds: out.seconds, out: OUT, capture_json: path.join(OUT, 'capture.json'),
  self_check: ordered.filter((r) => r.selfCheck).map((r) => ({ id: r.id, identical: r.selfCheck.identical })),
  shot_seconds: Object.fromEntries(ordered.map((r) => [r.id, Math.round((r.ms ?? 0) / 1000)])),
  load1: (() => { try { return Math.round(os.loadavg()[0] * 10) / 10; } catch { return null; } })(),
  warnings: Object.fromEntries(ordered.filter((r) => r.warnings?.length).map((r) => [r.id, r.warnings])),
  failed: ordered.filter((r) => !r.ok).map((r) => ({ id: r.id, errors: (r.errors ?? []).slice(0, 2) })),
  compare };
console.log(JSON.stringify(summary));
process.exit(summary.ok ? 0 : 1);
