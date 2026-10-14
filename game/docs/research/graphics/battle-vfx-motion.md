# Battle VFX, hit feedback and motion: what makes creature battles look professional in motion

Research angle for Orbkin (three r180 + TypeScript, HD-2D pixel diorama, procedural art).
Written 2026-10-14. All experiments are in scratch (`research/vfx/`). The game repo was not modified.

Confidence labels:
- **high**: primary source I read (code, decompilation, tutorial file), or something I measured myself.
- **medium**: one secondary source or practitioner consensus.
- **low**: my own synthesis or an unverified number.

Network note: realtimevfx.com, gdcvault.com, unrealengine.com, crema.gg, godotengine.org,
mathforgameprogrammers.com, x.com and youtube are blocked here. Claims from those sites come from search-engine
summaries and are marked that way. Everything with frame numbers comes from code or files I read or ran.

---

## 0. TL;DR

1. **The biggest problem in Orbkin's battle motion is timing, not rendering.** I measured it on the real game
   (HD-2D, virtual 60 fps clock). The target's hit reaction (HP drain, hit flash, knockback, camera shake, hit
   SFX) starts **1.7–2.1 s after the impact frame**: flame 109 frames, tide 127 frames, spark 104 frames from the
   bolt strike. By then the effect has gone. Shipped battlers start the reaction on the impact frame or within
   2 frames. The cause is a one-line async bug in `movefx.ts`, plus `Promise.all` waiting for the attacker's lunge
   to recover. With a `sync` patch the gap dropped to 16 frames for flame, 3 for tide and 7–8 for
   spark. The remaining frames are the lunge recovery, which `Promise.all` still waits for. **high**
2. **The impact frame is missing.** Every current impact *fades in* (Bayer dissolve over 50 ms, ground light
   smoothstep-rising over 300 ms). Professional pixel FX put the brightest, highest-contrast frame first: a
   1-frame contrast frame, a 1–2-frame white flash, then a sharp blast. After that the effect dissipates: fire
   fades fast, smoke slowly. Sources: saint11 tutorials (CC BY 4.0, read directly) and Pokémon Emerald's 8-frame
   hit splat. In the strips, adding these three hand-ruled frames changed the read more than swapping the renderer (my
   visual judgement). **high** (rules) / **medium** (judgement)
3. **Dissipation by ordered-dither dissolve reads as noise.** The current fades use a 4×4 Bayer screen-door,
   which at 2–3 px texels becomes a visible checkerboard (tide frames +20…+32). The pixel-art rule is "avoid
   noise": dissipate by **shape** (shrink, break into clumps, burn-through holes, smoke that rises) rather than by
   per-texel alpha dither. **high** (saint11 primary; my captures)
4. **Blender headless works as a VFX source; Mantaflow does not.** In the bpy 5.2.2 PyPI module, Mantaflow fails
   (`'LevelsetGrid' object has no attribute 'setConst'`, then abort). A 2020 devtalk report describes the same
   failure. Procedural Cycles volumes (4D noise), Python-driven metaballs and bevelled curves render fine:
   arc 0.3 s, splash 2 s, fire 70–160 s for 10–12 frames at 96–128 px.
   The pipeline is: render → premultiplied BOX downscale → value → ramp index (band edges, small Bayer only at
   edges) → 3×3 mode filter → dark edge band → JSON → existing `FlipBatch` atlas. It produces on-model,
   palette-locked flipbooks. Pure Blender output reads as a "blob". It needs hand-ruled key frames (flash, blast)
   and shape-based dissipation to look authored. **high** (measured)
5. **VFX light: a pre-allocated `PointLight` plus tinting the shared sprite light works and costs no recompiles.**
   In three r180 the program cache key includes `numPointLights` and `numPointLightShadows`. Adding a light
   mid-battle therefore relinks every lit material, so the light must exist from scene start with intensity 0.
   Octopath's team added "a point light with each VFX" so effects cast character shadows. In Orbkin the
   equivalent is cheap: drive `spriteLight.keyColor`/`rim`/`keyDir` from the FX light, which also swings the sprite
   drop shadows away from the effect, and pulse a 0-shadow PointLight on the set. In the cave capture this
   visibly warmed the sprites, the stair rails and a pool around the target (mean ΔL +2.6/255 over the whole
   frame, local peaks +190). The effect is subtler in the already-warm cave than it would be on a dark set. The sprite light is
   shared, though, so distant sprites lit up too. It needs a per-subject distance falloff. **high** (measured), Octopath claim **medium**
6. **The current FX mix texel sizes.** Measured: the sprites draw at 2 internal px per texel
   (`__hd2d.kin[i].px = 2`), while most FX books draw at `texScale` k = 1 (1 px per texel), and stars and crowns
   at 2–3 px. The spark bolt is a smooth 3D ribbon mesh. FX texel = sprite texel is the rule the rest of the
   HD-2D kit already follows. **high**
7. **Budget per effect (proposal, phone-safe):**
   - **Time:** normal move ≤ 1.0 s from launch to the end of dissipation. Impact to reaction ≤ 2 frames.
   - **Draw calls:** ≤ 4 extra (front batch, back batch, points, one glow/decal).
   - **Lights:** one pre-allocated FX light, no runtime shadows.
   - **Flipbooks:** ≤ 12 frames of ≤ 48×48 texels at the sprites' texel size, one ramp of ≤ 6 colours (or flame+smoke ≤ 10),
     ≤ 80 KB RGBA per book.
   - **Particles:** ≤ 120 points.
   - **Screen flash:** ≤ 3 per second, not full-screen white (WCAG 2.3.1).

   See §9 for measured numbers. The current flame impact adds +11 draw calls (45 → 56). **medium**

---

## 1. Baseline: what Orbkin does today

### 1.1 Code read (files in `game/src/render` and `game/src/scenes`)
- `scenes/battle.ts` `case 'move'` runs the following sequence:
  1. `say("X used Y!", 250)`.
  2. `me.lunge()` starts.
  3. `wait(140)`.
  4. `await Promise.all([lunge, moveFx(...), dodge])`.

  The **damage** event is a separate later event. It runs `target.hit()` (emissive white, 9 Hz blink for 70% of
  320/420 ms, spring knockback), `tweenHp` (≈ 680 ms drain) and, only for crit or super-effective, `burst()` plus
  `shake(0.1|0.16)`. Hit-stop exists only for crits: a 70 ms frozen squash in `CreatureView.hit`.
- `creature.ts lunge()` tween sequence:

  | Phase | Duration |
  |---|---|
  | Anticipation squash and lean back | 150 ms |
  | Strike | 110 ms |
  | Hold | 70 ms |
  | Return | 230 ms |
  | Settle | 170 ms |
  | **Total** | **730 ms** |

  The shape is good: anticipation, fast strike, overshoot.
- `battle.ts shake()` on HD-2D shakes in whole internal pixels via `camera.setViewOffset`. The amplitude is
  `round(amount·28)` = 3–4 px, about 24 Hz sin/cos, decaying linearly over 260 ms. Only crits and super-effective
  hits shake.
