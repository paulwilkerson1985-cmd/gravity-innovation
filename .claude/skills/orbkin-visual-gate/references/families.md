# Taste families, the trust table and the owner batch

Read at S5 (before deciding whether a change is ACCEPTED or must be queued for the owner). Source:
`human-ground-truth.md` §1.7, §4-5; playbook §4.3 (8). Tags: [high] measured, [medium] small n,
[low] inference.

## Contents
1. The rule
2. Families and their starting state
3. What the owner batch looks like
4. Scoring the batch and updating trust
5. How many pairs and votes
6. Reporting owner minutes

## 1. The rule

Human picks are the ground truth; the Opus judge is a proxy that is trusted **per family** only while it
agrees with the human anchors. `trust.json` (sealed dir) holds one state per family:

- `judge_trusted`: >= 5 anchors, Cohen's kappa >= 0.6 against the owner, **zero** contradictions
  (human says A, Opus says B). The gate's `better` accepts the change.
- `human_gated` (the starting state of **every** family): the gate still runs (it catches regressions and
  produces the critique), but `better` only queues the pair for the owner batch; nothing is claimed.

Opus may guard a human-decided tunable against regressions afterwards; it never decides it.

## 2. Families and their starting state

| family | what it covers | start | why it is human-gated |
|---|---|---|---|
| `density` | sprite texel size per device (2-px vs 1-px texels; the only real step) | human | desktop verdicts were order-driven under a frozen clock; the Octopath team says "too finely detailed lost what makes the pixel art great"; decide **per device** [high] |
| `dof_strength` | tilt/DoF band strength and placement | human | Opus DoF verdicts order-driven in 10/12 cells; blur **quality** can go to the judge (`--view blur`) [high] |
| `ui_skin` | cream handheld vs HD-2D slab, panel direction | human | verdict flips with the protocol (reference shown or not) [high] |
| `grade_strength` | per-arena grade, warmth, saturation, vignette | human | judges over-reward "volumetric richness"; baseline-vs-current split 3 better / 2 worse / 1 same [medium] |
| `outline_weight` | sprite outline thickness/colour, rim | human | taste; interacts with density |
| `palette` | arena gamut, kin colour blocks | human | taste; IP interactions |
| `baseline_vs_current` | whole-arena before/after | human | the first owner session answers whether the refine rounds regressed meadow/volcanic |
| `kin_source`, `kin_renderer` | code kin vs Blender kin; live bake vs offline sprite | human until anchored | frozen-clock Opus: code 6/6, live 4/6; one owner session can confirm |
| `lighting_mood` | key direction, shafts, pools | human | see grade_strength |
| `motion_timing` | attack keys, hit feedback | human until the strip judge has anchors | strip judge calibration is thin [medium] |
| `environment_element` | water, foliage, rock, prop pixel craft | human until 5 anchors | crop verdicts were 4/4 on tested elements, so this family should pass to judge-trusted quickly [medium] |
| `defect` | flattened / blurred / desaturated regressions | **judge** | the defect floor + judge caught 100 % of synthetic defects; humans fail the subtle gold (G3) | 

Tunables with taste content (density, UI skin, grade strength, outline weight, palette, DoF strength)
are decided by human Bradley-Terry per device (`agree.py` prints it), recorded with evidence in
`game/docs/DECISIONS.md`.

## 3. What the owner batch looks like

`owner_kit.py` builds an offline page (no network, nothing sent anywhere) from this session's verdict
files: each human-gated pair becomes a trial (x = last accepted, y = candidate; sides randomised per
trial, order per session, random image ids, no labels), plus controls the owner is not told about:
two easy golds (blur r 2.2, values pulled 40 % toward the mean), one identical pair under two ids, and 3
late swapped repeats. Five answers: A clearly / A slightly / No difference / B slightly / B clearly, with
optional "what decided it" chips. Phone pairs are rated on the phone (flip view, 1:1 toggle). The fan-art
reference never goes into a kit.

Starter set the owner should run first (if not done): the 23-trial kit from the research
(`baseline_vs_current` x 6 arenas, `density` x 4, `kin_source` x 2, `kin_renderer`, `ui_skin` x 2 +
controls), ~12-15 min, then P10/P15 on the phone. Its picks seed the trust table.

## 4. Scoring the batch and updating trust

`agree.py --key key.json picks.json` does, in order:
1. Rater QC: both easy golds must pass; median response >= 2 s; identical pair should be "No difference"
   ("clearly" there is a warning); test-retest >= 2/3 with no hard contradiction; side bias p-value.
2. Per-pair human verdict (plurality; ties -> same) and signed strength.
3. Agreement with Opus on main pairs: raw, kappa, weighted kappa, Gwet AC1, bootstrap CI, Spearman, and
   the **contradiction list** (the actionable output: it names the families the judge must not decide).
4. Bradley-Terry per device for the `density` family.
5. Stores each rated pair as an anchor (`sealed/anchors/<set>-<pair>/`), recomputes every family's
   state over all anchors on disk, writes `trust.json`, prints recommendations.

When a family is contradicted: first add the focal crop or the phone view to the judge for that family
and re-run the anchors; only if it still contradicts, leave it human-gated. Never paste owner picks into a
generator prompt.

## 5. How many pairs and votes

- One owner session of 15 main pairs separates a useless judge (kappa ~0) from a good one (>= 0.6); the
  kappa CI is about +-0.3, so grow the anchors to 30-60 pairs over milestones [high].
- A single owner vote is right as often as the preference is strong (75 % preference -> 75 %); five
  independent raters per pair are needed before a 1-JOD preference is called right 90 % of the time. The
  owner is the client, so his picks decide taste; strangers answer "would a seasoned designer agree" at
  milestones only [high].
- Test-retest: 3 repeats, pass bar >= 2/3 the same answer, 0 hard contradictions [high].
- External round at milestones: 3-5 people who never saw the game, the 5-second module ("what is this
  game?"), then the pairwise set; optional 15-minute seasoned-designer review with the playbook §3.1
  reads as the agenda.

## 6. Reporting owner minutes

Every run that queues pairs reports: number of trials (pairs + repeats + controls) and minutes
(~25 s per trial + 2 min setup/export; +5 min if phone pairs must be rated on the phone). `owner_kit.py`
prints `owner_minutes`; `report.sh` copies it into the report. Batch pairs across a session (5-10 pairs,
~5 min) instead of asking per change.
