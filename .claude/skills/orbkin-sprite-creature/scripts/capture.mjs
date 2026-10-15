// Frozen-clock captures of the Orbkin game (headless Chromium + SwiftShader, virtual 60 fps rAF).
// Every capture of the same tree, URL, viewport and frame count is pixel-identical (wall-clock
// captures are not: judges flipped verdicts on sprite phase, so never screenshot by "waiting").
//
//   node capture.mjs still  --url "scene=battle&route=meadow&hotspot=tall-grass&gfx=hd2d&foe=kin19&seed=7" \
//                           --out DIR --name foe-kin19 [--views desk,phone] [--frames 2400] [--settle 120] [--no-idle]
//            (battle URLs run until the UI is idle, then `settle` frames; other scenes run exactly frames+settle)
//   node capture.mjs strip  --url "...battle url..." --out DIR --name kin19-attack --action lunge|hit|crit|faint|idle \
//                           [--frames 72] [--every 2] [--view desk] [--target foe|mine]
//   node capture.mjs probe  --url "...battle url..." --out DIR --name kin19-blink [--seconds 90] [--target foe|mine]
//   node capture.mjs build  --game DIR            (just (re)build the game into DIR/.. dist used by the other modes)
// Options: --game <game dir> (default: the repo's game/), --dist <dir> (default <out>/../dist), --build (force rebuild),
//          --port N (default 4477). Output: PNGs + <name>.json (viewport, frames, subjects, per-frame log).
// Exit codes: 0 ok, 2 bad arguments, 3 page error / game never became idle.
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const mode = args[0];
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const has = (k) => args.includes(k);
if (!['still', 'strip', 'probe', 'build'].includes(mode) || has('--help')) {
  console.error(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(0, 15).join('\n'));
  process.exit(has('--help') ? 0 : 2);
}
const GAME = path.resolve(opt('--game', path.resolve(HERE, '../../../../game')));
const OUT = path.resolve(opt('--out', 'out/capture'));
fs.mkdirSync(OUT, { recursive: true });
const DIST = path.resolve(opt('--dist', path.join(OUT, '..', 'dist')));
const PORT = Number(opt('--port', 4477));
const name = opt('--name', mode);
const require = createRequire(path.join(GAME, 'package.json'));

function build() {
  console.error(`[capture] building ${GAME} -> ${DIST}`);
  const r = spawnSync('npx', ['vite', 'build', '--outDir', DIST, '--emptyOutDir', '--logLevel', 'error'], { cwd: GAME, stdio: ['ignore', 'inherit', 'inherit'], env: { ...process.env, PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: '1' } });
  if (r.status !== 0) { console.error('[capture] build failed'); process.exit(3); }
  fs.writeFileSync(path.join(DIST, '.built-from'), GAME);
}
/** Newest mtime under <game>/src (a stale dist after an edit would capture old geometry). */
function newestSrc(dir) {
  let t = 0;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    t = Math.max(t, e.isDirectory() ? newestSrc(p) : fs.statSync(p).mtimeMs);
  }
  return t;
}
const stale = () => !fs.existsSync(path.join(DIST, 'index.html')) || fs.statSync(path.join(DIST, 'index.html')).mtimeMs < newestSrc(path.join(GAME, 'src'))
  || (fs.existsSync(path.join(DIST, '.built-from')) && fs.readFileSync(path.join(DIST, '.built-from'), 'utf8') !== GAME);
