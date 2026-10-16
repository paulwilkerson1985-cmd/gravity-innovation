# Approach C — hand-authored vector art (SVG → PNG)

## Deliverables
- `ashkit.png`, `stormoth.png`, `cragmaul.png` — 1024×1024 RGBA, transparent, 3/4 front facing right,
  art 820 px tall (80 %), centred, lowest point on y = 900, no shadow/background.
- Sources: `work/ashkit.py`, `work/stormoth.py`, `work/cragmaul.py` (one Python file per kin that emits the
  SVG), `work/celkit.py` (the shared ~250-line kit), `work/<kin>.svg` (the final SVG actually rasterised),
  `work/sheet.png` (contact sheet).

## How it was made
1. Each creature is authored as a layered SVG: a back-to-front list of **Parts** (ellipses, Catmull-Rom
   blobs, polygons, cubic paths) written by hand from the CREATURES.md row — body, legs, ears, tail,
   wings, fists, crystals, head — plus **Raw** overlays (eyes, mouth, whiskers, veins, antenna barbs).
2. **Ink** is a two-pass trick: every structural part is first drawn in the ink colour with a fat
   round-joined stroke (24 px), then redrawn with its fill and a thin stroke (5–8 px). Fills cover the
   fat strokes wherever there is colour, so the fat line survives only on the outer silhouette — a
   heavy contour, lighter interior lines, with no manual line-weight work. Fine parts (antennae, eyes,
   crystals on fists) opt out of the fat pass so thin forms stay thin.
3. **Cel shading** per part: a list of shade shapes clipped to the part — a shadow crescent (fill the
   part with the shadow colour, then put the base colour back offset toward the light), an optional
   core shadow, one highlight blob, and markings (cream mask, belly, stripes, bolts, cloud spots) as
   un-inked colour regions. Light is from the upper-left on all three; cast shadows (head → body,
   brow → face, body → far wing) are extra clipped shapes. Emissives (ember, crystals, eyes) get a
   soft radial-gradient halo — the only non-flat element.
4. Rasterised with Inkscape 1.2 (`inkscape in.svg -w 1024 -h 1024 --export-type=png`); Chromium/
   Playwright would do the same. A fit step renders once, measures the alpha bbox and re-renders with a
   transform so the art is exactly 820 px tall, centred, feet on y = 900.
5. Critique loop: render → look → list defects → edit coordinates → re-render. Ashkit 3 rounds,
   Stormoth 3 rounds, Cragmaul 3 rounds (head reworked twice).

## Time per creature
- Authoring from the design row to a first render: ~25–40 min of coordinate work per kin (the kit took
  ~20 min once). Each critique round: 5–15 min. Total here ≈ 45–60 min per creature; render itself is
  ~2.5 s. A second artist/agent with the kit and these three as reference should hit ~30–45 min per kin.

## Repeatability for all 20 kin
- Fully deterministic and editable: every shape is a number in a file, palettes are named constants, the
  pipeline is `python3 kin.py out/` with no network, no models, no binaries. Consistency of line weight,
  shading rules and light direction is guaranteed by the kit, not by discipline.
- The cost is draughtsmanship: appeal depends entirely on the hand-placed coordinates. Quadrupeds,
  blobs, insects and brutes all worked; the hardest parts were expressions (Cragmaul's brow/eyes needed
  two redraws) and getting a 3/4 read without perspective tools (Stormoth is a foreshortened frontal).
  Complex silhouettes (Verdantusk's grove, Maelstrode's coil, Pyrelord's mane/crown) will take longer
  (60–90 min each) and more rounds. Expect ~20–25 h for the full roster, with the three stage-1 blobs
  (Dropple, Mossling, Pebblet, Breezel) at the cheap end.
- Variants are free: palette swaps (shiny), scale/stage comparisons and a lineup sheet are one-line
  changes; re-rendering the whole set at 2048 or as SVG for the web costs nothing.

## Animating in-game (idle / attack / hit)
- The files are already **part rigs**: each Part is a separate SVG element with a known pivot. Export
  the parts as individual layers (or keep the SVG in the DOM / as a texture atlas) and animate with
  transforms: idle = body squash/stretch 2–3 %, head bob, tail/ember flicker, ear twitch, wing flap by
  scaling wings about the thorax root, breathing on the torso; attack = anticipation (lean back, scale
  x 0.95) → lunge translate + stretch → impact squash, with fists/head on their own tweens; hit =
  white flash (swap fills via CSS class), recoil skew/tilt, knock-back. This is the same idle/lunge/
  hit/faint vocabulary CreatureView already plays, so engine events map 1:1.
- Implementation options: (a) render each part to a sprite sheet and drive a 2D bone rig in Three.js
  (sprite planes per part, one draw call with an atlas) or in Spine/DragonBones-style JSON; (b) keep
  the SVG and animate it with CSS/SMIL for menus and the bestiary. Caveat: the two-pass ink is baked
  per part, so parts must be exported *with* their own fat outline (the kit can do that per part) and
  overlaps re-sorted at runtime; mouth/eye changes are simple layer swaps (open/closed/hurt). Smear
  frames or a true turn-around need new drawings — a 3/4 rig cannot turn to the other side without a
  mirrored export (fine for facing left/right).
- Consistency across 20 kin: because every kin is built from the same kit with the same pivots
  convention (ground origin, named parts), one animation script per body archetype (quadruped, flier,
  biped brute, blob, serpent) covers the roster.
