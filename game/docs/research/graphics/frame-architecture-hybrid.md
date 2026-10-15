# Frame architecture A/B: 360p pixel buffer + device-resolution DoF/bloom/haze composite vs whole-frame low-res vs native

Angle: the notes disagree about the single most consequential render decision (whole-frame low-res grid vs
native + MSAA vs an untested hybrid). This note builds the hybrid in a scratch copy of the REAL hd2d pipeline,
captures frozen-clock frames of three of Orbkin's arenas on desktop and phone, judges them blind and pairwise
with the calibrated protocol, measures the depth-of-field band profile against Octopath, models DRAM traffic,
and ships `?bench=fa` cases so the owner can measure on the RTX PC and on a phone. It ends with the decision
table the render skill should encode.

Date: 2026-10-14. Everything marked **[run]** was executed in this container. Nothing in the game repo was
changed (`git status` clean for `game/`). All work is in `scratchpad/research/fa/` (index in §11).

Confidence tags: **[high]** primary source or reproduced here, **[med]** credible secondary or small-n run,
**[low]** anecdotal/modelled. Judge-preference results are **[med] at most** until the owner's blind kit
includes these pairs (task requirement, and judge-calibration §11).

---

## 0. TL;DR

1. **Built and working [run]:** a hybrid HD-2D frame in the real pipeline (`?fa=h`, scratch only): the scene and
   sprites stay in the 640×360 (desk) / 271×586 (phone) integer pixel buffer, nearest-sampled; depth of field,
   bloom and a separate haze layer (light shafts, motes, particles) are computed at the grid and composited with
   the grade at **device resolution** through a depth-aware (joint-bilateral) upsample. A sprite **subject mask**
   (alpha marker in the billboard shader) keeps every person/kin pixel-crisp — without it a depth DoF blurs the
   heads of upright billboards. Controls: `fa=l` (same effects, output at the grid), `fa=n` (native, MSAA4 on
   desktop). 3 arenas × desk/phone, frozen clock, 286 blind Opus votes (≈ $7.8 list-price equivalent).
2. **Depth of field now matches Octopath's profile [run, high for the measurement]:** bottom-band sharpness at the
   matched 640-px scale went from 0.76–0.82 (current) to **0.14–0.24** (Octopath field shots 0.31–0.36, battle
   camera 0.54); top 0.46–0.70 (Octopath 0.14–0.64); focus band the middle third. Phones over-blur with the same
   settings (bottom 0.06) and need their own CoC.
3. **Effects resolution is invisible in full frames and visible in crops [run, med]:** H vs L (identical effects,
   device-res vs grid) = no detectable difference in 6/6 full-frame pairs ("virtually identical", conf ≈ 1);
   in 2× crops of defocused bands H won 14/18 band votes (78%) ("L shows blocky mosaic and dither in the bokeh; H is
   smooth"), except the phone top band.
4. **Native resolution adds nothing at equal sprite density [run, med]:** H vs N with identical sprite texels = no
   detectable difference (3/3 desk). The one "native wins" verdict came from the sprite baker rounding to ≈ 1.5×
   more sprite texels at native res; N vs N0 (density only) reproduces it 4/4. That explains threejs-render's
   "much sharper" and is the third replication of the sprite-density lever.
5. **The DoF itself is a taste split for Opus [run, med]:** in 10 of 12 H/L-vs-C cells the second-shown frame won
   every vote ("authentic HD-2D tilt-shift" vs "heavy blur muddies the scene"); only the busy meadow desk frame (H, L, reduced strength) and the cave phone frame with
   phone-tuned DoF win in both orders. Position bias overall: the second-shown image won 78% of full-frame
   votes. **This needs the owner's eye**, not more Opus votes.
6. **Cost [model, med]:** per frame DRAM, phone 17 GB/s class: C 22 MB, L 30, H2 34, **H 49**, N 257, N + MSAA4
   500; desktop 720p: C 56, **H 74**, N 142, N + MSAA4 230. H = C + 0.7 ms (desktop iGPU) / + 3 ms (mid phone) of
   bandwidth; N + MSAA4 exceeds every phone bus at 60 fps.
7. **Decision:** desktop → **hybrid H** (cheap, correct where HD-2D lives, enables sub-texel camera motion);
   phone → **L now, H2/H on devices the bench proves**; **no native, no MSAA** on either tier. DoF strength stays
   an owner call (`?bench=fa` and the 12 blind pairs are ready).

---

## 1. The question and the four variants

The contradiction, stated precisely:

| Note | Claim | What was actually tested |
|---|---|---|
| threejs-render | native + MSAA is "much sharper" | stills of scratch scenes, no in-game judge |
| ingame-vertical-slice §8 | desktop 640×360 vs native 1280×720 + MSAA4: no detectable difference at 8.7× SwiftShader cost; phone 4→2 device px per texel won 3–0 | whole-frame native, sprite density changed with the grid (confound noted there) |
| reference-board-measurement §3.4–3.6 | real HD-2D renders the scene at output res; DoF, bloom, haze, shafts smooth at full res; only textures/sprites nearest. Orbkin has almost no DoF (bottom/top 0.71–0.82 of peak) and quantises effects to 640×360 | measurement only, "Would judges prefer it? untested" |
| mobile-perf-budget §3.2 | native + MSAA4 HDR composer ≈ 345 MB/frame (≈ 30× the low tier) | model |

Nobody had tested the middle path. Built here [run], selected by `?fa=`:

| Id | Name | Scene + sprites | DoF | Bloom | Haze (shafts, motes, particles) | Output |
|---|---|---|---|---|---|---|
| **C** | current (`fa=c`, default) | integer grid (640×360 desk, 271×586 phone) | old y-ramp tilt-shift ≤ 1.8 px inside the grid | inside the grid, added before grade | in the scene pass, inside the grid | grid canvas, CSS `image-rendering: pixelated` |
| **H** | **hybrid** (`fa=h`) | same grid, **nearest** (texelFetch = identical to the CSS upscale) | **depth-based**, subject-masked, gathered at the grid (= half device res on desktop: Filament's default `dofResolution = 2`), **joint-bilateral upsample** to device px | from the grid (≈ Filament's 384-px bloom buffer), **bilinear** upsample | separate layer at the grid, depth-tested, **bilinear** upsample | **device-resolution** composite + grade + 1-device-px dither, one full-res pass |
| **L** | pixelated control (`fa=l`) | same grid | identical DoF code and parameters | identical | identical | composite at the GRID, CSS nearest (= "same look, quantised") |
| **N** | native (`fa=n`) | device res (grid scale 1), MSAA4 on desktop | same DoF, gathered at half device res | from device res | at device res | device res |
| N0 | native, first attempt | as N but the sprite baker re-rounded its px-per-texel at native res | | | | |

Two things make H more than a resolution change and both are needed for a fair test:
1. **A real HD-2D depth of field.** Depth-based circle of confusion (CoC) with a focus band spanning the nearest
   and farthest subject (`[nearest − 0.3, farthest + 0.5]` world units), ramps of 2 (near) / 3.5 (far) units, max
   CoC 1.6% of frame height (≈ 5.8 grid px at 360) — tuned so the desk bottom-band sharpness lands at Octopath's
   values (§4).
2. **A subject mask.** Upright sprite billboards lean toward the camera in depth (head ≈ 0.9 units nearer than the
   feet at 35° elevation), so a pure depth DoF blurred the player's head when he stood low in frame [run, first
   tuning pass]. The billboard shader now writes an alpha marker (0.375, `NoBlending`, the sprite is alpha-tested
   anyway); the gather never spreads marked texels and the composite forces CoC = 0 on them. This is the
   "keep sprites and the focus band crisp" rule from reference-board §7.3, implemented.

