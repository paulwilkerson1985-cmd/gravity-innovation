# Audit 1 — skeptical check of 159 research claims

Date: 2026-10-14. Auditor: independent pass over the notes in `scratchpad/research/*.md`.
Scratch for this audit: `scratchpad/audit1/` (scripts `engines.py`, `eevee1.py`, `sculpt.py`,
`qf_alpha.py`, `qf2.py`, three.js tarballs under `pk/`).

## Method and limits

- Hands-on re-tests with the pip `bpy` 5.2.2 venv and node 22, GLB inspection with the lab's
  `glbinfo.py`, npm registry metadata, `npm pack` of three 0.182/0.183/0.186, raw.githubusercontent
  reads, `curl` reachability, WebFetch on docs pages.
- **Machine was heavily loaded during the audit (load average 22 on 4 cores)**, so every timing I
  measured is inflated. I compare orders of magnitude, not the notes' exact seconds.
- **WebSearch was unavailable (per-turn budget exhausted) and WebFetch fails with DNS errors for
  siliconera, unrealengine.com, gamedeveloper.com, helpx.adobe.com, blender.org, sol.sbc.org.br,
  api.github.com (403 via proxy).** Claims whose only source is one of those pages could not be
  re-fetched; they are marked *plausible* (secondary source cited, consistent with my prior
  knowledge) rather than confirmed. GitHub REST via `gh` is repo-scoped in this session and refused
  non-attached repos; `raw.githubusercontent.com` and github.com HTML (WebFetch) worked.
- Verdict scale: confirmed (independent evidence reproduced or primary source read), plausible
  (consistent, not independently reproduced), doubtful (could not reproduce, or internal
  inconsistency), refuted (contradicted by evidence).

## Headline findings (what a reader should take away)

1. **The artifact claims are real.** `e3_final.glb` is 112,416 B, 1,720 triangles, Draco + WebP;
   `e5_diorama_baked.glb` is `KHR_materials_unlit` with a 559 KB PNG lightmap; `e7_kin_rigged.glb`
   has an 11-joint skin and an `Idle` clip; the lab's `04_labkin_anim.glb` has 13 joints, `Idle` +
   `Hop` clips and a `Squash` morph target. Three.js screenshots of them exist.
2. **All three Blender engines render headless here** (Mesa EGL packages present:
   `libegl-mesa0 25.2.8`, `libgl1-mesa-dri`). But EEVEE is slow on llvmpipe: 256² Suzanne at EEVEE
   defaults (64 TAA samples, shadows, raytracing) took **150 s**; with 1 TAA sample and features off,
   29.6 s cold / 5.8 s warm (loaded machine). Cycles 1 spp: 2.8 s whole-process; Workbench 0.2–0.4 s.
   The notes' "8–9 s per cold EEVEE process" is plausible on an idle box with 16 samples; the
   "Cycles is the fast quality engine" conclusion holds.
3. **Sculpt brush strokes do not run headless**, but the failure I get is
   `bpy.ops.sculpt.brush_stroke.poll() failed, context is incorrect`, not a segfault.
4. **QuadriFlow "almost always refuses voxel-remesh output" did not reproduce.** Two fresh runs
   (joined spheres and a 7-element metaball, voxel 0.02, no prescale) both remeshed to ~1,950 quads
   in 3–5 s; minimum edge length was 4e-4 (> the 1e-4 threshold the notes cite). The refusal is
   condition-dependent (very small voxel size relative to object), not the default.
5. **Skin-modifier "high valence → non-manifold holes" did not reproduce** at valence 6 (0
   non-manifold edges). Also condition-dependent.
6. **Cycles alpha binarity confirmed**: 16 spp gives 2.7–4.4 % fractional-alpha pixels even with
   BOX filter width 0.01; 1 spp gives 0.00 %.
7. **Three.js version facts confirmed from the packages**: `KHR_meshopt_compression` is absent in
   0.182.0 and present in 0.183.0; `LightProbeGridWebGL` (with `bake(renderer, scene, {bounces})`)
   ships in 0.186.1 under `examples/jsm/lighting/`; `RenderPixelatedPass` defaults are 0.3/0.4 with a
   `MeshNormalMaterial` override; TSL `TriplanarTextures.js` is in r180 `src/nodes/utils`; the Basis
   transcoder gzips to 245 KB (wasm) + 15 KB (js) ≈ 260 KB; `postprocessing@6.39.5` peers
   `three >=0.168.0 <0.187.0`; r181–r186 exist (r186.0 2026-09-08).
