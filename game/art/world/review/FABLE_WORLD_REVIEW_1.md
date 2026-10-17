# Fable world review 1 — matching the world to the toon kin

Reviewed 2026-10-17 from: `art/kin/review/roster_front.jpg` + `roster_back.jpg` (target), the 13-frame
pixel baseline grid, full-size cave/volcanic/summit/stadium/coast/cliff/shallows/hollow/scrub/title/
starter/route-map captures, the meadow cel-repaint A/B and its 2x crop, and the party screen
(`screenshots/desktop-meta-05-party.png`, 2026-10-16) standing in for the menu room.

## 1. Direction

**The cel-repaint is the right axis, but the first result is "a blurred photo of pixel art", not toon.**
Look at the 2x crop: every dither cluster survived as a camouflage blob, the hedge walls still have
90° voxel corners, grass tufts became green smears, and the frame lost contrast. The kin are
low-frequency art: 3-4 big masses, flat fills, one soft shade, one highlight, ink only on the
silhouette and a few interior folds. The world is high-frequency art in every layer (texel noise,
dither, cube stepping, flower confetti). Smoothing the texels alone keeps the mismatch; the shape
language has to change at the same time.

Target in one sentence: **a hand-painted toy diorama** — rounded terrain masses with flat fills,
2-3 tones per material plus one accent, thin hue-shifted ink on silhouettes only, soft ambient
occlusion at terrace bases, a gentle tilt-shift, and the kin the most saturated, most-shaded objects
in frame. References by style only: *The Legend of Zelda: Link's Awakening* (2019) for rounded toy
geometry, matte flat materials and tilt-shift framing; *Ni no Kuni* for cel characters sitting on
flat-colour painted grounds and skies; *Temtem* for smooth toon creatures integrated with low-detail
stylised arenas. Nothing is copied; these set the frequency budget.

## 2. Ranked changes (impact per effort, each one subsystem)

1. **Organic geometry: de-voxel it (biggest tell, moderate effort).** Terrace lips: round or chamfer
   0.3-0.5 block, merge runs of single steps into slopes, max 2 visible courses per soft wall.
   Canopy: replace cube-topiary stacks with 2-3 overlapping ellipsoid clumps per tree (lumpy cloud).
   Rock stacks (coast, shallows, cliff strata, scrub mesas, volcanic ring): fewer, larger slabs with
   rounded corners and 1-2 ink crack lines. Keep hard right angles only on built things (summit
   columns, stadium, cave bricks, paving). Arenas: all 11; start meadow, flowers, hollow, shallows,
   volcanic. Done when: at a 320 px thumbnail no right angle is visible on grass, canopy or rock,
   and `craft_check`'s edge counts on soft materials drop by half or more.
2. **Surface painters: designed shapes, not smoothed noise.** Per material: 3 flat tones + 1 accent,
   marks sized 1/4-1/2 block. Grass wall: flat green, 2-3 larger tone patches, 3-5 tuft marks per
   block. Dirt: flat base, 4-8 pebble marks, one darker rim ring under walls. Stone: big flat slabs,
   ink cracks only on seams. Cel-repaint parameters: blur/upscale until zones are block-scale, ink
   kept only on material seams and cracks, never between ramp bands. Done when: boundary-pixel
   fraction per block is within 1.5x of the kin sheets' own body-surface value, and the 2x crop
   shows no camouflage blobs.
3. **People in Blender as toon sprites (high impact, known pipeline).** Voxel hero/trainers beside
   smooth kin is the loudest clash in every frame. Same renderer, line weight, eye style and shade
   count as the kin; hero + 6-8 trainer archetypes + 3 crowd blobs for the stadium. Done when a
   hero/kin pair reads as one bake in the roster lineup.
4. **Ink on world geometry: yes, thin, silhouette-only.** Depth-edge post pass, 1 px at 1080p
   (1.5 px phone), colour = surface hue darkened (never black), normal-crease edges off, fade out
   past the midground band. Kin lines are ~2 px; the world should sit at about half their weight.
   Done when: an on/off A/B wins blind, and no lines appear inside canopy or flower clumps.
5. **Foliage and flower cards.** Grass tufts: 3-5 blade flat silhouettes, one highlight tone, crisp
   alpha (no blur). Flowers: 5-petal flat discs with a centre dot, two sizes, density halved on the
   ring; cluster them in 6-8 groups per frame, not a carpet. Trees: blob canopy, 2 tones + ink.
   Arenas: meadow, flowers, title, starter, hollow, scrub (dry grass). Done when the foreground
   band of the title frame reads as discrete clusters at thumbnail.
