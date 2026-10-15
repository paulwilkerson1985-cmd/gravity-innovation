# Timing: the beat sheet, hit feedback by severity, and where the numbers come from

Contents: 1 beat sheet · 2 severity table · 3 what Orbkin does today (measured) · 4 facts from shipped
battlers · 5 what the timeline tool measures (definitions)

All frames are 60 fps frames (1 f = 16.7 ms). Measure with `fx_timeline.sh`; never estimate.

## 1. Attack beat sheet (normal-power move, one target)

| Beat | Frames | What happens | Why |
|---|---|---|---|
| Text "X used Y!" | ≤ 30 (today 67) | text box; the move name is the turn's anticipation | pokeemerald spends 6 f before Tackle's impact; Orbkin spends 64–73 f before anything moves. Trimming it is a **project decision**: report it, do not change it unless asked |
| Anticipation | 8–10 | squash, lean back, a charge glint at the attacker; BG dim may start | the lunge's 150 ms crouch is right |
| Travel | 6–20 | projectile on an arc with a trail, or a contact lunge cut short | Emerald Tackle 4 f; Showdown leap 400 ms; Orbkin 340–380 ms |
| Pre-impact freeze (optional) | 1–2 | freeze one frame *before* contact, crits only | saint11 Impact |
| **Impact frame** | 1 | contrast frame: a dark disc / the set at its darkest | saint11 Explosion f1 ("so other frames feel brighter") |
| Flash | 1–2 | white flash shape **over** the target, FX light at its peak, sprite light tinted, hit SFX **on this frame** | saint11 f2; Octopath "a point light with each VFX" |
| Hit-stop | 3 / 5–6 / 8–10 by severity | target frozen (idle too), attacker held; flash and light stay alive | Sakurai: the freeze is visual, both fighters |
| Reaction start | 0–2 after impact | flash + blink + directional shake kick + HP ghost; knockback may follow the hit-stop | Emerald: splat and target shake on the same frame |
| Blast → body | 6–10 | sharp blast (6 rays, three value bands), then the element body at full size | saint11 f3 "sharp angles, avoid noise" |
| Dissipation | 12–24 | fire shrinks and breaks into clumps/holes; smoke rises slowly; droplets fall; sparks resolve in 3 f | saint11; Riot "short, don't linger" |
| HP drain | 24–40 | starts with or right after the reaction (today 41 f, fine) | |
| Attacker recovery | 14–24 | **overlaps** the reaction; never delays it | the 16 f residual gap in the research came from `Promise.all` on the lunge |
| **Launch → settle** | ≤ 60 | FX gone and the target at rest (HP drain excluded) | long animations read as repetitive (Cassette Beasts criticism) |

Frame rates: bodies (fire, water, smoke) 12–15 fps; flash and blast 15–20 fps; electric **on twos with
blank frames** (15 fps, blanks at 2 and 5, every other frame after 60 %); flipbooks hold, never tween.

## 2. Hit feedback by severity (all start on the impact frame)

| Severity | Hit-stop | Shake kick (internal px, frames) | Target flash | Knockback (units) | FX light peak | Set dim |
|---|---|---|---|---|---|---|
| Not very effective | 0–2 f | 0–1 px, 6 f | 1 white frame, 2 blinks | 0.14 | ×0.6 | none |
| Normal | **3 f** | 2 px, 8–12 f | 2 white frames + 3 blinks (blink every 4 f) | 0.22 | ×1 | none |
| Super effective | **5–6 f** | 3 px, 12 f | 3 white frames + 4 blinks | 0.30 | ×1.4 | 15–20 % for the move |
| Critical | **8 f** + 1 pre-impact freeze | 4 px, 16 f | 3 white frames, optional 1 inverted | 0.35 | ×1.6 | 20 % |
| KO blow | 10–12 f | 4–5 px, 20 f | hold white 4 f | launch | ×1.8 | 30 %, then fade |

Target flash = the table's white frames (2 normal / 3 super / 3 crit), then blinks every 4 f; the
rest of the hold shows the hurt pose in its own colours (or one inverted frame on a crit). Holding
the sprite white for the whole 6–8 f hold is a whiteout. Shake is a **directional kick**: the first offset is along the hit direction (away from the attacker),
then it decays with one overshoot over 8–16 f in whole internal pixels. Never a sin/cos buzz at
24–30 Hz (today: `round(amount·28)` px alternating every frame, which the strip reads as jitter).
Electric moves dim the **set** (not the sprites, not the FX) 15–35 % so the bolt pops (Emerald dims
the BG to 6/16 for Thunderbolt; Showdown 20 % black for 600 ms). Flashes: ≤ 3 per second, never a
full-screen white (WCAG 2.3.1).

## 3. Orbkin today (measured with this skill's timeline on the real HD-2D game, seed 13, cave)

