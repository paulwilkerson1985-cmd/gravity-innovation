# Blender + LLM (Claude/Opus) workflows: research notes for Orbkin

Angle: how people actually drive Blender with Claude/Opus, which model-building strategies give
detailed, sharp results instead of "blobby primitive soup", and what works headless in this
container. Everything under "Experiments" was run here with Blender 5.2.2 (`bpy` module) and
checked by eye in renders. Scratch root: `/tmp/claude-0/-home-user-gravity-innovation/a5440fec-78d9-5c47-821a-56c84521c2ff/scratchpad/research/`.

- Scripts: `research/exp/*.py`: `kit.py` (helpers), `gn.py` (geometry-node builder), `api.py` (live API lookup), `exp1`–`exp8`.
- Outputs: `research/exp/out/` (PNG renders, GLBs, bakes).
- One-page visual summary: `research/blender-llm-showcase.jpg` (8 strips, top to bottom: e1, e3, e2, e4, e6 cliff + creature, e6 baked diorama, e7, e8).

Confidence labels: **[measured]** = run here; **[primary]** = read in source code or repo docs;
**[secondary]** = blogs or search summaries, not verified; **[opinion]** = my judgement.

---

## 0. TL;DR

1. **Use Blender as the asset factory, not more hand-written Three.js primitives.** Claude writes
   `bpy` Python, runs it headless, renders a contact sheet, looks at it, and fixes one thing per
   round. Blender's modelling kernels do work that hand-coded meshes can't: SDF unions with fillets,
   voxel remeshing, displacement, bevels and weighted normals, booleans, and Cycles bakes from
   high poly to low poly. **[measured]**
2. **The biggest quality jumps measured here:**
   - **(a) A detail transfer.** A 4-box blockout became a stone terrace: geometry nodes turned it into an SDF, rounded it, and displaced cracks, strata and lumps (143k tris). A Cycles bake carried that onto a 1,720-tri game mesh as normal, AO and colour maps. The result was 112 KB after gltf-transform and loads in Three.js r180. It looks almost the same as the high poly.
   - **(b) SDF union + fillet bodies.** Creatures built this way read as one sculpted skin, not intersecting spheres.
   - **(c) Sharp secondary parts.** Eyes with highlights, claws and faceted crystal shards are modelled as separate bevelled parts.
   - **(d) Pixel sprite sheets.** Workbench with a generated toon matcap, AA off and a numpy outline rendered an 8-direction sheet in 0.57 s. **[measured]**
3. **Blender's sculpt operators crash headless** (segfault). "Sculpt by script" means SDF
   add/subtract with fillet, geometry-nodes displacement (Voronoi, Noise, Wave), numpy vertex
   deformation, and the Displace modifier. **[measured]**
4. **EEVEE now works here** after `apt-get install libegl1 libegl-mesa0 libgl1-mesa-dri libgbm1`
   (llvmpipe). It is slow on CPU: 16–48 s per frame including shader compilation. Measured timings:
   Workbench about 0.1–2.5 s, Cycles 640² at 48 spp about 6 s. Use Workbench for review and sprites
   and Cycles for beauty shots and bakes. **[measured]**
5. **The best public Claude+Blender skill is `elithril/blender-kiln`.** It is MIT, tested on Blender 5.2.2 with Opus 5.5, and every rule in it comes from a measurement. Its lessons generalise:
   - Measure instead of eyeballing.
   - Render every joint.
   - Start surfaces from scanned CC0 texture sets.
   - Make one material correction per round.
   - Measure the file you ship.
   - Convert float bakes to sRGB bytes before glTF export.

   Most other "Blender skill packs" are unmeasured prose. **[primary]**
6. **Be honest about the creators' showcases.** They usually combine scripted modelling with
   marketplace assets (Poly Haven, Sketchfab), AI mesh generators (Hyper3D Rodin, Tripo, Hunyuan3D,
   Meshy, which are mostly paid or credit-limited), image-generated textures and days of iteration.
   One documented Opus 5.5 run said scripted modelling "matches dimensions and outlines" but lacks
   "density and visual appeal". The density has to come from detail tiers, layered surface fields
   and textures, which is what the recipes below add. **[secondary]**

---

## 1. How people drive Blender with Claude

### 1.1 MCP servers (live Blender with a GUI)

