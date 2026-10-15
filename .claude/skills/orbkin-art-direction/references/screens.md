# Per-screen style sheet (title, starter, route map, battle, evolution, catch, location card, menus)

Source: `research/non-battle-screens-overworld.md` (31 blind verdicts, canaries 4/4, $6.20),
`reference-board-measurement.md`, `judge-calibration.md`. Values are starting points; the gate decides.
Read this at S3 for any non-battle screen. Battle has its own row because the camera and the UI differ.

## Contents
- §sheet: per-screen style sheet
- §knobs: where the values live
- §sequences: evolution, catch, title, location card timings
- §lessons: rules the experiments produced
- §dom-vs-3d

## §sheet

Focus band = fraction of frame height, **top -> bottom** (what `screen_metrics.py` reports).

| Screen | Camera | Subject size (frame height) | Focus band | Blur (internal px) | Value structure | Light | Layers | Must | Must not |
|---|---|---|---|---|---|---|---|---|---|
| **Title** | pitch ≈ 27° (portrait 32°), whole-texel drift ±0.55 | trio 14 % now -> 18-25 % | 0.40-0.64 around the trio | top 3.6 @ focusTop 0.60, bottom 3.6 @ focusBottom 0.36, vignette 0.6, bottom shade under the menu | dark-dominant (notan ≈ .65/.25/.10); brightest value = clearing + trio | warm golden key from the back-side, shafts with motes, rim on the kin | dark blurred foreground flora; crisp clearing; blurred warm hazy back | pixel wordmark with plate (≥ 27 % width desk, ≥ 55 % phone), one shine sweep at 1.3 s then every 6-8 s, skippable | typed-text logo; emblem replacing a letter; near-camera billboards with big texels; a low camera without a cleared foreground (`tkey` lost 0/4) |
| **Starter** | as now (≈ 25-30°) | three kin on daises 10-14 % | 0.34-0.66 | 3.6 @ 0.66 / 3.6 @ 0.34, vignette ≥ 0.5 | chosen dais brightest (focal pool) | canopy-gap shaft onto the **chosen** dais (check it hits the chosen kin on phone) | blurred grass foreground, crisp clearing, blurred canopy | selection change = light moves + the kin's idle/cry | uniform sharpness |
| **Route map** | desk/land: FOV 26°, pitch ≈ 30°, island ≈ 70 % of free width; portrait: whole island + ≥ 6 % margin, FOV 40° | hero ≈ 8-10 % (Octopath field 10 %) | 0.30-0.84 (blur only the sky above and the underside below) | top 3.6 / bottom 3.2, vignette +0.18 | today light-dominant (L* 69); aim L* 50-56 and make the island the value focus | directional key + long shafts whose **origin stays in frame** | cloud sea and far islands fogged toward the sky colour; no near occluders unless painted at the set texel | every hotspot inside the free area (readability probe recall 1.0); ground texel = sprite texel (recompute `MT` from the camera); idle whole-texel drift ±0.2 | near clouds at another texel scale (lost 0/4, "rendering bug"); blurred hotspots; cropping hotspots under the panel |
| **Battle** | fixed per layout (`battleStage.ts battleTargets()`) | kin 13-24 % desk (Octopath 15-24 %), people 31-44 texels | middle third-ish; bottom band ≤ 0.5 of peak, top ≤ 0.7 | depth DoF with subject mask (hybrid frame) | dark share ≈ 0.45, lit pool on the battle floor | one key + ≤ 3 shafts beside the kin; FX light tints the sprites | dark/defocused framing foreground (portrait: aprons + lip), crisp playfield, hazed back | 2 cells clean floor around the kin; rubble at the edges; UI ≤ 20 % desk / ≤ 35 % portrait | shafts over the subject; empty magnified floor on phone; panels covering a kin |
| **Evolution** | push from k 1.6 to ≈ 1.2 over the flicker; **window stays in frame** | creature 8 % now -> 15-20 % | creature and plinth (≈ 0.34-0.75) | top 2.6 @ 0.66, bottom 2.4 @ 0.25 | very dark (L* ≈ 16-20) with one hot core | window key dims to 40 % in the gather, white-out, bright reveal (120 % for 1 s) | dark room, rays, pixel sparkles | Emerald choreography (§sequences); scale cross-swap; reduced-motion cross-fade | vector starburst as the only effect; on/off luminance flashing > 3 Hz over large areas; losing the light source (lost 0/4 phone) |
| **Catch** | battle cam + 10 % push toward the orb | — | battle band | battle | arena dims ≈ 15 % on the click, vignette up | — | — | ≈ 1 s per shake with stillness; click darkening + 6-8 pixel stars; jingle hold | compressed shakes (today 0.64 s) |
| **Location card** | one-time ease-out reveal (1.2 s, whole texels) | — | — | — | — | — | DOM over the map | material 9-slice per route (meadow wood, ridge basalt, coast driftwood, plateau marble); 0.5 / 0.33 / 2.0 / 0.33 s; reduced motion = fade | a permanent banner as the only area identity |
| **Party / box / bag / shop / bestiary** | turntable 22.5° steps (exists) | kin on the plinth | plinth | room grade (exists) | dark room, lit plinth | window cookie | — | judge-calibration credited the r2 gains to these screens; keep them | — |

