# Procedural & hand-painted-look texturing (free tools only)

Research angle: **procedural-texturing**. Date: 2026-10-14. Question: how do we get rich,
sharp, professional surface detail — HD-2D pixel-art surfaces in particular — without paid
tools, in a way Claude can drive by script?

"Verified here" = run in this container with Blender 5.2.2 LTS as a Python module
(`/tmp/bpyenv`, Cycles CPU, 4 cores). All test scripts are reproduced (abridged) below; full
versions were in `/tmp/gr/bake/` (scratch, not committed).

---

## 0. TL;DR

1. **Orbkin's runtime tile painter is already good** (`src/render/hd2d/textures.ts`: hue-shifted
   6–7-shade ramps, Bayer dither only at band edges, ≥ 2-texel clusters, palette-preserving
   mode mips, fixed texel density). The judges' 6/10 is not about texel craft. The gap to the
   reference is that its surfaces are **unique and follow the form** — light caps on top of
   every boulder, dark contact crevices *between* boulders, cracks that run along the shape —
   while ours are small tiles repeated over boxes, shaded per box by a bevel.
2. **Bake-by-script works here and is fast.** Verified: a hi-poly boulder wall (99,680 faces)
   → decimated low-poly (5,102 faces) with area-proportional UVs → **mask atlas baked with Cycles
   CPU in 12.8 s (1024²)**; a single boulder's colour/normal/AO bakes take 0.1–1.5 s at 256².
   Gotchas are listed in §2.3.
3. **Bake masks, not colours; compose pixels by rule.** Naively downsampling a busy procedural
   albedo and quantising to a ramp gives "camouflage noise" (verified). Baking *separate masks*
   (value/light-facing, cavity = AO + cracks, convexity) into RGB, then choosing ramp indices
   by rule at the target texel density (cavity → 2 shades darker, convex lip → 1 lighter,
   orphan clean-up) produced clustered, hand-shaded-looking pixels (verified, §3).
4. **Scene-level AO is the single biggest "painted diorama" cue.** With AO distance 0.7 and the
   neighbours present during the bake, every boulder got a dark foot and crevices against its
   neighbours and a lit cap — the exact read of the reference's tiered rock walls. Flat colour
   vs baked: night and day (§3.2).
5. **The technique stack** that pros use without Substance: masks (AO, curvature/pointiness,
   top-facing, height gradient, cavity, material ID) → gradient/palette map → edge highlight +
   cavity darkening → small hand-paint pass. All reproducible in Blender nodes + Python
   (NumPy/Pillow), with Material Maker / Krita / ArmorPaint as optional owner-side tools.
6. For **terrain and modular kit pieces**, keep tiling textures but map them **world-space,
   texel-snapped triplanar** (no UV seams, constant density) and break repetition with
   **decals** and **vertex-colour/mask variation**; for **hero diorama pieces** (the arena's
   back wall, lodge, stairs), bake **unique atlases**.
7. **Real CC0 PBR height + AO maps are the best pixel-texture input found** (verified after the
   allowlist update): Poly Haven `rock_wall_08` height/AO → rule composer → a clean 64² pixel stone
   wall in ~1 s; the same texture's colour map turned to mush (§3.4).

---

## 1. Where Orbkin stands (code read 2026-10-14)

- `textures.ts` paints 16–64-texel tiles from `RAMPS` (e.g. `boulder: ['#281a16', …, '#cbab8e']`),
  posterised fBm on 2×2 clusters, `chunks()` facets, pits/flecks as 2–4-texel clusters,
  `crack()`/`crackRel()`, `modeHalve()` palette-preserving mips, `NearestFilter`.
- Geometry: `VoxelBatch` merged boxes with per-vertex AO and a texel-quantised bevel (dark seam,
  lit lip), `rockColumns()` from a heightmap — so form-shading is **per box**, not per rock.
- Result (screenshots `docs/screenshots/hd2d/*`): crisp, coherent palette, but walls read as
  stacked crates; the tile repeats; there is no big-shape light/shadow design across a wall.

So the upgrade is mostly **(a) organic geometry and (b) form-aware unique textures**, with the
existing ramps/dither rules reused as the final quantiser.

---

## 2. Blender bake-by-script (verified recipe)

### 2.1 Pipeline

