// legibility.mjs - measure battle-UI text legibility, hit boxes, one-line labels, panel overlap and
// whether panels cover the kin, at phone (393x851 @2.75) and desktop (1280x720 @1) size.
// Pairs with ui_checks.py `legibility`, which applies the floors.
//
//   node legibility.mjs --base http://127.0.0.1:PORT --out legib.json [--game /path/to/game]
//                       [--viewports desk,phone] [--qs "seed=11&gfx=hd2d"]
//
// --game   the Orbkin game directory (its node_modules/playwright is used; default: ./game under
//          the current directory, which is the project root when run from a skill).
// Needs a built game served at --base (e.g. `npx vite preview --outDir <dist> --port PORT` in the
// game dir, or the orbkin-visual-gate capture server). Uses the same virtual frame clock as the
// capture harness so the frame is frozen when measured. Output per viewport and menu state:
//   texts[]   text, cls, font family/size, x-height and cap height in CSS px (xCss/capCss) and
//             device px (xDev/capDev), lines (line boxes the text occupies), color, smoothing
//   buttons[] visible buttons with their CSS px size
//   panels[]  panel rectangles; panel_overlaps[] pairs that intersect; subjects_covered[] kin/trainer
//             boxes (window.__game.layout()) intersected by a panel.
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => {
  if (a.startsWith('--')) acc.push([a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : 'true']);
  return acc;
}, []));
if (args.help || !args.base || !args.out) {
  console.log('usage: node legibility.mjs --base URL --out legib.json [--game DIR] [--viewports desk,phone] [--qs "seed=11&gfx=hd2d"]');
  process.exit(args.help ? 0 : 2);
}
const GAME = resolve(args.game ?? 'game');
const require = createRequire(resolve(GAME, 'package.json'));
let chromium;
try {
  ({ chromium } = require('playwright'));
} catch (e) {
  console.error(`error: playwright not found under ${GAME}/node_modules (${e.message}); pass --game`);
  process.exit(2);
}
const BASE = args.base;
const OUT = args.out;
const QS = args.qs ?? 'seed=11&gfx=hd2d&scene=none';
const WANT = (args.viewports ?? 'desk,phone').split(',');
// x-height / em and cap / em per family, measured with fontTools (ui-hud-typography.md §3.3)
const RATIO = { 'Orbkin Pixel': [0.5, 0.7], 'UI Caps': [0.501, 0.642], 'UI Sans': [0.469, 0.642], 'UI Serif': [0.462, 0.658] };
const VPS = {
  phone: { viewport: { width: 393, height: 851 }, deviceScaleFactor: 2.75, isMobile: true, hasTouch: true },
  desk: { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 },
  land: { viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
};

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
    const q = cap.queue;
    cap.queue = [];
    cap.vt = cap.vt ? cap.vt + cap.dt : realT;
    for (const entry of q) { try { entry[1](cap.vt); } catch (e) { setTimeout(() => { throw e; }); } }
    cap.frames++;
    schedule();
  }
  window.requestAnimationFrame = (cb) => { const id = cap.nextId++; cap.queue.push([id, cb]); schedule(); return id; };
  window.cancelAnimationFrame = (id) => { cap.queue = cap.queue.filter((e) => e[0] !== id); };
  cap.resume = () => { cap.paused = false; schedule(); };
  cap.run = (n) => new Promise((res) => { const end = cap.frames + n; cap.pre = () => (cap.frames >= end ? 'pause' : undefined); cap.onPause = () => res(cap.frames); cap.resume(); });
  cap.runUntil = (pred, max) => new Promise((res) => {
    const start = cap.frames; let ok = false;
    cap.pre = () => { if (pred()) { ok = true; return 'pause'; } return cap.frames - start >= max ? 'pause' : undefined; };
    cap.onPause = () => res({ ok, frames: cap.frames - start });
    cap.resume();
  });
}

const until = (page, src, max) => page.evaluate(([src, max]) => window.__cap.runUntil(new Function('return (' + src + ');'), max), [src, max]);

