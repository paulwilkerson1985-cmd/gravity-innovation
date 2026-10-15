#!/usr/bin/env node
// SwiftShader frame-time A/B (ratios only; never phone costs): interleaved rounds of
// `window.__game.benchFrames(n)` on the SAME build with two URL variants, median and spread.
//
//   node ${CLAUDE_SKILL_DIR}/scripts/frametime.mjs --dist game/dist --screens title,starter-chosen --views desk,phone \
//        --a 'post=oldscreens' --b '' [--rounds 5] [--n 10] [--seed 5] [--json out.json]
//
// A = the "before" variant (your same-build switch), B = after. Each round loads A then B (then B
// then A on the next round) in fresh contexts and takes the median of n sync frames (render + 1-px
// readPixels). Reports per screen×view: medianA, medianB, ratio, and the noise band = the spread of
// the per-round ratios. A ratio is a real change only when it is outside the noise band; this box
// (4 shared cores) shows ±10 % run-to-run, so treat ±10 % as noise and read the direction, not the digit.
// Exit 1 when any ratio > --max-ratio (default 1.1) AND its noise band does not reach 1.0.
import fs from 'node:fs';
import { parseArgs, gameDir, loadPlaywright, baseUrl, launch, openPage, sceneUrl, writeJson, SCENES } from './lib/orb.mjs';

const args = parseArgs(process.argv.slice(2), { screens: 'title', views: 'desk', a: '', b: '', rounds: '5', n: '10', seed: '5', 'max-ratio': '1.1' });
if (args.help || args.h) {
  console.log(fs.readFileSync(new URL(import.meta.url)).toString().split('\n').filter((l) => l.startsWith('//')).map((l) => l.slice(3)).join('\n'));
  process.exit(0);
}
const game = gameDir(args.game);
const pw = loadPlaywright(game);
const { url: base, close } = await baseUrl(args);
const browser = await launch(pw);
const med = (xs) => { const s = [...xs].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const out = { a: args.a, b: args.b, rounds: Number(args.rounds), n: Number(args.n), cases: [] };
let fails = 0;
for (const screen of String(args.screens).split(',').filter(Boolean)) {
  for (const view of String(args.views).split(',').filter(Boolean)) {
    const ms = { a: [], b: [] };
    const one = async (variant) => {
      const { page, ctx } = await openPage(browser, view, { clock: false }); // real clock: timings need it
      try {
        const sc = SCENES[screen];
        await page.goto(sceneUrl(base, screen, view, { seed: Number(args.seed), extra: variant === 'a' ? args.a : args.b, q: args.q }), { waitUntil: 'load' });
        await page.waitForFunction((n) => globalThis.__game?.scene?.() === n, sc.wait, { timeout: 120000, polling: 100 });
        if (sc.idle) await page.evaluate(() => globalThis.__game.waitIdle(60000));
        if (sc.after?.startsWith('choose:')) { await page.getByTestId(`starter-${sc.after.slice(7)}`).click(); await page.getByTestId('btn-confirm-starter').waitFor({ timeout: 30000 }); }
        await page.waitForTimeout(1500);
        const r = await page.evaluate((n) => globalThis.__game.benchFrames(n), Number(args.n));
        ms[variant].push(r.ms);
      } finally { await ctx.close(); }
    };
    for (let r = 0; r < Number(args.rounds); r++) {
      const order = r % 2 ? ['b', 'a'] : ['a', 'b'];
      for (const v of order) await one(v);
      console.error(`[frametime] ${screen}-${view} round ${r + 1}: A ${ms.a[r].toFixed(1)} ms, B ${ms.b[r].toFixed(1)} ms`);
    }
    const ratios = ms.a.map((a, i) => ms.b[i] / a);
    const c = { screen, view, medianA: +med(ms.a).toFixed(1), medianB: +med(ms.b).toFixed(1), ratio: +(med(ms.b) / med(ms.a)).toFixed(3), ratioMin: +Math.min(...ratios).toFixed(3), ratioMax: +Math.max(...ratios).toFixed(3), roundsA: ms.a, roundsB: ms.b };
    c.verdict = c.ratio > Number(args['max-ratio']) && c.ratioMin > 1.0 ? 'SLOWER' : c.ratio > Number(args['max-ratio']) ? 'slower-within-noise' : 'ok';
    if (c.verdict === 'SLOWER') fails++;
    out.cases.push(c);
    console.error(`[frametime] ${screen}-${view}: A ${c.medianA} → B ${c.medianB} ms, ratio ${c.ratio} (rounds ${c.ratioMin}–${c.ratioMax}) ${c.verdict}`);
  }
}
if (args.json) writeJson(args.json, out);
console.log(JSON.stringify(out.cases.map(({ roundsA, roundsB, ...c }) => c), null, 1));
await browser.close();
close();
process.exit(fails ? 1 : 0);
