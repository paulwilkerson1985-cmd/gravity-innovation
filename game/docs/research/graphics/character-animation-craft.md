# Creature and people animation craft at sprite scale

Angle: idle, attack, faint, walk and stepped playback for Orbkin's HD-2D sprites · 2026-10-14 · Opus 5.5 subagent

**Question.** What makes a creature's own motion read as professional at 28–40 texels tall? Covered here: idle loops,
breathing and blinks, attack beats per body type, faint and entry, people walking and turning, and whether smooth 60 fps
tweening on a pixel sprite looks wrong next to the 8–15 fps stepped motion of hand-made sprites. The angle also sets up
how motion gets judged, because nobody had judged motion before.

**Method.**
- Frame-counted data from primary sources:
  - pret/pokeemerald decompilation: 415 front-pic animation tables, the procedural sprite animations, faint, overworld
    walk and turn.
  - Cassette Beasts sprite-animation data: 146 monsters and 22 characters, extracted by a fan site from the game files.
  - saint11's CC BY 4.0 tutorial GIFs: cel holds measured per cel.
  - Kenney *Cube Pets* glTF clips (CC0): clip lengths and amplitudes parsed from the GLB.
- Interviews and talks: Dead Cells, Octopath, DOGWALK, Guilty Gear Xrd.
- Hands-on in a scratch copy of the game (`scratchpad/anim/game`, HEAD `3af2728`):
  - added motion canaries, a key-table lunge per archetype and stepped playback to the real HD-2D sprite bake;
  - captured frame strips under a virtual 60 fps clock;
  - built a deterministic "motion lint" from the engine log;
  - ran blind pairwise Opus judges on frame strips, canaries first.

Confidence labels:
- **high**: primary source or measured here with controls.
- **medium**: reputable secondary source, or measured with small n.
- **low**: inference or a starting value.

Scratch layout (all under `scratchpad/anim/`):
- `game/`: patched copy; `build/`: its build, served on :4471.
- `scripts/`: `motioncap.mjs`, `make_strips.py`, `motionlint.py`, `judge_motion.py`, `holds.py`, `glbclips.py`,
  `gifsheet.py`, `idlestats.py`.
- `cap/<species>/<variant>/`: frames and `meta.json` with the per-frame engine log.
- `strips/`: judge strips; `judge/`: votes as JSONL with reasons; `dl/`: downloaded sources.

---

## 0. TL;DR

The TL;DR is in §9, together with the Implications for Orbkin.

---

## 1. What Orbkin does today (read from code, measured in the scratch build)

`src/render/creature.ts` (`CreatureView`), `src/render/hd2d/sprite.ts` (`SpriteBaker`), `src/scenes/hd2dBattle.ts`,
`src/render/hd2d/characters.ts` (`Figure`), `src/render/creatures/material.ts` (vertex-shader rig).

| Aspect | Today | Notes |
|---|---|---|
| Idle styles | `trot`, `bounce`, `float`, `glide`, `sway`, `heavy` (per design); sine-driven bob, breathing `sin(2.1 t)` (3.0 s period), pitch and roll | HD-2D multiplies the idle by `idleGain = 1.8` "so a few hundredths of a unit move a whole texel" |
| Idle amplitude (cindertail, measured) | mesh bob 0–0.063 units; scaleY 0.972–1.059; pitch ±0.027 rad | at 34 texels: bob ≈ 2 texels, squash ±1.4 texels. Readable but small |
| Idle playback | **Already stepped**: the sprite re-bakes at **10 fps (8 on low)** with the rig clock quantised; between ticks the image is held | measured: a new cel every 6 frames at 60 fps, 3 bakes per tick (2 kin + hero) |
| Acting playback (lunge, hit, faint, appear, dodge) | **Smooth**: `live: () => view.animating` re-bakes *every frame* | measured: 1.3–1.7 bakes/frame during a lunge (attacker + reacting target) |
| Lunge | crouch 150 ms → strike 110 ms → impact squash 70 ms → hop back 230 ms → landing spring 170 ms = **730 ms (44 f)**; reach 0.95 units; squash 0.78 → 1.28 | motion lint: anticipation 9 f, depth 0.084, strike 5 f, impact frame 16, squash rings 3. The beats are right |
| Hit | white flash, recoil spring 320/420 ms, hit-stop 70 ms only on crits, blink-hide on alternate 1/9ths | battle-vfx-motion covers the timing problem around it |
| Faint | hurt hop 170 → topple 200 → fall 360 → flatten 260 = **990 ms** | Emerald: ~16–19 f (§2.1). Showdown: 500 ms drop + fade |
| Blink | `sin` lid curve over 130 ms, every 3.1–4.7 s, every 3rd a double blink | **defect at the 10 fps bake**: see §1.1 |
| Secondary motion (tails, ears, wings, flames) | per-vertex **pure sines** (`flap`, `wag`, `nod`, `flicker`, `twitch`, `roll`) on `uTime` | No follow-through: a tail does not lag a lunge, and wings do not beat harder in a swoop. The rig ignores body acceleration |
| People | `Figure.update`: breathing `scaleY ± 2.6%` (≈ 1 texel at 44 texels), weight-shift roll ±0.02 | **No walk cycle.** Trainers and the hero *glide* (`lerpVectors` over 200–520 ms, `walking = true` only re-bakes faster). The route maps have no walking avatar |