8. **Claude Code skill docs confirm**: 5,000-token-per-skill / 25,000-token re-attach after
   compaction; six portable frontmatter fields (`name, description, license, compatibility,
   metadata, allowed-tools`) with a hard error for others on upload; listing budget 1 % of the
   context window (`SLASH_COMMAND_TOOL_CHAR_BUDGET` / `skillListingBudgetFraction`), descriptions
   dropped "starting with the skills you invoke least"; 1,536-char cap per entry.
9. **Self-attested gates**: the experiment folders show Opus wrote `GATE.txt = PASSED-SILHOUETTE`
   (faked) and Haiku refused; claim 52 is confirmed by the artefacts.
10. **Reference image is a 4× upscale**: `hd2d/reference.png` is 2000×1299 and the edge
    autocorrelation peaks at lags 4, 8, 12 (0.82/0.87/0.73) → native ≈ 500×325.
11. **Lumina** (`neimad-mp/Lumina`) exists: three.js r186, runtime-generated textures, README says
    "started as a procedural demo built with Opus 5.5" (Opus 5.5 is a real model per the Claude
    models page). The repo screenshot `emberfall-golden-hour.jpg` is clearly at a high HD-2D bar.
12. **Bruno Simon folio-2025**: `sources/Game/Ligthing.js` imports `three/webgpu` and `Fn` from
    `three/tsl` with a `shadowColor` uniform — a custom TSL lighting model, confirmed.
13. **Free assets**: `pmndrs/drei-assets/hdri` has exactly 12 `.hdr` files; `@pmndrs/assets` is
    CC0-1.0 and `@fontsource/press-start-2p` OFL-1.1 on npm; KayKit org shows 10 repositories;
    `ETdoFresh/kenney.nl` mirror exists (CC0, ≥100 folders shown); quaternius-showcase README says
    32 packs / 1,513 models (notes say 1,545 files). Reachability now: api.polyhaven.com 200,
    ambientcg.com 200, kenney.nl 200, download.blender.org 200, threejs.org 200; poly.pizza 403;
    opengameart unreachable.
14. **Internal inconsistency**: hd2d-pixel.md says Cycles renders 128-px sprite passes in "about
    10 ms per frame", lab.md measured 0.05–0.12 s per frame at 48 px for the same 1-spp set-up.
    The 10 ms figure is doubtful.
15. **blender-kiln** exists (MIT, Claude Code plugin, docs/benchmarks.md with a measured bench,
    `fidelity_check.py`). "Best public skill" and "every rule comes from a measurement" are
    overstatements I cannot verify. `ahujasid/mcp-for-blender` README confirms the rename from
    `blender-mcp`; kiln's README names the Blender Foundation's "official Blender Lab MCP" as the
    server behind Claude's Blender connector (blender.org itself unreachable here).

## Per-claim verdicts

Format: `N verdict — evidence`.

