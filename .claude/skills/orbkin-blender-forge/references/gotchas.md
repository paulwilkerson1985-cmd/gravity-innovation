# Gotchas: symptom → cause → fix (merged from blender-llm §6, lab §9, asset-pipeline §11, toolchain §8, and this skill's own runs)

Read when something looks wrong or a script returns CANCELLED/empty. Each line cost a debug round.

| Symptom | Cause | Fix |
|---|---|---|
| SDF / GridToMesh output has 0 faces | `GridToMesh.Threshold` default 0.1 is the density convention | `Threshold = 0.0` for SDF grids (`gn.sdf_fuse` does) |
| colour or EMIT bake all black, normal/AO fine | GN apply left a `None` material slot; material went to slot 1 | `gn.apply` clears and re-appends; `mesh.materials.clear()` before append |
| GLB white, material missing | 5.2.2 EXACT boolean on a slot-less mesh leaves an empty slot | assign materials before booleans; `oc.drop_empty_material_slots()` |
| eyes / zones offset from the body | joined object kept `parts[0].location`; mesh coords ≠ world | `kit.join` / `kit.apply_transforms` (location too) |
| contact-sheet tile shows another object or is blank | neighbours occlude the fitted camera; camera on the wrong side | `kit.contact_sheet` hides non-targets; camera at `mid + d*dist` |
| sprite frames full of speckles | an overlapping high poly or floor z-fights | `sprite_passes` hides every other mesh |
| bpy.ops "failed" silently | ops return `{'CANCELLED'}`, never raise | `oc.ops_ok(res)`; `kit.*` already raises |
| QuadriFlow CANCELLED "needs to be manifold" | voxel slivers < 1e-4 per component | `kit.quadriflow` prescales ×100 |
| QuadriFlow eats 13 GB / killed | fragmented or multi-shell input | `kit.components()==1` first; `RLIMIT_AS` in `kit.quadriflow`; run whole scripts under `timeout` |
| Remesh modifier output tiny | `use_remove_disconnected` keeps one fragment of non-manifold input | `bpy.ops.object.voxel_remesh` on one shell |
| per-vertex Python loop never finishes | bpy element access is slow (137 k tris > 5 min) | `foreach_get/set` (`kit.mesh_arrays`, `zones_numpy`) |
| COMBINED/lit bake pure black | a previous DIFFUSE colour bake turned direct/indirect toggles off | `kit.bake` resets `use_pass_direct/indirect/color` every call |
| AO bake blotchy black on the low | the high poly still renderable shadows it | hide the high (`hide_render`) for AO-of-low; masks bake from the high with the low active |
| curvature / masks bake black | selected-to-active rays are world-space; low offset from high | keep high and low overlapping (bake_masks checks bboxes) |
| bake wrote nothing | target image not the ACTIVE Image Texture node; low not active | `kit.set_bake_target`; `kit.bake` selects high then low |
| bake image gone after the script | bakes are not saved automatically | `kit.save_image` |
| Pointiness flat/noisy | per-vertex curvature; needs ≥ 50 k verts, Cycles only | bake it from the dense high poly (bake_masks) |
| composed atlas = camouflage noise (pilot 1, judged 4/10) | per-texel rules over 1,600 two-face UV islands; low cut from the fully displaced high | low = fused form + plates only (chisel 15°, voxel 0.08); `compose.py` paints 5-8-texel cells keyed on WORLD position with a per-cell lit lip / dark seam |
| lips 40 % of the atlas | the half-texel island offset let islands share texels, every island edge counted as a cell edge | `uv_blocks` snaps origins to whole texels + a gutter; the bevel only looks at covered neighbours |
| displacement vanished in the atlas | plate 0.03 / crack 0.05 units = 0.5-0.8 texel at 16/unit | plate ≥ 0.125 (2 texels), crack ≥ 0.1; `--plate-scale 1.8` for 6-10-texel plates |
| `No valid selected objects` at bake | an object hidden with `hide_viewport` cannot be selected | `kit.bake` un-hides low and high; the template uses `hide_render` only |
| second SDF pass raises '9 shells' | 8-vertex specks at concave joins after a fillet | `kit.drop_small_shells`; hangers go through `add_after_cut` in ONE fuse |
| piece 5-10 % bigger than PIECE size | displacement + fillet grow the blockout | `kit.fit_matrix` applied to high and low |
| sprite shot one flat colour | GLB lost its texture (material re-assigned without the image, or TEXCOORD pruned when no material uses it) | `glbinfo.py` images/attrs before shooting; assign the atlas material before `export_glb` |
| sprite darker than the atlas, no light shades | MeshToon divides by π: a 1 W key lights a face to 0.32 × albedo | viewer uses a π W key in toon/sprite modes |
| `read_check` says lips < 3 % | tops not lit: no key term, or the viewer at the wrong scale | bake the key term (`--key`), shoot at `--ppu 64/36`, cell seams -2 / lips +1 |
| 70 % of texels become "cavity" | absolute AO threshold with a floor present | `--cavity 22` (percent) default; `<= 1` only when you mean an absolute value |
| atlas too small / islands overflow | organic low polys fragment into 1–2 k islands | 512 atlas for 3-unit pieces; coarser `--low-voxel`; never a looser `--angle` (> 20° fails the density gate) |
| texel density check fails | UVs not planar-projected per island, or scaled | `uv_blocks.py` only; never `pack_islands`/`smart_project` on pieces |
| seams visible on the piece | every island boundary is a pixel discontinuity | seams fall in cavities (dark rule hides them); fewer islands via a smoother low |
| Workbench/EEVEE: `libEGL.so.1` not found | Mesa EGL missing | `bootstrap.sh doctor` installs `libegl1 libegl-mesa0` (cloud, root only); else Cycles sheets (`--engine CYCLES`) |
| `EGL_BAD_MATCH` lines | harmless on llvmpipe | ignore |
| EEVEE frame takes 25–48 s | llvmpipe shader compile | never EEVEE for sprite sheets; Cycles 1 spp emission |
| exporter prints Draco/MeshOptimizer ERROR | pip wheel lacks the bridge libs | expected; pack with glTF-Transform |
| `KHR_meshopt_compression` not loaded | three r180 reads only `EXT_` (r183+ for KHR) | glTF-Transform `meshopt()` writes EXT |
| validator warnings on the packed file | validator cannot decode meshopt/basisu | validate the raw export (`pack.mjs --validate` does) |
| `optimize` made the file bigger / destroyed geometry | re-encodes PNG, simplify on, flatten/join | `pack.mjs` presets |
| 6-colour tile became 142 colours | ETC1S | PNG for pixel art; KTX2 only for ≥ 1024² smooth maps, owner-approved |
| UASTC took 110 s | level 4 | level 2 (3.8 s) |
| simplify/LOD did nothing | unwelded vertices (per-corner colour attrs, flat shading) | POINT-domain attributes or decimate in Blender |
| sprite viewer black with "Shader Error" | `#include` must start its own line in GLSL | fixed in `viewer.html` |
| sprite darker than the toon render | render-target composite skipped output colour conversion | `<colorspace_fragment>` + sRGB target (viewer does) |
| PNGs differ between identical runs | render stamps / `use_stamp_labels=False` | `oc.deterministic_png()` (stamps off, labels on) |
| `Material.use_nodes` DeprecationWarning | always on in 5.x | `oc.new_material` never sets it |
| `scene.node_tree` None | 5.0+: `scene.compositing_node_group` | `oc.compositor_tree()` |
| boolean solver `'FAST'` TypeError | renamed `FLOAT` in 5.0 | `oc.boolean_solver()` |
| `Action.fcurves` AttributeError | removed in 5.0 (slots/channelbags) | `oc.iter_fcurves()` |
| `_cycles.debug_flags_update` | segfaults bpy 5.2.2 | never call it |
| `uv.export_layout` PNG fails | needs GPU offscreen | `mode='SVG'`, or `uv_check.py --checker` |
| Playwright "browser not found" | CDN blocked here | never `playwright install`; `/opt/pw-browsers` ships chromium-1194 for @playwright/test 1.56.1 (never bump it in the cloud) |
| nested `claude -p` test wrote into this session's env | inherited `CLAUDE_CODE_SESSION_ID` | `env -u CLAUDE_CODE_SESSION_ID` and a temporary `CLAUDE_ENV_FILE` |
| compose/sprite_post `ImportError: PIL` | Blender python has no Pillow | PNG path works without it (`pngio.py`); JPEG inputs need `python3` with Pillow |
