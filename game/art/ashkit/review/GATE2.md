# Gate 2: Ashkit pre-rendered sheets after the gate-1 fixes vs static D-native

Date 2026-10-16. Follows `GATE.md` (gate 1, not accepted). The owner's defaults from the handoff were used: back
camera at about −12° yaw, and dark ear backs as a new Ashkit marking. Run directory (scratch, not committed):
`gate/1016-1352-ashkit-gate2/` with every verdict JSON, its provenance hashes, the floors and the ip_check raw
files. The run is **UNSEALED** (`doctor.sh`: `sealed: missing`), so every verdict is pilot evidence. By the
skill's decision rule the result is **QUEUED for the owner**, not ACCEPTED.

Owner images: `gate2_side_by_side.jpg` (static, gate-1 sheets, round 1, round 2; desk, phone and 2x crops),
`gate2_turnaround.png` (the new model in five views plus the two in-game sheet views and the attack crouch),
`gate2_face_before_after.png`, `gate2_contact_sheet.jpg` (all 84 frames), `gate2_attack_strips.jpg` (Bump,
static vs sheets) and `gate2_contact_frame_fix.jpg` (fix 3 on the real frames).

## Verdict

**Round 2 beat the static art on all four shots** (cave and meadow, desk and phone). The close-up crop votes went
**16/16 for the sheets**, up from 0/16 at gate 1. The full frames won 4/4 on both desk shots and 3/4 on both
phones; the phones were decided by the crop. The defect floors passed, the canary passed in every run, and
originality is PASS. Round 1 (the camera fix alone) still lost, so round 2's head turn is what made the
difference. In still frames, the handoff's bar is met: the sheets at least match the static art in battle.
**The attack motion has not met it yet.** The strip judge still prefers the static art's procedural lunge
(0/4). That is weak evidence (the blur canary passed only at confidence 1-2), but it is consistent with gate
1. See Motion below. The game-code fix for the contact frame is verified on the frames. Ashkit can become the
template for the other 19 kin **once the owner confirms it** on the side-by-side and decides whether the attack
clip needs another pass first.

## What changed (both rounds)

| fix (GATE.md order) | done | how |
|---|---|---|
| 1 back-view camera | yes | `anim.py` `YAW_BACK` −35 → **−12** (owner default), same 30° elevation. **Round 2 also adds a back-view-only head turn of 20°** toward the camera (`HEAD_BACK`), on top of the baked 16° battle turn: at −12° the two ears lined up into one spike |
| 2 near ear | yes | **dark-brown ear backs** (`EAR_BACK #4a2a26`, owner default), a red-fox marking. The ears were not splayed |
| 3 contact frame | yes (game code) | `CreatureView.hit`: the target stays drawn, white-flashed, for `HIT_CONTACT_HOLD_MS` = 100 ms (one 12 fps drawing plus a frame) before the blink strobe starts (`hitStrobeOn`, unit-tested). Before, the strobe hid the foe from about 36 ms after impact, during the attacker's contact drawing |
| 4 mouth | yes | a short, gently upturned smile whose low point is its centre, so there is no down-hook beside the nose. The philtrum line is gone, and a chin and throat fill removes the fold under the snout. The line that remains sits well below the mouth and reads as the chin contour |
| 5 hind legs | yes | hind legs set back 0.09 under the hips (`HIND_X` −0.40) with a 0.05 hock lean. The rig and the paw-anchor midpoint follow |
| 6 back-view anticipation | yes | a deeper crouch on attack f1-3 (body −0.11 instead of −0.06, squash 0.85, head pitched 9° down). Still 14 frames, so the game's `ATTACK_FWD` table is unchanged |
| 7 forehead strokes | not needed | no broken forehead strokes in the new folded-ear frames (contact sheet); the crease threshold was left alone |
| 8 value | **reverted** | Round 1 lightened and shortened the socks. **Every round-1 judge preferred the static art's dark paws** ("darker feet anchoring it to the ground"), so round 2 restored the sooty socks, extended to the set-back hind paws. The darker back-view rim (a composite shader change) was not tried |
| 9 faint paw sink | yes | faint f8-9 lowest point −0.0095 → +0.0015 units (≈ 0.25 px). The legs and body are lowered less |

Tooling: `pack.py` now writes `opaqueExt` (the sheet player reads it; the committed `pack.py` had lost it) and
prints the per-view `SHEET_EXTENT` for `prototype/hires.ts` (now back 0.544 / 0.577, front 0.443 / 0.516).
`prerender-integration.patch` still applies to the branch unchanged.

## Numbers

Captures: frozen clock, same build for both sides. The baseline is `?kinsheet=0`, the static D still. Same
four shots as gate 1: cave = trainer Brann's Cragmaul, meadow = wild Stormoth Lv14, Ashkit Lv12, Fight menu,
seed 5, `gfx=hd2d&kinart=D&arenares=native`. The cave self-check was pixel-identical and there was no frame
mismatch.

