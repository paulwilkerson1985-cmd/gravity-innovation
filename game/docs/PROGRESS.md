# Progress

## 2026-10-16 — Ashkit gate 2: pre-rendered sheets beat the static art in battle
- Applied the gate-1 fixes with the owner defaults: −12° back camera with a back-view head turn, dark ear backs, a simpler mouth and chin, hind legs under the hips, a deeper crouch and faint paws on the ground. Re-rendered and packed all 84 frames. The game's hit strobe now waits 100 ms so the contact frame shows the hit. Details: `art/ashkit/review/GATE2.md`.
- Evidence: frozen-clock captures (cave and meadow, desk and phone) against the static D still in the same build. Round 2 is `better` on 4/4 shots, with crop votes 16/16 (gate 1: 0/16). Floors pass, `ip_check` is PASS. Unsealed, so queued for the owner. Motion: the Bump strip judge still prefers the static art's lunge, 0/4 (weak canary). The contact-frame fix is verified on the frames (the foe stays drawn f75-f80). `npm run verify`: 290 unit tests; Playwright 99 passed, 25 skipped, 0 failed.

## 2026-10-15 — UI skin: slab2 (owner's pick)
- The whole HTML UI (battle HUD, command/move menus, title, starter, route, menu hub, party/box/bestiary/bag/shop, settings, arena, Hall of Fame) now uses the HD-2D slab: dark translucent 9-slice panels with a one-texel gold hairline and the Alegreya superfamily (six vendored OFL woff2, awaited before the first scene). Pixel font retired from every screen. Decision, vote counts and numbers: `docs/DECISIONS.md` "UI skin: slab2"; system: `docs/UI.md`; before/after: `docs/screenshots/ui-slab/`.
- Evidence: `npm run verify` (typecheck, lint, unit tests, build, Playwright incl. `e2e/layout.spec.ts` one-line labels / floors / overlaps on 4 viewports); `legibility.mjs` floors all PASS; UI-only judge 8/8 `better` (cave/meadow/volcanic/coast, desktop + phone), battle canvas frames byte-identical.

## 2026-10-15 — Graphics pass 1 integrated (`?gfx=hd2d`)
- Merged `gfx1/battle-feel` (hits land on the impact frame, directional camera kick plus a Screen shake & flashes setting, pixel-rigid pans, keyed attack cels, hurt cels, blink cels) and `gfx1/world-ui` (shallows band water, UI readability floors, HD-2D battle-in transition, title/starter depth band). The two pan-lock implementations were unified on one view-offset path (`docs/DECISIONS.md` "Graphics pass 1 integrated").
- Evidence: `npm run verify`: typecheck, lint, 289 unit tests, build and Playwright (99 passed, 25 skipped, 0 failed). Overall blind check of 10 frames, merged build vs the build before the pass: preferred in 29 of 30 votes and in every pair except one 2–1. By the strict rule no pair was decisive (confidence 2.0–3.0, gap ≤ +0.67). The calibration pair passed. Draw calls max 62. Sheets and a hit MP4 are in `docs/screenshots/gfx1/`.

## 2026-10-14 — HD-2D battle feel: hit timing, camera, animation
- the hit reaction now plays on the impact frame (it came 1.7–2.1 s late); strong hits kick the camera along the blow instead of buzzing; a Screen shake & flashes setting (follows reduced motion); whole-pixel pans keep sprites and dither on the content; attacks play as per-body-type key tables in pose-aligned cels; hurt plays as cels with one strongest frame; blinks are drawn cels on the bake clock. Decisions and numbers: `docs/DECISIONS.md` "Battle feel". Hit-stop, impact flipbooks, an FX point light and a 15 fps wing/flame clock were tried and reverted (no detectable difference or lost).
- Evidence: impact → reaction 0–1 frames on flame/tide/spark (was 98–127); kick trace: 1 rebound and settled in 8 frames (old buzz: 10 sign flips in 11 frames); pan residual 1.9 → 0.02–0.07, sprite rects 8.5–8.9 → 0.02–0.05; judges: lunge 2 decisive wins, 3 no-difference, 0 losses (canary 3–0); judges: hurt 3–0 on all three strips; blinks fully shut 0% → 100% (1,019 simulated). `npm run verify` before each commit.

## 2026-10-14 — Graphics pass 1 (`?gfx=hd2d`): water, UI readability, battle-in (branch `gfx1/world-ui`)
- **Shallows water**: flat-band pixel water (crescent highlights, solid lace, stepped 8 fps clock) + the lace's land side painted on sand/rock/posts (`waterline()`). Coast tried and reverted (lost the phone frame); cliff keeps the glitter sea. Decision and votes: `docs/DECISIONS.md` "Graphics pass 1".
- **UI readability**: the 10px information tier is retired (15px phones / 20px desktop), chip/badge fills ≥ 4.5:1, HP numbers under the HP bar; the gate's capture harness and `e2e/layout.spec.ts` (`hudIssues`) check one line box per label, no info-box overlap, kin uncovered and the x-height floor. Gate 14/14 decisive; the layout spec passes on desktop/phone/small/landscape.
- **Battle-in**: grade-pass transition (grey pulses, terrain × threat wipe, iris on the foe during a locked whole-pixel intro pan, white-silhouette kin) replaces the CSS curtain in HD-2D; pan locks for sprites + dither. Gate 3/3 desktop and phone strips; 1 flash/s; `tests/transition.test.ts`.
- **Title / starter depth band** (tilt-shift band, full radius on phones): 4/4 decisive.
- Evidence: blind pairwise gate (3 judges, randomised order, calibration pair 3/3 correct): shallows desktop crop, phone frame and phone crop decisive wins (3/3, conf 3.3–4.0, gap +1.17…+2.67), desktop frame no difference; cliff frames byte-identical; draw calls unchanged.

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

## 2026-10-16: Handoff
- Graphics pass 1, the slab UI and five project skills are on the branch.
- The art direction moved to smooth Blender-toon creatures on smooth arenas, chosen by owner votes.
- An Ashkit pre-rendered vertical slice is in `art/ashkit/`, gated as not accepted yet, with prioritised fixes.
- Next steps are in `docs/HANDOFF.md`.
