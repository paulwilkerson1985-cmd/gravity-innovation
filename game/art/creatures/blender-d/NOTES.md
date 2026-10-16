# Approach D — headless Blender (bpy 5.2.2), real modelling ops + toon render

Deliverables: `ashkit.png`, `stormoth.png`, `cragmaul.png` (1024², RGBA, transparent, feet/base on
y≈903 incl. 3 px ink, creature 820–827 px tall ≈ 80 %, centred, 3/4 front facing right, light from
image upper-left). Scripts and `.blend` files in `work/` (`common.py` = the pipeline, one script per
kin, `bbox.py` = alpha-bounds check, `timing_probe.py`). Iterations kept: `work/<kin>_v*.png`
(Ashkit 4 rounds, Stormoth 5, Cragmaul 4).

## How it was made (per kin, 100 % script, no external assets)

1. **Blockout with metaballs** (`Blob`): body, head, cheeks, limb chains, tail, hump, shoulders.
   Visible radius is corrected for the metaball falloff (`R = r / sqrt(1 - (thr/stiff)^(1/3))`).
2. `convert → mesh` then **voxel remesh** (0.016–0.02 units on a ~2-unit creature → 35–85 k tris,
   watertight). Cragmaul gets a Clouds **Displace** pass (sculpt-like boulder lumps) plus firm
   metaball "rock plates".
3. **Hard parts** built with primitives/bmesh: tapered UV-sphere ears, flattened eye ellipsoids placed
   along the head normal (`track=`), hexagonal-prism **crystals** with pointed caps, Catmull-Rom
   smoothed **slab** outlines + Solidify for moth wings / lightning bolts / serrated comb antennae,
   bevelled curve tubes for mouth lines, a second metaball object for the white storm ruff.
4. Everything is **Boolean-UNIONed into one mesh** (MANIFOLD solver, EXACT fallback; materials
   transferred). Reason: Freestyle never draws object-intersection lines, but a union turns every
   part junction (ear→head, crystal→fist, eye→face) into a real crease that Freestyle does draw.
   Then `shade_smooth_by_angle(45–50°)`.
5. **Colour zones as a POINT colour attribute**, written with numpy predicates on position/normal
   (belly, mask, inner ear, soot socks, gold bands, chest plate …) after the union, masked by material
   slot; one neighbour-average pass softens zone edges. Lesson: paint after the final boolean
   (EXACT zeroes attribute values of the operand) and never put a gradient zone on a fan-triangulated
   slab (streaks) — flat colour there.
6. **Toon material** = one node group: half-Lambert of a fixed world light direction (image
   upper-left, computed from the camera basis) × a cheap Cycles AO term, through a 3-band
   ColorRamp (cool shadow 0.5, mid 0.78, lit 1.0, narrow highlight 1.12) with 4 %-wide soft
   transitions, multiplied onto the base colour, fed to an **Emission** shader. Glow parts (ember,
   crystals, eyes) lerp the ramp toward flat. No lights in the scene → Cycles does only AA + AO.
7. **Ink** = Freestyle, `ABSOLUTE` thickness: external contour 6 px, inner silhouettes/borders/creases
   3 px (crease angle 100°), round caps, calligraphy modifier (0.7–1.25×) for line weight variation,
   per-material line colour via the `MATERIAL/LINE` colour modifier (ember lines red-orange, crystal
   lines deep cyan, glints white = invisible line).
8. **Camera**: orthographic, yaw 35°, elevation 12°; frame fitted to the evaluated mesh's screen
   bbox so height = 80 % and the lowest point lands on y = 900. Cycles CPU, 24 spp, `max_bounces=0`,
   no denoise, `film_transparent`, Standard view transform, PNG RGBA.

## Time per creature (4 CPU cores, no GPU)

| step | Ashkit | Stormoth | Cragmaul |
|---|---|---|---|
| metaball → voxel remesh | 0.7 s | 0.4 s | 0.7 s |
| parts + boolean union | 8 s | 7 s | 12 s |
| colour zones (numpy) | < 0.2 s | < 0.2 s | < 0.2 s |
| render 1024² 24 spp + Freestyle | 31 s | 35 s | 32 s |
| **script total** | **41 s** | **42 s** | **44 s** |

