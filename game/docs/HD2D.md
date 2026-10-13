# HD-2D art direction — pipeline, conventions, rollout

Status: **prototype behind `?gfx=hd2d`** (default rendering unchanged). Covers adventure
battles on Ember Ridge (every hotspot) and every `cave` hotspot (e.g. Mossy Meadow's Rocky
hollow). Everything is procedural and original (no external art, see `ASSETS.md`).

Try it: `?scene=battle&route=ridge&hotspot=hiker-brann&gfx=hd2d` (trainer),
`?scene=battle&route=ridge&hotspot=vent-cave&gfx=hd2d` (wild). Extra switches:
`&q=high|low` (tier), `&post=` comma list for A/B captures: `nobloom`, `notilt`, `nograde`,
`gtao`, `pcf`, `noshadow`, `nopoints`, `norays`, `mesh` (in-scene toon models instead of
sprites), `px2` (2 px sprite texels). Debug: `window.__hd2d` (stage), `__game.perf()`,
`__game.benchFrames(n)`.

Screens: `docs/screenshots/hd2d/`.

## What the look is made of

1. **A real place.** The battle happens *inside* a diorama: a sunken dirt floor ringed by
   terraced boulder walls, a raised miners' lodge up a stair with red rails, rubble piles, a
   front ledge with its own stair, a big window high in the back wall. The foe trainer stays on
   the field behind their kin; the player stands behind theirs, seen from the back.
2. **Pixel-art surfaces.** Tiny procedural tiles painted from 6–7-shade ramps with Bayer
   dithering, nearest filtering, one texel density everywhere, plus a texel-quantised bevel
   (dark seam + lit lip) on every block so cubes read as hand-shaded boulders.
3. **Sprite characters.** Live 3D models baked every frame into small targets with a banded
   toon shader, 1-texel selective outline, inner contour lines, drawn on pixel-snapped
   billboards — crisp like sprites, but every procedural animation survives.
4. **Cinematic light.** A warm cookie spotlight through the window (soft shadows, window-pane
   light patches), additive light shafts with dust motes, warm/plum hemisphere fill, ember
   accents, bloom on the hot stuff only, ACES + a warm split-tone grade, subtle tilt-shift and
   vignette — all inside the low-res frame, so the upscale stays nearest-neighbour crisp.

## Pipeline decisions (and why)

