# Three.js high-end rendering: research notes (angle: Three.js rendering)

Author: research subagent, 2026-10-14. Scope: the state of the art for good-looking real-time Three.js
(r170 to r186): colour management, tone mapping, lighting/GI, shadows, post-processing, stylised
rendering, WebGPU/TSL status, environment shaders, instancing, budgets. Everything here is free
(MIT/Zlib/ISC/Apache/GPL tools). Sources are primary where possible (three.js repo code via
raw.githubusercontent.com, npm package sources, real project repos). Confidence is marked
**[high] / [med] / [low]**.

Experiments were run in this container (headless Chromium + SwiftShader, three r186 and r180).
Harness, scripts and images: `research/threejs-render-assets/` (next to this file).

---

## 0. TL;DR: the ten things that matter most for Orbkin

1. **Render the 3D scene at native resolution (DPR capped to 2) with MSAA, and keep the pixel art in
   the *textures and sprites*, not in a 360p framebuffer.** HD-2D (Octopath, Triangle Strategy,
   DQ3 HD-2D) is a high-resolution 3D render of pixel-art *surfaces*; light, shadow, fog, bloom and
   geometry edges are smooth and high-res. Our 640x360 nearest-upscaled frame turns texels into mush
   when texel size ≈ pixel size (see experiment 2) and caps every effect's detail. [high]
2. **Pick the tone mapper for palette fidelity**: `NeutralToneMapping` (Khronos PBR Neutral) keeps
   authored base colours/hues; `AgXToneMapping` matches Blender 4.x/5.x; ACES hue-shifts (the game
   already hand-wrote a "hue-preserving ACES" to fight this). Experiment 1. [high]
3. **Upgrade three r180 -> r186** (WebGL path, low risk): energy-conserving PBR (r181), soft PCF by
   default + PCFSoft deprecated (r182), `WebGLRenderer({outputBufferType: HalfFloatType})` +
   `renderer.setEffects([...])` built-in HDR/MSAA post (r182), `LightProbeGridWebGL` baked
   irradiance volume with bounces (r184-r186), `WebGLNodesHandler` to run TSL node materials on
   the WebGL renderer (r184+), better GTAO/SSR/TRAA nodes, `SunLight` addon with cascaded shadows (r186; works with WebGLRenderer, WebGPU needs `renderer.library.addLight(SunLightNode, SunLight)`). [high]
4. **Lighting should be art-directed, not physically "correct"**: use a custom stylised lighting
   model (Bruno Simon's 2025 portfolio is the best open example: palette texture colour, smoothstep
   core shadow, shadow colour = albedo x tint, fake ground bounce, fog, all in one TSL output node).
   [high]
5. **Bake what is static**: GI/AO/soft shadows via (a) Blender Cycles bake -> lightmap (uv1,
   `texture.channel = 1`) or baked-into-albedo, or (b) in-browser `LightProbeGridWebGL.bake()` /
   `ProgressiveLightMap`. Cycles Combined bakes are HDR (>1.0): store as EXR/HDR or "save as
   render" with the tone curve baked and set `toneMapped:false`. Verified in Blender 5.2. [high]
6. **Post stack (WebGL)**: pmndrs `postprocessing` 6.39.5 (supports three 0.168-0.186) merges effects
   into one fullscreen pass; HalfFloat buffers; N8AO for AO (presets, half-res mode); mip-chain
   bloom with threshold >= 1.0 on HDR emissives; tilt-shift/DOF as the HD-2D signature; tone
   mapping as the last HDR step; then a display-referred 3D LUT (we can generate `.cube` LUTs in
   Python; verified with `LUTPass`). [high]
