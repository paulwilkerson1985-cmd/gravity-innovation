# Gate protocol: decision rules, canary, votes, what the judge cannot see

Read at S3 (before the first `visual_judge.py` / `judge_motion.py` call of a session). Source:
`game/docs/GRAPHICS_PLAYBOOK.md` §4, research notes `judge-calibration.md`, `human-ground-truth.md`,
`skill-pilot-ablation.md`. Confidence tags: [high] measured here with controls, [medium] small n,
[low] inference.

## Contents
1. Decision rules (what each exit code means for the change)
2. Views: match the view to the change
3. The canary (outline; the recipe itself is sealed)
4. Votes, orders, position bias, early exit
5. What the judge cannot see (and what to do about it)
6. Critique vs gate (the held-out split)
7. Cost and time table (measured)
8. Known failure modes of this gate
9. Controls, roles and the real motion test
10. Provenance: what makes a verdict self-proving

## 1. Decision rules

Per shot, `visual_judge.py` prints one of:

| decision | exit | meaning | what you do |
|---|---|---|---|
| `better` | 0 | candidate won >= 75 % of votes **and** won in both display orders | accepted for this shot |
| `no_difference` | 1 | the judge cannot tell; includes order-flipping (won only when shown second) | never claim an improvement; keep only if the change was meant to be invisible (perf, refactor) or the owner picks it |
| `worse` | 1 | won <= 25 % and lost in both orders | revert or rework; read the reasons as critique |
| `invalid` | 3 | the canary failed or too many judge errors | the run is unusable; do not retry until the canary passes; report it |

Full-frame + focal crop interaction (`--view full` with boxes): frame `better` but crop `worse` ->
`no_difference` (the frame got nicer, the subjects got worse: a human looks). Frame undecided but crop
decided -> the crop decides. Crops measure sprite/ground read; full frames measure the whole look. They
disagreed on 8 of 12 real pairs [high], so they are two signals, not a tie-breaker.

A **change** is ACCEPTED when: every defect floor passed; no shot is `worse`; at least one target shot
is `better` (or all are `no_difference` for an intentionally invisible change); `ip_check.py` did not
FAIL; and the change's family is `judge_trusted` in the trust table. Human-gated families are queued
for the owner instead; see families.md. Anything else goes back to the generator with the critique.

`ip_check.py`: PASS exit 0, REVIEW exit 1 (owner decides, with the one-line fixes), FAIL exit 4
(>= 7/10 similarity with distinctive overlap in >= 2 of 3 runs) blocks. Run it on the lineup **and** the
2x scene crop (`<id>.scene.png`: mine, foe, player and trainer; the `.crop.png` leaves the trainer out):
the bake raised one design from 5-6 to 7-9 [high]. The `creatures` table names the closest character per
run even on PASS (pilot: Pebblet -> Roggenrola/Nacli 3, Cragmaul -> Gigalith 4, Ashkit -> Foxparks 4, all
generic). Also run it whenever a judge reason names a franchise character (`franchise_hits` in the verdict
JSON; common-word names such as Red/Gold/Crystal only count when capitalised outside a colour phrase or next
to a franchise word): judges volunteer names unprompted ("clean Dragonair silhouette") [medium-high].
`--composition` on the UI-free full frame names the closest known game location / screen layout and rates
layout similarity (light shafts, stairs, platforms, camera, combatant placement): the pilot cave read as a
generic rock gym / HD-2D interior at 3-5 (PASS), while the **HUD**, judged separately with `--hud`, read as
the Gen 3/4 Pokemon battle screen at 8/10 distinctive in 3/3 runs [medium: unsealed, one frame]. HUD layout
is a `ui_skin` decision for the owner, never an arena block; it is reported as `hud_decision`.

`artgate_compare.py`: exit 1 = a FAIL rule fired (values flattened, frame blurred); fix before anything
else. WARN (colour drained) = look at it. Floors are not targets: they caught 100 % of flattened and
blurred frames with 0 false alarms on 63 real changes (in-sample; re-check on new rounds) [high/medium].
They cannot see subtle softening or added noise; the judge catches both at native size [high].

## 2. Views: match the view to the change

| change | view(s) | why |
|---|---|---|
| static art (arena, kin, props, grade, light) | `full` desk + `full` phone (+ crop via `--layout`) | phone portrait is where empty-floor regressions ship; the crop reads the sprites |
| motion / timing (attack, hit feedback, idle, camera) | `judge_motion.py --kind attack` on the attacker strip, plus `--kind sync` | a frozen mid-impact frame judged a correct timing fix `worse` 8/8 (the target was white-flashed on that frame) [high] |
| one environment element (water, foliage, rock, prop) | `element` crop (one `--focal` box) **and** `full` with frozen dressing | the crop judges the element's pixel craft; the full frame catches cohesion breaks |
| UI / HUD | `ui` (no reference, ever) | a reference-anchored judge rewards copying the reference's HUD: pixel -> slab went 78/84 without reference but 14-22 against with it [high as judge data] |
| depth of field / blur | `blur` crop of a defocused region | judges blur **quality**; strength is the owner's (Opus verdicts on DoF are order-driven in 10 of 12 cells) [high] |
| new or changed design | all of the above that apply + `ip_check.py` lineup and battle crop | originality is separate from quality |

