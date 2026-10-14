# In-game A/B vertical slice: the candidate pipelines run through Orbkin's real renderer

Angle: stop guessing from scratch harnesses. Build ONE cave battle frame composed like the reference
(foe trainer by the lodge stair, rock kin vs fire kin, window shafts), swap one asset class at a time
in the **real game build** (`?gfx=hd2d`, `src/render/hd2d/*`, `sprite.ts`, the HD-2D post pipeline),
capture desktop 1280×720 and phone 393×851, record draw calls / triangles / frame time, and let
fresh-context Opus judges compare the frames **blind and pairwise** against each other and the
reference. Then name the pipeline per asset class.

Everything below marked **[run]** was executed in this container on 2026-10-14. Nothing was
committed; this angle changed nothing in the game repo (`git status` shows only an untracked `game/docs/GPU_PC_SETUP.md` from another session). All experiment files live in
`scratchpad/vslice/` (index in §11).

---

## 0. TL;DR (what this settles)

1. **The current procedural arena (A) beat every Blender-authored (B, B2) and CC0-kitbash (C, C2)
   shell decisively, on desktop and phone: 7 of 7 head-to-heads 3–0, judge confidence 4/5, mean score
   gap 1.3–1.8 points** [run]. Judges named the same cause every time: A's terraces read as clean,
   stepped tiers of crisp pixel blocks with lit tops; the B/C walls read as "noisy, smeared,
   photo-like rubble" that "hides the terraces". The win is **not** the authoring tool; it is the
   pixel-art **construction rules** A encodes (coursed tiers aligned to iso-lines, block-local
   texel-aligned UVs, a texel bevel = lit lip + dark seam, art-directed vertex AO and haze). Moving
   geometry to Blender without those rules made the frame **worse**; adding block-local texel UVs
   (B2/C2) helped a little (B2 beat C2 3–0) but still lost to A 3–0. **Prescribe the rules; Blender
   and CC0 kits are optional shape sources that must pass through them.** [high, n = 3 judges ×
   7 pairs]
2. **Baked lighting on top of the live cookie key hurts.** Full Cycles lightmap + live key
   (double-lit) lost to AO-only 3–0 (conf 4; L\*50 62.8 vs 44.8, light-band share 0.47 vs the
   reference's 0.22). Even the *correct* mixed mode (indirect-only lightmap = full − key-direct, live
   key keeps kin shadows, hemisphere off on the shell) lost to AO-only 3–0 (conf 3.3): physically
   calibrated bounce lifts the shadows and washes out the art-directed value structure. Fully baked
   vs indirect + live key: 3 ties. **Prescribe: no lightmaps by default; AO multiplies ambient only;
   keep the art-directed hemisphere + one live shadowing key.** [high]
3. **Creatures: the renderer matters more than the modelling tool at Orbkin's sprite size.** Same
   Blender SDF/remesh GLBs, live `sprite.ts` bake vs an offline Blender toon sprite: live won 3–0
   (conf 4). Code-built vs Blender SDF/remesh shapes through the same live bake: **no detectable
   difference** (desk 1–2, phone 2–1, conf 2–2.7). At 2× sprite density the code-built kin won 3–0
   (faces and eyes read better). Normals: crease-angle (current default) beat flat 3–0 for code
   kin; smooth beat flat 3–0 (low confidence) for GLB kin. This reconciles the conflict: Blender
   creatures look "clearly more professional" in 300–600 px review renders (creature-design,
   blender-llm) but **not** at 23–40 sprite texels, where face/eye/colour-block design and the
   live bake dominate (lab). [high for "no gain at sprite size"; medium for the 2× result]
4. **Sprite texel density is the biggest single lever found.** Doubling sprite texel density
   (people 44→88, kin 28→56, i.e. 1 internal px per texel at 640×360) won 3–0 for kin **and** 3–0
   for people, both conf 4, gap +1.7 points — larger than any asset-source effect. It contradicts
   `DECISIONS.md` ("texel density not raised"; the reference measures ~44–50/30). Treat as a strong
   candidate that needs the owner's taste call (VLM judges may simply prefer more detail). [medium]
