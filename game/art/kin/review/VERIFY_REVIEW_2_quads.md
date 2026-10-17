# Verify: polish review 2, the quadrupeds (2026-10-17)

Crops in `review2/crops2/` (before | after side by side).

## Ashkit: ready
1. SHOULD ember core centred/grown: fixed (back, back-3/4).
2. SHOULD rump cleft: not fixed. Back view still has the two curved crease strokes under the tail (`ash_back.png`); the 3/4-back rump stroke is gone. The fill ball was either not added or is too small: r 0.30 -> 0.38 at (-0.52, 0, 0.58).
3. NICE jowl ink: not fixed (side, 3/4).
4. NICE ear gradient: not fixed (cross-kin 4).
No regressions. Ship it; the rump stroke is a one-line tweak if there is a next pass.

## Cindertail: one more pass
1. MUST ruff one mass: partly. The tongues now overlap and the gold tip is a zone (good), but the mass is painted with soft feathered strokes, so the battle and 3/4 views read as an airbrushed beard with hairline ink scratches between tongues (`cin_ruff.png`); from the side it is still a flat blade hanging below the chin. Fix: 3 tongues not 5, minor axis 0.16, no per-tongue gradient (one flat cream zone + one hard gold tip zone), sink the side pair so the side silhouette shows a chest bulge rather than a fin.
2. MUST belly bleed: fixed (3/4 and back-3/4 inner legs clean).
3. MUST back view plume: fixed (core centred, tail ball, soot patch gone).
4. SHOULD ear smear: not fixed.
5. NICE far eye tangent: not fixed (`cin_face.png`).
New: none.

## Pyrelord: one more pass
1. MUST mane collar: partly. Tongues are fatter and fewer, but it is still a row of fins, not a collar: side view shows blades fanned along the neck with Freestyle lines cutting through overlapping neighbours (crossed-paper look, `pyr_side.png`, `pyr_collar.png`), back view shows seven outlined shards in a line across the shoulders (`pyr_back.png`). The ring metaball was not added, or is below the surface. Fix: union the tongues with the body (boolean/remesh) before Freestyle so inner intersections are not inked, and put the ring at NC r 0.34 so the tongue bases are visibly inside one raised band.
2. SHOULD spine studs: fixed, but now they are flame tongues identical to the collar, so collar + studs read as one stegosaurus row from the side. Make studs round ember nubs (sphere, `mat_ember` core only), not tongues.
3. SHOULD belly strip on inner forelegs: partly, fainter smear remains (`pyr_belly.png`).
4. SHOULD cores off-centre: fixed.
5. NICE claws: fixed.
New: the crossed-tongue ink in side and 3/4 (above).

## Thistlehorn: ready (one minor)
1. MUST horn lollipop: fixed. Thicker, curved, bloom r up, calyx sunk (`thi_horn.png`).
2. MUST mantle shape: fixed. Clipped before the neck, reads as a saddle with a silhouette step (`thi_mantle.png`).
3. SHOULD flank leaves: fixed (three sizes, overlapping, partly under the mantle).
4. SHOULD chest disc/belly leak: partly. The hard circle is gone but the chest patch is now a soft airbrush blob and a faint pale smear remains at the inner hind leg (`thi_chest.png`). Cross-kin 4.
5. NICE hooves flat front: not fixed (`thi_hoof.png`).
New: none. Good enough for sheets.

## Rillback: ready
1. MUST board: fixed. Rocker and thickness read in battle and 3/4 (`ril_board.png`). The racing stripe is still a thin navy edge line, not a 0.11 stripe; it survives at 512 but will vanish at 300 px. Widen it if a pass happens.
2. MUST inner-leg aqua blotches: fixed (back, back-3/4).
3. MUST muzzle band: fixed as an ellipsoid; the top edge is airbrushed (`ril_face.png`).
4. SHOULD head fin: fixed (cut).
5. SHOULD fluke: fixed (thick, notched, `ril_rear.png`).
New: two short hook-shaped crease strokes at the inner thighs in the back view (`ril_rear.png` left). Low priority: raise `crease_deg` 100 -> 115 for this kin.

## Verdantusk: one more pass
1. MUST leaf ears porthole: not fixed. In 3/4 and side the ear is still a closed ink oval lying flush on the skull, only rotated (`ver_ear.png`); it leaves the skull only in front and back views. The centre needs to move outboard (y 0.76 -> 0.84) and the ear needs a visible base stalk, or go in as a stiff metaball so only its free tip is inked.
2. MUST rump cleft/tail: fixed. Back view is one smooth rump with the tail leaf standing on it; back-3/4 shows the leaf at the rump edge instead of a patch on the hip (`ver_rump.png`).
3. SHOULD lime snout: fixed (ellipsoid, `ver_face.png`).
4. SHOULD lone ferns: fixed (two clusters inside the grove).
5. NICE crown: fixed (three blooms).
New: none.

## Cragmaul: ready
1. MUST brow loop: fixed. The brow is one mass with the head, only the ledge underside is inked (`cra_face.png`, `cra_front.png`).
2. MUST stray crease ink on back: not fixed. The C-stroke on the left shoulder and the right mid-back curve are unchanged (`cra_back.png`). The displacement or crease change did not land; apply `crease_deg` 125 for this kin.
3. SHOULD eyes: fixed (larger, pupil disc).
4. SHOULD jaw patch/chest plate: partly. The box is gone, both are now airbrushed blobs (cross-kin 4).
New: none. The back strokes are turnaround-only, so sheets can go.

## Cross-kin status
1 belly zones: fixed everywhere. 2 planar cuts: fixed. 3 camera-offset cores: fixed. 4 smoothstep blur: not fixed on any kin (ears, chest discs, Cindertail ruff, Rillback muzzle, Cragmaul chest); still the biggest shared softness, do the fixed-width SDF smoothstep. 5 thin blades: fixed for board, fluke, fin; not for Pyrelord's mane. 6 rump fill: fixed on Verdantusk, not Ashkit. 7 booleans as skull: fixed for Cragmaul and the calyx, not Verdantusk's ears.

## Group verdict
Four of seven are sheet-ready (Ashkit, Thistlehorn, Rillback, Cragmaul); render final sprite sheets for those now. Hold Cindertail (ruff), Pyrelord (mane) and Verdantusk (ears) for one short pass, and fix cross-kin 4 once in `lib/common.py` before the final bake of all seven.