- `movefx.ts` HD-2D path (`flamePx`, `tidePx`, `sparkPx`, …) plays a flipbook projectile on an arc (340–380 ms),
  then the impact. The impact layers are:
  - the impact star (`pixelStar`, a 32² book at `scale k*2`) behind the target;
  - rings of flipbooks in an "open arc";
  - pixel points;
  - an additive dithered ground and wall glow (`impactGlow`);
  - a floor decal.

  No runtime lights are used (by design: "adding a light recompiles every program").
- `hd2d/fx.ts`: 17 procedural flipbooks of 6–8 frames, painted from 4–5-colour ramps, 12 fps by default (call
  sites use 10–18). The quads are pixel-snapped. Fade-in and fade-out are a Bayer dissolve. `scale` is "whole
  internal px per texel": flame ring tongues use `k`, while the crown tongues, star, geyser and froth use `2k`
  or `3k`.
  `texScale(c)` = round(target screen height / 52) clamped 1..2, so it is usually 1. The sprite px is a separate
  shared value. **Measured:** in the cave battle `__hd2d.kin[i].px = 2` for both kin (the attacker is 30 texels
  tall, the Mossling 17), while `texScale` gives k = 1. So the ring flames, splash crowns, sparks, embers and
  drops draw at **1 internal px per texel (half the sprite texel)**, and the crown, star, geyser and froth at
  2–3 px. **These are mixels.** **high**

### 1.2 The timing bug (verified)
`pixelMoveFx` does `tail = await flamePx(c); void tail;`. The intent is that the effect "resolves at the moment
of impact (+ a beat); the effect's tail keeps fading in the background". But `flamePx` is `async` and ends with
`return tail` (a Promise), and an async function's promise **adopts** a returned promise. So `await flamePx()`
waits for the whole tail. Node proof:

```js
async function fx(){ const tail=(async()=>{await sleep(900);})(); await sleep(260); return tail; }
async function dispatch(){ let tail; tail = await fx(); void tail; }
// dispatch resolved after 901 ms (comment claims ~260 ms)
```

The same pattern is in all 12 `return tail` sites, in both the default and the HD-2D renderer, and in `sparkPx`
(`return finish(...)`).

**Fix** (tested in the scratch copy as `?sync=1`): return nothing and leave the tail running, for example
`void tail; return;` after a ≤ 2-frame beat. Also stop gating the damage event on the attacker's lunge recovery.
One option is to `await` only the lunge's strike promise and let the 230 ms return and 170 ms settle overlap the
reaction.

### 1.3 Measured timelines (real game, HD-2D, desktop high, virtual clock 16.667 ms/frame, seed 13)

Tool: `research/vfx/scripts/timeline.mjs` (a Playwright virtual frame clock adapted from the refine harness). It
logs scene objects added/removed, battle text, the foe HP bar width and the camera view offset every frame, and
takes screenshots every 2–3 frames.

| Element (move) | Text → launch | Launch → impact | Impact → reaction (HP drain + shake + flash + SFX) | HP drain | Total, text to idle |
|---|---|---|---|---|---|
| Flame (Pyre Crash, cave) | 64 f (1.07 s) | 21 f (350 ms) | **109 f (1.82 s)** | 41 f (683 ms) | ≈ 4.3 s incl. "critical hit" |
| Tide (Breaker Crush, coast) | 73 f (1.22 s) | 39 f (650 ms) | **127 f (2.12 s)** | ≈ 20 f+ | ≈ 4.3 s |
| Spark (Storm Lance, cave) | 66 f charge, 73 f bolt | bolt lands ≈ 78 f, burst 96 f | **81 f from burst (1.35 s), ≈ 100 f from the strike** | 41 f | ≈ 3.6 s |
| Flame with `sync=1` (scratch copy) | 64 f | 21 f | **16 f (267 ms)**, gated by the lunge recovery | 41 f | ≈ 3.2 s |

Camera shake: 12 frames (≈ 200 ms) of 2–5 px view-offset jitter, starting with the HP drain.
Files: `research/vfx/out/tl-*/events.txt`, `timeline.json`, `frames/`.

### 1.4 Visual critique of the current frames (strips in `research/vfx/out/`)
- **Flame** (`tl-flame-impact.jpg`, `ab-flame.jpg` row A): the impact frame (+1f) is almost empty, just a
  dithered fade-in. The tall pale flame tongues peak around +7…+15f, and the ground glow peaks about 300 ms after
  impact. Climax and impact are misaligned. The flames are mostly pale yellow-white with thin dark outlines, so
  they lack a value structure (dark → mid → hot core). They dissolve into a checkerboard. The target does not
  react at all for 1.8 s.
- **Tide** (`a-tide.jpg`): a wall of identical splash flipbooks around the target, which is a repetition tell,
  at 2× texel scale. From +20 to +32f they become a **large-scale Bayer checkerboard** (screen-door), the most
  "procedural-looking" frame in the set.
- **Spark** (`a-spark.jpg`): the bolt is a smooth 3D box-ribbon mesh with gradient bands, not pixel art, so its
  style clashes with the pixel world. It is a wide, flat zigzag that stays on screen for about 380 ms *before*
  the impact. Then a yellow screen-space glow and small white jolts. There is no contrast frame and no blank-frame
  flicker. The burst is weak compared with the bolt.

---

## 2. Verifiable sources used

