# Kin and people design for the live sprite bake

Contents: §brief · §divergence · §silhouette · §proportions by stage · §faces · §colour blocks and
bake options · §builder craft (designs.ts) · §people · §open IP flags · §names

## §brief (S1) — constraints only, before any concept
S1 is a table of CONSTRAINTS and nothing else: no concept, no working name, no signature part, no
behaviour yet (in the pilot the brief paragraph already contained the winning concept, so the
divergence table was theatre). Fields: species id and working name; role (starter line / wild /
rare single); element(s) and the hue family each owns (Flame red-orange + ember gold; Tide blue
+ foam white; Flora green + pink bloom; Terra sandstone + cyan crystal; Spark yellow + indigo /
cyan; Gale sky blue + white + orange); stage and texels on screen (stage 1 = 28 texels tall,
stage 2 and single-stage rares = 34, stage 3 = 40; a person = 44); the arena it will mostly be
seen in and that arena's FLOOR colour and luminance as `read_sheet.py --battle` printed it in S0
(`floor.hex`, `floor.luminance`; the meadow battle floor is a light warm sand path, measured
#fcd18d-#fde1a9 / luminance 213-226 depending on the foe's spot, NOT grass: a sand, cream or
pale-lichen body melts into it; the kin must separate by value AND hue); budgets (tris, one mesh). The concept-level fields (signature part, behaviour,
palette roles, forbidden shape, working name) are written per concept in S2 and copied into the
brief only after the table has picked one.

## §divergence (S2) — three concepts from three body plans, measured
All 12 pilot runs for a "duneskip" brief converged on the same desert hopper: the id primed the
concept. So: never take the literal reading of the id or the element pair ("leaf + rock" for
Flora/Terra is the literal reading; so is "a fox" for Flame). Write three concepts from three
DIFFERENT body plans / animal classes, e.g. pick from: arthropod (beetle, mantis, crab, isopod),
mollusc (snail, slug, nautilus), amphibian or reptile (newt, tortoise, gecko, frog), bird
(owl, wader, puffin), mammal quadruped (tapir, badger, pangolin, mole), mammal biped or climber
(sloth, lemur), fish or ray, serpent or worm, fungus / plant-animal, mineral or construct, mythic
hybrid. Every concept gets the SAME fields: body plan, the signature part, behaviour (idle /
attack / hit, in the four channels the player has: squash, lean, travel, lift), palette roles
(main 60 / secondary 30 / accent 10 + one dark detail, with the element hue families), the
forbidden shape, the archetype trap it must dodge (below), and a 2-4 primitive BLOCKOUT in
designs.ts under the ids `<id>_a`, `<id>_b`, `<id>_c` (a design without a dex entry is fine:
facts.ts measures it as stage 2). Then `lineup.py --species <id>_a` (and _b, _c): the table's
"silhouette distinctness" column is the printed worst IoU and solidity, not a guess; the other
columns (element read at 32 px, sprite-size read of the signature, behaviour fit, originality
risk) are 1-5 with one line of reason each. Pick by the table; write why the losers lost; delete
the losing blockouts.

Archetype traps (the first blind read of the pilot kin was "spider" 3/3 although the brief said
root-walker): four or more long, splayed, arched legs around a ball body = arachnid; a stalk with
leaves on the head = "sprout on a critter" (Oddish / Paras / Pikmin read); a bulb on the back =
Bulbasaur; a rock with two arms = Geodude; a blue serpent with white frills = Dragonair; a
droplet with a curl = DQ Slime; a yellow mouse with cheek marks = Pikachu. A leg plan must break
the trap (two long + two stubby legs, knees bending one way, visible feet shapes, a body that is
not a sphere). `judge.py read` on the battle crop is the test: the elements must be named and the
archetype must not be an off-element animal.