```
hi-poly (displace/sculpt/boolean, ~100k faces)       -- detail + Pointiness lives here
   │ copy + Decimate (ratio 0.03–0.06) or hand low-poly
low-poly game mesh (300–5k faces) + UVs (area-proportional, fixed texel density)
   │ Cycles bake, "selected to active", EMIT pass from a MASK shader on the hi-poly
mask atlas (R=value, G=cavity, B=convex, A=material id)  @ 4× target density
   │ NumPy composer: box-downsample 4× → rule-based ramp indices → cleanup → dilate gutters
pixel atlas @ target density (e.g. 16 texels / world unit) + low-poly GLB  → three.js
```

### 2.2 Core code (Blender 5.2, abridged from the verified scripts)

```python
import bpy, math
sc = bpy.context.scene
sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'; sc.cycles.samples = 16   # bake samples
sc.render.bake.margin = 2; sc.render.bake.margin_type = 'EXTEND'
sc.world = bpy.data.worlds.new('w'); sc.world.light_settings.distance = 0.8      # AO bake distance

# hi-poly: icosphere(subdiv 5) + 3 DISPLACE modifiers (CLOUDS 0.9/+0.3, VORONOI 0.4/-0.1,
# CLOUDS 0.15/+0.04, texture_coords='GLOBAL' so neighbours differ), applied, joined.
# low-poly: copy + DECIMATE ratio 0.05, then
bpy.ops.uv.smart_project(angle_limit=math.radians(55), island_margin=0.004,
                         area_weight=0.0, scale_to_bounds=False)   # keeps relative texel density

# MASK shader on the hi-poly (Emission colour = masks)
nt = mat.node_tree; N, L = nt.nodes, nt.links
geo  = N.new('ShaderNodeNewGeometry')                     # Position, Normal, Pointiness
noise = N.new('ShaderNodeTexNoise'); noise.inputs['Scale'].default_value = 0.9
sepN = N.new('ShaderNodeSeparateXYZ')                     # Normal.z = "faces the sky"
value = 0.6*noise + Normal.z                              # (Math MULTIPLY_ADD)
vor  = N.new('ShaderNodeTexVoronoi'); vor.feature = 'DISTANCE_TO_EDGE'   # cracks
crack = MapRange(vor.Distance, 0.03 → 0.0)                # 1 on crack lines
ao   = N.new('ShaderNodeAmbientOcclusion'); ao.inputs['Distance'].default_value = 0.7
cavity = max(crack, 1.4*(1-ao.AO))
convex = MapRange(geo.Pointiness, 0.505 → 0.54)           # Cycles-only, needs dense mesh
Emission.Color = CombineXYZ(value, cavity, convex)

# bake target on the low-poly: the ACTIVE Image Texture node receives the bake
img = bpy.data.images.new('masks', 1024, 1024); img.colorspace_settings.name = 'Non-Color'
tn = lo_mat.node_tree.nodes.new('ShaderNodeTexImage'); tn.image = img
lo_mat.node_tree.nodes.active = tn
hi.select_set(True); lo.select_set(True); bpy.context.view_layer.objects.active = lo
bpy.ops.object.bake(type='EMIT', use_selected_to_active=True,
                    cage_extrusion=0.1, max_ray_distance=0.4)
img.filepath_raw = '/out/wall_masks.png'; img.file_format = 'PNG'; img.save()
bpy.ops.export_scene.gltf(filepath='/out/wall_lo.glb', use_selection=True, export_materials='NONE')
```

Other bake types verified: `type='NORMAL', normal_space='TANGENT'` (hi→lo, 0.09 s @256²),
`type='AO'` (0.24 s @256²). `EMIT` is the universal one: any node math becomes a texture.

### 2.3 Gotchas (all hit or checked here)

