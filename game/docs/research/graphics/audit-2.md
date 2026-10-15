# Audit 2: skeptical verification of 159 research claims

Auditor: fresh-context session, 2026-10-14. Method: hands-on tests in this container (bpy 5.2.2 module, node 22, the game repo at `2fb1cc9`), primary sources read through `raw.githubusercontent.com`, npm/PyPI metadata, `code.claude.com` / `platform.claude.com` / `docs.blender.org` docs, and the research reports' own data trails. WebSearch budget for this turn was exhausted after two queries, and arxiv.org, 80.lv, x.com and huggingface.co are unreachable from here, so paper/forum claims that could not be re-read are marked *plausible* rather than *confirmed*.

Verdict scale: **confirmed** = independently reproduced or read in a primary source; **plausible** = consistent with evidence I could see but rests on the authors' own runs or on secondary sources; **doubtful** = contradicted in part by other evidence or too weakly supported; **refuted** = contradicted by evidence.

Scratch files for this audit: `scratchpad/audit2/` (three 0.186.1 tarball, Blender change logs, Filament `Options.h`, pokeemerald `battle_anim_scripts.s`).

## Cross-cutting findings

1. **The `return tail` bug is real** (claim 30). `game/src/render/movefx.ts` ends every `*Px` effect with `await wait(260); return tail;` where `tail` is a ~0.9 s animate plus `finish()` (0.9 s). An async function adopts a returned promise, so `await flamePx()` resolves only after ~2 s. `scenes/arenaBattle.ts:763` awaits `Promise.all([lunge, moveFx(...)])` and the `damage` event (line 778) runs after. The lunge itself is ~330 ms, so the tail, not the lunge, is the long pole.
2. **Wall-clock captures undermine the vertical-slice kin/density verdicts** (claims 12, 13 vs 87, 88). `human-ground-truth.md` re-captured with a frozen clock and Opus called "sprtex 1 vs 2" *same* (4/6, order-split) and picked "1.5x over 2x" 6/6 even though those two settings are pixel-identical. The sprite bake quantises its rig clock to 10 fps (`sprite.ts:1138-1170`), so unfrozen captures differ in pose. I therefore rate claims 12 and 13 doubtful despite their 3-0 tallies.
3. **Evidence sizes are small.** Most in-game A/B results are 3 votes per pair (vertical slice) or 4-6 votes (biome, frame-arch, non-battle). "Decisive 3-0" has a 25% chance under a fair coin for one pair. Consistent repetition across pairs helps, but none of these is strong enough to call *confirmed* on its own.
4. **Blender 5.2.2 bugs reproduce** (claim 60): EXACT and MANIFOLD booleans append a `None` material slot (FLOAT does not), and the Bevel modifier's UVs differ between runs in the same process (448 of 9,180 UV floats differed on run 2 of 3). Note for the shim: assigning a material to the *base* mesh first still left a `None` slot (from the cutter), so the rule must be "assign to both operands or call `drop_empty_material_slots()`".
5. **Mantaflow is unusable in the bpy module** (claim 33): `bpy.ops.fluid.bake_all()` reports `{'FINISHED'}` but the embedded solver scripts throw `'LevelsetGrid' object has no attribute 'setConst'` and `NameError: bake_fluid_data_2`, so no cache is produced.
6. **Blender API breaks do not all land in 5.0** (claim 59): the 5.1 change log has 90 "Removed" entries (compositor node `update`, brush/sculpt properties) and 5.2 has 11 (`bl_system_properties_get`, `Object.eraser_brush`, `PreferencesView.image_draw_method`). The claim holds only for the asset-pipeline API the report probed.
7. **Inconsistencies between reports:** HUD share is 23% (ui-hud) vs 25% (reference-board) for the same desktop frame; digest text in `findings_digest.md` still says Poly Haven/Kenney are blocked and that EEVEE fails, both superseded.

## Per-claim notes

