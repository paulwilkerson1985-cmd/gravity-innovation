# Handoff: state of Orbkin graphics (2026-10-16)

This is for a fresh session continuing the work. Read these first, in order:
1. `../../playbook/GAME_GRAPHICS_LESSONS.md`: lessons, owner preferences and the security baseline.
2. this file;
3. `../art/README.md`: art sources and the creature rules.
4. `GRAPHICS_PLAYBOOK.md`: the research outcome. It predates the art-direction pivot below, so the pivot wins where they conflict.

Branch: `claude/new-session-0opnq8`. Never push to `main`; the owner merges.

## Where things stand

**Shipped in the game** (all on the branch, and `npm run verify` green):
- **Graphics pass 1:**
  - the hit reaction plays on the impact frame;
  - a directional camera kick on super-effective and critical hits, with a Settings toggle and reduced-motion support;
  - camera pans that don't make pixels slide;
  - attack key poses per body type;
  - hurt reactions and blinks drawn as frames;
  - band-style shallow water;
  - UI readability floors (HP numbers under the bar);
  - a battle-in transition;
  - a depth band on the title and starter screens.
- **The dark translucent "slab" UI with Alegreya fonts on every screen.** It was the owner's blind-vote pick.
- **Five project skills in `.claude/skills/`:**
  - `orbkin-visual-gate` (captures and blind pairwise judging; every visual change ends here);
  - `orbkin-art-direction`;
  - `orbkin-render-look`;
  - `orbkin-sprite-creature`;
  - `orbkin-battle-vfx`.

  Note: they were written for the HD-2D pixel look. Creature and render rules need updating for the new direction below.

**Art direction pivot, decided by owner blind votes** (`../art/votes/`):
- **Creatures** become smooth **Blender-modelled toon art with ink outlines**. The old pixel sprites lost 0–12, and Blender toon beat hand-drawn vector art 8–3 in game.
- **Arenas** become **smooth, native resolution**. They beat the pixel arena 10–0. The arena textures were painted for a 640×360 grid and look soft when filtered, so they need repainting.
- **Rendering method:** real-time 3D toon shading of the Blender model lost twice to the static Blender render. So we **pre-render** Blender frames into sprite sheets: idle, attack, hit and faint, from a front 3/4 view and a back 3/4 view. They are played at device resolution over the arena.

**Ashkit vertical slice** (`../art/ashkit/`, not merged into the game):
- **Done:**
  - an anatomy pass on the owner-chosen design: eyes ray-cast onto the head, a muzzle with nose and mouth, all paws planted on one ground plane, a battle head turn;
  - a rig with idle (12 frames), attack (14), hit (6) and faint (10) at 12 fps, rendered front and back as WebP atlases;
  - a working sprite-sheet player in the battle (`../art/ashkit/prototype/` and `prerender-integration.patch`);
  - a half-speed attack video.
- **Gate result: not accepted** (`../art/ashkit/review/GATE.md`):
  - **The art improved.** At the same angle, the new anatomy beat the old Ashkit 4/4.
  - **In battle it lost to the static front-3/4 art,** because the player's kin uses a **back** 3/4 view, which hides the face. The near eye sits on the outline and the near ear merges into the head.
- **Fixes, in priority order:**
  1. Use a camera only about 10–15° behind the side for the player's kin, so the face shows, as in the art the owner voted for. Re-render the 42 back-view frames.
  2. Add dark ear backs, or splay the ears so the near ear reads.
  3. The game's hit strobe hides the target on the contact frame. Fix that in code.
  4. Simplify the mouth: shorten the near half, drop the hook beside the nose and the extra line under the nose, and remove the ink on the jaw-mask seam.
  5. Move the hind legs back about one paw length.
  6. Make the wind-up crouch deeper in the back view.
  7. Clean up broken ink strokes on the forehead in frames where the ears fold.
  8. Lighten the socks; add a darker rim on the back view.
  9. Fix a 2 px paw sink in the last faint frames.

  Recapture and gate after fixes 1–3.