6. **Grade and light.** The world is pushed orange and crushed in the back; kin are painted in neutral
   daylight. Keep the warm key; lift shadow fill ~1 stop, tint shadows cool (blue-violet, not brown),
   relax the ACES shoulder, bring per-arena saturation to about 0.8x the kin chroma so the kin stay
   the most saturated thing. Shafts: ≤3, 60 % opacity, soft edges — today they are the sharpest
   objects in the meadow. Done when a kin's main fill in-world sits within ΔE ≈ 10 of its roster
   render and shadow hue on grass lands at 220-260°.
7. **Depth: haze over blur.** Tilt-shift is mushing title/starter foregrounds. Keep the subject band
   sharp, far blur small, foreground near-sharp; use sky-tinted fog to lift the far plane 15-25 % in
   value instead. Done when foreground card edges stay crisp in the title frame.
8. **Sky cards and clouds.** Pixel cumulus (cliff, route maps) is a dead giveaway at native res.
   Smooth stacked rounded cumulus, 2-3 flat tones, soft rim, dither-free gradient sky.
9. **Route-map islands, title, starter.** Islands are voxel cakes: chamfered cliff with 2 flat rock
   tones + ink cracks, blob canopy, smooth clouds, a soft drop shadow on the cloud bed, slight tilt.
   Title: fewer flowers, one clear focal pool under the three kin. Starter: keep the pedestals but
   repaint them flat with one rim highlight; calm the ground scribble.
10. **Props.** Fence, barrels, shelves, buoys: flat fills + ink, same density as kin, fewer of them.

## 3. Per arena / screen: the biggest problems now

- **Meadow** — cube-topiary hedge walls; scribbled ground; hard shafts. Repaint version: camouflage
  blobs and lost contrast.
- **Flowers** — confetti carpet with no ground mass; kin sit on speckle; back plane too dark/warm.
- **Hollow** — Minecraft moss-stone stacks; uniform green cast flattens depth; four shafts.
- **Scrub** — best mood, but orange kin on orange dirt (Ashkit vanishes); mesas are stepped blocks;
  dead-tree foreground is noise.
- **Coast** — sea sparkle dither reads as static at native; rock stacks are cubes; palms are sticks.
- **Shallows** — strongest composition and palette; rock stacks still blocky; water speckle; overall
  a touch dark.
- **Cliff** — good staging and paving; strata cliffs are block courses; pixel clouds; sky bleached
  to yellow-white.
- **Summit hall** — too busy: checker floor noise fights the sigil, purple + torch orange + snow
  windows all shouting; columns texel-stepped.
- **Stadium** — crowd of pixel blobs and dark grey bleacher mush behind; floor and banners fine.
- **Cave** — monochrome brown, every surface (bricks, shelves, barrels, rubble) at the same
  frequency; the shaft is the only calm thing.
- **Volcanic** — good value structure and a protected emitter; the concentric stepped ring is the
  purest voxel tell; floor speckle; Vulcrag dark-on-dark.
- **Title** — tilt-shift mush top and bottom, flower confetti, no focal pool.
- **Starter** — ground scribble, over-blurred foreground flowers, pedestals in the old texel style.
- **Route maps** — voxel-cake islands and pixel clouds; the meadow island reads as a floating lawn.
- **Menu room (party)** — flat pink gradient, grey low-poly pedestal, old low-poly model: no link to
  world or kin. Needs a small toon vignette (grass disc, sky gradient, soft shadow) with the new bake.

## 4. What NOT to do

- Do not ship blurred pixel art. If the repaint keeps dither clusters as blobs, the parameters are wrong.
- Do not smooth textures while keeping voxel cubes for grass, canopy and rock — worst of both.
- Do not add PBR, normal maps, speculars, grain or noise; no airbrushed gradients on the world.
- Do not outline everything at one weight in black; no ink on far planes or inside clumps.
- Do not crank tilt-shift or bloom to "sell" HD-2D; do not keep the ACES orange crush.
- Do not mix frequencies anywhere: pixel people or pixel clouds next to smooth kin breaks the read.
- Do not saturate the world up to the kin; the kin must stay the most saturated objects in frame.
- Do not fill emptiness with props; subtract. Calm ground under the feet is what makes kin read.
- Do not gate on taste alone: every step above goes through orbkin-visual-gate's blind judge plus the
  owner A/B, one subsystem per capture.
