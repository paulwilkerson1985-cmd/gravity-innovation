# Progress

## 2026-10-14 — HD-2D battle feel: hit timing, camera, animation
- the hit reaction now plays on the impact frame (it came 1.7–2.1 s late); strong hits kick the camera along the blow instead of buzzing; a Screen shake & flashes setting (follows reduced motion); whole-pixel pans keep sprites and dither on the content. Decisions and numbers: `docs/DECISIONS.md` "Battle feel".
- Evidence: impact → reaction 0–1 frames on flame/tide/spark (was 98–127); kick trace: 1 rebound and settled in 8 frames (old buzz: 10 sign flips in 11 frames); pan residual 1.9 → 0.02–0.07, sprite rects 8.5–8.9 → 0.02–0.05. `npm run verify` before each commit.

## 2026-10-13 — HD-2D reference pass 2 (`?gfx=hd2d`): rock, outdoor light, sprites, night sets
- Craggy faceted rock kit with chunk textures and irregular walls (cave reframed with an open lit stage, left-window shafts and a furnished lodge; volcanic basalt column wall with lava joints; hollow dappled key on the kin). Outdoor/sea arenas: one low warm key with a world-space gobo (focal pool, leaf dapple, drifting cloud shadows), phone ground aprons, the cliff's painted sky/headlands/fog bands, layered mesas, rock-clump sea stacks. Sprites: five-tone hue-shifted ramp, selective outline + rim, emissive flame/magma kin with floor glows; tailored trainer outfits. Night sets: hardwood stadium court with floodlight cones, victory spotlight, HoF line-ups, marble dais. Bloom soft knee; flame/tide FX; phone move grid fixed 2×2. Design: `docs/HD2D.md` "Reference pass 2"; decisions: `docs/DECISIONS.md`.
- Evidence: typecheck, lint, 275 unit tests ✓; e2e hd2d, hd2d-arenas, hd2d-coast, hd2d-screens, hd2d-summit, smoke, layout, arena on desktop + phone against the integrated build; draw calls 37–78 per frame (< 100); 0.000% clear-colour leak in the bottom 35% of phone frames for the six outdoor/sea arenas.

## 2026-10-13 — HD-2D screens (`?gfx=hd2d`): title, starter, route maps, menu screens, evolution
- Every non-battle screen now renders through the HD-2D pipeline as a small pixel-art diorama with the battle's baked sprites: golden-hour flower-field title with a whole-texel camera drift, starter daises in the meadow clearing with a light shaft on the chosen one, a floating-island diorama per route (painted island top, boulder rim and underside, ledges/crags, foliage, voxel hotspots, lava river + lavafall, lagoon, Champion dais, painted sky + pixel clouds, shadowed key light), a warm stone room with a plinth for party/box/bestiary/bag/shop, the same room at dusk for evolution. DOM UI, flows and testids unchanged; default renderer unchanged. Design and numbers: `docs/HD2D.md` "Screens"; decisions: `docs/DECISIONS.md` "HD-2D screens".
- Evidence: `e2e/hd2d-screens.spec.ts` (title → starter → confirm → route; all four maps; menu; party/box/bestiary/bag/shop; evolution; desktop + phone; perf non-null, < 100 calls: 27–58 measured; no console errors) ✓; smoke/adventure/meta/layout ✓ (default path); typecheck, lint, 275 unit tests ✓. Captures: harness `screens` group (12 shots).

## 2026-10-13 — HD-2D prototype (`?gfx=hd2d`, Ember Ridge + cave battles)
- New art-direction pipeline behind a flag: pixel-art cave arena (terraced boulder walls with a texel bevel, lodge, stairs with rails, rubble, window), cookie-spot key light with soft shadows, light shafts + dust, bloom/ACES/warm grade/tilt-shift/vignette/dither at a low internal res, kin/player/trainer as live sprite bakes with outlines. Default rendering untouched. Design, API, numbers, gaps and rollout: `docs/HD2D.md`.
- Evidence: `e2e/hd2d.spec.ts` (trainer + wild cave turn, desktop + phone, no console errors, non-blank, < 100 calls: 44–52 measured), all unit tests ✓, full Playwright suite ✓; sheets in `docs/screenshots/hd2d/`.

