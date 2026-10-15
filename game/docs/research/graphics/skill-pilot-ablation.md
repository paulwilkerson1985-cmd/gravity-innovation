# Skill pilot ablation: does a compressed Orbkin skill change what Opus produces?

Angle: `skill-pilot-ablation` (follow-up raised by the completeness review). Written 2026-10-14 by an Opus 5.5 subagent.
Claude Code v2.1.299, Opus 5.5 (`claude-opus-5-5`) for every session and every judge.

**Question.** `skills-format.md` established how skills trigger and how to write them, and cited benchmarks that
curated skills help while self-written exhaustive ones do not. Nobody had tested whether *this* research, compressed
into a ~5k-token `SKILL.md` plus references, changes what Opus actually produces on real Orbkin tasks.

**What I did.**
1. Drafted two skills from the research notes, in the shape `skills-format.md` recommends:
   - `orbkin-sprite-creature` (kin design + attack feel);
   - `orbkin-arena-dressing` (value masses, detail gradient, texel bevel, AO, focal contrast).
2. Built a scratch-build harness: per-run workspace copy of the game, a deterministic capture tool, untouched-game
   baseline captures.
3. Ran **33 fresh `claude -p` Opus sessions**: 3 tasks × up to 4 arms × 3 reps.
4. Re-captured every final state independently and blind-judged all outputs with the calibrated pairwise protocol
   (1,026 judge votes), plus an originality check, timeline metrics, transcript analysis and rule checks.

Everything below was measured in this container unless marked. Confidence:
- **high**: measured here with controls, consistent across reps.
- **medium**: measured, but n = 3 per arm (wide CIs) or one judge protocol.
- **low**: my inference.

All files are under `scratchpad/pilot/`. The file list is in section 12.

---

## 0. TL;DR

1. **The skills trigger perfectly but do not reliably improve judged output quality.** Fresh Opus invoked the right
   skill on its first action in 24/24 skill-arm runs, with no slash command. Blind pairwise judging (both orders, frozen
   clock, canary passed in every view) gave:
   - **T1, new kin: no-skill won.** P(skill-arm kin beats no-skill kin) was 0.00–0.44 depending on arm and view; the
     no-skill arm ranked top in both views.
   - **T2, meadow redress: no skill effect on desktop; the full skill was worse on phone** (0/3 vs baseline; it
     followed the skill's "dark framing foreground" rule).
   - **T3, Breaker Crush: modest gain on the motion view.** On the 8-frame strip, P(skill beats none) ≈ 0.67–0.72
     (CIs from 0.17–0.33 to 1.0).
   
   Overall effect ≈ 0 with n = 3 per arm. (medium: direction per task is consistent across views, magnitudes are not)
2. **Opus already knows (or finds) most of what the skill told it.** The planted hard fact, the async `return tail`
   bug that delays every hit reaction by ~2 s, was found and fixed by **all three no-skill runs too**. Impact-to-reaction
   went from 127 frames to 1–4 in 12/12 runs. The no-skill fix was 13 min and $2.13 on average; with the full skill it
   was 34 min and $3.40. (high)
3. **Scripts are the part of a skill that gets used; references are mostly not.**
   - `read_sheet.py` ran in 15/15 skill-arm T1/T2 runs, and `fx_timeline.sh` in 9/9 T3 skill runs (3–6 times each, mean 4.8).
   - References were opened in **11 of 24** skill runs: never the attack reference (0/9 in T3), the API reference
     in T2 6/6, the creature reference in T1 5/9.
   - **0/6 runs opened any reference once the 5k-token cut removed the reference table.** (high)
4. **The 5k-token compaction cut did not hurt outcomes.** It removed the generated-look tells, all Gotchas, the
   reference table and the report template. Outcomes were equal or better:
   - T3 strip: cut ranked best (3/3 better than baseline; P(cut > full) = 0.78).
   - T1: cut ≈ full.
   
   The one gotcha that mattered survived because the workflow step pointed at it. **What matters is in the workflow
   lines, not in the tail.** (medium)
5. **The tokenizer is denser than the folklore.** The current Opus/Haiku tokenizer counts **2.4–2.5 characters per
   token** on Markdown, measured via the API usage delta:
   - the 15.4k-char SKILL.md is 6,329 tokens;
   - `skills-format.md` is 22.2k tokens for 56k chars.
   
   So "< 5k tokens" means ≈ 12k characters ≈ 160 lines, not 500 lines. The skills-format "<500 lines / <5k tokens"
   rule is internally inconsistent by about 3×. Claude Code appends "[... skill content truncated for compaction; use
   Read on the skill path if you need the full text]" when it cuts (string found in the binary). (high for the ratio;
   medium for how Claude Code counts)