### Methodology (1-9)
- 1 **plausible**. Could not fetch arXiv 2502.17422 ("MLLMs know where to look"); Anthropic's vision docs do warn about "very small images under 200 pixels". Well-known literature, not re-read here.
- 2 **confirmed**. `platform.claude.com/docs/en/build-with-claude/vision`: images over the long-edge (1568/2576 px) or visual-token limit "are downscaled before processing"; requests with >20 images apply a stricter per-image limit (2000 px per side). Nuance: the many-image rule *rejects* rather than downscales.
- 3 **plausible**. Panickssery et al. (NeurIPS 2024) is a real paper; arXiv unreachable here. Broadly accepted.
- 4 **plausible**. Secondary sources (HN thread, 3JSBench summary) plus the project's own early creature code.
- 5 **plausible**. Single data point (kiln 0.866 vs 0.861 at ~3x cost) from one repo's own measurement.
- 6 **plausible**. Dead Cells' 3D-to-pixel batch pipeline is well documented (80.lv, Vasseur); 80.lv unreachable here. "Works best from a 2D model sheet" generalises one studio's practice.
- 7 **plausible**. Paper claim taken from an abstract (medium in the source report too).
- 8 **plausible**. Gameability was demonstrated hands-on in judge-calibration (noise raises edge energy +7.5); "must be held out" is a design rule, not a measurement.
- 9 **confirmed**. Kenney, Poly Haven, ambientCG, Quaternius, KayKit are CC0 (public licence pages); TRELLIS.2 README requires ~24 GB; cloud generators are paid/quota services.

### In-game vertical slice (10-18)
- 10 **plausible**. 7/7 pairs 3-0 (n=3 each) on wall-clock captures; no human check. Consistent but weak.
- 11 **plausible**. 3-0 twice plus L*50/light-share metrics (62.8 vs 44.8). n=3.
- 12 **doubtful**. Frozen-clock recapture changed 3 of 4 kin/density verdicts (human-ground-truth §4.4).
- 13 **doubtful**. Frozen-clock P07 "sprtex 1 vs 2" = *same* (4/6, order-split); "1.5x vs 2x" judged 6/6 on pixel-identical frames.
- 14 **plausible**. No-gain replicated by frame-architecture (3/3) and camera report; the 8.7x is SwiftShader CPU time, not GPU.
- 15 **plausible**. 1-2 and 3 ties, n=3.
- 16 **plausible**. One pair, 3-0.
- 17 **plausible**. Supported by canary tests (golds 2/2, G3 6/6, 112/114 motion canaries) but human agreement is untested (claim 90) and near-equal pairs follow order (claim 23).
- 18 **plausible**. Triangle and VRAM arithmetic checks out (2048² RGBA16F = 32 MB + mips 43 MB; AO/edge PNGs 22 MB each).

### Judge calibration (19-29)
- 19 **plausible**. Authors' metric scripts; numbers listed (notan 0.44 vs 0.45 gate, ΔL* 3.5 vs 15, hue share 0.94 vs 0.85).
- 20 **plausible**. 0 false alarms on 63 round-to-round changes, authors' run.
- 21 **plausible**. Best ρ 0.65 after ~40 metrics; monotone only p0→p1.
- 22 **plausible**. "Near-perfect" is on synthetic degradations and known orderings.
- 23 **confirmed**. Reproduced in three independent runs: judge-calibration, frame-architecture (10-11 of 12 cells second-shown won), biome (order-driven cells). Consistent with position-bias literature.
- 24 **plausible**. Rubric +0.18 for default-renderer vs HD-2D.
- 25 **plausible**. Reproduced offsets +0.53/+0.66.
- 26 **plausible**. Pairwise baseline better in cave and summit cells.
- 27 **plausible**. Interpretive, but consistent with the frozen-clock density result.
- 28 **plausible**. Positive controls 10/10 in 3/3; resemblance calls are a VLM's opinion, not a legal finding.
- 29 **plausible**. Principle; the Goodhart demonstration supports it.