| Problem | Fix |
|---|---|
| Bake writes nowhere / "No valid selected objects" | The target material must have an **Image Texture node set as `nodes.active`**; the low-poly must be **selected and active**, the hi-poly selected. |
| AO bake on the low-poly came out blotchy black | The hi-poly shell was still renderable and occluded it. Set `hi.hide_render = True` (or move it) for AO bakes of the low-poly itself. |
| Masks look washed/curved | Bake masks to **Non-Color** images; only final albedo is sRGB. |
| `Pointiness` is flat/noisy | It is per-vertex curvature: needs a dense mesh (≥ ~50k verts per object) and **Cycles only**. On low-poly use the Bevel-node trick (curvature ≈ `1 - dot(Bevel.Normal, Geometry.Normal)`) or Geometry Nodes edge angle → attribute. |
| EEVEE unavailable | pip `bpy` has no libEGL here → bake/render with Cycles CPU only. Fine for bakes. |
| Seams show black lines | `bake.margin` ≥ 2 texels at final res (`margin_type='EXTEND'`) + dilate gutters again after downsampling (done in `compose.py`). |
| glTF export logs "Draco / MeshOptimizer not available" | The pip build lacks those libs; export plain GLB, then compress with `npx @gltf-transform/cli optimize --compress meshopt`. |
| Renders look soft at low res | `scene.cycles.filter_width = 0.01` for pixel-crisp Cycles frames (default 1.5 px blurs). |
| Texel density drifts | `smart_project(scale_to_bounds=False, area_weight=0)` keeps island scale ∝ surface area; check with a checker texture; for strict pixel alignment use grid unwraps (see §5). |

Timings (4 vCPU): boulder bakes @256²: EMIT 1.4 s, NORMAL 0.09 s, AO 0.24 s; @64²: 0.12/0.04/0.02 s.
Wall chunk (99,680 → 5,102 faces, 247 m² surface) EMIT @1024², 16 spp: 12.8 s; whole script 16 s.
Atlas math: 256² final texels / 247 units² × ~0.6 packing ≈ 12.6 texels per unit (Orbkin uses
`TEXEL = 1/16` → 16 per unit; a 320² atlas would match).

---

## 3. From masks to pixel art (verified)

### 3.1 Naive vs rule-based

**Naive** (`pixelize.py`): bake a full procedural colour (noise × AO × cracks + edges → colour ramp),
box-downsample 4× in linear light, map OKLab lightness onto the 7-shade ramp with a 4×4 Bayer
threshold. Result: high-frequency "camouflage" — every texel a different shade, cracks lost.
This is the classic failure of "pixelate a render" and why pixel artists hand-clean.

**Rule-based** (`compose.py`) — what worked:

```python
# m = baked masks (H×W×3, 0..1) at 4× density; cov = baked texels (non-black)
avg = box_downsample(m, 4)                       # mask-aware area average
val, cav, edge = avg[...,0], avg[...,1], avg[...,2]
v = auto_levels(val, p=(3, 97)) * LEVELS         # LEVELS = 5 mid shades
idx = clip(floor(v) + 1, 1, LEVELS)              # reserve ramp[0] for cavities, ramp[6] for lips
idx = where(cav > 0.45, maximum(idx - 2, 0), idx)                    # cavities: 2 shades darker
idx = where((edge > 0.35) & (cav <= 0.45), minimum(idx + 1, 6), idx) # convex lip: +1
for _ in range(2):                               # orphan cleanup: a texel that differs from
    for k in range(7):                           # ≥3 of its 4 neighbours which agree on k → k
        agree = sum(roll(idx, s, a) == k for s, a in ((1,0),(-1,0),(1,1),(-1,1)))
        idx = where((agree >= 3) & (idx != k) & cov, k, idx)
out = RAMP[idx]; dilate_into_gutters(out, cov, 4)
```

Optional: ordered dither only near band centres (`(frac-0.5)*3+0.5 > bayer`) — on stone the
non-dithered version read cleaner, matching the existing rule "no Bayer checkers on stone".

### 3.2 Results

- **Single boulder** (306-face low poly, 64² pixel texture, rendered 112 px tall, nearest):
  flat colour = untextured low-poly; raw 256² bake = rich but blurry/photographic; naive
  quantise = camo noise; **rule-based = lit top, dark base and pits in 2–4-texel clusters, all 7
  ramp shades used** — reads as a hand-shaded sprite boulder.
- **Wall chunk** (3 terraces of displaced boulders + floor, 320×180 render ×3 nearest): flat
  version looks like dough; **baked version has dark contact crevices under and between every
  boulder and bright caps**, i.e. the tiered-rock-wall read of the reference. Caveat seen: the
  floor used the rock ramp and the same rules, so it went pale — **bake a material-ID mask (A
  channel or a second image) and pick ramp + rules per material** (floor: dirt ramp, no
  top-light term, AO only from walls).


