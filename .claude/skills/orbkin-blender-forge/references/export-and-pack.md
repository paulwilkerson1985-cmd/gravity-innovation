# Export, pack and verify (glTF-Blender-IO 5.2.40, glTF-Transform 4.5.1, three r180)

Contents: 1 export flags · 2 exporter traps · 3 pack presets · 4 texture policy · 5 decoders ·
6 verification · 7 LODs and instancing · 8 sprite sheets.

## 1 Export flags (`orbkin_compat.export_glb`, defaults verified)

```
export_format='GLB', use_selection=True, export_yup=True, export_apply=False (keeps shape keys; GN
must be APPLIED before, or the exporter writes the base mesh: a 2,688-tri scatter exported as 2 tris),
export_texcoords/normals=True, export_tangents=False (True only when shipping a tangent normal map),
export_materials='EXPORT', export_image_format='AUTO' (PNG; compress later), export_vertex_color='MATERIAL'
(COLOR_0 only when a material uses it; 'ACTIVE' for colour-only meshes), export_attributes=True (custom
'_NAME' attributes), export_skins=True, export_def_bones=False (a non-deform root carrying the hop
translation vanishes with True), export_influence_nb=4, export_morph(+normal)=True,
export_animation_mode='NLA_TRACKS' (one clip per track; same track name on armature + shape keys merges
them), export_force_sampling, export_optimize_animation_size, export_anim_slide_to_zero,
export_reset_pose_bones=True, export_extras=True (custom props → userData), lights/cameras False.
```
Unknown kwargs for the running version are filtered by RNA; `dump_ops.py export_scene.gltf` lists
all 113 properties. The pip wheel has **no Draco/meshopt bridge** (the ERROR lines at export are
expected): export raw, validate raw, compress with glTF-Transform.

## 2 Exporter traps (each cost a round)

| Symptom | Cause | Fix |
|---|---|---|
| `doubleSided: true` | backface culling off (default) | `use_backface_culling = True` (`kit.pbr` does) |
| material lost (white/black GLB) | 5.2.2 EXACT boolean on a slot-less mesh leaves an empty slot; GN apply leaves a None slot | assign materials before booleans/GN; `drop_empty_material_slots()`; `gn.apply` re-appends |
| procedural look gone | Noise/Voronoi/ColorRamp/Bump nodes are not exported | bake (masks → compose, or EMIT albedo) |
| float bake exported too dark | exporter writes linear float images without the sRGB transfer | bake into a byte image; atlases are sRGB PNGs |
| no `occlusionTexture` | AO must go through the "glTF Material Output" group | `io_scene_gltf2...material_helpers.create_settings_group` (pixel pieces bake AO into the atlas instead) |
| `Mesh is not valid` | heat weights 1.0000004 | `kit.weight_hygiene` (clean, limit 4, normalise) |
| eyes float in motion | auto weights bind connected surface only | `kit.rebind_islands(obj, 'head')` |
| clips blend together in Blender renders | all NLA tracks active | `sprite_passes.solo_track` |
| custom attribute missing | name needs `_` prefix | `_RIGP`, `export_attributes=True`; three lower-cases it (`_rigp`) |
| model faces away in three | Blender −Y forward = glTF +Z | camera on +Z or rotate in Blender |
| vertices tripled, simplify does nothing | per-CORNER colour attributes / flat shading split every corner | POINT-domain attributes or decimate in Blender |
| raw GLBs differ by 1 ULP between runs | Bevel UV jitter (4.5+) | hash the packed GLB (quantisation absorbs it) |

## 3 Pack presets (`pack.mjs`; never blind `optimize`: flatten/join/palette/simplify are ON by default and it grew PNG files 12 %)

| Preset | Chain | Measured |
|---|---|---|
| `static-pixel` (arena pieces, props, kin bodies) | dedup → prune → weld → sparse → reorder → **meshopt high**; PNG atlases untouched; NEAREST samplers | ledge 346 → 118 KB (5 k tris + 256² PNG 13 KB); kin 81 → 18 KB |
| `static-smooth` (baked smooth maps) | same + WebP ≤ `--texture-size` (sharp) | 2 × 1024² PNG 1.4 MB → 170–190 KB; `--draco` allowed (geometry only) |
| `animated` (skins, morphs, clips) | dedup → prune → **resample** → weld → sparse → reorder → meshopt high; `--gltfpack` = `gltfpack -cc -kn -km -ke` | raw 325 → meshopt 78 KB / gltfpack 62 KB (prunes constant tracks); Draco 165 KB (no animation compression) |