5. **Resolution: keep the low-res integer grid on desktop, raise it on phones.** Desktop
   640×360 nearest ×2 vs native 1280×720 + MSAA ×4: **no detectable difference** (1–2, conf 2, gap
   0.1) at **8.7× the SwiftShader frame cost** (3919 vs 451 ms). Phone low tier 271×586 (4 device px
   per internal px) vs 541×1171 (2 device px): native won 3–0 (conf 4, gap +1.2; "crisper, consistent
   pixel grid, readable Pebblet") but costs 5.3× on SwiftShader (767 vs 145 ms). The phone tier, not
   the desktop one, is too coarse (caveats: sprite-size quantisation changed with the grid, §8; real
   phone GPU cost unmeasured). [medium-high]
6. **Surfaces: CC0 scans neither help nor hurt once palette-mapped.** Painter tile vs Poly Haven
   `cliff_side` pixelised to the cave ramp: 1–2 (conf 2, gap 0.17) = no detectable difference;
   painter tile shifted by the scan's height/AO mask: 3 ties. The baked convex-edge cue from Blender
   was also invisible (3 ties). **Keep the painters; scans are optional inputs, only via
   ramp-mapping.** [medium-high]
7. **Props: procedural kit props beat CC0 (KayKit Dungeon Remastered + Kenney Furniture Kit)
   restyled to Orbkin ramps 3–0** (conf 3): the code bookcases with varied coloured spines read as
   bookcases; the CC0 set looked "flat, washed-out, pasted on" after palette snapping. [medium]
8. **The judge gate works for pairwise decisions but not for absolute scores.** Calibration: an
   image vs a near-duplicate (0.7% pixels differ, only sprite animation frames) → 3/3 picked one but
   with confidence 1.7 and a 0.2-point gap; an image vs a degraded copy (no grade/bloom/rays) → 3/3
   correct, conf 3.7, gap 1.2. Position bias: the first-shown image won 41 of 81 decisive votes
   (51%). Absolute 1–10 scores were compressed to 6.5–7.0 for every desktop variant, including ones
   that lost pairwise by 1.5 points. **Rule for skills: pairwise, randomised order, ≥3 judges;
   decisive = 3/3 with mean confidence ≥3 and mean score gap ≥0.75; anything else is "no detectable
   difference".** [high for this setup]
9. **Costs.** A Blender shell adds no draw calls (one merged mesh per material: 46 vs 47) but
   1.8× the frame triangles (198k vs 111k incl. shadow pass), 4.5 MB raw GLB (0.92 MB meshopt), and
   bakes that, at 2048² with a properly packed atlas, take ~5 min (AO + edge) to ~14 min (with
   lightmaps) on a quiet 4-core CPU and ~35 min under this session's load, per arena. Lightmaps are the memory problem: AO + edge + a half-float lightmap at 2048² ≈ 87 MB of
   VRAM (≈ 22 MB at 1024²) for a frame the judges liked less.

---

## 1. The slice: what was built

### 1.1 Scratch build (never committed)
- `scratchpad/vslice/game/` = a tar copy of `game/` at `fa40185` (node_modules symlinked), built with
  `npx vite build --outDir scratchpad/vslice/build-vs*`. Diff vs the repo: `vslice/vslice.patch`
  (448 lines, 6 files): one new module `src/render/hd2d/vslice.ts` plus small hooks in `main.ts`
  (await `preloadVslice()` before the first scene), `creature.ts` (geometry override + normal mode),
  `arena.ts` (skip the procedural rock/ground/stone/reveal meshes or props when a shell/prop GLB is
  loaded), `pipeline.ts` (native resolution + MSAA), `hd2dBattle.ts` (sprite density multiplier).
- Frame: `?seed=5&scene=battle&route=ridge&hotspot=hiker-brann&gfx=hd2d&arena=cave` = Ridge Hiker
  Brann (foe trainer by the stair) leading with **Pebblet**, the player's **Ashkit**, the cave/quarry
  arena forced. Desktop `q=high` (640×360 grid), phone 393×851 @2.75 touch `q=low` (271×586).
- Capture: `vslice/capture.mjs` (Playwright, SwiftShader ANGLE, own static server; waits for
  `scene()==='battle'`, the FIGHT button, `waitIdle`, +1.5 s; then `benchFrames(5)` ×N,
  `renderInfo()`, load average). Bench: `vslice/bench.mjs` (interleaved variants, 3×`benchFrames(6)`).

### 1.2 URL switches added (scratch only)
| Switch | Effect |
|---|---|
| `env=b\|b2\|c\|c2` | replace the procedural rock terraces, floor, rubble/pebbles/stair and window reveals with a baked GLB shell |
| `lm=ao\|full\|ind\|bake`, `lmk=`, `lmres=half` | baked lighting on the shell (see §4) |
| `tex=paint\|scan\|scanmask` | rock surface source on the shell (§5) |
| `edgek=`, `seamk=` | strength of the Blender-baked convex-edge lip / AO seam (0 = off) |
| `kin=glb`, `norm=flat\|smooth` | Blender SDF kin GLBs for Ashkit + Pebblet; sprite-shading normals |
| `sprtex=2` | sprite texel density multiplier (people and kin) |
| `props=cc0` | CC0 lodge props instead of `kit/props.ts` |
| `render=native` | 1 device px per internal px on desktop (2 on phones) + 4× MSAA composer target |

### 1.3 Variants
| Id | What changed vs A0 (current game) |
|---|---|
| **A0** | current procedural cave (`buildCaveArena`: coursed terraces, boulder kit, painter atlases, vertex AO, texel bevel, haze) |
| **B** | Blender-authored kit: 14 generated rocks (skewed bevelled cube → subsurf → Voronoi + Clouds displacement → decimate ~126 tris) placed as staggered courses along the SAME iso-lines/tiers/window bays as A (505 stones), a heightfield floor, displaced rubble piles, slab stairs; Cycles-baked AO + convex-edge mask; world-space triplanar painter textures (`paintBoulder`, `paintDirt`) at TEXEL density with per-stone offset/tint |
| **B2** | B with **block-local texel UVs** (per-stone PCA frame, dominant-axis projection, 1 tile = 2 units = 32 texels) on TEXCOORD_0 and the bake atlas on TEXCOORD_1, i.e. A's texture pipeline (`NearestMipmapNearest`, mode-filtered mips) |
| **C / C2** | CC0 kitbash: Kenney Nature Kit `rock_large*/stone_large*` as course stones, `rock_small*` pebbles, KayKit Dungeon Remastered `rubble_large/half` piles and `stairs`, same layout and bake; C triplanar, C2 block-local UVs |
| **B_full / B_ind / B_bake** | B + full lightmap + live key / indirect-only lightmap + live key + hemisphere off on the shell / full lightmap with key and hemisphere off on the shell |
| **B_scan / B_scanmask** | B with the Poly Haven `cliff_side` scan as the rock tile / the painter tile shifted by the scan's height+AO |
| **K1 / K2** | Blender SDF/remesh Ashkit + Pebblet GLBs, default (crease) / flat sprite normals |
| **K0f / K0s** | code-built kin with flat / fully smooth sprite normals |
| **K0hi / K1hi** | code / GLB kin with `sprtex=2` |
| **T1** | the same GLBs rendered OFFLINE (Cycles 1-spp emission toon, 4× supersample, mode downsample, 1-texel outline) and composited on a kin-free plate of the K1 frame |
| **P1** | lodge props from KayKit + Kenney Furniture Kit, placed where A's props stand, colours snapped per piece to Orbkin ramps, one merged mesh |
| **R1 / B_native** | A / B rendered at native resolution + MSAA ×4 |
| **A0b / Aplain** | judge calibration: A0 re-captured (sprite frames differ) / A0 with `post=nograde,nobloom,norays,nopoints` |

Contact sheets: `vslice/sheets/01_env_desk.png`, `02_env_phone.png`, `03_light.png`,
`04_surfaces.png`, `05_render.png`, `06_kin.png`, `07_props.png`; every frame in `vslice/shots/`.

---

## 2. Judging method (and how much to trust it)

- `vslice/judge.py`: for each pair and judge, a fresh temp folder containing only `ref.png` (the
  quality bar), `A.png`, `B.png` (order randomised per judge, recorded) and optional `A_crop/B_crop`
  2× nearest crops. A fresh `claude -p --model opus --allowedTools Read` process reads them and must
  return `{winner, confidence 1–5, scoreA, scoreB (ref = 9), reasons}`. No file names, variant names
  or captions reach the judge. Focus prompts: env / kin / people / props / render / overall.
- **Environment hygiene:** the nested CLI inherits this session's remote-session variables; run
  judges with `CLAUDECODE, CLAUDE_CODE_SESSION_ID, CLAUDE_CODE_REMOTE_SESSION_ID,
  CLAUDE_CODE_POST_FOR_SESSION_INGRESS_V2, CLAUDE_CODE_TEE_SDK_STDOUT, CLAUDE_CODE_MESSAGING_*,
  CLAUDE_CODE_SYNC_SESSION_REFS, CLAUDE_CODE_CHILD_SESSION` unset, otherwise the child reports the
  parent's session id [run].
- Scale: 114 judge calls, 90 pairwise votes (30 pairs × 3), 24 absolute scores; ≈ $23 list-price
  equivalent reported by the CLI (≈ $0.20–0.42 per call); 1–2 min per call under load.
- Calibration [run]:

| Pair | Votes | Mean conf | Mean scores | Reading |
|---|---|---|---|---|
| A0 vs A0b (near-identical; 0.7% px differ, sprite frames only) | 3–0 | 1.7 | 6.53 / 6.33 | judges always pick *something*; low confidence + tiny gap = noise |
| A0 vs Aplain (grade, bloom, rays, points off) | 3–0 correct | 3.7 | 6.33 / 5.17 | real degradations are caught with high confidence |
| first-shown image won | 41 / 81 decisive votes | | | no position bias detected |
| absolute 1–10 vs ref | A0 7.0, B 6.5, C 6.67, R1 7.0, K1 6.83, P1 7.0 (desk); A0 5.67, B 5.83 (phone) | | | absolute scores are compressed and insensitive: B lost 3–0 pairwise by 1.5 points but scored 0.5 below A |

- Decision rule used below: **decisive** = 3/3 one way, mean confidence ≥ 3, mean score gap
  ≥ 0.75. **No detectable difference** otherwise (or 3 ties).
- Known biases: judges notice sprite *animation frames* (a mid-blink Pebblet cost A0b a vote), so
  kin pairs are noisier than environment pairs; VLMs plausibly favour "more detail", which matters
  for the density result (§6.4). This matches the literature on multi-image VLM position effects
  (CVPR 2025, "Identifying and Mitigating Position Bias of Multi-image VLMs") and swap-consistency
  practice in LLM-as-judge; we measured position effects instead of assuming them.

---

## 3. Environment authoring: procedural kit (A) vs Blender kit (B/B2) vs CC0 kitbash (C/C2)

### 3.1 Results [run]
| Pair (focus: environment) | Votes | Conf | Scores | Decisive? |
|---|---|---|---|---|
| A vs B, desktop | A 3–0 | 4.0 | 6.33 / 4.83 | **yes** |
| A vs C, desktop | A 3–0 | 4.0 | 6.33 / 4.83 | **yes** |
| A vs B, phone | A 3–0 | 4.0 | 5.83 / 4.50 | **yes** |
| A vs C, phone | A 3–0 | 4.0 | 5.83 / 4.00 | **yes** |
| A vs B2 (block UVs), desktop | A 3–0 | 4.0 | 6.50 / 5.00 | **yes** |
| A vs B2, phone | A 3–0 | 4.0 | 5.67 / 4.33 | **yes** |
| A vs C2, desktop | A 3–0 | 4.0 | 6.33 / 4.50 | **yes** |
| B vs C, desktop | B 2–1 | 2.3 | 5.83 / 5.50 | no |
| B vs B2 | B2 2–1 | 2.3 | 5.67 / 5.83 | no |
| B2 vs C2 | B2 3–0 | 3.0 | 5.83 / 4.83 | **yes** |
| B with vs without the baked edge/seam | 3 ties | 3.7 | 6.17 / 6.17 | no difference |

Judge reasons, condensed (verbatim fragments): A = "terraces read as clean stepped ledges with crisp
pixel brick texture and clear tier silhouettes"; B/C = "noisy, lumpy voxel chunks that blur the
terrace structure", "rubble looks smeared and photo-like", "left wall dissolves into foggy haze"
(phone), C = "chaotic, spiky low-poly boulders"; A's weakness = "ledges a bit too regular and
brick-like".

Objective metrics (`vslice/metrics.py`, playfield crop; `metrics_all.json`):

| Frame | L\*p10 | L\*p50 | dark / mid / light | colourfulness | detail CV |
|---|---|---|---|---|---|
| reference | 10.2 | 42.9 | 0.40 / 0.38 / 0.22 | 46.6 | 0.35 |
| A0 desk | 8.1 | 44.8 | 0.41 / 0.32 / 0.27 | 59.9 | 0.40 |
| B desk | 15.1 | 47.7 | 0.35 / 0.37 / 0.28 | 59.3 | 0.37 |
| C desk | 16.1 | 48.9 | 0.33 / 0.38 / 0.29 | 59.4 | 0.37 |

B and C lift the darkest tenth by ~7–8 L\* (the baked AO only multiplies *indirect* light, while A's
vertex AO and bevel darken albedo directly) and lose the dark mass the reference has. A is closest
to the reference's value structure; all Orbkin frames are more colourful than the reference
(60 vs 47).

### 3.2 Why A wins (diagnosis, so the skill can encode it)
1. **Tier legibility.** A emits each course as aligned, cut-stone blocks with a texel-quantised lit
   top band and dark seam (`addBevel`), so every terrace edge is one continuous bright line. Blender
   rocks with displacement and ±7° jitter break that line; the eye reads rubble.
2. **Texel-aligned block-local UVs.** World triplanar (B/C) slices the tile across stones and through
   mip LODs ("smeared"). Block-local UVs (B2/C2) fixed the smear (B2 beat C2 3–0) but not the form.
3. **Art-directed value design is in the code**: per-height haze, foreground darkening (`fore`),
   baked sky key per block (`CBAKE`), course tints — none of it comes free with a DCC tool.
4. **Bakes below the texel scale are invisible**: the Blender convex-edge mask at 2048² made no
   difference (3 ties) because at 640×360 one bake texel is far below one screen texel; A's bevel
   lives *in texture space at texel resolution*, which is why it reads.
5. CC0 kits carry their own style: Kenney rocks are 12–80-tri faceted lumps with grass tops,
   KayKit rubble piles are soft-lit stylised chunks; re-texturing does not change their silhouette
   language, which judges called "spiky" and "chaotic".

### 3.3 Caveat (fairness)
A is the product of 5+ refinement rounds; B/C/B2/C2 were each built and tuned within ~1–2 hours. The
result is therefore "a mature rule-based procedural kit vs a straightforward Blender/CC0 swap", which
is exactly the decision the owner faces. It does **not** show that Blender cannot reach A's quality:
a Blender kit that reproduces A's rules (aligned courses, block UVs, texel bevel in the texture,
art-directed bakes) is plausible, but that is the same work moved to a slower loop (minutes of bake
per change vs a 10-s rebuild).

