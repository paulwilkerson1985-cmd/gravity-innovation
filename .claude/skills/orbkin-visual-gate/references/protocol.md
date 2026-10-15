# Gate protocol: decision rules, canary, votes, what the judge cannot see

Read at S3 (before the first `visual_judge.py` / `judge_motion.py` call of a session). Source:
`game/docs/GRAPHICS_PLAYBOOK.md` §4, research notes `judge-calibration.md`, `human-ground-truth.md`,
`skill-pilot-ablation.md`. Confidence tags: [high] measured here with controls, [medium] small n,
[low] inference.

## Contents
1. Decision rules (what each exit code means for the change)
2. Views: match the view to the change
3. The canary (outline; the recipe itself is sealed)
4. Votes, orders, position bias
5. What the judge cannot see (and what to do about it)
6. Critique vs gate (the held-out split)
7. Cost table
8. Known failure modes of this gate

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
2x battle crop: the bake raised one design from 5-6 to 7-9 [high]. Also run it whenever a judge
reason names a franchise character (`franchise_hits` in the verdict JSON): judges volunteer names
unprompted ("clean Dragonair silhouette") [medium-high].

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

## 4. Votes, orders, position bias

- On near-equal pairs Opus picks the **second-shown** image 60-64 % of the time and gives fluent reasons
  either way; swap consistency falls to 81-88 % [high]. Hence every vote in both orders and `better` only
  when won in both.
- Default **2 votes per order (4 calls) + 2 canary calls**. If `no_difference` with a win rate of
  0.60-0.75, add one vote per order (`--votes 3`). Beyond 3 per order nothing changes: errors are
  correlated, not coin flips [high for our data; medium for the general claim].
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

## 7. Cost table (list prices; the subscription absorbs them)

| step | calls | $ | wall |
|---|---|---|---|
| defect floor | 0 | 0 | 2 s |
| full view, no boxes | 2 canary + 4 | 0.15-0.20 | 1 min |
| full view with crop + critique | 2 + 4 + 4 + 1 | 0.30-0.40 | 1-2 min |
| element / ui / blur view | 2 + 4 (+1) | 0.15-0.25 | 1 min |
| motion strip (one kind) | 2 + 4 | 0.15-0.20 | 1 min |
| ip_check (one image, 3 runs) | 3 | 0.08 | 30 s |
| full-scene sweep at a milestone (15 desk shots) | ~150 | 3-5 | 15 min at 4 parallel |

Gate only the shots a change touches; the sweep is for milestones.

## 8. Known failure modes of this gate

- The gate pushes agents toward its own view (T3 agents optimised the frozen frame the gate used) and makes
  them back off ambitious changes (T2) [medium]. Use the view that matches the change and read the critique,
  not the win rate.
- Each gate run costs ~8-10 min of a session; at most 2 runs per change, started in the background while
  you keep working on something else.
- `no_difference` is the common outcome for subtle work (T2: 4 of 8 verdicts). Report it as such.
- Portrait (phone) defect floors are uncalibrated and run as WARN; the judge still sees the phone frame.
- Unsealed runs (no `tools/verify/sealed`) use the built-in prompts and no reference anchor; they are
  valid for regressions but the verdict JSON says `"sealed": false` and the report must say so.
