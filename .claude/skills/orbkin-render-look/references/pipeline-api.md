# HD-2D pipeline API (`game/src/render/hd2d/`, three r180) — facts only

Contents: 1 pipeline.ts · 2 screens stage · 3 arena registry · 4 light rigs · 5 sprites ·
6 URL switches · 7 debug hooks · 8 where things are (file:line, HEAD at skill build).

## 1 `pipeline.ts`
- `hd2dRequested()` (`?gfx=hd2d`), `postFlags()` (`?post=a,b`), `detectQuality(): 'high'|'low'`
  (`?q=` wins; coarse pointer, short side < 500 px or ≤ 4 cores → low).
- `TIERS[q]: TierSettings { internalHeight 360|300, minShort 300|270, shadowMapSize 2048|1024,
  shadowType PCFSoft|PCF, bloom, tiltShift, tilt 1|0.45, gtao false, dust 50|26, staticShadows false|true }`.
  Internal size = `Renderer.pixelGrid(w, h, dpr, {height, minShort})`: s = round(min(h·dpr/height,
  short·dpr/minShort)) device px per internal px; 1280×720 → 640×360 @2; 393×851@2.75 → 271×586 @4.
- `Grade` (one per arena/screen): `lift gamma gain` (Vector3), `saturation contrast`, `shadowTint
  highTint splitAmount`, `vignette vignetteSoft`, `tiltTop tiltBottom focusTop focusBottom` (px at the
  edges × `TIERS[q].tilt`; sharp band between focusBottom and focusTop as fractions of height),
  `dither` (8-bit steps), `exposure`, optional `bottomShade bottomShadeHeight shadowDesat toneHue
  bloomThreshold(1.0) bloomStrength(0.4) bloomCap(1.1)` with `GRADE_DEFAULTS`. `warmCaveGrade()` = base.
- `new Hd2dPipeline(renderer.gl, scene, camera, q, grade)`: `.render()`, `.setSize()` (after the
  buffer changed), `.regrade()` (after editing `.grade` live), `.stats(): {quality, frameMs, calls,
  triangles, internal}`, `.beforeRender: ((gl) => void)[]` (sprite bakes), `.settings`, `.grade`.
  `render()` resets `info`, sets ACES tone mapping for the frame, refreshes the frozen shadow map on
  frames 0–1 (low), warms FX programs at frames 0 and 30.
- `installPipeline(game.renderer, pipeline) → uninstall()`: shadows on, `info.autoReset = false`,
  `renderer.setInternal({height, minShort})`. Call uninstall on scene exit (restores defaults).
- A scene opts in with `scene.userData.render = () => pipeline.render()`.
- Grade shader uniforms you may add to: `uRes` (internal px), `uDither`; the Bayer dither is
  `bayer4(gl_FragCoord.xy)` (line ≈ 264) — add `uDitherOff` for pans (camera.md §2).

## 2 Screens stage (`scenes/hd2dScreen.ts`, `Hd2dScreenStage(game, scene, camera, build)`)
- Installs the pipeline at `detectQuality()` with the set's `grade/background/fog`, owns the
  `SpriteBaker`; `addKin(view, extra?)`, `removeKin`, `addFigure(f)`, `addMesh(mesh)`,
  `removeSubject(s)`; texel heights `SCREEN_TEXELS = { person 44, kin [28,28,34,40] by stage }`.
- `framed(focus?)`: call after the scene framed its camera (`fitPoints` sets a view offset in CSS
  px): rounds the offset to whole internal px (`s = renderer.height / bufferHeight` CSS px per
  internal px), stores `base = {pos, focus}`, sets fog, `pipeline.setSize()`, `set.setPixelSize(high ? 1 : 1.5)`, `set.frame?.(cam, buffer)`.
- `drift(d: Vector3)`: TODAY moves `cam.position` by `d` along camera right/up/forward with the
  right/up part rounded to whole internal px at the focus depth (`px = 2·focus·tan(fov/2)/bufferH`)
  — a 3D truck (other depths crawl: camera.md §3). `update(t)`, `perf()`, `dispose()`.
- Set contract `ScreenSet { group, spriteLight, grade, background, fog, update(t), setPixelSize(px),
  frame?(camera, buffer), dispose() }`. Title: `screens/meadowScreens.ts buildTitleSet` (grade
  `titleGrade()`: meadowGrade(true) + warm gain, exposure 1.58, vignette 0.4, bottomShade −0.32 @ 0.4,
  tiltTop 1.4 @ focusTop 0.74, tiltBottom from meadowGrade 0.6 @ 0.08). Starter: `buildStarterSet`
  (grade `meadowGrade(false)`: tiltTop 1.0 @ 0.8, tiltBottom 0.6 @ 0.08, vignette 0.32).
- Scenes: `scenes/title.ts` (`frameHd2d` → `fitPoints(…, { dir, target (0.2,0.7,−0.2), fill, alignY })`
  then `this.hd2d.framed(target)`; `update()` calls `drift(sin(t·0.11)·0.55, sin(t·0.07)·0.08, 0)`),
  `scenes/starter.ts` (`frameHd2d`, `placeSpot`), `scenes/route.ts`, `scenes/meta.ts`, `scenes/evolution.ts`.

## 3 Arena registry (`arenas/index.ts`)
- `ArenaDef { id, label, match: ArenaMatch[] ({route, hotspot, kind, trainer, mode, priority}),
  build(opts: {quality, seed?, ctx, trainerBattle}): ArenaRig, grade?(): Grade, background, fog,
  fogRange? [near, far], camera?: Partial<Record<'wide'|'portrait'|'land', Partial<CameraPreset>>> }`.
  Files export `ARENA` / `ARENAS`; picked up by `import.meta.glob`; `resolveArena(ctx)` = most
  specific match (trainer > hotspot > route > kind > mode), then priority, then file order;
  `arenaById(id)`; `?arena=<id>` forces one.
