# Verification of polish review 2: dropple, mossling, pebblet, breezel, vulcrag, surgeray

Judged on the AFTER renders (battle + 3/4 first), compared with BEFORE, crops in `review2/crops2/` (`lineup_battle_300.png` is all six battle views at sprite size).

## Dropple: ready
1. MUST fins: fixed. Near fin leaves the outline in battle/front/3/4 with a crease at the root. (In 3_side it is foreshortened into an inked ellipse; side only, accept.)
2. MUST shines: fixed. One large + one small, no smear.
3. SHOULD tip band: partly. The hard band is gone, but 5_back still has a soft dark smear just under the tip (`dropple_back_tip.png`). Harmless at 300 px.
4. SHOULD ripple bands: partly. Wider and wavy on the back (good), but on the 3/4 they still end in two blurry stubs (`dropple_threeq_bands.png`). Fade by x as specified if you touch it again.
5. NICE mouth: fixed, reads as a smile.
- NEW (minor, back-3/4 only): two shine spots poke through the outline as white slivers on the far edge (`dropple_back34_sliver.png`). Hide decals whose normal faces away from the camera (sheetkit facing test) in the turnaround/back bakes.

## Mossling: ready
1. MUST mottling: fixed. Dark/light now follows the clumps; the sin blotches are gone.
2. MUST stray ink: fixed. No floating ink arcs; what remains on the crown is soft vertex shading.
3. SHOULD face bleed: fixed, tight oval, cheeks soft.
4. SHOULD feet: partly. Toe notches present and pushed forward (good in battle/front), but still body green rather than a `foot` material.
5. NICE blossoms: fixed, both inside the outline.
- Open (non-blocking, back views): the valleys between clumps are a heavy fuzzy dark network; 5_back reads brain/cauliflower (`mossling_back_valleys.png`), and one Y-shaped valley sits on a crown clump in 3_side. Lighten the valley colour toward LEAF, blend 1 iteration, and skip valley paint on clumps whose centre has `nm z > 0.6`.

## Pebblet: ready
1. MUST per-facet face: fixed. Crisp facets, no stain.
2. MUST flecks: fixed (the grease spots are gone; the facet flecks are subtle, fine).
3. SHOULD chin band: partly. Symmetric and under the mouth in 1_front, but in battle the SAND_D zone climbs the far cheek to nose level and reads as a dark jaw (`pebblet_battle_face.png`). Cap it at the mouth height (z of the mouth tube) and x < -0.10.
4. NICE far-eye sliver: not fixed (white + ink sliver at the back-3/4 edge, `pebblet_back34_sliver.png`). Same facing-hide fix as Dropple.

## Breezel: ready
1. MUST wings: fixed in battle, front and 3/4 (wing leaves the body, pale tip reads as feather). In 3_side/back-3/4 the wing still lies flat as an inked teardrop (`breezel_side_wing.png`); side only, accept.
2. SHOULD tail fan: fixed enough; three white-tipped lobes read as a fan from behind.
3. SHOULD belly vs cloud: fixed; the two whites separate.
4. NICE beak: fixed (longer, reads as a beak).
5. NICE curl yaw: not fixed; still a straight post from back-3/4 (`breezel_back34_curl.png`). Cosmetic.

## Vulcrag: ready
1. MUST arms: fixed. Shoulder, elbow, knuckled fists, glow under a crust.
2. MUST veins: fixed. Branching cracks reach the base on back/3/4; back view is lit from within.
3. MUST plume: fixed. One flame, floating spits gone.
4. SHOULD cone value: partly. Lighter overall, but rim/arm tops are not stepped lighter; battle still reads as one dark mass with ink.
5. NICE crease ink: fixed (remaining strokes read as rock).
- NEW: the drip became two orange bulges on the rim sides that read as ears in 1_front (`vulcrag_front_rim.png`) and the far eye slab pokes through the silhouette in 3_side (`vulcrag_side_eye.png`). Fix: run the drip as a LAVA tube down the flank from the rim (z 1.05 to 0.70) instead of a bulb at the rim, and sink the eye/mouth slabs 0.02 into the cone (or clip them with the facing test). Neither shows in battle.

## Surgeray: one more pass (back cameras only)
1. MUST tail bolt: fixed in battle/front/3/4 (flat, off to one side, nothing stacks). Not fixed from behind: in 4_back34 the tail crosses the body and the tail bolt stacks over the dorsal bolt (`surgeray_back34.png`).
2. MUST face smear: fixed. Clean eyes, one mouth arc, belly only under the chin. Face is small (eyes ~12 px at 300 px); consider eye radius x1.25.
3. MUST bolts: fixed, flat slabs, contour ink only.
4. SHOULD bend/slug: fixed in front views (no shading bands). The side view now reads as a bent card instead of a slug.
5. NICE bevel ink: fixed.
- NEW, blocking: with the 36 deg tip, both back cameras show a paper-thin raised sheet with the pale underside facing the camera (`surgeray_back.png`), and the player sees their own kin from behind. Fix: tip 36 -> ~22 deg and recover the battle read by raising the head mound (so the face still meets the low camera), thicken the disc at the centre (0.10 -> 0.18, tapering to the tips), restrict the belly zone to the front half of the underside (`nm z < -0.3 and co x > 0`) so the back shows royal blue plus the dorsal bolt, and swing the tail further out (y -0.28 -> -0.45, flat) so it never crosses the dorsal bolt from behind.

## Group verdict
Five of six are ready: render final sheets for Dropple, Mossling, Pebblet, Breezel and Vulcrag now; hold Surgeray for one back-camera pass (tilt, thickness, belly zone, tail swing), then re-check 4_back34/5_back only.