| Source | What it gives | Licence / access | Confidence |
|---|---|---|---|
| **pret/pokeemerald** decompilation (raw.githubusercontent): `data/battle_anim_scripts.s`, `src/battle_anim_*.c`, `src/battle_controller_*.c`, `data/battle_scripts_1.s` | Frame-exact move animation scripts (`delay N` = N frames at 59.73 fps), hit-splat hold, target shake, BG darken, hit blink, battle-script ordering | Decompilation of Nintendo/Game Freak code. Use only for **facts and timings**; never copy code or assets | high |
| **smogon/pokemon-showdown-client** `battle-animations.ts`, `battle-animations-moves.ts` | Millisecond timings of a web battler: contact attack, defender knockback, BG darkening for electric moves | **AGPLv3**: read for facts only, do not copy code | high |
| **saint11/Saint11Tutorials** (Pedro Medeiros), GIFs `Impact`, `Explosion`, `Electric`, `Fire`, `Water`, `Smoke` | Pixel-art VFX anatomy, frame rules, timing (80–110 ms per frame) | **CC BY 4.0** (README); can be quoted with attribution | high |
| Bevy example `examples/camera/2d_screen_shake.rs` (implements Eiserloh GDC 2016) | Trauma shake constants: decay 0.5/s, exponent 2, max 20 px, max 10°, noise speed 20, trauma per hit 0.4 | MIT/Apache | high (code), talk slides via search summary |
| Squirrel Eiserloh, *Juicing Your Cameras With Math*, GDC 2016 (slides PDF blocked) | trauma ∈ [0,1], shake = trauma² or trauma³, linear decay, smoothed noise | search summary | medium |
| Riot *League of Legends VFX Style Guide* (2017) (realtimevfx thread blocked; PDF re-uploads only) | Primary vs secondary elements, value/colour/shape/timing, anticipation → climax → dissipation | summaries (VFX Apprentice, Deck.gallery, polycount) | medium/high |
| Sakurai, Famitsu column vol. 490 "Thinking about hitstop" (Source Gaming translation) | Both fighters freeze. About 4 frames of blend between flinch and hurt poses during hitstop. The attacker creeps at a near-invisible speed | search summary of the translation | medium |
| Unreal Engine spotlight on Octopath Traveler (blocked) | First-pass combat VFX "didn't look good enough", so they added a point light with each VFX, casting character shadows on the environment | search summaries (two independent) | medium |
| Octopath II developer interview (blocked) | Battle-effect camera rotates up to about 90°, events up to 180° | search summary | medium |
| Fan overview (sullla.com) | Octopath skill effects are *not* pixel art; they are conventional particle/bloom effects | single secondary | medium-low |
| Crema "Meet the team: VFX department" (blocked) and GDC 2023 "Creating Narrative VFX in Temtem" | "Lightning/electricity benefit from fast and snappy timing". Timing and staging are covered in the talk (not read) | search summary | low-medium |
| Sea of Stars press kit | Custom render pipeline for dynamic lighting. Particle-based dynamic lights (Astrolabe feature) | search summary | medium |
| Cassette Beasts, Coromon | No frame-level breakdowns found. Reviews call Cassette Beasts' battle animations "long and repetitive" | — | low |
| WCAG 2.3.1 (W3C Understanding) | ≤ 3 flashes in any 1 s, or below the general/red flash thresholds (area ≤ 25% of a 10° field) | W3C | high |
| Xbox Accessibility Guideline 117 | Camera shake should be adjustable | search summary | medium |
| three r180 source (`node_modules/three`) | `WebGLPrograms` keys on `numPointLights` / `numPointLightShadows`; `PointLightShadow` renders 6 cube viewports | MIT, read locally | high |
| three.quarks 0.17.1 (MIT, peer three ≥ 0.182; **0.16.0** supports ≥ 0.165), three-nebula 13.3.0 (MIT, three ≥ 0.122), wawa-vfx 1.2.10 (MIT, R3F + React 19 + leva + zustand) | Off-the-shelf particle systems | npm registry | high |
| Kenney Particle Pack 1.1 and Smoke Particles (CC0) | 80 greyscale particle shapes (512²), 9 cartoon explosion puffs, flash puffs, smoke. Smooth, not pixel art | CC0. Downloaded from kenney.nl; the zip also contains a `.unitypackage`, which I did not extract | high |
| grapefrukt/juicy-breakout (Jonasson & Purho 2012) | Hit-freeze is implemented as a time-scale lerp (fade in, hold, fade out), not a hard stop | open source | high (code) |

---

## 3. Timing evidence from shipped battlers (frame-counted where possible)

### 3.1 Pokémon Emerald (GBA, 59.73 fps), from the pret decompilation. **high**

| Thing | Code | Frames (≈ ms) |
|---|---|---|
| Tackle: attacker lunge | `gHorizontalLungeSpriteTemplate 4,4` = 4 px/frame for 4 frames, then reverse | 4 f out (67 ms) + 4 f back |
| Tackle: impact | `delay 6` then **hit splat and target shake on the same frame** | impact at f6 (100 ms) |
| Hit splat (impact star) | `sAffineAnim_HitSplat_*`: one static 32×32 star, held, then destroyed | **8 f (133 ms)** |
| Target shake | `AnimTask_ShakeMon target, 3, 0, 6, 1`: x toggles 3 px ↔ 0 every 2 frames, 6 toggles | 12 f (200 ms), 3 px on a 240 px screen (1.25%) |
| Body Slam: heavier shake | `AnimTask_ShakeMonInPlace target, 4, 0, 12, 1` | 4 px, about 24 f |
| Fire flipbook (Ember flare) | `sAnim_BasicFire`: 5 cels × 4 frames, loop | **15 fps** (333 ms loop) |
| Electric flipbook | 5 cels × 5 frames (one held 8) | **≈ 12 fps** |
| Electricity effect | a new spark sprite every **2 frames**, each 5 frames of life | flicker at 30 Hz |
| Thunder Shock / Thunderbolt | `BlendBattleAnimPal F_PAL_BG … 0→6 black` (**darken the background to 6/16**) before the bolt; target palette 0→13→0 black (a dark pulse on the target); BG restored at the end | BG dim ≈ 37% |
| Mega Punch | BG palette blend to **full black** (16/16) | — |
| Thunder | BG fades to a special thunder BG, darkens to black, then `invert_screen_color` (a whole-screen inversion flash), lightning sprites 1 frame apart | — |
| Battle-script order | `attackanimation` → `waitanimation` → `effectivenesssound` → `hitanimation` (target **blinks**: visibility toggles every 4 frames for **32 frames**, 533 ms) → HP bar | the blink comes after the animation ends (≈ 12–20 f after impact for Tackle) |

Takeaways:
- The *immediate* reaction (splat + shake) sits on the impact frame **inside** the move animation.
- The blink and HP drain follow 0.2–0.35 s later, not 1.8 s later.
- Flipbooks run at **12–15 fps** ("on fours/fives").
- Electric moves dim the background so the bolt pops (value contrast).

### 3.2 Pokémon Showdown web client (ms, AGPL, facts only). **high**
- `contactattack`:
  - attacker: 400 ms ballistic leap to above the target, 100 ms slam, 500 ms ballistic return;
  - defender: `delay(450)`, then a 100 ms 'swing' knockback of 20 units behind, then 300 ms back.
  - The defender's reaction is timed to the slam (400 + 50 ms).
- `thunderbolt`: `backgroundEffect('#000000', 600, 0.2)` (20% black BG dim for 600 ms). Three lightning sprites
  drop in 200 ms each, staggered 200 ms, with yscale 0 → 1.
- `thundercage`: white BG flash 300 ms at 0.7, then black BG 1000 ms at 0.7 (100 ms delay). The defender shakes
  ±5 units every 75–100 ms.
- `hitmark`: a hit-marker sprite at scale 0.5, opacity 1 → 0.5 over 250 ms.

### 3.3 saint11 pixel-art VFX rules (CC BY 4.0, frames read from the GIFs). **high**
- **Explosions (part 1)**, 20 frames at 80 ms. Layers: FLASH, BLAST, FIRE, SMOKE.
  - Frame 1 "contrast flash" (a dark disc), so that "other frames feel brighter".
  - Frame 2 "white flash", optionally with shrapnel or light lines.
  - Frame 3 "sharp blast": sharp angles, *avoid noise*.
  - Frames 4+ "fade: fire fades quickly, smoke fades slowly".
  - "Needs at least 4 frames." "Explosion fire are like bubbles; centre brighter and hotter." "Add flying bits
    after the explosion."
- **Impact**, 80 ms frames. Exaggeration comes from motion blur, smoke particles, shrapnel/debris and things
  affected by gravity. The anatomy is idle → anticipation → motion → overshoot → rest.
  - "Make the target bounce and react properly; shake camera and target."
  - "Cut out frames between rest and target position for a faster, stronger movement."
  - "Freeze time: pause one frame *before* the impact; do not pause too long; only for very exaggerated impacts."
