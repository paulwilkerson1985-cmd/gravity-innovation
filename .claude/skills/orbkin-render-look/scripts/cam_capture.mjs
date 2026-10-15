#!/usr/bin/env node
// Dump consecutive frames of a screen at a virtual 60 fps (frozen clock, deterministic) for camera
// motion analysis with cam_analyze.py. Each frame = one game loop step of exactly 1/60 s.
//
//   node ${CLAUDE_SKILL_DIR}/scripts/cam_capture.mjs --dist game/dist --out /tmp/cam/after --screen title --view desk \
//        [--frames 120] [--skip 90] [--every 1] [--seed 5] [--extra 'post=nobloom'] [--freeze-world]
//
// Writes <out>/f0000.png … (canvas only, device px) and <out>/clip.json (internal size, device px
// per internal px, frame list). `--skip` = frames to run before the first dump (let the scene
// settle; default 90). `--freeze-world` dumps with the world frozen (dt = 0: only camera-induced
// change is measured) — not available without a game hook, so it reports and exits 2.
// ~0.3–0.5 s per frame on SwiftShader; a 2 s clip (120 frames) takes about 1 minute.
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs, gameDir, loadPlaywright, baseUrl, launch, openPage, sceneUrl, loadScene, frameInfo, setUiHidden, step, writeJson } from './lib/orb.mjs';

const args = parseArgs(process.argv.slice(2), { screen: 'title', view: 'desk', frames: '120', skip: '90', every: '1', seed: '5', extra: '' });
if (args.help || args.h) {
  console.log(fs.readFileSync(new URL(import.meta.url)).toString().split('\n').filter((l) => l.startsWith('//')).map((l) => l.slice(3)).join('\n'));
  process.exit(0);
}
if (!args.out) { console.error('--out DIR is required'); process.exit(1); }
if (args['freeze-world']) { console.error('--freeze-world needs an in-game dt=0 hook (none in this build); use a static screen or compare against an idle clip'); process.exit(2); }
const out = path.resolve(args.out);
fs.mkdirSync(out, { recursive: true });
const game = gameDir(args.game);
const pw = loadPlaywright(game);
const { url: base, close } = await baseUrl(args);
const browser = await launch(pw);
const { page, ctx, errors } = await openPage(browser, args.view);
const url = sceneUrl(base, args.screen, args.view, { seed: Number(args.seed), extra: args.extra, q: args.q });
await loadScene(page, url, args.screen, { frames: Number(args.skip) });
const info = await frameInfo(page);
await setUiHidden(page, true);
const c = info.canvas;
const clip = { url, screen: args.screen, view: args.view, internal: info.perf?.internal, scale: info.scale, dpr: info.dpr, canvasCss: [c.w, c.h], skip: Number(args.skip), every: Number(args.every), frames: [] };
const clipBox = { x: c.x, y: c.y, width: Math.min(c.w, (await page.viewportSize()).width - c.x), height: Math.min(c.h, (await page.viewportSize()).height - c.y) };
const t0 = Date.now();
for (let i = 0; i < Number(args.frames); i++) {
  if (i > 0) await step(page, Number(args.every));
  const f = `f${String(i).padStart(4, '0')}.png`;
  await page.screenshot({ path: path.join(out, f), clip: clipBox });
  clip.frames.push(f);
  if (i % 20 === 0) console.error(`[cam] ${args.screen}-${args.view} frame ${i}/${args.frames} (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
}
clip.errors = errors;
writeJson(path.join(out, 'clip.json'), clip);
console.log(JSON.stringify({ out, frames: clip.frames.length, internal: clip.internal, scale: clip.scale, seconds: +((Date.now() - t0) / 1000).toFixed(1) }));
await ctx.close();
await browser.close();
close();