| Server | What it is | Tools (exact) | Notes |
|---|---|---|---|
| **Official Blender Lab MCP** (`projects.blender.org/lab/blender_mcp`, docs at blender.org/lab/mcp-server). This is the server behind Anthropic's Claude Blender connector (28 Apr 2026). | Blender Foundation; v1.0.0 27 Apr 2026, v1.0.3 by Sep 2026; needs Blender ≥ 5.1, installed as an extension with **online access ON** | `execute_blender_code`, `execute_blender_code_for_cli` (background process), `get_blendfile_summary_datablocks(_for_cli)`, `get_python_api_docs`, `search_api_docs`, `search_manual_docs`, `get_objects_summary`, `get_object_detail_summary`, `jump_to_view3d_object_by_name`, `get_screenshot_of_area_as_image`, `get_screenshot_of_window_as_image`, `get_screenshot_of_window_as_json`, `render_thumbnail_to_path`, `render_viewport_to_path` | No asset or generation tools. Its PyPI-style name clashes with ahujasid's: run it with `uvx --from "git+https://projects.blender.org/lab/blender_mcp.git#subdirectory=mcp" blender-mcp`. Reported 120 s per-call timeout in v1.0.3; use the background-CLI path for long renders. Docs warn that it runs LLM code unguarded, so use a VM. [primary via kiln + secondary] |
| **ahujasid/mcp-for-blender** (formerly `blender-mcp`, PyPI `mcp-for-blender` 2.1.9) | Community, MIT, the original (Mar 2025), widely used | v2.1: `execute_blender_code`, `look` (modes viewport/camera/**angles**/frames; shading solid/material/rendered/wireframe/xray), `get_scene_info`, `generate_3d` (Tripo/Hunyuan3D/Rodin), `search_assets`/`import_asset` (Poly Haven CC0, Sketchfab, Poly Pizza), `get_addon_status`, telemetry tools | Addon runs a socket server on port 9876. Server instructions worth copying: look nodes up by `type`, never by localized name; read enum identifiers from `bl_rna` instead of hardcoding; set material colour on node inputs (`diffuse_color` only affects the viewport); size imported models from `world_bounding_box`. The `look(mode="angles")` multi-view sheet is the self-critique primitive. [primary: read `src/blender_mcp/server.py`] |
| nirholas/blender-mcp (`@three-ws/blender-mcp`) | Headless: `blender -b --factory-startup` per call, works in containers | `blender_info`, `blender_scene_info`, `blender_convert`, `blender_optimize`, `blender_render` (orbit multi-view PNG returned inline), `blender_run_python`, `blender_forge_import` | Same idea as our setup; a crash per call can't poison the next. [primary: GitHub page] |
| RFingAdam/mcp-blender (218 tools), gmoddev/Blender_mcp (69 tools), Alt5ConCre/blender_mcp (159 tools) | Tool-heavy variants | — | More tools mostly means more context cost. Kiln measured the Lab server (fewer tools) at 136 turns against 197 on ahujasid for the same 7 GLBs, about 10% cheaper. [primary via kiln bench] |

**For this container:** there is no GUI, so an MCP server adds nothing. Plain `bpy` scripts run
with `$BPY` give everything the MCP `execute` and `render` tools give, and the image comes back
through the Read tool. That is the loop used in every experiment below. The Lab server's
`get_python_api_docs` is replaced by `exp/api.py`, which introspects `bl_rna` in the running
Blender. On the owner's own machine, the official Claude Blender connector or ahujasid's MCP adds a
live viewport and the Poly Haven integration. The same skills and recipes apply because the
Python is identical. **[measured + opinion]**

### 1.2 Community Claude skills for Blender (read and assessed)

- **elithril/blender-kiln** (MIT): *the one to learn from.*
  - Measured on Blender 5.0 and 5.2.2 with Opus 5.5.
  - Pipeline: CONFIG → BRIEF → SOURCE → IMPORT → CLEANUP → TEXTURING → RIG → ANIMATE → OPTIMIZE → EXPORT.
  - 26 "iron rules", each traced to a measured failure.
  - A bench of sandboxed `claude -p` runs re-measures the shipped GLB, never the session's own report.
  - Rules worth stealing, verbatim in spirit:
    - Screenshot after every phase that changes geometry or materials, **framed on the subject**, and from two opposite angles after texturing. "A numeric check does not replace it."
    - Apply transforms → merge doubles keeping each corner's normal → recalc normals, before rig or export. A plain merge re-smoothed a faceted mesh; merging before applying a ×100 scale deleted 108 of 928 faces.
    - Never `export_apply=True` (modifiers balloon the file), **except** geometry nodes: apply the GN modifier first, or the exporter writes only the base mesh. Measured: a 2,688-tri scatter exported as 2 tris.
    - Run a material audit before glTF export. Noise, Voronoi, ColorRamp, Bump and Displacement nodes are silently lost; standalone AO maps are dropped. Bake instead.
    - Never `gltf-transform optimize`: its `simplify` step destroys geometry. Run resize → webp → draco as separate steps.
    - **The glTF exporter writes a linear float base-colour image without the sRGB transfer** (linear 0.2 → byte 51 instead of 124). Bake colour through Emission into a float image, then convert to an sRGB byte image before export.
    - Principled BSDF inputs are linear: convert hex colours with sRGB → linear.
    - Writing `obj.location` does not refresh `matrix_world`; call `view_layer.update()` before reading it.
    - Rig density: about 20 vertices per deform bone. A Rigify human needs about 3,200 verts; below that use a hand rig of 12–20 bones.
    - Thin parts (wires, handles): trace their centreline from the image, build them as a bevelled smooth curve, never decimate them.
    - Texturing: start from CC0 scanned texture sets (Poly Haven), tinted to the reference palette. Wear masks follow form (curvature percentile, AO), not thresholded noise. Colour, roughness and relief are independent noise fields that wear in the same places. Metals stay metal.
  - Bench results [primary: `docs/benchmarks.md`]:
    - The lantern's truth score rose from 0.830 to 0.924 across 15 skill iterations.
    - Scanned texture sets took the ammo box from 0.878 to 0.950.
    - Gothic chair: 0.445 → 0.750.
    - Cost per asset is about $2–6 API-equivalent; on a subscription that is turns, not money.
  - **Kiln recommends AI generation for organic forms** (rock, tree, creature). Its free path is TRELLIS.2 on a Hugging Face Space (MIT, 1–2 generations a day). Even there it used the generated mesh **only as a measuring template**, never as the asset. Decimating a 191k-tri TRELLIS mesh broke every wire.
  - Its gallery's scripted "stylised nature" props are still icosphere blobs and lathes. Scripted organic modelling is its weakest area, and SDF modelling (§3) is the fix.
