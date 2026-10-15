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
- **Battles and saves**: a battle is saved as a whole. Entering a battle flushes any pending autosave and pauses autosave (pagehide/visibility too); spent orbs/items, battle HP and the outcome are written together when it ends. Closing or reloading the tab mid-battle therefore resumes from just before the battle, **by design** (no half-applied state; the wild roll is replayed from the saved rng). At the end, *all* results — caught kin, XP/levels, trainer win, money, route unlocks, blackout heal — are applied to the player and saved immediately, *before* the messages play back; move choices made in the forget-a-move prompt are saved again afterwards.
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
- **Pass 3**: Sola has four kin (Flickwing 11, Breezel 13, Vulcrag 11 with Flame moves only, Cindertail 14). Merrow is an ace AI at 22/22/23. Type-aware casual first-try: Sola 83%, Merrow 69%. Switch-only-on-faint player: 64% and 76%.

## Final polish (pre-playtest)
- **Wild wins pay pocket money**: `wildVictory()` adds 6 coins × the fainted wild kin's level (shown as "You found N coins!"), so a player who spent every orb and coin can always earn more on the early routes. Catches, escapes, losses and trainer battles pay nothing extra.
- **Missed attacks whiff**: the scene looks one event ahead; a `move` followed by its `miss` plays the element's projectile streaking past the target's shoulder while the target sidesteps — no flash, burst, ground ring, signature or hit flash. Strong signatures shrink (≥ 0.7×) to stay on screen around the target on portrait phones.
- **Battle text**: during playback the text box may grow into the empty menu slot (portrait: it drops to the bottom of the screen, so there is no bare band); `say()` pages anything still too long. Text is laid out in full from the first letter (the untyped rest is transparent), so words never jump lines mid-typing.
- **Hotseat perspective**: each player chooses from their own side (their kin, platform and panel come to the front behind the curtain); turns play out from seat 0's side, and the first prompt after a watched turn gets a "Pass to …" curtain.
- **Anti-mash**: a freshly shown battle menu ignores Enter/Space for 250 ms, so mashing through text never commits Fight → first move.
- **Online names**: a guest who keeps the default name joins as "Player 2"; the server also renames a duplicate name with its seat number.
- **Play time** reads "< 1m" under a minute everywhere (`formatPlayTime`).

## HD-2D prototype (`?gfx=hd2d`)
Full rationale and numbers in `docs/HD2D.md`. In short:
- **Sprites, not in-scene toon models**: live 3D models are baked each frame (banded toon, 1-texel selective outline, depth contour lines) onto pixel-snapped billboards; in-scene toon (`post=mesh`) melted into the rock, 2 px texels lost faces. Animations are untouched because the live mesh is what gets baked.
- **Baked AO over GTAO**: GTAO cost 2.4× the frame and +35 draw calls; per-vertex AO + a texel-quantised bevel give the crevices.
- **One cookie spot as key**, the second window faked with a light-pool decal (the second spot was ~20% of the frame).
- **Crispness over DOF**: bloom threshold above 1.0 linear, tilt-shift ≤ 1 px at the very top; all passes at the low internal res, nearest upscale by CSS.
- **Tiers**: `high` 480 px, PCFSoft live shadows, half-res bloom; `low` (coarse pointer / short side < 500 / ≤ 4 cores) 400 px, PCF shadow map rendered once (blob contacts for kin/people), quarter-res bloom, no point lights. `?q=` overrides.
- **Trainers stay on the field** in HD-2D: they step back to a post behind their kin instead of walking off, and step forward again for the defeat line.

