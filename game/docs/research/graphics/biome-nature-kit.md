# Outdoor biomes in HD-2D: water, foliage, sky, lava, weather — tested in the real arenas

Angle: ten of Orbkin's eleven arenas are outdoor or mixed, but the in-game vertical slice only
tested the cave, and the judge calibration found that meadow and volcanic got WORSE during the
refinement rounds. This note collects how professional pixel-art / HD-2D games and pixel artists
build water, grass and canopies, skies, lava and weather, reads the open code that exists, and then
prototypes three elements inside a scratch copy of the real game (`?gfx=hd2d`), captured on desktop
and phone and judged blind and pairwise against the current arenas.

Everything marked **[run]** was executed in this container on 2026-10-14 against HEAD `a13f067`
(scratch copy in `scratchpad/biome/game`, nothing committed, the repo is untouched). Confidence is
marked per claim. Web sources that could not be fetched (most of the web is behind the proxy) are
marked "search summary".

---

## 0. TL;DR

1. **Near water: prescribe "flat bands + crescents + solid lace", on a stepped clock.** The W2 water
   (4 flat depth bands from the shore field, slow-sine contours, 1-texel crescent highlights cycling
   1→3 texels over 8 frames at 8 fps, a solid shore lace plus one receding dashed foam line, glints
   only where the sun reflects) beat the current shallows water **blind on desktop (4/4), phone (4/4)
   and the 2× element crop (4/4)**, both display orders, canary passed, defect floor passed [run].
   Judges' words, both orders: "clean banded depth tones, foam rings around rocks and shoreline" vs
   "noisy, speckled, scattered orphan pixels". It is also **cheaper**: 3.2× a basic plane per pixel vs
   4.2× for the current water (isolated SwiftShader bench), same draw calls and triangles. (high for
   near/top-down water)
2. **Far sea at a grazing angle: no reliable gain; keep the glitter path.** On the cliff the element
   crop preferred the current dense sun-glitter field (1/4, 2/4), and full-frame verdicts flipped
   between variants (W1 better 4/4, W2 phone worse 0/4) because a darker sea exposed the god-ray
   ribbons as "hard rectangles". Fix soft shaft edges before touching far water. (medium)
3. **Lava: do NOT prescribe crust plates or rafts.** Voronoi crust plates (L1) lost the element crop
   0/4 ("jagged hairline cracks look like lightning"); big drifting rafts on the current lava (L2)
   lost desktop 0/4 and crop 0/4 ("dark grey-blue blotches" — dark detail inside an emissive,
   bloomed surface greys out). At Orbkin's density lava reads best as banded molten flow; the
   volcanic regression is a palette/value problem, not the lava material. (high for the negative)
4. **Meadow: the calm-turf + clumped-grass rule wins the element crop (4/4) but the prototype was
   too weak and confounded at frame level** (desk order-driven, phone 0/4 after an rng reshuffle moved
   the foreground flowers; detail CV −0.009). Prescribe the saint11 vegetation rules (≤ 3 adjacent
   turf shades, detail on borders, clear interiors, clumps with open turf, ground-coloured grass,
   no orphan pixels) and re-test with frozen dressing. (medium)
5. **No HD-2D game has published how its water, grass or lava is built** (EN + JP searches: UFE 2018
   Octopath slides only say sea effects are pixel art and DOF is kept deep so pixels stay crisp). The
   usable craft rules come from pixel artists' own tutorial images — saint11's (CC BY 4.0, read frame
   by frame: water = 2 colours, 10 fps, ≤ 1 px change per frame, crescent highlights; clouds = flat
   base, low contrast, few clusters; vegetation = detailed borders, clear interiors, no orphan
   pixels, resting areas) and Slynyrd's (foliage 1-px moves at 0.2 s/frame) — and from MIT code
   (stylized-water's land-side waterline stripe, a t3ssel8r-style pipeline's ground-coloured grass
   and travelling gust field, canvascycle's palette cycling). (high that these are the rules;
   medium that they transfer, now partly tested)
6. **Process lessons:** judge environment elements with an element crop *and* the full frame, freeze
   sprite animation frames and dressing rng between A and B (of 14 full-frame verdicts, 6 were
   order-driven no_difference and at least 4 decisive ones cited things outside the element), re-check overlays (shafts, bloom) after value changes, and run environment
   animation on 6–10 fps stepped clocks.
---

## 1. What the shipped games and their makers actually say (and what is not published)

| Game | What is verifiable about its outdoor elements | Source quality |
|---|---|---|
| Octopath Traveler (Acquire, UE4) | UNREAL FEST EAST 2018 slides: "海、バトル などのエフェクトもドット" (sea and battle effects are pixel art too); "被写界深度深め（近くも遠くもくっきりしたドット）" (deep DOF so pixels stay crisp near and far, the tilt-shift is only at the extremes); almost all 3D assets derive from ONE master material with child/grandchild instances. 4Gamer review: people and scenery are pixel art, natural phenomena (snow, water) and sunlight use 3D CG. Characters are 18×32 dots (CG WORLD). | search summaries of the slide deck / articles (docswell, slideshare, 4gamer, cgworld) — the decks themselves were unreachable. medium |
| Octopath Traveler II | Devs: "making the graphics too finely detailed lost what makes the pixel art great"; scenes must be "picture-perfect no matter when you screenshotted it"; day/night switch was a core axis. No water/foliage specifics published. | Famitsu/Nintendo Life interview summaries. medium (quotes), none on technique |
| Triangle Strategy | Producers: the rotatable camera forced maps "observable from all sides", the style "costs more than you'd think". No element breakdowns. | interviews. low relevance |
| Sea of Stars (Sabotage) | "custom-made render pipeline"; reviews/fans describe real-time water reflections and dynamic lighting over hand-drawn tiles. No developer breakdown found. | press kit + reviews. low |
| Eastward (Pixpil) | "a 3D game with a 2D perspective"; assets drawn in Aseprite, split into layers, rebuilt in 3D and "hand painted in the bump map one by one"; shader textures + lighting in their engine (Maoi) for weather/time of day. | Game Developer interview summary. medium |
| Owlboy (D-Pad) | Sticks to one pixel grid, no tile sets; scenes split into parallax layers with "subtle movement and particle effects"; palette choice "usually the most crucial step"; backgrounds reuse cloud art without it being noticeable. | D-Pad tumblr summaries. medium |