### 3.4 Real CC0 PBR maps as mask sources (verified after the allowlist update)

Downloaded Poly Haven `rock_wall_08` (1k diffuse JPG, AO JPG, **16-bit** displacement PNG) and
ambientCG `Rock030` (1K-JPG zip). Derived masks with NumPy (`pbr_to_masks.py`):

```python
H = norm(disp)            # percentile 1–99 normalisation — handles 16-bit PNGs (PIL .convert('L') clips them!)
A = norm(ao)
R = 0.15 + 0.85*H                         # value: raised stones are lit
G = clip((0.75 - A) * 2.5, 0, 1)          # cavity: mortar/cracks
B = clip((H - gaussian_blur(H, 12) - 0.04) * 8, 0, 1)   # local convexity: stone lips
```

then ran the same `compose.py` (1024 → 64², factor 16; and → 128², factor 8). Results:

- **Colour map, naive downsample+ramp:** noise/mush again (both textures).
- **Poly Haven rock wall, height+AO masks → rule composer: a clean, readable pixel-art stone
  wall** — distinct stones with lit tops, 1-texel dark mortar, all 7 ramp shades, at both 64²
  and 128². This is the best result of all experiments and costs ~1 s.
- ambientCG Rock030 (a broad slab, little mid-scale relief): large blobby shapes — usable for
  big cliff faces, too coarse for walls. Choose sources by *relief at the target texel scale*.

Lesson: **photo albedo is the wrong input for pixel art; height/AO/normal maps are excellent
inputs** — they carry form, which the rule composer turns into deliberate light/shadow shapes.
CC0 PBR libraries therefore feed the pixel pipeline directly (tileable too, since the sources tile;
check seams after the 3×3 cleanup, which uses wrap-around `np.roll` and so stays tileable).

### 3.3 Rules that make generated pixels look hand-made (from pixel-art practice)

- 4–7 shades per material ramp, **hue-shifted** (darks toward red/purple/blue, lights toward
  yellow; ≈ 10–20° hue step per swatch, saturation peaking in the mids). Orbkin's `RAMPS`
  already follow this. Sources: Slynyrd Pixelblog 1, gamedev.net "Color Palettes".
- **Light design, not noise**: the largest value change on a surface should come from its form
  facing the key light (top/left lit, bottom/right shaded). Noise is a ±1-shade modulation.
- **Clusters ≥ 2 texels**, no orphans, no horizontal pairs reading as grain; cracks are 1-texel
  lines with a 1-texel lit lip under/above them.
- **Dark outline only where form turns away** (contact shadows/cavities), not around every UV island.
- **One texel density everywhere** (Orbkin: 16 texels/unit). Mixed densities break the diorama.
- Dither only at band transitions and only on soft materials (dirt, sand, sky, light beams).

---

## 4. The hand-painted / stylised layer stack (no Substance needed)

Practitioner breakdowns (Sketchfab "Viking Shield", 80.lv WoW-diorama, Polycount threads)
converge on the same stack; every layer has a free, scriptable equivalent:

| Layer | Purpose | Free/scriptable source |
|---|---|---|
| Grey value base (big shapes) | Readability | Blender `Normal.z`, height gradient (`Position.z` mapped over the object), low-freq noise |
| Gradient map | Turn values into a curated ramp | Blender ColorRamp (Constant interpolation for posterised bands) or the NumPy ramp map |
| Cavity / AO darkening | Depth, contact | Cycles AO bake (scene-level), `1-AO` in mask G |
| Edge highlight | "Painted lip", chipped edges | Pointiness (hi-poly), Bevel-normal difference, GN edge angle; ArmorPaint/Material Maker curvature |
| Top-light / dust / moss | Light direction & storytelling | `Normal.z` mask × noise; moss = green ramp where `Normal.z > 0.7` and AO high |
| Cracks / strata | Material identity | Voronoi `DISTANCE_TO_EDGE`, wave texture (strata), hand-drawn decals |
| Hand-paint pass | Taste, focal points | Krita/Aseprite on the owner machine, or Blender texture paint (GUI) |
| Emissive/hue drift | Warm/cool variation | per-object hue offsets, vertex colours |

