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
- §subsystems: the six subsystems, their knobs and the metrics each one moves
- §grade-doctrine: how to reach the ranges without losing the frame
- §judge-punishes: verdict words mapped to metric signatures (predict before paying)
- §dof: depth of field
- §pixel-craft
- §tells: generated-look tells
- §critique: the located critique template
- §evidence: A/B-tested defaults (and tested failures)

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
- **Subject/ground separation by edge, rim and temperature, never by lifting the body value**: a calm
  neutral or complementary floor patch under the feet; a key-side 1-texel rim in the key's hue; `uLightRim`
  (a light inner rim) on dark kin; a selective 1-texel outline from the ground ramp; the sprite's key and
  rim in the emitter's hue so it reads as lit by the same light. Measured: `focal_edge_ratio` 1.8-9.5
  (Octopath), `focal_warmth_coupling` within +-12 b*, a rim visible on the 2x crop. **`focal_dL_vs_ring`
  is a diagnostic, not a goal.** The +0.65 correlation came from one judge set (n ~ 26, the only metric to
  clear Bonferroni there, +0.24 to +0.37 elsewhere: `judge-calibration.md` §3.3) and it describes frames
  that were already lit well. Octopath's own sprites measure -5.7 to -31.8 dL* against their lit floor
  (`reference-board-measurement.md`). The volcanic pilot (2026-10-15) chased dL* > 0 on Vulcrag: reaching
  +2.6 needed spriteGain 1.4-2.4 and shade x1.35-1.6, and the judge called it "washed out, bleached,
  pasted on", 0/4 desk and 0/4 phone, twice. The accepted frame it lost to sat at -16 dL*.
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
| Dark band share (L* < 33) | 0.37 / 0.51 | 0.51 (0.30-0.93) | 0.40 | **within 0.35-0.70, arena mood decides** (light as a minority pool); moved by light sources and dressing, never by lift or gamma | medium |
| Hue top-2 share | 0.98 / 0.75 | varies | 0.94 | reserve one hue family for kin + UI (gamut file) | low (the reference is 0.94) |
| Focal chroma ratio | 0.88-1.07 | ≈ 1.0 | 1.23 | no target: Octopath does not use chroma for focus | low |
| Shafts across the subject | up to 4-5 | 2-4, beside | 2-3 | ≤ 3 beside | high (measured) |
| Bloom | threshold 1.0 + knee | selective | selective | keep; emitters only | high |
| UI share (desk battle) | 0.25 | n/a | 0.195 | ≤ 0.20 | medium |

Rules:
- **Emitter-lit arenas are judged outside the emitter's pool.** `critique.py --arena <a>` (assets/emitters.json)
  reports `bstar_lights_excl_emitter`, `chroma_p95_excl_emitter`, `cool_share_excl_emitter`,
  `chromatic_share_excl_emitter` on the lit pixels outside the far falloff ring (desk 250 CSS px, phone
  150); the hints judge those. The lava pool, window pool or fire keeps its warmth by design and its falloff
  is protected (§grade-doctrine b). Volcanic accepted frame: lit b* 39.8 whole frame, 34.9 outside the pool,
  cool 0.000 outside: the delta is real but smaller than the whole-frame number says.
- Dark share: 0.35-0.70 by arena mood; a frame already outside (route map 0.20 light-dominant, evolution room
  0.77) is not a defect unless a change pushed it further out. Lift and gamma do not move it legitimately:
  pilot J went 0.59 -> 0.47 by raising blacks and the terraces lost their dark mass ("flattened").
- Ramps hue-shift: shadows cool/violet, highlights warm; saturation peaks in the mid-tones. Very bright
  + saturated burns; very dark + saturated looks heavy.
- One motivated key per scene; shadows always tinted, never grey or black; temperature contrast between
  key and shadow (open reference: Bruno Simon folio-2025 lighting model, core-shadow smoothstep +
  albedo-tinted shadow colour + ground bounce). The "orange cave" is the canonical failure: lights and
  shadows share one hue, so the frame reads filtered.
