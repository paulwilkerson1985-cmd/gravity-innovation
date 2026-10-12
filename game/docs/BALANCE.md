# Balance

How the single-player difficulty curve and the Arena meta were tuned, with the numbers before and after. All numbers come from two headless tools that use only the engine and the pure game-state functions, so they reproduce exactly.

## Tools

### `npx tsx tools/campaign.ts` — campaign simulator
This tool plays the whole adventure: pick a starter, fight wild battles, shop, beat the trainers in order, then the Champion. The defaults are 30 seeds × 3 starters (~4 min). Options: `--seeds N`, `--starter id`, `--policy casual|greedy|smart`, `--champ-trials N`, `--champ-delta N` (analysis only), `--verbose`, `--json`.

**Casual player model** (the default policy):
- **Battles.** Moves are chosen like the Skilled AI (best expected damage). The player switches only when a kin faints, and picks the replacement by best matchup. In trainer battles the player drinks a Tonic or Mega Tonic when the active kin drops below 30% HP (at most twice per kin). The player never runs.
- **Catching.** The player wants 1 new species on the meadow, 2 on the ridge and 3 on the coast, plus any rare dual-type it meets. It weakens the foe with a move that won't KO, then throws the cheapest orb with a ≥40% catch chance. With a full party, a clearly stronger catch replaces the lowest-level member (never the starter).
- **Training.** The player rests (a free full heal) after every battle. The strongest kin leads, with the starter winning ties. The player always evolves. It takes a new attack move over its weakest move and skips new status moves.
- **Grinding.** On each route the player fights wild battles, round-robin over the hotspots, until its top-3 average level reaches the route's upper signpost (the "Lv a–b" shown on the route tab). A per-route cap applies: meadow 15, ridge 30, coast 35. Then it challenges the trainers; same-route trainers are taken in either order, chosen by seed. After a loss it heals, fights 5 more wild battles and retries, up to 8 attempts. Before the Champion it grinds on the coast until the whole party's average level reaches the plateau's upper signpost (cap 25).
- **Shop.** After each trainer win the player tops up to 5 orbs. It then buys Tonics (meadow and ridge), Mega Tonics (up to 4 on the coast) or up to 8 Mega Tonics before the Champion, keeping 100 coins in reserve.

**Other policies:**
- **greedy:** casual play, plus switching out of a clearly losing 1-v-1 (`matchup < −0.3`) into a bench kin that clearly wins it.
- **smart:** every battle choice comes from the Ace AI. This is what the in-game advice hook (`__game.debugSuggest()`) would suggest.

The **Champion first-try** rate is measured from the same pre-Champion save, with 10 battle seeds per policy. The tables also report the actual first attempt and the number of attempts until a win.

### `npx tsx tools/arena-balance.ts` — Arena survey
This tool runs Ace vs Ace over random 3-kin teams drawn from the rentals (`--pool rentals`, 12 kin) or from the fully evolved rentals only (`--pool finals`, 9 kin). It reports each species' **win share** and flags anything outside 40–60%. For every move it reports the games it was used in, the win share in those games and the **pick rate** (the share of turns on which the AI chose the move while it was available).

> Win share for a move is confounded: losing sides fall back on heals and status moves. Pick rate is the more useful signal.

## Single player

### Before: original data, same simulator, 90 runs
| Trainer | top-3 avg level on arrival | 1st-try win | avg attempts | beaten |
|---|---|---|---|---|
| Pim (L5–7, rookie) | 5.7 | 93% | 1.1 | 100% |
| Brann (L12–15) | 12.8 | 59% | 2.6 | 91% |
| Sola (L11–14) | 13.0 | 73% | 2.0 | 91% |
| Merrow (L19–21) | 19.9 | 38% | 3.4 | 66% |
| Tavi (L21–23, ace) | 20.0 | 29% | 4.5 | 62% |
| Vale (L26–30, ace) | 23.2 | 0% (trials: casual 3%, greedy 3%, smart 2%) | 7.6 | **3%** |

Only 3 of 90 runs became Champion. The average was 190 battles (174 wild), and wild battles at the ridge (56) and coast (105) mostly hit the caps. The cause: XP was linear in foe level against a level³ curve, and only the kin that fought earned anything. Teams split into one over-levelled carry plus dead weight, and Vale's 26–30 party was out of reach.

### After: final data, 90 runs
| Trainer | top-3 avg level on arrival | 1st-try win | avg attempts | beaten |
|---|---|---|---|---|
| Pim (L5–7, rookie) | 6.0 | **92%** | 1.1 | 100% |
| Brann (L11–14) | 13.2 | **78%** | 1.4 | 100% |
| Sola (L11–14) | 13.2 | **67%** | 1.8 | 100% |
| Merrow (L22–23) | 21.5 | **73%** | 1.6 | 100% |
| Tavi (L20–22, ace) | 21.5 | **63%** | 1.6 | 100% |
| Vale (L21–26, ace) | 25.6 (party avg ≈ 24.5) | **46%** on the actual first attempt | **2.6** | 100% |