1 confirmed — glbinfo: 112,416 B, Cube.005 5,160 indices = 1,720 tris, 2,646 verts, extensions Draco + EXT_texture_webp (needs DRACOLoader); e6_threejs.png exists.
2 plausible — e1_grid.png shows seams on the "soup" column and one fused skin on the SDF/metaball columns; "main reason creatures look cheap" is a judgement.
3 plausible — exp2_creature.py is 207 lines but imports a 191-line kit.py; e2_cycles/e2_toon/e2_sprite96 renders exist. "Game-quality" is a judgement.
4 confirmed — re-ran exp4_sprites.py: 8 directions at 72 px in 0.78 s on a loaded box (notes 0.57 s); Workbench 256² renders 0.2–0.4 s here.
5 plausible — brush_stroke fails headless (poll() failed, context incorrect), not a segfault in my run; the practical conclusion (no stroke sculpting; use SDF/GN/numpy/Displace) holds.
6 confirmed — dpkg shows libegl-mesa0/libgl1-mesa-dri installed; EEVEE and Workbench rendered; Cycles 1–16 spp 2.8–4.1 s vs EEVEE 150 s (defaults) / 5.8 s warm (1 sample) at 256².
7 confirmed — e5_diorama_baked.glb: KHR_materials_unlit + 559 KB PNG; e6_baked_threejs.png exists. Static scenes only.
8 plausible — repo exists (MIT, verified-on-5.2 badge, benchmarks.md describes a measured bench); "best" and "every rule" not verifiable.
9 plausible — mcp-for-blender README confirms rename and that it is third-party; kiln README names the official Blender Lab MCP as the server behind Claude's Blender connector. "Adds nothing headless" is reasoned (both need a running Blender instance), not tested.
10 plausible — matches showcases.md tiering and the Lumina counter-example; not independently re-surveyed.
11 plausible — generic process claim; api.py lookup helper exists.
12 confirmed — e7_kin_rigged.glb (11 joints, Idle) and lab 04_labkin_anim.glb (13 joints, Idle+Hop, Squash morph); e7_idle_frames.png rendered in three.
13 confirmed — repo exists, r186, procedural textures, README credits Opus 5.5 (real model); screenshot viewed is at a high HD-2D bar. Caveat: repo screenshot, not a live render here.
14 plausible — consistent with Lumina docs (49 agents, 21.2M tokens) and kiln; not re-surveyed.
15 plausible — consistent with folio-2025 (gltf-transform scripts) and the lab; "doesn't make organic creatures better on its own" is a judgement.
16 confirmed — e1_grid.png and showcases_exp/fox_fused.png; voxel remesh ran headless in my tests.
17 plausible — EEVEE renders here; my timings (29.6 s cold / 5.8 s warm at 1 sample, 150 s at defaults, load 22) are consistent with 8–9 s cold on an idle box; Cycles 0.9 s plausible.
18 plausible — showcases.md tier D analysis; not re-verified.
19 confirmed — reference.png 2000×1299 with 4-px edge periodicity (autocorr 0.82/0.87/0.73 at lags 4/8/12) → ~500×325; Lumina README states full-resolution rendering.
20 plausible — repos pcr/srak are cloned locally and showcases.md describes the code; I did not re-read the shaders.
21 plausible — synthesis of brief structure; no counter-evidence.
22 confirmed — blender-kiln (MIT) ships fidelity_check.py gates; blender-game-skills cloned locally.
23 confirmed — e8_360p vs e8_360p_x2 experiment exists; physically unavoidable. Style preference is separate.
24 confirmed — three r180 has Neutral/AgX/ACESFilmic; Khronos PBR Neutral is hue-preserving by design, ACES skews hue, AgX desaturates (established).
25 plausible — r181–r186 exist (npm dates 2025-10-31 … 2026-09-08); "low risk" not tested.
26 confirmed — LightProbeGridWebGL.js in three 0.186.1 examples/jsm/lighting with bake(renderer, scene, {bounces}); the 224-probe/4.9 s number is the notes' measurement.
27 confirmed — Cycles bake buffers are float; 8-bit PNG clips >1.0 unless the view transform is applied (established).
28 confirmed — folio-2025 sources/Game/Ligthing.js imports three/webgpu and Fn/uniform/mix from three/tsl, shadowColor uniform; three ^0.183.2.
29 confirmed — npm: postprocessing@6.39.5 (latest) peer three >=0.168.0 <0.187.0.
30 plausible — standard techniques; RenderPixelatedPass confirmed in r180.
31 plausible — WebGPU cannot be tested here; folio-2025 ships WebGPURenderer.
32 plausible — judgement.
33 confirmed — artifacts in exp/out, lab/out, pipeline/; my own bpy runs; @gltf-transform/cli 4.5.1 on npm.
34 plausible — judgement.
35 confirmed — GLTFLoader 0.182.0 has only EXT_meshopt_compression; 0.183.0 adds KHR_meshopt_compression. "Meshopt beats Draco for animated" plausible.
36 confirmed — gzip sizes: basis_transcoder.wasm 245,397 B + .js 15,084 B ≈ 260 KB; ETC1S damage to pixel art is the notes' test; 4–8× VRAM is standard.
37 plausible — not re-tested.
38 plausible — not re-tested.
39 confirmed — lab GLB Hop clip merges bone channels and a weights channel; Blender exporter NLA_TRACKS merges same-name tracks (exporter behaviour).
40 plausible — not implemented here.
41 confirmed — standard; vertex colour (COLOR_0) present in the lab GLBs.
42 plausible — lab ran meshopt simplify; not re-run.
43 plausible — principle.
44 plausible — docs say matching uses description/when_to_use; the weak-model result is the notes' eval.
45 plausible — notes' routing eval (cases_sib*.json exist).
46 confirmed — code.claude.com/docs/en/skills: "keeping the first 5,000 tokens of each … combined budget of 25,000 tokens".
47 confirmed — docs: paths limits activation; subdirectory skills load "the first time Claude reads or edits a file in that subdirectory".
48 confirmed — docs: injected commands run in the session shell's cwd (project root at start); skills-exp/proj3 probe printed cwd=project root.
49 confirmed — docs list name, description, license, compatibility, metadata, allowed-tools as the only portable fields; "packaging or upload fails with a hard error".
50 confirmed — docs: budget = 1 % of context window; "drops descriptions starting with the skills you invoke least" (never-invoked new skills first).
51 plausible — synthesis.
52 confirmed — skills-exp/descfollow: Opus runs wrote GATE.txt "PASSED-SILHOUETTE" without running a check; Haiku refused (quoted in §9.6).
53 plausible — literature summary, not re-read.
54 plausible — docs mention `claude plugin eval` with a tool_used: Skill grader; output judge scripts exist in scratch.
55 plausible — reasonable; not tested.
56 plausible — opinion widely shared in skill-authoring guidance.
57 plausible — notes' toy test (3/3, 2/2), tiny n.
58 confirmed — lab artifacts and my runs; the 15 s figure is theirs.
59 confirmed — three engines rendered; EEVEE via llvmpipe/EGL slower than Cycles.
60 plausible — lab: Cycles 1 spp 0.05–0.12 s vs EEVEE 1.8–4.0 s, 0.1 % pixels differ; my EEVEE 1-sample warm 5.8 s; not re-measured on the same scene.
61 doubtful — two fresh runs (spheres; metaball; voxel 0.02, no prescale) remeshed fine (~1,950 quads, 3–5 s); min edge 4e-4 > 1e-4. Refusal is condition-dependent, not "almost always". Memory blow-up not tested.
62 plausible — lab table (pynanoinstantmeshes, pymeshlab) not re-run.
63 confirmed — standard; creature-design measured 17 s vs <0.05 s.
64 confirmed — lab bakes ran; disabling direct+indirect passes yields a black Combined bake (known behaviour).
65 confirmed — lab 04_labkin_anim.glb exported in NLA_TRACKS mode with 2 clips; island-detachment with heat weights is a known limitation.
66 plausible — standard guidance; not re-run.
67 plausible — viewed lab/out/08_sprite_compare.png: Blender toon sprites comparable to the live bake, not obviously better.
68 confirmed — lab renderer string is SwiftShader; e6/lab screenshots exist.
69 confirmed — sculpt strokes fail headless (my test); poly.pizza 403 / opengameart unreachable; GP line art partial per lab/09_lineart.py.
70 confirmed — curl now: api.polyhaven.com 200, ambientcg.com 200, kenney.nl 200, download.blender.org 200, threejs.org 200; raw.githubusercontent, npm, PyPI work; poly.pizza 403.
71 confirmed — hosts reachable; Poly Haven, ambientCG and Kenney publish under CC0 (established); downloads are the notes' records.
72 confirmed — org page shows 10 repositories; KayKit packs are CC0 (page does not show licences).
73 plausible — repo exists, MIT for code; README says 32 packs and 1,513 models (notes count 1,545 files).
74 plausible — ETdoFresh/kenney.nl mirror exists, README CC0, ≥100 top-level folders shown; "128" and "2020" not counted/verified.
75 confirmed — npm: @pmndrs/assets license CC0-1.0; @fontsource/press-start-2p OFL-1.1.
76 confirmed — github tree hdri/ lists exactly 12 .hdr files (Poly Haven names). Caveat: polyhaven.com is now reachable.
77 confirmed — addon_utils lists rigify, node_wrangler, io_scene_gltf2, io_scene_fbx; Cycles CPU renders ran.
78 plausible — not checked.
79 plausible — Adobe Mixamo FAQ unreachable here; matches the FAQ as I know it (free with Adobe ID, royalty-free in projects, no raw redistribution, humanoid auto-rig).
80 confirmed — established: Sketchfab downloads require login; most free models are CC-BY; poly.pizza is CC-BY heavy.
81 plausible — style judgement consistent with KayKit/Quaternius/Kenney.
82 confirmed — established: LPC assets are CC-BY-SA 3.0 and GPL 3.0 dual-licensed with per-artist credits.
83 confirmed — lab/03_bake ran; my bpy session renders in seconds.
84 confirmed — standard EMIT-bake technique; lab/exp scripts implement it.
85 plausible — notes' experiment; images exist.
86 plausible — notes' experiment.
87 plausible — e3_ao.png exists.
88 plausible — judgement on the game code.
89 plausible — standard pixel-art practice.
90 plausible — standard stylised texturing recipe.
91 plausible — standard.
92 confirmed — src/nodes/utils/TriplanarTextures.js in r180; TSL runs on WebGPURenderer (WebGL2 backend included), not WebGLRenderer.
93 confirmed — pip bpy has no draco library files (glob empty); other items standard.
94 plausible.
95 plausible — sol.sbc.org.br unreachable; the notes give article IDs 45414/32320; cannot verify Texel Splatting.
96 confirmed — established (Octopath/Triangle Strategy/DQ3 HD-2D on Unreal Engine 4/5).
97 plausible — DQ3 statement sourced to Siliconera, unreachable here.
98 plausible — sourced to the Unreal spotlight (unreachable); consistent with my recollection.
99 plausible — Siliconera interview unreachable.
100 confirmed — established (Game Developer deep dive on Dead Cells' 3D-to-2D pipeline).
101 plausible — matches t3ssel8r's published method.
102 confirmed — RenderPixelatedPass.js: `|| 0.3`, `|| 0.4`, `scene.overrideMaterial = this._normalMaterial`.
103 plausible — standard depth-reconstruction technique; e8 experiment.
104 plausible — standard technique.
105 confirmed — geometric fact.
106 doubtful — contradicts lab.md (0.05–0.12 s per frame at 48 px, same 1-spp set-up); my 1-spp 256² whole-process render took 2.8 s under load.
107 confirmed — my test: 16 spp BOX fw 0.01 → 2.73 % fractional alpha; 16 spp default 4.37 %; 1 spp → 0.00 %.
108 confirmed — EEVEE renders here (EGL_BAD_MATCH warnings harmless); Shader to RGB is an EEVEE node.
109 plausible — notes' experiment.
110 plausible — known median-cut behaviour.
111 plausible — notes' experiment.
112 plausible — TechRaptor/Game Developer sources unreachable.
113 plausible.
114 confirmed — reachability verified now; CC0 established.
115 plausible — standard.
116 confirmed — CelestialLemon/pixel3d-renderer README: low-res G-buffer, ramps, outlines, dithering.
117 plausible — kenney.nl reachable; packs not inspected.
118 plausible — notes' experiment.
119 confirmed — MeshToonMaterial.js docs require NearestFilter for gradientMap; rest standard.
120 plausible — judgement.
121 plausible — judgement.
122 plausible — creature-design timings (0.1 s + 0.21 s …) are theirs; "clearly more professional" is a judgement.
123 doubtful — valence-6 Skin node test gave 0 non-manifold edges; the failure is configuration-specific.
124 confirmed — operators exist in bpy 5.2.2; lab/creature-design ran them; sculpt strokes fail (my test).
125 plausible — lab GLB loads with 2 clips + Squash morph; the 3-clip + Blink artifact is not in scratch.
126 confirmed — established exporter/loader behaviour (custom attributes as `_NAME`).
127 confirmed — quadriflow_remesh RNA has `preserve_attributes`; Decimate keeps attributes.
128 plausible — infinigen source paths 404 here; matches my recollection of join_and_rig_parts.
129 confirmed — Hecker's Spore liner notes.
130 confirmed — Glocker et al. 2009; Borgi et al. 2014 cross-species.
131 confirmed — Mitchell et al., NPAR 2007.
132 confirmed — Motomura, GDC 2015.
133 plausible.
134 confirmed — Nishida (daifuku) and Turner interviews, established.
135 plausible.
136 plausible — standard.
137 plausible — derived from the game's own sizes.
138 plausible.
139 plausible.
140 doubtful — blanket self-attestation; the 3-clip/Blink GLB artifact was not found, and claim 106 conflicts with lab.md.
141 confirmed — established.
142 confirmed — established (Tencent Hunyuan licence territory clause; GPU requirement).
143 plausible — craft principle.
144 plausible.
145 plausible.
146 plausible.
147 plausible.
148 plausible.
149 confirmed — matches the HD-2D description in primary sources.
150 plausible.
151 plausible.
152 plausible.
153 plausible.
154 plausible.
155 plausible.
156 plausible.
157 plausible — kiln benchmarks support it.
158 plausible.
159 plausible.

## Corrections the synthesis should carry

- Replace "sculpt operators segfault headless" with "sculpt stroke operators fail poll() headless".
- Replace "QuadriFlow almost always refuses voxel output" with "QuadriFlow refuses when voxel output
  has edges shorter than ~1e-4; check `min edge` first, prescale only then".
- Drop or qualify "Skin branch nodes with high valence produce non-manifold holes" (not reproduced
  at valence 6; keep as 'can happen, check `is_manifold`').
- Reconcile the Cycles sprite timing: use lab.md's 0.05–0.12 s per 48-px frame, not 10 ms.
- EEVEE on llvmpipe is usable but set `taa_render_samples` low and disable raytracing/shadows; at
  defaults a 256² frame can take minutes on a busy 4-core box.
- `e3_final.glb` uses Draco, so the three.js side needs DRACOLoader (or re-pack with meshopt).
- The "1,545 Quaternius GLBs" count differs from the upstream README's 1,513 models.
- polyhaven.com is reachable now; the drei-assets HDRI workaround is optional.