### Battle VFX (30-38)
- 30 **confirmed**. Code reading above; 12/12 skill-pilot runs measured 127 frames → 1-4 after removing `return tail`.
- 31 **confirmed** (core). pokeemerald `data/battle_anim_scripts.s` `Move_THUNDERBOLT`: `AnimTask_BlendBattleAnimPal … F_PAL_BG … 6, RGB_BLACK`; `src/battle_anim_normal.c` `sAffineAnim_HitSplat_0` holds 8 frames. Showdown 12-15 fps not re-checked.
- 32 **confirmed**. `fx.ts`/`movefx.ts` use `fadeIn: 0.05` and Bayer dissolve; saint11's "brightest frame first" is a standard published rule.
- 33 **confirmed** (Mantaflow part, reproduced). Volume/metaball speed is the authors' timing.
- 34 **plausible**. Authors' in-game measurement.
- 35 **plausible**. 2 internal px per sprite texel matches the measured 4 device px at 720p.
- 36 **plausible**. 45 → 56 draw calls measured; targets are proposals.
- 37 **plausible**. Footage observation.
- 38 **confirmed**. Trauma shake is the published GDC model (Eiserloh); integer offsets follow from the pixel grid.

### Mobile performance (39-52)
- 39 **plausible**. Bandwidth model, not a device measurement.
- 40 **confirmed**. three r180 `WebGLTextures.js`: `renderbufferStorageMultisample` + `blitFramebuffer`; `WEBGL_multisampled_render_to_texture` used only when exposed (Chrome/Safari do not expose it).
- 41 **confirmed**. Chromium `gpu_driver_bug_list.json` entry 256 enables timer-query extensions with `"exceptions": [{"os": "android"}]`; Safari gates it behind a feature flag.
- 42 **plausible**. Authors' WebGL call-recorder table.
- 43 **plausible**. Measured 109k tris / 38.8 MB at q=high vs 48k / 12.7 MB.
- 44 **plausible**. ~1 s measured here; phone factor extrapolated.
- 45 **confirmed**. three 0.186.1 `examples/jsm/lighting/LightProbeGridWebGL.js:520-526`: `WebGL3DRenderTarget` with `FloatType`, `RGBAFormat`, `LinearFilter`. The iPhone share depends on `OES_texture_float_linear` availability (Apple GPU family < 9).
- 46 **confirmed** (size). `basis_transcoder.wasm` gzips to 245,408 B (+15 KB js) in the repo's three package. Nearest-filtered pixel art and block compression are a bad fit by construction.
- 47 **plausible**. Decoder is tiny; no device timing here.
- 48 **confirmed**. Linux `drivers/gpu/drm/msm/adreno/a6xx_catalog.c`: a610 `.gmem = (SZ_128K + SZ_4K)`; the following 6xx entries `SZ_512K`.
- 49 **confirmed** (defaults). Filament `Options.h`: `BloomOptions.resolution = 384`, `levels = 6`, `QualityLevel::LOW`; `AmbientOcclusionOptions.resolution = 0.5f`; `DynamicResolutionOptions.minScale = {0.5, 0.5}`. The 3 ms / 4 ms timings are secondary.
- 50 **confirmed** (gap). `grep webglcontextlost src/` is empty.
- 51 **plausible**. iOS Low Power Mode 30 fps rAF is documented WebKit behaviour; 70% is a rule of thumb.
- 52 **confirmed**. `dist/assets`: JS 453,951 B gz + CSS 14,852 B gz (+ 20 KB font, 380 B html) ≈ 470-490 KB.

