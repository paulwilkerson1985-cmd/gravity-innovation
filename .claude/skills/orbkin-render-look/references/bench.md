# On-device bench protocol (`?bench=1`) — read when a change adds a pass, changes resolution/AA, or must ship to a phone tier

Contents: 1 why · 2 install and serve · 3 what the owner does · 4 what it records · 5 reading it
back · 6 decision rules · 7 extending the cases. Source: mobile-perf-budget §6, frame-architecture §7.

## 1 Why
Every ms in the research is SwiftShader (CPU rasteriser; run-to-run noise ±50 % on the shared
4-core box). Counters (draws, passes, bytes) transfer to phones; ms do not. The owner's phone is the
source of truth: one URL, one START tap, one COPY tap, ≈ 1–2.5 min, one `ORBKIN_BENCH {json}` line.

## 2 Install and serve
`bash scripts/bench_serve.sh [game] [port]` copies `assets/bench.ts` to `src/debug/bench.ts`, adds the
one-line hook to `src/main.ts` (`if (params.get('bench')) void import('./debug/bench').then((m) => m.runBench(game));`
after `installHooks(game)`), builds, and runs `vite preview --host`. The bench is a lazy chunk (≈ 5 KB
gz) that never loads without the flag. Verified headless here (typecheck, lint, 4 cases + probes).
Owner's computer on the same Wi-Fi: open `http://<LAN-IP>:4173/?bench=1` on the phone. Plain http on a
LAN IP works; the clipboard API needs https, so COPY falls back to selecting the text. Alternative:
publish `dist/` as a private claude.ai Artifact (Safari throttles rAF in cross-origin iframes until the
first tap; the START tap covers it — say so in the results).

## 3 What the owner does (two minutes)
1. Optional GPU timings: Android Chrome `chrome://flags/#enable-webgl-developer-extensions` → Enabled →
   Relaunch; iPhone Settings → Apps → Safari → Advanced → Feature Flags → **WebGL Timer Queries**.
   Without them the bench still reports `syncMs`, `cpuMs` and `raf`.
2. Battery > 30 %, **Low Power Mode off** (iOS caps rAF at 30 fps), not charging if possible, phone
   cool (idle 1 min), portrait, other apps closed.
3. Tap START, don't touch the screen for ≈ 2 min, tap COPY, paste the `ORBKIN_BENCH {…}` line.
Deeper: Chrome `chrome://inspect/#devices` → Console shows the line + Performance flame charts;
iPhone Web Inspector via a Mac (Develop → device → page).

## 4 What it records
Cases: `cave-low` (baseline: Ember Ridge trainer battle in the cave), `cave-low-nobloom`,
`cave-low-nopost` (no bloom/grade/tilt), `cave-high` (2048² live shadows, 2× bakes, ½-res bloom),
`meadow-low`, `coast-low`, `route-low`, `title-low`, `starter-low`, `cave-low-again` (thermal drift);
`bench=quick` = 6 of them; `bcases=` picks; a `warmup` run precedes everything (the first case is
≈ 35 % slower from JIT/cache warm-up). Per case: `enterMs` (instant mode, no fades), `links/linkMs`,
`syncMs p50/p90` (render + 1-px readPixels), `gpuMs p50/p90` (whole-frame TIME_ELAPSED when exposed;
per-pass splits are not reliable on tilers: measure passes by ablation), `cpuMs`, `raf p50/p95/over20/
over34` (real cadence over 2 s), `calls tris internal programs tex geo heapMB`. Global: `device`
(UA, unmasked GPU string on Android, "Apple GPU" on iOS, dpr, screen, cores, deviceMemory, max texture/
samples, extension flags), `thermalDriftPct`, `probe` (one 9-tap fullscreen pass at ¼ / ½ / native in
RGBA8 and RGBA16F, + RGBA16F MSAA4 with three's blit resolve; 400 tiny draws → `per100DrawsMs`).

## 5 Reading it back
`python3 -I scripts/bench_read.py bench.txt --tier low` prints the table, the ablation costs and the verdict:
```
cost(bloom)        = cave-low − cave-low-nobloom         cost(grade+tilt) = cave-low-nobloom − cave-low-nopost
cost(high tier)    = cave-high − cave-low                 per-pass ms      = probe.pass_{q,h,n}_{8,16f}
cost(MSAA4)        = probe.pass_n_16f_msaa4 − pass_n_16f  draw-call budget = (frame budget − frame) / per100DrawsMs × 100
thermal            = thermalDriftPct (> 15 % ⇒ rerun cold or treat as sustained)
```
Prefer `gpuMs`; `syncMs` is an upper bound (+ submit + one readPixels ≈ 1 ms). `raf.over20` is the
user-visible verdict (≤ 5 % passes, 5–15 % borderline, > 15 % fails at 60 Hz). Store each run as a
dated JSON next to the budget; compare runs on the same phone only.

## 6 Decision rules
- A proposal is adopted for a tier only if, on the slowest device of that tier, the tier's `cave-*`
  case stays within the GPU frame budget (low ≤ 11 ms, T1 ≤ 12, desk iGPU ≤ 12) AND `raf.over20 ≤ 5 %`
  after the thermal check.
- `cave-low-ires2.sync ≤ 14 ms` ⇒ that device class can take T1 (internal × 1.5–2).
- `cave-low-native-msaa4.sync > 2 × cave-low-native.sync` or `> 25 ms` ⇒ MSAA stays desktop-only.
- hybrid: `cave-low-fa-h.sync − cave-low-fa-l.sync ≤ 1.5 ms` and `raf.over20 ≤ 5 %` ⇒ H on that device
  class; `cave-low-fa-l − cave-low > 1.5 ms` ⇒ cap max CoC at 6 grid px or gather at ½ grid.
- `enterMs > 2500` or `links > 40` on a mid phone ⇒ fix scene build / program count before adding content.
- Screen grade / tilt changes: run the screen's case with and without your switch (`bvar=<flag>`,
  §7); adopt when `case − case+flag ≤ 0.8 ms` (the low tier's grade/tilt budget) and `raf.over20 ≤ 5 %`.
  The three cases for a title/starter change: `title-low`, `starter-low` (both with `bvar`) and
  `cave-low-again` (thermal): `?bench=1&bcases=cave-low,title-low,starter-low,cave-low-again&bvar=<flag>`.
- Tier detection stays: coarse pointer → low; T1 only from a GPU-string allow-list (Android
  `WEBGL_debug_renderer_info`: "Adreno (TM) 6xx", "Mali-G…") or a cached 1-s startup probe (iOS masks
  the GPU string).

## 7 Extending the cases
`&bvar=<post flag>` runs every picked case a second time with that flag added (id `<case>+<flag>`): the
ablation of a same-build switch without editing the file. Add an entry to `CASES` in `bench.ts` with the URL switches your change reads (`post=`, or a new
param such as `fa=l|h2|h|n`, `ires=2`, `msaa=4`, `rt=rgba8|r11|f16`; those three pipeline switches are
not in the game yet — they land with the hybrid port). Keep `cave-low` first and `cave-low-again` last.
Reference devices: 17 GB/s class (Adreno 610/619, Mali-G57 MC2: Snapdragon 680/695, Helio G99),
A13–A15 ≈ 34 GB/s, A16+ ≈ 51 GB/s; a budget that holds on the 17 GB/s class holds everywhere.
