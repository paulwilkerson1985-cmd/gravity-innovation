# Judge & metric calibration — building a verification gate that actually tracks visual quality

Angle: `judge-calibration` (follow-up raised by the completeness review) · 2026-10-14 · Opus 5.5 subagent

**Question.** The skills-format, agent-visual-method and art-direction notes all say that graphics gates must come
from scripts or judges, never from the generator's own say-so. Nobody had checked whether those gates work. This
angle computes the proposed metrics on the reference and on every historical round, runs fresh-context Opus judges
under many protocols against known orderings, reproduces the original "~6/10" judging setup to measure its noise
floor, and turns the results into tested scripts, held-out rules and a ready-to-paste gate section.

**Everything here was measured in this container** unless marked otherwise. About 790 judge calls ran in total
(about $26 at list price; the subscription absorbs it). Run-to-run, position-swap and degradation controls are
included. Confidence labels:
- **high**: measured here with controls and n ≥ 30, or a primary source.
- **medium**: measured with n < 30, or a reputable secondary source.
- **low**: my inference or a starting value.

Scratch layout: all scripts in `scratchpad/jc/scripts/`, results (JSONL with every vote and reason) in
`scratchpad/jc/results/`, metrics in `scratchpad/jc/metrics/`, judge items in `scratchpad/jc/items/`, and a fresh
capture of the current build in `scratchpad/jc/current/` (made with the existing refine harness, 40 shots, 206 s).

---

## 0. TL;DR (the ten things the skills must encode)

1. **The proposed art-direction thresholds fail the reference itself.** The fan-art reference fails 4 of the 6
   proposed gates:
   - notan dominant band 0.44 against a ≥ 0.45 gate;
   - detail CV 0.30 against ≥ 0.45;
   - subject/ground ΔL\* 3.5 against ≥ 15;
   - hue top-2 share 0.94 against < 0.85.
   
   Our current frames already **beat** the reference on most raw metrics (colourfulness, Δb\*, edge energy,
   crispness, focal contrast), yet every judge rates them a tier lower. **Raw image metrics do not measure the
   quality gap.** (high)
2. **Metrics are useful as defect detectors, not quality scores.** Three calibrated rules, on value range,
   squint-value std and high-frequency ratio:
   - catch 100% of flattened and blurred frames;
   - warn on desaturation;
   - raise **0 false alarms on 63 real round-to-round changes** (`artgate_compare.py`).
   
   They cannot see subtle softening or added noise; the judge catches both. (high that these defects are caught,
   n = 15 synthetic. Medium on the false-alarm rate: the thresholds were set from those same 63 changes, so it is
   in-sample and needs re-checking on new rounds.)
3. **None of the metrics tracks judgement reliably.** Across 30 scene × round points scored by the original
   judges, the best Spearman ρ is 0.65 (subject-vs-ring ΔL\*); most are |ρ| < 0.5. That is not significant
   after testing ~40 metrics. Within-scene change scores reach |ρ| ≤ 0.55 (n = 13). (high that no single
   metric is a quality proxy; medium on the specific ρ values)
4. **Blind pairwise Opus judging is very accurate when a real difference exists.** Setup: full-resolution frames,
   both orders, tool-less `claude -p` with images inline.
   - **42/42 (100%)** correct with the reference shown, **43/44 (98%)** without.
   - Pairs used: 15 synthetic degradations (blur, desaturation, value flattening, texel noise, and *subtle*
     bilinear softening) plus 6 known upgrades (default renderer → HD-2D, 5 menu screens r1 → r2).
   - Confidence 4–5 was always right (n = 106). (high)
5. **Absolute 1–10 scoring is coarse and drifts.**
   - Fresh absolute judges use only 4–8 and mostly integers.
   - They gave a value-flattened frame only +0.33 less than the original (3 runs), which is noise.
   - The art-direction **rubric (R1–R14) failed the known orderings**: default renderer vs HD-2D +0.18 out of 10;
     degradations −0.18 to 0.
   - Reproducing the original 3-lens setup gives scores **+0.5 to +0.66 higher** than the original judges did on the
     same images, while keeping the scene ranking (ρ = 0.77–0.91).
   
   Absolute numbers such as "8/10 = parity" are therefore not stable anchors across setups. (high)
6. **Noise floor of the original "~6/10" setup.**
   - The round mean (3 lenses) varies run to run with sd ≈ 0.10–0.29; a single scene's mean varies with sd ≈
     0.2–0.3 (max 0.76).
   - Reproduced on the same images: r1 5.81 → r2 6.55 → current build **6.81 ± 0.20**. The original judges gave
     5.33 → 6.03.
   - Battle scenes alone moved +0.0 (original) or −0.17 (reproduction) from r1 to r2. The r2 gain came from the
     menu screens (3.3 → 6.3–6.8).
   
   (high)
7. **Near-equal pairs are position-driven, so "no difference" must be a verdict.**
   - On real round-to-round pairs Opus picked the *second-shown* image 60–64% of the time.
   - Swap consistency fell to ~81–88%.
   - Two-order voting with a "won in both orders" rule turns order-flipping into an honest `no_difference`.
     `visual_judge.py` does this, and the test pair current-vs-baseline cave came out 4/4 for whichever image was
     shown second. (high)
8. **The three refinement rounds (r1–r3) did not reliably improve the battle scenes.** Pairwise, 6 votes per
   pair, reference shown, baseline vs current:
   - 2 scenes better (coast, stadium);
   - 2 worse (meadow, volcanic);
   - 2 no difference (cave, summit).
   
   The judges' reasons: the pixel-grid and texel work bought crispness, but it cost the earlier build's
   volumetric richness and sprite smoothness. The absolute loop could not see this. **A pairwise gate against
   the last accepted frame would have flagged it in round 1.** (high)
9. **Detail-blindness is real at thumbnail size and absent at native size.**
   - At 640 px wide, accuracy on subtle defects dropped to 67% (noise) and 83% (soft); at 1280 px it was 100%.
   - Opus 5.5 sees up to 2576 px on the long edge natively, so send 1:1 frames and keep each request ≤ 20 images
     (above 20, a stricter per-image size limit applies).
   - Focal crops at 2× nearest measure something *different*: sprite and ground read. They reached a
     different decision from the full frame on 8 of 12 real pairs (3 outright better-vs-worse contradictions).
     Use them as a separate signal, not a tie-breaker.
   
   (high)
10. **The originality check works, and it found real problems.**
    - **Positive controls**: the reference's Charmander and Geodude crops were named at similarity 10/10 in 3 of 3
      runs.
    - **Maelstrode** (Tide stage 3) reads as **Dragonair/Gyarados**: 6–9/10, "distinctive", FAIL in 3 of 3 runs on
      the old battle crop.
    - **The earlier hero sprite** (red cap, red backpack) read as **Red, the FRLG protagonist**: 6/10,
      distinctive. The current hero passes at 3/10.
    - **Dropple** reads as **Dragon Quest's Slime**: 5/10, distinctive, REVIEW.
    - **Flickwing** reads as **Cutiefly**: 5/10, generic.
    
    Judges also name franchise creatures unprompted in their reasons ("clean Dragonair silhouette"), which gives a
    free tripwire. (medium-high)