### Toolchain bootstrap (53-67)
- 53 **confirmed**. `code.claude.com/docs/en/cloud-environments`: setup script "skipped when a cached environment exists"; SessionStart hooks run "after Claude Code launches, on every session including resumed".
- 54 **confirmed**. `bootstrap/logs/claude-hook-test.log`: `SessionStart:startup [...session-start.sh] finished with status 0 (381ms)` and the async bpy hook's additionalContext.
- 55 **plausible**. Based on the repo's GPU-PC setup guide; the PC itself cannot be inspected from here.
- 56 **plausible**. `apt-egl.log` exists; sizes are authors' measurements.
- 57 **plausible**. Lock files present in `bootstrap/exp/locks`; not re-resolved.
- 58 **confirmed**. `curl -I` to `cdn.playwright.dev` and `playwright.download.prss.microsoft.com` returns no connection; hook log shows `chromium-1194 ok` from the image.
- 59 **doubtful**. Blender 5.1 (90) and 5.2 (11) change logs list removals; only pipeline-relevant renames are confined to 5.0. Pinning 5.2 + shim is still sound advice.
- 60 **confirmed**. Reproduced both (see cross-cutting 4).
- 61 **plausible**. Bevel jitter makes raw GLBs non-identical even same-machine (authors quantise first); PNG identity is their measurement.
- 62 **plausible**. Recommendation grounded in the 1 GB bpy install cost.
- 63 **plausible**. Blender docs quote "execute LLM generated code … without any guards" per report; not re-read.
- 64 **confirmed**. `npm view ktx2-encoder`: 0.6.0, MIT, published 2026-07-19.
- 65 **plausible**. No downloaded CC0 zips remain in scratch to inspect; Kenney/KayKit packs commonly ship `.blend`.
- 66 **plausible**. Mechanism (`CLAUDE_ENV_FILE` session-env persistence) is documented; leak itself not reproduced.
- 67 **plausible**. Process recommendation.

### UI / HUD (68-79)
- 68 **confirmed**. `git log`: `f4a08c6 2026-10-13 ui: pixel handheld UI system …`.
- 69 **plausible**. Authors' coverage measurement (note 23% here vs 25% in reference-board).
- 70-74 **plausible**. Authors' judge runs (84/84, 83/84, 19/17 and 22/14 with reference, pxdark 33-3, slab2 6-0).
- 75 **plausible**. 10 px at 720p ≈ 5 px x-height; XAG mapping is the authors' interpretation.
- 76, 77 **plausible**. Observational.
- 78 **confirmed**. `google/fonts` `ofl/alegreya*/OFL.txt`: copyright lines only, no Reserved Font Name.
- 79 **plausible**. Judge-reason evidence.

### Biomes (80-85)
- 80 **plausible**. 4/4 both orders + crop (n=4).
- 81-83 **plausible**. Authors' runs; 83 self-declared confounded.
- 84 **plausible**. Negative claim; DQ3 "no pixel art in backgrounds" interview cited.
- 85 **plausible**. Process rule drawn from their confounds.

### Human ground truth (86-94)
- 86 **plausible**. Kit files exist (`scratchpad/hgt/`, `uiq/owner-ab`, `anim/owner`); not run by a human yet.
- 87 **plausible**. Authors' frozen-clock recapture; mechanism consistent with the 10 fps quantised bake clock.
- 88 **plausible**. Mechanism confirmed in `sprite.ts` (`px = max(1, round(screenH / texelHeight))`); exact equality of 1.5x and 2x not recomputed, but `detcap` pixel-identical frames are reported.
- 89 **plausible**. ITU P.910 / pwcmp practice.
- 90-94 **plausible**. Literature synthesis and recommendations; 91 is explicitly unverified by its own wording.

### Animation (95-103)
- 95-97 **plausible**. Authors' judge runs (112/114, 22/24).
- 98 **plausible**. Measured amplitudes (bob ≈ 2 texels).
- 99 **plausible**. Bake rate 10 fps (8 low) confirmed in `sprite.ts:871`; the craft judgement is theirs.
- 100 **confirmed**. `creature.ts:358`: blink = half-sine over 0.13 s; at 10 fps sampling, the >0.85 window is 0.0459 s (54% of blinks miss it) and the >0.5 window 0.0867 s (13% miss). Matches 54% / 14%.
- 101 **plausible**. Fan-extracted data (cbpickaxe); 94/146 idles are 6 f and the idle label is "assumed".
- 102 **plausible**. Code description (pure sines, `lerpVectors` glide) consistent with report; not line-checked.
- 103 **plausible**. Authors' count.

