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
- Creature models are procedural: body + parts from primitives, flat-shaded with vertex colours and **merged into one mesh per creature** (1 draw call). Each species has a bespoke builder and every evolution stage changes the silhouette — see `docs/CREATURES.md`.
- Creature designs (concept, silhouette, signature part, palette and stage escalation for all 18 species) live in `docs/CREATURES.md`; bespoke builders in `src/render/creatures/`.
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

## Meta (M3)
- **Save format**: one slot, `{ format: 'orbkin-save', schema, savedAt, data: PlayerState }`. `schema` = `PLAYER_STATE_VERSION`; `MIGRATIONS[n]` upgrades n→n+1 (v1→v2 maps `unlockedRoutes` to the gate trainers that must have been beaten, sets `lastRoute` to the furthest unlocked route, zero play time, default settings). Bare `PlayerState` JSON (with `v`) is also accepted on import.
- **Validation**: structural problems (no party, unknown species/moves, bad levels, negative money, duplicate uids, junk bag counts) reject the save with a friendly `SaveError`; harmless oddities are repaired (unknown bestiary ids dropped, PP/HP clamped, retired items dropped, `nextUid` raised above every uid, unknown route → meadow, caught ⊆ seen enforced).
- **Storage**: IndexedDB → localStorage → memory. A failing backend is demoted for the session; reads take the newest valid copy across all backends, so a session that fell back to localStorage never loses to an older IndexedDB copy.
- **Autosave**: debounced 300 ms; triggered on entering a route (covers starter choice and post-battle returns), every party/box/bag/shop change, settings, and immediately on tab hide / pagehide. `game.save()` never throws.
- **Battles and saves**: a battle is saved as a whole. Entering a battle flushes any pending autosave and pauses autosave (pagehide/visibility too); spent orbs/items, battle HP and the outcome are written together when it ends. Closing the tab mid-battle therefore resumes from just before the battle (no half-applied state). At the end, *all* results — caught kin, XP/levels, trainer win, money, route unlocks, blackout heal — are applied to the player and saved immediately, *before* the messages play back; move choices made in the forget-a-move prompt are saved again afterwards.
- **Leaving to the title** (menu *Quit to title*, Hall of Fame *Title screen*, Arena *Back to title*) ends the adventure in memory: a pending autosave is flushed, then saving/play time stop and the in-memory player is dropped, so a later import or a pagehide can't be overwritten by the old adventure. *Continue* reloads from the slot.
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

