# Gotchas (this container, the harness, the game) and the generated-look tells

## Harness and scripts
- **Two capture.json layout formats exist.** The gate's `capture.mjs` since d579229 writes `layout` boxes in
  DEVICE px and records `layoutDpr`; the pilot's captures (and the old refine harness `shot.stats.layout`)
  are CSS px, so phone boxes need x2.75. `adlib.layout_scale()` handles both (it also treats a box that
  exceeds the CSS viewport as device px); `adlib.css_scale()` is the separate device-per-CSS factor used for
  `--emitter` in CSS px and the falloff radii. A 1-px box difference between formats is rounding.
- `critique.py --layout` exits 3 with a WARNING when it yields no focal boxes: fix the capture or pass
  `--subjects`/`--focal`; never measure a frame without `focal_*` numbers. The `focal_*` row is ONE subject
  set (`focal_subjects`, default `foe`); `focal_by_subject` has every box: write "Vulcrag (foe) dL* -16.3".
- `--arena <name>` (assets/emitters.json) replaces a guessed `--emitter`; status `proposed`/`unlocated`
  prints a WARNING: locate the emitter on a gridded 3x zoom of the capture (the volcanic one was read that
  way) and promote it to `verified`. Phone rings are [0, 60, 150] CSS px, desk [0, 100, 250].
- `grade_preview.py` reproduces the display-space grade only: run `--verify` once per arena (volcanic:
  p99 3.3/255, max 11/255; the wrong grade fails at p99 14.8). Exposure, vignette, bloom, tilt, toneHue,
  lights and SpriteLight need a capture. Its numbers for a grade-only move matched the captured direction;
  the one thing it cannot see is the key: the 70 -> 55 key cut took `near_bstar` from 0.81x (preview, grade
  only) to 0.65x captured.
- `verdict_risk.py` is one-sided and calibrated on three losing rounds (H, J, Fenv) and 11 accepted pairs
  (0 false positives with the right `--change`; `dof` exempts `mush`, `ui` exempts the scene rows,
  `grade|light|sprite` REQUIRE focal + falloff inputs or it exits 3 UNPROVEN). Recall on wins is unknown
  beyond those 11 pairs, which exercised only 4 of its 8 signatures (no focal/falloff inputs on screens).
- `craft_check.py` thresholds were set on the pilot (base vs H/J fail on the named regressions, base vs
  base passes, the environment-only capture passes with `--change grade`); not yet calibrated on an
  accepted sprite change, so a FAIL means "open the 2x crop", never "revert blindly". Its sprite mask
  includes the contact shadow under the feet (relative numbers cancel it).
- `gamut_check.py check` derives from the ACCEPTED frame and fails, by construction, any retune that adds
  cool pixels; use `report --baseline ACCEPTED.png` for an intentional retune and list `new_cells`.
- `report.sh` looks only inside `$RUN`: the owner kit must be built at `$RUN/kit` or it prints "none
  queued"; it warns "no run.json" for a directory not made by `gate_init.sh`. `report_check.py` refuses a
  report with empty "Still weak" / "Not verified" / "Files changed" or an UNPROVEN prediction.
- The gate skill can change mid-session (another session edits the working tree): record its hash and
  dirty flag at every round; the pilot's two rounds ran on different floor code.
- `preflight.sh` is Step 0: `game/tools/bootstrap/bootstrap.sh` is planned and absent; the gate's `doctor.sh`
  is the toolchain check and preflight adds free disk (no-go < 2 GB) and load (`capture_flags`). The pilot's
  blank phone frame and black basalt walls were a full disk reported `ok: true`.
- Capture cost measured 2026-10-15 at load 15-18, `--workers 1`: build 10 s, desk 114 s (+ the same for
  `--self-check first`), phone 51 s; the pilot's 4-9 min were at load 20-40 with self-checks. Judge: 45-60 s
  and $0.18-0.28 per view.

## The game
- `focusTop/focusBottom` are fractions from the **bottom** (shader `vUv.y`); `screen_metrics.py` reports
  bands top -> bottom.
- `SpriteLight.shade`'s doc comment says "default a cool violet lean"; the code's `DEFAULT_SHADE` and
  `DEFAULT_HI` are (1,1,1), neutral (sprite.ts). Treat shade/highlight as neutral unless set; the one-line
  comment fix is an owner-reviewed repo edit, not this skill's.
- A shade multiplier > 1 colours the sprite's shadow bands: J's (1.35, 1.28, 1.38) put 227 violet texels on
  Maelstrode where the accepted frame had none (`craft_check` WARN "new saturated hue").
- The ring around a kin is dominated by additive dressing decals (ground glow, embers, rubble): a grade or
  light change cannot move it much; `focal_*` ring numbers mostly follow the decals.
- Sprite texel = 1 internal px = 2 frame px on desk (640x360 internal), 4 on phone (271x586 internal; the
  1081-px frame is 3.99x, integer-scaled then cropped). `mixel_share` ≈ 0 on both; a non-zero value means
  device-res resampling.
- Phone runs the low tier (no point lights, frozen shadows): a light-only change may not show there.
- `docs/screenshots/hd2d/arena-*.jpg` predate the pixel UI: never judge the UI from them.
- Never paste anchor numbers, judge prompts or vote counts into a build prompt. Reference-anchored judging
  rewards copying the reference's HUD. Frozen frames judge a timing fix `worse` 8/8.
- No runtime hook changes a light or a grade in a running page (`hooks.ts`); the fast SpriteLight loop is a
  proposed owner change: `assets/proposals/runtime-hooks.md`.

## Generated-look tells to refuse
Balloon-animal creatures with joint seams; uniform fbm on every surface; bare cubes and spheres; bloom on
everything; empty floors; identical rocks; flat grey shadows; a monochrome orange frame; a 3D ribbon in a
pixel scene; smooth 60 fps sprite motion; mixed texel sizes; candy-saturated UI; "pasted-on" sprites with
no rim or key light, or lit by a cooler light than the floor; bleached sprites; an emissive that no longer
lights its surroundings; a typed-text logo; an emblem replacing a letter.