7. **Outlines**: inverted hull with creased normals for characters/props (`@pmndrs/vanilla`
   `Outlines`, screen-space thickness option); depth+normal(+surface-ID) edge detection post pass
   for environments (Omar Shehata's technique; `RenderPixelatedPass` does a 1-px pixel-art variant).
   [high]
8. **Pixel stability**: if any pixelation is kept, snap the camera frustum and objects to the
   texel/pixel grid (the r186 `webgl_postprocessing_pixel` example contains complete
   `pixelAlignFrustum` / `pixelAlignObject` / rotation-snap code). [high]
9. **WebGPU/TSL is production-viable but not required**: Bruno Simon's folio-2025 ships on
   `WebGPURenderer` + TSL (three 0.183) with WebGL2 fallback. WebGPU-only goodies (SSGI, VXGI,
   compute particles, clustered lights) are not needed for a diorama. Migrate materials to TSL
   incrementally via `WebGLNodesHandler`; keep `WebGLRenderer` until a spike proves parity. In this
   container WebGPU adapters exist (SwiftShader, flags) but real scenes hit *device lost*, so WebGPU
   cannot be verified headless; `WebGPURenderer({forceWebGL:true})` renders fine. [med]
10. **Detail density is the real gap vs the reference**, and rendering can only amplify it:
    higher-res texel art (2-4x our current density per world unit), real modelled/sculpted
    rock/props from Blender with baked AO/curvature, decals, instanced clutter. The renderer
    choices above make that detail visible instead of averaging it away. [med]

---

## 1. Versions and what changed (r180 -> r186)

The game pins `three@^0.180.0` (released 2025-09-03). Latest is **0.186.1** (2026-09-24).
npm release dates: r181 2025-10-31, r182 2025-12-10, r183 2026-02-18, r184 2026-04-16,
r185 2026-06-25, r186 2026-09-08. [high]

Rendering-relevant changes (from the GitHub release notes and the Migration Guide wiki):

| Rev | Change | Why it matters |
|---|---|---|
| r181 | DFG LUT instead of analytic approx.; multi-scattering energy compensation for direct light; better rough IBL mixing; GGX VNDF importance sampling in PMREM | Rough materials look brighter/more correct (re-check exposure) |
| r181 | `SSGINode` (screen-space GI), `SSSNode` (screen-space shadows), GTAO temporal filtering, TRAA ghosting fixes (WebGPU/TSL) | WebGPU-path quality features |
| r182 | **`PCFSoftShadowMap` deprecated for WebGLRenderer; `PCFShadowMap` is now soft** (Vogel disk + IGN); `shadow.radius` controls softness | Our `TIERS.high.shadowType = PCFSoftShadowMap` must change on upgrade |
| r182 | **`WebGLRenderer({ outputBufferType: HalfFloatType })` + `renderer.setEffects([...])`** | Built-in HDR MSAA scene target + passes + automatic tone map/sRGB (no OutputPass) |
| r182 | PMREM GGX matches Blender roughness | Blender look-dev transfers better |
| r183 | `PostProcessing` renamed **`RenderPipeline`** (WebGPU); `Clock` deprecated -> `Timer`; WebGPU shadow bias semantics improved; `GodraysNode`; `retroPass`; `exponentialHeightFogFactor()`; Lambert/Phong get `scene.environment` IBL | API churn for TSL code |
| r184 | Env/background rotation now matches object rotation; **"position-dependent diffuse GI" (LightProbeGrid)**; FSR1 + TAAU upscalers (WebGPU); **NodeMaterial compatibility layer for WebGLRenderer** (`WebGLNodesHandler`) | Baked GI in vanilla three; TSL on WebGL |
| r185 | `ClusteredLighting` (Forward+) replaces TiledLighting; LightProbeGrid `bounces`; GTAO more physically correct (darker/wider: lower radius/scale); SSR denoiser; `AnamorphicNode` removed | |
| r186 | `LightProbeGrid` -> **`LightProbeGridWebGL`** (WebGL) and new WebGPU `LightProbeGrid`; incremental baking; **`SunLight`** with cascaded shadows (addon); `PCFSoftShadowMap` removed for WebGPU; `SSAONode`; Voxel Cone Tracing diffuse GI (`vxgi`, WebGPU); `softParticles()`; Bloom faster blur; toon gradient uses view-space normal; Sky clouds | |

Sources: https://github.com/mrdoob/three.js/releases/tag/r181 ... /r186 ;
https://github.com/mrdoob/three.js/wiki/Migration-Guide

### 1.1 New built-in WebGL post path (r182+) [high]

`src/renderers/WebGLRenderer.js` (r186):

```js
const renderer = new THREE.WebGLRenderer({ antialias: true, outputBufferType: THREE.HalfFloatType });
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.setEffects([ new GTAOPass(scene, camera, w, h), new UnrealBloomPass(size, 0.35, 0.4, 1.0) ]);
renderer.render(scene, camera); // scene -> MSAA HalfFloat target -> effects -> tone map + sRGB
```

`setEffects` errors if `outputBufferType` is UnsignedByte, and warns that `OutputPass` is not
needed. Internally `WebGLOutput` renders into a 4x MSAA target and ping-pongs standard `Pass`
objects (`render(renderer, writeBuffer, readBuffer)`), so the existing addon passes work.
Verified rendering in experiment 1 (`post=effects`).

### 1.2 TSL node materials on WebGLRenderer (r184+) [high]

```js
import * as THREE from 'three/webgpu';            // node materials + TSL
import { WebGLRenderer } from 'three';
import { WebGLNodesHandler } from 'three/addons/tsl/WebGLNodesHandler.js';
const renderer = new WebGLRenderer({ antialias: true });
renderer.setNodesHandler(new WebGLNodesHandler());
const mat = new THREE.MeshPhongNodeMaterial(); mat.colorNode = Fn(() => ...)();
```

Limitations stated in the file: no VSM shadows, no MRT, no transmission, no WebGPU post stack, no
storage textures, fog/env don't auto-update (call dispose), instanced geometry can't be shared.
Source: `examples/jsm/tsl/WebGLNodesHandler.js`, example `webgl_tsl_shadowmap.html`.
This is the low-risk way to start writing materials in TSL (portable to WebGPU later).

---

## 2. Colour management and tone mapping

### 2.1 Rules [high]
- Working space is linear sRGB (`THREE.ColorManagement.enabled = true`, default). Every *colour*
  texture (albedo, emissive, baked colour, canvas-painted pixel art, sprites) needs
  `texture.colorSpace = THREE.SRGBColorSpace`; data textures (normal, roughness, AO, lightmap in
  linear, LUT, noise) stay `NoColorSpace`/linear.
- `renderer.outputColorSpace = SRGBColorSpace` (default). With post-processing, the colour-space
  conversion and tone mapping must happen exactly once, at the end (`OutputPass`,
  `ToneMappingEffect`, or automatically via `setEffects`). Intermediate buffers should be
  `HalfFloatType` so HDR values > 1 survive until tone mapping (pmndrs README explains the banding
  you get with 8-bit sRGB intermediates).
- Grading LUTs are display-referred: apply after tone mapping + sRGB (three's
  `webgl_postprocessing_3dlut` puts `LUTPass` after `OutputPass`).
- Emissive/HDR: drive bloom with emissive values > 1 (e.g. `color.multiplyScalar(4)`) and a bloom
  threshold of ~1.0 so only "hot" things glow. (Our current pipeline already does this.)

### 2.2 Which tone mapper [high for facts, med for taste]
Options in three: `None, Linear, Reinhard, Cineon, ACESFilmic, AgX, Neutral, Custom`.

- **ACESFilmic**: punchy contrast, but per-channel curve shifts hues (oranges -> yellow, saturated
  darks clip). Our `pipeline.ts` already contains a custom "ACES on luminance, hue-preserving"
  mix to fight exactly this.
- **AgX**: Blender's default view transform since 4.0; three's AgX is close to Blender's (forum,
  maintainer statements). Desaturates by design; needs a little more exposure (I used 1.35) and a
  grade/LUT for punch. Best choice when assets are look-dev'd in Blender.
- **Neutral (Khronos PBR Neutral)**: designed so base colours under neutral light come out as
  authored; minimal hue shift; compresses only highlights. Best for hand-picked pixel-art palettes.

**Experiment 1** (same scene, 1280x720, MSAA, bloom): `threejs-render-assets/tonemap_montage.png`.
ACES = more contrast + hue skew; AgX = flat/desaturated; Neutral = palette preserved, warmest,
cleanest highlight roll-off. Recommendation for Orbkin: **Neutral** (or AgX if the art pipeline
moves to Blender look-dev; then use AgX in both tools and grade with a LUT).

Custom tone mapping hook (WebGL) from `webgl_tonemapping.html`:
```js
THREE.ShaderChunk.tonemapping_pars_fragment = THREE.ShaderChunk.tonemapping_pars_fragment.replace(
  'vec3 CustomToneMapping( vec3 color ) { return color; }',
  `vec3 CustomToneMapping( vec3 color ) { color *= toneMappingExposure; /* your curve */ return color; }`);
renderer.toneMapping = THREE.CustomToneMapping;
```

Sources: https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/webgl_tonemapping.html ;
https://www.khronos.org/news/press/khronos-pbr-neutral-tone-mapper-released-for-true-to-life-color-rendering-of-3d-products ;
https://github.com/mrdoob/three.js/issues/27362 (AgX) ; https://discourse.threejs.org/t/tone-mapping-overview/75204

### 2.3 Grading with free LUTs [high]
- three loaders: `LUTCubeLoader` (.cube), `LUT3dlLoader` (.3dl), `LUTImageLoader` (PNG strip);
  pass: `LUTPass({ lut: result.texture3D, intensity })`. pmndrs: `LUT3DEffect`, `LUTCubeLoader`,
  `LookupTexture`.
- **We can author LUTs in code**: `research/threejs-render-assets/make_cube.py` writes a 33^3 `.cube`
  (split-tone plum shadows / warm highlights, gentle S-curve, +10% saturation). Verified
  rendering through `LUTPass` (`lut_compare.png`).
