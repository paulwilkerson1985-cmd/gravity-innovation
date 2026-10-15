// Shared helpers for the orbkin-render-look scripts: locate the game's Playwright, serve a built
// `dist/` folder, open the game at a viewport preset, and drive a FROZEN virtual clock so every
// capture is deterministic (pixel-identical repeats; see references/architecture.md §capture).
//
// Frozen clock: Playwright's `page.clock` fakes Date, performance.now, setTimeout and
// requestAnimationFrame for the page. We install it and PAUSE it before navigation, so the game's
// rAF loop only runs when `step()` is called. Each step fires one rAF with a fixed timestamp, so the
// animation clock (`animClock.time`), sprite-bake cadence, foliage sway and camera drift advance by
// exactly 1/60 s per step, independent of machine load.
import { createRequire } from 'node:module';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

export const VIEWS = {
  // Desk: 1280×720 at dpr 1 → 640×360 internal grid at 2 device px per internal px (q=high).
  desk: { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1, hasTouch: false, isMobile: false, q: 'high' },
  // Phone: a 393×851 @2.75 portrait phone (Pixel-5 class) → 271×586 internal at 4 device px (q=low).
  phone: { viewport: { width: 393, height: 851 }, deviceScaleFactor: 2.75, hasTouch: true, isMobile: true, q: 'low' },
  // Landscape phone.
  land: { viewport: { width: 844, height: 390 }, deviceScaleFactor: 2.75, hasTouch: true, isMobile: true, q: 'low' },
};

/** Scene URL fragments (without seed/gfx) and how to wait for them. */
export const SCENES = {
  title: { params: 'scene=title', wait: 'title' },
  starter: { params: 'scene=starter', wait: 'starter' },
  'starter-chosen': { params: 'scene=starter', wait: 'starter', after: 'choose:mossling' },
  route: { params: 'scene=route&route=meadow', wait: 'route' },
  'battle-cave': { params: 'scene=battle&route=ridge&hotspot=hiker-brann', wait: 'battle', idle: true },
  'battle-meadow': { params: 'scene=battle&route=meadow&hotspot=tall-grass', wait: 'battle', idle: true },
  party: { params: 'scene=party&from=menu&route=meadow', wait: 'party' },
};

export function parseArgs(argv, defaults = {}) {
  const out = { ...defaults, _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const k = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) out[k] = true;
      else { out[k] = next; i++; }
    } else out._.push(a);
  }
  return out;
}

/** Resolve the game folder (holds package.json + node_modules with playwright). */
export function gameDir(opt) {
  const cands = [opt, process.env.ORBKIN_GAME, path.join(process.cwd(), 'game'), process.cwd()].filter(Boolean);
  for (const c of cands) if (fs.existsSync(path.join(c, 'node_modules', 'playwright', 'package.json'))) return path.resolve(c);
  throw new Error(`cannot find the game's node_modules (tried ${cands.join(', ')}); run \`npm ci\` in game/ or pass --game DIR`);
}

export function loadPlaywright(game) {
  const require = createRequire(path.join(game, 'package.json'));
  return require('playwright');
}

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.wasm': 'application/wasm', '.png': 'image/png', '.jpg': 'image/jpeg', '.json': 'application/json', '.woff2': 'font/woff2', '.woff': 'font/woff', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.glb': 'model/gltf-binary', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg' };

/** Serve a static folder on an ephemeral port; returns { url, close }. */
export function serveStatic(root) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let p = path.join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname));
      if (!p.startsWith(root)) { res.writeHead(403); res.end(); return; }
      if (p.endsWith('/') || !path.extname(p)) p = path.join(root, 'index.html');
      fs.readFile(p, (err, data) => {
        if (err) { res.writeHead(404); res.end(); return; }
        res.writeHead(200, { 'content-type': MIME[path.extname(p)] || 'application/octet-stream', 'cache-control': 'no-store' });
        res.end(data);
      });
    });
    server.listen(0, '127.0.0.1', () => resolve({ url: `http://127.0.0.1:${server.address().port}`, close: () => server.close() }));
  });
}

/** Resolve --url or --dist into a base URL (and a closer). */
export async function baseUrl(args) {
  if (args.url) return { url: String(args.url).replace(/\/$/, ''), close: () => {} };
  const dist = path.resolve(args.dist || 'game/dist');
  if (!fs.existsSync(path.join(dist, 'index.html'))) throw new Error(`no index.html in ${dist}; run \`npm run build\` in the workspace or pass --url http://host:port`);
  return serveStatic(dist);
}

export const CHROMIUM_ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-precise-memory-info'];

export async function launch(pw) {
  return pw.chromium.launch({ args: CHROMIUM_ARGS });
}

