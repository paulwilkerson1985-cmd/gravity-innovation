# Creature design & modeling research: from "programmer art" to stylized professional

Angle: **creature-design** — how pros design and build appealing stylized creatures, which parts of
that a script (Claude + headless Blender, free tools only) can do, and a concrete plan for
Orbkin's 18 kin.

Status: research notes + **verified experiments** run in this container (Blender 5.2.2 `bpy`
wheel, CPU only, no GPU or display). All experiment files stayed in `/tmp/creature-exp/`, which is
temporary, so the key scripts are copied into §6. No binaries were added to the repo.

Confidence labels: **[verified]** = I ran it here or read the primary source code.
**[sourced]** = a primary or reputable secondary source says so (linked). **[opinion]** = my
judgement from the evidence.

---

## 0. TL;DR

1. **The main gap is form language, not polygon count.** The current kin are built from
   intersecting faceted primitives: separate ellipsoids, uniform boxy cylinder legs, straight
   cones for spikes and ears. Each part stops at a hard seam. Professional stylized creatures
   read as **one continuous, soft, tapered volume** with S-curves, fillets where parts meet, and
   a few deliberate hard accents. This is a modeling-method problem, and it can be solved by
   script.
2. **A headless Blender pipeline that Claude can drive does work here [verified]:**
   Skin-modifier chains for limbs, tails and ears + ellipsoid masses → join → **voxel remesh**
   (fuses everything into one watertight surface) → Smooth → **Decimate to budget** (vertex
   colours survive) → crisp separate eyes → armature + `ARMATURE_AUTO` weights (works headless)
   → keyed Idle/Attack actions + Blink shape key → `.glb` that three.js `GLTFLoader` loads as a
   `SkinnedMesh` with 3 clips and a morph target. Total time is **≈0.7 s per creature** plus a
   ≈8 s Cycles preview. The fox-kit test came out at 2,998 + 288 eye tris, 200 KB raw and
   59 KB after `gltf-transform optimize --compress meshopt`.
3. **Custom vertex attributes round-trip [verified].** The Blender glTF exporter's
   `export_attributes=True` writes `_RIGA`-style attributes. `GLTFLoader` exposes them as
   `_riga`. So Blender-built meshes can **drop into Orbkin's existing vertex-shader rig and
   sprite baker unchanged**: swap geometry only, keep `CreatureView`, `toonMaterial` and
   `SpriteBaker`. This is the lowest-risk path. Full skeletal animation can come later.
4. **Design rules carry most of the weight.** Use one dominant shape family per line and one
   signature feature that survives every stage and still reads at ~50 sprite px. Use baby-schema
   proportions for stage 1. Push proportions harder at each stage. Use 3 colour blocks with
   hue-shifted ramps (the sprite pass already does this). Use eyes ≥ 3×3 texels at battle size.
5. **Hype check.** Claude + blender-mcp and "LLM writes Blender code" research (LL3M, BlenderLLM,
   BlenderGym) are good at blockouts and scripted assets. They are weak at artistic judgement for
   characters, and independent reviews say the same. What does work is a **parametric,
   reviewed, scripted pipeline**: Claude writes and edits the generator, renders previews, looks
   at them, and iterates. That is the workflow tested here. AI image-to-3D (TRELLIS, Hunyuan3D)
   needs a ≥16 GB NVIDIA GPU. Hunyuan3D's licence also excludes the EU/UK/South Korea
   [verified in its LICENSE].

---

## 1. Diagnosis of the current kin (from `docs/screenshots/creatures/*`, `hd2d-species.jpg`)

What reads as "programmer art" in the lineups, and the principle each point breaks:

| Symptom (seen in lineups) | Principle broken | Fix |
|---|---|---|
| Legs are near-uniform faceted boxes or cylinders with a hard ring where "socks" start (Cindertail, Pyrelord, Thistlehorn, Verdantusk). | Tapering and rhythm: limbs should go thick → thin → slightly thick (paw), with a curve on the front edge and a straight back edge ("straights vs curves"). | Skin-modifier chains with per-node radii. Fuse with remesh. Put colour boundaries on a soft gradient, not a geometry seam. |
| Spikes, flames, horns, ears are straight cones and faceted pyramids (Pyrelord crown, flame tails, ember studs). | Triangles signal danger, but a pro triangle is a **swept, tapered curve** (S or C), never a straight cone. Too many of them at one size becomes noise. | Bezier curve + `bevel_depth` + taper curve (verified), or tapered Skin chains. Use fewer, bigger, grouped flames in 3 sizes (big/medium/small). |
| Parts meet at hard intersections (head sphere stuck on a body, mane slabs poking through). | Professional forms *flow into* each other with small fillets. Overlap is drawn deliberately, not left as collision. | Voxel remesh + smoothing near joins (this is what Infinigen does: `join_and_rig_parts` → remesh → `smooth_around_line`). |
| Flat-shaded faceting everywhere, at every scale. | The faceted low-poly style can look professional (Kenney, Quaternius), but only with very clean, deliberate topology. Faceting from sphere tessellation reads as noise. | Smooth shading on a clean, decimated or remeshed surface. Let the toon bands make the "graphic" planes. |
| Stage 2/3 add *more parts* (studs, spikes, bands, trees) rather than changing the main mass. | Evolution should change the **big shape and posture** first, then the signature part, and only then add detail. Detail at 50 px is noise. | Escalation rules in §3.7. Cap the count of tertiary details. |
| Stage-1 eyes are huge, but other stages' faces are tiny, and in the HD-2D battle the kin are ~50–70 internal px tall. | At sprite scale the face is 6–12 px wide. Brows and irises vanish. | Size face features in **texels**: eye ≥ 3×4 texels, highlight 1 texel, mouth or nose ≥ 1 texel and darker. |
| Colour: mostly one saturated hue + belly + dark socks. Good start, but values often sit close together (green on green on Verdantusk, red/orange/yellow all bright on Pyrelord). | Value grouping: 2–3 clearly separated values per creature. Accent ≤ 10% of the area. | Palette rules in §3.6. Check in greyscale. |

What is already good and worth keeping: one merged mesh per kin, countershaded belly, big
stage-1 eyes, distinct signature motifs per line, ground contact, the vertex-shader secondary
motion, and the sprite bake (palette snap, hue-shifted 5-tone ramp, 1-texel outline, rim). The
sprite renderer is already more advanced than the models feeding it. **The input meshes are the
bottleneck.**

---

## 2. What monster-collector and creature designers actually say (sources)

Few primary process write-ups exist for monster collectors. Most of what follows comes from
interviews; confidence is noted.