- **Electricity**:
  - "Electric animations must be FAST."
  - "Animate in alternated frames adding BLANK frames."
  - "Mix arcs, bolts and smoke." "Always make stuff flicker." Contrast frame.
  - Bolt sequence: first shock with sharp angles → white/bright *different shape* → wait one (blank) frame →
    fade the lightning from the first frame → wait one frame → dissipate fast.
  - "Sparks can be resolved in only 3 frames." "Avoid too many particles."
- **Fire**:
  - Start new waves every 2–3 frames.
  - Flame speed is higher in the middle. The wave top fades to a pointy shape.
  - The bright colours come from the bottom.
  - Embers flick and move slightly. A base plus detaching particles.
- **Water**:
  - Two layers: a top layer of circles changing size (never move anything more than 1 px), and a bottom layer
    offset at constant speed.
  - Foam animates as a particle system, like smoke.
  - Bubbles move horizontally at random and fade or rise.

### 3.4 Hit-stop and shake (game feel)
- Sakurai: "hitstop" is a *visual* freeze on both attacker and defender. It is distinct from "hitstun", which is
  a gameplay state. About 4 frames of the hitstop are spent blending from the flinch pose into the hurt pose.
  During it the attacker keeps creeping at a near-imperceptible speed (a "hidden flavour"). He recommends
  hitstop on killing blows. **medium** (translation via search summaries)
- Fighting-game frame data lists hitstop per move: for example an SF6 target combo with 13 hitstop frames. There
  is no universal light/medium/heavy table. The informal 2–4 frames for light and 6–10 for heavy comes from
  non-primary guides. **low-medium**
- Juicy Breakout implements the freeze as a time-scale envelope (`FREEZE_FADE_IN_MS` → `SPEED_MULTIPLIER` →
  `FADE_OUT_MS`). **high** (code)
- Trauma shake (Eiserloh via Bevy):
  - `trauma += 0.4` per hit, clamped to 1;
  - `shake = trauma²`;
  - offset = `maxOffset·shake·noise(t·20 + seed)` with smooth Perlin noise;
  - trauma decays 0.5/s.

  For pixel art: **integer pixel offsets only, no rotation** (Orbkin already snaps). **high**
- Vlambeer "Art of screenshake": about 30 tweaks. One write-up recalls about a 0.2 s pause on enemy hits. That
  number is from a blog recollection. **low**

### 3.5 HD-2D and modern pixel battlers
- Octopath Traveler: a point light per VFX, so effects throw character shadows onto the 3D set. Skill effects
  are conventional (non-pixel) particle/bloom effects. Octopath II's battle-effect camera rotates up to about
  90°, and the dynamic battle camera sways and pans/zooms toward enemies. **medium**
- Sea of Stars: a custom pipeline for dynamic 2D lighting, with particles that emit light. **medium**
- Temtem (Crema): per-type VFX reels (ArtStation) and a GDC 2023 talk on timing and staging. "Lightning is fast
  and snappy." **low-medium**
- Cassette Beasts and Coromon: no verifiable frame breakdowns found. The only data is a critique that long
  battle animations become repetitive. **low**

---

## 4. Recommended timing tables for Orbkin (60 fps frames)

### 4.1 Attack beat sheet (normal-power move, one target)

| Beat | Frames | ms | What happens | Source / reason |
|---|---|---|---|---|
| Text "X used Y!" | 18–30 | 300–500 | Text box; the move name is the anticipation of the *turn* | Orbkin currently spends 64–73 f before anything moves: trim to ≤ 30 |
| Anticipation (attacker) | 8–10 | 133–167 | Squash, lean back, charge glint or spark at the attacker; optional BG dim starts | lunge 150 ms ✓; Emerald 4–6 f for Tackle; saint11 "anticipation makes the motion feel stronger" |
| Release / travel | 6–20 | 100–333 | Projectile on an arc with a trail, **or** contact lunge cut short ("cut out frames") | Emerald Tackle 4 f; Showdown leap 400 ms; Orbkin 340–380 ms ✓ |
| *(optional)* pre-impact freeze | 1–2 | 17–33 | Freeze one frame *before* contact, only on strong moves or crits | saint11 |
| **Impact frame** | 1 | 17 | Contrast frame (dark disc / BG at its darkest) | saint11 explosions |
| Flash | 1–2 | 17–33 | White flash shape over the target, FX light at peak, sprite light tinted, hit SFX **on this frame** | saint11; Octopath light |
| Hit-stop (both kin frozen) | 3 (normal), 5–6 (super-effective), 8–10 (crit or KO) | 50 / 83–100 / 133–167 | Everything frozen except the flash/blast frames | Sakurai; game-feel guides (low-medium) |
| Reaction start | 0–2 after impact | ≤ 33 | Target knockback (spring), hit blink, shake (trauma + 0.3 / 0.5 / 0.8) | Emerald splat+shake on the same frame; Showdown defender delay = slam time |
| Blast → body | 6–10 | 100–167 | Sharp blast, then the fire/water body at full size | saint11 frame 3 |
| Dissipation | 12–24 | 200–400 | Fire fades fast (shape breaks, holes), smoke/foam/droplets fade slowly, embers fall | saint11; Riot "short, don't linger" |
| HP drain | 24–40 | 400–667 | Starts with or right after the reaction | Orbkin 683 ms (OK) |
| Attacker recovery | 14–24 | 230–400 | Overlaps the reaction: **must not delay it** | fixes the 16 f residual gap |
| Total (launch → settle) | ≤ 60 | ≤ 1000 | | Cassette Beasts criticism: long animations get repetitive |

Flipbook frame rates: **12–15 fps** for bodies (fire, water, smoke), **15–20 fps** for flash and blast, and
electric "on twos" with blank frames (15 fps with 2 blank frames). Emerald fire runs at 15 fps and electric at
12 fps. saint11 frames are 80–110 ms (9–12.5 fps).

### 4.2 Hit-feedback by severity (all start on the impact frame)

| Severity | Hit-stop | Shake (internal px, trauma) | Target flash | Knockback | FX light peak | BG dim |
|---|---|---|---|---|---|---|
| Not very effective | 0–2 f | 0–1 px (0.15) | 1 white frame, then 2 blinks | 0.14 u | ×0.6 | none |
| Normal | 3 f | 2 px (0.3), 8–12 f | 2 white frames + 3 blinks (Emerald blinks every 4 f) | 0.22 u | ×1 | none |
| Super effective | 5–6 f | 3 px (0.5), 12 f | 3 white frames + 4 blinks | 0.3 u | ×1.4 | 15–20% for the move's duration |
| Critical | 8 f + 1 pre-impact freeze | 4 px (0.8), 16 f | 3 white frames, inverted frame optional | 0.35 u | ×1.6 | 20% |
| KO blow | 10–12 f (Sakurai: hitstop on killing blows) | 4–5 px, 20 f | hold white 4 f | launch | ×1.8 | 30%, then fade |

(Low-medium: these synthesise the sources above. Tune in-game with the timeline tool.)

### 4.3 Element identity (shape, motion, value, light)

