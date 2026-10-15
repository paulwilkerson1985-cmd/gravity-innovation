# HD-2D art direction — pipeline, conventions, rollout

Status: **prototype behind `?gfx=hd2d`** (default rendering unchanged). Covers every battle
arena (terrain registry below) and, since the screens pass, every non-battle screen too: title,
starter pick, the four route maps (and the menu over them), party / box / bestiary / bag / shop
and evolution (see "Screens"). Everything is procedural and original (no external art, see
`ASSETS.md`).

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
| Internal resolution | Integer pixel grid targeting 360 px tall (high: 640×360 at 720p, 2 device px per internal px) and 300 (low; short side ≥ 300/270 px, e.g. 271×586 on a Pixel 7) | 480/400 px at a fractional scale; default 420 | Whole device pixels per internal pixel keep every texel the same size on screen; the canvas is upscaled by CSS `image-rendering: pixelated`, so every pass below happens at low res and the final image is pixel-crisp. |
| Pass order | Render → (GTAO) → UnrealBloom → OutputPass (ACES, sRGB) → GradePass (tilt-shift, CDL grade, split-tone, vignette, 4×4 Bayer dither) | grade before tone map | Grading after tone mapping behaves like a LUT on display values; the dither breaks beam/bloom gradients into pixel-art dither instead of banding. |
| Bloom | threshold 1.0 (linear HDR) with a quadratic soft knee (0.22), strength 0.4, contribution capped at 1.1 over the threshold, tighter radius; low tier from a quarter-res mip chain | threshold 0.82; 1.05 hard threshold, strength 0.5 | Lower thresholds made lit rock bloom and the whole top of the frame went soft; a hard threshold left windows and lava falls hazing half the frame. Only the excess over 1.0 blooms now, so emitters (panes, lava, flames, FX) keep a defined core. |
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

| Battle | Arena | File |
|---|---|---|
| Mossy Meadow: tall grass, any other meadow battle, Scout Pim (chalk ring) | `meadow` (forest clearing) | `arenas/meadow.ts` |
| Mossy Meadow: flower patch | `flowers` (flower field, gazebo) | `arenas/flowers.ts` |
| Mossy Meadow: rocky hollow (and any meadow `cave`) | `hollow` (mossy grotto + pool) | `arenas/hollow.ts` |
| Ember Ridge: dry scrub, Hiker Brann (chalk ring) | `scrub` (sunset ridge, canyon) | `arenas/scrub.ts` |
| Ember Ridge: steaming cave | `volcanic` | `arenas/volcanic.ts` |
| Ember Ridge: Cinder Adept Sola, any other `cave` hotspot | `cave` (quarry) | `arenas/cave.ts` |
| Squall Coast: dune grass, Angler Merrow, other coast battles | `coast` | `arenas/coast.ts` |
| Squall Coast: rough shallows (any `water`) | `shallows` | `arenas/shallows.ts` |
| Squall Coast: sea cliff, Gale Rider Tavi | `cliff` | `arenas/cliff.ts` |
| Crown Plateau (Champion Vale) | `summit` | `arenas/summit.ts` |
| Arena mode (`mode: 'pvp'`) | `stadium` | `arenas/stadium.ts` |

### Outdoor arenas (`arenas/outdoorKit.ts`, used by meadow / flowers / hollow / scrub)
- `SpriteAtlas` + painters (`paintCanopy`, `paintTuft`, `paintFlower`, `paintVine`,
  `paintTwigs`, `paintButterfly`): multi-ramp RGBA pixel sprites at TEXEL density.
- `Foliage`: ONE mesh of Y-cylindrical billboards over the atlas (alpha-tested Lambert, casts
  shadows through a matching depth material, so canopies shade the floor). Modes: `billboard`
  (wind sway quantised to whole texels), `static` quads (grass/moss lips), `flutter`
  (butterflies, 3-frame wing squash), `fall` (petals). Trees, bushes, tufts, flowers, vines,
  butterflies and petals of an arena are all one draw call.
- `terraces(hm, sides, tops)`: stacked blocks with side faces (earth/rock) and continuous top
  faces (turf/moss) in separate materials, plus hanging fringe quads on exposed edges.
- `groundMesh`: one unique painted floor texture over the whole stage (no tiling; the dirt
  clearing, paths, crack networks and the trainer chalk ring `paintChalkRing` are painted in).
