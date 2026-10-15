# FX API: what exists in `game/src/render/{movefx,hd2d/fx}.ts` and the contracts to add

Contents: 1 call chain · 2 the pixel FX kit (FlipBatch, PixelPoints, impactGlow, groundDecal, ramps,
render orders, warm-up) · 3 the async adoption trap and the `onImpact` contract · 4 hit feedback
hooks (hit-stop, kick shake, flash, set dim) · 5 the pre-allocated FX light and the sprite-light
tint · 6 external books (JSON → atlas) · 7 marking frames for the timeline · 8 what must not change

Verified against the repo on three r180 / TypeScript 5.9 (read the files when you edit them; this
is a map, not a copy).

## 1. Call chain

- `scenes/battle.ts` `play(e)` → `case 'move'`: `say("X used Y!", 250)` → `audio.move(type)` → for
  attacks: `lunge = me.lunge(spot)`, `wait(140)`, then
  `await Promise.all([lunge, moveFx(scene, type, from, to, { power, camera, miss }), dodge])`.
  The engine's `damage` event is a **separate later event**: `audio.sfx(...)`, `burst()` + `shake()`
  only for crit/super-effective, then `await Promise.all([target.hit(strong, crit), tweenHp(...)])`,
  then the effectiveness text. `shake(amount)` (HD-2D) = `hd.shake(sin(k·40)·a, cos(k·33)·a·0.6)`
  over 260 ms with `a0 = round(amount·28)` px: the 24 Hz buzz.