L uses exactly the same DoF/bloom/haze code but outputs at the grid, so **H vs L isolates the resolution of the
effects**, **L vs C isolates the DoF itself (pixelated)**, **H vs C is the full proposal**, **H vs N isolates
pixel buffer vs native scene**.

## 2. Implementation (scratch, `research/fa/fa.patch`, 940 lines over 8 files)

`src/render/hd2d/hybrid.ts` (new, ≈ 330 lines) + hooks:
- `renderer.ts`: in `fa=h` the drawing buffer becomes `grid × k` (k = grid scale, or `fak` for a partial
  composite, e.g. `fak=2` = "H2"), the canvas keeps its CSS size, and `gl.getDrawingBufferSize` is patched to keep
  returning the GRID, so every consumer (sprite baker texel snapping, view-offset snapping, `shake()`, FX `uRes`)
  works unchanged. Only the final composite sees device pixels.
- `pipeline.ts`: `new HybridFrame(...)` when `fa≠c`; `render()` calls it instead of the composer.
- `sprite.ts`: alpha marker; for `fa=n` the shared sprite px-per-texel is rounded in multiples of the tier's grid
  scale (`__faSpriteK`), so native res does not add sprite texels (the N0 confound, §5.3).
- `hd2dBattle.ts`: publishes the focus subjects (kin spots, player, foe trainer) and keeps mote size constant in N.
- `game.ts`: `window.__faT = seconds` freezes the animation clock (`animClock.time`, dt = 0) for captures.
- `debug/bench.ts`: new cases (§7).

Per frame in H (all targets RGBA16F unless noted):

```
beforeRender (sprite bakes, unchanged)
1 scene  -> sceneRT  grid, DepthTexture (camera layer 0; haze objects moved to layer 1)
2 haze   -> hazeRT   grid: fullscreen depth copy (gl_FragDepth = scene depth), then layer-1 objects
                     (light-shaft ribbons, dust Points, kit particles), additive, depth-tested
3 bloom  -> UnrealBloom chain from sceneRT; final blend disabled (colorWrite=false); result kept as a texture
4 gather -> blurRT   at blur res: single-pass scatter-as-gather bokeh (Gustafsson 2018), golden-angle spiral,
                     sample weight smoothstep(r-0.5, r+0.5, sampleCoC); samples BEHIND the centre clamped to
                     2× the centre CoC; marked sprite texels have CoC 0; alpha = centre CoC
5 comp   -> canvas   device res: sharp = texelFetch(sceneRT, floor(uv*grid)); blur = 4-tap bilinear of blurRT
                     with weights × 1/(0.15+|CoC_tap − CoC_centre|) (joint bilateral); mix by
                     smoothstep(0.6, 1.6, CoC in OUTPUT px); + bilinear haze + bilinear bloom; then the existing
                     grade (vignette, hue-preserving ACES, CDL, split tone, bottom shade) and a 1-device-px Bayer
                     dither
```

Key GLSL (gather):
```glsl
for (int i = 0; i < 96; i++) {
  if (r >= rmax) break;
  vec2 tc = vUv + vec2(cos(ang), sin(ang)) * r / uBlurRes;
  float ds = texture2D(tDepth, tc).r;
  float sz = abs(texture2D(tScene, tc).a - 0.375) < 0.06 ? 0.0 : cocOf(ds) * uBlurH; // subjects never spread
  if (viewDist(ds) > zc) sz = clamp(sz, 0.0, cc * 2.0);   // background can't smear over a sharper centre
  col += mix(col / tot, texture2D(tScene, tc).rgb, smoothstep(r - 0.5, r + 0.5, sz));
  tot += 1.0; ang += 2.39996323; r += 0.5 / r;
}
```
Tunables in the URL for A/B: `dofk` (strength ×), `dofmax`, `dofni/dofnr/doffi/doffr` (band margins and ramps),
`fadbg=1` (debug view: R = alpha marker, G = blur mix, B = CoC).

Pitfalls hit [run] (each cost a round):
- `gl.getDrawingBufferSize` is read by 5 modules; changing the canvas size without patching it rescaled sprites.
- One of two `gl_FragColor` writes in the billboard shader kept alpha 1 (a `replace` silently missed): the
  debug view (`fadbg=1`) showed only outlines marked. Always look at the mask.
- A focus band from feet only blurs heads; a band from feet + heads stops blurring the floor under the player
  when he stands low in frame. The mask is the only clean answer.
- `pgrep -f` wait-loops match their own command line (scratch tooling, not the game).

## 3. Captures [run]

`research/fa/capture.mjs`: own static server, Playwright 1.56 Chromium, SwiftShader ANGLE; trainer battles
(`seed=5`): cave = Ridge Hiker Brann in the quarry, meadow = Scout Pim (chalk ring), coast = Angler Merrow.
Desk 1280×720 @1 (`q=high`, MSAA4 for N), phone 393×851 @2.75 touch (`q=low`). After the FIGHT button and
`waitIdle`, `__faT = 7.3` freezes the clock, 4 frames render, then the full page (with DOM HUD) and a
canvas-only "clean" frame are saved. Frozen clock = identical sprite animation frames across variants
(ingame-vertical-slice §13.5 flagged unfrozen idle frames as judge noise).