| Move | Text → launch | Launch → impact | Impact → reaction | Hit-stop | Shake | Launch → settle | Extra draw calls |
|---|---|---|---|---|---|---|---|
| Storm Lance (Spark) | 67 f | 7 f (bolt strike) | **103–104 f** | 0 (4 f on crits: the old 70 ms squash hold) | 10–12 f buzz, 2–3 px, crits only | 129–140 f | +8 (ribbon ×2, star, jolts, grit, crackle, glow ×2) |
| Pyre Crash (Flame, research) | 64 f | 21 f | 109 f | 0 | buzz | ≈ 4.3 s text to idle | +11 |
| Breaker Crush (Tide, research) | 73 f | 39 f | 127 f | 0 | buzz | ≈ 4.3 s | — |

Causes (both verified in the code): `pixelMoveFx` does `tail = await sparkPx(c)` and every element
function ends with `return tail` / `return finish(...)`, so the awaited promise **adopts the tail**
and resolves only when the whole dissipation is over; then `battle.ts` `case 'move'` waits for
`Promise.all([lunge, moveFx, dodge])` before the engine's `damage` event plays `target.hit()`,
`tweenHp` and the shake. The reaction therefore starts 1.7–2.1 s after the strike. See
`references/fx-api.md` §3 for the fix shape.

## 4. Facts from shipped battlers (timings only; never copy code or assets)

- pokeemerald (59.73 fps): Tackle lunge 4 px/frame for 4 f out and 4 f back; hit splat (one 32×32
  star) held **8 f**; target shake `x toggles 3 px ↔ 0 every 2 f, 6 toggles` (12 f); Body Slam 4 px for
  ≈ 24 f; fire flipbook 5 cels × 4 f (**15 fps**); electric 5 cels × 5 f (≈ 12 fps) and a new spark sprite
  every 2 f; Thunderbolt darkens the BG palette to 6/16 and pulses the target dark; the blink after
  `hitanimation` toggles visibility every 4 f for 32 f.
- Pokémon Showdown client (ms): contact attack = 400 ms leap + 100 ms slam; the defender's 100 ms
  knockback is delayed 450 ms, i.e. timed to the slam; Thunderbolt `backgroundEffect(black, 600 ms, 0.2)`.
- saint11 (CC BY 4.0): explosions = FLASH (contrast frame, then white), BLAST (sharp), FIRE (fades
  fast), SMOKE (fades slowly); "needs at least 4 frames"; electricity "must be FAST", "animate in
  alternated frames adding blank frames", "sparks can be resolved in only 3 frames"; impact: "pause
  one frame before the impact, do not pause too long"; fire: new waves every 2–3 frames, bright
  colours at the base.
- Sakurai (Famitsu vol. 490): hit-stop freezes both fighters; about 4 f of it blend flinch → hurt pose;
  the attacker creeps at a near-invisible speed; use it on killing blows.
- Eiserloh (GDC 2016) via Bevy: `trauma += 0.4` per hit, shake = trauma², decay 0.5/s, integer pixel
  offsets, no rotation for pixel art.

## 5. What `fx_timeline` measures (definitions, so before/after tables mean the same thing)

- **text**: first frame the battle text contains "used". **launch**: first frame after it on which an
  FX object (`userData.fx`) enters the scene. **impact**: the frame your code marks with
  `window.__fxEvents.push({ ev: 'impact' })` (do this in your `onImpact` callback); without a marker,
  the first frame after launch on which ≥ 3 FX objects enter at once (today's impact layers).
- **flash**: first frame the target's `material.emissive` ≥ 0.8 (`hit()` sets 1.0 strong / 0.85
  normal). **reaction**: first frame the target `acting`/`busy` flag is set, or it flashes, blinks or
  its HP bar drops. **hit-stop**: the number of frames, the flash frame included, on which the target's pose
  (inner position, body quaternion, body scale) stays bit-identical while its flash is still on
  (a hold of N frames reads N; 0 when the knockback starts on the flash frame); **attacker held**:
  those frames on which the attacker did not move either. **set dim**: 1 − key light intensity /
  idle, peak and frames.
- **shake**: frames with a non-zero camera view offset (whole internal px); *kick* = the first two
  offsets share a sign, *buzz* = they alternate. **settle**: the last frame with an FX object in the
  scene or the target still acting (HP drain and the next move's text are excluded).
- **counters**: **FX draw calls peak** = FX meshes + points in the scene (the budget's number);
  raw draw calls idle (quietest idle frame) vs the peak inside launch..settle, which also moves with
  sprite re-bakes (+2 per acting kin per frame, +2 on bake ticks: informational); linked
  programs idle vs peak; PointLights in the scene per frame and the peak number lit; live points;
  FX objects by kind (`flip` FlipBatch, `points`, `glow` impactGlow disc, `decal`, `mesh3d` = any
  other FX mesh, i.e. a 3D ribbon/primitive).
