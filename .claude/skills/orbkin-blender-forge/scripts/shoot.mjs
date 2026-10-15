// shoot.mjs: load GLBs in three r180 (the game's own copy) under headless Chromium + SwiftShader and
// screenshot them with a JSON report (load ms, extensions, tris, draw calls, console errors).
//
//   node ${CLAUDE_SKILL_DIR}/scripts/shoot.mjs --glb piece.glb --out shots/ [--modes pbr,toon,sprite] [--h 64 | --ppu 64]
//        [--size 480] [--az 35 --el 25] [--clip Idle --t 0.5] [--fov 0] [--json shots/report.json]
//   node ${CLAUDE_SKILL_DIR}/scripts/shoot.mjs --shots '[["name","file.glb","sprite","h=64&az=20"], ...]' --out shots/
// --ppu renders the sprite at the game's scale (desktop ~64 px per world unit, phone ~36) instead of a
// fixed --h; judge the read at --ppu 64 AND --ppu 36. Serves /three -> game/node_modules/three and
// /glb -> the GLB's directory on a local port.
// Exit 1 when any shot reports console errors or fails to load. Screenshot the SHIPPED (packed) file.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..', '..', '..');
const GAME = path.join(REPO, 'game');
const require = createRequire(path.join(GAME, 'package.json'));
const { chromium } = require('playwright');
const THREE_DIR = path.join(GAME, 'node_modules', 'three');
if (!fs.existsSync(THREE_DIR)) { console.error('three not found at ' + THREE_DIR + ' (run: cd game && npm ci --ignore-scripts)'); process.exit(2); }

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
if (args.includes('--help') || (!opt('--glb') && !opt('--shots'))) {
  console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').filter((l) => l.startsWith('//')).map((l) => l.slice(3)).join('\n'));
  process.exit(opt('--glb') || opt('--shots') ? 0 : 64);
}
const OUT = path.resolve(opt('--out', 'shots')); fs.mkdirSync(OUT, { recursive: true });
const size = parseInt(opt('--size', '480'), 10);
let shots;
let glbDir;
if (opt('--shots')) {
  shots = JSON.parse(opt('--shots')); glbDir = path.dirname(path.resolve(shots[0][1]));
  shots = shots.map(([n, f, m, x]) => [n, path.basename(f), m, x]);
} else {
  const glb = path.resolve(opt('--glb')); glbDir = path.dirname(glb);
  const base = path.basename(glb, '.glb');
  const common = `az=${opt('--az', '35')}&el=${opt('--el', '25')}&fov=${opt('--fov', '0')}` + (opt('--clip') ? `&clip=${opt('--clip')}&t=${opt('--t', '0')}` : '');
  const spr = opt('--ppu') ? `&ppu=${opt('--ppu')}` : `&h=${opt('--h', '64')}`;
  shots = opt('--modes', 'pbr,toon,sprite').split(',').map((m) => [`${base}_${m}${opt('--ppu') ? '_ppu' + opt('--ppu') : ''}`, path.basename(glb), m, common + (m === 'sprite' ? spr : '')]);
}
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.glb': 'model/gltf-binary', '.json': 'application/json', '.png': 'image/png', '.ktx2': 'image/ktx2' };
const server = http.createServer((req, res) => {
  const u = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  let p;
  if (u === '/viewer.html') p = path.join(HERE, '..', 'assets', 'viewer.html');
  else if (u.startsWith('/three/')) p = path.join(THREE_DIR, u.slice(7));
  else if (u.startsWith('/glb/')) p = path.join(glbDir, u.slice(5));
  else { res.writeHead(404); res.end(); return; }
  fs.readFile(p, (err, data) => {
    if (err) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': MIME[path.extname(p)] || 'application/octet-stream' }); res.end(data);
  });
}).listen(0);
await new Promise((r) => server.on('listening', r));
const port = server.address().port;
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: size, height: size } });
const consoleErrors = [];
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 200)); });
page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + String(e).slice(0, 200)));
const results = []; let failed = false;
for (const [name, glb, mode, extra] of shots) {
  consoleErrors.length = 0;
  const t0 = Date.now();
  await page.goto(`http://localhost:${port}/viewer.html?glb=/glb/${encodeURIComponent(glb)}&mode=${mode}&${extra || ''}`);
  let rep;
  try {
    await page.waitForFunction(() => window.__report && window.__report.ready, null, { timeout: 120000 });
    rep = await page.evaluate(() => window.__report);
  } catch (e) { rep = { ready: false, errors: 1, errorMessages: ['timeout waiting for the viewer: ' + String(e).slice(0, 120)] }; }
  rep.consoleErrors = consoleErrors.slice(); rep.wallMs = Date.now() - t0; rep.name = name; rep.mode = mode; rep.glb = glb;
  rep.screenshot = path.join(OUT, `${name}.png`);
  await page.screenshot({ path: rep.screenshot });
  if (rep.errors || rep.consoleErrors.length || !rep.ready) failed = true;
  results.push(rep);
  console.log(JSON.stringify({ name, mode, loadMs: rep.loadMs, tris: rep.tris, drawCalls: rep.drawCalls, errors: rep.errors, consoleErrors: rep.consoleErrors.length, extensions: rep.extensions, screenshot: rep.screenshot }));
}
const reportPath = opt('--json', path.join(OUT, 'report.json'));
fs.writeFileSync(reportPath, JSON.stringify({ three: require(path.join(THREE_DIR, 'package.json')).version, renderer: results[0]?.renderer, shots: results }, null, 1));
await browser.close(); server.close();
process.exit(failed ? 1 : 0);