function measureUi(RATIO) {
  const out = [];
  const ui = document.querySelector('.battle-ui') ?? document.body;
  const walker = document.createTreeWalker(ui, NodeFilter.SHOW_TEXT);
  const seen = new Set();
  let n;
  while ((n = walker.nextNode())) {
    const el = n.parentElement;
    if (!n.textContent.trim() || seen.has(el)) continue;
    seen.add(el);
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    if (r.width === 0 || cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) === 0) continue;
    const fam = cs.fontFamily.split(',')[0].replace(/["']/g, '').trim();
    const size = parseFloat(cs.fontSize);
    const [xr, cr] = RATIO[fam] ?? [0.5, 0.7];
    const range = document.createRange(); range.selectNodeContents(el);
    const rects = [...range.getClientRects()].filter((q) => q.width > 0 && q.height > 0);
    const tops = [...new Set(rects.map((q) => Math.round(q.top)))];
    out.push({ text: n.textContent.trim().slice(0, 24), cls: el.className, fam, size, lines: Math.max(1, tops.length),
      xCss: +(size * xr).toFixed(2), capCss: +(size * cr).toFixed(2), xDev: +(size * xr * devicePixelRatio).toFixed(1), capDev: +(size * cr * devicePixelRatio).toFixed(1),
      color: cs.color, smoothing: cs.webkitFontSmoothing });
  }
  const vis = (b) => { const r = b.getBoundingClientRect(); const s = getComputedStyle(b); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
  const buttons = [...ui.querySelectorAll('button')].filter(vis).map((b) => {
    const r = b.getBoundingClientRect(); return { t: b.textContent.trim().slice(0, 16), id: b.dataset.testid ?? '', w: Math.round(r.width), h: Math.round(r.height) };
  });
  const panelEls = [...ui.querySelectorAll('.panel, .textbox, .bt-menu, .frame, .sheet, .modal')].filter(vis);
  const panels = panelEls.map((p) => { const r = p.getBoundingClientRect(); return { cls: p.className, x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) }; });
  const inter = (a, b) => Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > 2 && Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > 2;
  const contains = (a, b) => a.x <= b.x && a.y <= b.y && a.x + a.w >= b.x + b.w && a.y + a.h >= b.y + b.h;
  const panel_overlaps = [];
  for (let i = 0; i < panels.length; i++) for (let j = i + 1; j < panels.length; j++) {
    if (panelEls[i].contains(panelEls[j]) || panelEls[j].contains(panelEls[i])) continue;
    if (inter(panels[i], panels[j]) && !contains(panels[i], panels[j]) && !contains(panels[j], panels[i])) panel_overlaps.push([panels[i].cls, panels[j].cls]);
  }
  const subjects_covered = [];
  try {
    const lay = window.__game?.layout?.();
    for (const s of lay?.subjects ?? []) for (const p of panels) if (inter(s, p)) subjects_covered.push({ subject: s.name, panel: p.cls });
  } catch (_) { /* no layout hook on this screen */ }
  return { texts: out, buttons, panels, panel_overlaps, subjects_covered };
}

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const res = {};
try {
  for (const vpName of WANT) {
    const vp = VPS[vpName];
    if (!vp) { console.error(`unknown viewport ${vpName}`); continue; }
    const ctx = await browser.newContext(vp);
    const page = await ctx.newPage();
    await page.addInitScript(clockInit, 100);
    await page.goto(`${BASE}/?${QS}`);
    await page.waitForFunction('window.__game && window.__cap', null, { timeout: 120000 });
    await page.evaluate(async () => {
      const g = window.__game;
      g.debugSetParty?.([{ species: 'mossling', level: 7 }, { species: 'flickwing', level: 5 }]);
      g.setFast(true);
      await g.goto('battle', { route: 'meadow', hotspot: 'scout-pim' });
    });
    await until(page, 'window.__game.idle()', 600);
    await page.evaluate(() => { window.__game.setFast(false); });
    await page.evaluate(() => window.__cap.run(8));
    await page.evaluate(() => document.fonts.ready);
    const states = {};
    for (const st of ['cmd', 'moves']) {
      if (st === 'moves') {
        await page.evaluate(() => document.querySelector('[data-testid="btn-fight"]')?.click());
        await page.evaluate(() => window.__cap.run(8));
        await page.evaluate(() => { for (const a of document.getAnimations()) { try { a.finish(); } catch (_) { /* infinite */ } } });
      }
      states[st] = await page.evaluate(measureUi, RATIO);
    }
    res[vpName] = states;
    await ctx.close();
  }
} finally {
  await browser.close();
}
writeFileSync(OUT, JSON.stringify(res, null, 1));
console.log(JSON.stringify({ ok: true, out: OUT, viewports: Object.keys(res) }));