---

## 4. Baked lighting vs the live cookie key (double-lighting test)

### 4.1 Setup [run]
- Bake rig calibrated to the game's lights (three r180 Lambert: out = albedo·E/π): key `SpotLight`
  175 cd, decay 1.2 at ~7.5 units → ≈ 4.97 × albedo in the pool → Blender spot ≈ 11 000 W
  (pass = P/(4π²r²)); hemisphere `#ffe0b8/#3a2214 × 1.75` → world gradient radiance 1.75/π × colour;
  fill `DirectionalLight 0.85` → sun strength 0.85; the small window got a real spot (free in a bake;
  the game fakes it with a decal). Mullions added as bake-only occluders.
- Maps: AO (64 spp, distance 0.8), convex edge (Bevel node vs true normal, EMIT bake), **full**
  (DIFFUSE, DIRECT+INDIRECT, no COLOR → light only), **key-direct** (DIFFUSE DIRECT with world, fill
  and second window off), **indirect = max(full − key-direct, 0)**. Saved as Radiance `.hdr`
  (RGBE) at 2048 and 1024.
- three: `lightMap.channel` = bake UV, `lightMapIntensity = π × lmk` (three multiplies lightmap
  irradiance by albedo/π; Blender's light pass is "albedo × pass"); `aoMap` multiplies indirect light
  only (verified in r180 `aomap_fragment`: `reflectedLight.indirectDiffuse *= ambientOcclusion`);
  hemisphere and spot contributions on shell materials scaled by patching
  `lights_fragment_begin` (`uHemiK`, `uKeyK`).

### 4.2 Results [run]
| Pair | Votes | Conf | Scores | Metric |
|---|---|---|---|---|
| AO-only vs full lightmap + live key (double-lit) | AO 3–0 | 4.0 | 5.83 / 4.17 | L\*50 47.7 vs 62.8; light share 0.28 vs 0.47 |
| AO-only vs indirect lightmap + live key (Unity "Baked Indirect" equivalent) | AO 3–0 | 3.3 | 6.17 / 5.00 | L\*50 54.5; "milky haze, bleached walls" |
| indirect + live key vs fully baked (key off on shell) | 3 ties | 3.3 | 5.83 / 5.83 | identical L\* stats; fully baked loses the kin's real-time shadow on the floor |

- Double-lighting is real and visible (burned pool, washed floor). The standard fix — bake indirect
  only and keep the mixed light's direct term live, as Unity's Baked Indirect mode does — removes the
  burn, but physically calibrated bounce still flattens the art-directed contrast. A lightmap would
  need its own grade (exposure/contrast per arena) to compete; that is an extra tuning loop with no
  demonstrated gain here.
- **Settles**: "baked lightmap vs AO-only under the cookie key" → AO-only (or A's vertex AO).
  Lightmaps are optional, for scenes with many static lights; if used, bake indirect-only, never
  stack a full bake under a live key.

### 4.3 Pitfalls hit (each cost a debug round) [run]
1. **The key contributed exactly 0.** The heightfield floor's hidden riser ramps (which A also has,
   hidden inside stones) sat between the window and the spot. Fix: make the floor shadow-invisible
   in the bake (`obj.visible_shadow = False`) — A's ground never casts either.
2. **7.5% atlas usage.** `smart_project` + `pack_islands` default margins on ~700 rock islands used
   7.5% of the atlas (each rock ≈ 12 px in 2048²). `island_margin=0` at unwrap +
   `pack_islands(margin_method='FRACTION', margin=0.0006, shape_method='CONCAVE')` → 65% (8.7× the
   texels; FRACTION is ~10× slower to pack, 2.4 → 12–36 s). Bake time scales with covered texels, so
   good packing made the bakes 8× slower.
3. Cycles counts world/sky light as **DIRECT**, so the INDIRECT pass alone is bounce-only (p50 0.03
   vs the game's ~0.5 ambient). The usable mixed map is full − key-direct.
4. Memory: 2048² RGBE `.hdr` = 11.7 MB per map on disk; `RGBELoader` uploads RGBA half-float =
   32 MB (+ mips 43 MB) of VRAM; AO and edge PNGs 2048² RGBA8 ≈ 22 MB each with mips. Use 1024²,
   pack AO + edge into one RG8/RGBA8, or bake AO into vertex colours.

---

## 5. Surfaces: painter tiles vs CC0 scans

- Scan: Poly Haven `cliff_side` (CC0; authors James Ray Cock, Jenelle van Heerden, Dario Barresi;
  md5 of the 1k diffuse/AO/displacement JPGs matched the API). `vslice/blender/tex_prep.py`:
  box-downsample to 32 px (2 units at TEXEL), luminance → `RAMPS.caveStone` (7 shades) with a
  centred 4×4 ordered dither only at band edges; scan height + AO → a 32 px mask. In-game
  `maskedPainter()` shifts the painter tile's ramp index by `round((mask − 0.5) × 3.2)`.
- Results [run]: painter vs scan **1–2** (conf 2.0, 6.00 / 6.17) = no detectable difference; painter
  vs scan-mask **3 ties** (conf 3.0). Metrics: detail CV 0.37 (paint) / 0.41 (scan) / 0.36 (mask).
- **Settles**: the three notes disagreed (procedural-texturing: scan height/AO are excellent inputs;
  hd2d-pixel: photo-to-pixel gives noise; agent-visual-method: CC0 scans read as real material). At
  Orbkin's texel density, *ramp-mapped* scans are neither noise nor a gain; raw photos were not
  tried in-game (hd2d-pixel showed they speckle). Keep the painters; allow scans only through
  ramp-mapping, as optional variety inputs.

---

## 6. Creatures (kin) and people

### 6.1 Assets [run]
- `vslice/blender/kin_build.py`: Ashkit and Pebblet rebuilt with the SAME proportions, palette,
  rig and model space as `designs.ts`: closed ellipsoids and sphere sweeps → join → voxel remesh
  0.012 → Smooth ×5 (Pebblet + Voronoi lumps) → per-vertex colour from the nearest primitive's paint
  rule → symmetric Decimate to budget (Ashkit 2,200 tris incl. 730 crisp; Pebblet 1,800) → crisp
  eyes/nose/flame/crystal parts with the game's rig encoded as `_RIGP/_RIGK/_RIGB` attributes
  (blink, ear twitch, tail wag). 2–3 s per species, 67–82 KB GLB (19 KB meshopt).
- Path A geometry swap (creature-design §7): `kinFromGltf` → `rigA/rigB/color`, grounded; the
  `CreatureView`, rig shader, blink/lunge/hit/faint and `SpriteBaker` work unchanged.
- Bug found: eyes placed at `surface + n·size·0.08` sank under the remeshed/displaced surface and read
  as squints at sprite size; `0.3·size` fixed it (re-captured).
- `norm=flat` sets `sNormal` to per-face normals (non-indexed), `norm=smooth` to position-merged
  smooth normals; default = the baker's crease-angle smoothing (66°).

### 6.2 Shape method vs renderer, separated [run]
| Pair (focus: creatures, 2× crops shown) | Votes | Conf | Scores |
|---|---|---|---|
| code-built vs Blender SDF, desktop | GLB 2–1 | 2.7 | 5.67 / 5.83 |
| code-built vs Blender SDF, phone | code 2–1 | 2.0 | 4.67 / 4.50 |
| SAME GLB: live `sprite.ts` bake vs offline Blender toon sprite | **live 3–0** | 4.0 | 6.50 / 5.00 |
| code vs GLB at 2× sprite density | **code 3–0** | 2.7 | 6.33 / 5.50 |
| GLB smooth vs flat | smooth 3–0 | 2.0 | 6.00 / 5.50 |
| code crease (current) vs flat | **crease 3–0** | 3.3 | 5.83 / 4.83 |

- The offline sprite (Cycles 1-spp emission toon, fixed key, 4× mode downsample, outline; lab 08
  recipe) lost because it lacks what the live bake does per arena: palette snap, five-tone ramp lit
  from the **arena's** key, key-side rim, near-black selective outline, and the right facing per
  camera — judges called it "a smooth-gradient grey egg that clashes with the pixel style". Caveat:
  a tuned offline pipeline (pseudo-pixel) could close part of that gap, but it would still not
  follow the arena light.
- **Settles** the creature conflict: lab (Blender toon render no better at sprite size) is right
  for the renderer; creature-design / blender-llm ("SDF creatures clearly more professional") are
  right only for large review renders. At 23–40 sprite texels, shape method is not the lever; face
  placement for the battle camera, eye size, colour blocks and the live bake are.

### 6.3 Normals
Crease-angle smoothing (current) > flat for code-built kin (decisive). For dense GLB bodies,
smooth/crease > flat (not decisive). Faceted normals only make sense for intentionally faceted kin
(the `facet`/`plates` options already handle stone kin).

### 6.4 Sprite texel density (people and kin) [run]
| Pair | Votes | Conf | Scores |
|---|---|---|---|
| kin at 1× (28/34/40 texels) vs 2× | **2× 3–0** | 4.0 | 5.17 / 6.83 |
| people at 1× (44) vs 2× (88) | **2× 3–0** | 4.0 | 5.00 / 6.67 |
Reasons: at 1× "heavy black outlines, muddy face blobs"; at 2× "readable eyes, clean silhouettes".
Cost: no extra draw calls (sprite targets are 2× larger; frame time within noise on SwiftShader).
This is the largest quality effect in the study and it is cheap. It conflicts with the documented
choice (match the reference's ~44–50 / 30 texels). Prescribe it as a **tunable to decide with the
owner** (try 1.5×), not as a rule: VLM judges may over-reward detail, and chunkier sprites are part of
the HD-2D/GBA identity.

### 6.5 Trainers
Not source-swapped in this slice (no CC0 or Blender person was integrated). Evidence by analogy:
the live bake beats offline sprites, and people gained the most from 2× density. Recommendation:
keep `characters.ts` figures + live bake; test density first; Blender people optional and untested.

---

## 7. Props: procedural kit vs CC0 restyled [run]
- `vslice/blender/props_build.py`: KayKit Dungeon Remastered (`table_medium_decorated_A`,
  `table_long`, `box_large`, `barrel_large/small`, `crates_stacked`) + Kenney Furniture Kit
  (`bookcaseClosedWide` + `books`, from the official kenney.nl zip; only `License.txt` and 8 GLBs
  extracted after listing the archive), placed at A's prop positions, per-corner base colour sampled
  from the kit texture/material and snapped **per piece** to chosen Orbkin ramps (wood, plank, steel,
  books…), joined into one mesh (8.5k tris, 505 KB raw / 100 KB meshopt), 1 extra draw call.
- First attempt with nearest-colour snapping over the *whole* palette turned the bookcases plaster
  cream; per-piece ramp assignment fixed that. Orientation and scale needed one review pass each
  (Kenney bookcases face −Y; KayKit tables need fit-by-length).
- Result: procedural props 3–0 (conf 3.0, 6.33 / 5.67): "A's bookcases have real depth, shaded
  frames and varied coloured spines"; CC0 "flat, washed out, repeated pattern; crates look pasted on".
- **Prescribe**: keep `kit/props.ts`; CC0 props only for objects the kit lacks, restyled per material,
  reviewed in-game.

---

## 8. Rendering resolution [run]
| Pair (focus: rendering) | Votes | Conf | Scores | SwiftShader frame (load) |
|---|---|---|---|---|
| A desktop: 640×360 ×2 vs native 1280×720 + MSAA4 | native 2–1 | 2.0 | 6.67 / 6.77 | 451 ms (9.7) vs 3919 ms (16.8) |
| B desktop: low-res vs native | low-res 2–1 | 2.3 | 6.17 / 6.17 | — |
| A phone: 271×586 (4 dev px) vs 541×1171 (2 dev px) | **native 3–0** | 4.0 | 5.33 / 6.50 | 145 ms vs 767 ms (5.3×, bench, load 8–9) |

- Desktop: no detectable difference; native costs ~8.7× on SwiftShader (fill-rate; on a real GPU the
  ratio is smaller but the phone budget is fill-rate bound). Native makes texels clean 2×2 squares
  and geometry edges smooth, but the stones then read more "voxel mosaic".
- Phone: the current low tier (300 px tall target, 4 device px per texel on a DPR 2.75 phone) is too
  coarse: "smeared, inconsistent pixel size, Pebblet a dark blob". Caveat: the sprite pixel size is
  `round(screenH / texelHeight)` internal px, so the grid change also changed sprite scale; part of
  the win may be sprite size.
- **Settles** the resolution conflict: DECISIONS' low-res integer grid stays on desktop (and
  threejs-render's native + MSAA is not worth 8× cost there); on phones target **2 device px per
  internal px** (≈ 540–600 internal height on a 393×851 @2.75 device) if the GPU budget allows,
  else 3 px. Measure on a real phone before shipping.

---

## 9. Costs (all SwiftShader on 4 shared cores; compare ratios)

| Variant | Calls desk / phone | Frame tris desk | Shell tris | Asset bytes (raw → meshopt) | Bake (2048², quiet est. / measured under load 15–20) |
|---|---|---|---|---|---|
| A0 procedural | 47 / 41 | 111k | (78k rock, generated at load) | 0 (code) | none |
| B Blender kit | 46 / 40 | 198k | 103k | 4.45 MB → 0.92 MB GLB; AO 6.3 MB + edge 6.8 MB PNG | AO ~3 min / 5.4 min; edge 2.7 min; full LM ~6 min / 18.8 min; key-direct 8.6 min |
| B2 (2 UV sets) | 46 / 40 | 198k | 103k | 6.2 MB GLB; AO 1.7 MB + edge 1.8 MB (1024²) | AO 2.3 min, edge 0.9 min (1024², loaded) |
| C CC0 kitbash | 46 / 40 | 134k | 71k | 4.95 MB GLB | AO 9.3 min, edge 2.7 min (loaded) |
| K1 GLB kin | 47 / 41 | 116k | — | 82 + 68 KB (19 KB meshopt each) | build 2–3 s/species |
| P1 CC0 props | 49 / 42 | 118k | 8.5k props | 505 KB → 100 KB | build 3 s |
| R1 native | 46 / 40 | 105k | — | — | — (frame 8.7× A0 desktop) |

Frame times (`bench.mjs` round 0: `benchFrames(6)`, min of 3 runs; 1-min load average in brackets):

| Variant | desktop 640×360 | phone 271×586 |
|---|---|---|
| A0 current | 451 ms (9.7) | 145 ms (8.9) |
| B shell, AO | 1128 (15.2) | 220 (8.3) |
| B shell, indirect LM | 968 (15.1) | 150 (8.1) |
| C shell, AO | 1026 (14.9) | 255 (7.3) |
| K1 GLB kin | 791 (12.8) | 158 (8.1) |
| P1 CC0 props | 884 (13.4) | 172 (7.7) |
| K0hi 2× sprite density | 663 (10.1) | 146 (7.4) |
| R1 native (1280×720 / 541×1171) | 3919 (16.8) | 767 (8.4) |
| B native | 5251 (18.0) | 1106 (7.4) |

Phone rows ran at a steadier load (7–9) and are the more comparable set: the shells cost +0–75%
(B_ind 150 vs B_ao 220 for nearly identical scenes shows the noise), kin/props/density changes are
within noise, and the 2-device-px phone grid costs **5.3×** (767 vs 145 ms). The machine
ran other agents (load 9–20 on 4 cores), so B/C vs A cannot be separated from load here. Earlier
single captures at lower load gave A0 322 ms (load 2.5) vs B 316–351 ms (load 3.5–3.9) on desktop
and A0 97 ms (2.9) vs C 136 ms (4.1) / B 156–159 ms (5.6–8.5) on phone: roughly +0–10% on desktop
and +40–60% on the phone tier for the shell's extra ~90k triangles, confounded by load. Native
resolution is the only clear, load-independent cost multiplier (fill-rate, 4× the pixels).
VRAM (estimate, uncompressed): A ≈ < 2 MB of canvas textures; B + lightmap ≈ 87 MB at 2048², ≈ 22 MB
at 1024².

---

## 10. Decision table (per asset class)

| Asset class | Recommended pipeline | Evidence (this slice) | Skills should PRESCRIBE | Leave OPTIONAL |
|---|---|---|---|---|
| **Arena shell** (terraces, walls, floor, rubble, stairs) | Keep the code kit (`kit/rock.ts`, `coursedTerrace`, `VoxelBatch`, painters); improve it in code | A beat B/B2/C/C2 in 7/7 pairs, all 3–0 at conf 4 (desk + phone) | coursed tiers along iso-lines; block-local texel-aligned UVs at TEXEL; texel bevel (lit lip + dark seam) in texture space; vertex AO multiplying albedo; haze/foreground value rules; one merged mesh per material; in-game A/B before adopting any new source | Blender-authored hero shapes (arches, stalactites, unique set pieces) **only** with block UVs + the same bevel/AO rules; CC0 rocks as blockout reference |
| **Arena lighting** | One live shadowing cookie key + art-directed hemisphere + fill; AO only | AO beat full-lightmap (double-lit) 3–0 and indirect-lightmap 3–0; fully baked = indirect (3 ties) | never stack a full lightmap under a live key; AO multiplies ambient only; keep the grade per arena | lightmaps (indirect-only, ≤1024², graded) for many-static-light scenes; Cycles bakes as a *look-dev reference* |
| **Surfaces** | Procedural painter tiles + palette-preserving mips | scan 1–2 (n.s.), scan-mask 3 ties, baked edge 3 ties | one texel density; ramps; no raw photos; no linear filtering | CC0 scans (Poly Haven/ambientCG) as ramp-mapped variety inputs |
| **Kin** | Code-built designs (or any mesh) → **live `sprite.ts` bake**; crease normals | live bake beat offline Blender sprite 3–0; code vs SDF GLB n.s.; code won at 2×; crease beat flat 3–0 | design rules (battle-camera eye size/placement, 3 colour blocks, signature part); live bake; review at in-game sprite size, not in Blender renders | Blender SDF/remesh modelling for species that need organic forms primitives cannot make (must win an in-game A/B); skinned clips later |
| **Sprite density** | Make texel density a tunable; trial 1.5–2× | 2× won 3–0 for kin and people (conf 4) | decide with the owner; keep one shared sprite pixel size per frame | the exact multiplier |
| **Trainers / people** | `characters.ts` figures + live bake | indirect (people density 3–0; renderer result) | same as kin | Blender/CC0 people (untested here) |
| **Props** | Code kit (`kit/props.ts`) | code beat CC0 restyled 3–0 | per-material ramps; readable colour accents (book spines) | CC0 props for missing objects, restyled per piece, in-game review |
| **Render resolution** | Desktop: 640×360 integer grid (keep). Phone: move from 4 toward 2–3 device px per internal px, validated on a real phone | desktop native n.s. at 8.7× cost; phone 2-px grid won 3–0 (conf 4) at 5.3× SwiftShader cost | integer grid; one pixel size for sprites; measure phones | native + MSAA (no gain on desktop at 8.7× cost) |
| **Verification gate** | In-game captures + blind pairwise Opus judges (≥3, randomised order) + metrics | calibration §2 | decisive rule (3/3, conf ≥3, gap ≥0.75); judge hygiene (fresh process, no names, env vars unset); calibration pair per session | absolute 1–10 scores (insensitive) |

---

## 11. Files and reproduction (all under `scratchpad/vslice/`)

| Path | What |
|---|---|
| `game/`, `vslice.patch` | scratch copy of the game + the 448-line diff (switches above) |
| `capture.mjs` | `node capture.mjs BUILD_DIR OUT NAME "query" desk\|phone\|both RUNS` |
| `bench.mjs`, `bench.jsonl` | interleaved frame-cost bench |
| `judge.py`, `plan*.json`, `judge*.jsonl`, `judge_summary.py`, `judge_summary.txt` | blind pairwise judges and results |
| `metrics.py`, `metrics_all.json` | L\*, notan, colourfulness, detail CV, focal ratios, 2×2 blockiness vs the reference |
| `blender/vs_common.py`, `blender/cave_env.py` | layout mirror of `buildCaveArena`, kit generators, marching-squares iso-lines, coursed placement, ground heightfield, block UVs, lightmap UV packing, AO/edge/full/key-direct bakes, HDR export, GLB export |
| `blender/kin_build.py` | SDF/remesh kin with rig attributes |
| `blender/kin_toon_sprite.py`, `kin_toon_post.py`, `plate.mjs` | offline Blender toon sprite + kin-free plate compositing |
| `blender/props_build.py` | CC0 props placement + per-piece ramp restyle |
| `blender/tex_prep.py` | CC0 scan → ramp tile + mask |
| `blender/kit_sheet.py`, `sheet.py` | Workbench contact sheets of kit pieces |
| `env_b/`, `env_b2/`, `env_c/`, `env_c2/`, `kin/`, `props/` | GLBs, bakes, previews, meta.json timings |
| `shots/`, `sheets/`, `cmp_*.png` | all frames, contact sheets, crops |

Commands: `BPY=scratchpad/bpyenv/bin/python; $BPY blender/cave_env.py -- --kit b --out env_b
--size 2048 --ao-spp 64 --lm-spp 128 [--blockuv] [--ao-only]`; `$BPY blender/kin_build.py --
--species ashkit --out kin`; `python3 judge.py plan2.json judge2.jsonl --judges 3 --par 4`.

CC0 sources used (none committed; record in `game/ASSETS.md` if ever adopted): Kenney Nature Kit +
Modular Cave Kit (via the `shorepine/kenney` GitHub mirror at `3694c68`, CC0 per Kenney's
`LICENSE.txt`), Kenney Furniture Kit 2.0 (official kenney.nl zip, `License.txt`: CC0), KayKit
Dungeon Remastered 1.0 (github.com/KayKit-Game-Assets, `LICENSE.txt`: CC0, Kay Lousberg), Poly Haven
`cliff_side` (CC0).

---

## 12. Implications for Orbkin

1. **Do not migrate the arenas to Blender or CC0 kits.** The in-game evidence says the procedural
   kit with its pixel-art rules is better than a direct swap, by a wide, consistent margin. Spend
   arena effort on the rules: wall legibility (tiers), value structure (keep the darks), fewer,
   bigger rock planes (art-direction notes), not on the authoring tool.
2. **Treat Blender as a shape and look-dev tool, not a pipeline replacement.** Use it where code
   primitives cannot make the form (organic hero props, unique set pieces, maybe evolved kin), and
   import through the same rules (block UVs at TEXEL, the texel bevel, vertex AO). Every such asset
   must win an in-game blind A/B before it ships.
3. **No lightmaps.** Keep AO baked in vertex colours / texture bevels; never put a Cycles lightmap
   under the live key. If a future scene needs baked GI, bake indirect-only at ≤1024² and grade it.
4. **Kin: keep the live bake and the code designs; invest in design rules and sprite density.** The
   highest-value next experiment is a 1.5× / 2× sprite-density pass reviewed with the owner.
5. **Phones: raise the low tier** toward 2 device px per internal px and re-check sprite scale and
   frame time on a real device.
6. **Make the in-game blind A/B a standing gate** (`capture.mjs` + `judge.py` + `metrics.py` as a
   skill script), with a calibration pair each session and the decisive rule above.
7. Keep the toolchain knowledge that worked (bpy kit generation, iso-line placement, bakes, GLB
   export, glTF two-UV-set handling, judge harness) in the skills as *optional* techniques with the
   pitfalls in §4.3, §6.1 and §7.

---

## 13. Open questions

1. Would a Blender kit that fully reproduces A's rules (aligned courses, texel bevel painted per block,
   art-directed vertex AO) beat A? Untested; it would show whether shape freedom adds anything once
   the rules are equal.
2. Is the 2× sprite-density preference real for humans, or a VLM "more detail" bias? Needs the
   owner's eye and a 1.5× variant.
3. Real-phone frame time and VRAM for the 2-px phone grid (SwiftShader cannot answer it).
4. A graded indirect lightmap (contrast and exposure re-tuned per arena) was not tried; it might tie
   with AO-only, but it would not beat it on cost.
5. Trainers from Blender or CC0 characters were not integrated; animation-frame noise in kin
   judgments was not controlled (freeze the idle clock or judge several frames).
6. A tuned offline sprite pipeline (pseudo-pixel style, palette lock, arena-matched key) vs the live
   bake: the quick offline pass here lost clearly, but a tuned one might reach parity for pre-rendered
   cut-ins and bestiary art.

---

## 14. Sources

Primary (read or run here):
- three.js r180 shader chunks in `game/node_modules/three/src/renderers/shaders/ShaderChunk/`:
  `aomap_fragment.glsl.js` (AO multiplies `indirectDiffuse`), `lights_fragment_maps.glsl.js`
  (`lightMapIrradiance = lightMapTexel.rgb * lightMapIntensity`), `lights_fragment_begin.glsl.js`.
- three.js `RGBELoader`/`HDRLoader` (r180 examples; HalfFloat default): https://threejs.org/docs/pages/HDRLoader.html
- three.js forum on `texture.channel` (r151+ UV sets): https://discourse.threejs.org/t/documentation-what-exactly-is-texture-channel-for/81168
- Blender pack-islands FRACTION margin (added in 3.4, ~10× slower): https://developer.blender.org/rBc2256bf7f714bbd41388af3e184b3d84b496fbf3
- Unity Baked Indirect / Shadowmask / Subtractive mixed lighting (mixing real-time direct with baked
  indirect; Subtractive needs a shadow colour hack): https://docs.unity3d.com/Manual/lighting-mode.html ,
  https://docs.unity3d.com/es/Manual/LightMode-Mixed-BakedIndirect.html ,
  https://docs.unity3d.com/es/Manual/LightMode-Mixed-Subtractive.html (search summaries; the site was unreachable here)
- KayKit Dungeon Remastered 1.0 (CC0): https://github.com/KayKit-Game-Assets/KayKit-Dungeon-Remastered-1.0
- Kenney Furniture Kit (CC0): https://kenney.nl/assets/furniture-kit ; Kenney mirror: https://github.com/shorepine/kenney
- Poly Haven API + `cliff_side` (CC0): https://api.polyhaven.com/files/cliff_side , https://polyhaven.com/license
- Position bias in multi-image VLMs (CVPR 2025): https://openaccess.thecvf.com/content/CVPR2025/papers/Tian_Identifying_and_Mitigating_Position_Bias_of_Multi-image_Vision-Language_Models_CVPR_2025_paper.pdf

Secondary (search summaries, lower confidence):
- Octopath Traveler developers on resolution/saturation hurting pixel-art appeal and on raising tile
  variation density: https://www.siliconera.com/project-octopath-traveler-developers-answer-project-started-troubles-developing-hd-2d/ ;
  Octopath II map resolution: https://www.unrealengine.com/en-US/developer-interviews/octopath-traveler-ii-builds-a-bigger-bolder-world-in-its-stunning-hd-2d-style
- Vertical slice as a final-quality benchmark of one representative section: https://en.wikipedia.org/wiki/Vertical_slice , https://gameworldobserver.com/?p=21895
- Babylon.js forum on KTX2 UASTC/ETC1S lightmap quality: https://forum.babylonjs.com/t/lightmaps-as-ktx2-uastc-encoding/23944

Internal notes this builds on: `research/lab.md` (§8 sprite verdict, §7 capture harness),
`research/creature-design.md` (§6–7 SDF kin, path A), `research/hd2d-pixel.md` (§9–10, §14 Kenney and
scan tests), `research/threejs-render.md` (§3.1 native vs low-res, §4.4 lightmaps), `research/procedural-texturing.md`,
`research/art-direction.md` (§3 metrics), `research/skills-format.md` (§9 nested `claude -p`).
