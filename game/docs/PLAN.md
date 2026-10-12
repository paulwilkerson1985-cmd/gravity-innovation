# Plan

Boxes are ticked only with evidence (test output or screenshot) recorded in `PROGRESS.md`.

## M0 Scaffold
- [ ] Vite + TS build, Vitest, ESLint (engine purity rules), Playwright smoke
- [ ] `npm run verify` (typecheck, lint, tests, build, smoke)
- [ ] CLAUDE.md, docs (PLAN, DECISIONS, PROGRESS), ASSETS.md
- [ ] Test hooks: `?seed=`, `?scene=`, `?debug=1`, `window.__game`
- [ ] One low-poly creature renders

## M1 Headless battle engine
- [ ] Seeded PRNG in state, serializable state
- [ ] Type chart, damage, STAB, crit, PP, priority + speed order, faint/win
- [ ] Status + stat stages (engine level)
- [ ] Catch + run (engine level)
- [ ] Rookie AI
- [ ] CLI simulator
- [ ] Tests: type chart, damage bounds, catch statistics, deterministic replay, 1000 AI-vs-AI battles

## M2 Vertical slice
- [ ] Title → starter pick → route map → wild battle (Fight/Catch/Run) → catch → party view
- [ ] Battle diorama, HP bars, text box, idle bob + squash-and-stretch, shake-and-click catch
- [ ] Smoke test drives the slice and screenshots each scene
- [ ] **Report & stop for review**

## M3 Progression
- [ ] Full roster (18) and moves (30) in data, XP + leveling, move learning
- [ ] Evolution + skippable transformation sequence
- [ ] Bestiary, storage box, save/load (IndexedDB, versioned, migrations, export/import)

## M4 Depth
- [ ] Switching UI, items, status UI, trainers, Skilled + Ace AI, Champion

## M5 PvP hotseat
- [ ] Team builder (collection/rentals), level-30 arena rules, pass-the-device curtain, victory screen

## M6 Online PvP & polish
- [ ] `ws` server running `src/engine`, room codes, hidden commits, timer, reconnect
- [ ] Audio, mobile pass, performance pass, production deploy