## Pixel UI overhaul (handheld panels for the HD-2D look)
Full system in `docs/UI.md`; screens in `docs/screenshots/ui-pixel/`.
- **Own pixel font over a CC0 one**: "Orbkin Pixel" is drawn in `tools/pixelfont/glyphs.ts` and built into `src/assets/fonts/orbkin-pixel.otf` (`npm run font`, opentype.js as a dev-only tool). A project-owned font has no licence question at all, covers exactly our symbols (× → ▶ ▼ … ✓ ½ “ ” and Latin-1 accents), and is narrow enough (4-px caps, proportional advance) that every kin and move name fits a 320-px phone at 2×. A unit test fails when a string uses a missing glyph.
- **Text only at 10/20/30/40 px, one weight, `font-synthesis: none`**: integer multiples of the glyph grid keep pixels whole; hierarchy comes from size, case and the 1-px GBA-style shade, never faux bold. Big screens now zoom the UI by **1.5** (was 1.35) so a UI pixel is exactly 3 device px.
- **9-slice frames from code** (`ui/pixel/skin.ts`): one 13×13 grid (ink outline with notched corners, two-tone amber band with corner studs, ink inner line) becomes a CSS `border-image`; plates and wells likewise. No image files, palette tweaks are one-line edits.
- **Lists with a ▶ cursor instead of candy buttons** inside panels (battle commands, hotspots, party, bag, shop, menu hub); standalone actions are pixel keycaps. Focus = cursor + amber row; hover is a quieter paper fill and the hover cursor only exists on mouse devices (a tap never leaves a stray ▶).
- **Battle band** (desktop): dialog + 2×2 command box share one 112-px bottom band; FIGHT opens the move list across the band with a separate PP/TYPE/effectiveness info box that follows the cursor (shared with the Arena via `ui/pixel/moveInfo.ts`). Long lists pop up over the right side and your info box hides under them. Phone layouts keep their old geometry (camera targets unchanged) — the move list grows up over the dialog there and each move keeps a one-line `TYPE · PP` so touch players see it before tapping.
- **Approx sign dropped from catch odds** ("×12 · 25%"): at 10–20 px "≈25%" read as "%25%".