- Per-arena gamut (`gamut_check.py`): allowed ramps + reserved accent hues, derived from the ACCEPTED
  frame. `check` is the gate for painters, tiles and changes that must stay inside it; an intentional
  grade retune fails `check` by construction (it adds the cool cells the ranges ask for), so run `report
  --baseline ACCEPTED.png`, list the `new_cells` in the critique with the reason for each, and re-derive
  the gamut after the owner accepts the retune.
- Tone mapping: the hand-rolled hue-preserving ACES is fine; if replaced, `NeutralToneMapping` keeps
  authored palettes best and a per-arena `.cube` LUT after output keeps grading data-driven.
- Knobs: see §subsystems (Grade fields, light rig, SpriteLight, dressing). Implementation belongs to
  orbkin-render-look (environment) and orbkin-sprite-creature (sprites).

## §subsystems: one change = one subsystem

A verdict can be attributed only when one subsystem moved. The pilot bundled three (grade + rig +
spriteLight), lost 0/4 twice, and the critic praised the environment while damning the sprites: nobody
can say which knob lost. Order when the deltas span several: environment grade -> light rig -> sprite
light -> dressing, each gated on its own with the others at baseline.

| Subsystem | Where | Knobs | Moves mainly | Cannot move |
|---|---|---|---|---|
| Environment grade | `Grade` in `pipeline.ts`, per arena `arenas/<a>.ts` (`makeGrade`) | `lift`, `gain`, `gamma` (CDL after tone map), `saturation`, `contrast`, `shadowDesat` (0.3 default; chroma out of L < 0.36), `shadowTint`/`highTint`/`splitAmount` (luminance-preserving split), `bottomShade`/`bottomShadeHeight` (opt-in bottom darkening), `vignette`, `exposure`, `toneHue`, tilt/focus bands | `bstar_lights`, `bstar_shadows`, `cool_share`, `chroma_*`, `dark_share`, `L_mean`, phone lower-half darkness (`bottomShade`) | the ring around a kin (decals), sprite bands, the emitter's local falloff shape (only its tint) |
| Light rig | `arenas/<a>.ts`: key `SpotLight` (colour, intensity, angle), `HemisphereLight` (sky/ground colour), fill `DirectionalLight`, emissive materials | the warm falloff on the floor (`falloff.near_bstar`, `gradient_L`), `bstar_lights` of lit surfaces, shadow temperature contrast | sprite colour (sprites take `SpriteLight`, not the scene lights), decals |
| Sprite light | `SpriteLight` in `arenas/<a>.ts` -> `sprite.ts` toon bake | `keyDir`, `keyColor`, `sky`, `ground` (bounce into shadow tones), `rim` (key-side 1-texel rim), `outline` (default `#1a0d08`), `shade` / `highlight` (band multipliers; **default neutral (1,1,1)** despite the comment saying "cool violet lean"), `contact` (shadow colour), `front` (0.6: how far the key swings to a classic sprite light), `spriteGain` (1.0), per-subject `lift`, `setLightRim()` | `focal_by_subject[kin].dL_vs_ring`, `mean_bstar`, `Lstd_ratio`, `warmth_coupling`; the 2x crop bands | the floor, the ring, the frame ranges |
| Dressing decals | ground glow, ember/rubble decals, contact shadows (additive, renderOrder 3) | the ring numbers around each kin (`focal_mean_*_in_ring`), `focal_edge_ratio` | nothing global |
| Geometry / staging | arena builders, camera, layout boxes | everything; a staging change invalidates the pairwise capture (rule 9) | - |
| UI | `references/ui.md` | `ui_coverage`, `ui_minus_scene_luma`, legibility | the scene |

Safe step sizes (one A/B each beyond them): `saturation` within 0.85-1.0 of the accepted value, key
intensity within -25 %, `spriteGain` 0.9-1.15, `shade`/`highlight` within 0.9-1.1 per channel,
`splitAmount` up to +0.1, `lift` up to +0.03 per channel, `gamma` up to +0.15.

