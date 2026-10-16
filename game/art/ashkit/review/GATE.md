# STEP 4 gate: pre-rendered Blender Ashkit vs static D-native

Date 2026-10-16. Gate run: `/tmp/claude-0/-home-user-gravity-innovation/a5440fec-78d9-5c47-821a-56c84521c2ff/scratchpad/prerender/gate/1016-0449-ashkit-sheets/`
(all verdict JSONs with provenance hashes, `report.md` from `report.sh`, 0 refused rows). Owner sheet:
`/tmp/claude-0/-home-user-gravity-innovation/a5440fec-78d9-5c47-821a-56c84521c2ff/scratchpad/prerender/sheet.jpg`.
Nothing committed. The run is **UNSEALED** (`doctor.sh`: `sealed: missing`), so every verdict is pilot evidence and nothing can be
ACCEPTED on it anyway.

## Verdict

**NOT ACCEPTED in its current form.** Every in-battle comparison came back `worse` (4 of 4 stills, plus the attack strip). The losses
come from the camera angle, not the art. The back view your Ashkit uses (35° behind the side, 30° elevation) hides the face and
merges the near ear into the skull, and every judge reason says so. At the same camera angle, the step-1 anatomy pass beat bake-off D
4/4 at confidence 4. Fix the back view (see the fixes below), re-render it (42 frames, about 3 min), recapture and re-gate.

## Numbers

| check | result |
|---|---|
| defect floor, 4 shots | pass 4/4 |
| pixdiff outside the kin boxes | 1.23 / 1.35 / 1.70 / 1.32 % (cave desk / cave phone / meadow desk / meadow phone). Every change sits inside one box around Ashkit and the trainer: the step-3 trainer move and the larger contact shadow. Not an rng confound, but the staging change is bundled into the comparison. |
| judge, full frame (both orders, 2 votes per order) | cave desk 3/4 `no_difference` (lost one order); cave phone 1/4 `no_difference`; meadow desk 0/4 `worse`; meadow phone 0/4 `worse`. Pooled: 4/16 = 25 % |
| judge, 2x Ashkit crop | 0/4 in every shot. Pooled: **0/16**, confidence 3-4 |
| per-shot decision | **worse, worse, worse, worse** (where the full frame was undecided, the crop decided) |
| canary (still) | passed 5/5 runs; confidence 5/5, 4/3, 4/5, 2/2 (meadow phone weak), 4/3 |
| attack motion strip (`judge_motion --kind attack`) | **worse**, 0/4 (confidence 3-4). Canary: blur weak (confidence 1/1); hitstop skipped (baseline holds 3 frames, fewer than 4). Weak evidence by rule 9, but it points the same way as the stills. |
| control: same-angle anatomy still (step-1 `battle.png` vs D `ashkit.png`, full view, no ref) | **better**, 4/4 at confidence 4 ("cleaner face construction, coherent mouth and eye placement"; D "misplaced eyes, stray line artifacts") |
| originality (`ip_check`, turnaround lineup + cave scene crop) | PASS / PASS. Max similarity 4/10, generic overlap; closest Palworld Foxparks (same as the pilot) |
| motion lint, sheets vs static (advisory) | distinct-pose share 0.58 vs 0.96 (12 fps sheet vs smooth 60); anticipation depth **1.09 vs 5.61 texels**; strike 9 vs 17 frames; overshoot 6.3 vs 14.5 texels; settle 47 vs 67 frames; text-to-launch 73 vs 52 frames (+350 ms, the crouch frames now come before the lunge) |
| cost and time | $2.33 in judge and IP calls; still judges 3.6 min; strips 14.3 + 14.8 min (60 fps, Bump, Ashkit vs Cragmaul, cave, `dist2`; the baseline is the same build with `?kinsheet=0`) |

The sync strip could not be built: `strip.mjs` took the impact at f213/f189, outside the shot window of f58-157, so no hit-feedback
verdict was made. Recurring critic notes that are not about Ashkit: Cragmaul's value merges with the brick wall; the god-ray pool lights
empty floor; the creatures are smooth-shaded and the world uses chunky texels. The last one applies to the static D art too, and the
owner already chose it.

## Anatomy review (owner checklist), creature artist's read

The review covers the turnaround, `battle.png`, the face before/after, the contact sheet, full-size key frames (front attack 4/5/6,
hit 1, faint 5/9, both views) and the in-battle strip.