| Decision | Chosen | Alternatives tried | Why |
|---|---|---|---|
| Internal resolution | 480 px tall (high), 400 (low); short side ≥ 300/280 px | default 420 | 480 keeps sprite faces readable at the wider arena framing; the canvas is upscaled by CSS `image-rendering: pixelated`, so every pass below happens at low res and the final image is pixel-crisp. |
| Pass order | Render → (GTAO) → UnrealBloom → OutputPass (ACES, sRGB) → GradePass (tilt-shift, CDL grade, split-tone, vignette, 4×4 Bayer dither) | grade before tone map | Grading after tone mapping behaves like a LUT on display values; the dither breaks beam/bloom gradients into pixel-art dither instead of banding. |
| Bloom | threshold 1.05 (linear HDR), strength 0.5, radius 0.5; low tier from a quarter-res mip chain | threshold 0.82 | Lower thresholds made lit rock bloom and the whole top of the frame went soft. Now only the window panes, shafts, ember crystals and FX glows bloom. |
| Tilt-shift | ≤ 1 px blur above 80% of the height, ≤ 0.6 px under 8% | 1.4 px from 62% | The stronger band blurred the rock texture into mush — crispness beats DOF. |
| Ambient occlusion | **Baked**: per-vertex AO in the voxel batch (side faces darken toward their base, top corners next to taller neighbours, floor near walls) + texel bevel seams | GTAOPass (`post=gtao`) | GTAO cost 2.4× the frame (512 vs 215 ms on SwiftShader) and pushed draw calls from 51 to 86 (it re-renders the scene for normals); visually the baked AO + bevel already gives the dark crevices. |
| Key light | One SpotLight through the window with a window-pane **cookie** (`light.map`), PCFSoft shadows on high, PCF on low | DirectionalLight; a second cookie spot for the small window | The cookie gives the reference's bright pane-shaped patches and real rock shadows on the floor. The second spot cost ~20% of the frame; a soft additive "light pool" decal fakes its patch. |
| Fill | Hemisphere (warm sky / dark brown ground, 1.7) + weak front directional (no shadow) + 2 warm point lights (high only) | — | Camera-facing rock never goes black; points add the lantern/ember glow. |
| God rays | Camera-facing ribbon per shaft (vertex shader orients around the shaft axis), additive, soft across, faded along, slow shimmer; one mesh | screen-space radial blur | Cheap (one draw call), stays correct when the camera shakes, and reads exactly like the reference's distinct shafts. |
| Dust | Points, square 1.5–2 px, drifting inside the shafts, twinkling | textured sprites | Pixel-sized squares are the pixel-art way; one draw call. |
| Creatures & people | **(a) Sprite bake** of the live model every frame (toon bands + outline + inner contours, pixel-snapped billboard) | (b) toon material in-scene (`post=mesh`); (a') 2 px texels (`post=px2`) | (b) has no outline and melts into the busy rock; (a') is chunkier but loses face detail on small kin. (a) separates the subject from the background like hand-made sprites while keeping squash/stretch, rig flaps, blinks, lunges, hit flashes and faints. See `r2` comparison in the screenshots folder. |
| Shadows of sprites | The real mesh stays in the scene with an invisible colour material and a rig-aware depth material, so it casts a live (flapping) shadow; low tier freezes the shadow map and uses blob contact shadows | — | A sprite with a real cast shadow sits *in* the scene. |
| Tone | ACES, exposure 1.05; grade gain (1.03, 1.0, 0.93), sat 0.92, contrast 1.06, plum shadows / warm highlights | saturation 1.12 + strong gain | The first pass turned the cave neon orange; the reference is warm but earthy. |

## Module API (`src/render/hd2d/`)

### `pipeline.ts`
- `hd2dRequested()`, `postFlags()`, `detectQuality(): 'high' | 'low'` — `?q=` wins; coarse
  pointer, short side < 500 px or ≤ 4 cores → `low`.
- `TIERS[quality]: TierSettings` — internal height, shadow size/type, bloom, tilt, gtao, dust,
  `staticShadows`.
- `warmCaveGrade(): Grade` — the grade/vignette/tilt parameter set; make one per terrain.
- `new Hd2dPipeline(renderer, scene, camera, quality, grade?)` — `.render()`, `.setSize()`,
  `.stats()`, `.beforeRender` (hooks run before the composer, e.g. sprite baking), `.settings`.
- `installPipeline(game.renderer, pipeline) → uninstall()` — shadows on, frame-wide draw-call
  counting, tier resolution policy. Call `uninstall` on scene exit (restores defaults).
- A scene opts in by setting `scene.userData.render = () => pipeline.render()`
  (`Renderer.render`/`sample` honour it).

### `textures.ts`
- `RAMPS` — named colour ramps (dark → light, 6–7 shades, hue-shifted).
- `PixelTile` (indexed image painter: `set/nudge/field/toCanvas`), `ditherIndex`, `fbm`.
- Painters: `paintDirt`, `paintRock`, `paintStone`, `paintPlanks`, `paintBoards`, `paintPlaster`,
  `paintSteel(seed, size, ramp)` (use `RAMPS.paint` for tintable neutral metal), `paintRug`.
- `pixelTexture(canvas)`, `cachedTexture(key, paint)` (session-persistent, never disposed).

### `arena.ts`
- Constants: `TEXEL = 1/16`, `CELL = 0.9`, `LEVEL = 0.7`.
- `VoxelBatch` — merged textured boxes/quads with block-local UVs, tint × baked AO and the
  bevel attribute: `box(min, max, tint, rng, {skip, aoBottom, aoTop, topK})`, `rotBox`, `quad`,
  `build()`.
