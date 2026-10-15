# Camera motion at a fixed pixel grid (read at S4 for any camera move, drift, shake or transition)

Contents: 1 allowed moves · 2 pan-grid locks (where, what) · 3 view-offset drift recipe (title) ·
4 intro pan + iris reveal · 5 punch-in cut and shake · 6 measuring. Source: camera-transitions-motion.md.

## 1 Allowed moves (measured on the cave battle, 640×360, 120 frames, world frozen)

| Move | Allowed? | rigid / rigid_bad % / flick % |
|---|---|---|
| Pan/tilt as whole-internal-pixel `setViewOffset` shifts + the locks of §2 | **yes, freely** (intro sweeps, follow the attacker, settle, idle drift) | 0.013 / 0.00 / 0.000 |
| 3D truck/crane snapped to whole px at the focus depth + locks (+ CSS remainder translate) | sparingly, ≤ ~1 s | 0.247 / 0.79 / 0.000 (other depths crawl) |
| Dolly / FOV zoom / orbit, slow | **no** (0.19–0.31 % of pixels flicker per frame on shelves, windows, stairs, seams; native res does not fix it) | ≈ 1.0 / 1.5–12 / 0.19–0.31 |
| Dolly/zoom/orbit as a fast move ≤ 6–12 frames under a flash, or a cut | yes | cut frames are pixel-perfect |
| Punch-in | yes as a **cut on the contact frame** inside the hit flash; return with ≤ 12-frame ease or a whole-px pan | eased 6-frame zoom crawls 10 % but judges liked the smooth return |
| Shake | yes as a **damped directional kick** (A = 3–4 px, 5–6 crit; `A·e^(−t/70 ms)·cos(2π·9t)`, ≤ 8 frames, integer px) | the current `sin(k·40)` shake is a 24.5 Hz buzz (±2 px every frame for 11 frames) |
| Naive sub-pixel pan | **never** | 2.005 / 11.4 / 0.207 |

Speeds as regular cadences (1/4, 1/3, 1/2, 1, 2 px/frame); ease only over the first/last ≤ 12
frames. Static by default: motion is authored, never ambient during command selection.
Phone cost of all of this: zero extra passes (a projection-matrix update + two uniforms).

## 2 Pan-grid locks (a whole-px pan is only rigid when everything screen-snapped snaps in a grid that travels with the pan)

| What slips | Where (HEAD) | Fix |
|---|---|---|
| Sprite feet anchors (and their contact/drop shadows) snap in absolute buffer px: on a 1-px pan the floor moves 1 px, the sprite 0 or 2 (px = 2 internal px per texel) | `sprite.ts` `SpriteSubject.bake`, the two lines `ax = Math.round(… / px) * px` after "snap the feet to the texel grid" | `ax = round((sx − panX)/px)·px + panX` (same for y with panY); `panX/Y` = the current pan in internal px, held on the `SpriteBaker` (e.g. `baker.pan: Vector2`) and set by whoever pans |
| Bayer dither is screen-anchored → a whole-frame "screen door" crawl (2/255 on every gradient) | `pipeline.ts` GradeShader, the `bayer4(gl_FragCoord.xy)` line before `gl_FragColor` | `bayer4(gl_FragCoord.xy - uPan)` with `uPan` = the image shift in bottom-up buffer px (gl_FragCoord is bottom-up, same frame as the sprite `ay`); add the uniform and a `pipeline.setPan(x, y)`. One convention everywhere: pan = how far the IMAGE moved, +x right, +y up |
| Pixel FX flipbooks / points snap to `uRes` px | `fx.ts` the `floor(… * uRes + 0.5)` lines in the flipbook and points vertex shaders | same subtraction with a `uPan` uniform (battles only; title/starter have none) |
| Dust motes are world-space Points (`uSize` px) | `arena.ts` `dustMotes` / `DUST_VERT` | no lock needed (not screen-snapped); they move with the world |
| Sprite feet snap is inside `SpriteSubject.bake`, not the baker | `sprite.ts` `bake(renderer, camera, light, buffer, sharedPx)` | add a `pan` parameter (default a shared zero Vector2) and pass `this.pan` from `SpriteBaker.bake` |
| Bloom's half-res mip chain is not shift-invariant for odd shifts (window halos shimmer ≈ half the last residual) | `pipeline.ts` UnrealBloom | accept, or pan in 2-px steps during bloom-heavy shots |
| Vignette, tilt bands, bottom shade | grade | screen lenses by design: leave them anchored |

