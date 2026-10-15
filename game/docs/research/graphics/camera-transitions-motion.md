# Battle cinematography and screen-level motion for Orbkin (camera, transitions, shake, temporal stability)

Angle: how the **whole frame** behaves in motion at Orbkin's 640×360 internal grid upscaled 2× nearest (CSS
`image-rendering: pixelated`). Questions: should a pixel-diorama battle move its camera at all, how to move it
without pixel crawl, what the frame grammar of real pixel battlers is (frame counts), which battle-in transitions
fit, how to judge motion (video, not stills), and what it costs on a phone.

Confidence tags: **[measured]** = run in this session on the real cave battle, numbers below; **[code]** = read in
primary source code; **[high] / [med] / [low]** = secondary sources (reviews, interviews via search summaries).

All lab files: `scratchpad/motion/` (abs: `/tmp/claude-0/-home-user-gravity-innovation/a5440fec-78d9-5c47-821a-56c84521c2ff/scratchpad/motion/`).
The game repo was **not** modified; experiments ran on a copy (`motion/game`, diff in `motion/motion-lab.patch`).

---

## 0. Verdict (the yes/no)

**Yes, Orbkin should move its battle camera, but only in the ways that keep the pixel grid rigid, and no slow
3D drifts.** Concretely:

| Move | Allowed? | Why (measured on the cave battle, §4) |
|---|---|---|
| **Pan/tilt as whole-internal-pixel view-offset shifts** (`camera.setViewOffset`), with sprite anchors, dither and pixel FX snapped in a grid that travels with the pan | **Yes, freely** (intro sweeps, follow the attacker, settle) | Block-rigid residual 0.013 (vs 2.0 for a sub-pixel pan), 0% deforming blocks, zero flicker. Indistinguishable from a static frame except the intended motion. |
| **3D truck/crane** (camera position moves), snapped to whole px at the focus depth, + the same locks, + sub-pixel remainder applied as a CSS `translate` of the canvas | **Yes, sparingly** (short, ≤ ~1 s, e.g. a victory or switch-in move) | Residual 0.25, 0.8% deforming blocks (parallax at other depths), zero flicker; remainder halves judder at 2× (max step 1 device px). |
| **Dolly / FOV zoom / orbit** (scale or rotation of the projection) at slow speed | **No as a slow drift**; **yes as a fast move (≤ 6–12 frames) masked by a flash, hit or transition**, or as a **cut** | Every slow dolly/zoom/orbit flickers 0.19–0.31% of pixels per frame, concentrated on regular patterns (shelves, windows, stairs, bevel seams) = visible shimmer. 640×360 vs native 1280×720 rendering made no difference to the flicker rate. |
| **Punch-in on impacts** | **Yes as a cut on the contact frame** (hide it under the white hit flash), return with a ≤ 12-frame ease or a whole-px pan | Cut frames are pixel-perfect on both sides; the eased 6-frame zoom-in crawls (10% deforming blocks) but the judge preferred the smoother return. |
| **Screen shake** | **Yes, but replace the current 30 Hz buzz with a directional kick** | Current shake alternates ±2 px every frame for 11 frames (aliased 24.5 Hz sine sampled at 60 fps); a damped kick reads as an impact direction in 7 frames. |

Phone cost of the recommended set: **zero extra passes**. The whole-px pan and all locks are uniform changes; the
optional sub-pixel remainder is a CSS transform on the already-composited canvas (verified crisp in Chromium).

---

## 1. What I measured: method

### 1.1 Deterministic 60 fps frame dumps of the real battle
- Copy of the game (`motion/game`), built with Vite, served by `vite preview` (ports 4401–4404). Patches (all
  in `motion-lab.patch`): `__game.step(dt)` (one main-loop tick by hand while `window.__manual` stops the rAF
  loop), `__game.grab()` (readPixels of the **internal** 640×360 drawing buffer right after render), a
  `uDitherOff` uniform for the grade dither, `post=nodither`, transition uniforms in the grade pass, a pan-origin
  for the sprite anchor snap, and `?ih=` to override the internal height.
- `motion/cap.mjs` drives Playwright (Chromium + SwiftShader, 1280×720 viewport → 640×360 internal at 2×),
  waits for the cave battle (`?scene=battle&route=ridge&hotspot=vent-cave&gfx=hd2d&arena=cave&q=high`), then
  per frame: set the camera for the variant, `step(dt)`, grab. `dt = 0` freezes the world so a clip measures
  **only** camera-induced change; `dt = 1/60` for live clips. ~2.5 frames/s on 4 CPU cores.
- Determinism check: `idle_frozen` → all metrics exactly 0.

