#!/usr/bin/env node
// WebGL frame audit of Orbkin HD-2D scenes (hardware-independent counters) on SwiftShader.
//
//   node ${CLAUDE_SKILL_DIR}/scripts/audit.mjs --dist game/dist --out /tmp/audit/before.json \
//        [--scenes title,starter-chosen,route,battle-cave] [--views desk,phone] [--frames 90] [--seed 5] [--extra 'post=…']
//
// Per scene × view it records, averaged over the last 12 frozen-clock frames: draws, triangles,
// passes (targets drawn into), full-res passes (target area ≥ the internal grid: scene, bloom add,
// grade, a live shadow map), MSAA passes, the DRAM proxy (MB written+read per frame + compositor),
// programs linked since page load, GPU-resident texture + renderbuffer MB, largest texture, RGBA32F
// targets, 2D canvases and their MB, JS heap MB, and the pass list of the last frame.
// Feed the JSON to check-budget.mjs. SwiftShader ms are NOT recorded on purpose: only the counters
// transfer to phones; timing comes from `?bench=1` on a real device (references/bench.md).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs, gameDir, loadPlaywright, baseUrl, launch, openPage, sceneUrl, loadScene, frameInfo, step, writeJson, SCENES, VIEWS } from './lib/orb.mjs';

const args = parseArgs(process.argv.slice(2), { scenes: 'title,starter-chosen', views: 'desk,phone', frames: '90', seed: '5', extra: '' });
if (args.help || args.h) {
  console.log(fs.readFileSync(new URL(import.meta.url)).toString().split('\n').filter((l) => l.startsWith('//')).map((l) => l.slice(3)).join('\n'));
  console.log(`\nscenes: ${Object.keys(SCENES).join(', ')}\nviews: ${Object.keys(VIEWS).join(', ')}`);
  process.exit(0);
}
if (!args.out) { console.error('--out FILE.json is required'); process.exit(1); }
const here = path.dirname(fileURLToPath(import.meta.url));
const recorder = fs.readFileSync(path.join(here, 'lib', 'recorder.js'), 'utf8');
const game = gameDir(args.game);
const pw = loadPlaywright(game);
const { url: base, close } = await baseUrl(args);
const browser = await launch(pw);
const out = { generated: new Date().toISOString(), dist: args.dist ? path.resolve(args.dist) : args.url, seed: Number(args.seed), extra: args.extra, cases: [] };
let failed = 0;
for (const scene of String(args.scenes).split(',').filter(Boolean)) {
  for (const view of String(args.views).split(',').filter(Boolean)) {
    const { page, ctx, errors } = await openPage(browser, view, { initScript: recorder });
    const url = sceneUrl(base, scene, view, { seed: Number(args.seed), extra: args.extra, q: args.q });
    const t0 = Date.now();
    try {
      await loadScene(page, url, scene, { frames: Number(args.frames) });
      await step(page, 12); // a 12-frame window after settling (catches the 8–10 fps sprite bakes)
      const info = await frameInfo(page);
      const internal = info.perf?.internal ?? [info.canvas.bw, info.canvas.bh];
      const snap = await page.evaluate((i) => globalThis.__orbAuditSnapshot(12, i), internal);
      const c = { scene, view, q: info.perf?.quality ?? VIEWS[view].q, tier: VIEWS[view].q === 'low' ? 'low' : 'desk', internal, internalMpx: (internal[0] * internal[1]) / 1e6, scale: info.scale, rendererCalls: info.calls, rendererTris: info.triangles, ...snap, consoleErrors: errors.length, wallMs: Date.now() - t0 };
      out.cases.push(c);
      console.error(`[audit] ${scene}-${view}: ${internal.join('x')} draws ${c.draws.toFixed(1)} tris ${Math.round(c.tris)} passes(all) ${c.passes.toFixed(1)} fullResPasses ${c.fullResPasses.toFixed(1)} dram ${c.dramMB.toFixed(1)} MB programs ${c.programsLinked} resident ${c.gpuResidentMB.toFixed(1)} MB canvases ${c.canvases} (${c.canvasMB.toFixed(1)} MB) heap ${c.heapMB.toFixed(0)} MB`);
    } catch (e) {
      failed++;
      out.cases.push({ scene, view, error: String(e.message), consoleErrors: errors });
      console.error(`[audit] ${scene}-${view} FAILED: ${e.message}`);
    } finally {
      await ctx.close();
    }
  }
}
writeJson(path.resolve(args.out), out);
console.log(JSON.stringify({ out: path.resolve(args.out), cases: out.cases.map((c) => c.error ? { scene: c.scene, view: c.view, error: c.error } : { scene: c.scene, view: c.view, internal: c.internal, draws: +c.draws.toFixed(1), tris: Math.round(c.tris), fullResPasses: +c.fullResPasses.toFixed(2), programsLinked: c.programsLinked, dramMB: +c.dramMB.toFixed(1), gpuResidentMB: +c.gpuResidentMB.toFixed(1) }) }, null, 1));
await browser.close();
close();
process.exit(failed ? 1 : 0);
