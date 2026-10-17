# Kin production (pre-rendered Blender toon sheets)

One folder per kin, built with the Ashkit template (`../ashkit/`, gates 1-2) and the shared kit in `lib/`.

- `lib/common.py`, `lib/turn.py`, `lib/montage.py`: the headless-Blender toon recipe (moved here from `../ashkit/scripts/`).
- `lib/sheetkit.py`: the pose API, keyed clips, ground checks (with a "sinks" report naming the bone of the lowest vertex), one
  camera per view fitted to every frame, ink scaled to the creature, the render loop, `meta.json`, and a guard against
  re-rendering only some clips after the framing changed.
- `lib/quad.py`: the shared four-legged clips (idle, attack pounce with its travel curve, hit, faint), authored on Ashkit;
  `scale` sizes the translations, `faint_drop` / `faint_leg` let a taller kin lie flat.
- `lib/quadrig.py`: the four-legged rig and procedural weights from a short spec (`run_quad(SPEC, HERE)`).
- `lib/hop.py` + `lib/hoprig.py`: clips and rig for round, hopping kin (squash, stretch, hop-pounce; no legs).
  Bones root / cog / stretch / body plus optional appendages (tip1/tip2, fin.L/R, ear.L/R, leaf1/leaf2) weighted by
  capsules or claimed whole by material (`slots`; give left and right their own materials when a limb hangs close to the
  body, and give any rigid part, such as a tail-tip bolt, its own slot). `gain` scales or reverses an appendage's clip
  rotations (Vulcrag's fists swing out, not into the cone); `squash` scales squash and stretch (stone kin 0.4-0.5).
  `ground_lock` keeps the lowest vertex on the floor.
- `lib/fly.py`: flier clips on the same rig (`clips='fly'`): hover idle with per-kin wingbeats (`beats`, `flap`), swoop
  attack, hit, a faint that flutters down and lands (the ground lock puts it exactly on the floor). The model is built
  hovering; the hover is its lowest point.
- `lib/serpent.py` + `lib/serpentrig.py`: a coiled serpent: coil, tail, a four-bone neck and head, every vertex weighted
  by arclength along the kin's centre line (`<kin>/shape.py`), so fins and frills follow their stretch of body.
- `lib/quadrig.py` extras: segment legs can claim a material rigidly near the foot (a boulder fist must not shear), and
  `faint_front` scales the front legs' faint pitch (0 keeps a knuckle-walker's fists planted).
- `lib/pack.py`: frames to WebP atlases + JSON (`opaqueExt`, `travel`), full and half (`SCALE=0.5`).

Per kin: `model.py` (blockout, face parts snapped to the skull, union, colour zones, the 'battle' head-turn key; writes
`<kin>_final.blend` and a turnaround), `anim.py` (the spec; writes `<kin>_rig.blend` and frames), `sheets/`, `review/`.
Run with the bpy 5.2.2 venv: `MODE=both SIZE=512 SPP=8 OUTDIR=... python -I model.py`, then `OUT=<frames> python -I anim.py`
(`DRY=1` for checks and framing only), then `python3 lib/pack.py <frames> <sheets>`.

## Status (2026-10-17, after polish review 2)
All 18 species in docs/CREATURES.md have a polished model, a rig spec and (done or queued) final sheets. Reviews:
`review/POLISH_REVIEW_2_*.md` (Fable art-director pass per body plan), `review/VERIFY_REVIEW_2_*.md` (its check of
the fixes). "final" = sheets rendered from the verified model: idle/attack/hit/faint x front/back, packed full and
half, contact sheet in `review/`.