Frames go to the judge at native size (<= 2576 px long edge, <= 20 images per request): at 640 px the
accuracy on subtle defects dropped to 67-83 % [high]. The reference, when sealed, is shown only as a
<= 640 px thumbnail anchor: at native size blind judges do not rank it above the current frame (3/6) and
penalise its mixed pixel grids; it only wins at thumbnail scale (6/6) [high].

## 3. The canary (outline)

Before the real votes, the judge is shown the baseline against a synthetically degraded copy of the
baseline, in both orders. It must prefer the undegraded frame both times. The degradation is the
subtlest defect the calibrated judge caught 100 % of the time at native size; its exact parameters live
in the sealed `canary.json` so that nobody tunes art toward passing it. A failed canary means the judge
route, model or images are broken (or the frames are too small): the run is `invalid`, nothing is
claimed, and the failure is reported. Motion strips use a blur canary by default and an optional
"held frames removed" canary (`--canary hitstop`); the latter is medium confidence only.

## 4. Votes, orders, position bias, early exit

- On near-equal pairs Opus picks the **second-shown** image 60-64 % of the time and gives fluent reasons
  either way; swap consistency falls to 81-88 % [high]. Hence every vote in both orders and `better` only
  when won in both. On a byte-identical pair the pilot judge picked the FIRST-shown image 4/4 at confidence 1
  ("picked A arbitrarily"): the both-orders rule turned that into `no_difference` [high, n=1 pair].
- Default **2 votes per order (4 calls) + 2 canary calls**, run as round 0 (one per order) then round 1.
  **Early exit**: when both round-0 votes are confidence <= 1 and say "identical / no difference", the
  result is `no_difference` after 2 main calls and no critique (pilot re-test: $0.02, 37 s). With `--fast`,
  a round 0 that is 2/2 at confidence 5 in the same direction also skips round 1; never accept a change on a
  `--fast` verdict alone. If `no_difference` with a win rate of 0.60-0.75, add one vote per order
  (`--votes 3`). Beyond 3 per order nothing changes: errors are correlated, not coin flips [high for our
  data; medium for the general claim].
- Judge confidence 4-5 was right 106/106 on known pairs; confidence 1-2 is a coin flip [high].
- Use Opus. Haiku has a 63 % first-position bias; Sonnet was not better than Opus [medium].
- A tie option in the prompt lowers human agreement (0.77 -> 0.64 in MLLM-as-a-Judge); the forced choice
  plus the both-orders rule is what produces an honest `no_difference` [medium].

## 5. What the judge cannot see

| blind spot | consequence | mitigation |
|---|---|---|
| softening at thumbnail size | subtle blur and noise pass at 640 px | send native-size frames; never thumbnails |
| pose and phase | two captures of the same build got a confident 6/6 preference; "1.5x vs 2x density" (pixel-identical) got 6/6 with reasons | frozen clock, absolute frame, `pixdiff.py` outside-the-box check; `compare.json` `frame_mismatch` |
| motion from a still | timing fixes judged worse | strips (S1 motion branch) |
| taste | DoF strength, density, UI skin verdicts flip with order or protocol | owner kit; families.md |
| the whole game | it sees one frame, not the route, the pacing or the UX | the owner's play session, not the gate |
| legal truth | similarity scores are an opinion | REVIEW/FAIL go to the owner |

## 6. Critique vs gate (the held-out split)

The generator (any session that edits art) may read: the brief, the rule names, the defect floors with
their numbers, the budgets, and the **critique** (`critique.gaps` in the verdict JSON: located, measured
gaps from a separate critic call). It may not read: the sealed reference image and its metric vector, the
judge prompts, the canary recipe, the anchor pairs, the trust table internals, or raw win rates as
targets. Why: generator and judge are the same model family (self-preference is documented), numeric
feedback invites hill-climbing on judge noise, and "more edge energy" is satisfied by adding noise
(measured: +7.5 edge energy from noise the judge rejected 100 %) [high]. Enforcement is a Read deny rule on
`game/tools/verify/sealed/**` for generator sessions (owner adds it) plus this skill's standing rule; in the
pilot, 22 gate runs produced 0 reads of sealed files and 0 false claims [high].

## 7. Cost and time table (list prices, the subscription absorbs them; wall clock MEASURED 2026-10-15 on the
4-core cloud box at load 20-40, the normal state when other sessions capture; halve it at load < 4)