- **freshtechbro/claudedesignskills `blender-web-pipeline`**: generic glTF export, decimate, LOD and bake snippets. Some kwargs are outdated (e.g. `export_jpeg_quality` vs `export_image_quality`). Nothing on making better models. [primary]
- **PlayableIntelligence (opusgamelabs)/game-creator**:
  - Its 3D skills (`game-3d-assets`, `add-3d-assets`) use **Meshy AI first** (paid API key), then pre-built three.js example GLBs, Sketchfab, Poly Haven, Poly Pizza, and "procedural geometry as last resort".
  - No Blender at all.
  - Useful bits: `SkeletonUtils.clone` for skinned models, a `clipMap` per model, and a post-load bbox, facing and scale check with a Playwright screenshot. [primary]
- **arjun988/blender-skills** (94 skills), **mhd347/blender-expert-skill**, **RobLe3/cc-blender-skill** (30 skills), **ra100/blender-claude-plugin** (GN skill covering about 373 nodes):
  - Mostly checklists such as "silhouette first", the primary/secondary/tertiary/micro detail tiers, and bevel-width tables. One example is hard-surface primary edges at 0.005–0.02 m with 2–3 segments, panel lines at 0.001–0.003 m, and a Weighted Normal at 30°.
  - Fine as vocabulary.
  - No measurements and little runnable code. [primary: read `creature-artist`, `hard-surface`]
- **img2threejs** (Apache-2.0): image → procedural **Three.js** code (our current approach, taken to the extreme).
  - It runs staged passes (`blockout → structural → form → material → surface → lighting → interaction → optimization`) gated by deterministic Python checks.
  - A mandatory **detail inventory** must be complete before codegen.
  - Each pass is judged from exactly **one side-by-side comparison sheet**.
  - Kiln's comparison: similar likeness (0.866 vs 0.861) and better fine texture detail, but 41,736 tris against 7,552, +52% height error, and about 3× the cost, stopped at pass 3 of 8.
  - Lesson: the *process* (inventory, passes, one-sheet review) matters as much as the tool. [primary]
- **brunosimon/folio-2025** (MIT, a real shipped Three.js site): Blender models with a **palette texture** (UVs into a small swatch texture, so one material and one draw call), exported with presets, then `npm run compress` with gltf-transform and KTX2 ETC1S. [primary: readme]

### 1.3 Research on LLM → Blender code (what the papers say)

- **SceneCraft (2024)**: an inner loop of script → render → VLM critique → revise; +45% CLIP over a BlenderGPT baseline. **LL3M (2025)**: a multi-agent plan/retrieve/write/debug/refine system with BlenderRAG (1,729 Blender 4.4 doc files), self-critique on code plus renders; mostly qualitative evidence. **BlenderGym (CVPR 2025)**: 245 start→goal edits. Even the best VLMs struggle on edits easy for humans. Inference compute is best split between *generation and verification*, and the verifier itself improves with scaling. **3DCodeBench (2026)**: 212 Infinigen procedural "factories" as ground truth; Blender 5.0; text/image/multi-turn/coding-agent settings (Claude Code, Codex, Gemini CLI). **CodeGen-3D (2026)**: single-pass generation is weak; pair a strong general LLM with cheap self-refinement loops. [secondary]
- Takeaway: **verification (renders + critique + measurement) is where the quality comes from.** Spend tokens on looking. Keep the generator's step small (one pass or one fix at a time). [secondary + opinion]

### 1.4 Practitioner reports on Opus + Blender

