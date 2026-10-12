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

## Number / taste changes vs. the brief
- **2-stage lines evolve at level 18** (not 14): gives the common wild lines a longer first form so early routes stay varied.
- **Starters**: fixed at level 5 with 2 moves; starters do not appear in the wild.
- **Pixel scale**: internal render height targets ~420 px (DPR capped at 2) and is upscaled with `image-rendering: pixelated`.
- **Desperation**: a 35-power Neutral recoil move used automatically when every move is out of PP.
- **Drowsy** lasts 1–3 lost turns; **Shock** = ½ Speed + 25% skip; **Burn** = ½ Attack + 1/16 HP per turn.
- **Starting bag**: 10 Orb, 3 Bright Orb, 1 Star Orb. Catch menu shows the live catch % per orb ("readable odds").
- **Blackout**: party is healed and you return to the route (no money loss in v1).
- **Saves deferred to M3**: the slice keeps state in memory only.

## Engine (M3–M5)
- **XP**: yield = ⌊xpYield·L/7·(1.5 if trainer)⌋, split evenly (floor, min 1) among side-0 participants still conscious at battle end. PvP gives none. Level cap 30; XP stops at 30³.
- **Level-up**: current HP rises by the max-HP gain (fainted stays at 0). Learnset moves at exactly the new level auto-learn if < 4 known, otherwise a `moveOffer` event; the game calls `learnMove(c, id, slot | null)`.
- **Evolution** is opt-in: `gainXp` emits `canEvolve`; the game calls `evolve(c)` (keeps moves/XP/nickname, HP + max-HP gain).
- **Items**: Tonic 20 HP (200), Mega Tonic 60 HP (600), Full Tonic full HP (1500), Remedy Leaf cures status (250), Rekindle Seed revives at ½ HP (1500). In battle an item takes the turn and acts before switches (priority 30 vs 20). Only legal when it would do something. Engine never counts the bag.
- **Battle rules** live in `BattleState.rules`: wild = items/catch/run, trainer = items, pvp = none (overridable per battle).
- **Ace AI**: 1-ply search — each move (plus one switch out of a clearly bad matchup) vs the foe's two likeliest replies × 2 derived seeds via `resolveTurn` on clones; positions scored on HP, KOs, status, stages and the active 1-v-1 outlook; score = ½ mean + ½ worst reply. Won't voluntarily switch within 2 turns of its last switch (`Side.lastSwitchTurn`). ~66% vs Skilled in mirror matches, < 1 ms/decision.
- **Trainers**: meadow Pim (rookie), ridge Brann + Sola (skilled), coast Merrow (skilled) + Tavi (ace), Crown Plateau Champion Vale (ace, 6 kin L26–30, all six elements). Routes unlock after all trainers of the previous route.
- **Arena**: L30, exactly 3 kin, no duplicate species, 1–4 moves learnable by L30; 12 rentals.

