# Orbkin — agent notes

Low-poly creature collector & battler. Three.js + TypeScript + Vite. Lives in `game/` (the parent repo is an unrelated physics project).

## Commands
- `npm run dev` — dev server · `npm run build` — static site in `dist/`
- `npm run verify` — typecheck, lint, unit tests, build, Playwright smoke. **Run before every commit.**
- `npm run sim -- --battles 200 --a skilled --b rookie [--verbose]` — headless battles
- Screenshots from the smoke test land in `screenshots/` — open them and critique.

## Layout
- `src/engine/` — pure rules engine. **No DOM, no `three`, no `Math.random`, no `Date.now`** (ESLint enforces). `resolveTurn(state, actions) → { state, events }`; state is plain JSON, rng state lives in `BattleState.rng`.
- `src/data/` — species, moves, routes (validated by `engine/dex.ts` at load and in tests).
- `src/game/state.ts` — player state (party, box, bag, bestiary) as pure functions.
- `src/render/` — renderer, procedural creature generator (`creature.ts`), scenery, tweens, FX.
- `src/scenes/` — one class per scene; `BaseScene.exit()` disposes GPU resources.
- `src/ui/dom.ts` — tiny DOM helpers; menus are HTML over the canvas.
- `src/debug/hooks.ts` — `window.__game` for tests.

## Rules
- Rendering/UI only *play back* engine events; never compute outcomes in scenes.
- New content goes in `src/data/*` and must pass `validateContent`. All names original (see banned list in `tests/content.test.ts`).
- Keep draw calls < 100 (merge static props with `MeshBuilder`; 1 mesh per creature).
- Touch targets ≥ 44px; every action reachable by mouse, keyboard, touch.
- Log taste/number changes in `docs/DECISIONS.md`; tick `docs/PLAN.md` only with evidence; update `docs/PROGRESS.md`.

## Graphics
Before changing how anything looks or moves, read `docs/GRAPHICS_PLAYBOOK.md` (decisions, look bible, budgets) and use the project skills in `../.claude/skills/`: `orbkin-art-direction` (what to change), `orbkin-render-look` (pipeline/post/camera/perf), `orbkin-sprite-creature` (kin and people), `orbkin-battle-vfx` (move FX, hit feedback) and `orbkin-visual-gate` (capture and blind judge; every visual change ends here). Research notes: `docs/research/graphics/README.md`.

## Test hooks
URL: `?seed=N`, `?scene=title|starter|route|battle|party|model`, `?debug=1` (fps/draw calls), plus scene args (`route=`, `hotspot=`, `species=`).
`window.__game`: `scene()`, `player()`, `battle()`, `goto()`, `setFast()`, `skip()`, `waitIdle()`, `canvasStats()`, `renderInfo()`.
