# Free tools & CC0/free asset sources for pro game graphics

Research angle: **free-tools-assets**. Date: 2026-10-14. Scope: every no-cost tool and asset
source useful for making Orbkin look professional, with license, quality, best use, and — the
part that matters most for an agent-driven workflow — **whether and how it can reach this cloud
container**, whose proxy blocks most asset websites.

Confidence notes: "verified here" means I ran it in this container on 2026-10-14. License
statements are taken from the creator's own repo/README where I could read it; otherwise from
secondary sources and marked as such.

---

## 0. TL;DR

1. **`git clone` to github.com works; almost every asset website does not.** curl to
   polyhaven.com, ambientcg.com, kenney.nl, quaternius.com, poly.pizza, opengameart.org,
   itch.io, sketchfab.com, mixamo.com, fonts.google.com, blender.org, extensions.blender.org,
   lospec.com, huggingface.co, jsdelivr and unpkg all time out (HTTP 000). GitHub *release
   downloads* return 403. What works: `git clone`/`git show` over the git protocol,
   `raw.githubusercontent.com`, the npm registry (`npm view/pack/install`) and PyPI (`pip`).
   **So the asset strategy is: prefer sources that live in git repos or npm/PyPI packages;
   for everything else, the owner downloads on their own machine and commits.**
2. **There are large CC0 3D libraries in reachable git repos** (verified here):
   - `KayKit-Game-Assets/*` — 10 official repos by Kay Lousberg, CC0, `.glb/.gltf` + FBX/OBJ
     (e.g. Dungeon Remastered: 203 GLBs; Adventurers: 4 rigged characters, 75 animations).
   - `trebeljahr/quaternius-showcase` — **1,545 Quaternius `.glb` files across 32 packs**, each
     pack listed as CC0-1.0 in its `LICENSES.md` (checked against quaternius.com 2026-10-10).
   - `J-Ponzo/gltf-universal-animation-library`, `J-Ponzo/gltf-medieval-village-megakit` —
     Quaternius' free animation library and Medieval Village MegaKit as glTF (CC0 upstream).
   - `KenneyNL/Starter-Kit-*` — official Kenney Godot kits with CC0 `.glb` models.
   - `ETdoFresh/kenney.nl` — an unofficial **mirror of 128 Kenney packs** (1,425 GLBs, 33,866
     PNGs, 10 Kenney fonts), frozen in July 2020; content is CC0.
   - `pmndrs/drei-assets` — 12 Poly Haven 1k HDRIs (CC0), LUT PNGs, matcaps, normal maps.
3. **npm packs real assets**: `@pmndrs/assets` (CC0, 19 MB: 18 HDRIs as EXR, 284 matcaps, 29
   normal maps, Inter font) and every Google Font via `@fontsource/*` (OFL-1.1) — including
   pixel faces (Press Start 2P, Pixelify Sans, Silkscreen, Tiny5, Micro 5, Jersey 10, VT323,
   DotGothic16).
4. **Headless Blender (`pip install bpy`, 5.2.2 LTS) ships Rigify, Node Wrangler, glTF and FBX
   import/export.** Verified: clone KayKit + Quaternius → import GLB → Cycles CPU render, 480×160,
   16 spp, in ~1 s. This is the container's real "art tool".
5. GUI tools (Krita, GIMP, Blockbench, Pixelorama, LibreSprite, Aseprite, MagicaVoxel, Material
   Maker, ArmorPaint, Mixamo) are **owner-machine tools**: free, excellent, but not installable
   here (no apt, no release downloads). Some have file formats Claude can author directly
   (Blockbench `.bbmodel` JSON, Material Maker `.ptex` JSON, Aseprite via Lua on the owner's
   machine).
6. **Style caution:** the big CC0 3D libraries (KayKit, Quaternius, Kenney) are *flat-colour
   low-poly*, not HD-2D pixel-art. Their value for Orbkin is **geometry and silhouettes**
   (props, furniture, rocks, trees, rigged humanoids) that we re-surface with our own pixel
   textures/palette and render through the existing low-res pipeline — not a drop-in look.

---

## 1. Reachability matrix (tested 2026-10-14 from this container)

