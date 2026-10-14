# Blender → glTF → Three.js asset pipeline: research notes for Orbkin

Angle: how to get real, authored-quality 3D assets out of Blender (driven headless by Claude
through `bpy`) and into Orbkin's Three.js r180 + Vite game. The notes cover modelling for
real time, baking, glTF export, glTF-Transform optimisation, loading, LODs, atlases and
animation. Every pipeline claim below was either **run in this container** (marked
**[verified here]**) or traced to a primary source (repo code, the official manual source,
Khronos guidelines). Secondary blog claims are marked as such.

Workspace for everything below: `scratchpad/research/pipeline/` (written `pipeline/` from here on).
Scripts are in `pipeline/scripts/*.py` (bpy) and `pipeline/node/*.mjs`. Outputs are in `pipeline/out/`.

---

## 0. TL;DR

1. **The pipeline works end to end in this container, headless, at no cost** [verified here]:
   bpy builds a high poly, retopologises with QuadriFlow, unwraps, bakes albedo, normal and AO
   from high to low in Cycles, auto-rigs, then makes 2 actions and 1 shape key and exports a GLB.
   glTF-Transform plus KTX-Software then compress it (Meshopt + KTX2/WebP), Three.js r180 loads
   it in headless Chromium, and AnimationMixer plays it. Full creature build: about **68 s** at
   1024² bakes (17 s at 512²). Packing: **0.3–3 s**.
2. **Retopology matters more than any setting.** Decimate makes triangle soup: 198 UV islands
   and poor deformation. **QuadriFlow** (`bpy.ops.object.quadriflow_remesh`, works headless)
   gives clean quads and 77 islands. **xatlas** (pip, MIT) gives 73 islands in 0.3 s. Unwrap
   with smart_project, then run `seams_from_islands` and `unwrap(method='MINIMUM_STRETCH')`.
   That cuts area distortion 4× (0.147 → 0.033).
3. **Use Meshopt, not Draco, for creatures.** Draco compresses only static geometry. Meshopt also
   compresses morph targets and animation, and it decodes faster. On the test creature (geometry +
   2 clips + 1 morph): none 179 KB, Draco 85 KB, **Meshopt-high 57 KB** (37 KB gzipped). The decoder
   costs 6.5 KB gzipped, against about 75 KB for Draco. [verified here]
4. **Three r180 reads `EXT_meshopt_compression` but not `KHR_meshopt_compression`.** Support
   arrived in r183. Blender 5.2's exporter can write either, but in the pip `bpy` the meshopt and
   Draco bridge libraries are **missing**, so the exporter can't compress here. Export
   uncompressed and compress with glTF-Transform. [verified here]
5. **Choose texture formats by role. Don't use KTX2 everywhere.** KTX2 cuts VRAM 4–8×
   (3 × 512² maps: 4.2 MB as WebP/PNG, 0.87 MB as KTX2). The cost is a one-off **~260 KB gzipped**
   transcoder and larger files. **For pixel art, ETC1S is destructive**: a 6-colour tile became
   142 colours, with 81% of pixels shifted, and the file was *not* smaller than the PNG. Keep
   Orbkin's pixel textures as PNG with Nearest filtering. Use KTX2 only for large painted or baked
   maps: UASTC for normal/AO/ORM, ETC1S for colour. [verified here]
6. **Don't run `gltf-transform optimize` blind on characters.** Its defaults flatten, join and
   palette the scene, and simplify is on (source read). Run a custom script (`pack_creature.mjs`):
   dedup → prune → resample → weld → per-slot KTX2/WebP → sparse → reorder → meshopt.
7. **The Blender side has gotchas that silently ruin assets** (all hit here, §11):
   - Selected-to-active bakes cast rays in *world space*, so the high and low poly must overlap.
   - Heat weights produce 1.0000004 weights. Normalise and limit to 4 influences.
   - Backface culling off exports `doubleSided: true`.
   - AO only exports through a "glTF Material Output" group node.
   - Vertex colours only export when a material uses them.
   - Custom attributes need a `_` prefix and `export_attributes=True`.
   - A non-deform root bone vanishes with `export_def_bones=True`.
8. **Animation export: use NLA tracks.** One NLA track per clip. Tracks with the *same name* on
   the armature and on the shape-key datablock merge into one glTF clip. For example, "Hop" got 33
   TRS channels plus 1 `weights` channel. `targetNames` → `morphTargetDictionary`. Custom
   properties → `userData`. [verified here]
9. **Integration with Orbkin's HD-2D renderer is straightforward.** A raw `ShaderMaterial` that
   includes three's `skinning_*`/`morphtarget_*` chunks renders the skinned, morphing GLB with
   banded toon shading at 160×120, upscaled with nearest filtering. So the sprite bake in
   `src/render/hd2d/sprite.ts` can consume GLB creatures, with skeletal clips from Blender
   replacing hand-written vertex-shader rigs. [verified here, screenshot `out/browser/sprite.png`]
10. **Two real projects show the pattern.** Bruno Simon's folio-2025 (MIT, three r183) and pmndrs
    gltfjsx share these conventions:
    - Blender exports uncompressed and a Node script compresses (etc1s q255 + Draco for folio).
    - Material **names** pick runtime materials.
    - One tiny **palette texture** (128×4) colours most low-poly models.
    - Custom props become physics metadata.

---

## 1. Environment facts (verified in this container)

| Thing | Version / status | Notes |
|---|---|---|
| Blender (`bpy` pip) | 5.2.2 LTS, glTF add-on **5.2.40** | `scratchpad/bpyenv/bin/python` |
| Exporter Draco/Meshopt | **unavailable** | `libbf_intern_draco_bridge.so` / `libbf_intern_meshopt_bridge.so` missing in the pip wheel (ERROR printed at export). Compress later instead. |
| Cycles CPU bake | works | 1024² bakes: DIFFUSE colour 1.7 s, NORMAL 1.6 s, AO (48 spp) 23.6 s, COMBINED (32 spp) 35.7 s |
| QuadriFlow remesh | works headless | 56–72k tris → about 2.5k tris in ≈1.5 s |
| OIDN denoise of bakes | works via compositor (CPU fallback; EGL errors are harmless) | 2.4 s for 1024² |
| UV layout export | PNG mode needs GPU → use `mode='SVG'` | |
| glTF-Transform | **4.5.1** (npm) | `@gltf-transform/{cli,core,functions,extensions}` |
| KTX-Software | **4.4.2**, from the GitHub release tarball (github.com downloads work through the proxy) | glTF-Transform 4.5 shells out to `ktx` (needs ≥ 4.4.0, `KTX_SOFTWARE_VERSION_MIN` in cli.mjs) |
| meshoptimizer | 1.3.0 (npm, WASM) | encoder, decoder, simplifier |
| xatlas | 0.0.11 (PyPI wheel for cp313, MIT) | installed into the bpy venv |
| three | r180 in game; latest npm **0.186.1** | r180 GLTFLoader extensions: EXT_meshopt_compression, EXT_mesh_gpu_instancing, EXT_texture_webp/avif, KHR_texture_basisu, KHR_draco, KHR_mesh_quantization, KHR_texture_transform, KHR_lights_punctual, KHR_materials_* (unlit, emissive_strength, clearcoat, sheen, transmission, volume, ior, specular, iridescence, anisotropy, dispersion), EXT_materials_bump. **KHR_meshopt_compression: r183+.** |
| Headless browser | Playwright Chromium + SwiftShader | KTX2 transcodes to BPTC/BC7 (ETC1S) and ASTC 4×4 (UASTC) there |
| gltf-validator | 2.0.0-dev.3.10 (via `gltf-transform validate`) | does **not** understand meshopt/basisu → validate the *raw* export |