6. **The held-out gate was never faked, but it shaped behaviour, sometimes the wrong way.** Across 22 completed gate runs (+1 killed by a timeout) in 9
   sessions:
   - 0 reads of sealed files;
   - 0 reports claiming an improvement the gate had not accepted;
   - every `worse` / `no_difference` was reported honestly.
   
   But:
   - (a) **T3: the frozen mid-impact frame penalises a correct timing fix.** The target is white-flashed on the impact
     frame, so the gate said `worse` 8/8 times for changes that the strip judge preferred.
   - (b) The gate pushed agents toward its own view: T3 gate outputs won the frozen-frame crop/late views (a Goodhart
     effect), and T2 gate agents backed off ambitious changes.
   - (c) The gate costs ~8–10 extra minutes per session; one T3 gate session hit the 60-min timeout during its third
     gate run.
   - (d) On T2 the gate prevented the phone regression that the ungated skill arm shipped (gate > none on phone 0.89,
     CI 0.67–1.0). (high for behaviour, medium for quality effects)
7. **Design mode collapse.** 12/12 `duneskip` designs, in every arm, were a desert jerboa/hopper with sail- or kite-like
   ears and a sand + cream + turquoise palette. The brief rule ("animal + element + behaviour + twist") did not diversify
   concepts; the species name primed them. Originality check: 9 PASS, 3 REVIEW (Leafeon 5–6, Cubone 5), 0 FAIL, with no
   arm difference. (high)
8. **Self-check rules without measurement did not move judged quality.** "Mid-value base colours", "2–3 value groups"
   and "dark framing foreground" were followed (located PASS lines in reports), yet judges called those kin "muddy" and
   those phone frames "flatter, emptier". Untested aesthetic defaults can make output worse. (medium)
9. **Cost of the pilot.**
   - Sessions: ≈ $83.6 at list price for 32 sessions (one timed out without a cost record); 12.3 h of session wall time,
     run 4 in parallel over 3.6 h elapsed on a 4-core box with load 20–40.
   - Judges: $43.95 for 1,026 votes. Originality checks: ≈ $0.7.
   
   The subscription absorbed it.
10. **Decision for the skill-writing phase:** rebuild the template around what was used and what moved results
    (section 10 and `skills/template-v2/SKILL.template.md`):
    - scripts and measurements first;
    - per-step "read §N now" pointers instead of a reference table at the end;
    - a divergent-concepts step;
    - gates whose view matches the change;
    - only rules that a RED (no-skill) run actually violated.
    
    Expect skills to win on **process** (measurement, honesty, regression checks), not automatically on taste.

---

## 1. Why this pilot, and what the sources say

- **SkillsBench** (arXiv 2602.12670, via search summaries): curated skills +16.2 pp on average; self-generated skills
  give no benefit; focused 2–3-module skills do best. [medium: preprint]
- **LH-Bench** (arXiv 2603.22744): the closest published analogue to this pilot, a direct SKILL.md removal ablation on
  subjective long-horizon tasks. Expert SKILL.md guidance helped Codex most (+0.87), Claude Code modestly (+0.15) and
  Gemini CLI barely (+0.05). n = 7 paired runs, called preliminary by the authors. [medium: search summary; arxiv.org is
  DNS-blocked here]
- **SkillEval** (arXiv 2608.06891): document-level skill-quality signals (applicability, content quality, execution
  guidance, robustness) predict SkillsBench uplift (r ≈ 0.78), and score-guided revisions raised pass rate by 29.5 pp.
  [low-medium: abstract via search]
- **NVIDIA SkillEvaluator**: "Skill Lift" = with-skill score − without-skill score, the same paired design as here.
  [medium: blog]
- **Agent Skills Can Be Harmful** (arXiv 2608.11888, cited in `skills-format.md`): skill-induced cost regressions mostly
  come from excessive procedure. This pilot shows the same pattern: +60% cost and 2.7× wall time on T3 for the same
  fix.

**Conclusion from the sources.** Paired with/without measurement on your own tasks is the accepted yardstick. Small
positive or null effects for a strong agent (Claude Code +0.15 in LH-Bench) are the expected base rate, which is what
this pilot found.

---

## 2. Design

### 2.1 Tasks (same prompt in every arm; prefixed with "you are working autonomously…")

| ID | Prompt (abridged) | Output measured |
|---|---|---|
| T1 add a kin | "Add a new rare single-stage Terra/Gale kin `duneskip` on Ember Ridge … design it … must hold up next to our best kin and the HD-2D reference bar … original … `tools/shoot.sh newkin-desk` must show it" | `newkin-desk` (scrub arena, wild foe) full frame + 2× crop; originality check of a 3× foe crop |
| T2 redress an arena | "The meadow clearing arena … looks busy and flat next to the reference. Redress it … without changing gameplay or staging and without blowing the draw-call budget" | `meadow-desk` full + crop, `meadow-phone` full; staging, draw calls, flowers-arena regression |
| T3 tune an attack | "Breaker Crush … the hit doesn't land. Tune it so the hit reads and feels powerful, without changing battle rules" | `fx-tide-desk` mid-impact full + crop, `.late` crop, **8-frame motion strip** (launch → +1.2 s); frame-exact timeline |