| Route | Result | Notes |
|---|---|---|
| `git clone https://github.com/<o>/<r>` (incl. `--filter=blob:none`) | **works** | Fetch only what you need with `git show HEAD:<path> > file` (lazy blob fetch). |
| `https://raw.githubusercontent.com/<o>/<r>/<branch>/<path>` | **works** | 1.5 MB HDR in one request; fine for single files. |
| `https://github.com/<o>/<r>/releases/...` | **403** | So no prebuilt binaries (Blockbench, Pixelorama, Material Maker, KTX tools…). |
| GitHub MCP tools (`get_file_contents` etc.) | scoped to this repo only | Use git/raw instead for other repos. |
| npm registry (`npm view`, `npm pack`, `npm install`) | **works** | Asset-carrying packages are a first-class source. |
| PyPI (`pip install`, `pip index versions`) | **works** | `bpy 5.2.2`, `pixeloe 1.0.0`, `trimesh`, `pygltflib`, `opensimplex`, `scikit-image`, `rembg`… |
| jsdelivr / unpkg CDNs | blocked | Use npm instead. |
| polyhaven.com, api.polyhaven.com, dl.polyhaven.org | blocked | Use drei-assets / @pmndrs/assets mirrors, or owner download. |
| ambientcg.com, kenney.nl, quaternius.com, poly.pizza, opengameart.org, itch.io, sketchfab.com, mixamo.com, lospec.com, fonts.google.com | blocked | Owner downloads, or GitHub mirrors (below). |
| blender.org, extensions.blender.org | blocked | `pip install bpy` instead; bundled add-ons only. |
| apt | blocked | Preinstalled: ImageMagick `convert`, `ffmpeg`, `git-lfs`, `cmake`, `g++`, Rust, Node 22, Python 3.13, `xvfb-run`, Playwright Chromium. |

### Fetch recipe (verified)

```bash
# Grab individual files from a big asset repo without downloading the whole thing
git clone -q --depth 1 --filter=blob:none --no-checkout \
  https://github.com/KayKit-Game-Assets/KayKit-Dungeon-Remastered-1.0 /tmp/kk
cd /tmp/kk
git ls-tree -r --name-only HEAD | grep 'gltf/.*stairs'        # browse
git show HEAD:addons/kaykit_dungeon_remastered/Assets/gltf/chest.glb > /tmp/chest.glb
```

```bash
# Single file over HTTPS
curl -sSLo /tmp/hdri.hdr \
  https://raw.githubusercontent.com/pmndrs/drei-assets/master/hdri/venice_sunset_1k.hdr
```

Always record provenance (repo, commit SHA, path, upstream license) in `game/ASSETS.md` when an
asset is committed — `ASSETS.md` currently says *no* third-party art is used, so the first
import must update that policy and the table.

---

## 2. 3D model sources