**Honest gap:** no shipped HD-2D title has a public technical breakdown of its water, grass or lava
shaders (searched EN + JP, 2018–2026: CEDEC, UFE, GDC, Unreal developer interviews). Anything more
specific online is reverse-engineering or speculation. The *rules* below therefore come from the
pixel artists who teach the craft (with their actual images, which are CC BY 4.0 and in a public
repo), from open code with licences, and from our own in-game tests.

## 2. Per-element pixel-art rules, from primary tutorial images

Primary source read directly: **saint11 (Pedro Medeiros) tutorials**, `github.com/saint11/Saint11Tutorials`
(CC BY 4.0, cloned; frames extracted in `scratchpad/biome/s11/`). Water, Clouds, Vegetation 1–3,
Wind, Fire, Ice, Parallax were read frame by frame; `water_detail.gif` was analysed numerically.
Secondary (search summaries; the site is blocked): Slynyrd Pixelblog 2 (texture, clouds), 10
(water in motion), 11 (landscape), 33 (wind effects), 44 (trees), 62 (JRPG landscape backgrounds).

### 2.1 Water
- **Two layers** (saint11 "Animating Water"): a BOTTOM layer that only offsets at a constant speed
  and a TOP layer of highlights. Highlights are imagined as **"circles changing size"** → drawn as
  short crescents. **"Avoid big changes, never move stuff more than 1 pixel"** per frame.
- `water_detail.gif` measured [run]: **2 colours only** (base + one lighter shade), 18 frames at
  **100 ms (10 fps)**, a 6-frame visible loop; 4–12% of pixels change per frame; each highlight is
  a 2–5-pixel crescent; the wave edge is a smooth sine contour, no dither.
- "I like to add small bright areas to corners and waves, also try to move them slightly";
  "animate small waves individually using only ONE pixel chunk per ripple (avoid breaking it in
  multiple parts)"; "foam can be animated as a particle system (like smoke)"; waterfalls = many
  falling particles; things underwater are displaced on a sine.
- Slynyrd 10 (summary): sine-wave base shapes, looping surface animation.
- Translation for a 3D plane: depth = a FEW flat bands from the shore distance (not a gradient,
  not per-texel noise); highlights = sparse 1-texel crescents one shade up, cycling size 1→3 over
  ~6 frames at 8–10 fps; foam = a solid shore lace + receding dashed lines; glints only where the
  sun actually reflects.
- Colour cycling (Mark Ferrari's water, re-implemented in Joe Huckaby's MIT `canvascycle`, read
  [run]): water/rain/waterfalls are drawn ONCE with runs of adjacent palette indices and animated by
  rotating the palette range (`cycleAmount = (t / (1000 / rate)) mod size`, rate in DPaint units of
  280 = 1 step/s, plus ping-pong and sine modes and a "BlendShift" cross-fade). In a shader this is
  `idx' = low + mod(idx - low + floor(t * stepsPerSec), size)` on an indexed (R8) texture — the
  cheapest possible animated water (1 fetch + 1 palette lookup).

### 2.2 Grass, bushes, canopies
- saint11 Vegetation 1: **Shape → Light → Detail**; the silhouette must read as a tree with no
  colour; "the light must show the tree has volume"; **"keep the colour count as low as
  possible"**; **"detailed borders, clear internal areas"**; "almost half of the gradient is light
  green"; warm light / **cold shadow**; **"create resting areas for the eyes"**; "I try to detail
  without adding too much noise"; **"I avoid orphan pixels"**; "think in layers of foliage"; "keep
  a leaf pattern for consistency"; "repeating patterns is a good way to avoid noise"; leaves fall
  in a sine wave and spin.
- Vegetation 2 (ground): layers highlight/base/shadow/dirt; "avoid too many colours, orphan pixels,
  noise"; **"big empty areas give focus to other areas"**; "don't overdo the details"; "each detail
  must be conscious, don't throw random dots around"; "borders have more detail and contrast".
- Vegetation 3: "fade far vegetation towards sky colour"; dither is OK for moss texture; trunks:
  light/dark areas first, then cracks and lumps, light points, a backlight of a different colour.
- Slynyrd 33 (wind): leaf clumps move **1 px up-right, 1 px down, 1 px left** in sequence per
  layer; **0.2 s per frame**; looping flow points 12 px apart moving 2 px/frame over 6 frames.
  Slynyrd 2/44: canopies from circles of varied size + leaf-shaped clusters, or a few modular leaf
  sprites duplicated and layered.
