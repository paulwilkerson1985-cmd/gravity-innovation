# three r180 → r186 upgrade notes (read when bumping `three`, or when an API from a newer example is tempting)

Contents: 1 what changed · 2 gotchas by symptom · 3 upgrade checklist · 4 options we do not take.
Source: threejs-render.md §1, §4–5, §8; mobile-perf-budget §4. The game pins `three@^0.180.0`
(`@types/three@^0.180.0`); r186.1 was current when this was written.

## 1 Rendering-relevant changes
| Rev | Change | Effect on Orbkin |
|---|---|---|
| r181 | DFG LUT, multi-scatter energy compensation, better rough IBL, GGX VNDF in PMREM | rough materials brighter: re-check exposure per arena with the gate |
| r182 | **`PCFSoftShadowMap` deprecated (WebGL); `PCFShadowMap` is now soft** (Vogel disk + IGN), `shadow.radius` = softness | `TIERS.high.shadowType` must become `PCFShadowMap` + `key.shadow.radius` (presets' `soft` 2–6) |
| r182 | `WebGLRenderer({ outputBufferType: HalfFloatType })` + `renderer.setEffects([...passes])` | built-in HDR target + passes + automatic tone map/sRGB; `setEffects` throws with UnsignedByte output and warns that `OutputPass` is not needed. It allocates a **4× MSAA** HalfFloat target: the blit-resolve path, desktop-only |
| r182 | PMREM GGX matches Blender roughness | Blender look-dev transfers better |
| r183 | `PostProcessing` → `RenderPipeline` (WebGPU); `Clock` deprecated → `Timer`; `GodraysNode`, `retroPass`, `exponentialHeightFogFactor()` | rename if any TSL code lands; `Timer` for new code |
| r184 | env/background rotation matches object rotation; `LightProbeGrid`; FSR1/TAAU (WebGPU); **`WebGLNodesHandler`** (TSL node materials on WebGLRenderer) | low-risk way to write new materials in TSL; limits: no VSM, no MRT, no transmission, no WebGPU post stack |
| r185 | `ClusteredLighting`; LightProbeGrid `bounces`; **GTAO darker/wider** (lower radius/scale); SSR denoiser; `AnamorphicNode` removed | GTAO is off anyway |
| r186 | `LightProbeGrid` → **`LightProbeGridWebGL`** (WebGL) + WebGPU `LightProbeGrid`, incremental baking; `SunLight` addon with cascaded shadows; PCFSoft removed for WebGPU; `SSAONode`; VXGI (WebGPU); `softParticles()`; faster bloom blur; toon gradient uses the view-space normal | `MeshToonMaterial` bands may shift slightly: re-capture toon surfaces |

## 2 Gotchas by symptom
- **Shadows look different after the bump** → PCFSoft deprecation; set `PCFShadowMap` and tune
  `shadow.radius` (3 ≈ the old PCFSoft on the cave). Re-capture desk + phone; frozen 1024 PCF on low stays.
- **`setEffects` tempting to replace the composer** → it is native + MSAA4 by construction: fine on
  desktop, never on phones (mobile-perf §4). The composer with `samples: 0` HalfFloat targets stays
  for the phone tier; `OutputPass` is not needed either way because the grade does tone map + sRGB.
- **`LightProbeGridWebGL` for bounce light** → atlas is a `WebGL3DRenderTarget` **RGBA32F + LinearFilter**:
  renderable only with `EXT_color_buffer_float`, filterable only with `OES_texture_float_linear`
  (≈ 47 % iOS, 74 % Android) — samples black elsewhere; the in-browser bake is 6 cube faces × probes ×
  scene draws (224 probes = 1,344 renders, 4.9 s even on SwiftShader). Bake offline (Blender) or on
  desktop, ship SH as data through a HalfFloat 3D texture if ever needed. Reduce the hemisphere when
  a probe grid is on (double ambient).
- **GTAO darker in r185+** → not a regression in our settings; GTAO stays off (2.4× the frame, +35 draws).
- **`Clock` warnings** → `Timer` (`three/addons/misc/Timer.js`); the game uses its own `animClock`.
- **Pre-tone-mapped bakes** (Cycles "as render" PNG) → `material.toneMapped = false`, else double curve.
- **`alphaToCoverage`** → needs MSAA; useless at the integer grid. TAA/TRAA smear pixel art: never.
- **WebGPU** → cannot be verified in this container (SwiftShader adapter only with
  `--enable-unsafe-webgpu --enable-features=Vulkan`; real scenes hit *device lost*);
  `WebGPURenderer({ forceWebGL: true })` works. Stay on `WebGLRenderer`.
- **`postprocessing@6.39.5`** (pmndrs, Zlib) peer range `three >= 0.168 < 0.187`: fine for r180–r186;
  `EffectPass` merges effects into one fullscreen pass (fewer passes = good on phones) but
  `multisampling` applies to BOTH ping-pong buffers; set it 0 on phones. v7 is beta. A new dependency
  needs a DECISIONS entry and `--ignore-scripts`.
- **`LUTPass`** (`three/addons/postprocessing/LUTPass.js`, `LUTCubeLoader`) is display-referred: add it
  AFTER the grade's sRGB output (`make_cube.py` writes 33³ `.cube` files).
- **Tone mapping** if the hand-rolled hue-preserving ACES is ever replaced: `NeutralToneMapping`
  (Khronos PBR Neutral) keeps authored palettes best; `AgX` matches Blender look-dev but desaturates
  (needs ≈ 1.35 exposure + a grade). Taste untested in-game: gate it.
- **Material variants** → each `onBeforeCompile` permutation and each light count is a program;
  phones link 58–66 per scene against a 2 MB program cache (128 KB low-end). Target ≤ 40; adding a
  light at runtime relinks every lit material.
- **Context loss** → no `webglcontextlost`/`restored` handling exists; iOS drops contexts on
  background. Add it with any pipeline rework (re-create composer, bake targets, shadow refresh; painted
  textures keep their canvases).

## 3 Upgrade checklist (half a day + regression captures)
1. `npm install three@0.186.1 @types/three@0.186.x --ignore-scripts` (pin exact; DECISIONS entry; `npm audit`).
2. `TIERS.high.shadowType = THREE.PCFShadowMap`; `lightRig`: `key.shadow.radius = p.soft` already set.
3. `npm run typecheck && npm run lint && npm run test && npm run build`; e2e `hd2d*.spec.ts`.
4. Frozen captures of cave / meadow / coast + title / starter / route, desk + phone, before and
   after; `audit.mjs` + `check-budget.mjs --baseline` (programs must not grow); gate each pair
   (expect `no_difference`; any `worse` is a real regression: read the reasons).
5. Only then consider `WebGLNodesHandler` for new materials; never `setEffects` on the phone tier.

## 4 Options we do not take (and why, in one line each)
Native + MSAA (no gain at equal sprite texels, 5–10× DRAM) · RenderPixelatedPass (ortho only;
ours is perspective + sprites) · TAA/TRAA (smears pixel art) · N8AO on phones (extra full-res
passes) · in-browser probe baking (float32, 1k+ renders) · KTX2 for pixel art (ETC1S turned 6
colours into 142) · `gltf-transform optimize` on characters (flatten/join/palette by default).
