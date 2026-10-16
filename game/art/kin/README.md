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
  body); `gain` scales or reverses an appendage's clip rotations (Vulcrag's fists swing out, not into the cone).
  `ground_lock` keeps the lowest vertex on the floor.
- `lib/pack.py`: frames to WebP atlases + JSON (`opaqueExt`, `travel`), full and half (`SCALE=0.5`).

Per kin: `model.py` (blockout, face parts snapped to the skull, union, colour zones, the 'battle' head-turn key; writes
`<kin>_final.blend` and a turnaround), `anim.py` (the spec; writes `<kin>_rig.blend` and frames), `sheets/`, `review/`.
Run with the bpy 5.2.2 venv: `MODE=both SIZE=512 SPP=8 OUTDIR=... python -I model.py`, then `OUT=<frames> python -I anim.py`
(`DRY=1` for checks and framing only), then `python3 lib/pack.py <frames> <sheets>`.

## Status (2026-10-16)
| kin | rig | model | sheets | notes |
|---|---|---|---|---|
| ashkit | quad | done (template) | done | gate 2 `better` 4/4 stills; attack pass judged `no_difference` vs static (was `worse`); see `../ashkit/review/GATE2.md` |
| cindertail | quad | v1 | full set | not yet gated; re-render with the final quadrig before shipping (checks and framing are identical) |
| pyrelord | quad | v1 | full set | faint drop 0.35 / legs 0.29; `ground_band` 0.30 keeps the claws on the legs |
| thistlehorn | quad | v1 | full set | leaf ears on axis (0,1,0) |
| rillback | quad | v1 | full set | tail on `tail_axis` x, `tail_pitch` -0.15 keeps the tail off the floor in the faint |
| verdantusk | quad | v1 | full set | `faint_head` -0.2 keeps the tusks out of the floor |
| cragmaul | quad | v1 | rendering | grounded rest pose, segment-leg arms |
| dropple | hop | v1 | queued | curl on tip1/tip2, fins |
| mossling | hop | v1 | queued | sprout on one leaf bone |
| pebblet | hop | v1 | queued | chipped facets (dissolve-decimate, then a flat subdivision so colour zones have vertices); no appendages |
| breezel | hop | v1 | queued | head is a separate mesh joined by a boolean (metaballs blended it into a skittle); swirl on tip1/tip2, wings on fins |
| vulcrag | hop | v1 | queued | lathed volcano profile; fists on fins with `gain` -0.8; motion scale 0.7 (heavy) |
| fliers | - | - | - | flickwing, stormoth, cyclonyx, petalwisp: need a flier clip set and rig |
| maelstrode, surgeray | - | - | - | serpent and ray clip sets |

None of the new kin is gated yet: the contact sheets were checked by eye only (grounding, framing, clip readability).
