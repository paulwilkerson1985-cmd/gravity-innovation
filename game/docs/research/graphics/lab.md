# Hands-on capability lab: what asset pipeline actually works in THIS container

Angle: run the tools, time them, find what breaks. The question for Orbkin is whether a
Blender → glTF → Three.js pipeline (instead of hand-coded primitives) is practical here:
headless, CPU-only, 4 cores, no GPU, free tools only, behind a restrictive proxy.

Everything marked **[run]** was executed in this container on 2026-10-14 by the scripts in
`scratchpad/research/lab/` (index in §10). Timings are wall-clock seconds.

**Caveat on timings.** Other agents were running at the same time. The logged load average
(3.5–5 on 4 cores) is mostly the render's own 4 Cycles threads. A rerun with less contention
(`out/02_quick.log`) was only **5–25% faster** (§3), so treat the numbers as roughly ±20%.

Read with: `research/asset-pipeline.md` (deep dive on bake/export/compress) and
`research/blender-llm.md` (how people drive Blender with LLMs). This file adds independent
measurements, and several failure modes those notes did not hit.

---

## 0. TL;DR

1. **The full chain runs headless here at zero cost** [run]. bpy 5.2.2 (pip wheel) handles
   modelling, retopology, UVs, baking, rigging and animation, and exports a GLB.
   glTF-Transform / gltfpack / KTX-Software compress it. three r180 (the game's copy) loads it
   in Playwright Chromium on SwiftShader, and it gets screenshotted. Creature build to
   compressed GLB takes about **15 s** (blockout and retopo 5–8 s, UV 2.5 s, normal + albedo
   bakes ~1 s, rig 0.2 s, export 0.25 s, meshopt 0.7 s). Add 6–23 s if you also bake AO.
2. **All three Blender engines work.**
   - Cycles CPU: a 512² hero render takes **4–6 s** at 16 spp + OIDN. 1024² takes 25–27 s at
     32 spp and 73–76 s at 128 spp. An 8-frame 512² turntable at 32 spp takes 48–56 s.
   - EEVEE (Next): works through Mesa **llvmpipe via EGL** (apt `libegl1 libegl-mesa0 libgl1-mesa-dri libgbm1`).
     Each render costs ~1.8 s minimum, even at 48 px.
   - Workbench: 0.01–1.4 s.
   - Freestyle lines: about +1 s on Cycles 512².
3. **For pixel sprites, use Cycles at 1 sample with emission-only toon materials, not EEVEE.**
   That takes **0.05–0.12 s per frame**, against 1.8–3.5 s for EEVEE. The output is
   pixel-identical (0.1% of pixels differ). That makes 8-direction × 12-frame sheets take
   seconds instead of minutes [run].
4. **Retopology is the fragile step.**
   - QuadriFlow refuses almost every voxel-remesh output. The cause is sliver edges shorter than
     1e-4 *per axis* (read from `object_remesh.cc`). Fix: scale the mesh data ×100, run
     QuadriFlow, scale back [run].
   - QuadriFlow needs one watertight shell. On Skin-modifier output, which is non-manifold at
     branch points, the voxel result is fragmented and QuadriFlow **ballooned to 13 GB and was
     OOM-killed**.
   - Rule: build the blockout from metaballs or SDF and check it is watertight. Always run
     QuadriFlow under `ulimit -v` and check the output bounding box.
5. **Use numpy `foreach_get/foreach_set` for any per-vertex or per-loop work.** A Python loop
   writing colour zones on a 137k-tri mesh did not finish in **5 minutes**. Vectorised, it takes
   **~0.1 s** [run].
6. **Bakes are cheap except AO and lit bakes.** At 1024², normal 0.8 s, albedo 1.0 s,
   AO (64 spp) 23 s, lit COMBINED (32 spp) 23 s. At 512² they are about 4× faster.
   Pitfall: a DIFFUSE colour bake turns off the direct/indirect pass toggles, and a following
   COMBINED bake then comes out **pure black** [run].
7. **Animated glTF works.** One NLA track per clip, with the same track name on the armature and
   on the shape keys, gives one clip with TRS + `weights` channels. Use
   `export_animation_mode='NLA_TRACKS'`. Export takes 0.2 s.
   Pitfall: automatic (heat) weights do not bind separate islands such as eyes, horn and glints.
   The eyes **floated off the head** during the hop until every small island was rebound 100% to
   `head` [run].
8. **Compression** (creature: 5.8k tris, 14 joints, 2 clips, 1 morph):
   - Raw: 325 KB (167 KB gzipped).
   - Meshopt: **78 KB** (48 KB gzipped).
   - gltfpack `-cc`: **62.5 KB** (43 KB gzipped) in 0.01 s.
   - Draco: 165 KB, because it does not compress animation.

   For textures (2 × 1024² PNG, 1.4 MB):
   - WebP: **168–193 KB**.
   - KTX2 ETC1S: 384 KB.
   - KTX2 UASTC normal: about 1.1 MB in total. At `--level 4` (glTF-Transform `optimize`'s
     default) the UASTC encode took **110 s**. `--level 2` took 3.8 s.
   - `optimize` with the default `--texture-compress auto` made the PNGs *bigger* (1.4 → 1.56 MB).
   - Debian's gltfpack has **no BasisU**, so `-tc` fails.
9. **Every variant loaded in three r180 with no errors**: Draco, Meshopt (glTF-Transform
   writes `EXT_meshopt_compression`, which r180 supports), KTX2 with basisu, WebP, and skinned +
   morph + clips. Load times on SwiftShader: 16–104 ms, or 290–380 ms when KTX2 has to transcode
   [run].
10. **The sprite comparison says the renderer is not the bottleneck.**
    - At the game's sprite scale (30–60 internal px), a Blender toon render looks no better than
      the game's live three.js sprite bake. Both are "toon bake + outline".
    - What Blender adds is better *shapes*: metaball/voxel/QuadriFlow organics, baked surface
      detail, real rigs. It also adds offline cleanup: 4× supersampled **dominant-colour
      downsample**, temporal hysteresis, and OKLab palette lock. Against a native-res render,
      that cut colours per frame from 95 to 34 (16 with a palette) and frame-to-frame pixel
      churn by ~27% relative [run].
11. **Tools that do NOT work here.**
    - Sculpt brush strokes (poll fails headless; earlier notes report a segfault).
    - The Remesh *modifier* on non-manifold input (keeps one fragment: 606 of 35k verts).
    - gltfpack texture compression.
    - Fetching anything from blender.org, polyhaven, ambientCG or kenney.
    - Grease-Pencil Line Art only partly works: it generates 79 strokes, but the default radius is
      0.0025 *world units* and coverage was spotty.

---

## 1. Environment (verified)

| Item | Status | Notes / command |
|---|---|---|
| Blender | `bpy` **5.2.2** pip wheel, CPython 3.13 venv (1.3 GB) | `python3.13 -m venv bpyenv && bpyenv/bin/pip install bpy==5.2.2`. Behaves like `blender -b --factory-startup` |
| Cycles CPU | ✅ | OIDN denoiser present (`sc.cycles.denoiser='OPENIMAGEDENOISE'`. The enum is dynamic, so the static `enum_items` list is empty: set it directly). `WARNING CUEW initialization failed` is harmless (no CUDA) |
| EEVEE (Next) / Workbench | ✅ with Mesa EGL | `apt-get install -y --no-install-recommends libegl1 libegl-mesa0 libgl1-mesa-dri libgbm1` (llvmpipe). Prints harmless `EGL_BAD_MATCH` lines |
| Draco/Meshopt inside Blender's exporter | ❌ | `libbf_intern_{draco,meshopt}_bridge.so` missing from the wheel → export raw, compress with Node tools |
| glTF-Transform | ✅ 4.5.1 (`npm i @gltf-transform/cli@4`) | `ktx` from KTX-Software 4.4.2 GitHub release tarball needed for etc1s/uastc |
| gltfpack | ✅ 0.20 (apt) | built **without BasisU** → `-tc` fails |
| pynanoinstantmeshes 0.0.3, pymeshlab 2025.7, xatlas 0.0.11 | ✅ pip into the bpy venv | pymeshlab plugins need `apt-get install libopengl0` |
| Playwright 1.56.1 + Chromium | ✅ game's `node_modules`, browsers in `/opt/pw-browsers` | renderer string: `ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)` |
| three | r180 (`0.180.0`) in game | DRACO decoder `examples/jsm/libs/draco/gltf/`, basis transcoder `libs/basis/`, `libs/meshopt_decoder.module.js` |
| Image tools | ImageMagick, Pillow 12.3 + numpy 2.5 (system python3), pngquant 2.18, vips 8.15, gmic, potrace, inkscape 1.2, gimp 2.10 (another agent installed them via apt) | krita was not installed (its apt run was interrupted; I ran `dpkg --configure -a`) |
| apt | ✅ works (root) | another agent's krita/gimp install left dpkg half-configured; `dpkg --configure -a` repaired it |

Setup script: `lab/00_env.sh`.

---

## 2. Modelling with bpy (lab/01_modeling_ops.py, lab/retopo_lab.py) [run]

### 2.1 Operation timings (quiet-ish, each includes evaluating and applying the modifier)

| Operation | Time | Result |
|---|---|---|
| bmesh: icosphere → `extrude_discrete_faces` spikes → `inset_region` → `bevel` | 0.05 s | 7.4k tris |
| Bevel modifier (3 seg, angle limit, harden normals) + Weighted Normal | 0.005 s | hard-surface ready |
| Subsurf L3 on cube | 0.004 s | |
| Boolean **EXACT**, cube minus 3 × 48-seg cylinders | 0.67 s | 980 tris |
| Boolean **FLOAT** (formerly FAST) | 0.08 s | 1.2k tris |
| Boolean **MANIFOLD** (new solver in 5.x) | **0.05 s** | 818 tris, clean. Solvers list: `['FLOAT','EXACT','MANIFOLD']` |
| Skin modifier (15-vertex quadruped skeleton) + Subsurf L2 | 0.02 s | 2.8k tris, but **32 non-manifold edges** at branch joints |
| Remesh **modifier** VOXEL 0.02 on that skin mesh | 0.07 s | **606 verts: wrong** (default `use_remove_disconnected=True` kept one fragment) |
| `bpy.ops.object.voxel_remesh()` 0.02 on the same | 0.11 s | 70k tris, but fragmented and noisy (non-manifold input confuses inside/outside) |
| Decimate collapse 0.1 | 1.6 s on 70k | triangle soup |
| Displace ×2 (Voronoi + Clouds) + decimate on an ico-6 rock | 0.37 s | faceted rock |
| GN: grid → Distribute Points (Poisson) → Instance on Points (random scale) → Realize | 0.016 s | 6k tris |
| GN: Points → **Points to SDF Grid** → **SDF Grid Fillet** → **Grid to Mesh** (threshold 0!) | 0.13 s | 49k-tri smooth blob |
| GN node inventory | | **274** GeometryNode types, **41** grid/SDF/volume nodes (MeshToSDFGrid, SDFGridBoolean/Fillet/Offset/Mean/Laplacian, GridToMesh, FieldToGrid, GridAdvect…) |
| Metaball → mesh | 0.01 s | watertight by construction |
| Metaball → voxel 0.02 → QuadriFlow 2000 (prescale trick) | 1.5 s | 3.9k tris of clean quads |
| Curve (bevel + taper radius) → mesh (horn) | 0.004 s | |
| Multires subdivide ×2 | 0.3 s | 15.9k tris |
| Sculpt `brush_stroke` | ❌ | `poll()` is False without a window (earlier notes: forcing a context override segfaults) |
| UV smart_project 66° + pack_islands | 0.2 s on 3.9k tris; 2.5 s on 5.8k quads | |

Contact sheet: `lab/out/01_ops_sheet.png`.

### 2.2 Failure modes found, with fixes

**(a) QuadriFlow refuses voxel output.** Warning: "The mesh needs to be manifold and have face
normals that point in a consistent direction". `bpy.ops` returns `{'CANCELLED'}` and does
**not raise**, so `try/except` around it never fires.
- Source: `mesh_is_manifold_consistent()` in
  [`object_remesh.cc`](https://github.com/blender/blender/blob/main/source/blender/editors/object/object_remesh.cc)
  (lines ~681–737). It rejects any edge with more than 2 faces, any flipped winding, any wire
  edge, and **any edge whose endpoints are within 1e-4 per component**
  (`compare_v3v3(a, b, 1e-4f)`). The threshold is absolute, in object space.
- OpenVDB's voxel remesher nearly always leaves a few such slivers: 4 on a voxelised sphere, 13
  on the creature.
- What did not work: merge-by-distance (it creates over-2-face edges: 188), dissolve_degenerate
  (non-manifold), and smoothing.
- **Fix** (`lab/qf_robust.py`):

```python
def quadriflow(obj, target_faces=2000, prescale=100.0, **kw):
    obj.data.transform(Matrix.Scale(prescale, 4))           # slivers become >1e-4 -> check passes
    bpy.context.view_layer.objects.active = obj
    kw.setdefault('use_mesh_symmetry', False); kw.setdefault('seed', 0)
    res = bpy.ops.object.quadriflow_remesh(target_faces=target_faces, **kw)
    obj.data.transform(Matrix.Scale(1.0 / prescale, 4))
    obj.data.update(); bpy.context.view_layer.update()      # else obj.dimensions stays stale
    if 'FINISHED' not in res: raise RuntimeError(res)       # ops CANCEL silently
```

**(b) QuadriFlow can explode in memory.** On the fragmented voxel mesh from the Skin modifier,
the process grew to **13.3 GB RSS** and the cgroup OOM killer took it. On the same mesh with a
different object scale it ran in 4.8 s. Under `ulimit -v 8000000` it aborts cleanly instead.
At target 1000 faces, one run produced a spike (bounding box 2.86 vs 1.76 wide).
- Rules: run QuadriFlow in a subprocess with `ulimit -v` and `timeout`, only on a single
  watertight shell, and assert that the output bounding box ≈ the input bounding box.

**(c) The Skin modifier is not a creature-blockout tool for voxel or retopo pipelines.** Its
output has non-manifold branch joints. **Metaballs** (including ELLIPSOID/CAPSULE elements and
chains of shrinking balls for ears and tails) or **GN SDF** (Points/Mesh → SDF Grid →
Boolean/Fillet → Grid to Mesh) are watertight by construction. That made `lab/lab_creature.py`
reliable: metaball → voxel 0.012 → 137k-tri high poly in **0.6 s**.

**(d) Retopology alternatives** on the same watertight high poly (`lab/retopo_lab.py`,
`out/01_retopo_compare.png`):

| Tool (licence) | Time | Result |
|---|---|---|
| QuadriFlow (Blender built-in, prescale trick) | 1.7 s | 1,841 quads, 0 boundary edges, clean flow ← **default for creatures** |
| Instant Meshes via `pynanoinstantmeshes` (BSD; `remesh(V, F, -1, face_count=2000, deterministic=True)`) | 0.5 s | 8,177 quads: face_count is not honoured when the input is coarse (it subdivides first). **18 boundary edges** (holes) |
| MeshLab quadric edge collapse via `pymeshlab` (GPL) | 1.1 s | 2,500 tris, manifold, good shape preservation ← best decimator for static props |
| Blender Decimate collapse | 1.05 s | 2,406 tris (94 quads), manifold |
| MeshLab isotropic explicit remeshing (2.5%) | 19.5 s | 56k tris: too dense, too slow |

**(e) bpy per-element Python access is slow.** Colour zones written in a per-loop Python loop
on 137k tris did not finish in 5 minutes (faulthandler traceback: inside the `zone()` loop).
The vectorised version takes 0.1 s:

```python
co = np.empty(nv*3, np.float32); me.vertices.foreach_get('co', co)
nrm = np.empty(nv*3, np.float32); me.vertex_normals.foreach_get('vector', nrm)
lv = np.empty(nl, np.int32); me.loops.foreach_get('vertex_index', lv)
c, n = co.reshape(-1,3)[lv], nrm.reshape(-1,3)[lv]       # per-corner position/normal
out = ...masks -> RGBA per corner...
col.data.foreach_set('color_srgb', out.ravel())           # BYTE_COLOR CORNER attribute
```

**(f) Diagnostics that paid off.**
- `faulthandler.dump_traceback_later(40, exit=True)` shows where a silent bpy script is stuck.
- `bmesh` `e.is_manifold` / `e.is_boundary` counts catch broken meshes before export.
- The `qf_check.py` mirror of QuadriFlow's check: the first version tested Euclidean distance and
  missed the per-component test, which shows how easy it is to mis-mirror a C check.

---

## 3. Rendering engines (lab/02_render_bench.py) [run]

Scene: LabKin (5.8k tris, vertex colours, Principled), displaced rock pedestal, ground disc,
3 area lights, world colour. AgX view. Cycles: adaptive sampling, OIDN, max bounces 4, 4 threads.

| Test | First run (more contention; `out/02_render_bench_loaded.json`) | Rerun, less contention (`out/02_quick.log`) |
|---|---|---|
| Cycles 512², 16 spp + OIDN | 5.6 s | **4.2 s** |
| Cycles 512², 32 spp + OIDN | 8.1 s | |
| Cycles 512², 64 spp + OIDN | 13.9 s | 10.9 s |
| Cycles 512², 128 spp + OIDN | 24.8 s | |
| Cycles 512², 64 spp, no denoise | 9.8 s (noisy) | 8.9 s |
| Cycles 1024², 32 / 64 / 128 spp + OIDN | 27.1 / 46.0 / 76.4 s | 25.3 / – / 73.1 s |
| Turntable 8 frames, 512², 32 spp | 56 s (7.0 s/frame); `use_persistent_data=True` 55 s | 50.6 s (6.3 s/frame); persistent 47.8 s (6.0): **~5% gain** on a small scene |
| Cycles 512², 32 spp **+ Freestyle** (silhouette, border, crease, 2 px ABSOLUTE) | 9.2 s (**~+1 s**) | 8.3 s |
| Workbench 512² / 1024² (studio light, cavity, shadows, outline, AA 8) | **1.2 / 1.4 s** | 0.8 / 1.4 s |
| EEVEE 512², 16 TAA samples (1st / 2nd render) | 6.5 / 9.4 s | 5.7 / 8.9 s |
| EEVEE 512², 64 samples | 32.6 s | |
| EEVEE 1024², 16 samples | 16.9 s | |

Sheet: `lab/out/02_engines_sheet.png`.

Observations:
- 16 spp + OIDN is already clean for a turntable preview at 512². Use 64–128 spp only for final
  marketing shots.
- **EEVEE on llvmpipe is slower than Cycles CPU** at comparable quality. It is worth using only
  for EEVEE-specific looks (Shader-to-RGB toon). Otherwise use Cycles (beauty), Workbench
  (review sheets: 0.01–1.4 s) or Cycles 1-spp emission (sprites, §8).
- Colour management: the AgX view plus strong area lights washed the rust creature to salmon
  pink. For assets headed to three.js, review with `view_transform='Standard'`, or apply the
  same tone mapper as the game. In three.js, `NeutralToneMapping` kept the colours; AgX
  desaturated them [run, §7].
- Freestyle on a factory-empty file needs `lineset.linestyle = bpy.data.linestyles.new(...)`.
  `render.line_thickness_mode='ABSOLUTE'`.
- **Grease Pencil Line Art** (`bpy.ops.object.grease_pencil_add(type='LINEART_SCENE')`,
  `lab/09_lineart.py`) evaluates headless: 79 strokes. GPv3 replaced `thickness` with
  **`radius` in world units**, default 0.0025 = sub-pixel here
  ([GPv3 radius PR #113770](https://projects.blender.org/blender/blender/pulls/113770)). At
  `radius=0.012` lines appear in Workbench/EEVEE but only partly on the creature. **Freestyle was
  the reliable line renderer.** (Low effort spent here; medium confidence.)

---

## 4. Texture baking by script (lab/03_bake.py) [run]

High = LabKin voxel high poly (137k tris) plus a Voronoi displacement (0.012) as "surface
detail". Low = QuadriFlow 5.8k tris. UV: `smart_project(66°, margin 0.003)` +
`pack_islands(margin 0.004, rotate=True)`. Bake margin 8 px EXTEND, cage extrusion 0.03,
max ray distance 0.08.

| Step | 512² | 1024² |
|---|---|---|
| Build high + low (metaball → voxel → QuadriFlow) | 4.7 s | 5.4 s |
| UV unwrap + pack | 2.5 s | 2.5 s |
| NORMAL (tangent, selected→active) | 0.3 s | 0.8 s |
| AO (selected→active, 64 spp) | 5.7 s | 23.2 s |
| DIFFUSE colour (vertex colours → texture, `pass_filter={'COLOR'}`) | 0.25 s | 1.0 s |
| COMBINED "lit" (2 area lights + world, 32 spp) | 5.6 s | 22.8 s |

Maps: `lab/out/03_bakes_sheet.png`. The normal map shows the Voronoi "scales". Albedo
carries the colour zones.

Recipe essentials:
- The target image must be the **active, selected Image Texture node** in the low's material.
- Select high, then low (active); `use_selected_to_active=True`.
- Non-colour maps get `colorspace_settings.name='Non-Color'`.
- Save with `img.filepath_raw = ...; img.file_format='PNG'; img.save()`.
- Wire the maps back (Image → Normal Map node → BSDF Normal) so the glTF exporter writes
  `normalTexture`. Verified in the GLB; `lab/glbinfo.py` prints material slots.

Pitfalls [run]:
- **COMBINED bake came out pure black.** The preceding DIFFUSE colour bake had set
  `bake.use_pass_direct = use_pass_indirect = False`, and COMBINED obeys the same toggles. Reset
  them before every bake.
- For a "lit" (light-baked) map, hide the high poly from render, or it shadows the low.
- AO and COMBINED dominate bake time and scale with pixels × spp. Bake AO at 512² × 32 spp and
  denoise it (OIDN via compositor, per `asset-pipeline.md` §4.3), or skip it: at sprite scale a
  baked AO contributes almost nothing.

---

## 5. Rig, animate, export GLB (lab/04_rig_anim_export.py) [run]

| Step | Time |
|---|---|
| Armature by script: 14 bones (root non-deform, hips, chest, head, ears, 4 legs, 3 tail) | < 0.1 s |
| `parent_set(type='ARMATURE_AUTO')` (bone heat) on 2.9k verts | 0.12 s |
| `vertex_group_limit_total(limit=4)` + `vertex_group_normalize_all` | 0.07 s (58 weights limited) |
| Shape key "Squash" (vertex transform) | 0.01 s |
| 2 actions keyed + 1 shape-key action, pushed to NLA | < 0.01 s |
| `export_scene.gltf(... export_animation_mode='NLA_TRACKS' ...)` | **0.22–0.26 s**, 325 KB |

Result (`lab/glbinfo.py out/04_labkin_anim.glb`):
- `COLOR_0, JOINTS_0, NORMAL, POSITION, TEXCOORD_0, WEIGHTS_0`, 1 morph target with
  `targetNames ['Squash']`, skin with 14 joints.
- Animations: `Idle` 2.04 s (13 nodes × T/R/S) and `Hop` 1.04 s (+1 `weights` channel: the
  shape-key track merged because it has the same NLA track name).

Export-mode semantics (primary source: glTF-Blender-IO
[`__init__.py`](https://github.com/KhronosGroup/glTF-Blender-IO/blob/main/addons/io_scene_gltf2/__init__.py)):
`ACTIONS` (default: active + NLA actions as separate animations), `ACTIVE_ACTIONS` (merged),
`BROADCAST`, `NLA_TRACKS` (one animation per NLA track), `SCENE` (baked).

Pitfalls [run]:
- **Detached eyes.** Bone heat weights only the connected surface. Separate islands (eyes,
  glints, horn) took weights from whatever bone was nearest; during `Hop` the eyes stayed behind
  while the head turned (`out/07` first run). Fix: flood-fill islands with bmesh, keep the
  largest, remove the rest from all groups, and add them to `head` at weight 1.0 (496 verts
  rebound). Alternative: give rigid parts their own vertex group before joining.
- **NLA tracks in Blender are all active at once.** When rendering a clip *inside Blender* (for
  sprites), solo the track (`track.is_solo=True`) or mute the others. Otherwise `Idle` and `Hop`
  blend: the ear in `out/08/flicker/ss4_01.png` shows it. The glTF export is unaffected.
- `doubleSided: true` is exported unless `material.use_backface_culling=True`. Vertex colours
  export as `COLOR_0` only when the material uses them (`export_vertex_color='MATERIAL'`).
- Blender 5.x prints `DeprecationWarning: Material.use_nodes ... removed in Blender 6.0`. Nodes
  are always on now, so drop `use_nodes=True` in new scripts.
- An `export_def_bones=False` root bone stays as a joint (14 joints). With `True`, a non-deform
  root vanishes (per `asset-pipeline.md`).

---

## 6. Compression matrix (lab/06_compress.sh → lab/out/06_compress.md) [run]

| Variant | KB | KB gz | Time | Extensions |
|---|---|---|---|---|
| TEX raw Blender export (albedo + normal PNG 1024²) | 1395 | 1338 | – | – |
| `optimize` defaults (meshopt, `--texture-compress auto`) | **1565 (bigger!)** | 1553 | 0.8 s | EXT_meshopt_compression, KHR_mesh_quantization |
| `optimize --compress draco --texture-compress webp` | **168** | 167 | 1.1 s | EXT_texture_webp, KHR_draco_mesh_compression |
| `optimize --compress meshopt --texture-compress webp` | 193 | 185 | 1.0 s | EXT_meshopt_compression, EXT_texture_webp, KHR_mesh_quantization |
| `optimize --texture-compress ktx2` (UASTC L4+RDO normal, ETC1S q255 colour) | 1086 | 1077 | **109 s** | + KHR_texture_basisu |
| `uastc --slots normalTexture --level 2` + `etc1s --slots baseColorTexture` | 1179 | 1122 | **3.8 s** | KHR_texture_basisu |
| `etc1s` (all slots) | 384 | 327 | 1.7 s | KHR_texture_basisu |
| `uastc --zstd 18` (all slots) | 1340 | 1283 | 2.7 s | KHR_texture_basisu |
| gltfpack `-cc` | 1271 | 1264 | 0.02 s | (textures untouched) |
| gltfpack `-cc -tc` | **FAIL**: "gltfpack was built without BasisU support" | | | |
| ANIM raw (skin + morph + 2 clips, vertex colours) | 325 | 167 | – | – |
| ANIM `optimize` defaults (simplify on, error 1e-4) | 77.8 | 47.8 | 0.7 s | meshopt + quantization (no visible simplification at 1e-4) |
| ANIM `draco` | 165 | 120 | 0.7 s | Draco compresses geometry only, not animation or morphs |
| ANIM `meshopt --level high` | 78.7 | 48.5 | 0.7 s | EXT_meshopt_compression |
| ANIM `quantize` only | 203 | 105 | 0.6 s | KHR_mesh_quantization |
| ANIM gltfpack `-cc` | **62.5** | **43.4** | **0.01 s** | KHR_mesh_quantization, EXT_meshopt_compression; also **drops constant tracks** (39 → 12 tracks per clip) |

What `optimize --texture-compress ktx2` does (read from `@gltf-transform/cli/dist/cli.mjs` 4.5.1):
`toktx({mode: UASTC, slots: /normalTexture|occlusionTexture|metallicRoughnessTexture/, level: 4, rdo: true, rdoLambda: 4})`
then `toktx({mode: ETC1S, quality: 255})` for the rest. UASTC level 4 is what costs 109 s.
For iteration, run the two commands yourself with `--level 2`.

Recommendations for Orbkin:
- Animated creatures: **gltfpack `-cc`** (smallest, instant, prunes constant tracks) or
  glTF-Transform `meshopt`. Both write `EXT_meshopt_compression`, which r180 reads (not
  `KHR_meshopt_compression`: r183+).
- Never Draco for animated assets.
- Textures: **WebP** for transfer size (8× smaller than PNG here). Use KTX2 ETC1S only when VRAM
  matters (many large maps). Keep Orbkin's pixel-art tiles as PNG with nearest filtering:
  ETC1S destroys exact palettes, per `asset-pipeline.md` §8.4.
- Normal maps are not worth shipping for 30–90 px sprites. Bake the detail into albedo/lit
  instead (§8).

---

## 7. Three.js r180 + Playwright check (lab/web/viewer.html, lab/07_shoot.mjs) [run]

- Static page with an import map that points `three` at the **game's own**
  `node_modules/three` (symlinked into `lab/web/`), so the test runs against exactly r180.
- GLTFLoader + DRACOLoader + KTX2Loader + MeshoptDecoder. Modes: `pbr` (RoomEnvironment PMREM,
  Neutral tone mapping), `toon` (MeshToonMaterial + 3-texel NearestFilter gradient),
  `sprite` (render to an H-px render target + 4-neighbour alpha outline + nearest upscale:
  emulates the game's SpriteBaker).
- Deterministic pose via `mixer.setTime(t)`. Report in `window.__report`: load ms, extensions,
  clips, tris, skinned, morphs, draw calls, `UNMASKED_RENDERER_WEBGL`.
- Node script: own `http` static server, `chromium.launch({args: ['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']})`,
  `page.waitForFunction(() => window.__report.ready)`, then screenshot.

| Shot | Load (ms) | Notes |
|---|---|---|
| raw textured PBR | 104 | 5,790 tris, 1 draw |
| Draco + WebP | 95 | |
| Meshopt + WebP | 61 | |
| KTX2 (UASTC + ETC1S) | 378 | basis transcode in WASM |
| ETC1S only | 288 | |
| gltfpack `-cc` | 96 | |
| anim raw / meshopt / gltfpack (Hop @ 0.42 s) | 25 / 18 / 16 | skinned 1, morphs 1, clips Idle + Hop |
| toon, sprite96, sprite64 | 16–17 | |

The full 12-shot run takes 25 s wall time, including browser start. Sheet:
`lab/out/07_threejs_sheet.png`.

Pitfalls [run]:
- Compositing a render target in a raw `ShaderMaterial` skips output colour conversion. The
  sprite came out darker than the toon render. Either include `<colorspace_fragment>`, or set the
  render target's texture colour space and let three convert.
- Verify the renderer string. Microlink and others report that WebGL can silently fall back
  ([microlink](https://microlink.io/blog/webgl-without-a-gpu)). Here it is SwiftShader/Vulkan via
  ANGLE ([Chromium SwiftShader doc](https://chromium.googlesource.com/chromium/src/+/798e59c5275d4131797e8ea2e96e6c6000256b58/docs/gpu/swiftshader.md)).
- `vite build --outDir <scratch>` (8 s) builds the game into scratch without touching the repo.
  `lab/08_game_capture.mjs` then screenshots `?scene=battle&...&gfx=hd2d` for side-by-side
  comparisons.

---

## 8. Pixel-art sprites rendered by Blender vs the game's current sprite bake [run]

### 8.1 Method (lab/08_sprite_render.py + lab/08_sprite_post.py)

- Subject: the rigged LabKin, Idle frame 13.
- Camera: orthographic, 30° elevation, 35° yaw, framed to the posed vertices.
- Target heights 48 px (≈ game scale) and 96 px.

Variants:
- **A**: emission **toon** material at native res, no supersampling. The material is
  half-Lambert `N·L` → constant 4-stop ramp (cool purple shadow → neutral → lit → warm
  highlight) × vertex colour. EEVEE `taa_render_samples=1`, `filter_size=0`, `Standard` view,
  transparent film.
- **B**: the same at **4× res**, then **dominant-colour (mode) downsample**. Each output pixel
  takes the most common opaque colour of its 4×4 block, and is opaque if coverage ≥ 50%.
- **C**: Cycles beauty (3 area lights, 32 spp + OIDN) at 4×, area-average downsample.
- **D**: C quantised to a 14-colour palette, k-means in **OKLab**, nearest-colour in OKLab.
- **E**: Workbench native, AA off.
- All get a 1 px outer outline from alpha dilation. A "selout" variant darkens the outermost
  opaque pixels instead.

Technique sources:
- [pseudo-pixel](https://github.com/craigrusselltiu/pseudo-pixel) (MIT, Blender 5.2, *driven by
  Claude Code*). Its `pp/sprite.py` and `pp/post.py` do half-Lambert + Bayer offset + CONSTANT
  ramp with hue-shifted tones, EEVEE 1 sample, `filter_size=0`, supersample 4, dominant-colour
  downsample with a "keep previous colour if ≥ 25% of block" hysteresis, OKLab palette
  quantisation, and outlines from object-ID/depth passes.
- Dead Cells' 3D → 2D pipeline: low-res render, no anti-aliasing, toon shading, normal-map
  export ([Game Developer deep dive](https://www.gamedeveloper.com/production/art-design-deep-dive-using-a-3d-pipeline-for-2d-animation-in-i-dead-cells-i-),
  via search summary; the site was unreachable from here).

### 8.2 Results

| Variant | Colours in sprite (48 px / 96 px) | Look |
|---|---|---|
| A toon native | 107 / 287 | crisp but noisy single-pixel speckle on gradients |
| **B toon SS4 mode-down** | **37 / 176** | clean flat clusters: closest to hand-pixelled |
| C Cycles box-down | 661 / 2280 | "shrunken render": soft, muddy, not pixel art |
| D C + 14-col OKLab palette | 15 / 15 | better, but edges still read as resampled |
| E Workbench native | 594 / 1879 | dull, low contrast |

Sheet with the game's live sprites (Ashkit, Breezel, captured at 1280×720 and decimated to
internal px): `lab/out/08_sprite_compare.png`.

Render cost per frame:

| Engine | 48 px | 192 px (SS4 of 48) | 384 px (SS4 of 96) |
|---|---|---|---|
| EEVEE (llvmpipe) | 1.8–4.0 s (fixed overhead) | 1.9 s | 1.8–3.5 s |
| **Cycles, 1 spp, emission-only toon, `max_bounces=0`, persistent data** | **0.05–0.12 s** | **0.05–0.06 s** | **0.08 s** |
| Workbench | 0.01–0.08 s | | |

Cycles-1spp vs EEVEE on the same toon material: **0.1%** of pixels differ (`lab/08_sprite_cycles1.py`).

Temporal stability over 12 consecutive Idle frames at 48 px (`lab/08_sprite_flicker.py`):

| Pipeline | Changed pixels/frame | Colours/frame |
|---|---|---|
| native | 54.3% | 95 |
| SS4 mode-down | 47.3% | 34 |
| SS4 mode-down + hysteresis (keep ≥ 25%) | 42.5% | 34 |
| native + 16-colour palette lock | 46.4% | 16 |
| SS4 + hysteresis + palette lock | **39.4%** | 16 |

Most of the remaining churn is real motion: chest, head and tail rotate. Confidence that the
cleanup helps: medium-high. The exact percentages depend on the clip.

### 8.3 Verdict

At the game's sprite size, the Blender render does **not** beat the game's live bake on its
own. The game's Ashkit is an outlined toon sprite with a 4–5-tone hue-shifted ramp, the same
idea. Quality differences at that size come from:
1. silhouette and proportions (the model);
2. colour design (ramps, hue shift, accent colours, eyes);
3. pixel cleanup (supersampled mode-downsample, palette lock, selective outline).

Blender helps most with (1): smooth organic forms, real rigs, baked detail. With an offline
sheet pipeline it also helps with (3). The game's real-time bake can adopt (3) in a shader:
render the sprite target at 2–4× and resolve by majority vote (§11).

---

## 9. What fails or is limited here (consolidated)

| Thing | Status | Workaround |
|---|---|---|
| Sculpt brush strokes | ❌ headless | displacement or multires + textures, SDF/GN, metaballs |
| Remesh **modifier** on non-manifold input | silently keeps 1 fragment | use the `voxel_remesh` op on a watertight mesh |
| QuadriFlow on voxel output | silently CANCELLED (slivers) | prescale ×100 (`qf_robust.py`) |
| QuadriFlow on fragmented or multi-shell input | **13 GB, OOM-killed** | watertight input; `ulimit -v`; bounding-box check |
| Instant Meshes `face_count` | not honoured on coarse input; leaves holes | QuadriFlow, or MeshLab for static props |
| Draco/Meshopt inside Blender's glTF exporter | libraries missing in the wheel | glTF-Transform / gltfpack afterwards |
| gltfpack `-tc` (KTX2) | Debian build lacks BasisU | glTF-Transform `etc1s`/`uastc` + KTX-Software |
| `optimize --texture-compress auto` on PNG | grew the file 12% | choose `webp` or `false` explicitly |
| UASTC level 4 | 110 s for one 1024² map | `--level 2` (3.8 s) |
| EEVEE per-render overhead | ≥ 1.8 s even at 48 px | Cycles 1-spp emission for sprites, Workbench for review sheets |
| Line Art (GPv3) | partial, radius in world units | Freestyle (ABSOLUTE px) |
| Asset sites (polyhaven, ambientCG, kenney, blender.org) | blocked by proxy | GitHub release downloads, npm, PyPI work; generate procedurally |
| CPU contention | 4 cores shared with other agents | log load average; rerun timings when quiet |

---

## 10. Script index (scratchpad/research/lab/)

`BPY=scratchpad/bpyenv/bin/python`. Run everything from the `lab/` directory.

| File | What | Command |
|---|---|---|
| `00_env.sh` | reproducible setup (bpy wheel, mesa EGL, pip retopo libs, glTF-Transform, gltfpack, KTX) | `bash 00_env.sh` |
| `01_modeling_ops.py` | 20 modelling-op tests, timings JSON, Workbench sheet | `$BPY 01_modeling_ops.py` |
| `qf_check.py` / `qf_robust.py` | QuadriFlow precondition mirror; robust wrapper (prescale) | imported |
| `retopo_lab.py` | QuadriFlow vs Instant Meshes vs MeshLab vs Decimate | `$BPY retopo_lab.py` |
| `lab_creature.py` | original test creature: metaball → voxel → QuadriFlow, numpy colour zones, eyes/horn, Principled + `Col` | `$BPY lab_creature.py game` → `out/labkin.blend` |
| `quicklook.py` | 4-view Workbench contact sheet of any .blend | `$BPY quicklook.py in.blend out.png` |
| `02_render_bench.py` | Cycles/EEVEE/Workbench/Freestyle timings and images (`out/02_render_bench_loaded.json` = full run, `out/02_render_bench.json` = quick rerun) | `$BPY 02_render_bench.py [quick]` |
| `03_bake.py` | normal/AO/albedo/lit bakes high→low + material rewire | `$BPY 03_bake.py 512\|1024` |
| `04_rig_anim_export.py` | armature, auto weights, island rebind, shape key, 2 clips via NLA, GLB | `$BPY 04_rig_anim_export.py` |
| `05_export_textured.py` | baked creature → textured GLB | `$BPY 05_export_textured.py` |
| `glbinfo.py` | dependency-free GLB JSON summary (attrs, morphs, skins, clips, materials, images) | `python3 glbinfo.py x.glb` |
| `06_compress.sh` | glTF-Transform / gltfpack / KTX matrix → markdown table | `bash 06_compress.sh` |
| `web/viewer.html` + `07_shoot.mjs` | three r180 viewer (pbr/toon/sprite) + Playwright SwiftShader screenshots + JSON report | `node 07_shoot.mjs` |
| `08_game_capture.mjs` | screenshot the current game (scratch `vite build --outDir lab/gamebuild`) | `node 08_game_capture.mjs` |
| `08_sprite_render.py` / `08_sprite_post.py` | Blender sprite variants + numpy pixel post (mode-down, OKLab k-means/quantise, outline/selout) + comparison sheet | `$BPY 08_sprite_render.py && python3 08_sprite_post.py` |
| `08_sprite_flicker_render.py` / `08_sprite_flicker.py` | 12-frame temporal-stability test | as named |
| `08_sprite_cycles1.py` | Cycles 1-spp emission toon vs EEVEE timing and equality | `$BPY 08_sprite_cycles1.py` |
| `09_lineart.py` | GPv3 Line Art headless test | `$BPY 09_lineart.py` |

Key outputs: `out/01_ops_sheet.png`, `out/01_retopo_compare.png`, `out/labkin_look.png`,
`out/02_engines_sheet.png`, `out/03_bakes_sheet.png`, `out/04_labkin_anim.glb`,
`out/06/*.glb`, `out/06_compress.md`, `out/07_threejs_sheet.png`, `out/07/report.json`,
`out/08_sprite_compare.png`, `out/08/game_wild_meadow.png`, `out/09_lineart_sheet.png`.

---

## 11. Implications for Orbkin

Prioritised. Each item is grounded in a measurement above.

1. **Adopt Blender (bpy) as the asset authoring tool for anything organic or detailed.** Use it
   for creatures, trainers, rocks, props and set pieces. Keep code-generated geometry only for
   tiling terrain and tiles.
   - It is practical here: an end-to-end creature → compressed GLB takes ~15 s, the scripts are
     reproducible, and nothing costs money.
   - Recommended creature recipe:
     - **metaball/SDF blockout** (watertight) → voxel 0.012 → **QuadriFlow via `qf_robust`**
       (2–3k quads; subprocess + ulimit + bounding-box check);
     - numpy colour zones or baked albedo;
     - auto weights + **island rebind**;
     - NLA clips;
     - GLB → gltfpack `-cc`.
   - Budget: ≤ 2,500 tris per creature (CLAUDE/CREATURES rules). QuadriFlow at 1,200–1,300 target
     faces gives ~2.5k tris.
2. **Keep the game's live sprite bake; feed it better models.** The lab shows the bake technique
   is equivalent to an offline Blender toon render at 30–60 px. The visible gap to the reference
   is model shape and colour design.
   - The game's `SpriteBaker` can take skinned GLBs (verified in three r180 here and by the
     pipeline agent). Skeletal clips from Blender replace hand-written vertex-shader rigs.
3. **Cheap upgrade to the in-game bake: supersampled majority resolve.**
   - Render each sprite target at 2× (or 4×) and resolve each output texel to the dominant
     colour of its block (alpha = coverage ≥ 50%). Keep the outline pass after the resolve.
   - Optional hysteresis: keep the previous frame's colour if it still holds ≥ 25% of the block.
     That needs a previous-frame target per sprite.
   - Offline this cut colours per frame by ~3× and pixel churn by ~13–27%. GPU cost is small
     (sprite targets are tiny).
   - Pair it with a per-species **palette lock** (OKLab nearest to a 12–16-colour ramp set).
4. **If pre-rendered sheets are ever wanted** (trainer sprites, UI portraits, bestiary art,
   evolution cut-ins):
   - Use the pseudo-pixel approach with **Cycles 1-spp emission toon** (0.05–0.1 s per frame), not
     EEVEE (1.8 s+). An 8-direction × 3-clip × 12-frame sheet takes about 15–30 s of rendering.
   - Post-process with `08_sprite_post.py` helpers: mode-down, OKLab palette, outline/selout.
5. **Compression policy:**
   - Animated GLBs: gltfpack `-cc` or glTF-Transform `meshopt` (`EXT_meshopt_compression`).
   - Static textured props: Draco or meshopt + **WebP**.
   - Pixel textures stay PNG.
   - No KTX2 unless VRAM is a measured problem. If it is, encode UASTC with `--level 2`.
   - Ship `meshopt_decoder.module.js` from three's examples. It is already in node_modules.
6. **Visual regression in CI is feasible.** The viewer + Playwright harness renders any GLB in
   r180 on SwiftShader in ~0.2–0.6 s per shot and reports load time, extensions, clips, tris and
   draw calls. A `tests/assets.e2e` spec could assert per GLB: loads with 0 errors, tris ≤
   budget, clips present, 1 draw call, plus a screenshot for review.
7. **Look-development loop for an agent:**
   - Workbench 4-view sheet (`quicklook.py`, ~1–2 s) after every modelling step.
   - Cycles 16-spp 512² beauty (~5 s) for material checks.
   - The sprite-size render (0.1 s) to judge readability at the size players see.
   - Always compare against a capture of the actual game (`08_game_capture.mjs`).
8. **Guardrails to encode in the skill**, because each cost a debug round here:
   - `bpy.ops` CANCELLED is not an exception: check the return value.
   - Use numpy `foreach_*` for mesh data.
   - Use the `voxel_remesh` op, not the Remesh modifier, on non-manifold input; never the Skin
     modifier for creature blockouts.
   - Reset bake pass toggles before every bake.
   - Rebind islands after auto weights.
   - Solo NLA tracks before rendering in Blender.
   - Use `Standard` or Neutral views for colour judgement.
   - Run heavy ops under `ulimit -v` and `timeout`.
   - Log `os.getloadavg()` with every timing.

---

## 12. What a "blender-headless-lab" skill should contain (proposal)

- `env` check: bpy import, EGL (`BLENDER_EEVEE` render of a cube), `ktx --version`, Playwright
  browser path. Print a capability table (from `00_env.sh`).
- `kit.py` helpers:
  - `activate`, `qf_robust.quadriflow`, `islands()`, `rebind_islands(obj, bone)`;
  - `zones_numpy`, `bake(kind, target, sel2act, spp)` (resets pass toggles);
  - `export_glb(nla=True)`, `glbinfo`.
- Review renderers: `quicklook` (Workbench sheet), `beauty` (Cycles 16 spp), `sprite`
  (Cycles 1-spp emission toon + `post.py` mode-down/palette/outline).
- Node side: `06_compress.sh` presets (anim → gltfpack `-cc`; prop → meshopt + webp), and
  `viewer.html` + `07_shoot.mjs` for r180 verification and a JSON report.
- A **failure-mode checklist** (§9) and a **timing table** (§3–§8), so the agent plans its budget:
  - never 1024² × 128 spp in a loop (76 s);
  - never UASTC level 4 in iteration (110 s);
  - never EEVEE for sprite sheets.

---

## Sources

Primary code and docs read in this session:
- Blender `object_remesh.cc` (QuadriFlow manifold check):
  https://github.com/blender/blender/blob/main/source/blender/editors/object/object_remesh.cc
  (raw copy: `lab/src/object_remesh.cc`)
- glTF-Blender-IO exporter options (`export_animation_mode` enum):
  https://github.com/KhronosGroup/glTF-Blender-IO/blob/main/addons/io_scene_gltf2/__init__.py
- glTF-Transform 4.5.1 CLI source (`optimize` KTX2 slot/level logic), `node_modules/@gltf-transform/cli/dist/cli.mjs`;
  https://gltf-transform.dev
- pseudo-pixel (MIT): https://github.com/craigrusselltiu/pseudo-pixel (README,
  `skills/pseudo-pixel/SKILL.md`, `references/render.md`, `pp/sprite.py`, `pp/post.py`; copies
  in `lab/src/pseudo-pixel/`)
- GPv3 radius in Blender units: https://projects.blender.org/blender/blender/pulls/113770 ;
  4.3 GP migration notes: https://developer.blender.org/docs/release_notes/4.3/grease_pencil_migration/
- Chromium SwiftShader doc:
  https://chromium.googlesource.com/chromium/src/+/798e59c5275d4131797e8ea2e96e6c6000256b58/docs/gpu/swiftshader.md
- Blender as a Python module: https://docs.blender.org/api/current/info_advanced_blender_as_bpy.html ;
  PyPI: https://pypi.org/project/bpy/
- QuadriFlow manifold check origin (Fix T70095): https://developer.blender.org/rBf025b625f410ceb8a1edda584fe89acb5fff39d7 ;
  T70608: https://developer.blender.org/T70608
- KTX-Software 4.4.2 release (binary used): https://github.com/KhronosGroup/KTX-Software/releases/tag/v4.4.2

Secondary (search summaries; lower confidence):
- Dead Cells 3D → 2D pipeline: https://www.gamedeveloper.com/production/art-design-deep-dive-using-a-3d-pipeline-for-2d-animation-in-i-dead-cells-i-
- Sprite-sheet add-ons: https://github.com/Anton-219/SpriteSheetMaker ; Foozle 8-direction
  tutorial https://foozlecc.itch.io/render-4-or-8-direction-sprites-from-blender ;
  https://cxong.github.io/2017/03/3d-rendered-pixel-sprites
- WebGL without a GPU: https://microlink.io/blog/webgl-without-a-gpu ;
  https://www.createit.com/?p=3319
- KTX2 UASTC for normals: Khronos press release
  https://www.khronos.org/news/press/khronos-ktx-2-0-textures-enable-compact-visually-rich-gltf-3d-assets ;
  KTX tools doc https://github.khronos.org/KTX-Software/ktxtools/ktxsc.html
- EEVEE in Docker reports (GPU-focused, not llvmpipe): https://blenderartists.org/t/belender-4-2-1-eevee-does-not-work-inside-docker/1551491 ;
  https://github.com/HaiyiMei/blender-docker-headless