### 2.2 Arms

| Arm | Skills in `.claude/skills/` | Notes |
|---|---|---|
| `none` | none of ours (the ~86 plugin skills of this environment are present in every arm) | baseline |
| `full` | `orbkin-sprite-creature` (6,329 tokens) + `orbkin-arena-dressing` (4,367 tokens), each with 3 references and scripts | as drafted |
| `gate` | full + `scripts/gate.sh` + a "Verification gate" section ("done = gate ACCEPTED"; ≤ 3 runs; do not read sealed files) | gate = capture, defect floor (`artgate_compare.py`), canary-validated blind pairwise judges vs the untouched build, originality check for kin; sealed implementation outside the workspace, `Read` denied |
| `cut` | full, but `SKILL.md` truncated at the first 5,000 tokens (the compaction keep) | real tokenizer cut (12,115 of 15,406 chars). The arena skill is under 5k tokens, so the cut was a no-op and T2 had no cut arm |

- n = 3 per arm: 12 + 9 + 12 = **33 sessions**.
- Run order randomised within each rep block; 4 sessions in parallel.
- Each session: `claude -p --model opus --permission-mode acceptEdits --permission-prompts none`, tools Bash/Read/Edit/
  Write/Glob/Grep/Skill/Todo, Web denied, `--strict-mcp-config`, `--max-budget-usd 15`, 60-min timeout,
  `--output-format stream-json` transcript.

### 2.3 Scratch-build harness (`pilot/make_ws.sh`, `pilot/harness/`)

Each run gets its own workspace:
- `game/`: a `git archive HEAD` copy with `node_modules` symlinked, committed as a baseline so the diff is exact.
- The repo-root `CLAUDE.md` plus a workspace note naming the tools.
- `tools/shoot.sh`: the refine capture harness (Vite build + SwiftShader Playwright, **virtual frame clock**, so the
  same tree gives identical pixels).
- `tools/baseline/`: the untouched game's captures.
- `.claude/settings.json`: the repo's deny rules, plus a deny on the sealed directory and on web tools.

All arms got identical tools, so the arms differ only by the skill text and scripts.

### 2.4 Evaluation (independent of what the agent captured itself)

- **Post-hoc capture** of every final workspace (`eval/posthoc.sh`):
  - task shots;
  - `tsc` and `vitest`, with test timeouts raised because load averages of 20–40 made timing tests flaky;
  - git diff;
  - for T3, the frame-exact timeline (`harness/timeline.mjs` + `tl_summary.py`).
- **Blind pairwise judging** (`eval/judge_eval.py`), the protocol calibrated in `judge-calibration.md`:
  - tool-less fresh `claude -p` Opus per vote, images inline at native size, reference shown on full-frame desk views;
  - every comparison in both orders;
  - canary (baseline vs degraded baseline) per view;
  - comparisons: each output vs baseline, and every cross-arm pair of outputs.
- **T3 motion strip view** (`eval/strip.sh`). Added because the frozen frame cannot see timing.
  - 8 frames, 150 ms apart from launch; P_STRIP prompt.
  - Uncalibrated beyond the blur canary.
- **Statistics** (`eval/analyze.py`):
  - pair outcome = 1 / 0.5 / 0 over the two orders;
  - arm-vs-arm P with a 95% bootstrap over runs;
  - Bradley–Terry strengths per output;
  - second-shown rate as a position-bias check.
- **Originality** (`eval/ip_eval.py`): the sealed `ip_check.py`, 3 runs per foe crop.
- **Process** (`eval/transcripts.py`), from the stream-json transcripts: cost, tokens, turns, tool counts, skill
  invocations, reference reads, script use, gate runs and verdicts, sealed-file access, report structure.
- **Rules** (`eval/rules.py`): staging pixel shift, draw calls, engine untouched, commits, timeline, flowers
  regression, brief/plan written.

---

## 3. Results: judged quality

Format: P(row arm beats column arm), with the 95% bootstrap CI over runs. "vs base" = better (won both orders) / split /
worse, out of 3 runs. Canary passed in every view.

### 3.1 T1, new kin (`newkin-desk`; baseline = the same shot with Cragmaul)

| View | 2nd-shown rate | vs base (all arms) | full>none | cut>none | gate>none | full>gate | cut>full |
|---|---|---|---|---|---|---|---|
| full frame + ref | 0.50 | 3/0/0 for every arm except full 2/1/0 | **0.00 [0, 0]** | 0.17 [0, 0.56] | 0.33 [0, 0.89] | 0.39 | 0.56 |
| 2× crop | 0.45 | 3/0/0 for every arm | 0.28 [0, 0.67] | 0.44 [0, 0.94] | 0.44 [0, 1.0] | 0.50 | 0.44 |

Bradley–Terry means: full frame none 3.43, gate 0.83, cut 0.05, full 0.01; crop none 3.5, cut 0.46, full 0.21, gate
0.16.