### 1.1 The blink is sampled badly (measured by simulation, high)
The lid value `sin(x/0.13·π)` lasts 130 ms. The idle bake samples it at 10 fps, at whatever phase the tick lands. A
Monte-Carlo over the phase gives these results:
- **54% of blinks never show more than 85% closed** (63% at the low tier's 8 fps).
- **14% never pass half-closed**.

A sprite artist draws a blink as a *closed cel held for one frame-time* (≈ 80–120 ms), sometimes with one half-closed cel
before it. Fix: make the blink discrete and aligned to the bake clock, closed for exactly one tick. A window one tick long
always contains exactly one tick boundary, so the closed cel is always baked and held. This is the same "sampled
continuous signal vs authored cel" problem as everything below.

---

## 2. Frame-counted references

### 2.1 Pokémon Emerald (GBA, 59.73 fps), pret decompilation (high; facts and timings only, no code or assets)
Sources:
- `src/data/pokemon_graphics/front_pic_anims.h` (cel tables);
- `src/pokemon_animation.c` (procedural affine sprite animations);
- `src/battle_main.c` and `src/battle_controller_player.c` (faint);
- `src/data/object_events/object_event_anims.h`, `src/event_object_movement.c` and `src/field_player_avatar.c` (overworld).

**Front-pic cel tables.** 415 tables; every Pokémon has **2 cels** (frame 0 and frame 1). Parsed here:
- Cel hold: median **10 frames** (6 fps). Quartiles 8 / 10 / 15. Most common holds: 15 f (467×), 10 f (447×), 5 f (190×).
- Whole animation: median **69 frames (1.15 s)**, quartiles 50–87, max 230.
- Median of 5 commands; median time on the alternate cel 32 f.
- So the *cel* rate of the most-loved creature sprites of that era is **4–6 fps with 2 drawings**. The life comes from
  a **procedural sprite animation played on top at 60 fps**: one of 114 `ANIM_*` affine routines (squish, bounce, shake,
  lunge, swing, spin, glow).

Two of those routines, with amplitudes relative to the 64×64 sprite:

| Routine | What it does per frame | Amplitude | Duration |
|---|---|---|---|
| `Anim_VerticalSquishBounce` (`data[0] = 16`) | yScale = 256 + sin·32, xScale = 256 − sin·32, y2 = −sin(·, 10) | **±12.5% squash/stretch** (≈ ±8 px of 64) and a **10 px hop** | 48 f (0.8 s) |
| `Anim_BackAndLunge` | x2 += 1 per frame to +8 (8 frames back), then x2 −= 2, 3, 4, … (accelerating) to −8 while rotating, hold, return | **8 px wind-up at 1 px/f, strike accelerating to 5+ px/f, 8 px past rest** | wind-up 8 f, strike ≈ 4–5 f, then return |
| `Anim_VerticalJumps` | y2 = −sin(counter, amp), counter += 12 | ≈ 10.7 f per hop | 3 hops |

Lessons:
- The wind-up is **slower** than the strike, about 2:1 (8 f vs 4 f).
- The strike **accelerates**.
- It travels **past** the rest point (overshoot).
- Position moves in **whole pixels at 60 fps** while the cel art stays at 2 drawings.

**Faint** (`SpriteCB_AnimFaintOpponent`): every **2 frames** the sprite drops **8 px** and the bottom 8-px row is erased,
so the mon sinks into a ground line. That is on twos, ≈ 8 steps over **16 frames (0.27 s)**, after a pitched-down cry.
The player's mon slides down at 5 px/f (`SpriteCB_FaintSlideAnim`). Faint in Emerald is **fast and graphic**: the beat is
the cry, then a quick stepped sink.

**Overworld walk** (16×32 sprites, 16-px tiles):
- `sAnim_GoSouth` = cels 3, 0, 4, 0 at **8 frames each**, i.e. a 4-cel step cycle at 7.5 fps.
- Position moves **1 px per frame** (16 frames per tile), so each tile is one step (2 cels) and a full cycle covers 2 tiles.
- Fast walk: 4 f per cel. Run: cels held **5, 3, 5, 3** frames, 2 px/f.
- **4 directions**; east is the mirrored west.
- **Turning** (`PlayerTurnInPlace`) plays `WalkInPlaceFast`, a **half step in place over 8 frames** in the new direction.
  The figure never snaps silently: a turn shows the feet moving.

### 2.2 Cassette Beasts (Bytten Studio, 2023), sprite-animation data (medium-high)
The data comes from the fan-run AssistantApps site's repo (`src/assets/json/monsterSpriteAnim.json`,
`characterSpriteAnim.json`, generated from the game's Godot `.tres` files; animation names were not exported, only ids).
Parsed here: 146 monsters, 1,021 animations, 22 characters.

- **Every animation plays at exactly 10 fps** (length ÷ frame count = 0.1 s per frame for all 1,021).
- Per animation id (names inferred from frame counts and the community modding guide):

  | Animation | Frames | Length | Frequency |
  |---|---|---|---|
  | idle (assumed) | **6** | **0.6 s** | 94/146; 12 f / 1.2 s for 21 |
  | a 5–8 f set (windup/attack) | 7 / 6 / 5 / 8 | 0.5–0.8 s | |
  | **hurt** | **3** | **0.3 s** | 138/145 |
  | three 6 f sets | 6 | 0.6 s | |

- The community modding guide (wiki.cassettebeasts.com, search snippet; the host is blocked here) states the rules:
  - idle "almost always 6 frames, 8 on some larger monsters";
  - windup "6–8 frames … shouldn't be too long";
  - hurt "3 frames, starting with a very dramatic reaction that resets to the idle position";
  - fusion parts all 6 frames so they stay in sync.
- Battle sprites are **48–132 px tall, median 80** (frame height). Overworld characters are 48 px tall; their walk sets
  are 6 frames / 0.6 s.

This is the closest shipped analogue to Orbkin (a monster battler with modern pixel art): **all motion at 10 fps, short
loops, 3-frame hurt.**

### 2.3 saint11 (Pedro Medeiros, CC BY 4.0) tutorials (high; measured cel holds in the GIFs with `holds.py`)

| Tutorial | Rule (verbatim or close) | Measured timing |
|---|---|---|
| Character idle | "2 frames: move down one pixel, open arms, bend knees / move up one pixel, arms down. **Character doesn't change mass**." 3 frames: the middle frame "makes the fall down slower … delays the face movement". 6 frames: "secondary animations like the hair lagging behind the head … lots of <1 pixel movement". "Move the contents of the face/body **after** the silhouette has moved". "Vertical movement alone is boring: horizontal movement compensates the vertical". Idle is the place for blink, yawn, look around, scratch | **the loop is always 600 ms**: 2 cels × 300 ms, 3 × 200 ms, 6 × 100 ms; the special idle holds one cel 500 ms |
| Attack | "3 frames for the attack and 4 frames to return to idle … It's all about timing". **"No anticipation frame or players will feel input lag"** (action games). "Frame 8 is a bounce: it goes more to the left than frame 1" (overshoot past rest on the return). Frame 2 is a full **smear** (weapon arc) | first cel 300 ms, the rest 100 ms each |
| Squash & stretch | "Mass never changes". "Stretching is a good and cheap way of smoothing fast animations". "The preparation squashes the object in the **opposite** direction of the action". "Stiff objects do not deform as much". "Mix with motion blur for an extreme effect" | — |
| Easing | Linear is dull; slow in/out; back in/out = anticipation and overshoot, "specially useful for attacks … sometimes I even **skip the middle frame** to make the movement stronger". "The distance between drawings gives us the feeling of acceleration" | 80 ms frames |
| Death / take hit | Hit: "the **first frame is the strongest** … the impact uses **only one frame**", "overshoot the first frame", "recover slowly back to idle". Death: impact → give up (stop recovering mid-way, knees bend, arms and head lag) → hit ground (**overshoot the ground by 1 px**, arm bounce) → rest. Small enemies: squish (conserve mass), compress, **contrast frame** (black/white), explosion | 100 ms frames |
| Wings/flying | Wings alternate with the body; "going up is much faster than going down". Falling: 1 px per frame, wings rise. Flap: "go up fast, 3 px … keep going up slower, 1 px … wings go down and almost touch". Recover: down 1 px, stabilise. "Subpixel is useful for hover"; "fast wings have fewer frames" | 7 cels × 80 ms = **560 ms** flap |
| <1 pixel movement | Fake sub-texel motion: move the interior before or after the silhouette, slide line-break points, fade colours. **"Mostly move light, avoid moving shapes"**; "too many colours makes everything look blurry" | — |
| Walk cycle | 12 frames (fluid) or **6 frames ("useful in low resolution", 3 per leg)**: contact → down → down+ (lowest, widest arms) → prepare passing (head delay) → passing → up (highest). Arms opposite the legs; the grounded leg always moves back | **1.2 s per cycle either way**: 12 × 100 ms or 6 × 200 ms |
| Top-down walk | Basic **6-frame cycle**: 3 frames, then flip them horizontally for the other leg. Smoother: duplicate every frame and add an intermediate. Walking up: "less aggressive vertical movement". Sideways like a platformer walk | 100 ms frames |
| Quadruped walk/trot | "Simulate a quadruped as **2 bipeds with a small time offset**", head follows the front biped with a delay; "every 2 frames a leg touches the ground" in a trot. Each leg: contact → drag → rise → forward. Front paw "snaps on release", back paw "lags behind" | 8 cels × 100 ms = **0.8 s** trot |
| Cuteness | "Make it extra bouncy", "lots and lots of stretch and squash", "everything is soft, bend the shapes", "make everything malleable" | — |

### 2.4 Kenney *Cube Pets* (CC0, 24 rigid-part animals, glTF) (high; parsed with `glbclips.py`)
Every clip is baked at **30 fps** with LINEAR interpolation (rigid parts; no skinning). Fox: height 1.81 units.

| Clip | Length | Body | Tail / wings | Legs | Root bob |
|---|---|---|---|---|---|
| idle | **1.0 s** loop | rock ±4.5° | ±10° (wings ±10°) | — | — |
| walk | **0.5 s** cycle | ±5.6° | ±20° | ±49° | **5.5% of height** |
| run | **0.25 s** cycle | ±6° | ±11° | ±80° | **8.8% of height** |
| eat | 0.5 s | 39° dip | 49° | — | — |
| dance | 0.5 s | ±10.6° + bob | ±20° | — | 5.5% |
| gesture ± | 0.25 s | 20° | 18–20° | — | — |

These are a toy look: short, punchy cycles with **large angles**. Orbkin's idle roll is 0.03–0.05 rad (1.7–2.9°), × 1.8
in HD-2D. That is a third to a half of Kenney's idle rock.

### 2.5 Pipelines that turn 3D into sprite motion (medium)

**Dead Cells** (Thomas Vasseur, Motion Twin, Game Developer "Art Design Deep Dive", 2018; secondary summaries, site
blocked):
- Keyframe-first and pose-to-pose like 2D.
- Rendered as a low-res, unsmoothed 3D mesh to PNG frames plus a normal map for a toon shader.
- Interpolation frames are added "before or after" the keys only once the animation reads with as few frames as possible.
- **Animations reach ~30 fps**.
- "Attack animations are essentially pose-to-pose, with VFX adding a sense of motion and impact."

**Octopath Traveler** (Acquire / Square Enix):
- The sprites are **2D pixel art cut into a multi-joint model** and animated as cut-out puppets (Photoshop puppet warp to
  re-use patterns), not 3D renders. Source: WePlay Expo 2023 talk by Takuma Endo, Denfaminicogamer; CGWORLD *Game
  Graphics 2019* excerpt. Japanese press via search snippets; hosts blocked.
- Base character **18×32 px**; animation rect up to 128×128.
- In the pre-launch interview the developers say they **deliberately held motion back to keep a "frame-dropped" (コマ落ち)
  pixel-art feel** rather than going photoreal (Game Watch interview, snippet).
- Live A Live HD-2D drew about twice the planned character motions (hd2d-pixel note).

**DOGWALK** (Blender Studio, 2025, Godot; studio.blender.org blocked, search snippets):
- Animated **on 2s (~12 fps) and sometimes 3s (~8 fps)** inside a 60 fps game.
- **Stagger the updates** of different characters so everything does not tick on the same frame.
- Snap between states instead of blending.
- glTF "Sampling Interpolation Fallback = **Step**" (Blender 4.5+), plus turn off keyframe optimisation (it assumes linear
  and deletes needed keys).

**Guilty Gear Xrd** (Arc System Works, GDC 2015 "The X Factor Between 2D and 3D", Junya Motomura):
- 3D characters animated with **stepped keys / limited animation** (no interpolation), while the game runs at 60 fps.
- Their CG World clips compared stepped and tweened versions.
- Medium: slides at ggxrd.com and the GDC Vault are blocked here; the claim is widely reported (ResetEra, Steam threads).

**Godot pixel-render tutorials 2024–25** (Medium "Render 3D models as pixel art"; GodotPixelRenderer, MIT): cap the
SubViewport update to **12 fps** with a timer (render-once mode) to make 3D read as pixel art.

**Pixel-art convention (several secondary guides, low-medium)**:
- 8–12 fps is the norm; idle 2–4 frames with long holds (300–500 ms); breathing is a 1-pixel shift.
- On a 16×16 sprite (14 px neutral), anticipation is 12–13 px and launch 15–16 px, so the whole squash is ±2 px.
- Celeste's aggressive deformation works because it lasts 1–2 frames.

### 2.6 Blinks and breathing (medium)
- Classic 24 fps animation blink: about 2 closed frames (≈ 80 ms) with fast close and slower open.
- Disney Research's blink model (Trutoiu et al.) warns that blinks are **asymmetric** (closing faster than opening).
- Natural blinks last 100–400 ms. Blink spacing in idles is irregular (2–8 s).
- A blink can also *punctuate* a pose change (it starts 3–4 frames before the accent).
- Orbkin's 3.1–4.7 s interval and occasional double blink are fine; only the sampling is broken (§1.1).

---

## 3. Hands-on: captures, prototypes, canaries, judges

### 3.1 Harness (all scratch; the game repo was not modified)
**Scratch patch** (diffs in `scratchpad/anim/{creature,sprite,hd2dBattle}.diff`):
- `creature.ts`:
  - `?motion=` flags `noantic`, `noover` and `fast2` are canaries applied to the *current* lunge.
  - `tuned` swaps in a **key-table lunge per archetype** (`LUNGE_KEYS`, §4).
  - `keyed` / `keyed2` select **pose-aligned cel playback**.
  - `lunge(towards, onImpact)` reports the impact frame.
- `sprite.ts`:
  - `?step=N` samples *acting* sprites at N fps from the global clock; `stepmode=all` holds image and position,
    `stepmode=img` holds the image while the billboard follows the body.
  - `?idlefps=0` re-bakes the idle every frame (smooth).
  - `window.__bakes` counts bakes.
- `hd2dBattle.ts`: `live: () => view.wantBake()`, so keyed lunges re-bake only when the cel changes.

**Capture** (`scripts/motioncap.mjs`):
- Playwright with SwiftShader at 1280×720, high tier (640×360 internal, 2 device px per internal px).
- Virtual 60 fps rAF clock: rAF is replaced and advanced exactly one 16.667 ms frame per step.
- Real battle (cave arena, wild foe at level 30, pebblet as the target).
- Idle: 150 frames. Lunge: 72 frames, triggered directly on the foe's `CreatureView` toward the player's kin, with
  `hit(false)` at the impact key. That keeps move FX out of the strips.
- Per frame it logs the attacker's inner position, scaleY and the bake counter.
- Cost: about 2–4 min per variant on 4 shared cores. 4 species × 11 variants = 44 captures.

**Species, one per archetype:**
- quadruped: **cindertail** (`trot`);
- flyer: **stormoth** (`float`, hover 0.24);
- serpentine: **maelstrode** (`sway`);
- blob: **dropple** (`bounce`).

**Strips** (`scripts/make_strips.py`). The format turned out to matter (§3.3):
- **fmt1**: attacker *and* target, every 3rd frame, 24 tiles.
- **fmt2**: **attacker only**, **every 2nd frame**, 36 tiles (9 × 4). Idle: the foe at 2×, every 2nd frame, 36 tiles.

**Judge** (`scripts/judge_motion.py`):
- A fresh tool-less `claude -p --model opus` per vote, blind A/B, both orders × 3 reps = 6 votes per pair.
- Verdict = ≥ 75% *and* winning in both orders, otherwise `no_difference`. This is the judge-calibration protocol.
- 348 + 72 calls, **$9.0** in total.

**Motion lint** (`scripts/motionlint.py`) is a deterministic check on the engine log. It reports anticipation frames,
depth and squash, hold frames, strike frames, impact frame, overshoot past rest, squash ringing, settle frame, distinct
poses and bakes per frame. It flags NO_ANTICIPATION, NO_OVERSHOOT, TOO_FAST, FLOATY_STRIKE and NO_HOLD.

### 3.2 Canaries first: the strip judge *is* calibrated for motion (high)

| Canary (base vs …) | fmt1 (cindertail) | fmt2 cindertail | fmt2 maelstrode | fmt2 stormoth | fmt2 dropple | neutral prompt (4 species) |
|---|---|---|---|---|---|---|
| `noantic` (wind-up removed) | 6–0 | 6–0 | 5–1 | 6–0 | 6–0 | — |
| `noover` (impact squash, landing spring and hop arc removed) | 6–0 | 6–0 | 6–0 | 6–0 | 6–0 | 24–0 |
| `fast2` (all durations halved) | 6–0 | 5–1 | 6–0 | 6–0 | 6–0 | — |

- **112 of 114 canary votes are correct; every canary pair gets the right verdict.** Mean confidence is 2.5–4.0.
- The lint flags the same canaries deterministically: `noantic` → NO_ANTICIPATION + TOO_FAST; `noover` → NO_OVERSHOOT.
  `fast2` is *not* flagged: 5 + 3 frames still passes the ≥ 8 f rule, so the TOO_FAST threshold should be ≥ 10 f for a
  turn-based game.
- **Reasons check.** The `noantic` reasons name the defect exactly ("strikes immediately with no wind-up"). The `noover`
  reasons are partly confabulated: "deeper anticipation crouch" is cited although the anticipation was identical. The
  judge senses "stiffer" overall more than it identifies a missing overshoot.
- **The `fast2` canary is confounded**: only the attacker sped up, not the target's reaction, so judges also cited
  "flash arrives after the strike". The verdict is still the expected one.

### 3.3 The strip format changes verdicts: the main methodological finding (high)
1. **Target in the frame (fmt1) vs attacker only (fmt2): the same `tuned` vs `base` pair flips** from base 5–1 (fmt1)
   to tuned 6–0 (fmt2).
   - In fmt1 every reason was about **sync between the strike and the target's flash**: "B's hit flash lands on the
     strike's contact frame". The tuned lunge reaches contact 2 frames later, while the target's `hit()` blink pattern
     (on/off by ninths) aliased differently against every-3rd-frame sampling. That gave "target vanishes at 21, 30".
   - So a strip with the target **judges the impact sync, not the motion**. Judge the two separately.
2. **Sampling below the hold length hides the playback rate.**
   - An idle strip sampled every 6th frame (= the 10 fps bake rate) made stepped and smooth idles **literally the same
     images**. The judge said so ("visually identical … arbitrary pick", confidence 1, 3–3), which is a nice negative
     control.
   - To judge playback rate, sample **every 1–2 frames**; repeated tiles then show the holds.
3. **Rubric wording matters for taste questions.**
   - With a rubric that mentions "sprite-like rather than smeared 3D", stepped 10 fps idles won 24–0.
   - With a neutral rubric ("which idle animation is better?") the split was 11–13 by species:
     - smooth won for the creatures whose idle is mostly **fast secondary motion**: cindertail's flame flicker 0–6,
       stormoth's wingbeat 0–6 ("flames feel choppy").
     - stepped won for **body and face** idles: maelstrode 6–0, dropple 5–1 ("less facial pixel boiling").
   - Keep the rubric neutral for gate decisions, and record which rubric produced a verdict.
4. **GIFs are invisible to the judge.** A 3-frame red/blue/green GIF was perceived as "a single solid red frame … I only
   get the first frame" (measured). GIFs are for humans only; judges need strips.

### 3.4 Results: tuned amplitudes, stepped playback, keyed cels (fmt2 unless noted; votes for x–y)

| Pair (x vs y) | cindertail (quad) | maelstrode (serp) | stormoth (fly) | dropple (blob) | Read |
|---|---|---|---|---|---|
| tuned (§4 tables, smooth) vs base | **6–0** | 4–2 (n.d.) | **6–0** | **6–0** | Bigger anticipation with a hold, a stretched smear strike and overshoot win (3 of 4; the 4th leans the same way) |
| base clock-stepped 12 fps vs base smooth | 3–3 | 2–4 | **0–6** | **5–1** | Taste split; clock sampling is not a clear win |
| tuned clock-stepped 12 fps vs tuned smooth | 3–3 | **0–6** | 3–3 | **0–6** | **Clock sampling hurts**: "stalls upright before a weaker, later strike". A 4-frame strike key falls between 12 fps ticks and the extreme is never shown |
| step `img` (image held, position live) vs `all` (both held) | 0–6 | 6–0 | 3–3 | 6–0 | Inconsistent: no rule |
| **keyed** (pose-aligned cels, n = round(frames/5)) vs tuned smooth | 0–6 | 0–6 | 5–1 | **6–0** | Coarse cels "pop" on the long recovery (7+ texel jumps) |
| keyed vs clock-stepped | **6–0** | 4–2 | 4–2 | 5–1 | Pose-aligned beats clock-sampled |
| **keyed2** (pose-aligned + spacing-aware) vs tuned smooth | **6–0** | **5–1** | **5–1** | **6–0** | **Wins on all 4** (22/24) |
| keyed2 vs tuned smooth, *neutral rubric* | **6–0** | **6–0** | 4–2 | **6–0** | Robust to the rubric (22/24) |
| keyed2 vs keyed | 6–0 | 6–0 | 3–3 | 1–5 | Blobs like the bigger snaps |
| idle stepped 10 fps vs smooth 60 fps (sprite rubric) | **6–0** | **6–0** | **6–0** | **6–0** | "smooth changes pixels every frame → jitter, facial boiling" |
| idle stepped vs smooth (*neutral rubric*) | 0–6 | 6–0 | 0–6 | 5–1 | **Per part**: hold the body and face; fast secondary motion (flames, wingbeats) wants a faster rate |

**What keyed2 is.** Each key of the table becomes `n` held cels and every cel shows the pose at the *end* of its slice,
so every key pose is displayed and held:
- `n = 1` for the smear/strike key;
- otherwise `n = max(1, round(frames/5), ceil(travel/0.12 units))`, where travel = |Δfwd| + |Δup| + ½|Δsquash|.
- 0.12 units ≈ **2 texels** on the battle camera, so no cel-to-cel jump exceeds about 2 texels except the strike.

The resulting cel structure is a hybrid of **held key poses and near-continuous big travel**:

| Archetype | Frames | Cels | Per key (frames / cels) |
|---|---|---|---|
| quad | 49 | 27 | 9/3, hold 4/1, smear 5/1, impact 4/4, hop-back 12/12, land 5/4, settle 10/2 |
| fly | 52 | 21 | 11/5, 5/1, 6/1, 4/2, 14/10, 12/2 |
| serp | 49 | 15 | 12/2, 5/1, 4/1, 4/2, 12/7, 12/2 |
| blob | 65 | 38 | |

That is how hand animators time an attack: a held wind-up, a single smear frame, a held contact, and in-betweens only
where the body travels far. It is **not** a uniform frame rate.

### 3.5 Cost (bake counts; SwiftShader timings are not trustworthy, see mobile-perf-budget) (high for counts)

| Variant | Bakes per frame during the lunge window (attacker + target + idle ticks of others) | Attacker cels per action |
|---|---|---|
| smooth (current) | 1.65–1.73 | 1 per frame: 46–65 |
| clock-stepped 12 fps, `all` | 0.61–0.65 | about 10 |
| keyed (coarse) | 1.0–1.1 | 10–14 |
| **keyed2** | **1.18–1.33** | **15–38** (≈ 0.3–0.6 per frame) |
| idle 10 fps (current) / smooth idle | 0.55 / 3.0 (3 subjects) | — |

- **keyed2 cuts the attacker's acting bakes by 40–70%** relative to smooth live baking.
- The target's `hit()` is still smooth here. Making hit and faint keyed too would bring the action window near
  ≈ 0.6–0.8 bakes/frame, the same as the idle budget the mobile tier was sized for. That removes the per-action bake
  spike on phones.
- Rule: **the sprite re-bakes only when the cel changes**: `wantBake()` = pose dirty, not "animating".

### 3.6 Files
- Strips: `scratchpad/anim/strips/<species>_<variant>_{attack,attack2,idle,idle2}.png`.
- Votes with reasons: `scratchpad/anim/judge/*.jsonl` (+ `_summary.json`).
- Lint: `python3 -I scratchpad/anim/scripts/motionlint.py scratchpad/anim/cap/<sp>/*/`.
- **Owner blind A/B GIFs** (real timing, every 2nd frame at 30/40 ms; panels shuffled, answers in `*.key.json`):
  `scratchpad/anim/owner/<species>_attack.gif` (base / tuned / tuned_keyed2) and `<species>_idle.gif`
  (stepped / smooth). These are the human check the judge cannot do.

---

## 4. Motion tables per archetype (60 fps frames; amplitudes as fraction of body height H and in texels at 34 texels)

Conversions:
- The battle camera shows **≈ 15 texels per world unit**. Measured: the current 0.667-unit lunge travels ≈ 20 internal
  px = 10 texels on screen; some of it goes into depth, so lateral read is lower.
- Kin are 28 / 34 / 40 texels tall by stage.
- **One texel = 3.6% / 2.9% / 2.5% of height.** Anything below that is sub-texel: it is invisible or boils.

### 4.1 Attack (the validated tables: `LUNGE_KEYS` in `scratchpad/anim/game/src/render/creature.ts`)
Pose = squash `sq` (volume kept), `lean` (rad, + toward the target), `fwd` (units toward the target, R = contact
distance 0.95), `up` (units). Play as keyed2 cels. Impact fires on the contact key. The rows below are deltas from rest.

| Beat | Quadruped (pounce) | Blob (hop-splat) | Flyer (rise-swoop) | Serpentine (coil-whip) |
|---|---|---|---|---|
| Wind-up | 9 f: sq **0.74**, lean −0.30, back 0.20 (≈ 3 tx), ease-out | 10 f: sq **0.60** (wide), back 0.10 | 11 f: **rise +0.24, back 0.22**, lean −0.32, sq 1.06 | 12 f: **lean −0.42** (coil), sq 0.84, back 0.14 |
| **Anticipation hold** | **4 f** (moving hold: sq 0.72, lean −0.32) | **5 f** | **5 f** | **5 f** |
| Strike (1 smear cel) | **5 f**: sq **1.38**, lean +0.38, to R, arc +0.14 | 6 f: sq **1.45**, to 0.6R, **up 0.38** | 6 f: sq 1.22, lean **+0.45**, to R, dive to −0.04 | **4 f**: sq 1.30, lean **+0.55**, to 0.75R (short travel, big lean) |
| Contact (impact fires) | 4 f: sq 0.78 | 4 f: **splat sq 0.62** + 3 f hold | 4 f: sq 0.86 | 4 f: sq 1.10 |
| Recover | 12 f hop back to **−0.08 past rest** (overshoot), up 0.22 | 14 f hop back to −0.06, up 0.30 | 14 f rebound **+0.16 above the hover** | 12 f snap back to **lean −0.14** past upright |
| Land / settle | 5 f land sq 0.80, then 10 f outBack to rest | land sq 0.75 → **jiggle 1.12 → 0.95 → 1.0** (3 × 6 f) | 12 f ease to the hover | 12 f outBack |
| Total | **49 f (0.82 s)** | **65 f (1.08 s)** | **52 f (0.87 s)** | **49 f (0.82 s)** |
| Judge vs current | 6–0 | 6–0 | 6–0 | 4–2 |

Generalised rules:
- **Wind-up : strike ≈ 2–3 : 1.** Emerald's lunge is 8 f back / 4–5 f forward; the tables use 9–12 / 4–6.
- **Hold the wind-up extreme 4–5 f.** saint11 holds the first attack cel 300 ms; a turn-based battle has no input-lag
  constraint.
- **The strike is one smear/stretch cel held 4–6 f** at sq 1.3–1.45 along the motion.
- **Contact squash** 0.62–0.86 by material: blob softest, flyer stiff-ish.
- **Overshoot past rest on recovery:** 5–8% of the reach, or a lean past upright, or a rebound above the hover. This
  is saint11's "bounce: goes more to the left than frame 1".
- **Settle with one decaying ring** (outBack or 1.12 → 0.95 → 1.0).
- Minimum visible amplitudes at sprite scale:

  | Beat | Minimum | At 34 texels |
  |---|---|---|
  | Wind-up travel | ≥ 10–15% H | ≥ 3 texels; Emerald 12.5% |
  | Squash | ≥ 15% H | ≥ 5 texels |
  | Stretch | ≥ 25% H | — |
  | Overshoot | ≥ 1 texel | — |

  The current lunge's 0.084-unit wind-up is ≈ 1.3 texels. It read (canaries pass) but scored lower than the tuned one.
- **Heavy** (pyrelord, verdantusk, cragmaul, vulcrag; *untested, starting values*): the quad table ×1.4 in time and
  ×0.6 in squash, with wind-up 14 f + hold 6 f, strike 6 f and a 3-f ground-shake on contact. Stiff materials deform
  less (saint11).

### 4.2 Idle (starting values derived from sources + the measured current idle; judged only stepped vs smooth)

| Archetype | Body cel rate | Loop | Main motion (texels at 34) | Secondary (rig) | Notes |
|---|---|---|---|---|---|
| Quadruped (trot/heavy) | **10 fps body**; 8 on low | 0.8–1.2 s; heavy 1.6–2.0 s | breathe/bob **1–2 texels**; weight shift **1 texel sideways** to compensate the vertical (saint11) | tail/ears **lag the body by 1–2 cels** (head delay) | Kenney idle rock ±4.5°, tail ±10° in 1.0 s |
| Blob (bounce) | 10 fps | **0.6 s** (saint11 bouncy idle; Cassette Beasts 6 f / 0.6 s) | squash ±2–3 texels with mass kept; hop 2–3 texels; **hold the low squash 2 cels** | face moves **after** the silhouette (saint11) | "extra bouncy", cute |
| Flyer (float/glide) | body 10 fps; **wings 12–15 fps** | flap 0.5–0.6 s (saint11 7 × 80 ms) | bob 2–3 texels: **up fast, down slow** (rise 3 px fast, 1 px slower, fall 1 px/f) | wingbeat cels ≥ 12 fps; fast wings get fewer cels plus a blur/double drawing | neutral judge: a 10 fps wingbeat reads "choppy" |
| Serpentine (sway) | 10 fps | 1.2–2.0 s | sway lean ±1–2 texels at the head; body stays planted | fins/barbels lag 1–2 cels | maelstrode: stepped won 6–0 under both rubrics |
| Flames, lantern tails, sparks | **15 fps flipbook-like** | — | — | — | Emerald fire 15 fps; neutral judge: a 10 fps flame "feels choppy" |
| **Blink (all)** | discrete | every 2.5–6 s, irregular; a double blink 1 in 3 | **closed cel held 1 bake tick (100–125 ms)**, optional half-closed cel before, **open slower than close** | — | fixes the 54% "mushy blink" defect (§1.1) |

### 4.3 Hit, faint and entry (sources + current code; not judged here; battle-vfx-motion owns hit-stop and FX timing)

**Hit** (Cassette Beasts hurt = 3 f at 10 fps = 0.3 s; saint11 "first frame strongest, impact uses one frame, overshoot
the first frame, recover slowly"):
- 1 cel of maximum recoil (lean −0.35 to −0.45, sq 0.8, 2–3 texels back) held **4–6 f**;
- then 2–3 recover cels over 12–18 f;
- white flash on the first cel only, then blink-hide on 2-frame boundaries. Avoid ninths of a 320 ms tween: they alias.
- **During hit-stop freeze the pose, position and rig clock of both kin; keep the flash, FX books and light running**
  (battle-vfx-motion §7).

**Faint**:
- cry (pitched down);
- 1 hurt cel (eyes shut) held 6–8 f;
- **"give up" topple**: 2–3 cels over 12 f, head and limbs lagging;
- **hit the ground, overshoot 1 texel, rest** (saint11);
- then the Emerald-style **stepped sink**: drop 1/8 of the height **every 2 frames** with a ground clip line, ≈ 16 f;
  or Showdown's 500 ms drop + fade.
- Today's 990 ms of smooth tweening is about 2× too long and lacks the ground overshoot.

**Entry** (`appear`):
- Showdown gen5: ball 300 ms, drop from +30 px over 400 ms, then a 300 ms accelerated settle.
- Emerald: per-species 2-cel animation (median 69 f) + an affine routine.
- Recommendation: pop 3 cels (scale 0.3 → 1.15 → 1.0) over 12 f, a landing squash cel, then **one signature idle
  flourish** per species (this is Emerald's cry anim).

### 4.4 Secondary motion and follow-through (not implemented; the biggest remaining craft gap)
The rig's pure sines ignore the body. Professional sprite animation has appendages lagging the body by **1–2 cels**:
hair behind the head, a tail trailing a lunge, ears flicking on landing.

Cheap three.js route: add a `uDrag` vec3 uniform per creature, a critically damped spring of the body's velocity
(ω ≈ 12–18 rad/s). Rig kinds `wag`, `nod` and `flap` add `amp_drag · uDrag` about their pivot. Set the spring to the
cel's value at each cel change, so lag is quantised with the cels. Wingbeat speed should scale with effort (×2 during the
flyer wind-up and swoop).

---

## 5. People: walking, turning, shadows at route-map size (sources; Orbkin has no walk cycle today)

Orbkin today:
- Figures are 44 texels tall, both in battle and on the screens.
- Trainers **slide** in over 520 ms and the hero over 200 ms, without moving their feet.
- The route maps have no avatar walking.

| Topic | Evidence | Rule for Orbkin |
|---|---|---|
| Directions | Emerald: 4 directions, east = mirrored west, 16×32. RPG Maker default 4; 8-dir sheets optional. Octopath: 18×32 bases, cut-out animated (direction count not found) | **4 facings** (S, N, W and mirrored E) for figures on grid/route paths. The live bake can render any yaw, but **snap the figure's yaw to the 4 (or 8) facings**: free yaw reads as a 3D model. 8 only if movement is analog and diagonal-heavy |
| Walk cycle | Emerald: 4 cels × 8 f (7.5 fps) with position at 1 px/f, one tile per step. saint11: 6 frames for low-res (contact, down, down+, prepare passing, passing, up), 1.2 s cycle; top-down: 3 frames + flipped. Cassette Beasts overworld walk: 6 f / 0.6 s at 10 fps | At 44 texels: **6 cels at 10 fps (0.6 s cycle)** or Emerald-style 4 cels at 7.5 fps. **Body bob 1 texel** (down on contact, up on passing). Arms opposite the legs. Head 1 cel delayed |
| Foot sliding | Emerald ties the step to the distance (one step per 16-px tile) | Drive the walk phase from **distance travelled**, not time: stride length = distance per half cycle. Move position at whole texels per frame (smooth 60 fps translation, Emerald) while the cels step |
| Turning | Emerald `PlayerTurnInPlace` plays a **half step in place, 8 frames**, in the new direction | On a facing change, show **one step-in-place cel (8 f)**. A 180° turn passes the side facing for one cel (4 f). Never a smooth yaw spin |
| Shadow | saint11 wings: body bob separate from the ground. Orbkin's contact shadow is already a pixel ellipse | The shadow stays planted; shrink it 1 texel on "up" cels or jumps; never bob it with the body |
| Implementation | rig vertex shader: legs and arms are not rigged today (arms `nod` at speed 2.2 always) | Add a rig kind `stride` (legs about the hip, arms opposite, gated by a `uWalk` uniform with phase = distance/stride), quantise the phase to 6 cels, and re-bake on a cel change. Idle people: 2-cel breathing (saint11: down 1 px / up 1 px, 300 ms each) |

---

## 6. The stepped-playback decision

1. **Idle body and face: keep stepped** (10 fps high / 8 fps low, as shipped). Smooth idles boil facial pixels.
   Verdicts: 24–0 with the sprite rubric; 11–1 for maelstrode and dropple with the neutral rubric.
2. **Fast secondary motion (flames, wingbeats, sparks): step it at 15 fps**, faster than the body. Neutral judges
   preferred smooth for flame and wingbeat idles (12–0). Sprite games run fire at 15 fps (Emerald) and wings at 12.5 fps
   (saint11). This needs a second rig clock or a per-part quantisation; untested here.
3. **Acting (attack, and by extension hit, faint, entry): pose-aligned, spacing-aware cels (keyed2).**
   - Every key pose is shown and held for its authored frame count.
   - The strike is one smear cel.
   - In-betweens are added only where a cel would jump more than about 2 texels.
   - Beat smooth 60 fps on 4/4 archetypes (44/48 votes over both rubrics) and cut the attacker's bakes by 40–70%.
4. **Do not sample the live animation at a fixed 8–12 fps from the global clock.** That is hd2d-pixel's "stepped
   playback" idea in its naive form. It drops short extremes (a 4-frame strike falls between ticks) and lost or tied
   against smooth on every archetype (0–6, 0–6, 3–3, 3–3 for the tuned lunge). DOGWALK's hand-keyed animation on 2s/3s
   works because its *keys* are authored on the steps.
5. **Position during acting: no rule.** Whether to hold position with the cel or move it every frame (Emerald moves
   whole pixels per frame) came out inconsistent (6–0, 0–6, 3–3, 6–0). Hold it inside keyed2, where big travel already
   gets near-continuous cels.
6. **Stagger** the cel ticks of different subjects (DOGWALK) so the whole screen never changes on the same frame.
7. **Owner check before shipping.** The VLM verdicts on taste-like pairs depended on rubric wording, so the owner should
   view the blind GIFs in `scratchpad/anim/owner/`.

---

## 7. Strip-judging recipe (for the skill)

1. **Capture under a virtual clock.** Replace rAF and advance exactly 16.667 ms per frame. Trigger the action on the
   view directly, without FX or UI. Log per-frame engine state (position, squash, bake count) next to the PNGs.
2. **Lint before you judge** (deterministic, free): anticipation ≥ 3 f and ≥ 10% H; hold ≥ 2 f; strike ≤ 8 f; overshoot
   or squash ring present; action total within ±20% of the table. The lint catches the noantic and noover canaries.
3. **Strip format:** attacker only (or reactor only), **every 2nd frame**, 30–40 tiles, frame numbers on each tile,
   native nearest scale, ≤ 2400 px wide. Judge sync (strike ↔ flash) **separately**, with a strip that includes the
   target. Never judge a playback-rate question with tiles sampled at or below the hold length.
4. **Canaries every session, on the same format:** base vs `noantic`, `noover`, `fast2`. Each must reach ≥ 5/6 in both
   orders, or the session's verdicts are invalid. Cost about $0.40 per species.
5. **Blind pairwise, both orders × 3**; verdict needs ≥ 75% *and* winning in both orders, else `no_difference`. Read
   the reasons: if they cite the target, the background or a defect that is not there, the format is wrong.
6. **Neutral rubric for decisions**, plus the style rubric as a second opinion. Report both when they disagree. That is a
   taste split and goes to the owner.
7. **GIFs only for humans** (the judge sees frame 1). Give the owner blind side-by-side GIFs with a key file, real
   timing, looping with a pause.
8. **Do not trust:** absolute motion scores, single-order votes, or VLM reasons about sub-texel effects. The confidence
   values never exceeded 4.

---

## 8. Skill rules (paste-ready)

- **Author attacks as key tables, not tweens.** Wind-up (9–12 f) → **hold 4–5 f** → one smear/stretch strike cel
  (4–6 f, sq 1.3–1.45) → contact squash (4 f, 0.62–0.86 by material) → recovery **past rest** → one decaying settle
  ring. Wind-up : strike ≈ 2–3 : 1. Totals 0.8–1.1 s. Per-archetype tables are in §4.1.
- **Amplitudes in texels, not units.** Compute texels = Δ/H × texelHeight. Every beat must move ≥ 1 texel. Wind-up
  ≥ 10–15% H, squash ≥ 15% H, stretch ≥ 25% H. Below one texel only *light* may move, not shape (saint11 sub-pixel rule).
- **Mass never changes:** scale xz by 1/√sy.
- **Play acting as pose-aligned cels.** Show every key pose, hold it its authored frames, add in-betweens only where a
  cel jump exceeds about 2 texels, and re-bake only on a cel change. **Never** global-clock-sample the action at 8–12 fps.
- **Idle body and face at 10 fps (8 low)**; flames, sparks and wingbeats at 15 fps; loops 0.6–1.2 s (heavy up to 2 s).
- **Blinks are discrete**: closed for exactly one bake tick, aligned to the tick, every 2.5–6 s irregular, sometimes
  doubled; close faster than open.
- **Secondary motion lags the body by 1–2 cels** (tails, ears, hair, fins). Pure sine wiggle with no reaction to a lunge
  reads as procedural.
- **Hit:** one strongest recoil cel (4–6 f), then 2–3 recovery cels; flash on the first cel; hurt total about 0.3 s
  (Cassette Beasts). **Faint:** hurt cel → give-up topple → ground overshoot by 1 texel → stepped sink of 1/8 H per 2
  frames; under 0.6 s after the cry.
- **People:** 4 facings with yaw snapped; walk 6 cels at 10 fps (or 4 at 7.5) with 1-texel bob; phase from distance
  (no foot sliding); turn = an 8 f step-in-place; the shadow stays planted. No gliding figures.
- **Judge motion with strips plus canaries** (recipe §7). The skill ships `motioncap.mjs`, `make_strips.py`,
  `motionlint.py` and `judge_motion.py`.
- **Safety:** the decompilations (pret) and extracted game data (Cassette Beasts JSON) are used for **facts and timings
  only**; never copy code, sprites or IP. saint11 GIFs are CC BY 4.0 (attribute if shown). Kenney Cube Pets is CC0
  (record it in ASSETS.md if shipped).

---

## 9. TL;DR and Implications for Orbkin

**TL;DR**
1. The beats of Orbkin's lunge are right (anticipation 9 f, strike 5 f, impact at frame 16, spring settle; all canaries
   pass against it). Its **amplitudes are about half of what reads at sprite size**: the wind-up is ≈ 1.3 texels. Tuned
   per-archetype tables win 3/4 archetypes 6–0 (§4.1).
2. **Stepped playback: yes, but pose-aligned and spacing-aware, not clock-sampled.**
   - keyed2 beats smooth 60 fps on all 4 archetypes (44/48 votes, two rubrics).
   - Naive 12 fps clock sampling loses or ties (it skips the 4-frame strike extreme).
   - keyed2 cuts the attacker's live bakes by 40–70%.
3. **Idle: keep the 10 fps body bake**: smooth idles boil facial pixels, 24–0. Under a neutral rubric smooth won for
   flames and wingbeats, so run fast secondary parts at about 15 fps.
4. **Blink sampling defect:** 54% of blinks never close past 85% at the 10 fps bake; make blinks discrete and
   tick-aligned.
5. **Secondary motion has no follow-through** (pure sines), and **people glide without a walk cycle**. These are the
   next two craft gaps.
6. **Motion judging works if calibrated:**
   - 112/114 canary votes correct;
   - attacker-only strips at every 2nd frame;
   - a separate sync strip;
   - a neutral rubric;
   - GIFs for humans only.
   
   Including the target in the strip flipped a verdict (it judged flash sync instead of motion).
7. Reference numbers:
   - Emerald: 2 cels at 4–6 fps + 60 fps affine squash ±12.5%; lunge 8 f back / ≈ 4 f strike; faint = 8 px drops on
     twos; walk 4 cels × 8 f; turn = an 8 f half step.
   - Cassette Beasts: everything at 10 fps, idle 6 f / 0.6 s, hurt 3 f / 0.3 s.
   - saint11: idle loop 600 ms at any cel count.

**Implications for Orbkin** (in order of value per effort):
1. `creature.ts`:
   - replace the tween lunge with `LUNGE_KEYS` per archetype plus keyed2 playback (prototype in the scratch diff,
     ~120 lines);
   - add `wantBake()` and switch `kinSpriteOptions.live` to it;
   - convert `hit`, `faint`, `appear` and `dodge` to key tables the same way (§4.3);
   - log the change in `docs/DECISIONS.md`.
2. Discrete blink aligned to the bake tick (≈ 10 lines).
3. A second, faster rig clock (15 fps) for flames, wings and sparks while the body stays at 10 fps; then re-judge the
   neutral idle pairs.
4. A `uDrag` follow-through spring for tails, ears and fins (§4.4).
5. People: a `stride` rig kind, yaw snap to 4 facings, a step-in-place turn, and distance-driven phase. Use it for
   trainer entrances and a route-map walker.
6. Turn the recipe into a gate:
   - add `motionlint` + canary strips to the motion checks in `npm run verify`-adjacent scripts (scratch only for now);
   - ask the owner to view `scratchpad/anim/owner/*.gif` blind before adopting keyed2 globally.
7. Fix the hit blink pattern to 2-frame boundaries; the current ninths alias (seen in the strips as "target vanishes").

## 10. Open questions
- Owner verdict on the blind GIFs: is the VLM preference for keyed2 shared by a human designer?
- Per-part rig clocks (15 fps flames/wings vs 10 fps body): implement and judge with the neutral rubric.
- Heavy archetype table (untested), hit/faint/appear as key tables (untested), people walk cycle (unprototyped).
- Phone cost of keyed2 on a real device: counts suggest a win; GPU ms not measurable here.
- Exact Octopath / Sea of Stars frame counts (Japanese press and Sabotage pages blocked); Guilty Gear Xrd slides blocked.

## 11. Sources
Primary / code / data:
- pret/pokeemerald (raw.githubusercontent.com): `src/data/pokemon_graphics/front_pic_anims.h`, `src/pokemon_animation.c`,
  `include/pokemon_animation.h`, `src/battle_main.c`, `src/battle_controller_player.c`,
  `src/data/object_events/object_event_anims.h`, `src/event_object_movement.c`, `src/field_player_avatar.c` (facts and
  timings only)
- Pokémon Showdown client `battle-animations.ts` (AGPLv3; animSummon/animFaint timings), already in
  `research/vfx/dl/showdown`
- AssistantApps/CassetteBeasts (github): `src/assets/json/monsterSpriteAnim.json`, `characterSpriteAnim.json` (data
  extracted from the game; timing facts only)
- saint11/Saint11Tutorials (github, CC BY 4.0): `characterIdle.gif`, `Attack1x.gif`, `AttackSheet.gif`, `Squash.gif`,
  `Easings.gif`, `Death.GIF`, `Wings.gif`, `Subpixel.gif`, `Walk.gif`, `TopDownWalkCycle.gif`, `4LegsWalk.gif`,
  `Cuteness.gif`
- Kenney Cube Pets (CC0), `research/assets/dl/kenney/3d/cube-pets/*.glb`
- Orbkin source at HEAD 3af2728: `src/render/creature.ts`, `src/render/hd2d/sprite.ts`, `src/scenes/hd2dBattle.ts`,
  `src/render/hd2d/characters.ts`, `src/render/creatures/material.ts`

Secondary (search snippets; hosts blocked from this container unless noted):
- Dead Cells, Thomas Vasseur: https://www.gamedeveloper.com/production/art-design-deep-dive-using-a-3d-pipeline-for-2d-animation-in-i-dead-cells-i- ; https://www.gameanim.com/2018/01/31/dead-cells-3d-pipeline-2d-animation/
- Octopath multi-joint pixel animation: https://news.denfaminicogamer.jp/kikakuthetower/231218g ; https://cgworld.jp/feature/201908-gg2019-oct.html ; https://game.watch.impress.co.jp/docs/interview/1128111.html
- DOGWALK stepped animation: https://studio.blender.org/blog/playable-stop-motion-in-godot/ ; https://studio.blender.org/blog/animations-for-dogwalk/ ; https://godotengine.org/article/godot-showcase-dogwalk/ ; https://forum.godotengine.org/t/how-to-get-low-frame-rate-3d-animations-stop-motion-style/125609
- Guilty Gear Xrd GDC 2015: https://www.ggxrd.com/Motomura_Junya_GuiltyGearXrd.pdf ; https://www.resetera.com/threads/how-arc-system-works-dbfz-xrd-devs-does-its-3d-modeling-animation-gdc2015.17198/
- Cassette Beasts modding guide: https://wiki.cassettebeasts.com/wiki/Modding:Monster_Making_Guide_Part_1
- Godot pixel render at 12 fps: https://medium.com/@merxon22/godot-shader-render-3d-models-as-pixel-art-4839e6528601 ; https://github.com/bukkbeek/GodotPixelRenderer
- Blink timing: https://la.disneyresearch.com/wp-content/uploads/Modeling-and-Animating-Eye-Blinks-Paper.pdf ; https://tips.clip-studio.com/en-us/articles/2643
- Pixel-art principles (low): https://www.sprite-ai.art/guides/animation-principles ; https://pixnote.net/en/learn/animation/
- saint11 idle post: https://twitter.com/saint11/status/882228769230073858
