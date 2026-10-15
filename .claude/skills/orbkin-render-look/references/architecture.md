# Frame architecture (read at S1; the tier row you are changing)

Contents: 1 decision table · 2 pass order today · 3 hybrid H port notes (pass order, DoF
parameters, subject mask, haze layer, dither) · 4 the mobile budget table · 5 capture discipline.
Sources: frame-architecture-hybrid.md, mobile-perf-budget.md §5, GRAPHICS_PLAYBOOK §2/§6.

## 1 Decision table (what to prescribe today; "flip if" = the bench threshold that changes a row)

| Decision | Desktop (`q=high`, ≥ 720p) | Phone (`q=low`, portrait) | Evidence | Flip it if |
|---|---|---|---|---|
| Frame architecture | **Hybrid H**: pixel buffer at the integer grid (640×360 at 720p), one device-res composite pass (DoF + bloom + haze + grade + dither) | **L now** (same passes, composite at the grid, CSS nearest); **H2** (composite at 2× grid) only on devices the bench proves | H ≡ L in full frames 6/6 (conf ≈ 1); H > L in 2× crops of defocused bands 14/18; H costs +17–26 MB/frame desk (≈ +0.7 ms iGPU), +27 MB phone (2.2× C, over the 25 MB low budget, inside T1's 60) | phone: `cave-low-fa-h.sync − cave-low-fa-l.sync ≤ 1.5 ms` and `raf.over20 ≤ 5 %` → H on that device class |
| Native resolution (N, N + MSAA4) | **No** | **No** | N vs H at equal sprite texels: no difference 3/3; its earlier "win" was sprite density (N0 rounded 1.5× more texels; N vs N0 4/4). 257–500 MB/frame on a phone = over the 17 GB/s bus at 60 fps | bench shows N ≤ 1.2× H AND the owner picks N blind at equal sprite density |
| MSAA on render targets | not needed (texels are the AA unit) | **never** (renderbuffer + blit resolve: +5 GB/s at 2.3 Mpx, "significant" on ANGLE-Metal) | mobile-perf §1.1 | — |
| Depth of field | on, **depth-based + subject mask**; CoC max ≈ 1.6 % of frame height; focus band = [nearest subject − 0.3, farthest + 0.5] world units; near ramp 2–4 u (longer = Octopath-like 4-band fall-off), far ramp 3.5 | on, **phone-tuned**: CoC in a fraction of frame WIDTH (or 0.6× strength) with a ≥ 5-unit near ramp so the lower half does not dissolve | DoF strength is an owner call: Opus flipped with display order in 10/12 cells; the only decisive phone win was 0.6 + near ramp 5 (cave 4/4). Bottom-band sharpness went 0.76–0.82 → 0.14–0.24 at 640 px (Octopath field 0.31–0.36) | owner blind kit picks C over H in ≥ 2 of 3 arenas → ship ≤ 0.6 strength, busy backgrounds only |
| DoF resolution | gather at the grid (= half device res; Filament `dofResolution 2`) | gather at the grid (quarter device res), ≤ 3 rings (≤ 25 taps) | SwiftShader: the 88-tap gather dominates | `cave-low-fa-l − cave-low > 1.5 ms` → cap CoC at 6 grid px or gather at ½ grid |
| Bloom | from the grid buffer, kept as a texture, bilinear upsample in the composite; threshold 1.0 + soft knee, emitters only | same at ¼ res | already right (judges) | — |
| Shafts, motes, particles | separate **haze layer** at the grid (depth copy + layer-1 draw), bilinear upsample | same | smooth beams without full-res fill | — |
| Dither | 1 device px in H (gradients are smooth) | grid px (L) | L's "dither / checker noise" in bokeh crops | — |
| Shadows | 2048 PCF live (PCFSoft deprecated r182) | **frozen 1024 PCF** (rebuilt ≤ 2 frames at load), never live 2048 PCFSoft | 2048² live = 33 MB/frame, the largest item on a phone | — |
| AO | baked (vertex AO / texture bevel); N8AO half-res optional ≤ 3 ms | baked only; never GTAO (2.4× the frame), never N8AO at native res | AO-only beat lightmaps 3–0; GTAO rejected (+300 ms SwiftShader) | — |
| Light rigs | one shadowing key (cookie spot or directional) + hemisphere 1.5–1.8 + weak front fill; AO multiplies ambient only; never a lightmap under a live key; every beam has a visible source | same, point accents off | lightmap under live key double-lit 3–0; indirect-only also lost 3–0 | — |
| Sprite bakes | 2× supersample, 10 fps | 1×, 8 fps, ≤ 4 subjects | measured | — |
| A/B hygiene | pin sprite texel density; frozen clock; identical dialog state | same | two invalid frames caught by a dialog diff; density confounded N | — |

## 2 Pass order today (`pipeline.ts`, every pass at the internal grid)

```
beforeRender hooks: sprite bakes (96² → 48² HalfFloat per subject at the bake rate)
[shadow map 2048² (high, every frame) | frozen 1024² (low)]
1 RenderPass → composer RT (HalfFloat, samples 0, + D24)
2 [GTAOPass: opt-in ?post=gtao, never on phones]
3 UnrealBloom: high-pass (soft knee, cap) at ½ (high) / ¼ (low) → 5-level blur chain → add-back onto the RT
4 GradeShader → canvas: tilt-shift (y-ramp disc blur ≤ 1.8 px INSIDE the grid) → vignette (linear) →
  exposure + ACES/hue-preserving mix → sRGB → CDL lift/gamma/gain → contrast on luma → saturation +
  shadow desat → split tone → bottom shade → 4×4 Bayer dither (screen-anchored: see camera.md)
CSS: canvas shown at bw·s/dpr px, image-rendering: pixelated (s = device px per internal px)
```
Full-res passes on a phone today = 3 (scene, bloom add, grade). The bloom chain and the bakes are
smaller than the grid and do not count. Tone mapping happens once, in the grade; three's
`renderer.toneMapping` is set to ACES only during `render()` so sprites/materials compile the same.

## 3 Hybrid H port notes (`hybrid.ts` from the research, 330 lines; rebuild it in `pipeline.ts`)

Per frame (targets RGBA16F unless noted):
```
1 scene  → sceneRT  grid + DepthTexture (camera layer 0; haze objects on layer 1)
2 haze   → hazeRT   grid: fullscreen depth copy (gl_FragDepth = scene depth), then layer-1 objects
                   (shaft ribbons, dust Points, kit particles) additive, depth-tested
3 bloom  → UnrealBloom chain from sceneRT with its final blend disabled; keep the result texture
4 gather → blurRT   at the grid: single-pass scatter-as-gather bokeh (golden-angle spiral, ≤ 96 taps,
                   weight smoothstep(r−0.5, r+0.5, sampleCoC)); samples BEHIND the centre clamped to
                   2× the centre CoC; marked sprite texels have CoC 0; alpha = centre CoC
5 comp   → canvas   device res: sharp = texelFetch(sceneRT, floor(uv·grid)); blur = 4-tap bilinear of
                   blurRT weighted 1/(0.15+|CoC_tap − CoC_centre|) (joint bilateral); mix by
                   smoothstep(0.6, 1.6, CoC in OUTPUT px); + bilinear haze + bilinear bloom; then the
                   existing grade and a 1-device-px Bayer dither
```
- Renderer: in H the drawing buffer becomes grid × k (k = grid scale; `fak=2` = H2) while the canvas
  keeps its CSS size; **patch `gl.getDrawingBufferSize` to keep returning the GRID**: five modules
  read it (sprite texel snapping, view-offset snapping, shake, FX `uRes`). Only the composite sees
  device pixels. L = the same code, composite at the grid.
- **Subject mask** (`sprite.ts`): the billboard shader writes alpha 0.375 (NoBlending; sprites are
  alpha-tested anyway). Upright billboards lean toward the camera (head ≈ 0.9 u nearer than the feet
  at 35°), so a pure depth DoF blurs heads. The gather never spreads marked texels; the composite
  forces CoC 0 on them. Check the mask with a debug view (`fadbg=1`: R = marker, G = mix, B = CoC):
  one of two `gl_FragColor` writes once kept alpha 1 and only outlines were marked.
- Focus subjects: battles publish kin spots + player + foe trainer; title/starter/route/menus must
  publish theirs too (`focus` passed to `Hd2dScreenStage.framed`).
- Phone CoC: express max CoC as a fraction of frame WIDTH (portrait frames are deep) and use a
  ≥ 5-unit near ramp; the decisive phone pair was `dofk=0.6&dofnr=5&doffr=6`.
- Costs (DRAM model, 17 GB/s phone): C 22 MB, L 30, H2 34, H 49, N 257, N+MSAA4 500; desktop iGPU
  720p: C 56, H 74, N 142, N+MSAA4 230. SwiftShader ratios (H/C 2–4× desk, 4–8× phone) are CPU
  rasteriser artefacts: the bench decides.
- Until H ships, the screen-space tilt bands stay: title/starter `tiltTop 3.6 @ 0.60–0.66`,
  `tiltBottom 3.6 @ 0.34–0.36`, vignette ≥ 0.5–0.6 won 4/4 desk and phone with the focal crop
  unchanged; route map blur only above 0.84 and below 0.30. Do not scale screen tilts by the low
  tier's 0.45 (13 taps, cheap): the pipeline multiplies `tiltTop/Bottom` by `TIERS[q].tilt`.

## 4 Mobile budget table (verbatim from mobile-perf-budget §5; CI counters in assets/perf-budget.json)

| budget item | low (phones) | T1 (proven phones) | desk |
|---|---|---|---|
| internal render size | integer grid, ≈ 0.16 Mpx (271×586 on 393×851@2.75) | grid × 1.5–2 (≤ 0.65 Mpx) | 640×360 grid … native ≤ 1080p |
| scene RT format | RGBA16F at internal res OK; R11G11B10F if ≥ 0.5 Mpx | RGBA16F / R11G11B10F | RGBA16F |
| MSAA on render targets | **none** | **none** | 4x OK |
| full-res passes per frame | ≤ 3 (scene, bloom add, grade) | ≤ 4 | ≤ 8 |
| DRAM traffic proxy | ≤ 25 MB/frame | ≤ 60 MB/frame | ≤ 400 MB/frame |
| GPU ms: shadow map | 0 (frozen 1024 PCF, rebuilt ≤ 2 frames at load) | ≤ 1.5 (1024 PCF, live only if needed) | 2048 PCF, ≤ 2 |
| GPU ms: sprite bakes (amortised) | ≤ 1.0 (1× supersample, 8 fps bake rate, ≤ 4 subjects) | ≤ 1.5 (2×) | ≤ 2 (2×; 4× only offline) |
| GPU ms: main scene pass | ≤ 6 | ≤ 7 | ≤ 8 |
| GPU ms: bloom chain + add | ≤ 1.0 (¼-res mip chain) | ≤ 1.5 | ≤ 2 |
| GPU ms: grade/tilt/vignette | ≤ 0.8 | ≤ 1.2 | ≤ 1.5 |
| GPU ms: AO | 0 (baked) | ≤ 1.5 (N8AO half-res "Performance" at internal res, optional) | ≤ 3 |
| GPU ms: battle FX peak headroom | ≤ 2 | ≤ 2 | ≤ 3 |
| **GPU frame total** | **≤ 11** | **≤ 12** | ≤ 12 on an iGPU |
| CPU (JS update + render submit) | ≤ 6 | ≤ 6 | ≤ 6 |
| draw calls / frame | ≤ 60 (hard 100) | ≤ 80 | ≤ 150 |
| triangles / frame incl. shadow | ≤ 100k | ≤ 200k | ≤ 600k |
| programs linked per scene | ≤ 40 (today 58–66: over) | ≤ 50 | ≤ 80 |
| scene entry (`enterMs`) on the slowest phone | ≤ 2.5 s | ≤ 2 s | ≤ 1.5 s |
| GPU-resident (textures + RBs) | ≤ 48 MB | ≤ 96 MB | ≤ 256 MB |
| live 2D canvases (Safari cap 224–384 MB) | ≤ 32 MB | ≤ 32 MB | ≤ 128 MB |
| JS heap | ≤ 100 MB | ≤ 150 MB | ≤ 300 MB |
| texture size cap | 1024 (pixel art ≤ 512) | 2048 | 4096 |
| download: initial (gz) | ≤ 1.5 MB | same | same |
| download: per arena chunk (lazy) | ≤ 400 KB, ≤ 8 atlases of 256–512 px | ≤ 600 KB | ≤ 2 MB |
| download: per kin | ≤ 80 KB (meshopt GLB ≤ 4.5k tris + ≤ 256² WebP/PNG or vertex colour) | same | same |
| download: whole game | ≤ 15 MB | same | same |
| thermal drift over the bench | ≤ 15 % | ≤ 15 % | — |
| raf frames > 20 ms during idle battle | ≤ 5 % | ≤ 5 % | ≤ 2 % |

Never on phones: MSAA targets, RGBA32F or float-linear sampling (`LightProbeGridWebGL` samples
black on ≈ 53 % of iOS), live 2048 PCFSoft, in-browser probe baking, N8AO at native res, GTAO.
Tier detection: coarse pointer → low (right by default); T1 only from a GPU allow-list or a cached
1-second probe; a 4-core desktop (this container) counts as low unless `?q=` is set.

## 5 Capture discipline (why `capture.mjs` works the way it does)

Frozen virtual clock (Playwright `page.clock`, paused before load, advanced by exactly N frames),
fixed seed, same camera and dialog state; repeats must be byte-identical (`--repeat-check`).
Wall-clock captures changed 3 of 4 density verdicts and produced a confident 6/6 preference between
two pixel-identical configurations. Desk 1280×720 **and** phone 393×851@2.75 for every change;
2× nearest crops for anything smaller than a quarter of the frame; native size to the judge
(≤ 2576 px long edge). If pixels outside the changed subsystem differ, the capture is invalid.