| check | gate 1 | round 1 (camera + fixes) | round 2 (+ head turn, dark paws) |
|---|---|---|---|
| defect floor, 4 shots | pass 4/4 | pass 4/4 | pass 4/4 |
| full frame, pooled candidate votes | 4/16 (25 %) | 6/16 (38 %) | **14/16 (88 %)** |
| 2x Ashkit crop, pooled | 0/16 | 0/16 | **16/16** |
| per-shot decision (cave desk, cave phone, meadow desk, meadow phone) | worse ×4 | worse ×4 | **better ×4** |
| canary (stills), confidence | passed | passed (5/5, 3/2, 5/4, 2/2) | passed (5/5, 3/2, 4/4, 3/2) |
| originality (`ip_check`, turnaround strip + cave scene crop) | PASS / PASS, max 4/10 | n/a | **PASS / PASS, max 4/10**, closest Palworld Foxparks (generic, same as gate 1) |
| pixels outside the kin boxes | 1.23-1.70 % | 1.52-2.12 % | 1.52-2.10 % |
| judge + ip cost | $2.33 | $1.68 | $1.39 judges + $0.27 ip_check + $0.37 motion |

Phone canaries were weak (confidence 2-3) in both rounds, as at gate 1. The desk canaries were strong.

**Confound, stated plainly:** with a sheet kin the player stands further left, so its tail clears the trainer
(`SHEET_EXTENT`). That staging change is bundled into every comparison, and some full-frame votes cite
"spacing". It is not what won: rounds 1 and 2 have the same trainer placement (the left extent differs by
0.001), and round 1 lost every crop vote that round 2 won. The only difference between them is Ashkit's art.

Also visible in the side-by-side: in this prototype a sheet kin draws smaller on screen than the static still
(sheet `restHeightPx` vs the still's solid height, over `ART_GROW`). Two phone votes preferred the "larger
Ashkit" of the static art. Worth matching when the kin layer is productionised.

## Motion (Bump, Ashkit vs Cragmaul, cave, 60 fps)

**The still frames now win. The attack animation still loses, on thin evidence.** Strips: `strip.mjs` on the
same two dists (static `?kinsheet=0` vs round 2), `--shot-frames 175`. Image: `gate2_attack_strips.jpg`.

- **Window alignment:** `make_strips.py` starts the attacker strip 12 frames before the probe's launch. A sheet
  kin's root only moves at its launch drawing (f74), after the drawn crouch. The first candidate strip
  (f62-132) therefore opened mid-stretch with no anticipation, and its 0/4 verdict was confounded. The judged
  strip is a copy with `launch` set to 62, so it covers f50-120 and includes the crouch. The frames are
  unchanged, and the copy records the shift in its `meta.json`.
- **Judge (`judge_motion --kind attack --canary blur,hitstop`):** `worse`, 0/4, confidence 3, on the aligned and
  misaligned strips alike. The blur canary passed only at confidence 1-2, so it is **weak**. The hitstop canary
  was skipped (the baseline holds 3 frames). By rule 9 this cannot decide anything alone. It points the same way
  as gate 1. The reasons are consistent: the static lunge has "a deeper anticipation crouch, a bolder stretched
  leap, a rebound on landing" and "a clean settle". The sheet's lunge "drifts" with "weaker spacing contrast".
- **Motion lint (advisory),** sheets (aligned) vs static. Anticipation: 10 frames, 2.24 texels deep vs 5.66
  (gate 1: 1.09). Strike: 11 frames vs 17. Overshoot: 1.1 texels vs 14.5. Settle: 54 frames vs 67. Distinct
  poses: 0.75 vs 0.96 (12 fps drawings vs smooth 60). Text to launch: 73 frames vs 52; the drawn crouch comes
  before the lunge, about 350 ms later than static, as at gate 1.
- **Contact frame (fix 3), measured on the frames:** Ashkit's contact drawing lands at f75, and Cragmaul stays
  drawn, white-flashed, from f75 to f80 (100 ms). It first blinks out at f81. Before the fix it disappeared
  about 2 frames after impact. Image: `gate2_contact_frame_fix.jpg`. The harness's `impact` (f213) is
  Cragmaul's counter-attack on Ashkit, not Ashkit's Bump, so `make_strips`' sync strip does not show this
  exchange. That is also why gate 1's sync strip fell outside the window.
- **Next, if wanted:** an attack-clip pass in `anim.py` (`clip_attack`). Deepen the crouch and push it back
  toward the camera, stretch the launch more, add a landing bounce with real overshoot, and shorten the drift
  into the settle. Then re-render (about 11 min), re-strip both sides (about 25 min) and re-judge with the
  aligned window.

## Recurring critique that is not about Ashkit

These match gate 1. The creatures are smooth-shaded while the world uses chunky texels (the owner already chose
smooth creatures; the smooth-arena repaint is the next step). The orange body sits within 10-15 % of the sunlit
floor's value, so a darker contact shadow or a rim would help. Cragmaul's browns merge with the cave wall.

## Owner check

1. Look at `gate2_side_by_side.jpg` (about 2 min). Is column D (round 2) at least as good as column A (static)
   in battle? Default: yes, Ashkit becomes the template for the 19 other kin.
2. The back-view head turn makes your kin look over its shoulder toward the camera, 32° in total counting the
   baked battle turn. Keep it, or try about 12° with ears splayed outward instead? Default: keep.
3. The attack animation (`gate2_attack_strips.jpg`, about 1 min): do one more attack-clip pass before the
   other 19 kin, or move on and tune motion later? Default: one more pass.