### Reference board (104-112)
- 104 **plausible**. Search index did not surface the post this turn; x.com unreachable; snowflake decode is consistent with 2026-09-25.
- 105 **plausible**. Authors' pixel forensics.
- 106 **plausible**. From a fan rip dataset (`mastermind1919/OctoOverworldSprites`) plus store shots.
- 107-108 **plausible**. Authors' measurements on store shots.
- 109 **plausible**. Octopath 720p docked is widely reported; not re-verified.
- 110-112 **plausible**. Authors' measurements (112 conflicts with 69 by 2 points).

### Hybrid frame (113-122)
- 113, 120 **plausible**. Scratch artefacts exist under `research/fa/`; not run by me.
- 114 **plausible**. Sound reasoning (leaning billboards).
- 115-119 **plausible**. Authors' runs and bandwidth model.
- 121 **confirmed**. Filament defaults (above) and three's `RenderPixelatedPass` (low-res nearest render targets, output at full res).
- 122 **plausible**. Self-reported.

### Local GenAI (123-133)
- 123 **confirmed** (main part). `black-forest-labs/flux2` README: klein 4B and 4B Base Apache-2.0; 9B/9B KV/9B Base and FLUX.2 [dev] under FLUX Non-Commercial. Z-Image/Qwen-Image not re-read.
- 124 **confirmed**. Tencent/Hunyuan3D-2 LICENSE: "DOES NOT APPLY IN THE EUROPEAN UNION, UNITED KINGDOM AND SOUTH KOREA"; grants and display are "for the Territory only".
- 125 **plausible**. The ComfyUI incidents cited are real public events; the jail-fit is a design judgement.
- 126 **confirmed** (CUDA part). PyPI torch 2.14.1 ships cp313 manylinux wheels depending on `nvidia-*-cu13`; CUDA 13 needs the 580 driver branch. bpy co-resolution is the authors' lock.
- 127 **plausible**. Secondary (kiln) measurements.
- 128 **doubtful**. Rests on claim 12 ("tool does not matter"), which is itself doubtful after the frozen-clock recapture.
- 129 **confirmed** (README). SD-piXL README: "takes a few hours to complete", "24GB is recommended", exact `--size` and `--palette`.
- 130 **plausible**. ICLR 2025 paper cited; originality check is a VLM result.
- 131 **plausible**. Policy, consistent with safetensors guidance.
- 132 **confirmed**. Standard PyTorch reproducibility caveat.
- 133 **plausible**. Negative/observational.

### Non-battle screens (134-140)
- 134-137 **plausible**. Authors' measurements and 4/4 runs.
- 138 **plausible**. Interview sources (CEDEC/4Gamer/Siliconera) not re-read.
- 139 **plausible**. pokeemerald is primary and readable; not re-read for the title timeline.
- 140 **confirmed**. `game/CLAUDE.md`: "menus are HTML over the canvas"; the stray artifact is the authors' observation.

### Camera and motion (141-150)
- 141-143 **plausible**. Authors' block-residual metrics.
- 144 **plausible**. CSS translate adds no WebGL pass; compositor cost is non-zero but small.
- 145 **plausible**. `hd2dBattle.ts:388 shake()` is a whole-pixel view-offset jitter; the 25 Hz characterisation is their trace.
- 146 **plausible**. `creature.ts:467/505` has 70 ms tweens in `hit()`.
- 147 **plausible**. pokeemerald `sBattleTransitionTable_*` exists; 3-4 s is their frame count.
- 148-150 **plausible**. Reviews, canary runs, design.

### Skill pilot (151-159)
- 151 **plausible**. n=3 per arm; honest null result.
- 152 **plausible**. The bug is real (claim 30); the 12/12 is from their transcripts.
- 153-154 **plausible**. Transcript analysis.
- 155 **plausible**. 12,115 chars = 5,000 tokens by their tokenizer call; 160 lines assumes ~75 chars/line.
- 156-159 **plausible**. Transcript and judge evidence; 157's 12/12 collapse is striking but unverified here.
