# Human ground truth: owner blind A/B protocol, and what seasoned game designers look at

Angle: `human-ground-truth` (follow-up raised by the completeness review) · 2026-10-14 · Opus 5.5 subagent

**Question.** Every gate the planned skills rely on is a fresh-context Opus pairwise judge, and no human has ever
checked it. Three earlier notes call this the decisive open question:
- the 2× sprite-density win may be a VLM "more detail" bias;
- pairwise judging says the pre-refine baseline beat the current build in several arenas;
- the fan-art reference loses to our frames at native size.

The owner's real target is a human (a seasoned game designer). This angle covers:
- how to collect valid human judgements cheaply;
- what professionals look at first;
- where free raters can come from;
- a tested tool, a starter pair set, and a plan for how the skills use the human picks.

**What was done here (all in this container):**
- Read primary methodology code: Mantiuk's `pwcmp`, `gfxdisp/asap`, Microsoft `P.808` / `P.910` crowd toolkits,
  `choix`.
- Ran 30+ web searches. Most article hosts are blocked here, so studio-practice claims rest on search-result
  excerpts and are marked as such.
- Built and tested the rating page, the analysis script, and a deterministic re-capture of the density and kin
  variants.
- Collected fresh blind Opus votes on the exact pair set the owner will rate.
- Found and fixed a capture confound that affects several earlier A/B results.

Confidence labels:
- **high**: measured here with controls, or a primary source / code read here.
- **medium**: reputable secondary source, or measured with small n.
- **low**: my inference or a starting value.

Scratch layout: everything is under `scratchpad/hgt/`.
- `scripts/` holds the tools.
- `kit/` is the distributable rating page; `kit-inline.html` is the single-file version.
- `key.json` is PRIVATE.
- `opus/` holds the votes, `det/` the deterministic captures, `test/` the headless test output.
- `dl/` holds cloned reference repos.

---

## 0. TL;DR

1. **There is now a tested, offline, blind A/B kit for the owner.**
   - `hgt/kit/`, also as `hgt/orbkin-ab-kit.zip` (10.8 MB) and `hgt/kit-inline.html` (one 14.5 MB file).
   - 15 main pairs, 3 gold, 1 identical, 1 probe and 3 swapped repeats: 23 trials.
   - Side and order are randomised per session (the seed is exported). Five answers: A clearly, A slightly,
     No difference, B slightly, B clearly. Optional "what decided it" chips. Flip view on phones, side by side
     on desktop, a 1:1-pixel toggle, undo and resume.
   - An optional 5-second first-impression module for strangers.
   - No network; exports JSON by download or copy.
   - Headless Chromium tests: 49/49 checks pass for both builds, over `file://`, desktop and phone, with zero
     network requests. (high)
2. **Owner cost: about 12–15 minutes for the starter set**: 23 trials at ~20–30 s plus 2 min of setup and export.
   - Add ~5 min to redo the two phone pairs on the actual phone.
   - After that, ~5 min per art milestone for 6–10 new before/after pairs.
   - Asking 3–5 friends adds no owner time, beyond sending a file. (estimate; low–medium)
3. **`agree.py`** (stdlib + numpy) scores the session and compares it with the judge:
   - rater QC: P.808-style easy gold, identical-pair tie check, test-retest on swapped repeats, side bias with an
     exact binomial test, click-through check;
   - plurality verdicts per pair;
   - agreement with Opus: raw, Cohen's kappa, linear-weighted kappa, Gwet's AC1, bootstrap CI, Spearman, and a
     named list of contradictions;
   - per-device Bradley–Terry for the density tunable;
   - plain-language recommendations.
   - The self-test and a simulated session through the real page both pass. The BT fit was cross-checked against
     `choix`. (high)
4. **A capture confound changed the judge's answers on 3 of 4 tested density and kin pairs.** (high)
   - The vertical-slice frames were captured on the wall clock, so the creature's idle pose differed between
     variants.
   - Re-captured with a frozen virtual frame clock (`scripts/detcap.mjs`, pixel-identical on repeat), Opus's
     verdicts moved:
     - **1× vs 2× sprite density on cave desktop: 6/6 for 2× → no_difference** (position-driven);
     - **code-built vs Blender kin: no_difference → code kin 6/6**, both at 1× and at 2×;
     - phone 1× vs 2× stayed 2× 6/6.
   - Worse: Opus chose "1.5×" over "2×" 6/6 with confident reasons ("clearer spike silhouette"). Those two
     settings render **pixel-identical** frames when the clock is frozen, so the verdict was pure pose.
   - Two captures of the same build (probe N2) also get a confident 6/6 preference.
   - **Every A/B capture must use a frozen clock.** Earlier vertical-slice verdicts on kin and density should be
     treated as unconfirmed.
5. **The density "tunable" is quantised.** px per texel = max(1, round(screenH / texelHeight)), so 1.5× and 2×
   are identical on these cameras. The only real step is 1× (2 px per texel, chunky) vs 2× (1 px per texel).
   - Frozen-clock Opus: desktop cave no_difference, meadow 2× 5/6, volcanic 2× 5/6, phone 2× 6/6.
   - Changing density also changes the baked facing of the trainer sprite, which is a second confound to fix
     before deciding.
   - Octopath's developers say "too finely detailed lost what makes the pixel art great". So this tunable is
     exactly where a human must decide, and the kit measures it **per device**. (high on the quantisation; medium
     on the rest)
6. **Opus verdicts on the starter set (blind, no reference, both orders × 3):**

   | Pair | Verdict |
   |---|---|
   | Baseline vs current, cave / meadow / volcanic | baseline |
   | Baseline vs current, coast / summit | no_difference |
   | Baseline vs current, stadium | current |
   | UI slab2 re-skin vs current | slab2, desktop 6/6, phone 5/6 |
   | Live bake vs offline Blender sprite | live, 4/6 in both orders |
   | Gold pairs | 100% correct |
   | Identical pair | correctly a coin flip |

   - The UI angle's own runs flip the meadow-phone UI verdict to "current" 6/6 when the fan-art reference is
     shown; cave desktop stays slab2 5/1. So the UI verdict depends on the protocol.
   - These are the predictions the owner's picks will confirm or refute. (high as judge data, unknown as truth)
7. **Sample size.**
   - One owner session (15 main pairs) separates a useless judge from a good one, but kappa's 95% CI is about
     ±0.3. The actionable output is the **contradiction list**.
   - Grow the anchor set to 30–60 pairs over milestones.
   - Five independent raters per pair are needed before a 1-JOD (75%) preference is called right 90% of the time.
   - Pass bars: test-retest ≥ 2/3; both easy golds must pass.