- t3ssel8r-style open implementation (`bababuyyy/unity-isometric-pixel-pipeline`, MIT, 2026, read
  [run]): billboard grass where **sprites carry only alpha/shape and take their COLOUR from the
  terrain's world-space patch colour**, so grass blends into the ground instead of reading as
  confetti; grass is **excluded from the outline pass** ("each sprite would generate its own
  outline, creating visual noise"); wind = product of two scrolling noise samples in diverging
  directions at the instance root, thresholded so gusts travel across the field; cloud shadows
  sampled at the instance root.
- SimonDev Quick_Grass (MIT, read [run]): blade geometry + wind lean from a low-frequency noise
  direction field plus a faster per-blade noise; LOD by distance. Good for realism, too fine for a
  640×360 pixel grid; take only the *world-space travelling wind field* idea.

### 2.3 Skies and clouds
- saint11 Clouds: groups of spheres with a **flat base**; light on the spheres; **"avoid using too
  many pixel clusters"**; flat colour for the base; hue-shift the shadows; **keep low contrast**;
  sun behind the cloud → bright outline; the shadow sits below the cloud in the flat area; far
  clouds faded, close clouds strong contrast; paint background → foreground.
- saint11 Parallax: close = high saturation, high contrast, bright, warm, many details; far = low
  saturation, low contrast, darker, cold, few details, fading to the sky colour; foreground layer
  with scroll factor > 1 adds depth. Slynyrd 62 (JRPG battle backdrops, ≤ 16 colours, 192×144):
  start with solid horizontal bars for the horizon, split ground and sky into colour bands, a few
  cloud layers with the nearest among the mountains. Slynyrd 11: far objects take the haze colour,
  less saturation, fewer colours.

### 2.4 Lava and fire
- saint11 Fire: "drawing fire is about FLOW"; each wave starts brighter at the bottom and fades to a
  pointy top; new waves every 2–3 frames; "the flame speed is higher in the middle"; "the bright
  colours come from the bottom"; embers flick and move slightly; a cheap technique: redraw the same
  shape "failing just a little" each frame. The fire tutorial's own rock base shows the pixel-art
  lava convention: **near-black rock with thin orange/yellow cracks**, not a field of orange.
- saint11 Water → waterfalls = many falling particles (applies to lavafalls).

### 2.5 Snow, rain, leaves, pollen, fog
- saint11 Ice: a 6-step ice ramp (snow light, snow shadow, ice glow, ice base, ice shadow, ice deep
  shadow); "snow deposits on horizontally angled surfaces"; **snowfall = slightly randomised
  zig-zag paths, with some rogue flakes that even go up**; reflections cycle through ice planes.
- Rain (low-quality tutorial summaries, low confidence): 1-px diagonal streaks at one wind angle,
  ~3–4-frame loops, far layer thinner and dimmer, splash rings timed to landings.
- saint11 Wind: "we can't see the air moving, so use dust, foliage and other particles"; wind hitting
  the floor creates dust waves.
- Fog bands / aerial perspective: see parallax rules above; Octopath's slides keep near and far
  pixels crisp (deep DOF) — haze, not blur, carries depth.

## 3. three.js r180 implementation patterns (one draw call per element type) and phone cost

| Element | Pattern (already in Orbkin unless noted) | Draw calls | Phone cost notes |
|---|---|---|---|
| Water | one plane, ShaderMaterial, everything computed per **world texel** (`floor(world.xz / TEXEL)`), shore distance from one R8/RGBA `DataTexture` (linear-filtered data, the shader quantises), fog chunk included | 1 | full-screen ALU: the current shader is 4.2× a `MeshBasicMaterial` plane at 640×360 on SwiftShader, the prototype 3.2× (§5.4). Cheapest form: an indexed R8 water tile + palette cycling (1 fetch). |
| Grass/bushes/canopies | `Foliage` / `FoliageBatch`: all billboards merged in ONE BufferGeometry over one RGBA atlas; cylindrical billboarding + sway in the vertex shader, **sway snapped to whole texels** (`floor(sw / TEXEL + 0.5) * TEXEL`); alpha-test + matching depth material for shadows | 1 colour + 1 per shadow pass | alpha-test (discard) disables early-Z on tile GPUs: keep big canopy cards few and far, put dense grass low on screen; merged static buffer beats `InstancedMesh` at these counts (< 1k cards). Missing: **stepped time** (sway is continuous, so it snaps at irregular moments) and a world-space gust field. |
| Sky | painted posterised sky plane sized to the frustum + `cloudBillboards` (one mesh, clouds move in whole cloud texels) | 2 | trivial; repaint only on resize. three's `Sky`/`SkyMesh` (physical scattering) is the wrong look and costs per-pixel scattering. |
| Lava | `LavaBatch` strips/pools with per-vertex edge + speed, quantised ramp shader + additive skirt | 2 | the prototype's 3×3 Voronoi costs 2.1× the current lava shader per pixel (§5.4); lava covers < 8% of the frame so the frame impact is small; a 2×2 search or a baked plate texture halves it. |
| Particles (snow, rain, pollen, embers, leaves) | `particleSystem` / `particles`: one `Points` each, motion a pure function of time in the vertex shader, `gl_PointSize = floor(size + 0.5)`, square or 1-texel-patterned points | 1 per kind | points are cheap; keep counts ≤ 100 on low tier; fragment discard inside points is fine at 1–3 px. |
| Fog bands / haze | `fogBands` (one mesh of layered quads) + scene fog | 1 | additive/alpha layers: count full-screen overdraw, ≤ 2 layers on low. |
| Mip-safe nearest sampling | painted tiles: `NearestFilter` + the palette-preserving mip chain (R3-A); procedural surfaces sample per texel centre so they never shimmer | — | — |

Phone budget (from `mobile-perf-budget.md` §5): low tier ≤ 60 draw calls (hard 100), ≤ 100k
triangles incl. shadow pass, ≤ 3 full-res passes. None of the prototypes adds a draw call or a
triangle.

## 4. Hands-on: three elements prototyped in the real arenas [run]

### 4.1 Setup
- Scratch copy: `scratchpad/biome/game` = `git archive HEAD game` (a13f067), `node_modules`
  symlinked; builds `build-base` (unchanged), `build-bk` (W1, L1, M1), `build-bk2` (+W2), `build-bk3`
  (+L2). All switches are URL flags read once in `arenas/localKit.ts`:
  `BK = new Set(new URLSearchParams(location.search).get('bk').split(','))`, `BK_FPS` (`bkfps`, default 8).
  Diff: `scratchpad/biome/biome.patch`. Without a `bk` flag the code path is byte-identical in output
  (A frames from `build-bk` = base).
- Frames: `?seed=7&scene=battle&gfx=hd2d` + `route=coast&hotspot=shallows` (shallows),
  `route=coast&hotspot=sea-cliff` (cliff), `route=ridge&hotspot=vent-cave` (volcanic),
  `route=meadow&hotspot=tall-grass` (meadow). Desktop 1280×720 `q=high` (640×360 grid), phone
  393×851 @2.75 `q=low` (271×586). Capture: `biome/capture.mjs` (vslice harness with a `BASE_Q` env).
- Judging: the calibrated gate `jc/scripts/visual_judge.py` (fresh tool-less `claude -p` Opus per
  vote, reference shown as R, **both display orders × 2 reps**, canary = baseline vs a softened copy
  must be judged correctly in both orders) for full frames, plus `biome/element_judge.py` (same
  decision rule, 2× nearest crops of the element region only, no reference) for the element itself.
  Decision: `better` = candidate won ≥ 75% AND won in both orders; `worse` mirror; else
  `no_difference`. Every canary passed (12/12 runs). 112 judge calls, ≈ $5.45 list price.
- Defect floor: `jc/scripts/artgate_compare.py` on every pair (value range, squint std, hf ratio,
  colourfulness drop): **all 14 pairs PASS**.

### 4.2 Variants
| Id | Element | What changed (all inside the existing single draw call) |
|---|---|---|
| **W1** `bk=water` | water (shallows, cliff, coast all use `localKit.pixelWater`) | new fragment shader `WATER_FRAG_BK`: 4 FLAT depth bands from the shore field with uneven widths (shelf < 7% of `uDeep`, mid < 20%, then < 45%, then a wide deep fill) and contours wobbling by two slow sines (±0.17 units, no per-texel noise, no dither); sun pool = +1 whole band; crescent highlights (one 1-texel arc per jittered 11×9-texel cell, radius 1→2→3 then gone over an 8-frame life, one shade up, density 75% near shore → 35% deep); shore lace a solid band from the land edge to 0.55 ± 0.08 units (it must start ~0.3 outside the field edge because land meshes overhang the coarse field — see pitfalls); one receding foam line per wave stepped outward and broken into 5-texel dashes that thin as it travels; glints only inside the sun pool / glitter path (2-frame blinks); horizon haze in 4 flat steps; **everything on a stepped clock at 8 fps** |
| **W2** `bk=water2` | water | W1 + deep-water crescents two shades up (read on phones) + the sun-glitter PATH restored on far water (band under the path +1 shade, dense 2-frame sparkles growing with distance) |
| **L1** `bk=lava` | lava (volcanic) | crust-plate lava: Voronoi plates in flow space (10×7 texels; falls 16×7), whole-texel drift on the stepped clock, plates near-black basalt with a glowing 1-texel lip, hot seams 0.5–1.7 texels palette-pulsing 5↔6 (4-frame cycle); falls = 2-texel vertical streak columns of their own speed (period 16–28 texels) |
| **L2** `bk=lava2` | lava | the CURRENT molten-band shader + a few big drifting crust rafts (ellipses 6–18 × 4–12 texels, lit lip, 45% of 18×12 cells) away from banks and never on falls |
| **M1** `bk=meadow` | meadow ground cover | calm turf tile (`paintTurf` lo 3.1 / hi 4.4 instead of 2.2 / 4.6, flecks 0.015 instead of 0.06 → ~3 adjacent shades); tall-grass/tufts gathered into 3 clumps (front-left, front-right, back-right) with acceptance `max(0.12, 1.15 − 0.75·d/r)` so open turf stays between them; back-row canopies tinted darker (no visible effect, the tint was overridden) — **note: the extra rng draws also reshuffled the flower clumps** (a confound) |

### 4.3 Verdicts (blind, pairwise, both orders; candidate vs the current arena)
| Element / variant | Desktop full frame | Phone full frame | Element crop (desk 2×) | Reading |
|---|---|---|---|---|
| Shallows water **W1** | **better** (4/4) | no_difference (2/4, order-driven) | **better** (4/4) | crop reasons, both orders: "clean banded depth tones, foam rings around rocks and shoreline" vs "noisy, speckled, scattered orphan pixels" |
| Shallows water **W2** | **better** (4/4) | **better** (4/4) | **better** (4/4) | the only variant that won all three; phone reasons: "depth gradients, cohesive ripples" vs "uniformly noisy water" |
| Cliff (far sea) **W1** | better (4/4) | better (4/4) | no_difference (1/4 for W1) | full-frame wins cite god rays and "Pebblet reads cleaner" (sprite animation frame), not the water; the crop preferred the current dense glitter path |
| Cliff (far sea) **W2** | no_difference (3/4) | **worse** (0/4) | no_difference (2/4) | darker sea exposed the god-ray ribbons as "hard rectangular blocks" — an existing artifact the old bright glitter hid |
| Volcanic lava **L1** (plates) | no_difference | no_difference | **worse** (0/4) | "jagged hairline cracks look like lightning", "procedural noise", "less like a liquid" |
| Volcanic lava **L2** (rafts) | **worse** (0/4) | no_difference | **worse** (0/4) | "dark grey-blue orphan blotches" — dark crust under the bloom halo greys out |
| Meadow **M1** | no_difference (second-shown always won) | **worse** (0/4) | **better** (4/4) | crop: "cleaner clusters, readable stepped shapes; baseline grass edges noisier with scattered orphan blades"; phone full frame lost on reshuffled foreground flowers and light shafts (confound) |

Calibration reminders for reading this table: kin sprites are animated, so full frames differ in
sprite frames too (judges named "Pebblet reads cleaner" in 9 votes); a full-frame verdict that the
element crop contradicts is not evidence for the element. Only the shallows water result is
consistent across desk, phone and crop.

### 4.4 Cost [run]
**Draw calls and triangles** (whole frame incl. shadow pass, sprite bakes, post): identical for
every variant — shallows 39 / 35 (desk / phone), cliff 50 / 44, volcanic 37 / 35, meadow 42 / 36;
triangles unchanged (shallows 88k / 48k, cliff 140k / 77k, volcanic 115k / 48k, meadow 37k / 26k).
All four arenas are inside the phone budget (≤ 60 calls, ≤ 100k triangles on low).

**Isolated shader cost** (`biome/sbench`: one 40×40-unit plane filling a 640×360 SwiftShader canvas,
camera like the battle camera, min of 6 interleaved rounds × 20 frames, load 24):

| Shader | ms / frame | × MeshBasicMaterial | above basic |
|---|---|---|---|
| `MeshBasicMaterial` | 11.5 | 1.0 | — |
| current water (`WATER_FRAG`) | 48.2 | 4.2 | 36.7 |
| prototype water W1 (`WATER_FRAG_BK`) | 36.5 | 3.2 | 25.1 (−32%) |
| current lava (`LAVA_FRAG`) | 21.1 | 1.8 | 9.6 |
| plate lava L1 (`LAVA_FRAG_BK`, 3×3 Voronoi) | 43.7 | 3.8 | 32.2 (+235%) |

The flat-band water is *cheaper* than the current one (no 3 value-noise octaves, no per-texel
noise threshold). The Voronoi lava is 3.4× the current per pixel; lava covers a small share of the
frame, so it would have been affordable, but it lost anyway.

**In-game frame cost**: interleaved bench (`biome/bench.mjs`, 2 rounds, `benchFrames(6)` ×3 per
page, min; load 5–15 from other agents, so ±30% noise):

| Arena | layout | current | variant(s) |
|---|---|---|---|
| shallows | desk 640×360 | 481 ms | W1 454, W2 454 |
| shallows | phone 271×586 | 139 ms | W1 101, W2 145 |
| volcanic | desk | 214 ms | L1 215, L2 231 |
| volcanic | phone | 99 ms | L1 92, L2 90 |
| meadow | desk | 327 ms | M1 324 |
| meadow | phone | 117 ms | M1 95 |

No variant is measurably more expensive than the current arena at the frame level (all within the
load noise); the isolated bench above is the reliable per-pixel comparison.

### 4.5 Pitfalls hit (each cost an iteration)
1. **Shore foam hidden under land.** The shore field is a 0.3-unit grid and the sand/rock meshes
   interpolate heights over 0.45-unit cells, so land overhangs the field's zero line by up to
   ~0.3 units: a 0.12–0.3-unit lace was invisible at the sandbar (debug render with red foam
   showed only the receding lines). Fix used: start the lace at the field edge and run it to
   0.55 units. Better fix (stylized-water, MIT): paint the waterline stripe on the LAND material at
   `y ∈ [waterY + sin(t)·a, waterY + foamDepth]`, so it can never be occluded.
2. **Darkening water re-exposes additive overlays.** Lowering the sea's value made the god-ray
   ribbons read as "hard rectangles" on the cliff (W2 phone 0/4). Any water/lava value change must be
   re-checked with the arena's shafts and fog bands on.
3. **Dark detail inside an emissive surface turns grey.** Crust rafts and plates under the bloom +
   additive skirt halo come out grey-blue; judges call them blotches and orphan pixels.
4. **Hairline features at 1 texel read as noise.** The plate seams (≤ 1.7 texels, jittered) read as
   "lightning". Pixel-art rule: a feature that must read as a *shape* needs ≥ 2 texels of width or
   a 3+ texel run.
5. **Changing rng draw order reshuffles unrelated dressing.** M1's `continue` before an rng draw
   moved the flower clumps and changed the phone foreground; isolate per-feature `Rng` streams.
6. Heredocs: a backtick in an unquoted heredoc ran a command substitution (the GLSL template); quote
   heredocs that carry shader text.
7. Frame-time benches are useless while other agents load the machine (the same A frame measured
   226–463 ms in one capture); interleave variants in one process and take the minimum, or use
   the isolated shader bench.

## 5. Per-element recipes (texel rules, ramps, rates, cost)

Units: 1 texel = `TEXEL` = 1/16 world unit; battle camera ≈ 33–42° down; 640×360 internal grid.
"Stepped clock" = `T = floor(t * fps) / fps`.

### 5.1 Near water (shallows, coast, ponds) — PRESCRIBE (W2, decisive on desk, phone and crop)
- **Bands, not noise.** 4 flat depth bands from the shore distance `d` (world units, `uDeep` ≈ 4):
  shelf `d < 0.07·uDeep`, mid `< 0.2`, `< 0.45`, then the deep fill (≈ 60% of the visible water).
  Contour wobble ≤ ±0.17 units from two slow sines (`0.10 sin(1.3x + 0.6z + 0.5T) + 0.07 sin(2.1z −
  0.9x − 0.35T)`). No dither, no per-texel noise threshold inside a band.
- **Ramp**: 6 shades deep → light, hue-shifted (deep navy-teal → turquoise → pale aqua), e.g.
  shallows `#0e2a3e #143e56 #1a5c70 #1f8090 #3caaa6 #8ad6c4`; foam is a separate near-white
  (`#f2f8f2`), the highlight is never the foam colour.
- **Light**: sun pool / cloud break = +1 whole band (never a smooth lift); horizon haze in ≤ 4 flat
  steps.
- **Highlights**: crescents — one 1-texel arc per jittered 11×9-texel cell, radius 1→2→3 then gone
  over 8 frames (each frame ≤ 1 texel of change), +1 shade (+2 in the deepest band so it reads on
  phones), density 75% of cells at the shore → 35% in deep water.
- **Foam**: a solid lace 3–5 texels from the land edge (paint it on the land material, or start it
  outside the land-mesh overhang), a 1-texel shadow rim (25% toward the darkest shade) under it, one
  receding dashed line per wave (5-texel dashes, step outward ~0.9 units per wave, dashes drop out as
  it travels), whitecaps only as rare crescents in storm water.
- **Glints**: only where the sun reflects (pool, glitter path), 2-frame blinks, ≤ 1.2% of texels
  in the zone.
- **Rate**: 8 fps stepped (saint11 water: 10 fps, 100 ms frames; Slynyrd foliage 0.2 s/frame).
- **Cost**: 1 draw call, 0 triangles added; 3.2× a basic plane per pixel on SwiftShader (the old
  shader 4.2×). Phone: OK (fill is the water's screen share; on a portrait phone the water is ~45%
  of the frame).

### 5.2 Far / open sea seen at a grazing angle (cliff vistas) — keep current, fix the shafts first
- The current dense sun-glitter path + chop dashes beat flat bands in the element crop (1/4 and 2/4
  for the band versions). At a grazing angle the sea is mostly sky reflection: keep a lifted
  glitter path, sky-coloured haze toward the horizon, sparse chop dashes.
- Before any sea retune: make the god-ray ribbons soft-edged (they read as "hard rectangles" as soon
  as the water behind them darkens).

### 5.3 Lava — keep the current molten bands; do NOT prescribe crust plates or rafts
- Both crust variants lost the element crop 0/4. At Orbkin's density (channels 6–7 texels across,
  falls ~10) lava must read as a *flowing liquid of bands*: banded heat ramp along the flow, dark
  cooled banks, long streaks on falls, few bright texels at band edges.