| Element | Shape language | Motion and timing | Palette ramp (Orbkin FX_RAMPS) | FX light | Signature frames |
|---|---|---|---|---|---|
| Flame | Teardrops, licks with pointy tops, bubbles; hot core at the bottom/centre | Rises; new waves every 2–3 frames; fast fade, slow smoke | `flame` 5 + `smoke` 4 | warm `#ffb050`, flicker ±15% at 8–12 Hz | contrast disc → white disc → 6-ray blast → fireball → burn-through holes → rising smoke |
| Tide | Arcs, crowns, columns, round droplets; foam clusters | Up then gravity; crown spreads outward; ripples on the floor | `water` + `foam` | cool `#d8f2ff`, brief (≤ 200 ms) | white crest flash → column + crown → droplets → foam ring, wet decal |
| Spark | Zigzags with sharp angles, branching; no curves | **Fast**; on twos; blank frames; ≤ 0.5 s | `spark` (white core, yellow, orange edge) | yellow `#fff27a`, on/off with the blank frames | BG dim 20–35% → bolt (first shock) → brighter new shape → blank → fade → blank → sparks (3 f) |
| Terra | Chunky polygons, shards, dust puffs | Heavy: fall on gravity, ground shake, slower settle | `rock` + `dust` | none, or a dust-tinted bounce | camera dip / vertical shake, spikes erupting, debris arcs |
| Flora | Leaves (tumbling), vines (growing), petals | Swirl, curve paths, gentle | `leaf` | soft green, low | spiral in, sprout, petal burst |
| Gale | Crescent slashes, spirals, speed lines | Fast sweeps, smears, arcs | `wind` | none | smear crescent, funnel, dust lift |

---

## 5. VFX authoring recipe (free tools only)