- note.com "The shape fits, but it doesn't look cool" (Opus 5.5, Blender 5.2.2, Lab MCP v1.0.3, humanoid robot from three-view drawings): dimensions and outlines matched "with considerable accuracy", but the density and appeal fell short. [secondary]
- Blender-Bench (12 tasks, from bouncing ball to humanoid, joints checked) and an arena leaderboard (Opus 5 ~1746); "all twelve prompts produced geometry" on Opus 5.5. [secondary, unverified]
- X post by @xikhar (Opus 5.5 medium; "turned blender, image-gen, and three.js into this beauty"): it uses **image-gen** too, so not a pure-code result. [secondary]
- Anthropic "Claude for creative work" (28 Apr 2026): the Blender connector was built by the Blender developers, gives a natural-language interface to the Python API, supports batch scripts, and can add UI tools. [primary: anthropic.com]

---

## 2. This container: what runs headless (Blender 5.2.2 `bpy` module)

| Capability | Status | Numbers / notes |
|---|---|---|
| Cycles CPU render | ✅ | 640×640, 48 spp + denoise ≈ 6.4 s; 1200×520, 24 spp ≈ 10–16 s |
| Workbench render | ✅ (after the EGL fix) | 320–512 px ≈ 0.1–2.5 s; 8 sprite frames at 72 px: **0.57 s total** |
| EEVEE (Next) | ✅ **after** `apt-get install -y --no-install-recommends libegl1 libegl-mesa0 libgl1-mesa-dri libgbm1` | llvmpipe. First frame about 48 s (shader compile); 640² toon ≈ 16–27 s. Prints harmless `EGL_BAD_MATCH` warnings. Needed for Shader-to-RGB toon materials |
| Freestyle lines (EEVEE) | ✅ | the factory-empty file has no linestyle: `ls.linestyle = bpy.data.linestyles.new("LS")` |
| Geometry nodes from Python incl. **SDF grid nodes** (`MeshToSDFGrid`, `PointsToSDFGrid`, `SDFGridBoolean`, `SDFGridFillet`, `SDFGridOffset`, `GridToMesh`, …) | ✅ | 274 GN node types in 5.2 |
| Modifiers: Bevel, Weighted Normal, Boolean, Remesh (voxel), Decimate (collapse/planar), Skin, Subsurf, Displace, Corrective Smooth, Multires | ✅ | `bpy.ops.object.voxel_remesh()` ok |
| Metaballs → mesh | ✅ | `bpy.ops.object.convert(target='MESH')` |
| **Sculpt brush strokes** | ❌ **segfault** | Even with `temp_override(window, area=VIEW_3D, region)` the stroke crashes the process. Without the override, poll fails |
| Cycles baking: NORMAL, AO, EMIT, DIFFUSE (direct/indirect/colour), selected→active | ✅ | 1k normal ≈ 1 s, AO ≈ 2–8 s, colour (emit) ≈ 2–6 s; full diorama light bake 1k at 64 spp ≈ **31 s** |
| Armature + automatic weights (`parent_set(type='ARMATURE_AUTO')`) | ✅ | 8k-vert creature, 10 bones: 0.31 s, 0 dead bones |
| glTF export/import | ✅ | **No Draco/meshopt in the pip `bpy`** (`libbf_intern_draco_bridge.so` missing) → compress with `@gltf-transform/cli` from npm (works) |
| Poly Haven / ambientCG / Hugging Face from the container | ❌ blocked by proxy | npm, PyPI and raw.githubusercontent.com work |
| Three.js r180 check via Playwright (game's `node_modules`) | ✅ | static page + import map; Draco/WebP GLB, vertex colours, KHR_materials_unlit and skinned animation all verified |

Run pattern: `BPY=.../scratchpad/bpyenv/bin/python; $BPY script.py`. An exception exits non-zero.
There is no `--python-exit-code` flag to remember, unlike the `blender -b` CLI.

---

## 3. Modelling strategies: what gives detail and sharpness

### 3.1 The diagnosis: why "primitive soup" reads cheap

Exp 1 (`e1_row_cycles.png`, `e1_grid.png`) builds one creature skeleton four ways.

- **A, union of spheres and cones (what we do in Three.js today):** visible ring seams at every intersection. Each part reads as a separate toy. Workbench's outline pass draws a dark line along every seam.
- **B, Skin modifier → Subsurf:** a fused quad mesh that can be rigged. But it **shrinks about 25%** (radii ×1.3 compensates), branch points crease, and a head with 3+ branches (ears and snout) produced broken geometry. Fragile.
- **C, SDF union (mesh → SDF grid → fillet → mesh):** **one continuous skin with filleted joins.** This is the "sculpted" look. 15.6k tris after decimating to 20%; GN build plus apply 3–5 s. ✅ Best.
- **D, metaballs (balls + capsules):** also blended, but lumpy, with thin features (ears) collapsing into sticks. OK for blobs.

Rule: **primary forms come from blended volumes (SDF/metaball), never from intersecting
primitives.** Sharpness comes from *separate* secondary parts with bevels, plus surface detail
transferred by baking. [measured]

### 3.2 SDF modelling in geometry nodes (the core recipe)

```python
from gn import GN          # research/exp/gn.py
g = GN("Skin")
m2s = g.node('GeometryNodeMeshToSDFGrid', **{'Voxel Size': 0.008, 'Band Width': 3})  # voxel ~ 1/150 of size
fil = g.node('GeometryNodeSDFGridFillet', Iterations=6)        # blend radius ≈ iterations × voxel
g2m = g.node('GeometryNodeGridToMesh', Threshold=0.0)          # !!! default 0.1 is for density grids → EMPTY mesh
g.link(g.inp, 0, m2s, 'Mesh'); g.link(m2s, 0, fil, 0); g.link(fil, 0, g2m, 'Grid'); g.out_from(g2m)
obj.modifiers.new("skin", 'NODES').node_group = g.tree
```

- The input can be a *joined* mesh of overlapping ellipsoids and tapered capsules. MeshToSDF unions them.
- `SDFGridOffset.Distance` > 0 grows or rounds; < 0 erodes.
- `SDFGridBoolean` (UNION / INTERSECT / DIFFERENCE) carves; follow it with Fillet to soften.
- The `GridToMesh` threshold is an inflate control: negative inflates.
- Voxel 0.008 on a 1.4 m creature gave 164k tris raw. `Decimate(ratio=0.06)` → about 10k tris with the shape intact. [measured]
- Then **apply** the modifier (rule: GN output exists only as a modifier result).
- **After applying GN, the mesh has a `None` material slot**: `mesh.materials.clear()` before appending, or every material-dependent bake (EMIT) silently comes out black. [measured: cost one debug round]

### 3.3 Surface detail by displacement ("sculpt by script")

Exp 3 (`e3_high_vs_low.png`), cliff terrace from 4 boxes:

```
boxes → MeshToSDF(voxel 0.02) → SDFOffset(+0.04, rounds) → Fillet(4) → GridToMesh(0)
     → SetPosition(offset = Normal × (crack + plate + strata + lump))
crack  = MapRange(Voronoi DISTANCE_TO_EDGE scale 1.6, 0..0.06 → -0.07..0)    # thin valleys
plate  = MapRange(Voronoi F1 .Color, 0..1 → -0.03..0.05)                     # chiselled stone faces
strata = MapRange(Wave BANDS Z, SAW, scale 1.1, distortion 3 → 0..0.025)     # sedimentary lines
lump   = MapRange(Noise scale 0.9, 0.3..0.7 → -0.05..0.05)                   # big mass variation
```

The result is 143k tris of convincing stylised stonework from about 60 lines, applied in 3–5 s.
Vary `Scale` and seed (the W input or an offset vector) per kit piece. At 360p the cracks and plates
still read clearly (`e8_360p_x2.png`). Tiling three identical pieces shows repetition, so generate
variants. [measured]

Other script-sculpt tools:
- `Displace` modifier with procedural textures.
- numpy vertex deformation (inflate, pinch or crease brushes written as falloff functions).
- Chiselled rocks: displaced icosphere → **`Decimate(DISSOLVE, angle 14°)` → triangulate → flat shading** (exp 7, `e7_rubble.png`). That is the faceted rubble look of the reference.

### 3.4 Sharp secondary parts (hard surface)

- Separate objects for eyes (dark glossy ellipsoid plus an **emissive white highlight** ellipsoid), nose, claws (6-sided cones), and faceted crystal or flame shards. All bevelled. Flat shading for crystals.
- Bevel: `width` 0.003–0.02 m, `segments` 2, `limit_method='ANGLE'`, `harden_normals=True`, plus `WEIGHTED_NORMAL(keep_sharp=True)`. Edge highlights read as "crafted" (`e5_bevel.png`).
- Kiln-style detail inventory before modelling: list identity-defining details and the part each belongs to, and how parts meet ("inserted" / "resting"). Parts that join must **enter** each other. Check floating parts with a BVH surface-distance test (kiln `floating_parts`, tol 0.5 mm). [primary + measured]

### 3.5 Colour: vertex-colour zones from geometry (creatures)

Exp 2 (`e2_compare.png`):
- Compute masks in numpy from position and normal: belly = underside and throat; muzzle sphere; ear tips by height; paws by height; tail tip; stripes = `sin(y·38) > 0.55` on upward normals.
- Mix palette colours into a `BYTE_COLOR` corner attribute (`foreach_set("color", linear floats)`).
- Material: `ShaderNodeVertexColor` → Base Color.
- Export with `export_vertex_color='ACTIVE'`. Three.js shows it correctly; checked in `e6_threejs.png`.
- Use hard thresholds (not smoothstep) for pixel-art crispness, and paint *before* decimating, or bake to texture.

### 3.6 Detail transfer: high poly → game mesh (baking)

Exp 3, measured:
- `low = Decimate(ratio 0.012)` gives 1,720 tris.
- Smart UV (60°) produced hundreds of tiny islands. Prefer larger islands: a higher angle limit, `lightmap_pack`, or seams by angle plus `uv.unwrap`.
- Bake with `use_selected_to_active=True`, `cage_extrusion=0.08`, `max_ray_distance=0.3`, `margin=4`:
  - NORMAL (Non-Color image)
  - AO
  - colour via an **Emission** rewire of the high material's colour network, bake type `EMIT`, into a *byte* image (avoids kiln's float/sRGB trap)