- **The no-skill kin won.** Judge reasons consistently cite a "clean silhouette, cream/teal palette, strong contrast
  against the ground" for the no-skill kin and "muddy, blends into the shadowed ground" for several skill-arm kin.
- The skill's "keep base colours mid-value" and "2–3 value groups" rules plausibly produced the muddier sprites under
  the warm scrub light. (low-medium: inference from reasons + `eval/sheet_T1.jpg`)
- The baseline Cragmaul frame was beaten by every new kin, so "vs base" does not discriminate here.

### 3.2 T2, meadow redress

| View | 2nd-shown | full vs base | gate vs base | none vs base | full>none | gate>none | full>gate |
|---|---|---|---|---|---|---|---|
| desk full + ref | 0.64 | 2/0/1 | 2/1/0 | 2/1/0 | 0.22 [0, 0.5] | 0.28 [0, 0.67] | 0.39 |
| desk crop | 0.64 | 0/1/2 | 0/2/1 | 0/3/0 | 0.22 [0, 0.5] | 0.50 [0.28, 0.72] | 0.17 |
| phone full | 0.56 | **0/0/3** | 2/1/0 | 1/1/1 | 0.22 [0, 0.67] | **0.89 [0.67, 1.0]** | **0.00 [0, 0]** |

- The high second-shown rate (0.56–0.64) means **near-equal pairs**: most redresses were subtle (`eval/sheet_T2.jpg`).
- The **full skill lost on phone in 3/3 runs**. Judge reasons: "flatter terrain, emptier, stray artifacts" vs "richer
  volumetric light, layered foliage, floral framing" in the baseline.
- The gate arm (whose gate *saw* the desk frame and ran the defect floor on phone) was the best on phone. Its agents
  reverted the darkened foreground after `worse` verdicts.
- So the skill's rule "dark, simple framing foreground" + "fewer tufts" hurt the portrait frame, and the gate partly
  rescued it. (medium)

### 3.3 T3, Breaker Crush

| View | 2nd-shown | vs base cut / full / gate / none | full>none | cut>none | gate>none | cut>full |
|---|---|---|---|---|---|---|
| mid-impact full + ref | 0.51 | 0/0/3 for every arm | 0.00 | 0.06 | 0.56 | 0.78 |
| mid-impact crop | 0.58 | 0/0/3, 0/0/3, 0/1/2, 0/0/3 | 0.89 [0.67, 1] | 0.72 | 0.89 [0.67, 1] | 0.33 |
| late crop | 0.49 | 0/1/2, 1/1/1, 2/0/1, 0/1/2 | 0.89 [0.56, 1] | 0.28 | 0.67 | 0.06 |
| **8-frame strip** | 0.57 | **3/0/0**, 1/1/1, 2/0/1, 1/2/0 | 0.67 [0.17, 1] | **0.72 [0.33, 1]** | 0.67 [0.17, 1] | **0.78 [0.33, 1]** |

- **Frozen frames punish the fix.** All 12 outputs lose to the untouched build on the frozen mid-impact frame. The
  reason given every time: "Pebblet is a washed-out white blob". With the timing fixed, the target is in its hit flash at
  exactly the frozen instant; in the baseline the reaction had not started yet.
  - The frozen-frame protocol that judge-calibration validated for *static* changes is **invalid for motion/timing
    changes**.
  - The motion strip reverses the verdict: the strip judges praise "impact lands on contact with immediate target flash".
- On the strip, all three skill arms beat no-skill at ≈ 0.67–0.72, with CIs of 0.17–0.33 to 1. The cut arm was best
  (3/3 better than baseline).
- Every arm fixed the timing (section 4.1), so the strip differences are about the impact/dissipation art. (medium)

### 3.4 Originality (T1 foe crops, 3 runs each, `eval/ip_T1.json`)

- PASS: 9 (cut 3/3, full 2/3, gate 2/3, none 2/3).
- REVIEW: full-0 Cubone 5 (distinctive); gate-2 Leafeon 5 (generic); none-2 Leafeon 6 (distinctive, 3/3 runs).
- FAIL: 0.

No arm effect. The "original by construction" rule did not change the outcome (most designs are generic desert-rodent
archetypes).

---

## 4. Results: objective outcomes and rule checks (`eval/rules.json`)

### 4.1 T3 timeline (60 fps virtual clock, seed 13; baseline impact→reaction = 127 frames)

| Run | impact→reaction (f) | text→launch (f) | draw calls (base 60) | removed `return tail` |
|---|---|---|---|---|
| none-0/1/2 | 4 / 1 / 1 | 73 | 62 | yes / other fix / other fix |
| full-0/1/2 | 2 / 2 / 1 | 73 | 64 / 62 / 63 | yes |
| cut-0/1/2 | 1 / 1 / 1 | 73 | 63 / 62 / 62 | yes |
| gate-0/1/2 | 1 / 2 / (timeout run, final state evaluated) | 73 | 62 | yes |