### 1.2 Metrics (`motion/an.py`, `motion/an2.py`)
- **raw**: mean |F_t − F_{t−1}| per pixel (includes legitimate motion).
- **flick** ("reversal flicker"): % of pixel-frames whose luma goes up then down (or v.v.) across 3 frames, each
  step > 12/255. Clean translation of pixel art produces monotonic changes (A A B B C); shimmer/crawl produces
  reversals (A B A). Only meaningful for slow motion (< 0.5 px/frame); at 1 px/frame every textured pixel
  changes every frame and the metric saturates (~3.4% even for perfectly rigid motion).
- **rigid** (block-rigid residual): per 16×16 block, the best whole-pixel shift (±3) between consecutive frames,
  mean |residual| after that shift. 0 = the block moved as a rigid pixel-art image. **rigid_bad** = % of blocks
  with residual > 4 (visibly deforming). Valid for translations only (dolly/orbit legitimately change shape).
- **judder** (`an2.py`): integer displacement of the mid band vs frame 0, compared with the ideal sub-pixel
  path, in device px.
- Heatmaps: `motion/viz/flicker_heat.png` (red = flicker), step residual images `motion/viz/stepdiff*.png`.

Pan speed for all slow moves: 12 internal px/s at the focus depth (0.2 px/frame), a typical slow cinematic drift.

---

## 2. Results tables

### 2.1 Camera moves, world frozen, 120 frames each [measured]

| Variant | What | raw | flick % | rigid | rigid_bad % | Notes |
|---|---|---|---|---|---|---|
| idle_live | static camera, world animating | 0.066 | 0.000 | 0.063 | 0.41 | sprite re-bakes (10 fps), dust, flame |
| pan2d_sub | view offset moved by fractional px (naive "smooth" pan) | 2.02 | 0.207 | **2.005** | **11.4** | re-rasterises with a new sub-pixel phase every frame |
| pan2d_int | view offset moved in whole internal px | 1.73 | 0.000 | 0.214 | 0.08 | residual = screen-anchored dither, bloom, sprite slip |
| pan2d_int_dlock | + dither phase locked to the pan | 1.81 | 0.000 | 0.037 | 0.14 | |
| **pan2d_int_lockall** | + dither lock + sprite anchors snapped in the pan grid | 1.81 | 0.000 | **0.013** | **0.00** | remaining: bloom (half-res mips) + vignette/tilt (screen lenses by design) |
| pan2d_int_lockall, `post=nobloom` | same, bloom off | — | 0.000 | 0.007 | 0.00 | bloom ≈ half of the last residual |
| pan2d_fast (1 px/frame) | whole px, no locks | 8.68 | 3.36* | 1.062 | 0.47 | sprites slip 1 px every frame |
| pan2d_fast_lockall | whole px + locks | 9.06 | 3.36* | 0.062 | 0.00 | *flick saturates at 1 px/frame |
| truck3d_free | camera position slides sideways (parallax), unsnapped | 2.01 | 0.211 | **1.963** | **10.5** | speckled crawl on rock walls and rubble |
| truck3d_snap | position rounded to whole px at the focus depth | 1.72 | 0.000 | 0.431 | 1.68 | residual = parallax at other depths |
| **truck3d_snap_lockall** | + dither and sprite locks | 1.80 | 0.000 | **0.247** | **0.79** | |
| truck3d_fast (5× speed) | unsnapped | 8.59 | 3.06 | 2.103 | 7.73 | |
| dolly_free | 4% closer over 2 s | 1.01 | 0.191 | 0.969 | 1.47 | |
| zoom_fov | FOV −4% over 2 s | 1.08 | 0.188 | 1.048 | 1.93 | same as dolly |
| orbit_free | 3° yaw around the kin midpoint over 2 s | 1.06 | 0.244 | 1.053 | 2.53 | flicker on windows, shelves, stairs, sprites |
| dir_orbit | 6° over 2 s (victory-orbit speed) | 1.93 | 0.308 | 1.899 | 11.9 | |

### 2.2 Judder of the pan (device px at 2×) [measured]

| Variant | RMS error vs ideal path | max step | frames that move |
|---|---|---|---|
| whole-px pan / snapped truck | 0.566 | 2 device px | 20% (1 internal px every 5 frames) |
| **+ CSS remainder translate** | **0.283** | **1 device px** | 40% |
| truck3d_free | 0.733 | 2 | 22% |

At 3× (1080p) and 4× (1440p and the low-tier phone grid, which is 4 device px per internal px) the remainder gives
3–4 sub-steps per texel, so a slow pan is effectively smooth.

### 2.3 Is native resolution the fix? (same moves rendered at `ih=720`, 1280×720 at 1×, every 2nd frame, device-space metrics, 32 px blocks) [measured]

