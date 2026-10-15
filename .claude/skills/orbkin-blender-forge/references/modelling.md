# Modelling in headless Blender 5.2.2 (forms, retopo, detail, sharp parts, colour zones)

Contents: 1 form · 2 retopo · 3 detail · 4 sharp parts · 5 colour zones · 6 timings · 7 the chunky-pixel
read. Every number was measured in the cloud container (4 vCPU, CPU Cycles) with the skill's `kit.py`
and `gn.py`; expect ±20 % under load (log `os.getloadavg()` with every timing, `kit`/templates do).

## 1 Form (read before S3)

- **Primary masses come from blended volumes, never from intersecting primitives.** A union of
  spheres and cones shows a ring seam at every joint and reads as a toy; the SDF union reads as one
  sculpted skin. Two paths, both watertight by construction:
  - `gn.sdf_fuse(obj, voxel, fillet, offset, cut_objects)`: joined overlapping parts →
    `MeshToSDFGrid` → `SDFGridBoolean DIFFERENCE` per cutter → `SDFGridOffset` → `SDFGridFillet` →
    `GridToMesh(Threshold 0.0)`. Voxel ≈ 1/150 of the piece size (0.02 for a 3-unit piece gives
    ~100 k tris, 1–2 s). Fillet radius ≈ iterations × voxel. `cut_objects` makes arch openings, bites
    and sockets (the cutter is subtracted *before* the fillet, so the opening's rim is rounded too).
  - Metaballs (`build_template.py`): BALL/ELLIPSOID/CAPSULE elements, chains of shrinking balls for
    ears, legs and tails; radii ×1.25 and stiffness 2 or the parts do not fuse (one creature came out
    as 8 shells at ×1.0). Convert, then `kit.voxel_remesh(obj, 0.012)`.
- **Count shells after fusing** (`kit.components(obj) == 1`). QuadriFlow and the voxel op go wrong on
  multiple shells (13 GB OOM once); the Remesh *modifier* silently keeps one fragment.
- **The Skin modifier is not a blockout tool** for voxel/retopo pipelines (non-manifold branch
  joints, ~25 % shrink). Sculpt brush strokes fail `poll()` headless (and segfault with a forced
  context): "sculpting" is SDF add/subtract, GN displacement, numpy deformation, the Displace modifier.
- Blockout rules for arena pieces: size in world units (1 unit ≈ a kin; `CELL` 0.9 wide, `LEVEL`
  0.7 high per course), base on z = 0, parts overlap by ≥ 2 voxels, cutters extend past both faces.
  Review with `kit.contact_sheet([high] + cutters, ...)` before fusing (Workbench, ~1.5 s): silhouette
  first, from the game camera (`views` include `game` = az 20 / el 30).

## 2 Retopo / low poly (S3)

| Method | For | Result |
|---|---|---|
| `kit.quadriflow(obj, target_faces)` | creatures, anything that deforms | even quads (2–3 k), 1.5–2 s. Prescales ×100 so voxel slivers pass the 1e-4 per-component manifold check, raises on CANCELLED, runs under `RLIMIT_AS` 8 GB, asserts the bbox within 2 % |
| low = fused form + plates (`gn.displace_rock(low, crack=0, strata=0, plate, lump)`) → `kit.voxel_remesh(low, 0.08)` → `kit.chisel(low, 15)` → `kit.decimate(obj, tris)` | environment pieces (the template default) | each plate becomes a flat facet = a UV island = a readable block; 3-5 k tris, ~1,100 islands on a 3-unit piece; bbox asserted |
| `kit.voxel_remesh(obj, 0.06)` → `kit.decimate(obj, tris)` | smooth static pieces | smooth low; the atlas then carries all detail (reads as a blob at play size: pilot 1) |
| `kit.chisel(obj, angle)` | rubble, cut stone | planar dissolve + triangulate + flat shading = the faceted rubble look |
| MeshLab quadric collapse (pymeshlab, GPL) | static props | best shape preservation; not in the pinned set (owner approval to add) |

- Budgets: creature stage 1 ≤ 2,500 tris, 2 ≤ 3,500, 3 ≤ 4,500 incl. eyes; environment hero piece
  ≤ 5,000; prop ≤ 1,500. At 640×360 a creature covers ~100 px: spend triangles on the silhouette.
- QuadriFlow at 900 target faces ≈ 1,800 tris; 1,200 ≈ 2,400. `decimate()` is exact.
- Both raise when the output bounding box deviates > 2 % (one QuadriFlow run grew a spike to 2.86
  from 1.76 units wide).

## 3 Surface detail (S3)

`gn.displace_rock(obj, crack, plate, strata, lump, seed)` moves vertices along the normal by
crack (Voronoi distance-to-edge valleys, scale 1.6) + plate (Voronoi F1 colour steps, scale 1.3) +
strata (Wave bands on Z, saw) + lump (Noise 0.9). Defaults: 0.05 / 0.03 / 0.02 / 0.04 units for a
2–3-unit piece; needs the dense voxel mesh (100 k+ tris; applies in 0.5–1 s). Vary `seed` per
piece or tiling shows. At 16 texels/unit a crack must be ≥ 2 texels = 0.125 units apart to survive
the bake; plate scale 1.3 gives 0.5–0.8-unit plates = 8–12 texels: the "chunky readable block".
Defaults in the template are already texel-sized: plate 0.125 (2 texels), crack 0.1, plate scale
1.8 (6-10-texel plates), fillet 2 (fillet 4 pillow-rounded every edge). `kit.courses(w, d, h)` lays
stacked jittered cut-stone blocks first so arena pieces keep the kit's course seams; `fit_matrix`
scales high and low back to `PIECE['size']` after fusing (growth 5-10 %). Hangers (stalactites)
go in `blockout()`'s third list: root ≥ 0.3 units (5 texels), length ≥ 0.8, two thick beat three
thin; they are unioned after the cut in the same fuse (`add_after_cut`), never a second SDF pass
(specks). Other tools: the Displace modifier; numpy `foreach_get/set` deformation (a Python
per-vertex loop over 137 k tris never finished; vectorised: 0.1 s).

## 4 Sharp secondary parts

Eyes (dark ellipsoid + emissive/white glint), claws, horns, crystal shards are separate bevelled
objects joined last: `kit.bevel_normals(obj, width 0.003–0.02, segments 2, angle 30°)` = Bevel
(angle limit, harden normals) + Weighted Normal. Flat shading for crystals. Parts must *enter* the
body (no floating parts); eyes sit at surface + 0.3 × eye size along the normal (0.08 sank under the
remesh). `kit.join()` applies transforms **including location** after joining, otherwise mesh
coordinates ≠ world coordinates and masks/eyes land offset (0.42 units once).

## 5 Colour zones (creatures)

`kit.zones_numpy(obj, base, [(mask(co, nr) -> bool, colour), ...])` writes a CORNER `BYTE_COLOR`
attribute `Col` with hard thresholds (belly = downward normals and low z, muzzle sphere, ear tips by
height, stripes = `sin(y*38) > 0.55` on upward normals). Paint before decimating or bake to a
texture. Material: `kit.pbr(name, '#ffffff', vertex_color='Col')` → exports `COLOR_0`. Use hard
thresholds (never smoothstep) for pixel-art crispness; 3 colour blocks + 1 accent is the design
rule (orbkin-sprite-creature owns the design; this skill only builds the body).

## 6 Timings (quiet 4-core cloud box; plan your budget)

| Step | Time |
|---|---|
| blockout (5 primitives) + Workbench sheet | 0.8 s |
| SDF fuse voxel 0.02 + displace (105 k tris) | 0.9 s |
| voxel 0.06 + decimate to 5,000 | 0.2 s |
| QuadriFlow 900–2,000 faces | 0.7–2 s |
| block UVs (5 k tris) + density check | 0.7 s each |
| mask bake 512² 16 spp (EMIT + form + AO) | 2.5 s (1 s at 256²) |
| compose 512 → 256 atlas + mips | 0.5 s |
| raw GLB export | 0.1–0.3 s |
| Workbench 5-view sheet 256–320 px | 1–3 s |
| Cycles beauty 512² 32 spp + OIDN | 5–6 s (16 spp ≈ 4 s; 1024² 128 spp = 76 s: never in a loop) |
| whole `piece_template.py` | 11 s |
| pack.mjs (meshopt high) | 1 s · shoot.mjs 3 modes ≈ 6 s incl. browser start |

## 7 The chunky-pixel read (what the composer needs from the geometry)

The reference's walls are "individually readable blocks with 3–4 value steps, crisp dark seams and
lit top faces". Pilot 1 (judged 4/10) proved what breaks it: per-texel rules over 1,600 tiny UV
islands, a low cut from the displaced high (pillowy blob + fragmented normals), sub-texel
displacement, no key-light term, judged at 64 px instead of the game's ~64 px per unit. What works
(ledge, `read_check` passes at ppu 64): (1) plates ≥ 2 texels deep and 6-10 texels wide carried by
the LOW as facets, (2) cracks as real valleys in the high (crack cavity mask, AO 0.25), (3) cells
keyed on world position in `compose.py` (5-8 texels, flat tone per cell from top + key facing, +1
lit top row, -2 dark bottom row), (4) contact AO 0.7 at most -1 shade, (5) one ramp. Island count
no longer decides the read; the cells cross island borders. Bakes below the texel scale are
invisible in-game (2048² convex-edge masks: 3 ties): bake at 2× the atlas, let `compose.py` reduce.