| kin | rig | model | sheets | notes |
|---|---|---|---|---|
| ashkit | quad | final pass running | fable1 sheets (pre-polish) | the template; ember core painted by facing, crisp ear bands |
| cindertail | quad | final pass running | fable1 sheets (pre-polish) | ruff as one mass (pass 2), belly faces down only |
| pyrelord | quad | final pass running | fable1 sheets (pre-polish) | metaball collar; pupils blink (`eye_slots`) |
| thistlehorn | quad | final pass running | fable1 sheets (pre-polish) | thick curved horn, saddle mantle |
| rillback | quad | final pass running | fable1 sheets (pre-polish) | rockered board with a flush stripe |
| verdantusk | quad | final pass running | pre-polish | ears out of the skull (pass 2), V tail leaves, rump fill |
| cragmaul | quad | final pass running | pre-polish | brow as a stiff metaball, larger eyes |
| dropple | hop | verified | final | flipper fins, two placed shines, capped ripple bands |
| mossling | hop | verified | final | dark folds between clumps (cavity), toed feet |
| pebblet | hop | verified | rendering | colour per stone facet |
| breezel | hop | verified | queued | wings outside the body (per-side wing materials) |
| vulcrag | hop | verified | queued | shoulder/elbow arms, crusted fists, branching cracks |
| surgeray | hop | verified | queued | rebuilt from formulas, tipped 26 deg to the camera, battle turn 36 deg |
| stormoth | fly | verified | final | front-facing display wings, flush bolt |
| flickwing | fly | verified (pass 2) | queued | glowing lantern pitched to show in battle |
| cyclonyx | fly | verified (pass 2) | queued | five-point wings, level spread streamers |
| petalwisp | fly | verified (pass 2) | queued | pink back of head, tilted wisp |
| maelstrode | serpent | verified (pass 2) | queued | no centre crest, tall splayed dorsals, belly V |

Display poses: wings and the ray face the low battle camera (yaw 35 + the 16 deg battle turn, elevation 12), so side
turnaround views of the fliers are edge-on by design; judge models on `battle.png` and the 3/4 first.

## Template fixes from Fable review 1 (2026-10-17, `../ashkit/review/FABLE_REVIEW_1.md`)
Applied in the shared code, so every kin gets them on its next render (all 19 were queued for re-render):
- **Far eye:** sheetkit hides an eye in any view where it faces the camera less than `FAR_EYE_T` (0.25). The
  back-view sliver and the hit "crown dot" were both the far eye at the silhouette edge. The run prints each eye's
  facing per view and `meta.json` lists the hidden eyes. Set a kin's `eye_centre` behind the eyes, or the test
  measures sideways (Surgeray).
- **Faint paws:** the folded legs shorten toward the hips (`quad.FOLD`); the lying drawings snap to the floor
  (`ground_snap`), and stagger, attack and hit drawings lift if a paw dips under it (`ground_lift`, moving `root`).
- **Hop-back:** leans forward with the forelegs tucked (it read as rearing up and begging).
- **Idle:** bigger breath, nod, glance and tail sway. There is no baked blink, because the loop is one second long:
  the sheet player should blink now and then.
- **Back markings:** Dropple has ripple bands and Mossling has back blossoms and mottled moss; both read cleanly.
  A dorsal stripe painted in vertex colours was tried on Ashkit and Cindertail and reverted: the vertex colours are too
  coarse, so it read as dirt. The quads need a decal or a texture mask for this.
- Not done yet (SHOULD/NICE in the review): quad back markings (above), a hock bend on the quad legs, inking the tail
  flame, a faint body roll toward the camera, matching `restHeightPx` in game.

## Lessons from the production run
- Probe a few poses (`SPP=4 SIZE=384 VIEWS=.. CLIPS=.. FRAMES=..`, a separate `OUT`) before queueing a 6-13 minute
  render: every defect found this run (sheared fists, smeared tips, inward fists) showed in 3-5 probe frames.
- A rigid part (boulder, bolt, crystal tip) must belong to one bone: soft capsule weights shear it.
- A self-touching tube drops out of a boolean union: keep spiral turns apart, or voxel-remesh the body (Maelstrode).
- Metaballs blend a head into the body (a skittle): make the head its own mesh and join it with a boolean.
- Face parts snap with rays from inside the body; for thin or bent bodies find the mid-thickness first (Surgeray `mid`).
