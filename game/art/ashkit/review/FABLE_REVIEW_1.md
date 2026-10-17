# Fable review 1: Ashkit as the template (2026-10-17)

Reviewer: a Fable subagent in the role of senior creature artist and art director. It was read-only and measured
against the owner's anatomy checklist (`../../README.md`), using the gate-2 files here and the other kins' sheets in
`../../kin/`. The verdict, fixes and risks below are its report, lightly condensed. The applied fixes are tracked in
`../../kin/README.md`.

## Verdict: ship with fixes
The round-3 Ashkit reads as a finished toon creature in battle (16/16 crop wins), and the roster already proves the
recipe generalises. Three per-frame artifacts and a near-static idle will be copied into every kin unless they are
fixed in the shared clips first.

## Anatomy checklist
| item | result | evidence |
|---|---|---|
| eyes front, spaced, symmetric | partial | Front, 3/4 and foe views pass. In the back view, the 32° combined head turn leaves the far eye as a white sliver on the muzzle edge (turnaround "your kin idle 0", the cave-D 2x crop, back attack f0 and f5-f9). On back hit f1-f2, a dark dot on the crown between the ears (the far ear's dark back) reads as a third eye. |
| nose at tip, readable mouth | pass (minor) | A faint jowl contour under the cream mask shows at 2x. |
| both ears readable in battle cam | pass | |
| limbs at believable shoulders/hips | partial | All four legs are identical tubes. There is no hock, so the hind legs look like the front legs in profile. |
| all feet on one ground plane | partial | Faint f7-f9: the paws show as cut-off dark wedges behind the rump (back view) and under the chest (front view). The same defect is on Cindertail and Thistlehorn. |
| clear room from trainer | pass | The sheet kin draws smaller than the static still (`restHeightPx`); that is a game-side fix. |
| back markings / shape interest | partial | The back is a flat orange bean, and the ear backs are its only marking. |

## Fixes, ranked
1. **MUST:** remove the far-eye sliver in the back view. Hide the eye fully or show at least 60% of it.
2. **MUST:** remove the crown dot on back hit f1-f2. Keep the base of the dark ear back orange, or reduce the head pitch.
3. **MUST:** remove the faint f7-f9 paw blocks. Tuck the legs, or sink the socks inside the belly silhouette.
4. **SHOULD:** the idle reads as static. Add a blink, an ear flick, a ±8° tail sway and a ~3% chest rise.
5. **SHOULD:** the hop-back on attack f8-f9 (upright, forepaws raised) reads as begging. Pitch the body forward ~15° and tuck the forelegs. It is shared with Cindertail and Thistlehorn.
6. **SHOULD:** add a back marking, such as a sooty dorsal "ash" smudge from crown to tail root about 20% darker.
7. **SHOULD:** add a visible hock bend of 10-15° so the hind legs differ from the front legs in profile.
8. **NICE:** ink the tail flame with the dark line. Drop the chin contour.
9. **NICE:** roll the fainted body ~12° toward the camera so the belly shows.
10. **NICE (game code):** match the sheet's `restHeightPx` to the static still's height.

## Motion at 12 fps
- **Idle:** does not read (fix 4).
- **Attack:** reads, apart from the hop-back pose (fix 5). The 24-frame settle is a near-static slide, and contact still falls a snout short in the cave shot.
- **Hit:** reads, but the crown dot lands on the frame the player watches.
- **Faint:** reads, apart from the paw blocks and a weak "fainted" signal.

## Template risks across the roster
- The shared clips repeat these defects: the rearing hop-back, the faint paw wedges, and a static idle on every sheet.
- Flat backs on Cindertail, Verdantusk, Dropple and Mossling. Make a back marking a required field in the per-kin spec.
- Head-turn tangency (fix 1) recurs on any snouted kin at the same `HEAD_BACK`. The round hoppers are unaffected.
- The turnaround's `4_back34.png` still uses the old angle. Only `battle.png` shows the in-game view.
