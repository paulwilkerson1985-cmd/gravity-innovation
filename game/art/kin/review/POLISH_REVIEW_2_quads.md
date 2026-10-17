# Polish review 2: the quadrupeds (2026-10-17)

**Group verdict:** Ashkit is finished; the other six are one targeted pass away, and most of what reads as unfinished comes from five shared habits in the recipe (box belly zones, planar muzzle cuts, camera-offset flame cores, blur on coarse parts, paper-thin accent blades), not from the designs.

## Ashkit: polished
1. SHOULD: back and 3/4-back views show the ember core as an off-centre sliver (it is pushed along `d_cam` for the battle camera). Centre `ember_core` inside the ember (drop the `+ d_cam * 0.13`) and grow it to (0.11, 0.11, 0.21).
2. SHOULD: two curved crease lines under the tail (back view) and one on the near rump (3/4 back): the haunch pair leaves a cleft. Add a fill ball at (-0.52, 0, 0.58) r 0.30 before `B.mesh`.
3. NICE: the jowl ink from the mouth corner back along the jaw (side view) is still there. Shorten the mouth tube's last lobe point or raise the chin fill (0.70, 0, 0.84) r 0.25 -> 0.28.
4. NICE: ear tips and inner ear are an airbrushed gradient, not two cel bands (see cross-kin 4).