- `Heightmap` + `rockColumns(hm, batch, rng, ramp)` — terraced boulder walls from a level grid.
- `surfaceMaterial(map, emissive?, bevel?)`, `addBevel(material)`.
- `lightBeams(specs, colour, intensity)`, `dustMotes(specs, perBeam, rng)`, `windowCookie()`.
- `buildCaveArena({ seed, quality }) → ArenaRig` — `{ group, spots, people, trainerExit,
  spriteLight, key, update(t), setPixelSize(px), dispose() }`.

### `sprite.ts`
- `SpriteBaker(scene, camera, light)` — `.add(mesh, opts) → SpriteSubject`, `.remove(s)`,
  `.bake(renderer)` (push it into `pipeline.beforeRender`).
- `SpriteOptions`: `rig` (CreatureView/Figure uniforms), `emissiveFrom` (hit flash source),
  `pxPerTexel`, `outline`, `lift`, `inScene`.
- `SpriteLight`: key direction/colour, hemisphere sky/ground, rim — derive from the arena rig.
- `toonMaterial(rig?)` — the banded shader (also usable directly on meshes).

### `characters.ts`
- `buildFigureGeometry(look)`, `Figure` (mesh + rig uniforms + idle `update(t)`),
  `heroFigure()`, `trainerFigure(id)`, `HERO_LOOK`. Looks/hats/props come from
  `render/trainer.ts`, so route-map and battle figures stay the same people.

### Terrain registry: `src/render/hd2d/arenas/`
Every arena is one file in `arenas/` exporting `ARENA: ArenaDef` (or `ARENAS: ArenaDef[]`);
`arenas/index.ts` picks the files up with `import.meta.glob` — **no central list to edit**.

```ts
export const ARENA: ArenaDef = {
  id: 'meadow', label: 'Meadow clearing',
  match: [{ route: 'meadow' }, { route: 'meadow', hotspot: 'tall-grass' }],
  build: (o: ArenaBuildOptions) => buildMeadowArena(o), // → ArenaRig
  grade: meadowGrade,            // optional, defaults to warmCaveGrade()
  background: '#9cc8e8', fog: '#cfe3d0', fogRange: [8, 40], // fog null = off
  camera: { portrait: { elev: 0.8 } }, // optional per-layout tweaks (wide | portrait | land)
};
```

- `ArenaContext` = `{ routeId, hotspotId?, hotspotKind?, trainerId?, mode? }` (mode defaults
  to `'adventure'`; e.g. the PvP stadium can claim `{ mode: 'pvp' }`).
- `ArenaMatch` = any of `route / hotspot / kind / trainer / mode` + `priority`. A rule matches
  when **all** its fields equal the context; the most specific match wins (weights trainer 16,
  hotspot 8, route 4, kind 2, mode 1, summed), then `priority`, then file order. An empty rule
  never matches.
- `ArenaBuildOptions` = `{ quality, seed?, ctx, trainerBattle }` — `trainerBattle` asks the
  builder for a battle-ground marking (chalk ring / worn patch).
- `resolveArena(ctx)`, `arenaById(id)`, `arenas()`, `registerArena(def)` (runtime/tests).
  `tests/hd2d-arenas.test.ts` checks ids are unique and rules name real routes/hotspots/trainers.
- Only `import type` from `arenas/index.ts` inside an arena file (index imports the files).
- `?arena=<id>` forces an arena for captures (`&gfx=hd2d` still required).

