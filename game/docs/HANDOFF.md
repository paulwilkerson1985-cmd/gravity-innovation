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

## Next steps
1. **Fable review** of the Ashkit slice: the owner asked for this once their Fable quota resets, at 7 PM US Central on 2026-10-16 (00:00 UTC 2026-10-17).
   - **Role:** senior creature artist plus art director.
   - **Inputs:** `../art/ashkit/review/` (gate sheet, turnaround, face before/after, contact sheet, video, `GATE.md`).
   - **Measure against:** the owner's anatomy checklist.
   - **Output:** a verdict and fixes.
2. **Apply the Ashkit fixes, re-gate, and show the owner a side-by-side.** When it at least matches the static art in battle, it becomes the template.
3. **Production plan for all 20 kin:**
   - per-kin Blender scripts following `../art/creatures/blender-d/` and `../art/ashkit/scripts/`;
   - the anatomy checklist with front, 3/4, side and back renders;
   - sheets packed as WebP atlases, about 1–2 MB per kin;
   - productionise the device-resolution kin layer and sheet player (`../art/ashkit/prototype/`).

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
