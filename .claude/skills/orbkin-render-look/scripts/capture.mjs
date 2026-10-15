#!/usr/bin/env node
// Frozen-clock captures of Orbkin HD-2D screens, desk + phone, for before/after gates.
//
//   node ${CLAUDE_SKILL_DIR}/scripts/capture.mjs --dist game/dist --out /tmp/cap/before \
//        [--screens title,starter-chosen] [--views desk,phone] [--frames 90] [--seed 5] \
//        [--extra 'post=notilt'] [--repeat-check] [--game game]
//   node capture.mjs --url http://localhost:5173 ...   (a running dev/preview server instead of --dist)
//
// Writes per screen × view:  <out>/<screen>-<view>.png        full page (DOM UI included)
//                            <out>/<screen>-<view>.clean.png  canvas only (UI hidden) — judge/metrics input
//                            <out>/<screen>-<view>.json       internal size, device px per internal px, calls, tris
// and <out>/capture.json (everything). Exit 0 ok; 1 on a scene error; 2 on a repeat mismatch (--repeat-check).
//
// Deterministic: the page clock is faked and paused before load; the scene is advanced by exactly
// `--frames` virtual frames (1/60 s each) after it reports ready. Two runs with the same arguments on
// the same build must produce byte-identical PNGs; if they do not, the capture is invalid (some
// state is wall-clock or unseeded) and must not be judged.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { parseArgs, gameDir, loadPlaywright, baseUrl, launch, openPage, sceneUrl, loadScene, frameInfo, setUiHidden, writeJson, SCENES, VIEWS } from './lib/orb.mjs';

const args = parseArgs(process.argv.slice(2), { screens: 'title,starter-chosen', views: 'desk,phone', frames: '90', seed: '5', extra: '' });
if (args.help || args.h) {
  console.log(fs.readFileSync(new URL(import.meta.url)).toString().split('\n').filter((l) => l.startsWith('//')).map((l) => l.slice(3)).join('\n'));
  console.log(`\nscreens: ${Object.keys(SCENES).join(', ')}\nviews: ${Object.keys(VIEWS).join(', ')}`);
  process.exit(0);
}
if (!args.out) { console.error('--out DIR is required'); process.exit(1); }
const out = path.resolve(args.out);
fs.mkdirSync(out, { recursive: true });
const game = gameDir(args.game);
const pw = loadPlaywright(game);
const { url: base, close } = await baseUrl(args);
const browser = await launch(pw);
const report = { args: { ...args, _: undefined }, shots: [] };
let failed = 0;

async function shoot(screen, view, suffix = '') {
  const { page, ctx, errors } = await openPage(browser, view);
  const t0 = Date.now();
  const url = sceneUrl(base, screen, view, { seed: Number(args.seed), extra: args.extra, q: args.q });
  try {
    const { extraSteps } = await loadScene(page, url, screen, { frames: Number(args.frames) });
    const info = await frameInfo(page);
    const name = `${screen}-${view}${suffix}`;
    await page.screenshot({ path: path.join(out, `${name}.png`) });
    await setUiHidden(page, true);
    await page.screenshot({ path: path.join(out, `${name}.clean.png`) });
    await setUiHidden(page, false);
    const shot = { name, screen, view, url, frames: Number(args.frames), extraSteps, ...info, errors, wallMs: Date.now() - t0 };
    writeJson(path.join(out, `${name}.json`), shot);
    report.shots.push(shot);
    console.error(`[capture] ${name}: internal ${info.perf?.internal?.join('x')} @${info.scale}x, ${info.calls} calls, ${info.triangles} tris, ${shot.wallMs} ms${errors.length ? `, ${errors.length} console errors` : ''}`);
    return shot;
  } catch (e) {
    failed++;
    console.error(`[capture] ${screen}-${view} FAILED: ${e.message}`);
    report.shots.push({ screen, view, url, error: String(e.message), errors });
    return null;
  } finally {
    await ctx.close();
  }
}

const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex').slice(0, 16);
for (const screen of String(args.screens).split(',').filter(Boolean)) {
  for (const view of String(args.views).split(',').filter(Boolean)) {
    const a = await shoot(screen, view);
    if (a && args['repeat-check']) {
      const b = await shoot(screen, view, '.repeat');
      if (b) {
        const same = sha(path.join(out, `${a.name}.clean.png`)) === sha(path.join(out, `${b.name}.clean.png`));
        a.repeatIdentical = same;
        console.error(`[capture] ${a.name}: repeat ${same ? 'pixel-identical ✓' : 'DIFFERS ✗ (capture invalid: unseeded or wall-clock state)'}`);
        if (!same) failed += 100;
        for (const f of [`${b.name}.png`, `${b.name}.clean.png`, `${b.name}.json`]) fs.rmSync(path.join(out, f), { force: true });
        report.shots = report.shots.filter((s) => s !== b);
      }
    }
  }
}
writeJson(path.join(out, 'capture.json'), report);
console.log(JSON.stringify({ out, shots: report.shots.map((s) => ({ name: s.name, internal: s.perf?.internal, scale: s.scale, calls: s.calls, triangles: s.triangles, repeatIdentical: s.repeatIdentical, error: s.error })) }, null, 1));
await browser.close();
close();
process.exit(failed >= 100 ? 2 : failed ? 1 : 0);