- `backdrop` (far painted plane; `haze` wobbles rows for heat shimmer), `paintSky`,
  `paintSilhouette`; `sunRig` (far SpotLight sun with optional `dappleCookie`, hemisphere,
  fill → `SpriteLight`); `glints` (HDR additive dots that bloom: sun, light sources);
  `lightPools`.
- Scrub uses the kit's `boulderColumns` / `rubblePile` / `organicTerraces` for sandstone.
- Composition: the camera looks down ~33–42°, so a far vista only shows *below* the stage's
  back edge line (scrub places its painted horizon at y ≈ −5 on z = −26) and tree canopies must
  hang low (y ≈ 3.5–5 at z ≈ −6) to frame the top of the screen.
- Perf (SwiftShader, idle wild battle): draw calls high 39–51 / low 33–43 for the whole frame;
  `benchFrames` desktop high ≈ 230–450 ms, phone low ≈ 60–100 ms (ratios vs the cave similar;
  the foliage billboards add < 1 ms CPU).
- Gaps: the meadow terraces still read a bit "grass voxel"; canopies are flat billboards (no
  parallax between clumps); portrait framing hides the scrub canyon; the hollow's arch opening
  sits above the frame (the light motif is the shafts + pool glints, not the opening itself);
  no dedicated FX retune per arena.

### Scene adapter: `src/scenes/hd2dBattle.ts`
`hd2dTerrainFor(ctx)` resolves the arena from the registry; `Hd2dBattleStage` builds it, applies
its grade/background/fog/camera tweaks and owns pipeline, baker, hero/trainer figures and the
camera (`frame(w, h)` per layout: elevation, yaw, FOV, how tall a person reads, where the kin
land), `attachKin/detachKin/fitKin`, `trainer(id)`, `trainerPath(entering)`, `throwOrigin()`.
`BattleScene` keeps all flow, UI and FX and only branches on `this.hd2d` in ~10 places.

