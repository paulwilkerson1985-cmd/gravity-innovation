# Real-device performance budget for Orbkin's proposed render and asset changes

Angle: every new rendering or asset recommendation from the other research notes was timed only on
SwiftShader (CPU). This note collects published, reproducible mobile numbers, audits what Orbkin's
frame really does, models what each proposal would cost on mid-range phones, and ships a two-minute
`?bench` protocol that turns the owner's phone into the source of truth.

Written 2026-10-14. Scratch work: `scratchpad/research/mobile-perf/` (audit scripts, bench build,
texture/meshopt timings, bandwidth model, downloaded primary sources in `src/`).

Confidence tags: **[high]** primary source or reproduced here, **[med]** credible secondary or
derived from primary numbers by simple arithmetic, **[low]** anecdotal or modelled.

---

## 0. TL;DR

1. **Bandwidth, not shader math, decides what fits on a phone.** A 2026 mid-range Android (Adreno
   610/619, Mali-G57 MC2, Helio G99, Snapdragon 695) has about **17 GB/s** of LPDDR4X shared by CPU,
   GPU and display. Orbkin's current low tier moves about **11 MB per frame** (0.7 GB/s at 60 fps).
   The proposed "native resolution + MSAA 4x HDR composer" moves about **345 MB per frame**, which
   needs about **21 GB/s at 60 fps**. That is more than the whole memory bus. [med: model built from
   the audited pass list and primary bandwidth figures]
2. **MSAA is only nearly free in one place: Chrome Android's default framebuffer.** There Chromium
   uses implicit resolve through `GL_EXT_multisampled_render_to_texture`. Three.js render targets with
   `samples: 4` (EffectComposer, pmndrs `multisampling`) take the renderbuffer + `blitFramebuffer`
   path instead. Arm/Khronos measured that path on a Mali-G76 at 2168×1080 at **+5 GB/s, about 500 mW,
   or 20% of the device power budget**. WebKit engineers profiled the same blit path on ANGLE-Metal
   (iOS/macOS) and called its time and bandwidth "significant". [high]
3. **GPU timer queries are not available by default on phones.** Chrome registers
   `EXT_disjoint_timer_query_webgl2` as a *developer* extension wherever the GPU bug-list entry 256
   ("expose on platforms with site isolation") does not apply, and Android is its listed exception.
   You need `chrome://flags/#enable-webgl-developer-extensions`. Safari needs Feature Flags → "WebGL
   Timer Queries". The bench therefore relies on sync-frame timing, rAF cadence and A/B ablation,
   and uses the timer query only when it is present. [high: Chromium source]
4. **Orbkin's current phone tier is already inside a sane budget.** A frame has about 17–20
   passes (sprite bakes included), 39–49 draw calls and 20–66k triangles. Resident GPU memory is
   about 12–15 MB (8 MB of it the frozen shadow map), live 2D canvases 0.1–3 MB and the JS heap
   11–43 MB. **Three hidden risks:** 19–53 shader programs are compiled at every scene entry and 58–66
   are live per scene. Live programs reach 120 after six scenes, against Chrome Android's program
   cache of only **2 MB** (**128 KB** on low-end). Procedural texture painting takes ≈ 1 s of JS per
   arena entry here, so ≈ 2–5 s on a phone. There is **no `webglcontextlost` handling**, which matters
   because iOS drops contexts on
   background. [high: audit in this session, Chromium source]
5. **Classification of the proposals.** These are **desktop-only**: native res + MSAA composer,
   live 2048 PCFSoft shadows, N8AO at native res, and `LightProbeGridWebGL` runtime baking. Its probe
   atlas is RGBA32F with linear filtering, which samples black on about 53% of iOS and 26% of
   Android devices. These are **tier-gated**: internal ×1.5–2, sprite supersample 2×, N8AO half-res at
   internal res, and pmndrs merged post at internal res. KTX2 is **opt-in**, needs owner approval
   for the tools, and only applies to ≥1024² smooth textures, never pixel art. These are
   **mobile-safe**: meshopt geometry, WebP/PNG atlases of 256–512 px, baked lighting in vertex
   colours or atlases, and frozen shadow maps.
6. **Budget per tier and the bench protocol are in §5 and §6.** The bench is built and verified
   headless. It has one URL, one START tap and one COPY tap. It takes about 2 minutes and outputs
   one `ORBKIN_BENCH {json}` line that Claude can diff against the budget.

---

## 1. Published numbers (what is actually known)

### 1.1 MSAA on tile-based GPUs

| Fact | Number | Source | Conf. |
|---|---|---|---|
| 4x MSAA resolved **inline** (on tile write-back, MS attachment transient) | ≈ **+3% bandwidth** vs no MSAA | Khronos Vulkan-Samples `performance/msaa` README (Arm-authored), Mali-G76 | high |
| 4x MSAA resolved in a **separate pass** (MS image stored, re-read, resolved) | **+5 GB/s** at 2168×1080 RGBA8 60 fps; "100 mW per GB/s", ≈ **500 mW = 20% of a 2.5 W budget**; with depth also stored: +6.3 GB/s, +302% vs inline, 630 mW (25%) | same README | high |
| Qualcomm Adreno | "MSAAx2 is likely to be practically free"; fewer MSAA samples, fewer RTs and lower resolution all reduce bin count | Qualcomm Snapdragon Game Developer Guide, "Adreno GPU on Mobile: Best Practices" (via search snippets; site blocked here) | med |
| Chrome WebGL **default framebuffer** with `antialias:true` | `kAntialiasingModeMSAAImplicitResolve` when `GL_EXT_multisampled_render_to_texture` exists (Android); **disabled on Mac/iOS builds** (crbug 376174085) and with Skia Graphite. Graphite on Android was a field trial on Vulkan-capable devices as of Dec 2025 (skia-discuss; Chromium "Enable SkiaGraphite field trial on Android"), so on those devices even the backbuffer pays an explicit resolve | `third_party/blink/renderer/platform/graphics/gpu/drawing_buffer.cc` (read in this session); https://groups.google.com/g/skia-discuss/c/Pd92csb5o4o/m/QlPj80PqAQAJ | high / med (rollout) |
| Chrome Android MSAA cap | GPU bug-list entry 268: "Limit MSAA to 4x on Android devices" | `gpu/config/gpu_driver_bug_list.json` | high |
| Chrome on Mali | entry 493: `glFinish` **before `glBlitFramebuffer`** for some framebuffers on Mali-G (a full pipeline stall) | same | high |
| three.js r180 render-target MSAA | `renderbufferStorageMultisample` + `blitFramebuffer` + `invalidateFramebuffer` after the blit. `WEBGL_multisampled_render_to_texture` (implicit) is only used where the browser exposes it (the Oculus browser), not in Chrome or Safari | `node_modules/three/src/renderers/webgl/WebGLTextures.js` `updateMultisampleRenderTarget`, `useMultisampledRTT` | high |
| EffectComposer / pmndrs composer MSAA | samples apply to **both** ping-pong buffers. three r180 `EffectComposer.js:80` `renderTarget2 = renderTarget.clone()` copies `samples`. pmndrs: "the composer doesn't know which of them will actually be used by a RenderPass". three's `UnrealBloomPass` targets also allocate unused depth buffers (`new WebGLRenderTarget(x, y, { type: HalfFloatType })`) | three r180 source; pmndrs/postprocessing issue #419 | high |
| WebKit / ANGLE-Metal blit resolve | "device profiling showed significant time and memory bandwidth spent on both the MSAA and single-sample targets plus the blit". WebKit added `glFramebufferResolveRenderbufferWE` (Metal store-and-resolve, MSAA discarded), **for WebXR only** | WebKit commit, July 2024 (lists.webkit.org webkit-changes 303702), bug 274137 | high (fact) / med (scope) |

**Implication.** MSAA on an offscreen HDR target in WebGL means storing 4 samples per pixel to DRAM
and reading them back. On a phone at native resolution that is the single most expensive thing
proposed. For a pixel-art diorama at an integer internal resolution, MSAA is unnecessary: texels are
already the anti-aliasing unit.

### 1.2 Tile memory sizes (why sample count and RT format matter)