- **Owner questions** (defaults in brackets):
  - back camera at about −12°, or keep −35° with a stronger head turn? [−12°]
  - add dark ear backs as an Ashkit marking? [yes]

**Gate 2 (2026-10-16, `../art/ashkit/review/GATE2.md`): the fixes are in, and round 2 beat the static art.**
- Applied with the defaults above: −12° back camera, dark ear backs, and fixes 3–9 (mouth, chin, hind legs,
  crouch, faint paws; the forehead strokes did not recur). Fix 8's lighter socks were tried and reverted,
  because every round-1 judge preferred the dark paws.
- Round 1 (camera and fixes only) still lost all four shots. At −12° the two ears lined up into one spike.
- Round 2 adds a **back-view-only 20° head turn** toward the camera (`anim.py` `HEAD_BACK`). Result: **`better` on
  all four shots** (cave and meadow, desk and phone). The 2x crop votes went **16/16** (gate 1: 0/16), the
  floors passed, the canaries passed, and `ip_check` is PASS.
- The run is unsealed, so this is **queued for the owner**: `../art/ashkit/review/gate2_side_by_side.jpg`.
- **The attack motion still loses** to the static art's procedural lunge (strip judge 0/4; weak canary, but
  consistent with gate 1). The sheet clip needs a deeper crouch, a bolder stretch, a landing bounce with
  overshoot and a shorter settle. When judging sheet strips, align the window to the drawn crouch (GATE2.md
  "Motion").
- Fix 3 is now in the game code: a hit target stays drawn for `HIT_CONTACT_HOLD_MS` (100 ms) before it strobes.
- `pack.py` writes `opaqueExt` again, which the sheet player needs. The prototype's `SHEET_EXTENT` is updated.
- To rebuild the prototype battle, apply `../art/ashkit/prerender-integration.patch` and copy
  `../art/ashkit/prototype/*.ts` into `src/render/hd2d/`. Then put the sheets (full, and half via
  `SCALE=0.5 pack.py`) in `public/kinsheets/{full,half}/`. The static D stills go in `public/kinart/D/`: render
  `../art/creatures/blender-d/*.blend` and crop them to the `META` boxes in `hires.ts`. The gate URLs are in
  GATE2.md.

**Update 2026-10-16 (later):** owner said "keep going" with the defaults. Ashkit's attack clip got a pass (held wind-up,
bolder leap, landing behind the start; the sheet JSON now carries the travel curve the player follows): the attack strip
judge moved from `worse` 0/4 to `no_difference` 3/4. All 84 frames were re-rendered with the shared framing; a re-capture
of the 4 stills and the strip with these final sheets was running when the session restarted (re-run it: GATE2.md
setup, dist with these sheets). The production kit is in `../art/kin/` (README there): Cindertail v1 sheets, Pyrelord
v1 model.

**Update 2026-10-17: every kin has a model, a rig and sheets (or a queued render).** All 18 species in CREATURES.md are
built on four shared rigs: quadruped (`quadrig`), round hopper (`hoprig` + `hop`), flier (`hoprig` + `fly`) and coiled
serpent (`serpentrig` + `serpent`). Full sheet sets are committed for 11 kin; the rest were in the render queue when
this was written (`../art/kin/README.md` has the per-kin status and the production lessons). Defects found and fixed by
eye on the contact sheets: Cragmaul's boulder fists sheared (rigid foot claim), Pebblet flattened like jelly (`squash`).
None of the new kin is gated; a Fable review of the Ashkit slice was started (see below).