### Night sets: champion hall + Arena stadium (`arenas/summit.ts`, `arenas/stadium.ts`, `arenas/nightKit.ts`)
- **Crown Plateau hall** (`ARENA` id `summit`, claims route `plateau` → Champion Vale): ashlar
  walls built course by course with arched openings cut exactly per course + marble voussoirs,
  flagstone floor with baked AO, a 96-texel inlaid crest under the battle, marble columns,
  swaying violet banners, a three-step dais with the throne (Vale's post is on the dais top),
  six iron braziers (flipbook fire billboards, flickering warm pools; 2 point lights on high).
  Light motif: one **far, narrow cold spot** (≈ parallel moonlight) shining through the back
  windows — the window/mullion patches on the floor are real wall shadows, no cookie needed —
  plus moonbeam ribbons and motes; snow falls behind the windows in front of a painted pixel
  night sky (moon ×1.25 so it blooms). `summitGrade()`: violet shadows, warm firelit highs.
  Portrait gets a lower camera via the registry `camera` field so Vale clears the foe panel.
  `buildSummitArena({ hall: true })` + `summitPodiums()` stage the **Hall of Fame**
  (`scenes/hd2dHall.ts`, branch in `victory.ts`; framing never tighter than the crest).
- **Arena stadium** (`ARENA` id `stadium`, `mode: 'pvp'`; built directly by `scenes/hd2dArena.ts`):
  turf painted texel-for-texel with markings and trainer boxes, a stepped bowl from a 0.75 grid
  (aisles, seat strips in section colours), **one billboard draw call for ~500–900 pixel
  spectators** (12×16 sprite sheet, 6 looks × idle/clap | arms-up/hop frames; magenta texels
  take each fan's shirt tint; `cheer()` raises the excited fraction), seat-coloured rings at the
  kin spots, bunting boards and flags, four floodlight masts (back-left = shadowed key spot),
  crossing shafts, dusk sky. `Hd2dArenaStage` puts **both players** on the field (near seat
  from the back, far seat behind its kin); `setNear(seat)` = the hotseat perspective swap
  (players change posts, rings recolour). `stadiumPodium()` + winner figure for `arenaVictory`.
- Helpers in `nightKit.ts`: `Pieces` (free-rotated textured boxes merged per material),
  painters (slabs, blocks, marble, crest, banners, flames, sky), `billboards()` (flipbook
  quads, optional idle/excited split), `snowfall()`, `swayMaterial()`, `lightPools()`.
- Calls (whole frame, SwiftShader): champion battle 54–56 high / 47–49 low; Hall of Fame
  with 6 kin 75; stadium battle 52–55 high / 47 low; victory podium 56.
- Gaps: the hall is roofless (stars above the wall tops in the HoF framing); floodlight mast
  heads sit above the battle frame (only their shafts show); crowd sprites are spherical
  billboards (they tilt slightly with the camera); the stadium has no front stand.

## Screens: title, starter, route maps, menu screens, evolution

Every non-battle screen renders through the same pipeline when `?gfx=hd2d` is on, as a small
diorama with the battle sprites; all DOM UI, flows and `data-testid`s are unchanged (each scene
branches on `hd2dRequested()` in a few places; the default path is untouched).

| Screen | Set (`src/render/hd2d/screens/`) | Scene |
|---|---|---|
| Title | `buildTitleSet` — the flower-field arena (`buildMeadowSet(…, 'flowers')`) at golden hour + foreground flora; the camera drifts ±0.55 units in whole texels; three hero kin (Pyrelord, Maelstrode, Verdantusk) as sprites in the lit clearing | `scenes/title.ts` |
| Starter | `buildStarterSet` — the meadow clearing, three cut octagonal stone daises (`octSlab` + loose kit boulders); `placeSpot()` lights the chosen dais: a steep shaft from a canopy gap, motes, a warm floor pool and a pool on the dais top (rebuilt per selection: beams/motes are world-space) | `scenes/starter.ts` |
| Route maps + menu | `buildIslandSet(q, theme, spots, { player })` — one floating island per theme (below) | `scenes/route.ts` |
| Party, box, bestiary, bag, shop | `buildRoomSet` — warm stone room, plinth (`PLINTH_TOP`), window cookie key, shaft + motes, rug, shelf, sconces; turntable in 22.5° steps; vertex-coloured item models are baked sprites too | `scenes/meta.ts` |
| Evolution | `buildRoomSet(q, { dim: true })` — the room at dusk; the white silhouette phase is the sprite's emissive flash | `scenes/evolution.ts` |

**Stage** (`scenes/hd2dScreen.ts`, `Hd2dScreenStage(game, scene, camera, build)`): installs the
pipeline at `detectQuality()`'s tier with the set's grade/background/fog, owns the
`SpriteBaker`, `addKin(view)` / `removeKin` / `addFigure(f)` / `addMesh(mesh)` (same texel
densities as the battle: people 44, kin 28/34/40 texels by stage — `screens/common.ts`),
`framed(focus)` after the scene framed its camera (snaps the view offset to whole internal
pixels, sets fog, sizes buffers, re-aims backdrops), `drift(d)` (camera offset rounded to whole
internal pixels at the focus depth, so a drifting camera slides the focus plane in whole texels),
`update(t)`, `perf()`, `dispose()`. A set builder returns a `ScreenSet`:
`{ group, spriteLight, grade, background, fog, update, setPixelSize, frame?, dispose }`.

**Floating islands** (`screens/island.ts`):
- The top is ONE unique painted texture at **half the battle texel** (`MT = TEXEL / 2`: the map
  shows the whole island, so its texels land at the same ~2 screen px as the sprites), alpha-cut
  to a wobbly polar outline at texel precision. Painters per theme: meadow (mottled grass with
  blade flecks, dirt paths from the player to every spot, flowers, darker lush grass under the
  grass patches), ridge (dark basalt ash, branching cracks, dry grass, a banded lava river with
  slag rims in an emissive mask that blooms, lava-lit ash beside it), coast (sand, wind
  ripples, shells, dune-turf patches, wet sand round the lagoon), summit (flagstones with
  seams, snow drifting in from the rim).
- Under it: `boulderColumns` rim walls just below the top, a hanging cone of rock-kit boulders
  shrinking and darkening downward with a dark core, a tip, and small floating rock clusters.
  Raised turf ledges (`terraces`, meadow/coast) or basalt/stone crags (`boulderColumns` on the
  ledge heightmap, ridge/summit); a grass fringe of static foliage quads hangs over the lip.
- One `Foliage` mesh (atlas: canopies / dead trees / palms / snowy pines per theme, bushes,
  tufts, tall grass, flower clumps, fringe) + bark/wood/stone/glow `VoxelBatch`es. Theme props:
  fence, signpost, log, pond (meadow); vents with steam, embers over the lava, a lavafall down
  the front-left wall (ridge); driftwood, umbrella, rocks (coast); the Champion's stepped dais,
  pillars, crown arch, banners, path stones, snow flurries (summit).
- Hotspots are small groups the scene picks and wiggles: grass clumps (own `Foliage`), a cave
  mound with a dark mouth (ember / sea glow inside on ridge / coast), a lagoon (pixel water at
  map texels + rock ring), trainer posts (stone pad with a red / green inset). Pixel gem markers
  and "!" / ✓ badges are 7–9 texel canvas sprites that bob in whole map texels. Trainers and
  the player are `characters.ts` figures baked like in battle.
- Sky: `skyBackdrop` paints a posterised sky with layered cumulus banks (lit rims, flat bands
  darkening with depth, inner puff outlines on some puffs) onto a plane that exactly covers
  the visible frustum (view offset included) at ~2 internal px per texel; repainted only when
  the frame's shape changes. `cloudBillboards` adds drifting pixel cumulus (one draw call)
  below and behind the island, moving in whole cloud texels.
- Light: `kit/lights.ts` `lightRig` directional key with shadows (per theme: golden afternoon
  meadow, sunset ridge, bright coast, dusk summit; colour overrides `keyColor/sky/ground`), long
  faint sun shafts entering from above the frame, motes; grade from `presetGrade` + per-theme
  tweaks.

**Perf** (whole frame incl. shadow pass, sprite bakes and post; SwiftShader captures):

| Screen | desk high (640×360) calls / tris | phone low (271×586) calls / tris |
|---|---|---|
| Title | 50 / 46k | 41 / 32k |
| Starter (chosen) | 58 / 43k | 49 / 29k |
| Route meadow (and menu) | 56 / 49k | 45 / 21k |
| Route ridge | 56 / 56k | 49 / 24k |
| Party | 30 / 11k | 27 / 9k |
| Evolution | 32 / 10k | — |

Frame cost (`__game.benchFrames(3)`, SwiftShader at load ≈ 9 on 4 cores — compare the
columns, not the absolute values): route map phone-low 111 ms vs the meadow battle phone-low
199 ms; route map desk-high 552 ms vs meadow battle desk-high 768 ms; title phone-low 269 ms,
starter phone-low 249 ms, party phone-low 131 ms. No screen costs more than the battle it leads
into.

Low tier: fewer foliage sprites, fringe quads, cloud billboards, underside rings and floating
rocks, `lite` boulders, quarter-res bloom, frozen shadow map, no point lights, no GTAO.
`e2e/hd2d-screens.spec.ts` checks every screen (perf non-null, internal size = drawing buffer,
calls < 100, not blank, testids, no errors) on desktop and phone.

Gaps: the title's near bank is plain turf under the buttons; the island underside is mostly
hidden by the bottom sheet on phones; trainers' "beaten" state is shown by the badge and pad
only (the sprite is not greyed); bag/shop item sprites use one texel height for every item;
the evolution rays/sparkles are the default renderer's effects (additive, pixel-crisp at the
low internal res, but not pixel-art sprites).

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
- **Arena water** (`arenas/localKit.ts`): `pixelWater({ …, style })` — `'glitter'` (default: value-noise
  sea, chop dashes, dense sun-glitter field; keep it for far sea at a grazing angle: cliff, coast) or
  `'bands'` (near water: 4 flat depth bands from the shore field with slow sine contours, 1-texel
  crescent highlights growing 1→3 texels over an 8-frame life, a solid lace of `lace` units + a
  1-texel shadow rim, one receding dashed foam line per wave, glints only in the sun pool / glitter
  path, 4-step haze, all on an `fps` stepped clock; shallows). Pair `'bands'` with
  `waterline(landMaterials, { y, height, foam })`: it paints the lace's land side on sand / rock /
  posts (unlit foam within `height` above the water, chained onto the bevel shader), so land meshes
  that overhang the coarse shore field can never hide the shoreline. Keep `height` below the land's
  lowest crown above the water (shallows: 0.05 for a crown 0.14 up).
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
### Kit perf (cave arena) and sheets
Draw calls unchanged (high 52 → 53: the brazier glow joins the glow batch; low 45/44).
Triangles: high 23k → 81k (chamfered boulders, shadow pass included), low 15k → 35k
(`lite` pillow boulders). Sprite bake: 2× supersampled on high only (≈ +10% frame on
SwiftShader), 1:1 on low (≈ 0%).

Frame ms (`__game.benchFrames`, min of 6×8 frames, SwiftShader; the machine ran 3 other
agents' browsers at load 7–30 on 4 cores, so ranges are wide — compare the columns, not the
absolute values): baseline 9172436 / HEAD-with-old-sprite / HEAD, same load window.

| Tier · viewport | baseline | HEAD, old sprite.ts | HEAD |
|---|---|---|---|
| low · 393×851 | 95–170 | 200–215 | 210–349 |
| low · 1280×720 | 186–240 | 178–314 | 348–483 |
| high · 1280×720 | 269–519 | 680–1009 | 424–987 |

On HEAD, `?post=voxel,oldprops` (old cube rock + old lodge) was **not** faster on phone-low
(181–204 vs 165–221 ms), so the remaining gap to the baseline is mostly outside the rock/props
(HEAD also carries the other arena/UI/stage changes since the baseline). Needs a quiet
machine or a real phone to settle. Sheets: `kit-cave-before-after.jpg`,
`kit-cave-tiers-viewports.jpg`, `kit-sprites-people.jpg` (each pair: before | after),
`kit-lodge-props.jpg`, `kit-outdoor.jpg`.

Known gaps: rubble heaps are paler/smaller than the reference's grey piles; wall boulders are
still on a cell grid (no 3-wide or diagonal stones); far walls use full chamfers on high (an
LOD by camera distance would cut ~30% of rock triangles); foliage is not wind-occluded or
LOD'd; water is unlit (match `light` by hand) and has no reflections; arenas still carry
local kits (`arenas/localKit.ts`, `outdoorKit.ts`, `nightKit.ts`) that could migrate to `kit/`.
<!-- kit:end -->

## Reference pass 2: rock, outdoor light, sprites, night sets

Additions from the second pass against the reference (all optional fields / new helpers; old
call sites are unchanged).

- **Rock kit** (`kit/rock.ts`, `textures.ts`): `boulder()` bevels are 10–15% of the
  half-extent (a crisp 1-texel lit top edge, not a pillow), with per-corner chamfers, 0–2
  chipped corners, faceted tops, side creases and a baked lit-top-left / dark-bottom-right
  vertex gradient per stone (low tier keeps the cheap 26-triangle top-bevel path).
  `boulderColumns()` stones are 0.6–1.4 cells wide with staggered feet/tops (±0.35 course),
  ~35% split in two, ±20° yaw, ±10% value / ±5% hue each, ~1-texel gaps: rows never line up.
  `rubblePile({ blocky })` builds a voxel-like grey heap; rubble and `pebbles()` default to a
  cool-grey ramp. Textures: boulder faces are a mosaic of mixed chunks (`TintedTile`: per-chunk
  value/hue jitter, lit top edge, dark crevice + mortar line); `paintDirt()` has no cell grid
  (clods, dust, scuffs, branching cracks); `paintPlanks(…, knots)`. `bookcase({ frame: 'paint' })`
  builds a painted metal shelving unit. `lightBeams` specs take a per-beam `fade`.
- **Cave / volcanic / hollow**: cave camera pulled back and up (open floor ≈ 35–40% of the
  frame), tall craggy left wall, two capped windows right of the foe HUD with three diagonal
  shafts onto bright floor pools, a bigger furnished lodge. Volcanic back wall = three rows of
  basalt columns/masses with glowing lava joints and orange lava-facing rims (wall ≤ 40% of the
  frame); fine embers only. Hollow: one key with a leaf-dapple gobo aimed at the kin.
- **Outdoor light** (`arenas/outdoorKit.ts`): every outdoor/sea arena has one strong warm key
  and a weak cool fill. `gobo(key, spec)` paints the key's cookie in WORLD space via
  `cookieGround(key, size)` (the ground point under each cookie texel), so the lit focal pool
  round the kin, leaf dapple (`kind: 'leaves'`) or drifting cloud shadows keep their world size
  at any sun elevation; `update(t)` drifts clouds in whole cookie texels. Sun ≈ 34° in meadow /
  flowers (canopies no longer block the key: the gobo paints their dapple), ≈ 19° golden hour on
  the coast, storm light with one sun break in the shallows, low back-light sunset in the scrub.
- **Phone world edge**: `apron(spec)` = one draw call of the set's own floor texture (same world
  UVs) running far past the near frustum, so portrait phones never see the clear colour or the
  island underside. `?leak=1` clears every arena to magenta for captures; a leak check samples
  the bottom 35% of phone frames (0.000% in all six outdoor/sea arenas).
