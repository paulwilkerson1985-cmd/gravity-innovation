#!/usr/bin/env node
// Check audit.mjs counters against assets/perf-budget.json per tier. Exit 1 when any counter is
// over budget (and not a known pre-existing overage carried from --baseline), else 0.
//
//   node ${CLAUDE_SKILL_DIR}/scripts/check-budget.mjs AFTER.json [--baseline BEFORE.json] [--budget perf-budget.json] [--tier low|desk|T1]
//
// Rules per counter: value > max  → "over".  With --baseline: if the baseline is ALSO over the same
// counter and the new value is ≤ the baseline value → "over-preexisting" (warn, not a failure; e.g.
// programs 58–66 vs ≤ 40 today). Any counter that grew above its baseline while over budget fails.
// Prints a table per case and a JSON summary line; `--json` prints only JSON.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from './lib/orb.mjs';

const args = parseArgs(process.argv.slice(2));
if (args.help || args.h || !args._[0]) {
  console.log(fs.readFileSync(new URL(import.meta.url)).toString().split('\n').filter((l) => l.startsWith('//')).map((l) => l.slice(3)).join('\n'));
  process.exit(args.help || args.h ? 0 : 1);
}
const here = path.dirname(fileURLToPath(import.meta.url));
const budget = JSON.parse(fs.readFileSync(args.budget ? path.resolve(args.budget) : path.join(here, '..', 'assets', 'perf-budget.json'), 'utf8'));
const after = JSON.parse(fs.readFileSync(path.resolve(args._[0]), 'utf8'));
const base = args.baseline ? JSON.parse(fs.readFileSync(path.resolve(args.baseline), 'utf8')) : null;
const COUNTERS = ['internalMpx', 'msaaPasses', 'float32Targets', 'fullResPasses', 'dramMB', 'draws', 'tris', 'programsLinked', 'gpuResidentMB', 'maxTextureSize', 'canvasMB', 'heapMB'];
const fmt = (v) => (typeof v === 'number' ? (Number.isInteger(v) ? String(v) : v.toFixed(2)) : String(v));
let fails = 0, warns = 0;
const rows = [];
for (const c of after.cases) {
  if (c.error) { fails++; rows.push({ case: `${c.scene}-${c.view}`, status: 'error', error: c.error }); continue; }
  const tier = args.tier || c.tier || (c.q === 'low' ? 'low' : 'desk');
  const b = budget.tiers[tier];
  const bc = base?.cases.find((x) => x.scene === c.scene && x.view === c.view && !x.error);
  const lines = [];
  for (const k of COUNTERS) {
    const rule = b[k];
    if (!rule || c[k] === undefined) continue;
    const v = c[k];
    let status = 'ok';
    if (rule.eq !== undefined && Math.round(v) !== rule.eq) status = 'over';
    if (rule.max !== undefined && v > rule.max + 1e-9) status = 'over';
    if (status === 'over' && bc && bc[k] !== undefined && bc[k] > (rule.max ?? rule.eq) && v <= bc[k] + 1e-9) status = 'over-preexisting';
    if (status === 'over') fails++;
    if (status === 'over-preexisting') warns++;
    lines.push({ counter: k, value: v, budget: rule.max ?? rule.eq, baseline: bc?.[k], status });
  }
  rows.push({ case: `${c.scene}-${c.view}`, tier, internal: c.internal, lines });
  if (!args.json) {
    console.log(`\n${c.scene}-${c.view}  tier=${tier}  internal=${c.internal?.join('x')}  (${c.lastFrame || ''})`);
    for (const l of lines) console.log(`  ${l.status === 'ok' ? '  ' : l.status === 'over' ? 'XX' : '!!'} ${l.counter.padEnd(16)} ${fmt(l.value).padStart(9)}  ≤ ${fmt(l.budget).padStart(7)}${l.baseline !== undefined ? `  (before ${fmt(l.baseline)})` : ''}  ${l.status}`);
  }
}
const summary = { fails, warns, cases: rows.length, verdict: fails ? 'OVER' : 'PASS' };
console.log(args.json ? JSON.stringify({ ...summary, rows }, null, 1) : `\n${summary.verdict}: ${fails} over, ${warns} pre-existing overages, ${rows.length} cases`);
process.exit(fails ? 1 : 0);
