# Surgeray redesign review (r11)

Crops used: `/tmp/claude-0/-home-user/05be45a9-d39f-544a-a061-e10165333685/scratchpad/review3/` (`battle_head`, `battle_join`, `back_disc`, `back_head`, `battle_size_sim`, `arena_250`, `compare_maelstrode`, `silhouettes`).

## 1. Originality: original

- **vs Lapras.** Shares only the generic plan the brief chose: a blue body mass on the ground with a neck rising from the front, pale chest, friendly face. None of Lapras's identity carriers are present: no shell, no four flippers, no curled ear-horns, no forehead horn, no cream belly plating. The ground mass is a ray disc with electrode tips, which no plesiosaur design has. Clear.
- **vs other blue serpents (Dratini/Dragonair, Nessie toys).** The neck-and-head alone is "generic blue cartoon snake, white throat, dopey grin". That is genre, not derivation, but it is the weakest part of the identity: the head reads gecko/frog, not ray (see polish 1, 2).
- **One trope to break: the yellow lightning-bolt tail tip.** A bolt-glyph on the end of the tail is the Pikachu/Pichu family signature and is the first thing a player will name. The body-paint bolts are fine; the tail should not be a flat bolt icon. Make it a 3D electrode (a bevelled spark node or a tuning-fork/double-prong tip, matching the gold wing-tip spheres) and keep bolts as paint.
- No read as Stunfisk, Mantine or Lanturn.

## 2. Distinct from Maelstrode: yes, with one guard

At roster size the two separate on colour and mass: Maelstrode is a light-blue coil with a lot of white (fins, crest, belly) and a long snout; Surgeray is royal blue + yellow with a flat spread disc and a bulb head. Shared: upright blue neck, pale throat wedge, gold eyes. Guard: keep Surgeray's blue the more violet royal (not Maelstrode's `#1e64c8`), keep the throat ice-white not aqua, and never give it fins or a crest. Front-on (`1_front`) both are "a post on a base" but Surgeray's horizontal disc line and node pair keep it apart.

## 3. Polish: one more pass

Battle (foe) view reads well at 250-400 px: blue serpent, yellow eyes, bolt tail, flat boat-shaped disc. Backcam is the problem view.

1. **Must, backcam: the near wing is a tent.** The player's own-kin view is dominated by a blue cone behind the neck with a gold ball on its apex (`back_disc.png`); it reads as a hood or shoulder spike, not a wing, and the hard fold outline crossing to the neck base makes the neck look like a separate object set on a folded blanket. Fix: the curl must live in the outer 20-25 % of the span only. In the build script reduce the tip-curl angle, move the curl bone/shape-key pivot outward, and lower the tip node so it is at most ~0.3 disc-widths above the ground; the disc plane itself stays flat.
2. **Must, battle + backcam: neck-to-disc join.** `battle_join.png` shows a notch where the neck outline cuts the disc outline plus a dark shading pocket; it reads as a plug-in. Fix: boolean-union or bridge the neck base into the disc with a fillet (bevel modifier on the join loop, 2-3 segments) so the toon outline flows round the base, and widen the base ~15 % so the neck grows from the disc.
3. **Must: tail bolt geometry.** It is a flat extruded glyph; in `1_front` it goes edge-on into a thin slab tangent to the head and reads as a horn. Material language also clashes with the gold sphere nodes. Fix as in Originality: swap for a bevelled 3D node/prong, or at minimum thicken (depth ~0.3 x width), bevel, and yaw the tail base 20-30 degrees outward so the tip never overlaps the head outline in any of the seven views.
4. **Should, battle: gaze.** Far-eye pupil sits at the outer edge; the kin looks wall-eyed in `battle_head.png`. Converge both pupils toward the foe (shift the far pupil ~15 % inward).
5. **Should: make the head a ray's.** Add two small dark spiracle slits on the crown just behind the eyes and flatten the muzzle into a shallow spade; this alone turns "gecko" into "ray" at sprite size. Checklist note: no nostril/nose cue exists at the muzzle tip.
6. **Should: show the ice underside in battle.** The pale underside is a 2-3 px sliver. Roll the near wing's trailing edge up slightly (not the tip) so a pale band shows under the near wing; it also sells the "cape" and separates disc from floor.
7. **Nice: attack anticipation.** `front/attack/03` coils the head down onto the chest wedge, making a knot; pull the head back and up instead, then strike forward (attack/06 already reads well).
8. **Nice: back-of-head crease.** The outline arc above the eye in `back_head.png` reads as a frown wrinkle; soften the brow loop.

Checklist otherwise passes: eyes symmetric and both visible from the battle camera (`hidden_eyes` 0), disc on one ground plane, back view carries the neck bolt as a strong marking.