- Low material: colour map → Base Color; normal map → Normal Map node.
- Export GLB 1.58 MB → `gltf-transform resize 512` → `webp` → `draco` = **112 KB**.
- Loaded in Three.js r180 with `DRACOLoader` (`e6_threejs.png`). Near-identical to the 143k-tri high poly. [measured]

### 3.7 Baked lighting (Bruno-Simon-style web trick)

Exp 5:
- Join the static diorama, add a second UV with `lightmap_pack`, sun + sky world.
- `bake(type='DIFFUSE', pass_filter={'DIRECT','INDIRECT','COLOR'})` at 1k / 64 spp = 31 s.
- Replace the materials with **Image → Background shader → Output**. Blender's exporter writes that as **KHR_materials_unlit** (verified with `gltf-transform inspect`).
- Three.js shows soft sun shadows, bounce light and contact darkening at zero runtime lighting cost (`e6_baked_threejs.png`). [measured]

### 3.8 Rigging and animation for the web

Exp 7:
- Import the creature GLB, join its parts, weld, add a 10-bone hand rig (root, spine, head, tail, ears, 4 legs), `parent_set(ARMATURE_AUTO)` (0.31 s), and verify no dead vertex groups.
- Key a 24-frame "Idle" and export.
- In Three.js: clip `Idle` 1.0 s, 11 bones, tail rotates 0.23 rad at t=0.25. Verified via `AnimationMixer`.
- Warnings to act on: more than 4 influences → `vertex_group_limit_total(limit=4)` before export. The glTF export splits by material into 6 skinned meshes, so **use one material (vertex colours or an atlas) to keep one draw call per creature**. [measured]

