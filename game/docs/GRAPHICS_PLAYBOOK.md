# Orbkin graphics playbook

How to make Orbkin's graphics stunning and professional with free tools and Claude Opus, and
what to stop doing. Synthesised 2026-10-15 from 28 research notes (≈ 1.3 MB, 60+ headless
experiments, ≈ 2,400 blind Opus judge votes) and two independent audits. Notes live in the
session scratchpad under `scratchpad/research/*.md`; the audits are `audit-1.md` and
`audit-2.md`. Where the audits rated a claim doubtful, this document says so or drops it.

Confidence tags: **[high]** measured here with controls or read in a primary source;
**[medium]** measured with small n (3–6 votes per pair is the norm here) or one good
secondary source; **[low]** inference or an untested starting value; **[owner]** a taste
decision that the owner must make with the blind A/B kit, never on judge votes alone.

---

## 0. The ten decisions

1. **Keep the engine, the renderer and the procedural kit. Do not migrate the arenas to
   Blender or CC0 kits.** In the real game, the procedural arena beat Blender-authored and
   CC0-kitbashed shells in 7 of 7 blind head-to-heads, all 3–0 at judge confidence 4, desktop
   and phone (`ingame-vertical-slice.md` §3). The win is the pixel-art *construction rules*
   the code encodes (coursed tiers on iso-lines, block-local texel-aligned UVs, a texel bevel
   in texture space, art-directed vertex AO and haze), not the authoring tool. **[high]**
2. **The owner's diagnosis is half right.** Pros do author shapes in a DCC tool, and
   code-only primitive soup does read cheap in *large* renders. But at Orbkin's sprite size
   (28–44 texels) the modelling tool is not the lever: frozen-clock judges preferred the
   code-built kin over Blender SDF kin 6/6 at 1× and 2× density (`human-ground-truth.md`
   §4.4). The "far more detailed Blender + Three.js" showcases online either hide a paid
   generator, use CC0 scans, or spent millions of tokens on a written art contract and a
   critique loop (`showcases.md` §2, §4). The gap is **art direction, depth hierarchy, light
   colour, motion timing and process**, and those are cheap. **[high]**
3. **Blender is a capability, not the pipeline.** Headless `bpy` 5.2.2 works here end to end
   (model → bake → rig → GLB → glTF-Transform → three r180, ≈ 15 s per creature)
   (`lab.md`, `asset-pipeline.md`). Use it where code primitives cannot make the form (hero set
   pieces, organic props, future hero kin), always through the same texel rules, and only
   after the piece wins an in-game blind A/B. Never chat-drive Blender through an MCP; run
   re-runnable scripts and look at contact sheets. **[high]**
4. **The frame architecture is "pixel buffer + HD effects" (hybrid), not native resolution.**
   Real HD-2D keeps textures and sprites pixel-crisp but runs depth of field, bloom and haze
   at output resolution (`reference-board-measurement.md` §4). Native + MSAA added nothing at
   equal sprite density (3/3) and costs 5–10× the DRAM traffic, more than a mid-range phone's
   whole memory bus (`frame-architecture-hybrid.md`, `mobile-perf-budget.md`). Desktop →
   hybrid H; phones → L now, H2 on devices the bench proves. **[medium-high]**
5. **The sprite pipeline is right; its density is a two-level owner choice.** Orbkin's people
   at 31–44 texels and 1/180 of frame height sit inside Octopath's measured battle-camera
   range (`reference-board-measurement.md` §4–5). The only real step is 2-px vs 1-px texels
   per device; phone 2× is robust (6/6 frozen clock), desktop is split. **[owner]**
6. **The largest measured gaps are light colour and depth.** Orbkin's lit pixels reach
   b\* ≈ 36 and chroma p95 ≈ 50 against Octopath's b\* median 16 / chroma 37; the cave has
   0.2 % cool pixels against Octopath's median 14 %; the sharpness profile is flat where
   Octopath's bottom band drops to 0.04–0.32. Grade toward those statistics and add a real
   DoF band. **[high for the measurement, medium for the fix]**
7. **Motion is where the game looks least professional, and the fixes are small.** The hit
   reaction starts 1.7–2.1 s after impact because of an async `return tail` in `movefx.ts`
   (`battle-vfx-motion.md` §1; audit-2 confirmed the code). Impacts fade in instead of
   flashing; dissolves use dither; attacks move ≈ 1.3 texels; blinks miss 54 % of the time at
   the 10 fps bake; the camera never moves; the shake is a 30 Hz buzz. **[high]**
8. **Verification is a pairwise, canary-validated, blind Opus judge against the last
   accepted frame, with frozen-clock captures and a sealed verifier.** Absolute 1–10 scores
   drift ±0.5 between set-ups and cannot separate blatant degradations; the raw image metrics
   fail the reference itself; wall-clock captures produced confident wrong verdicts
   (`judge-calibration.md`, `human-ground-truth.md`). Taste forks (density, DoF strength, UI
   skin, grade strength) go to the owner's blind kit. **[high]**
9. **Skills improve process, not taste.** A 33-session ablation found the drafted skills
   triggered 24/24 but did not reliably improve judged quality; scripts were used in 100 % of
   runs, references rarely; untested aesthetic defaults made output worse; the 5k-token cut
   cost nothing (`skill-pilot-ablation.md`). Skills therefore ship **scripts, gates, budgets
   and a few RED-run-derived rules**, under 4,000 tokens, with per-step reference pointers.
   **[high]**
10. **Free means free, inside the proxy.** CC0 from Poly Haven (API), ambientCG and Kenney,
    KayKit/Quaternius through `git clone`, fonts via `@fontsource/*`; `bpy` from PyPI;
    glTF-Transform and meshoptimizer from npm with `--ignore-scripts`. No binaries (KTX
    tools, basisu) without the owner's explicit approval. Record every third-party asset in
    `ASSETS.md`. Creatures and people stay original. **[high]**

---

## 1. Where the ~6/10 comes from (and where it does not)

The original judging loop asked three Opus lenses for absolute 1–10 scores against a fan-art
reference and declared parity at "every scene ≥ 8". Reproducing it gives 5.33 (r1) → 6.03
(r2) → 6.81 ± 0.2 (current), with a +0.5 to +0.66 level offset between set-ups and a parity
bar 1–1.5 points above anything the protocol produced (`judge-calibration.md` §4). So "6/10"
is a stable *ranking* but a meaningless *level*. What the judges actually said, in order of
recurrence (`judge-calibration.md` §4, §5.4; `art-direction.md` §4):