Current mapping (updated by each arena's `match`):

| Battle | Arena |
|---|---|
| any `cave` hotspot, any other Ember Ridge battle | `cave` (quarry) |

### Scene adapter: `src/scenes/hd2dBattle.ts`
`hd2dTerrainFor(ctx)` resolves the arena from the registry; `Hd2dBattleStage` builds it, applies
its grade/background/fog/camera tweaks and owns pipeline, baker, hero/trainer figures and the
camera (`frame(w, h)` per layout: elevation, yaw, FOV, how tall a person reads, where the kin
land), `attachKin/detachKin/fitKin`, `trainer(id)`, `trainerPath(entering)`, `throwOrigin()`.
`BattleScene` keeps all flow, UI and FX and only branches on `this.hd2d` in ~10 places.

<!-- kit:begin -->
## Shared kit (`src/render/hd2d/kit/`) — for arena builders

Everything here is backward compatible with the original `arena.ts` API; new helpers are
additive. Units live in `kit/units.ts` (`TEXEL`, `CELL`, `LEVEL`, re-exported by `arena.ts`).
All builders append into a `VoxelBatch` (one merged mesh per material → one draw call) and use
the texel bevel (`surfaceMaterial(map, undefined, true)`) plus baked vertex AO.

### Rock — `kit/rock.ts`
Rounded, irregular boulders instead of cubes: a chamfered box (faces + edge bevels + corner
facets) whose corners are jittered as units; top bevels are lit, bottom bevels sink into
shadow, big faces keep the 1-texel seam. Pair with the coarser `paintBoulder(seed, 32, ramp)`
texture (`textures.ts`).

```ts
import { boulder, boulderColumns, organicTerraces, pebbles, rubblePile } from '../kit/rock';
const hm = new Heightmap(30, 21, -13.5, -12.6);
// Terraces from a distance field: ≤ 0 = floor, +1 level every `step` units, meandering ledges.
organicTerraces(hm, (x, z) => Math.max(Math.abs(x) - 5.4, -3 - z, z - 3.6), rng, { step: 1.6, max: 8 });
const rock = new VoxelBatch(32);
boulderColumns(hm, rock, rng, { tints: ['#ffffff', '#f4e6d8'] }); // drop-in for rockColumns
rubblePile(stone, [-4.7, 0, -2.1], rng, { radius: 1.3, big: 0.7 });
pebbles(stone, [-5.4, -3, 5.4, 3.6], 40, rng, [{ x: -1.3, z: 1.0, r: 1.2 }, { x: 1.5, z: -1.0, r: 1.2 }]);
boulder(stone, [x, y, z], [0.6, 0.45, 0.5], tint, rng, { ry: 0.4, flatBottom: true }); // one rock
group.add(new THREE.Mesh(rock.build(), surfaceMaterial(cachedTexture('boulder', () => paintBoulder(5, 32)), undefined, true)));
```

- `boulderColumns(hm, batch, rng, { split, merge, tall, bulge, shade, tints, core, baseY })`:
  every *visible* block becomes 1–2 boulders (sometimes 2-wide or 2-tall), staggered like
  dry-stone masonry, darker low, lighter on top tiers. Buried blocks emit nothing. A dark
  recessed **core** (`core` brightness, default 0.3) fills the crevices. Rows are emitted
  front-to-back with cores last, so early-z keeps overdraw low — keep that order if you add
  geometry to the same batch afterwards (append far stuff last).
- `VoxelBatch.tri(...)` (raw triangles with bevel attribute; `face = [0, 0, -1, k]` marks a
  chamfer facet with brightness `k`) and `VoxelBatch.append(other)`.
- Cost: the cave's rock went from 23k to ~78k triangles at the same frame time (SwiftShader,
  min of runs); flat bottoms + no buried blocks + front-to-back order are what make that free.
  `?post=voxel` renders the old cube rock for A/B.
### Sprites & people (`sprite.ts`, `characters.ts`)
- **Per-species palette**: `extractPalette(geometry)` clusters a mesh's vertex colours (distance
  merge, ≤ `SPRITE_PALETTE_MAX` = 16, rare-but-distinct colours like eye black survive); the
  toon pass snaps every vertex colour to it, so jitter/countershading no longer adds colours.