Residual after each lock (whole-px pan): none 0.214 → dither lock 0.037 → + sprite lock **0.013**.

## 3 View-offset drift recipe (what replaces the title's 3D truck in `hd2dScreen.ts drift()`)

The battle already does it for shakes (`hd2dBattle.ts shake(dx, dy)`): keep the snapped base offset
and shift it by whole internal px. For the stage (`Hd2dScreenStage`); verified by pilot 2 on both axes:
```ts
// framed(): after snapping, keep the whole view-offset tuple and the CSS px per internal px; reset the pan
const v = cam.view;   // null/disabled when fitPoints never set an offset: fall back to (0, 0, W, H, W, H), W/H = renderer.width/height (CSS px)
this.base = { pos: cam.position.clone(), focus, s, off: v?.enabled ? [v.offsetX, v.offsetY, v.fullWidth, v.fullHeight, v.width, v.height] : [0, 0, W, H, W, H] };
this.baker.pan.set(0, 0); this.pipeline.setPan(0, 0);
// drift(d): world units at the focus depth → whole internal px (px = world units per internal px)
const nx = Math.round(d.x / px), ny = Math.round(d.y / px);          // d.x = camera right, d.y = camera up
const [ox, oy, fw, fh, w, h] = base.off;
cam.setViewOffset(fw, fh, ox + nx * s, oy - ny * s, w, h);           // offset +x shows more of the right: the IMAGE moves −nx (left);
cam.updateProjectionMatrix();                                        // offset −y shows more of the top: the IMAGE moves DOWN
this.baker.pan.set(-nx, -ny); this.pipeline.setPan(-nx, -ny);       // the locks of §2 take the IMAGE shift in bottom-up buffer px
```
- Plumbing that does not exist yet: `SpriteBaker.pan: Vector2`, threaded into `SpriteSubject.bake(renderer,
  camera, light, buffer, sharedPx, pan = NO_PAN)` (the feet snap lives there, not on the baker);
  `Hd2dPipeline.setPan(x, y)` + the `uPan` uniform; `Grade.tiltUnscaled`; a `urlParam(name)` helper
  next to `postFlags()` for `drift=0` / `dpx=x,y` switches (hold the camera; force a pan for the sign check).
- This keeps the old truck's direction (camera right ⇒ image moves left). `cam.position` stays at
  `base.pos`; `d.z` is dropped (or kept as a rare snapped move).
- Pass the sub-window `w, h` (what `fitPoints` set), never `fullWidth, fullHeight`, or the framing changes.
- Required sign check (S4, both axes, ≈ 2 min): capture the held frame (`--extra 'drift=0'`) and the
  forced pans (`--extra 'dpx=1,0'`, `--extra 'dpx=0,1'`) with `cam_capture.mjs --frames 1 --skip 90`, then
  `sign_check.py held/f0000.png panx/f0000.png --expect=-1,0` and `… pany/f0000.png --expect=0,1`
  (top-down y: +1 = down). Expect: dominant shift 100 % of blocks, centre band ≥ 95 % exact (pilot 2:
  96 %), whole frame ≈ 72 % exact with the grade on (the vignette and tilt ramps are screen-anchored
  by design) and ≥ 99.9 % with `post=nograde`. `cam_analyze` rigid on such a pair is ≈ 0.2–0.3 from
  those lenses: not a lock failure.