One UE4 portfolio describes "90% procedural, 10% hand-painted" as the scalable split; that fits an
agent-driven pipeline: Claude generates the 90%, the owner optionally paints the 10% on hero props.

---

## 5. UVs & texel density for pixel textures

- **Fixed density**: decide texels/unit once (Orbkin 16) and derive atlas size from surface
  area: `atlas_px ≈ sqrt(area × density² / packing)` with packing ≈ 0.6 for smart project.
- **Area-proportional unwraps**: `smart_project(scale_to_bounds=False, area_weight=0)`; then
  `bpy.ops.uv.pack_islands(rotate=False, margin=…)` if needed; verify with a checker.
- **Pixel-snapped islands**: island bounds aligned to texel edges avoid half-texel smearing at
  seams. The open-source **Pixel Unwrapper** add-on (`noio/Pixel-Unwrapper`, "early alpha, can
  crash") does Unwrap Grid (maps quad grids to whole texels at a set density), Unwrap to Single
  Pixel (flat-colour faces) and texture-preserving UV edits. Its operators are Python — loadable
  in pip `bpy` (untested) or reimplemented: for box-like kit pieces a cube projection snapped to
  texel multiples is enough.
- **UV seams are visible in pixel textures** (pixels change size/orientation across islands —
  seen in the boulder test). Mitigations: fewer, larger islands (angle_limit 55–66°), seams in
  cavities (where the dark rule hides them), or world-space triplanar for terrain.

---

## 6. Runtime alternatives in three.js (for tiling surfaces)

### 6.1 World-space, texel-snapped triplanar (no UVs, constant density)

three r180 ships TSL `triplanarTexture(texX, texY?, texZ?, scale, position=positionLocal,
normal=normalLocal)` (`src/nodes/utils/TriplanarTextures.js`, after keijiro/StandardTriplanar) —
but TSL needs `WebGPURenderer`; Orbkin uses `WebGLRenderer` + `onBeforeCompile` patches
(`arena.ts`, `foliage.ts`), so the GLSL equivalent is the practical route. Sketch (not compiled
here):

```glsl
// vertex: pass world position & world normal
vWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
vWorldN   = normalize(mat3(modelMatrix) * objectNormal);
// fragment: pick the dominant axis (hard switch keeps pixels crisp — no blending of texels)
vec3 n = abs(vWorldN);
vec2 uv = n.x > n.y && n.x > n.z ? vWorldPos.zy : (n.y > n.z ? vWorldPos.xz : vWorldPos.xy);
uv *= TEXELS_PER_UNIT / TILE_TEXELS;            // e.g. 16 / 32
uv = (floor(uv * TILE_TEXELS) + 0.5) / TILE_TEXELS;   // snap to texel centres
vec4 texel = texture2D(map, uv);
```

Hard axis selection (no blend) is preferable for pixel art; add a per-cell hash offset
(`floor(vWorldPos/4.0)`) to rotate/flip the tile and hide repetition.

### 6.2 Palette-locked post or material LUT

Keep generated textures as **indices** (R8) + per-material ramp LUT (N×1 texture): the shader
reads an index and looks up the ramp, so lighting can shift *indices* (cel-banding inside the
ramp) instead of multiplying colours → no off-palette mids. Index-texture + ramp is also a
4× memory win and enables per-arena recolouring (palette swaps at night, poison, etc.).

### 6.3 Decals

`three/addons/geometries/DecalGeometry.js` projects a box onto a mesh to make conforming decal
geometry; for an orthographic-ish diorama camera, simple alpha-tested quads laid on surfaces
also work. Use pixel decals (moss tufts, cracks, stains, scorch, chalk ring, puddles) with
`alphaTest` and `polygonOffset`, merged into the arena batch (draw calls < 100).

### 6.4 Runtime canvas painting vs offline bake

| | Runtime (current `textures.ts`) | Offline bake (Blender/NumPy) |
|---|---|---|
| Cost at load | ms per tile, scales with count | zero (PNG decode) |
| Knows the 3D form | no (only bevel/vertex AO) | **yes** (AO, curvature, neighbours) |
| Unique surfaces | impractical | natural |
| Determinism/seeds | yes | yes (commit outputs + script) |
| Download size | ~0 | small: 256² PNG ≈ 10–40 KB indexed |

Both can coexist: tiles for floors/kits, baked atlases for hero diorama pieces.

---

## 7. Tileable textures & trim sheets

- **Tileable noise**: make noise periodic by construction — sum lattice/value noise whose period
  divides the tile, or sample 4D noise on a torus (`x→(cos,sin)`, `y→(cos,sin)`). Orbkin's `fbm`
  already uses integer cell counts. In Blender, bake a tileable texture by baking a **plane with
  a texture whose coordinates wrap** (e.g. Noise with `4D` W + torus mapping) or bake a
  sculpted 1×1 tile surrounded by its own copies (offset copies on all 8 sides → seamless AO).
- **Trim sheets**: one texture with horizontal strips (plank edge, stone course, beam, rope,
  railing, rim) that tile in U; meshes map faces onto strips. Great for the lodge (planks,
  beams, shelves, rails) — consistent density, tiny memory, reusable across arenas; avoid
  distinctive features (big cracks) inside a strip because they reveal the tiling. Generate the
  sheet by baking a row of hi-poly strips (bevelled planks, chiselled stones) with the same
  mask→pixel composer.
- **Material Maker** (MIT): node graphs (`.ptex` JSON) for bricks, planks, scratches, edge
  detect, etc.; CLI `material_maker --export file.ptex -t "<target>" -o outdir --size N`
  (`parse_args.gd`). Needs Godot + GPU, so owner-side; its GLSL node snippets are MIT and can be
  ported into our GLSL/NumPy generators.
- **Wave Function Collapse / Wang tiles** (mxgmn/WaveFunctionCollapse, MIT): useful for
  non-repeating floor/wall tile *layouts* from a few hand-made tiles.

---

## 8. Pixel art from renders & images (adjacent research)

- **pixeloe** (Apache-2.0, PyPI): contrast-aware outline-expansion pixelisation of hi-res images;
  heavy deps (torch, kornia, opencv) — untested here.
- **Pixelat3D** (SBGames 2026): real-time shader with priority maps steering texture LOD by
  distance/angle + outline post-pass; 62-participant preference study favoured it. No code found.
- **RETRÔ** (SBGames 2024) NPR pixel-art from 3D; **Texel Splatting** (arXiv 2026, Dylan Ebert)
  tackles perspective instability of 3D pixel art. Useful background; Orbkin's integer-scale
  low-res pipeline already solves most stability issues for a fixed battle camera.
- t3ssel8r-style 3D pixel art: public material is mostly about animation (Cascadeur) and
  outlines from depth/normal edges; no verifiable texture pipeline published.

---

## 9. Implications for Orbkin

1. **Add an offline asset step**: `tools/art/` with bpy scripts (`bake_masks.py`), a NumPy
   composer (`compose.py`, ramps imported from a JSON export of `RAMPS` so runtime and offline
   share palettes), and a `npm run art` wrapper that writes `public/art/<arena>/*.png|glb` plus a
   provenance/seed manifest. Everything deterministic and committed.
2. **Rebuild hero diorama pieces as organic meshes with unique baked atlases**: the cave's
   terraced back wall, the rubble piles, the lodge stair and front ledge. Keep the low-poly
   ≤ 5k faces per piece, one material per piece, merged where possible (draw calls < 100).
3. **Bake scene-level AO with neighbours present** (walls + floor + props together) so contact
   shadows land where pieces meet; put AO into the *texture*, keep the runtime light for the
   window shafts/cookie (the two together give the reference's depth).
4. **Material-ID channel**: one bake → many ramps (rock, dirt, moss, wood, plaster) and per-
   material rules (dirt: no top-light, softer AO; moss: on top-facing + high-AO; wood: planks
   from a trim sheet).
5. **Keep the existing rules as the quantiser**: ramps, 2-texel clusters, no stone dithering,
   palette-preserving mips (`modeHalve`) — run on the composed indices.
6. **Tileable surfaces from CC0 height/AO maps**: fetch Poly Haven / ambientCG height + AO (when the allowlist allows), run `pbr_to_masks` + the composer at 16 texels/unit, and ship the resulting pixel tiles — much richer than hand-coded fBm, still on-palette.
7. **Terrain/floors**: keep runtime tiles but switch to world-space texel-snapped triplanar +
   per-cell flips + pixel decals (cracks, pebbles, chalk ring, puddles) to kill repetition.
8. **Index textures + ramp LUT** would let one baked arena be recoloured per route/time of day
   and keep every lit pixel on-palette.
9. **Evaluation loop**: render the same camera before/after at 640×360, nearest ×3, and compare
   side by side (like `docs/screenshots/hd2d/hd2d-iterations-*`). Cycles renders of baked pieces
   are a cheap preview before wiring into three.js.

## 10. Open questions

- How close does Cycles-baked AO + rule composition get to hand-painted reference quality on a
  full arena (not a test chunk)? Needs an A/B against the current cave arena in the real
  pipeline (three.js, grade, bloom).
- Best curvature source for low-poly kit pieces: Bevel-node difference vs Geometry Nodes edge
  angle vs Pointiness on a temporary subdivided copy?
- Does Pixel Unwrapper's code run under pip `bpy` (no UI) for automated pixel-snapped unwraps?
- Index-texture + ramp-LUT shading: how does it interact with the current ACES + CDL grade (the
  grade happens after tonemapping, so on-palette albedo is not on-palette on screen anyway)?
- Download budget: how many unique 256² atlases per arena before load time on phones suffers?

## Sources

- Blender manual, Render Baking (Cycles): https://docs.blender.org/manual/en/latest/render/cycles/baking.html
- Batch AO bake script: https://github.com/kdrnic/AutoBakeAO ; script pitfalls: https://blenderartists.org/t/fix-python-baking-script/1482002
- Pixel Unwrapper: https://github.com/noio/Pixel-Unwrapper ; texel density: https://www.blendernation.com/2023/04/21/a-texel-density-walkthrough-for-blender-artists/ ; https://blenderartists.org/t/texturing-with-pixel-art-on/1597717
- HD-2D background: https://www.unrealengine.com/spotlights/octopath-traveler-s-hd-2d-art-style-and-story-make-for-a-jrpg-dream-come-true , https://en.wikipedia.org/wiki/HD-2D , community plan https://github.com/Phaazoid/Godoiosis/issues/176
- Stylised texturing breakdowns: https://sketchfab.com/blogs/community/viking-shield-creating-stylized-textures-using-baked-maps , https://80.lv/articles/002mrs-crafting-a-wow-diorama-textures-painting-lighting , https://chrisstone3d.artstation.com/projects/0XLL98 , https://polycount.com/discussion/comment/1102207 , https://magazine.artstation.com/2020/08/diorama-blender/
- Trim sheets: https://80.lv/articles/arabian-afternoon-working-with-trim-sheets-efficiently , https://80.lv/articles/breakdown-building-lived-in-stylized-viking-environment-in-3d
- Pixel-art colour ramps / hue shifting: https://www.slynyrd.com/blog/2018/1/10/pixelblog-1-color-palettes , https://www.gamedev.net/articles/visual-arts/color-palettes-r4964/
- three.js triplanar (TSL): three@0.180.0 `src/nodes/utils/TriplanarTextures.js`; https://discourse.threejs.org/t/how-can-i-create-a-triplanar-material-from-an-existing-meshphysicalmaterial-using-triplanartexture/60654 ; tsl-textures (MIT): https://github.com/boytchev/tsl-textures
- Material Maker CLI: https://github.com/RodZill4/material-maker (`parse_args.gd`)
- Pixel-art rendering research: https://sol.sbc.org.br/index.php/sbgames/article/view/45414 (Pixelat3D), https://sol.sbc.org.br/index.php/sbgames/article/view/32320 (RETRÔ), https://upcommons.upc.edu/handle/2117/416925 ; pixeloe: https://github.com/KohakuBlueleaf/PixelOE
- t3ssel8r interview (animation): https://cascadeur.com/forum/news/1989-making-an-animation-for-a-3d-pixel-art-game-interview-with-t3ssel8r
- CC0 sources used: Poly Haven `rock_wall_08` (https://polyhaven.com/a/rock_wall_08, CC0, https://polyhaven.com/license), ambientCG `Rock030` (https://ambientcg.com/view?id=Rock030, CC0, https://docs.ambientcg.com/license/)
- Local experiments (this container, 2026-10-14): pbr_to_masks.py, bake_rock.py, bake_wall.py, pixelize.py, compose.py, render_variants.py, render_wall.py