**Biggest single implication.** Replace "3 judges score 1–10 until ≥ 8" with:
- a **canary-validated pairwise gate against the last accepted frame**;
- a **separate located critique** that the generator may read;
- **sealed reference numbers** that only the verifier sees.

The defect metrics run first because they are free; the IP check runs whenever a creature or character design
changes.

---

## 1. Data, environment and method

### 1.1 What exists (ground truth sources)
| Set | Where | What it is |
|---|---|---|
| Reference | `hd2d/reference.png` (2000×1299, letterboxed; game frame = y 108–1236) | AI-looking fan art, HD-2D cave battle. Quality bar only. |
| Prototype rounds p0→p4 | `hd2d/r0..r4` | p0 = default low-poly renderer, p1a/p1g/p2/p3/p4 = HD-2D cave prototype iterations (UI identical, so the same masks apply) |
| Refine workflow | `refine/baseline`, `r1/before`, `r1/after`, `r2/after`, `r3/w0-final`, `r3/w1-final` | 40 shots each (21 desk + phone), `raw/*.png`, `*.clean.png` (canvas only, no UI), `capture.json` with **per-shot creature/trainer screen boxes** (`stats.layout`) |
| Current build | `jc/current` (captured by me with `refine/harness/run.sh`, HEAD fa40185) | same 40 shots |
| Original judge votes | transcripts of workflow `wf_656e9972-635` (`judge r1 #1–3`, `judge r2 #1–3`) → `jc/orig/*.json` | per-scene 1–10 scores from 3 lenses × 2 rounds, plus their prompts |

How the original "~6/10" came about: the `hd2d-graphics-refine` workflow ran 3 judges per round. The lenses were
"strict pixel-art art director", "AAA HD-2D environment artist" and "skeptical player". Each judge read ~36
side-by-side sheets (`ours | reference`), raw frames and **the code** with tools. It scored every scene 1–10 on
composition, materials, lighting, sprites, UI and overall, and declared parity only if every scene was ≥ 8 with no
dimension < 7. Round averages were 5.3 (r1) and 6.0 (r2). The user paused the workflow during r3, so r3 was never
judged.

### 1.2 How fresh-context judges were run (and why this harness)
This subagent has no Agent tool. The skills-format angle had already used nested `claude -p`, so I used it here
too, in a form that is **blind by construction**:

```bash
env -u CLAUDECODE claude -p --input-format stream-json --output-format stream-json --verbose \
  --model opus --tools "" --no-session-persistence --strict-mcp-config --disable-slash-commands --max-turns 2
# stdin: one user message {"type":"user","message":{"role":"user","content":[text, image(base64), text, image, ..., prompt]}}
```
- `--tools ""` means the judge cannot read files, code, other images or earlier votes; it sees only what is sent.
- Images go inline as base64 PNG at native size. This avoids the Read tool's own resizing, and file names cannot leak
  labels such as "r4-final".
- Each call is a new process with no session persistence: fresh context.
- Cost and latency: ≈ $0.03–0.05 per pairwise call at list price; ≈ 5 s of API time; 10–60 s wall time on this
  4-core box with 6–10 calls running in parallel. A CPU-bound PNG re-encode in the runner was the bottleneck until
  the image blocks were cached.
- Library: `scripts/judgelib.py`. It provides `call()`, `img_block()` and a JSONL cache keyed by protocol, item,
  order and rep, so reruns only pay for missing votes.

