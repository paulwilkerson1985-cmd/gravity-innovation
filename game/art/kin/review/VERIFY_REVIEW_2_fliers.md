# Verification of polish review 2: fliers + serpent (Flickwing, Stormoth, Cyclonyx, Petalwisp, Maelstrode)

Judged on `battle.png` and `2_threeq.png` first; side views edge-on by design (display wing plane) accepted. Crops in `review2/crops2/`.

**Group verdict: Stormoth is ready; the other four each need one short scripted pass (1-3 changes each, nothing structural). Render Stormoth's final sheets now; hold the other four until the items below are in, then render all four in one batch.**

## Flickwing: one more pass
- MUST tufts through cases: **fixed** (back view clean orange cases).
- MUST mottled face: **fixed** (cream face is clean in battle/front crops).
- SHOULD edge-on wings: **fixed** (display plane + blur wing reads as a buzz in battle, 3/4, front).
- SHOULD lantern glow/bands: **partly**. Bands are flush now, but there is still no visible glow; the lantern is a flat cream egg.
- NICE spark tangent on crest: **fixed**.
- NEW (`5_back.png`, crop `fli_back_lantern`): the lantern end-on is a **bullseye** - cream disc, orange ring, orange centre spot. The player's own view reads it as a target/eye. Fix: cap the lantern with the LANTERN emissive colour (`#fff9c0`, glow 0.9), not an orange disc; keep a single thin orange band (0.02) at the root only.
- NEW (`battle.png`, `2_threeq.png`): the lantern - the signature - is invisible in the hero view and a sliver in the 3/4. Pitch the tail down 20-25° (or yaw the battle key 8° the other way) so the lantern peeks below the near flank.

## Stormoth: ready
- MUST wings edge-on: **fixed** (both pairs broad in battle, 3/4, front; the V reads).
- MUST proud bolt: **fixed** (flush, single ink, inside the FORE outline).
- SHOULD ink on indigo: **fixed** (wing outlines visible in battle).
- SHOULD abdomen tip plug: **fixed** (flush bands, rounded taper in back/back-3/4).
- NICE feathery antennae: **fixed** (serrated combs).
- NICE only: `3_side.png` the edge-on forewing is a hollow double outline (fill thinner than ink) - harmless at sprite size; `1_front.png` a black wedge where hindwing meets ruff (crop `sto_front_notch`).

## Cyclonyx: one more pass (one item)
- MUST chest zone smear/step: **fixed** (clean bib curve, `cyc_battle_chest`).
- MUST paddle wings + glued primaries: **fixed** (scalloped trailing edge, flush orange primaries, tapered).
- SHOULD near wing edge-on behind crest: **fixed**.
- SHOULD tail fan / talons: **partly**. Talons are now three-toe nubs (fine). The tail fan is still a tiny white serrated scrap at the wing root (`cyc_threeq_fan`), reads as torn paper; it sits at the back of the shoulder rather than the rump. Widen to 0.30 and move it to the tail base behind the streamer roots.
- NICE brow: **fixed**.
- NEW (`5_back.png`, crop `cyc_back_fan`): the two tail streamers foreshorten into two orange teardrops hanging under the rump with blue hooks beneath - the signature vanishes in the player's own view and reads as dangling flames. Fix: droop the streamers 30° and spread them ±25° so from behind they show as two orange-tipped lines, not dots.

## Petalwisp: one more pass (small)
- MUST unmirrored leaf arms: **fixed** (symmetric in every view).
- SHOULD paper-cutout crown: **fixed** (petals cup the head, side view reads 3D).
- SHOULD blurred collar: **fixed** (crisp V collar, `pet_battle_collar`).
- NICE wisp tail drip: **partly**. Bigger, but in `1_front.png`/`battle.png` it lies flat under the hem and reads as a hoop or saucer (`pet_front_hoop`). Tilt the spiral plane 30-40° so it trails behind and down.
- NEW (`5_back.png`, crop `pet_back_head`): the pale FACE zone wraps to the back of the head, so from behind the head is a flat white **hexagon** framed by petals, with no markings. Limit the face sdf to the front hemisphere (head-local `x > 0.02`) so the back is crown pink, or let one back petal overlap the centre.
- NEW (nit): a stray ink fleck on the right skirt petal in `4_back34.png` (`pet_back34_mark`), probably a self-intersection crease.

## Maelstrode: one more pass
- MUST far eye sliver: **fixed** (both gold eyes face the camera; goggle-eyed but readable).
- MUST fins as rods/dashes: **partly**. Lens profile works on the crest sides and the fluke. Still open: (a) `1_front.png` the centre crest fin is a thin white **horn** between the two side fins (`mae_front_crest`) - splay it back 20° or delete it; (b) `5_back.png` the dorsals read as white **slots cut into the neck** with a soft dark blob above each (`mae_back_neck`) - make them protrude past the neck silhouette (height 0.14 -> 0.22) and turn the crease into a 1 px line, not a blur.
- MUST stair-stepped belly: **partly**. Side edges are now crisp (by-angle paint works) but the top end under the chin is a cloudy smear in battle and front (`mae_battle_chin`, `mae_front_belly_top`). End it in a designed V with the same sdf edge as the sides.
- SHOULD pool ring: **fixed** (1.5 turns read as a spiral).
- SHOULD sprout fluke: **partly**. Fluke is wide and lensed; the stalk is a sawn-off **post** with a flat top (`mae_battle_pool`). Taper the stalk into the fluke base and round its top; blend the stalk root into the inner turn.
- NEW: fluke lobes show a thin white seam where the two slabs cross (`mae_battle_dorsal`); union them before inking.

## Ranked open list for the script author
1. Maelstrode belly top V; dorsal height + crease line; centre crest fin; stalk taper (one pass).
2. Flickwing lantern cap colour + glow; tail pitch so the lantern shows in battle.
3. Petalwisp face sdf front-hemisphere; tail plane tilt.
4. Cyclonyx streamer droop/spread; tail fan size and position.
