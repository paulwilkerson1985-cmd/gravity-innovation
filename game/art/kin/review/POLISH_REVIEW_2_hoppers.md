# Polish review 2: round hoppers + the ray (dropple, mossling, pebblet, breezel, vulcrag, surgeray)

**Group verdict:** Breezel and Dropple are a fix-list away from shipping; Mossling and Pebblet need their colour zones redone; Vulcrag's arms, veins and plume read as placeholder; Surgeray needs a rework of head, tail and bolts.

Scripts: `game/art/kin/<kin>/model.py`, shared `game/art/kin/lib/common.py`.

## Dropple: needs polish
1. **MUST** Fins read as blue stickers, not fins (3_side, 4_back34, battle: a flat inked teardrop on the body). `fin` ellipsoid centre y=0.66 is inside the body's radius at z=0.30. Move to y=0.78, z=0.34, scale (0.20, 0.13, 0.05), rot (-35s, 10, -30s) so each fin leaves the silhouette, and add a 0.03 fillet by unioning a small ball at the root so a crease ring forms.
2. **MUST** Shine spots fuse into a kidney smear on the silhouette (battle, 1_front). `shine0`/`shine1` directions are 15 deg apart. Keep one large shine (0.55,0.45,0.70) r=0.07 and one small (0.40,0.55,0.80) r=0.03; drop the other two, move them >25 deg off the silhouette normal from the battle camera.
3. **SHOULD** The tip zone is a hard horizontal band at z=1.36 (1_front crop) and the back of the tip has a muddy crease blob (5_back). Replace `co[:,2] > 1.36` with a smooth ramp along the tip's arc (distance from the body centre, blended from 1.20 to 1.55), and run `smooth_iters=2` in `B.mesh` to remove the metaball junction crease.
4. **SHOULD** Back ripple bands end abruptly at x<0.05 as blurry stubs (2_threeq, 3_side). Fade the predicate by x (band alpha = clip((0.05-x)/0.25)) or end each band in a rounded dot; `smoothstep_blend iters=4` is too soft here; use 2 and widen the bands to 0.06.
5. **NICE** Mouth is a 7 px bird V. Lift the corners (end points z+0.03) and radius 0.018 so it reads as a smile at 300 px.

## Mossling: needs polish
1. **MUST** Back mottling is square blotches (5_back, 4_back34): `sin*sin > 0.45` on coarse vertex colours reads as camouflage/dirt. Colour by geometry instead: for each clump centre in the blockout list, paint `|co - c| < r*0.85` MOSS_D (or LEAF lighter on the top third, `nm z>0.5`), so dark/light follows the lumps. Drop the sin predicate.
2. **MUST** Stray interior ink: short crease arcs float on the crown and around the blooms (battle crop, 3_side crop). These are metaball junction creases under `crease_deg=100`. Either `smooth_iters=2` in `B.mesh` (removes the shallow folds) or raise `crease_deg` to 120 for this kin, keeping the silhouette lineset.
3. **SHOULD** Pale face bleeds past the oval and under the chin with a fuzzy edge (2_threeq crop). Tighten the ellipse (y/0.38, z radius 0.32) and use `iters=2`; keep the cheeks soft by painting them after the blend.
4. **SHOULD** Feet are two body-coloured lumps (1_front crop); in 3/4 they read as a chin. Make them their own slot material (`foot`, MOSS_D or a bark brown) with two toe notches (three tiny ellipsoids), and push them forward to x=0.34.
5. **NICE** The two back blossoms sit on the silhouette in 3_side and their petal ink doubles. Move the left one to (-0.75, 0.25, 0.60) so both are inside the outline at the back camera.

