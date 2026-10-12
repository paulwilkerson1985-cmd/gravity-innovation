# Plan

Boxes are ticked only with evidence (test output or screenshot) recorded in `PROGRESS.md`.

## M0 Scaffold
- [x] Vite + TS build, Vitest, ESLint (engine purity rules), Playwright smoke
- [x] `npm run verify` (typecheck, lint, tests, build, smoke)
- [x] CLAUDE.md, docs (PLAN, DECISIONS, PROGRESS), ASSETS.md
- [x] Test hooks: `?seed=`, `?scene=`, `?debug=1`, `window.__game`
- [x] One low-poly creature renders

## M1 Headless battle engine
- [x] Seeded PRNG in state, serializable state
- [x] Type chart, damage, STAB, crit, PP, priority + speed order, faint/win
- [x] Status + stat stages (engine level)
- [x] Catch + run (engine level)
- [x] Rookie AI
- [x] CLI simulator
- [x] Tests: type chart, damage bounds, catch statistics, deterministic replay, 1000 AI-vs-AI battles

## M2 Vertical slice
- [x] Title → starter pick → route map → wild battle (Fight/Catch/Run) → catch → party view
- [x] Battle diorama, HP bars, text box, idle bob + squash-and-stretch, shake-and-click catch
- [x] Smoke test drives the slice and screenshots each scene
- [x] **Report & stop for review** (awaiting feedback)

## M3 Progression
- [ ] Full roster (18) and moves (30) in data, XP + leveling, move learning
- [ ] Evolution + skippable transformation sequence
- [x] Bestiary, storage box, save/load (IndexedDB, versioned, migrations, export/import) — tests/save.test.ts, e2e/meta.spec.ts

## M4 Depth
- [ ] Switching UI, items, status UI, trainers, Skilled + Ace AI, Champion

## M5 PvP hotseat
- [ ] Team builder (collection/rentals), level-30 arena rules, pass-the-device curtain, victory screen

## M6 Online PvP & polish
- [ ] `ws` server running `src/engine`, room codes, hidden commits, timer, reconnect
- [ ] Audio, mobile pass, performance pass, production deploy