## §grade-doctrine: reaching the ranges without losing the frame

Evidence: volcanic pilot 2026-10-15 (`pilot/orbkin-art-direction-1`, ledger `game/docs/research/retunes/
volcanic.md`): the ranges were all reached (lit b* 40 -> 22, chroma p95 53 -> 32, cool 0.006 -> 0.15, dark
0.59 -> 0.47) with a global grade (saturation 0.86 -> 0.80, gamma 1.08 -> 1.28, blue gain cut undone, key
70 -> 40 and desaturated) and both rounds lost 0/4 on both views: "washed out", "warm bounce light gone",
"light source pasted on". The follow-up **environment-only capture (Fenv: F grade + rig, key 55 with its
colour kept, SpriteLight baseline)** also lost 0/4 desk and 0/4 phone ("desaturated grey floor disconnected
from the glowing light sources"), and `verdict_risk.py` had predicted it on both views. Re-critiqued with
the emitter table, EVERY captured variant A-J and Fenv sits at near_bstar 0.31-0.72x the accepted frame:
each one cut the key. The offline preview of the F grade alone (key 70) keeps near_bstar at 0.81x on desk
(0.86x at saturation 0.86) but flattens the phone's 6 L* floor gradient to 0.76x: the key cut is the
desk's killer, the gamma lift the phone's.

(a) **Come from the shadow side and the far plane.** Cool pixels and lower lit-b* are bought with
    `shadowTint` toward plum/violet, `splitAmount` up, a cool `lift` (blue channel), the hemisphere sky
    colour, far-plane haze and the shadow faces of props; never by cutting `saturation` below ~0.85,
    cutting the key more than 25 %, or desaturating the key colour. Those three each need their own A/B.
    Measured: the key intensity drives `near_bstar` almost linearly (70 -> 55 = 0.79x intensity gave 0.65x
    near b* on top of the grade's own 0.81x), so a key cut is never part of a "grade" change.
(b) **The emitter-local warm falloff is a protected feature.** Measure the floor around the light's base
    (`critique.py --emitter x,y`, rings at 100 and 250 CSS px) before and after: keep `near_bstar` >= 0.75x
    and `gradient_L` >= 0.8x the accepted frame. An emissive that no longer lights its surroundings reads
    as pasted on, whatever the ranges say.
(c) **Sprites keep the light's hue.** `SpriteLight.keyColor` and `rim` stay in the emitter's hue; cool the
    sprite's `shade`/`sky` side, not its key; `focal_warmth_coupling` stays within +-12 b*; subject mean
    b* stays >= 0.7x baseline while the floor is warm.
(d) **Phone has its own levers, and `bottomShade` is not one of them for a black apron.** `bottomShade`
    is multiplicative (positive lifts the bottom `bottomShadeHeight` of the frame, negative is the desk
    foreground shade): on the pilot's near-black phone apron +0.5 moved the dark share 0.670 -> 0.666 in
    preview, i.e. nothing. A near-black lower half needs light or matter: apron dressing and a lit lip
    (geometry/dressing subsystem), a light source in frame, or an additive `lift` (global, so it needs the
    desk A/B too). The pilot's desk grade moved the phone dark share 0.67 -> 0.58 only. Preview the phone
    frame separately (`grade_preview.py raw/<id>-phone.clean.png ...`) and plan it as its own change.
(e) **Preview before capturing.** `grade_preview.py` applies the display-space Grade maths to the
    accepted `.clean.png` in a second (CDL, contrast, saturation/shadowDesat, split tone, bottomShade).
    Verified bound: `--verify` round-trips the volcanic desk/phone frames at p99 3.27 / 3.03 of 255 and max
    10.95 (4 % clipped pixels excluded; the wrong grade fails at p99 14.8), so treat preview numbers as
    ±1 unit of b*/chroma and ±0.01 of a share. It writes `pv.json` + `pv_<variant>.json` in critique.py's
    keys, so `verdict_risk.py pv.json pv_<v>.json --arena <a> --change grade` predicts offline. Bracket
    there, capture at most 3 variants before the first gate round, Read each capture and run
    `craft_check.py`. Exposure, vignette, bloom, toneHue, lights and SpriteLight need a capture.
(f) **Predict the verdict** with `verdict_risk.py` (§judge-punishes) on both views before S5; a triggered
    signature is fixed or explicitly argued in the report.

## §judge-punishes: verdict words -> metric signatures (one-sided; `verdict_risk.py`)

Calibrated on three `worse` rounds (H, J, Fenv; desk and phone, every one predicted `worse` before the
judge) and checked for false positives on 11 accepted pairs (title tilt desk/phone, starter tilt desk/phone,
logo v2 desk/phone, route camera desk, evolution push-in desk/phone, shallows water W2 desk/phone): 5 fired
before the two baseline-relative fixes (route dark 0.20, evolution chromatic 0.15-0.24 and dark 0.77,
shallows chromatic 0.40 and dark 0.26-0.34), 0 after them with the right `--change` (`dof` exempts `mush`,
`ui` the scene rows, `camera`/`dressing` nothing). Those pairs carry no focal or falloff inputs, so only 4
of the 8 signatures were exercised on wins: recall on a winning sprite or grade change is still unknown.
A clean pass means "no known punishment", never "will win".

| Judge words | Signature (candidate vs accepted, same view) | Pilot numbers | Fix |
|---|---|---|---|
| "washed out", "desaturated", "muddier", "flattening materials" | `chroma_mean` < 0.65x, or `chromatic_share` < 0.40 AND < 0.80x baseline, or colourfulness < 0.70x | base 0.67 -> H/J 0.30-0.36, Fenv 0.39 chromatic share | shadow side, keep saturation >= 0.85 and the key |
| "bleached", "pale", "ghostly", "overexposed sprites" | subject `dL_vs_ring` > 0 with subject L* > 55, or dL rose > +12 by lifting the body | H +2.6 at L* 65 | edge/rim/temperature separation; spriteGain <= 1.15 |
| "flat", "overlay", "no material definition" | `focal_Lstd_ratio` < 0.8x or `focal_contrast_gmean` < 0.85x | H desk 0.75x | undo shade/highlight multipliers; 1-texel bands on the crop |
| "lit by a different light", "pasted onto the background", "no lava-side rim" | subject mean b* < 0.7x baseline while the ring is warm (b* > 12) | H 0.54x, J 0.63x | keyColor/rim in the emitter hue; rim visible at 2x |
| "warm bounce gone", "emissive no longer lights its surroundings", "flat grey-beige floor" | `falloff.near_bstar` < 0.75x or `gradient_L` < 0.8x (per view, `--arena`; missing inputs = UNPROVEN, exit 3) | J desk 39.8 -> 25.4 (0.64x); Fenv desk 0.65x, phone gradient 0.49x | keep the key; cool the far plane and shadows |
| "blurry", "smeared", "mush" | `hf_ratio` < 0.85x | every blur canary | never blur subjects/hotspots |
| "too dark to read" / "light-dominant, flat" | `dark_share` outside 0.35-0.70 AND (baseline inside, or moved further out by > 0.05) | phone 0.67 | light sources and dressing (apron matter, a lit lip), never lift/gamma |
| "the HUD is the brightest thing" | `ui_minus_scene_luma` up > 10 when already > 40 | - | retune UI tone with the scene |

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
1. <delta> — <location> — <measured number vs range, subject named (e.g. "Vulcrag (foe) dL* -16.3")> — <subsystem (§subsystems)> — <specialist skill> — <expected effect in measurable terms, desk AND phone>
2. ...
3. ...
Not a delta (already inside the range): <list>
Protected features to keep (numbers now): <falloff near_bstar / gradient_L per view (critique.py --arena), craft_check baseline numbers, layout boxes, calls/tris>
Gamut report (grade retunes): <new cells and why each is intended>
```
Rules: never PASS a row without a location; compare against the anchor *role* (thumbnail composition,
values, light, DoF), never a native-size reference; the UI row is judged without any reference; the
numbers explain, the judge decides. Write the critique before the first edit, and after the change
add `verdict_risk.py`'s `predicted` line per view (§judge-punishes) before any judge call.

## §evidence: what was A/B-tested (defaults allowed in a skill)

| Decision | Default | Evidence (blind pairwise, both orders) |
|---|---|---|
| Title tilt band | `tiltTop 3.6@0.60`, `tiltBottom 3.6@0.36`, vignette 0.6 | better 4/4 desk, 4/4 phone; trio crop unchanged |
| Starter tilt band | `3.6@0.66` / `3.6@0.34`, vignette ≥ 0.5 | better 4/4 desk (full + crop), 4/4 phone |
| Route map desk camera | FOV 26°, pitch ≈ 30°, island ≈ 70 % of free width, blur only > 0.84 and < 0.30 | better 4/4 desk; the same framing lost 0/4 on phone (keep the whole island + margin on portrait) |
| Logo | code-drawn pixel wordmark v2: solid plate, banded ramp, gem *inside* a legible O | better 4/4 desk (full + crop), 4/4 phone; v1 (orb replacing the O) lost 0/4 phone ("RB KIN") |
| Evolution push-in | k ≈ 1.2, window light kept in frame | better 4/4 phone, 3/4 desk; the push that lost the window lost 0/4 |
| Near water | W2 flat bands + crescents + solid lace at 8 fps | won desk 4/4, phone 4/4, crop 4/4 |
| Grade ranges | b* ≤ 28, chroma p95 ≤ 40, cool ≥ 5 % (outside the emitter), dark 0.35-0.70 | measured on Octopath; **reaching them with a global grade + key cut lost 0/4 desk and 0/4 phone three times** (volcanic H, J with sprites; Fenv environment-only, 2026-10-15: "washed out", "light source pasted on / disconnected") -> shadow-side doctrine, keep the key, A/B every retune |
| Environment-only volcanic retune (F grade + rig, key 55, sprites baseline) | **not shipped**; queued next = grade only, key 70 (`assets/retunes/volcanic-next.json`) | Fenv 0/4 desk, 0/4 phone; `verdict_risk` predicted both; `craft_check --change grade` PASS (the sprites were untouched) |
| verdict_risk.py as a pre-judge | run per view before S5, `--arena` + `--change` | 3/3 losing rounds predicted; 0/11 false positives on accepted pairs after calibration (4 of 8 signatures exercised) |
| craft_check.py as a sprite floor | FAIL = no judge call | base vs H/J fail on the judge's three named regressions (outline contrast 65 -> 25 L*, band 2 -> 4 texels, accent contrast 57 -> 16); base vs base and Fenv pass |
| Subject lighter than its ground (`focal_dL_vs_ring` > 0) | **never a target** | volcanic H: Vulcrag -16 -> +2.6 dL* via spriteGain 1.4 / shade x1.35: 0/4 desk, 0/4 phone, "bleached, pasted on"; Octopath sprites -6..-32 dL* |
| Bundled environment + sprite change | never | the same pilot: verdicts unattributable; environment-only was never gated |
| Craft after a spriteLight change | `craft_check.py` + 2x crop before any judge call | H/J: Maelstrode highlight band 2-3 px, Vulcrag lost its 1-texel ember cracks, outline read anti-aliased; the judge named all three; craft_check measures all three |
| Old web UI -> pixel handheld UI | shipped | 84/84 votes |
| Cream vs dark slab UI | **owner fork** | slab 78/84 without reference, 14-22 with it; never pxdark (33-3 loss) |
| Lightmaps under the live key | never | double-lit 3-0, indirect-only 3-0 |
| Arena shells from Blender/CC0 kits | no (code kit wins) | 7/7 pairs, 3-0 at confidence 4 |

Anything not in this table is a review question, not a default (the pilot's untested "mid-value base
colours", "dark simple foreground", "fewer tufts" and "subject lighter than its ground" were followed and
judged worse).