## 2026-10-12 — Final polish before the owner playtest
- Art-direction re-audit (24 items) and human-style playtest (A–J) fixed: missed attacks whiff, champion speech fits (growing/paged text box), phone panels/menus/hotspots never clip, pinned party bar, starter/evolution/HoF/meta framing, hotseat per-player perspective + hand-over curtain, distinct online names, title rejoin, anti-mash, wild coin rewards, lava channel. Decisions in `docs/DECISIONS.md` ("Final polish").
- Evidence: `e2e/layout.spec.ts` "text & labels never clip" (4 viewports) and "every species as foe stays on screen" (phone/small/landscape); unit tests for `wildVictory`, hotseat curtains, server name de-dupe; before/after sheets in `docs/screenshots/final/`.

## 2026-10-12 — Adventure layer (M3 XP/evolution, M4 trainers/items/Champion)

**Evidence:** typecheck ✓, lint ✓, 183/183 unit tests ✓ (incl. 13 in `tests/progress.test.ts`), build ✓, Playwright `smoke` + `adventure` 10/10 ✓ on desktop 1280×720 and Pixel 7 portrait, zero console errors, < 100 draw calls asserted.

- **Battle**: Fight / Bag (Orbs with live catch odds, Items with party targets) / Kin / Run; keyboard arrows, Enter, Esc/x back, 1–9 picks; typewriter text honouring text speed; HP ghost drain, XP bar, party pips, status badges, camera shake on big hits; full audio wiring (music per context, menu/hit/catch/status/XP sfx, cries).
- **Trainers**: distinct low-poly figures on the route map (✓ badge + greyed when beaten), intro/defeat lines, coins, route unlock announcements + "Travel to"; blackout heals with no penalty.
- **Progression**: animated XP, level-up cards with stat deltas, auto-learn, forget-a-move prompt; evolution scene (Skip / Stop, queued); Champion → Hall of Fame (podiums, confetti, credits). Screenshots: `screenshots/*-adv-*.png`.
- **Routes**: all four themed (meadow fence + pond, ridge vents + lava, coast palms + sea, plateau dais + crown arch); locked tabs say who to beat.
- Known: Champion Vale is hard for greedy play (see DECISIONS); full-suite runs of other agents' specs can time out under heavy parallel load (pass in isolation).

## 2026-10-12 — M0, M1, M2 complete (stopped for review)

**Evidence (`npm run verify`):** typecheck ✓, lint ✓, 36/36 unit tests ✓ (8 files), production build ✓ (≈149 KB gzip JS), Playwright smoke 4/4 ✓ on desktop 1280×720 and Pixel 7 portrait, zero console errors, canvas non-blank, < 100 draw calls asserted.

- **M0:** Vite/TS/Vitest/ESLint/Playwright scaffold; `npm run verify`; URL params + `window.__game`; creature gallery (`?scene=model`) renders all 18 species — `screenshots/m2/desktop-10-gallery.jpg`.
- **M1:** pure engine + tests (type chart, damage bounds, catch statistics over 40k seeded trials, deterministic replay, 1,000 AI-vs-AI battles), Rookie + Skilled AI, `npm run sim` (500 3v3 battles: Skilled 364 – Rookie 136, ≈1.3 ms/battle).
- **M2:** title → starter → Mossy Meadow route map → wild battle (Fight / Catch / Kin / Run) → shake-and-click catch → party view — `docs/screenshots/m2/*`.

### Art critique (from screenshots)
- Good: chunky flat-shaded silhouettes, saturated palette, pixel-crisp upscale reads well especially on phone; one draw call per creature; ~23–38 calls per scene.
- Fixed during review: phone battle was framed too wide/fogged; gallery camera used the wrong distance; serpent (Maelstrode) read as a totem pole → S-curved coils; orb too small.
- Still weak: back-view of your own creature is a bit plain; no hit projectiles per type yet (just flashes/bursts); title logo uses system font.

### Known issues
- No XP/levels, evolution, saves, trainers or items yet (M3/M4). Wild battles give no reward beyond catching.
- Ember Ridge / Squall Coast exist in data but are locked in the UI.
- No audio yet (M6). FPS not yet measured on real phones; headless SwiftShader shows ~45 fps at 1280×720.