### 5.1 Pipeline that worked here
1. **Block the timing first** with the beat sheet above, and verify it on the real game with
   `scripts/timeline.mjs` (frame-exact strips). Add art detail only after the timing reads. (GDC 2023 VFX
   roundtable notes, via search summary: "block in simulations early", "review timing on frame renders, adding
   or removing frames".)
2. **Generate the organic body in Blender headless** (bpy 5.2.2 from PyPI, Cycles CPU, transparent film,
   orthographic camera, 96–128 px). Scripts: `research/vfx/scripts/blender_fx.py`.
   - *Fire / explosion*: a cube with a volume shader.
     - Inputs: 4D Noise (scale 4.2, detail 4, W = 2.5·t); radial falloff 1 − |p − c(t)|/R(t), with
       R(t) = 0.18 + 0.72·(1 − (1 − 1.6t)³); burn-out D(t) = ((t − 0.25)/0.75)^1.2·1.45.
     - Shading: heat = falloff + 1.6·noise − 0.8 − D → ColorRamp (black, ember red, orange, yellow, cream) →
       Emission (strength 60·heat) plus a little Absorption.
     - Cost: about 7 s per frame at 128 px / 8 spp, and 16 s per frame at 96 px / 6 spp under shared load.
   - *Splash*: Python-driven metaballs per frame (no sim needed):
     - a column: stacked balls, height 1.9·sin(πt/0.75)^0.8;
     - a crown ring: 20×4 balls flaring out and up;
     - 34 ballistic droplets (G = 9) with 3-ball tails;
     - a base pool.

     Principled BSDF under a sun lamp. Cost: 2 s for 12 frames.
   - *Electric arc*: midpoint-displaced polylines (depth 5, roughness 0.42) re-seeded every 2 frames, plus 1–3
     branches.
     - Render as bevelled curves: core 0.028 white emission, glow 0.075 yellow emission behind.
     - Blank frames at f2 and f5, and every other frame after 60%.
     - Cycles **1 spp** is enough for pure emission: 0.3 s for 12 frames.
   - *Mantaflow does not work in the bpy module* (abort above). Do not plan on it. Alternatives: procedural
     volumes, as above; a numpy 2D stable-fluids solver (Stam), easy to write, not done here; or render
     Mantaflow on the owner's desktop Blender (GUI build).
3. **Pixelise and palette-lock** (`scripts/pixelize.py`):
   1. Premultiplied BOX downscale to the target texel size (fire 40×40, splash 40×32, arc 32×48).
   2. value = luminance / (99th percentile over the whole sequence), optionally with gamma 1.25.
   3. Alpha threshold 0.18–0.4.
   4. Ramp index by band edges, with a small Bayer offset only near the edges (dither 0–0.15). Use edges like
      0.3/0.6/0.92 to separate glow from core.
   5. Optional morphological closing (merges droplets one texel apart).
   6. 3×3 **mode filter** (kills interior speckle; the "avoid noise" rule).
   7. Despeckle lone texels.
   8. **Dark edge band** (index 1) on outer texels unless the texel is at the hot index.
   9. Output: `sheet.json` {w, h, frames, ramp, idx[]} plus PNGs.
4. **Author the key frames by rule, not by sim** (`scripts/impact_book.py`):
   - contrast disc (r 6.5, index 1);
   - white disc (r 9.5 with a 1-texel hot rim) plus 4 light lines;
   - a 6-ray sharp blast (radius 5 + 10·tri^1.6, three bands, edge band);
   - a broken blast (inner hole 6.5).

   Then **compose** (`scripts/compose_fire.py`): f0 contrast, f1 white, f2 blast over body, f3 broken blast over
   body, f4–11 body with rim cooling (−1 shade outside r = 16 − 10t), burn-through holes from 14 Voronoi cells
   (radius 1 + 7t^1.3, so holes are round clumps rather than noise), and smoke (smoke ramp) that replaces the
   burnt cells and rises 1 texel per frame. Combined ramp: 0 clear + 5 flame + 4 smoke = 10 entries.
5. **Integrate** into the existing `FlipBatch` atlas. Books are just `PixelTile`s: one ramp per tile, any ramp
   length. I raised the atlas width from 256 to 512 because 40 px × 12 frames = 480. Play at 15 fps (body) or
   20 fps (flash). Use **scale = the sprites' shared px**, so FX texels equal kin texels: one density, no
   mixels. Split layers by render order: flash frames **in front** of the target (renderOrder 8); blast, body
   and smoke behind it (5).
6. **Light**: one pre-allocated FX light per stage (see §7). Drive it with the same curve as the flipbook: peak
   on the flash frame, then decay with flicker.
7. **Verify** with frame strips at game resolution (A/B/C rows), not stills. Check the impact → reaction gap in
   `events.txt`.

### 5.2 Other free sources
- **Kenney Particle Pack and Smoke Particles (CC0)** (allowed host kenney.nl). Greyscale 512² shapes (sparks,
  slashes, twirls, stars, scorch, flare, smoke) and 9 painterly explosion puffs.
  - Useful as *shape sources* to pixelise, run through the same `pixelize.py`, or as smooth additive glow layers
    if Orbkin chooses HD effects.
  - Not usable as pixel art as-is.
  - Record them in `game/ASSETS.md` if used.
  - The particle-pack zip contains a `.unitypackage`: extract only the `PNG (Transparent)/` folder and
    `License.txt`.
- saint11 tutorials (CC BY 4.0) are a *rulebook*, not assets.
- Poly Haven and ambientCG are not relevant to VFX bodies. An HDRI is not needed for emission-only renders.

---

## 6. Hands-on results (scratch, `research/vfx/out/`)

| Test | Result | File |
|---|---|---|
| Mantaflow fire bake in bpy 5.2.2 | **fails** (`LevelsetGrid … setConst`, then `Manta::Error` abort) at res 32 and 48, with and without `-I` | `out/fire.log`, `out/fire2.log` |
| Procedural volume fireball, 12 f @128 px / 8 spp | 71 s (≈ 6 s/f); v2 10 f @96 px / 6 spp: 164 s under shared load | `out/b_fire`, `out/b2_fire` |
| Metaball splash, 12 f @128 px | 1.2–2.0 s | `out/b_splash`, `out/b2_splash` |
| Curve electric arc, 12 f @128 px, 1 spp | 0.3–0.4 s | `out/b_arc`, `out/b2_arc` |
| Pixelised v1 (luminance only) | Fire = uniform blob with speckle; splash = disconnected speckle; arc OK | `out/px_v1.png` |
| Pixelised v2 + mode filter + closing + hand-ruled frames | Fire reads as a pixel explosion (contrast → flash → blast → fireball → holes → smoke); arc crisp with a white core, orange edge and blank frames; splash reads as column + crown but still speckles late | `out/px_v2.png`, `out/px3_fire/strip_x4.png`, `out/px3_splash/strip_x4.png` |
| In-game A/B/C, flame, cave | A (now) vs B (+ FX light) vs C (Blender book + hand-ruled frames + FX light + sync). C has the clearest impact frame (dark → white over the target), a readable explosion and a reaction 16 f after impact. Problems in C: the body is mostly hidden *behind* the target (kin ≈ 30 texels, book 40), so it needs a front layer or 1.5× size; dark smoke reads as a black hole on the bright cave floor (needs a warmer, lighter smoke ramp per arena). B: sprites and the stair-rails light up warmly (mean ΔL +2.6), but the shared sprite light lights the far hero too. | `out/ab-flame.jpg`, `out/ab-flame-wide.jpg`, `out/diff_AB_f96.png` |
| HD (smooth) vs pixel-locked fire, offline composite | The smooth additive fire looks richer and blends with the light shafts (the Octopath approach). The pixel-locked one matches the sprites but reads flatter. This is a style decision for the judge/owner gate. | `out/hd-vs-pixel-composite.jpg` |

### 6.1 Tide and spark, A (now) vs C (Blender book + FX light + sync)

| Element | Impact → reaction, A | Impact → reaction, C | What C shows | Strip |
|---|---|---|---|---|
| Flame | 109 f | 16 f (gated by the lunge recovery) | see above | `ab-flame*.jpg` |
| Tide | 127 f | **3 f** | The target flashes white on +2f under a cool white light pool. One authored crown book replaces the ring of identical splashes, so there is no repetition and no Bayer screen-door. It is **smaller** than A's wall, though: the splash book needs to be 1.5× and partly in front. | `ac-tide.jpg` |
| Spark | 81 f from the burst | **7–8 f** from the burst (lunge-gated) | The pixel arc is on-style (1-texel lines at sprite px, blank frames) but **thin and low-contrast on the bright cave**. It needs the set dim (15–35%, as in Emerald and Showdown), a 2-texel core near the strike, and ≤ 8 frames: my 12-frame book at 15 fps lingers 800 ms, against "dissipate fast". The 3D ribbon in A is bolder but off-style. | `ac-spark.jpg` |

Lesson: the authored-book swap fixes style consistency (no mixels, no repetition, no smooth 3D ribbon). The
largest perceived gain comes from **sync + impact frames + the target's white flash on the impact frame**.
Size and value contrast must then be re-tuned per element: bigger splash, dimmed set for electric, lighter smoke
on bright sets.

---

## 7. three.js r180 implementation notes for Orbkin

- **No runtime light creation.** `WebGLPrograms.getProgramCacheKey` includes `numPointLights` and
  `numPointLightShadows`, so a new light relinks every lit material (a hitch on phones). Create one `PointLight`
  per stage in the constructor with `intensity = 0` and animate only intensity, colour and position. Tested in
  `hd2dBattle.ts` (scratch copy) behind `?fxlight=1`.
- **Shadows from the FX light**: `PointLightShadow` renders 6 cube faces of all casters per frame. The sprites
  already draw their own screen-space drop shadow (`uSkew`/`uDrop` from `SpriteLight.keyDir`). Lerping `keyDir`
  toward the FX light swings every sprite's drop shadow away from the effect, which is the "VFX light casts
  character shadows" look at zero extra passes. Add a per-subject strength (distance falloff) because the light
  is shared today. A real cube shadow is high tier only, if ever.
- **Light the sprites**: the toon bake reads `SpriteLight.keyColor/rim/keyDir`. Add `fxColor·k·0.35` to the key
  and lerp the rim to the FX colour (60%·k). The sprites re-bake every frame while acting, otherwise at 10 fps:
  fine, and it reads hand-animated.
- **Hit-stop**: freeze both kin and the FX for N frames by setting `animClock.speed = 0` for the scene's battle
  tweens. Exempt the flash/blast books and the light (Sakurai: the freeze is visual). Better, use a time-scale
  envelope (Juicy Breakout).
- **Screen flash / BG dim**: use a uniform in the grade pass (exposure or "dim BG"), not a full-screen white
  quad. Dim the *set* 15–35% during electric and strong moves (Emerald/Showdown) while the FX and sprites stay
  bright. Keep white full-screen flashes ≤ 3 per second and below about 25% screen area (WCAG 2.3.1). Add a
  "reduce flashing" option.
- **Shake**: keep integer internal-pixel view offsets. Switch to a trauma model (`trauma += 0.3/0.5/0.8`;
  offset = round(maxPx · trauma² · noise)) so overlapping hits stack sensibly. Expose a shake slider (Xbox AG 117).
- **Order of events** (`battle.ts`): on the impact frame (FX callback) fire `onImpact`, which starts the hit
  reaction, the hit SFX, the shake, the FX light peak and the HP-bar ghost. The engine event stream is
  unchanged (rendering only *plays back* events). Today the scene waits for the whole FX tail **and** the
  attacker's return before playing the `damage` event.
- **Libraries**: three.quarks (MIT) is the best maintained. Use **0.16.0** for r180, because 0.17.x requires
  three ≥ 0.182. It depends on `quarks.core` with a `*` range, so pin it. It offers Shuriken-like modules and
  batch rendering, but its billboards are not pixel-snapped and its looks are smooth particles. three-nebula
  (MIT) is older. wawa-vfx needs React/R3F/leva/zustand (no). **Recommendation: no new dependency.** Orbkin's
  `FlipBatch` + `PixelPoints` already batch by material and snap to the pixel grid. Borrow quarks' concepts
  (colour/size over life, frame over life, emission bursts) as small functions instead.

---

## 8. Do / Don't rules (for a `battle-vfx` skill or section)

**Do**
1. Put the **brightest, highest-contrast frame at impact**: a 1-frame contrast frame → a 1–2-frame white flash →
   a sharp blast. Never fade in an impact.
2. Start the **target reaction, hit SFX, shake and FX-light peak on the impact frame** (≤ 2 frames late). Measure
   it with the timeline tool. Gate nothing on the attacker's recovery.
3. Use **hit-stop by severity** (3 / 6 / 8–10 frames), freezing both kin and leaving the flash alive.
4. Play bodies at 12–15 fps and flashes at 15–20 fps. Electric goes "on twos" with blank frames.
5. **Dissipate by shape**: fire shrinks and breaks into clumps and burn-through holes; smoke rises and fades
   slowly; droplets fall; foam spreads.
6. Use **one texel density**: FX scale = the sprites' px. Never mix 1-px and 2-px FX texels in one effect.
7. Use **one ramp per material**, dark edge band, hot core, bright colours at the base (fire); value structure
   dark → mid → hot.
8. Give each effect **a light**: a pre-allocated FX point light plus a sprite-light tint, plus sprite drop shadows
   that swing away from it. Light curve = FX curve.
9. **Dim the set** (not the FX) 15–35% for electric, strong and crit moves; restore during dissipation.
10. **Element identity by shape and motion first, colour second** (table §4.3).
11. Scale "visual weight = gameplay weight": tier the size, hit-stop, shake and light by power and effectiveness.
12. Generate organic bodies in Blender headless (procedural volumes, metaballs, curves). Pixelise with a mode
    filter. **Hand-rule the key frames.** Compose.
13. Review **frame strips at game resolution** (A/B rows, impact ± 40 frames), never single stills.
14. Respect accessibility: ≤ 3 flashes/s, no full-screen white, shake and flash toggles.

**Don't**
1. Don't `return tail` from an async FX function you `await` (the async promise adopts it). Return at impact.
2. Don't fade or dither-dissolve impacts or dissipation (Bayer screen-door = noise).
3. Don't tile one flipbook around the target (repetition tell). Vary scale, frame offset and flip, or use one
   big authored book.
4. Don't mix smooth 3D ribbons (the current spark bolt) into a pixel world unless HD effects are a deliberate
   style decision for all elements.
5. Don't add or remove `THREE.Light`s mid-battle (program relink). Don't turn on point-light shadows on the low
   tier.
6. Don't let FX linger: normal moves ≤ 1 s, signature ≤ 1.6 s (Riot: subdued, short outros; repetition fatigue in
   long battle animations).