1. Sprites: "thick uniform outlines, flat 2–3 tone shading, no scene lighting; stickers on a
   lit diorama". Lighter-than-ground subjects scored higher in every judge set
   (`focal_dL_vs_ring` ρ +0.65).
2. Phone portrait: "lower 40–55 % is empty magnified floor".
3. Floors lack scattered rubble and props; rock walls are uniformly busy noise (meadow detail
   CV 0.20).
4. The frame is monochrome orange: 99 % of chromatic pixels in two adjacent hue bins, shadows
   just darker orange, no cool shadow.
5. The three refine rounds bought crispness and lost "volumetric richness and sprite
   smoothness": pairwise, the pre-refine baseline beat the current build in meadow and
   volcanic and tied in cave and summit (6 votes each, **[medium]**, unconfirmed by a human).

What the gap is **not**: texel density (sprites and environment already match real HD-2D
numbers), triangle count (a creature covers ≈ 100 px), texture resolution (ramp-mapped CC0
scans and 2048² Blender bakes were invisible in-game, 3 ties), or the renderer (the live
sprite bake beat an offline Blender toon sprite 3–0 and 4/6).

And the reference itself: `hd2d/reference.png` is a 2× screenshot of an X video player showing
an AI-assisted browser demo with Nintendo IP (`reference-board-measurement.md` §1–2). Its
sprites have mixed grid phases, its rock has no texel grid, and blind Opus at native size does
**not** rank it above the current cave frame (3/6); it only wins at thumbnail scale (6/6). Use
it as a thumbnail mood and layout anchor only, never at native size, never shipped, never
copied (`judge-calibration.md` §5.5, §8).

---

## 2. Pipeline decision, per asset class

Evidence columns cite the in-game vertical slice unless noted. "Prescribe" = rule in a skill;
"optional" = allowed when it wins an in-game blind A/B.

| Asset class | Decision | Evidence | Prescribe | Optional |
|---|---|---|---|---|
| **Arena shell** (terraces, walls, floors, rubble, stairs) | Keep `src/render/hd2d/kit/*` and the painters; improve the rules in code | A beat B/B2/C/C2 7/7 pairs, 3–0 at conf 4, desk + phone **[high]** | coursed tiers on iso-lines; block-local texel-aligned UVs at `TEXEL`; texel bevel (lit lip + dark seam) in texture space; vertex AO multiplying albedo; haze/foreground value rules; one merged mesh per material | Blender hero shapes (arches, stalactites, set pieces) **only** through block UVs + the same bevel/AO rules; CC0 rocks as blockout reference |
| **Arena lighting** | One live shadowing cookie/directional key + art-directed hemisphere + fill; AO baked in vertex colours / texture | AO-only beat full lightmap 3–0 (double-lit) and indirect-only lightmap 3–0; fully baked = indirect (3 ties) **[high]** | never stack a lightmap under a live key; AO multiplies ambient only; grade per arena; every beam has a visible source | indirect-only lightmaps ≤ 1024² with their own grade, for many-static-light scenes; Cycles bakes as look-dev reference |
| **Surfaces** | Procedural painters + palette-preserving mips (`textures.ts`) | scan 1–2 n.s., scan-mask 3 ties, baked edge 3 ties; photo → pixel tile is speckle (`hd2d-pixel.md` §14) **[medium-high]** | one texel density; 6–7 shade hue-shifted ramps; ≥ 2-texel clusters; no raw photos; no linear filtering or auto mipmaps | CC0 **height + AO** maps (not colour) as mask inputs to the rule composer (`procedural-texturing.md` §3.4); unique baked mask atlases for hero pieces |
| **Kin** | Code designs in `designs.ts` → live `sprite.ts` bake; crease normals | live bake beat offline Blender sprite 3–0 and 4/6 both orders; code kin beat Blender SDF kin 6/6 frozen clock; crease beat flat 3–0 **[high]** | design rules (§4.3), eye size ≥ 3×3 texels at battle size, 3 colour blocks, signature part, divergence step, `ip_check.py` on lineup **and** battle crop | Blender SDF/metaball bodies via the geometry-swap path (`_RIG*` attributes round-trip, `creature-design.md` §10 P0) for species primitives cannot make; skinned clips later |
| **Sprite density** | Tunable, two levels (2 px vs 1 px per texel), per device | phone 2× 6/6 frozen; desktop cave n.d., meadow/volcanic 2× 5/6; 1.5× ≡ 2× on these cameras **[medium]** | decide per device with the owner kit; one shared sprite pixel size per frame; fix the trainer bake-facing side effect first | the level |
| **Trainers / people** | `characters.ts` figures + live bake | by analogy with kin; people gained most from density **[medium]** | same as kin; 4 facings; walk cycle (`character-animation-craft.md` §8) | KayKit Adventurers (CC0, rigged) as *motion reference* only |
| **Props** | `kit/props.ts` | code props beat CC0 restyled 3–0 **[medium]** | per-material ramps; readable accents (book spines); few big pieces | CC0 props for objects the kit lacks, restyled per piece, reviewed in-game |
| **Water / lava / foliage** | Procedural, stepped clocks | near water W2 won desk 4/4, phone 4/4, crop 4/4 and is cheaper; lava crust/rafts lost 0/4 twice; clumped turf won the crop 4/4 (`biome-nature-kit.md`) **[high / medium]** | flat bands + crescents + solid lace at 8 fps for near water; banded molten flow for lava; ≤ 3 adjacent turf shades, clumps with open turf, ground-coloured grass; ≤ 1 texel change per frame | far-sea glitter stays until shafts are soft-edged |
| **Battle FX** | Pixel bodies at the sprites' texel size + HD light (point light, bloom, pools) | measured texel mixing, 50 ms fade-ins, dither dissolves; Octopath "a point light with each VFX" (`battle-vfx-motion.md`) **[high / medium]** | impact frame first; shape dissipation; one pre-allocated FX light; FX texel = sprite texel; budgets §6 | Blender flipbooks (Cycles volumes, metaballs) as sources, hand-ruled key frames on top |
| **UI** | Keep the pixel handheld system (`docs/UI.md`); fix direction-independent defects; direction is an owner fork | old web → pixel UI 84/84; pixel → dark slab 78/84 without reference, 14–22 against with reference (`ui-hud-typography.md`) **[high as judge data]** | small type tier ≥ 20 px, HP numbers off the XP row, state colours, portrait stack ≤ 42 % → fold prompt into command box, desk HUD ≤ 20 % of frame | cream handheld vs HD-2D slab: owner blind kit (24 pairs); never pxdark |
| **Render resolution** | Desktop 640×360 grid + device-res composite (hybrid H); phone 271×586 grid, effects at the grid (L), H2 on proven devices | native n.s. at 8.7× cost; H ≡ L full-frame, H > L in defocused crops 14/18; DRAM model **[medium-high]** | integer grid; no MSAA on render targets; no RGBA32F; subject mask for any depth DoF | H on phones only after `?bench=1` on a real device |
| **Reference images** | Anchors by role, sealed: A1 Octopath battle camera thumbnail, A2 Octopath field store shot, A3 fan art thumbnail | `reference-board-measurement.md` §6 | skills name roles, scripts and ranges, never contain the images | — |