## HD-2D screens (`?gfx=hd2d`: title, starter, route maps, menu screens, evolution)
Details and numbers in `docs/HD2D.md` ("Screens").
- **Reuse the battle dioramas instead of new sets** for the title (the flower field) and the starter pick (the meadow clearing): same texel density, light rig and grade as the battles they lead into, and the title shows the game's actual look. The title camera only drifts ±0.55 units, a touch from the left: more yaw shows the set's world edge.
- **Sprites everywhere at the battle texel heights** (people 44, kin 28/34/40 by stage): a kin is the same pixel sprite on the title, the dais, the map, the plinth and in battle; screens frame their camera so that lands at 2–3 internal px per texel rather than raising the texel count.
- **Integer-pixel camera**: every screen snaps its view offset to whole internal pixels after framing; the title drift rounds the camera offset to whole pixels at the trio's depth, so the focus plane slides in whole texels instead of shimmering.
- **Route maps are floating islands, not flat discs**: the old low-poly map was an island in the sky, so the HD-2D map keeps that idea but builds it from the kit — rock-kit rim walls and a hanging boulder cone, a grass fringe over the lip, turf ledges / basalt crags for height — and paints the top as one unique texture at **half the battle texel** (the map shows the whole island from twice as far, so the texels still land at ~2 screen px). Hotspots keep their old positions; caves sit in front of the raised back ledge and trees are kept off the view onto them (legibility over density).
- **Painted sky over a CSS/gradient sky**: a posterised band sky with layered cumulus banks painted at ~2 px texels onto a plane that exactly covers the frustum (repainted only when the frame's shape changes), plus a single-draw-call layer of drifting pixel clouds. Inner puff outlines on only ~40% of the puffs: drawing them on every puff read as fish scales.
- **Sun shafts on the maps are long, wide and faint** (entering from above the frame): short shafts with a visible start looked like smoke columns standing on the island.
- **Menu screens share one warm stone room** (party, box, bestiary, bag, shop) with the kin on a sandstone plinth under a window cookie light — dim, warm and vignetted like the reference's interior; the turntable turns in 22.5° steps so the sprite re-bakes once per step and never smears. Evolution reuses the room at dusk (violet fill); its white silhouette phase is simply the sprite's emissive flash.
- **Starter selection light**: a steep shaft from a canopy gap (not the low sun angle, which made it land between two daises), motes, a floor pool and a pool on the dais top. Daises are true octagons (two crossed squares read as a star/cog) with a few loose stones at irregular spacing.

## HD-2D reference pass 2 (rock, outdoor light, sprites, night sets)
Details in `docs/HD2D.md` ("Reference pass 2").
- **Crisp small bevels over pillows**: boulder bevels are 10–15% of the half-extent so a stone ends in a 1-texel lit edge; form comes from a baked per-stone gradient and chipped corners, irregularity from stone widths 0.6–1.4 cells, staggered courses, splits and yaw. Wide bevels read as grey pillows next to the reference's chunky rock.
- **World-space gobo instead of a screen-shaped cookie**: the key's cookie is painted from the ground point under each cookie texel, so the focal pool on the kin, leaf dapple and cloud shadows keep their world size at any sun height. A low sun (19–34°) gives the reference's long shadows, and with a plain cookie it would stretch the pool into a streak.
- **Canopies paint dapple instead of casting it**: meadow/flowers tree canopies no longer block the key, because the gobo paints their dapple. Otherwise a low sun put the whole stage in tree shadow. Trunks and kin still cast the long shadows.
- **Ground aprons over wider sets**: one draw call of the set's own floor texture runs far past the near frustum, so portrait phones never see the clear colour. Widening each set would cost more triangles and dressing. `?leak=1` (magenta clear) keeps this checkable.
- **Cliff desktop camera lowered (elevation 0.46)** so the painted sky shows. The old sky plane sat beyond the 90-unit far plane and never rendered.
- **Bloom threshold 1.0 with a soft knee, capped at 1.1 over the threshold**: only the excess above 1.0 blooms, so windows and lava falls keep a defined core instead of hazing the top of the frame.
- **Sprite texel density not raised**: sprite texels are whole internal pixels shared by every sprite, so 1.2–1.3× would mean uneven texel sizes. The reference measures about the same density (people ≈ 44–50 texels, kin ≈ 30); the gap was shading, so the pass went to a five-tone hue-shifted ramp, near-black outer outline, key-side rim, emissive flames/magma and a capped green chroma.
- **Phone move grid is always 2×2**: with 3 moves the 4th cell stays empty, and PP/TYPE + Back sit on the row under the divider, so the layout never jumps between kin.

## Graphics pass 1: water, UI readability, battle-in (branch gfx1/world-ui)
Every visible change here passed a blind pairwise gate against the build before it: matched frames
from the deterministic capture harness (same seed, same state, frozen frame clock; desktop
1280×720 high tier, phone 393×851 @2.75 low tier), 3 fresh-context Opus judges per pair, A/B order
randomised per judge, a calibration pair (baseline vs a softened copy) in each session, and the
decisive rule 3/3 + mean confidence ≥ 3 + mean score gap ≥ 0.75 (else "no detectable difference").
Evidence (frames, plans, every vote and reason): `scratchpad/gfx1/world-ui/` of the session that made it.
- **Shallows water = `style: 'bands'`** (flat depth bands, crescent highlights, solid lace, receding
  dashed foam line, glints only in the sun zone, 8 fps stepped clock; `arenas/localKit.ts`
  `WATER_FRAG_BANDS`), ported from the biome-kit research prototype W2. Votes vs the old glitter water:
  desktop element crop **3/3, conf 4.0, gap +2.5**; phone full frame **3/3, conf 3.3, gap +1.17**;
  phone element crop **3/3, conf 4.0, gap +2.67**; desktop full frame 2/3 (no detectable
  difference, never worse). Calibration pairs 3/3 correct. It is also cheaper per pixel (no value
  noise; research bench 3.2× vs 4.2× a basic plane).
- **The shore lace's land side is painted on the land materials** (`waterline()`: sand, rock, wreck,
  posts within 0.05 units above the water turn into unlit foam on the same stepped clock), after
  stylized-water's terrain waterline. The water-side lace is 0.4 units (the prototype's 0.55 had
  to bridge land meshes overhanging the coarse shore field). The stripe is short because the
  sandbar crown sits only 0.14 above the water: a 3-texel stripe turned the whole crown to foam.
