# Orbkin HD-2D look bible

The rules that survived the judge calibration (~2,400 blind Opus votes), the human ground-truth
protocol and two audits (GRAPHICS_PLAYBOOK.md §3, `research/{art-direction,judge-calibration,
reference-board-measurement,non-battle-screens-overworld,skill-pilot-ablation}.md`). Numbers marked
*range* were measured on official Octopath Traveler store shots and are **critique context, never gate
thresholds**: the fan-art reference fails 4 of the 6 earlier proposed gates, and adding noise raises
"edge energy". Gate on pairwise verdicts (orbkin-visual-gate); use ranges to explain a delta.

## Contents
- §reads: the three reads and the 8-row order
- §values: composition and value
- §colour-light: measured ranges and light rules
- §dof: depth of field
- §pixel-craft
- §tells: generated-look tells
- §critique: the located critique template
- §evidence: A/B-tested defaults

## §reads: the three reads and the 8-row order

A seasoned designer judges a frame in a fixed order; when an earlier row fails, later polish cannot
rescue it. Fill the rows top to bottom, PASS/FAIL **with a location** ("bottom-left third", "the foe
sprite", "band 10-12").

| # | Row | Test (what to look at) | Script |
|---|---|---|---|
| 1 | **First read** (≤ 1 s, 1/8 scale) | genre, the two creatures, the floor found at once | `critique.py --out --sheet` thumbnail tile |
| 2 | **Value structure, focal hierarchy** | 3-4 masses when squinted; creatures on a contrasting mass; strongest local contrast (value, temperature, saturation, detail) at the creatures; leading lines (stairs, rails, shafts) point at them; HD-2D field frames are dark-dominant | squint + notan tiles, `dark_share`, `focal_*`, `focal_dL_vs_ring` |
| 3 | **Silhouette at play size** | black-fill the cast; no two confusable; evolutions change silhouette, not scale | lineup sheet (orbkin-sprite-creature) |
| 4 | **Gameplay clarity** | who is the foe, whose turn, what happened, HP readable, hotspots findable | `ui_checks.py`, readability probe (route) |
| 5 | **Cohesion** | one texel density per frame (FX, UI frames, clouds, sprites), one light direction, UI that belongs to the world | 2x nearest crops, `ui_checks.py coverage` |
| 6 | **Light and mood** | not too dark to read (Octopath's #1 demo complaint) but light as a minority pool; shadows tinted; one motivated key with a visible source | `bstar_*`, `cool_share`, `dark_share` |
| 7 | **Motion feel** | idle life, anticipation, impact, timing; judge strips, never one still | orbkin-battle-vfx `fx_timeline`, strips |
| 8 | **Finish** | artefacts, shimmer, jaggies, mixels, text crispness | 2x crops, `hf_ratio`, legibility |

The three reads behind the rows: silhouette read (32-px), value read (squint, 64-128 px), detail read
(full res, must not compete with the first two).

## §values: composition and value

- One primary focal point (the pair of creatures), one secondary (the light motif), everything else
  subordinate. Keep 2 cells of clean floor around the kin spots; rubble and props at the edges.
- **Depth planes**: dark or defocused framing foreground; mid-value, high-detail midground where the
  subjects live; background fading toward the haze value. The reverse scheme works if planes stay distinct.
- **Phone portrait never shows empty magnified floor** (judge gap #2: "lower 40-55 % is empty floor"):
  aprons plus a foreground lip or dressing. Do **not** prescribe "dark simple foreground + fewer tufts"
  as a rule: the pilot skill did and lost 3/3 on phone (`skill-pilot-ablation.md` §3.2). Test per arena
  and per layout; the portrait and the desk frame get their own fit rule.
- **Detail is a gradient**: highest at the focal point and gameplay space, lowest at the edges and on
  big planes. Lit faces get detail; shadow faces get 2-3 flat shades. Uniform fbm on every surface is the
  amateur signature (meadow detail CV 0.20 = "noise as detail").
- **Subject/ground separation by value and hue**: a neutral or complementary, desaturated floor patch
  under warm kin; a key-side rim; a selective 1-texel outline from the ground ramp. Judges rewarded
  lighter-than-ground subjects in every set (`focal_dL_vs_ring` rho +0.65); Octopath's sprites are darker
  than their lit floor but win on edge contrast (ratio 1.8-9.5) and on the focus band around them.
- Notan: a dominant band (HD-2D fields ~0.5 dark), a secondary, a small accent; avoid an even
  three-way split (the cave was 0.37/0.42/0.21). Octopath store median 0.51/0.33/0.14, L* ≈ 36; the
  route map is 0.09/0.20/0.71, L* 69 (light-dominant pastel sky: the value outlier of the whole game).
- Shafts: ≤ 3, a visible source, landing **beside** the subjects (over the subject they wash out its
  value contrast and become the brightest mass). Peak additive contribution on the creature ≤ +8 L*.

## §colour-light: measured ranges (Octopath store shots vs Orbkin)

| Quantity | Orbkin now (cave / meadow) | Octopath (median, range) | Fan art | Move toward | Confidence |
|---|---|---|---|---|---|
| Lit-area b* (brightest 20 % L) | 36 / 36 | 16 (10-29) | 28 | **≤ 28** | medium-high |
| Chroma p95 | 49 / 50 | 37 (18-48) | 37 | **≤ 40**, mean 15-22 | medium-high |
| Cool pixels (b* < 0) | 0.2 % / 11 % | 14 % (0.1-35) | 5 % | **≥ 5 %** (shadows + far plane, even warm arenas) | medium |
| Dark band share (L* < 33) | 0.37 / 0.51 | 0.51 (0.30-0.93) | 0.40 | **≈ 0.45** (light as a minority pool) | medium |
| Hue top-2 share | 0.98 / 0.75 | varies | 0.94 | reserve one hue family for kin + UI (gamut file) | low (the reference is 0.94) |
| Focal chroma ratio | 0.88-1.07 | ≈ 1.0 | 1.23 | no target: Octopath does not use chroma for focus | low |
| Shafts across the subject | up to 4-5 | 2-4, beside | 2-3 | ≤ 3 beside | high (measured) |
| Bloom | threshold 1.0 + knee | selective | selective | keep; emitters only | high |
| UI share (desk battle) | 0.25 | n/a | 0.195 | ≤ 0.20 | medium |

Rules:
- Ramps hue-shift: shadows cool/violet, highlights warm; saturation peaks in the mid-tones. Very bright
  + saturated burns; very dark + saturated looks heavy.
- One motivated key per scene; shadows always tinted, never grey or black; temperature contrast between
  key and shadow (open reference: Bruno Simon folio-2025 lighting model, core-shadow smoothstep +
  albedo-tinted shadow colour + ground bounce). The "orange cave" is the canonical failure: lights and
  shadows share one hue, so the frame reads filtered.
- Per-arena gamut (`gamut_check.py`): allowed ramps + reserved accent hues; a painter or grade that emits
  outside it fails before any judge runs. Re-derive after an accepted grade change.
- Tone mapping: the hand-rolled hue-preserving ACES is fine; if replaced, `NeutralToneMapping` keeps
  authored palettes best and a per-arena `.cube` LUT after output keeps grading data-driven.
- Grade knobs live in `game/src/render/hd2d/pipeline.ts` (`Grade`: exposure, saturation, contrast,
  splitAmount/shadowTint, shadowDesat, vignette, tiltTop/Bottom, focusTop/Bottom, bottomShade); per-arena
  overrides in `arenas/*.ts`. Implementation belongs to orbkin-render-look.

## §dof: depth of field (the "HD" half)

- Octopath's profile at 640 px: focus band in the middle third (fields: 0.5-0.67 of height, where the
  party stands), bottom band 0.04-0.37 of peak sharpness, top 0.14-0.64. Orbkin before: 0.5-0.9 everywhere
  (flat). DQ3 HD-2D's team calls DoF "extremely important".
- Prescribe: depth-based DoF with a **subject mask** (billboard sprites lean toward the camera and would
  blur at the head); CoC max ≈ 1.6 % of frame height on desk; phone CoC in frame-*width* units with a
  ≥ 5-unit near ramp; gather at the grid, composite at device resolution (hybrid frame).
- **Never blur the subject or the hotspots**: blur that reached the route island's trees lost 0/4 ("mush").
  Pixel blur vs smooth device-res blur made no difference on title/route; *placement* did.
- Strength is an **owner** call: Opus verdicts on DoF strength are order-driven in 10 of 12 cells.
- Band values that won 4/4 (desk and phone): title `tiltTop 3.6 @ focusTop 0.60`, `tiltBottom 3.6 @
  focusBottom 0.36`, vignette 0.6; starter `3.6 @ 0.66` / `3.6 @ 0.34`, vignette ≥ 0.5; route map blur
  only above 0.84 and below 0.30 (`tilt2`). `focusTop/focusBottom` are fractions from the **bottom** of
  the frame (shader `vUv.y`); `screen_metrics.py` reports bands top -> bottom.

## §pixel-craft

- One texel density per frame; integer internal grid; nearest filtering; palette-preserving mips; every
  feature that must read is ≥ 2 texels wide or a 3+ texel run; no 1-texel jitter lines, no orphan pixels.
- Outline exactly 1 texel, a dark hue-shifted shade of the local or occluding colour, never pure black;
  key-side rim 1 texel. Sprites: five-tone hue-shifted ramp lit from the arena key, palette snap, eyes
  ≥ 3x3 texels at battle size, supersample 2x with a detail-preserving pick (never bilinear downscale).
- Environment animation on stepped clocks (6-10 fps), ≤ 1 texel of change per frame; water 8 fps.
- FX dissipate by **shape** (shrink, clumps, burn-through, rising smoke), never per-texel dither.
- Density is already right: people 31-44 texels at 1/180 of frame height sit inside Octopath's battle
  camera range (1/135-1/218); env texel = sprite texel (1.00). Do not spend effort on "higher res".

## §tells: generated-look tells to refuse

Balloon-animal creatures with seams at every joint; uniform fbm noise on every surface; bare cubes and
spheres; bloom on everything; empty floors; identical repeated rocks; flat grey shadows; a monochrome
orange frame; a 3D ribbon in a pixel scene; smooth 60 fps motion on a sprite; mixed texel sizes (near
clouds at 3-5x the sprite texel "read as a rendering bug"); candy-saturated UI; "pasted-on" sprites with
no rim or key light ("stickers on a lit diorama"); an emblem replacing a letter in the logo; a typed-text
logo with CSS shadow.

## §critique: the located critique (S2 output)

```
## Critique: <shot id> (<view>) vs anchor role <A1|A2|A3>
Three reads: thumbnail = <found / not found: what>; squint = <N masses, subject on mass X: where>; detail = <competes / supports>
| # | Row | PASS/FAIL | Where | Evidence (number or crop) |
| 1..8 | ... |
Three biggest deltas vs the anchor role, ranked by visual impact:
1. <delta> — <location> — <measured number vs range> — <specialist skill> — <expected effect in measurable terms>
2. ...
3. ...
Not a delta (already inside the range): <list>
```
Rules: never PASS a row without a location; compare against the anchor *role* (thumbnail composition,
values, light, DoF), never a native-size reference; the UI row is judged without any reference; the
numbers explain, the judge decides.

## §evidence: what was A/B-tested (defaults allowed in a skill)

| Decision | Default | Evidence (blind pairwise, both orders) |
|---|---|---|
| Title tilt band | `tiltTop 3.6@0.60`, `tiltBottom 3.6@0.36`, vignette 0.6 | better 4/4 desk, 4/4 phone; trio crop unchanged |
| Starter tilt band | `3.6@0.66` / `3.6@0.34`, vignette ≥ 0.5 | better 4/4 desk (full + crop), 4/4 phone |
| Route map desk camera | FOV 26°, pitch ≈ 30°, island ≈ 70 % of free width, blur only > 0.84 and < 0.30 | better 4/4 desk; the same framing lost 0/4 on phone (keep the whole island + margin on portrait) |
| Logo | code-drawn pixel wordmark v2: solid plate, banded ramp, gem *inside* a legible O | better 4/4 desk (full + crop), 4/4 phone; v1 (orb replacing the O) lost 0/4 phone ("RB KIN") |
| Evolution push-in | k ≈ 1.2, window light kept in frame | better 4/4 phone, 3/4 desk; the push that lost the window lost 0/4 |
| Near water | W2 flat bands + crescents + solid lace at 8 fps | won desk 4/4, phone 4/4, crop 4/4 |
| Grade ranges | b* ≤ 28, chroma p95 ≤ 40, cool ≥ 5 %, dark ≈ 0.45 | measured on Octopath; judge effect untested -> A/B every grade retune |
| Old web UI -> pixel handheld UI | shipped | 84/84 votes |
| Cream vs dark slab UI | **owner fork** | slab 78/84 without reference, 14-22 with it; never pxdark (33-3 loss) |
| Lightmaps under the live key | never | double-lit 3-0, indirect-only 3-0 |
| Arena shells from Blender/CC0 kits | no (code kit wins) | 7/7 pairs, 3-0 at confidence 4 |

Anything not in this table is a review question, not a default (the pilot's untested "mid-value base
colours", "dark simple foreground" and "fewer tufts" were followed and judged worse).