Render probe on the saved Ashkit scene: 24 spp + Freestyle 25 s, 24 spp without Freestyle 22.5 s,
8 spp without Freestyle 6.5 s, 8 spp + Freestyle 8.0 s → Freestyle on an 80 k-tri union costs
~1.5–2.5 s; the rest is Cycles AA/AO. With renders queued alone the numbers above held; with other
agents contending they roughly doubled. Authoring (human/agent) time: ~1.5–2 h for the first kin
(pipeline + helpers), then ~30–45 min per kin for 3–5 render-critique rounds.

## Repeatability for all 20 kin

- Deterministic and fully parametric: each kin is ~120 lines (coordinates, a few outlines, 5–8
  zone predicates, palette). The shared `common.py` already covers blobs, ears, eyes, crystals,
  wings/slabs, tubes, union, zones, toon, ink, framing. Species lines reuse builders (Cindertail /
  Pyrelord = Ashkit with new proportions; Pebblet = one Cragmaul crystal cluster; Cyclonyx /
  Petalwisp = Stormoth slab wings/petals), so 20 kin is realistic in ~1–2 days of agent time, and a
  palette/pose change re-renders in under a minute.
- The look is **consistent by construction** (one shader, one ink setup, one camera/light), which is
  the main thing hand-drawn or AI-image approaches struggle with across a roster.
- Fragile points, all with known fixes: metaball blends can't make sharp junction lines (use a
  separate part + union); the MANIFOLD boolean refuses non-manifold operands (automatic EXACT
  fallback, ~10× slower); colour-zone predicates are written in world coords so a pose change needs
  the paint to happen before posing (done); far-side eyes must stay ≤ ~20° off the face axis or they
  bulge past the head contour in a 35° view.
- Quality ceiling: smooth, clean, consistent — but shapes are "sculpted primitives". Appeal depends
  on the author's proportions; fine hand-drawn details (fur breaks, expressive mouths, eye shapes)
  are expensive here, and the ink is uniform-weight-ish compared to a drawn line.

## Animating (idle / attack / hit) and how it reaches the game

Two routes, both already proven in this container (see `docs/research/graphics/lab.md` §5–8):

**A. Pre-rendered sprite sheets (recommended for this look).** Add an Armature (metaball-derived
mesh skins fine with automatic weights; small islands such as eyes/crystals need 100 % weight to the
head/fist bone — lab §7) with 6–10 bones, author 3 clips as keyframes in the script (idle bob /
breathe + ear/wing/antenna wag, attack lunge with squash-stretch, hit recoil), and render each
frame through the same camera. Cost: this toon scene at 24 spp is ~30 s per 1024² frame, but at
sprite resolution (256–512 px, 8 spp) it is 1–3 s, and with the 1-spp emission trick from lab §8
0.1 s. Budget per kin: ~30 frames (idle 12, attack 10, hit 6, + faint 6) at 512² ≈ 1–2 min of
render; 20 kin ≈ 30–40 min on this box. Pack with the existing sprite tooling into one 2048² atlas
per kin (≈ 300–600 KB WebP). The game then plays flipbooks exactly as the current HD-2D sprite bake
does; no new runtime code beyond an atlas loader. Camera-locked 3/4 view only (mirror for the other
side), which is how the battle screen already works.

**B. GLB + runtime toon.** Retopo the union with QuadriFlow (prescale trick, lab §2.2) to 3–6 k quads,
UV + bake the vertex colours to a 512² albedo, export skinned GLB with NLA clips (lab §5: ~15 s,
60–80 KB with meshopt). In three.js use `MeshToonMaterial` with a 3-texel gradient map + an
inverted-hull outline (2 draw calls per creature, within the < 100 budget) or a screen-space edge
pass. Gives free turntables, hit flashes and camera moves, but the ink will be less crisp than
Freestyle and the per-kin cost rises (retopo + weights + bake ≈ +3–5 min and more failure modes).

**Per-kin cost summary:** model + render still ≈ 45 s machine time; sprite-sheet animation ≈ 2 min
machine time + ~20 min authoring the three clips (the clips are shared per idle style, so most kin
inherit them); GLB route ≈ +5 min machine, +30 min authoring.