### 3.9 Scatter and kitbash

Exp 7: 5 chiselled rock variants in a collection, then a GN tree:
- `DistributePointsOnFaces(POISSON, min dist 0.16)` restricted to z > -0.05
- `InstanceOnPoints(Pick Instance, CollectionInfo(Separate Children, Reset Children))`
- random rotation and scale 0.5–1.4
- `RealizeInstances`, joined with the mound

Gives a 21.7k-tri rubble pile. **Realize, then apply, before export.** [measured]

---

## 4. Rendering for self-critique and for sprites

- **Review sheet** (`kit.contact_sheet`): the headless version of MCP `look(mode="angles")`. Workbench, `STUDIO` light, cavity BOTH (ridge/valley 1.5), object outline, shadows, AA 8; front/right/top/¾ tiles at 320–384 px; 1–3 s.
  - **Hide every non-target mesh**, or other objects occlude the view. That was my first bug.
  - Fit the camera to the projected box corners, not the bounding sphere.
- **Beauty**: Cycles, `view_transform='Standard'` (matches Three.js output; AgX desaturates), 3-point area lights scaled by (size)², 24–48 spp + denoise.
- **Toon (EEVEE)**: Diffuse BSDF → Shader to RGB → RGB to BW → ColorRamp (CONSTANT; e.g. 0 → cool shadow 0.45, 0.08 → 0.8, 0.32 → 1.0) → Multiply with base colour → Emission. Add Freestyle (silhouette, border, crease; ABSOLUTE 1.6 px). About 16 s per frame on CPU.
- **Pixel sprites (fast)** (`exp4_sprites.py`, `e4_sheet_wb_x4.png`):
  - Workbench with a **generated toon matcap**: 3 hard bands plus a rim, written as an EXR and loaded via `preferences.studio_lights.load(path,'MATCAP')`.
  - `color_type='VERTEX'`, `render_aa='OFF'`, `film_transparent`, orthographic camera at battle elevation (dir (0,-1,0.55)), 72 px.
  - Rotate a pivot empty in 8 × 45° steps.
  - numpy post-process: posterise, then a **1 px outline from alpha dilation** (better than Freestyle at sprite scale, which drew 2–3 px and noisy inner lines).
  - 8 frames in **0.57 s**.
  - Per-channel posterise shifted cream toward green. Use nearest-palette (Lab) quantisation with a curated palette instead.
- No AA anywhere for pixel art: `render.filter_size = 0` (EEVEE/Cycles), Workbench `render_aa='OFF'`, nearest upscale. [measured]

---

## 5. Export to Three.js: checklist

