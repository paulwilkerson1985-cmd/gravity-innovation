#!/usr/bin/env node
// Per-effect budget check for one attack: draw calls, points, lights, programs, 3D meshes (from a
// timeline.mjs run) and flipbook size/colours/bytes (from book JSON manifests). Exit 1 over budget.
//
//   node fx_budget.mjs --timeline AFTER/timeline.json [--book path/to/book.json ...] [--json]
//        [--max-extra-calls 4] [--max-points 120] [--max-frames 12] [--max-size 48] [--max-colors 6]
//        [--max-book-kb 80] [--max-launch-to-settle 60] [--require-light] [--allow-3d-mesh]
//
// Budget (GRAPHICS_PLAYBOOK.md section 6, "FX per move"): <= 1.0 s launch->settle, <= 4 extra draw
// calls over the idle frame, one pre-allocated FX light (point-light count constant across every
// frame and the program count unchanged idle->impact), <= 12 frames of <= 48x48 texels per book,
// <= 6 colours per ramp (+ transparent), <= 80 KB RGBA per book, <= 120 live points, and no 3D
// ribbon/primitive FX mesh in a pixel scene.
import fs from 'node:fs';

const a = parse(process.argv.slice(2));
if (a.help || !a.timeline) { usage(); process.exit(a.help ? 0 : 2); }
const lim = {
  extraCalls: num(a['max-extra-calls'], 4), points: num(a['max-points'], 120), frames: num(a['max-frames'], 12),
  size: num(a['max-size'], 48), colors: num(a['max-colors'], 6), bookKb: num(a['max-book-kb'], 80), settle: num(a['max-launch-to-settle'], 60),
};
const tl = JSON.parse(fs.readFileSync(a.timeline, 'utf8'));
const c = tl.counters, e = tl.events, frames = tl.frames ?? [];
const rows = [];
const row = (name, value, limit, ok, note = '') => rows.push({ name, value, limit, ok: !!ok, note });

row('extra draw calls at the peak (over idle)', c.extraCalls, `<= ${lim.extraCalls}`, c.extraCalls !== null && c.extraCalls <= lim.extraCalls, `idle ${c.idleCalls}, peak ${c.peakCalls}`);
row('live points at the peak', c.pointsAlivePeak, `<= ${lim.points}`, c.pointsAlivePeak <= lim.points, `capacity ${c.pointsCapPeak}`);
row('launch -> settle (frames)', e.launchToSettle, `<= ${lim.settle}`, e.launchToSettle !== null && e.launchToSettle <= lim.settle);
const pl = frames.map((f) => f.pointLights);
const constant = pl.length ? pl.every((n) => n === pl[0]) : true;
row('point lights constant across frames (pre-allocated, none added mid-battle)', constant ? pl[0] : `${Math.min(...pl)}..${Math.max(...pl)}`, 'constant', constant);
row('programs unchanged idle -> impact (no shader relink)', `${c.programsIdle} -> ${c.programsPeak}`, 'equal', c.programsPeak === c.programsIdle);
if (a['require-light']) row('FX light lit during the move', c.litPointLightsPeak, '>= 1', c.litPointLightsPeak >= 1, `point lights in scene: ${pl[0] ?? 0}`);
if (!a['allow-3d-mesh']) row('3D FX meshes added (ribbons, cones, primitives)', c.meshes3dAdded, '0', c.meshes3dAdded === 0, JSON.stringify(c.fxAddedByKind));

const books = [].concat(a.book ?? []).filter(Boolean);
for (const p of books) {
  let b;
  try { b = JSON.parse(fs.readFileSync(p, 'utf8')); } catch (err) { row(`book ${p}`, 'unreadable', 'json', false, String(err.message)); continue; }
  const nFrames = Array.isArray(b.idx) ? b.idx.length : b.frames;
  const colours = Array.isArray(b.ramp) ? b.ramp.length - 1 : null; // index 0 = transparent
  const kb = (b.w * b.h * nFrames * 4) / 1024;
  const id = b.id ?? p;
  row(`book ${id}: frames`, nFrames, `<= ${lim.frames}`, nFrames <= lim.frames);
  row(`book ${id}: size (texels)`, `${b.w}x${b.h}`, `<= ${lim.size}x${lim.size}`, b.w <= lim.size && b.h <= lim.size);
  row(`book ${id}: colours (ramp minus transparent)`, colours, `<= ${lim.colors}`, colours !== null && colours <= lim.colors);
  row(`book ${id}: RGBA KB`, Math.round(kb), `<= ${lim.bookKb}`, kb <= lim.bookKb);
  if (Array.isArray(b.idx)) {
    const used = new Set();
    for (const fr of b.idx) for (const v of fr) if (v) used.add(v);
    row(`book ${id}: distinct ramp indices used`, used.size, `<= ${lim.colors}`, used.size <= lim.colors);
  }
}
const over = rows.filter((r) => !r.ok);
if (a.json) console.log(JSON.stringify({ timeline: a.timeline, rows, over: over.length }, null, 1));
else {
  console.log(`fx_budget: ${a.timeline} (${tl.config?.moveName ?? '?'})`);
  for (const r of rows) console.log(`  [${r.ok ? 'ok' : 'OVER'}] ${r.name}: ${r.value} (${r.limit})${r.note ? '  ' + r.note : ''}`);
  console.log(over.length ? `OVER BUDGET: ${over.length} row(s)` : 'within budget');
}
process.exit(over.length ? 1 : 0);

function parse(argv) {
  const o = {};
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i]; if (!k.startsWith('--')) continue;
    const key = k.slice(2);
    const v = argv[i + 1] !== undefined && !argv[i + 1].startsWith('--') ? argv[++i] : true;
    if (o[key] !== undefined) o[key] = [].concat(o[key], v); else o[key] = v;
  }
  return o;
}
function num(v, d) { return v === undefined ? d : Number(v); }
function usage() { console.log(fs.readFileSync(new URL(import.meta.url)).toString().split('\n').slice(1, 14).map((l) => l.replace(/^\/\/ ?/, '')).join('\n')); }