- **Game Freak / Pokémon**
  - Atsuko Nishida says the first Pikachu sketch was a "daifuku-like" blob with ears. The brief
    was only "an electric type" and "a monster with two evolutions". **Start from one simple
    mass + one feature.** [sourced: Siliconera,
    https://www.siliconera.com/pikachu-originally-second-evolution-called-gorochu-large-fangs-two-horns/]
  - Ken Sugimori has cited Gengar as a favourite for its simplicity
    (https://www.nintendolife.com/news/2018/07/ken_sugimori_wants_pokemon_designs_to_be_as_memorable_as_possible).
    His 2000 interview is translated at https://shmuplations.com/pokemon/ (not reachable from this
    container; summary only). Wikipedia notes that Gen-3 designs became "cooler" and more complex
    after feedback that the series was too "babyish" (https://en.wikipedia.org/wiki/Ken_Sugimori).
    **Implication:** the cute→cool axis is a deliberate dial, not an accident.
  - James Turner (Game Informer 2019 video; Kotaku write-up) says a dash of **"silliness"** makes
    an intimidating creature look catchable
    (https://kotaku.com/pokemon-james-turner-art-character-designs-interview-2000727904 ;
    https://gameinformer.com/exclusive-video/2019/10/14/how-pokemon-sword-and-shields-art-director-james-turner-draws-pokemon).
    [sourced, secondary summary]. **Implication:** even Pyrelord / Cragmaul need one endearing
    cue, such as round eyes, a stubby proportion or a tuft.
- **Crema / Temtem** (official Kickstarter update): briefing → about 10 creatures sketched per
  sheet → the best 1–3 get detail, colour, rendering and an **outline that separates the
  creature from the background** → the 2D team draws front/profile/back turnarounds, with the
  **3/4 view drawn first** → modelling in T/A-pose with clean topology → UVs → textures.
  Inspiration: *Gigantic*, "cartoony without going all the way"
  (https://www.kickstarter.com/projects/cremagames/temtem-massively-multiplayer-creature-collection-a/posts/2219384 ;
  https://gamerant.com/temtem-crema-interview-customization-representation-inspiration-mmorpg/).
  [sourced]. **Implication:** design in 2D at 3/4 first, then model. Claude can stand in for this
  step with a written brief + silhouette sketch.
- **Bytten Studio / Cassette Beasts:** each monster is designed **twice**, once as a bespoke
  animated character and once as a modular part set for fusions. They had to "make decisions
  fast and commit". (Game Developer, Godot showcase, Pocket Tactics:
  https://www.gamedeveloper.com/design/cassette-beasts-is-a-fun-rpg-that-turns-monster-into-mixtapes ;
  https://godotengine.org/article/godot-showcase-cassette-beasts/ ;
  https://www.pockettactics.com/cassette-beasts/interview). [sourced]. **Implication:** a
  parametric part library (Orbkin's `parts.ts`, or a Blender part library) is a legitimate pro
  approach. The quality bar is in the parts.
- **Pocketpair / Palworld:** concept sketches are posted to an internal channel and staff rate
  them 1–5. Some designs fail at the 2D→3D step (Gamescom 2026 interview, via gamewave.fr:
  https://gamewave.fr/palworld/palworld-son-studio-possede-un-cimetiere-de-concepts-de-pals-abandonnes/).
  [sourced, secondary]. **Implication:** generate many candidates cheaply, cull hard, and expect
  some designs not to survive 3D.
- **Nexomon: Extinction:** 300+ creatures, with **colour keys per element** so the type reads at
  a glance (https://www.artofmello.ca/nexomonextinction). [sourced, portfolio]. **Implication:**
  Orbkin's six types should each own a hue family *and* a secondary shape motif.
- **Digimon (Kenji Watanabe):** evolution lines modelled on Tamagotchi branching, but "portray
  the extremes even further". He "cheats" perspective and bends limbs in 2D art to exaggerate
  power (fan translations: https://withthewill.net/threads/translated-interview-kenji-watanabe-interviewed-by-producer-habu.18323/).
  [sourced, fan translation]. **Implication:** push proportions harder than anatomy allows,
  especially at stage 3.
- **Monster Hunter (Kaname Fujioka):** each monster comes from **an ecological or behavioural
  idea + a silhouette idea**. A silhouette idea alone ("a ballerina") wasn't strong enough
  without the behaviour (https://www.siliconera.com/interview-preparing-monster-hunter-wilds-monsters-and-environments/ ;
  https://www.siliconera.com/monster-hunter-world-icebornes-kaname-fujioka-and-daisuke-ichihara-talk-about-deciding-which-monsters-to-bring-back-character-designs-and-grammeowster-chefs-stew/).
  [sourced]. **Implication:** every kin brief should name a behaviour (how it moves, idles and
  attacks) that motivates its silhouette. Orbkin's sheet partly does this already.
- **Valve / TF2, "Illustrative Rendering in Team Fortress 2"** (NPAR 2007): characters must be
  identifiable **in pure silhouette**, and this was used as a concept-stage check. Shading
  conveys form with **rim highlights and variation in luminance and hue**. Inspiration was
  Leyendecker/Rockwell, emphasising silhouettes with rim light rather than dark outlines
  (https://steamcdn-a.akamaihd.net/apps/valve/2007/NPAR07_IllustrativeRenderingInTeamFortress2.pdf).
  [sourced, primary paper]. Orbkin's sprite pass already adds a key-side rim.
- **Spore (Chris Hecker, creature skin):** the creature skin is a **blobby implicit surface
  (metaballs)** polygonised on the fly. He chose it because "topological robustness is actually
  more valuable … than local control" (https://www.chrishecker.com/My_Liner_Notes_for_Spore).
  [sourced, primary]. **Implication:** this is the same reason voxel remesh / metaballs win for
  scripted creatures. Any combination of parts yields a valid, smooth, single surface.
- **Guilty Gear Xrd (Junya Motomura, GDC 2015):** no normal maps. Shading control lives in
  **vertex data**: edited vertex normals, a vertex-colour channel offsetting the lit/shadow
  threshold (artist-painted "always shadowed" areas, AO), and vertex-colour alpha controlling the
  inverted-hull outline width (https://www.ggxrd.com/Motomura_Junya_GuiltyGearXrd.pdf ;
  ASW toon-line guide https://www.docswell.com/s/ASW_Academy/5LVY67-GG-Toonline-Eng). [sourced].
  **Implication:** Orbkin's toon sprite pass could read a "shadow bias" vertex channel baked in
  Blender (e.g. Cycles AO → vertex colour, verified to work headless) for painterly
  form shadows under the head, between the legs and inside ears.

---

## 3. Design principles → concrete checklists

### 3.1 Shape language (dominant / secondary / forbidden)
- Circle = friendly, soft, young. Square = stable, strong, stubborn. Triangle = fast, dangerous,
  sharp (https://blog.cg-wire.com/character-shape-language/ ;
  https://coartist.net/blog/character-design-readability-silhouette-shape-language-contrast).
- A production rule worth adopting from a stylized-3D art-direction playbook: give each
  character **a primary shape, a secondary accent shape, and a "forbidden" shape** that would
  break its read (https://nastyrodent.com/stylized-3d-characters-art-direction-principles/). [sourced, blog]
- Mix shapes, but let one dominate. One note only = bland. Equal mix = noise.
- **Primary / secondary / tertiary forms**: primary defines the read (silhouette masses),
  secondary is important features that don't change the silhouette much, tertiary is surface
  detail (polycount: https://polycount.com/discussion/233026/sculpting-issue-primary-secondary-and-tertiary-shapes).
  At Orbkin's sprite size, **tertiary forms mostly do not survive**. Spend the triangles on
  primary and secondary.
- **[opinion] Big / medium / small rule of thumb:** roughly 60/30/10 of the silhouette area
  across three size classes, with no two features the same size. The bad pattern is a row of
  equal spikes, as on the current Pyrelord spine studs.

### 3.2 Silhouette test (do it by script)
- Render a black-on-white silhouette from the battle camera and from the side. If the line or
  stage can't be told apart, the design relies on rendering, not shape
  (TF2 paper; coartist link above). [sourced]
- Automatable check **[opinion, easy]**:
  - Render each kin as a flat-black mask at the sprite's real pixel height (~56 px).
  - Compute pairwise IoU between all 18 masks after normalising for scale; flag pairs with
    IoU > 0.8.
  - Also flag any stage whose mask is > 0.85 IoU with its previous stage (= "just a
    scale-up").
- Squint test at sprite size: downscale to ~56 px tall, nearest-neighbour upscale ×4, and look.
  The fox-kit proxy in §6 shows how much detail vanishes.

### 3.3 Proportion & appeal (baby schema for stage 1)
Lorenz's **Kindchenschema** (1943) has experimental support:
- Large head relative to the body.
- Big cranium relative to the face.
- **Large eyes set below the horizontal midline of the skull.**
- Round, protruding cheeks, a short snout, and soft, elastic surfaces.

Glocker et al. 2009 (Ethology; Semantic Scholar:
https://www.semanticscholar.org/paper/Baby-Schema-in-Infant-Faces-Induces-Cuteness-and-in-Glocker-Langleben/b31418465f9700513fbdec323f8bd8d0dc673af2)
manipulated infant photos. Wider face, longer forehead, bigger eyes and smaller nose and mouth
were rated cuter and raised caretaking motivation. The effect transfers across species (Golle et
al. 2013, PLoS ONE, https://journals.plos.org/plosone/article?id=10.1371%2Fjournal.pone.0058248).
Avatar studies find the same, with some cultural variation
(https://link.springer.com/article/10.1007/s00146-024-01878-3). [sourced]

Stage-1 checklist:
- Head ≈ body volume, or bigger.
- Eyes sit low on the head (centre of the eye at or below the head's equator). Wide-set. The
  sclera and highlight are big enough to read.
- Short or absent snout, small mouth.
- Limbs short, thick and tapered, with paws slightly wider than the ankles.
- Rounded everything. The only sharp shape is the signature (e.g. an ear tip).
- Soft colour (lighter values, fewer saturated accents).

Stage 3 inverts this: smaller head ratio, longer snout and limbs, eyes higher and narrower, brow
shelf, more angular accents. Keep **one** juvenile cue (Turner's "silliness").

### 3.4 "Push the design"
- Exaggerate the key feature "a LOT", and scale back the less important ones
  (https://sundaysundae.co/how-to-make-low-poly-characters/). [sourced, blog]
- Watanabe bends limbs and perspective beyond anatomy in 2D to sell power. In 3D, the equivalent
  is a stage-3 head about 0.7× its realistic size with shoulders about 1.4× (a power pose), or
  the reverse for cute.
- Contrast pairs to look for: big/small, straight/curved, busy/rest. Example: one huge fluffy
  tail (busy) + a plain body (rest).
- Rhythm: limbs and tails are **S-curves** or **C-curves**. Avoid perfectly straight chains and
  perfectly symmetric bulges. A straight back edge against a curved front edge on legs reads as
  structure.

### 3.5 Face & eyes (most important 5% of the creature)
- In Orbkin's HD-2D battle the kin are ~50–70 internal px tall, so the head is 20–30 px and the
  eyes are 3–6 px. Rules:
  - Eye ≥ 3×4 texels with a 1-texel highlight on the key-light side. The highlight is a
    separate tiny white mesh, so the palette snap keeps it.
  - Keep eyes **off the silhouette edge** in the battle view. With a 3/4 camera, put them on
    the camera side of the head's curvature (in the fox test, eyes placed for the front read
    almost vanished in the side view; see §6).
  - Mouth or nose = 1–2 dark texels. Brows only at stage 3, and then as a **shape** (a brow
    shelf that casts a toon shadow), not a thin line.
- Eyes as **separate, un-remeshed geometry** joined after the remesh keeps them crisp
  [verified]. The current `eyes()` helper already places them on the surface normal. Keep that
  idea.
- Blink: a shape key (glTF morph target) **[verified]**, or keep the current vertex-shader
  blink.

### 3.6 Colour design
- **Value grouping:** 2–3 clearly separated value groups per creature, e.g. a light belly/mask,
  a mid main colour, dark socks/details. Adjacent motif steps should differ by ≥ 15–20% value,
  otherwise the boundary vanishes at distance
  (https://www.pixel-editor.com/articles/color-theory-for-pixel-art ;
  https://the-pixel.art/articles/hue-shifting-pixel-art-shading/). [sourced]
- **Area balance:** about 60% main, 30% secondary, 10% accent is a general design heuristic. No
  source applies it to sprites, so treat it as a starting point. One pixel-art guide gives
  base : shadow : highlight ≈ 6 : 2.5 : 1 [sourced; same links].
- **Hue-shifted ramps:** shadows cooler and more saturated, highlights warmer (≈ 10–20° hue per
  step). Orbkin's `sprite.ts` already does this in the 5-tone ramp; keep the model's *base*
  colours mid-value so the ramp has room both ways.
- **Element keys** (Nexomon): each of Orbkin's 6 types owns a hue family *and* an accent motif:
  - Flame: warm red-orange + ember gold.
  - Tide: blue + white foam.
  - Flora: green + pink bloom.
  - Spark: yellow + cyan.
  - Terra: sandstone + cyan crystal.
  - Gale: sky + white + orange.

  This mostly exists already. Enforce it with a palette table in data.
- **Greens cap:** green kin get muddy when every part is green (Verdantusk). Split into a dark
  bark/olive mass + a lighter moss top + pink accents, and make sure the value steps differ.
- Gradients over solid blocks: **soft colour boundaries on the mesh are fine** because the sprite
  pass snaps each texel to the per-species palette. A smooth vertex-colour gradient therefore
  becomes a clean, curved colour edge at texel resolution [opinion, based on how `sprite.ts`
  palette-snaps per pixel; verify in-game].

### 3.7 Evolution-line escalation checklist
Carry forward:
- the same hue family;
- the same signature motif;
- the same "face" (eye shape family).

Change per stage, in this order:
1. **Mass & posture.** Chubby/round → lanky/angular → heavy/grounded, or ground → rearing.
2. **Proportions.** Head ratio down; limb length up and then thickness up.
3. **Signature grows and becomes structural.** Ember → flame plume → flame crown + comet tail.
   Examples from Pokémon: Luxray keeps the tail star; Lucario's paws change colour and its spikes
   multiply (summaries at https://www.cbr.com/best-pokemon-evolutionary-line-designs/).
4. **Only then detail**, capped at 3–5 tertiary details per creature at sprite size.

Make sure the silhouette IoU against the previous stage is < 0.85 (§3.2).

Avoid:
- adding only bands, studs and spikes;
- recolouring the whole creature;
- losing the motif (CBR's "Digimon lines that make no sense" examples:
  https://www.cbr.com/confusing-digimon-evolution-lines/).

### 3.8 Originality guard (never copy franchise IP)
- Brief each design from **animal + element + behaviour + one non-obvious twist** (Fujioka).
  Never brief from "like <existing monster>".
- Avoid the most iconic combos: an electric yellow mouse with red cheeks, a fire lizard with a
  tail flame, a fox with nine tails. Ashkit (fire fox kit) is close to a well-trodden archetype.
  Its distinctness should come from the **soot/ember chimney-sweep motif** (sooty socks, ember on
  the tail, ash-puff cheeks), not from a generic orange fox.
- Keep the banned-name test and add a short "originality note" per species in `CREATURES.md`.

---

## 4. "Programmer art" vs "professional stylized 3D": visual checklist

Run this checklist against every model (all items are checkable in a Cycles preview at 3/4 + side):

1. **One continuous surface.** No visible intersection seams except deliberate overlaps (an ear
   in front of the head, a wing over the body). Joins have fillets.
2. **Every limb tapers** and has a curve. No uniform cylinders or boxes. Paws and feet are
   slightly wider than the ankles, with flat soles that sit on the ground.
3. **Spikes, horns and flames are swept curves**, grouped in 3 sizes, not straight cones in a
   row.
4. **Silhouette passes** the black-mask test from the battle camera and the side.
5. **2–3 value groups**, accent ≤ 10%, readable in greyscale.
6. **Face reads at sprite size**: eyes ≥ 3×4 texels with a highlight, below the head's midline
   for juveniles.
7. **Clean shading normals**: smooth-shaded, no faceting noise on big forms. Hard edges only
   where intended (claws, horn tips, crystal facets for Terra).
8. **Toon-friendly forms**: big planes that make clean 2–3-band toon shadows. Avoid tiny bumps
   that shatter into speckle. Bake AO or "shadow bias" into a vertex channel if needed
   (Guilty Gear Xrd).
9. **Rim + outline** separate the figure from busy backgrounds (Temtem's outline, TF2's rim;
   Orbkin's sprite pass already does both).
10. **Ground contact & weight**: stance width, a centre of mass over the feet, and posture lean
    for heavy kin.
11. **Secondary motion** on soft parts (tail, ears, mane), with the overlap delayed down the
    chain (in the test rig: tail1 → tail2 → tail3 phase offsets).
12. **Consistent texel density / detail density** across the lineup. The lineup should look
    like one artist made it.

---

## 5. How pros model stylized creatures in Blender, and what is scriptable headless

### 5.1 The manual pro workflow (for context)
1. **2D concept**: thumbnails → silhouette sheet → pick → 3/4 colour comp → turnarounds (Crema).
2. **Blockout**: primitives, metaballs or a Skin-modifier armature-like vertex skeleton.
   Tutorials:
   - GameDev.net walkthrough: Mirror → Skin → Subdivision stack, legs placed in side view
     (https://gamedev.net/tutorials/visual-arts/using-the-skin-modifier-in-blender-to-quickly-model-creatures-r5004).
   - Ryan King Art via BlenderNation
     (https://www.blendernation.com/2022/05/20/create-sculpting-base-meshes-skin-modifier/).
3. **Sculpt** (Dyntopo or voxel remesh) for the big forms, then smooth or crease.
4. **Retopology** for deformation: edge loops around joints, eyes and mouth. Quad Remesher is
   paid. Free options are QuadriFlow (built in), RetopoFlow (paid now) and manual.
5. **UVs**: Smart UV Project or seams. Low-poly stylized often uses **palette/gradient atlas
   UVs**:
   - each face's UVs are snapped onto a swatch in a small palette PNG;
   - one material and one texture for a whole asset library;
   - colours can be animated or recoloured by moving UVs or swapping the palette.

   Free tools: LowPolyUV add-on
   (https://blenderartists.org/t/lowpolyuv-free-addon-for-one-click-lowpoly-uv-and-color-palette-texture/1619373),
   UV-Colorize (MIT, https://github.com/RouBroeck/UV-Colorize). Explainers:
   https://www.blendernation.com/2020/05/21/texturing-low-poly-art-with-color-palettes/ ;
   https://savedpixel.com/blog/unwrap-uv-blender/ (recommends decimate first, then unwrap).
   **Note:** no source documents how Quaternius, Kenney or Synty structure their textures. The
   Quaternius author says there is "no really defined workflow" (2017 Reddit AMA). Treat
   "palette UV is what X uses" claims as unverified.
6. **Texture**: hand-painted (Blender Texture Paint, ArmorPaint) or baked (AO, curvature)
   gradients. For toon, vertex colours are often enough.
7. **Rig**: Rigify (human or animal metarigs) or a custom armature. Weight paint.
8. **Animate**: actions → NLA → glTF.
9. **Toon**: edited or transferred normals for clean shadow shapes (Abnormal "sphereize",
   proxy-mesh normal transfer; https://bnpr.gitbook.io/bnpr/shaders/toon-shading-nbpr-abnormal-normal-sphering ;
   http://www.aversionofreality.com/blog/2022/4/21/custom-normals-workflow), outlines.

### 5.2 Headless `bpy` feature matrix (Blender 5.2.2 pip wheel, CPU, this container)
Script: `/tmp/creature-exp/feature_tests.py` (temporary file; abridged in §6.4).

| Feature | Result | Notes |
|---|---|---|
| `pip install bpy` in a py3.13 venv | **OK** | ≈1.0 GB installed. Draco and meshopt bridges are **missing** in the wheel, so the exporter can't compress. Use `gltf-transform` afterwards. |
| Skin modifier → apply | **OK** | **Gotcha:** high-valence branch nodes (a hip vertex with 4+ edges) produced **32 non-manifold edges**, and the voxel remesh then silently **dropped the torso**. Fix: keep Skin chains to valence ≤ 2 and make the torso from ellipsoids or metaballs. |
| `bpy.ops.object.skin_armature_create` | **OK** | Creates an armature from the Skin graph + an Armature modifier. |
| Metaballs → mesh (`object.convert`) | **OK** | 3 elements → 2,112 faces in < 0.01 s. |
| Voxel remesh (modifier or `object.voxel_remesh`) | **OK** | 0.1 s at voxel 0.012 on a 1 m creature (≈17.7k quads). Needs closed input. |
| `object.quadriflow_remesh` | **OK** on a clean voxel-remeshed creature (0.8 s) | **Drops colour attributes**; fixed with a Data Transfer modifier from a copy [verified]. Rounds off thin tips (ears lost their points). It silently did nothing on Suzanne (non-manifold input warning). |
| Decimate (collapse, symmetric) | **OK** | Keeps POINT colour attributes; best silhouette preservation at ~3k tris. |
| Smooth modifier, Subdivision | **OK** | |
| Data Transfer modifier (colours) | **OK** | `vert_mapping="POLYINTERP_NEAREST"`. |
| Curves with bevel + taper → mesh | **OK** | Swept tapered horns/flames (§6.3). |
| Geometry Nodes built from Python | **OK** | `node_groups.new(..., "GeometryNodeTree")` + `interface.new_socket`. |
| `parent_set(type="ARMATURE_AUTO")` (bone heat) | **OK headless** | 0 unweighted verts on a watertight remeshed body. Separate eye islands had to be assigned to the head bone by hand. |
| Rigify: add human metarig + `pose.rigify_generate` | **OK headless** | 0.2 s, 222-bone rig. For glTF export only DEF bones (`export_def_bones=True`). Probably overkill for kin. |
| Sculpt `bpy.ops.sculpt.brush_stroke` | **FAIL** | `poll() failed, context is incorrect`: no window/region in background mode. Use a Displace modifier, bmesh math, or Geometry Nodes "sculpting" instead. |
| Cycles bake AO → vertex colours | **OK** | `scene.render.bake.target="VERTEX_COLORS"`, 0.1 s. |
| Smart UV Project + bake to image | **OK** | |
| Cycles render 640² (24 spp + OIDN) | **OK** | ≈8 s on 4 CPU cores. |
| EEVEE / Workbench | Not tried | Needs libEGL/GPU here. Cycles is the preview renderer. |
| Freestyle lines in Cycles | **OK** | Needs `view_layer.use_freestyle=True` + a lineset with a linestyle. Otherwise you get the "strokes set empty" error. |
| glTF export: skin + 3 actions + morph | **OK** | `export_animation_mode="ACTIONS"`, single-strip NLA tracks per action. |
| glTF custom attributes | **OK** | `export_attributes=True` exports attributes whose names start with `_`. Three gives `_riga` etc. |
| Python API change | — | Blender 5.0 removed `Action.fcurves` (slotted actions → `action.layers[].strips[].channelbag(slot).fcurves`). `pose_bone.keyframe_insert` still works and hides this (https://docs.blender.org/api/5.0/change_log.html). |
| Perf gotcha | — | Setting colour attributes per element (`ca.data[i].color = …`) took **17 s** for 18k verts. `foreach_set` took < 0.05 s. |

---

## 6. Experiments (exact scripts, results, honest assessment)

### 6.1 Fox-kit (original design, Ashkit-like stage 1) — `fox_kit.py`
Command: `/tmp/bpyenv2/bin/python fox_kit.py --target 3000 [--mode decimate|quadriflow] [--pose attack --frame 11]`

| Step | Time (cumulative) |
|---|---|
| Skin chains (legs, ears, neck, tail) + 7 ellipsoids | 0.10 s |
| Voxel remesh @0.012 → 17,750 quads, Smooth ×6 | 0.21 s |
| Paint vertex colours on the dense mesh (rules by position/normal) | +0.01 s |
| Decimate (symmetric) → **2,998 tris**, 1 island | 0.48 s |
| Eyes + highlights (crisp, not remeshed) → **3,286 tris total** | 0.49 s |
| Blink shape key, 17-bone armature, ARMATURE_AUTO (0 unweighted) | 0.54 s |
| Idle (48 f loop) + Attack (22 f) actions + Blink action | 0.54 s |
| glTF export: **200 KB** (no compression in the wheel) | 0.68 s |
| Cycles preview 640² | ≈8 s |
| `gltf-transform optimize --compress meshopt` → **59 KB**; `quantize` only → 154 KB | — |
| 1,500-tris variant → 1,788 tris total, 144 KB raw | 0.65 s |

three.js verification (Node + `three@0.180.0` `GLTFLoader.parse`, no WebGL needed):

```
SkinnedMesh: true bones 17 tris 3285 attrs position,normal,uv,color,skinIndex,skinWeight morphs {"Blink":0}
clips Attack:0.92s/51tr Idle:2.04s/51tr Blink:3.00s/1tr
Attack t=0.45: minZ moved -0.518 → -0.360 (lunge forward), Blink t=2.6: influence 0.80
```

(The meshopt-compressed file needs `loader.setMeshoptDecoder(MeshoptDecoder)` from
`three/examples/jsm/libs/meshopt_decoder.module.js`. The quantized file loaded fine as-is.)

**Honest look at the renders** (images kept in `/tmp/creature-exp/out/`):
- What works:
  - Reads as one soft, chubby, appealing fox kit: big head, tapered ears with soot tips, an
    S-curved fluffy tail with an ember tip, stubby tapered legs with dark socks, a cream mask and
    chest.
  - Clearly more "professional" than the current faceted Ashkit, from a 400-line script built in
    under a second.
  - The attack pose deforms cleanly (bone-heat weights on a remeshed surface are good).
- Weak spots:
  1. Region-rule colouring gives soft, slightly blotchy boundaries. The palette snap would
     sharpen them, but a cleaner method is **per-part colour + Data Transfer** (Infinigen
     transfers attributes after remesh the same way) or painted masks.
  2. Eyes were sized for the front view and read small in the side view. At a ~56 px sprite
     proxy they shrink to a few dark texels. **Eyes must be bigger and placed for the battle
     camera.**
  3. QuadriFlow mode rounds off thin tips (ear points) and drops colours (fixed via Data
     Transfer). **Decimate is better for silhouettes at this budget.**
- First attempt failure: the torso vanished. The Skin hip node with 4 edges → non-manifold →
  voxel remesh discarded it. Fixed by moving the torso to ellipsoids (see §5.2).
- Second gotcha: the root bone pointed +Z, so "forward" translation went up. Fix: lay the root
  bone flat, pointing forward, so local +Y is forward and local +Z is up.

### 6.2 Core of the working script (condensed; same order and parameters as the verified run)

```python
import bpy, bmesh, math
from mathutils import Vector
bpy.ops.wm.read_factory_settings(use_empty=True); scene = bpy.context.scene
def activate(o, others=()):
    bpy.ops.object.select_all(action="DESELECT")
    for x in others: x.select_set(True)
    o.select_set(True); bpy.context.view_layer.objects.active = o
def ellipsoid(name, loc, s, segs=32):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segs, ring_count=segs//2, location=loc)
    o = bpy.context.active_object; o.name = name; o.scale = s; return o

# 1) Skin chains, valence <= 2 only (branchy nodes -> non-manifold -> remesh drops them)
#    (name, pos, (radius_side, radius_frontback)); creature faces -Y, ~1.0 tall incl. ears
S = [("chest",(0,-.06,.30),(.185,.18)), ("neck",(0,-.17,.43),(.12,.12)), ("headc",(0,-.22,.60),(.08,.08))]
E = [("chest","neck"), ("neck","headc")]
for sd, sx in (("L",1),("R",-1)):
    S += [(f"fl0{sd}",(.10*sx,-.11,.25),(.075,.075)), (f"fl1{sd}",(.11*sx,-.13,.12),(.055,.055)),
          (f"fl2{sd}",(.11*sx,-.15,.035),(.065,.07)),  # paw wider than ankle
          (f"bl0{sd}",(.11*sx,.16,.24),(.09,.09)), (f"bl1{sd}",(.12*sx,.18,.11),(.06,.06)),
          (f"bl2{sd}",(.12*sx,.15,.035),(.065,.075)),
          (f"e0{sd}",(.12*sx,-.20,.76),(.085,.035)), (f"e1{sd}",(.19*sx,-.19,.90),(.06,.025)),
          (f"e2{sd}",(.235*sx,-.18,1.0),(.012,.01))]  # flat, tapered ear
    E += [(f"fl0{sd}",f"fl1{sd}"),(f"fl1{sd}",f"fl2{sd}"),(f"bl0{sd}",f"bl1{sd}"),
          (f"bl1{sd}",f"bl2{sd}"),(f"e0{sd}",f"e1{sd}"),(f"e1{sd}",f"e2{sd}")]
S += [("t0",(0,.27,.33),(.06,.06)),("t1",(0,.38,.42),(.10,.10)),("t2",(0,.43,.56),(.125,.125)),
      ("t3",(0,.41,.69),(.09,.09)),("t4",(0,.36,.78),(.015,.015))]          # S-curve tail
E += [("t0","t1"),("t1","t2"),("t2","t3"),("t3","t4")]
idx = {n:i for i,(n,_,_) in enumerate(S)}
me = bpy.data.meshes.new("skel"); me.from_pydata([p for _,p,_ in S],[(idx[a],idx[b]) for a,b in E],[])
skel = bpy.data.objects.new("skel", me); scene.collection.objects.link(skel)
skel.modifiers.new("Skin","SKIN").branch_smoothing = 0.6
for i,(n,_,r) in enumerate(S):
    sv = me.skin_vertices[0].data[i]; sv.radius = r
    sv.use_root = n in ("chest","t0") or n[:-1] in ("fl0","bl0","e0")   # one root per chain
skel.modifiers.new("Sub","SUBSURF").levels = 2

# 2) masses: big head (baby schema), short snout, nose, cheek tufts, torso, chest ruff
parts = [ellipsoid("head",(0,-.24,.63),(.26,.23,.215)), ellipsoid("snout",(0,-.43,.56),(.08,.08,.06)),
         ellipsoid("nose",(0,-.505,.585),(.03,.022,.022),12),
         ellipsoid("cheekL",(.15,-.30,.55),(.10,.08,.08)), ellipsoid("cheekR",(-.15,-.30,.55),(.10,.08,.08)),
         ellipsoid("torso",(0,.04,.30),(.19,.25,.18)), ellipsoid("ruff",(0,-.17,.37),(.12,.08,.10))]
activate(skel); [bpy.ops.object.modifier_apply(modifier=m.name) for m in list(skel.modifiers)]
for o in parts: activate(o); bpy.ops.object.transform_apply(scale=True)
activate(skel, parts); bpy.ops.object.join(); body = bpy.context.active_object

# 3) fuse: voxel remesh + smooth (fillets at joins)
m = body.modifiers.new("R","REMESH"); m.mode="VOXEL"; m.voxel_size=0.012
bpy.ops.object.modifier_apply(modifier="R")
m = body.modifiers.new("S","SMOOTH"); m.factor=0.8; m.iterations=6
bpy.ops.object.modifier_apply(modifier="S")

# 4) colour on the dense mesh (linear floats; bulk foreach_set!), then decimate keeps it
ca = body.data.color_attributes.new("Col","FLOAT_COLOR","POINT")
ca.data.foreach_set("color", [c for v in body.data.vertices
                              for c in (*srgb2lin(region_colour(tuple(v.co), v.normal)), 1.0)])
d = body.modifiers.new("D","DECIMATE"); d.use_symmetry=True; d.symmetry_axis="X"
d.ratio = 3000 / sum(len(p.vertices)-2 for p in body.data.polygons)
bpy.ops.object.modifier_apply(modifier="D")
# (+ delete islands < 5% of the largest, like Infinigen's select_large_component)
bpy.ops.object.shade_smooth()

# 5) crisp eyes (not remeshed) with a vertex group "eyes"; join; Blink shape key squashes them
# 6) armature: root bone FLAT pointing forward (local +Y = forward), spine, neck, head, ears,
#    2-bone legs, 3-bone tail; then:
activate(rig, [body]); bpy.ops.object.parent_set(type="ARMATURE_AUTO")   # works headless
#    reassign eye verts 100% to "head" (bone heat ignores separate islands)

# 7) actions via pose_bone.keyframe_insert (Blender 5 slotted actions handled internally);
#    one single-strip NLA track per action; shape-key Blink action on body.data.shape_keys
bpy.ops.export_scene.gltf(filepath="kit.glb", export_format="GLB", export_animations=True,
    export_animation_mode="ACTIONS", export_skins=True, export_morph=True,
    export_vertex_color="ACTIVE", export_attributes=True)
```

`region_colour(co, n)` was a list of rules:
- `z < 0.075` → soot socks;
- ear verts above z 0.86 → soot tips;
- tail top → ember;
- near the nose point → black;
- lower snout, cheeks, chest-front and downward normals → cream;
- everything else → orange.

The full 400-line file also has CLI options, island cleanup, the QuadriFlow + Data Transfer
branch and the Cycles/Freestyle preview.

### 6.3 Stage-3 accent test — `horn_test.py`
Built a heavy beast head:
- head / jaw / brow / neck ellipsoids;
- **9 mane flames** as Skin chains (radius 0.075 → 0.004, S-bent, fanned), fused by remesh;
- **2 swept horns** from Bezier curves with `bevel_depth=0.055` + a taper curve, kept as separate
  crisp parts.

Result: 2,694 tris, built in 0.69 s, 3.1 s with render. The horns and flames read as swept,
tapered, smooth shapes, a big step up from straight cones. The head itself still needs design
iteration. Key snippet:

```python
cu = bpy.data.curves.new("horn","CURVE"); cu.dimensions="3D"
sp = cu.splines.new("BEZIER"); sp.bezier_points.add(2)
for p, co in zip(sp.bezier_points, ((.15,-.02,.72),(.30,.10,.86),(.36,.34,.90))):
    p.co = co; p.handle_left_type = p.handle_right_type = "AUTO"
cu.bevel_depth = 0.055; cu.bevel_resolution = 2; cu.use_fill_caps = True
tp = bpy.data.curves.new("taper","CURVE"); s2 = tp.splines.new("BEZIER"); s2.bezier_points.add(1)
s2.bezier_points[0].co = (0,1,0); s2.bezier_points[1].co = (1,0.02,0)   # radius 1 -> 0.02 along length
cu.taper_object = bpy.data.objects.new("taper", tp)  # (link it to the scene first)
# object from cu -> bpy.ops.object.convert(target="MESH")
```

### 6.4 Feature probes — `feature_tests.py` (results in §5.2)
Each probe runs in a fresh factory scene and reports OK/FAIL + timing. Important snippets:

```python
# AO -> vertex colours (Cycles, CPU, headless)
o.data.color_attributes.new("AO","BYTE_COLOR","CORNER"); o.data.color_attributes.active_color = ...
sc.render.engine="CYCLES"; sc.cycles.samples=16; sc.render.bake.target="VERTEX_COLORS"
bpy.ops.object.bake(type="AO")
# Rigify headless
import addon_utils; addon_utils.enable("rigify", default_set=True)
bpy.ops.object.armature_basic_human_metarig_add(); bpy.ops.pose.rigify_generate()
# custom attribute -> three.js
a = mesh.attributes.new("_RIGA","FLOAT_VECTOR","POINT"); a.data.foreach_set("vector", flat_xyz)
bpy.ops.export_scene.gltf(..., export_attributes=True)   # three: geometry.attributes._riga
```

---

## 7. Rigging, animation, export and three.js: two integration paths

### Path A: geometry swap (recommended first) [verified building blocks]
- Blender produces a **static** mesh per species:
  - smooth-shaded, vertex colours (`COLOR_0`);
  - **custom attributes** that encode Orbkin's existing per-vertex rig (`rigA` = pivot xyz +
    kind, `rigB` = amp/phase/freq), authored from Blender vertex groups (e.g. "tail_wag" weight
    → amp) and written as `_RIGA`/`_RIGB`.
- At load: `geo.setAttribute('rigA', geo.getAttribute('_riga'))` etc. Then hand the
  BufferGeometry to the existing `CreatureView` path. `creatureMaterial`, `toonMaterial`,
  `SpriteBaker`, blink, breathing, lunge, hit and faint keep working because they are
  transform-, uniform- or vertex-shader-driven.
- Pros: tiny change in TS. Still 1 mesh and 1 draw call. Keeps procedural acting.
- Cons: no authored keyframe acting. Secondary motion stays "wiggle"-style.

### Path B: skinned glTF (later, for hero lines)
- `GLTFLoader` → `SkinnedMesh` + `AnimationMixer` with Idle / Attack / Hit / Faint clips + a
  Blink morph [verified loading and sampling in Node].
- For two of the same species on the field, clone with `SkeletonUtils.clone`. Use
  `MeshoptDecoder` for meshopt-compressed files.
- Needed in Orbkin:
  - `toonMaterial`/sprite shaders must include three's skinning and morph chunks
    (`#include <skinning_pars_vertex>`, `<skinbase_vertex>`, `<skinning_vertex>`,
    `<morphtarget_vertex>`), and the shadow depth material too;
  - per-frame `mixer.update(dt)` before `SpriteBaker.bake`.
- Exporter knobs [verified in the installed exporter source]:
  - `export_animation_mode`: ACTIONS (default; active actions and NLA-track actions become
    separate animations), ACTIVE_ACTIONS, BROADCAST, NLA_TRACKS, SCENE;
  - `export_merge_animation`: ACTION / NLA_TRACK / NONE;
  - `export_def_bones` (for Rigify);
  - `export_optimize_animation_size`, `export_frame_step`, `export_force_sampling`.
- Optimise with `npx @gltf-transform/cli optimize in.glb out.glb --compress meshopt`
  (gltf-transform is MIT).
- Budget: a 17-bone rig and 3 short clips are ≈ 8–9 KB of animation data, so mesh data
  dominates.

Rigify works headless but is heavy (222 bones for the human metarig). For kin, a **hand-built
10–20 bone armature generated from the same skeleton spec as the Skin chains** is simpler and
verified. `skin_armature_create` can also derive one automatically [verified].

---

## 8. "LLM drives Blender": what is real

| Project | What it is | Evidence / limits | Verdict |
|---|---|---|---|
| **blender-mcp** (ahujasid, MIT) — https://github.com/ahujasid/blender-mcp | Blender add-on socket server + MCP server. Tools include `get_scene_info`, viewport screenshot, `execute_blender_code`, Poly Haven / Sketchfab / Poly Pizza search, AI-gen (Hyper3D, Hunyuan3D, Tripo). | README [read]: arbitrary-code warning ("ALWAYS save your work"); "Complex operations might need to be broken down into smaller steps"; telemetry is opt-in for content but a minimal anonymous usage record is collected by default. Premium paid tier for AI generators. Needs a **GUI Blender** running. | Useful on the owner's desktop for interactive iteration. **Not needed** for a headless pipeline: plain `bpy` scripts do the same thing reproducibly. |
| Independent reviews of Claude + Blender MCP | — | "reliable for primitive shapes, positioning, multi-object scenes … struggles with intricate organic geometry … and rigging"; anime-character attempt drifted in silhouette (https://www.mindstudio.ai/blog/claude-blender-mcp-real-world-performance ; https://note.com/mbbs/n/nd26b9fb906bd?hl=en ; https://www.harknessai.nz/articles/generate-3d-models-claude-blender) | Matches my experience. The script needs **art direction baked into parameters + review renders**. Free-form "make a cute fox" prompts give mediocre results. |
| **LL3M** (UChicago 3DL, arXiv 2508.08228) — https://threedle.github.io/ll3m/ | Multi-agent (plan / retrieve / code / critique) writing Blender Python; BlenderRAG docs retrieval | Author gallery only, no independent benchmark; mostly hard-surface objects. | Validates the "agent writes and iterates bpy with visual critique" loop. Its gallery has no character-quality creatures. |
| **BlenderLLM** (FreedomIntelligence) — https://github.com/FreedomIntelligence/BlenderLLM | Fine-tuned CAD-script model + CADBench | CAD, not characters. | Not relevant beyond confirming the trend. |
| **BlenderGym** (CVPR 2025) — https://arxiv.org/abs/2504.01786 | Benchmark of VLM Blender editing (placement, lighting, materials, blend shapes, procedural geometry) | "even the state-of-the-art VLM system struggles with tasks relatively easy for human Blender users". | Supports human-in-the-loop review. |
| **Infinigen** (Princeton, BSD-3) — https://github.com/princeton-vl/infinigen | Procedural creature generators (carnivore, herbivore, bird, fish, beetle…) | **Read the code** (pip wheel 1.15.5): parts are NURBS lofts from `nurbs_data/*.npy` handles (e.g. `body_feline_tiger.npy`), attached via a genome tree (`genome.attach(part, parent, coord, joint)`). `join_and_rig_parts()` triangulates, joins, `parent_set(ARMATURE_AUTO)`, then `adapt_mesh_resolution(method="remesh")` = **voxel REMESH + attribute transfer**, `select_large_component` removes islands, `smooth_around_line` smooths joins. | Confirms the remesh-fuse-transfer pipeline is the research-grade way to build creatures from parts. Its output is **photoreal animals**, not stylized ones, and it needs py3.11 and heavy deps. Borrow ideas, not code. |
| AI image→3D: TRELLIS (MIT, ≥16 GB NVIDIA; TRELLIS.2 ≥24 GB), TripoSR (MIT, ~6 GB, CPU fallback), Hunyuan3D-2 (community licence **not valid in EU/UK/South Korea**, 1M-user cap) | — | Licences checked in each repo's LICENSE file. GPU numbers come from secondary blogs. | Free only if the owner has a big GPU. Output topology and colours need cleanup. Risk of drifting toward existing IP if prompted from franchise-like images. **Optional, not core.** |

---

## 9. Free assets & tools (licence check)

- **Blender 5.x** (GPL; output is yours).
  - `pip install bpy` works headless here (≈1 GB).
  - Built-ins used: Skin, Remesh, QuadriFlow, Decimate, Data Transfer, Geometry Nodes, Rigify,
    Cycles baking, glTF I/O.
- **glTF-Transform CLI** (MIT): `inspect`, `optimize`, `meshopt`, `quantize`. Works via `npx`
  [verified].
- **three.js r180** `GLTFLoader`, `AnimationMixer`, `SkeletonUtils`, `MeshoptDecoder` (MIT).
- **Quaternius** packs, **CC0** per the itch.io/OpenGameArt listings:
  - LowPoly Animated Monsters, Textured Cute Monster Pack (21 animated monsters), animal packs;
  - the Sketchfab "Ultimate Monsters" listing is **inconsistent** (CC0 in the description, CC-BY
    in the field).

  Good as **reference for proportion and animation timing**, or for placeholder enemies. Using
  them directly would break Orbkin's "all original, procedural" rule (`ASSETS.md`), so treat them
  as study material. (https://quaternius.itch.io/lowpoly-animated-monsters ;
  https://opengameart.org/content/textured-cute-monster-pack)
- **Kenney** (CC0): mostly props, characters and UI. Few creatures.
- **Mixamo**:
  - free with an Adobe ID (not Enterprise/Federated IDs or China);
  - royalty-free in games, but raw files can't be redistributed;
  - auto-rigger and animations are **bipedal humanoid only**, so it is useless for quadruped
    kin;
  - it is an Adobe account dependency (https://helpx.adobe.com/ca/creative-cloud/faq/mixamo-faq.html).
- **Material Maker** (MIT, verified LICENSE): node-based procedural textures (e.g. fur/scale
  gradient masks).
- **ArmorPaint** (source zlib per sources; free to compile, binaries ~$19): 3D texture painting.
  Needs a GPU desktop.
- **UV-Colorize** (MIT) / **LowPolyUV** (free) palette-UV add-ons.
- **Abnormal** (BNPR) custom-normal tools: desktop, for clean toon shading.
- Sprite-render scripts: coreway-labs/blender-sprite-render (headless batch, 4-dir),
  oddmode-studio/BlenderSpriteSheetImporter (MIT). Not needed (Orbkin bakes live), but useful
  for a static bestiary atlas.

---

## 10. Implications for Orbkin: prioritized plan

### P0. Decide the integration path (0.5 day)
Adopt **Path A (geometry swap)**: Blender-built static meshes with `COLOR_0` + `_RIGA/_RIGB`
attributes replace the per-species `designs.ts` builders. Everything downstream stays
(CreatureView acting, vertex rig, sprite bake, palette snap). Keep `designs.ts` as the fallback
and A/B behind `?legacy=1`.

Rule change to log in `DECISIONS.md`: assets are still *procedurally generated by code in the
repo*, but the generator runs in Blender at build time. Commit only the small `.glb` outputs
(~30–60 KB each with meshopt, ~1 MB for all 18), or run the generator in CI with
`pip install bpy` (~1 GB; slower CI). Either way the originality rule holds: no external art.

### P1. Build `tools/creatures/` (Blender generator), 2–3 days
- `kin_spec/<species>.py` or JSON: a **declarative genome**, Infinigen-style but stylized.
  - Masses: `ellipsoid(name, centre, radii, colour)`.
  - Chains: `chain(name, [(pos, rx, ry)…], colour, rig={kind:'wag', amp, freq})` for
    limbs/tails/ears/tufts.
  - Accents: `curve(name, bezier pts, bevel, taper, colour)` for horns/flames/whiskers.
  - Crisp extras: eyes, nose, highlights, crystal facets.
  - Also: palette, budget, camera hints.
- `build.py`, a fixed pipeline [verified steps]:
  1. Chains → Skin → apply.
  2. Masses + chains → join → voxel remesh (0.010–0.014 at 1-unit height) → Smooth 4–6 ×0.7–0.8.
  3. Colour **per part** (store a part-id attribute before remesh, Data-Transfer it after, map
     part-id → palette index), plus optional gradient masks (tips, belly by normal).
  4. Decimate (symmetric) to budget → island cleanup → shade smooth.
  5. Add crisp parts (eyes, horns, crystals) unremeshed.
  6. Rig attributes from vertex groups. Weights come from the chain each vertex came from
     (Data Transfer of a "chain-id" + distance-along-chain attribute), which gives smooth
     wag/flap falloffs for free.
  7. Export glb (`export_attributes=True`) → `gltf-transform optimize --compress meshopt`.
  8. Render review sheets with Cycles: 3/4, side, back, a black silhouette, and a ~56 px sprite
     proxy.
- `review.py`: silhouette-IoU matrix across all 18 kin + each previous stage, greyscale value
  check, triangle and size report. Fail the build on regressions.
- Claude's loop per species:
  1. Write a brief.
  2. Edit the genome.
  3. Run the build (< 1 s geometry, ~8 s per preview render).
  4. Look at the sheet.
  5. Fix with concrete edits.
  6. Repeat ~5–10 times.
  7. The owner signs off from the sheet.

### P2. Redesign pass for the 18 kin (≈0.5–1 day per line)
Per-creature budget: **stage 1 ≤ 2,500 tris, stage 2 ≤ 3,500, stage 3 / rare ≤ 4,500**, including
eyes. These are sprite-baked, so the triangles are cheap. At 56–70 px tall, more triangles add
nothing. Spend them on smooth silhouettes. Then apply the §3 checklists. Line-specific notes:

| Line | Keep (motif, colour) | Change |
|---|---|---|
| Flame: Ashkit → Cindertail → Pyrelord | Soot socks + ember tail tip; red-orange family. | Ashkit = the verified fox-kit approach (bigger eyes for the battle camera; ash-puff cheeks as the originality cue). Cindertail: lanky S-curve body, one big swept flame plume (curves, 3 sizes), fewer chest spikes. Pyrelord: square-dominant heavy mass, low head with brow shelf, 2 swept horns + flame mane of curved tufts (as in §6.3), drop the rows of equal ember studs. |
| Tide: Dropple → Rillback → Maelstrode | Droplet curl motif, blue + foam white. | Dropple: metaball droplet with a soft curl tip (metaballs are ideal). Rillback: long smooth otter with tapered paddle tail; the surfboard back as one bevelled slab. Maelstrode: one continuous S-neck coil from a single long Skin chain (valence 2), fins as swept curves. |
| Flora: Mossling → Thistlehorn → Verdantusk | Thistle bloom + pink accents. | Separate the values: dark olive/bark masses vs light moss tops. Mossling: metaball puff with 3–5 large moss lumps (not 15 small). Verdantusk: square-dominant, fewer and larger grove elements (1 tree + 2 bushes), tusks as tapered curves. |
| Spark: Flickwing → Stormoth | Lightning bolt + lantern tail; yellow/indigo. | Fuzzy body = remeshed metaball with a few big tufts. Wings: bevelled slabs with soft outlines (curve-based outlines, not polygons). The bolt as a decal-like inset colour region, not a separate spike. |
| Terra: Pebblet → Cragmaul | Cyan crystals. | Terra is the **one line where faceting is on-model**: keep a smooth body + deliberately faceted crystals (hard edges, few big facets). Cragmaul: huge fists (triangle crystals on square masses). |
| Gale: Breezel → Cyclonyx | Wind-swirl tuft, orange tips. | Breezel: metaball chick; the swirl as a curve with taper. Cyclonyx: triangle-dominant sleek raptor, streamers as long tapered curves (great for vertex-shader flap/wag). |
| Singles: Vulcrag, Surgeray, Petalwisp | As designed. | Vulcrag: keep the faceted basalt (on-model) with smooth magma veins. Surgeray: one smooth disc body + a tapered whip tail. Petalwisp: petal slabs from curve outlines, a wisp tail as a tapered spiral curve. |

### P3. Shading upgrades that pair with smooth meshes (1–2 days, optional)
- Bake **AO into a vertex channel** (Cycles bake to vertex colours, verified headless). Have the
  toon pass bias its shadow threshold by it (Guilty Gear Xrd's threshold-offset idea): darker
  under the head and chin, inside ears, between legs.
- Optionally transfer smooth "proxy" normals (e.g. from the pre-detail ellipsoid head) for
  cleaner toon terminators on faces (Abnormal / aVersionOfReality approach). Transferring normals
  from a proxy can wipe out wanted detail, so use it on heads only.

### P4. Path B for starters and hero kin (later, 2–4 days)
- Skinned glb with authored Attack / Hit / Faint keyframes.
- Skinning and morph chunks in `toonMaterial` + the shadow depth material.
- Keep the vertex-shader rig for flames and flutter on top.

### What the owner can do by hand (free) to go further
Use the generated base as a start in desktop Blender:
- sculpt a few defining forms (cheek fluff, brow, muscle masses) with Dyntopo;
- adjust the colour-region boundaries in Vertex Paint;
- re-export.

blender-mcp lets Claude and the owner iterate on the same open scene. The headless generator
stays the source of truth, so hand edits should be captured as **genome parameter changes**, or
as a committed per-species "sculpt layer" (a shape-key delta applied by the build) so the build
stays reproducible.

---

## 11. Open questions
- Does Path A's smooth-normal mesh look better through Orbkin's *existing* toon sprite pass than
  the faceted one? This needs an in-game A/B capture. Nothing here was run inside the game.
- Should generated `.glb` be committed (simple and fast, but binary in the repo) or generated in
  CI (needs a ~1 GB `bpy` install per run)?
- How much of the current CreatureView acting (lunge squash, hit recoil) should move to authored
  clips (Path B)?
- What is the best automatic weight/rig-attribute authoring for wag and flap from chains?
  Chain-id + arc-length via Data Transfer was not tested.
- Per-part colour via a transferred part-id was not tested; only position rules were. It should
  give cleaner boundaries.
- Is the target sprite height (~56–70 internal px) final? Eye and face sizes depend on it.
- Licence or originality review: a short check per redesigned kin against well-known franchise
  archetypes (especially the fire fox and electric bug).
