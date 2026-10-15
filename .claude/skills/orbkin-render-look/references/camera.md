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
| Sprite feet anchors (and their contact/drop shadows) snap in absolute buffer px: on a 1-px pan the floor moves 1 px, the sprite 0 or 2 (px = 2 internal px per texel) | `sprite.ts` ≈ 1113–1117 `ax = round(sx/px)·px` | `ax = round((sx − panX)/px)·px + panX` (same for y with panY); `panX/Y` = the current pan in internal px, held on the `SpriteBaker` (e.g. `baker.pan: Vector2`) and set by whoever pans |
| Bayer dither is screen-anchored → a whole-frame "screen door" crawl (2/255 on every gradient) | `pipeline.ts` GradeShader ≈ 264 `bayer4(gl_FragCoord.xy)` | `bayer4(gl_FragCoord.xy + uDitherOff)` with `uDitherOff = (panX, −panY)` (y flipped: gl_FragCoord is bottom-up); add the uniform and a `pipeline.setPan(x, y)` |
| Pixel FX flipbooks / points snap to `uRes` px | `fx.ts` 560–600 | same subtraction with a `uPan` uniform (battles only; title/starter have none) |
| Dust motes are world-space Points (`uSize` px) | `arena.ts` 448–506 | no lock needed (not screen-snapped); they move with the world |
| Bloom's half-res mip chain is not shift-invariant for odd shifts (window halos shimmer ≈ half the last residual) | `pipeline.ts` UnrealBloom | accept, or pan in 2-px steps during bloom-heavy shots |
| Vignette, tilt bands, bottom shade | grade | screen lenses by design: leave them anchored |

Residual after each lock (whole-px pan): none 0.214 → dither lock 0.037 → + sprite lock **0.013**.

## 3 View-offset drift recipe (what replaces the title's 3D truck in `hd2dScreen.ts drift()`)

The battle already does it for shakes (`hd2dBattle.ts shake(dx, dy)`): keep the snapped base offset
and shift it by whole internal px. For the stage:
```ts
// framed(): after snapping, remember the base view offset and the CSS px per internal px
const v = cam.view; this.base = { pos, focus, off: [v.offsetX, v.offsetY, v.fullWidth, v.fullHeight], s };
// drift(d): world units at the focus depth → whole internal px (px = world units per internal px)
const nx = Math.round(d.x / px), ny = Math.round(d.y / px);            // camera right / up
cam.setViewOffset(off[2], off[3], off[0] - nx * s, off[1] + ny * s, off[2], off[3]);   // the image moves +nx right, +ny up
cam.updateProjectionMatrix();
this.baker.pan.set(nx, ny);               // sprite anchor lock, bottom-up buffer px (same frame as `ay`)
this.pipeline.setPan(nx, ny);             // dither: bayer4(gl_FragCoord.xy − uPan) keeps the pattern on the image
```
- Sign check: capture 2 frames with pan 0 and pan (1, 0) on a static scene (`setFast`, no sway);
  `cam_analyze` rigid must be ≈ 0 and every block shift = (1, 0). If sprites or the dither disagree
  the sign is wrong, not the idea.
- `cam.position` stays at `base.pos` (no truck; `d.z` is dropped or kept as a rare snapped move).
- `framed()` runs on every resize: re-derive the base and re-apply the current pan.
- The sky/backdrop planes are aimed from the camera frustum at `framed()` time with 4 % padding; a
  ±0.55-unit drift at the title's distance stays inside it — check the frame edges on phone.
- Amplitude: the title drifts ±0.55 u (≈ ±13 internal px at 720p) at `sin(t·0.11)`: ≈ 0.14 px/frame
  peak → mostly holds with 1-px steps every few frames. That is the intended look (whole texels).
- Gate it (§6): rigid ≤ 0.05 excess over idle, flick ≤ 0.02 %, rigid_bad ≤ 0.5 %; MP4 for the owner.

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
A live world (sway, sprite bakes) has its own floor (idle battle: rigid 0.063, bad 0.41 %); gate on
the excess the move adds. Kymographs catch gross jitter (4/4) but are order-biased on subtle pairs;
strips judge beats (hit-stop, flash) only, with the dropped-hit-stop canary.