- **Backdrops**: `paintMesas()` (stepped, strata, lit rims, haze by distance), `paintTreeLine()`
  (textured leaf crowns), the cliff's painted late-afternoon sky (the old sky plane sat beyond the
  90-unit far plane and never rendered; now z = −70), layered headlands, a glitter path on the
  sea; `fogBands()` (`arenas/localKit.ts`, one draw call of layered horizontal haze) replaces mist
  discs; `rockStack()` builds sea stacks as tapering, leaning clumps of rock-kit boulders.
- **Kin sprites** (`sprite.ts` + `KIN_SPRITE` in `scenes/hd2dBattle.ts`): five-tone ramp per
  palette colour lit from the arena key (shadows cooler and more saturated, highlights warmer,
  greys get violet shadows), bright greens capped, near-black silhouette outline with
  darker-local inner edges and a 1-texel key-side rim. New `SpriteOptions`: `emissive` (palette
  colours drawn unlit and over-bright, `emissiveGain`), `glow` (dithered floor light pool),
  `plates` / `facet` / `crease` (faceted stone kin, magma cracks), `contrast` (people stay soft),
  `minValue`. Texel density is unchanged on purpose: the reference measures about the same
  (people ≈ 44–50 texels, kin ≈ 30); the gap was shading.
- **People** (`characters.ts`): 3-tone clothes with fold lines, pockets, belt buckle, a pack
  with bedroll, hair highlights, clean faces; biome-balanced trainer colours.