- **Hue-shifted ramp**: core shadow leans cool/violet, the top-lit highlight warm.
- **2× bake + detail-preserving downsample** (`SpriteOptions.supersample`, default 2): each
  output texel picks an actual baked sample — the much darker one (eyes, mouths, inner lines),
  else the much brighter one (shines), else the one nearest the mean — so small stage-1 faces
  stay crisp and the sprite stays on palette.
- **Outline**: exactly 1 texel (4-neighbour), a deep, slightly saturated shade of the local
  colour pulled 45% toward `outline`; inner contours darken the local colour (×0.52) instead of
  drawing black; a 1-texel **rim** brightens the silhouette edge facing the key light.
- A/B: `?post=nosnap` (no palette snap), `?post=ss1` (no supersampling).
- People are ≈ 4.7 heads (body remapped: longer legs; head + hat built in their own Kit and
  shrunk 14%), with hair tufts, eye shines, brows, collar, cuffs, knee bands and boot soles.
### Props — `kit/props.ts`
Few, big, readable pieces (≥ 0.12 units per detail; colours grouped, not confetti). All take
`PropBatches = { wood, paint, glow?, stone? }` — your existing batches (`paint` = the neutral
`paintSteel(…, RAMPS.paint)` texture tinted by vertex colour; `glow` = `MeshBasicMaterial`
vertex colours, HDR tints bloom).

```ts
const pb: PropBatches = { wood, paint: props, glow, stone };
bookcase(pb, [x, floorY, wallZ + 0.8], rng, { w: 1.4, h: 1.95, shelves: 3 }); // runs of same-hue books
crate(pb, [x, 0, z], 0.55, rng, { ry: 0.3 }); crate(pb, [x, 0.55, z], 0.4, rng); // framed, stackable
barrel(pb, [x, 0, z], 0.24, 0.62, rng);
table(pb, [x, 0, z], [1.5, 0.75, 0.5], rng);
banner(pb, [x, 2.8, wallZ], rng, { cloth: '#2f5a8a', trim: '#e0b048' }); // pole, trim, ring emblem, V tail
const lightAt = brazier(pb, [x, 0, z], rng);   // returns where a warm PointLight goes (high tier)
fence(pb, [[-4, 0, 3], [0, 0, 3.5], [4, 0, 3]], rng, { h: 0.7, step: 0.9 });
lanternPost(pb, [x, 0, z], rng);
```
The cave lodge now uses them (`?post=oldprops` = the old dressing for A/B).
### Outdoor kit — grounds, foliage, water, light presets, particles
Worked example: `kit/showcase.ts` (`buildKitShowcase({ light, particles })`) builds a whole
outdoor clearing from these pieces only — copy it as a starting point. Sheet:
`docs/screenshots/hd2d/kit-outdoor.jpg`. (Several arena files still carry local equivalents in
`arenas/localKit.ts`, `outdoorKit.ts`, `nightKit.ts`; new arenas should prefer `kit/`.)

- **Ground painters** (`textures.ts`): `paintSand`, `paintGrass`, `paintSnow`, `paintAsh`
  (+ `paintBoulder`), with ramps `RAMPS.sand / grass / snow / ash / leaf / bark / water / foam`.
  Tile them at `TEXEL × 64` like the cave floor.
- **Foliage** (`kit/foliage.ts`): one procedural RGBA atlas (`canopy`, `canopy2`, `bush`,
  `tallgrass`, `tuft`, `flowerRed|Yellow|Blue|White`), camera-facing cylindrical billboards in
  ONE Lambert mesh (lit, receives shadows, casts sprite-shaped shadows via a matching depth
  material), wind sway quantised to whole texels.
  ```ts
  const fol = new FoliageBatch();
  tree(trunks, fol, [x, 0, z], rng, { height: 2.8 });          // bark boxes + 3 canopy sprites
  fol.scatter(['tallgrass', 'tuft'], [-6, -3, 6, 4], 60, rng, { keepOut });
  fol.add('bush', [x, 0, z], { scale: 1.2, sway: 0.25 });
  const f = fol.build({ strength: 1, speed: 1.4 }); group.add(f.mesh); /* update(t) */ f.update(t);
  ```