- **Coast keeps the glitter water.** The same recipe on the coast cove won both element crops 3/3
  but **lost the phone full frame 0/3** ("dithered sparkle, sun highlights, lit diorama" for the old
  sea) and tied the desktop frame, so it was reverted: much of the coast frame is far sea at a
  grazing angle, where the research already found the glitter path reads better. Cliff unchanged.

## GPU PC node: pinned tool chain (`docs/GPU_PC_SETUP.md`)
The owner's RTX 3090 PC runs Claude Code inside WSL2 Ubuntu 24.04 as a GPU node. Its tools are pinned and checked by hand, not taken from distribution channels, so that a later session does not "upgrade" them away or swap the download path for a less checkable one:
- **Node 22.23.3** from nodejs.org, checked against the GPG-signed `SHASUMS256.txt` (keyring from `nodejs/release-keys` at commit `481637f813e912c4aa3622d7964ab426c97b8e8d`) and the explicit tarball sha256 `df450af89261115ef9f9e3830c3eeb2cc9213b63c720b1af623cb5dcbe2e02de`. NodeSource's apt repository was rejected because it adds a third-party package source to the system; Ubuntu 24.04's own `nodejs` is 18.
- **uv 0.12.18** from PyPI with the wheel hash `fbe0489871e74ebfb70379a32526c62b9fb615acf13576b9f19bc09a142f62b0` (`pip install --require-hashes` into a venv), installed with `uv python install --no-bin 3.13` for Python. The deadsnakes PPA was rejected for the same reason as NodeSource; 24.04 has no `python3.13` package, and bpy 5.2 needs 3.13.
- **bpy 5.2.2** (Blender 5.2 LTS as a Python module), Linux wheel sha256 `3dfd1a9e7a5aec0f0fe95a1b01d10cd66e212b16ea38b77d132159dc9a666d45`, installed from the committed, hash-pinned `tools/gpu-pc/requirements-bpy.lock` (generated in the cloud session with `uv pip compile --generate-hashes` on 2026-10-14; numpy pinned to 2.5.3 and charset-normalizer to 3.5.1 because the newest releases were under two weeks old). The node never resolves packages itself: a lock made on the node would pin whatever PyPI served that minute, unreviewed. It ships the sm_86 CUDA kernel, so no CUDA toolkit or NVIDIA driver is installed inside Ubuntu (the Windows driver provides `/usr/lib/wsl/lib`); OptiX is not available in WSL and is recorded as unavailable rather than worked around.
- **@anthropic-ai/sandbox-runtime 0.0.79** (the sandbox's optional seccomp Unix-socket filter), installed by the owner with `--ignore-scripts`; it has no install scripts and four direct dependencies (`zod`, `commander`, `node-forge`, `@pondwader/socks5-server`).
- **bubblewrap 0.9.0** and **socat** from Ubuntu's archive, for the sandbox and the `gpu-run` jail.
- **`novsock`** (root-owned, system `python3` + a 9-instruction seccomp filter) wraps every Claude Code start and every `gpu-run` job: the Claude Code sandbox filter blocks only `socket(AF_UNIX)` (its own code comment) and bubblewrap's `--unshare-all` does not isolate AF_VSOCK on the WSL kernel (reproduced), so without it a sandboxed command could reach WSL's seven Windows-side hvsocket services (ports 50000-50006, `lxinitshared.h`).
- **`gpu-run` mounts only direct children of `/home/claude`** and the repo is fully read-only; job output goes to `~/orbkin-cache/out` (`$ORBKIN_OUT`). An earlier draft bind-mounted `game/screenshots` read-write, which a sandboxed command could swap for a symlink between the check and the mount (a race, not a theory: bubblewrap resolves the source on the host).
Bumping any of these means re-running the signature/hash chain in the guide and updating the pins there, in the same commit.