- **12/12 runs fixed the 2-second hit delay.** The skill's flagship gotcha was unnecessary for Opus: the no-skill
  runs found it by reading `movefx.ts`, whose comment contradicts the behaviour.
- **0/12 trimmed the 73-frame text-to-launch beat** (skill target ≤ 30). Several reports flagged it and left it
  "because it changes every move's pacing". That is a defensible scope call, which means "trim to ≤ 30" belongs in a
  project-wide decision, not a skill default.

### 4.2 T2 rule checks

- **Staging:** 0 px shift of every kin and trainer box in all 9 runs.
- **Draw calls:** unchanged (51 desk / 45 phone) in all 9 runs.
- **`plan.md` written:** 6/6 skill runs, 0/3 none.
- **Flowers-arena regression:** 1 run changed the shared flower field, none-1 (draw calls 46 → 42), without checking
  it. The skill's gotcha ("meadow.ts also builds the flower field; check `flowers-desk`") made 3/6 skill runs capture
  the flower field. (medium)

### 4.3 T1 rule checks

- **Bespoke builder in `designs.ts`:** 12/12.
- **Brief written:** 8/9 skill runs, 0/3 none (they designed in their heads).
- **Draw calls:** 38–42.
- **Typecheck:** clean everywhere.
- **Tests:** after classifying load timeouts, 0 real failures in any run.
- **Species-cap test raised from 18 to 19:** in every run; an unavoidable test edit.
- **Concept:** 12/12 the same desert hopper (section 7).

### 4.4 Safety and discipline (all arms)

- 0 commits.
- 0 engine edits (`src/engine/` untouched, so rules stayed pure).
- 0 web use.
- 0 sealed-file reads (no Read, Grep or Bash `cat` of `sealed/`, `gate_impl`, `visual_judge` or `judgelib`).
- No credentials touched.

Several agents read the shared harness directory (`pilot/harness/`, outside the workspace). It was allowed and
harmless, but one no-skill T3 run used the harness's `timeline.mjs`, which was meant for the skill. That is a small
leak in favour of the `none` arm.

---

## 5. Results: process, cost and what was read

| task | arm | n | cost $ mean (range) | turns | wall min | output tokens | cache-read tokens | skill invoked | any reference read | captures | gate runs (verdicts) |
|---|---|---|---|---|---|---|---|---|---|---|---|
| T1 | none | 3 | 3.24 (3.13–3.32) | 57 | 20.4 | 36.0k | 6.1M | 0/3 | 0/3 | 4.0 | – |
| T1 | full | 3 | 3.14 (2.59–3.70) | 38 | 20.4 | 23.9k | 4.0M | 3/3 | 2/3 | 5.3 | – |
| T1 | cut | 3 | 3.06 (2.53–3.87) | 55 | 14.9 | 30.9k | 5.9M | 3/3 | 0/3 | 4.7 | – |
| T1 | gate | 3 | 2.54 (2.14–2.76) | 47 | 24.8 | 28.0k | 4.4M | 3/3 | 3/3 | 6.0 | 2,1,3 (all `better`) |
| T2 | none | 3 | 1.77 (1.39–2.09) | 39 | 12.2 | 18.5k | 2.7M | 0/3 | 0/3 | 2.7 | – |
| T2 | full | 3 | 2.16 (1.82–2.40) | 49 | 10.6 | 20.4k | 3.3M | 3/3 | 3/3 | 3.7 | – |
| T2 | gate | 3 | 1.92 (1.61–2.24) | 44 | 20.6 | 19.5k | 3.0M | 3/3 | 3/3 | 4.0 | 3,3,2 (nd,nd,nd / w,w,nd / w,better) |
| T3 | none | 3 | 2.13 (1.99–2.32) | 43 | 12.8 | 22.3k | 3.7M | 0/3 | 0/3 | 2.0 | – |
| T3 | full | 3 | 3.40 (2.82–4.40) | 67 | 34.1 | 40.3k | 6.6M | 3/3 | 0/3 | 3.3 | – |
| T3 | cut | 3 | 2.26 (2.11–2.44) | 52 | 28.9 | 25.2k | 4.0M | 3/3 | 0/3 | 2.3 | – |
| T3 | gate | 3 (1 timeout) | 3.39 (2 runs) | 58 | 39.4+ | 27.1k | 6.1M | 3/3 | 0/3 | 5.0 | 3,3,2+ (all `worse`) |