8. **What a seasoned designer looks at, in order** (synthesis from Valve TF2, Riot clarity and VFX guides,
   Overwatch GDC 2017, Octopath interviews, 5-second-test research; medium–low):
   1. first read / genre within 1 s;
   2. focal hierarchy and value structure;
   3. silhouettes at play size;
   4. gameplay clarity (who, whose turn, what happened);
   5. cohesion (one pixel density, one light, UI that belongs);
   6. light and mood (not too dark: Octopath's #1 demo complaint);
   7. motion feel;
   8. finish and artefacts.
9. **Free raters:** friends with the zip; itch.io devlogs and the Get Feedback board; Discord `#feedback`
   channels; the GameDev.net critique forum.
   - Etiquette: give before you take, ask specific questions, follow channel rules, no link-dropping.
   - Never include the fan-art reference: the kit has none (verified from `key.json`).
   - No paid panels.
10. **Skill integration:**
    - Human picks become **sealed anchor pairs**.
    - The judge gate is trusted per *family* only while it agrees with the anchors: kappa ≥ 0.6 and zero
      contradictions.
    - Contradicted families need an owner pick.
    - Tunables with taste content (sprite density, UI skin, grade) are decided by human Bradley–Terry, per
      device.
    - Opus only guards against regressions afterwards.

---

## 1. Methodology: what the literature and real code say

### 1.1 Pairwise forced choice is the right human method (high)
- **Mantiuk, Tomaszewska & Mantiuk 2012**, "Comparison of four subjective methods for image quality assessment"
  (Computer Graphics Forum 31(8), [diglib](https://diglib.eg.org/handle/10.1111/v31i8pp2478-2491),
  [pdf](https://www.cl.cam.ac.uk/~rkm38/pdfs/mantiuk12cfms.pdf), excerpt via search). It compared single
  stimulus, double stimulus, forced-choice pairwise and similarity judgements. **Forced-choice pairwise comparison
  had the smallest measurement variance**, which makes it the most accurate. It was also the most time-efficient
  when the number of conditions is moderate, which is our case (2–3 conditions per question).
- This matches what judge-calibration found for Opus: pairwise beats absolute 1–10 scoring. It is also why the
  page asks one question per pair, and never for a score.

### 1.2 Scaling and analysis tools with real code (high, code read here)
| Tool | What it does | Licence / form | Use here |
|---|---|---|---|
| [`mantiuk/pwcmp`](https://github.com/mantiuk/pwcmp) | Thurstone Case V scaling to **JOD** units: 1 JOD = 75% of observers prefer one condition. Handles incomplete, unbalanced designs. Gaussian distance prior for low observer counts. Bootstrap CIs. Observer outlier score `dist_L` (inspect if ≥ 1.5). | Matlab, BSD-style | Method reference. Our script implements the Bradley–Terry equivalent in numpy. |
| [`gfxdisp/asap`](https://github.com/gfxdisp/asap) | Active sampling: picks the next pair with maximum expected information gain (ICPR 2020). | Python + Matlab | Worth it only once a ladder has ≥ 5 conditions (e.g. 1×/1.25×/1.5×/1.75×/2× density). Not needed for a 15-pair set. |
| [`microsoft/P.808`](https://github.com/microsoft/P.808), [`microsoft/P.910`](https://github.com/microsoft/P.910) | ITU-T crowd test kits (MIT). Gold clips with known answers. Trapping stimuli ("select answer N"). Randomised question order. **CCR**: a 7-point −3..+3 comparison with the presentation order randomised per item and the sign flipped back. Acceptance rules: `correct_tps_bigger_equal: 1`, `gold_standard_bigger_equal: 1`, variance ≥ 0.1. For an identical-pair gold under CCR, the accepted answers are −1, 0 and +1. | Python/HTML | The page copies the gold, identical-pair, randomisation and signed-scale ideas. |
| [`choix`](https://pypi.org/project/choix/) 0.4.1 (Lucas Maystre; first release 2016, last 2025-08) | Luce / Bradley–Terry MLE (`opt_pairwise`, `ilsr_pairwise`). | MIT, numpy + scipy | Cross-check only. Our MM fit gives the same ordering: choix −0.73/0.29/0.44 vs ours −0.66/0.26/0.39. Ours is slightly shrunk by its ¼-game symmetric prior. Not a runtime dependency. |
| [`crowd-kit`](https://pypi.org/project/crowd-kit/) 1.4.2 (Toloka; Apache-2.0) | Aggregation, including Bradley–Terry and NoisyBT. | pandas, sklearn, nltk, pyarrow | Too heavy for this. Listed for completeness. |

From the pwcmp README and paper (arXiv 1712.03686; abstract via search, README read in full):
- The prior "reduces estimation error when the number of observers is low".
- Use at least 500–1000 bootstrap samples.
- CIs "should not be used to infer statistical significance of the difference"; use the pairwise significance
  test instead.

### 1.3 The "no difference" option (medium-high)
- The Perez-Ortiz & Mantiuk guide (excerpt via search) says that "no-difference" responses bias scaling toward
  smaller distances. Fixing this means modelling ties, and that needs extra data: **responses to two identical
  conditions**. pwcmp does not model ties, so with that software the guide advises against a tie option.
- Tie models exist (Rao–Kupper 1967; Davidson 1970).
- **Decision for Orbkin.** We *need* a "same" class, because the Opus gate's verdict set is
  {better, worse, no_difference}. The page therefore offers a 5-point CCR-style scale: A clearly, A slightly,
  No difference, B slightly, B clearly. It also includes:
  - an **identical-file pair (N1)**, to measure the rater's own tie and false-alarm rate (the guide's recipe);
  - a **recapture probe (N2)**.
- For Bradley–Terry, ties count as half a win to each side. That is the simplest Davidson-like handling, and it
  is documented in the script.

### 1.4 Position and order bias in humans (medium)
- Humans have side biases too. In 2-AFC aesthetic tasks, left-to-right readers prefer the more attractive item on
  the **left**, and reversing the instruction flips the bias
  ([Laterality 2020](https://www.tandfonline.com/doi/full/10.1080/1357650X.2020.1783281);
  [reading-direction study](https://www.sciencedirect.com/science/article/abs/pii/S027826261000182X)).
- Expert judges show *less* directional bias than laypeople
  ([PMC5723409](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC5723409/)).
- Controls in the page:
  - side is randomised per trial (seeded; the seed is exported);
  - order is randomised per session;
  - repeats are swapped to the other side.
- The script reports `left_share` with an exact binomial p.
- Opus's own bias is the mirror image: on near-equal pairs it favoured the **second-shown** image 60–64% of the
  time (judge-calibration §5.2).

### 1.5 Exposure time and first impressions (medium)
- Lindgaard et al. 2006 (Behaviour & IT; via [Nature news](https://www.nature.com/news/2006/060109/full/news060109-13.html)):
  visual-appeal ratings after **50 ms** correlate well with ratings after 500 ms. Aesthetic first impressions
  are near-instant.
- The 5-second test (NN/g, [video](https://www.nngroup.com/videos/5-second-usability-test/)) shows a screen for
  5 s, hides it, then asks what was remembered and understood. It was validated on a game screen (Gronier,
  ResearchGate 316275909, via search). A case study found complex screens need longer
  ([Smashing 2023](https://www.smashingmagazine.com/2023/12/five-second-testing-case-study/)).
- **Decision.**
  - Pairwise trials have **no time limit**, but response time is recorded, and a 0.6 s guard blocks
    double-taps. A median RT under 2 s flags click-through.
  - A separate optional **5-second first-impression module** is for raters who have never seen the game. It
    asks:
    - What kind of game is this?
    - What did you notice first?
    - One or two words for the look.
    - Would you click it in a store (1–5)?

### 1.6 Display mode and target device (medium; one high-confidence engineering choice)
- Flicker or toggle comparison is the standard sensitive method for near-threshold differences.
  - ISO/IEC 29170-2 (JPEG AIC) uses a forced choice in which one side flickers at about 10 Hz between reference
    and test ([boosted triplet paper](https://arxiv.org/pdf/2108.00201), via search).
  - Side by side is closer to "which would I rather look at".
  - The page offers both:
    - **side by side** by default when each image gets ≥ ~600 css px (desktop ≥ 1300 px wide);
    - **flip** (tap or Space toggles A/B in place) on phones.
  - A **1:1 pixels** toggle shows native pixels with `image-rendering: pixelated`. Fit mode downsamples
    smoothly, because nearest-neighbour downscaling would invent aliasing.
  - View mode, flip count and 1:1 use are all recorded per trial.
- **Target device.** The game is played on phones. The phone pairs (P10, P15) should be rated **on the owner's
  phone**; desktop pairs can be rated anywhere. Results are tagged with viewport and devicePixelRatio, so phone
  and desktop votes can be split.
- Images are **lossless WebP** (≈ 0.4 MB per desktop frame). Lossy compression would hit the more detailed
  image harder and bias the comparison. That is the high-confidence engineering choice.

### 1.7 How many pairs, votes and raters? (high: exact binomial and simulation in `scripts/power.py`)
Probability that the majority of n independent votes picks the truly better image, where p is the true
preference rate (1 JOD = 75%):

| n votes | p = 0.60 | 0.64 (½ JOD) | 0.75 (1 JOD) | 0.90 |
|---|---|---|---|---|
| 1 | 0.60 | 0.64 | 0.75 | 0.90 |
| 3 | 0.65 | 0.70 | 0.84 | 0.97 |
| 5 | 0.68 | 0.75 | 0.90 | 0.99 |
| 9 | 0.73 | 0.81 | 0.95 | 1.00 |
| 15 | 0.79 | 0.87 | 0.98 | 1.00 |

Votes needed for a significant (α 0.05, power 0.8) preference against 50%: **8 at p = 0.9, 23 at p = 0.75,
80 at p = 0.64, 158 at p = 0.6.**

Kappa precision with few pairs (3 classes, 300 simulations each):

| pairs | true agreement 0.8 → kappa median, 90% range, bootstrap CI width | agreement 0.9 |
|---|---|---|
| 10 | 0.67, [0.27, 1.00], 0.68 | 0.84, [0.51, 1.00], 0.42 |
| 15 | 0.68, [0.37, 0.90], 0.60 | 0.87, [0.60, 1.00], 0.44 |
| 30 | 0.69, [0.50, 0.85], 0.45 | 0.84, [0.69, 0.95], 0.33 |
| 60 | 0.68, [0.53, 0.79], 0.31 | 0.84, [0.72, 0.94], 0.24 |

What this means:
- One owner session of 15 main pairs can tell a **useless** judge (kappa near 0) from a **good** one (≥ 0.6).
  It cannot pin kappa down; the CI is about ±0.3.
- The most actionable output is the **list of contradictions** (human says A, Opus says B). Those name the
  families where the judge must not decide alone.
- Grow the anchor set to **30–60 pairs** over milestones: each art decision the owner rates becomes a new
  anchor.
- **Majority across raters needs about 5 people per pair** before a 1-JOD preference is called right 90% of the
  time. A single owner vote is right only as often as the preference is strong. The owner is still the client:
  his taste *is* the target. Strangers are needed only to check "would a seasoned designer agree".
- The standard figure of ≥ 15 observers (ITU-R BT.500 / P.910 lab tests, via secondary glossaries) is for
  publishable mean-opinion scores. It is not needed for a go/no-go decision.
- **Test-retest.** With 3 repeated pairs, a rater whose answers are stable 75% of the time agrees 3/3 only 42% of
  the time, and at least 2/3 84% of the time. So **2/3 is the pass bar**, and a hard contradiction on a repeat is
  the warning sign.

### 1.8 Attention, gold and outlier controls (high: P.808 code and pwcmp README)
| Control | In the kit | Rule in `agree.py` |
|---|---|---|
| Easy gold (P.808 "gold clip"): obviously degraded vs original | G1 Gaussian blur r = 2.2; G2 values pulled 40% toward the mean | Reject the rater if either easy gold fails |
| Hard gold (sensitivity probe, not a rejection rule) | G3 bilinear-soft upscale. Opus is 6/6 on it. | Reported. Tells you whether the human sees what Opus sees. |
| Identical pair (P.808 CCR accepts −1/0/+1) | N1: the same file twice under two ids | Warning if "clearly"; reports the tie rate |
| Recapture probe | N2: two wall-clock captures of the same build (the creature's idle pose differs) | Informative: does pose or phase sway the human too? |
| Test-retest | P01, P07, P15 repeated with sides swapped, in the last third, never adjacent | ≥ 2/3 same answer; 0 hard contradictions |
| Click-through | Response time per trial | Reject if median < 2 s |
| Observer outliers (multi-rater) | — | Use pwcmp's `dist_L ≥ 1.5` idea once there are ≥ 8 raters; not implemented for n < 8 |

---

## 2. What professionals look at (studio practice)

Most studio sources are blocked from this container (GDC Vault, gamedeveloper.com, leagueoflegends.com,
steamstatic). The points below come from search-result excerpts of the cited pages. Treat exact wording as
**medium** confidence, and my synthesis of the order as **low–medium**.

### 2.1 Evidence
- **Valve, TF2.** "Illustrative Rendering in Team Fortress 2" (NPAR 2007) and "Stylization with a Purpose"
  (GDC 2008) ([slides](https://cdn.fastly.steamstatic.com/apps/valve/2008/GDC2008_StylizationWithAPurpose_TF2.pdf),
  [course notes](https://www.advances.realtimerendering.com/s2007/Mitchell-IllustrativeRenderingInTF2(Siggraph07%20Course%20Notes).pdf)).
  - Class readability first: "distinct silhouettes that can be easily identified even with no lighting cues".
  - **Value contrast** and simple forms.
  - "Highest contrast at chest level, where weapon is held; gradient from dark feet to light chest".
  - Rim highlights rather than dark outlines.
  - The read order is **silhouette → value → colour/detail**.
- **Riot, League of Legends.**
  - "Clarity in League" and "Ask Riot: Let's Talk Clarity"
    ([1](https://www.leagueoflegends.com/en-us/news/dev/clarity-in-league/),
    [2](https://www.leagueoflegends.com/en-au/news/dev/ask-riot-let-s-talk-clarity/)): the silhouette is "basically
    their shadow". Primary, secondary and tertiary silhouette features; a skin must never remove the primary one.
  - VFX style guide (secondary summaries,
    [VFX Apprentice](https://www.vfxapprentice.com/blog/10-league-of-legends-vfx-design-tips)): primary elements
    get a high value range, strong contrast and a clear silhouette. Secondary elements get a lower value range,
    smaller size and subtle motion. Avoid 0/100 values. Effects are judged on gameplay clarity: the hit area
    must read.
  - VFX updates are play-tested on the PBE with player feedback
    ([Riot dev post](https://www.leagueoflegends.com/en-pl/news/dev/dev-behind-the-scenes-of-vfx-updates/)).
- **Blizzard, Overwatch** (GDC 2017, "The Art of Overwatch",
  [vault](https://www.gdcvault.com/play/1024268/The-Art-of-Overwatch-Evolving);
  [Game Developer summary](https://www.gamedeveloper.com/art/video-defining-and-evolving-the-art-direction-of-i-overwatch-i-)).
  Two review questions per hero: "is the silhouette too similar to an existing character?" and "would abilities
  add too much visual complexity during gameplay?"
- **Square Enix Asano Team, Octopath / HD-2D** (interviews:
  [Siliconera](https://www.siliconera.com/project-octopath-traveler-developers-answer-project-started-troubles-developing-hd-2d/),
  [NintendoEverything](https://nintendoeverything.com/project-octopath-traveler-devs-on-the-games-origins-demo-feedback-and-improvements-more/),
  [Nintendo Life](https://www.nintendolife.com/news/2022/10/octopath-traveler-ii-devs-aimed-to-make-its-hd-2d-visuals-picture-perfect)):
  - early prototypes lacked depth and "were uninteresting";
  - then they "went too far on the resolution and saturation, losing the appeal of pixel art";
  - for OT2: "making the graphics too finely detailed lost what makes the pixel art great"; finding the balance
    "took a lot of trial and error".
  - The demo survey's top complaint was **the screen was too dark** to explore dungeons.
  - **This is the most direct evidence that "more detail" can be the wrong direction for HD-2D.** That is
    exactly the VLM density-bias worry, so the density ladder must be decided by humans.
- **Supergiant / Hades.** Primary sources were not reachable; secondary pages credit a silhouette-first,
  readability-first approach that survives heavy particles. Zee's design cues encode role in shape (the beard as
  the Sigil of the Dead). Low confidence beyond "readability first".
- **Moon Studios / Ori.** Nothing citable on the review process. Mahler argues for hand-keyed expressive
  animation over mo-cap ([GamesRadar](https://www.gamesradar.com/i-think-mo-cap-is-dumb-moon-studios-thomas-mahler-on-the-art-and-science-behind-ori-and-the-will-of-the-wisps/)).
  Low confidence; included only for "motion feel matters".
- **Review mechanics** (blog-grade, medium-low):
  - time-boxed WIP reviews where the reviewer thinks aloud and states the *goal*, not just "make it brighter";
  - paintovers beat written notes for shape problems;
  - stage gates on cheap deliverables
    ([Game Developer "Five Secrets"](https://www.gamedeveloper.com/art/five-secrets-of-game-art-direction);
    GDC 2016 "Maximizing Critique", [vault](https://gdcvault.com/play/1023293/Maximizing-Critique-Improving-Communication-for)).
- **Taste vs clarity.** "Unlike taste, clarity is testable": watch whether players find interactive objects
  ([BugNet](https://bugnet.io/blog/collecting-feedback-on-your-art-and-visual-style)). The Game Crafter sells
  anonymous art tests; mentioned only as the paid pattern we avoid.
- **Store and thumbnail.** Chris Zukowski (howtomarketagame): players make fast visual associations while
  skimming the store, and the capsule must signal the genre. Capsule guides: "shrink to Steam grid size. Does the
  focal point survive?" and "check in grayscale. Squint." (secondary).

### 2.2 What a seasoned designer checks, in order (synthesis; low–medium)
1. **First read, ≤ 1 s.** Can they tell the genre and the subject, and is it appealing? (Lindgaard 50 ms;
   5-second test; Zukowski.)
   - Test: the 5-second module, plus a 160-px thumbnail.
2. **Focal hierarchy and value structure.** Does the eye go to the two creatures first? Do subject and ground sit
   on different value layers? (TF2 value gradient; Riot primary vs secondary value range; squint and greyscale.)
   - Test: greyscale plus squint (blur), and the `artgate.py` notan/ΔL\* numbers as hints only.
3. **Silhouette and character read.** Do creatures, trainer and enemy read with no lighting cues, at play size on
   a phone? (TF2; Riot; Overwatch similarity check.)
   - Test: black-fill silhouettes at sprite size; the IP check (judge-calibration).
4. **Gameplay clarity.** Who is the enemy, whose turn is it, what does each move do, are the HP bars readable?
   (Riot VFX hit areas; Hades; "clarity is testable".)
   - Test: the tap-the-target task (§6, proposed); legibility at phone size.
5. **Cohesion and consistency.** One pixel density per frame, one light direction, UI that belongs to the world,
   no style clashes. (Octopath balance; judge reasons "pasted-on sprites"; ui-hud notes.)
6. **Lighting and mood, colour script per arena.** Not too dark: Octopath's #1 demo complaint.
7. **Motion feel.** Idle life, anticipation, impact (hit-stop, shake), timing. (Riot VFX timing stages; Mahler.)
   Not covered by stills: needs short clips, see §6.
8. **Finish.** Artefacts, shimmering, jaggies, text crispness, loading pops. These are what the synthetic
   degradations and `artgate` catch.

The rating page's optional "what decided it?" chips map onto items 2–5 and 8. Over sessions they show which axis
actually drives the owner's picks.

---

## 3. Free raters and etiquette (medium)
| Source | How to ask | Etiquette (cited where possible) |
|---|---|---|
| **Owner** (primary) | The kit, 12–15 min per set | — |
| **Friends and family** (3–6 people) | Send the zip or single HTML; ask them to tick "never seen this game" for the 5-second module first | Say it takes 10–15 min; nothing is uploaded; names are optional. Do not explain which version is new (that biases them). |
| **itch.io** | A devlog (one topic per project, updated over time; screenshots mandatory for visual projects) and the *Get Feedback* category; recurring "Feedback Friday" threads ([itch](https://itch.io/t/1250514/is-there-a-place-where-we-can-get-feedback-for-our-game-art)) | Devlogs must show progress, not advertise a finished product; no link-dropping; low-effort posts get removed. Give feedback on others' threads first. |
| **Discord servers** (pixel-art and gamedev communities, `#feedback` / `#critique` channels) | Post 2–3 images and ask 1–2 specific questions ("which reads better on a phone?"). Link the kit only if the channel allows links. | Read the channel rules. Ask for C&C explicitly; unsolicited critique is frowned on, so return the favour ([CG Cookie](https://cgcookie.com/posts/can-you-give-valuable-feedback?page=2)). Name the aspect you want feedback on. |
| **GameDev.net Art Critique forum**, Polycount WIP threads, Bulbagarden Spriter's Sanctuary-style boards | WIP thread with before/after | One topic per artist; keep to the forum's medium ([Bulbagarden rules](https://bulbagarden.net/threads/spriters-sanctuarys-rules-and-guidelines.119789/)). |
| **#screenshotsaturday** and similar | Reactions only (likes and comments are weak signals) | Do not treat engagement as a rating. Use it for the "first read" question only. |
| **Game-jam feedback swaps** | Review 2 games, get 2 reviews | Reciprocity is the norm. |

Rules for all external raters:
- **Never include the fan-art reference** or any franchise asset. The kit has none (checked: `key.json` sources
  are all Orbkin frames).
- Collect no personal data beyond an optional name and the role dropdown.
- Data stays with the owner. Raters send back JSON themselves.
- **No paid panels** (Prolific/MTurk/The Game Crafter) under the free-tools rule.

---

## 4. Hands-on: the kit, the analysis script and the starter pair set

### 4.1 Files (all under `scratchpad/hgt/`)
| File | What |
|---|---|
| `scripts/rate.html` | The rating page (template). Self-contained HTML/CSS/JS with no external requests, neutral grey surround, and a `window.__orbkinAB` test hook. |
| `scripts/pairset.py` | Defines the pair set and builds `kit/` (blind: images renamed to random ids, lossless WebP; `pairs.js` holds ids only), `kit-inline.html` (`--inline`) and the PRIVATE `key.json`. |
| `scripts/detcap.mjs` | Deterministic battle capture: a virtual rAF clock at a fixed 100 ms per frame and an absolute target frame, so every variant shares one animation phase. Repeat captures are pixel-identical (verified). Query keys in the extra argument override the base (`arena=meadow&sprtex=2`). |
| `scripts/opus_votes.py` | Blind Opus votes on the same pairs with the judge-calibration `full_noref` prompt (byte-identical), native PNGs, both orders × 3 reps. Cache keyed by both image hashes. Reuses existing votes. Verdict = majority in both orders, else `same`. |
| `scripts/agree.py` | Analysis (stdlib + numpy). `--selftest` included. |
| `scripts/power.py` | The vote-count and kappa-precision tables in §1.7. |
| `scripts/test_page.mjs` | Headless Chromium test over `file://`: 49 checks (desktop and phone, glance module, download, resume, no network). |
| `scripts/sim_owner.mjs` | Drives the real page with a *hypothetical* owner profile, to test the pipeline end to end (not data). |
| `kit/`, `orbkin-ab-kit.zip`, `kit-inline.html` | **Distributable.** Only Orbkin frames: sources are `jc/items` (baseline, current, synthetic degradations), `hgt/det`, `vslice/shots`, `uiq/cap-*`. No reference. |
| `key.json` | **Private.** Pair → conditions and sources. Never ship it. |
| `opus/votes.jsonl`, `opus/votes_verdicts.json` | Frozen-clock Opus votes and verdicts (new spend $1.32 at list price, plus about $1 for the wall-clock run). |
| `opus/votes_v1_wallclock.jsonl`, `opus/verdicts_v1_wallclock.json` | The confounded first run, kept as evidence. |
| `test/folder`, `test/inline` | Test screenshots, a test-bot export, and `test-results.json`. |
| `test/report_sim.json` | Report from the simulated owner (pipeline demo only). |

Commands:
```bash
# build the kit (after editing PAIRS in pairset.py)
python3 -I scripts/pairset.py <OUT> --inline
# opus votes for every pair (cached; only new or changed images cost money)
python3 -I scripts/opus_votes.py <OUT>/opus/votes.jsonl 3
# test the page headless
node scripts/test_page.mjs <OUT>/kit <OUT>/test/folder && node scripts/test_page.mjs <OUT>/kit-inline.html <OUT>/test/inline
# analyse the owner's export(s)
python3 -I scripts/agree.py --key <OUT>/key.json --opus <OUT>/opus/votes_verdicts.json \
   --opus-votes <OUT>/opus/votes.jsonl --out report.json picks-owner.json [picks-friend1.json ...]
# deterministic capture of a variant (vertical-slice build)
node scripts/detcap.mjs <buildDir> <outDir> NAME "arena=meadow&sprtex=2" desk
```

### 4.2 Page design decisions
- **One question**, identical in wording to the Opus prompt: "Which screenshot looks more polished and
  professional as a game?" Human and judge answer the same thing, which makes kappa meaningful.
- **Blindness.**
  - Random image ids.
  - Sides randomised per trial, order per session (Mulberry32 seed exported).
  - No labels in `pairs.js` or the export; a test asserts this.
  - The A/B tag sits *above* the image. The first version overlapped the HUD name.
- **Repeats.** Three pairs (P01, P07, P15) are re-shown with sides swapped, in the last third, never adjacent to
  their first showing.
- **Controls.**
  - G1 (blur) and G2 (value-flatten) are easy golds.
  - G3 (bilinear soft) is a hard gold.
  - N1 is the identical file under two ids.
  - N2 is a wall-clock recapture probe.
- **Phone UX.**
  - Flip view; tap the image or the A/B tabs.
  - 44 px touch targets.
  - Answer buttons: A answers in the left column, B in the right, "No difference" full width.
  - The 0.6 s guard after images load prevents double-tap carry-over.
- **Recorded per trial:** pair, rep, left and right ids, value −2..2, chosen id, strength, RT, view mode(s),
  1:1 used, flips, chips, viewport.
- **Recorded per session:** seed, rater, role, the fresh flag, env (viewport, dpr, touch, UA prefix), glance
  answers, undo count, note.
- **Storage.** localStorage with try/catch (resume works; the page also works without it). Export by Blob
  download, plus copy with an `execCommand` fallback, plus a visible textarea.

### 4.3 The starter set (15 main + 5 controls + 3 repeats = 23 trials)
| ID | Family | x vs y | Device | Opus verdict (votes for x) | Why it is in the set |
|---|---|---|---|---|---|
| P01 | baseline_vs_current | pre-refine baseline vs current, cave | desk | **baseline** (5/6) | "baseline better" claim |
| P02 | 〃 | meadow | desk | **baseline** (6/6) | 〃 |
| P03 | 〃 | volcanic | desk | **baseline** (6/6) | 〃 |
| P04 | 〃 | coast | desk | same (2/6, order-split) | 〃 |
| P05 | 〃 | summit | desk | same (3/6) | 〃 |
| P06 | 〃 | stadium | desk | **current** (1/6) | 〃 |
| P07 | density | sprtex 1 vs 2, cave | desk | same (4/6, order-split) | the "2× density" claim, frozen clock |
| P08 | density | 1 vs 2, meadow | desk | **2×** (1/6) | outdoor replication |
| P09 | density | 1 vs 2, volcanic | desk | **2×** (1/6) | outdoor replication; note that the trainer's facing also changes |
| P10 | density | 1 vs 2, cave | **phone** | **2×** (0/6) | the target device |
| P11 | kin_source | code kin vs Blender SDF GLB, 1× | desk | **code** (6/6) | the creature-source question |
| P12 | kin_source | the same at 2× | desk | **code** (6/6) | 〃 |
| P13 | kin_renderer | live bake vs offline Blender toon sprite | desk | **live** (4/6, both orders) | renderer choice |
| P14 | ui_skin | current HUD vs `slab2` re-skin, cave command | desk | **slab2** (0/6) | UI is the biggest visible tell (ui-hud angle) |
| P15 | ui_skin | the same, meadow | **phone** | **slab2** (1/6); with the reference shown, current 6/6 (UI-angle run) | protocol-dependent: the human decides |
| G1 / G2 | gold | current vs blur / value-flatten | desk | correct (2/2 each) | attention |
| G3 | gold (hard) | current vs bilinear-soft | desk | correct 6/6 (reason: garbled UI glyphs) | human sensitivity vs Opus |
| N1 | null | the same file twice | desk | same (3/6, order-split) | tie and false-alarm rate |
| N2 | probe | two wall-clock captures, same build | desk | **capture A 6/6** ("cleaner face") | phase and pose sensitivity |

### 4.4 Finding: wall-clock captures confounded earlier A/B verdicts (high)
The vertical-slice `capture.mjs` waited on the wall clock (`waitForTimeout(1500)` after idle). The creature's
idle sway and facing were therefore at a different phase in every variant. Here is the same question asked twice
(Opus, full_noref, 6 votes each):

| Question | Wall-clock frames | Frozen-clock frames |
|---|---|---|
| 1× vs 2× density, cave desktop | 2× 6/6 | **no_difference** (picks follow display order) |
| "1× vs 1.5×", cave desktop | 1.5× 6/6 | — (1.5× renders identically to 2×) |
| "1.5× vs 2×", cave desktop | **1.5× 6/6**, "clearer spike silhouette" | the two configs render **pixel-identical** frames |
| 1× vs 2×, phone | 2× 6/6 | 2× 6/6 (robust) |
| code kin vs Blender kin, 1× | no_difference (3/6) | **code 6/6** |
| code kin vs Blender kin, 2× | no_difference (4/6) | **code 6/6** |
| same build captured twice | — | capture A 6/6 (N2) |

Consequences:
- The vertical-slice "2× density won 3–0" and "shape method is not the lever" conclusions need re-checking with
  frozen frames.
- A judge can produce confident, consistent, *wrong-cause* reasons. "Clearer spike silhouette" was a pose
  difference.
- The skills must require **frozen-clock capture**: the refine harness already does this, and `detcap.mjs` does
  it for the vertical-slice build. Any A/B whose frames differ in pixels outside the changed subsystem should be
  flagged.

### 4.5 Finding: density is quantised (high)
- `sprite.ts` picks `px = max(1, round(screenH / texelHeight))` whole internal pixels per texel.
- At the battle camera, sprites at 1× get 2 px per texel. At 1.5× and at 2× they get 1 px per texel, which is
  identical (verified pixel-identical).
- The real choice is **"chunky 2-px texels" vs "native 1-px texels"**. On phones the internal resolution is
  271×586, so the same rule gives different texel sizes per device.
- Decide per device tier. The kit measures desktop (P07–P09) and phone (P10) separately, and `agree.py` reports
  Bradley–Terry per device.
- Density changes also changed the trainer's baked facing in the frames (visible in P09's judge reason, "B stages
  the trainer facing the opponent"). Fix or freeze bake facing before the decision is final.

### 4.6 Validation of the tooling
| Test | Result |
|---|---|
| `test_page.mjs`, folder build | 49/49 checks pass (images decode for all 23 trials; repeats swapped, late and non-adjacent; side randomisation; undo; note; download; new seed → new order; resume after reload; phone flip and tap; glance 5.0 s; 1:1 toggle; **0 network requests**; 0 page errors) |
| `test_page.mjs`, single-file build | 49/49 |
| `agree.py --selftest` | kappa 1.0 on perfect agreement and 0.75 with one flipped pair; the textbook 2×2 example gives 0.40; BT ordering correct; exact binomial correct |
| BT vs `choix` 0.4.1 `opt_pairwise` | Same ordering. Ours is shrunk about 10% by its ¼-game prior (intended: keeps unanimous pairs finite). |
| Test-bot export through `agree.py` | Correctly **rejected** (failed an easy gold; median RT 0.7 s) |
| Simulated owner (hypothetical profile) | Accepted. Reports kappa 0.18 [−0.19, 0.52], names the contradictions (P01, P02, P08), lists "Opus decided / human same" pairs and gives per-device density advice. Demonstrates the outputs; **not** real data. |

---

## 5. How the skills use human picks

### 5.1 The loop
```
art change ──► frozen-clock capture (A = last ACCEPTED, B = candidate)
           ──► artgate defect metrics (free)                       [judge-calibration §2]
           ──► Opus pairwise gate, both orders, canary first        [judge-calibration §5]
           ──► is this family "human-gated"?  ──yes──► add pair to the next owner batch; do not claim an improvement yet
                         │no
                         ▼
               accept / reject on the Opus verdict
owner batch (5–10 pairs, ~5 min) ──► agree.py ──► update anchors + family trust table ──► decisions for tunables
```

### 5.2 Rules to encode in the skills (a ready-to-adapt section)
1. **Human anchors are the ground truth; the judge is a proxy.**
   - Keep `verify/anchors/` with pair images plus the owner verdict and strength.
   - The verifier holds it sealed; the generator never sees it (as with the judge prompt and canary).
2. **Family trust table** (`verify/trust.json`), recomputed by `agree.py` after every owner batch:
   - A family is *judge-trusted* when there are ≥ 5 anchors, Cohen's kappa ≥ 0.6, and **zero contradictions**.
   - Otherwise it is *human-gated*.
   - Starting state: **every family is human-gated** until the starter set is rated.
3. **Tunables with taste content are decided by humans, per device.** Examples: sprite density, UI skin, grade
   strength, outline weight, palette.
   - Use Bradley–Terry over the owner's (and friends') picks.
   - Opus may be used only to check that the chosen setting has not regressed.
   - Record the decision with its evidence in `docs/DECISIONS.md`.
4. **Frozen-clock captures only.**
   - Capture A and B with the same virtual frame clock and the same absolute frame.
   - If the diff outside the changed subsystem is non-zero, the capture is invalid. For example, a sprite-density
     change must not change background pixels.
5. **"No difference" is a legitimate outcome for humans too.** If the owner says `same` and Opus says
   `better`, do not claim an improvement. Count it as noise, and raise the judge bar for that family (more votes
   per order, or confidence ≥ 3 in both orders).
6. **Calibrate the judge, do not tune toward it.**
   - When a family is contradicted, first add a **1:1 focal crop** or a **phone-size view** to the judge's
     inputs.
   - Re-run the anchors.
   - Only if it still contradicts, leave the family human-gated.
   - Never paste the owner's picks into the generator's prompt.
7. **Report human minutes.** Every skill run that queues owner pairs says how many and the estimated minutes:
   ~25 s per pair, plus 2 min of overhead.
8. **External raters** are used at milestones, not per change:
   - one 5-second first-impression round with 3–5 people who have never seen the game, asking "what is this
     game?";
   - one pairwise round on the milestone's key decisions;
   - optionally one "seasoned designer" review using the §2.2 checklist as the agenda (15 min, time-boxed).

### 5.3 What the human picks recalibrate, concretely
| Human result | Skill change |
|---|---|
| Owner agrees with Opus on baseline vs current (baseline better in cave, meadow, volcanic) | Treat the r1–r3 refine work as a regression in those arenas. Recover baseline light richness (judge-calibration §10). The baseline_vs_current family becomes judge-trusted. |
| Owner prefers current where Opus prefers baseline | The judge over-rewards "volumetric richness". Add focal crops; mark lighting-mood changes human-gated. |
| Owner prefers 2× on phone and 1× (chunky) on desktop | Ship a per-device `sprtex` default; keep both in the bake. |
| Owner says `same` on the density pairs | Leave density at 1× (cheapest) and stop spending judge calls on it. |
| Owner prefers slab2 UI | Proceed with the ui-hud re-skin. If not, the no-reference judge is unreliable for UI and UI stays human-gated. |
| Owner prefers code kin (agrees with frozen-clock Opus) | Close the Blender-kin question for the battle sprite size; Blender stays for large cut-ins only. |
| Owner fails G3 (cannot see bilinear softening) | Softening defects are a judge-only check; do not ask humans about them. |
| Owner prefers one capture in N2 | Pose and phase matter to humans too. Add an "idle pose quality" check to creature design (faces visible in the battle camera's idle phase). |

---

## 6. Open questions and next experiments

- **The actual owner picks.** Everything above is a prediction until the owner runs the kit. Expected cost
  ~12–15 min. This is the single most valuable next step.
- **Does a seasoned designer agree with the owner?** Get one or two experienced game artists or designers
  (Discord, friends of friends) through the same kit plus the 5-second module. Their role tag lets
  `agree.py`-style splits compare them later; per-role reporting is a small extension.
- **Re-run the vertical-slice A/Bs with frozen clocks.** Kin source, renderer, density, people density and
  props: the wall-clock captures may have biased those verdicts too. Environment pairs are probably safe, because
  the large differences dwarf pose changes.
- **Density bake-facing confound.** The trainer's baked facing differs between 1× and 2×. Find out why
  (quantised bake angles?) and fix it before the density decision.
- **Motion is untested by stills.** Extend the kit with short looping WebM/MP4 clips (idle, attack, hit) per
  variant. The page can show `<video>` elements with the same A/B logic. A motion "gold" would be a clip at 2 fps
  vs 10 fps.
- **Objective clarity tasks** ("unlike taste, clarity is testable"): a tap-the-enemy-creature trial using the
  capture harness's creature boxes; a "whose turn / what HP" recall after 2 s. These turn §2.2 items 3–4 into
  numbers and are cheap to add to `rate.html`.
- **Active sampling** (ASAP) only pays off for ladders of ≥ 5 levels, e.g. outline weight or bloom strength.
- **Phone delivery on iOS.** Whether the single-file HTML runs from Files/Quick Look was not testable here. The
  LAN `python3 -m http.server` route works by construction. A private claude.ai Artifact would also work, but
  only if the owner chooses it: the kit contains only Orbkin frames.
- **Tie modelling.** Ties are counted as half wins. If ties become frequent (> 30%), fit Davidson's model and use
  N1's tie rate as the calibration Perez-Ortiz & Mantiuk suggest.

---

## 7. Implications for Orbkin

1. **Ask the owner to run the kit now:** `hgt/orbkin-ab-kit.zip` or `hgt/kit-inline.html`, ~12–15 min on
   desktop, then P10/P15 on the phone. Send back the JSON, run `agree.py`, and paste the recommendations into
   the decision log. Until then, every judge verdict about *taste* (density, UI skin, baseline vs current) is
   provisional.
2. **Fix the capture discipline everywhere.**
   - All A/B frames come from a frozen virtual clock: the refine harness or `detcap.mjs`.
   - Earlier vertical-slice verdicts on kin and density are marked "unconfirmed (wall-clock capture)".
   - Under frozen frames, Opus now prefers the **code-built kin over Blender SDF kin 6/6**, and finds **no
     desktop difference** for 2× density in the cave.
3. **Treat the density tunable as a per-device, two-level choice** (2-px vs 1-px texels), not a continuous
   multiplier.
   - Current frozen-clock Opus: phone 2× (6/6); desktop mixed (cave same, meadow/volcanic 2× 5/6).
   - Fix the trainer-facing side effect, then let the owner's picks decide.
4. **The skills' verification section** gains: human anchors (sealed), the family trust table, human-gated
   tunables, the frozen-clock rule, owner-minute reporting and a milestone-only external-rater round (§5).
   Default state: everything human-gated until the starter set is rated.
5. **Professional review checklist.** Use §2.2 as the agenda for any critique, human or Opus: first read →
   value/focal → silhouette → gameplay clarity → cohesion → light/mood → motion → finish. The critique (not the
   gate) should report issues in that order.
6. **Do not ship the fan-art reference anywhere distributable.** The kit builder only takes Orbkin frames, and
   `key.json` (which lists the sources) stays private.
7. **Budget.** The Opus side of this angle cost about $2.3 at list price (subscription-absorbed). The human side
   is ~15 owner minutes per starter set and ~5 min per milestone afterwards. Friends' time is optional but needed
   to answer "would a seasoned designer agree?"

---

## Sources
- Methodology: Mantiuk et al. 2012 ([diglib](https://diglib.eg.org/handle/10.1111/v31i8pp2478-2491)); Perez-Ortiz & Mantiuk 2017 ([arXiv 1712.03686](https://arxiv.org/abs/1712.03686)); [pwcmp](https://github.com/mantiuk/pwcmp); [ASAP](https://github.com/gfxdisp/asap) (Mikhailiuk et al., ICPR 2020); [microsoft/P.808](https://github.com/microsoft/P.808); [microsoft/P.910](https://github.com/microsoft/P.910) (Naderi & Cutler); [choix](https://pypi.org/project/choix/); [crowd-kit](https://pypi.org/project/crowd-kit/); Rao & Kupper 1967; Davidson 1970 ([JASA](https://www.tandfonline.com/doi/abs/10.1080/01621459.1970.10481082)); ISO/IEC 29170-2 flicker ([arXiv 2108.00201](https://arxiv.org/pdf/2108.00201)).
- Bias and timing: [Laterality 2020](https://www.tandfonline.com/doi/full/10.1080/1357650X.2020.1783281); [reading direction](https://www.sciencedirect.com/science/article/abs/pii/S027826261000182X); [judges vs laypeople](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC5723409/); Lindgaard 2006 ([Nature news](https://www.nature.com/news/2006/060109/full/news060109-13.html)); [NN/g 5-second test](https://www.nngroup.com/videos/5-second-usability-test/); [Smashing 2023](https://www.smashingmagazine.com/2023/12/five-second-testing-case-study/); MLLM-as-a-Judge ([site](https://mllm-judge.github.io/)): GPT-4V 79.3% pairwise agreement with humans; [position bias study](https://aclanthology.org/2025.ijcnlp-long.18.pdf); [MLLM perceptual judgment bias](https://arxiv.org/html/2606.02578).
- Studio practice: Valve TF2 ([GDC 2008 slides](https://cdn.fastly.steamstatic.com/apps/valve/2008/GDC2008_StylizationWithAPurpose_TF2.pdf)); Riot ([clarity](https://www.leagueoflegends.com/en-us/news/dev/clarity-in-league/), [ask riot](https://www.leagueoflegends.com/en-au/news/dev/ask-riot-let-s-talk-clarity/), [VFX updates](https://www.leagueoflegends.com/en-pl/news/dev/dev-behind-the-scenes-of-vfx-updates/), [VFX guide summary](https://www.vfxapprentice.com/blog/10-league-of-legends-vfx-design-tips)); Overwatch ([GDC vault](https://www.gdcvault.com/play/1024268/The-Art-of-Overwatch-Evolving), [summary](https://www.gamedeveloper.com/art/video-defining-and-evolving-the-art-direction-of-i-overwatch-i-)); Octopath ([Siliconera](https://www.siliconera.com/project-octopath-traveler-developers-answer-project-started-troubles-developing-hd-2d/), [NintendoEverything](https://nintendoeverything.com/project-octopath-traveler-devs-on-the-games-origins-demo-feedback-and-improvements-more/), [Nintendo Life](https://www.nintendolife.com/news/2022/10/octopath-traveler-ii-devs-aimed-to-make-its-hd-2d-visuals-picture-perfect)); Hades ([MCV](https://mcvuk.com/business-news/behind-the-art-of-hades-we-value-artistic-integrity-and-excellence-in-artistic-craft-at-supergiant-however-were-first-and-foremost-a-game-design-lead-team/)); Ori ([GamesRadar](https://www.gamesradar.com/i-think-mo-cap-is-dumb-moon-studios-thomas-mahler-on-the-art-and-science-behind-ori-and-the-will-of-the-wisps/)); [Five Secrets](https://www.gamedeveloper.com/art/five-secrets-of-game-art-direction); [GDC Maximizing Critique](https://gdcvault.com/play/1023293/Maximizing-Critique-Improving-Communication-for); [BugNet](https://bugnet.io/blog/collecting-feedback-on-your-art-and-visual-style); [Zukowski](https://howtomarketagame.com/); [capsule guide](https://www.steampageanalyzer.com/blog/steam-capsule-design-guide).
- Raters: [itch.io feedback](https://itch.io/t/1250514/is-there-a-place-where-we-can-get-feedback-for-our-game-art); [itch devlogs board](https://itch.io/board/10021/devlogs); [GameDev.net critique](https://gamedev.net/forums/topic/690666-feedback-on-pixel-art-for-game/); [CG Cookie etiquette](https://cgcookie.com/posts/can-you-give-valuable-feedback?page=2); [Bulbagarden rules](https://bulbagarden.net/threads/spriters-sanctuarys-rules-and-guidelines.119789/).