1. Apply all transforms (**including location**) on joined objects. Otherwise mesh coordinates ≠ world coordinates, so zone masks and parented details land offset. Exp 2 had eyes floating 0.42 m above the head.
2. Parenting: `child.parent = p; child.matrix_parent_inverse = p.matrix_world.inverted()`, or apply the parent transform first.
3. GN: realize instances, apply the modifier, clear the `None` material slot.
4. Material audit: procedural nodes are lost → bake. Use Principled BSDF only, or Background → unlit.
5. Vertex colours need `export_vertex_color='ACTIVE'`, or a Color Attribute node actually used by the material. Otherwise you get "The active Vertex Color will not be exported".
6. At most 4 bone influences per vertex. One material per creature for one draw call.
7. Export uncompressed (`export_apply=False`, `export_yup=True` default) → `npx gltf-transform resize --width 512 --height 512` → `webp` (or `etc1s`/`uastc` for KTX2) → `draco`. Never `optimize`.
8. Verify the **shipped** file: `gltf-transform inspect` (tris, attributes, extensionsUsed) plus a Playwright screenshot in Three.js with the game's loaders.
9. Three side: `DRACOLoader.setDecoderPath('/three/examples/jsm/libs/draco/gltf/')`. For pixel art set `texture.magFilter = NearestFilter`. glTF is Y-up; Blender's exporter converts automatically.

---

## 6. Gotchas found in this session (each cost a debug round)

| Symptom | Cause | Fix |
|---|---|---|
| SDF GN output has 0 faces | `GridToMesh.Threshold` default **0.1** (density convention) | set `0.0` for SDF grids |
| Colour bake all black, normal and AO fine | GN apply left a `None` material slot; the material went to slot 1 | `mesh.materials.clear()` before append |
| Eyes and colour zones offset from the body | joined object kept `parts[0].location`; mesh coords ≠ world coords | `transform_apply(location=True, rotation=True, scale=True)` after join |
| Contact-sheet tile occluded | other objects in front of the fitted camera | hide non-targets in `hide_render` during the sheet |
| `linestyle` is None | factory-empty file | create `bpy.data.linestyles.new()` |
| `scene.view_layer` AttributeError | API: it's `bpy.context.view_layer` | — |
| Sculpt stroke | segfault headless | don't; use SDF, GN displacement or numpy |
| Draco export error | pip bpy lacks the Draco library | gltf-transform `draco` |
| EEVEE "libEGL.so.1 not found" | missing Mesa EGL | apt install libegl1 libegl-mesa0 libgl1-mesa-dri libgbm1 |
| `Material.use_nodes` DeprecationWarning | 5.x materials always have node trees | drop the call (removed in 6.0) |
| Stroke element `pen_flip` unknown | API change | read `bpy.types.OperatorStrokeElement.bl_rna.properties` |

Generic rule from all of these: **look up sockets, enums and operator args in the running Blender**
(`$BPY exp/api.py node GeometryNodeGridToMesh` prints `Threshold default=0.1`), never from
memory. Nodes by `type`, not localized name.

---

## 7. Free vs paid (owner constraint: Claude subscription only)

- **Free, here, no network:** everything in §2–§5 (Blender, bpy, Cycles, GN, gltf-transform via npm, Three.js, Playwright).
- **Free with internet on the owner's machine (blocked in this container):**
  - Poly Haven CC0 HDRIs, textures and models (no key; ahujasid MCP and kiln integrate it). Kiln measured scanned sets as the single biggest material upgrade.
  - CC0 stylised low-poly libraries (Kenney, Quaternius, KayKit) as kitbash base meshes. Unverified here, and CLAUDE.md currently says "no external art", so this would be a policy change.
  - Sketchfab: free account, licence per model.
  - Hugging Face Spaces: TRELLIS.2 (MIT) at about 1–2 generations a day as a *measuring template*, not an asset.
- **Paid or credits, excluded:** Meshy, Tripo, Hyper3D Rodin, MCP-native Hunyuan3D (its licence also excludes the EU, UK and South Korea), nano-banana/Gemini image API, Pollinations (402 after one image per kiln).

---

## 8. Implications for Orbkin

