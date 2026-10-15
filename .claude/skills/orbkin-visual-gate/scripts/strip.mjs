#!/usr/bin/env node
// strip.mjs - frame-exact MOTION capture of one attack in the real game under a 60 fps virtual clock.
//
//   node strip.mjs --out DIR --move pyre-crash [--lead pyrelord] [--foe mossling] [--foe-level 12]
//        [--arena cave --route ridge --hotspot vent-cave] [--seed 13] [--frames 240] [--dt 16.667]
//        [--lead-frames 16] [--shot-frames 100] [--all-frames]
//        [--game game] [--dist DIR | --no-build] [--qs post=...] [--idle 0]
//
// Builds (or reuses --dist) and serves the game, sets the party (lead at level 30 with --move forced into
// slot 0), enters the battle, opens Fight and clicks the move. From that click it advances the clock ONE
// frame at a time (--dt ms per frame; 16.667 = 60 fps) and probes the engine every frame: battle text, foe HP
// bar width, number of flashing materials, scene children added/removed (projectile launch and impact burst),
// camera view offset. Two passes on the same deterministic clock: pass 1 probes only and finds the launch
// frame; pass 2 replays and screenshots the full frame to DIR/frames/fNNN.png (NNN = frames since the click)
// from launch-16 for 100 frames (--lead-frames, --shot-frames; --all-frames screenshots from the click), while the
// probe runs to --frames (240: the known late hit reaction lands ~127 f after impact). A miss retries with the next seed. --idle N first records N frames of the idle loop into DIR/idle/.
// Writes DIR/timeline.json (per-frame log), DIR/events.txt (condensed), DIR/meta.json {clip, subjects
// (attacker = "mine", target = "foe", boxes in CSS px at idle), launch, impact, first_reaction, first_hp,
// first_flash, text_frame, settle}. Feed DIR to make_strips.py (strips + GIF), motionlint.py (beats and
// amplitudes) and judge_motion.py (blind strip judge). Never judge motion from a single frozen frame.
// Takes ~1 min build + 5-10 min on a loaded CPU box (probe pass ~1 s/frame, screenshot pass ~3-5 s/frame).
// Exit 0 ok, 1 the attack missed with every seed / no impact detected, 2 usage or build error.
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const A = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => {
  if (a.startsWith('--')) acc.push([a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : 'true']);
  return acc;
}, []));
if (A.help) { console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').filter((l) => l.startsWith('//')).map((l) => l.slice(3)).join('\n')); process.exit(0); }
if (!A.out || !A.move) { console.error('usage: node strip.mjs --out DIR --move MOVE [options] (--help)'); process.exit(2); }
const GAME = path.resolve(A.game ?? process.env.ORBKIN_GAME ?? 'game');
const OUT = path.resolve(A.out);
const DIST = path.resolve(A.dist ?? path.join(OUT, 'dist'));
const DT = Number(A.dt ?? 16.667), MAXF = Number(A.frames ?? 240), IDLE_N = Number(A.idle ?? 0);
const LEAD = Number(A['lead-frames'] ?? 16), SHOTN = Number(A['shot-frames'] ?? 100), ALL = A['all-frames'] === 'true';
const SEED0 = Number(A.seed ?? 13);
if (!fs.existsSync(path.join(GAME, 'package.json'))) { console.error(`error: no game at ${GAME}`); process.exit(2); }
for (const bad of [path.join(GAME, 'dist'), GAME]) if (DIST === path.resolve(bad)) { console.error(`error: refusing to build into ${DIST}`); process.exit(2); }
const require = createRequire(path.join(GAME, 'package.json'));
const { chromium } = require('playwright');
fs.mkdirSync(path.join(OUT, 'frames'), { recursive: true });
if (IDLE_N) fs.mkdirSync(path.join(OUT, 'idle'), { recursive: true });
for (const d of ['frames', 'idle']) if (fs.existsSync(path.join(OUT, d))) for (const f of fs.readdirSync(path.join(OUT, d))) fs.rmSync(path.join(OUT, d, f));

const T0 = Date.now();
if (A['no-build'] !== 'true' && !A.dist) {
  const r = spawnSync('npx', ['vite', 'build', '--outDir', DIST, '--emptyOutDir'], { cwd: GAME, encoding: 'utf8' });
  fs.writeFileSync(path.join(OUT, 'build.log'), (r.stdout ?? '') + (r.stderr ?? ''));
  if (r.status !== 0) { console.log(JSON.stringify({ ok: false, error: `vite build failed, see ${OUT}/build.log` })); process.exit(2); }
}
if (!fs.existsSync(path.join(DIST, 'index.html'))) { console.log(JSON.stringify({ ok: false, error: `no build at ${DIST}` })); process.exit(2); }
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json', '.otf': 'font/otf', '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.glb': 'model/gltf-binary', '.webp': 'image/webp', '.bin': 'application/octet-stream', '.wasm': 'application/wasm', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  let p = path.join(DIST, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (p.endsWith('/')) p += 'index.html';
  fs.readFile(p, (err, data) => { if (err) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'content-type': MIME[path.extname(p)] || 'application/octet-stream' }); res.end(data); });
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}`;

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
    if (cap.pre) { let r; try { r = cap.pre(); } catch (e) { cap.errors.push(String((e && e.stack) || e)); r = 'pause'; } if (r === 'pause') { doPause(); return; } }
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
  cap.runUntil = (pred, max) => new Promise((res) => { const s = cap.frames; let ok = false; cap.pre = () => { if (pred()) { ok = true; return 'pause'; } return cap.frames - s >= max ? 'pause' : undefined; }; cap.onPause = () => res({ ok, frames: cap.frames - s }); cap.resume(); });
}
const until = async (page, src, max, what) => { const r = await page.evaluate(([s, m]) => window.__cap.runUntil(new Function(`return (${s});`), m), [src, max]); if (!r.ok) throw new Error(what); };
const frames = (page, n) => page.evaluate((n) => window.__cap.run(n), n);
const SETTLE_CSS = `for (const a of document.getAnimations()) { try { const e = a.effect && a.effect.getComputedTiming(); if (e && Number.isFinite(e.endTime)) a.finish(); } catch (_) {} }`;

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
let result = null, meta = null, lastErr = null;
/** One replay from page load to the end of the move. shotFrom = first frame index to screenshot (Infinity = none). */
async function replay(seed, shotFrom) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  await ctx.addInitScript(clockInit, DT);
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', (e) => errs.push(e.message.split('\n')[0]));
  try {
    const qs = new URLSearchParams({ seed: String(seed), gfx: 'hd2d', q: 'high', arena: A.arena ?? 'cave', scene: 'title' });
    if (A.qs) for (const [k, v] of new URLSearchParams(A.qs)) qs.set(k, v);
    await page.goto(`${BASE}/?${qs}`, { waitUntil: 'load', timeout: 60000 });
    await page.waitForFunction(() => !!window.__game && !!window.__cap, null, { timeout: 60000 });
    await page.evaluate(([lead, move]) => {
      const g = window.__game;
      g.debugSetParty([{ species: lead, level: 30 }, { species: 'dropple', level: 10 }]);
      const p = g.player(); const L = p.party[0];
      if (!L.moves.some((m) => m.id === move)) { L.moves[0] = { id: move, pp: 5 }; g.patchPlayer({ party: p.party }); }
    }, [A.lead ?? 'pyrelord', A.move]);
    await page.evaluate(async (b) => { const g = window.__game; g.setFast(true); await g.goto('battle', b); },
      { route: A.route ?? 'ridge', hotspot: A.hotspot ?? 'vent-cave', foe: A.foe ?? 'mossling', foeLevel: Number(A['foe-level'] ?? 12) });
    await until(page, 'window.__game && window.__game.idle()', 400, 'battle never idle');
    await page.evaluate(() => { window.__game.setFast(false); window.__game.setSpeed(1); });
    await frames(page, 10);
    const lay = await page.evaluate(() => window.__game.layout());
    const subjects = lay.subjects;
    const ri = await page.evaluate(() => window.__game.renderInfo());
    // optional idle loop capture (same clock)
    if (IDLE_N && shotFrom !== Infinity) for (let i = 0; i < IDLE_N; i++) { await page.screenshot({ path: path.join(OUT, 'idle', `f${String(i).padStart(3, '0')}.png`), animations: 'disabled' }); await frames(page, 1); }
    else if (IDLE_N) await frames(page, IDLE_N);
    const idx = await page.evaluate((id) => window.__game.player().party[0].moves.findIndex((m) => m.id === id), A.move);
    if (idx < 0) throw new Error(`move ${A.move} not in the lead's set`);
    await page.evaluate((s) => { new Function(s)(); document.querySelector('[data-testid="btn-fight"]').click(); }, SETTLE_CSS);
    await frames(page, 3);
    await page.evaluate(([idx, settle]) => {
      const st = window.__hd2d; const scene = st && st.scene;
      if (!scene) throw new Error('no HD-2D scene (window.__hd2d.scene): is ?gfx=hd2d active?');
      const em = [];
      scene.traverse((o) => { const m = o.material; if (o.isMesh && m && m.emissive && !Array.isArray(m) && m.emissive.r < 0.02) em.push(o); });
      window.__tl = { prev: new Set(scene.children), em };
      window.__probe = () => {
        const t = window.__tl; const now = new Set(scene.children);
        let added = 0, removed = 0; for (const o of now) if (!t.prev.has(o)) added++; for (const o of t.prev) if (!now.has(o)) removed++; t.prev = now;
        const text = (document.querySelector('[data-testid="battle-text"]')?.textContent ?? '').trim();
        const fill = (sel) => { const f = document.querySelector(`${sel} .hpfill`); return f ? f.style.width || getComputedStyle(f).width : ''; };
        const flash = t.em.filter((o) => o.material.emissive.r > 0.5).length;
        const v = st.camera && st.camera.view; const off = v && v.enabled ? [Math.round(v.offsetX), Math.round(v.offsetY)] : [0, 0];
        return { added, removed, children: now.size, text, foeHp: fill('[data-testid="panel-foe"]'), mineHp: fill('[data-testid="panel-mine"]'), flash, off, idle: window.__game.idle() };
      };
      new Function(settle)();
      document.querySelector(`[data-testid="move-${idx}"]`).click();
    }, [idx, SETTLE_CSS]);
    const log = []; let missed = false, idleRun = 0, launch = -1;
    for (let i = 0; i < MAXF; i++) {
      if (i >= shotFrom && i < shotFrom + SHOTN) await page.screenshot({ path: path.join(OUT, 'frames', `f${String(i).padStart(3, '0')}.png`), animations: 'disabled' });
      const p = await page.evaluate(() => window.__probe());
      p.i = i; p.ms = Math.round(i * DT); log.push(p);
      if (/missed/.test(p.text)) { missed = true; break; }
      if (launch < 0 && p.added > 0) launch = i;
      idleRun = p.idle ? idleRun + 1 : 0;
      if (idleRun > 6 && i > 60) break;
      await frames(page, 1);
    }
    await ctx.close();
    return { log, missed, launch, subjects, ri, errs };
  } catch (e) {
    await ctx.close().catch(() => {});
    throw e;
  }
}
for (const seed of [0, 1, 2, 3, 4].map((k) => SEED0 + k)) {
  try {
    // pass 1: probe only (fast), pass 2: screenshots from launch - LEAD on the same deterministic clock
    const p1 = ALL ? null : await replay(seed, Infinity);
    if (p1 && p1.missed) { console.error(`[strip] seed ${seed}: the attack missed, retrying`); continue; }
    const from = ALL ? 0 : Math.max(0, (p1.launch >= 0 ? p1.launch : 0) - LEAD);
    const p2 = await replay(seed, from);
    const { log, missed, launch, subjects, ri, errs } = p2;
    if (missed) { console.error(`[strip] seed ${seed}: the attack missed, retrying`); for (const f of fs.readdirSync(path.join(OUT, 'frames'))) fs.rmSync(path.join(OUT, 'frames', f)); continue; }
    if (p1 && p1.launch !== launch) console.error(`[strip] warning: launch frame differed between passes (${p1.launch} vs ${launch}); the clock is not fully deterministic for this move`);
    // beats
    const text0 = log[0].text;
    const textFrame = log.findIndex((p) => p.text !== text0 && /used/.test(p.text));
    const impact = log.findIndex((p) => launch >= 0 && p.i > launch && p.added >= 3);
    const hp0 = log[0].foeHp, off0 = log[0].off.join();
    const firstHp = log.findIndex((p) => p.foeHp !== hp0);
    const firstFlash = log.findIndex((p) => p.flash > 0);
    const firstShake = log.findIndex((p) => launch >= 0 && p.i > launch && p.off.join() !== off0);
    const reactions = [firstHp, firstFlash, firstShake].filter((x) => x >= 0 && (impact < 0 || x >= impact));
    const react = reactions.length ? Math.min(...reactions) : -1;
    const settle = (() => { for (let i = log.length - 1; i > 0; i--) if (!log[i].idle) return i + 1; return 0; })();
    result = { seed, dt: DT, move: A.move, lead: A.lead ?? 'pyrelord', foe: A.foe ?? 'mossling', arena: A.arena ?? 'cave', log };
    meta = { seed, dt: DT, fps: Math.round(1000 / DT), move: A.move, qs: A.qs ?? '', frames: log.length, viewport: [1280, 720],
      subjects, attacker: 'mine', target: 'foe', calls: ri.calls,
      text_frame: textFrame, launch, impact, first_hp: firstHp, first_flash: firstFlash, first_shake: firstShake, first_reaction: react, settle,
      beats: { text_to_launch_f: launch >= 0 && textFrame >= 0 ? launch - textFrame : null, launch_to_impact_f: launch >= 0 && impact >= 0 ? impact - launch : null,
        impact_to_reaction_f: impact >= 0 && react >= 0 ? react - impact : null, impact_to_hp_f: impact >= 0 && firstHp >= 0 ? firstHp - impact : null,
        launch_to_settle_f: launch >= 0 && settle > 0 ? settle - launch : null },
      targets: { text_to_launch_f: '<= 30 (project decision; today 64-73)', impact_to_reaction_f: '<= 2', launch_to_settle_f: '<= 60' },
      page_errors: errs.slice(0, 5) };
    meta.first_frame_file = from;
    break;
  } catch (e) {
    lastErr = e.message;
    console.error(`[strip] seed ${seed}: ${e.message}`);
  }
}
await browser.close(); server.close();
if (!result) { console.log(JSON.stringify({ ok: false, error: lastErr ?? 'the attack missed with every seed' })); process.exit(1); }
fs.writeFileSync(path.join(OUT, 'timeline.json'), JSON.stringify(result, null, 1));
fs.writeFileSync(path.join(OUT, 'meta.json'), JSON.stringify(meta, null, 1));
const ev = []; let lt = '', lhp = '', lfl = 0, loff = '0,0';
for (const p of result.log) {
  if (p.text !== lt) { ev.push(`${p.i}f ${p.ms}ms text: ${p.text.slice(0, 50)}`); lt = p.text; }
  if (p.added || p.removed) ev.push(`${p.i}f ${p.ms}ms scene +${p.added} -${p.removed} (=${p.children})`);
  if (p.foeHp !== lhp) { ev.push(`${p.i}f ${p.ms}ms foeHp ${p.foeHp}`); lhp = p.foeHp; }
  if ((p.flash > 0) !== (lfl > 0)) { ev.push(`${p.i}f ${p.ms}ms flash ${p.flash}`); lfl = p.flash; }
  if (p.off.join() !== loff) { ev.push(`${p.i}f ${p.ms}ms viewOffset ${p.off.join(',')}`); loff = p.off.join(); }
}
fs.writeFileSync(path.join(OUT, 'events.txt'), ev.join('\n'));
const ok = meta.impact >= 0;
console.log(JSON.stringify({ ok, out: OUT, frames: meta.frames, seconds: Math.round((Date.now() - T0) / 1000), beats: meta.beats, impact: meta.impact, launch: meta.launch,
  warning: ok ? undefined : 'no impact burst detected (>= 3 scene children added after launch); strips still usable, beats partial' }));
process.exit(ok ? 0 : 1);
