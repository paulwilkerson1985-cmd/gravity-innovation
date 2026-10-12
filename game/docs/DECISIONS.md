# Decisions

## Working title
**Orbkin** — wild creatures ("kin") are befriended with orbs. Checked against major creature-franchise names: no collision known.

## Location in repo
The host repo (`gravity-innovation`) is an unrelated physics project, so the game lives in a self-contained `game/` folder. All paths in these docs are relative to `game/`.

## Encounter structure (≤ 1 page)

| Criterion (1–5, higher is better) | (a) Menu + 3D battle diorama, route map of tappable hotspots | (b) 2D side-view walking overworld | (c) Hybrid: (a) + short auto-walk "explore" animation along the route |
|---|---|---|---|
| Time to playable slice | 5 — no movement, collision or camera code | 2 — controller, tile/level data, collision | 4 — (a) plus a tween |
| Fit with Three.js | 5 — fixed-camera dioramas are Three's sweet spot | 3 — 2D side-scroll fights an ortho camera and sprite workflow | 5 |
| Scope & asset risk | 5 — procedural props, one camera per scene | 2 — needs tilesets, animation, level design | 4 |
| Mobile / touch | 5 — tap a hotspot, big HTML buttons | 2 — virtual d-pad is clumsy on phones | 5 |
| "Go find creatures" fantasy | 3 — choosing a grass patch/cave sells it moderately | 5 — walking into grass is the classic feel | 4 |
| Reuse for PvP | 5 — battle diorama is shared 1:1 | 4 | 5 |
| **Total** | **28** | **18** | **27** |

**Choice: (a)** with a lightweight route map: each route is a small fixed-camera low-poly diorama with tappable patches (tall grass, cave mouth, water, trainer). Hotspots are also listed as HTML buttons for keyboard/touch/accessibility and for Playwright. The hybrid's walk tween can be added later as polish without changing structure.

## Stack
- **Vite + TypeScript (strict)**, vanilla **three** with an **HTML/CSS overlay** for menus. No UI framework: the screens are few and simple.
- **Vitest** for engine tests, **Playwright 1.56.1** (pinned to match the preinstalled Chromium) for the smoke test.
- **ESLint** enforces engine purity: in `src/engine` and `src/data`, `three`, DOM globals, `Math.random`, `Date.now` are lint errors.
- **tsx** runs the CLI simulator (`npm run sim`).
- Data validation is hand-written (no zod) to keep the bundle small; validators run at load time and in tests.
- Online PvP (M6, planned): tiny Node `ws` server that imports the same `src/engine`.

## Engine
- `resolveTurn(state, actions) → { state, events }`, state is plain JSON (deep-cloned on entry, never mutated in place).
- PRNG: **mulberry32**, its 32-bit state stored in `BattleState.rng`. AI decisions use a PRNG *derived* from (state.rng, turn, side) so choosing does not advance the battle stream — replays stay identical regardless of who chose the action.
- Damage: classic level/power/A÷D shape, ×STAB 1.5, ×type, ×crit 1.5 (1/16), ×random 0.85–1.00, min 1.
- Stats: HP = ⌊2·B·L/100⌋ + L + 10; others = ⌊2·B·L/100⌋ + 5. No IVs/EVs in v1 (simpler balance; variation can come later).
- No physical/special split (spec default): Attack vs Defense only.
- Stat stages ±3 with multiplier (2+s)/2 or 2/(2−s).
- Status: **Burn** (½ Attack, 1/16 max HP per turn), **Shock** (½ Speed, 25% chance to be unable to move), **Drowsy** (asleep 1–3 turns). One status at a time.
- Run (wild only): auto-succeeds if your Speed ≥ foe's, else chance (128·S_you/S_foe + 30·attempts)/256.
- Catch: spec's Gen-III-style formula exactly; orbs **Orb** 1×, **Bright Orb** 1.5×, **Star Orb** 2×.

## Rendering
- Creature models are procedural: body + parts from primitives, flat-shaded with vertex colours and **merged into one mesh per creature** (1 draw call). Evolution = bigger scale + extra parts + richer palette.
- Pixel-crisp look: internal render scale 0.5 of the (DPR-capped-at-2) canvas, upscaled with `image-rendering: pixelated`.