| GPU | On-chip tile memory | Source | Conf. |
|---|---|---|---|
| Adreno 610 | **132 KB** GMEM (`SZ_128K + SZ_4K`) | Linux `drivers/gpu/drm/msm/adreno/a6xx_catalog.c` | high |
| Adreno 615 / 618 / 619 | **512 KB** | same | high |
| Adreno 630 / 640 | 1 MB | same | high |
| Adreno 660 / 690 | 1.5 MB / 4 MB | same | high |
| Adreno 642L / 643 | 512 KB | Qualcomm QCS spec tables (search) | med |
| Mali Valhall (G57/G68/G610) | tile 16×16 at ≤ 256 bits/px, 16×8 at ≤ 512, 8×8 above | azhirnov/cpu-gpu-arch summary of Arm docs | med |

Bins per frame on an Adreno 610 are roughly `W·H·bytes_per_px / 132 KB`:
- Orbkin low tier (271×586, RGBA16F + D24S8 = 12 B/px): **≈ 14 bins**.
- Native 1080×2400 RGBA8 + D24S8 (8 B/px): ≈ 157 bins.
- Native with RGBA16F + 4x MSAA (48 B/px): **≈ 940 bins**.

Every bin re-walks the binned geometry, so high-res MSAA HDR targets multiply vertex and binning
overhead on small-GMEM parts. [med: arithmetic on primary sizes]

### 1.3 Full-screen post passes