Vision limits that matter (Claude docs, [vision guide](https://platform.claude.com/docs/en/build-with-claude/vision), read 2026-10-14):
- Claude 4.7 and later (Opus 5.5 included) use the **high-resolution tier**: long edge up to **2576 px**, at most
  4,784 visual tokens per image. A 1280×720 frame is *not* downscaled.
- More than 20 images in one request triggers a stricter per-image dimension limit. The original judges read
  ~36 sheets per request, so they saw downscaled sheets.
- The docs list accuracy limits for "low-quality, rotated, or very small images under 200 pixels" and only
  approximate spatial localisation.

### 1.3 Experiments
| ID | Protocol | Items | Calls |
|---|---|---|---|
| PW | Pairwise A/B, 4 conditions: `full_ref` (R + A + B at 1280 px), `full_noref`, `small_noref` (640 px), `crop_noref` (2× nearest crop of the creature/trainer union box). Both orders; ambiguous pairs × 3 reps. | 34 pairs: 1 proto (p0 vs p4), 5 screens (r1 vs r2), ref vs current, 15 synthetic (current vs soft/desat/flat/noise/blur × cave/meadow/coast), 6 baseline vs current, 6 r1 vs r2 | 414 |
| AB | Absolute: `free_ref` (R + X, 1–10 per dimension, 3 lenses), `free_noref` (X only), `rubric` (art-direction R1–R14, 0–2 each with located evidence) | 26 items | 181 |
| OR | Original 3-lens protocol reproduced (same text, all sheets inline, no tools) | r2/after × 2 reps, r1/after, current | 12 |
| IP | Originality check, 3 runs each | 7 lineups, 8 in-game battle crops, 2 positive controls | 51 |
| MD | `full_ref` with Sonnet and Haiku (cheaper judges) | synthetic + known + r1/r2 pairs | 108 |

Synthetic degradations (`make_items.py`). The ground truth is that the original frame is better.
- `soft`: the 640×360 internal frame upscaled **bilinear** instead of nearest. This is the subtle one.
- `desat`: colour enhance 0.55.
- `flat`: values pulled 40% toward the mean.
- `noise`: ±22 luminance noise at texel scale.
- `blur`: Gaussian blur, radius 2.2.

---

## 2. The metric script (`artgate.py`)

`python3 -I artgate.py IMG [--focal box]… [--mask box]… [--crop box] [--clean UI-free.png] [--layout capture.json:ID] [--out prefix] [--gate gates.json] [--ref ref.json]`

How it works:
- Dependencies: numpy and Pillow only; run it with `python -I`.
- Every image is box-resampled to 640 px wide, which is Orbkin's internal HD-2D width. A 2000-px reference and a
  1280-px capture are then measured at the same scale.
- It prints one JSON line per image. Exit codes: 0 ok, 1 hard gate failed, 2 bad input.
- `--layout` reads creature boxes straight from the refine harness `capture.json`.
- `--clean` masks UI pixels by diffing against the canvas-only frame, and reports UI coverage and UI chroma.

Standard battle mask (fractions of a 16:9 frame, used for every comparison here, the reference included). It
excludes the HUDs, the bottom dialog or move panel and the reference's watermark:
`--mask 0,0,0.28,0.13 --mask 0.67,0.6,1,1 --mask 0,0.83,1,1 --mask 0.86,0,1,0.07`.

| Metric | Definition |
|---|---|
| `notan_dark_mid_light`, `notan_dominant/minor` | L\* bands < 33 / 33–66 / ≥ 66 |
| `squint_notan`, `squint_value_std` | the same after a Gaussian blur of 1.5% of the width (the "squint" masses); std of blurred L\* |
| `value_range_p5_p95` | L\* p95 − p5 |
| `colorfulness_hasler`, `chroma_mean_p95`, `hue_top2_share`, `hue_entropy_bits` | Hasler–Süsstrunk colourfulness; CIELAB chroma; share of chromatic pixels in the top two 30° hue bins |
| `bstar_shadow_light_rel`, `delta_bstar_rel` | mean b\* of the darkest 20% vs the brightest 20% of pixels (relative bands; the fixed L\* < 30 / > 70 bands are also reported) |
| `edge_energy_mean`, `detail_cv` | mean \|∇L\*\| and its coefficient of variation over a 6×8 tile grid |
| `hf_ratio` | mean \|L − blur₁ₚₓ(L)\| / mean \|∇L\| (crispness) |
| `palette_lab_w`, `palette_mean_dE`, `palette_L_span` | 8-cluster Lab k-means; mean ΔE between clusters with ≥ 3% weight; L\* span of those clusters |
| `focal_Lstd/edge/chroma_ratio`, `focal_contrast_gmean`, `focal_dL_vs_ring`, `focal_saliency_ratio` | creature boxes vs a ring (each box grown by 60%) |
| `color_entropy_bits`, `near_black_share` | compatible with the skills-format `check.py` |

Note on the earlier `check.py` reference numbers: its "near-black 0.160" for the reference was **the
letterbox bars**. Crop to the game frame (y 108–1236) before measuring.

### 2.1 Reference numbers (playfield, standard mask, kin boxes as focal)
| Metric | Reference | Current build (median of 15 battle desk shots) | Proposed gate (art-direction §5) | Reference passes? |
|---|---|---|---|---|
| notan dark/mid/light | 0.37 / **0.44** / 0.19 | dominant 0.45 | dominant 45–65%, accent 8–20% | **no** (0.44) |
| squint value std | 19.3 | 19.2 | – | – |
| value range p5–p95 | 80.3 | 84.1 | – | – |
| colourfulness (Hasler) | 46.7 | 56.4 | – | – |
| hue top-2 share | **0.94** | 0.75 | < 0.85 | **no** |
| Δb\* lights − shadows | 19.6 (shadows +8.5, lights +28.1) | 23.8 | ≥ 15 and shadow b\* ≤ 10 | yes |
| detail CV | **0.30** | 0.35 | ≥ 0.45 | **no** |
| edge energy | 7.8 | 10.4 | – | – |
| hf_ratio | 0.34 | 0.44 | – | – |
| palette mean ΔE / L span | 37.4 / 77 | 43.5 / 78 | 6–12 colours | – |
| focal L-std / edge / chroma ratio | 0.98 / 1.60 / 1.22 (gmean 1.24) | gmean 1.36 | ≥ 1.3 in one, ≥ 1.15 in two | yes (edge and chroma) |
| subject ΔL\* vs ring | **+3.5** | −10.9 | ≥ 15 | **no** |
| saliency ratio on kin | 1.02 | – | – | spectral residual misses the kin, as art-direction noted |

So the reference is itself a nearly monochrome warm frame: 94% of its chromatic pixels fall in two adjacent orange
bins. It has an even three-way value split, near-uniform detail, and creatures at the same value as the floor.
What makes it read well (focal edge ratio 1.6, a lit floor pool, shafts that land beside the subjects) is
**local** contrast and composition. Global histograms do not capture that.

---

## 3. Do the metrics move with known improvements?

### 3.1 Prototype p0 (default renderer) → p4 (final HD-2D), cave, same UI
| Metric | REF | p0 | p1a | p1g | p2 | p3 | p4 |
|---|---|---|---|---|---|---|---|
| notan dominant | 0.44 | 0.78 | 0.54 | 0.43 | 0.44 | 0.46 | 0.46 |
| value range | 80.3 | 46.9 | 67.1 | 75.6 | 72.7 | 74.4 | 74.1 |
| squint value std | 19.3 | 10.3 | 21.4 | 21.2 | 20.2 | 20.8 | 20.7 |
| edge energy | 7.8 | 1.3 | 3.8 | 5.0 | 6.0 | 6.3 | 6.3 |
| palette L span | 77.1 | 47.6 | 64.3 | 75.8 | 79.2 | 79.5 | 79.4 |
| colour entropy | 6.81 | 4.88 | 6.49 | 6.99 | 6.89 | 6.87 | 6.87 |
| detail CV | 0.30 | 0.92 | 0.41 | 0.41 | 0.37 | 0.36 | 0.36 |
| hf_ratio | 0.34 | **0.55** | 0.36 | 0.35 | 0.36 | 0.35 | 0.35 |

- Monotone **only across the big style change** (p0 → p1). From p1g to p4 the metrics are flat (Δ < 0.5), although
  the developer iterated deliberately through p2, p3 and p4.
- Some metrics point the *wrong* way at the big step.
  - `hf_ratio` is highest for the flat-shaded default renderer, because its sharp polygon edges carry little
    gradient.
  - `detail_cv` is highest for p0, because its empty background tiles make the CV large.
- **(high)** Global metrics detect "different style or regime", not "better within a style".

### 3.2 Refine rounds (21 desk shots × baseline / r1 / r2 / current)
- Cave desk from baseline to current: focal edge ratio 1.97 → 3.09, focal gmean 1.34 → 1.59, Δb\* 16.9 → 30.0.
  Every focal and temperature metric went "up". Yet pairwise judges call cave current vs baseline *no difference*
  (with the reference shown) or *worse* (without it); see §5.4.
- Medians over the battle desk shots (baseline → r1 → r2 → current):
  - value range 70 → 79 → 83 → 84;
  - Δb\* 18 → 19 → 27 → 24;
  - focal ΔL\* +0.5 → −4.3 → −7.4 → −10.9, moving *away* from the reference's +3.5.
  
  Rounds pushed contrast and temperature metrics up, past the reference. Judges did not reward that.

### 3.3 Correlation with judges
Metrics against the original judges' per-scene means (r1 and r2 pooled; 15 battle scenes per round, n = 26–30):
- `focal_dL_vs_ring` ρ = +0.65 (brighter subject than its surroundings → higher score);
- `focal_Lstd_ratio` ρ = −0.63;
- `chromatic_share` ρ = +0.58;
- everything else |ρ| < 0.55.

Within-scene changes r1 → r2: max |ρ| = 0.55 (n = 13), on Δ`focal_Lstd_ratio`, again with a negative sign.

Against my fresh absolute scores (23 real frames): best |ρ| = 0.55 (rubric vs focal edge ratio, negative sign).
- `hue_top2_share` is negative in all three protocols (−0.37 to −0.48): a more varied palette scored slightly
  higher.
- `focal_dL_vs_ring` is positive in all four judge sets (+0.24 to +0.37 here, +0.65 against the original
  judges): creatures that are lighter than their surroundings score higher.

These two are the only directionally consistent signals. They are **weak (medium-low)** and should only inform
critique, never gate.

Multiple-comparison note: with ~40 metrics and n ≈ 26, |ρ| > 0.6 would be needed for nominal significance after
Bonferroni correction. Only `focal_dL_vs_ring` reaches it, and only against one judge set.

### 3.4 Sensitivity to controlled degradations
Metric change caused by each degradation (mean over cave, meadow and coast), next to the worst real round-to-round
change across 63 real transitions:

| Metric | soft | desat | flat | noise | blur | Real changes (p5 / min) |
|---|---|---|---|---|---|---|
| value_range | −2.4 | −0.5 | **−33.7** | +1.7 | −5.1 | −1.8 / −2.5 |
| squint_value_std | 0.0 | 0.0 | **−7.8** | −0.2 | 0.0 | −2.1 / −3.7 |
| colorfulness | −1.9 | **−29.5** | **−26.2** | −0.3 | −4.3 | −15.8 / −36.8 (a screen redesign) |
| hf_ratio | −0.05 | 0 | 0 | −0.09 | **−0.19** | −0.08 / −0.10 |
| edge_energy | −2.6 | −0.1 | −4.4 | **+7.5** | −6.0 | −3.4 / −4.8 |
| detail_cv | 0 | 0 | 0 | −0.16 | 0 | −0.35 / −1.04 |
| focal_edge_ratio | +0.15 | 0 | 0 | **−0.89** | 0 | −0.25 / −0.34 |
| notan_dominant | 0 | 0 | +0.09 | 0 | 0 | — |

What this shows:
- **Goodhart demonstration.** Adding noise *raises* edge energy by +7.5. A "more detail" gate (edge energy ≥ X)
  would therefore be passed by making the frame worse. The judge rejected noise in 100% of full-frame votes.
- `notan_dominant` barely reacts to anything. It measures scene content, not quality.
- Subtle softening is invisible to every metric (≤ the noise of real changes). The judge caught it 100% at full
  resolution.

### 3.5 Calibrated defect gate (`artgate_compare.py`, tested)
| Rule | Kind | Real frames (min) | Reference | Degradations caught |
|---|---|---|---|---|
| value_range ≥ 55 | FAIL | 61.3 | 80.4 | flat (46.2), default renderer p0 (46.9) |
| squint_value_std ≥ 12 | FAIL | 13.5 | 19.3 | flat (10.6), p0 (10.3) |
| hf_ratio ≥ 0.30 | FAIL | 0.35 | 0.34 | blur (0.23) |
| value_range drop > 10 vs baseline | FAIL | worst −2.5 | — | flat −33.7 |
| squint std drop > 5 | FAIL | worst −3.7 | — | flat −7.8 |
| hf_ratio drop > 0.12 | FAIL | worst −0.10 | — | blur −0.19 |
| colourfulness drop > 20 | WARN | p5 −15.8 (one −36.8) | — | desat −29.5, flat −26.2 |

Test results:
- flat: FAIL in 3/3;
- blur: FAIL in 3/3;
- desat: WARN in 3/3;
- soft and noise: pass in 3/3 (left to the judge);
- 12 real comparisons (current vs baseline and r2 vs baseline, 6 scenes): pass in 12/12.

I dropped an "edge energy up and detail CV down" noise rule: it fired on 8 of 63 real transitions.

---

## 4. Reproducing the original "~6/10" judge (noise floor)

`run_orig.py` sends the same COMMON text, the same lens sentences, the same parity rule and the same sheet order
(reference, `_overview`, every `*-vs-ref` and phone sheet, `_phones`), all inline. Deviations: no tools, so no code
browsing and no extra raw frames, and the images are capped at 2000 px.

| Run set | Runs | Mean over all scenes, per run | Mean (sd) | Battle scenes | Menu screens | Per-scene sd across runs (median / max) |
|---|---|---|---|---|---|---|
| Original r1 (3 lenses) | 3 | 5.62, 5.05, 5.30 | **5.33 (0.29)** | 5.99 | 3.33 | 0.29 / 0.76 |
| Original r2 | 3 | 6.11, 5.95, 6.02 | **6.03 (0.08)** | 5.95 | 6.27 | 0.20 / 0.63 |
| Reproduced r1 | 3 | 5.65, 5.85, 5.92 | 5.81 (0.14) | 6.64 | 3.30 | 0.29 / 0.58 |
| Reproduced r2 | 6 | 6.50, 6.60, 6.41, 6.60, 6.70, 6.48 | 6.55 (0.10) | 6.47 | 6.77 | 0.21 / 0.45 |
| Reproduced **current build** | 3 | 6.75, 6.65, 7.04 | **6.81 (0.20)** | 6.78 | 6.90 | 0.29 / 0.58 |

Comparison with the original judges, battle scenes:
- **Rank agreement:** ρ = 0.77 (r2) and 0.91 (r1).
- **Level:** offset +0.53 (r2) and +0.66 (r1).
- **Split-half reliability** (3 runs vs 3 runs, r2): Pearson 0.92 over battle scenes. The scene means span 5.3–7.0.

Interpretation (high):
- The protocol is **reliable in ranking scenes** and **noisy in level**. The level depends on setup details: tool
  access, sheet downscaling, perhaps reading the code. Comparing absolute numbers across setups or sessions, such
  as "we were 6.0, now 6.8", needs ≥ 0.5 of headroom just to exceed the setup drift.
- Within one setup, the round mean has an SE of ≈ 0.06–0.17. A single scene's 3-run mean has an SE of ≈ 0.15.
  Differences < 0.5 for one scene are noise.
- **The parity bar of "every scene ≥ 8" is far outside the measured spread** (current build max 7.5 per scene). The
  loop could not have converged. It needs a relative criterion instead.
- Top gaps on the current build (items 1–4 appeared in at least 2 of 3 runs, so they are worth fixing first):
  1. Sprites: "thick uniform black outlines, flat 2–3 tone shading, no scene lighting; stickers on a lit diorama".
  2. Phone portrait: "lower 40–55% is empty magnified floor; non-integer 271→393 px upscale".
  3. Floors lack the reference's scattered rubble and props.
  4. Stadium and victory: crowd is a grid of identical billboards, no hero light.
  5. Volcanic: Vulcrag "a dark blob".

---

## 5. Fresh-judge protocol comparison

### 5.1 Pairwise accuracy on known orderings (each order counted)
| Condition | Synthetic (15 pairs) | Proto + screens (6) | All known | Notes |
|---|---|---|---|---|
| `full_ref` (R + A + B, 1280 px) | 30/30 | 12/12 | **42/42 = 1.00** (Wilson 95% CI 0.92–1.00) | best |
| `full_noref` | 30/30 | 12/12 | 43/44 = 0.98 | one miss: reference vs current (see §5.5) |
| `crop_noref` (2× nearest, kin + trainer box) | 30/30 | n/a | 31/32 = 0.97 | measures sprite/ground read |
| `small_noref` (640 px) | **27/30** (noise 4/6, soft 5/6) | 12/12 | 41/44 = 0.93 | detail-blind at thumbnail size |

Calibration of the judge's own confidence (known pairs, all conditions):

| Confidence | Accuracy |
|---|---|
| 1 | 0.50 (n = 2) |
| 2 | 0.80 (n = 10) |
| 3 | 0.90 (n = 50) |
| 4–5 | **1.00** (n = 106) |

### 5.2 Position bias and consistency
| Condition | First-shown picked, all pairs | Same, ambiguous real pairs | Swap-consistent | Identical across reps (same order) |
|---|---|---|---|---|
| `full_ref` | 0.41 | **0.36** (prefers the 2nd shown) | 0.82 | 0.88 |
| `full_noref` | 0.44 | 0.40 | 0.81 | 0.73 |
| `crop_noref` | 0.53 | 0.53 | 0.83 | 0.73 |
| `small_noref` | 0.49 | — | 0.86 | — |

On clear pairs, position does not matter (first-pick 0.48–0.50). On near-equal pairs Opus leans toward the
**second** image, and its reasons are then fluent rationalisations either way. Example, `visual_judge` test 2,
current vs baseline cave: 4/4 full-frame votes and 4/4 crop votes went to whichever image was B. MT-Bench found the
same direction of effect for text judges: GPT-4 was swap-consistent 65% of the time, Claude-v1 24%
([Zheng et al. 2023](https://arxiv.org/pdf/2306.05685)). MM-JudgeBias reports the same for multimodal judges
([arXiv 2604.18164](https://arxiv.org/html/2604.18164v3), secondary). **(high)**

### 5.3 Absolute protocols (26 items)
| Protocol | Run-to-run sd (median / max) | Scale used | p4 > p0 | r2 > r1 title | current > soft | > blur | > flat |
|---|---|---|---|---|---|---|---|
| `free_ref` (3 lenses) | 0.58 / 4.0\* | 1–8, mostly integers | +2.33 | +2.00 | +0.67 | +1.67 | **+0.33** |
| `free_noref` | 0.00 / 0.71 | 4–7 | +1.50 | +2.00 | **0.00** | +1.00 | +0.50 |
| `rubric` (R1–R14 × 0–2) | 0.25 / 0.76 | 3.6–10 | **+0.18** | +2.14 | **0.00** | +1.07 | **−0.18** |

\* The reference used as a candidate in `free_ref` scored 1, 8 and 1. The prompt's "copying R's content earns
nothing" made the judge mark it as a copy: a prompt confound, not noise.

- Protocol agreement over the 26 items: free_ref vs free_noref ρ = 0.62; rubric vs either ≈ 0.34–0.38.
- Battle-scene means over 6 scenes (free_ref): baseline **6.83** > current 6.36 ≈ r2 6.28. This matches the
  pairwise finding that baseline ≥ current for several scenes.

Conclusions (high):
- (a) Absolute scores need ≥ 1 point of margin to separate even blatant degradations, while pairwise separated them
  perfectly.
- (b) The art-direction rubric **fails as a decision instrument**. It could not tell the default low-poly renderer
  from HD-2D (+0.18/10). Its located evidence is still useful critique text.
- (c) A free "1–10 against the reference" is a usable coarse monitor at 3 lenses, but never a gate.

These match the literature: single-image scores agree poorly with the same experts' direct comparisons
(Visual Aesthetic Benchmark, [ICML 2026 paper page](https://icml.cc/virtual/2026/68543), abstract via search);
pairwise beats pointwise for VLM judges (GenArena [arXiv 2602.06013](https://arxiv.org/pdf/2602.06013); MLLM-as-a-Judge,
[Chen et al. 2024](https://arxiv.org/pdf/2402.04788): pairwise is the strongest mode, with GPT-4V agreeing with humans
0.773 without ties); LLM judges show low intra-rater reliability on scores ("Rating Roulette",
[Findings of EMNLP 2025](https://aclanthology.org/2025.findings-emnlp.1361/)). (medium-high, papers read via abstracts
and search summaries because arxiv.org is blocked here)

### 5.4 Real round-to-round pairs (6 votes each = 3 reps × 2 orders)
Decision rule: better if candidate win rate ≥ 0.75 and it won in both orders; worse if the mirror holds; otherwise
no difference.

| Pair (candidate = right) | full_ref | full_noref | crop | Original judges' Δ (r1 → r2) |
|---|---|---|---|---|
| baseline → current, cave | no_diff (0.50) | worse (0.17) | worse (0.00) | — |
| baseline → current, meadow | **worse** (0.17) | worse (0.00) | better (0.83) | — |
| baseline → current, volcanic | **worse** (0.00) | worse | worse | — |
| baseline → current, coast | **better** (0.83) | no_diff (0.67) | worse (0.17) | — |
| baseline → current, summit | no_diff (0.50) | no_diff | worse (0.00) | — |
| baseline → current, stadium | **better** (1.00) | better (0.83) | no_diff | — |
| r1 → r2, cave | worse (0.00) | worse | worse | −0.75 ✓ |
| r1 → r2, meadow | no_diff (0.67) | better (0.83) | worse | +0.33 ~ |
| r1 → r2, volcanic | worse (0.00) | worse | worse | −0.58 ✓ |
| r1 → r2, coast | better (1.00) | better | better | +0.42 ✓ |
| r1 → r2, summit | better (1.00) | better | worse | −0.25 ✗ |
| r1 → r2, stadium | better (1.00) | better | no_diff | +0.75 ✓ |

- `full_ref` and `full_noref` never contradict each other (better vs worse) and match in 9/12 pairs.
- Against the original judges' small deltas: the pairwise sign agrees in 4 of 5 decided pairs. The disagreement is
  summit, where the original Δ was −0.25, which is noise level.
- My absolute reproduction disagrees with the original on stadium (−0.4 vs +0.75), whereas pairwise is 6/6 for r2.
  **Pairwise resolves what absolute scoring leaves at noise level.** (high)
- Typical reasons: baseline "richer volumetric lighting, depth, smoother sprites"; current "crisper sprites,
  consistent pixel grid, but flatter and muddier".

### 5.5 Reference vs current cave (blind, reference not labelled)
| Condition | Reference picked | What the votes said |
|---|---|---|
| `full_noref` | 3/6 | position-driven |
| `crop_noref` | 2/6 | the reference was called "soft and upscaled, mixed resolutions, smeared pixels" |
| `small_noref` (640 px) | **6/6** | the reference is clearly preferred at thumbnail size |
| `free_noref` absolute | reference 5.0 vs current cave 6.0 | — |

Interpretation (medium; one reference image, the same one we optimised toward):
- Blind, at native size, Opus does **not** reliably rank the AI-generated reference above the current frame. It
  penalises the reference's non-integer, smeared pixels.
- At the squint or thumbnail scale (composition, value masses, light) the reference wins every time.
- **So the remaining gap is in the large-scale read, not in texel detail.** This agrees with art-direction's thesis
  and with the judges' lighting and sprite-integration complaints. It argues against spending more effort on
  texture resolution.
- It also means the reference is a **weak gate target**: it has technical flaws a pixel-art judge penalises.

### 5.6 Cheaper judge models (Sonnet, Haiku) on the same full_ref pairs (1 rep × 2 orders)
Opus costs are from 414 pairwise calls. Its cached reference-image prefix makes it about as cheap per call as
Sonnet.

| Judge | Known pairs correct | Misses | First-shown picked | Swap-consistent | $/call (list) |
|---|---|---|---|---|---|
| **Opus 5.5** | **42/42** | — | 0.41 | 0.82 | ≈ 0.022 |
| Sonnet | 40/42 | soft 5/6, one screen | 0.46 | 23/27 | ≈ 0.022 |
| Haiku | 38/42 | noise 4/6, flat 5/6, one screen | **0.63** | 20/27 | ≈ 0.0013 |

On the six ambiguous r1 → r2 pairs, Sonnet's two-order verdicts matched Opus's majority where they were
consistent (cave, coast, summit, stadium) and flipped on meadow and volcanic. Haiku flipped on three pairs.

**Use Opus for the gate.** Haiku has a strong first-position bias and misses subtle noise. It is fine only as a
pre-screen for gross regressions, at about 1/17 of the cost. (medium-high; n = 42 known votes per model)

### 5.7 How many votes?
For a gate decision, the risk is accepting a change that is not better.

Analytic case, independent votes with an unbiased coin (q = 0.5), rule "≥ 75% and won in both orders":

| Votes per order (calls) | P(accept \| q = 0.5) | P(accept \| q = 0.9) | P(accept \| q = 0.97) |
|---|---|---|---|
| 1 (2) | 0.25 | 0.81 | 0.94 |
| **2 (4)** | **0.06** | 0.66 | 0.89 |
| 3 (6) | 0.11 | 0.89 | 0.99 |
| 5 (10) | 0.06 | 0.93 | 0.997 |

What was observed:
- Real ambiguous pairs are *not* coin flips. They are order-correlated (the second-shown image wins), and the
  both-orders rule turns them into `no_difference` whatever the vote count. That makes the empirical
  false-accept rate lower than the coin model.
- Clear improvements had q ≈ 1.0 (all 106 high-confidence votes correct).

**Default: 2 votes per order (4 calls) + 2 canary calls ≈ $0.15–0.20 and ≈ 1 min.** If the result is
`no_difference` with a rate in 0.6–0.75, add one more vote per order. Beyond 3 per order nothing changes:
correlated errors cap what voting can fix, as "The Coin Flip Judge?" ([arXiv 2606.13685](https://arxiv.org/pdf/2606.13685))
and "All Verdicts are Not Equal" ([arXiv 2610.12083](https://arxiv.org/html/2610.12083)) also argue (search
summaries, medium). That paper's figure of 11 trials refers to recovering a 50-trial majority on hard text
questions. It does not carry over to high-margin visual pairs.

---

## 6. The tested judge (`visual_judge.py`) and prompts

`python3 -I visual_judge.py --candidate NEW.png --baseline OLD.png [--ref REF.png] [--focal x0,y0,x1,y1 …] [--votes 2] [--out v.json]`

How it decides:
1. **Canary first.** It compares baseline vs a degraded baseline (½-res bilinear plus a 1.2 px blur) in both
   orders. If the judge does not prefer the undegraded frame both times, the result is **invalid** (exit 3). This
   catches a misconfigured judge, a broken image path, or a model/route that is too weak.
2. **Full frames.** `votes` × both orders, with the R-anchored prompt.
3. **Focal crops** (if `--focal`). 2× nearest crops of the kin and trainer union box, with a sprite-read prompt.
   If the full frame says "better" but the crop says "worse", the result becomes `no_difference`: the frame got
   nicer but the subjects got worse, so a human looks.
4. **Decision.** `better` (exit 0), `worse` or `no_difference` (exit 1), `invalid` (exit 3). The JSON lists every
   vote's reason, which feeds the critique.

Tests run:
- current vs flattened cave → **better**: canary passed, full 4/4, crop 4/4, $0.15, 56 s.
- current vs baseline cave → **no_difference** (exit 1): every vote went to image B.

Prompt (full frame, reference shown), as tested. Byte-identical copies live in `run_pairwise.py` and
`visual_judge.py`:
```text
Image R (reference): <img>   Image A: <img>   Image B: <img>
You are an experienced game art director. Image R is a reference frame that sets the quality bar (an HD-2D
pixel-art creature-battle scene). Images A and B are two candidate frames from a different game with original
characters; their content differs from R and copying R's content earns nothing. Decide which candidate is closer
to R's QUALITY TIER as a professional game screenshot: material richness, lighting, sprite quality, composition,
UI integration and crispness. You must pick one, even if they are close.
Reply with only JSON: {"winner": "A" or "B", "confidence": 1-5, "reason": "<= 25 words"}
```
Prompt design notes from the runs:
- Forced choice plus a both-orders rule beats allowing "tie". When ties are allowed, MLLM judges' human agreement
  drops (0.773 → 0.636 in MLLM-as-a-Judge).
- Keep reasons short. The reasons are the critique feed, not the decision.
- Do **not** put "copying the reference earns nothing" into absolute prompts where the reference itself might be
  scored. It caused 1/10 "copy" scores.

---

## 7. Held-out rules (what the generator may see vs only the verifier)

Why rules are needed:
- The generator (Claude writing code or Blender scripts) is the same model family as the judge. Self-preference
  is documented in LLM and multimodal judges ([Panickssery et al., NeurIPS 2024](https://papers.nips.cc/paper_files/paper/2024/hash/7f1f0218e45f5414c79c0679633e47bc-Abstract-Conference.html)).
- Optimising against a proxy degrades the true objective past a point (Goodhart; measured as reward-model
  overoptimisation by [Gao, Schulman & Hilton, ICML 2023](https://proceedings.mlr.press/v202/gao23h.html), which
  keeps a held-out "gold" judge).
- Section 3.4 shows the concrete local version: "more edge energy" is satisfied by noise, and the rounds that
  pushed focal and temperature metrics past the reference were not judged better.

| Information | Generator (author agent, skills it reads) | Verifier only (gate script and its sealed files) | Why |
|---|---|---|---|
| Reference image and a written style brief | ✅ | ✅ | needed to aim; IP check guards against copying |
| Rubric *criteria names* (R1–R14) and the "generated-look tells" list | ✅ | ✅ | aims attention; harmless as a target |
| Defect floors (`artgate_compare.py` rules) | ✅ with numbers | ✅ | floors only; exceeding them gains nothing, so not Goodhartable |
| Budgets (draw calls, ms, texture MB) | ✅ | ✅ | hard engineering constraints |
| **Reference metric vector** (notan shares, palette, Δb\*, focal ratios, hue shares) | ❌ — only "the reference is warm, nearly monochrome, with strong local contrast at the subjects" | ✅ (critique context) | numbers become targets and are gameable (noise → edge energy; global contrast ≠ quality) |
| **Judge prompts, canary recipe, anchor pairs** | ❌ | ✅ | prevents writing toward the judge's vocabulary (judges reward phrases like "volumetric lighting") |
| **Gate verdict scores and win rates** | only better / worse / no_difference | ✅ | numeric feedback invites hill-climbing on judge noise |
| **Critique** (located gaps from a *different* critic call) | ✅ | — | this is the generator's improvement signal |
| Held-out anchor set (synthetic degradations, known upgrades, 1–2 sealed extra reference frames) | ❌ | ✅, re-validated each session | detects judge drift; a canary failure invalidates the run |
| IP check prompt and franchise list | the rule only ("no design may read as an existing franchise character") | ✅ | prevents "differentiate just enough to pass" tuning |

How to enforce the split in Claude Code (low-medium; workflow design, not a tested security boundary):
- Keep verifier assets in `game/tools/verify/sealed/` (prompts, canary and anchor PNGs, reference metric JSON).
  The orchestrator, a workflow script or a hook, calls `visual_judge.py` and `artgate_compare.py`. The generator
  agent's prompt never includes those files.
- For generator sessions, add a deny rule: `Read(game/tools/verify/sealed/**)`. Keep the repo's existing deny rules
  intact, and change `.claude/settings.json` only with the owner's approval.
- The critic and the gate are **different calls with different prompts**. The generator sees critic text, never
  gate internals.
- Rotate lenses and crops, and re-run the anchor set when the model version changes.

---

## 8. Originality / IP check

Why: the reference is fan art of a famous franchise, and the owner said to ignore its IP while matching its style.
The game's banned-names test covers names only, not designs. The Nintendo v. Pocketpair (Palworld) dispute is about
**patents on capture mechanics**, not character designs. That matters for a creature catcher, but it is outside
this angle; reporting via
[Open Class Actions](https://openclassactions.com/news/palworld-nintendo-patent-lawsuit-update-july-2026.php), medium.
For designs, the practical bar is "would fans say *that's X*?". Generic archetypes (fire fox, rock golem, water
droplet) are not protectable on their own; a distinctive combination of silhouette, markings, colours and
signature part is the risk. This is my non-legal synthesis.

Protocol (`run_ip.py` for the study; packaged as the CLI `ip_check.py IMAGE… [--scene] [--runs 3]`): blind and
tool-less, 3 runs per image. The CLI exits 0 PASS, 1 REVIEW, 4 FAIL. Tested: the Geodude control gave FAIL (3/3,
10/10) and the terra lineup PASS (3/3), for $0.08. For each creature *and human character*, the judge
gives:
- the closest franchise character;
- similarity 0–10 (10 = the same character or a recolour, 7 = "most fans would say that's X", 4 = same
  archetype);
- the shared features;
- whether the overlap is generic or distinctive;
- a one-line change that would differentiate it.

Verdict rule: FAIL if any character is ≥ 7 with distinctive overlap; REVIEW at 5–6 or any distinctive overlap.

Results:

| Item | Verdicts (3 runs) | Closest (similarity, overlap) |
|---|---|---|
| **Control:** reference fire lizard crop | FAIL ×3 | Charmander 10, 10, 10 (distinctive) ✅ sensitivity |
| **Control:** reference rock-with-arms crop | FAIL ×3 | Geodude 10, 10, 10 ✅ |
| Lineup flame (Ashkit → Pyrelord) | REVIEW, REVIEW, PASS | Blazehowl 5 (generic), Foxparks 4, Fennekin 4 |
| **Lineup tide** (Dropple, Rillback, Maelstrode) | REVIEW, **FAIL**, REVIEW | **Dragonair 7 / Gyarados+Dragonair 6 (distinctive)** for Maelstrode; **Dragon Quest Slime 5 (distinctive)** for Dropple |
| Lineup flora | REVIEW ×3 | Torterra / Mammorest 5, Skiddo 4–5 (generic) |
| Lineup spark | REVIEW ×3 | Cutiefly 5 (generic) for Flickwing |
| Lineup terra | PASS ×3 | Swinub 4, Gorirat 4 |
| Lineup gale | REVIEW, REVIEW, PASS | Swellow / Articuno 5 (generic) |
| Lineup singles | REVIEW, PASS, REVIEW | Coalossal 4–5, Mantine 5, Lilligant 5 (generic) |
| **Battle crop, baseline volcanic** | **FAIL ×3** | **Dragonair 7–9 (distinctive)**; **hero = Red (FRLG) 6 (distinctive)** |
| Battle crop, baseline cave | REVIEW ×3 | hero "Red/Ash look" 5 (generic) |
| Battle crops, current cave / coast / meadow / summit | PASS ×3 each | ≤ 4, generic |
| Battle crop, current volcanic | REVIEW ×3 | Dratini/Dragonair 5 (generic) |
| Battle crop, current stadium | REVIEW, REVIEW, PASS | one run: player = Red 5 (distinctive) |

What this means:
- **The check discriminates.** Franchise controls score 10; most Orbkin designs land at 3–5 on generic
  archetypes.
- **Real flags.**
  - **Maelstrode**: a blue serpent with white head-fin frills reads as Dragonair. Change the head fins or the
    palette (e.g. a teal-black body with coral frills), or the body plan.
  - **Dropple**: the droplet-with-face shape reads as Dragon Quest's Slime (the curled tip).
  - **Hero sprite**: the red cap with a white front, plus a red pack, was a Red/Ash signature. The current hero
    already avoids it. Keep it that way.
- **A free tripwire.** Gate judges name franchise characters spontaneously in their reasons ("clean Dragonair
  silhouette" in a pairwise reason). The gate should grep the reasons for franchise names and escalate any hit to
  the IP check.

Caveats: (medium)
- The judge's similarity is an LLM opinion, not a legal test.
- It may under-report obscure franchises.
- Run it on lineups (front and back) **and** on in-game crops: the sprite bake can create resemblance that the 3D
  lineup does not (Maelstrode scored 5–6 in the lineup but 7–9 in the battle crop).

---

## 9. Ready-to-paste "Verification gate" section for the skills

```markdown
## Verification gate (mandatory for any change that alters pixels)

Never declare a visual change done on your own judgement. "Done" means the gate scripts below said so.
You may read the critique they print; you may NOT read `tools/verify/sealed/` (prompts, anchors, reference numbers).

1. Capture the SAME shots before and after with the harness (deterministic seeds, same camera, 1280x720 desk +
   phone). Keep the last ACCEPTED capture as the baseline; never compare against your own previous attempt only.
2. Defect floor (free, ~2 s/frame):
   `python3 -I tools/verify/artgate_compare.py after/raw/<id>.png baseline/raw/<id>.png`
   Exit 1 = a FAIL rule fired (values flattened, frame blurred). Fix it before anything else. WARN = look at it.
   These numbers are floors, not targets: do not try to raise them. Exceeding them earns nothing.
3. Pairwise judge vs baseline for every changed battle shot (about $0.15-0.30 and 1 min per shot):
   `python3 -I tools/verify/visual_judge.py --candidate after/raw/<id>.png --baseline baseline/raw/<id>.png \
      --ref tools/verify/sealed/ref.png --focal <mine box> <foe box> --out verdicts/<id>.json`
   - exit 0 `better` -> accepted for this shot.
   - exit 1 `no_difference` -> the judge cannot tell (it flips with display order). Do not claim an improvement.
     Keep the change only if it was meant to be invisible (perf, refactor) or a human approves it.
   - exit 1 `worse` -> revert or rework. Read the vote reasons.
   - exit 3 `invalid` -> the canary failed; the judge run is unusable. Do not retry until it passes; report it.
   A change is ACCEPTED when no shot is `worse`, at least one target shot is `better`, and the defect floor passes.
4. Critique (your improvement signal) comes from a separate critic call (located gaps, 3 biggest deltas vs the
   reference), never from the gate's numbers.
5. Any new or changed creature/character design: run `python3 -I tools/verify/ip_check.py <lineup.png> <battle-crop.png>`
   (3 runs). FAIL (>= 7 + distinctive) blocks; REVIEW goes to the owner. Also stop if any gate reason names a
   franchise character.
6. Report: list each shot with its verdict, cost, and the top 3 critic gaps. Attach the before/after sheet.
   Never write "looks better" without the verdict file.

Rules of thumb from calibration:
- Absolute 1-10 scores drift +/-0.5 between setups and use only 4-8; never gate on them.
- Send frames at native size (<= 2576 px long edge, <= 20 images per request). Thumbnails hide noise and softening.
- Crops measure sprite/ground read; full frames measure the whole look. A disagreement means "human looks".
- If the judge says "better" by order-flipping (won only when shown second), that is `no_difference`.
```

---

## 10. Implications for Orbkin

1. **Stop the absolute parity loop.** "Every scene ≥ 8 from 3 judges" sits about 1–1.5 points above anything the
   setup produced (current build 6.8, max scene 7.5). The level drifts ±0.5 by setup, so the loop cannot
   converge or tell progress from drift. Replace it with the §9 gate: pairwise against the last accepted capture,
   canary-checked, both orders.
2. **Re-baseline before new art work.** Pairwise votes say the pre-refine baseline was better than the current
   build in volcanic and meadow, and equal in cave and summit. Run `visual_judge` per scene on baseline vs current.
   For scenes judged `worse`, recover the baseline's light richness: volumetric shafts on the subjects, smoother
   sprite shading. Keep the crisp pixel grid only where the crop votes favour it.
3. **Aim at the large-scale read.** The reference wins 6/6 at thumbnail size but only half the votes at native
   size. The gap is therefore composition, value masses, lighting and sprite integration (rim and key light on the
   sprites, lighter subjects against their ground, scattered floor rubble), not texel detail. Look first at the
   recurring critic gaps: sprite outlines and lighting, empty phone foregrounds, floor dressing, stadium crowd.
4. **Keep metrics as cheap defect floors** (`artgate_compare.py`) in the capture harness. Never as targets.
   Remove from the skills the art-direction thresholds that the reference fails (notan ≥ 45%, detail CV ≥ 0.45,
   ΔL ≥ 15, hue top-2 < 0.85), or rename them "critique hints".
5. **IP fixes to schedule:** Maelstrode's head fins and palette (Dragonair read) and Dropple's curled tip (Slime
   read). Watch Flickwing (Cutiefly) and the hero's cap.
   - Add `ip_check.py` (from `run_ip.py`) to the creature skill's definition of done.
   - Add a regex tripwire over gate reasons.
6. **Make the toolchain survive the session.** Copy into `game/tools/verify/`:
   - `artgate.py`, `artgate_compare.py`, `visual_judge.py` and `judgelib.py`, which are stdlib + numpy + Pillow and
     use the `claude` CLI already on the owner's machine;
   - the canary recipe;
   - a sealed `ref.png` (private, never shipped). Reference handling in the repo needs the owner's decision, since
     the earlier workflow said never to add it.
   
   Pin Pillow and numpy in a `requirements-verify.txt`. No new npm packages.
7. **Budget.** One full-scene gate pass costs about $3–5 at list price (15 desk battle shots × (canary + 4 full + 4
   crop) ≈ 150 calls, ~15 min with 6 in parallel). Gate only the shots a change touches, and run the full sweep at
   milestones.

---

## 11. Open questions

- **Human ground truth.** All "known orderings" here are synthetic or developer intent plus LLM consensus. Ask the
  owner for 10–15 blind A/B picks (the same pairs as §5.4) to check judge–human agreement. This is the only way to
  validate the claim that "baseline was better".
- **Self-preference.** Does an Opus judge favour Opus-generated scenes over equal-quality human-made pixel art?
  Untested here: there is no equal-quality human-made Orbkin frame. One test would be CC0 pixel-art scenes vs ours
  at a matched subject.
- **A second, non-AI reference.** The fan-art reference has smeared, non-integer pixels that judges penalise. A
  second reference with clean pixels (own-made, or a CC0 HD-2D-like scene) would make a sturdier gate anchor.
- **Motion and FX.** Every protocol here judges stills. Battle VFX and hit feedback need a frame-strip or GIF
  protocol (≤ 20 frames per request), calibrated the same way: canary = a dropped hit-stop or a removed flash.
- Do the defect-floor thresholds hold for phone-portrait captures? All calibration used 16:9 desk frames.

## 12. Files

All under `/tmp/claude-0/-home-user-gravity-innovation/a5440fec-78d9-5c47-821a-56c84521c2ff/scratchpad/jc/`.

Scripts (`scripts/`):

| Script | What it does |
|---|---|
| `artgate.py` | the metrics |
| `artgate_compare.py` | the calibrated defect gate |
| `visual_judge.py` | the pairwise gate with canary |
| `ip_check.py` | the originality gate CLI |
| `judgelib.py` | nested `claude -p` judge plus cache |
| `run_pairwise.py`, `run_absolute.py`, `run_orig.py`, `run_ip.py`, `run_models.py` | the experiments |
| `batch_metrics.py`, `item_metrics.py`, `make_items.py` | build the metric tables and the judge items |
| `analyze_*.py` | the analyses |

Data:

| Path | Contents |
|---|---|
| `results/*.jsonl` | every vote, with reasons, cost and order |
| `results/*_analysis.txt` | the analysis reports |
| `metrics/all.jsonl` | 104 frames × metrics |
| `metrics/items.json` | the judge items' metrics |
| `metrics/ref.json` | the reference's metrics |
| `orig/` | the original judges' prompts and votes, extracted from the transcripts |
| `current/` | a fresh 40-shot capture of HEAD fa40185 |
