// Capture the CURRENT game's HD-2D battle (scratch build of the repo) at 1280x720 for sprite comparison.
// Usage: node 08_game_capture.mjs   -> out/08/game_*.png
import { createRequire } from 'node:module';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire('/home/user/gravity-innovation/game/package.json');
const { chromium } = require('playwright');
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, 'gamebuild'), OUT = path.join(HERE, 'out', '08'); fs.mkdirSync(OUT, { recursive: true });
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.wasm': 'application/wasm', '.png': 'image/png', '.json': 'application/json', '.woff2': 'font/woff2' };
const server = http.createServer((req, res) => {
  let p = path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (p.endsWith('/')) p += 'index.html';
  fs.readFile(p, (err, data) => { if (err) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': MIME[path.extname(p)] || 'application/octet-stream' }); res.end(data); });
}).listen(8766);
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
for (const [name, q] of [
  ['trainer_ridge', 'scene=battle&route=ridge&hotspot=hiker-brann&gfx=hd2d&seed=3'],
  ['wild_meadow', 'scene=battle&route=meadow&hotspot=tall-grass&gfx=hd2d&seed=5'],
]) {
  await page.goto(`http://localhost:8766/?${q}`);
  await page.waitForFunction(() => window.__game && window.__game.scene && window.__game.scene(), null, { timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(9000);
  await page.screenshot({ path: path.join(OUT, `game_${name}.png`) });
  console.log('shot', name);
}
await browser.close(); server.close();