Rules: compress **last**; validate the **raw** export (`--validate`; the validator cannot decode
meshopt/basisu); `EXT_meshopt_compression` only (three r180 lacks `KHR_meshopt_compression`, r183+);
never `optimize` characters; never simplify textured pieces below ratio 0.4 (gutter specks).

## 4 Texture policy

| Role | Format | Why |
|---|---|---|
| pixel atlases / tiles (≤ 512, 6–7 colours) | PNG, NEAREST, palette-preserving mips (`compose.py --mips`) | ETC1S turned a 6-colour tile into 142 colours (81 % of pixels shifted) and was not smaller; UASTC 264 colours |
| smooth baked maps (creature albedo 256², lit maps) | WebP q85 | 8× smaller than PNG; VRAM unchanged |
| ≥ 1024² smooth maps, many of them | KTX2 UASTC level 2 (normal/AO), ETC1S (colour) | 4–8× VRAM; 260 KB transcoder; level 4 took 110 s; **opt-in, owner approves the encoder** (ktx binary or `ktx2-encoder` npm) |
Phones: pixel art ≤ 512, cap 1024; kin ≤ 80 KB, arena chunk ≤ 400 KB download.

## 5 Decoder payloads (three r180 `examples/jsm/libs`, gzip)

meshopt_decoder 6.5 KB (in the game's node_modules; `GLTFLoader.setMeshoptDecoder`) · Draco wasm +
wrapper ≈ 75 KB · Basis transcoder ≈ 260 KB (+290–380 ms transcode on SwiftShader).

## 6 Verification (the shipped file, never the raw one)

1. `glbinfo.py file.glb --max-tris N --max-kb N --one-mesh --one-material --require-attrs
   POSITION,NORMAL,TEXCOORD_0 --no-double-sided --require-ext EXT_meshopt_compression --forbid-ext
   KHR_draco_mesh_compression,KHR_texture_basisu --max-image-px 512` (no node needed) or
   `inspect_assert.mjs` (decodes meshopt, same flags).
2. `shoot.mjs --glb file.glb --out shots --modes pbr,toon,sprite --ppu 64` and `--ppu 36`: three
   r180 from the game's node_modules, GLTFLoader + MeshoptDecoder (+Draco/KTX2 if present),
   SwiftShader; sprite mode = the game's SpriteBaker emulation at the game's pixels per unit (desktop
   ≈ 64, phone ≈ 36; `--h` for a fixed height); toon/sprite key = π W from `-0.5,-0.6,0.8` so a lit
   face shows the atlas shade itself; exit 1 on any console error. Report: load ms (16–104 ms
   typical), tris, draw calls (must be 1 per piece), extensions, sprite size. Then
   `read_check.py shots/<name>_sprite_ppu64.png --ramps ... --ramp <ramp>`: seams ≥ 4 %, lips ≥ 3 %,
   orphans ≤ 12 %, ≥ 3 mid shades (exit 0) replaces the adjective "it reads".
3. Fix in the script, never in the GLB. Commit the packed GLB + manifest (`manifest.py`), never
   `.blend`, raw exports, bakes or review renders.

## 7 LODs and instancing

`lods.mjs in.glb prefix --ratios 0.5,0.25 --error 0.01` (meshopt simplify, keeps skins/morphs/clips;
2,690 → 1,344 tris looked identical in-game). Repeated props: linked duplicates under one Empty with
`export_gpu_instances=True` → `EXT_mesh_gpu_instancing` → one `InstancedMesh` (25 rocks: 1 draw
call, 105 → 31 KB). Unique static pieces: merge per material (draw calls < 100).

## 8 Sprite sheets (`sprite_passes.py` + `sprite_post.py`)

Cycles 1 spp emission toon, `max_bounces 0`, `filter_size 0`, film transparent, Standard view:
0.05–0.12 s per frame (EEVEE ≥ 1.8 s/frame on llvmpipe; Workbench dull). Render at 4× and
mode-down (dominant colour per block, alpha = coverage ≥ 50 %), hysteresis 25 %, OKLab palette
lock to the species ramps, 1-px 4-neighbour outline in a dark hue-shifted colour. Measured: colours
per 48-px frame 95 → 34 → 16, pixel churn −27 % relative. The live in-game bake still beat an
offline Blender sprite 3–0: use sheets for portraits, bestiary and title art, not battle sprites.
