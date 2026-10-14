// Lab 07 - load GLBs into three r180 in headless Chromium (SwiftShader WebGL) and screenshot them.
// Usage: node 07_shoot.mjs   (starts its own static server on :8765 rooted at lab/web)
// Uses the game's Playwright 1.56 (PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers).
import { createRequire } from 'node:module';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire('/home/user/gravity-innovation/game/package.json');
const { chromium } = require('playwright');
const HERE = path.dirname(fileURLToPath(import.meta.url));
const WEB = path.join(HERE, 'web'), OUT = path.join(HERE, 'out', '07');
fs.mkdirSync(OUT, { recursive: true });
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.glb': 'model/gltf-binary', '.json': 'application/json', '.png': 'image/png' };
const server = http.createServer((req, res) => {
  const p = path.join(WEB, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  fs.readFile(p, (err, data) => {
    if (err) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': MIME[path.extname(p)] || 'application/octet-stream' }); res.end(data);
  });
}).listen(8765);

const shots = JSON.parse(process.argv[2] || 'null') || [
  ['raw_pbr', 'glb/05_labkin_tex.glb', 'pbr'],
  ['draco_webp_pbr', 'glb/06/t_draco_webp.glb', 'pbr'],
  ['meshopt_webp_pbr', 'glb/06/t_mo_webp.glb', 'pbr'],
  ['ktx2_pbr', 'glb/06/t_ktx2.glb', 'pbr'],
  ['etc1s_pbr', 'glb/06/t_etc1s.glb', 'pbr'],
  ['gltfpack_pbr', 'glb/06/t_gp_cc.glb', 'pbr'],
  ['anim_raw_hop', 'glb/04_labkin_anim.glb', 'pbr', 'clip=Hop&t=0.42'],
  ['anim_meshopt_hop', 'glb/06/a_meshopt.glb', 'pbr', 'clip=Hop&t=0.42'],
  ['anim_gltfpack_hop', 'glb/06/a_gp_cc.glb', 'pbr', 'clip=Hop&t=0.42'],
  ['anim_toon_idle', 'glb/06/a_meshopt.glb', 'toon', 'clip=Idle&t=0.5'],
  ['anim_sprite96', 'glb/06/a_meshopt.glb', 'sprite', 'clip=Idle&t=0.5&h=96'],
  ['anim_sprite64', 'glb/06/a_meshopt.glb', 'sprite', 'clip=Idle&t=0.5&h=64'],
];
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 480, height: 480 } });
const results = [];
page.on('console', (m) => { if (m.type() === 'error') console.log('console:', m.text()); });
for (const [name, glb, mode, extra] of shots) {
  const t0 = Date.now();
  await page.goto(`http://localhost:8765/viewer.html?glb=${glb}&mode=${mode}&${extra || ''}`);
  await page.waitForFunction(() => window.__report && window.__report.ready, null, { timeout: 120000 });
  const rep = await page.evaluate(() => window.__report);
  rep.wallMs = Date.now() - t0; rep.name = name;
  await page.screenshot({ path: path.join(OUT, `${name}.png`) });
  results.push(rep);
  console.log(JSON.stringify(rep));
}
fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(results, null, 1));
await browser.close(); server.close();