- **Night sets**: stadium court is hardwood with worn chalk rings, dark tiered stands where only
  the front rows are coloured, an overhead truss with three floodlight cones and pools; victory
  turns them off for one podium spotlight. HoF statues in two rows (desktop) or a 1-2-3 pyramid
  (phone), 1.5–1.7× larger, under a moon shaft; summit dais steps are marble with flush gold
  edges.
- **FX** (`fx.ts`): `impactGlow()` (flame: 300 ms warm ground pool, hot core, scorch, embers) and
  `groundDecal()` (tide: wet patch + spreading ring over ~1.2 s, with a foam crown and droplets).
- Draw calls after the pass (whole frame, SwiftShader): cave 52 desk / 46 phone, volcanic 52 / 49,
  hollow 43 / 39, outdoor/sea 37–65, night sets 45–78 (HoF desktop 78), screens 27–58.

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

After reference pass 2 (most of the original list is addressed: craggy irregular rock,
painted shelving, five-tone hue-shifted sprites, world-space sun gobos, flame/tide FX):
- Cave wall stone faces are a bit busier than the reference's softer, rounder-lit chunks; the
  front-left stair treads are very light against the dark floor edge.
- Volcanic side ledges (still `boulderColumns`) show some cube-like silhouettes; Vulcrag's magma
  cracks read as glowing patches and tone-map to cream under the bright volcanic grade.
- The hollow's leaf gobo mostly reads as one large pool; meadow back terraces still read a bit
  "grass voxel"; scrub mesas have fairly vertical sides; the cliff's front wall stones look like
  grey pillows; backlit stacks in the coast/shallows sit quite dark.
- Cliff on phones: the top ~10% shows the clear colour (sea beyond the 90-unit far plane); the
  clear colour is the horizon haze, so it reads as haze.
- Stadium: the second crowd row is dim colour rather than silhouette; the floodlight cones read
  mostly as shafts at the top of the frame.
- Light patches are fixed except the drifting cloud gobos; portrait shows less of the set.

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

Scenes converted after battles: route maps, title, starter choice, evolution, Hall of Fame,
menu turntables (party/bestiary/bag/box/shop) — see "Screens". Still to do: the Arena lobby
(the Arena victory podium is done).
Also: real-device perf pass and tier auto-detection tuning, Arena battle adoption of the stage
adapter, and moving FX to bloom-aware colours per element.