---

## 2. The pipeline at a glance

```
Blender (bpy, headless)                                      Node (free CLIs)                     Three.js r180
───────────────────────────────────────────────              ──────────────────────────           ─────────────────────────
blockout (metaballs/SDF/GN/primitives)                       gltf-transform validate (raw)        GLTFLoader
  → voxel remesh + displacement detail = HIGH                dedup, prune, resample, weld          + MeshoptDecoder
  → QuadriFlow / decimate = LOW (budget)                     per-slot textures:                    + KTX2Loader(transcoder in /public/basis)
  → UV (smart → seams → SLIM, or xatlas), pack w/ margin       normal/AO/ORM → KTX2 UASTC (+zstd)  SkeletonUtils.clone per instance
  → bake HIGH→LOW: albedo, normal, AO, curvature, light        colour → KTX2 ETC1S | WebP | PNG     AnimationMixer per instance
  → (denoise bakes, OIDN)                                      pixel art → keep PNG                swap materials by name (toon/sprite)
  → glTF-friendly material (Principled + glTF Output)        LODs: simplify (meshoptimizer)        THREE.LOD / InstancedMesh / BatchedMesh
  → rig (auto weights → clean/limit 4/normalise)             instancing: EXT_mesh_gpu_instancing   userData ← extras, custom attrs
  → shape keys, actions → NLA tracks (named clips)           palette+join for flat-colour props
  → export GLB uncompressed                                  meshopt (high) LAST                   Playwright screenshot + report
```

---

## 3. Modelling for real time