## §silhouette (S3) — black fill first
- Build the primary masses only (2-4 orbs/tubes/lathes), run `lineup.py --species <id>`: black
  silhouettes at 32 and 64 px from front, side and 3/4, IoU vs every kin and vs the previous
  stage, solidity (area / convex hull). Flags: IoU > 0.8 with any kin, > 0.85 with the previous
  stage (a scale-up), solidity >= the cast median (a blob: break the hull with the signature
  part, a tail, ears, a crest, a gap between legs).
- One dominant shape family per line (round = friendly, square = stable, triangle = sharp),
  a secondary accent shape, a forbidden shape. Big / medium / small: ~60/30/10 of the
  silhouette in three size classes, no two features the same size (rows of equal spikes read as
  noise).
- Limbs taper thick -> thin -> paw; a curved front edge against a straight back edge; S- or
  C-curves on tails and necks; no straight cones or uniform cylinders (`leg()`, `tube()` with a
  radius function, `blade()` for ears).
- Evolution changes mass and posture first (round -> lanky -> heavy), then proportions, then
  the signature grows and becomes structural; detail last, capped at 3-5 tertiary parts.

## §proportions by stage
Stage 1 (baby schema): head >= body volume; eyes low on the head (centre at or below the head's
equator), wide-set, huge; short snout, small mouth; limbs short, thick, paws wider than ankles;
everything rounded, the only sharp shape is the signature; lighter values. Stage 2: longer
limbs and snout, slanted eyes, the signature doubles. Stage 3: head ratio down (~0.7x realistic),
shoulders up (~1.4x), brow shelf (a shape that casts a toon shadow, not a line), angular
accents, eyes higher and narrower, keep ONE juvenile cue (a tuft, a stubby proportion, round
eyes) so it stays catchable. `creature.test.ts` requires each stage's bounding diagonal x
baseScale to grow >= 1.15x per stage.