| Source | License | Quality / style | Best for Orbkin | Reachable here? |
|---|---|---|---|---|
| **KayKit** (Kay Lousberg) — official GitHub org `KayKit-Game-Assets`: Dungeon Remastered (200+), Adventurers (4 rigged chars, 75 anims, 25+ accessories), Skeletons, Prototype Bits, City Builder, Medieval Hexagon (200+ tiles), Furniture, Restaurant, Halloween, Space Base | **CC0** ("free for personal and commercial use, no attribution required", README); paid "extra/source" tiers add content | Very clean stylised low-poly; *single 1024² gradient-atlas texture per pack* (README) — trivially recolourable/palette-mappable | Lodge/room props (shelves, barrels, crates, chests, stairs, banners, tables), dungeon/quarry kit pieces, rigged humanoid base for trainers | **Yes** — `git clone` (verified: 848 files in Dungeon; GLB+FBX+OBJ; no LFS) |
| **Quaternius** (~80 packs, 1,100+ models) | **CC0** per pack (`LICENSES.md` of the mirror; secondary sources agree) | Clean low-poly, flat colours, many **rigged & animated** (animals, dinosaurs, monsters, fish, knights, modular men/women) | Nature (trees/bushes/rocks: Ultimate Nature 150 GLBs), animals as reference/base meshes, crops, interiors, RPG items; *Animated Monsters* / *Cute Monster* packs as creature-animation references | **Yes** via `trebeljahr/quaternius-showcase` (1,545 GLBs, 32 packs, `public/glb/<pack>/`), `J-Ponzo/*` glTF mirrors. Official site/itch blocked. The "Ultimate Monsters" & "LowPoly Animated Monsters" packs are **not** in the mirror (owner download). |
| **Kenney** | **CC0** ("free to use in any project, personal or commercial… attribution optional") | Very consistent, simple; huge 2D and 3D range; Nature Kit, Platformer Kit, Castle Kit, Pirate Kit, Graveyard Kit, Furniture Kit, Prototype textures, UI packs, particles, fonts | Prototype/greybox kits, particle sprites (`particlePack_1.1`, `smokeparticleassets`), UI references, Kenney fonts | **Yes**: official `KenneyNL/Starter-Kit-*` (GLB), unofficial mirror `ETdoFresh/kenney.nl` (128 packs, 2020 snapshot). Newer packs: owner download. |
| **Poly Haven** models | **CC0** (all assets; secondary quotes of polyhaven.com/license) | Photoreal scanned props, 1k–8k PBR | Rarely fits pixel HD-2D; useful as *bake sources* (bake detail into our textures) | Site/API blocked. Owner download, or the official Blender add-on `Poly-Haven/polyhavenassets` on the owner's machine. API use for commercial apps needs a custom license per the polyhaven.com API page (assets themselves stay CC0). |
| **Poly Pizza** (10,600+ models incl. ~2,294 archived Google Poly) | **Mixed: mostly CC-BY**, some CC0 — check each model's field | Uneven | Occasional props; must track per-model attribution | Blocked. Owner download only. |
| **Sketchfab** (700k+ CC models) | Per model: CC0, CC-BY (most), CC-BY-SA, **CC-BY-NC (not usable commercially)** | Ranges from junk to superb | Hero references; CC0/CC-BY props | Blocked; downloads require a logged-in account (Sketchfab Download API guidelines). Owner download. |
| **OpenGameArt** | Mixed: CC0, CC-BY, CC-BY-SA, GPL, OGA-BY — per item | Uneven, lots of pixel art | CC0 pixel tilesets (e.g. *Puny World* 16×16), sprite references | Blocked; owner download. |
| **itch.io free packs** | Per pack (many CC0; many "free, credit required, no resale") | Some excellent pixel art | HD-2D-adjacent pixel tilesets / sprites | Blocked; owner download. |
| **three.js repo examples** (`mrdoob/three.js/examples/models|textures`) | Mixed per file (see each folder's README/credits) | Demo assets | Test HDRs (`venice_sunset_1k.hdr` etc. are Poly Haven CC0) | **Yes** (raw/git). |

**Verified import test** (`/tmp/gr/render_test.py`, headless bpy 5.2.2): KayKit `chest.glb` (728
polys, 1 material), `barrel_large` (561 polys), Quaternius `CommonTree_1` (2,888 polys) and
`Deer` (2,176 polys, 7 materials, **13 animations**) all imported cleanly, normalised and
rendered with Cycles CPU at 480×160, 16 spp in **0.9–1.0 s**.

## 3. Animation & rigging sources

| Source | License | Notes | Reachable? |
|---|---|---|---|
| **Rigify** (Blender built-in) | GPL tool; output is yours | Generates full control rigs from metarigs (human, quadruped, bird, etc.). **Present in pip `bpy` 5.2.2** (verified `addon_utils.enable('rigify')`). Scriptable: add metarig → fit bones → `bpy.ops.pose.rigify_generate()`. | **Yes** |
| **Mixamo** (Adobe) | Free with an Adobe account; royalty-free for personal/commercial games; **may not redistribute raw character/animation files** as standalone assets; may not train ML on them (Adobe community FAQ mirror) | Auto-rigger + thousands of humanoid mocap clips. Humanoids only — useless for quadruped/bird creatures, good for trainers/NPCs. Terms can change. | Blocked here; owner downloads FBX → commit derived/baked results. |
| **Quaternius Universal Animation Library** | CC0 | Humanoid clips in one glTF | **Yes** (`J-Ponzo/gltf-universal-animation-library`) |
| **KayKit Adventurers / Skeletons** | CC0 | 75 humanoid animations + rig; reusable on similar rigs | **Yes** |
| Quaternius animated animals/dinosaurs/fish/monsters | CC0 | Quadruped/creature clips — the closest free thing to creature mocap | Animals/dinos/fish **yes** (showcase mirror, GLB with actions); monsters: owner download |

## 4. Textures, materials, HDRIs, LUTs

| Source | License | Best for | Reachable? |
|---|---|---|---|
| **Poly Haven** textures & HDRIs | CC0 | Lighting reference, IBL for bakes, photo detail to bake/pixelise | Blocked; **12 HDRIs at 1k in `pmndrs/drei-assets/hdri/`** and 18 EXRs inside npm `@pmndrs/assets/hdri` (base64 ES modules) |
| **ambientCG** (ex-cc0textures) | CC0 | PBR sets (rock, dirt, planks, plaster) as bake/pixelise sources | Blocked (API too). Owner download; `alvarognnzz/ambientcg-downloader` script can run on the owner's machine. `Kimbatt/cc0-textures` = torrents (not usable here). |
| **@pmndrs/assets** (npm) | CC0 | 284 matcaps (great for stylised NPR shading/bakes), 29 normal maps, HDRIs, Inter font | **Yes** (`npm pack @pmndrs/assets`) |
| **drei-assets** (git) | Poly Haven HDRIs = CC0; matcaps from the `emmelleppi/matcaps` collection (check per-file); LUT/`.cube` files: provenance unclear → don't ship without checking | HDRIs, matcaps, normals, LUT PNGs | **Yes** |
| **Kenney Prototype Textures** | CC0 | Greybox grids | **Yes** (mirror) |
| cgbookcase, ShareTextures, 3dtextures.me | CC0 (per their sites) | More PBR sets | Blocked; owner download |
| **Material Maker** library | MIT (app), generated output yours | Procedural material graphs (`.ptex` JSON) | Repo cloneable (`RodZill4/material-maker`, Godot 4.7 project) but needs Godot + GPU to run — owner machine |

For HD-2D pixel art, photo PBR textures are *inputs*, not finished surfaces: bake/downsample →
palette-map → hand-clean. See `procedural-texturing.md`.

## 5. 2D / pixel-art sources

| Source | License | Notes |
|---|---|---|
| Kenney 2D packs (in the mirror): roguelike packs, `pixeluipack`, `particlePack_1.1`, `smokeparticleassets`, `1bitpack`, fonts | CC0 | **Reachable**. Particle/smoke sprites are directly useful for FX. |
| Liberated Pixel Cup (LPC) + Universal LPC Spritesheet Generator (`LiberatedPixelCup/Universal-LPC-Spritesheet-Character-Generator`) | **CC-BY-SA 3.0 / GPL 3** (dual), must credit every contributing artist, credits discoverable in-game | Reachable via git. Share-alike + heavy credits + a recognisable "LPC look" → not recommended for Orbkin's hero sprites. |
| OpenGameArt CC0 pixel tilesets (e.g. *Puny World* 16×16), itch CC0 packs | CC0 per pack | Owner download; good *style references* for palette/tile density. |
| **Lospec palettes** | Palettes are colour lists (not copyrightable in practice; credit the author as courtesy) | Site blocked; `gagath/lospec-palette-scrapper` (git) has scraped palettes + SQLite. Or type the hex codes in — a palette is ~16–64 hex values. |

## 6. Fonts

| Font | License | Route |
|---|---|---|
| All Google Fonts | **OFL-1.1** (embed/ship freely, can't sell the font alone) | **npm `@fontsource/<name>`** (verified: press-start-2p, pixelify-sans, silkscreen, tiny5, micro-5, jersey-10, vt323, dotgothic16, all 5.3.x, OFL-1.1) |
| Inter (in `@pmndrs/assets`) | OFL | npm |
| Kenney fonts (Pixel, Mini, High, Future, Blocks, Rocket…) | CC0 | git mirror `ETdoFresh/kenney.nl/kenney_fontpackage/Fonts/*.ttf` |
| m5x7 / m6x11 (Daniel Linssen) | Free, credit requested (itch page) | Owner download |
| **Orbkin Pixel** (already in repo) | Project-owned (`tools/pixelfont/`) | — keep; it's already the right approach for a unique UI. |

## 7. Tools

### 7.1 Usable inside this container (verified)

| Tool | License | What for | Status here |
|---|---|---|---|
| **Blender as a Python module** (`pip install bpy` → 5.2.2 LTS, Python 3.13) | GPL (outputs yours) | Modelling by script, sculpt-ish ops (modifiers: remesh/displace/bevel/subdiv), UV, **texture baking**, Rigify, glTF/FBX/OBJ/SVG import, glTF export, Cycles CPU rendering (sprite sheets, impostors, AO/curvature bakes) | **Works** (Cycles CPU; EEVEE needs libEGL — unavailable). Bundled add-ons: `cycles, io_scene_gltf2, io_scene_fbx, io_anim_bvh, io_curve_svg, io_mesh_uv_layout, node_wrangler, pose_library, rigify, hydra_storm, viewport_vr_preview, ui_translate, bl_pkg`. Extensions platform blocked. |
| `fake-bpy-module` (PyPI) | MIT | Type stubs/autocomplete for writing bpy scripts | pip |
| **Pillow, NumPy, scikit-image, opensimplex/noise** | permissive | Texture synthesis, palette quantisation, dithering, tiling, atlas packing | pip |
| **pixeloe** (PyPI 1.0.0, KohakuBlueleaf/PixelOE) | Apache-2.0 (PyPI metadata) | "Detail-oriented" pixel-art downscaling of high-res renders/images (contrast-aware, outline expansion) | pip, but depends on torch+torchvision+kornia+opencv (multi-GB CPU install) — not tested here |
| **ImageMagick `convert`** | Apache-style | Quick resize (`-filter point`), `-remap palette.png`, `-ordered-dither`, montage/contact sheets | preinstalled |
| **ffmpeg** | LGPL/GPL | Turntable/sprite videos, GIF previews | preinstalled |
| **trimesh, pygltflib** (PyPI) | MIT | Inspect/fix glTF without Blender | pip |
| **@gltf-transform/cli** (npm 4.5.1) | MIT | `optimize`, `dedup`, `weld`, `simplify`, `meshopt`, `webp` texture compression, `inspect` — shrink GLBs for the web | npm |
| **gltfjsx** (npm 6.5.3) | MIT | Inspect/transform GLBs; generates component code (R3F) — mainly its `--transform` | npm |
| **meshoptimizer** (npm) | MIT | Mesh compression (three.js has `MeshoptDecoder`) | npm |
| **sharp** (npm) | Apache-2.0 | Fast image ops in Node build scripts | npm |
| **Playwright Chromium** (preinstalled) | — | Run web-based tools headless: three.js bake/render scripts, possibly Blockbench's web build (untested) | works |

KTX2/Basis texture compression: `toktx` binaries come from GitHub releases (blocked) — use
WebP via gltf-transform/sharp, or the `basis_transcoder` already in drei-assets for decoding only.

### 7.2 Owner-machine tools (free, not installable here)

| Tool | License / cost | Best for | Notes |
|---|---|---|---|
| **Blender (full GUI)** | GPL, free | Everything: modelling, sculpting, painting, Grease Pencil, EEVEE renders | Owner can also run `blender-mcp` (ahujasid) to drive Blender from Claude Desktop: socket add-on + MCP server; can run arbitrary Python, search/download Poly Haven & Sketchfab (Hyper3D/Hunyuan3D integrations are external AI services — skip, not free/unclear license). |
| **Blockbench** (v5.2.2) | GPL-3.0, free | Low-poly + **pixel-textured** box/mesh models with pixel-perfect UV painting — the closest free tool to "HD-2D props" and Minecraft-style creatures; exports glTF | `.bbmodel` is JSON → Claude can author/edit it; web app also runs in a browser. Cloneable source; running its web build under Playwright here is plausible but untested. |
| **MagicaVoxel** | Free proprietary (commercial use of output allowed per secondary sources), Win/macOS | Voxel props/creatures, OBJ export | Linux via Wine. Alternative: **Goxel** (GPL-3). `.vox` is a simple binary format Claude can write via Python. |
| **Krita** | GPL-3, free | Hand-painting textures, concept art, pixel-art brushes, animation | Best free painting app. |
| **GIMP** | GPL-3, free | Photo edits, palette indexing (Image → Mode → Indexed), batch via Script-Fu | |
| **Aseprite** (v1.3.18.x) | **Source-available EULA**: compiling for personal use is allowed, output may be used commercially, compiled binaries may not be redistributed. Official binary paid (~US$20). | The industry pixel-art/animation editor; CLI `aseprite -b` + Lua scripting for batch export of sprite sheets | Needs Skia from GitHub releases → not buildable here. |
| **LibreSprite** (v1.3) | GPL-2, free | Aseprite's 2016 fork; has `-b` batch CLI | Older feature set. |
| **Pixelorama** (v1.2.3) | MIT, free | Pixel-art editor in Godot; good tilemap/3D-layer features | |
| **Material Maker** | MIT, free | Node-based procedural PBR materials; has a CLI `--export <file.ptex> -t <target> -o <dir> --size N` (`parse_args.gd`) | Needs a GPU-backed Godot runtime. |
| **ArmorPaint 1.0** (ArmorTools, Sept 2026) | Source **zlib**, free to build; prebuilt binaries ~US$19 | Substance-Painter-style 3D painting with smart materials, bakes (AO/curvature) | Build from source on owner machine. |
| **Mixamo** | Free (Adobe account) | Humanoid rigging & mocap | See §3 restrictions. |
| **Inkscape** | GPL | Vector UI art, icons | |

Paid tools explicitly *not* needed: Substance, Photoshop, Kenney Asset Forge, Spine, paid AI 3D
generators (Meshy/Tripo/Hyper3D/Rodin — excluded by the "free only" rule; their free tiers have
licence limits and are external services).

---

## 8. Licence cheat-sheet

| Licence | Commercial game? | Attribution? | Share-alike? | Use in Orbkin? |
|---|---|---|---|---|
| CC0 / public domain | yes | no (courtesy credit nice) | no | **preferred** |
| CC-BY 4.0 | yes | **yes**, discoverable credits | no | OK with a credits screen + `ASSETS.md` entry |
| CC-BY-SA 3.0/4.0, GPL art | yes | yes | **yes — derivative art must be released under the same licence** | avoid for core art |
| CC-BY-NC | **no** | — | — | **never** |
| OFL-1.1 (fonts) | yes | keep licence file | font itself stays OFL | fine |
| Mixamo terms | yes in a game | no | can't redistribute raw files | fine if baked into game builds; don't commit raw FBX to a public repo without checking (redistribution) |
| Aseprite EULA | output yes | — | — | tool only |

Repo-specific: this repo is public on GitHub, so committing an asset **is** redistribution —
CC0/CC-BY/OFL are fine; Mixamo raw FBX and "no redistribution" itch packs are not.

---

## 9. Implications for Orbkin

1. **Stop treating "all procedural" as a rule; treat it as one source among several.** The
   biggest free win is *geometry*: KayKit Dungeon/Furniture/Restaurant/Halloween props and
   Quaternius Nature/Interior packs give dozens of well-modelled shelves, crates, barrels,
   stairs, lanterns, trees, bushes and rocks — exactly the "raised wooden room with shelves" and
   rich clutter the reference has and our merged boxes lack. All CC0 and fetchable here.
2. **Re-surface, don't drop in.** Import → (optionally decimate/bevel) → re-UV or keep KayKit's
   gradient-atlas UVs → assign *our* pixel textures/palette (see `procedural-texturing.md`) →
   export GLB → render through the existing 360 px pipeline. The low-res, palette-graded frame
   hides the source style differences, provided texel density and palette are unified.
3. **Pipeline to build (all doable here):** `tools/assets/fetch.sh` (git sparse fetch + provenance
   JSON) → `tools/assets/blender/*.py` (bpy import/retexture/bake/export) →
   `npx @gltf-transform/cli optimize` → `public/assets/…` → `GLTFLoader` + `MeshoptDecoder` in
   three. Merge static props into the arena batch to respect the < 100 draw-call rule.
4. **Creatures stay original** (IP rule + identity), but Quaternius animated animals/dinos/
   monsters are free, legal *motion references* and can seed Rigify quadruped rigs for our own
   meshes.
5. **Trainers/NPCs**: KayKit Adventurers (CC0, rigged, 75 anims) or Quaternius modular
   men/women are a credible base for the human figures, re-coloured and rendered through the
   existing sprite baker.
6. **Lighting/bakes**: use drei-assets / @pmndrs/assets HDRIs as Cycles world light for baking
   AO/irradiance into props; matcaps from @pmndrs/assets for stylised NPR looks.
7. **UI fonts**: keep the project-owned Orbkin Pixel font; `@fontsource/*` pixel faces are
   fine fallbacks/secondary faces.
8. **Update `ASSETS.md`** with a provenance table (source repo, commit, path, licence) the first
   time any third-party asset lands; add a CC0/CC-BY-only guard (e.g. a test that every file in
   `public/assets/` has a provenance entry).
9. **Owner's machine** unlocks Mixamo, Poly Haven/ambientCG full libraries, Sketchfab CC0,
   Blockbench, Krita, Aseprite and blender-mcp. A short "owner fetch list" per milestone (exact
   URLs + target paths) is the efficient hand-off.

## 10. Open questions

- Does Blockbench's web build run headless under Playwright here (would allow Claude to author
  `.bbmodel` pixel-textured models and export glTF in-container)?
- Exact current Mixamo terms (2026) for committing derived/retargeted animations to a public repo.
- Whether Quaternius "Ultimate Monsters" (2024+) is mirrored in any reachable repo.
- Licence provenance of the LUT files in drei-assets.
- (resolved) pixeloe is Apache-2.0 per its PyPI metadata.

## Sources

- KayKit org & READMEs: https://github.com/KayKit-Game-Assets (e.g. https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0), https://kaylousberg.itch.io/kaykit-adventurers
- Quaternius mirror + licence table: https://github.com/trebeljahr/quaternius-showcase (`LICENSES.md`), https://github.com/J-Ponzo/gltf-universal-animation-library, https://github.com/J-Ponzo/gltf-medieval-village-megakit, https://quaternius.itch.io/lowpoly-animated-monsters, https://opengameart.org/content/textured-cute-monster-pack
- Kenney: https://github.com/KenneyNL, https://github.com/ETdoFresh/kenney.nl, https://forum.godotengine.org/t/kenneys-assets-free-and-creative-commons-cc0/36658
- Poly Haven: https://polyhaven.com/our-api, https://github.com/Poly-Haven/Public-API, https://github.com/Poly-Haven/polyhavenassets, https://github.com/pmndrs/drei-assets
- @pmndrs/assets: https://www.npmjs.com/package/@pmndrs/assets ; Fontsource: https://fontsource.org (npm `@fontsource/*`)
- Sketchfab: https://sketchfab.com/developers/download-api/guidelines, https://sketchfab.com/blogs/community/refine-downloadable-model-searches-with-new-license-filters
- Poly Pizza licences (secondary): https://app.cinevva.com/guides/free-3d-model-sites, https://gamefromscratch.com/poly-pizza-a-replacement-to-google-poly/
- Mixamo FAQ (Adobe community mirror): https://community.adobe.com/questions-696/mixamo-faq-licensing-royalties-ownership-eula-and-tos-589400
- Aseprite: https://aseprite.org/faq/, https://dev.aseprite.org/2016/09/01/new-source-code-license/, https://en.wikipedia.org/wiki/Aseprite
- ArmorPaint: https://digitalproduction.com/2026/09/12/armorpaint-1-0-swaps-haxe-for-c/, https://www.cgchannel.com/?p=178507
- Material Maker CLI: https://github.com/RodZill4/material-maker (`parse_args.gd`)
- Blockbench: https://github.com/JannisX11/blockbench ; gltf2bbmodel: https://zff.dev/PROMETHIA/gltf2bbmodel
- MagicaVoxel/Goxel (secondary): https://www.filehorse.com/download-magicavoxel-32, https://itch.io/devlog/611107/goxel-a-3d-voxel-editor-like-magicavoxel.amp
- blender-mcp: https://glama.ai/mcp/servers/@ahujasid/blender-mcp/blob/7636d13bded82eca58eb93c3f4cd8708dfdfbe8b/README.md
- LPC: https://github.com/LiberatedPixelCup/Universal-LPC-Spritesheet-Character-Generator
- Lospec tools: https://github.com/gagath/lospec-palette-scrapper, https://github.com/jmg-duarte/lospec-cli
- ambientCG downloader: https://github.com/alvarognnzz/ambientcg-downloader
- CC0 pixel tilesets: https://opengameart.org/content/16x16-overworld-tiles, https://rgsdev.itch.io/free-cc0-top-down-tileset-template-pixel-art