### 3.1 Budgets
- **Orbkin's own rules** (docs/CREATURES.md, CLAUDE.md): at most 2,500 tris per creature (stage 1:
  at most 1,800), one mesh per creature, under 100 draw calls per frame. These are already in the
  normal range for mobile stylised heroes. Secondary guides cluster at **1.5k–8k tris** for mobile
  characters. Mid-range phones handle **100–300k visible tris/frame** and **under 100–150 draw calls**.
  Material count is a hidden CPU cost: 12k tris with 9 materials can cost more than 20k tris with 2
  ([messypoly](https://www.messypoly.com/learn/polygon-budgets-mobile-games),
  [low-poly.com 2026](https://low-poly.com/blog/polygon-budgets-by-platform-2026),
  [creatuneagency](https://www.creatuneagency.com/en/blog/low-poly-3d-models-for-mobile-games/)).
  Confidence: medium (blog consensus, not measurement).
- **Real reference** [verified here]: folio-2025's whole vehicle is 18 meshes, about 3.7k tris,
  5 materials and **one 128×4 palette texture** (`gltf-transform inspect static/vehicle/default.glb`).
- **At Orbkin's internal resolution (360 px tall), triangles are not the bottleneck.** A creature
  covers about 100 px on screen. The LOD1 test in §8.6 halves the creature to 1,344 tris with no
  visible change. Spend the budget on **silhouette** (the outer contour reads at 100 px), not on
  interior tessellation.

### 3.2 Topology: high → low

| Method (same 72k-tri source) | Result | Verdict |
|---|---|---|
| `DECIMATE` collapse to about 2.5k | triangle soup, 198 UV islands with smart_project 60°, poor joint deformation | avoid for characters; fine for static rocks (faceted look) |
| **QuadriFlow** `quadriflow_remesh(target_faces=1150, use_mesh_symmetry=True)` | even quads, 2,462–2,690 tris, 77 islands | **default for creatures** |
| Voxel remesh (`REMESH`, VOXEL, 0.012) | fuses blockout parts into one manifold surface | use on the HIGH poly before detail displacement |

Rules (Khronos [Real-time Asset Creation Guidelines](https://github.com/KhronosGroup/3DC-Asset-Creation/blob/main/asset-creation-guidelines/RealtimeAssetCreationGuidelines.md)
plus practice):
- glTF stores triangles only; vertices are **split** wherever UVs, normals or materials differ.
  Flat shading costs about 3 vertices per triangle: the 900-tri flat rock exported **2,698 verts**.
- 1 unit = 1 m, right-handed, Y-up in glTF. **Blender −Y forward becomes glTF +Z forward**, which is
  the camera side in a default three.js setup. Origin at bottom centre (Orbkin auto-grounds to y = 0).
- Apply transforms on joined objects, otherwise mesh coordinates ≠ world coordinates. See the
  sister notes `research/blender-llm.md` §5.
- Edge loops around joints (neck, shoulders, tail root) matter for skinning. QuadriFlow gives
  roughly even loops; hand-placed loops are better but need a modeller.
- **Metaball blockouts must fuse** [verified here]: at radius ×1.0 the creature came out as
  **8 disconnected parts**. At ×1.25 with stiffness 2.0 it was 1 part (`scripts/meta_probe.py`).
  Always count connected components before going on.

### 3.3 Normals
- Smooth shading plus a baked normal map for organics. Flat shading (or Orbkin's banded toon)
  for faceted props.
- Hard edges must coincide with UV seams when baking normal maps, otherwise you get shading errors
  ([polycount threads](https://polycount.com/discussion/comment/1908663)).
  Face-weighted normals improve bevelled hard surfaces (Khronos guidelines).
- **Export tangents (`export_tangents=True`) when shipping a tangent-space normal map.** Without
  them the validator warns `MESH_PRIMITIVE_GENERATED_TANGENT_SPACE`, and three.js falls back to
  screen-space derivative tangents, which don't match Blender's MikkTSpace bake.
- Orbkin's toon shader reads a separate smooth normal (`sNormal`) on flat-shaded meshes. This can
  ship as a **custom attribute** `_SNORMAL` (see §5.6).

### 3.4 UVs (measured: `scripts/uv_compare.py`, layouts in `out/uvcmp/uv_sheet.png`)

| Strategy on the 2.5k-tri creature | Islands | UV coverage | Area distortion* | Time |
|---|---:|---:|---:|---:|
| smart_project 60° | 198 | 0.56 | 0.093 | 2.3 s |
| smart_project 80° | 120 | 0.63 | 0.147 | 2.7 s |
| smart 80° → `seams_from_islands` → `unwrap(MINIMUM_STRETCH)` (SLIM, 4.3+) | 120 | 0.58 | **0.033** | 5.4 s |
| **xatlas** (pip `xatlas`, MIT; `ChartOptions.max_iterations=4`, `PackOptions(padding=4, resolution=1024, bilinear=True)`) | **73** | 0.58 | 0.069 | **0.3 s** |
| QuadriFlow low + smart 66° | 77 | **0.64** | 0.111 | 4.4 s |

*mean |log(UV area / 3D area)| after normalising.

- The production build uses QuadriFlow + smart 66° + SLIM re-solve. A human unwrap would have
  about 10–20 islands with hidden seams. Automatic methods reach 70+. That's acceptable for baked
  textures with enough padding, but visible on pixel-art textures.
- **Margins:** at least 4 px at the *shipped* resolution (`pack_islands(margin=4/TEX)`). Bake with
  `margin=8+` and `margin_type='EXTEND'`. Khronos: use dilation, and align UVs to the 4×4 block grid
  for KTX2 ([KTX Artist Guide](https://github.com/KhronosGroup/3D-Formats-Guidelines/blob/main/KTXArtistGuide.md)).
  Black gutter pixels showed up as **dark specks on the simplified LOD2** (§8.6), so fill the
  background.
- **Texel density for Orbkin:** the game paints at `TEXEL = 1/16` (16 texels per world unit).
  A creature that is 1.5 units tall and about 100 px on screen can't show more than about 100
  texels vertically. **Bake at 1024 for quality, then ship 256 (or 512 at most)** for creatures.
  1024 is wasted VRAM at 360p.
- glTF-Transform also has `gltf-transform unwrap` (xatlas via WASM) if UVs are needed after export.

---

## 4. Baking in Blender, headless

### 4.1 Core setup (from `scripts/build_creature.py`)
```python
scene.render.engine = 'CYCLES'; scene.cycles.device = 'CPU'
bake = scene.render.bake
bake.use_selected_to_active = True     # high -> low
bake.cage_extrusion = 0.03             # push rays out from the low poly
bake.max_ray_distance = 0.08
bake.margin = 8; bake.margin_type = 'EXTEND'
# target image must be the ACTIVE Image Texture node in the LOW's material
img_node.image = img; nt.nodes.active = img_node
# select HIGH (and any detail objects), then LOW last and active
bpy.ops.object.bake(type='DIFFUSE', pass_filter={'COLOR'})          # albedo, 1 spp is enough
bpy.ops.object.bake(type='NORMAL', normal_space='TANGENT')          # +X +Y +Z = glTF convention
scene.world.light_settings.distance = 0.4; bpy.ops.object.bake(type='AO')   # AO from World settings, 32–64 spp
bpy.ops.object.bake(type='COMBINED', pass_filter={'DIRECT','INDIRECT','DIFFUSE','GLOSSY','EMIT'})  # "lit" bake
img.filepath_raw = path; img.file_format = 'PNG'; img.save()       # bakes are NOT saved automatically
```
- The **image colour space** must be `Non-Color` for normal/AO/curvature and `sRGB` for albedo/lit.
- **World-space gotcha** [verified here]: selected-to-active casts rays in world space. A LOD
  offset by 1.6 m baked almost entirely black. Move the low poly onto the high (or bake before
  layout).
- Tangent-space normal bakes with default swizzle (+X, +Y, +Z) match glTF (from the manual source:
  `KhronosGroup/glTF-Blender-IO/docs/blender_docs/scene_gltf2.rst`, "Normal Map").

### 4.2 Map recipes and what each is for

| Map | Bake | Use in Orbkin |
|---|---|---|
| Albedo | `DIFFUSE` + `pass_filter={'COLOR'}` from procedural high-poly material (zones by normal/height + noise) | main colour; can be palette-quantised for pixel look |
| Normal | `NORMAL`, tangent | PBR/lit path only. In a 3-band toon at 360p it mostly adds noise, so maybe skip. |
| AO | `AO` (World → light_settings.distance) | multiply into albedo for toon/sprite (saves a texture) |
| Curvature / edge mask | Emission bake of Cycles **Geometry → Pointiness** through a tight ColorRamp (0.45–0.6) [verified here, 0.15 s for 256²] | edge highlights / wear for rocks (pixel-art "lit lip") |
| Lighting ("lit") | `COMBINED` | Bruno Simon-style static dioramas. **Not** for creatures under Orbkin's dynamic cookie light. |
| Vertex colours | `bake.target = 'VERTEX_COLORS'` + an active colour attribute (CORNER, BYTE_COLOR) [verified here: rock LOD0 colours 0.004–0.74] | AO and sky light baked into the mesh with **no UVs or textures**. Ideal for low-poly rocks and props. |

Pointiness is topology-dependent and needs dense geometry; that's fine on a high poly
([strayspark](https://www.strayspark.studio/blog/curvature-maps-blender-substance-painter-alternative), secondary).

### 4.3 Denoise bakes (OIDN through the compositor, `scripts/denoise_bake.py`)
In Blender 5.x the compositor is a node group: `scene.compositing_node_group =
bpy.data.node_groups.new("Comp", 'CompositorNodeTree')` → Image → Denoise → Group Output.
Set `view_transform='Standard'` for data maps. Measured [verified here]: AO noise is gone, and the
**WebP size dropped 155 KB → 62 KB** (KTX2 UASTC+RDO 398 → 348 KB). Noise is the enemy of every
codec, so denoise or bake more samples.

### 4.4 Colour management of lighting bakes [verified here, `out/browser/lit_cmp.png`]
Cycles bakes **linear scene radiance, not view-transformed**. With a strong sun the 8-bit PNG clips,
and three's ACES tone mapping then washes it out further. Fixes:
- Expose the bake so max ≈ 1, and display with `MeshBasicMaterial({ toneMapped: false })`.
- Or bake to float/EXR and let runtime tone mapping handle it.
- Pick *one* place for tone mapping ([three forum](https://discourse.threejs.org/t/texture-in-threejs-is-brighter-than-the-blender-render-screen/68575),
  [Blender issue 39233](https://projects.blender.org/blender/blender/issues/39233)).

### 4.5 Palette textures (no unwrap at all)
- **folio-2025 pattern** [read in repo]: most models point their UVs into a shared `palette.png`
  of 128×4 colour swatches. The Blender export **mutes** the palette texture node; the runtime
  loads `palette.ktx` with Nearest filtering, no mipmaps, sRGB, and puts it on a shared material.
  Source: `sources/Game/Game.js:107`, `Materials.js createPalette()`, readme "Blender › Export".
- **Automatic version** [verified here]: model with N flat-colour materials, then run
  `gltf-transform palette --min 2` + `join`. A 5-material lantern became **2 materials and 2 draw
  calls**, with a 32×4 PNG palette (122 bytes) plus a 32×4 emissive palette. Materials that
  already have UVs are not eligible (CLI help).

---

## 5. Materials that survive glTF export

From the manual source (`scene_gltf2.rst`) and the exporter code in
`io_scene_gltf2/blender/exp/material/*`:

1. **Principled BSDF only.** Procedural nodes are not exported; bake them. Image Texture →
   Base Color. Image (Non-Color) → **Normal Map node (Tangent)** → Normal. Metallic/Roughness can
   share one image (G = roughness, B = metallic).
2. **Occlusion** exports only through a custom node group named **"glTF Material Output"**
   (old name "glTF Settings") with an `Occlusion` input. Create it in script with
   `io_scene_gltf2.blender.com.material_helpers.create_settings_group(get_gltf_node_name())`.
   Occlusion is read from the **R** channel [verified here: `occlusionTexture` present].
3. **Backface culling off ⇒ `doubleSided: true`** (2× fragment work, z-fighting on thin parts).
   Set `material.use_backface_culling = True` [verified here].
4. **Alpha:** opaque, mask (round the alpha with a Math node) or blend (avoid stacked blend layers).
5. **Emissive:** Emission Color plus Strength > 1 exports `KHR_materials_emissive_strength`, which
   Orbkin's bloom (threshold 1.0) can use directly. Unlit: mix in Camera Ray and avoid Principled →
   `KHR_materials_unlit` → `MeshBasicMaterial`.
6. **Vertex colours** export only when a material uses them (`export_vertex_color='MATERIAL'`,
   default) or with `'ACTIVE'`. Wire a Color Attribute node to Base Color [verified here: COLOR_0
   on rocks, `vertexColors: true` in three].
7. **Custom vertex attributes** need a name starting with `_` and `export_attributes=True`.
   `_SNORMAL` (FLOAT_VECTOR) → glTF `_SNORMAL` → three `geometry.attributes._snormal`
   (lower-cased by GLTFLoader) [verified here]. Use this for Orbkin's smooth-normal outline
   attribute or per-vertex rig weights.
8. **Custom properties → `extras` → `userData`** with `export_extras=True` [verified here:
   `{kin_id:'testkin', footprint:0.6}` on the mesh node]. folio-2025 uses this for
   `restitution/friction/category` physics metadata (`sources/Game/Objects.js:137`).
9. **Material names survive.** Use them as keys for runtime material replacement, as folio-2025
   does: `Materials.updateObject(mesh)` → `getFromName(child.material.name)`.

---

## 6. Rigging and animation

### 6.1 Rig and weights (`scripts/build_creature.py` §7)
```python
bpy.ops.object.parent_set(type='ARMATURE_AUTO')          # heat weights, works headless
# glTF hygiene: heat weights can be 1.0000004 -> exporter's mesh.validate() flags "Mesh is not valid"
bpy.ops.object.vertex_group_clean(group_select_mode='ALL', limit=0.01)
bpy.ops.object.vertex_group_limit_total(group_select_mode='ALL', limit=4)    # glTF/three: 4 influences
bpy.ops.object.vertex_group_normalize_all(group_select_mode='ALL', lock_active=False)
```
Heat weighting needs a manifold mesh. The voxel-remeshed and QuadriFlow mesh is fine.

### 6.2 Clips: actions → NLA tracks (Blender 4.4+ slotted actions)
```python
act = bpy.data.actions.new("Hop"); ad.action = act      # key pose bones...
track = ad.nla_tracks.new(); track.name = "Hop"; track.strips.new("Hop", 1, act)
ad.action = None; act.use_fake_user = True
# shape keys live on mesh.data.shape_keys (Key datablock): give its NLA track the SAME name
kad = mesh.data.shape_keys.animation_data_create(); ... tr.name = "Hop"
```
- Export with `export_animation_mode='NLA_TRACKS'`. Tracks with the same name on different
  datablocks merge into one glTF animation [verified here: "Hop" = 33 TRS channels + 1 `weights`
  channel].
- Manual, for the default `ACTIONS` mode: an action exports only if it's active or stashed on an
  NLA track. Since 4.4, tracks are merged **by action**, not by name. Use NLA_TRACKS mode when you
  want name-based merging ([Blender 5.2 manual glTF](https://docs.blender.org/manual/en/latest/addons/scene_gltf2.html);
  [slotted actions PR #132771](https://projects.blender.org/blender/blender/pulls/132771)).
- `export_def_bones=True` drops non-deform bones. A non-deform **root that carries the hop
  translation would vanish**, so keep it False or make root deform.
- Other relevant flags: `export_force_sampling=True` (bakes constraints/drivers),
  `export_optimize_animation_size=True`, `export_anim_slide_to_zero=True` (loops start at 0),
  `export_reset_pose_bones=True`, `export_morph_normal=True`. `export_apply=True` **kills shape
  keys** (exporter warning text).
- `gltf-transform resample` then removes redundant keys losslessly (Idle 240 → 220 keyframes).
  Meshopt compresses the animation tracks too.

### 6.3 Morph targets
Shape key "Squash" → `targets[0]` (POSITION, NORMAL) and `mesh.extras.targetNames` → three
`morphTargetDictionary = {Squash: 0}` [verified here]. Sparse accessors are on by default
(`export_try_sparse_sk`).

---

## 7. Export call (verified, annotated)

All 113 exporter properties are dumped in `pipeline/out/gltf_export_props.txt`
(`scripts/dump_ops.py`). Look them up in the running Blender rather than from memory.
```python
bpy.ops.export_scene.gltf(
    filepath=glb, export_format='GLB', use_selection=True,
    export_yup=True, export_apply=False,          # keep shape keys
    export_texcoords=True, export_normals=True, export_tangents=True,
    export_materials='EXPORT', export_image_format='AUTO',   # PNG; compress later
    export_vertex_color='MATERIAL',               # or 'ACTIVE' for colour-only meshes
    export_attributes=True,                       # '_NAME' custom attributes
    export_skins=True, export_def_bones=False, export_influence_nb=4,
    export_morph=True, export_morph_normal=True,
    export_animations=True, export_animation_mode='NLA_TRACKS',
    export_force_sampling=True, export_optimize_animation_size=True,
    export_anim_slide_to_zero=True, export_reset_pose_bones=True,
    export_extras=True, export_lights=False, export_cameras=False,
    export_gpu_instances=False,                   # True for linked-duplicate fields (see §8.5)
)
```
New in Blender 5.2's exporter (source): `export_meshopt_compression_enable` with
`export_meshopt_extension` ∈ {EXT_meshopt_compression, KHR_meshopt_compression}, plus a
`export_use_gltfpack` path. Neither works in the pip build here (missing bridge libs). On a
desktop Blender, **choose EXT_** while the game is on three < r183.

Validate the **raw** export (`gltf-transform validate`). The creature validated with 0 errors and
one harmless `NODE_SKINNED_MESH_NON_ROOT` warning. The validator can't decode meshopt or basisu and
gives false warnings on packed files.

---

## 8. Optimisation with glTF-Transform (+ KTX-Software, meshoptimizer)

### 8.1 What `optimize` really does (read from `@gltf-transform/cli/dist/cli.mjs` 4.5.1)
Order: `dedup → instance(min 5) → palette(min 5) → flatten → join → weld → simplify(error 1e-4,
ratio 0) → resample → prune → sparse → textures → meshopt|draco|quantize`. Defaults:
`--compress meshopt`, `--texture-compress auto` (re-encode in the same format), `--texture-size 2048`.
With `--texture-compress ktx2`, slots `{normalTexture, occlusionTexture, metallicRoughnessTexture}`
get **UASTC level 4, RDO λ 4** and everything else **ETC1S quality 255**. UASTC level 4 took
**2 min 22 s** for three 1024² maps on 4 cores, against 3–9 s at level 2.
Risks for game characters: flatten/join merge meshes and break name-based material swapping;
palette rewrites materials; simplify is on by default. The maintainer calls optimize "aggressive"
([discussion #1520](https://github.com/donmccurdy/glTF-Transform/discussions/1520)). Use
`--flatten false --join false --palette false --simplify false`, or a script.

### 8.2 The creature packing script (`node/pack_creature.mjs`)
```js
await doc.transform(
  dedup(), prune({ keepAttributes: false, keepLeaves: false }), resample(), weld(),
  toktx({ encoder: sharp, mode: Mode.UASTC, slots: /^normalTexture$/, level: 2, rdo: true, rdoLambda: 1, zstd: 18, resize: [MAX, MAX] }),
  toktx({ encoder: sharp, mode: Mode.UASTC, slots: /^(occlusionTexture|metallicRoughnessTexture)$/, level: 2, rdo: true, rdoLambda: 4, zstd: 18, resize: [MAX, MAX] }),
  toktx({ encoder: sharp, mode: Mode.ETC1S, quality: 255, resize: [MAX, MAX] }),   // or textureCompress({targetFormat:'webp'})
  sparse(), reorder({ encoder: MeshoptEncoder, target: 'size' }),
  meshopt({ encoder: MeshoptEncoder, level: 'high' }),
);
```
`toktx` and `Mode` are exported by `@gltf-transform/cli`. They need `ktx` on PATH. Skinning,
morphs, clips, extras and names all survive [verified in browser].

### 8.3 Measured results (creature: 2,690 tris, 11 bones, 1 morph, 2 clips, 3 maps)

| Variant | File | Texture VRAM (incl. mips) | Load (SwiftShader) |
|---|---:|---:|---:|
| raw export (PNG 1024²) | 2.56 MB | 3 × 5.59 MB = 16.8 MB | 129 ms |
| `optimize` default | 2.43 MB | 16.8 MB | — |
| `optimize --texture-compress webp --texture-size 1024` | 315 KB | 16.8 MB | — |
| `optimize --texture-compress ktx2 --texture-size 1024` | 1.81 MB | 3.5 MB | 529 ms |
| custom, PNG 512 | 1.07 MB | 4.2 MB | — |
| **custom, WebP 512, meshopt high** | **207 KB** | 4.2 MB | 44 ms |
| **custom, KTX2 512 (UASTC n/ao + ETC1S colour), meshopt high** | 571 KB | **0.87 MB** | 400 ms* |

*KTX2 load time includes spinning up the Basis transcoder worker and WASM, plus CPU transcoding
under SwiftShader. On real GPUs KTX2 uploads faster and uses far less memory. Gzip barely helps
these files (textures are already compressed).

Geometry + animation only (textures stripped, `node/geomsize.mjs`):

| Compression | GLB | gzip -9 |
|---|---:|---:|
| none | 179 KB | 89 KB |
| quantize | 120 KB | 57 KB |
| meshopt medium | 74 KB | 52 KB |
| **meshopt high** | **57 KB** | **37 KB** |
| draco (edgebreaker defaults) | 85 KB | 61 KB |

Decoder payloads (three r180 `examples/jsm/libs`, gzip -9): meshopt_decoder 6.5 KB; Draco
wasm + wrapper ≈ 75 KB; **Basis transcoder wasm + js ≈ 260 KB**.

### 8.4 KTX2 / Basis: when and how
Khronos [KTX Artist Guide](https://github.com/KhronosGroup/3D-Formats-Guidelines/blob/main/KTXArtistGuide.md):
- **ETC1S** compresses more and suits flat or mostly monochrome colour. It's "especially good with
  non-PBR textures, for example toon rendering or interface assets". It's poor on saturated
  neighbouring colours.
- **UASTC** keeps quality on packed channels (ORM, normal).
- Dimensions must be multiples of 4 (powers of two recommended). Start from 8-bit PNG sources.
- "Evaluate uncompressed first, you may not need compression at all".

**Pixel-art test** [verified here, `node/pixeltest.mjs`] on a 64×64, 6-colour, Bayer-dithered
rock tile:

| Encoding | Bytes | Mean abs err/ch | Pixels off by more than 6 | Colours after decode |
|---|---:|---:|---:|---:|
| PNG (source) | 1,701 | 0 | 0 | 6 |
| ETC1S q255 | 1,571 | 6.31 | **80.7 %** | 142 |
| ETC1S q128 | 1,300 | 9.43 | 86.5 % | 131 |
| UASTC l2 | 4,336 | 0.71 | 4.8 % | 264 |
| UASTC l4 + zstd | 3,438 | 0.68 | 3.9 % | 227 |

**Conclusion:** for Orbkin's palette-ramp pixel textures, keep PNG (lossless, tiny, Nearest, no
mips or the game's palette-preserving mips). KTX2 is for big baked or painted maps only. folio-2025
compresses its colour maps with `--encode etc1s --qlevel 255` and uses UASTC for its
`palette.png`/terrain/overlay (`scripts/compress.js` presets).

### 8.5 Instancing [verified here]
- Blender: linked duplicates (shared mesh data) as children of **one Empty**, exported with
  `export_gpu_instances=True` → `EXT_mesh_gpu_instancing`. Limits: instances must be childless
  meshes under the same parent, and per-instance material variation is not kept (manual).
- glTF-Transform: `gltf-transform instance --min 5` does the same after the fact.
- three r180 GLTFLoader builds an **InstancedMesh**. 25 rocks → **1 draw call** (plain: 25 calls).
  The file is 105 KB → 31 KB with meshopt.

### 8.6 LODs [verified here, `node/lods.mjs`, `out/browser/lod_sheet.png`]
- `weld()` + `simplify({ simplifier: MeshoptSimplifier, ratio, error })` keeps skin, joints,
  morph targets and clips. 2,690 → 1,344 tris (ratio 0.5, error 0.01) **looks identical**.
  2,690 → 538 (ratio 0.2, error 0.05) shows **dark specks** where simplified triangles sample
  the black UV gutter. Fill gutters and keep ratio ≥ 0.4 on textured characters, or decimate in
  Blender and re-bake per LOD.
- Static props: decimate in Blender (planar or collapse) → `Rock_LOD0..2` in one GLB → `THREE.LOD`.
  Remember `lod.updateMatrixWorld()` before `lod.update(camera)` in tests.
- glTF has no ratified LOD extension. `MSFT_lod` is loader-only in community plugins
  ([takahirox/three-gltf-extensions](https://github.com/takahirox/three-gltf-extensions)).
  gltfpack has no plans for it ([meshoptimizer #256](https://github.com/zeux/meshoptimizer/discussions/256)).
  Ship LODs as named nodes or separate files.
- gltfpack (meshoptimizer CLI, npm `gltfpack`) is an alternative with attribute-aware
  simplification. Not tested here.

### 8.7 Other reference configs (primary code)
- **pmndrs gltfjsx 6.5.3 `--transform`** (`src/utils/transform.js`, read):
  palette → reorder → dedup → flatten → dequantize → join → weld → (simplify) → resample (WASM) →
  prune → sparse → textures WebP @1024 (normal maps JPEG @2048) → **draco**. A comment there
  notes that `instance()` "seems problematic".
- **folio-2025** (`scripts/compress.js`): `gltf-transform etc1s --quality 255`, then `draco
  --method edgebreaker --quantize-position 12 --quantize-normal 6 --quantize-texcoord 6`. Separate
  textures go through `toktx` with per-path presets (UASTC for the palette and terrain, R-channel
  swizzles for masks), and UI images go to WebP via sharp.

---

## 9. Loading and playback in Three.js r180

### 9.1 Loader setup (`pipeline/viewer.html`)
```js
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js'; // wasm embedded, bundles with Vite
const ktx2 = new KTX2Loader().setTranscoderPath('/basis/').detectSupport(renderer); // copy examples/jsm/libs/basis/* to public/basis/
const loader = new GLTFLoader().setKTX2Loader(ktx2).setMeshoptDecoder(MeshoptDecoder);
const gltf = await loader.loadAsync(url);
```
- Vite: put GLBs in `public/` (or `import url from './x.glb?url'`). Copy the basis transcoder
  (and the Draco decoder if used) to `public/`. folio-2025 ships `static/basis/` and `static/draco/`
  ([forum](https://discourse.threejs.org/t/error-while-using-the-ktx2loader-and-following-webgl-materials-envmaps-fasthdr-html/88274)).
- Texture facts after loading [verified here]: `flipY=false`, baseColor `colorSpace='srgb'`,
  data maps `''` (linear), `channel=0` for aoMap (no uv2 needed since r151), 10–11 mips for KTX2.
  For pixel art, set `magFilter = minFilter = NearestFilter` and `generateMipmaps=false` after
  load, as folio-2025 does for its palette.

### 9.2 Instances and animation
```js
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
const kin = SkeletonUtils.clone(gltf.scene);             // REQUIRED for skinned meshes (Object3D.clone shares bones)
const mixer = new THREE.AnimationMixer(kin);              // one mixer per instance; clips are shared
const hop = mixer.clipAction(THREE.AnimationClip.findByName(gltf.animations, 'Hop'));
const idle = mixer.clipAction(THREE.AnimationClip.findByName(gltf.animations, 'Idle'));
idle.play(); /* later */ hop.reset().play(); idle.crossFadeTo(hop, 0.15, false);
hop.setLoop(THREE.LoopOnce, 1); hop.clampWhenFinished = true;
mixer.addEventListener('finished', (e) => { if (e.action === hop) hop.crossFadeTo(idle.reset().play(), 0.2, false); });
// per frame: mixer.update(dt)   (Orbkin: drive dt from the battle event player, not wall time, for setFast/skip)
```
- `mesh.morphTargetDictionary.Squash` and `mesh.morphTargetInfluences[i]` can be driven by code
  as well as clips. Hit squash can stay procedural on top of skeletal clips.
- `AnimationUtils.subclip(clip, name, startFrame, endFrame, fps)` slices one long timeline into
  clips. `AnimationUtils.makeClipAdditive` builds additive layers such as breathing on top of any
  action (secondary: [threejs-skills](https://github.com/CloudAI-X/threejs-skills)).

### 9.3 Material replacement (stylisation at runtime)
- **By name** (folio-2025): traverse, then `child.material = registry.get(child.material.name) ?? make(child.material)`.
- **Toon + inverted hull** [verified here, `out/browser/toon.png`]: `MeshToonMaterial({ map,
  gradientMap })` with a 3-texel Nearest DataTexture. For the outline, add a `SkinnedMesh(sameGeometry,
  BackSide Lambert)` with `hull.bind(o.skeleton, o.bindMatrix)` and **share
  `morphTargetInfluences`** so it follows morphs. Push along the skinned normal with
  `onBeforeCompile`, inserting `transformed += normalize(objectNormal) * w;` after
  `#include <skinning_vertex>`. Collect meshes **before** adding hulls, otherwise traverse
  recurses forever. This costs one extra draw call per creature.
- **Orbkin sprite path** [verified here, `out/browser/sprite.png`]: a raw `ShaderMaterial` gets
  skinning and morphs for free if its vertex shader includes the chunks below. Three sets
  USE_SKINNING / USE_MORPHTARGETS and uploads bone and morph textures for any material on a
  SkinnedMesh.
```glsl
#include <common>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
void main() {
  #include <beginnormal_vertex>
  #include <morphnormal_vertex>
  #include <skinbase_vertex>
  #include <skinnormal_vertex>
  #include <defaultnormal_vertex>
  #include <begin_vertex>
  #include <morphtarget_vertex>
  #include <skinning_vertex>
  #include <project_vertex>
  vN = normalize(transformedNormal);
}
```
This is the bridge for `src/render/hd2d/sprite.ts` `TOON_VERT`. Today that shader handles only the
procedural `USE_RIG` path plus `sNormal` and `color`. Adding the chunk path (plus `uv` → `map`
sampling, or `color` = COLOR_0 from Blender) lets GLB creatures go through the existing banded
toon bake, outline and billboard.

### 9.4 Hitches and disposal
- Shader programs compile at first draw and textures upload at first draw. Warm them up behind
  the loading screen: render once (or `await renderer.compileAsync(scene, camera)`), and call
  `renderer.initTexture(t)` per texture
  ([three PR #19752](https://github.com/mrdoob/three.js/pull/19752),
  [forum](https://discourse.threejs.org/t/reduce-first-render-lag-renderer-compileasync-is-not-doing-anything/86191)).
- Orbkin's `BaseScene.exit()` must also dispose GLB geometries, materials, textures and the
  skeleton's `boneTexture`. Cache the parsed gltf per species and clone with SkeletonUtils.

### 9.5 Testing GLBs without a browser [verified here]
`new GLTFLoader().parse(arrayBuffer, '', onLoad)` works **in Node** for GLBs without images: we
read attributes `['_snormal','_rigw','position','normal','uv','color']` that way. For textured
GLBs use `@gltf-transform/core` `NodeIO` in vitest: assert tri counts, joint count ≤ N, clip
names, morph names, extensions used, texture sizes and `doubleSided=false`. Use Playwright with
SwiftShader (already in the game) for visual checks, as in `node/shoot.mjs`.

---

## 10. Atlases, trim sheets, batching
- **Atlas (unique per-object UVs, 0–1)**: baked creatures and hero props.
- **Trim sheet**: horizontal strips of tileable detail (planks, stone course, metal band, bevel
  strip) that many modular meshes map onto. A 2048² atlas fits about 6–12 strips. Pad at lower
  mips (secondary: [gamineai lesson 7](https://gamineai.com/courses/build-stylized-3d-environment-art-blender/lessons/lesson-7-trim-sheets-and-atlases-blender),
  [bitsoul guide](https://bitsoulhosting.com/marketplace/blog/trim-sheets-blender-complete-guide-modular-texturing)).
  For Orbkin this matches the existing pixel painters: paint a 16-texel-per-unit trim PNG, map
  the Blender kit to it, export with UVs, keep Nearest filtering.
- **Palette texture**: flat-colour low poly (folio-2025, `gltf-transform palette`).
- **Draw calls in three**: one geometry repeated → `InstancedMesh` (`EXT_mesh_gpu_instancing`);
  many different static geometries sharing one material → `BatchedMesh`, with per-object culling
  ([forum](https://discourse.threejs.org/t/how-to-choose-between-instancedmesh-and-batchedmesh/81221));
  static and always visible → merge (`gltf-transform join`, or Orbkin's `MeshBuilder`). Merging
  loses culling.

---

## 11. Gotchas hit in this session

| Symptom | Cause | Fix |
|---|---|---|
| Creature exported as 8 floating blobs | metaball radii too small to fuse | radius ×1.25 (stiffness 2), count components (`meta_probe.py`) |
| 198 UV islands, jagged deformation | Decimate → triangle soup | QuadriFlow, or xatlas for UVs |
| `Mesh X is not valid` at export | heat weights 1.0000004; the exporter calls `mesh.validate()` | clean, limit to 4, normalise all, `validate()` |
| `doubleSided: true` everywhere | Blender material backface culling off by default | `use_backface_culling = True` |
| No occlusionTexture in glTF | AO is not linked through "glTF Material Output" | `create_settings_group(...)` and link to `Occlusion` |
| Validator `GENERATED_TANGENT_SPACE` | normal map without tangents | `export_tangents=True` |
| Hop translation missing | `export_def_bones=True` drops non-deform root | False, or deform root |
| Curvature bake black | selected-to-active in world space; LOD was offset | overlap high and low during bake |
| Exporter: Draco/MeshOptimizer "not available" | pip bpy lacks bridge libs | compress in glTF-Transform |
| UV layout PNG export fails | needs GPU offscreen | `mode='SVG'` |
| Lit bake washed out in three | linear 8-bit clip + ACES | expose bake ≤ 1, `toneMapped:false` (or float bake) |
| Infinite recursion adding outline hulls | traverse visits newly added children | collect meshes first |
| `LOD.getCurrentLevel()` stuck | stale `matrixWorld` | `updateMatrixWorld()` before `update(cam)` |
| LOD2 dark specks | simplification across UV seams samples black gutter | fill gutters, ratio ≥ 0.4, or re-bake |
| `optimize --texture-compress ktx2` took 2m22s | UASTC level 4 | level 2 (3–9 s) |
| `shape_key_remove` poll fails headless | context | `obj.shape_key_clear()` |
| Model faces away from camera | Blender −Y forward = glTF +Z | put the camera on +Z, or rotate in Blender |

---

## 12. Implications for Orbkin

1. **Move creatures from code primitives to Blender-authored GLBs, but keep the HD-2D renderer.**
   The sprite bake in `src/render/hd2d/sprite.ts` is the right *display* path. Only its input
   changes: a GLB SkinnedMesh with skeletal clips (idle, lunge, hit, faint, appear) instead of
   ellipsoids plus a vertex-shader rig. Needed changes:
   - add the skinning/morph chunk path to `TOON_VERT` (§9.3);
   - feed colour from `COLOR_0` (Blender vertex-colour zones; keeps the palette-ramp system) or
     from a 256² albedo `map`;
   - ship `_SNORMAL` as a custom attribute.
2. **One GLB per species line**, or per species: one mesh, one material (named, e.g.
   `kin_ashkit`), at most 2.5k tris, 10–20 bones, at most 4 influences, clips named exactly like the
   CreatureView events (`Idle`, `Lunge`, `Hit`, `Faint`, `Appear`), and shape keys for blink and
   squash. Engine events keep driving playback through `mixer.setTime`/`update(dt)` from the event
   player, so `setFast`/`skip` stay deterministic.
3. **Texture policy:**
   - creatures: bake albedo (+ AO multiplied in) at 1024, ship **256² PNG/WebP** (KTX2 isn't worth
     a 260 KB transcoder for a handful of 256² maps);
   - environment pixel tiles: stay PNG + Nearest;
   - large painted backdrops, if any: KTX2 ETC1S/UASTC.
   - Never ETC1S pixel art.
4. **Static diorama props from Blender:**
   - rocks, boulders and rubble with **vertex-colour-baked AO** (no textures, §4.2) or the existing
     16-texel trim PNGs, plus `EXT_mesh_gpu_instancing` for repeats (1 draw call per prop type);
   - `BatchedMesh` or `join` for unique pieces, to stay under the 100-draw-call rule.
5. **Build tooling (all free, all verified here):**
   - `tools/assets/*.py` bpy scripts, run with the bpy venv;
   - `tools/assets/pack.mjs` (glTF-Transform 4.5 + meshoptimizer; plus `ktx` only if KTX2 is used);
   - an `npm run assets` step that writes `public/models/*.glb`;
   - a vitest suite that opens every GLB with `NodeIO` and asserts budgets;
   - a Playwright screenshot of `?scene=model&species=...` for visual review.
6. **Upgrade note:** stay on **EXT_meshopt_compression** while on three r180. `KHR_meshopt_compression`
   needs r183+ (and glTF-Transform 4.5.1 can't write it yet).
7. **Iteration loop for quality:**
   - build in bpy;
   - render a Cycles contact sheet *and* a game-engine screenshot of the same GLB;
   - critique silhouettes at the real on-screen size (about 100 px);
   - fix in the bpy script, never in the GLB.

---

## 13. Proposed skill: `blender-gltf-pipeline` (what it should contain)

```
.claude/skills/blender-gltf-pipeline/
  SKILL.md               # when to use; the pipeline diagram (§2); export call (§7); gotchas table (§11);
                         # texture policy (§8.4, §12.3); budgets; verification checklist
  scripts/
    lib_bpy.py           # activate(), node(), new_image(), bake_selected_to_active(kind, img, samples, **kw),
                         # quadriflow_or_decimate(obj, tris), unwrap(obj, method='smart+slim'|'xatlas'),
                         # weight_hygiene(obj), add_nla_clip(id_owner, name, action), gltf_output_group(),
                         # export_glb(path, objs, **overrides)  (defaults = §7)
    build_template.py    # creature skeleton: blockout -> high -> low -> UV -> bake -> rig -> clips -> export
    denoise_bake.py      # OIDN through the 5.x compositor
    dump_ops.py          # print every operator property of the running Blender (avoid API guessing)
    pack.mjs             # glTF-Transform per-slot KTX2/WebP/PNG + meshopt high (no flatten/join)
    lods.mjs             # meshoptimizer simplify LODs
    inspect_assert.mjs   # NodeIO budget assertions (tris, joints, clips, extensions, doubleSided)
    shoot.mjs + viewer.html  # three r180 load + AnimationMixer + screenshot report via Playwright/SwiftShader
  reference/
    exporter-props.txt   # out/gltf_export_props.txt
    measurements.md      # tables of §3.4, §8.3, §8.4
```
Rules for SKILL.md:
- "Look up operator args in the running Blender, never from memory" (`dump_ops.py`).
- "Validate the raw GLB; compress last; screenshot the shipped file in three".
- "Count connected components and UV islands; print tris before and after every step".
- "Don't `optimize` characters".

The working prototypes for every script already exist in `scratchpad/research/pipeline/`
(`scripts/build_creature.py`, `build_rocks.py`, `build_lantern.py`, `uv_compare.py`,
`curvature_bake.py`, `custom_attr.py`, `denoise_bake.py`, `node/pack_creature.mjs`, `lods.mjs`,
`geomsize.mjs`, `pixeltest.mjs`, `shoot.mjs`, `shoot_rocks.mjs`, `viewer.html`, `viewer_rocks.html`).

---

## 14. Sources

Primary (code, docs source, specs) read in this session:
- Blender 5.2 glTF add-on source (local): `bpyenv/.../addons_core/io_scene_gltf2/` (`__init__.py`, `blender/exp/*`, `blender/com/material_helpers.py`)
- glTF-Blender-IO manual source: https://raw.githubusercontent.com/KhronosGroup/glTF-Blender-IO/main/docs/blender_docs/scene_gltf2.rst (rendered: https://docs.blender.org/manual/en/latest/addons/scene_gltf2.html)
- glTF-Transform 4.5.1 CLI source and help (`@gltf-transform/cli/dist/cli.mjs`); docs https://gltf-transform.dev/cli
- three.js r180–r186 `examples/jsm/loaders/GLTFLoader.js` (npm packages; KHR_meshopt_compression first in 0.183.0)
- Bruno Simon folio-2025 (MIT): https://github.com/brunosimon/folio-2025 (`readme.md`, `scripts/compress.js`, `sources/Game/ResourcesLoader.js`, `Materials.js`, `Objects.js`, `Game.js`, `static/*.glb`)
- pmndrs gltfjsx 6.5.3 `src/utils/transform.js` (npm pack)
- Khronos KTX Artist Guide: https://github.com/KhronosGroup/3D-Formats-Guidelines/blob/main/KTXArtistGuide.md
- Khronos Real-time Asset Creation Guidelines: https://github.com/KhronosGroup/3DC-Asset-Creation/blob/main/asset-creation-guidelines/RealtimeAssetCreationGuidelines.md
- KTX-Software 4.4.2 release: https://github.com/KhronosGroup/KTX-Software/releases/tag/v4.4.2
- meshoptimizer: https://meshoptimizer.org/ , https://github.com/zeux/meshoptimizer ; MSFT_lod stance https://github.com/zeux/meshoptimizer/discussions/256
- xatlas Python bindings: https://pypi.org/project/xatlas/
- Blender slotted-actions glTF PR: https://projects.blender.org/blender/blender/pulls/132771

Discussions and secondary (lower weight):
- glTF-Transform optimize behaviour: https://github.com/donmccurdy/glTF-Transform/discussions/1520 , uv1 pruning https://github.com/donmccurdy/glTF-Transform/discussions/1296
- compress-glb optimize guide (v4.5.0 flags): https://compress-glb.com/blog/gltf-transform-optimize/ ; Draco vs Meshopt: https://compress-glb.com/blog/draco-vs-meshopt/
- Cinevva GLB optimisation 2026: https://app.cinevva.com/guides/optimize-glb-for-web ; Blender 5 for game artists: https://app.cinevva.com/guides/blender-5-for-game-artists
- three.js forum: lightmap/aoMap channel https://discourse.threejs.org/t/lightmap-uses-wrong-uv-in-loaded-gltf-model/57434 ; KTX2Loader + Vite https://discourse.threejs.org/t/error-while-using-the-ktx2loader-and-following-webgl-materials-envmaps-fasthdr-html/88274 ; Instanced vs Batched https://discourse.threejs.org/t/how-to-choose-between-instancedmesh-and-batchedmesh/81221 ; compile hitch https://discourse.threejs.org/t/reduce-first-render-lag-renderer-compileasync-is-not-doing-anything/86191 ; baked brightness https://discourse.threejs.org/t/texture-in-threejs-is-brighter-than-the-blender-render-screen/68575
- three.js PR #19752 (compile before first draw): https://github.com/mrdoob/three.js/pull/19752
- three-gltf-extensions (MSFT_lod loader): https://github.com/takahirox/three-gltf-extensions
- Polygon budgets: https://www.messypoly.com/learn/polygon-budgets-mobile-games , https://low-poly.com/blog/polygon-budgets-by-platform-2026 , https://www.creatuneagency.com/en/blog/low-poly-3d-models-for-mobile-games/
- Polycount smoothing/UV seams: https://polycount.com/discussion/comment/1908663
- Curvature in Blender: https://www.strayspark.studio/blog/curvature-maps-blender-substance-painter-alternative
- Trim sheets: https://gamineai.com/courses/build-stylized-3d-environment-art-blender/lessons/lesson-7-trim-sheets-and-atlases-blender , https://bitsoulhosting.com/marketplace/blog/trim-sheets-blender-complete-guide-modular-texturing
- Community three.js Claude skills (format reference): https://github.com/CloudAI-X/threejs-skills
- Blender bake brightness bug: https://projects.blender.org/blender/blender/issues/39233

Sister notes in this research round: `research/blender-llm.md` (modelling strategies, SDF/GN,
gotchas), `research/showcases.md` (verified Claude-made showcases, EEVEE now works after apt EGL),
`research/threejs-render.md`.

---

## Appendix: output index (`scratchpad/research/pipeline/out/`)
- `kin1k/` — creature `.blend`, bakes (`Kin_albedo/normal/ao/lit.png`, `Kin_ao_dn.png`), `kin_raw.glb`, `bakes_sheet.png`, `ao_denoise_cmp.png`
- `packed/` — `custom_{ktx2,webp,png}_512*.glb`, `opt_*.glb`, LODs `custom_webp_512_lod{1,2}.glb`
- `browser/` — screenshots `sheet.png` (raw | KTX2 | WebP / old | toon | lit), `sprite.png`, `lod_sheet.png`, `lit_cmp.png`, `rocks_*.png`, `reports.json` (loader reports)
- `rocks/` — vertex-colour-baked LODs, instanced vs plain fields, `rock_curvature.png`, custom-attribute GLB
- `props/` — lantern palette/join test
- `pixel/` — ETC1S/UASTC pixel-art damage test
- `uvcmp/` — UV strategy comparison (`uv_sheet.png`)
- `gltf_export_props.txt`, `gltf_transform_help.txt`
