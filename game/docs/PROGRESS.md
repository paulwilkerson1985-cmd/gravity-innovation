# Progress

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