## Adventure (M3–M4)
- **XP timing**: XP is awarded once, at the end of a won battle (engine `awardXp` → `gainXp`), not per faint — battle stats never change mid-fight and a trainer battle reads as one "results" sequence. **Catching gives no XP** (classic rule: only fainted foes count). Losing or running gives none.
- **Results order** after a win: "X gained N XP!" per kin (animated XP bar for the kin on the field, level-up card with stat deltas, auto-learned moves, forget-a-move prompt) → trainer walks back on, defeat quote → coins → "A new route is open: …" → evolutions → Hall of Fame (Champion). The end menu offers "Travel to <new route>".
- **Forget-a-move prompt**: *Don't learn* has the focus and forgetting asks "Forget X to learn Y?" (No focused), so mashing Enter or a digit through a level-up can never drop a move. Held keys (auto-repeat) are ignored in battle prompts.
- **Text pacing** (`settings.textSpeed`): typewriter at 40 / 75 / 170 chars/s and hold × 1.6 / 1 / 0.5 for slow / normal / fast. First tap completes the line, second tap advances.
- **Bag**: one *Bag* button with Orbs / Items tabs (Orbs first in wild battles, Items first vs trainers; the last tab is remembered per battle). Orbs show the live "≈ N% catch"; vs trainers they're disabled with "You can't catch another trainer's kin!". Items list only what you own; an item is enabled only if some party member would be affected, and targets that wouldn't are greyed ("No effect"). *Run* vs trainers stays visible but explains "There's no running from a trainer battle!".
- **Trainers**: no rematches; a beaten trainer's hotspot shows their defeat line. After becoming Champion, Vale's hotspot reopens the Hall of Fame. Rewards are paid once (`trainerVictory` is idempotent). Money is shown as "coins".
- **Blackout**: party healed, back to the route, no money or item loss; the trainer gets a short taunt.
- **Evolution**: glow to a white silhouette (0.7 s), then flicker old/new with intervals 520 ms × 0.84 down to 55 ms over ~5.2 s, rays speeding up, then a flash and burst. *Skip* finishes instantly, *Stop* cancels; it asks again after the next won battle (every party kin that `canEvolveNow` is queued, not just the ones that levelled — a kin at the level cap never levels again) and the Party screen shows an *Evolve* button for it at any time. Several evolutions from one battle play back-to-back; the evolved form is registered as caught in the bestiary.
- **Route maps**: wild patches take the front-left/right slots, caves always the back slot (so they never hide a trainer); trainers stand on red pads (green + check badge when beaten, figure greyed). Each trainer has its own palette/hat/prop (Pim ranger hat, Brann beanie + pack, Sola headband + staff, Merrow sou'wester + rod, Tavi goggles + scarf, Vale crown + cape). Locked tabs show a lock and "Beat <names>".
- **Battle camera**: your own kin is turned 0.55 rad toward the camera — a readable 3/4 back view instead of a rear end. Big hits (super effective / crit) add a short camera shake; damage leaves a pale "ghost" chunk on the HP bar that drains after 0.35 s.
- **Champion difficulty** (headless check, 15 seeds × 3 all-L30 fully evolved parties): greedy "strongest move" play wins 2/15, Ace-style play (switching out of bad matchups) wins 10/15. Vale is meant to be the hardest fight; Full Tonics and smart switching matter. The e2e plays it via `__game.debugSuggest()` (Ace advice) through the real UI.
- **Hall of Fame**: highest-level kin on the tallest gold centre podium, the rest alternate outwards; confetti, rays, stats (play time, caught, seen, trainers) and a looping credits roll; *victory* jingle then the title theme.

## Balance
Full method and numbers are in `docs/BALANCE.md`. The tools are `tools/campaign.ts` (headless campaign with a casual, greedy or smart player) and `tools/arena-balance.ts` (Ace vs Ace survey).
- **XP formula**: yield = ⌊xpYield·L·(L+45)/430·(1.5 if trainer)⌋ (pass 2; pass 1 was (L+25)/270). Yield grows a little faster than linearly, so late levels don't take several times more battles than early ones.
- **Bench share**: every conscious party kin that didn't face a fainted foe gets ⌊yield·0.5⌋. Before this, casual teams snowballed one carry: the original data gave 3/90 Champions in simulation, now 90/90. Participants split the full yield as before; PvP gives no XP.
- **Final starter evolutions at 26** (was 28) so starters reach their last form before Vale. Late big moves come a little earlier (2-stage lines at 24; Vulcrag's Pyre Crash at 23).
- **Curve**:
  - Signposts: meadow 2–6, ridge 8–13, coast 15–21, plateau 21–26. The plateau signpost equals Vale's party range.
  - Trainers: Pim 5/7, Brann 11–14, Sola 11–14, Merrow 22–23, Tavi 20–22, Vale 21–26 (Maelstrode 26 is the ace).
  - Simulated casual first-try wins: Pim 92%, Brann 78%, Sola 67%, Merrow 73%, Tavi 63%. Vale: 43% casual, 67% with greedy switching, 70% with Ace advice. ~118 battles per campaign.
- **Vale keeps one status or setup move per kin.** An all-attack Vale proved harder for non-switching players. Maelstrode dropped Second Wind, the source of unwinnable stalls.
- **Wild tables**: no wild kin is evolved below its evolution level, and bands sit inside the route signpost (+2 for rare or evolved kin). Every non-starter species is wild; starter lines stay starter-only. Rare duals: Petalwisp 3–6%, Vulcrag 10–12%, Surgeray 15%.
- **PvP**: Updraft is now +2 Attack at 10 PP. +2 Speed was useless on the always-fastest Gale kin. Ram Charge 80 → 90. Small base-stat nudges: Cragmaul and Cyclonyx up; Petalwisp and Surgeray down. Fully evolved win shares now span 45.5–54.7%. A content test forbids a move that strictly dominates another of the same type and category.

## Layout (viewport pass)
- **One battle frame for every screen.** Fixed slots: foe panel top-left, your panel directly above the menu (desktop, landscape phone) or above the text box (portrait), the menu in a fixed three-row box (scrolls if ever needed), text box bottom-left (or full width in portrait). Opening Fight/Bag/Kin never moves a panel; the e2e layout spec asserts it. Every submenu fits three rows: bag = [Orbs][Items][Back] + up to two rows of three, party = 3×2 + Back, moves = 2×2 + Back. Buttons are one line of name + one line of meta (type lives in the colour and tooltip).
- **Battle camera solves for the layout.** `battleTargets()` mirrors the CSS slots and `frameTwo()` finds the yaw/distance that put your kin's feet above the text box and the foe's beside the foe panel, then slides the image with `setViewOffset`. FOV 26° (20° in portrait) keeps the foe readable next to your kin; pad spacing is per layout (0.72 wide, 1.5 portrait, 1.2 landscape) so tall phones don't cram both kin into a strip. The Arena shares it.
- **Pads**: raised, coloured top + white rim ring + gold studs (`battlePad`); summit pads are slate `#9aa6c4` so they read on snow.
- **Other scenes fit their subjects into the free area** measured from the DOM (`freeArea` + `fitPoints`): title trio, starters, route island, Hall of Fame line-up, evolution pedestal, Arena podium. Landscape phones (`max-height: 500px` landscape) move sheets into a right-hand column instead of covering the 3D.
- **Tall screens re-pose**: title trio and starters stand in a tighter staggered group; the Hall of Fame uses two rows of podiums; the player stands at the open end of the line-up.
- **Starter choice**: the chosen kin hops forward into a spotlight (ring + soft beam), grows 1.25×, the others step back and dim.
- **Route**: screen-space sky gradient + cloud sea (the camera looks down, so a sky dome read flat); the header range is derived from the hotspot tables; trainer buttons show the short name with the title as subtitle; on narrow screens locked tabs show only a lock, the requirement moves to a status line.
- **Big screens** (≥1600×900) zoom the HTML UI 1.35×; `uiZoom()` keeps the camera targets in sync.
- **Kin sizes in battle are measured, not assumed**: each kin's rest bounding box is projected after framing; your kin is capped to a share of the screen (portrait: must fit left of its HP panel, ≤30% of the height), the foe to ≤50%/30% of the width; a kin poking off an edge or sinking behind the text box slides its target back in. Small first-stage foes get a mild boost (root scale, so the shadow follows). `e2e/layout.spec.ts` checks all 18 species on portrait phones.

## Rendering: orbs, move FX, shader programs
- **Orbs are lantern-buds** (original design, replaces a ball silhouette that read too close to an existing franchise): a faceted pointed pod in a collar, glowing tip, no hemispheres/band/button. Tiers by colour *and* shape — **Orb** coral pod + 4 green sepals; **Bright Orb** sky-blue pod, 5 sepals, tilted gold halo ring; **Star Orb** gold pod with a flat cream/pink 8-point star collar. Bag/shop/catch-menu icons are matching inline SVGs (`ui/icons.ts`, injected as a CSS skin over the existing `.ico-*` / `.orb-ico` hooks). The orb reacts on its own: each shake wobble puffs sparkles from the tip, the success "click" (emissive pulse) fires a 4-point glint.
- **Move FX**: projectile/trail from user to foe where it fits, then a flash + element particle burst + ground ring for every element, plus a signature at the target scaled to its measured height (≥ ~0.8×): Flame pillar of tongues + rising embers; Tide bubble volley → splash crown, droplets, ripples; Flora leaf volley → thorn vines with blossoms; Spark sky bolt + crackle cage; Terra boulder → rock spikes, shards, dust; Gale wind blades → tornado; Neutral star flash + impact lines. Optional `power` arg: ≤ 45 weak (0.8×), ≤ 70 normal, > 70 strong (1.3× + more pieces). Main FX bodies use normal blending with dark backing colours (additive washes out on bright meadows); additive is kept for glows.
- **No shader links mid-battle**: `flatMaterial()` is one shared persistent material; FX use pooled persistent materials; every common material shape is compiled against each scene's lights/fog on its first frame (`render/materials.ts`). Persistent materials ignore `dispose()` and `disposeTree` skips them. `MeshBuilder` geometry has no normals (all consumers are flat-shaded or unlit).
- **Pass 2 (real-UI playtest)**:
  - Pim is Pebblet 3, Flickwing 4, Breezel 5. One kin per starter weakness, so a lone Mossling at L8 wins about 95% (was about 65%). The meadow signpost is Lv 2–8.
  - Meadow wilds are one level lower; stage-1 starters get +8–10 base HP against early crit swings.
  - Wild XP yields are smoothed: stage-1 kin 54/56 → 70/72, evolved kin about 160 → 136, rare duals 185 → 160. The ridge pays more and the coast spikes less (p90 612 → 466).
  - Merrow is 21/22/22 and his Stormoth has no Battle Cry.
  - The simulator's casual player is now type-aware. `--solo` and `--pim-check` cover starter-carry play. Wild KOs pay 6 coins per foe level.