/** Virtual-clock epoch: fixed, so `performance.now()` sequences repeat exactly. */
export const T0 = new Date('2026-01-01T00:00:00Z');
export const STEP_MS = 1000 / 60;

/**
 * Open a page at a view preset with the frozen clock installed and paused. `initScript` (optional)
 * is injected before the game loads (the audit's WebGL recorder).
 */
export async function openPage(browser, view, { initScript } = {}) {
  const v = VIEWS[view];
  if (!v) throw new Error(`unknown view ${view}; use ${Object.keys(VIEWS).join('|')}`);
  const ctx = await browser.newContext({ viewport: v.viewport, deviceScaleFactor: v.deviceScaleFactor, hasTouch: v.hasTouch, isMobile: v.isMobile });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  if (initScript) await page.addInitScript(initScript);
  await page.clock.install({ time: T0 });
  await page.clock.pauseAt(T0);
  return { page, ctx, errors, view: v };
}

/** Build the game URL for a scene at a view. `extra` = extra query fragment (e.g. 'post=notilt'). */
export function sceneUrl(base, sceneKey, view, { seed = 5, extra = '', q } = {}) {
  const s = SCENES[sceneKey];
  if (!s) throw new Error(`unknown scene ${sceneKey}; use ${Object.keys(SCENES).join('|')}`);
  const quality = q ?? VIEWS[view].q;
  return `${base}/?seed=${seed}&${s.params}&gfx=hd2d&q=${quality}${extra ? `&${extra}` : ''}`;
}

/** Advance the frozen clock by n frames of 1/60 s (fires the game's rAF loop n times). */
export async function step(page, n = 1) {
  for (let i = 0; i < n; i++) await page.clock.runFor(STEP_MS);
}

/**
 * Wait (real time) until `__game.scene()` equals `name`. The clock is NOT stepped while waiting
 * (scene entry needs no timers), so the virtual time at "ready" is the same on every run. Only
 * if nothing happened for 4 s does it step one frame (a scene that needs a timer to appear); the
 * number of such steps is returned so the caller can report a non-deterministic load.
 */
export async function waitScene(page, name, timeoutMs = 120000) {
  const t0 = Date.now();
  let lastChange = Date.now(), extraSteps = 0, prev = null;
  for (;;) {
    const cur = await page.evaluate(() => globalThis.__game?.scene?.() ?? null).catch(() => null);
    if (cur === name) return extraSteps;
    if (cur !== prev) { prev = cur; lastChange = Date.now(); }
    if (Date.now() - t0 > timeoutMs) throw new Error(`timeout waiting for scene ${name} (at ${cur})`);
    if (Date.now() - lastChange > 4000) { await step(page, 1); extraSteps++; lastChange = Date.now(); }
    await new Promise((r) => setTimeout(r, 50));
  }
}

/** Load a scene deterministically: navigate, wait for it, optional post-load action, then `frames` steps. */
export async function loadScene(page, url, sceneKey, { frames = 90 } = {}) {
  const s = SCENES[sceneKey];
  await page.goto(url, { waitUntil: 'load' });
  const extraSteps = await waitScene(page, s.wait);
  if (s.idle) {
    // Battles: let the intro play out on the virtual clock until the UI waits for input.
    for (let i = 0; i < 1200; i++) {
      await step(page, 5);
      if (await page.evaluate(() => globalThis.__game.idle())) break;
    }
  }
  if (s.after?.startsWith('choose:')) {
    await step(page, 5);
    await page.getByTestId(`starter-${s.after.slice(7)}`).click();
    await page.getByTestId('btn-confirm-starter').waitFor({ timeout: 30000 });
  }
  await step(page, frames);
  return { extraSteps };
}

/** Canvas rect (CSS px) and the HD-2D grid: internal buffer size and device px per internal px. */
export async function frameInfo(page) {
  return page.evaluate(() => {
    const c = document.getElementById('view');
    const r = c.getBoundingClientRect();
    const g = globalThis.__game;
    const perf = g.perf();
    const info = g.renderInfo();
    return { canvas: { x: r.x, y: r.y, w: r.width, h: r.height, bw: c.width, bh: c.height }, dpr: devicePixelRatio, perf, calls: info.calls, triangles: info.triangles, scale: perf ? Math.round((r.width * devicePixelRatio) / c.width) : 0 };
  });
}

/** Hide / show the DOM UI (overlay, fps, curtain) for canvas-only "clean" frames. */
export async function setUiHidden(page, hidden) {
  await page.evaluate((h) => {
    let st = document.getElementById('orb-hide-ui');
    if (!st) { st = document.createElement('style'); st.id = 'orb-hide-ui'; document.head.appendChild(st); }
    st.textContent = h ? '#overlay, #fps, #curtain { visibility: hidden !important; }' : '';
  }, hidden);
}

export function writeJson(file, obj) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(obj, null, 1));
}
