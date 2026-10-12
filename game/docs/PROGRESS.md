# Progress

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
