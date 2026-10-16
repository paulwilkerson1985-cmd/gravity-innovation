# Orbkin art sources

Source files for the creature art direction the owner chose in October 2026. The decision record is in `docs/DECISIONS.md` and the handoff note is `docs/HANDOFF.md`.

## Decision so far

The owner chose by blind vote; raw votes are in `votes/`:

- **Battle UI: dark translucent "slab" panels** with Alegreya fonts. It beat the cream panels 5–0 (3 no-difference) and the dark pixel style 7–1. Shipped (commit e239b08).
- **Creatures: smooth Blender-modelled toon art with ink outlines ("D").** The old pixel sprites lost every comparison, 0–12. In the in-game runoff D beat hand-drawn vector art ("C") 8–3.
- **World: smooth, native-resolution arenas.** They beat the pixel arena 10–0 (2 no-difference).
- **Real-time 3D toon shading of the Blender model lost twice** to the static Blender render (see the spike notes in `docs/HANDOFF.md`). The production path is therefore to **pre-render the Blender look into sprite sheets**.

## Folders

- `creatures/blender-d/`: the headless-Blender toon recipe (`common.py` plus one script per kin), the bake-off `.blend` files and `NOTES.md`. Run the scripts with the bpy venv (`python -I script.py`). The method is: metaball blockout → voxel remesh → Boolean union → vertex-colour zones → emission toon ramp → Freestyle ink → Cycles CPU.
- `creatures/vector-c/`: the runner-up hand-authored SVG approach (`celkit.py` plus one script per kin). Kept for reference.
- `bakeoff/`: the normalised images from the four-way style bake-off (A = old pixel sprites, B = cel-shaded 3D, C = vector, D = Blender toon). Also `overview.jpg` and the in-game `runoff-overview.jpg`.
- `prototypes/`: the scratch code used to put full-resolution creature art into the real battle over a pixel or native arena (`runoff-hires.ts`, plus `runoff-hires-layer.patch` against the branch at that time). It is not merged. Port it when building the production sprite-sheet player.
- `votes/`: the owner's blind-vote JSON for the UI style, the creature style and the in-game runoff.
- `ashkit/` (added at the end of this round): the anatomy-fixed Ashkit `.blend`, the rig, the animation sheets (front and back, idle/attack/hit/faint) and the turnaround. This is the template for the other 19 kin.

## Rules for new creature art

Read these alongside `../../playbook/GAME_GRAPHICS_LESSONS.md`:

- **Keep each kin's design from `docs/CREATURES.md`.** Only the rendering style changed.
- **Anatomy checklist, checked on front, 3/4, side and back renders before acceptance:**
  - eyes placed and spaced on the front of the face and symmetric;
  - nose at the muzzle tip and a readable mouth;
  - both ears readable in the battle camera;
  - limbs attached at believable shoulders and hips;
  - all feet planted on one ground plane;
  - clear room from the trainer.
- **Back views need markings and shape interest.** The player sees their own kin from behind most of the time.
- **Judge new art with the blind pairwise gate** (`.claude/skills/orbkin-visual-gate`), including crops. Taste calls go to the owner's blind vote.