| Variant | 640×360 @2× rigid / bad % / flick % | 1280×720 @1× rigid / bad % / flick % |
|---|---|---|
| truck3d_free | 3.68 / 36.8 / 0.70 | 1.96 / 6.5 / 0.72 |
| truck3d_snap (no locks) | 0.87 / 3.4 / **0.00** | 1.25 / 0.5 / 0.60 |
| dolly_free | 1.77 / 9.6 / 0.28 | 1.79 / 9.0 / 0.30 |
| orbit_free | 1.90 / 12.1 / 0.31 | 1.91 / 12.0 / 0.31 |
| pan2d_sub | 3.77 / 38.7 / 0.72 | 1.89 / 1.7 / 0.75 |

Reading: rendering 4× the pixels halves the size of each crawl step (a texel edge jumps 1 device px instead of 2),
so deforming blocks drop for translations, but the **flicker rate is unchanged** for every move (nearest-sampled
pixel textures alias at their edges at any resolution), and a **snapped 640×360 translation beats native 720 on
flicker** (0.00 vs 0.60%). For dolly/orbit native resolution changes nothing measurable. So the
"native + magnified texels" route (what Octopath does, §3.3) does not by itself buy clean camera motion; it costs
4× fill. This feeds the open native-vs-hybrid question: motion is **not** an argument for native resolution.

### 2.4 Screen shake traces (whole-image displacement per frame, internal px, hit at frame 6) [measured]

| Variant | trace (dx, dy) from frame 6 | frames moving | peak |
|---|---|---|---|
| **current** (`battle.ts` `shake()`: `sin(k·40)`, `cos(k·33)`, 260 ms, a0 = round(0.1·28) = 3) | (0,−2) (−2,1) (2,1) (−2,−1) (2,1) (−1,0) (−1,−1) (1,1) (−1,0) (1,−1) (−1,0) | 11 | 2 px |
| directional kick (A = 4 px, `e^(−t/70ms)·cos(2π·9t)` along the hit direction) | (4,−2) (2,−1) (−1,0) (−2,1) (−1,1) (0,0) (1,0) (1,0) | 7 | 4 px |
| trauma (Eiserloh: trauma 0.8 decaying 1.6/s, shake = trauma², value noise at 18 Hz, max 7×5 px) | (−3,3) (−1,2) (1,1) (3,0) (2,0) (0,−1) (−1,−1) … (−1,0) | 15 | 3 px |

The current shake's sign flips almost every frame: `sin(40k)` over 0.26 s is **24.5 Hz**, sampled at 60 fps it
is ~2.4 frames per cycle, i.e. an aliased buzz. It reads as a blur/vibration, not a push. The kick shows the
direction of the blow (camera pushed away from the attacker, then settles) and is over in 7 frames. Clip:
`motion/media/shakes.mp4`.

### 2.5 Hit sequence [measured]
Per-frame change on the foe crop around a crit hit (`hit_full`, hit at frame 6): 0.02, 2.3, 0, 0, 0, **19.3, 24.9,
20.0, 23.4, 23.4, 20.0**, 12.4, 20.8 … The existing 70 ms crit hit-stop (`creature.ts` `hit()`) freezes the pose,
but the image is never still during it because the shake starts on the same frame and the flash toggles, and
the sprite re-bakes at 10 fps (6-frame cadence) so a 4-frame pose freeze can fall inside one bake frame. The judge
still saw "a white freeze for ~6 frames" (§5). Rule: make the hit-stop ≥ 6 frames (one full sprite-bake period)
and force a bake on its first frame.

---

## 3. Published camera and transition grammar (frame counts)

### 3.1 Pokémon Emerald decompilation (pret/pokeemerald, read from source) [code]

Files read: `src/battle_transition.c`, `src/battle_intro.c`, `src/battle_setup.c`, `src/battle_main.c`,
`src/battle_controller_opponent.c`, `src/battle_controller_player.c` (raw.githubusercontent.com/pret/pokeemerald/master).
Used for timing data only; no assets.

| Beat | Code | Frames @60 | Notes |
|---|---|---|---|
| Battle-in "flash" intro | `CreateIntroTask(0, 0, 3, 2, 2)`: blend +2/16 per frame to grey RGB(11,11,11), then −2 back, 3 times | **48** (3 × 16) | grey pulses, not white; 3 pulses in 0.8 s (3.75/s) — relies on the small luminance change to mid-grey |
| Main transition is chosen by **terrain × threat** | `sBattleTransitionTable_Wild/Trainer[type][strongerFoe]`: wild normal = Slice / White bars; cave = Clockwise wipe / Grid squares; dark (Flash) = Blur / Grid squares; water = Wave / Ripple. Trainer: Pokéballs trail / Angled wipes; cave = Shuffle / Big Pokéball; water = Swirl / Ripple. Second column when the foe's level is higher than the party's | — | the transition tells you where you are and how dangerous the fight is |
| Slice | interleaved rows slide apart, speed 1 px/frame accelerating (accel doubles 1→128, +accel up to 15 px/frame) | **37** | simulated from the code |
| Grid squares | 14 shrink stages × 3 frames, then 16-frame hold, fade black | **58** | |
| Blur (mosaic) | mosaic level +1 every 5 frames, 15 levels; palette fade to black from level 10 | **75** | |
| Battle intro slide | `BattleIntroSlide1`: letterbox opens (`WIN0V` −0x3FC/frame), the two halves of the field slide in from opposite sides at 2 px/frame from 240 px offset; clouds layer scrolls 6 px/frame | **120** (+ 32-frame wait before the BG settles) | the "camera intro" of a 2D game is a 2-second slide |
| Trainer slide-in | sprite `x2 = 240`, `speedX = −2` | **120** | |
| Hit blink | `DoHitAnimBlinkSpriteEffect`: toggle visibility every 4 frames for 32 frames | **32** (4 blinks at 7.5 Hz) | |
| Opponent faint | `SpriteCB_AnimFaintOpponent`: sprite moves down 8 px every 2 frames, clipped by the ground window, ≤ 8 steps; cry first | **≈ 16** | a fast sink, not a slow topple |