7. Don't hide the target: the primary FX body should frame it (open toward the camera, front layer only for the
   flash). Smoke must not be darker than the darkest set value near the target.
8. Don't plan on Mantaflow in the bpy module. Don't download and run Blender binaries without owner approval.
9. Don't copy decompiled Pokémon code or assets, or Showdown's AGPL code. Use their **timings** as facts.

---

## 9. Budget per effect (proposal + measurements)

### 9.1 Measured (flame, cave, desktop high, 640×360 internal; `scripts/bench.mjs`)

| Variant | Draw calls idle | Draw calls at impact + 8 f | Δ calls | benchFrames(10) ms idle / impact |
|---|---|---|---|---|
| A now | 45 | 56 | **+11** | 1070 / 965 |
| B + FX light | 45 | 56 | +11 | 813 / 1108 |
| C Blender book + light + sync (old pieces still created) | 45 | 58 | +13 | 737 / 634 |

The ms column is **noise**: SwiftShader on a shared 4-core box with other sessions' Blender renders running
(load average 18). The same idle scene ranged 737–1070 ms. Only draw calls are trustworthy. The current flame
impact adds 11 calls: star, fire batch, rise points, scorch decal, 2× warm glow (floor + wall), 2× core glow,
trail and embers, smoke. Budget target: ≤ 4–6 by merging glow and decal into one mesh and the flipbooks into
one batch per blend mode. Phone-real numbers need a device run (the open "practical blockers" angle).

| Item | Normal move | Strong / signature | Notes |
|---|---|---|---|
| Duration, launch → settle | ≤ 60 f (1.0 s) | ≤ 96 f (1.6 s) | |
| Impact → reaction | ≤ 2 f | ≤ 2 f (+ hit-stop) | |
| Extra draw calls at the peak | ≤ 4 | ≤ 6 | front batch, back batch, points, glow/decal (+ points, + 2nd batch) |
| Flipbook frames | ≤ 12 | ≤ 16 | 15 fps |
| Frame size (texels) | ≤ 40×40 | ≤ 64×64 | kin ≈ 30 texels tall |
| Atlas memory | ≤ 80 KB RGBA per book (≈ 20 KB if stored as indices) | ≤ 200 KB | xfire 40×40×12 = 77 KB RGBA; a 512×128 atlas = 256 KB total |
| Colours | 1 ramp ≤ 6 (+ transparent) | flame + smoke ≤ 10 | |
| Points (droplets/embers) | ≤ 60 | ≤ 120 | one `THREE.Points` per blend mode |
| Runtime lights | the pre-allocated FX light only | same | no shadows on low; high: none recommended |
| Overdraw at internal res | ≤ 1× the target's screen bbox × 3 | ≤ 0.25 of the screen | pixel FX at 640×360 are cheap |
| Full-screen flashes | 0 | ≤ 1 per move (≤ 3/s) | WCAG 2.3.1 |

---

## 10. Implications for Orbkin (prioritised)

1. **Fix the timing bug** (`render/movefx.ts`, all `return tail` / `return finish` sites, both renderers):
   resolve at impact plus ≤ 2 frames. In `scenes/battle.ts` `case 'move'`, don't wait for the lunge's
   return/settle before the `damage` playback (await only the strike). Expected: impact → reaction 109–127 f →
   ≤ 2 f. Highest impact for the least code. **high**
2. **Add an impact-frame book** (contrast, white, sharp blast, broken blast; `xflash`-style) per element tint,
   drawn **over** the target for 2 frames. Make every impact start with it instead of a fade-in. Replace dither
   fades with shape dissipation. **high**
3. **Introduce `onImpact` hit feedback**: hit-stop by severity, shake for *every* hit (scaled), flash frames on
   the target, FX light peak, hit SFX, all on the impact frame. **high**
4. **One FX light per stage**: pre-allocated; tint the sprite light; swing the drop shadows. Add a per-subject
   falloff in `SpriteBaker` (small change: per-subject `fxK` uniform). **medium-high**
5. **Unify FX texel density** with the sprites' shared px (remove `k*2` / `k*3` mixes). Author books at kin
   scale (≈ 40 texels). **high**
6. **Replace the 3D ribbon spark bolt** with a pixelised Blender arc book (core/glow/edge, blank frames) and a
   15–35% set dim. **high** (the current mesh is the clearest style break)
7. **Tide**: replace the ring of identical splash books with one authored crown book (Blender metaballs) plus
   foam ring points. Stop the large-scale Bayer dissolve. **medium**
8. **Trim dead time**: 64–73 frames pass before anything moves after "X used Y!". Target ≤ 30. **medium**
9. **Make the style decision explicitly**: pixel-locked FX bodies (current direction, Sea of Stars-like) vs HD
   smooth particles over pixel sprites (Octopath-like). Run both through the judge gate with frame strips. My
   lean is pixel bodies + HD light (glow, bloom, point light, ground pools). **low-medium**