- `framed()` runs on every resize: it re-derives the base and resets the pan, so the next `drift()`
  re-applies it.
- Amplitude: px per world unit at the focus depth = bufferHeight / (2·focus·tan(fov/2)). Title desk:
  28.2 px/u at focus 17.56 u (fov 40) → the ±0.55 u drift is ±15 internal px, ≈ 0.03 px/frame at the
  zero crossing → a 1-px step every ~36 frames, held in between; phone 49.5 px/u → ±27 px. Read
  `window.__hd2dScreen` in a headless page for the live numbers. A forced ±50 px pan shows no
  uncovered edge on either view (the backdrop pad is 4 %).
- Gate it (§6): rigid ≤ 0.05, flick ≤ 0.02 %, rigid_bad ≤ 0.5 % as EXCESS over the idle clip of the
  same screen (pilot 2: +0.006 / +0.014 % / 0.0 desk, +0.013 / +0.011 % / +0.07 % phone); MP4 for the owner.

## 4 Intro pan + iris reveal (battle-in, ≈ 1.6 s, judge 4/4 over static)
1. Overworld: 2 grey pulses (16 frames each to 40 % #5a5a5a, ≥ 20 frames apart; WCAG-safe, never 3 flashes/s).
2. Cover: terrain-specific wipe in the grade pass, 30 frames in 10 steps (shards, iris, mosaic, dissolve; stronger foe = second variant).
3. Reveal: iris opening on the foe (30 frames) while the locked intro pan runs (−40, −24 px → 0 over 48 frames, ease-out cubic, whole px).
4. Kin appear: existing scale-up with the sprite white 12 frames then 0.6/0.3/0 for 4 frames each.
5. Faint: cry/flash then a fast sink (≈ 16 frames), not the 730 ms topple.
Transitions as `uTrMode/uTrK/uTrC` uniforms in the grade pass (0 extra passes); `P = floor(gl_FragCoord.xy)`.

## 5 Punch-in and shake
- Punch-in: cut on the contact frame via the `setViewOffset` sub-window (`width·z, height·z` around
  the target), hold 12–24 frames, return ≤ 12-frame ease or whole-px pan. Base framing untouched.
- Shake: directional kick along the hit direction (camera pushed away from the attacker), integer
  px, ≤ 8 frames; `prefers-reduced-motion` and a settings toggle respected. Hit-stop ≥ 6 frames
  (one sprite-bake period) with a forced bake on frame 1 (orbkin-battle-vfx owns the hit timing).

## 6 Measuring (never judge stability from stills or frame strips: strips failed a ±1 px jitter canary and preferred the crawling clip 4/4)
```
node scripts/cam_capture.mjs --dist DIST --out /tmp/cam/after --screen title --view desk --frames 120 --skip 90
node scripts/cam_capture.mjs --dist DIST --out /tmp/cam/idle  --screen title --view desk --frames 120 --skip 90 --extra 'drift=0'   # your switch for "move off"
python3 -I scripts/cam_analyze.py /tmp/cam/after --baseline /tmp/cam/idle --relative --mp4 /tmp/cam/after.mp4
```
A live world (sway, sprite bakes) has its own floor; gate on the EXCESS the move adds. Measured idle
floors (drift off, 120 frames from frame 90): title desk rigid 0.319 / bad 2.33 % / flick 0.0145 %;
title phone 0.274 / 1.92 % / 0.0094 %; idle cave battle 0.063 / 0.41 % / 0. The absolute thresholds
are unreachable on the title; the view-offset drift adds 0.007 / 0.04 % / 0.011 % (desk), the old
truck 0.099 / 0.87 % / 0.015 %. Kymographs catch gross jitter (4/4) but are order-biased on subtle pairs;
strips judge beats (hit-stop, flash) only, with the dropped-hit-stop canary.