if (mode === 'build' || has('--build') || stale()) build();
if (mode === 'build') process.exit(0);

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.wasm': 'application/wasm', '.png': 'image/png', '.jpg': 'image/jpeg', '.json': 'application/json', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg' };
const server = http.createServer((req, res) => {
  let p = path.join(DIST, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (p.endsWith('/') || !fs.existsSync(p)) p = path.join(DIST, 'index.html');
  fs.readFile(p, (err, data) => {
    if (err) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': MIME[path.extname(p)] || 'application/octet-stream' });
    res.end(data);
  });
}).listen(PORT);

// Virtual clock: requestAnimationFrame callbacks only run when the test steps them, 16.667 ms
// each; performance.now() follows the same clock so idle timeouts and the tween clock agree.
const VCLOCK = `(() => {
  const q = []; let t = 0, frame = 0;
  const origNow = performance.now.bind(performance);
  window.requestAnimationFrame = (cb) => { q.push(cb); return q.length; };
  window.cancelAnimationFrame = () => {};
  performance.now = () => t;
  window.__vclock = {
    get t() { return t; }, get frame() { return frame; },
    step(n = 1) { for (let i = 0; i < n; i++) { t += 1000 / 60; frame++; const cbs = q.splice(0, q.length); for (const cb of cbs) cb(t); } return frame; },
    realNow: origNow,
  };
})();`;

const VIEWPORTS = {
  desk: { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 },
  phone: { viewport: { width: 393, height: 851 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
};

const { chromium } = require('playwright');
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const report = { mode, name, url: opt('--url', ''), game: GAME, dist: DIST, views: {} };
let failed = false;

async function open(viewName, url) {
  const ctx = await browser.newContext(VIEWPORTS[viewName]);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.addInitScript(VCLOCK);
  await page.goto(`http://localhost:${PORT}/?${url}`);
  await page.waitForFunction(() => !!(window.__game && window.__game.scene && window.__game.scene()), null, { timeout: 60000 });
  return { ctx, page, errors };
}

/** Step the virtual clock until the game is idle (or maxFrames), then `settle` more frames. */
async function runToIdle(page, maxFrames, settle) {
  let frames = 0, idle = false;
  while (frames < maxFrames) {
    const r = await page.evaluate(() => { window.__vclock.step(6); return { idle: window.__game.idle(), f: window.__vclock.frame }; });
    frames = r.f;
    await page.waitForTimeout(1); // let real-time promises (dialog beats, curtain) resolve
    if (r.idle) { idle = true; break; }
  }
  if (settle > 0) await page.evaluate((n) => window.__vclock.step(n), settle);
  return { idle, frame: await page.evaluate(() => window.__vclock.frame) };
}

const layoutOf = (page) => page.evaluate(() => {
  const lay = window.__game.layout ? window.__game.layout() : null;
  // Eye boxes: project the eye-tagged vertices (rigA.w == 5) of each HD-2D kin, in CSS px like layout().
  const st = window.__hd2d;
  if (lay && st && st.views) {
    const cam = st.camera; cam.updateMatrixWorld();
    const c = document.getElementById('view').getBoundingClientRect();
    for (const [i, name] of [[0, 'mine'], [1, 'foe']]) {
      const view = st.views[i]; const sub = lay.subjects.find((s) => s.name === name);
      if (!view || !sub) continue;
      const g = view.mesh.geometry; const pos = g.attributes.position; const rig = g.attributes.rigA;
      view.mesh.updateWorldMatrix(true, false);
      const box = { L: [Infinity, Infinity, -Infinity, -Infinity], R: [Infinity, Infinity, -Infinity, -Infinity] };
      for (let k = 0; k < pos.count; k++) {
        if (Math.round(rig.getW(k)) !== 5) continue;
        const b = box[pos.getX(k) < 0 ? 'L' : 'R'];
        const w = new (view.mesh.position.constructor)(pos.getX(k), pos.getY(k), pos.getZ(k)).applyMatrix4(view.mesh.matrixWorld).project(cam);
        const sx = (w.x * 0.5 + 0.5) * c.width, sy = (-w.y * 0.5 + 0.5) * c.height;
        b[0] = Math.min(b[0], sx); b[2] = Math.max(b[2], sx); b[1] = Math.min(b[1], sy); b[3] = Math.max(b[3], sy);
      }
      const toBox = (b) => (Number.isFinite(b[0]) ? { x: Math.round(b[0]), y: Math.round(b[1]), w: Math.round(b[2] - b[0]), h: Math.round(b[3] - b[1]) } : null);
      const L = toBox(box.L), R = toBox(box.R);
      // The near eye (larger on screen) is the one the sprite shows; the far one may be hidden by the head.
      const near = !L ? R : !R ? L : (L.w * L.h >= R.w * R.h ? L : R);
      const x0 = near ? near.x : Infinity;
      if (near) sub.eyesAll = { L, R };
      if (near) sub.eyes = near;
    }
  }
  return lay;
});

if (mode === 'still') {
  const views = opt('--views', 'desk,phone').split(',');
  const maxFrames = Number(opt('--frames', 2400));
  const settle = Number(opt('--settle', 120));
  // Only battles report idle (the UI waiting for input); other scenes just run `--frames` frames.
  const requireIdle = !has('--no-idle') && /scene=battle/.test(report.url);
  for (const v of views) {
    const { ctx, page, errors } = await open(v, report.url);
    const r = requireIdle ? await runToIdle(page, maxFrames, settle) : { idle: true, frame: await page.evaluate((n) => window.__vclock.step(n), maxFrames + settle) };
    const file = path.join(OUT, `${name}-${v}.png`);
    await page.screenshot({ path: file });
    const layout = await layoutOf(page);
    const perf = await page.evaluate(() => (window.__game.perf ? window.__game.perf() : null));
    const info = await page.evaluate(() => window.__game.renderInfo());
    report.views[v] = { file, ...VIEWPORTS[v].viewport, dpr: VIEWPORTS[v].deviceScaleFactor, idle: r.idle, frame: r.frame, subjects: layout?.subjects ?? [], drawCalls: info.calls, perf, errors };
    if (!r.idle || errors.length) failed = true;
    await ctx.close();
  }
}

if (mode === 'strip' || mode === 'probe') {
  const v = opt('--view', 'desk');
  const target = opt('--target', 'foe') === 'mine' ? 0 : 1;
  const { ctx, page, errors } = await open(v, report.url);
  const r = await runToIdle(page, Number(opt('--max', 2400)), 60);
  if (!r.idle) failed = true;
  const dpr = VIEWPORTS[v].deviceScaleFactor;
  const hasStage = await page.evaluate(() => !!window.__hd2d);
  if (!hasStage) { console.error('[capture] no HD-2D stage on this page (use a battle URL with gfx=hd2d)'); failed = true; }
  const layout = await layoutOf(page);
  const subj = layout?.subjects.find((s) => s.name === (target ? 'foe' : 'mine'));
  if (mode === 'strip' && hasStage && subj) {
    const action = opt('--action', 'lunge');
    const frames = Number(opt('--frames', 72));
    const every = Number(opt('--every', 2));
    // Fixed crop around the actor at rest (attacker only: room for the lunge travel toward the
    // other kin, the other kin itself mostly outside; judge sync with a separate full-frame strip).
    const other = layout.subjects.find((s) => s.name === (target ? 'mine' : 'foe')) ?? subj;
    const towardsRight = other.x > subj.x;
    const x0 = subj.x - subj.w * (towardsRight ? 0.35 : 1.3), x1 = subj.x + subj.w * (towardsRight ? 2.3 : 1.35);
    const clip = { x: Math.max(0, Math.floor(x0)), y: Math.max(0, Math.floor(subj.y - subj.h * 0.6)), width: 0, height: 0 };
    clip.width = Math.min(VIEWPORTS[v].viewport.width - clip.x, Math.ceil(x1 - clip.x));
    clip.height = Math.min(VIEWPORTS[v].viewport.height - clip.y, Math.ceil(subj.h * 1.9));
    const framesDir = path.join(OUT, `${name}-frames`);
    fs.mkdirSync(framesDir, { recursive: true });
    await page.evaluate(([side, act]) => {
      const st = window.__hd2d;
      const view = st.views[side];
      const towards = st.spots[1 - side];
      window.__act = { done: false, impact: null, log: [] };
      const run = act === 'lunge' ? view.lunge(towards) : act === 'hit' ? view.hit(false) : act === 'crit' ? view.hit(true) : act === 'faint' ? view.faint() : act === 'appear' ? view.appear() : Promise.resolve();
      run.then(() => { window.__act.done = true; });
    }, [target, action]);
    const log = [];
    for (let f = 0; f < frames; f++) {
      const s = await page.evaluate((side) => {
        window.__vclock.step(1);
        const st = window.__hd2d; const view = st.views[side];
        return { f: window.__vclock.frame, done: window.__act.done, x: +view.inner.position.x.toFixed(4), y: +view.inner.position.y.toFixed(4), z: +view.inner.position.z.toFixed(4), sy: +view.body.scale.y.toFixed(4), sx: +view.body.scale.x.toFixed(4), blink: +view.uniforms.uBlink.value.toFixed(3), visible: view.root.visible && !view.blinkOff };
      }, target);
      log.push(s);
      if (f % every === 0) await page.screenshot({ path: path.join(framesDir, `f${String(f).padStart(3, '0')}.png`), clip });
      if (s.done && f > 4) { /* keep capturing to show the settle */ }
    }
    report.views[v] = { framesDir, clip, dpr, every, frames, action, target: target ? 'foe' : 'mine', subject: subj, log, errors };
  }
  if (mode === 'probe' && hasStage) {
    // Samples the view's rig clock directly (no rendering): update(t) is what the game calls each
    // frame; the sprite bake reads uBlink on the first frame of every 1/fps tick.
    const seconds = Number(opt('--seconds', 240));
    const n = Math.round(seconds * 60);
    const samples = await page.evaluate(([side, n]) => {
      const st = window.__hd2d; const view = st.views[side];
      const out = new Array(n);
      for (let i = 0; i < n; i++) { view.update(i / 60); out[i] = +view.uniforms.uBlink.value.toFixed(3); }
      return out;
    }, [target, n]);
    report.views[v] = { seconds, fps: 60, samples, errors };
  }
  if (errors.length) failed = true;
  await ctx.close();
}

fs.writeFileSync(path.join(OUT, `${name}.json`), JSON.stringify(report, null, 1));
console.log(JSON.stringify({ ok: !failed, mode, name, out: path.join(OUT, `${name}.json`), views: Object.fromEntries(Object.entries(report.views).map(([k, v]) => [k, v.file ?? v.framesDir ?? 'samples'])) }));
await browser.close();
server.close();
process.exit(failed ? 3 : 0);