| step | calls | $ | wall (loaded box) |
|---|---|---|---|
| desk battle capture (one shot, SwiftShader) | 0 | 0 | 4-7 min (+ the same for a self-check) |
| phone capture | 0 | 0 | 1.5-3 min |
| model-scene lineup capture | 0 | 0 | 45 s |
| strip.mjs (one move, 240 probe + 100 shot frames) | 0 | 0 | 18 min |
| repeat.sh (desk + phone, twice) | 0 | 0 | 15-20 min |
| defect floor | 0 | 0 | 3-9 s |
| full view, no crop votes, with critique | 2 canary + 4 + 1 | 0.10-0.15 | 3.5-4.5 min |
| full view with `--layout` crop votes + critique | 2 + 4 + 4 + 1 | 0.20-0.30 | 5-6 min |
| identical early exit | 2 + 2 | 0.02-0.06 | 40-90 s |
| element / ui / blur view | 2 + 4 (+1) | 0.10-0.20 | 3-4 min |
| motion strip (one kind, blur canary) | 2 + 4 | 0.13 | 20 s - 4 min |
| ip_check (one image, 3 runs) | 3 | 0.06-0.16 | 25-80 s |
| full-scene sweep at a milestone (15 desk shots) | ~100 | 2-3 | 60-100 min captures + 45 min judging |

Gate only the shots a change touches; the sweep is for milestones. Drop the `--layout` crop votes for grade,
light and dressing sweeps or when the per-change budget is under $0.60; keep them for sprite / kin / UI-near-
sprite changes (the crop measures sprite and ground read, which the full frame under-weights).

## 8. Known failure modes of this gate

- The gate pushes agents toward its own view (T3 agents optimised the frozen frame the gate used) and makes
  them back off ambitious changes (T2) [medium]. Use the view that matches the change and read the critique,
  not the win rate.
- Each gate run costs ~8-10 min of a session; at most 2 runs per change, started in the background while
  you keep working on something else.
- `no_difference` is the common outcome for subtle work (T2: 4 of 8 verdicts). Report it as such.
- Portrait (phone) defect floors are uncalibrated and run as WARN; the judge still sees the phone frame.
- Unsealed runs (no `tools/verify/sealed`) use the built-in prompts and no reference anchor; they are
  valid for regressions but the verdict JSON says `"sealed": false`, the report banners it, and nothing is
  ACCEPTED on them: they are pilot / self-test evidence.
- A verdict whose recorded input hash no longer matches the file beside it (a moved or regenerated frame) is
  REFUSED by report.sh and not counted: re-judge rather than argue.

## 9. Controls, roles and the real motion test

Controls prove the INSTRUMENT, never the game. Run every control with `--role control --expect <decision>`
so report.sh lists it under "Instrument checks" (expected vs got, pass/fail) and keeps its critique out of
"Top critic gaps": a synthetic blur's "remove the full-frame blur" is advice about damage you inflicted.
- Stills: `degrade.py SRC OUT` makes `soft` (0.75x bilinear down/up; floor pass, judge worse), `flat` (40 % to
  the mean; floor FAIL, judge worse), `blur` (r 2.2; floor FAIL, judge worse) and `identical` (floor pass,
  judge no_difference). Pilot: 4/4 floors and 4/4 judges as expected [high for these recipes].
- Strips: `make_strips.py DIR --stepped 2` writes a held-frame copy (30-frame steps). Judging the real strip
  against it (`--expect better`) checks that the judge prefers continuous motion (pilot 4/4 at confidence 4);
  it is a straw man for "can the gate separate two plausible timings". The **real motion test** is two timing
  variants of the SAME move captured by strip.mjs from two trees (or one tree with the game's timing override
  in `--qs`), judged with `judge_motion.py --kind attack --canary blur,hitstop` in both orders, plus
  `--kind sync`; the blur canary alone passed only at confidence 2 in the pilot, which section 4 calls a coin
  flip, so the result marks it `weak` and a weak-only canary never supports acceptance [medium].
- Repeatability: `repeat.sh` (two captures from one dist, sha256 + pixdiff tol 0 per id and file) replaces
  the per-shot self-check when a run will be accepted or claims repeatability; the pilot's two captures were
  byte-identical on all 6 files, and the model-scene lineup repeated byte-identically in the re-test.

## 10. Provenance: what makes a verdict self-proving

Every result (visual_judge, judge_motion, artgate_compare, ip_check) carries `provenance`: sha256, size and
RUN-relative path of each input, the model requested and the model the CLI actually ran, wall seconds, cost,
host load, argv and role/expect. `gate_init.sh` writes `run.json`; `export ORBKIN_RUN=$RUN` makes every
result RUN-relative without `--run`. report.sh re-hashes the files beside each result and marks each row
`ok`, `missing`, `unproven` (older format) or REFUSED (mismatch, not counted); it also warns about files older
than `run.json`. A moved run dir therefore still proves which pixels were judged.