## Pebblet: needs polish
1. **MUST** Face zone is a smeared stain on crisp facets (1_front, battle crops: a lighter forehead column, blotchy chin). Vertex-blended colour over a dissolved/subdivided faceted mesh is a style clash. Paint per face: compute face centroids and write a `FACE_CORNER` colour attribute (or set all corners of a polygon to the facet's colour), choosing the zone from the centroid; skip `smoothstep_blend` entirely for faceted kin.
2. **MUST** "Stone flecks" read as grease spots (5_back crop). With per-face painting, make flecks whole facets (5-8% of facets off the face, chosen by a hash of the centroid) in SAND_D, not blurred noise.
3. **SHOULD** Dark chin band (SAND_D below z=0.10 plus the normal rule) rises into the lower face and looks like a beard in 1_front. Restrict the second rule to x<-0.10 only and lower the face oval centre to z=0.46.
4. **NICE** Far-eye glint pokes through the silhouette as a white sliver (4_back34 crop). Move `eye_y` to 0.19 and `eye_fwd` 0.14, or let the turnaround use sheetkit's `FAR_EYE_T` hide.

## Breezel: needs polish (closest to done)
1. **MUST** Wings are flat inked ovals painted on the body (3_side, 4_back34, back-attack f0-3 on the contact sheet). `wing` centre y=0.48 is inside the body radius 0.50. Centre at y=0.62, z=0.58, scale (0.26, 0.10, 0.16), rot (-25s, -15, -35s), and give the wing a pale WHITE_B tip zone (taper end) so it reads as a feathered wing.
2. **SHOULD** Tail fan reads as three white claws/quills (5_back, 3_side crops): taper 0.7 on a 0.10 ellipsoid. Use taper 0.35, scale (0.22, 0.13, 0.06), raise to z=0.62, and colour them SKY with white tips; or make one broader slab fan.
3. **SHOULD** Belly white merges with cloud white (1_front crop): the body's lower edge vanishes. Limit the belly ellipse to z>0.42 and tint the cloud CLOUD_D at `#dbe8f5` so the two whites separate; blend `iters=2`.
4. **NICE** Beak reads as an orange nose dot (1_front). Length 0.14, add a thin ink seam (a 0.004 tube in `mat_beak` ink colour) along the bite line.
5. **NICE** From the back cameras the big curl is edge-on and reads as a candle (4_back34). Yaw the curl 55 deg instead of 35.

## Vulcrag: rework (arms, veins, plume)
1. **MUST** Arms are thin tubes lying flat on the cone with an inked outline, fists are plain spheres (3_side, 2_threeq crops: a drainpipe with a ball). Radius 0.17-0.19, start from a shoulder ball (metaball r=0.22 at the cone side, z=0.74) and bend out with a visible elbow gap (middle point y offset +0.30); fists as a flattened sphere (0.21, 0.19, 0.15) with three knuckle ellipsoids and a BASALT crust zone on top so "molten" reads as glow in cracks, not an orange ball.
2. **MUST** Magma veins read as lightning bolts (5_back, 2_threeq crop): `res=1` zig-zags with dashed dark-red ink. Make cracks: 2-3 branching paths from the rim with `res=3`, radius 0.035 tapering, a LAVA inner tube at 0.45 radius inside a MAGMA outer one; ink colour MAGMA_D not `#5a1a00`; let 1-2 cracks reach the base so the cone feels lit from within.
3. **MUST** Plume is an ice-cream scoop with two floating balls (1_front crop). Make the plume a metaball blob that spills a drip over the rim toward the camera side (a LAVA tube down the flank to z=0.70), and connect the spits with a 0.012 LAVA arc tube or drop `spit1`.
4. **SHOULD** The cone is one flat dark mass: at `#4a4040` the ramp has no range. Lighten BASALT to `#5c4e4c`, keep BASALT_D at the base, and paint rim and arm tops BASALT_L so facets step in value.
5. **NICE** Stray short crease ink on the flank near the arms (2_threeq). `crease_deg` 115 for this kin.

## Surgeray: rework
1. **MUST** The tail bolt stands up behind the head between the antennae (1_front, 5_back, battle: a spear). Lay the tail flat and curve it to one side: points (-0.68, -0.10, z), (-0.92, -0.28, z+0.02), (-1.08, -0.40, z+0.05), bolt slab horizontal (rot 0,0,-40). Three yellow elements must not stack in any camera.
2. **MUST** Face is a smear: pale zone chosen by normal over the mound bulge gives white streaks across the eyes and scribbled ink around the mouth (1_front, battle crops). Define the face by distance from the mound centre (ellipse radius 0.22 x 0.16 on the mound front), remove the normal rule, and move the mouth tube 0.01 proud of the skin with `res=6` so the ink is one clean arc. The nose tip in battle becomes a long beak: shorten the outline nose (0.46 to 0.40).
3. **MUST** Bolts are thin `res=1` tubes that fragment into dashes and a tangle (4_back34 crop). Make them flat `slab` lightning shapes (plane XY, thickness 0.03, no bevel) conformed to the skin by snapping each outline vertex, one per wing plus one on the back, ink only on the external contour.
4. **SHOULD** The lens bend creases the wings into shading bands and a hard fold (2_threeq crop) and the side view reads as a slug. Apply the bend before the subsurf, raise `bulge` 0.30 to 0.45 and slab thickness 0.10, shorten the wings (0.74 to 0.62), and widen the mound (0.36, 0.30, 0.14) with a 2-iteration Smooth after the union so the mound stops reading as an added bump.
5. **NICE** Tail-bolt slab shows interior bevel ink (3_side crop). Drop `bevel` and set `set_smooth(angle=60)` on it.

## Cross-kin patterns (fix once in lib/common.py)
- **Colour zones are the main "unfinished" tell.** `paint_zones` + `smoothstep_blend` on 0.016 voxel meshes gives fuzzy, blotchy boundaries everywhere (Dropple face/bands, Mossling mottle, Pebblet face, Breezel belly, Surgeray face). Add a `paint_zones_faces` helper that writes a `FACE_CORNER` attribute per polygon from the centroid, and a `zone_edge(width)` option that blends only within a fixed geodesic band (1-2 edges), so edges are crisp cel boundaries with a hint of softness, not a 4-iteration blur. Faceted kin (Pebblet, Vulcrag) never blend.
- **Buried appendages.** Fins, wings and feet are placed inside the body radius and surface as inked decals (Dropple fins, Breezel wings, Mossling feet). Add an assert/print in `union` that each part's bounding box leaves the body by >= 0.08 along its axis, and a `root_fillet(part, r)` that unions a small ball at the junction for a clean crease.
- **Stray interior ink.** Metaball junctions under `crease_deg=100` draw short floating arcs (Mossling, Vulcrag). Default `B.mesh(smooth_iters=2)` for metaball bodies and expose `crease_deg` per kin (110-120 for lumpy bodies).
- **Thin tubes at `res=1`** (Vulcrag veins, Surgeray bolts) render as dashed, wobbling ink. Minimum `res=3`, radius >= 0.03, and prefer a `slab` for any graphic mark (bolt, crack) that must read as a shape at 300 px.
- **Noise predicates (`sin*sin`) for texture** read as dirt on every kin that uses them. Replace with geometry-driven zones (per clump, per facet).
- **Silhouette tangency check.** Shines, glints and far eyes land on the outline from the battle camera (Dropple, Pebblet). Reuse sheetkit's facing test in the turnaround and battle renders, and warn when a decal's normal is within 20 deg of perpendicular to the camera.
