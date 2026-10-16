# Kin production (pre-rendered Blender toon sheets)

One folder per kin, built with the Ashkit template (`../ashkit/`, gates 1-2) and the shared kit in `lib/`.

- `lib/common.py`, `lib/turn.py`, `lib/montage.py`: the headless-Blender toon recipe (moved here from `../ashkit/scripts/`).
- `lib/sheetkit.py`: the pose API, keyed clips, ground checks (with a "sinks" report naming the bone of the lowest vertex), one
  camera per view fitted to every frame, ink scaled to the creature, the render loop, `meta.json`, and a guard against
  re-rendering only some clips after the framing changed.
- `lib/quad.py`: the shared four-legged clips (idle, attack pounce with its travel curve, hit, faint), authored on Ashkit;
  `scale` sizes the translations, `faint_drop` / `faint_leg` let a taller kin lie flat.
- `lib/quadrig.py`: the four-legged rig and procedural weights from a short spec (`run_quad(SPEC, HERE)`).
- `lib/pack.py`: frames to WebP atlases + JSON (`opaqueExt`, `travel`), full and half (`SCALE=0.5`).

Per kin: `model.py` (blockout, face parts snapped to the skull, union, colour zones, the 'battle' head-turn key; writes
`<kin>_final.blend` and a turnaround), `anim.py` (the spec; writes `<kin>_rig.blend` and frames), `sheets/`, `review/`.
Run with the bpy 5.2.2 venv: `MODE=both SIZE=512 SPP=8 OUTDIR=... python -I model.py`, then `OUT=<frames> python -I anim.py`
(`DRY=1` for checks and framing only), then `python3 lib/pack.py <frames> <sheets>`.

## Status (2026-10-16)
| kin | model | sheets | notes |
|---|---|---|---|
| ashkit | done (template) | done | gate 2 `better` 4/4 stills; attack pass judged `no_difference` vs static (was `worse`); see `../ashkit/review/GATE2.md` |
| cindertail | v1 | full set packed | anatomy checklist passed by eye on the turnaround; not yet gated; re-render with the final quadrig before shipping (checks and framing are identical) |
| pyrelord | v1 (round 2) | not yet | faint tuned (drop 0.35 / legs 0.29); `ground_band` 0.30 keeps the claws on the legs |
| others | - | - | quad: rillback, thistlehorn, verdantusk, cragmaul; need new clip sets: hoppers (dropple, mossling, pebblet, breezel, vulcrag), fliers (flickwing, stormoth, cyclonyx, petalwisp), serpent (maelstrode), ray (surgeray) |
