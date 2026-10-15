// Export the game's RAMPS (src/render/hd2d/textures.ts) to assets/ramps.json so compose.py and
// the runtime painters share one palette. Run after any ramp change:
//   node ${CLAUDE_SKILL_DIR}/scripts/export_ramps.mjs [game/src/render/hd2d/textures.ts] [out.json]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..', '..', '..');
const src = process.argv[2] || path.join(REPO, 'game', 'src', 'render', 'hd2d', 'textures.ts');
const out = process.argv[3] || path.join(HERE, '..', 'assets', 'ramps.json');
const text = fs.readFileSync(src, 'utf8');
const start = text.indexOf('export const RAMPS = {');
const end = text.indexOf('} as const', start);
if (start < 0 || end < 0) { console.error('RAMPS block not found in', src); process.exit(2); }
const body = text.slice(start, end);
const ramps = {};
const re = /^\s*([A-Za-z_]\w*):\s*\[([^\]]*)\]/gm;
let m;
while ((m = re.exec(body))) {
  const cols = [...m[2].matchAll(/'(#[0-9a-fA-F]{6})'/g)].map((x) => x[1].toLowerCase());
  if (cols.length) ramps[m[1]] = cols;
}
const json = { source: path.relative(REPO, src), texel: 1 / 16, note: 'index 0 = darkest shade; ramps hue-shift (shadows cool, lights warm)', ramps };
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(json, null, 1) + '\n');
console.log(JSON.stringify({ wrote: out, ramps: Object.keys(ramps).length }));