Total Emerald battle-in before "Wild X appeared!": ≈ 48 (flash) + 37–75 (transition) + 120 (slide) ≈ **3.4–4 s**.
Orbkin today: CSS curtain `battle-in .52s steps(6)` (stripes) + `reveal .3s steps(5)` + no camera move ≈ 0.8 s, so
there is room for a ~1.5–2 s authored battle-in without feeling slow.

### 3.2 Octopath Traveler II (Acquire/Square Enix, UE4, HD-2D) [med]
- Developers (Famitsu interview via English summaries): heavy use of 3D camerawork in II; the main challenge was
  "how far they could rotate the camera without hurting graphical fidelity"; the camera rotates **nearly 90° in
  some battle effects and 180° in some events**; events built like 3D cutscenes in UE rather than scripted 2D.
  Characters made taller for battle expressiveness. Point light added with every battle VFX so sprites cast shadows.
- Reviews (RPGFan, TheSixthAxis, Pocket Tactics, NWR): "dynamic camera" new in II; the camera "will pan across to
  focus on the damage being dealt" on big attacks; dynamic angles on powerful skills; Boost flashes. Original
  Octopath: mostly fixed battle framing.
- Important difference from Orbkin: HD-2D renders the 3D scene at **native output resolution** with pixel-art
  textures and sprites magnified several screen pixels per texel, plus DOF. Camera motion therefore moves texel
  edges in screen-pixel steps (smooth), and the fan reference frame Orbkin is judged against is a video frame of
  such a native-resolution render (smeared, non-integer pixels, per judge-calibration). Orbkin's 640×360 grid
  quantises every move to a whole texel; that is why its motion must be authored differently (§2.3).

### 3.3 Dragon Quest III HD-2D Remake (2024) [med]
- CGM review: battles are "purely first-person", calls the lack of a dynamic battle camera its biggest weakness.
- MP1st TGS hands-on: "the camera swoops in at the start and shows the player's party briefly, but when the
  actions start rolling out, it zooms in and only shows the enemy". Press Start: mix of third-person and
  first-person views. Lesson: even a conservative HD-2D battle has an **intro swoop**, and static framing is
  criticised in 2024 reviews.