| item | front 3/4 (foe view) | back 3/4 (your kin, the in-game view) |
|---|---|---|
| eyes position | **PASS.** On the front of the skull above the snout, both on orange, far eye inside the outline in the battle pose; symmetric in the front view | **FAIL.** The near eye sits on the silhouette edge where the snout starts, with the glint on the outline. At sprite size it reads as a speck stuck to the profile, which is the owner's "eyes out of position" again |
| nose | **PASS.** Rounded inverted triangle at the snout tip in every view | pass (only the tip shows) |
| mouth | **PARTIAL.** (a) The near half of the smile runs back to below the eye, about half the head width, while the far half hooks down beside the nose, so in 3/4 the mouth reads as a lopsided smirk or frown (idle, attack f4-f5). (b) The cream jaw-mask edge draws a second ink line about 20 px under the mouth (battle size), which reads as a double mouth or jowl. (c) The philtrum tick from step 1 is still visible | not visible |
| both ears | **PASS.** Both read, with dark tips | **FAIL.** At 30° elevation the near ear projects onto the skull instead of against the background, and its orange back matches the head, so it reads as a dark oval dimple. The silhouette has one ear (judges: "single ear", "one ear spike") |
| limb attachment | **PARTIAL.** Front legs drop from under the chest, which is fine. In side view the rump overhangs the hind paws by about one paw length, so the hind legs read as coming out of mid-belly rather than from under the hip. Legs are uniform tubes with no elbow or hock, front and hind alike (acceptable for chibi, but the hind leg needs a heel) | Legs read as four dark pucks under an orange bean; same root cause |
| planted paws | **PASS** in idle (sole movement 0.0) and in the attack: launch with the hind paws on the ground, airborne in f5 | **PASS**, except faint f8-9 (paws sink about 2 px, already known), and back faint f9 shows the near paw as a cut-off black block |
| value / read | Dark socks are the darkest, largest value mass and pull the eye below the face (anatomy-still critique) | Body orange is within 10-15 % of the sunlit floor value (critique, both arenas) |
| line | Short broken ink strokes on the forehead in folded-ear frames (front attack f4-f5 at full size, faint f5-f9). The tail flame uses an orange outline, unlike the dark ink everywhere else | same |
| motion | Crouch, launch, air, contact and hop back all read on the contact sheet | From behind the crouch is shallow (1.09 texels vs 5.61 for static); judges: "weaker anticipation". At contact (f078) the snout reaches the front of Cragmaul's box (x about 690 vs 680) and the sparks fire there, but the existing hit strobe hides Cragmaul on that frame, so the contact still reads as a hit on empty air |

## Remaining fixes (in priority order)

1. **Back-view camera.** Render the back view from nearer the side: yaw −35° to about −10° to −15°, so the camera sits about 100-105°
   from the snout instead of 125°, at the same 30° elevation. The eye and the white cheek then sit inside the head and the snout breaks
   the profile. The other option is to keep −35° and add a back-view-only head turn of about 20-25° toward the camera. (The baked step-1
   `battle` turn already swings the head about 16° toward this flank; it is not enough at 125°.) Re-run
   `work/anim.py` with `YAW_BACK` set, then `pack.py` (full and half). Expected cost: 42 frames at about 3.9 s each.
2. **Near ear from behind.** Give the ear backs a dark-brown patch (red foxes have black ear backs), or splay the ears about 10°
   outward so the near ear clears the skull silhouette at 30° elevation. The dark back also adds the "signature marking" `ip_check`
   suggests.
3. **Contact frame visibility (game, not art).** The hit strobe hides the foe on the sheet contact frame (f078 in the strip). Start the
   strobe one frame after contact, or keep the foe visible on the contact frame, so the bump visibly lands.
4. **Mouth.** End the near mouth corner below the front edge of the near eye (about 30 % shorter). Make the far half a gentle upturn,
   not a down-hook. Drop the philtrum line. Take the Freestyle line off the cream jaw-mask seam: draw silhouette, crease and border only,
   or move the mask edge into a non-line material boundary.
5. **Hind-leg placement.** Move the hind legs back about one paw length, or trim the rump overhang, so the paws sit under the hip.
   Add a slight hock angle so front and hind legs read differently in profile.
6. **Back-view anticipation.** Deepen the crouch on attack f1-3 for the back view: lower the body further and push the head down
   so it reads from above and behind. Consider one extra anticipation frame.
7. **Line clean-up.** Remove the forehead strokes on folded-ear frames (exclude the ear-base crease edges from the line set, or raise the
   crease threshold). Optionally ink the tail flame with the dark line colour so the creature has one line colour.
8. **Value.** Lift the socks from about 15 % to about 35 % luminance, or shorten them, so the face wins. Consider a 1-texel darker rim
   on the back view so the orange separates from the sunlit floor.
9. Already known from step 2: faint f8-9 paws sink about 2 px, and the near paw in back faint f9 renders as a black block.

After fixes 1-3, recapture the same 4 shots and the Bump strip with the same tooling, and re-gate. Fixes 4-8 are a modelling pass
(about 60 s per build) plus a full re-render (84 frames, about 5.5 min).

## Owner check

1. Back view (your kin): side-on, about −12° yaw (more face, less "from behind"), or keep −35° with a stronger head turn? About 2 min
   on `sheet.jpg` rows 3-5. Default: −12° yaw.
2. Dark ear backs as a new marking for Ashkit: yes or no? About 1 min. Default: yes.