**Update 2026-10-17 (later): all 18 kin are polished and have final sheets.** A Fable polish review per body plan
(`../art/kin/review/POLISH_REVIEW_2_*.md`), fixes applied by implementer agents, then a Fable verification pass
(`VERIFY_REVIEW_2_*.md`) and a last pass on what it flagged. Every contact sheet was checked by eye before commit.
Overview images: `../art/kin/review/roster_front.jpg` and `roster_back.jpg`. Open: Surgeray's design (owner call:
hovering ray or thicker manta), four small motion nits listed in `../art/kin/README.md`, moving the inline helpers the
polish passes wrote into `lib/common.py`, and gating the new kin (none has been through the blind judge; Ashkit's
sheets changed after gate 2).

## Next steps
1. **Fable review** of the Ashkit slice: the owner asked for this once their Fable quota resets, at 7 PM US Central on 2026-10-16 (00:00 UTC 2026-10-17).
   - **Role:** senior creature artist plus art director.
   - **Inputs:** `../art/ashkit/review/`: the gate-2 files first (`GATE2.md`, `gate2_side_by_side.jpg`,
     `gate2_turnaround.png`, `gate2_face_before_after.png`, `gate2_contact_sheet.jpg`), then gate 1 for history.
   - **Measure against:** the owner's anatomy checklist.
   - **Output:** a verdict and fixes.
2. **Done (gate 2):** the Ashkit fixes are applied and re-gated, and the side-by-side is ready for the owner.
   Round 2 beat the static art on all four shots (stills). The attack clip still loses on motion; the default
   is one more attack-clip pass. Once the owner confirms, it becomes the template.
3. **Production for all kin:** models, rigs and sheets are done or queued for all 18 species (`../art/kin/`). Left:
   - collect the queued renders and check each contact sheet;
   - gate the new kin (blind judge against the static D art), at least one per body plan;
   - productionise the device-resolution kin layer and sheet player (`../art/ashkit/prototype/`), loading every kin's
     sheets (about 5 MB full, 1.3 MB half per kin).

   Then:
   - smooth-arena repaint;
   - trainers in the same toon style;
   - effects matched to the smooth style;
   - phone quality tiers. The native arena cost 6× (desktop) to 13× (phone) the frame time of the pixel buffer in the software renderer, so measure on a real phone with `?bench=1`.
4. **Update the skills** for the new direction:
   - creature rules: anatomy checklist, back views, pre-rendered sheets;
   - render rules: native arena, kin layer.

   Fix and re-test `orbkin-blender-forge` without apt. It was rejected at install for using apt; its branch is `claude/skill-orbkin-blender-forge`.

## Open items that wait on the owner
- **Neon Tokyo** (a new night-time Tokyo open-world game: walk a neon district and drive a car) waits for the owner to create a private repo `neon-tokyo` and give the Claude GitHub app access. The full build brief for its first cloud session is `../../playbook/neon-tokyo-brief.md`.
- **A shared playbook repo** (suggested name `game-dev-playbook`) would let future projects in other repos load `playbook/` and the generic skills. It also waits on the owner creating the repo.
- **The GPU PC (RTX 3090) setup is parked.** The long guide `GPU_PC_SETUP.md` is marked "do not follow". A short, simple version is wanted later.
- **Fable as the regular gate judge:** a calibration with the canary pairs was offered and not yet run.
- **Optional taste calls from graphics pass 1** (defaults kept):
  - retry hit-stop without the white flash?
  - add the camera kick to normal hits?
  - keep the new attack key tables for flying and serpent kin?

## Environment notes
- **Cloud container:** 4 cores and a fixed disk allowance. Keep the scratchpad lean.
- **Restarts:** the container restarted several times. Make long jobs resumable (Workflow resume, work in progress committed), and run heavy Blender and Playwright jobs one at a time, or in cloud sessions.
- **Headless Blender:** create a venv with CPython 3.13 and `pip install bpy==5.2.2`, then use it as `ORBKIN_BPY`. Cycles on CPU works; EEVEE does not.
- **Network:** allowlisted for PyPI, npm, raw GitHub, public git clone, Poly Haven, ambientCG, Kenney, blender.org and threejs.org. GitHub release downloads, X and `video.twimg.com` are blocked; ask the owner to upload videos instead.