- `render/movefx.ts` `moveFx()` builds `Ctx` (`scene, from, to, ground, centre, h, P, tier, camera`;
  `P` = 0.8/1/1.3 by power ×0.7 on HD-2D × `screenFit`), seeds `fxSeed`, and on `hd2dRequested()`
  runs `pixelMoveFx` → `flamePx | tidePx | floraPx | sparkPx | terraPx | galePx | neutralPx`
  (`whiffPx` on a miss). Helpers: `texScale(c)` (whole px per texel, **1 on most screens: wrong,
  use the sprite's px**), `openArc(c, n, offset)` (ring angles minus the camera-facing ones),
  `behind(c, p, d)`, `ringPos`, `reach(c) = c.h · c.P / 0.7`, `pixelStar`, `pixelFly`, `finish(...)`.
- `sparkPx` today: a `spark` book charge at the attacker (110 ms) → **two `fxMesh` 3D box-ribbon
  bolts** (`cached('bolt-…')`, additive + normal, `faceY`) flickering for 380 ms → `pixelStar`,
  24 `spark` jolts in 3 rings, grit points, one `impactGlow` for 420 ms → `return finish(jolts,
  grit, crack)`. Replace the ribbons with the arc book; keep the charge and grit if they fit the budget.

## 2. The pixel FX kit (`render/hd2d/fx.ts`)

- `FX_RAMPS`: `flame`(5) `water`(5) `leaf`(5) `spark`(4) `rock`(4) `dust`(4) `smoke`(4) `foam`(4)
  `wind`(3) `star`(3), index 0 transparent. `BOOKS: Record<BookId, { w, h, frames, paint }>`,
  `paintBook(id)`, `atlasLayout()` (shelf-packs frames side by side into a **256-wide** atlas;
  12 frames × 32 px = 384 px: raise `W` to 512 when you add a 12-frame book), `atlasPixels()`,
  `getAtlas()` (one `DataTexture`, nearest, sRGB, persistent).
- `new FlipBatch(scene, capacity, blend = 'normal', renderOrder = add ? 8 : 5)`: one mesh, one draw
  call, camera-facing quads **snapped to the internal pixel grid** in the vertex shader.
  `add(id, at, opts)` → sprite index; opts: `vel, gravity, drag, fps (12), loop, frame0, life
  (default one play-through), fadeIn, fadeOut (Bayer dissolve: do not use), scale (whole px per
  texel, rounded ≥ 1), anchor 'centre'|'bottom', tint, glow (1.5 lifts bright entries ~2.25× into HDR
  so they bloom), flip, delay`. `place(i, p)`, `step(dt)`, `alive()`, `run(maxMs)` (steps until
  empty, then disposes), `dispose()` (returns the material to the pool). Frames hold (floor), no
  interpolation. Pass `step(dt)` from an `animate(ms, (k, dt) => …)` loop (`render/particles.ts`;
  `dt` comes from the tween clock, so `animClock.speed` scales it).
- `new PixelPoints(scene, capacity, blend = 'add', renderOrder = add ? 8 : 6)`: 1–2 **internal px**
  pixel-snapped squares (half a sprite texel at px 2); `emit(p, v, { color, size: 1|2, life, gravity,
  drag, glow })`, `step`, `run`, `place`. Sparks with 2-texel heads and trails are book frames
  (`bolt_book.py` f5–f7), not points; points are grit.
- `impactGlow(scene, ground, color, radius, camera?)` → `{ set(k), dispose() }`: an additive
  **dithered** floor disc + wall quad at renderOrder 4 (lights the set, not the sprites). It is a
  Bayer gradient at 1 internal px: `dither_scan` counts it as checkerboard. Prefer the real FX
  light (§5); if you keep a pool, make it ≤ 2 flat bands.
- `groundDecal(scene, ground, color, radius, { ring? })` → `{ set(k), radius(r), dispose() }`:
  normal-blend floor decal (scorch, wet ring), renderOrder 4.
- Render-order contract: 4 glow/decal · 5 normal FX **behind** the target · 6 normal points ·
  **7 the sprites** (alpha-tested) · ≥ 8 additive FX and the flash **in front**. The pipeline draws
  everything in one scene pass, so an opaque book at 8 covers the sprite: flash frames are
  short and additive, bodies go to 5.
- `warmPixelFx(gl, scene, camera)` pre-compiles the batch/points/glow/decal programs on the
  scene's first frames; it compiles against the scene's **current lights**, which is why the FX
  light must exist before the first frame (§5). Materials are pooled (`markPersistent`); never
  create a `THREE.Material` per effect.
- Determinism: `fxSeed(n)` seeds `rnd()`; the timeline harness freezes the clock, so repeat runs
  are pixel-identical as long as you do not read `Date.now`/`Math.random`.

## 3. The async adoption trap and the `onImpact` contract

Every element function ends `await wait(240..280); return tail;` where `tail` is the dissipation
promise, and `pixelMoveFx` does `tail = await flamePx(c); void tail;`. An `async` function's promise
**adopts a returned promise**, so the caller waits for the whole tail (measured: the hit reaction
starts 103–127 f after the strike). Node proof: `async fx(){ const tail=(async()=>{await sleep(900)})();
await sleep(260); return tail }` resolves after 901 ms. The same shape sits in all 12 `return tail`
sites of both renderers and in `sparkPx` (`return finish(...)`).

Contract to implement (rendering only plays back engine events; nothing in `src/engine` changes):

```ts
// movefx.ts
export interface MoveFxOptions { …; onImpact?: () => void }            // fired ON the impact frame
async function sparkPx(c: Ctx) {
  …travel…
  c.onImpact?.();                                   // impact book frame 0 is added in this same frame
  (window as any).__fxEvents?.push({ ev: 'impact' }); // optional: lets fx_timeline mark the frame exactly
  const tail = (async () => { …impact book, light curve, grit, dissipation… })();
  void tail;                                        // never `return tail`
}
// moveFx() resolves when the element function returns, i.e. at impact (+ ≤ 2 f), not after the tail.
```

```ts
// battle.ts case 'move'  (play(e, next): `next` is the engine's following event; today it is used
// to detect a miss, and it also tells you the severity before `damage` plays:
// next.t === 'damage' && (next.crit ? 'critical' : next.mult > 1 ? 'super' : next.mult < 1 ? 'weak' : 'normal'))
const impact = new Promise<void>((r) => { onImpact = r; });
const lunge = me?.lunge(spot);
await wait(140);
const fx = moveFx(scene, type, from, to, { power, camera, miss, severity, onImpact });
if (miss) await Promise.all([lunge, fx, dodge]);          // a whiff plays out whole, as today
else { void lunge; await Promise.race([impact, fx]); }     // hit: return at impact, `damage` plays next frame
```

`damage` then runs `hit()`, `tweenHp` and the shake within 1–2 frames of the impact frame. The
lunge's return/settle overlaps the reaction (never awaited on a hit). Do not shorten `say()`.

## 4. Hit feedback hooks (`render/creature.ts`, `scenes/battle.ts`, `scenes/hd2dBattle.ts`)

- `CreatureView.hit(strong, crit)`: sets `material.emissive` white (1.0 strong / 0.85 normal), a
  spring knockback lean on `body.quaternion` + squash + `inner.position` kick, blinks via
  `blinkOff` (the sprite baker hides the sprite) for 70 % of 320/420 ms, `acting++`; crit only: a
  70 ms frozen squash first. Make the hold a parameter: `hit(strong, crit, { holdFrames, whiteFrames,
  blinks, knockback })` = `tween((holdFrames + 0.5) * 1000 / 60, () => {})` with the pose frozen and
  the flash on, then the knockback. `hit()` starts from the `damage` event's microtask after that
  frame's tweens have already stepped, so the hold's first step lands a frame later and `N + 0.5`
  frames measure as exactly N (`N − 0.5` read N − 1 in the pilot; shift the white-frame and blink
  indices the same way). Never `frames · 16.7`: it overshoots 1000/60. `fx_timeline` reports the
  hold as the number of frames the target stays bit-identical from the flash frame on. For the same
  reason impact → flash/reaction reads **1 f, never 0**, when the reaction is started from
  `onImpact` (the harness samples before microtasks run): 1 is the floor, do not chase 0.
- **Hit-stop that freezes the idle too**: `CreatureView.update(t)` keeps breathing during the hold
  because `animClock.time` advances unscaled; the hold is inside `hit()` (`acting > 0` suppresses
  idle), so the target is bit-identical for exactly N frames: that is what `fx_timeline` counts.
  The attacker is held by not awaiting its lunge return/settle until the hold ends (or by a
  `holdFrames` on `lunge()`); a global `animClock.speed = 0` would also freeze the flash book, so
  do not use it for hit-stop.
- **Directional kick** (`BattleScene.shake`): replace the sin/cos with
  `dx = round(a0 · dir.x · decay(k))`, one overshoot (`decay = (1 − k) · cos(k · π · 1.5)` or a 2-key
  table), `a0` from the severity table in internal px, 8–16 f; `hd.shake(dx, dy)` already snaps to
  whole internal pixels. Call it for **every** hit, scaled, not only crits.
- **Set dim**: scale the arena lights the stage owns (`rig.key.intensity` and the hemisphere/fill
  found by `rig.group.traverse(o => o.isLight && !o.userData.fx)`) by `1 − dim` for the move and
  restore during dissipation. Sprites keep their own `spriteLight` and FX are unlit, so only the set
  dims (Emerald/Showdown). The lit cave is dominated by **emissive** set pieces (lava falls, lit
  ledges, window shafts, light pools) that no light drives: dim them too, by traversing
  `rig.group` materials once at scene start and remembering `emissiveIntensity` / unlit `color` /
  `uniforms.uAmt`-style strengths, then scaling them by `1 − dim` with the lights (a `dimSet(k)`
  on the stage). `flash_scan.py` measures the dim the player sees: the cave's shafts, motes and
  light pools are `ShaderMaterial`s with `uIntensity`/`uColor`/`uAmt`/`uGain` uniforms, the lava is
  `MeshBasicMaterial` colour, lanterns are Lambert `emissiveIntensity`. In the quarry cave the
  achieved set dim is ≈ 0.37× the nominal light dim (22 % nominal → 8 % achieved): the severity
  table's 15–35 % is the nominal figure, `flash_scan` wants ≥ 10 % achieved on electric and strong
  hits, so nominal 30–35 % is the working range there. Ramp the dim in over 4 f before the strike
  and release it over 8 f. Do not touch `grade.exposure` (it dims the FX and sprites too).
- Flash cadence: `blinkOff` toggles are tick-aligned at the sprite bake rate while `acting`
  (`live()` → re-bake every frame), so 4-frame blinks land; keep ≤ 3 flashes per second.

## 5. The pre-allocated FX light and the sprite-light tint

- three r180's program cache key includes `numPointLights`/`numPointLightShadows`: adding a light
  mid-battle relinks every lit material (a hitch, and `fx_budget` fails "programs unchanged").
  Create **one** `THREE.PointLight(color, 0, distance ≈ 6, decay 1.5)` in the
  `Hd2dBattleStage` constructor with `userData.fx = true`, `castShadow = false`, add it to the scene,
  and animate only `intensity`, `color`, `position`. Verify: `fx_timeline` reports point lights
  constant across frames and programs idle == peak.
- Curve = the flipbook curve, offset from the disc: ≤ 0.4× peak while the white disc is on
  (impact+1/+2), peak on the blast frame (impact+3/+4, severity × the element's peak), then decay
  with the element's flicker (spark: on/off with the blank frames). Intensity units are physical
  (the cave lantern uses 18 at distance 8): distance 3–4, decay 1.5, 16–24 at the peak at the
  target's centre + 0.3 units toward the camera; 38 at distance 6 lit a 350-px pool and, with the
  disc, a 3.9× halo (`flash_scan` halo metric).
- Sprites do not see scene lights; they see `rig.spriteLight` (`keyDir, keyColor, sky, ground, rim,
  spriteGain`) through `SpriteBaker`. Tint hook: each frame while the light is lit,
  `keyColor = base + fxColor · k · 0.35`, `rim = lerp(baseRim, fxColor, 0.6 · k)`, and
  `keyDir = lerp(baseDir, dirToLight, 0.5 · k)` so the sprite drop shadows swing away from the
  effect. Per-subject falloff: `k_subject = k · clamp(1 − dist(subject, light) / distance, 0, 1)`;
  the light is shared by every subject, so either accept the shared tint scaled for the **target**
  only, or add a per-subject gain uniform in `sprite.ts` (one float, cheap). Restore the base values
  on dissipation (clone them once at scene start).

## 6. External books (JSON from `book_from_renders.py`)

```ts
import sparkArc from './books/spark-arc.json';   // { id, w, h, frames, ramp, idx: number[][] }
const ext = (b: typeof sparkArc): BookSpec => ({ w: b.w, h: b.h, frames: b.frames, paint: (f) => {
  const t = new PixelTile(b.w, b.h, b.ramp as unknown as Ramp); t.idx.set(b.idx[f]!); return t; } });
// BOOKS: add `'spark-arc': ext(sparkArc)`, extend BookId, raise atlasLayout W to 512 if a row overflows.
```

`PixelTile` is `{ w, h, ramp, idx: Int8Array }` (`render/hd2d/textures.ts`). Vite imports JSON as
a module; keep books under `src/render/hd2d/books/`. Play with `scale = targetSprite.rect.px`
(the `SpriteSubject` from `Hd2dBattleStage.sprites().foe`; expose it on the stage or pass it in
`MoveFxOptions`), `fps 15`, `loop: false`, no `fadeIn/fadeOut`. Blank frames are empty frames in the
book, not `fade`.

## 7. Marking frames for the timeline

`window.__fxEvents` exists only under the harness (it is created by its init script), so guard it:
`(window as unknown as { __fxEvents?: { ev: string }[] }).__fxEvents?.push({ ev: 'impact' })`.
The harness also reads `window.__hd2d` (the stage), `stage.views[1].material.emissive`,
`CreatureView.acting/busy/blinkOff`, `stage.baseOffset` + `camera.view` for the shake, the foe HP
fill width, and classifies FX objects by `userData.fx`: keep `userData.fx = true` on every FX
object you add (the kit does it; a hand-made `THREE.PointLight` or mesh must set it).

## 8. What must not change

- `src/engine/*` (pure rules, ESLint-enforced), the event stream, damage/accuracy/PP, `say()`
  pacing and the 67-frame text beat (report it; trimming is the owner's call).
- Draw-call and material rules in `game/CLAUDE.md`: pooled persistent materials, < 100 calls.
- The default (non-HD-2D) renderer path unless the task names it.