- **Water** (`kit/water.ts`): `pixelWater({ rect, y, land, range, ripples, light, flow })` —
  one plane; per-texel noise quantised to `RAMPS.water` with Bayer dither, depth tint and
  rolling foam from a shore-distance field (`shoreDistance(rect, land)`), 1-texel ripple rings,
  glints. `light` ≈ 1 day, 0.85 sunset, 0.32 moonlight (it is unlit, so match the rig).
- **Light presets** (`kit/lights.ts`): `lightRig(group, 'daylight' | 'sunset' | 'overcast' |
  'moonlight' | 'cave', { quality, target, extent, cookie? })` → `{ key, hemi, fill, spriteLight,
  background, fog }`; directional sun with a fitted shadow box, or a far cookie SpotLight when
  `cookie` is given (dapple/window/clouds). `presetGrade(preset)` is the matching `Grade`;
  `LIGHT_PRESETS[p].background/fog` for the `ArenaDef`. `ArenaRig.key` now also accepts a
  `DirectionalLight`.
- **Particles** (`kit/particles.ts`): `particleSystem('pollen' | 'embers' | 'steam' | 'spray' |
  'snow' | 'dust' | 'rain' | 'fireflies', { min, max, count, override? }, rng)` → one `Points`,
  all motion in the vertex shader, square pixel points; wire `update(t)` and
  `setPixelSize(px)` into your `ArenaRig`.
<!-- kit:end -->

## Conventions for new arenas

- **Scale**: 1 unit ≈ a kin; people 1.55× scale of the ~1.05 unit figure (≈ 1.6 units);
  blocks 0.9 × 0.7. Floor at y = 0, camera on +z looking to −z. Kin spots ≈ (−1.3, 0, 1.0) and
  (1.5, 0, −1.0); people one step behind each.
- **Texel density**: everything at `TEXEL`; tile UVs are block-local and start on a whole texel.
  Never use linear filtering or mipmaps on surfaces.
