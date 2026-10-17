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

## Status (2026-10-17)
All 18 species in docs/CREATURES.md have a model and a rig spec. "full set" = idle/attack/hit/faint x front/back, packed
full and half, contact sheet and turnaround in `review/`.

| kin | rig | sheets | notes |
|---|---|---|---|
| ashkit | quad | done | the template; gate 2 `better` 4/4 stills; see `../ashkit/review/GATE2.md` |
| cindertail | quad | full set | re-render with the final quadrig before shipping (checks and framing are identical) |
| pyrelord | quad | full set | faint drop 0.35 / legs 0.29; `ground_band` 0.30 keeps the claws on the legs |
| thistlehorn | quad | full set | leaf ears on axis (0,1,0) |
| rillback | quad | full set | `tail_axis` x, `tail_pitch` -0.15 keeps the tail off the floor in the faint |
| verdantusk | quad | full set | `faint_head` -0.2 keeps the tusks out of the floor |
| cragmaul | quad | re-rendering | v1 sheets sheared the boulder fists: fixed with the rigid foot claim and `faint_front` 0 |
| dropple | hop | full set | curl on tip1/tip2, fins |
| mossling | hop | full set | sprout on one leaf bone |
| pebblet | hop | re-rendering | chipped facets; `squash` 0.4 (v1 flattened like jelly in the faint) |
| breezel | hop | full set | boolean-joined head (metaballs blended it into a skittle); swirl on tip1/tip2, wings on fins |
| vulcrag | hop | queued | lathed volcano profile; fists on fins with `gain` -0.8; `squash` 0.5; motion 0.7 |
| surgeray | hop | queued | bent lens slab + head mound; wings on wide capsules at half gain; tail-tip bolt claimed by slot |
| flickwing | fly | queued | buzzing wings (6 beats per idle); antennae and sparks per-side slots |
| stormoth | fly | queued | slab wings with bolt and spots in a V, 2 slow beats; banded abdomen on tip1 |
| cyclonyx | fly | queued | raptor; underwing + primaries on the wing slots; streamers on tip1/tip2 |
| petalwisp | fly | queued | no wings: leaf arms on leaf1/leaf2, the wisp tail on tip1 |
| maelstrode | serpent | queued | strike straightens the S; faint drops the neck base 66 deg (the barbels just touch) |

None of the new kin is gated yet: the contact sheets were checked by eye only (grounding, framing, clip readability).

## Lessons from the production run
- Probe a few poses (`SPP=4 SIZE=384 VIEWS=.. CLIPS=.. FRAMES=..`, a separate `OUT`) before queueing a 6-13 minute
  render: every defect found this run (sheared fists, smeared tips, inward fists) showed in 3-5 probe frames.
- A rigid part (boulder, bolt, crystal tip) must belong to one bone: soft capsule weights shear it.
- A self-touching tube drops out of a boolean union: keep spiral turns apart, or voxel-remesh the body (Maelstrode).
- Metaballs blend a head into the body (a skittle): make the head its own mesh and join it with a boolean.
- Face parts snap with rays from inside the body; for thin or bent bodies find the mid-thickness first (Surgeray `mid`).