## Cindertail: needs polish
1. MUST: the chest ruff reads as five separate shards glued on (3/4, side, battle); the gold one hangs as a loose spike. Make the tongues one mass: minor axes 0.08 -> 0.14, sink the bases 40% into the chest (centre x 0.56 -> 0.50), overlap neighbours, and give the middle one gold only at its tip via a zone instead of a separate material.
2. MUST: belly cream bleeds onto the inner hind legs as a blotch (3/4 crop, back-3/4 crop at the far hock). See cross-kin 1.
3. MUST: back view: the plume is a flat triangle with a hard base line and a dark wedge under it; the pale core is a right-edge sliver. Centre the core (no `d_cam` offset), add a tail ball at (-1.08, 0.07, 1.70) r 0.20 so the plume grows from fur, and check what the dark patch is (it is soot-coloured, so likely the far ear's `ear_back` ellipsoid test catching the tail: add an `l[:,2] < 0.6` bound).
4. SHOULD: ear tips and inner cream smear (front crop). Cross-kin 4.
5. NICE: in the 3/4 view the far eye is tangent to the silhouette; `eye_y` 0.24 -> 0.22.

## Pyrelord: needs polish
1. MUST: the "fiery mane collar" reads as a row of flat dorsal fins (3/4, side) and as three yellow eggs on the neck from behind (back-3/4 crop). Rebuild it as a collar: a stiff metaball ring around NC (r 0.30, 8 balls r 0.14) added before remesh, then 10 tongues whose minor axes are 0.10 -> 0.15, bases sunk into the ring, `dirn` tilted less back (-0.85 -> -0.55 in x) so they fan out, and give every tongue the same `mat_ember` with the core colour painted as a tip zone.
2. SHOULD: spine studs are three specks (side crop); from behind they line up like buttons. Double their size (0.07 -> 0.12) and seat them in the back by 30%, or cut them.
3. SHOULD: gold belly strip bleeds onto the inner forelegs (3/4 crop). Cross-kin 1.
4. SHOULD: tail and crown cores off-centre in turn views. Cross-kin 3.
5. NICE: gold claws are 0.035 nubs; at 300 px they vanish. Scale to (0.05, 0.045, 0.09).

## Thistlehorn: needs polish
1. MUST: the horn is a thin bone stalk with a ball on it, a lollipop (front crop, side). Thicken the tube radii to [0.12, 0.10, 0.08, 0.06], curve it more (add a 5th point further forward and down), and grow the bloom to r 0.17 with the calyx sunk into the horn tip instead of a separate ring.
2. MUST: the mossy mantle has no shape; it is a dark zone whose edge wanders across the neck and flank like a stain (side crop, back-3/4). Either raise the mantle metaballs (size z 0.62 -> 0.95, stiff 2.6 -> 3.5) so the cushion makes a silhouette step that the ink can follow, and clip the zone to `co[:,0] < 0.20` so it stops before the neck; or drop the normal test (`nm[:,2] > 0.15`) and use the metaball mask directly.
3. SHOULD: the flank leaves are three identical outlined ovals per side, stickers (side crop). Vary the three (sizes 0.15/0.19/0.13, rotations ±10°), overlap them under the mantle edge, and lower them 0.04 so the top half is inside the body and only the free tip is inked.
4. SHOULD: lime chest disc sits on the shoulder as a hard circle and the belly box leaks to the inner leg (3/4 crop). Move the chest ellipsoid to (0.62, 0, 1.00) and apply cross-kin 1 and 2.
5. NICE: hooves are round caps on pipes. Give each hoof a flat front: `size=(1.25,1.0,0.85)` -> `(1.4,1.05,0.7)` with stiff 3.5.

## Rillback: needs polish
1. MUST: the signature board is a thin white sliver from the foe camera (battle.png) and a flat plate from the side. Give it rocker: thickness 0.065 -> 0.11, pitch `rot=(0, 2, 0)` -> `(0, -9, 0)` so the top face tilts to the 12° camera, lift the tail end 0.05, and widen the stripe to 0.11 so it survives downscale.
2. MUST: aqua belly shows through as translucent blotches on the inner hind legs (back crop, back-3/4 crop). Cross-kin 1.
3. MUST: the muzzle aqua is a hard horizontal band under the eyes, a bandage (battle crop). Replace `co.x > 1.28 & z < 1.30` with an ellipsoid centred on the snout, (1.44, 0, 1.14) radii (0.26, 0.30, 0.17).
4. SHOULD: the head fin is a stray 0.035-thick spike (front crop); it is not in CREATURES.md. Cut it, or make it a real crest (0.26 x 0.06 x 0.14, sunk 40%).
5. SHOULD: the fluke is a flat white disc on the floor (back view). Thicken to 0.08 and notch it (two overlapping ellipsoids).

## Verdantusk: needs polish
1. MUST: the leaf ears read as an ink ring on the side of the head, a porthole (side and 3/4 crops): the ellipsoid is buried with only its flat face flush. Move `EAR.c` y 0.60 -> 0.76, rotate it to droop (-34 -> -55 about x) and thicken to 0.09 so it leaves the skull.
2. MUST: back view: a vertical cleft between the haunches with the tail leaf standing in it like a crack; back-3/4: the same leaf shows as a dark oval patch on the far hip. Add a rump fill ball at (-0.86, 0, 1.06) r 0.42 and raise the tail (rot y 35 -> 65, x -1.04 -> -1.12, size 0.26 -> 0.32).
3. SHOULD: lime snout is a planar cut under the eyes (front crop). Cross-kin 2.
4. SHOULD: lone ferns (rump, far flank) read as stray spikes. Cluster three blades per spot or keep only the two inside the grove.
5. NICE: thistle crown is small for a final stage; r 0.10 -> 0.14.

## Cragmaul: needs polish
1. MUST: the brow is a boolean ellipsoid with its own closed ink loop, so the head reads as a man in a flat cap (front, side, battle crops). Add the brow as a stiff metaball (stiff 4.0, size (1.0, 1.25, 0.55)) before `B.mesh` so it melts into the skull and only its underside ledge is inked; drop `brow` from `parts`.
2. MUST: stray crease ink on the back and shoulders (back crop: a C-shaped stroke on the left shoulder, a curve mid-back). The cloud displacement makes creases steeper than 100°. Displace strength 0.06 -> 0.035, or `crease_deg` 100 -> 125 for this kin, and pass `smooth_iters=2` to `B.mesh`.
3. SHOULD: eyes are 0.075 slits; at sprite size they are two dots. (0.075, 0.09) -> (0.10, 0.11) and add a darker cyan pupil disc.
4. SHOULD: the light jaw patch is a hard box and the chest plate's top edge is a smear (front crop). Cross-kin 2 and 4.

## Cross-kin patterns (fix once in lib/common.py)
1. **Box belly zones bleed onto the legs.** Every quad paints the belly with `|y| < w & z in range`, which also paints the inner thighs; it shows as pale blotches or a smeared bar between the legs on six kins. Add `zone_belly(c, radii)` = ellipsoid test AND `nm[:,2] < -0.25` (downward faces only), and use it everywhere.
2. **Planar muzzle/jaw cuts.** `co.x > k & z < k` gives a ruler-straight edge under the eyes (Thistlehorn, Rillback, Verdantusk, Cragmaul). Add `zone_ellipsoid(c, radii)` and snap its centre to the snout tip.
3. **Flame cores offset toward the battle camera.** The `+ d_cam * k` on every `ember_core`/`crown_core` leaves a sliver in all front/back sheet views (Ashkit, Cindertail, Pyrelord). Centre the cores and enlarge them 15%; if the battle still needs it, apply the offset only inside the `MODE == 'battle'` branch.
4. **`smoothstep_blend` on uneven vertex density.** The remeshed body is dense, the 32x16 ellipsoid parts are coarse, so one averaging pass gives crisp body edges but airbrushed ear tips, inner ears and chest discs. Either voxel-remesh once after the union (0.02) before painting, or replace neighbour averaging with a per-zone signed-distance smoothstep of fixed width (0.03 model units).
5. **Paper-thin accent blades.** Ruff, mane, leaf fringe, ferns, board, fluke, head fin are high-taper ellipsoids with a minor axis under 0.05 and their base outside the body, so Freestyle draws a full loop around each and they read as stuck-on stickers. Add a `tongue()` helper: minor axis >= 0.08, base sunk 30-40% into the body, and group neighbours so they overlap into one silhouette.
6. **Haunch pairs leave an inked rump cleft** (Ashkit, Cindertail, Verdantusk back views). Put a central rump fill ball in `quad.py`'s blockout pattern.
7. **Boolean parts that should be skull** (Cragmaul brow, Verdantusk ears, Thistlehorn calyx) carry a closed ink outline. Rule: anything meant to merge with the body goes in as a stiff metaball before remesh; booleans are for parts that should have a crease.