### 3.4 Pokémon Black/White (2010) [med]
- First mainline games with a "dynamic" battle camera: pans and zooms as moves land, zooms out to show the
  attacker. Commentary notes the cost: the 2D sprites looked bad when zoomed ("odd stretching", "unappealing
  in-betweens"). This is the exact failure mode of scaling pixel art with a moving camera, and the reason to
  prefer pans and cuts over continuous zooms at a fixed pixel grid.

### 3.5 Cassette Beasts, Sea of Stars, Temtem [low]
- No verifiable camera breakdowns found (searched devlogs, talks). A Steam user claims Sea of Stars renders at
  640×360 (unverified). Not used.

### 3.6 Pixel-art camera technique (code-verified in hd2d-pixel.md, re-checked here)
- three.js r180 `examples/webgl_postprocessing_pixel.html` `pixelAlignFrustum()` (fetched this session): projects
  the camera position on its right/up axes, takes the fractional pixel part, shifts the ortho frustum by it.
  **Orthographic only.**
- David Holland (Godot) / t3ssel8r: snap the camera to the texel grid, then offset the upscaled output by the
  snap error (search summary, med).
- Texel Splatting (Ebert, arXiv 2603.14587, 2026): "pixels at different depths drift at different rates, and no
  single snap corrects all depths" under perspective; renders texels from a fixed probe as world-space quads;
  limitation: disocclusion (search summary, med).
- Smooth Pixel Perfect Camera (UE asset): smoothing "will work less on Perspective Camera as the movement will
  show new geometry"; advises low FOV, distant camera (search summary, low-med).
- Orbkin's measured equivalent for perspective (§2.1): snap at the focus depth + locks leaves 0.8% deforming blocks.

### 3.7 Game-feel and accessibility references
- Hit-stop, trauma shake, Vlambeer: see `battle-vfx-motion.md` §3.4 (Sakurai: the victim vibrates during hitlag;
  Eiserloh trauma²; integer offsets for pixel art).
- WCAG 2.3.1: no more than 3 flashes in any 1 s (unless below the general/red flash thresholds or small area,
  ~341×256 px reference block at typical distance); 2.3.3 (AAA): motion triggered by interaction can be disabled.
  Emerald's 48-frame triple grey pulse is 3.75 pulses/s (over the count) and only passes by having a small
  luminance change (slow 16-frame ramps to mid-grey). Orbkin's prototype white flash (3 × 10 frames to 85% white) is **3 flashes in
  0.5 s = 6 Hz** — fails 2.3.1 at full screen; use 2 pulses ≥ 334 ms apart, ≤ 50% opacity, or grey like Emerald.
- Shake must be toggleable (`prefers-reduced-motion` already used for the curtain in `style.css`).

---

## 4. What causes instability in Orbkin's frame (diagnosis) [measured]

On a **whole-pixel pan step** the rigid residual image (`viz/stepdiff.png` vs `viz/stepdiff_lockall.png`) shows:

1. **Sprites slip against the world.** `sprite.ts` snaps the billboard anchor to `round(screenX / px) * px` in
   absolute buffer coordinates, with px = 2 internal px per sprite texel. When the image pans by 1 px the floor
   moves 1 px but the sprite moves 0 or 2 px. Fix: snap in a grid that travels with the pan,
   `ax = round((sx − panX) / px) * px + panX` (patched in the lab; residual on sprites gone).
2. **Dither is screen-anchored.** The grade's `bayer4(gl_FragCoord.xy)` stays put while the image moves → a
   whole-frame "screen door" crawl (amplitude only 2/255 but over every gradient). Fix: `bayer4(gl_FragCoord.xy +
   uDitherOff)` with `uDitherOff = (panDx, −panDy)` (the pan in internal px). Residual 0.214 → 0.037.
3. **Bloom halos change on odd-pixel pans.** UnrealBloom's half-res mip chain is not shift-invariant for odd
   shifts (windows' halo shimmer). It is ~half of the final 0.013 residual. Acceptable; if it matters, pan in
   2-px steps during bloom-heavy shots or lock the bloom pass to even offsets.
4. **Vignette and tilt-shift** are screen-space lenses; leaving them anchored to the screen is correct.
5. Under 3D moves: texel shimmer on high-frequency rock texture (truck), and moiré on regular structures
   (shelves, window mullions, stair edges, bevel seams) under orbit/dolly (`viz/flicker_heat.png`). Sprites also
   flicker under orbit because the bake viewpoint changes every frame.

---

## 5. Motion judge: strips vs kymographs, with canaries [measured]

`motion/motion_judge.py` extends the calibrated judge (`jc/scripts/judgelib.py`, nested `claude -p`, Opus, blind,
both orders × 2 votes, forced choice) to clips. Two representations:
- **strip**: ≤ 20 frames as a 4-column grid of native crops (no downscaling: ≤ 1292 px wide), frame numbers burnt in.
- **kymograph** (x-t slice): one image row per frame stacked downward (3 lines per frame), three rows of the image
  (through floor, kin and rocks) separated by magenta gaps. Rigid motion = straight streaks; jitter = zig-zags.

| Pair | Question | strip | kymograph | Truth (metrics) |
|---|---|---|---|---|
| **canary_jitter**: idle vs idle + random ±1 px per frame | stability | **split 3–1, FAIL** (hallucinated "softening/shimmer") | **4/4 correct, conf 5, PASS** | jitter is the bad one |
| **canary_hitstop**: hit vs same with the 4 hit-stop frames dropped | impact | **4/4 correct, PASS** ("holds the white freeze ~6 frames") | 4/4 correct (conf 2) | |
| pan2d_sub vs pan2d_int_lockall | stability | **4/4 for the crawly one (wrong)** | split 2–2 (first-position bias) | lockall is 150× more rigid |
| truck3d_free vs truck3d_snap_lockall | stability | **4/4 for the crawly one (wrong)** | 3–1 for the stable one, split | snap+lock is 8× more rigid |
| intro: whole-px pan (locked) vs static | cinematic | 4/4 for the pan (conf 2–3) | — | |
| intro: whole-px pan vs 3D orbit+dolly sweep | cinematic | split 2–2 (does not see the 3D crawl) | — | 3D: 17.7% deforming blocks |
| punch-in cut vs no camera | cinematic | 3–1 for the cut; "snap-back is jarring" | — | |
| punch-in cut vs 6-frame zoom in / 12-frame zoom out | cinematic | 4/4 for the eased zoom | — | zoom: 10.4% deforming blocks |

Cost ≈ $0.02–0.04 per call (subscription; ≈ $1.2 for the whole table).

**Calibration conclusions**
1. **Frame strips cannot judge temporal stability.** They fail a gross ±1 px jitter canary and prefer the crawling
   clip in both real pairs, with confident-sounding invented reasons. Never gate camera stability on a strip judge.
2. **Kymographs pass the gross canary** (4/4, conf 5) but are position-biased on the subtle real pairs. Use them
   as a smoke test (catches a broken camera, dropped snapping), not as a gate.
3. **Strips do judge timing/feel**: the dropped hit-stop canary passed 4/4. Use strips for beats (hit-stop,
   flash, punch-in, transition pacing) with the canary in every run.
4. Stability is gated by the **metrics** (rigid / rigid_bad for translations, flick for slow moves), which are
   cheap, deterministic and agree with the eye on the review clips. Human review of the MP4s for final taste.

---

## 6. Transition and staging prototypes (lab) [measured: rendered; not human-rated]

All in the grade pass, so they run at internal resolution and stay pixel-crisp; 1 extra branch, no extra pass.
Shader excerpt (appended to the grade fragment shader; `P = floor(gl_FragCoord.xy)` internal px):

```glsl
uniform float uTrMode, uTrK; uniform vec2 uTrC; uniform vec4 uFlash; uniform vec3 uTrInk;
// before the tone map: mosaic resample (mode 4)
vec2 suv = vUv;
if (uTrMode == 4.0) { float bs = max(1.0, floor(uTrK * 12.0 + 0.5) * 2.0); suv = (floor(gl_FragCoord.xy / bs) * bs + bs * 0.5) / uRes; }
// at the end:
vec2 P = floor(gl_FragCoord.xy); float cover = 0.0;
if (uTrMode == 1.0) cover = step(bayer4(floor(P / 2.0)), uTrK);                     // ordered dissolve, 2x2 cells
else if (uTrMode == 2.0) { float band = floor(P.y / 30.0);                          // angled shards
  float x = mod(band, 2.0) < 0.5 ? P.x : uRes.x - P.x;
  cover = step(x + floor(mod(P.y, 30.0) / 2.0) * 2.0, uTrK * (uRes.x + 70.0) - 10.0); }
else if (uTrMode == 3.0) { float R = floor((1.0 - uTrK) * length(uRes) / 4.0) * 4.0;  // iris on uTrC, 4-px steps
  cover = step(R, length(P - uTrC * uRes)); }
c = mix(c, uTrInk, cover);
c = mix(c, uFlash.rgb, uFlash.a);
```
Driving: progress `k` advanced in **10 discrete steps over 30 frames** (3 frames per step, the stepped cadence of
Emerald's transitions), hold 6 frames covered, reveal 30 frames. Clips: `media/transitions.mp4` (iris onto the
foe, angled shards), `media/transitions2.mp4` (dissolve, mosaic, flash×3 + dissolve); contact sheet
`viz/transitions.png`.

Recommended battle-in (≈ 1.6 s, cave/wild example):
1. Overworld: 2 grey pulses (16 frames each, to 40% `#5a5a5a`, ≥ 20 frames apart) — WCAG-safe.
2. Cover: terrain-specific wipe, 30 frames, 10 steps (wild meadow = angled shards; cave = iris closing on the
   player; water = mosaic; trainer = shards from both sides; stronger foe = the second variant, as Emerald does).
3. Battle reveal: iris opening **on the foe** (30 frames) while the camera does the locked intro pan (−40, −24 px
   → 0 over 48 frames, ease-out cubic, whole px), then "A wild X appeared!".
4. Kin appear: existing scale-up (`appear()`, 300 + 220 ms) with the sprite **white for 12 frames then 0.6 / 0.3 / 0
   for 4 frames each** (lab `appear_proto`) — the classic "materialise" read.
5. Faint: shorten to Emerald-like grammar: cry/flash, then a fast sink (≈ 16 frames) rather than the current
   730 ms topple (+260 ms flatten).

---

## 7. Phone cost

| Item | Cost | Notes |
|---|---|---|
| Whole-px view-offset pans, intro sweep, punch-in cuts | **0 passes**, a projection-matrix update | `setViewOffset` is already used for framing and shake |
| Dither lock, sprite pan-grid snap | **0** (one uniform, two subtractions) | |
| Transitions in the grade pass | **0 extra passes**; one uniform branch in an existing full-screen pass | mosaic adds one dependent texture fetch only while active |
| Sub-pixel remainder for 3D moves | **0 GPU passes**: CSS `transform: translate(<remainder × scale / dpr>px, …)` on the canvas, which the compositor already scales | verified in headless Chromium: at dpr 1 `translate(1px)` and at dpr 2 `translate(0.5px)` shift the pixelated canvas by exactly 1 device px with blocks intact; fractional device px get rounded. Needs 1 internal px of overscan on each side so the edge never shows. Unverified on iOS Safari and Android compositors: test on the owner's phones before relying on it |
| Alternative: a device-resolution upscale blit in WebGL (hd2d-pixel §8.3) | **+1 full-screen pass at device res** (≈ 10 MB of writes per frame on a 1080×2400 phone) and the compositor still composites the canvas | only if the CSS route fails on a target browser |
| Native-resolution rendering for smoother motion | **4× fill** at 720p (16× at 4× phone grids) | rejected: no flicker benefit (§2.3) |

---

## 8. Motion rules for the render and VFX skills (copy-ready)

**Render skill — camera motion at a fixed pixel grid**
1. Default to a static, composed battle frame. Motion is authored, never ambient: no idle sway, no slow drift
   during command selection.
2. Pans/tilts = `camera.setViewOffset` shifts in **whole internal pixels** (`Math.round(px) * cssPerPx`). Speeds
   as regular cadences: 1/4, 1/3, 1/2, 1, 2 px/frame; ease only over the first/last ≤ 12 frames.
3. Everything snapped in screen space must snap **in a grid that travels with the pan**: sprite anchors
   (`round((x − panX)/px)·px + panX`), Bayer dither (`gl_FragCoord + uDitherOff`), pixel-FX flipbooks, dust
   points. Leave vignette/tilt-shift screen-anchored.
4. 3D camera translations: snap the camera position to whole px **at the focus depth** (camera-space right/up),
   apply the remainder as a CSS translate of the canvas (overscan 1 px), keep them short (≤ 60 frames).
5. Dolly, FOV zoom and orbit: only as a **cut**, or a move of ≤ 6–12 frames masked by a hit flash, transition or
   fast action. Never slow. Victory: whole-px pan + sprite celebration instead of an orbit.
6. Punch-in = cut on the contact frame (inside the white flash), hold 12–24 frames, return with a ≤ 12-frame ease
   or a whole-px pan. Zoom via the `setViewOffset` sub-window (`width·z, height·z` around the target) so the base
   framing math is untouched.
7. Gate every camera change with `motion/an.py`: rigid_bad ≤ 0.5% and flick = 0 for translations; flick ≤ 0.05%
   for anything that lasts > 12 frames. Review the MP4 at 2× nearest; never judge stability from stills or strips.

**VFX skill — shake, hit-stop, transitions**
1. Shake = integer px, directional kick along the hit direction (A = 3–4 px normal, 5–6 crit/super;
   `A·e^(−t/70ms)·cos(2π·9t)`; ≤ 8 frames). No per-frame sign flipping (the current 24.5 Hz sine aliases). Trauma
   noise only for sustained effects (earthquake moves). Respect a "screen shake" setting and `prefers-reduced-motion`.
2. Hit-stop ≥ 6 frames on crits/super-effective (one full 10 fps sprite-bake period, force a bake on frame 1),
   victim vibrates ±1 px inside it, attacker frozen; shake starts on the first hit-stop frame.
3. Battle transitions run in the grade pass at internal res, stepped (10 steps / 30 frames), chosen by terrain ×
   threat. Flashes: ≤ 2 per second at full screen, ≤ 50% white or mid-grey.
4. Judge beats (hit-stop, flash, punch-in) with ≤ 20-frame strips + the dropped-hit-stop canary; judge stability
   with metrics (and the kymograph jitter canary as a smoke test).

---

## 9. Implications for Orbkin

1. **Ship a camera**: the judges and the reviews (DQ3 HD-2D criticised for a static battle camera; Octopath II
   praised for its dynamic one) agree that a static battle reads less professional. The judge picked the locked
   intro pan over the static frame 4/4.
2. **Two small code fixes are prerequisites** for any camera motion (both trivial, both measured): sprite anchors
   snapped in the pan grid (`sprite.ts` ~line 1115) and the dither offset uniform (`pipeline.ts` grade shader).
   Also check `fx.ts` flipbooks and `arena.ts` dust points for the same absolute snap.
3. Replace `battle.ts` `shake()` (lines ~837–856) with the directional kick; it already uses whole-px view offsets.
4. The battle-in today is a 0.8 s CSS stripe curtain. Replace with the grade-pass transitions + locked intro pan +
   foe-iris reveal (≈ 1.6 s), terrain × threat table in `src/data/` or the arena def (`ArenaDef.transition`).
5. Do **not** move to native resolution for motion reasons, and do not add a device-res blit pass: CSS remainder
   translate (0 cost) or nothing.
6. Fix the title screen's `drift()`: it moves the camera position (3D truck) rounded only at the focus depth, so
   other depths crawl (0.25–0.43 rigid in the battle equivalent); add the pan-grid locks or use view-offset drift.
7. Motion QA = `cap.mjs` + `an.py` in CI-like fashion for camera changes; MP4s for the owner.

---

## 10. Files

| Path (under `scratchpad/motion/`) | What |
|---|---|
| `cap.mjs` | Playwright frame-dump driver (variants: idle, pans, trucks, dolly, zoom, orbit, shakes, hit, appear, faint, directed camera, transitions); env `BASE`, `OUTDIR`; args `variants frames url-extra` |
| `an.py`, `an2.py` | stability metrics (raw, flick, rigid, judder) |
| `strips.py` | strip / kymograph / GIF-MP4 builders, synthetic jitter canary |
| `motion_judge.py` | blind pairwise motion judge with canaries (MODE=strip|kymo|both) ; results `judge_out/*.json` |
| `make_media.py` | side-by-side review clips, CSS-remainder simulation |
| `media/*.mp4` | pan_naive_vs_locked, truck_free_snap_comp, shakes, intro_pan_vs_3d, punch_cut_vs_zoom, orbit_dolly, transitions, transitions2 |
| `viz/*.png` | flicker heatmaps, step residuals, transitions contact sheet |
| `metA.txt`, `metB.txt`, `met720.txt` | metric outputs |
| `motion-lab.patch` | all lab changes to the game copy (hooks, dither offset, transitions, pan-grid sprite snap, `?ih=`) |
| `src_ref/` | pokeemerald sources read, three.js r180 pixel example |
| `css/t.mjs` | CSS translate crispness test |

## 11. Sources
- pret/pokeemerald: https://github.com/pret/pokeemerald (`src/battle_transition.c`, `battle_intro.c`, `battle_setup.c`, `battle_main.c`, `battle_controller_opponent.c`, `battle_controller_player.c`)
- three.js r180 `examples/webgl_postprocessing_pixel.html`: https://raw.githubusercontent.com/mrdoob/three.js/r180/examples/webgl_postprocessing_pixel.html
- Octopath II: [RPGFan](https://www.rpgfan.com/review/octopath-traveler-ii/), [TheSixthAxis](https://www.thesixthaxis.com/2023/02/17/octopath-traveler-2-review/), [Pocket Tactics](https://www.pockettactics.com/octopath-traveler-2/review), [NWR](http://www.nintendoworldreport.com/review/62901/octopath-traveler-ii-switch-review), [Unreal Engine interview](https://www.unrealengine.com/en-US/developer-interviews/octopath-traveler-ii-builds-a-bigger-bolder-world-in-its-stunning-hd-2d-style), [My Nintendo News on camerawork](https://mynintendonews.com/2022/10/29/octopath-traveler-ii-devs-discussed-the-games-camerawork/), [Nintendo Everything](https://nintendoeverything.com/octopath-traveler-ii-devs-on-the-games-evolved-use-of-hd-2d-and-more/) (pages not fetchable here; content via search summaries)
- DQ3 HD-2D: [CGM review](https://www.cgmagonline.com/review/game/dragon-quest-iii-hd-2d-remake-ps5), [MP1st preview](https://mp1st.com/news/dragon-quest-3-hd-2d-remake-hands-on-preview-resurrected-warrior-tgs-2024)
- Pokémon BW camera: [PokéCommunity Daily](https://daily.pokecommunity.com/2024/03/06/part-i-the-components-of-unova/8), [Bulbapedia battle scene](https://bulbapedia.bulbagarden.net/wiki/Battle_scene)
- Pixel cameras: [David Holland](https://www.davidhol.land/articles/3d-pixel-art-rendering/), [Texel Splatting arXiv 2603.14587](https://arxiv.org/html/2603.14587v1), [Smooth Pixel Perfect Camera](https://lordkevep.itch.io/smooth-pixel-perfect-camera), [kirupa thread](https://forum.kirupa.com/t/best-way-to-stop-subpixel-jitter-in-a-pixel-art-canvas-camera/681011)
- Accessibility: [W3C Understanding 2.3.1](https://www.w3.org/WAI/WCAG21/Understanding/three-flashes-or-below-threshold)
- npm (checked, none needed): camera-controls 3.1.2 MIT, maath 0.10.8 MIT, gsap 3.15.0 (proprietary "no charge" licence), @theatre/core 0.7.2 Apache-2.0 (studio AGPL-3.0), animejs 4.5.0 MIT. Orbkin's own `tween()`/`ease` cover all of this; **no new dependency**.

## 12. Open questions
- CSS-translate remainder on iOS Safari / Android Chrome compositors (crisp? any re-filtering?) — needs a phone test.
- Human A/B of the MP4s (owner): does the 6-frame eased punch-in's crawl read as a defect at speed? The judge liked it.
- Sprite re-bake under orbit (moiré on sprites): would freezing the bake viewpoint during short orbits look better?
- Bloom shift-variance: worth an even-offset lock, or invisible in practice?
- The low tier (300 px tall, 4 device px per texel on phones) was not captured; the remainder buys 4 sub-steps there.