- **Palette**: each material = one ramp of 6–7 shades. New terrain → new ramps in `RAMPS`
  (shadows shift toward red/purple, highlights toward yellow; keep the darkest shade above
  ~#1a). Colour variety between blocks comes from vertex tint (±13%) and AO, not new colours.
  Floor must be clearly lighter/less saturated than walls (it is the stage).
- **Light rig**: one shadow-casting key (cookie spot or directional), hemisphere fill ~1.5–1.8,
  weak front fill, ≤ 2 point accents on high only. Every beam needs a visible source (window,
  crack, sky hole). Feed the same key into `SpriteLight` so sprites agree with the set.
- **Bloom budget**: only emissive things exceed 1.0 linear (windows ×3.2, embers ×2.4, FX).
- **Draw calls**: one merged mesh per material (rock, stone, floor, wood, metal, props,
  plaster, glow, frames, rug, beams, dust, pools) — the cave is ~16 calls; the whole frame
  (shadow + 4 sprite bakes + post) is 45–52. Budget < 100.
- **Readability**: keep 2 cells of clean floor around the kin spots (no pebbles/props); rubble
  and props go to the edges; walls must not rise into the kin silhouettes for any layout.

### Adding a terrain
1. Add ramps (and painters if the surface is new) — the kit's `textures.ts`, or locally in
   your arena file until the kit has them.
2. Create `src/render/hd2d/arenas/<name>.ts` with `buildXxxArena(opts): ArenaRig` from the kit:
   heightmap + `rockColumns`, floor, props, light rig, beams/dust or other atmosphere.
3. Export `ARENA: ArenaDef` from it with `match` rules, a `Grade`, background and fog — the
   registry picks it up. Add your rows to the mapping table above.
4. Capture desktop / portrait / landscape (`e2e/hd2d.spec.ts` pattern), check calls < 100.

## Performance

Measured with `__game.benchFrames(25)` (render + GPU sync, median) under SwiftShader (CPU
rasterizer, so absolute numbers are 10–50× a real GPU; compare ratios). Ember Ridge trainer
battle, idle.

| Viewport | Default renderer | HD-2D low | HD-2D high |
|---|---|---|---|
| 1280×720 desktop | 13.9 ms · 9 calls · 746×420 | 79–88 ms · 45 calls · 711×400 | 168–172 ms · 52 calls · 853×480 |
| 393×851 phone | 4.5 ms · 9 calls · 193×420 | 50–54 ms · 44 calls · 280×606 | 89 ms · 51 calls · 300×649 |
| 844×390 landscape | 14.7 ms · 9 calls · 908×420 | 95–98 ms · 45 calls · 865×399 | 202 ms · 52 calls · 1038×480 |

(Ranges = repeated runs; SwiftShader timings vary ±10% with machine load.)

Breakdown (desktop high, before the second spot was removed: 215 ms): PCFSoft shadow ≈ 70 ms,
second cookie spot ≈ 50 ms, bloom ≈ 50 ms, post grade/tilt small, GTAO +300 ms (rejected).
Low tier = PCF, frozen shadow map, quarter-res bloom, no point lights, fewer motes.
HD-2D low costs roughly 6–11× the flat default per frame on SwiftShader; since the default
battle is far below 1 ms on a mid phone GPU, the low tier should stay inside a 30 fps budget,
but **this has not been measured on a real phone yet** (first rollout task).
`frameMs` in `perf()` is CPU submit time only (~1.5 ms).

## Gaps vs the reference (honest)

- Rock walls still read a little "voxel" — the reference's boulders are rounder and more
  irregular in size. Next: merge 2×1/2×2 blocks, random chamfered corners, more height noise.
- The lodge is less detailed (no computer/terminal-type props by design; fewer readable
  objects). Our shelves read as colour noise at 480 px; fewer, bigger props would read better.
- Sprites are toon-shaded 3D, not hand-drawn: no anti-aliasing tricks, limited sub-shapes.
  A per-species palette quantisation (snap to 6–8 colours) and 1-texel highlight pass would
  get closer to hand-pixeled sprites.
- Light patches on the floor are fixed (no animated sun motion); dust and shafts are.
- Portrait shows less of the set (narrow FOV); the composition is rotated onto the diagonal.
- FX were not retuned for the new scale beyond what bloom gives them; they read well
  (flame pillar + bloom) but projectile trails are small at arena scale.

## Rollout plan

Arenas (one builder each, sharing the kit):
1. **Cave / quarry** — done (Ember Ridge, every `cave` hotspot).
2. **Meadow clearing** — grass-tufted dirt floor, hedges/stone walls, picket fence, tree canopy
   with sun shafts through leaves (cookie = leaf noise).
3. **Flower field** — same set dressed with flower beds; pollen motes instead of dust.
4. **Steaming volcanic cave** (Ember Ridge vent cave) — basalt ramps, lava channel emissive,
   steam ribbons, red key from below.
5. **Dry scrub / ridge outdoors** — terraced sandstone, sunset key, heat haze.
6. **Coast cove / beach** — sand floor, tide-pool rocks, pier planks, cool fill + warm sun.
7. **Shallows** — wet-sand floor, animated water plane (pixel-quantised), reflections faked
   with flipped sprites.
8. **Sea cliff** — wind-carved terraces, spray particles, overcast grade.
9. **Summit plateau / Champion hall** — slate floor, pillars, banners, cold moonlight key,
   snow motes, blue grade.
10. **Arena PvP stadium** — tiers of block spectators (instanced sprites), floodlights.

Scenes to convert after battles: route maps (diorama islands with the texture kit + figures as
sprites), title, starter choice, evolution (sprite silhouette flash works directly), Hall of
Fame, menu turntables (party/bestiary/bag/box/shop) and the Arena lobby/victory podium.
Also: real-device perf pass and tier auto-detection tuning, Arena battle adoption of the stage
adapter, and moving FX to bloom-aware colours per element.