| Measurement | Number | Source | Conf. |
|---|---|---|---|
| Shipping mobile bloom (Spellsouls, Nordeus) | **3 ms** of frame time ("a good chunk of their budget at 60 FPS") | Arm community blog "Post-processing effects on mobile: optimization and alternatives" (search snippet; site blocked) | med |
| Bloom variants on a mobile tile-based GPU (device not named in snippet) | mip-chain **2.97 ms**, Kawase 4.25 ms, Gaussian 7.17 ms | ETASR paper "Bloom post-processing methods on a mobile tile-based ..." | med |
| Filament DOF (rewritten, "order of magnitude faster") | **≈ 4 ms on Pixel 4** (Adreno 640) | google/filament RELEASE_NOTES.md (cloned) | high |
| Filament's mobile-tuned defaults | bloom buffer **384 px tall**, 6 levels, LOW quality; SSAO at **0.5 resolution**, LOW quality; dynamic resolution min scale 0.5 | `filament/include/filament/Options.h` | high |
| N8AO | half-res "generally **2–4× faster**", depth-aware upsample "fixed cost of around 1 ms" (desktop), preset "Performance" (8 AO + 4 denoise samples) is the one for "Mobile, low-end iGPUs" | n8ao README | high (author's claims) |
| pmndrs postprocessing | `EffectPass` merges effects into one fullscreen pass; "almost every pass performs at least one expensive fullscreen render operation" | README, issue #82 | high |

No published source gives a "ms per full-screen pass" for Adreno 6xx or Mali-G5x in a browser. The
model in §3.2 and the bench probes in §6 fill that gap.

### 1.4 Render-target formats (half-float)

- WebGL2: half-float textures are filterable in core. Rendering to them needs
  `EXT_color_buffer_half_float` or `EXT_color_buffer_float`. **RGBA32F attachments fail
  (`FRAMEBUFFER_INCOMPLETE_ATTACHMENT`) on "most mobile systems"** (MDN WebGL best practices). [high]
- RGBA16F costs 8 B/px, twice RGBA8. `R11F_G11F_B10F` (4 B/px, HDR, no alpha) is renderable with
  `EXT_color_buffer_float`. three r180 supports it as `type: UnsignedInt101111Type, format:
  RGBFormat` (`WebGLTextures.js` maps it to `R11F_G11F_B10F`). That halves HDR target bandwidth.
  [high: source]
- `OES_texture_float_linear` (linear filtering of **32-bit** float textures): **≈ 74% Android,
  ≈ 46–48% iOS** (web3dsurvey). Three only *warns* when it is missing, and the texture then samples
  as incomplete (black). [med for percentages, high for three behaviour]

### 1.5 Shadows

- three.js issue #15577: the PCF Soft variant "unsuitable for most mobile devices and headsets"
  (Quest/Go). `PCFSoftShadowMap` was deprecated in r182 (see `threejs-render.md`). [high]
- Each shadow-casting light re-renders the shadow casters. Mobile guidance clusters at 512–1024
  maps. [med]
- Orbkin low tier already freezes the shadow map (rendered twice, then `autoUpdate = false`), and the
  frame audit confirms no shadow pass per frame on phones. [high]

### 1.6 Draw calls and CPU

- No reproducible µs-per-draw figure exists for Chrome Android WebGL (none found). PlayCanvas docs:
  "**100–200 draw calls is a rough target for low end mobile devices**". [med]
- Lighthouse CPU model: a high-end desktop is about **4× (range 2–10×)** a "mid-tier mobile" and
  **10× (5–20×)** a "low-end mobile" (GoogleChrome/lighthouse `docs/throttling.md`). This is used
  below to scale CPU timings measured in this container. [high for the convention, low for any one
  phone]
- Shader programs: Chromium's in-memory GPU program cache is **6 MB desktop, 2 MB Android, 128 KB
  low-end Android** (`gpu/config/gpu_preferences.h`). `KHR_parallel_shader_compile`: Chrome Android
  76+, Safari iOS 14.5+ (MDN). It removes stalls but not total compile time (Khronos spec). [high]

### 1.7 Memory, VRAM caps and context loss

- WebGL has no VRAM query. MDN recommends a **per-pixel VRAM budget** (the Google Maps technique):
  budget = constant × drawing-buffer pixels. [high]
- iOS Safari: a WebKit engineer on webgl-dev-list gave the max memory for a page as **2–3 GB depending
  on the model, including GPU memory**. Field reports: about **1.5 GB on iPhone 12 Pro, about 3 GB on
  iPhone 15 Pro** before the page silently reloads (GitHub issue Nehanth/pooled #207). A GPU-process
  "highwater" kill was reported at 316–522 MB on iPad (Apple forums). A Unity blog's "300–500 MB
  WebGL heap" has no source. [med / low]
- iOS Safari canvas limits: total canvas backing-store memory **224 MB (iOS 12) → 384 MB (iOS 15)**,
  after which canvases draw transparent. Per-canvas area is capped at **16,777,216 px**. Safari keeps
  released canvases for a while (pqina.nl). This matters because Orbkin paints every texture on 2D
  canvases. [med]
- Context loss: repeated reports of `webglcontextlost` on iOS when Safari is backgrounded (iOS 16.7–18,
  in-app browsers included; WebKit bug 261331 dup). three's maintainer says production apps should
  handle it. **Orbkin has no handler** (grep: no `webglcontextlost` in `src/`). [high for the gap,
  med for frequency]
- Chrome: max active WebGL contexts per page. The oldest context is force-lost beyond the limit
  (`webgl_rendering_context_base.cc`). Orbkin uses one; the bench probe uses a second and releases it
  with `forceContextLoss()`. [high]

### 1.8 Texture formats: KTX2 vs WebP vs PNG (CPU and VRAM)

Measured in this container (Xeon 2.8 GHz core, heavily shared, so treat as an upper bound for
desktop). Scale ×2–5 for a mid-tier phone and ×5–10 for low-end (Lighthouse table).

| Texture | Container time | Phone estimate (×4) | VRAM | Download |
|---|---|---|---|---|
| KTX2 ETC1S 512² + mips → ASTC 4×4 | 13.8 ms | ≈ 55 ms (worker) | 0.33 MB | 65 KB |
| KTX2 ETC1S 512² → ETC2 | 9.6 ms | ≈ 40 ms | 0.33 MB | 65 KB |
| KTX2 UASTC 512² → ASTC 4×4 | 12.7 ms | ≈ 50 ms | 0.33 MB | 250 KB |
| KTX2 ETC1S 1024² → ASTC 4×4 | 44 ms | ≈ 180 ms | 1.33 MB | 151 KB |
| KTX2 UASTC 1024² → ASTC 4×4 | 65 ms | ≈ 260 ms | 1.33 MB | 867 KB |
| Basis transcoder init (WASM compile) | ≈ 200 ms | ≈ 0.5–1 s | — | **245 KB gz** wasm + 15 KB js |
| WebP lossy 512² decode (`createImageBitmap`) | 8–12 ms | ≈ 35–50 ms (off main thread) | 1.33 MB (RGBA8 + mips) | 45–57 KB |
| WebP lossy 1024² decode | 24 ms | ≈ 100 ms | 5.3 MB | 100 KB |
| WebP **lossless** 1024² decode | 93 ms | ≈ 370 ms | 5.3 MB | 400 KB |
| PNG 512² decode | 8.9 ms | ≈ 35 ms | 1.33 MB | 330 KB |
| Pixel-art tile 512² lossless WebP / PNG decode | 3.8 / 6.7 ms | ≈ 15–27 ms | 1.33 MB (or 1 MB, no mips) | 2 / 6 KB |

Published comparisons agree on the shape: ExoJS PR #803 measured a warm worker round-trip of about
15 ms for ETC1S and 29 ms for UASTC at 1024² (desktop Chromium, BC7 target), with about 106 ms of
worker/WASM init. The kansei PR #182 measured 2048² ETC1S → ASTC at about 44 ms and UASTC → ASTC at
about 73 ms in C++ WASM. WEBGL_compressed_texture_astc is supported on about **99.9% of Android and
iOS** (web3dsurvey). [high: measured; med: scaling]

**Implication.** At 256–512 px, KTX2 saves no CPU over WebP. It saves VRAM (4×) and upload bytes,
which only matter once an arena holds tens of MB of large textures. Block compression (4×4 blocks,
ETC1S endpoint palettes) changes exact palette colours and smears 1-texel details, so it is wrong
for nearest-filtered pixel art.

### 1.9 Geometry: meshopt

- meshoptimizer README: decoders run at 1–3 GB/s on desktop with SIMD. [high]
- Measured here: real creature GLBs (43–75 KB meshopt → 97–128 KB) decode in **0.14–0.49 ms**
  (200–660 MB/s at this small size, loaded machine). That is ≲ 2 ms on a mid phone, plus a
  **6.5 KB gz** decoder. Meshopt is never the bottleneck. [high]

### 1.10 Frame pacing, timers, thermals

- Chrome Android: `EXT_disjoint_timer_query_webgl2` is registered as `kDeveloperExtension` unless
  the `enable_webgl_timer_query_extensions` workaround is on. That workaround is GPU bug-list entry
  256 with `"exceptions": [{"os": {"type": "android"}}]`, so on Android it is visible only with
  `chrome://flags/#enable-webgl-developer-extensions` (kOsAll). Some drivers have it disabled
  outright even then: Adreno 3xx/4xx (entries 112, 113), Galaxy S6 Mali (247), NetEase (266), and
  Qualcomm timestamp queries (272). [high: Chromium source]
- Safari: the timer query must be enabled under Feature Flags ("WebGL Timer Queries"), per the
  stats-gl README and the MDN BCD issue for Safari 17.1+. [high]
- On tilers, a TIME_ELAPSED query brackets work that executes per render pass at flush time.
  Whole-frame queries are meaningful, but per-pass splits inside one frame are not reliable. Measure
  passes by **ablation** (turn one off, diff the frame). [med]
- iOS Low Power Mode caps rAF at **30 fps** (WebKit, intentional). Safari throttles rAF in
  **cross-origin iframes until the user taps**. 120 Hz rAF is behind feature flags. [med/high]
- Thermals: iPhone 15 Pro Max lost **up to 40%** in Notebookcheck's GPU stress test. A flagship
  (Nothing Phone 2) dropped to **60%** after 20 min of 3DMark Wild Life Stress. Mid-range SoCs
  (Snapdragon 7 Gen 3, 6 Gen 1) held **≈ 99%**. Budget against sustained (≈ 70%) performance, not
  the first minute. [med]

### 1.11 Download budgets

- Lighthouse "Slow 4G": **1.6 Mbps down, 150 ms RTT**, "roughly the bottom 25% of 4G". 1 MB ≈ 5 s.
  [high]
- CrazyGames: initial download **≤ 50 MB**, and **≤ 20 MB to be eligible for the mobile homepage**
  (official docs). Poki: < 8 MB per a 2026 third-party guide. Poki's 2018 W3C talk said 10 MB
  initial ≈ 80% conversion-to-play. [high / med]
- Orbkin today: initial download **≈ 474 KB gz** (JS 454 KB, CSS 15 KB, font 5 KB). Every texture is
  painted at runtime, so it costs 0 bytes to download but CPU at scene entry. [high: measured]

---

## 2. What Orbkin's frame actually does (audit, this session)

Method: `audit-init.js` wraps every WebGL2 call (`bindFramebuffer`, `framebufferTexture2D`/
`Renderbuffer`, `tex*`/`renderbufferStorage*`, `draw*`, `clear`, `blitFramebuffer`, `linkProgram`,
2D `getContext`). `audit.mjs` loads each scene of an **unmodified build of HEAD `fa40185`** in headless
Chromium (SwiftShader) at the phone viewport **393×851 @ 2.75, touch** (low tier) and at 1280×720
(also low here, because the container has 4 cores and `detectQuality()` treats ≤ 4 cores as weak).
`EXTRA=&q=high` covers the high tier. It records one frame's pass list, a 12-frame rAF window
(catches sprite bakes), resident GPU memory, 2D canvas memory, programs and JS heap. These counts
are what a phone executes, independent of hardware. Only the SwiftShader ms are not transferable.
Files: `audit-base.json`, `audit-high.json`, `audit-*.log`.

### 2.1 Per scene (phone viewport, low tier)

| scene | internal | passes / frame | draws / frame | tris / frame | GPU-resident MB (tex + RB) | live 2D canvases MB (created) | programs linked | JS heap MB |
|---|---|---|---|---|---|---|---|---|
| title | 271×586 | 18.3 | 40 | 32k | 15.2 (9.9 + 5.4) | 2.3 (51) | 64 | 19 |
| starter | 271×586 | 19.2 | 43 | 28k | 14.6 | 2.1 (58) | 63 | 18 |
| route map (meadow) | 271×586 | 17.5 | 44 | 20k | 15.2 | 3.1 (74) | 66 | 16 |
| battle cave | 271×586 | 20.2 | 46 | 48k | 12.7 (7.4 + 5.4) | 0.2 (54) | 65 | 22 |
| battle volcanic | 271×586 | 18.7 | 39 | 46k | 12.4 | 0.1 (22) | 62 | 21 |
| battle scrub | 271×586 | 19.8 | 41 | 49k | 15.1 | 2.6 (61) | 64 | 43 |
| battle meadow | 271×586 | 19.5 | 41 | 29k | 14.6 | 2.1 (50) | 63 | 18 |
| battle coast | 271×586 | 18.7 | 41 | 66k | 12.8 | 0.1 (40) | 64 | 21 |
| battle summit | 271×586 | 20.0 | 48 | 28k | 12.8 | 0.3 (65) | 66 | 16 |
| battle stadium | 271×586 | 20.0 | 49 | 25k | 12.9 | 0.5 (67) | 65 | 20 |
| party | 271×586 | 16.5 | 27 | 6k | 12.2 | 0.1 (31) | 58 | 11 |
| **battle cave, `q=high`** | 271×586 | 22.3 | 50 | **109k** | **38.8 (21.0 + 17.8)** | 0.2 | 65 | 26 |
| desk 1280×720, `q=high`, cave | 640×360 | 20.7 | 45 | 107k | 41.3 | 0.2 | 65 | 24 |

### 2.2 One phone-low battle frame, pass by pass (cave)

| # | target | draws | what |
|---|---|---|---|
| (2/frame) | 96×96 RGBA16F + D24 → 48×48 RGBA16F | 1 + 1 each | kin sprite bake + detail-preserving resolve (2 subjects re-baked per frame at the 8 fps bake rate; trainers 64² → 32² ≈ 0.6/frame) |
| 0 | 271×586 RGBA16F + D24 | 27 | the scene (45k tris). The shadow map is frozen, so there is **no shadow pass** |
| 1–12 | 68×147 → 5×10 RGBA16F + D24 | 12 | bloom: high-pass at ¼ res, 5-level H/V blur chain, composite |
| 13 | 271×586 RGBA16F | 1 | bloom added back onto the scene target |
| 14 | canvas 271×586 RGBA8 | 1 | grade: tone map, CDL, split tone, tilt-shift, vignette, dither |

The browser compositor then scales the 271×586 canvas ×4 to the 1080×2340 screen with
`image-rendering: pixelated`, which every web page pays. Largest allocations: the **1024² RGBA8 shadow
map (4 MB) + its 1024² D24 renderbuffer (4 MB)**, i.e. 8 of the 12.7 MB. On `q=high` this becomes
2048² (16 + 16 MB) and is re-rendered every frame (6 draws, 38k tris). Every composer and bloom
target carries a D24 depth renderbuffer it never uses after the scene pass (three's default
`depthBuffer: true`). That is small at this size but it is stored back on tilers unless invalidated.

### 2.3 Compared with the numbers in docs/HD2D.md

| metric | HD2D.md | this audit (HEAD `fa40185`) | comment |
|---|---|---|---|
| draw calls, phone low battles | 46 cave, 49 volcanic, 37–65 outdoor, 45–52 "whole frame" | 39–49 (rAF average incl. bakes) | consistent; < 100 rule holds with 2× margin |
| triangles, phone low | cave 35k (low), screens 21–32k | battles 25–66k (coast 66k), screens 20–32k | kit growth; still ≤ 100k |
| triangles, high | cave 81k | 107–109k incl. the per-frame 2048² shadow pass | the shadow pass is 38k of it |
| internal size phone | "low 280×606, high 300×649" (old Perf table) | **271×586 for both tiers** (integer grid: `minShort` limits portrait phones to 4 device px per texel) | so on a portrait phone `q=high` buys no resolution, only shadows/bakes/bloom res |
| frame-cost ratio phone high / low (SwiftShader) | 89 / 52 ≈ 1.7× | 934 / 325 ≈ 2.9× (audit), 1216 / 333 ≈ 3.6× (bench) | high tier got relatively heavier (2× sprite supersample, 2048² live PCFSoft shadows, kit tris); keep phones on `low` |
| GPU memory, 2D canvas memory, programs | not documented | 12–15 MB / 0.1–3.2 MB / 58–66 programs; 95 programs alive after 6 scenes | programs are the outlier (see §1.6) |

### 2.4 SwiftShader ablations from the bench (phone viewport, ratios only)

| case | sync ms (p50) | vs `cave-low` | what it says (as a ratio, not an absolute) |
|---|---|---|---|
| cave-low | 325–334 (139 when the machine was quieter) | 1.0 | baseline; **run-to-run noise on this shared 4-core box is ±50%**, so compare only within one run |
| cave-low-nobloom | 262 | −21% | bloom chain + add-back ≈ 1/5 of the CPU-rasterised frame |
| cave-low-rgba8 (LDR target) | 257 | −21% | the HDR (RGBA16F) target costs about as much as the bloom |
| cave-high | 1216 | **3.6×** | 2048² live shadows + 2× bakes + half-res bloom |
| cave-low-native (1081×2341) | 3103 | **9.3×** | 16.7× the pixels |
| cave-low-ires2 (542×1172), separate quieter run vs its warm-up | 483 vs 139 | **3.5×** | 4× the pixels |
| cave-low-native-msaa4 (1081×2341, 4x MSAA composer), same run | 2965 vs 139 | **21×** | the full threejs-render proposal on the real scene; the switch works end to end (no GL errors) |
| meadow-low / stadium-low / route-low | 244 / 209 / 197 | 0.6–0.75× | outdoor and night sets are cheaper than the cave |
| probe: one 9-tap full-screen pass, quarter → half → native, RGBA8 | 11 → 61 → 283 ms (GPU timer) | — | scales with pixels as expected; the probe works (sync and timer agree after the fix) |
| probe: native RGBA8 → RGBA16F → RGBA16F + MSAA4 (blit resolve) | 283 → 331 → **770** ms | — | MSAA4 + blit ≈ **2.3×** the same pass. On a tiler, bandwidth decides this (§3) |

Scene entry (`enterMs`, instant mode, no fade): cave 2.0–2.2 s, meadow 2.4 s, stadium 2.0 s, route
1.7 s on this loaded 4-core container. **Compile/link per entry: cave 53 programs / 1.4 s (cold),
stadium 49 / 1.05 s, route 50 / 0.8 s, meadow 19 / 0.6 s, cave again 21 / 0.5 s** (SwiftShader
compiles; phones are faster per program but compile on every cache miss). `renderer.info.programs`
grows 65 → 93 → 122 across six scene changes, so programs are not released between scenes.
That is worth checking (memory on iOS). A CPU profile of the meadow battle entry (unminified dev build) split ≈ 3.6 s
of `goto` into **21% `getProgramInfoLog`** (shader compile/link waits), **8% `getImageData`**
(texture painting and mip chains read back from canvases), **≈ 20% JS painters/builders**
(`buildMeadowSet`, `clusterMap`, `paintMeadowFloor`, `modeHalve`, `pathD`, `paintCanopy`, `terraces`
…) and 24% `setSize` (a GPU sync that is a SwiftShader artefact). On a mid phone (×2–5 single-thread)
the JS part alone (≈ 1 s here: painters ≈ 0.7 s + `getImageData` ≈ 0.3 s) is **≈ 2–5 s per new arena**. This cost is invisible in every frame-time number
so far. `profile-meadow.json` has the full table.

---

## 3. Modelling the proposals on real phones

### 3.1 Reference devices (2026 mid-range and the iPhones people actually hold)

| class | GPU | tile memory | DRAM peak | GFXBench Manhattan 3.1 offscreen (Notebookcheck avg) |
|---|---|---|---|---|
| budget/mid Android (Snapdragon 680/685, 695; Helio G99) | Adreno 610 / 619, Mali-G57 MC2 | 132 KB / 512 KB / Mali tiles | **17 GB/s** (LPDDR4X 2×16 @ 4266) | 13.6 / – / 23.8 fps |
| upper-mid Android (SD 778G, Dimensity 1080/7050, Exynos 1280/1380) | Adreno 642L, Mali-G68 MC4/MP5 | 512 KB | 17–25.6 GB/s | ≈ 79 fps (642L, G68 MP5) |
| iPhone 11 – 14 (A13 – A15) | Apple 4-core | TBDR, memoryless | ≈ 34 GB/s | — (A15 n/a) |
| iPhone 15+ (A16+) | Apple 5-core | TBDR | ≈ 51 GB/s | 141.6 fps (A16) |

The A16 is ≈ 10× an Adreno 610 on the same benchmark. A budget that holds on the 17 GB/s class
holds everywhere.

### 3.2 DRAM traffic per frame (bandwidth model, `bwmodel.py`)

Per-pass bytes are target pixels × bytes written (+ depth stored, since three does not invalidate
non-MSAA depth) + full-res inputs read. They use the audited pass list, three r180's MSAA path
(MS colour + MS depth stored, re-read by the blit, resolved write) and **50% of peak DRAM bandwidth
for the GPU**. These are bandwidth-only lower bounds: shading ALU, vertex/binning and the browser
compositor (≈ 11 MB/frame at native RGBA8) come on top.

| case | MB / frame | GB/s at 60 fps | ms at 17 GB/s | ms at 34 GB/s (A13–A15) |
|---|---|---|---|---|
| low tier today (271×586 RGBA16F, ¼-res bloom, grade, frozen shadow) | **10.9** | 0.66 | **1.3** | 0.6 |
| high tier on a phone (same grid, ½-res bloom, live 2048² shadow) | 48.9 | 2.9 | 5.8 | 2.9 |
| internal ×2 (542×1172) | 37.7 | 2.3 | 4.4 | 2.2 |
| native DPR, same HDR post, no MSAA | 148 (168 on iPhone) | 8.9 | **17.4** | 9.9 |
| **native DPR + MSAA 4x composer** (the threejs-render proposal) | **345** (394) | **20.7** | **40.5** | 23.2 |
| DPR capped at 2 + MSAA 4x | 183 | 11.0 | 21.5 | 12.3 |
| native, RGBA8 LDR target, no bloom | 54 | 3.2 | 6.3 | 3.6 |
| native forward, `antialias:true` backbuffer, no post (Android implicit resolve) | 23 | 1.4 | 2.7 | 1.5 |

Reading it: only the first three rows and the last fit a 60 fps frame on the 17 GB/s class with
room left for shading. That matches the published anchors: one 3 ms mobile bloom, a 4 ms DOF on a
Pixel 4, and +5 GB/s for a separate MSAA resolve at 2.3 Mpx RGBA8.

---

## 4. Proposed techniques: desktop-only, tier-gated, opt-in or mobile-safe

Costs are for the 17 GB/s mid-range phone unless noted. "Model" = §3.2 bandwidth model, "bench" =
the case in §6 that measures it on the owner's phone.

| Proposal (from) | Verdict | Why (numbers) | Bench case |
|---|---|---|---|
| **Native resolution + MSAA 4x HDR composer** (threejs-render TL;DR 1) | **Desktop-only.** On phones at most an experiment on a ≥ 34 GB/s iPhone at DPR ≤ 2 and 30 fps | Model: ≈ 345 MB/frame → 20.7 GB/s at 60 fps, more than the bus. Arm: a separate resolve costs +5 GB/s at only 2.3 Mpx RGBA8. WebKit: the blit resolve is "significant" on ANGLE-Metal. On Adreno 610 ≈ 940 bins | `cave-low-native-msaa4` |
| Native resolution, no MSAA, same HDR post | **Desktop + high-end iPhone only (T2)** | Model 148 MB/frame (8.9 GB/s at 60); bandwidth alone ≈ 17 ms/frame at 50% efficiency on 17 GB/s → over budget before any shading | `cave-low-native` |
| Native res forward render, `antialias:true` backbuffer, tone map in material, no post | **Opt-in experiment for Android T1** | Model ≈ 23 MB/frame. Chrome Android resolves MSAA implicitly on tile, except where Skia Graphite is enabled (field trial). Loses bloom/grade/tilt passes (would have to move into materials). iOS has no implicit path | (not in bench; needs a code path) |
| Internal resolution × 1.5–2 (sharper texels, keep integer grid) | **Tier-gated (T1)** | Model 38 MB/frame (2.3 GB/s at 60) ≈ 4.4 ms of bandwidth on 17 GB/s, ≈ 2.2 ms on A15. Fits T1 if `cave-low-ires2` sync p50 ≤ 14 ms | `cave-low-ires2` |
| pmndrs `postprocessing` (EffectPass merge) | **Mobile-safe at internal res** *if* it **reduces** pass count; `multisampling: 0` on phones; HalfFloat buffers fine at ≤ 0.6 Mpx | One fullscreen pass per EffectPass instead of one per effect; MSAA doubles across both buffers (#419) | compare `cave-low` vs `cave-low-nopost` |
| **N8AO** | **Desktop; T1 only at internal res, `halfRes`, "Performance" preset** | Author: half-res 2–4× faster, ~1 ms fixed upsample (desktop). Needs depth; extra full-screen passes. GTAO already cost 2.4× the frame on SwiftShader. Baked AO is free | add a `post=n8ao` case once integrated |
| **`LightProbeGridWebGL`** (r184–186) | **Bake offline / desktop only.** Runtime sampling on phones only after patching the atlas to HalfFloat | Atlas is a `WebGL3DRenderTarget` **RGBA32F + LinearFilter**: renderable only with EXT_color_buffer_float, filterable only with OES_texture_float_linear (≈ 47% iOS, 74% Android), otherwise it samples black. Each lit fragment does 7 trilinear 3D fetches. In-browser bake = 6 cube faces × N probes × scene draws (224 probes ≈ 1,344 scene renders); 4.9 s even on SwiftShader | n/a: bake in Blender or desktop, ship SH as data |
| **Sprite supersample 2×** (current high) / **4× majority resolve** (lab, hd2d-pixel) | **2×: T1 and desktop. 4×: offline only** (pre-baked sheets) | Bake pixels scale 4× / 16×. Low tier already uses 1× and an 8 fps bake rate. Live bakes stay small (≈ 40×40 texels per kin), so 2× is cheap; 4× live on 4 subjects ≈ 0.1 Mpx/bake, which the per-frame live bakes during hits would pay | `cave-high` vs `cave-low` (includes it) |
| **Unique 256–512 px atlases per arena** (procedural-texturing, hd2d-pixel) | **Mobile-safe** within the §5 budget | 512² RGBA8 + mips = 1.33 MB VRAM, decode ≈ 9 ms here (≈ 35 ms phone, off-thread). Pixel-art PNG/WebP lossless at 2–200 KB depending on noise. ≤ 8 per arena keeps VRAM ≤ 11 MB and download ≤ 400 KB | probe `decode.*512` |
| **KTX2 (Basis)** | **Opt-in** (needs the owner's approval for the `ktx`/basisu tools). Only for ≥ 1024² smooth painted maps (skies, backdrops, Blender bakes). **Never for pixel art** | Pays a 245 KB gz WASM download + ≈ 0.5–1 s phone init; saves 4× VRAM (ASTC 4×4 = 8 bpp vs 32). At ≤ 512 px the decode CPU is the same as WebP | probe (KTX2 probe left out by default) |
| WebP (lossy for smooth, lossless for flat colour) | **Mobile-safe default** | 512² ≈ 8–12 ms decode here; 4–7× smaller than PNG for photo-like bakes | probe |
| **Meshopt** geometry (`EXT_meshopt_compression`) | **Mobile-safe default** | ≤ 0.5 ms decode per kin here; 6.5 KB decoder | — |
| **Blender creatures as GLB** (2.5–4.5k tris each) | **Mobile-safe** | 4 kin ≈ 18k tris + shadow; the audit shows 18–64k tris per frame today, well under 100k | — |
| Live 2048 PCFSoft shadows (current high tier) | **Desktop-only.** Phones keep the frozen 1024 PCF map | Model: a 2048² shadow re-render = 33 MB/frame, the largest item of the high tier on a phone. PCFSoft "unsuitable for most mobile devices" (#15577), deprecated r182 | `cave-high` |
| three r186 `setEffects()` HDR + MSAA output | Same verdict as native+MSAA: **the MSAA part is desktop-only** | Built-in 4x MSAA HalfFloat target = the blit path | — |
| WebGPU / TSL renderer | **Desktop experiment**; WebGPU on Android only for Adreno/Mali on Android 12+ (Chrome intent-to-ship) | No mobile numbers. Not needed for a diorama | — |

---

## 5. Budget per tier

Tiers:
- **low** = today's `detectQuality() === 'low'`: phones (coarse pointer or short side < 500) and
  ≤ 4-core machines. Sized for the 17 GB/s Adreno 610/619 / Mali-G57 class.
- **T1** = proposed opt-in phone tier. Only devices proven by the bench: an Android GPU-string
  allow-list, or a cached startup probe on iOS.
- **desk** = today's `high` on a desktop/laptop.

Frame target: 60 Hz (16.7 ms). Budgets use about 70% of it for sustained (warm-phone) play, so
GPU ≤ 11–12 ms and main-thread JS + submit ≤ 6 ms. The ms rows are **targets to verify with the
bench**, not measurements. The counter rows are enforceable today in CI (`perf-budget.json`,
`check-budget.mjs`). Current = measured in §2 (phone viewport).

| budget item | low (phones) | T1 (proven phones) | desk | current (phone low) | conf. |
|---|---|---|---|---|---|
| internal render size | integer grid, ≈ 0.16 Mpx (271×586 on 393×851@2.75) | grid × 1.5–2 (≤ 0.65 Mpx) | 640×360 grid … native ≤ 1080p | 271×586 | high (audit) / med |
| scene RT format | RGBA16F at internal res OK; R11G11B10F if ≥ 0.5 Mpx | RGBA16F / R11G11B10F | RGBA16F | RGBA16F + D24 | high |
| MSAA on render targets | **none** | **none** (default-framebuffer AA only on Android, if a post-free path exists) | 4x OK | none | high |
| full-res passes per frame | ≤ 3 (scene, bloom add, grade) | ≤ 4 | ≤ 8 | 3 | high |
| DRAM traffic proxy | ≤ 25 MB/frame | ≤ 60 MB/frame | ≤ 400 MB/frame | ≈ 8–11 MB | med (model) |
| **GPU ms: shadow map** | 0 (frozen 1024 PCF, rebuilt ≤ 2 frames at load) | ≤ 1.5 (1024 PCF, live only if needed) | 2048 PCF, ≤ 2 | 0 | med |
| GPU ms: sprite bakes (amortised) | ≤ 1.0 (1× supersample, 8 fps bake rate, ≤ 4 subjects) | ≤ 1.5 (2×) | ≤ 2 (2×; 4× only offline) | 2 bakes/frame of 96² | med |
| GPU ms: main scene pass | ≤ 6 | ≤ 7 | ≤ 8 | ? (bench) | low until bench |
| GPU ms: bloom chain + add | ≤ 1.0 (¼-res mip chain) | ≤ 1.5 | ≤ 2 | ? | med |
| GPU ms: grade/tilt/vignette | ≤ 0.8 | ≤ 1.2 | ≤ 1.5 | ? | med |
| GPU ms: AO | 0 (baked) | ≤ 1.5 (N8AO half-res "Performance" at internal res, optional) | ≤ 3 | 0 | med |
| GPU ms: battle FX peak headroom | ≤ 2 | ≤ 2 | ≤ 3 | ? | low |
| **GPU frame total** | **≤ 11** | **≤ 12** | ≤ 12 on an iGPU | ? | med |
| CPU (JS update + render submit) | ≤ 6 | ≤ 6 | ≤ 6 | 2–5 ms in SwiftShader `cpuMs` | med |
| draw calls / frame | ≤ 60 (hard 100) | ≤ 80 | ≤ 150 | 39–49 | high (counter) |
| triangles / frame incl. shadow | ≤ 100k | ≤ 200k | ≤ 600k | 25–66k | high |
| programs linked per scene | ≤ 40 | ≤ 50 | ≤ 80 | **58–66** (over) | high |
| scene entry (`enterMs`) on the slowest phone | ≤ 2.5 s | ≤ 2 s | ≤ 1.5 s | 1.7–2.4 s here ×(2–5) on phones | med |
| GPU-resident (textures + RBs) | ≤ 48 MB | ≤ 96 MB | ≤ 256 MB | 12–15 MB (high tier 39–41) | med |
| live 2D canvases (Safari cap 224–384 MB) | ≤ 32 MB | ≤ 32 MB | ≤ 128 MB | 0.1–3.2 MB | med |
| JS heap | ≤ 100 MB | ≤ 150 MB | ≤ 300 MB | 11–43 MB | med |
| texture size cap | 1024 (pixel art ≤ 512) | 2048 | 4096 | ≤ 1024 (shadow) | med |
| download: initial (gz) | ≤ 1.5 MB | same | same | 474 KB | high |
| download: per arena chunk (lazy) | ≤ 400 KB (≈ 2 s on Slow 4G), ≤ 8 atlases of 256–512 px | ≤ 600 KB | ≤ 2 MB | 0 (procedural) | med |
| download: per kin | ≤ 80 KB (meshopt GLB ≤ 4.5k tris + ≤ 256² WebP/PNG or vertex colour) | same | same | 0 (procedural) | med |
| download: whole game | ≤ 15 MB (CrazyGames mobile cap 20 MB; Poki guide 8 MB initial) | same | same | 0.47 MB | high |
| thermal drift over the bench | ≤ 15% | ≤ 15% | — | n/a | med |
| raf frames > 20 ms during idle battle | ≤ 5% | ≤ 5% | ≤ 2% | n/a | med |


**CI check on HEAD today** (`node check-budget.mjs audit-base.json` over 24 scene × viewport
cases): every counter passes (draws 26–49, tris 6–66k, 3 full-res passes, 0.16 / 0.23 Mpx targets,
GPU-resident 12–17 MB, canvases ≤ 3.2 MB, heap ≤ 43 MB, DRAM proxy 7.6 / 10.9 MB) **except
programs per scene, 58–66 against ≤ 40, in every scene.** The count includes the boot and FX
pre-warm, which is deliberate. The first fix is fewer material variants, not dropping the
pre-warm. `q=high` on the phone viewport fails four counters (109k tris, 4 full-res passes,
65 programs, 45 MB DRAM proxy), which confirms that phones should stay on `low`.

---

## 6. The two-minute on-device bench protocol

### 6.1 What was built (scratch, verified headless)

`scratchpad/research/mobile-perf/game/` is a copy of the game with **three bench-only changes**
(nothing in the real repo was touched):

1. `src/debug/bench.ts` (new, ≈ 300 lines, lazy chunk ≈ 5 KB gz) runs when the URL has `?bench=1`.
   `bench=quick` runs 6 cases instead of 12. `bcases=id1,id2` picks cases, `bnoprobe=1` skips probes.
2. `src/main.ts`: one line, `if (params.get('bench')) void import('./debug/bench').then((m) => m.runBench(game));`
3. `src/render/hd2d/pipeline.ts`: three URL switches that emulate proposals on the **real** scenes:
   `ires=native|<k>` (internal resolution = device pixels, or k × the tier grid),
   `msaa=<n>` (samples on the composer targets, three's renderbuffer + blit path),
   `rt=rgba8|r11|f16` (composer target format).

Built output (latest): `scratchpad/research/mobile-perf/dist-bench3/` (the game + an 11.5 KB / 5 KB gz
bench chunk). A headless driver (`run-bench.mjs`) clicks START and captures the JSON
(`bench-swiftshader-quick.json`, `-b.json`, `-c.json`; 3.2–3.6 KB each), so the code path, including
the timer query (SwiftShader exposes it with the developer-extensions flag), is verified end to end.
Fixes made during verification:
- probe sync now samples the target into a 1×1 RGBA8 target before `readPixels`, because reading a
  float or MSAA target directly is invalid;
- link time is forced synchronous so it is attributed;
- `enterMs` runs in instant mode (no fade timers);
- a reported `warmup` run precedes the cases, because the first case was 35% slower from JIT and
  cache warm-up, which the thermal-drift check misread.

### 6.2 Per case it records

| Field | Meaning | How |
|---|---|---|
| `enterMs`, `readyMs` | scene build (procedural painting, geometry, first frames) and ready after 40 frames | `performance.now()` around `game.goto` |
| `links`, `linkMs` | shader programs linked during entry and their blocking time | wraps `linkProgram` |
| `syncMs.p50/p90` | render + 1-px `readPixels` (forces completion): CPU submit + GPU, no vsync cap | 12 frames |
| `gpuMs.p50/p90` | GPU time of a whole frame, **only when** the timer extension is exposed | `TIME_ELAPSED` query per frame, drained over rAFs |
| `cpuMs.p50/p90` | CPU time inside `renderer.render` in the live loop (incl. sprite bakes) | wraps `renderer.render` for 2 s |
| `raf.p50/p95/over20/over34` | real presentation cadence: median/95th interval, % frames slower than 50 fps / 29 fps | own rAF for 2 s |
| `calls`, `tris`, `internal`, `tex`, `geo`, `programs`, `heapMB` | renderer stats, drawing-buffer size, three `info.memory`, JS heap (Chrome) | `perf()` / `gl.info` |

Global: `device` (UA, unmasked GPU string when exposed (Chrome Android shows e.g. "Adreno (TM) 619",
Safari only "Apple GPU"), DPR, CSS/screen size, cores, `deviceMemory`, max texture/samples, extension
flags: timer, ASTC, ETC, BPTC, color-buffer-float/half-float, float-blend, parallel compile,
multisampled-RTT), `thermalDriftPct` (`cave-low-again` vs `cave-low`), and `probe`, which runs on a
second context at native resolution:
- `pass_{q,h,n}_{8,16f}`: one 9-tap full-screen pass at quarter, half and native resolution in RGBA8
  and RGBA16F (sync ms per pass, and GPU ms when the timer is available). These are the per-pass ms
  the budget needs.
- `pass_n_16f_msaa4`: the same pass into a 4x MSAA RGBA16F target with three's blit resolve.
- `draw400Ms`, `per100DrawsMs`: 400 tiny meshes, separate draws (CPU submit + sync).
- `decode.webp512/png512/webp1024/png1024`: `createImageBitmap` decode + RGBA8 upload of a
  browser-encoded noise image. Under SwiftShader the `uploadMs` field (≈ 0.8–1.2 s) is an artefact of
  CPU-side ImageBitmap readback. Only device values mean anything.
- Patch files for review: `scratchpad/research/mobile-perf/bench.patch` (diff of the three files against HEAD).

Case list (`bench=1`: a `warmup` run of `cave-low`, then 12 cases + probes; ≈ 2–2.5 min on a phone, `bench=quick` ≈ 1 min):

| id | what it isolates |
|---|---|
| `cave-low` | baseline: phone tier, Ember Ridge trainer battle in the cave arena |
| `cave-low-nobloom` | bloom chain cost = `cave-low` − this |
| `cave-low-nopost` | grade + tilt + vignette cost = `nobloom` − this |
| `cave-high` | full high tier on the phone (360 px grid, 2048 PCFSoft live shadows, half-res bloom, 2× sprite bakes) |
| `cave-low-ires2` | internal × 2 (T1 candidate) |
| `cave-low-native` | native device pixels (the threejs-render proposal without MSAA) |
| `cave-low-native-msaa4` | + 4x MSAA composer (the full proposal) |
| `cave-low-rgba8` | RGBA16F → RGBA8 target (HDR target cost) |
| `meadow-low` | outdoor arena: foliage billboards, sun gobo |
| `stadium-low` | crowd billboards, night set |
| `route-low` | route map island |
| `cave-low-again` | repeat → thermal drift |

### 6.3 What the owner does (two minutes)

1. **Serve the scratch build to the phone**, one of:
   - On the owner's computer (same Wi-Fi): copy the patch into a branch, `npm ci`, `npm run build`,
     then `npx vite preview --host --port 4173`. Open `http://<computer-LAN-IP>:4173/?bench=1` on the
     phone. (Plain http on a LAN IP works. The clipboard API needs HTTPS, so the page falls back to
     selecting the text for copy.)
   - Or ask Claude to publish `dist-bench3` as a private claude.ai Artifact and open the link on the
     phone. Note: Safari throttles rAF in cross-origin iframes until the first tap. The START tap
     covers that, but say in the results that it ran in an iframe.
2. Optional, for GPU timings:
   - Android Chrome: `chrome://flags/#enable-webgl-developer-extensions` → Enabled → Relaunch.
   - iPhone: Settings → Apps → Safari → Advanced → Feature Flags → **WebGL Timer Queries** on.
   Without these the bench still reports `syncMs`, `cpuMs` and `raf`.
3. Conditions: battery > 30%, **Low Power Mode off** (iOS caps rAF at 30 fps), not on a charger if
   possible, phone cool (idle 1 min), portrait, other apps closed.
4. Tap **START**, don't touch the screen for ≈ 2 min, tap **COPY**, paste the `ORBKIN_BENCH {…}`
   line into the chat. If COPY fails, long-press the text box → Select All → Copy.

Deeper, optional:
- Chrome Android remote debugging: enable USB debugging, connect, open `chrome://inspect/#devices`
  on the computer → *inspect* the tab → Console shows `ORBKIN_BENCH …` (copy from there), and
  Performance → record a battle turn for CPU flame charts.
- iPhone: Settings → Apps → Safari → Advanced → **Web Inspector** on, cable to a Mac. Safari (with
  "Show features for web developers") → Develop → device → page → Console (`ORBKIN_BENCH` line) and
  Timelines (JavaScript and Rendering Frames).

### 6.4 How Claude reads it back

```
cost(bloom)        = cave-low.gpu|sync  −  cave-low-nobloom
cost(grade+tilt)   = cave-low-nobloom    −  cave-low-nopost
cost(high tier)    = cave-high           −  cave-low
cost(2× internal)  = cave-low-ires2      −  cave-low
cost(native)       = cave-low-native     −  cave-low
cost(MSAA4)        = cave-low-native-msaa4 − cave-low-native      (and probe pass_n_16f_msaa4 − pass_n_16f)
cost(HDR target)   = cave-low            −  cave-low-rgba8
per-pass ms        = probe.pass_{q,h,n}_{8,16f}      (×passes in the audited frame, §3.1)
draw-call budget   = (frame budget − measured frame) / per100DrawsMs × 100
thermal            = thermalDriftPct  (> 15% ⇒ rerun cold or treat numbers as sustained)
```
Prefer `gpuMs` where present. Otherwise `syncMs` is an upper bound (it adds the CPU submit and one
readPixels round trip, ≈ 1 ms). Use `raf.over20` as the user-visible verdict (≤ 5% passes, 5–15%
borderline, > 15% fails at 60 Hz). Store each run as a dated JSON file next to the budget and
compare runs on the same phone only.

Decision rules to encode in the skill:
- A proposal is **adopted for a tier** only if, on the slowest device in that tier, the tier's
  `cave-*` case stays within the §5 frame budget **and** `raf.over20 ≤ 5%` after the thermal check.
- `cave-low-ires2.sync ≤ 14 ms` on a device ⇒ that device class can take T1 (internal × 1.5–2).
- `cave-low-native-msaa4.sync > 2 × cave-low-native.sync` or `> 25 ms` ⇒ MSAA stays desktop-only.
- `enterMs > 2500` or `links > 40` on a mid phone ⇒ fix scene build / program count before adding
  content.

---

## 7. Implications for Orbkin (prioritised)

1. **Keep the phone tier's architecture: an integer internal grid at about 0.16 Mpx, an HDR
   composer at that size, a quarter-res bloom chain and a frozen 1024 shadow map.** It is the only
   variant whose DRAM traffic (≈ 11 MB/frame) is far from every phone's bus limit. The "native-res +
   MSAA" recommendation (threejs-render) and the pixel-grid decision (DECISIONS.md, HD2D.md) stop
   conflicting once each is scoped to a platform: **native + MSAA is a desktop tier**, and the
   internal grid is the phone tier. For more sharpness on phones, the lever is **internal × 1.5–2 on
   proven devices (T1)**, not MSAA.
2. **Run the bench on the owner's phone before changing any architecture.** Every SwiftShader ratio
   in HD2D.md and the research notes is a guess until then. The bench is built and verified; it only
   needs serving (§6.3).
3. **Put the counter budgets in CI now** (`perf-budget.json` + `check-budget.mjs`, run on the
   SwiftShader audit). Draw calls, triangles, full-res passes, render-target pixels × bytes,
   programs, GPU-resident MB, canvas MB and heap are all hardware-independent. Timing budgets stay
   with the device bench.
4. **Two fixes that matter on real phones no matter which art path wins:**
   - **Program count:** 58–66 programs are linked per scene, against a 2 MB Chrome Android program
     cache (128 KB on low-end). Merge material variants (shared toon/surface shaders, fewer
     `onBeforeCompile` permutations) and target ≤ 40. Keep warming behind the scene curtain.
   - **Context loss:** add `webglcontextlost` (preventDefault, pause the loop) and
     `webglcontextrestored` (re-create render targets: the composer, sprite bake targets, the shadow
     map refresh), then re-enter the current scene. Painted textures keep their canvases (session
     cache), so three re-uploads them on its own. Test with `WEBGL_lose_context`.
5. **Asset pipeline budgets for the Blender path (other notes):**
   - Per kin: meshopt GLB ≤ 2.5–4.5k tris and ≤ 80 KB gz.
   - Textures: vertex colour/palette, or ≤ 256² WebP/PNG.
   - Per arena: ≤ 8 atlases of 256–512 px, ≤ 400 KB gz, ≤ 11 MB VRAM.
   - Pixel-art textures stay PNG or lossless WebP with nearest filtering. KTX2 only for ≥ 1024²
     smooth maps, and only after the owner approves the encoder tools.
   - Lazy-load the arena chunks on the route map, so the 0.47 MB initial download stays under
     1.5 MB.
6. **Bake lighting offline.** `LightProbeGridWebGL` in the browser is desktop-only. Its RGBA32F +
   linear filter needs extensions that half of iPhones lack. Bake GI/AO in Blender (vertex colours or
   atlas) or ship SH coefficients as data, sampled through a HalfFloat 3D texture if needed.
7. **Shadows and supersampling on phones:** no live 2048 PCFSoft (the measured high tier on the phone
   viewport: 2048² shadow = 32 MB of GPU memory, 105k tris/frame vs 45k, SwiftShader 3.6× the low
   tier). Sprite supersample stays 1× on low and 2× on T1. 4× majority resolve is for offline sprite
   sheets only.
8. **Tier detection.** `detectQuality()` marks every coarse-pointer device as `low`. That is right
   by default. Add T1 only from data: either an allow-list of GPU strings measured by the bench on
   Android (`WEBGL_debug_renderer_info` gives "Adreno (TM) 6xx/7xx", "Mali-G…"), or a 1-second
   startup probe (the bench's `pass_n_16f`) whose result is cached in `localStorage`. On iOS the GPU
   string is masked ("Apple GPU"), so use the probe. Also note: any 4-core desktop counts as `low`
   (`hardwareConcurrency ≤ 4`). This container, for example, rendered the "desk" audit at the low tier.

### 7.1 Skill text (drop-in)

```md
## Performance budget (mobile-first; enforce before claiming "done")
- Phones render at an integer internal grid ≈ 0.16 Mpx (271×586 on a 393×851@2.75 phone); desktop may go native.
- Never on phones: MSAA render targets (three `samples>0` = renderbuffer + blit resolve), RGBA32F targets or
  float32 linear sampling, live 2048 shadows, PCFSoft, in-browser light-probe baking, N8AO at native res.
- Budgets (low tier, per frame): ≤ 60 draw calls (hard 100), ≤ 100k triangles incl. shadow pass, ≤ 3 full-res passes,
  ≤ 40 linked programs per scene, ≤ 48 MB GPU-resident, ≤ 32 MB live 2D canvases, ≤ 25 MB DRAM traffic proxy.
- Downloads: initial ≤ 1.5 MB gz, per arena ≤ 400 KB, per kin ≤ 80 KB; pixel art PNG/lossless WebP only.
- CI: run `audit.mjs` (SwiftShader) + `check-budget.mjs` on phone and desktop viewports; any "over" fails.
- Device truth: every new full-screen pass, resolution change or AA mode ships to a phone tier only after
  an `?bench=1` run on a real phone shows the tier's frame within budget and raf.over20 ≤ 5%.
```

---

## 8. Open questions (need the device run)

1. Real ms for `cave-low` on the owner's phone, and the SwiftShader → device factor. HD2D.md
   assumes 10–50×; nothing has measured it.
2. Whether Chrome Android resolves three's MSAA blit cheaply on the owner's driver (Mali has a
   `glFinish`-before-blit workaround, entry 493). `cave-low-native-msaa4` vs `cave-low-native` and
   the probe `pass_n_16f_msaa4` vs `pass_n_16f` answer it.
3. How much of `enterMs` is procedural painting vs shader compile on a phone. Here the meadow battle
   entry was ≈ 3.6 s (loaded 4-core Xeon, fast mode). The CPU profile split it into ≈ 21% GL program
   link waits, ≈ 8% `getImageData`, ≈ 20% JS painters/builders, and ≈ 24% `setSize` (a GPU sync on
   SwiftShader). Scaled ×2–5 for a phone that is several seconds.
4. iOS Safari specifics: the cost of the canvas-backed texture uploads, the real GPU-process memory
   ceiling on the owner's iPhone, and context-loss frequency on backgrounding.
5. Is the owner's phone thermally stable over a 5-minute battle (`thermalDriftPct` across a longer
   run; the bench can be run twice back to back)?
6. Real-device decode/transcode times (probe `decode.*`; KTX2 is not in the default probe and needs
   the transcoder files and owner approval).

---

## 9. Sources

Primary sources read in this session (local copies in `scratchpad/research/mobile-perf/src/`):
- Khronos Vulkan-Samples, MSAA sample README (Arm-authored, Mali-G76 numbers):
  https://github.com/KhronosGroup/Vulkan-Samples/tree/main/samples/performance/msaa
- Chromium `drawing_buffer.cc` (implicit vs explicit MSAA resolve):
  https://github.com/chromium/chromium/blob/main/third_party/blink/renderer/platform/graphics/gpu/drawing_buffer.cc
- Chromium GPU driver bug list (entries 112, 113, 247, 256, 266, 268, 272, 280, 493):
  https://github.com/chromium/chromium/blob/main/gpu/config/gpu_driver_bug_list.json
- Chromium `webgl2_rendering_context.cc` / `webgl_rendering_context_base.cc` (timer query as developer extension) and
  `chrome/browser/about_flags.cc` (`enable-webgl-developer-extensions`)
- Chromium `gpu/config/gpu_preferences.h` (program cache 6 MB / 2 MB Android / 128 KB low-end)
- three.js r180 `src/renderers/webgl/WebGLTextures.js` (MSAA RT path, float linear warning, R11G11B10F)
- three.js dev `examples/jsm/lighting/LightProbeGridWebGL.js` (RGBA32F + LinearFilter 3D atlas)
- Linux `drivers/gpu/drm/msm/adreno/a6xx_catalog.c` (Adreno GMEM sizes):
  https://github.com/torvalds/linux/blob/master/drivers/gpu/drm/msm/adreno/a6xx_catalog.c
- google/filament `RELEASE_NOTES.md`, `filament/include/filament/Options.h`
- n8ao README: https://github.com/N8python/n8ao
- pmndrs/postprocessing README and issues #82, #419, #749: https://github.com/pmndrs/postprocessing
- meshoptimizer `js/README.md`; BinomialLLC/basis_universal README; KhronosGroup 3D-Formats-Guidelines KTXArtistGuide
- MDN WebGL best practices (mdn/content): per-pixel VRAM budget, invalidateFramebuffer, RGBA32F on mobile
- stats-gl README (Safari feature flag): https://github.com/RenaudRohlinger/stats-gl
- GoogleChrome/lighthouse `docs/throttling.md` (Slow 4G, CPU 4× / 10× table)
- PlayCanvas developer-site: optimization guidelines (100–200 draw calls low-end mobile), DPR guidance
- Apple, "Inspecting iOS and iPadOS": https://developer.apple.com/documentation/safari-developer-tools/inspecting-ios

Secondary (search results; sites not fetchable from this container):
- Qualcomm Snapdragon Game Developer Guide, "Adreno GPU on Mobile: Best Practices":
  https://docs.qualcomm.com/bundle/publicresource/topics/80-78185-2/mobile_best_practices.html
- Arm, "Post-processing effects on mobile: optimization and alternatives" (Spellsouls 3 ms bloom):
  https://developer.arm.com/community/arm-community-blogs/b/mobile-graphics-and-gaming-blog/posts/post-processing-effects-on-mobile-optimization-and-alternatives
- ETASR bloom on tile-based GPU: https://etasr.com/index.php/ETASR/article/download/19101/6940/98649
- WebKit commit on ANGLE-Metal MSAA resolve (July 2024): https://lists.webkit.org/pipermail/webkit-changes/2024-July/303702.html ; bug https://bugs.webkit.org/show_bug.cgi?id=274137
- Chromium issue "Use the Vulkan backend of ANGLE on Android": https://issues.chromium.org/issues/371512561
- web3dsurvey: OES_texture_float_linear https://web3dsurvey.com/webgl2/extensions/OES_texture_float_linear ;
  WEBGL_compressed_texture_astc https://web3dsurvey.com/webgl2/extensions/WEBGL_compressed_texture_astc
- iOS memory: https://groups.google.com/g/webgl-dev-list/c/gJ8qeoiiTuc ; https://github.com/Nehanth/pooled/issues/207 ;
  https://developer.apple.com/forums/thread/688973 ; canvas cap https://www.pqina.nl/blog/total-canvas-memory-use-exceeds-the-maximum-limit/
- iOS context loss: https://discourse.threejs.org/t/context-lost-when-backgrounding-safari-on-ios-17-developer-beta-8/55772 ;
  https://github.com/mrdoob/three.js/issues/26829 ; https://bugs.webkit.org/show_bug.cgi?id=261331
- iOS rAF Low Power Mode 30 fps: https://bugs.webkit.org/show_bug.cgi?id=215745 ; 120 Hz: https://bugs.webkit.org/show_bug.cgi?id=173434
- Safari timer queries: https://github.com/mdn/browser-compat-data/issues/21351
- three.js PCFSoft on mobile: https://github.com/mrdoob/three.js/issues/15577
- KTX2 transcode timings: https://github.com/Exoridus/ExoJS/pull/803 ; https://github.com/Siroko/kansei/pull/182
- GFXBench Manhattan 3.1 offscreen (Notebookcheck): Adreno 610 ≈ 13.6 fps, Mali-G57 MP2 ≈ 23.8 fps, Mali-G68 MP2 ≈ 24,
  Adreno 642L ≈ 79, Apple A16 ≈ 141.6 (https://www.notebookcheck.net/Qualcomm-Adreno-610-GPU-Benchmarks-and-Specs.434054.0.html,
  https://www.notebookcheck.net/ARM-Mali-G57-MP2-GPU-Benchmarks-and-Specs.537758.0.html,
  https://www.notebookcheck.net/Apple-A16-GPU-4-Core-Benchmarks-and-Specs.1003908.0.html)
- SoC memory bandwidth: https://www.91mobiles.com/processor/qualcomm-snapdragon-695-vs-mediatek-dimensity-7050
- Thermals: https://www.notebookcheck.com/Apple-iPhone-15-Pro-Max-drosselt-in-unserem-GPU-Stresstest-bis-zu-40-ist-trotzdem-schneller-als-iPhone-14-Pro-Max.756382.0.html ;
  https://hothardware.com/reviews/nothing-phone-2-review?page=2 ; https://unbox.ph/gadget/snapdragon-7-gen-3-performance/amp/
- Download caps: https://docs.crazygames.com/requirements/technical ; https://www.w3.org/2018/12/games-workshop/papers/size-matters.html
- Chrome remote debugging: https://developer.chrome.com/docs/devtools/remote-debugging