Contact sheets (C top-left, H top-right, L bottom-left, N0 bottom-right, 640-px thumbnails):
`research/fa/sheet_{cave,meadow,coast}-desk.png`. Full frames: `research/fa/shots/`, `shots_n2/`.

What the frames look like (my reading, then checked against the judges' reasons):
- **H** reads like a tilt-shift diorama: the back of the cave (lodge, shelves) and the coast's sea stacks become
  soft bokeh, the floor under the HUD dissolves, sprites and the focus band stay pixel-crisp. On the coast it is
  the closest thing to an Octopath establishing shot Orbkin has produced.
- **H vs L** at full-frame size is hard to tell apart; at 2× crops L's blur shows 2×2 (desk) / 4×4 (phone) steps
  and pixel-dither in the gradients, H's is smooth.
- **N0/N**: geometry edges are smooth (MSAA), texels are clean squares, but the stones read more "voxel mosaic"
  (same observation as ingame-vertical-slice §8).

SwiftShader frame ms (`benchFrames(3)`, min; load 4–17 on 4 shared cores — ratios are unreliable, see §6):

| Frame | C | H | L | N0/N (desk MSAA4) | load (1-min) |
|---|---|---|---|---|---|
| cave desk | 519 | 1994 | 993 | 1466 (N0) / 4357 (N) | 7–10 |
| meadow desk | 429 | 1046 | 709 | 1407 (N0) / 3992 (N) | 6–9 |
| coast desk | 259 | 714 | 550 | 1358 (N0) / 3152 (N) | 4–6 |
| cave phone | 113 | 734 | 417 | 7404 (N, 1081×2341) | 4–6 |
| meadow phone | 541 | 2081 | 842 | 5964 | 5–9 |
| coast phone | 257 | 2188 | 1554 | 3462 | 6–11 |

Same-run bench (`?bench=1&bcases=…`, phone viewport, one quieter run, `gpuMs` p50 from the SwiftShader timer):
cave-low 162 ms, fa-l 1053, fa-h2 1245, fa-h 1974, fa-n 4642 → L/C 6.5×, H2/C 7.7×, H/C 12×, N/C 29×. On a CPU
rasteriser the DoF gather (≈ 88 taps per grid pixel at the phone's 9.4-px max CoC) dominates; on a GPU the
gather is texture-cache bound and the composite is one fullscreen pass. **Do not read these as phone costs**;
they are why the bench exists.

## 4. Depth-of-field profile vs Octopath [run]

Metric = reference-board `dof_profile` (`mean|L−G(1)| / mean|L−G(4)|` per 12 horizontal bands, relative to the
peak band), re-implemented in `research/fa/scripts/dof.py`, run on canvas-only frames. Two scales:
- **640 px wide** (the refboard's "matched resolution", ≈ the pixel grid): measures the DoF itself.
- **native (≤ 1920)**: what refboard reported for the 4K store shots (`0.04–0.32`-style numbers). At native
  scale this metric is **confounded by the pixel grid and the dither**: 2×2 blocks and a 1-px Bayer dither are
  high-frequency energy, so a smoothly blurred but dithered band reads "sharp" (H cave bottom 0.58 native vs
  0.18 at 640; L meadow bottom 0.96 native vs 0.28 at 640). Use 640 for Orbkin; quote native only for references.

Octopath (private board, same script) — top / bottom band relative sharpness:

| Frame | 640 px | native |
|---|---|---|
| victory (battle camera) | 0.14 / 0.54 | 0.15 / 0.44 |
| bg4 desert (field) | 0.54 / 0.31 | 0.57 / 0.15 |
| bg1 village | 0.64 / 0.36 | 0.64 / 0.22 |
| store median (bg1–10) | ≈ 0.55 / 0.6 | 0.54 / 0.51 (refboard) |

Orbkin, 640-px scale [run]:

| Frame | C (current) | **H** | L | N | H at strength 0.6 (desk) / 0.45 (phone) |
|---|---|---|---|---|---|
| cave desk | 0.74 / 0.82 | **0.70 / 0.18** | 0.71 / 0.38 | 0.69 / 0.20 | 0.70 / 0.30 |
| meadow desk | 0.70 / 0.78 | **0.46 / 0.14** | 0.56 / 0.28 | 0.48 / 0.19 | 0.55 / 0.26 |
| coast desk | 0.90 / 0.76 | **0.68 / 0.24** | 0.90 / 0.44 | 0.68 / 0.29 | 0.66 / 0.37 |
| cave phone | 0.92 / 0.78 | 0.86 / 0.06 | 0.88 / 0.26 | — | 0.80 / 0.06 |
| meadow phone | 0.88 / 0.80 | 0.68 / 0.06 | 0.90 / 0.58 | — | 0.66 / 0.08 |
| coast phone | 1.00 / 0.92 | 0.11 / 0.08 | 0.77 / 0.42 | — | 0.22 / 0.09 |

Full 12-band profiles (top → bottom), cave desk: C `0.70 0.77 0.90 1.00 0.88 0.87 0.87 0.92 0.88 0.85 0.83 0.82`;
H `0.73 0.66 0.77 1.00 0.93 0.91 0.93 0.98 0.91 0.76 0.27 0.08`; Octopath bg4 at 640 `0.58 0.50 0.53 0.50 0.80 1.00
0.92 0.92 0.59 0.42 0.35 0.27`. The H fall-off is steeper than Octopath's (two bands vs four): Octopath ramps
its foreground blur over the bottom third; ours over the bottom sixth. A longer near ramp (`dofnr` 3–4) with the
same max CoC would match the shape better — that is a tuning pass for the skill, not an architecture question.

Reading: H and N put Orbkin's bottom band at **0.14–0.24 on desktop**, i.e. at or slightly past Octopath's
field shots (0.31–0.36 at 640) and stronger than its battle camera (0.54); the top band (0.46–0.70) sits in
Octopath's range (0.14–0.64). The in-focus band is the middle third on desktop, as in Octopath. **On the
portrait phone the same CoC (a fraction of frame height) over-blurs**: bottom 0.06–0.08 and the whole lower half
dissolves (the portrait camera covers a much deeper near range), so the phone needs its own, weaker CoC
(§5.4). L lands between C and H because its blur is quantised and dithered at the grid (the metric reads the
grid steps as detail), not because its blur is weaker.

## 5. Blind pairwise judging [run]

Protocol (judge-calibration §5–6, unchanged where possible): fresh tool-less `claude -p --model opus` per vote
(`jc/scripts/judgelib.py`), images inline at native size (desk 1280×720, phone 1081×2341, both ≤ 2576 px), the
art-director no-reference prompt, **both display orders × 2 votes = 4 calls per pair**, a canary per arena ×
layout (C vs C half-res-bilinear + 1.2 px blur), session env vars stripped (ingame-vertical-slice §2). Decision:
`better`/`worse` only if ≥ 75% AND won/lost in both orders AND mean confidence ≥ 2.5 (added after the judges
picked "the same image" unanimously at confidence 1 while writing "virtually identical, arbitrary"); otherwise
**`no_difference` is a first-class outcome**. Script: `research/fa/scripts/fa_judge.py`; votes in
`judge_full.jsonl` (+ `judge_crops.jsonl`); readable dump with every reason: `judge_summary.txt`.

### 5.1 Calibration
- Canaries: 6/6 arena × layout correct in both orders. Desk confidence 4.0; **phone confidence only 2.0–2.5**
  (the judge is less sure on tall portrait frames — treat phone verdicts as weaker).
- **Position bias is large on these pairs: the second-shown image won 143 of 184 full-frame votes (78%; calibration measured 60–64%) and 52 of 90 crop votes of decisive non-canary votes.**
  Almost every DoF pair split perfectly by order (CB → baseline, BC → candidate). This is the "near-equal pairs
  are position-driven" effect from judge-calibration §0.7, and it is exactly why the both-orders rule exists:
  without it these pairs would have produced a confident-looking but meaningless verdict either way.

### 5.2 Full frames

Each cell = decision (candidate win rate, mean confidence), 4 votes (2 per order). 3 arenas × 2 layouts.

| Pair (what it isolates) | cave desk | meadow desk | coast desk | cave phone | meadow phone | coast phone |
|---|---|---|---|---|---|---|
| **H vs C** (full proposal) | no diff (0.5, 3.0) | **better (1.0, 3.0)** | no diff (0.5, 3.2) | no diff (0.5, 3.5) | no diff (0.5, 3.5) | no diff (0.5, 3.5) |
| **L vs C** (DoF alone, pixelated) | no diff (0.5, 3.0) | **better (1.0, 3.0)** | no diff (0.75, 3.0) | no diff (0.5, 3.5) | no diff (0.5, 3.2) | no diff (0.5, 3.5) |
| **H vs L** (effects at device res vs grid) | no diff (0.0, **1.0**) | no diff (0.5, 1.0) | no diff (0.75, 1.0) | no diff (0.5, 1.0) | no diff (0.5, 1.2) | no diff (0.5, 1.0) |
| **H vs N** (pixel buffer vs native, same sprite texels) | no diff (0.75, 2.5) | no diff (0.25, 2.0) | no diff (0.0, 2.0) | not judged¹ | not judged¹ | not judged¹ |
| H vs N0 (native with ≈1.5× sprite texels) | **worse (0.0, 3.0)** | no diff (0.0, 2.0) | no diff (0.5, 2.0) | — | — | **worse (0.0, 2.8)** |
| N vs N0 (sprite density only) | **worse (0.0, 3.0)** | no diff (0.5, 1.0) | no diff (0.5, 1.0) | — | — | — |
| H(0.6) vs C, desk / H(0.45) vs C, phone | no diff (0.5, 2.5) | **better (1.0, 3.0)** | no diff (0.5, 3.0) | no diff (0.5, 3.5) | no diff (0.5, 3.0) | no diff (0.5, 3.5) |
| H(0.6) vs H / H(0.45) vs H | no diff (0.75, 1.5) | no diff (0.5, 2.0) | no diff (0.5, 2.0) | no diff (0.5, 2.0) | no diff (0.75, 2.2) | no diff (0.5, 3.0) |
| phone-tuned H (0.6, near ramp 5) vs C | — | — | — | **better (1.0, 2.8)** | no diff (0.5, 3.0) | no diff (0.5, 3.2) |

¹ Phone N could not be pinned to H's sprite texel density in this scratch build (two attempts; §5.3), so every
phone H-vs-N pair would measure density again. N is also out of every phone's bandwidth budget (§6), so the
phone question is H vs C vs L only.

What the reasons say (all in `judge_summary.txt`):
- **DoF pairs are a taste split resolved by display order.** In 11 of 12 H/L-vs-C cells the second-shown image
  won every vote. The same judge writes "tilt-shift depth of field delivers the authentic HD-2D look, isolates the
  sprites from a busy background" when the DoF frame is second, and "B keeps crisp, detailed materials; A's heavy
  blur muddies the scene and clashes with the sharp sprites" when it is first. Only the **meadow desk** frame
  (busy foliage behind the battle) wins in both orders, for H and for L, at full and reduced strength.
- **Effects resolution is invisible at full-frame size** (6/6 cells "virtually identical, arbitrary", confidence
  1.0–1.2). At 640-px-equivalent frame scale nobody can tell a 2×2-quantised blur from a smooth one.
- **Native vs hybrid with identical sprite texels: no detectable difference** (3/3 desk). The one decisive
  "native wins" in the first pass (cave, N0) came from **sprite texels**: the native build rounded the sprite
  pixel size differently, Pebblet got ≈ 1.5× the texels and "a readable face", and N vs N0 (only that difference)
  reproduces the verdict (N0 wins 4/4, conf 3). This independently confirms ingame-vertical-slice's finding that
  sprite texel density is the lever, and it fully explains the "native + MSAA is sharper" impression.
- Reduced DoF strength (0.6 desk, 0.45 phone) did not change any verdict and was indistinguishable from full
  strength (6/6 no difference, conf 1.5–3).

### 5.3 The native-resolution sprite confound (N0 → N)
Comparison crop: `research/fa/cmp_pebblet_h_n0_n.png` (Pebblet in H, N0, N at 3×). N0's sprite baker computed
`px = round(screenH / texelHeight)` at native resolution, where the rounding lands on a smaller texel (≈ 1.5×
the texels per sprite); N rounds in multiples of the tier's grid scale and is texel-identical to H. On the phone,
the first N run used the wrong grid scale (8 instead of 4) and also produced denser sprites — it beat H 4/4
("crisper sprites, more readable creature silhouette"), the same confound. Two lessons for the skill:
**(1) any resolution A/B must pin sprite texel density, or it measures density; (2) the density result is the
third independent replication** (lab, ingame-vertical-slice §6.4, here) — it deserves its own owner-judged pass.

### 5.4 Crops (2× nearest: top band, bottom band, sprite edge)
2× nearest crops of the canvas-only frames (`scripts/crops.py`; the sprite box comes from the `fadbg=1` subject
mask), 1 vote per order (2 calls per pair: weak individually; read the totals). Votes for the candidate:

| Crop | H vs C desk | H vs C phone | **H vs L desk** | **H vs L phone** | H vs N desk |
|---|---|---|---|---|---|
| top band | 1/6 | 2/6 | **5/6** | 1/6 | 3/6 |
| bottom band | 1/6 | 1/6 | 3/6 | **6/6** | 2/6 |
| sprite edge | **5/6** | **4/6** | 6/6 (conf 1–2) | 5/6 | 4/6 |

- **Out of context, a blurred band always loses to a sharp one** (H vs C top/bottom: 4/24). A crop removes the
  focus subject that makes blur read as depth of field, so band crops cannot judge DoF *strength*; they can judge
  DoF *quality* when both sides are blurred.
- **H vs L at crop scale is where the device-res composite shows**: 14/18 band votes (78%) for H outside the phone
  top band (15/24 including it), with reasons like "L shows blocky, mosaic artifacts / dither checker noise in the blurred foreground,
  reading as low-resolution upscaling; H's bokeh is smooth and clean". The phone top band went the other way (1/6):
  there the strong phone DoF also softened foreground bushes and judges preferred L's crisper focal plane — a
  CoC tuning issue, not a resolution one.
- **Sprite-edge crops favour H over C** (9/12): the sharp sprite on a soft ground "pops". The sprites themselves
  are pixel-identical (subject mask), so this is the separation effect Octopath relies on (refboard §3.6 "what
  singles them out is edge contrast and the focus band").

### 5.5 Weaker DoF (strength 0.6)
`dofk=0.6` (desk) and `dofk=0.45` (phone) captures (`shots_h6/`). Desk bottom band 0.26–0.37 (closer to
Octopath's field shots at 640: 0.31–0.36); phone still 0.06–0.09 because the phone's near ramp (2 units) puts
the whole lower half past full CoC — strength alone does not fix it. Judges: identical verdicts to full strength
(table above). A phone-specific pass, `dofk=0.6&dofnr=5&doffr=6` (strength 0.6, near ramp 5 units instead of 2;
`shots_h5/`): the fall-off below the subjects becomes gradual (cave bands 7–8: 0.55 / 0.18 instead of 0.27 /
0.07; the very bottom stays fully soft because the portrait frame's bottom third is right under the camera and
under the HUD). Judges: **cave phone H(phone-tuned) beat C in both orders (4/4, conf 2.8)** — the only decisive
phone result in the study; meadow and coast stayed order-driven; vs full-strength H: 3× no difference.

## 6. Cost: DRAM model and SwiftShader [run, model]

Method = mobile-perf-budget §3.2 (`bwmodel.py`): pass list × bytes written + full-res inputs read + depth stored;
GPU gets 50% of peak DRAM bandwidth. Extended in `research/fa/scripts/bw_hybrid.py` with the hybrid's passes
read from `hybrid.ts`, and — because the variants change the canvas size — the **browser compositor** counted
explicitly (read canvas + write screen). Desktop rows include the high tier's live 2048² shadow map (33.5 MB,
the largest single item).

| Device class | C current | L | H2 (composite 2× grid, CSS ×2) | **H** (composite at device res) | N (native, half-res DoF) | N + MSAA4 |
|---|---|---|---|---|---|---|
| phone 17 GB/s, 1081×2341 (MB/frame · ms bandwidth · GB/s @60) | 22.1 · 2.6 · 1.33 | 29.8 · 3.5 · 1.79 | 33.6 · 4.0 · 2.02 | **48.8 · 5.7 · 2.93** | 257 · 30.3 · 15.4 | 500 · 58.8 · 30.0 |
| phone 34 GB/s (A13–A15) | 22.1 · 1.3 | 29.8 · 1.8 | 33.6 · 2.0 | **48.8 · 2.9** | 257 · 15.1 | 500 · 29.4 |
| desktop iGPU 51 GB/s, 1280×720 | 56.4 · 2.2 | 67.9 · 2.7 | — | **73.5 · 2.9** | 142 · 5.6 | 230 · 9.0 |
| desktop iGPU 51 GB/s, 1920×1080 | 61.0 · 2.4 | 72.6 · 2.9 | 78.1 · 3.1 | **87.3 · 3.4** | 274 · 10.7 | 473 · 18.5 |

(This table counts the compositor, so C's phone figure is 22 MB rather than mobile-perf's 10.9 MB; compare rows
within this table.)

Reading:
- **H costs ≈ 2.2× C on a phone (+27 MB, ≈ +3 ms of bandwidth on the 17 GB/s class)** — almost all of it is
  the device-res canvas write plus the compositor reading a device-res canvas instead of a small one. It fits the
  T1 budget (≤ 60 MB/frame) but **not the low-tier budget (≤ 25 MB)**. H2 (composite at 2× the grid, CSS nearest
  ×2) recovers half of that (33.6 MB) while keeping smooth blur at 2-device-px granularity.
- **H is ≈ 5× cheaper than N and ≈ 10× cheaper than N + MSAA4** on a phone; N (257 MB) is over the bus at 60 fps
  on the 17 GB/s class before shading, N + MSAA4 (500 MB) is over every phone's bus.
- On desktop H adds ≈ 0.7 ms of bandwidth over C on an iGPU and is irrelevant on the RTX 3090 (936 GB/s).
- The DoF gather is ALU, not bandwidth: ≈ 36 taps × 3 fetches per grid pixel. On the grid (0.23 Mpx desk,
  0.16 Mpx phone) that is ≈ 20–25 M fetches/frame, mostly cache hits. Filament's equivalent on a Pixel 4 costs
  ≈ 4 ms at quarter-res of 1080p (0.5 Mpx) per its release notes, so budget ≤ 1.5 ms on a mid phone for the grid
  gather; the bench measures it.

SwiftShader (CPU raster, 4 cores shared with other agents at load 4–17; **not** transferable, ratios only):
desk H/C ≈ 2.2–3.8×, desk N(MSAA4)/C ≈ 2.8–5.2×, phone H/C ≈ 3.8–8.5× (the 2.5 Mpx composite with the full grade
is CPU-expensive in SwiftShader; on a GPU it is one fullscreen pass). Draw calls: +2 (depth copy, haze pass).

## 7. `?bench=fa` — what the owner runs [run: built, headless-verified]

Bench build: `research/fa/dist-bench/` (game + `src/debug/bench.ts` from mobile-perf-budget §6 + the `fa` switches).
New cases (all on the real cave trainer battle; meadow for an outdoor check):

| id | what it isolates |
|---|---|
| `cave-low` | baseline phone tier (C) |
| `cave-low-fa-l` | hybrid passes, output at the grid (DoF + haze layer + kept bloom, no device-res composite) |
| `cave-low-fa-h2` | composite at 2× grid, CSS ×2 (phone candidate) |
| `cave-low-fa-h` | full hybrid, composite at device px |
| `cave-low-fa-n` | native device px, same effects (no MSAA) |
| `cave-high` / `cave-high-fa-h` / `cave-high-fa-n-msaa4` | desktop tier: current / hybrid / native + MSAA4 |
| `meadow-low`, `meadow-low-fa-h` | outdoor arena (foliage, sun shafts) |
| `cave-low-again` | thermal drift |

`?bench=fa` runs exactly those (+ warm-up), ≈ 1.5–2 min on a phone; `?bench=quick` now includes the four phone
fa cases. Read-back (extends mobile-perf §6.4):
```
cost(DoF+haze layer, grid)   = cave-low-fa-l  − cave-low
cost(device-res composite)   = cave-low-fa-h  − cave-low-fa-l      (phone);  cave-high-fa-h − cave-high (desk)
cost(H2 instead of H)        = cave-low-fa-h2 − cave-low-fa-l
cost(native vs hybrid)       = cave-low-fa-n  − cave-low-fa-h
adopt H on a tier if  (cave-*-fa-h).sync ≤ tier budget AND raf.over20 ≤ 5% after the thermal check
```
How to run it: mobile-perf-budget §6.3 unchanged (serve the build on the LAN, or publish `dist-bench` as a
private Artifact; Chrome Android timer queries need `chrome://flags/#enable-webgl-developer-extensions`). On the
RTX PC: open `?bench=fa` in Chromium at 1280×720 and at 2560×1440 (window size matters: the grid scale is 2 and
4) — the 1440p run is the interesting one, because H's composite then runs at 3.7 Mpx while C still renders
640×360.

Headless verification [run] (`bench-fa-swiftshader.json`, SwiftShader phone viewport, `bcases=cave-low,cave-low-fa-l,
cave-low-fa-h2,cave-low-fa-h,cave-low-fa-n&bnoprobe=1`): all five cases complete with no errors, the GPU timer
returns values (`gpuMs` p50 162 / 1053 / 1245 / 1974 / 4642 ms), `links` 21–24 per case, draw calls 47–51.
Switching `fa` between cases inside one page works (the sprite marker and native sprite scale are evaluated at
construction, not module load — a bug found and fixed while wiring the bench). Ratios are meaningless on a CPU
rasteriser; the point is that the owner's devices can now produce the real ones.

## 8. Decision table (what the render skill should encode)

Rows are what the skill should prescribe today; "verify" cells are bench thresholds that would flip a row.
Confidence: judge preference **[med]** at most (Opus-only, 3 arenas, strong position bias; the owner's blind kit
must include H/C, L/C and H/L crop pairs before it is [high]); costs **[med]** (model) until the bench runs.

| Decision | Desktop tier (`q=high`, ≥ 720p) | Phone tier (`q=low`, portrait) | Evidence | Flip it if |
|---|---|---|---|---|
| **Frame architecture** | **Hybrid H**: pixel buffer at the integer grid (360 tall), device-res composite (DoF + bloom + haze + grade + dither) | **L now, H2 on proven devices (T1)**: same passes, composite at the grid (L) or 2× grid with CSS ×2 (H2); full-res H only where the bench allows | H ≡ L at full-frame size (6/6, conf ≈1); H > L at crop scale in defocused bands (14/18 band votes outside the phone top band); H is +17–26 MB/frame on desktop (≈ +0.7 ms on an iGPU), +27 MB on a phone (2.2× C) | phone: `cave-low-fa-h.sync − cave-low-fa-l.sync ≤ 1.5 ms` and `raf.over20 ≤ 5%` → H on that device class |
| **Native resolution (N / N + MSAA4)** | **No.** No detectable difference vs H with equal sprite texels (3/3 desk); its earlier "win" was sprite density | **No.** 257–500 MB/frame (5–10× H, over the 17 GB/s bus at 60 fps) | §5.2–5.3, §6; ingame-vertical-slice §8 | the RTX/iGPU bench shows N ≤ 1.2× H AND an owner blind pick prefers N at equal sprite density |
| **MSAA** | Not needed (texels are the AA unit; sprites are pixel-snapped) | Never on render targets | mobile-perf §1.1 | — |
| **Depth of field** | **On, depth-based + subject mask**, CoC max ≈ 1.6% of frame height, focus band = [nearest subject − 0.3, farthest + 0.5], near ramp 2–4 units (longer = Octopath-like four-band fall-off), far ramp 3.5 | **On but phone-tuned**: CoC in a fraction of frame WIDTH (or ≈ 0.6× and a ≥ 5-unit near ramp) so the lower half does not dissolve; the one decisive phone win used strength 0.6 + a 5-unit near ramp (§5.5) | DoF itself is a taste split for Opus (order-driven in 10/12 cells, decisive only in the busy meadow, both strengths); measured profile matches Octopath at 640 px | owner blind kit: if the owner picks C over H in ≥ 2 of 3 arenas, ship DoF at ≤ 0.6 strength and only for busy backgrounds |
| **DoF resolution** | Gather at the grid (= half device res; Filament `dofResolution 2`) | Gather at the grid (= quarter device res); ring count ≤ 3 (≤ 25 taps; Filament mobile default) | Filament defaults; SwiftShader shows the gather dominating at 88 taps | `cave-low-fa-l − cave-low > 1.5 ms` → cap max CoC at 6 grid px or gather at ½ grid |
| **Bloom** | From the grid buffer, kept as a texture, bilinear upsample in the composite (≈ Filament's 384-px buffer) | Same at ¼ res | free in H (no extra full-res pass) | — |
| **Shafts, motes, particles** | Separate haze layer at the grid, depth-copied, bilinear upsample | Same | layer costs a depth copy + 1 draw; makes beams smooth without full-res fill | — |
| **Dither** | 1 device px in H (gradients are smooth); grid px in C/L | grid px (L) | crop reasons cite L's "dither/checker noise" in bokeh | — |
| **UI** | Already device-res DOM (unchanged) | same | — | — |
| **Sprite texel density** (not this angle, but it decided the native pairs) | Run the owner-judged density pass next (1.5× / 2×) | same | 3rd independent replication (N vs N0 4/4) | — |
| **A/B hygiene for any resolution change** | Pin sprite texel density; freeze the clock; check the dialog/state matches before judging | same | §5.3, §3 (two invalid frames caught by a dialog-box diff) | — |

## 9. Implications for Orbkin

1. **The contradiction resolves, mostly in favour of the reference-board reading, but not for the reason it gave.**
   "Native + MSAA is much sharper" was sprite density; at equal sprite texels Opus cannot tell native from a
   360-px pixel buffer (3/3 desk). "Real HD-2D keeps effects at full resolution" is right, and it matters **only
   where the image is blurred**: full frames can't show it (6/6 identical), 2× crops of defocused bands can
   (78% of band votes for H outside the over-blurred phone top band). So the architecture to build is the **hybrid**, because it is the only variant that is
   both cheap (≈ C + 0.7 ms desktop) and correct where HD-2D's signature lives, not because it wins today's
   full-frame vote.
2. **The real lever in this angle is the depth of field itself, and Opus is split on it.** HD-2D's look is a
   strong DoF; Orbkin had none at the bottom of the frame (0.78–0.92 relative sharpness) and now matches
   Octopath's 640-px profile (bottom 0.14–0.37 desk). Judges love it when it is shown second and call it "muddy"
   when it is shown first; only the busy meadow wins outright. That is a genuine aesthetic question for the
   owner, not something the gate can settle. Put H vs C and L vs C into the owner's blind kit (cave, meadow,
   coast, desk + phone; 12 pairs, both orders).
3. **Build order** (each step shippable, each behind `?fa=` until the owner signs off):
   (a) port `hybrid.ts` into `pipeline.ts` as the composite path, `fa=l` on phones, `fa=h` on desktop;
   (b) subject mask in `sprite.ts` (it is also what any future DoF needs);
   (c) phone CoC in frame-width units + longer near ramp; (d) haze layer for shafts/motes/particles in every arena;
   (e) run `?bench=fa` on the RTX PC (1280×720 and 2560×1440) and on the owner's phone; enable H2/H on proven
   phones; (f) remove the old y-ramp tilt from `GradeShader` once H/L ship.
4. **Mobile stays on the grid.** L (DoF + haze + bloom at the grid, CSS nearest) is 29.8 MB/frame vs C's 22.1;
   H2 33.6; full H 48.8 (> the low-tier 25 MB budget, inside T1's 60). The phone canary confidence (2.0–2.5) also
   says portrait verdicts are weaker; don't move the phone tier on Opus votes alone.
5. **Motion bonus (gap 4 in the completeness review):** a device-res composite can offset the nearest-sampled pixel
   buffer by a sub-texel amount (the `_PixelPanOffset` trick in the Unity pipeline, t3ssel8r-style), so camera
   pans and shakes can be smooth while the grid stays stable. C cannot do that (its upscale is CSS). That is a
   second reason to prefer H on desktop; it was not tested here (stills only).
6. **Skill text (render skill)**: encode the decision table rows, the subject-mask rule ("a depth DoF on billboard
   sprites needs a subject mask; upright billboards lean toward the camera"), the A/B hygiene row, and the
   position-bias warning ("DoF/blur pairs are order-driven for VLM judges; only both-order wins count; crops of
   defocused regions judge blur quality, not blur strength").

## 10. Open questions

- **Owner's eye.** Does the owner prefer H/L (strong diorama DoF) over C? Opus is split by display order. Add
  H-vs-C, L-vs-C (full frames) and H-vs-L (bottom-band 2× crops) for cave/meadow/coast to the blind kit.
- **Device numbers.** `?bench=fa` on the RTX 3090 PC (Chromium, 1280×720 and 2560×1440) and the owner's phone:
  the real costs of the gather, the haze layer and the device-res composite. The model says H ≈ +3 ms of
  bandwidth on a 17 GB/s phone; the gather's ALU cost is unknown on real GPUs.
- **Phone DoF tuning.** The portrait camera needs its own CoC (width-relative, longer near ramp); one quick pass
  is in §5.5, a proper sweep with the owner is not done.
- **Near-field bokeh.** The gather does not spread blurred foreground over in-focus pixels (Filament's separate
  foreground layer does). Invisible in these battle framings (no foreground occluders over the focus band); it
  will matter for route maps and title cameras with foreground foliage.
- **Motion.** All judging was on stills. Shimmer of the CoC boundary as the camera moves, sub-texel pan via the
  composite, and DoF breathing during camera moves are untested (a frame-strip protocol per judge-calibration §11).
- **Other screens.** Only battles were wired (`hd2dBattle.ts` publishes focus subjects). Title, route maps,
  menus and Hall of Fame need focus subjects too; the route-map island is the HD-2D-signature shot where DoF is
  most expected.
- **Phone native at equal sprite density** was not achieved (the sprite baker's px rounding needs a cleaner hook);
  low priority because N is out of the phone budget anyway.

## 11. Files (all under `scratchpad/research/fa/`)

| Path | What |
|---|---|
| `game/` | scratch copy of `game/` at HEAD `2fb1cc9` (node_modules symlinked) + `fa.patch` (940 lines, 8 files) |
| `game/src/render/hd2d/hybrid.ts` | the hybrid frame (DoF gather, depth copy, haze layer, bloom kept, composite+grade) |
| `dist-final/`, `dist-n2/`, `dist-bench/` | builds: captures (N0 sprite rounding), captures with the N fix, bench |
| `capture.mjs` | `node capture.mjs DIST OUT c,h,l,n cave,meadow,coast desk,phone [T] [benchRuns] [extraQuery]` |
| `shots/`, `shots_n2/`, `shots_h6/`, `dbg6/` | frames (`*.png` with HUD, `*.clean.png` canvas only, `*.canary.png`), crops in `shots/crops/` |
| `scripts/fa_judge.py`, `scripts/summarize.py` | blind pairwise judge + summary; `judge_full.jsonl`, `judge_crops.jsonl`, `judge_summary.txt` |
| `scripts/dof.py` | DoF band profile at 640 px and native |
| `scripts/crops.py` | 2× crops (top, bottom, sprite edge from the `fadbg` marker frames) |
| `scripts/bw_hybrid.py`, `bw_hybrid.json` | DRAM model |
| `sheet_*.png`, `cmp_*.png` | contact sheets and comparison crops |
| `Options.h`, `src/ppm.cpp`, `src/dofCombine.mat` | Filament sources read (DoF/bloom defaults, combine shader) |

## 12. Sources

Primary (read here):
- Filament `include/filament/Options.h` (main, fetched 2026-10-14): `DepthOfFieldOptions.nativeResolution = false`,
  ring counts "5 on desktop and 3 on mobile", max CoC "32 on desktop and 24 on mobile"; `BloomOptions.resolution
  = 384`, `levels = 6`, `quality = LOW`; dynamic resolution `minScale 0.5`. https://github.com/google/filament/blob/main/filament/include/filament/Options.h
- Filament `src/PostProcessManager.cpp`: `dofResolution = nativeResolution ? 1 : 2` ("full- or quarter-resolution"),
  16-px CoC tiles, `dofCombine` composite that reads the full-res colour for "trivial" (in-focus) tiles and the DoF
  layer for "fast" tiles. https://github.com/google/filament/blob/main/filament/src/PostProcessManager.cpp ,
  https://github.com/google/filament/blob/main/filament/src/materials/dof/dofCombine.mat
- Filament RELEASE_NOTES (via mobile-perf-budget): rewritten DoF ≈ 4 ms on a Pixel 4.
- three.js r180 `examples/jsm/postprocessing/RenderPixelatedPass.js` (in `game/node_modules`): renders the beauty
  pass at `width / pixelSize` into a NearestFilter HalfFloat target with a DepthTexture and writes it into the
  composer's FULL-resolution buffer — i.e. three's own pixel example is already a mixed-resolution pipeline
  where later composer passes run at full res. `UnrealBloomPass.js` render order read for the "keep bloom
  separate" trick.
- pmndrs/postprocessing 6.38.0 (`npm pack`): `DepthOfFieldEffect`, `GodRaysEffect`, `BloomEffect` default
  `resolutionScale = 0.5`.
- `bababuyyy/unity-isometric-pixel-pipeline` README (raw.githubusercontent): 640×360 internal, 1-px outline at the
  internal res, "sharp upscale (fwidth + smoothstep)" with a `_PixelPanOffset` sub-texel pan compensation applied
  in the upscale shader. https://github.com/bababuyyy/unity-isometric-pixel-pipeline
- D. Gustafsson, "Bokeh depth of field in a single pass" (tuxedolabs blog, 2018) — the gather used here (from
  memory of the published shader; the blog was not fetched).
- Internal: `reference-board-measurement.md` (DoF metric, Octopath numbers, private board), `ingame-vertical-slice.md`
  (§8 resolution test, judge hygiene), `mobile-perf-budget.md` (bandwidth model, bench), `judge-calibration.md`
  (protocol, canary, position bias).

Secondary (search summaries; lower confidence):
- Wikipedia "HD-2D": dynamic lighting, depth of field and tilt-shift are the defining tools. https://en.wikipedia.org/wiki/HD-2D
- Steam community: Octopath Traveler II Engine.ini tweaks `r.DepthOfFieldQuality=0`, `r.BloomQuality=0` remove the
  look (indicates stock UE DoF/bloom; not developer documentation). https://steamcommunity.com/app/1971650/discussions/0/3777994452130450169/
- Triangle Strategy producers on HD-2D needing to look good from all camera angles (4Gamer via Nintendo Everything).
  https://nintendoeverything.com/triangle-strategy-devs-on-how-the-game-uses-accurate-hd-2d/
- Tim Soret (The Last Night): fwidth + MSAA instead of pixel-perfect AA; t3ssel8r's method "the same solution" for
  "perfectly smooth, yet perfectly crisp 3D pixel art" (X posts via search index; x.com blocked).
  https://x.com/timsoret/status/1662112715848949762
- "Texel Splatting: Perspective-Stable 3D Pixel Art" (D. Ebert, arXiv 2603.14587, 2026): grid snapping only fixes
  orthographic cameras; perspective needs another approach (unverified, no reproduction). https://arxiv.org/abs/2603.14587
- GPU Gems 3 ch. 23 "High-Speed, Off-Screen Particles" (low-res particles + depth-aware composite; blocky edges
  without a fix-up). https://developer.nvidia.com/gpugems/gpugems3/part-iv-image-effects/chapter-23-high-speed-screen-particles
- GDC 2016 "Mixed Resolution Rendering in Skylanders: SuperChargers" (bilateral upsampling for fill-heavy effects).
  https://gdcvault.com/play/1022982/Mixed-Resolution-Rendering-in-Skylanders
- Unity URP DoF reference: Gaussian = far-field only, "best for lower-end platforms"; Bokeh = near+far.
  https://docs.unity3d.com/Manual/urp/depth-of-field-volume-override-reference.html
- UE Mobile DoF (Gaussian, fixed kernel, "very fast on lower-end hardware").
  https://dev.epicgames.com/documentation/unreal-engine/mobile-depth-of-field-in-unreal-engine
- Phaazoid/Godoiosis issue #176 — a Claude-written Godot HD-2D plan ("textures stay low-res while lighting, DoF
  and bloom render at full HD"); an agent's opinion, not evidence; listed because it shows the idea is in the air.