- `ArenaRig { group, spots: [mine, foe], people: [player, trainer], key, spriteLight, update(t),
  setPixelSize(px), dispose() }` (`arena.ts`). Kit: `VoxelBatch`, `surfaceMaterial(map, emissive?,
  bevel, seam)`, `scaleAmbient(m, k)`, `haze()`, `Heightmap`, `rockColumns`, `lightBeams(beams,
  color, intensity)`, `dustMotes(beams, perBeam, rng, color)` (`setPixelSize`), `windowCookie()`.
- Battle camera `HD2D_CAMERA` (`scenes/hd2dBattle.ts`): wide {elev 0.52, yaw −0.06, fov 38, person 0.2},
  portrait {0.48, −0.4, 38, 0.1}, land {0.66, −0.08, 34, 0.15}; `shake(dx, dy)` = whole-internal-px
  view-offset shift from `baseOffset` (the pattern for every pan).

## 4 Light rigs (`kit/lights.ts`)
- `lightRig(group, preset, { quality, target, extent 12, elev, azim, keyK, hemiK, cookie, shadows,
  keyColor, sky, ground, fillColor }) → { key, hemi, fill, spriteLight, background, fog, dispose }`.
  Presets `daylight | sunset | overcast | moonlight | cave` (`LIGHT_PRESETS`: key colour/intensity
  2.2–2.8, hemisphere 1.3–2.0, fill 0.35–1.1, shadow radius `soft` 2–6, grade tweaks).
  Shadow map 2048 (high) / 1024 (low), bias −0.0006, normalBias 0.02. `presetGrade(p)` = cave grade +
  preset gain/tints/vignette/exposure, vignetteSoft 0.7.
- Rule: one shadowing key; hemisphere ≈ 1.5–1.8; keys > 1.0 linear only on emissive; ≤ 2 point
  accents on high only. **Lights are counted into every lit material's program**: add every light the
  scene will ever use at build time (FX light pre-allocated, intensity 0) — adding one later relinks
  every lit material (a stall and new programs).

## 5 Sprites (`sprite.ts`)
- `SpriteLight { keyDir, keyColor, sky, ground, rim, outline?, shade?, highlight?, contact?, front? 0.6, spriteGain? 1 }`.
- `SpriteOptions { rig, emissiveFrom, pxPerTexel, texelHeight, nominalHeight, ground, bakePitch
  (0.3; 1 = camera pitch), outline, lift, inScene, supersample 1|2, palette, shadow, live, hidden,
  emissive[], emissiveGain 1.9, facet 0.22, contrast, plates, crease, minValue, glow }`.
- `SpriteBaker(scene, camera, light)`: `add(mesh, opts) → SpriteSubject`, `remove(s)`, `bake(gl)`
  (call from `pipeline.beforeRender`), `dispose()`. Bake rate 10 fps (8 low; `?post=bakeall` = every
  frame); px per texel = max(1, round(screenHeight/texelHeight)) internal px, shared per frame.
- Feet anchor snapped to the texel grid in ABSOLUTE buffer px (line ≈ 1115: `round(sx/px)·px`);
  contact + drop shadow in the same grid; `?post=nosnap` disables the palette snap.

## 6 URL switches (all read live from `location.search`)
`gfx=hd2d` · `q=high|low` · `post=nobloom,nograde,notilt,gtao,pcf,bakeall,nosnap` · `seed=N` ·
`scene=title|starter|route|battle|party|…` + `route=`, `hotspot=`, `arena=` · `debug=1` (fps/calls).
Add new experiments as `post=` flags or a new `fa=`/`dof=` param read through `params()`; never a
build-time constant (A/B captures need both sides in one build).

## 7 Debug hooks (`window.__game`, `src/debug/hooks.ts`)
`scene()`, `goto(name, params)`, `setFast(on)`, `setSpeed(k)`, `skip()`, `idle()`, `waitIdle(ms)`,
`canvasStats()`, `renderInfo(): {calls, triangles}`, `perf(): {quality, frameMs, calls, triangles,
internal}` (HD-2D only), `benchFrames(n)`, `layout()`, `debugSetParty`, `debugDefeat`, `openMenu`.
`window.__hd2dScreen` = the live `Hd2dScreenStage` (edit `.pipeline.grade` then `.pipeline.regrade()`
for live tuning in a headless page).

## 8 Where things are (HEAD 5fb0752)
`pipeline.ts` 69–74 TIERS · 130 warmCaveGrade · 152–267 GradeShader (tilt 206–227, dither 264) ·
310–439 Hd2dPipeline · 446 installPipeline. `hd2dScreen.ts` 84–99 framed · 106–120 drift.
`title.ts` 235–251 frameHd2d · 261–268 update/drift. `starter.ts` 199–209 frameHd2d.
`meadowScreens.ts` 20–32 titleGrade · 165 starter grade. `sprite.ts` 1113–1117 anchor snap ·
1222–1291 shadow snap. `hd2dBattle.ts` 388–394 shake. `fx.ts` 560–600 pixel-snapped FX shaders (uRes).
`arena.ts` 448–506 dust motes · 405–481 light beams. `kit/lights.ts` 29–55 presets · 105 lightRig.
`renderer.ts` 48 pixelGrid · 55 resize. `e2e/hd2d-screens.spec.ts` checks perf non-null, internal =
buffer, calls < 100, not blank, testids, no console errors on desktop + Pixel 7.