- Artist route, all free: render a neutral Hald CLUT (`convert hald:8 hald.png` in ImageMagick),
  paste it next to a screenshot in GIMP/Krita, grade the whole image, crop the Hald back out and
  load it with `LUTImageLoader` (or convert to .cube).

---

## 3. Resolution, sharpness and the "pixel" question

### 3.1 Experiment 2: 640x360 nearest-upscaled vs native 1280x720 + MSAA [high]
Same scene, same 64-px pixel textures (`res_compare.png`, 1:1 crops). The low-res frame resamples
the texel grid onto a pixel grid of similar frequency, so texels become irregular mush; geometry
edges stair-step; light gradients band. Native res keeps every texel a crisp square (nearest
magnification) with clean AA edges, and lighting/shadows stay smooth. SwiftShader cost: low-res
81 ms vs native 650 ms per frame *with* the post stack (CPU rasteriser; on a real GPU the ratio is
far smaller, but fill-rate is the cost to budget for on phones).

What makes a three.js render "sharp":
- `renderer.setPixelRatio(Math.min(devicePixelRatio, 2))` (1.5 on low-tier phones), canvas sized
  in CSS px, never CSS-upscaled.
- MSAA (`antialias:true`, or `samples:4` on the composer target, or pmndrs
  `multisampling: 4`) + SMAA for post-pass edges. TAA/TRAA blurs pixel art; avoid it unless the
  art is smooth.