## §knobs

- Grade/tilt per screen: `game/src/render/hd2d/pipeline.ts` `Grade` (`tiltTop`, `tiltBottom`, `focusTop`,
  `focusBottom` measured from the **bottom**, `vignette`, `bottomShade`, `exposure`, `saturation`); screen
  sets in `src/render/hd2d/screens/*.ts` (`hd2dScreen.ts` computes `px` = world size of one internal pixel
  at the focus distance: painters must take it as the ground texel when the camera changes).
- Do not scale screen tilt down on the low tier: it is 13 taps and cheap (`?q=low` kept the full radius
  in the winning variants).
- Hotspot positions belong in the camera's `fitPoints`, not only the island box (a tighter frame silently
  dropped the flower patch: probe recall 1.0 -> 0.75).
- Logo: author as a bitmap (`tools/pixelfont/glyphs.ts` style), emit SVG `shape-rendering="crispEdges"`
  and/or PNG at 1x, display `image-rendering: pixelated` at an integer CSS scale; shine = CSS mask sweep
  in `steps()`. Free tools for touch-up: Inkscape, Pixelorama, LibreSprite (owner-installed; never
  downloaded by the agent).

## §sequences (primary code, pokeemerald; facts and timings only)

- **Title**: logo shine at 1.3 s and 3.2 s, banner 2.4 s later, prompt blinks at ~2 Hz, any input skips.
- **Evolution**: BG fades to black -> sparkles spiral up 2.7 s, arc down 1.6 s -> pre/post forms both
  white, **scale cross-swap** (one grows while the other shrinks) 60 swaps in 5.8 s, each from 24 frames
  down to 2 -> circle-in 0.8 s -> white-out + spray 2.1 s -> reveal with cry and jingle. Orbkin's toggle
  already follows the rhythm (520 ms x0.84 down to 55 ms); replace the on/off toggle with the cross-scale
  (no luminance flash > 3 Hz: WCAG 2.3.1) and keep the window in frame during the push-in.
- **Catch**: 31-frame rest + ~30-frame roll per shake (≈ 1.0 s, half stillness); click at +40 frames
  darkens the ball and bursts stars; jingle at +95, hold to +315. Orbkin: rest 500 ms + wobble 450 ms per
  shake, 650 ms before the click.
- **Location card**: 0.5 s delay, 0.33 s slide in, 2.0 s hold, 0.33 s slide out; frame themed per area.
- Static frames cannot judge these beats: gate them with frame strips (orbkin-visual-gate).

## §lessons (each became a rule)

1. **Blur the context, never the subject.** Place the band from the subject's screen extent, not from
   fixed fractions; tall things crossing the band edge (trees) get punished in crops.
2. **Pixel blur vs smooth blur is not what judges see on these screens; placement is** (no_difference
   on title and route, desk and phone).
3. **Every layer at one texel density**, including a camera zoom that magnifies a ground painted for
   another distance ("resampled, soft, mixed-resolution sprites").
4. **Framing is per aspect ratio**: desk wants a bigger subject; portrait already fills its width and wants
   breathing room above and below plus a visible light source. Write the fit rule per layout.
5. **Keep motivated light in frame**: push-ins must keep the window, the shaft origin or the lamp visible.
6. **Composition changes re-run the readability probe** (framing can silently drop a hotspot).
7. **HD-2D fields have no sky**: stepped dioramas, "the back is higher", narrow FOV (Octopath narrowed its
   FOV to feel 2D). The floating-island hub is a design choice for the owner; inside it, make the island
   the value focus and fog the far layer toward the sky colour.

## §dom-vs-3d

3D canvas through the HD-2D pipeline: every set, sprites, gems, "!" and ✓ badges, evolution rays, sparkles,
bursts. HTML over the canvas (`ui/dom.ts h()`): logo, tagline, buttons, menus, route tabs and hotspot
buttons, starter panel, evolution text box and `.evo-flash`, scene transitions (`#curtain`, CSS
`steps()`). So the logo and transitions are DOM work; depth hierarchy and cameras are 3D work.