1. **Switch where the geometry comes from, not the renderer.** Keep the Three.js HD-2D runtime (pixel grid, cookie light, bloom, grade, sprite baking). Author assets in **Blender scripts** (`game/tools/blender/*.py` or similar, run by `$BPY`, deterministic seeds) that emit GLBs into `public/models/`. Assets stay *procedural and original*: generated by our own code, so they don't break the "no external art" rule. [opinion]
2. **Environment kit first (biggest gap against the reference: the rock walls and rubble).** Use the exp 3 recipe for terrace and boulder-wall pieces in 6–10 variants per biome (cave, volcanic basalt, coast, summit). Bake normal, AO and colour onto about 1–3k-tri pieces with 256–512 px pixel-art textures (posterise and palette-snap after the bake, nearest filter). Measured: 112 KB per piece compressed. Exp 7's chiselled-rock scatter replaces our rubble piles. Merge static pieces to respect the draw-call budget below 100.
3. **Pre-bake light into the static diorama** (exp 5) for GI, bounce and contact shadow, multiplied under the existing dynamic cookie/key light. Or bake AO only into vertex colours or the texture if the dynamic light must stay authoritative.
4. **Creatures**: rebuild each species as an SDF-union body (§3.2) plus sharp bevelled detail parts plus vertex-colour zones (§3.5). Join everything into **one mesh with one vertex-colour material** (the 1-mesh-per-creature rule), 5–15k tris. Optionally add a 10–20-bone rig with keyed idle, attack and hurt clips (§3.8). The runtime toon sprite baker (`sprite.ts`) then works from much better models with no other changes.
5. **Optional offline sprites**: the Workbench-matcap sheet renders 8 directions × N frames in under a second per species. Useful for portraits, party icons and bestiary art without runtime cost.
6. **Adopt kiln's and img2threejs's process as skills:**
   - a detail inventory per asset
   - staged passes (blockout → forms → secondary → surface → colour → bake → export)
   - one review sheet per pass (contact sheet plus an in-engine Three.js capture beside the reference crop)
   - **one fix per round**
   - measure the shipped GLB (tris, size, attributes)
   - a floating-part BVH check

   This counters both "primitive soup" and "matches the outline but lacks density".
7. **Set up the environment once per container**: the EGL apt line for EEVEE and Workbench, `npm i @gltf-transform/cli` in a tools dir, and the `bpy` venv. Put this in the skill's setup section or a SessionStart hook.

## 9. Proposed skills (what they should contain)

- **`blender-headless`**:
  - Setup (venv, EGL fix, engine smoke test).
  - `kit.py` (reset, srgb, pbr, camera fit, contact_sheet, render, stitch, three_point), `gn.py` (node builder), `api.py` (live API lookup).
  - The gotcha table (§6), render recipes (§4) and the export checklist (§5).
- **`orbkin-asset-forge`**: recipe scripts with parameters:
  - `creature_sdf.py` (joint/ellipsoid spec → SDF body → detail parts → colour zones → one-mesh GLB, optional rig)
  - `kit_rock.py` (blockout → SDF → displacement fields → high/low → bakes → pixel texture → GLB)
  - `scatter.py`, `prop_bevel.py`, `lightbake.py`, `sprites.py`
  - Budgets: tris per asset type, texture px, KB per GLB, draw calls.
- **`asset-review`**:
  - The loop rules (inventory, passes, one sheet, one fix).
  - Checks: silhouette at game pixel height, joints and floating parts, colour-zone crispness, palette, tri/KB budget, shipped-GLB inspect, Playwright Three.js capture.

---

## Sources

- ahujasid/mcp-for-blender: https://github.com/ahujasid/blender-mcp (read `README.md`, `src/blender_mcp/server.py`, `addon.py` via raw.githubusercontent.com)
- Official Blender Lab MCP: https://projects.blender.org/lab/blender_mcp (tool list `readme_tools.rst`, setup wiki; via search + kiln)
- Anthropic, Claude for creative work: https://www.anthropic.com/news/claude-for-creative-work
- elithril/blender-kiln: https://github.com/elithril/blender-kiln (`plugin/SKILL.md`, `plugin/references/reference-fidelity.md`, `docs/benchmarks.md`, `docs/gallery.md`, `examples/gallery/studio.py`, `assets.py`)
- freshtechbro/claudedesignskills blender-web-pipeline: https://github.com/freshtechbro/claudedesignskills/tree/main/plugins/individual/blender-web-pipeline
- PlayableIntelligence/game-creator (opusgamelabs): https://github.com/opusgamelabs/game-creator (`skills/game-3d-assets/SKILL.md` etc.)
- arjun988/blender-skills: https://github.com/arjun988/blender-skills ; mhd347/blender-expert-skill: https://github.com/mhd347/blender-expert-skill ; RobLe3/cc-blender-skill ; ra100/blender-claude-plugin
- nirholas/blender-mcp (headless): https://github.com/nirholas/blender-mcp
- img2threejs: https://github.com/img2threejs/img2threejs
- brunosimon/folio-2025: https://github.com/brunosimon/folio-2025 (readme: Blender export, palette texture, compress)
- 3DCodeBench: https://github.com/gaoypeng/3dcodebench (arXiv 2606.01057)
- BlenderGym (CVPR 2025): https://arxiv.org/abs/2504.01786 ; SceneCraft: https://arxiv.org/abs/2403.01248 ; LL3M: https://arxiv.org/abs/2508.08228 , https://github.com/threedle/ll3m
- note.com Opus 5.5 × Blender experiment: https://note.com/clearether/n/n30b928636df4 ; Blender Bench write-up: https://note.com/jun_suzuki1973/n/na589d79428ad
- Infinigen (procedural Blender generators, BSD-3): https://github.com/princeton-vl/infinigen
- Blender manual / API: Remesh modifier, BakeSettings (docs.blender.org)