**Champion first-try trials** (10 seeds from each pre-Champion save): **casual 43%, greedy-switch 67%, smart (Ace advice) 70%**.

**Totals:**
- **Battles:** 118 per campaign (108 wild: meadow 12.5, ridge 31.5, coast 64 including the ~25-battle pre-Champion stretch).
- **Coins:** ≈ 4400 earned before the Champion, all spent on orbs and tonics. The Champion's 5000 is post-game money.
- **Final levels:** top kin 29.1, party average 25.5. 49% of runs have a kin at L30 when crowned, so the cap is reachable but not required.
- **Catches:** 5.5 per run.

Per starter (first-try win: Pim / Brann / Sola / Merrow / Tavi; Champion trial casual / smart):

| Starter | Route trainers | Champion | Battles |
|---|---|---|---|
| Ashkit (Flame) | 100 / 70 / 57 / 67 / 77 | 46% / 73% | 123 |
| Dropple (Tide) | 87 / 90 / 93 / 60 / 60 | 39% / 68% | 111 |
| Mossling (Flora) | 90 / 73 / 50 / 93 / 53 | 44% / 69% | 121 |

Every starter has one or two hard type matchups: Flame against Brann's Terra, Flora against Sola's Flame and Tavi's Gale. Their overall curves are within a few points of each other.

### Against the targets
| Target | Result |
|---|---|
| Campaign ≈ 120–200 battles, no heavy grinding | 111–123 (the low end; wild grinding is 12 / 31 / 64 per route) |
| Pim ≈ 90% | 92% |
| Route trainers 65–85% | Brann 78%, Sola 67% |
| Coast trainers 55–70% | Merrow 73%, Tavi 63% |
| Champion first try 35–55% casual | 43% in trials, 46% on the actual first attempt |
| Champion ≥ 75% smart | **70%** (missed, see below) |
| ≤ ~3 retries typical | 2.6 attempts on average; no run needed more than 8 |
| Each starter viable | Champion casual 39–46%, smart 68–73% |
| L30 reachable, not required | 49% have a L30 kin at the crowning; nobody needs one |

**Whole campaign under the smart policy** (`--policy smart`, 30 runs): Pim 90%, Brann 83%, Sola 90%, Merrow 70%, Tavi 62%. Vale was won on the first attempt 69% of the time (trials: smart 74%). One run of 30 used up its 8 attempts against Merrow.

**Why smart stays near 70%:** the advice hook *is* Vale's own Ace AI, so smart play is a mirror match. It beats casual play by ~27 points, but barely beats greedy switching (+3). Each Champion level is worth about ±10 points (measured with `--champ-delta`). Pushing smart to ≥75% would have pushed casual past 55%. A better advisor would separate them, for example one that is item-aware or searches 2 plies.

## The changes

### XP (`src/engine/progression.ts`)
- **Yield:** `⌊xpYield · L · (L + 45) / 430 · (1.5 if trainer)⌋` (pass 1 used `(L + 25) / 270`; see the follow-up below; originally `⌊xpYield · L / 7 · 1.5⌋`). Yield now grows a little faster than linearly with level, so a level takes about 1 battle at L5 and 3–4 at L25. Before, it took 0.6 and ~5. Covered by the "XP pacing" test.
- **Bench share:** every conscious party member that did not face a fainted foe gets `⌊yield × BENCH_XP_SHARE⌋` (0.5). Without it, a casual team snowballs one carry while new catches stay behind. With it, catches keep pace and the starter stays the lead. Participants still split the full yield as before. PvP still gives no XP.

### Species (`src/data/species.ts`)
- **Final starter evolutions at 26** (was 28; stages 14 → 26). At 28 most casual starters met Vale in their middle form.
- **Earlier big moves for the late game:**
  - Cyclone Slam and Landslide: 25 → 24.
  - Vulcrag: Pyre Crash 26 → 23, Landslide 29 → 28.
  - Surgeray: Storm Lance 26 → 24, Breaker Crush 29 → 28.
  - Petalwisp: Grove Hammer 27 → 25.
  - Gale line: Stare Down at 7, Updraft at 17 (were Updraft 7, Stare Down 18). The new +2-Attack Updraft made Pim's L7 Breezel too dangerous for a first trainer.
- **Arena-motivated stat nudges** (base totals ±6):
  - Cragmaul: Atk 92 → 94, Spe 38 → 44.
  - Cyclonyx: HP 66 → 68, Atk 84 → 88, Def 58 → 60.
  - Petalwisp: HP 68 → 66, Def 70 → 68, Spe 90 → 88.
  - Surgeray: Atk 85 → 82, Def 65 → 64, Spe 92 → 90.