## Adventure (M3–M4)
- **XP timing**: XP is awarded once, at the end of a won battle (engine `awardXp` → `gainXp`), not per faint — battle stats never change mid-fight and a trainer battle reads as one "results" sequence. **Catching gives no XP** (classic rule: only fainted foes count). Losing or running gives none.
- **Results order** after a win: "X gained N XP!" per kin (animated XP bar for the kin on the field, level-up card with stat deltas, auto-learned moves, forget-a-move prompt) → trainer walks back on, defeat quote → coins → "A new route is open: …" → evolutions → Hall of Fame (Champion). The end menu offers "Travel to <new route>".
- **Text pacing** (`settings.textSpeed`): typewriter at 40 / 75 / 170 chars/s and hold × 1.6 / 1 / 0.5 for slow / normal / fast. First tap completes the line, second tap advances.
- **Bag**: one *Bag* button with Orbs / Items tabs (Orbs first in wild battles, Items first vs trainers; the last tab is remembered per battle). Orbs show the live "≈ N% catch"; vs trainers they're disabled with "You can't catch another trainer's kin!". Items list only what you own; an item is enabled only if some party member would be affected, and targets that wouldn't are greyed ("No effect"). *Run* vs trainers stays visible but explains "There's no running from a trainer battle!".
- **Trainers**: no rematches; a beaten trainer's hotspot shows their defeat line. After becoming Champion, Vale's hotspot reopens the Hall of Fame. Rewards are paid once (`trainerVictory` is idempotent). Money is shown as "coins".
- **Blackout**: party healed, back to the route, no money or item loss; the trainer gets a short taunt.
- **Evolution**: glow to a white silhouette (0.7 s), then flicker old/new with intervals 520 ms × 0.84 down to 55 ms over ~5.2 s, rays speeding up, then a flash and burst. *Skip* finishes instantly, *Stop* cancels (it asks again at the next level-up, since `gainXp` re-emits `canEvolve`). Several evolutions from one battle play back-to-back; the evolved form is registered as caught in the bestiary.
- **Route maps**: wild patches take the front-left/right slots, caves always the back slot (so they never hide a trainer); trainers stand on red pads (green + check badge when beaten, figure greyed). Each trainer has its own palette/hat/prop (Pim ranger hat, Brann beanie + pack, Sola headband + staff, Merrow sou'wester + rod, Tavi goggles + scarf, Vale crown + cape). Locked tabs show a lock and "Beat <names>".
- **Battle camera**: your own kin is turned 0.55 rad toward the camera — a readable 3/4 back view instead of a rear end. Big hits (super effective / crit) add a short camera shake; damage leaves a pale "ghost" chunk on the HP bar that drains after 0.35 s.
- **Champion difficulty** (headless check, 15 seeds × 3 all-L30 fully evolved parties): greedy "strongest move" play wins 2/15, Ace-style play (switching out of bad matchups) wins 10/15. Vale is meant to be the hardest fight; Full Tonics and smart switching matter. The e2e plays it via `__game.debugSuggest()` (Ace advice) through the real UI.
- **Hall of Fame**: highest-level kin on the tallest gold centre podium, the rest alternate outwards; confetti, rays, stats (play time, caught, seen, trainers) and a looping credits roll; *victory* jingle then the title theme.

## Meta (M3)
- **Save format**: one slot, `{ format: 'orbkin-save', schema, savedAt, data: PlayerState }`. `schema` = `PLAYER_STATE_VERSION`; `MIGRATIONS[n]` upgrades n→n+1 (v1→v2 maps `unlockedRoutes` to the gate trainers that must have been beaten, sets `lastRoute` to the furthest unlocked route, zero play time, default settings). Bare `PlayerState` JSON (with `v`) is also accepted on import.
- **Validation**: structural problems (no party, unknown species/moves, bad levels, negative money, duplicate uids, junk bag counts) reject the save with a friendly `SaveError`; harmless oddities are repaired (unknown bestiary ids dropped, PP/HP clamped, retired items dropped, `nextUid` raised above every uid, unknown route → meadow, caught ⊆ seen enforced).
- **Storage**: IndexedDB → localStorage → memory. A failing backend is demoted for the session; reads take the newest valid copy across all backends, so a session that fell back to localStorage never loses to an older IndexedDB copy.
- **Autosave**: debounced 300 ms; triggered on entering a route (covers starter choice and post-battle returns), every party/box/bag/shop change, settings, and immediately on tab hide / pagehide. `game.save()` never throws.
- **Saves are opt-in per session**: only *New adventure* / *Continue* on the title enable saving and play-time tracking. `?scene=` entry points (tests, debug) never read or overwrite the save, and the title never auto-continues — so `?seed=` tests stay deterministic. An explicit menu Save always writes.
- **New adventure with an existing save** asks for confirmation; the old save is only replaced when the new adventure first saves (backing out before picking a starter keeps it).
- **Play time** counts whole seconds while an adventure is running, the tab is visible and the title isn't showing.
- **Text speed** is stored both in the save and as a device preference; the last value chosen on the device wins on load. `textSpeedFactor(player)` (slow 1.6×, normal 1×, fast 0.45×) is exported for the battle text box. Audio volumes stay in the audio module's own storage; reduce-motion is a device preference (defaults to the OS setting) that disables UI animations and slows the meta turntables.
- **Party rules**: a kin can go to the box only if another conscious kin stays in the party; withdrawing needs a free party slot (max 6). Bag stacks cap at 99; the shop's quantity picker clamps to what you can afford and carry.
- **Menu screens** (party, bestiary, bag, box, shop) share one stage: pastel sky, a cream turntable stand and a single model (≤ 5 draw calls) framed from its bounding box; panels left/right in landscape, stacked under the model in portrait. Opened from the menu, Back (or Esc) returns to `player.lastRoute` and reopens the menu.
- **Bestiary**: unseen = locked "???" tile, seen = flat dark silhouette (unlit material) + name + where it was spotted, caught = full model, types, base-stat bars, blurb, evolution chain with levels, habitats (route · spot · level band · Common ≥ 35% / Uncommon ≥ 12% / Rare of that hotspot's table).

## Arena (M5–M6)
- **Scenes**: `arena` (lobby, hotseat names, online lobby, team builder), `arenaBattle` (hotseat / vs CPU / online playback), `arenaVictory` (podium, confetti, stats, Rematch / New teams / Exit). Pure logic lives in `scenes/arenaTeam.ts` (builder rules) and `scenes/arenaFlow.ts` (turn collection + curtain rules) and is unit-tested. Rendering is copied/adapted from the adventure battle, not shared, so the two can evolve independently.
- **Builder**: tap a kin to add it (refusals explained: team full, duplicate species); slot 1 is the lead (◀/▶/Make lead/Remove); moves are toggled from everything learnable by L30 (1–4 kept). Owned kin keep their nickname and moves (illegal ones cleaned, empty → L30 defaults) and show "Lv 12 → 30"; entering the Arena from the title borrows the saved adventure's kin read-only. Friendly problem text first, `validateArenaTeam` is the final gate. "Random" fills three rentals.
- **Hotseat privacy**: P1 chooses → full-screen opaque curtain "Pass to P2" → P2 chooses → curtain "both locked in" → shared playback. Before every curtain the menu and text box are emptied, so nothing of the previous choice is in the DOM. Replacements follow the same rule; a lone replacement needs no curtain (nothing else is pending), and a forfeit ends the match immediately. The CPU (Ace AI) decides from the pre-turn state, never seeing the human's pick.
- **Perspective**: P1 (coral) is always on the near platform in hotseat/CPU; online, *you* are near. Seat colours: coral `#ff5d73` / blue `#3d9bff` on platforms, panels, banners, curtain and podium.
- **Stage**: dusk stadium — sand field with a two-colour centre emblem, banner wall, three tiers of block spectators (two merged meshes that bounce alternately when the crowd cheers on super-effective hits and KOs), light towers, pennants. ~10 draw calls for the set.
- **Online model**: server-authoritative rooms (`server/room.ts`), 4-letter codes from 20 consonants (no I/O/0/1, no accidental words), server-side seed, `isLegal` per action, choices hidden until both commit, `step` counter against stale clicks. Turn timer 45 s + playback allowance (≤ 30 s, cut short when both clients send `ready`); timeout → random legal move (never forfeit), 3 consecutive → forfeit. Seat tokens (128-bit) for resume; `sessionStorage` lets a reloaded page rejoin. Rematch needs both votes; "New teams" sends both back to the builder with their previous team prefilled. See `docs/ONLINE.md`.
- **Validation without a schema library**: `parseClientMessage` checks every field (ids `[a-z0-9-]`, ints in range, names cleaned of control/zero-width chars, ≤ 16 chars), 4 KB cap, token bucket per socket.
- **Stats** on the victory screen: turns (engine turn count), KOs per side (faint events credited to the opponent), remaining HP per kin.