(nd = no_difference, w = worse. Costs are the CLI's list-price estimates; the subscription pays.)

What the transcripts show:

- **Triggering:** 24/24 skill-arm runs invoked the right skill as their first tool call, with the task restated as
  `args`. 0 wrong-skill invocations. 0 invocations in `none`. This confirms `skills-format.md` §9 at n = 24 on real
  tasks. (high)
- **Which parts were used:**

  | Part | Used | Verdict |
  |---|---|---|
  | Workflow checklists | brief/plan files 14/15 where asked; `fx_timeline` measure → fix → re-measure loop 9/9 | followed |
  | Scripts | `read_sheet.py` 15/15 T1/T2 skill runs; `fx_timeline.sh` 9/9 T3 skill runs | always used, repeatedly |
  | References | `kit-api.md` 6/6 (T2); `composition-light.md` 4/6; `nature-surfaces.md` 1/6; `creature-design.md` 5/6 (T1 full+gate); `attack-craft.md` 0/6; `blender-path.md` 0/9 | references with API facts get read; craft essays are mostly skipped |
  | Report template | 3/3 T2 full and 3/3 T3 full used `## Evidence / ## Still weak / ## Not verified`; T1 full wrote equivalent bold sections; cut runs (template removed) still wrote "Still weak" sections | the template shaped structure when present |

- **Rules violated anyway:**
  - T1: eyes under the 3×4-texel minimum (self-reported in 2+ runs).
  - T3: still a Bayer/dither dissolve in most final strips (rule "dissipate by shape"); only a minority changed the
    dissolve. Text beat untouched (0/12).
  - T2: the "dark foreground" rule was followed and hurt phone.
  - Self-reported review lines were often PASS where judges disagreed ("value groups visible" vs judged "muddy").
- **Gates were never faked or skipped:**
  - Every gate-arm session ran the gate 1–3 times; one T3 session timed out mid-gate.
  - All final reports quoted the verdict; reports that got `no_difference`/`worse` said "I can't call it an
    improvement".
  - Agents explained the T3 artefact correctly ("the judges compare stills, so they penalise the hit reacting on time")
    and did not game it.
  - **Gate verdict vs post-hoc judging:** T1 gate `better` ×6, consistent with every kin beating baseline. T2
    `no_difference`/`worse`, consistent with the post-hoc desk results. T3 `worse` ×8 on a change the strip judged
    better: a validity failure of the gate view, not of the agent.
- **Cost of the skill:**
  - Same or slightly lower on T1.
  - +22% on T2 (full).
  - **+60% cost and 2.7× wall time on T3 (full)**: extra timeline runs (~3 min each on SwiftShader) and more polish
    rounds, for a timing result identical to no-skill.
  - The gate adds 8–10 min per session (each gate run 2.5–4 min under load).

---

## 6. The 5k-token cut: what it removed and what happened

- **Tokenizer measurement** (`pilot/tok/count.sh`, via the `usage` delta of a `claude -p` call):
  - sprite skill: 15,406 chars → **6,329 tokens** (Haiku and Opus identical);
  - arena skill: 10,906 chars → 4,367 tokens;
  - `skills-format.md`: 56,004 chars → 22,176 tokens;
  - so **≈ 2.43–2.53 chars/token**.
- **The cut** kept the first 12,115 chars. It removed:
  - most of "Generated-look tells to refuse";
  - all of "Gotchas" (incl. the full explanation of the `return tail` bug);
  - "References";
  - "Report".
- **Behaviour after the cut:**
  - **0/6** cut runs read any reference; with the table: 5/6 (T1) and 0/3 (T3).
  - 0/3 T1 cut runs used the `## …` report template; they still wrote "Still weak" sections.
  - **3/3 cut T3 runs still fixed the timing bug**: workflow step A1 says "see Gotchas: the async `return tail`
    adoption bug", and the code made the rest obvious.
- **Outcomes:**
  - T3 strip: cut best (3/3 better than baseline; P(cut > full) 0.78 [0.33, 1]).
  - T1: cut ≈ full.
  - Cut sessions were cheaper than full: T3 $2.26 vs $3.40; T1 $3.06 vs $3.14.
- **Interpretation (medium):** the tail of a skill is the least valuable part *for Opus*; the workflow lines and scripts
  carry the effect. A ≤ 4k-token SKILL.md that keeps workflow, scripts and inline per-step reference pointers loses
  nothing measurable here. Claude Code's real compaction cut also tells the model to Read the full file, so in practice
  it is softer than this simulation.

---

## 7. Design mode collapse (T1)

- **All 12 runs, every arm, chose the same concept.** It was a desert jerboa/hopper/"skip" rodent with sail- or
  kite-shaped ears or fins, sand/cream body, turquoise accent and a stone tail disc in several runs (`eval/sheet_T1.jpg`).
- **The id primed the concept.** The id `duneskip` (dune + skip) suggests the concept. The skill's brief rule ("animal
  + element + behaviour + twist; originality note") was followed in 8/9 skill runs, yet it did not diversify anything.
- **Implication:** a design skill needs an explicit **divergence step**:
  - generate ≥ 3 concepts from different body plans or animal classes;
  - forbid the literal reading of the name;
  - pick by written criteria (silhouette distinctness vs the existing 18 kin, element read, sprite-size read);
  - optionally sample the starting point from a list so repeated runs differ.
  
  This is a known LLM behaviour (low output diversity across independent samples); the pilot quantifies it for Orbkin.

---

## 8. Answers to the angle's five questions

1. **Draft two minimal skills in the recommended shape.** Done: `pilot/skills/src/`, plus variants in `full/`, `gate/`
   and `cut/`. Both have gated phases, a review list (scorecard), scripts, a held-out gate variant, a fresh-eyes
   pairwise judge in the gate, and a bounded loop. Calibration anchors were not included as images (the reference is
   fan art; see open questions).
2. **3 tasks, scratch-build harness, 4 arms, n ≥ 3.** Done: 33 sessions. The T2 cut arm was skipped because the
   arena skill is under the cut, so the cut would be a no-op.
3. **Judge with frozen clock, element crop + full frame, originality.** Done, with 1,026 votes, every canary passed,
   and a motion strip added for T3. Gates were never faked or skipped (22 completed gate runs).
4. **What was read vs violated.** Sections 5 and 6:
   - always: workflow and scripts;
   - API references: read;
   - craft references: rarely read;
   - tail sections: not needed by Opus;
   - rules violated despite the skill: eye size, dither dissolve, slow text beat.
5. **Effect sizes, honestly.** Near zero overall, task-dependent sign (section 0, item 1).
   - The "encode as skills" premise is **not validated for taste**.
   - It **is** validated for process: measurement scripts get used, honesty is kept, regressions get checked.
   - The template must change before writing ~6 skills (section 10).

---

## 9. Threats to validity

- **n = 3 per arm.** Bootstrap CIs mostly span 0–1. Only a few contrasts exclude 0.5:
  - T3 crop: full>none and gate>none (0.67–1);
  - T2 phone: gate>none (0.67–1); full>gate (0, 0);
  - T1 full: full>none (0, 0).
  
  Treat the rest as direction only.
- **The judge is the same model family as the generator** (self-preference). It is pairwise and blind, and the same
  for all arms, so this does not bias arm comparisons. It may still mis-rank taste, and humans have not checked it.
- **Strip prompt is uncalibrated** beyond a blur canary. The frozen-frame views are known to be invalid for T3
  (section 3.3).
- **Machine load 20–40 on 4 cores.** It slowed captures and created test timeouts. I classified timeouts as load
  failures, but timing-sensitive agent behaviour (fewer captures) may differ from a quiet machine.
- **Repo docs are strong.** Every arm had `HD2D.md`, `CREATURES.md` and the comments in the code, so the skill's
  marginal value is measured on top of good project docs. That is realistic for Orbkin, but it means the effect could
  be larger on a project without such docs.
- **The skills were written from research notes, not from RED-run failures.** That is exactly the condition
  `skills-format` §11.4 warned about (write from observed failures), and part of why the effect is small.
- **One T3 gate session timed out at 60 min.** Its final state was evaluated, but it has no cost record.
- **Session-ID oddity.** Nested sessions reported this parent's session id in their stream events. Persistence was
  disabled, and I saw no cross-talk.

---

## 10. Implications for Orbkin (what to change before writing the ~6 skills)

1. **Write each skill from a RED run, not from the notes.** Run the task without the skill first (≈ $2–3, 15 min), list
   what Opus got wrong, and encode only those. In this pilot Opus found the flagship gotcha unaided, so the gotcha
   cost tokens and time for nothing. Delete any rule the no-skill baseline already follows.
2. **Scripts first.**
   - The only skill parts used in 100% of runs were scripts (`read_sheet.py`, `fx_timeline.sh`, `shoot.sh`).
   - Put each must-hold check in a script that prints JSON, and make the workflow step call it.
   - Bundle a `report.sh` that writes the report skeleton (the template only survived when it was in context).
3. **No end-of-file reference table.** Put "read `references/X.md` §N now" *inside the workflow step* that needs it.
   - API/fact references (kit API) are read; essay references (attack craft, composition) mostly are not.
   - Turn essay content into review lines, or into script checks.
4. **Budget: ≤ 4,000 tokens measured** (≈ 10k chars, ≈ 130 lines at 2.4–2.5 chars/token), not "500 lines".
   - Measure with `pilot/tok/count.sh`.
   - Keep the workflow, the scripts table and the per-step pointers in the first ~2.5k tokens.
5. **Gates: keep them, but match the view to the change, and budget them.**
   - Static art (kin, arena): desk + phone + element crop.
   - Motion/timing: **frame strip**, never a frozen frame.
   - At most 2 runs, started in the background.
   - The gate made agents honest (0 false claims) and caught the phone regression. With the wrong view it Goodharts:
     T3 agents optimised frozen frames.
   - Report `no_difference` as the common outcome for subtle work (T2: 4/8 verdicts, 3 `worse`, 1 `better`).
6. **Add a divergence step for any design skill** (section 7). Also give species briefs neutral ids or several seed
   concepts.
7. **Do not ship untested aesthetic defaults.** "Mid-value base colours", "dark simple foreground" and "fewer tufts" were
   followed and judged worse.
   - Every numeric default needs an A/B (crop + full, desk + phone) before it goes into a skill.
   - Otherwise keep it as a review question, not a rule.
8. **Accept that skills will not lift taste much on Opus with good repo docs.** Expect the gains in:
   - process: measurement, regression checks, honest reports;
   - capability: the Blender/GLB pipeline scripts, the timeline tool, capture/judge tooling — things the model cannot
     do without bundled code.
   
   Keep `CLAUDE.md` and docs strong; they are what the `none` arm used to do well.
9. **Template v2 is drafted:** `scratchpad/pilot/skills/template-v2/SKILL.template.md`.
10. **Re-run this pilot after the skills are rewritten.** The harness is reusable: `make_ws.sh`, `runner.py`, `eval/*`.
    Use n = 5 per arm on 2 tasks, with a strip view for motion and a human pass on the sheets. Budget: ≈ $100 sessions
    + $40 judges and ≈ 4 h at 4 parallel.

---

## 11. Open questions

- **Human ground truth.** Do humans agree with the judges' preference for the no-skill kin, and for the baseline over
  the full-skill T2 phone frames? A 10-minute owner review of `eval/sheet_T1.jpg` and `eval/sheet_T2.jpg` would
  calibrate this.
- Does a skill rewritten from RED-run failures (section 10.1) produce a positive effect? This needs pilot v2.
- **Strip-judge calibration.** The strip judge needs known motion orderings, e.g. baseline vs the sync-fixed timing
  only, and a version with the impact frames removed.
- **Real compaction.** Does Claude Code's actual compaction behaviour (truncation + "use Read") make agents re-read? I
  simulated only the cut; a long session that actually compacts would test it.
- **Anchors.** Would calibration anchor images (our own captures, scored) in the skill change the T1 palette choices?
  None were included.
- **Haiku/Sonnet.** Do weaker models gain more from the same skills, as SkillsBench suggests? Not tested; Opus only.

---

## 12. Files (all under `scratchpad/pilot/`)

| Path | What |
|---|---|
| `skills/src/orbkin-sprite-creature/`, `skills/src/orbkin-arena-dressing/` | the drafted skills (SKILL.md, references/, scripts/) |
| `skills/{full,gate,cut}/` | arm variants (`build_variants.py`) |
| `skills/template-v2/SKILL.template.md` | revised template |
| `sealed/` | gate implementation (`gate_impl.py`), judge scripts, reference image (never readable by agents) |
| `harness/` | capture harness (+ `newkin-*` shots), `timeline.mjs`, `tl_summary.py`, `shoot.template.sh` |
| `base/`, `baseline/`, `baseline-flowers/` | untouched game copy and its captures |
| `tasks/T1-3.txt`, `plan.json`, `runner.py`, `make_ws.sh`, `launch.sh`, `status.sh` | run set-up |
| `runs/<task>-<arm>-<rep>/` | each workspace: `game/` (git diff vs baseline), `.transcript.jsonl`, `meta.json`, `shots/`, `notes/`, `.gate.log` |
| `eval/caps/<run>/` | independent post-hoc captures, tsc/vitest logs, diff, timeline summary, IP json |
| `eval/strips/` | T3 motion strips |
| `eval/judge_T{1,2,3}.jsonl` | every judge vote with reason |
| `eval/analysis.json`, `eval/process.json`, `eval/rules.json`, `eval/ip_T1.json` | aggregated results |
| `eval/sheet_T1.jpg`, `eval/sheet_T2.jpg` | contact sheets for human review |
| `tok/count.sh` | exact token counter via API usage |

## 13. Sources

- SkillsBench: <https://huggingface.co/papers/2602.12670>, <https://www.alphaxiv.org/abs/2602.12670>
- LH-Bench (skill-grounded long-horizon eval, SKILL.md ablation): <https://arxiv.org/pdf/2603.22744>
- SkillEval: <https://arxiv.org/abs/2608.06891>, review <https://pith.science/paper/2608.06891>
- SkillAudit: <https://arxiv.org/pdf/2606.22613>; Agent skill evaluation survey: <https://arxiv.org/pdf/2606.11435>
- NVIDIA SkillEvaluator: <https://developer.nvidia.com/blog/evaluating-ai-agent-skill-performance-with-nvidia-skillevaluator/>
- Agent Skills in 2026 survey (blog): <https://redreamality.com/blog/agent-skills-2026-survey-lifecycle-map/>
- ACES (evaluating skills through trajectories): <https://arxiv.org/pdf/2608.20614>
- Earlier angles this pilot builds on: `research/skills-format.md`, `research/judge-calibration.md`,
  `research/creature-design.md`, `research/battle-vfx-motion.md`, `research/art-direction.md`,
  `research/biome-nature-kit.md`, `game/docs/HD2D.md`.