## §faces for the battle camera (the most violated rule: 2+ pilot runs shipped eyes under 3x3,
## and a 4x5-texel single-tone eye still vanished in the bake)
The sprite bakes from a near-side view (the camera's yaw, pitch <= 12.6 deg). Your kin stands in a
side / 3-4 profile turned 0.42 rad toward the camera (`FLAT_POSES.turn` overrides that for your
kin only); the FOE faces a fixed point near the player (`spots[0] + (2, 0, 3)`), i.e. nearly
HEAD-ON to the camera: a forward-pointing bill, snout or horn collapses to a stub, a crest
across the head reads, and the face is what the foe shows. Design the signature so it reads
head-on AND from the side (the model gallery `view=front` is close to the foe's bake), or cock the
head in the builder (the pilot's long bill only read after a 0.75 rad head turn). The pupil box must be >= 3x3 texels at battle size:
`eyes()` size >= 1.5 / texelsPerUnit model units (read_sheet prints the number per species;
~0.075 at 28 texels on a 1.4-unit kin, ~0.073 at 34 on 1.65 units). Put the eyes on the
camera side of the head's curvature (yaw 0.36-0.6 rad), never on the silhouette edge; one
1-texel highlight on the key side (`shine`, default on); mouth or nose 1-2 dark texels; brows
only at stage 3 as a shelf. Use `eyes(k, head, {...})` on the head's ellipsoid handle so they
never sink; eye triangles carry the blink rig automatically. The eye must CONTRAST in the baked
sprite, not just be big: `read_sheet.py --battle` measures the eye box against a 2-texel ring
around it (FACE flag below 0.20 value difference, or more than half the ring in the eyes' own
tone). So: a 1-tone dark eye on a dark or mid head fuses with it; give eyes two tones (sclera
`sclera: true` or a light `iris` ring behind a dark pupil) on any head darker than a cream mask,
and keep every dark part (knuckles, paws, joints, nose) below the chin line and off the ring
around the eyes (the pilot's knuckle orbs sat at eye height and merged with the eyes into one
black mass). Sclera versus iris: `eyes()` draws the pupil at 0.62 x size when an `iris` is given, so a 3x3
pupil with an iris needs size ~0.13 and exceeds a third of a small head; on small kin use
`sclera: true` (white behind a full-size dark pupil) instead. Faces that read: Ashkit (big low
eyes on a cream mask, contrast 0.48 desk). Faces that vanish: Cragmaul (1.7x1.5-texel pupils,
contrasty but too small), the pilot's stilt kin (4x5-texel single-tone eyes beside dark knuckles,
blind read "spider", face 0/3). The near-eye box the check uses is the projected eye geometry: if
the bill or a brow covers the eye from the battle yaw the number is meaningless, so look at
`eyebox` in `sheet.json` against the crop before trusting it.

## §colour blocks and bake options
- Three colour blocks: main, belly/mask (countershade with `under(main, belly)` by face normal,
  or a painter on `n.z`/`c.y`), accent; plus one dark detail tone (socks, nose, outline-like
  seams). 2-3 clearly separated VALUES (adjacent blocks differ >= 15-20% value) and the
  accent <= 10%; check the greyscale proxy. `read_sheet.py` counts blocks >= 4% (aim 3-5).
- The bake snaps every texel to the mesh's own palette (<= 24 entries) and shades each entry
  with a five-tone hue-shifted ramp (shadows cooler, highlights warmer), so paint FLAT blocks and
  let the ramp do the shading; soft painter boundaries become clean curved edges. Keep base
  colours away from pure white/black so the ramp has room; bright greens are chroma-capped by
  the bake (`tameGreen`), so give green kin a dark bark/olive mass + a light moss top + a
  non-green accent (Verdantusk went muddy with green on green).
- Markings: at least one 2-texel-wide marking in a value distinct from both neighbours and visible
  at the battle yaw (a mask, a saddle band, a belly patch, a stripe), so the body is not a plain
  sphere; the element hue families should both show on the baked sprite (the pilot's Terra read
  was two cyan toes of 2 px: invisible).
- Separation from the arena floor is a judged winner: lighter-than-ground subjects scored higher
  in every judge set. For warm floors (meadow dirt, scrub) avoid a sandstone/cream main colour
  unless the accent carries a strong hue contrast; the pilot's mid-value sand kin were judged
  "muddy, blends into the shadowed ground". Dark kin get a light inner rim automatically
  (`view.dark`).
- Per-species bake options live in `KIN_SPRITE` in `src/scenes/hd2dBattle.ts`
  (`SpriteOptions` in `src/render/hd2d/sprite.ts`): `emissive: [colours]` + `emissiveGain`
  (flames, magma, lanterns: drawn unlit and HDR, they bloom), `glow` (a warm floor pool for
  emitters), `facet` (0.22 default = round volumes; ~0.45 for rock), `plates: { size, width,
  crack?, crackGain? }` (cellular stone plates with dark creases, or glowing cracks), `minValue`
  (lift near-black crust), `contrast` (people use 0.68), `bakePitch`/`FLAT_POSES` for flat kin
  (rays, moths) that would read as a sliver from the side. Add an entry only when the kin's
  material asks for it (crystal, lava, lantern, rock); organic kin take the defaults.

## §builder craft (`src/render/creatures/designs.ts`)
- One `Design` per species: `{ scale, hover?, idle, keys?, build(k) }`, registered in `DESIGNS`
  and in `LINES` (the lineup test requires both). Model faces +Z, y up; `Kit.build()` grounds
  the lowest vertex on y = 0. The battle normalises size (`fitKin`): the kin is scaled so that
  `max(height, 0.8 x max(width, depth)) x scale` becomes ~1.1-1.2 units x a stage factor (with a
  ^0.4 softening), so a LONG or WIDE kin is shrunk by its footprint and looks small next to a tall
  one; a bill, tail or wingspan costs height. `scale` ~0.86-1.0 for compact kin; raise it (1.2+)
  for slim or horizontal ones and check the foe's pixel height in `sheet.json` against Cragmaul's.
- Primitives: `k.orb` (smooth low-poly sphere, heads/bodies), `k.ball` (ico, lumps), `k.tube`
  (Catmull-Rom tube with a radius function: necks, tails, bodies), `k.lathe` (droplets, cones),
  `k.limb`/`k.cone`/`k.blade` (tapered limbs, horns, ears), `k.slab` / `slabAt` / `frame().slab`
  (solid bevelled slabs for every wing, fin, leaf, ear: never zero-thickness planes), `k.gem`
  (crystals), helpers `leg()`, `eyes()`, `mouth()`, `decal()`, `flame()`, `leaf()`,
  `thistle()`, shapes `leafShape/petalShape/boltShape`. Paint = a colour or a painter
  `(n, c, i) => colour` by face normal / centroid.
- Rig secondary motion with `k.withRig({ kind, pivot, amp, speed, phase }, () => ...)`: `wag`
  (tails, about Y), `nod` (heads, sprouts, about X), `flap` (wings, mirrored about Z), `flicker`
  (flames: stretch), `twitch` (ears: sharp flick), `roll`. Tails and ears should lag the body:
  pure sines read as procedural; give a tail `wag` plus a slower `nod` layer, phase the two ears
  apart, and keep flame `speed` 8-10 (15 fps-like) while body parts stay 2-4.
- Parts >= 0.05 units thick (sub-texel parts boil); every feature that must read is >= 2 texels
  wide at battle size (read_sheet's texelsPerUnit x size). Budget: 1,800 tris for a stage 1
  that evolves, else 2,500 (unit test); typical kin are 1,200-1,800.
- Idle style: `trot` (quadrupeds), `bounce` (blobs), `float`/`glide` (flyers, with `hover`),
  `sway` (serpents), `heavy` (big kin). The idle bakes at 10 fps (8 low) with `idleGain` 1.8 so
  bobs move whole texels.

## §people (`src/render/hd2d/characters.ts`, `render/trainer.ts`)
Figures are 44 texels tall, baked like kin with `contrast 0.68` (faces stay in base + light
tones). Rules from the research (none implemented yet, so any walk work starts here): 4 facings
(S, N, W, E mirrored) with the yaw snapped, never a free yaw (reads as a 3D model); walk = 6
cels at 10 fps (0.6 s) with a 1-texel body bob (down on contact, up on passing), arms opposite
the legs, head 1 cel delayed; phase driven by distance travelled (stride = distance per half
cycle, no foot sliding); a facing change shows one step-in-place cel (8 f); the contact shadow
stays planted. Today trainers slide (`walking` only re-bakes faster): a `stride` rig kind gated
by a `uWalk` uniform is the proposed route.

## §open IP flags (from `ip_check` on the current cast; never brief "like X")
Maelstrode reads as Dragonair (blue serpent + white head frills; 7-9 on the battle crop):
change the head fins or palette (teal-black with coral frills) or the body plan. Dropple's
curled tip reads as the Dragon Quest Slime (5, distinctive). Flickwing reads as Cutiefly (5,
generic). The hero's cap must not become a red cap with a white front plus a red pack (that was
the Red/Ash read; the current hero avoids it). Avoid the iconic combos: electric yellow mouse
with red cheeks, fire lizard with a tail flame, nine-tailed fox, rock with two arms (Geodude
scored 10/10 in the control). Generic archetypes are fine; a distinctive combination of
silhouette + markings + colour + signature part is the risk. Run the check on the lineup AND
the battle crop (the bake raised Maelstrode from 5-6 to 7-9).

## §names
Original, two syllables or a portmanteau of a texture/behaviour word and a creature word, no
franchise move or species names; must pass the banned regex in `tests/content.test.ts`
(`pok[eé]|ball|pikachu|charmander|squirtle|bulbasaur|tackle|ember\b|growl|harden|thunderbolt|
flamethrower|surf\b|gust\b|razor leaf|hydro pump|earthquake|rock slide|quick attack|struggle|
recover|sleep powder|thunder wave|will-o`), so no "Ember..." or "...ball" names. The species id
stays the neutral id you were given (e.g. `kin19`) when the brief says so; the display `name` is
yours.