### Moves (`src/data/moves.ts`)
- **Updraft:** "+2 Speed, 15 PP" → **"+2 Attack, 10 PP"**. Every Gale learner was already the fastest kin on the field, so +2 Speed did nothing (7.6% pick rate, 21% win share). Battle Cry (+1, 20 PP) keeps a PP trade-off.
- **Ram Charge:** 80 → **90** power. It was picked 4% of the time. As a Neutral recoil move it is now a real answer when STAB is resisted.

### Routes (`src/data/routes.ts`)
- **Signposts:**
  - Ridge: Lv 8–14 → 8–13.
  - Coast: 15–22 → 15–21.
  - Plateau: 26–30 → **21–26**, the Champion's party range (a test enforces this).
- **Ridge:** the wild L13–14 Cragmaul is gone (it was below its own evolution level of 18). The steaming cave has more Flickwing and Vulcrag (8% → 12%, L13–15).
- **Coast:** the top bands reach L23, so the pre-Champion grind has XP to give. Surgeray is now actually rare (25% → 15% of the shallows). Vulcrag gets a second home on the sea cliff (10%). Flickwing appears in the shallows.
- **Availability:** every non-starter species is in the wild (a test enforces this). Rare duals:
  - Petalwisp: meadow 3–5% at L6–7, coast 6%.
  - Vulcrag: ridge cave 12%, coast cliff 10%.
  - Surgeray: coast shallows 15%.

  **Starter lines stay starter-only** (a test enforces this as well).
- **Level bands:** every wild band now sits inside its route's signpost, and rare or evolved kin run at most +2 above it. No wild kin is evolved below its evolution level.

### Trainers (`src/data/trainers.ts`)
| Trainer | Before | After |
|---|---|---|
| Pim | Flickwing 5, Breezel 7 | unchanged |
| Brann | Pebblet 12, 13, Cragmaul 15 | Pebblet 11, 12, Cragmaul 14 |
| Sola | Flickwing 11, Breezel 13, Cindertail 14 | Flickwing 11, Breezel 12, Cindertail 14 |
| Merrow | 19 / 20 / 21 | Rillback 22, Surgeray 22, Stormoth 23 |
| Tavi (ace) | 21 / 21 / 22 / 23, Petalwisp with Second Wind | 20 / 20 / 21 / 22, Petalwisp with Breeze Cut |
| Vale (ace) | L26–30, Maelstrode with Second Wind, all big moves | Cyclonyx 21, Stormoth 21, Petalwisp 22, Cragmaul 22, Vulcrag 23, Maelstrode 26 |

Vale's movesets keep one status or setup tool per kin (Updraft, Jolt Wave, Spore Puff + Second Wind, Bedrock Brace, Brine Mist). Trials showed that an all-attack Vale is *harder* for casual players. Status turns are where a non-switching player catches up. Maelstrode lost Second Wind: Breaker Crush plus a 50% heal every other turn was the main source of unwinnable stalls.

Item prices and rentals are unchanged; all rental movesets remain legal.

## Follow-up: real-UI playtest (pass 2)

A playtest through the real UI (115+ battles, with a type-aware bot) found four problems:
- **Ember Ridge was a slog:** about 50 wild battles for the lead to go from L9 to L14.
- **The coast XP spiked:** 500–800 XP per fight.
- **Mossling was the hard starter:** a lone Mossling at L8 lost to Pim, while Ashkit crushed him.
- **Merrow was a wall** at party L14–20, while Tavi fell first try. Early meadow fights were also swingy.

**Simulator changes:**
- The default `casual` policy is now type-aware. It reads the SUPER/WEAK tags: best expected damage including type, and a switch out of a clearly losing 1-v-1. The old switch-only-on-faint player is `basic`.
- `--solo` runs a starter-carries variant: no meadow catches, and the starter leads every fight.
- `--pim-check N` puts a lone starter at L6–9 against Pim.
- Wild KOs pay 6 × foe level coins, mirroring the game's new wild coin reward.
- Per route, the tool reports the lead's XP per won wild battle (mean, p10, p90).

**Data changes:**
- **Pim** is now Pebblet 3, Flickwing 4, Breezel 5 (was Flickwing 5, Breezel 7). Each starter has exactly one bad matchup and nobody gets a free pass. The meadow signpost is Lv 2–8, so players arrive at about L8. L7→8 is a big damage step: the level factor ⌊2L/5⌋+2 goes from 4 to 5.
- **Meadow wilds are one level lower** (L2–4 in the tall grass, L3–5 elsewhere). Stage-1 starters get more HP: Ashkit 44 → 52, Dropple 52 → 60, Mossling 48 → 58. This takes the edge off early crits on ~20-HP pools.
- **XP yields are smoothed:**
  - Wild stage-1 kin: Flickwing and Breezel 54 → 70, Pebblet 56 → 72.
  - Wild evolved kin: Stormoth and Cyclonyx 160 → 136, Cragmaul 162 → 138.
  - Rare duals: 185 → 160.
  - Formula: offset 25 → 45, divisor 270 → 430, which lifts low-level XP by about 15–20%.