10. **Add the timeline tool** (`scripts/timeline.mjs`) to the repo's tooling or the refine harness as an "fx-timing"
    shot, with an automated check `impact→reaction ≤ 2 frames`. This turns motion into an enforceable gate,
    and the judge-calibration note asked for a frame-strip protocol. **high**

---

## 11. Open questions
- Exact hit-stop and shake numbers need an in-game tuning pass on a real phone (SwiftShader timing is not
  representative).
- HD vs pixel FX style: needs the calibrated judge or the owner's taste.
- Does a per-subject FX light term in the sprite bake cost a measurable amount on low-tier phones? Likely
  negligible: one uniform and a dot product.
- The Cassette Beasts, Coromon, Temtem and Sea of Stars timing claims are unverified (talks and blogs blocked).
  The GDC 2023 Temtem talk is the best lead when YouTube or GDC Vault is reachable.
- Mantaflow on the owner's desktop Blender (GUI build) would give better fire and smoke bodies. The scripts
  here would need only `bake_all`.

---

## 12. Reproduction (all under `research/vfx/`)
- Blender: `../../bpyenv/bin/python -I scripts/blender_fx.py fire|splash|arc out/<dir> <size> <frames> <spp>`
- Pixelise: `python3 -I scripts/pixelize.py IN OUT W H RAMP [--thr --dither --edges --mode 1 --close 1 --band --keep --crop --grounded]`
- Key frames: `python3 -I scripts/impact_book.py out/px_flash flame`; compose: `python3 -I scripts/compose_fire.py out/px_flash out/px2_fire out/px3_fire`
- Game copy: `game/` (a tar copy of the repo's `game/`, node_modules symlinked). Patches:
  - `src/render/hd2d/fx.ts`: ext books, atlas width 512;
  - `src/render/movefx.ts`: `?vfx=blender`, `?fxlight=1`, `?sync=1`;
  - `src/scenes/hd2dBattle.ts`: FX point light and sprite-light tint.

  Build: `./node_modules/.bin/vite build --outDir ../build-x`.
- Timeline: `node scripts/timeline.mjs --base http://127.0.0.1:PORT --out out/X --move pyre-crash --arena cave --route ridge --hotspot vent-cave --foe mossling --lead pyrelord --every 2 [--shotn 70] [--qs "vfx=blender&fxlight=1&sync=1"]`
- Strips: `python3 -I scripts/abstrip.py OUT.jpg x0,y0,x1,y1 impactFrame f1,f2,... "label=dir" ...`
- Bench: `node scripts/bench.mjs --base ... --move ... [--qs ...]` (idle vs impact `benchFrames(10)`, sprite px)


---

## 13. Links (sources cited)

Primary / code:
- pokeemerald decompilation: https://github.com/pret/pokeemerald (files: `data/battle_anim_scripts.s`, `src/battle_anim_mon_movement.c`, `src/battle_anim_normal.c`, `src/battle_anim_fire.c`, `src/battle_anim_electric.c`, `src/battle_controller_player.c`, `data/battle_scripts_1.s`)
- Pokémon Showdown client (AGPLv3): https://github.com/smogon/pokemon-showdown-client (`play.pokemonshowdown.com/src/battle-animations.ts`, `battle-animations-moves.ts`)
- saint11 tutorials (CC BY 4.0): https://github.com/saint11/Saint11Tutorials (`Impact1x.gif`, `Explosion1x.gif`, `Electric.gif`, `Fire1x.gif`, `Water1x.gif`); https://lospec.com/pixel-art-tutorials/explosions-part-1-by-pedro-medeiros ; https://www.patreon.com/saint11/posts/impact-23417521
- Bevy trauma shake example: https://github.com/bevyengine/bevy/blob/main/examples/camera/2d_screen_shake.rs
- Juicy Breakout: https://github.com/grapefrukt/juicy-breakout
- three.quarks: https://github.com/Alchemist0823/three.quarks (MIT) · three-nebula: https://www.npmjs.com/package/three-nebula · wawa-vfx: https://github.com/wass08/wawa-vfx
- three r180 source: `node_modules/three/src/renderers/webgl/WebGLPrograms.js` (numPointLights, numPointLightShadows), `src/lights/PointLightShadow.js`
- Kenney CC0: https://kenney.nl/assets/particle-pack , https://kenney.nl/assets/smoke-particles
- WCAG 2.3.1: https://www.w3.org/WAI/WCAG22/Understanding/three-flashes-or-below-threshold.html

Secondary (search summaries; pages blocked from this container):
- Riot LoL VFX Style Guide: https://realtimevfx.com/t/official-league-of-legends-vfx-style-guide/3392 ; https://www.vfxapprentice.com/blog/10-league-of-legends-vfx-design-tips ; https://www.deck.gallery/league-of-legends-2017/slide/32-importance-timing-vfx-the/
- GDC 2023 VFX roundtable notes: https://realtimevfx.com/t/gdc-2023-vfx-roundtable-discussion-notes/23367 ; https://blog.beyond-fx.com/articles/gdc-vfx-roundtable-notes-2023
- Eiserloh GDC 2016 slides: http://www.mathforgameprogrammers.com/gdc2016/GDC2016_Eiserloh_Squirrel_JuicingYourCameras.pdf ; https://archive.org/details/GDC2016Eiserloh
- Sakurai on hitstop (Source Gaming translation): https://sourcegaming.info/2015/11/11/thoughts-on-hitstop-sakurais-famitsu-column-vol-490-1/
- Vlambeer "Art of screenshake": https://www.youtube.com/watch?v=AJdEqssNZ-U ; experiments: https://www.bluetengu.com/2014/12/12/art-of-screenshake-experiments/
- Octopath VFX point light: https://www.unrealengine.com/en-US/spotlights/octopath-traveler-s-hd-2d-art-style-and-story-make-for-a-jrpg-dream-come-true ; OT2 camera: https://www.unrealengine.com/en-US/developer-interviews/octopath-traveler-ii-builds-a-bigger-bolder-world-in-its-stunning-hd-2d-style
- Octopath effects not pixel art (fan overview): https://sullla.com/Octopath/overview.html
- Sea of Stars press kit: https://sabotagestudio.com/presskits/sea-of-stars/ ; https://astrolabe.aidanmoher.com/astrolabe-feature-sea-of-stars-is/
- Temtem: https://gdcvault.com/play/1029413/Visual-Effects-Summit-Creating-Narrative ; https://crema.gg/crema/meet-the-team-vfx-department/ ; https://www.artstation.com/artwork/aRlx68
- Cassette Beasts: https://godotengine.org/article/godot-showcase-cassette-beasts/ ; https://novov.me/blog/posts/cassettebeastsreview
- Mantaflow in bpy module failure: https://devtalk.blender.org/t/python-module-bpy-mantaflow-issues-after-successful-build/15460
- Xbox Accessibility Guideline 117: https://devdocs.xbox.com/gaming/accessibility/xbox-accessibility-guidelines/117
- Hitstop / smear frame informal guides (low): https://gamineai.com/blog/pixel-art-combat-fx-hitstop-smear-frames-impact-timing-2026 ; https://www.slynyrd.com/blog/2018/9/8/pixelblog-9-melee-attacks