---

## 3. Art direction rules (the look bible)

These are the rules that survived both the judge calibration and the audits. Numbers marked
**target range** come from measured Octopath store shots and are *critique context*, not gate
thresholds: the fan-art reference fails 4 of 6 of the earlier proposed gates and adding noise
raises "edge energy" (`judge-calibration.md` §2–3). Gate on pairwise verdicts; use ranges to
explain.

### 3.1 The three reads (what a seasoned designer checks, in order)

1. **First read, ≤ 1 s, at 1/8 scale.** Genre, the two creatures, the floor. Test: 160-px
   thumbnail and the 5-second module in the owner kit.
2. **Value structure and focal hierarchy.** 3–4 value masses when squinted; the creatures sit
   on a contrasting mass; the strongest local contrast (value, temperature, saturation,
   detail) is at the creatures; leading lines (stairs, rails, shafts) point at them.
   HD-2D field frames are **dark-dominant** (Octopath notan median 0.51/0.33/0.14, L\* ≈ 36;
   Orbkin's route map is 0.09/0.20/0.71, L\* 69).
3. **Silhouette at play size.** Black-fill the cast; no two confusable; evolutions change
   silhouette, not scale.
4. **Gameplay clarity.** Who is the foe, whose turn, what happened, HP readable.
5. **Cohesion.** One texel density per frame (no mixels: FX, UI frames, clouds and sprites at
   the same texel), one light direction, UI that belongs to the world.
6. **Light and mood.** Not too dark to read (Octopath's #1 demo complaint), but light as a
   minority pool.
7. **Motion feel.** Idle life, anticipation, impact, timing (strips, not stills).
8. **Finish.** Artefacts, shimmer, jaggies, text crispness.

### 3.2 Composition and value

- One primary focal point (the pair of creatures), one secondary (the light motif), the rest
  subordinate. Keep 2 cells of clean floor around the kin spots; rubble and props at the edges.
- **Depth planes**: dark or defocused framing foreground, mid-value high-detail midground where
  the subjects live, background fading toward the haze value. Phone portrait must never show
  empty magnified floor: aprons plus a foreground lip or dressing (judge gap #2). Do **not**
  prescribe "dark simple foreground + fewer tufts" as a rule: the pilot followed it and lost
  3/3 on phone (`skill-pilot-ablation.md` §3.2). Test per arena and per layout.
- **Detail is a gradient**: highest at the focal point and gameplay space, lowest at the edges
  and on big planes. Lit faces get detail; shadow faces get 2–3 flat shades.
- **Subject/ground separation** by value *and* hue: a neutral or complementary, desaturated
  floor patch under warm kin; a key-side rim; a selective outline from the ground ramp.
  Judges rewarded lighter-than-ground subjects in every set.

### 3.3 Colour and light (target ranges, measured on Octopath, `reference-board-measurement.md` §5)

| Quantity | Orbkin now (cave) | Target range | Note |
|---|---|---|---|
| Lit-area b\* (warmth) | ≈ 36 | ≤ 28 (Octopath median 16) | uniform grade change |
| Chroma p95 | 49–50 | ≤ 40 (median 37) | saturation 0.92 → lower, or desaturate lights |
| Cool pixels (b\* < 0) | 0.2 % | ≥ 5 % (median 14 %) | plum/blue shadows and far plane, even in warm arenas |
| Dark band share | 0.37 | ≈ 0.45 | light as a minority pool |
| Hue top-2 share | 0.75–0.99 | reserve one hue family for kin + UI accents | per-arena gamut file |
| Shafts | up to 4–5 across the subject | ≤ 3, visible source, land *beside* the subjects | the baseline's richer volumetrics were missed by judges |
| Bloom | threshold 1.0 + knee | keep; emitters only | already right |

- Ramps hue-shift (shadows cool/violet, highlights warm); saturation peaks in mid-tones.
- One motivated key per scene; shadows always tinted, never grey or black; temperature
  contrast between key and shadow (Bruno Simon's folio-2025 lighting model is the open
  reference: core shadow smoothstep + albedo-tinted shadow colour + ground bounce,
  `threejs-render.md` §6.2).
- Tone mapping: the hand-rolled hue-preserving ACES is fine; if replaced, `NeutralToneMapping`
  preserves authored palettes best and a per-arena `.cube` LUT after output keeps grading
  data-driven (`threejs-render.md` §2, experiment 1 and 6) **[high for facts, taste untested]**.

### 3.4 Depth of field (the "HD" half of HD-2D)

- Octopath's measured profile at 640 px: focus band in the middle third, bottom-band sharpness
  0.04–0.37, top 0.14–0.64; Orbkin before: 0.5–0.9 everywhere. DQ3 HD-2D's team calls DoF
  "extremely important" **[secondary]**.
- Prescribe: depth-based DoF with a **subject mask** (billboard sprites lean toward the camera
  and would blur at the head), CoC max ≈ 1.6 % of frame height on desktop, phone CoC in frame
  *width* units with a ≥ 5-unit near ramp, gather at the grid, composite at device res
  (`frame-architecture-hybrid.md` §8). Never blur the subject or the hotspots; blur that
  reached the route island's trees lost 0/4 (`non-battle-screens-overworld.md`).
- Strength is **[owner]**: Opus verdicts on DoF are order-driven in 10 of 12 cells.
- Known wins at 4/4 desk and phone: the title and starter tilt bands (`tiltTop 3.6 @ 0.60–0.66`,
  `tiltBottom 3.6 @ 0.34–0.36`, vignette ≥ 0.5), the route map blur only above 0.84 and below
  0.30 with a tighter field camera on desk (FOV 26°, pitch ≈ 30°, island ≈ 70 % of free width;
  keep the whole island on portrait).

### 3.5 Pixel craft (surfaces, sprites, FX)

- One texel density per frame; integer internal grid; nearest filtering; palette-preserving
  mips; every feature that must read is ≥ 2 texels wide or a 3+ texel run; no 1-texel jitter
  lines; no orphan pixels.
- Outline: exactly 1 texel, a dark hue-shifted shade of the local or occluding colour, never
  pure black; key-side rim 1 texel.
- Sprites: five-tone hue-shifted ramp lit from the arena key; palette snap; eyes ≥ 3×3 texels
  at battle size; faces placed for the battle camera; supersample 2× with detail-preserving
  pick (never bilinear downscale).
- Environment animation on stepped clocks (6–10 fps), ≤ 1 texel of change per frame; wind
  sway quantised to texels; water 8 fps.
- Dissipate FX by **shape** (shrink, clumps, burn-through holes, rising smoke), never by
  per-texel dither (reads as a checkerboard at 2–3 px texels).

### 3.6 Motion (frames at 60 fps; `battle-vfx-motion.md` §4, `character-animation-craft.md` §8)

- Text → launch ≤ 30 f (today 64–73; a project decision, not a skill default).
- Anticipation 8–10 f → travel 6–20 f → **impact frame** (contrast) → flash 1–2 f + FX light peak
  + hit SFX → hit-stop 3 / 5–6 / 8–10 f by severity → reaction within 2 f (knockback, blink,
  directional shake kick, HP drain) → blast → dissipation 12–24 f. Launch to settle ≤ 60 f.
- Attacks are key tables, not tweens: wind-up ≥ 10–15 % of height, squash ≥ 15 %, stretch ≥ 25 %,
  mass preserved (xz by 1/√sy); keyed, pose-aligned cels (keyed2 beat smooth 44/48), never
  clock-sampled at 12 fps.
- Idle body and face at 10 fps (8 low); flames, sparks, wings at 15 fps; blinks discrete and
  tick-aligned; secondary motion lags 1–2 cels (a `uDrag` spring); people walk 6 cels at 10 fps
  with 1-texel bob, no gliding.
- Camera: whole-internal-pixel view-offset pans freely; short snapped 3D moves sparingly; cuts
  and punch-ins under the hit flash; **no slow dolly, zoom or orbit** (0.19–0.31 % of pixels
  flicker per frame); shake = damped directional kick, not a 30 Hz buzz
  (`camera-transitions-motion.md`).
- Sequences (primary code, pokeemerald, facts only): evolution = scale cross-swap accelerating
  from 24 to 2 frames, circle-in, white-out, reveal; catch ≈ 1 s per shake with stillness and
  a click darkening; location card 0.5 / 0.33 / 2.0 / 0.33 s.

### 3.7 UI

- Pixel handheld system stays; the UI must not outrank the scene in luma or saturation (cream
  panels are the brightest object on screen, mean luma ≈ 198 vs scene ≈ 100).
- Fix now, direction-independent: retire the 10-px information tier (5-px x-height on
  desktop) → 20 px or icons + tooltip; HP numbers off the XP row; re-test state colours after
  any re-skin; portrait coverage 42 % → fold the prompt into the command box; desk HUD ≤ 20 %;
  any font swap needs a one-line / no-overlap check on the longest strings (13 chars).
- Direction (cream handheld vs HD-2D slab) is **[owner]**; a reference-anchored judge rewards
  copying the reference's HUD, so judge UI in its own no-reference pass or crop it out.
- Logo: code-drawn pixel wordmark with plate, ramp and a gem *inside* a legible O (4/4 desk
  and phone); never an emblem replacing a letter.

### 3.8 Generated-look tells to refuse (from the verified showcases and our judges)

Balloon-animal creatures with seams at every joint; uniform fbm noise on every surface; bare
cubes and spheres; bloom on everything; empty floors; identical repeated rocks; flat grey
shadows; a monochrome orange frame; a 3D ribbon in a pixel scene; smooth 60 fps motion on a
sprite; mixed texel sizes; candy-saturated UI; "pasted-on" sprites with no rim or key light.

---

## 4. The creation methodology

Every verified showcase used the same loop: a written target, a deterministic screenshot
harness the model must look at, a critique with located findings ("the three weakest things a
viewer would notice first"), and many passes with one fix per round (`showcases.md` §4;
`agent-visual-method.md` §4). BlenderGym's result that verification scales better than
generation means at least half of each iteration goes to capture, crops, metrics and critique.

### 4.1 Stages and gates

```
brief → (divergent concepts) → blockout/silhouette → forms → surface → light/integration → polish/motion → gate
```

| Stage | Output | Gate (produced by a script, never self-attested) |
|---|---|---|
| **Brief** | role, quality bar, the on-screen size (battle ≈ 30 texels, menu ≈ 420 px), palette roles, budgets, what to refuse | brief file exists; budgets copied from §6 |
| **Divergent concepts** (design tasks) | ≥ 3 concepts from different body plans / starting points, scored in a table, one picked | 12/12 pilot runs converged on the same concept without this step |
| **Blockout / silhouette** | primary masses only | black silhouettes at play size; cast lineup IoU (flag > 0.8); owner sign-off on the sheet |
| **Forms** | fused, refined secondary forms | clay / Workbench sheet from the game camera and ¾; joints inspected; floating parts check |
| **Surface** | colour blocks → ramps → texture | greyscale at play size separates; palette within the arena gamut |
| **Light / integration** | in the real scene with the real pipeline | frozen-clock capture desk + phone; defect floor; located critique vs the anchor roles |
| **Polish / motion** | idle, attack, FX, camera | frame strips (never a frozen frame for timing); `fx_timeline` impact → reaction ≤ 2 f; `motionlint` |
| **Gate** | accept / revert | pairwise judge vs last accepted, both orders, canary first; IP check for any design; owner batch for taste families |

Rules of the loop: one problem per round; measurements, not adjectives; stop after two rounds
without a measured gain and re-plan from an earlier stage; log the numbers in
`docs/DECISIONS.md`; never paste anchor numbers or judge prompts into the generator's context.

### 4.2 Capture discipline (non-negotiable)

- Frozen virtual frame clock, fixed seed, fixed absolute frame, same camera and state; repeat
  captures must be pixel-identical. Wall-clock captures changed 3 of 4 density/kin verdicts and
  produced a confident 6/6 preference between two pixel-identical configurations
  (`human-ground-truth.md` §4.4).
- Desk 1280×720 **and** phone 393×851 for every arena change; element crop at 2× nearest for
  anything smaller than a quarter of the frame; attacker-only strips at every 2nd frame for
  motion, plus a separate sync strip.
- If pixels outside the changed subsystem differ (dressing rng, sprite phase, dialog state), the
  capture is invalid.
- Native size to the judge (≤ 2576 px long edge, ≤ 20 images per request); thumbnails hide
  noise and softening.

### 4.3 The judge (`judge-calibration.md` §6, §9)

1. **Defect floor first, free**: `artgate_compare.py` (value range ≥ 55, squint std ≥ 12,
   hf ratio ≥ 0.30, drops vs baseline, colourfulness WARN). 0 false alarms on 63 real changes
   (in-sample; re-check on new rounds). Floors, not targets.
2. **Canary**: baseline vs a degraded baseline, both orders; if the judge fails it the run is
   invalid (exit 3).
3. **Pairwise, both orders, 2 votes per order** (≈ $0.15–0.20, 1 min): `better` only when it
   won in both orders; order-flipping = `no_difference`, which is a legitimate and common
   outcome for subtle work. Accuracy on known orderings 42/42 with the reference, 43/44 without;
   confidence 4–5 was right 106/106. Use Opus; Haiku has a 63 % first-position bias.
4. **Focal crops** are a separate signal (sprite/ground read), not a tie-breaker; a
   full-vs-crop contradiction means a human looks.
5. **Critique** comes from a separate critic call (located gaps, three biggest deltas), never
   from the gate's numbers.
6. **Originality**: `ip_check.py` on the lineup **and** the in-game crop (the bake raised
   Maelstrode from 5–6 to 7–9); FAIL ≥ 7 + distinctive blocks; grep gate reasons for franchise
   names. Open flags: Maelstrode (Dragonair read), Dropple (DQ Slime read), Flickwing (Cutiefly),
   the hero's cap.
7. **Held-out split**: the generator sees the brief, the rule names, the defect floors, budgets
   and the critique; only the verifier sees the anchor images, their numbers, the prompts, the
   canary recipe and the vote counts (`game/tools/verify/sealed/`, read-denied for generator
   sessions).
8. **Human anchors**: the owner's blind kit (`hgt/orbkin-ab-kit.zip`, 23 trials, 12–15 min)
   seeds a family trust table; a family is judge-trusted only at ≥ 5 anchors, κ ≥ 0.6 and zero
   contradictions; everything starts human-gated. Taste tunables are decided by human
   Bradley–Terry per device. Report owner minutes (≈ 25 s per pair + 2 min).

### 4.4 Gate view must match the change

Static art → desk + phone + element crop. Motion or timing → frame strip; the frozen
mid-impact frame judged a correct timing fix `worse` 8/8 because the target was mid-flash
(`skill-pilot-ablation.md` §3.3). Environment elements → element crop and full frame with
frozen dressing. UI → its own no-reference pass. DoF/blur → crops of defocused regions judge
blur *quality*, not strength; strength is the owner's.

---

## 5. Blender: how to use it when you do

Verified in this container with `bpy` 5.2.2 (`blender-llm.md`, `lab.md`, `asset-pipeline.md`,
`creature-design.md`, `procedural-texturing.md`; audit corrections applied).

- **Setup**: three-layer bootstrap (`toolchain-bootstrap.md` §2): environment setup script
  installs EGL packages and hash-locked bpy once; a SessionStart hook syncs tools; every skill
  starts with `bootstrap.sh doctor` and never assumes the hook ran (the GPU PC runs no repo
  hooks). Pin Blender 5.2 LTS everywhere with `orbkin_compat.py`. Run scripts as
  `"$ORBKIN_BPY" -I script.py -- args`; exceptions exit non-zero, `bpy.ops` CANCELLED does not.
- **Engines**: Cycles CPU for beauty (512² at 16 spp + OIDN ≈ 4–6 s) and bakes; Workbench for
  review sheets (0.1–1.4 s); Cycles **1 spp emission-only** for sprite passes (0.05–0.12 s per
  48-px frame; the "10 ms" figure in one note is doubtful per audit-1); EEVEE on llvmpipe only
  for Shader-to-RGB looks, with `taa_render_samples` low and raytracing off (a 256² frame at
  defaults took 150 s under load).
- **Form**: primary forms from blended volumes (metaballs or GN SDF: `MeshToSDFGrid` →
  `SDFGridFillet` → `GridToMesh` with **threshold 0.0**), never intersecting primitives; sharp
  secondary parts as separate bevelled objects; surface detail by GN displacement, Displace or
  numpy (`foreach_get/set`; a Python loop over 137k tris never finished). Sculpt brush strokes
  fail `poll()` headless. The Skin modifier is fragile for blockouts (non-manifold joints are
  configuration-dependent per audit-1; check `is_manifold`).
- **Retopo**: QuadriFlow for creatures (2–3k quads); it can refuse voxel output with edges
  < 1e-4 (check min edge, prescale ×100 only then; audit-1 found the refusal
  condition-dependent, not "almost always") and can OOM on fragmented shells (run under
  `ulimit -v` and `timeout`, assert the bounding box). MeshLab quadric collapse for static props.
- **Bake**: masks, not colours (AO with neighbours present at distance ≈ 0.7, curvature via
  Pointiness, top-facing, material ID), then compose ramp indices by rule at `TEXEL` density.
  Selected-to-active rays are world-space (overlap high and low); reset pass toggles before
  every bake; images are not saved automatically; AO can bake to vertex colours with no UVs.
  Convert float bakes to sRGB bytes before glTF export. Pack islands with `FRACTION` margins or
  the atlas is 7.5 % used.
- **Export**: Principled only (procedural nodes are silently lost); `use_backface_culling`
  on or `doubleSided` is written; vertex colours only when a material uses them; custom
  attributes `_NAME` with `export_attributes=True`; AO via the "glTF Material Output" group;
  NLA tracks named per clip, same name on armature and shape keys; ≤ 4 influences,
  normalised; non-deform root bones vanish with `export_def_bones`. Assign materials **before**
  booleans in 5.2.2 (empty-slot bug, audit-2 reproduced). The pip wheel lacks Draco/meshopt:
  export raw, validate raw.
- **Pack** with glTF-Transform 4.5.1 scripts, never blind `optimize` (flatten/join/palette/
  simplify on by default): dedup → prune → resample → weld → per-slot textures → sparse →
  reorder → `meshopt` high (`EXT_meshopt_compression`; three r180 lacks `KHR_meshopt`), or
  `gltfpack -cc` for animated assets. Draco only for static props. WebP for smooth maps, PNG for
  pixel art (ETC1S turned a 6-colour tile into 142 colours). KTX2 opt-in, UASTC level 2 (level 4
  took 110 s), only for ≥ 1024² smooth maps, only after the owner approves the encoder.
- **Verify the shipped file**: `glbinfo.py` / `NodeIO` assertions (tris, joints, clips,
  extensions, `doubleSided=false`), then a Playwright SwiftShader screenshot in three r180 with
  the game's loaders and the sprite emulation (`lab/07_shoot.mjs`, `viewer.html`). Fix in the
  script, never in the GLB. Commit the compressed GLB plus a manifest (script, args, seed,
  versions, licences, sha256); never `.blend` files, raw downloads or review renders.
- **Kin path A** (when a species needs it): Blender body with `COLOR_0` + `_RIGP/_RIGK/_RIGB`
  attributes replaces the `designs.ts` geometry; `CreatureView`, rig shader and `SpriteBaker`
  unchanged; eyes at `surface + 0.3·size` along the normal (0.08 sank under the remesh);
  stage 1 ≤ 2,500 tris, stage 2 ≤ 3,500, stage 3 ≤ 4,500 incl. eyes; must win the in-game A/B
  and pass `ip_check`.
- **Blender MCP**: on the owner's desktop the official Blender Lab MCP (5.1+) or
  `mcp-for-blender` adds a live viewport; run the same repo scripts through it and use the
  session only to inspect. It runs model-written code unguarded, so use a VM.

---

## 6. Performance budgets (phones first; `mobile-perf-budget.md` §5)

Bandwidth decides. A 2026 mid-range Android has ≈ 17 GB/s shared; the current low tier moves
≈ 11 MB per frame; native + MSAA 4× would move ≈ 345 MB (21 GB/s at 60 fps). Counters are
enforceable in CI today; ms rows are targets until `?bench=1` runs on the owner's phone.

| Budget | low (phones) | T1 (proven phones) | desk |
|---|---|---|---|
| internal render | integer grid ≈ 0.16 Mpx (271×586 @393×851) | grid × 1.5–2, ≤ 0.65 Mpx | 640×360 grid, composite at device res |
| MSAA on render targets | none | none | optional, not needed |
| full-res passes | ≤ 3 | ≤ 4 | ≤ 8 |
| DRAM proxy | ≤ 25 MB/frame | ≤ 60 | ≤ 400 |
| shadow map | frozen 1024 PCF | ≤ 1.5 ms live 1024 | 2048 PCF (PCFSoft deprecated r182) |
| sprite bakes | 1×, 8 fps rate, ≤ 4 subjects | 2× | 2× (4× offline only) |
| AO | baked | N8AO half-res optional | ≤ 3 ms |
| GPU frame total | ≤ 11 ms | ≤ 12 | ≤ 12 on an iGPU |
| draw calls | ≤ 60 (hard 100) | ≤ 80 | ≤ 150 |
| triangles incl. shadow | ≤ 100k | ≤ 200k | ≤ 600k |
| linked programs per scene | ≤ 40 (today 58–66: **over**) | ≤ 50 | ≤ 80 |
| GPU-resident | ≤ 48 MB | ≤ 96 | ≤ 256 |
| textures | pixel art ≤ 512, cap 1024 | 2048 | 4096 |
| download | initial ≤ 1.5 MB gz; arena chunk ≤ 400 KB; kin ≤ 80 KB; game ≤ 15 MB | same | same |
| FX per move | ≤ 1.0 s, ≤ 4 extra draws, 1 pre-allocated light, ≤ 12 frames of ≤ 48² texels, ≤ 120 points | same | same |

Never on phones: MSAA targets, RGBA32F or float-linear sampling (`LightProbeGridWebGL` samples
black on ≈ 53 % of iOS), live 2048 PCFSoft, in-browser probe baking, N8AO at native res,
GTAO (2.4× the frame). Two fixes regardless of art path: cut material variants to ≤ 40
programs; add `webglcontextlost`/`restored` handling (iOS drops contexts on background).
Tier detection: coarse pointer → low (right by default); T1 only from a GPU allow-list or a
cached 1-second probe; note any 4-core desktop counts as low today.

---

## 7. Asset sourcing (free, licensed, inside the proxy)

- **Reachable**: Poly Haven (site, `api.polyhaven.com`, `dl.polyhaven.org`), ambientCG
  (`acg-download.struffelproductions.com`), kenney.nl zips, `git clone` of
  `KayKit-Game-Assets/*`, `trebeljahr/quaternius-showcase` (1,513 models per its README; a note
  counted 1,545 files), `KenneyNL/Starter-Kit-*`, `pmndrs/drei-assets`; npm `@pmndrs/assets`
  (CC0) and `@fontsource/*` (OFL); PyPI `bpy`. Blocked: poly.pizza, opengameart, itch,
  sketchfab, mixamo, GitHub release downloads, Playwright's browser CDN (so do not bump
  Playwright without the owner allowlisting it).
- **Rules** (repo `CLAUDE.md`, mandatory): assets only (images, GLB/glTF, HDR/EXR, audio,
  fonts), each download into a new empty directory, archives listed before extraction and
  extracted only through `safe_extract.py` (rejects traversal, symlinks, exec bits, `.blend`),
  source URL + licence in `ASSETS.md`, never open a downloaded `.blend`, never run downloaded
  code, never pipe into a shell. Packages: pinned, lockfiles, `--ignore-scripts`,
  `--require-hashes --only-binary :all:`, 7-day cooldown, `npm audit`, a DECISIONS entry.
  Binaries: none without explicit approval (name, version, URL, sha256, why, alternative).
- **What to use them for**: shapes and masks, never a drop-in look. CC0 libraries are
  flat-colour low-poly; re-surface through our painters and ramps or they read "pasted on"
  (props 3–0 against code props). Poly Haven height + AO → the rule composer gives a clean
  64² pixel stone wall; the colour map gives mush. KayKit Adventurers and Quaternius animals
  are motion references only. HDRIs light Cycles bakes. Kin and people stay original.
- **Generative models** (owner's RTX 3090, `local-genai-gpu-node.md`): reference-only policy
  for now; Apache-licensed models only (FLUX.2 klein 4B, Z-Image, SDXL, DA3-Small); diffusers
  scripts in the `gpu-run` jail, no ComfyUI; everything through `ip_check.py` on the final
  in-game crop; never replaces the live bake.

---

## 8. What to stop doing

| Stop | Because | Do instead |
|---|---|---|
| Absolute 1–10 judging and the "every scene ≥ 8" parity loop | level drifts ±0.5 by set-up; cannot see blatant degradations; bar unreachable | pairwise vs last accepted, canary, both orders |
| Raw metrics as targets (notan ≥ 45 %, detail CV ≥ 0.45, ΔL ≥ 15, hue share < 0.85) | the reference fails them; noise passes "more detail" | metrics as defect floors and critique hints only |
| Wall-clock captures | pose and phase decide verdicts | frozen virtual clock, pixel-identical repeats |
| Chasing the fan art at native size | it is an AI browser demo with mixed pixel grids; judges penalise it | thumbnail mood anchor; Octopath store shots for numbers |
| Migrating arenas, props or kin to Blender/CC0 "for detail" | lost 7/7, 3–0 and 6/6 in-game | improve the kit's rules; Blender only for shapes primitives cannot make, behind an A/B |
| Lightmaps under the live key | double-lit (3–0) and even indirect-only washes value structure (3–0) | vertex AO + texture bevel + one live key |
| Native resolution + MSAA, GTAO, second scene renders for normals | 5–10× DRAM, 2.4× frame; no detectable gain at equal sprite density | hybrid H / L; depth-reconstructed edges if ever needed |
| Smooth 60 fps sprite motion, sine-only secondary motion, tween lunges at 1.3 texels | reads as "3D model", not sprite | keyed2 cels, texel amplitudes, drag springs |
| Fade-in impacts and dither dissolves | no impact frame; checkerboard | contrast frame → flash → blast; shape dissipation |
| The 3D ribbon spark bolt and FX at mixed texel sizes | the clearest style break | pixel arc book at the sprite texel |
| Slow dolly, zoom or orbit; 30 Hz shake | shimmer on regular patterns; buzz | whole-px pans, cuts under flashes, directional kick |
| Freestyle for sprites < 96 px; bilinear downscale of renders; EEVEE for sprite sheets; `gltf-transform optimize` on characters; ETC1S on pixel art; KTX2 by default | verified clutter, mush, 1.8 s/frame, destroyed geometry/materials, 142 colours from 6, 260 KB transcoder | post outline; pick-sample; Cycles 1 spp emission; per-slot pack script; PNG; WebP |
| Chat-driving Blender through an MCP | round trips burn tokens; weak on organic form | re-runnable scripts + contact sheets |
| Shipping untested aesthetic defaults in skills ("mid-value base colours", "dark simple foreground", "fewer tufts") | followed and judged worse | A/B first, else a review question |
| Judging from `docs/screenshots/hd2d/arena-*.jpg` | they show the pre-pixel-UI build | re-capture |
| Self-attested gates ("looks better") | Opus wrote PASSED without measuring; Haiku refused | scripts print the verdict; the report quotes the file |

---

## 9. Phased migration plan

Each phase is shippable behind `?gfx=hd2d` flags, gated as in §4, logged in `DECISIONS.md`,
and each visible change goes into the next owner batch. Keep: the engine, the data layer, the
DOM/pixel UI system, `src/render/hd2d/*` (pipeline, kit, painters, arena registry, sprite
baker, characters, screens), the e2e harness, the pixel font, the save system.

### Phase 0: foundations (1–2 sessions; no visible art change)

1. Fix the `return tail` adoption bug in `movefx.ts` and the `Promise.all` wait on the lunge
   (impact → reaction 127 f → ≤ 2 f; 12/12 pilot runs did it unaided, so it is cheap).
2. Land `game/tools/verify/` from `scratchpad/jc/scripts` (`artgate.py`, `artgate_compare.py`,
   `visual_judge.py`, `ip_check.py`, `judgelib.py`), the frozen-clock capture (`hgt/scripts/
   detcap.mjs` / the refine harness), the timeline tool (`pilot/harness/timeline.mjs`),
   `motionlint.py` + `make_strips.py` (`anim/scripts`), `screen_judge.py`, `readability_probe`,
   and the owner-kit builder (`hgt/scripts/pairset.py`, `agree.py`). `requirements-verify.txt`
   pins Pillow and numpy. Sealed folder with the three anchors and a deny rule for generator
   sessions (owner approves both the reference handling and the settings change).
3. Land the bootstrap (`tools/bootstrap`, `tools/blender/{requirements.*, orbkin_compat.py}`,
   `tools/asset-pipeline`, `tools/assets/safe_extract.py`) as one reviewed PR; the owner pastes
   the 46-line setup script once; the hooks block is a separate commit; deny rules untouched.
4. CI counters: `perf-budget.json` + `check-budget.mjs` on the SwiftShader audit (every counter
   passes today except programs per scene).
5. The owner runs the blind kit (`hgt/orbkin-ab-kit.zip`, 12–15 min + P10/P15 on the phone);
   `agree.py` seeds the trust table and answers: baseline vs current per arena, density per
   device, kin source, UI direction.
6. Re-capture `docs/screenshots/hd2d/*` with the current UI.

### Phase 1: cheap, large, already-won wins (2–4 sessions)

Light and grade: per-arena grade toward §3.3 (lights b\* ≤ 28, chroma p95 ≤ 40, ≥ 5 % cool
pixels, dark share ≈ 0.45), ≤ 3 shafts landing beside the subjects, a neutral/complementary
patch and rim under the kin; recover the baseline's volumetric richness where the owner
agrees with the judges (meadow, volcanic). Depth: title and starter tilt bands (4/4), route
map tilt2 + desk field camera (4/4 desk; portrait keeps the whole island), the code-drawn
wordmark (4/4). Motion: impact-frame book per element, hit-stop/shake/flash by severity on the
impact frame, one pre-allocated FX light tinting the sprite light with per-subject falloff, FX
texel = sprite texel, keyed2 attack tables per archetype (6–0 in 3/4 archetypes), discrete
blinks, whole-px camera intro pan + directional kick, replace the spark ribbon with an arc
book. UI: the direction-independent fixes of §3.7. Water: port W2 bands to shallows, coast and
ponds (4/4 ×3, cheaper). Each item: frozen capture, defect floor, pairwise gate, owner batch.

### Phase 2: architecture and owner forks (3–5 sessions)

Hybrid frame: port `hybrid.ts` into `pipeline.ts` (subject mask in `sprite.ts`, phone CoC in
width units, haze layer for shafts/motes/particles, `fa=l` on phones, `fa=h` on desktop), then
`?bench=fa` on the RTX PC and the owner's phone; retire the y-ramp tilt once H/L ship.
Decide with the owner: sprite texel level per device (fix the trainer bake-facing side effect
first), DoF strength, UI skin (cream vs slab2; if slab, vendor the six OFL woff2 and run the
width check on every screen). Evolution and catch choreography (scale cross-swap, dim, push-in
keeping the window, ≈ 1 s shakes), location card, people walk cycle and 4 facings. Program
count ≤ 40, context-loss handling, lazy arena chunks. Meadow vegetation rules with frozen
dressing and per-feature rng streams. Volcanic palette/value fix (not the lava material).

### Phase 3: Blender as a capability (opportunistic, after Phase 1)

`tools/blender/kit.py` + `tools/art/{bake_masks.py, compose.py}` + `npm run art` writing
`public/art/<arena>/*` with a provenance manifest. First targets, each behind an in-game A/B:
the cave's hero back wall or arch as an organic mesh with a unique baked mask atlas composed
to the cave ramp; rubble heaps; CC0 props the kit lacks, restyled per piece. Weak kin
(Vulcrag, Stormoth, Surgeray, Rillback, Pebblet, Mossling, Verdantusk, Cragmaul) get a
redesign pass with the divergence step and silhouette lineup first in code; path A Blender
bodies only where the sheet shows primitives cannot make the form. Fix the IP flags
(Maelstrode fins/palette, Dropple's curl). Offline sprite sheets only for portraits, bestiary
and title art (Cycles 1 spp emission + mode-down + palette lock), with optional hand clean-up
by the owner in Pixelorama/LibreSprite.

### Phase 4: milestones

External 5-second first-impression round (3–5 strangers, no reference, no IP), one pairwise
round on the milestone's key decisions, a 15-minute "seasoned designer" review using §3.1 as
the agenda, a full-scene gate sweep (≈ $3–5), re-run the skill pilot (n = 5 per arm, strip view
for motion) and prune any skill rule the no-skill arm already follows.

---

## 10. Skills (summary; full specs in the skill set)

Six project skills in `/home/user/gravity-innovation/.claude/skills/` (repo root, so they
trigger on the first message; `game/.claude/skills/` stays invisible until a file under `game/`
is read). Each ≤ 4,000 measured tokens (≈ 10k chars; the tokenizer is 2.4–2.5 chars/token on
Markdown), scripts first, per-step "read §N now" pointers, no end-of-file reference table,
only rules a RED run violated, no untested aesthetic defaults, a gate whose view matches the
change, the §5 "Setup and safety" block verbatim, descriptions ≤ 400 chars with "Use when …
Not for …".

| Skill | Owns | Gate it ships |
|---|---|---|
| `orbkin-visual-gate` | frozen-clock capture, defect floor, pairwise judge, IP check, motion strips, owner kit, trust table; never edits art | itself |
| `orbkin-art-direction` | the look bible (§3), per-screen style sheet, grade/light targets, critique rubric with located evidence, anchors by role, UI rules; routes building to the specialists | critique + gate |
| `orbkin-render-look` | the HD-2D pipeline API, tiers, frame architecture, post order, DoF, lights, camera motion, perf budgets, bench | budget counters + gate |
| `orbkin-sprite-creature` | kin and people design (brief, divergence, silhouette lineup, `designs.ts` builders, eye/face rules, bake options), idle/attack/hit/faint key tables, blinks, walk cycles, path A pointer | lineup IoU, `ip_check`, strips, gate |
| `orbkin-battle-vfx` | timing tables, impact books, hit feedback, FX light, texel unification, Blender flipbook recipe, `fx_timeline` | `fx_timeline` ≤ 2 f, strip judge |
| `orbkin-blender-forge` | headless bpy kit, SDF/remesh/QuadriFlow, mask bakes + composer, export checklist, pack script, three r180 roundtrip, gotchas, budgets, when-to-use rule | `glbinfo` asserts, viewer screenshot, in-game A/B |

Build each from a RED run first (2–3 realistic tasks without the skill, ≈ $2–3 each), bundle
the scripts the RED runs kept re-writing, test triggering (20 queries × 3 runs) and output
(with/without, blind pairwise, owner review), and delete lines no run needed.

---

## 11. Sources

Research notes (scratchpad `research/`): `ingame-vertical-slice.md`, `human-ground-truth.md`,
`judge-calibration.md`, `reference-board-measurement.md`, `frame-architecture-hybrid.md`,
`mobile-perf-budget.md`, `showcases.md`, `blender-llm.md`, `lab.md`, `asset-pipeline.md`,
`creature-design.md`, `hd2d-pixel.md`, `threejs-render.md`, `art-direction.md`,
`agent-visual-method.md`, `procedural-texturing.md`, `free-tools-assets.md`,
`battle-vfx-motion.md`, `character-animation-craft.md`, `camera-transitions-motion.md`,
`biome-nature-kit.md`, `non-battle-screens-overworld.md`, `ui-hud-typography.md`,
`toolchain-bootstrap.md`, `skills-format.md`, `skill-pilot-ablation.md`,
`local-genai-gpu-node.md`, `audit-1.md`, `audit-2.md`.

Primary sources read in those notes (selection): three.js r180–r186 source and examples
(`RenderPixelatedPass`, `LightProbeGridWebGL`, `WebGLNodesHandler`, `MeshToonMaterial`,
`aomap_fragment`, `webgl_postprocessing_pixel`), github.com/mrdoob/three.js; Blender 5.2 manual
and glTF-Blender-IO source, docs.blender.org, github.com/KhronosGroup/glTF-Blender-IO;
`object_remesh.cc` (QuadriFlow manifold check), github.com/blender/blender; glTF-Transform
4.5.1 CLI source, gltf-transform.dev; Khronos KTX Artist Guide and Real-time Asset Creation
Guidelines; Bruno Simon folio-2025 (MIT), github.com/brunosimon/folio-2025; neimad-mp/Lumina,
dgreenheck/tidewater, aibengineering/sprout-quest, Nipale-ai/opus-5-5-overnight-builds,
levy-street/pokemon-claude-red, elithril/blender-kiln, majidmanzarpour/blender-game-skills,
craigrusselltiu/pseudo-pixel, bababuyyy/unity-isometric-pixel-pipeline,
astrellon/godot-3d-pixel-art, CelestialLemon/pixel3d-renderer; pokeemerald decompilation
(timings only); saint11 pixel-art tutorials (CC BY 4.0); Filament `Options.h`; Chromium
`gpu_driver_bug_list.json`; Linux `a6xx_catalog.c`; Claude Code skills docs
(code.claude.com/docs/en/skills), Claude vision docs; Mantiuk `pwcmp`, Microsoft P.808/P.910;
Octopath Traveler PS Store screenshots via `Emorque/Octopath-Traveler-UI` and sprite engine
data via `mastermind1919/OctoOverworldSprites`; Poly Haven, ambientCG and Kenney licence pages
(CC0); Valve TF2 NPAR 2007 / GDC 2008, Riot "Clarity in League" and VFX style guide summaries,
Overwatch GDC 2017, Octopath / Triangle Strategy / DQ3 HD-2D developer interviews
(secondary, sites blocked here).