- **Merrow** is now Rillback 21, Surgeray 22, Stormoth 22 (was 22 / 22 / 23). Stormoth swapped Battle Cry for Static Nip, so it no longer sets up and sweeps.

**Results** (30 seeds × 3 starters each; type-aware casual policy; "before" is pass 1 data under the new policy and coin economy):

| | Before (normal) | After (normal) | Before (solo) | After (solo) |
|---|---|---|---|---|
| Pim 1st try | 97% (Ashkit 100, Dropple 92, Mossling 83) | 99% (100 / 100 / 97) | 50% (100 / **25** / **25**) | **96%** (100 / 97 / 90) |
| Brann / Sola | 78 / 94% | 74 / 98% | 51 / 86% | 66 / 81% |
| Merrow / Tavi | 86 / 72% | 86 / 76% | 71 / 79% | 78 / 82% |
| Vale trials: basic / casual / smart | 42 / 71 / 74% | 40 / 68 / 71% | 49 / 76 / 78% | 39 / 64 / 70% |
| Ridge wild battles | 23 | 23 | 37 | 30 (Ashkit 36, Dropple 21, Mossling 32) |
| Lead XP per wild win, ridge (mean) | 72–81 | 82 | 56 | 74 |
| Lead XP per wild win, coast (mean / p90) | 254 / 612 | 235 / **466** | 211 / 533 | 201 / **417** |
| Total battles | 104 | 106 | 114 | 114 |

The pass-1 "before" numbers come from 12-seed runs. The other columns are 30-seed runs.

**Lone starter vs Pim** (`--pim-check 300`, first try):

| | L6 | L7 | L8 | L9 |
|---|---|---|---|---|
| Before: Ashkit | 96% | 100% | 100% | 100% |
| Before: Dropple | 29% | 52% | 87% | 95% |
| Before: Mossling | 14% | 18% | 65% | 76% |
| After: Ashkit | 70% | 96% | 100% | 100% |
| After: Dropple | 83% | 89% | 100% | 100% |
| After: Mossling | 44% | 69% | **95%** | **97%** |

**Still open:**
- Against a *type-aware* player the skilled-AI trainers sit above the original targets: Sola about 98%, Merrow about 86%. Those targets were set for the non-switching player; the `basic` policy still finds them harder.
- The meadow often hits its 18-battle cap. In normal play this happens because a fresh L3 catch drags down the "top-3" average of a two-kin party.
- Smart play against Vale stays at about 70%, for the mirror-match reason above.

## Arena (PvP)

The survey is Ace vs Ace over random teams of 3 fully evolved kin (2000 battles).

| Species | Before | After |
|---|---|---|
| Petalwisp | 54.9% | 52.0% |
| Surgeray | 54.0% | 54.7% |
| Vulcrag | 53.8% | 53.9% |
| Pyrelord | 52.3% | 51.2% |
| Verdantusk | 49.6% | 50.0% |
| Maelstrode | 48.5% | 47.5% |
| Stormoth | 47.7% | 49.0% |
| Cragmaul | 44.7% | 45.5% |
| Cyclonyx | 44.7% | 46.1% |

No species was dominant (>60%) before or after; the spread is now 45.5–54.7%. In the full rental pool (12 kin), the strongest are Surgeray and Petalwisp at 57.8% and 57.6%. The three mid-stage rentals sit at 40–45%, as intended for starter-tier picks.

**Moves (pick rate when available):**
- **Updraft** went from 7.6% to 10–14%; its win share when used rose from 21% to 36–44%.
- **Ram Charge** went from 4.0% to 6–9%. It stays a niche coverage move.
- The other low-pick moves are by design: basic 40-power moves, Quick Jab, and situational status moves (Smolder Cloud, Jolt Wave, Bedrock Brace).
- **Second Wind** is picked ~32% of the time but its holders are not over-performing (47–52%), so it was left alone in PvP.

**Strict dominance:** a content test now checks that no move is at least as good as another of the same type and category in power, accuracy, PP, priority and effect while being strictly better in one. All 31 moves pass. The Neutral pairs trade PP for priority (Bump / Quick Jab), recoil for power (Ram Charge), or have different effects.

## Re-running
```
npx tsx tools/campaign.ts                          # this page's single-player tables (~4 min)
npx tsx tools/campaign.ts --seeds 10 --verbose     # per-run logs incl. pre-Champion parties
npx tsx tools/arena-balance.ts --pool finals --battles 2000 --seed 3
```