- Pixel-art textures: `magFilter = NearestFilter`, `minFilter = NearestMipmapLinearFilter` (or
  the game's palette-preserving mip chain) and `anisotropy = renderer.capabilities.getMaxAnisotropy()`
  for the grazing floor. Consistent texel density per world unit across all assets.
- Don't run full-screen blurs at low res over everything (tilt-shift only at the frame edges).

### 3.2 If pixelation is kept (t3ssel8r-style "3D pixel art") [high]
r186 `webgl_postprocessing_pixel.html` (`RenderPixelatedPass(pixelSize, scene, camera,
{normalEdgeStrength: .3, depthEdgeStrength: .4})`, orthographic camera) now ships full snapping
code. Key functions (verbatim names): `pixelAlignFrustum(camera, aspect, pxW, pxH)` shifts the
ortho frustum by the sub-pixel remainder of the camera position projected on camera right/up;
`pixelAlignObject(obj, camera, pixelW, pixelH)` snaps object positions on the camera plane;
`snapObjectRotation(obj, camera, deg)`; `pixelAlignCamera(camera, target, rotDeg, zoomStep)`.
Restore the unsnapped transforms after `composer.render()`. Without this, texels "swim" as the
camera moves. Ortho camera is required for exact snapping.
Source: https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/webgl_postprocessing_pixel.html

---

## 4. Lighting

### 4.1 Direct lights and shadows [high]
- **Shadow types (WebGL)**: `BasicShadowMap` (hard), `PCFShadowMap` (soft since r182; use
  `light.shadow.radius`), `PCFSoftShadowMap` (deprecated r182), `VSMShadowMap` (blurred, light
  bleeding; `shadow.blurSamples`). Bias: `shadow.bias ~ -0.0005..-0.0001`, `shadow.normalBias
  ~0.01..0.05`. Fit the shadow camera tightly to the diorama (`shadow.camera.left/right/top/bottom`
  for directional) for texel density; 2048 desktop / 1024 phone.
- **PCSS (contact-hardening)**: `webgl_shadowmap_pcss.html` patches `shadowmap_pars_fragment` with
  a blocker search + Vogel disk (requires `BasicShadowMap` to read raw depth). Packaged version:
  `@pmndrs/vanilla` `pcss({ size: 25, samples: 10, focus: 0 })` (by N8Programs) - swaps the chunk
  and recompiles.
- **Cookies / gobos**: `SpotLight.map` projects a texture (window panes, leaf dapple) - the game
  already uses this. WebGPU has `ProjectorLight` and `IESSpotLight`.
- **Contact shadows**: `webgl_shadow_contact.html` renders the scene depth from below into a
  512^2 target, blurs H+V (blur ~3.5), and lays it on a plane: cheap soft grounding for sprites.
- **CSM**: `examples/jsm/csm/CSM.js` (WebGL) / `CSMShadowNode`; r186 `SunLight` addon (cascaded,
  2 cascades default; `WebGLLights` handles `isSunLight`, WebGPU registers `SunLightNode`). Not
  needed for a single diorama; useful for the overworld.
- **Accumulated soft shadows**: `@pmndrs/vanilla` `ProgressiveLightMap` +
  `SoftShadowMaterial` (drei's AccumulativeShadows): jitter a light over N frames into a shadow
  catcher - photographic soft shadows for static scenes.
- **Many lights**: r185 `ClusteredLighting` (Forward+, WebGPU), for FX-heavy battles.

### 4.2 Image-based light (IBL) [high]
- `scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture` gives soft studio
  fill with zero assets; `scene.environmentIntensity`, `scene.environmentRotation` (r162+);
  `scene.backgroundBlurriness`. HDRIs via `HDRLoader` (renamed from RGBELoader), `EXRLoader`,
  `UltraHDRLoader` (jpg-sized HDR). Poly Haven HDRIs are CC0 (but polyhaven.com is blocked here;
  any CC0 .hdr works).
- Best stylised trick: **render your own diorama/sky into a cube camera once**, PMREM it, and use it
  as `scene.environment` - indirect light then carries the scene's own palette.
- `GroundedSkybox` (projects an HDRI onto a ground disk) for outdoor vistas.
- `LightProbe` + `LightProbeGenerator.fromCubeTexture()` / `.fromCubeRenderTarget()` = one SH probe
  for cheap ambient that matches the environment (`webgl_lightprobe.html`).

### 4.3 Baked GI in the browser: `LightProbeGridWebGL` (r184-r186) [high]
A 3D grid of L2 SH irradiance probes packed into one RGBA 3D render target; baking is fully on the
GPU (cubemap per probe -> SH projection -> repack), optional extra bounce passes, incremental
baking (`start`, `count`, `pass`). It is a `Light`: add it to the scene and every standard material
gets position-dependent diffuse GI.

```js
import { LightProbeGridWebGL } from 'three/addons/lighting/LightProbeGridWebGL.js';
const probes = new LightProbeGridWebGL(16, 7, 14, 8, 4, 7); // size xyz, probes xyz
probes.position.set(0, 3.5, 0);                               // centred volume
probes.bake(renderer, scene, { cubemapSize: 16, near: 0.05, far: 40, bounces: 1 });
scene.add(probes);
```
**Experiment 3**: 8x4x7 = 224 probes, 1 bounce, cubemap 16: **4.9 s on SwiftShader** (CPU);
expect tens of ms on a GPU, i.e. affordable once at arena load. Visual: shadow sides pick up warm
bounce from the dirt and the hemisphere fill can drop (`gi_ao_montage.png`). Effect is subtle on
a monochrome cave; strong in coloured scenes (Cornell-box example). Reduce `HemisphereLight`
when using it to avoid double ambient.
Source: https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/jsm/lighting/LightProbeGridWebGL.js ,
`webgl_lightprobes*.html`.

### 4.4 Baked lightmaps from Blender [high]
- glTF has no lightmap slot; export a second UV map (TEXCOORD_1 -> `geometry.attributes.uv1`),
  load the bake separately and set `lightMap.channel = 1` (r151+), `material.lightMap`,
  `lightMapIntensity` (forum answers by maintainers; docs that claim "uses uv2 automatically" are
  outdated). Check `flipY = false` for glTF-convention textures.
- Alternative used by most "Blender + three.js" showcase sites (Bruno Simon's 2019 folio, Three.js
  Journey "portal" lesson, Codrops 2025 "3D world in the browser"): bake *Combined* lighting
  straight into a colour texture per object (one UV set), render with `MeshBasicMaterial`.
  Dynamic objects get real-time light; static ones are "free".
- **Blender colour pipeline, verified (Blender 5.2 headless, `blend/bake_test.py`)**: a Cycles
  Combined bake of a sunlit orange floor gives linear `[1.83, 1.25, 0.68]` (HDR). Saving to 8-bit
  PNG with the *Standard* view transform clips to `[255,255,215]` (lost highlight colour);
  `save_render` with AgX bakes the curve in: `[216,202,186]`. So either
  (a) bake to **EXR/HDR (float)**, load linear, and let three apply `AgXToneMapping` (matches
  Blender) - best fidelity; or (b) bake **"as render" with AgX** into sRGB PNG and set the baked
  materials `toneMapped = false` (dynamic objects still tone-mapped by the renderer); or (c) lower
  the bake exposure so values stay < 1 and multiply back with `lightMapIntensity`.
- In-browser alternative: `three/addons/misc/ProgressiveLightMap.js` (`webgl_shadowmap_progressive`):
  N jittered shadow-casting directional lights accumulate into a lightmap (auto-packs `uv1`),
  `lightMapRes 1024`, `shadowMapRes 512`, 8 lights.

### 4.5 Ambient occlusion [high]
Ranked for a static diorama: **baked** (vertex AO / Blender AO bake / texture bevel - zero runtime
cost; the game already does vertex AO) > **N8AO** > three `GTAOPass` > `SSAOPass`/`SAOPass`.
- **N8AO** (`n8ao` 2.0.1, ISC): `N8AOPass` (replaces RenderPass) or `N8AOPostPass` (pmndrs). Key
  params: `aoRadius` (1-2 orders of magnitude below scene size), `distanceFalloff` (~1),
  `intensity` (2 soft .. 5 strong), `color` (tinted AO = cheap fake GI), `halfRes` (2-4x faster,
  depth-aware upsampling), `setQualityMode('Performance'|'Low'|'Medium'|'High'|'Ultra'|'Neural-*')`.
  Requires SMAA (hardware MSAA doesn't apply to AO).
- **Experiment 4** (SwiftShader, 1280x720): baseline post 611 ms; +N8AO Medium 1227 ms; +GTAOPass
  1798 ms (`gi_ao_montage.png`, `crops_ao.png`). On a real GPU both are a few ms; GTAO also
  re-renders normals (the HD2D doc measured 2.4x frame and +35 draw calls). Visual gain on blocky
  props is modest: contact darkening at rock bases. Prefer baked AO for static, N8AO half-res for
  dynamic contact.

---

## 5. Post-processing

### 5.1 Frameworks [high]
| Option | Status | Use when |
|---|---|---|
| three `EffectComposer` + addon passes (`RenderPass`, `UnrealBloomPass`, `GTAOPass`, `SMAAPass`, `TAARenderPass`, `BokehPass`, `LUTPass`, `OutputPass`, `RenderPixelatedPass`, `OutlinePass`) | stable, every pass is a fullscreen draw | simple stacks; what the game uses now |
| `renderer.setEffects()` (r182+) | stable | same passes, built-in MSAA HDR target, auto tone map |
| **pmndrs `postprocessing` 6.39.5** (Zlib; peer three >=0.168 <0.187) | stable; v7 is beta (7.0.0-beta.16, Feb 2026) | many effects: `EffectPass` merges them into one shader; single fullscreen triangle |
| TSL `RenderPipeline` (r183+; `PostProcessing` before) with `pass()`, `mrt()`, `bloom()`, `ao()`, `traa()`, `ssgi()`, `ssr()`, `dof()`, `outline()`, `toonOutlinePass()`, `pixelationPass()`, `retroPass()`, `lut3D()`... | maturing fast | WebGPURenderer projects |

pmndrs effect classes in 6.39.5: ASCII, Bloom (mipmap blur), BrightnessContrast, ChromaticAberration,
ColorAverage, ColorDepth, Depth, DepthOfField, DotScreen, FXAA, Glitch, GodRays, Grid,
HueSaturation, LensDistortion, LUT1D/LUT3D, Noise, Outline, Pixelation, RealisticBokeh, Scanline,
SelectiveBloom, Sepia, ShockWave, SMAA, SSAO, Texture, TiltShift, ToneMapping (modes incl. AGX,
NEUTRAL, ACES_FILMIC), Vignette. Rules from its README: `antialias:false, stencil:false,
depth:false` on the renderer, `frameBufferType: HalfFloatType`, renderer `toneMapping =
NoToneMapping` and `ToneMappingEffect` at the end.

**Experiment 5** (`pmndrs_compare.png`): RenderPass -> N8AOPostPass -> EffectPass(Bloom mipmap,
TiltShift) -> EffectPass(ToneMapping NEUTRAL, HueSaturation, BrightnessContrast, Vignette) works on
three r186. Lesson: tilt-shift must be centred on the action (`offset`, `focusArea ~0.55`,
`feather ~0.35`) or it blurs the characters; N8AO intensity 3 + tinted colour darkened the scene,
so re-balance exposure after adding AO.

Recommended HD-2D order (HDR -> LDR):
`Render(MSAA, HalfFloat)` -> `AO` -> `[outline]` -> `Bloom (threshold >= 1.0, mip blur)` ->
`DOF/TiltShift` -> `ToneMapping` -> `LUT / colour grade` -> `Vignette` -> `[film grain / dither]` ->
`SMAA` (if MSAA absent). Keep the volumetric shafts as geometry (current approach), not radial blur.

### 5.2 Bloom [high]
- `UnrealBloomPass(resolution, strength, radius, threshold)`; three r186 merges taps into bilinear
  fetches. pmndrs `BloomEffect({ mipmapBlur:true, luminanceThreshold:1.0, luminanceSmoothing:0.2,
  intensity, radius })` = Call-of-Duty style progressive down/upsample, good quality/perf.
- Selective bloom without layers: keep everything else < 1.0 linear and make emitters > 1. With TSL:
  MRT `emissive` channel -> `bloom(emissivePass)` (`webgpu_postprocessing_bloom_emissive`).
- Folio-2025 values: `bloom(threshold 1, strength 0.25, smoothWidth 1)`, mips 5 (high) / 2 (low).

### 5.3 DOF and tilt-shift [high]
- three `BokehPass({ focus, aperture, maxblur })`; pmndrs `DepthOfFieldEffect({ focusDistance,
  focusRange, bokehScale, resolutionScale:0.5 })` (world units), `TiltShiftEffect({ offset,
  rotation, focusArea:0.4, feather:0.3, kernelSize, resolutionScale:0.5 })`. TSL `dof()` node.
- Folio-2025 ships a "cheapDOF" pass on high quality only.
- HD-2D camera practice (multiple project notes, not official): FOV 25-35 deg, pitch 35-45 deg,
  blur at top/bottom bands; depth-based DOF only where depth varies.

### 5.4 Anti-aliasing [high]
MSAA for geometry; SMAA (`SMAAPass`, pmndrs `SMAAEffect` preset ULTRA) after post; FXAA is blurry;
`TAARenderPass`/TRAA (WebGPU) are the only fix for shader aliasing and specular shimmer but smear
pixel art and sprites. `material.alphaToCoverage = true` gives smooth MSAA edges on alpha-tested
foliage (needs MSAA; 5 opacity levels at 4x).

---

## 6. Stylised rendering

### 6.1 Toon ramps [high]
- WebGL: `MeshToonMaterial({ gradientMap })` with a tiny `DataTexture` (RedFormat, N texels,
  `NearestFilter`, `generateMipmaps=false`) = N hard bands; shadows still apply.
  `OutlineEffect(renderer)` adds inverted-hull outlines for toon materials (WebGL only).
- TSL: `MeshToonNodeMaterial` + `toonOutlinePass(scene, camera)` (WebGPU). The lighting model
  (`ToonLightingModel`) is ~30 lines - copy the pattern for custom models. **Verified** on three
  r180 `WebGPURenderer({ forceWebGL: true })` (`threejs-render-assets/toon.html`,
  `tsl_banded_toon.png`: two soft bands, plum-tinted shadows, next to a PBR reference sphere):
```js
import * as THREE from 'three/webgpu';
import { LightingModel } from 'three/webgpu';
import { smoothstep, normalView, diffuseColor, color, uniform } from 'three/tsl';
const shadowTint = uniform(color('#5a3a6a'));                    // ambient/shadow side tint
class BandedModel extends LightingModel {
  direct({ lightDirection, lightColor, reflectedLight }) {      // lightColor already includes shadows
    const ndl = normalView.dot(lightDirection);                 // view space
    const band = smoothstep(0.0, 0.05, ndl).mul(0.55).add(smoothstep(0.5, 0.55, ndl).mul(0.45));
    reflectedLight.directDiffuse.addAssign(lightColor.mul(band).mul(diffuseColor.rgb).mul(1 / Math.PI));
  }
  indirect(builder) {
    const { ambientOcclusion, irradiance, reflectedLight } = builder.context;
    reflectedLight.indirectDiffuse.addAssign(irradiance.mul(diffuseColor.rgb).mul(shadowTint).mul(1 / Math.PI));
    reflectedLight.indirectDiffuse.mulAssign(ambientOcclusion);
  }
}
class BandedMaterial extends THREE.MeshStandardNodeMaterial { setupLightingModel() { return new BandedModel(); } }
```
  (Pattern from `src/nodes/functions/ToonLightingModel.js`.) Bands are hard-coded smoothsteps;
  swap in a ramp texture lookup for palette-exact bands. [high]

### 6.2 The art-directed lighting model (Bruno Simon, folio-2025) [high]
`sources/Game/Materials/MeshDefaultMaterial.js` (MIT) extends `MeshLambertNodeMaterial` and
replaces shading with one `outputNode`:
1. albedo from a **palette texture** (models are UV-mapped onto colour swatches; Blender palette
   node muted on export, texture set in three);
2. **light bounce**: for downward-facing normals near the ground, mix towards the terrain colour
   sampled under the fragment (`smoothstep(edgeLow, edgeHigh, dot(N, -Y))` x height falloff);
3. multiply by light colour x intensity (day cycle uniforms);
4. **core shadow** = `smoothstep(coreShadowEdgeHigh, coreShadowEdgeLow, dot(N, L))` (soft
   terminator, not a ramp texture);
5. **drop shadow** captured via `receivedShadowNode = Fn(([shadow]) => { caught.mulAssign(shadow.r);
   return float(1) })` so the engine's shadow doesn't darken lighting directly;
6. `shadowColour = albedo x shadowTint` and `mix(lit, shadowColour, max(core, drop))` - shadows are
   *tinted, never black*;
7. fog mix, alpha test, reveal effect; `vec4(color, alpha)`.
Lighting: one `DirectionalLight` (2048 map on high / 512 low, bias -0.001, normalBias 0.1,
radius 3/2), shadow camera follows the view's "optimal area". Emissive materials normalise colour
by luminance then multiply intensity (`colorNode = c.div(luminance(c)).mul(intensity)`) so hue
stays constant while brightness drives bloom.
Renderer: `WebGPURenderer({ forceWebGL:false, antialias: pixelRatio < 2 })`, `sortObjects=false`
with custom renderOrder sorts, `RenderPipeline` = scene pass + `bloom()` + cheap DOF.
Sources: https://github.com/brunosimon/folio-2025 (Rendering.js, Materials.js, Ligthing.js,
Materials/MeshDefaultMaterial.js).

Same idea in WebGL (our renderer): `onBeforeCompile` replacing `lights_fragment_end` /
`opaque_fragment`, or a `ShaderMaterial` with `UniformsLib.lights` + `#include <shadowmap_pars_fragment>`
and `getShadow(...)`. The game's sprite toon shader is already this style.

### 6.3 Outlines [high]
1. **Inverted hull** (best for characters/creatures, any renderer): `@pmndrs/vanilla` `Outlines({
   thickness: 0.05, screenspace: false|true, angle: Math.PI, color })` clones the mesh with
   `BackSide`, pushes vertices along normals (world space or clip space: `clipPosition.xy +=
   normalize(clipNormal.xy) * thickness / size * clipPosition.w * 2`), uses
   `toCreasedNormals(geometry, angle)` so hard edges don't crack. Supports skinned + instanced.
2. **Post edge detection** (best for environments): Omar Shehata's `CustomOutlinePass` reads depth
   + a normal (or **surface-ID**) buffer, sums |depth diff| over 4 neighbours and |normal diff|
   over 8, applies `multiplierParameters = (depthBias 0.9, depthMult 20, normalBias 1, normalMult
   1)`, then FXAA. Surface IDs (per-object/face colour IDs) give clean lines on coplanar parts.
   Source: https://github.com/OmarShehata/webgl-outlines (threejs/src/CustomOutlinePass.js).
3. `RenderPixelatedPass`: 1-px edge highlights/darkening at low res (`normalEdgeStrength 0.3`,
   `depthEdgeStrength 0.4`) - the t3ssel8r look.
4. `OutlinePass` / pmndrs `OutlineEffect`: selection glow (not stylised lines).

### 6.4 Painterly / other looks [med]
Kuwahara (anisotropic) filter post pass for watercolour/oil (Maxime Heckel "On Crafting Painterly
Shaders"; Codrops "Susurrus" case study), Moebius-style hatching + outlines, Sobel pencil
(Codrops 2022). Useful for title/menu art direction, not core battles.

### 6.5 Sprites in a lit 3D world (HD-2D specific) [med]
- HD-2D sprites are lit by scene lights. Because Orbkin *bakes sprites from 3D models every frame*,
  it can also bake a **normal buffer** (MRT or second pass) and shade the billboard with the scene's
  lights (spot cookie, ember point lights, rim) instead of a fixed toon key. Pixel-art caveat
  (Defold forum): quantise shading into bands or it looks airbrushed.
- Sprite shadows: real mesh as invisible shadow caster (current approach) or alpha-tested
  `customDepthMaterial` on the billboard.
- **Occlusion dither** (r186 `webgpu_tsl_occlusion_dither`): fragments of props between camera and
  a target are discarded with `bayer16(screenCoordinate)` vs a cone-distance cut (`maskNode`),
  so foreground rocks never hide the kin. Easy to port to WebGL `onBeforeCompile` + 4x4 Bayer.

---

## 7. Environment shaders

- **Grass**: SimonDev `Quick_Grass` (MIT; Ghost of Tsushima GDC technique). Blades generated in
  the vertex shader from `vertIndex` (segments x 2 sides), per-blade hash -> angle/height/lean/shade,
  wind from 2D noise (axis + lean), player push, curved normals = two normals rotated +/-0.3 PI for
  a rounded look, view-space thickening when edge-on, LOD by distance, base->tip colour ramp.
  https://github.com/simondevyoutube/Quick_Grass (public/shaders/grass-lighting-model-vsh.glsl).
  For HD-2D pixel grass: same instancing but quantise wind sway to texel steps (the game already
  does this for billboards). [high]
- **Fluffy stylised trees** (Ghibli look): scatter alpha-tested leaf-cluster quads over a low-poly
  canopy blob, expand them in view space in the vertex shader, and **use the blob's spherical
  normals** for lighting so the canopy shades as one soft volume; add a rim/fresnel term and wind.
  Refs: douges.dev "Creating fluffy trees with Three.js", three.js forum "Fluffy Tree - Anime
  Style" (leoawen/fluffytree-threejs), halisavakis.com stylised leaves. `alphaToCoverage` for edges.
  [med]
- **Water**: three `Water` / `Water2` / `Reflector` (planar mirror), `WaterMesh` (WebGPU); stylised:
  depth-difference foam (sample scene depth texture, `foam = 1 - saturate((sceneDepth -
  waterDepth) / foamDist)`), scrolling noise normals, banded colour by depth. Refs:
  thaslle/stylized-water (R3F), forum "Unlit water shader with foam", tekano/shoreline (WebGPU,
  WebGL2 fallback). `@pmndrs/vanilla` `MeshReflectorMaterial` = blurred planar reflection floor. [med]
- **Sky/atmosphere**: `Sky`/`SkyMesh` (r186 more realistic clouds), `@takram/three-atmosphere` &
  `three-clouds` (MIT) for physical skies. [med]
- **Fog**: `FogExp2`, or height fog (TSL `exponentialHeightFogFactor()` r183;
  `webgpu_custom_fog_scattering`). WebGL: `onBeforeCompile` on `fog_fragment`. [high]
- **Particles**: soft particles (r186 `softParticles()` fades by depth difference), instanced
  billboards; GPU compute particles only on WebGPU. [high]

### 7.1 Surface-detail multipliers (cheap ways to make surfaces read "dense") [high for APIs, med for taste]
- **Decals**: `three/addons/geometries/DecalGeometry.js` (`webgl_decals`) projects cracks, moss,
  grime, scorch marks, chalk rings onto any mesh; merge static decals into one mesh/atlas.
- **Triplanar** mapping for procedural/sculpted rock without UVs: TSL `triplanarTexture(texX, texY,
  texZ, scale, position, normal)`; WebGL via `onBeforeCompile`. Keeps texel density constant on
  arbitrary Blender meshes (pixel-art friendly if sampled with nearest).
- **Parallax**: TSL `parallaxUV(uv, scale)` (`webgpu_parallax_uv`) adds depth to brick/boulder
  textures; WebGL: `bumpMap`/`normalMap` + `displacementMap` on subdivided meshes.
- **Per-instance variation**: `InstancedMesh.setColorAt` / `BatchedMesh` colour jitter, random
  rotation/scale; TSL `mx_noise_*` / `mx_fractal_noise_*` (MaterialX noise) for macro variation so
  repeats don't tile visibly.
- **Palette textures** (folio-2025): one tiny swatch texture coloured by UV islands - every prop
  shares one material (one draw path), recolour by swapping the palette per arena/biome.
- **Baked curvature/edge-wear/AO from Blender** into the albedo (pixel-art "lit lip" and "dark
  seam" done properly on real geometry) - the game's texel bevel is the procedural version of this.

---

## 8. WebGPU / TSL status (late 2026)

- **Renderer**: `import * as THREE from 'three/webgpu'`; `new WebGPURenderer()` tries WebGPU then
  falls back to a WebGL2 backend; `forceWebGL:true` to test the fallback; must `await
  renderer.init()` (or use `setAnimationLoop`) - async render APIs deprecated in r181.
- **Browser support** (gpuweb Implementation Status wiki, mid-2026): Chrome/Edge desktop since 113;
  Chrome Android 12+ (Qualcomm/ARM) since 121; Safari on macOS/iOS/iPadOS 26; Firefox Windows 141+,
  macOS 145/147, Linux still Nightly, Android not shipped. So a WebGL2 fallback remains mandatory.
  [med; blog claims of "universal" support are overstated]
- **Performance**: forum reports of WebGPURenderer being slower than WebGLRenderer on many-mesh
  scenes (per-object UBO cost, issue #30560) and slower first frame; the manual still recommends
  WebGLRenderer for pure WebGL2 apps. Gains are in compute and very high draw counts. [med]
- **Production proof**: Bruno Simon folio-2025 (three 0.183, TSL everywhere, WebGL fallback). [high]
- **WebGPU-only quality features**: SSGI (`ssgi(color, depth, normal, camera)` with `sliceCount 2,
  stepCount 8`, composite `color*ao + diffuse*gi`, then `traa()`), VXGI (`vxgi(depth, normal,
  scene, camera, 64)`), TRAA with velocity MRT, TAAU/FSR1 upscaling, clustered lights, compute
  particles/cloth/water, volumetric lighting.
- **This container**: Chromium 141 headless exposes a SwiftShader WebGPU adapter only with
  `--enable-unsafe-webgpu --enable-features=Vulkan`; rendering a real scene (r180 and r186) ends in
  `WebGPU Device Lost: A valid external Instance reference no longer exists`, and r186 also throws on
  a `swizzle` texture-view descriptor field this Chromium build types differently. So: **WebGPU
  output cannot be verified here; `WebGPURenderer({ forceWebGL: true })` works**: the TSL
  `PostProcessing` + `bloom()` pipeline rendered the test scene on r180, the r186 `RenderPipeline`
  with `ao()` (GTAONode, `resolutionScale = 0.5`) + `bloom()` rendered on r186, and the custom
  `LightingModel` above rendered on r180. `traa()` on r180 threw `Invalid value used as weak map
  key` with an operator-node input (r186 examples pass composite nodes; untested on r186).
  [high for the container facts]

Recommendation: stay on `WebGLRenderer` (upgrade to r186), adopt TSL for *new* materials via
`WebGLNodesHandler`, and revisit a full WebGPURenderer switch only for a feature we need (SSGI/
compute) after a perf spike on real phones.

---

## 9. Draw calls, instancing, budgets

- `InstancedMesh` (same geometry+material; `setColorAt`, per-instance attributes), `BatchedMesh`
  (different geometries, one material, one draw via multi-draw; per-instance colour/opacity r183;
  `webgl_batch_lod_bvh`), `BufferGeometryUtils.mergeGeometries` for static props (the game's
  `VoxelBatch`), texture atlases / palette textures so one material covers many props (folio-2025
  colours whole worlds with one palette texture). [high]
- Rules of thumb (secondary sources, not official): < 100 draw calls desktop, ~50 mobile; < 100k
  visible tris mobile; DPR <= 2 (1.5 mobile); texture memory < ~200 MB; KTX2/Basis (free
  `toktx`, `gltf-transform etc1s/uastc`) for GPU-compressed textures; Draco/meshopt for geometry.
  [med]
- Shader variety costs compile time: pre-warm with `renderer.compileAsync(scene, camera)`.
- Quality tiers: shadows 2048/1024, AO half-res or baked, bloom mips 5/2, DOF only on high,
  DPR cap. Measure with `renderer.info.render.calls/triangles` and `stats-gl`.

---

## 10. Implications for Orbkin (prioritised)

1. **Spike "native-res HD-2D"** (biggest visual lever, 1-2 days): render arenas at device
   resolution (DPR <= 2) with MSAA instead of the 360p integer grid; keep pixel-art textures at a
   fixed texel density (raise density 2x so texels stay ~2-3 screen px at 720p), nearest mag +
   NearestMipmapLinear min + anisotropy; keep sprites pixel-crisp by snapping billboard positions to
   the sprite texel grid (pixelAlignObject idea) and baking them at 2-3 screen px per sprite texel;
   UI unchanged. Compare side by side with the reference; budget fill-rate on phones (low tier can
   keep DPR 1).
2. **Upgrade to three r186** (half a day + regression captures): replace `PCFSoftShadowMap` with
   `PCFShadowMap` + `shadow.radius`; re-check exposure (r181 energy changes); `Clock` -> `Timer`;
   consider `outputBufferType: HalfFloatType` + `setEffects()` to drop the custom composer target
   management.
3. **Tone map**: replace the hand-rolled ACES/hue-preserving mix with `NeutralToneMapping` (or AgX if
   the art moves to Blender look-dev) and move the per-arena grade into **generated `.cube` LUTs**
   (one per arena, built by a Python script like `make_cube.py`), applied with `LUTPass` after
   output. Keeps grading data-driven and reviewable.
4. **Bounce light**: `LightProbeGridWebGL` baked once per arena at load (or offline, saved) to get
   coloured bounce (lava -> red walls, grass -> green undersides) and lower the hemisphere fill.
5. **AO**: keep baked vertex AO; if dynamic contact AO is wanted, `N8AOPostPass` half-res on high
   tier only.
6. **Stylised lighting model**: port folio-2025's "core shadow smoothstep + tinted shadow colour +
   ground bounce + fog" to our WebGL materials (`onBeforeCompile`) or TSL via `WebGLNodesHandler`.
   Shadows should be albedo-tinted (plum/blue), never grey.
7. **Outlines**: creatures/trainers get inverted-hull outlines (creased normals, screen-space
   thickness ~1-1.5 px) if they become in-scene meshes; environment gets surface-ID edge detection
   only if we go "illustrated".
8. **HD-2D post signature**: pmndrs EffectPass with mip-bloom (threshold 1.0), TiltShift
   (focusArea ~0.55, feather ~0.35, offset to the battle line), Vignette, SMAA; light shafts stay
   as geometry.
9. **Detail via assets, not shaders**: whatever comes out of the Blender research (sculpted rock
   kits, baked AO/curvature/edge-wear into the pixel textures, decals, instanced rubble) - the
   renderer changes above are what let that detail read.
10. **Verification loop**: keep using headless captures (Playwright + SwiftShader) for A/B images;
    the harness in `threejs-render-assets/` (`run.mjs`, `scene.js`) shows the pattern with URL
    switches and timing. WebGPU cannot be verified in this container.

---

## 11. What a "threejs-render" skill should contain (proposal)

`SKILL.md` (short, decision-first) + `reference/` files:
- `decisions.md`: renderer choice (WebGL r186 + TSL via WebGLNodesHandler), tone mapper table,
  native-res vs pixel grid rules, post order, budgets per tier.
- `recipes/*.md` with verbatim, tested snippets: HDR composer / `setEffects`; pmndrs HD-2D stack;
  N8AO config; LightProbeGridWebGL bake; Blender lightmap load (`uv1`, `channel = 1`, colour
  rules); inverted-hull outlines; edge-detect pass; toon gradientMap; folio-style lighting model;
  pixel snapping; occlusion dither; LUT generation (`make_cube.py`); grass/foliage/water shader
  skeletons.
- `verify.md`: how to capture A/B screenshots headless (`run.mjs` pattern, SwiftShader flags,
  `?post=` switches), how to read `renderer.info`, and a checklist (colour spaces set? one tone map?
  HalfFloat buffers? draw calls? DPR cap?).
- `gotchas.md`: PCFSoft removal, PostProcessing -> RenderPipeline rename, GTAO r185 darker,
  `toneMapped:false` for pre-tonemapped bakes, WebGPU device-lost in this container, lightmap
  docs outdated, alphaToCoverage needs MSAA, TAA smears pixel art.

---

## 12. Experiments index (all in `research/threejs-render-assets/`)

| # | What | Result | Files |
|---|---|---|---|
| 0 | WebGPU in headless Chromium 141 | adapter only with `--enable-unsafe-webgpu --enable-features=Vulkan` (SwiftShader); real scenes -> device lost; `forceWebGL` OK | `run.mjs` (`page:gpu.html`) |
| 1 | ACES vs AgX(exp 1.35) vs Neutral | Neutral preserves palette; ACES hue/contrast; AgX flat | `tonemap_montage.png` |
| 2 | 640x360 nearest-upscaled vs 1280x720 MSAA | native much crisper texels and edges | `res_compare.png` |
| 3 | LightProbeGridWebGL 224 probes, 1 bounce | bake 4.9 s SwiftShader; subtle warm bounce | `gi_ao_montage.png` |
| 4 | N8AO vs GTAOPass | +~600 ms vs +~1150 ms SwiftShader; modest gain on blocks | `gi_ao_montage.png`, `crops_ao.png` |
| 5 | pmndrs stack on r186 | works; tilt-shift must target action | `pmndrs_compare.png` |
| 6 | Python `.cube` LUT -> `LUTPass` | works; plum shadows / warm highs | `lut_compare.png`, `make_cube.py` |
| 7 | `setEffects` (r182+) | renders; same cost as composer | `scene.js?post=effects` |
| 8 | Blender 5.2 Cycles bake colour | HDR values; Standard PNG clips; AgX "as render" bakes curve | `bake_test.py` |
| 9 | Custom TSL `LightingModel` (banded toon) | works on WebGPURenderer WebGL2 backend (r180) | `toon.html`, `tsl_banded_toon.png` |
| 10 | TSL `ao()` + `bloom()` RenderPipeline (r186, forceWebGL) | works; WebGPU backend itself = device lost here | `scene_gpu.js` |

SwiftShader timings are CPU rasterisation and only meaningful as relative costs.

How to re-run (originals live in `scratchpad/tjs/`; copies in `threejs-render-assets/`):
```sh
cd scratchpad/tjs && python3 -m http.server 8765 --bind 127.0.0.1 &   # serves exp/, three186/, three180 -> game node_modules/three, pp/
node runner/run.mjs shots "tm=neutral&res=native&post=composer" "tm=aces&res=low&post=composer" \
  "tm=neutral&post=composer&probes=1" "tm=neutral&post=pmndrs&ao=n8ao" "tm=neutral&post=composer&lut=warm"
PWARGS="--enable-unsafe-webgpu --enable-features=Vulkan" node runner/run.mjs shots page:gpu.html   # WebGPU adapter probe
node runner/run.mjs shots "gpu:tm=neutral&aa=msaa&ao=gtao&force=webgl"                           # TSL via WebGL2 fallback
```
`run.mjs` requires Playwright from the game's `node_modules`, launches Chromium with
`--use-angle=swiftshader --enable-unsafe-swiftshader --ignore-gpu-blocklist`, waits for
`window.__done`, screenshots, and prints `window.__result` (timings, draw calls) as JSON.

---

## 13. Sources

Primary code / docs (read directly):
- three.js examples (dev, r186): https://github.com/mrdoob/three.js/tree/dev/examples -
  `webgl_tonemapping`, `webgl_shadowmap_pcss`, `webgl_shadow_contact`, `webgl_lightprobe(s)`,
  `webgl_postprocessing_pixel`, `webgl_postprocessing_3dlut`, `webgl_materials_toon`,
  `webgl_shadowmap_progressive`, `webgl_tsl_shadowmap`, `webgpu_postprocessing_ssgi`,
  `webgpu_vxgi`, `webgpu_postprocessing_retro`, `webgpu_materials_toon`,
  `webgpu_tsl_occlusion_dither`, `examples/files.json`
- three.js source r186 (npm `three@0.186.1`): `src/renderers/WebGLRenderer.js` (setEffects),
  `src/renderers/webgl/WebGLOutput.js`, `examples/jsm/lighting/LightProbeGridWebGL.js`,
  `examples/jsm/tsl/WebGLNodesHandler.js`, `src/nodes/functions/ToonLightingModel.js`
- Release notes r181-r186: https://github.com/mrdoob/three.js/releases ; Migration guide:
  https://github.com/mrdoob/three.js/wiki/Migration-Guide ; TSL wiki:
  https://github.com/mrdoob/three.js/wiki/Three.js-Shading-Language ; llms.txt:
  https://raw.githubusercontent.com/mrdoob/three.js/dev/docs/llms.txt
- pmndrs/postprocessing README + npm 6.39.5 build: https://github.com/pmndrs/postprocessing
- N8AO README (npm 2.0.1): https://github.com/n8python/n8ao
- @pmndrs/vanilla 1.25.0 (pcss, Outlines, AccumulativeShadows): https://github.com/pmndrs/drei-vanilla
- Bruno Simon folio-2025 (MIT): https://github.com/brunosimon/folio-2025
- Omar Shehata webgl-outlines: https://github.com/OmarShehata/webgl-outlines ;
  https://omar-shehata.medium.com/how-to-render-outlines-in-webgl-8253c14724f9
- SimonDev Quick_Grass (MIT): https://github.com/simondevyoutube/Quick_Grass
- WebGPU implementation status: https://github.com/gpuweb/gpuweb/wiki/Implementation-Status

Secondary (search summaries; used for context, lower weight):
- Khronos PBR Neutral announcement; three.js forum threads on tone mapping, AgX, lightmaps
  (https://discourse.threejs.org/t/lightmap-uses-wrong-uv-in-loaded-gltf-model/57434), WebGPU
  performance (https://discourse.threejs.org/t/why-webgpurenderer-performance-significantly-lower-than-webglrenderer/77629)
- Bruno Simon 2019 case study (baked shadows): https://medium.com/@bruno_simon/bruno-simon-portfolio-case-study-960402cc259b
- Codrops: "Building a Fully-Featured 3D World in the Browser with Blender and Three.js" (2025),
  "Susurrus" (Kuwahara), "Sketchy Pencil Effect"; Maxime Heckel "On Crafting Painterly Shaders",
  "Field Guide to TSL and WebGPU"
- douges.dev fluffy trees; three.js forum "Fluffy Tree - Anime Style"; thaslle/stylized-water;
  tekano/shoreline
- utsubo.com "100 Three.js tips (2026)" and "Migrate Three.js to WebGPU (2026)" (blog; unverified
  numbers); discoverthreejs.com tips
- HD-2D: Wikipedia HD-2D; Unreal Engine Octopath spotlight (no technical breakdown exists publicly)
- Alpha to coverage: https://bgolus.medium.com/anti-aliased-alpha-test-the-esoteric-alpha-to-coverage-8b177335ae4f