- If crust is wanted later: only on pools ≥ 24 texels across, plates ≥ 8 texels, dark RED-brown
  (`#2a0c08`), never grey/black, outside the bloom halo, seams ≥ 2 texels.
- Volcanic's regression is not the lava material; the judges' and art-direction's complaints are
  monochrome orange (99% of chroma in two hue bins), Vulcrag "a dark blob" and wash from bloom.
  Next lever: a cool counter-light / violet shadow split and fewer bright texels on the fall
  (bloom budget), tested in-game.

### 5.4 Meadow ground cover — prescribe the RULE, not this prototype
- Element crop: the clumped, calmer version won 4/4 ("cleaner clusters, readable stepped shapes"
  vs "scattered orphan blades"); full frames were order-driven (desk) or lost to a confounded
  foreground reshuffle (phone). Measured detail CV barely moved (−0.009), so M1 was too weak to
  change the frame-level read.
- Rules (saint11 Vegetation 1–2, t3ssel8r-style grass): turf tops ≤ 3 adjacent shades with flecks
  ≤ 2%; detail on the BORDERS (lips, fringe, clump edges), clear interiors; grass in 2–4 clumps per
  frame with open turf between; grass sprites take their colour from the ground under their root
  (so they read as the ground's texture, not confetti) and are excluded from any outline; far
  vegetation fades toward the sky colour; leave "resting areas for the eyes".
- Wind: clump sway 1 texel in a 3-step loop (up-right, down, left) at 5 fps (0.2 s/frame), phase
  driven by a world-space gust field (product of two noise samples scrolling in diverging
  directions) so gusts travel across the field; the current per-sprite continuous sine snaps at
  irregular moments.
- Cost: free (same atlas, same single foliage draw call; fewer cards = less alpha-test overdraw).

### 5.5 Skies, clouds, fog bands (recipe from sources; not A/B-tested here)
- Sky = horizontal bands (Slynyrd 62: start with solid horizon bars, ≤ 16 colours for a whole
  backdrop), posterised, no smooth gradient; clouds = sphere groups with a FLAT base, flat base
  colour, lit tops, hue-shifted low-contrast shadows, few clusters (saint11); far clouds fainter and
  lower contrast, near clouds stronger; move clouds in whole cloud texels (already in
  `cloudBillboards`). Fog bands: 2–3 flat layers that take the sky colour, each farther layer less
  saturated and fewer colours (Slynyrd 11, saint11 Parallax). Depth via haze, not blur (Octopath:
  deep DOF, pixels crisp near and far).

### 5.6 Weather and ambient particles (recipe from sources; existing `particleSystem`)
- Snow (saint11 Ice): 1-texel flakes on slightly randomised zig-zag paths, a few rogue flakes
  drifting up; settles only on up-facing surfaces (`normal.y > 0.7` mask on the albedo, a 2-shade
  snow ramp: snow light / snow shadow lavender). Rain (low confidence, tutorial summaries): 1-px
  diagonal streaks at one wind angle, 3–4-frame loops, a far layer thinner and dimmer, 2–3-frame
  splash rings on the ground. Leaves: fall on a sine and spin (saint11), 2×2 px, flutter. Wind
  itself is shown only through what it moves (dust, leaves, grass).
- Cost: one `Points` draw call per kind, ≤ 100 points on the low tier.

## 6. Decision: what the skills should prescribe

| Element | `orbkin-pixel-textures` should prescribe | `orbkin-render-look` should prescribe | Leave optional / do not prescribe | Evidence |
|---|---|---|---|---|
| Near water | the band/crescent/lace recipe (5.1) as the water painter spec: flat depth bands, crescent highlights, solid lace + receding dashes, glints only in the sun zone, 4-step haze, stepped 8 fps clock | one plane, one draw call, world-texel quantisation, shore field + land-side waterline stripe, re-check shafts/fog after any value change | indexed R8 water tile + palette cycling (cheapest path for phones; untested here) | W2 better on desk 4/4, phone 4/4, crop 4/4; W1 better desk + crop (high for shallows) |
| Far sea | keep the glitter path + sky reflection rules (5.2) | soft-edged shafts over water | flat bands at grazing angles | cliff results contradictory → no reliable gain (medium) |
| Lava | banded molten flow rules (5.3): bands along the flow, dark banks, streaked falls, bloom budget | lava stays an emissive band material; bright texels ≤ ~30% of lava area | crust plates / rafts (lost 0/4 twice) | L1 crop worse 4/4, L2 desk + crop worse 4/4 (high for "do not use plates/rafts at this density") |
| Meadow / foliage | turf ≤ 3 adjacent shades, detail on borders, grass clumps with open turf, ground-coloured grass, no orphan pixels | stepped wind (5 fps, 1-texel moves) with a travelling gust field; grass out of outlines | the exact clump layout | M1 crop better 4/4; full frames confounded (medium) |
| Sky / fog / weather | the source rules (5.5–5.6) as painter specs | haze over blur | — | sources only (medium), not A/B-tested |
| All elements | "every feature that must read is ≥ 2 texels wide or a 3+ texel run; no 1-texel jitter lines" | "stepped clocks (6–10 fps) for environment animation; ≤ 1 texel change per frame" | — | L1 hairline loss, saint11 rules |
| Process | — | judge environment elements with an element-crop pairwise AND the full frame; freeze or match sprite animation frames; isolate rng streams per dressing feature | absolute scores | §4.3 confounds |

## 7. Implications for Orbkin

1. **Adopt the near-water recipe (W2) for shallows, coast and ponds.** It is the first outdoor
   element change in this research series that won blind on desktop, phone and the element crop,
   and it is cheaper per pixel than the current water. Port `WATER_FRAG_BK` (+ the W2 glitter block)
   from `scratchpad/biome/biome.patch` into `localKit.pixelWater` behind a `style: 'bands'` option;
   move the shore lace to the land material (waterline stripe) to remove the overhang hack; keep the
   current shader for far sea (cliff) until the god-ray ribbons are soft-edged, then re-test.
2. **Do not spend more on lava crust.** Two crust designs lost the element crop 4/4 each. The
   volcanic regression needs a palette/value fix (cool counter-light, fewer bright texels, Vulcrag
   readability), tested in-game the same way.
3. **Meadow: implement the vegetation rules properly, then re-test with frozen dressing.** The
   clumped/calm crop won 4/4 but the prototype was too weak to move the frame (detail CV −0.009) and
   was confounded. Next experiment: ground-coloured grass sprites (colour from the turf under the
   root), turf tops at 3 shades, terraces with clear interiors, a separate `Rng` per dressing pass,
   stepped wind with a gust field.
4. **Environment animation runs on stepped clocks.** 6–10 fps for water/lava/foliage cycles, ≤ 1
   texel of change per frame (saint11, Slynyrd). The sway in `kit/foliage.ts` and the particle
   motion are continuous today.
5. **Judge environment changes with an element crop as well as the full frame**, freeze or match
   sprite animation frames between A and B, and check that unrelated dressing is identical (pixel
   diff outside the element mask) before trusting a full-frame verdict. Of the 14 full-frame verdicts
   here, 6 were order-driven no_difference and at least 4 decisive ones cited sprite frames, god rays
   or reshuffled dressing rather than the element.
6. **Value changes interact with overlays.** Re-check god rays, fog bands and bloom whenever a large
   surface (sea, lava, turf) changes value.
7. **Assets:** nothing external was needed or downloaded for these elements (all procedural); the
   saint11 tutorials (CC BY 4.0) were read as reference only, nothing was copied into the game, so
   `game/ASSETS.md` needs no entry. If a tutorial image is ever shipped or adapted, credit Pedro
   Medeiros (saint11) per CC BY 4.0.

## 8. Open questions
1. Do humans agree? The shallows win is consistent across 12 Opus votes and 3 views, but the owner's
   eye (or a seasoned designer) should confirm on a moving frame: crescents and stepped foam are
   motion features that a still frame under-represents.
2. Real-phone cost of W2 vs the current water (SwiftShader says cheaper; the water covers ~45% of a
   portrait frame on low tier).
3. Indexed R8 water + palette cycling (Ferrari / canvascycle) vs the procedural W2: cheaper, more
   hand-authored, untested.
4. Far sea: does a soft-edged shaft + W2 far rules beat the current glitter field once the shaft
   artifact is fixed?
5. Volcanic: does a cool counter-light / violet shadow split recover the judged regression?
6. Meadow: does ground-coloured grass + calmer terraces raise detail CV toward ≥ 0.45 and win the
   full frame?
7. Sky, fog bands, snow and rain recipes are from sources only; none were A/B-tested in-game.

## 9. Files (all under `scratchpad/biome/`)
| Path | What |
|---|---|
| `game/` | scratch copy (HEAD a13f067) with the `bk=` switches |
| `biome.patch` | diff of `src/render/hd2d/arenas/` (localKit water W1/W2 + flags, volcanic L1/L2, meadow M1) |
| `capture.mjs`, `cap_all.sh`, `cap_ab.sh` | capture harness (vslice capture + `BASE_Q`) |
| `ab/` | A / B / C / D frames, desk + phone, `metrics.jsonl` |
| `verdicts/*.json` | every judge vote with order, reason, cost |
| `element_judge.py` | element-crop pairwise judge (two orders, visual_judge decision rule) |
| `judge_arena.sh` | full + crop judge runner |
| `sbench/` | isolated shader microbench (`index.html`, `run.mjs`, `shaders.js` extracted from source) |
| `bench.mjs`, `bench.jsonl` | interleaved in-game frame bench |
| `orphans.py` | orphan-pixel / run-length metric on the internal grid |
| `sheets/` | contact sheets (shallows, cliff, lava, meadow, phones, isolated shaders) |
| `s11/`, `repos/` | saint11 tutorial frame sheets; cloned reference repos (Saint11Tutorials CC BY 4.0, Quick_Grass MIT, stylized-water MIT, unity-isometric-pixel-pipeline MIT, canvascycle MIT) |
| `iter/` | iteration captures and crops |

## 10. Sources

Primary (read or run here):
- saint11 / Pedro Medeiros, pixel-art tutorials (CC BY 4.0): https://github.com/saint11/Saint11Tutorials
  (Water.gif, water_detail.gif, CLouds.gif, Vegetation.gif, Vegetation2.gif, Vegetation3.gif, Wind.gif,
  Fire.gif, Ice.gif, Parallax.gif); index https://saint11.art/blog/pixel-art-tutorials/
- SimonDev Quick_Grass (MIT): https://github.com/simondevyoutube/Quick_Grass (`public/shaders/grass-lighting-model-vsh.glsl`)
- thaslle/stylized-water (MIT, Codrops 2025): https://github.com/thaslle/stylized-water (`src/components/Water/shaders/fragment.glsl`, `Terrain/shaders/fragment.glsl` waterline stripe); article https://tympanus.net/codrops/2025/03/04/creating-stylized-water-effects-with-react-three-fiber/
- bababuyyy/unity-isometric-pixel-pipeline (MIT, t3ssel8r-inspired): https://github.com/bababuyyy/unity-isometric-pixel-pipeline (README, `Assets/Shaders/ToonLighting/GrassBlade.shader`)
- Joe Huckaby, canvascycle (MIT; Mark Ferrari's colour-cycling art engine): https://github.com/jhuckaby/canvascycle (`palette.js`)
- three.js r180 (game `node_modules/three`), Orbkin source (`arenas/localKit.ts`, `volcanic.ts`, `meadow.ts`, `kit/foliage.ts`, `kit/particles.ts`)
- Internal: `research/ingame-vertical-slice.md` (harness, judge hygiene), `research/judge-calibration.md`
  (`visual_judge.py`, `artgate_compare.py`, meadow/volcanic regression), `research/art-direction.md`
  (meadow detail CV 0.195), `research/mobile-perf-budget.md` (§5 budgets), `research/threejs-render.md`.

Secondary (search summaries; the pages themselves were unreachable through the proxy):
- Octopath Traveler UFE 2018 slides (Acquire/Epic Games Japan): https://www.docswell.com/s/EpicGamesJapan/KXPWY5-UE4_UFE2018_ACQUIRE_OCTOPATHTRAVELER , https://www.slideshare.net/slideshow/nintendo-switchoctopath-traveler/119821741 ; 4Gamer https://business.4gamer.net/article/1810/18101801/ ; AUTOMATON https://automaton-media.com/devlog/report/20181023-78326 ; CG WORLD https://cgworld.jp/feature/201908-gg2019-oct.html ; review https://www.4gamer.net/games/368/G036845/20180619012/
- Octopath Traveler II interviews: https://www.nintendolife.com/news/2022/10/octopath-traveler-ii-devs-aimed-to-make-its-hd-2d-visuals-picture-perfect , https://www.unrealengine.com/en-US/developer-interviews/octopath-traveler-ii-builds-a-bigger-bolder-world-in-its-stunning-hd-2d-style
- Triangle Strategy producers: https://www.nintendolife.com/news/2022/05/triangle-strategy-producers-talk-hd-2d-and-why-other-devs-havent-used-it , https://gamingbolt.com/triangle-strategys-art-style-costs-more-than-youd-think-producer
- Sea of Stars press kit: https://sabotagestudio.com/presskits/sea-of-stars/
- Eastward interview: https://www.gamedeveloper.com/art/eastward-s-creators-share-insights-on-making-pixel-art-adventures
- Owlboy / D-Pad: https://dpadstudio.tumblr.com/post/160762485173/does-owlboy-perfectly-follow-the-pixel-grid-its , https://dpadstudio.tumblr.com/post/138746869038/owlboy-february-update-1
- Slynyrd Pixelblog: 10 water https://www.slynyrd.com/blog/2018/10/12/pixelblog-10-water-in-motion , 11 landscape https://www.slynyrd.com/blog/2018/11/16/pixelblog-11-landscape-pixeling , 33 wind https://www.slynyrd.com/blog/2021/7/16/pixelblog-33-wind-effects , 62 landscape backgrounds https://www.slynyrd.com/blog/2026/5/27/pixelblog-62-landscape-backgrounds , modular trees https://lospec.com/pixel-art-tutorials/modular-tree-technique-by-slynyrd
- Rain tutorials (low confidence): https://budgetpixel.com/blog/how-to-animate-pixel-art-rain-and-reflections-in-4-frames , https://tips.clip-studio.com/ja-jp/articles/7699
- Colour cycling overview: https://blog.prototypr.io/color-cycling-in-pixel-art-c8f20e61b4c4
- Cyanilux 2D water shader breakdown (pixelated-UV noise): https://www.cyanilux.com/tutorials/2d-water-shader-breakdown/

