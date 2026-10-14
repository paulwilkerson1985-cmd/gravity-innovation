# Verified showcases of Claude/Opus-made game graphics (2025–2026)

Research angle: find concrete, checkable examples of Claude/Opus producing impressive game graphics with Blender
and/or Three.js. For each one: can it be verified, what the process was, whether it relied on paid services, and
which patterns separate real results from hype. Written 2026-10-14.

Timeline context: Claude Opus 5 shipped in July 2026 (the "Claude of Duty" wave), and Opus 5.5 on 2026-09-22.
Almost every well-documented showcase dates from the three weeks after the 5.5 launch. Searches for Opus 4.x-era
(2025) showcases mostly returned the original `blender-mcp` demo from March 2025 and later reviews of it, so
2025 has far less verifiable material than 2026.

Local copies used for this note:
- Cloned repos: `scratchpad/research/repos/` (tidewater, spiderbench, sprout-quest, core-business, nipale,
  lumina, pcr (Pokémon Claude Red), srak, wf (Wild Fields), tkr (Turbo Kart Rally), blender-game-skills,
  img2threejs, anthropic-skills, game-creator).
- READMEs and lists: `scratchpad/research/showcases_src/`.
- Screenshots I looked at: `scratchpad/research/shots/`.
- My own Blender experiments: `scratchpad/research/showcases_exp/`.

---

## 0. Summary

1. **Every top showcase I could verify uses the same loop.** A long, explicit brief sets a visual target. The
   model runs a screenshot harness on its own output. A self-critique or reviewer pass writes down the weakest
   visible things, and the cycle repeats many times. Look at Lumina's `tools/check.mjs`, Nipale's `look` tool
   with its "three weakest things" in NOTES.md, Starry Night's 48 versions each compared with the reference,
   blender-game-skills' compare sheets, and Sprout Quest's hero-armour and icon render scripts. A single prompt
   doesn't produce the polished results. Tokens and many passes do. Lumina took 49 agents, 21.2M tokens and
   7,801 tool calls. Tidewater took about 8 hours and about $1,874 in API tokens. One 36-hour run cost about
   $2,175.
2. **"Blender + Three.js" is real, but Blender's role is narrower than the hype suggests.** In the verified
   repos (Sprout Quest, Core Business, Spiderbench, Opus FPS, Falcon 9, Tidewater's tools), Blender is an
   offline, headless asset factory. Re-runnable `bpy` scripts build models from primitives plus modifiers
   (bevel, solidify outline, voxel remesh, decimate). The scripts bake AO, normals or folds in Cycles, export
   GLB or sprite atlases, and render preview or contact sheets the model inspects. Nobody "sculpts" by chat.
   Organic modelling and rigging through MCP chat are weak points that independent reviewers have documented.
3. **Code-only Three.js can reach the HD-2D bar.** The best evidence is **Lumina** (neimad-mp/Lumina), a
   three.js r186 HD-2D engine in the style of *Octopath Traveler II* that Opus 5.5 built. Every texture, every
   character sheet and every particle is generated procedurally at runtime, and its screenshots are clearly
   above Orbkin's current 6/10. It took a 748-line visual and architecture contract, 3,804 lines of
   procedural character-sprite painting, 2,641 lines of procedural textures, per-module sandbox pages, and
   reviewers working through four lenses. The gap is depth, process and art direction, not the tool.
4. **The "massively more detailed" viral results usually have a hidden input.** Most often it is a paid
   generator: Higgsfield MCP (Shinkansen, collapse simulation, charcoal scene), Tripo or Meshy (Paper Racers,
   the Little Prince, the pressure washer), Nilo for Roblox, or unnamed AI-generated textures (Spiderbench).
   Next most common are CC0 photogrammetry scans (Tidewater, Wild Fields v3), or simply huge budgets.
   Vendor-posted demos rarely publish files. The free equivalents that work are Poly Haven, ambientCG,
   Kenney, Quaternius and Rocketbox CC0/MIT assets; Blender scripts; and procedural art with a strong
   critique loop.
5. **There are ready-made skill patterns to copy.** These include Anthropic's `frontend-design` skill (role,
   a named list of defaults to avoid, plan → review against the brief → build → screenshot critique), Majid
   Manzarpour's `blender-image-to-3d` (gated phases with silhouette IoU of at least 0.85 or 0.90 and
   measurements instead of adjectives), `img2threejs` (passes, side-by-side sheets, vision review), the
   Nipale briefs (a quality bar, known failure modes, and a `look` tool), and Lumina's multi-agent contract
   workflow.

---

## 1. How I graded the evidence

| Tier | Meaning |
|---|---|
| **A** | Public repo with the code (and, for asset pipelines, the generator scripts). The process is described by the author, and I read the files myself. |
| **B** | Public repo with the code or outputs, but key parts of the pipeline are missing (asset scripts, prompts, image-generation source), or the process claim can't be checked. |
| **C** | A social post or video only. No code and no build. |
| **D** | Vendor marketing (Higgsfield, Tripo, Hyper3D, Meshy and the like). Results come from paid tools, and files are usually not published. |

"Fake" here rarely means fabricated. It usually means one of these:
- a **"one-shot" claim** that hides hours of agent loops or several days of human feedback;
- **paid generators** that the post doesn't mention;
- **vendor demos** with no files;
- **model misattribution**, for example "Opus 5.5" when the piece was actually iterated in Gemini.

The `frontier-games` list (theolundqvist) states the cleanest inclusion rule I found: "Every frame comes from code
the model wrote or tools it drove, such as three.js, shaders or Blender. Art from image, video or 3D generators and
third-party asset packs stay out." By that rule, about half of the viral "Opus + Blender" posts don't qualify.

---

## 2. Showcase catalogue

### 2.1 Lumina: an HD-2D engine on three.js (tier A, the most relevant to Orbkin)

- Repo: https://github.com/neimad-mp/Lumina. It is three.js r186 with plain JS modules, typechecked through
  JSDoc. History is in `docs/history/PROJECT_HISTORY.md`, and the build workflow is in
  `docs/development/DEVELOPMENT_WORKFLOW.md` §11.
- The first prompt (09-25) was: *"Create a 3D pixel art game engine looks like the OCTOPATH TRAVELER II game. Use
  three.js … Create a demo scene."* Later requests added a level editor, a 128×128 level and ARPG combat.
- Process. One orchestrating Claude Code session ran **7 multi-agent workflows: 49 agents, 21.2M tokens, 7,801
  tool calls, about 20 hours of work in about 31 hours of wall clock**. The roles were orchestrator, builders,
  an independent auditor per builder, integrator, reviewers by lens (runtime, **art direction**, performance,
  gameplay/UX, data) who change nothing, one fixer, and a verifier. Usage and session limits interrupted the
  agents twice. The recovery was a WIP commit, saving the findings to a file, then a fresh fixer.
- **Everything is procedural; there are no image files.** These numbers are why it looks the way it does:
  - `ARCHITECTURE.md` (748 lines) opens with "The look we are targeting (read this first)". It has seven
    numbered ingredients, a performance budget (≤300 draw calls, ≤12 point lights, one 2048² shadow map,
    depth of field at half resolution, 60 fps on a GTX 1060), and binding module contracts.
  - **One texel density everywhere: PPU = 16 texels per world unit**, NEAREST magnification, "rich,
    hue-shifted palette and visible hand-placed detail (cracks, moss, grass blades, wood grain, roof tiles)".
    **Normal maps are generated from painted height fields**, so the pixel textures react to real lights
    (`normalMapFromHeight` in `PixelCanvas.js`).
  - `Textures.js` is 2,641 lines and paints 46 world textures texel by texel from shared palette ramps, with a
    top-left key light baked into the forms. `CharacterSprites.js` is 3,804 lines and paints characters as
    layered pixel art (body → legs → clothing → arms → head → hair → hat → cape → gear) into a material and
    shade label buffer. That buffer resolves to 5-tone ramps per material, with a dark plum silhouette outline
    and a separate template per facing direction.
  - Diorama camera: FOV 28°, pitch 32°. Tilt-shift depth of field uses a **half-resolution bokeh gather with
    highlight scatter**, so bright specks become bokeh discs. Bloom has a soft knee, followed by ACES and a
    grade with teal-lifted shadows, vignette, grain and chromatic aberration.
  - Lighting runs on a 24-hour keyframed palette. Lantern point lights share 12 real lights through a
    LightPool. Billboard sprites cast shadows using bent normals and wrap lighting. Foliage is instanced,
    leaf-clump canopies cast dappled shadows, and GPU particles handle dust motes and fireflies.
  - **It renders at full device resolution** (maxPixelRatio 1.5, renderScale 1, a governor that holds about
    2.1 MP). The pixel look comes from NEAREST pixel textures and sprites, not from a low-resolution
    framebuffer. Orbkin is the opposite: it renders the whole frame at 640×360 and upscales it. See §6.
- Screenshots: `repos/lumina/docs/assets/screenshots/emberfall-golden-hour.jpg`,
  `starfall-hearthwick-night.jpg` and `module-character-sprites.jpg`. My view is that these are at or near the
  bar the owner describes for HD-2D.
- Paid services: three ElevenLabs music recordings, added later for one level. Everything visual is free code.

### 2.2 Tidewater by Dan Greenheck (tier A; photoreal WebGPU)

- Repo: https://github.com/dgreenheck/tidewater, described as "Coastal town built with Opus 5.5". The author is
  a professional three.js developer (creator of ez-tree, author of WebGPU and TSL content). Reports put it at
  **about 8 hours and about $1,874 in tokens**. It reached about 800 upvotes on r/singularity (secondary
  source).
- Stack: its own WebGPU/WGSL engine, which `docs/PORTING.md` documents as a brief for porting from
  three.js/TSL ("Don't simplify effects away"). Rendering includes an FFT ocean (Tessendorf), Hillaire 2020
  atmosphere, volumetric Nubis-style clouds, GTAO, TAA upscaling, cascaded shadows and contact shadows.
  `CREDITS.md` cites a published paper or talk for each technique.
- **Assets are CC0 or MIT, prepared by scripts.** Poly Haven scans (crates, buckets, lanterns, planks,
  corrugated iron and so on) go through `tools/props/fetch.py` and then **headless Blender**
  `tools/props/decimate.py` with a triangle budget per asset (DECIMATE modifier, ratio = budget/tris, glTF
  export). Microsoft Rocketbox avatars (MIT) go through `tools/characters/convert.py`, which **retargets FBX
  clips by bone name in world space** and bakes them to NLA, then exports GLB. Field recordings are CC0 from
  Freesound. The whale is procedural, with its profile traced from a public-domain NOAA illustration.
- Takeaway: the most photoreal Opus showcase **sources CC0 scans and implements published rendering papers**.
  It doesn't model hero assets by chat.

### 2.3 Nipale, four overnight builds (tier A; complete briefs published)

- Repo: https://github.com/Nipale-ai/opus-5-5-overnight-builds. The conditions: Opus 5.5 at **xhigh** effort,
  headless Claude Code, **no MCP and no image, music or video generation**, a fresh session per build, and
  nobody answering questions. The builds ran 137 to 339 minutes with 65 to 111 commits each.
- `briefs/*-prompt-as-sent.md` holds the full prompts. Results: `vorschau-tidewater.jpg` (a 384×320×180 voxel
  diorama) and `vorschau-pirate-ship.jpg` (a sunset ship, Gerstner sea, procedural sails with seams, rigging).
  Both are genuinely impressive, and both are purely procedural.
- Brief structure worth copying, quoted from the voxel and pirate briefs:
  - A role and stakes: "You are a senior real-time graphics engineer and technical artist…", "shown side by
    side with the work of other AI models… The goal is NOT 'error-free'… the most impressive result…
    Everything below is a floor, not a ceiling."
  - A quality bar: "Judge your work against premium, hand-crafted voxel art and high-end real-time renders,
    not against tech demos."
  - **What separates real from toy, spelled out for the domain:** "Rigging is what separates a real ship
    from a toy." "No placeholder shapes anywhere. Nothing the camera sees may read as a box, a stack of
    cylinders or a flat plane."
  - Numbered pillars, each with concrete sub-features (light, water, snow, motion, effects, performance,
    polish).
  - A tool: **`look`** opens the project in real Chrome and reports screenshots at chosen seconds, console
    errors, fps and worst 1% frame time, the share of near-black pixels, measured audio level, and draw
    calls. The brief says: "open the screenshots and judge them with the eye of a demanding art director."
  - The loop: "Plan (PLAN.md: art direction, palette, light mood…). Build the complete piece early… Then
    improve in passes… Each pass: run `look`, study the screenshots, write down in NOTES.md **the three
    weakest things a viewer would notice first**, fix or upgrade them, run `look` again, commit."
  - **Known failure modes:** "a black or empty frame; a camera that sits too close…; lighting so flat that
    the voxels read as mush; water that does not move; … effects that pop in and out…"
- The model's own README for the pirate ship lists the techniques it used: an analytic sky with three cloud
  layers, 12 Gerstner waves plus a baked slope texture at three scales, a sail mesh with analytic normals, and
  rigging drawn as screen-space lines. The post chain is NaN sanitizer → god rays and lens flare → bloom →
  grade (split tone, ACES, S-curve) → dithering. It also built tools for itself: shoot, record, interact,
  audiometer and netcheck.

### 2.4 Sprout Quest: a Blender art pipeline baked to sprites (tier A; the closest match to Orbkin's creature approach)

- Repo: https://github.com/aibengineering/sprout-quest. "Everything here (the game code, **the Blender art
  pipeline and every 3D model**, the tests, CI and this repo) was written by Claude Opus 5.5." The first release
  took **11 human prompts, about 4h25m, about 230 model calls, about 565K output tokens and about 99M cached
  input tokens**. One of those prompts was "*install Blender and make cute 3D art*". After that, the human
  playtested on a phone and described what felt off.
- Pipeline (`art/build.sh`, `art/lib.py`, `art/monsters.py`, `art/render_all.py`, `art/pack.py`):
  `blender -b --factory-startup -P render_all.py -- <group>`. Up to three jobs run in parallel, and the hero is
  split by armour. Sprites are packed into atlases, characters are exported to GLB and compressed with
  `gltfpack -cc`, and inventory icons are re-rendered from the 3D models.
- `lib.py` uses these techniques:
  - **A toon material.** Diffuse → ShaderToRGB → a 2-stop color ramp with EASE at 0.72 and 0.84, which mixes
    the base color with a purple-leaning shadow (`mix(base*0.74, #7a5aa8, 0.14)`). A LayerWeight-Facing rim
    is added through MapRange, and the output is an **Emission shader "so colors come out exactly as
    picked"**.
  - **An inverted-hull outline.** A SOLIDIFY modifier with negative thickness, flipped normals and a
    material_offset pointing at a dark `#3a2448` emission material with backface culling. Every primitive's
    scale is baked into the mesh so the outline thickness stays in world units.
  - Primitive builders: sphere, cylinder, cone, box with bevel, torus, **profile** (extruding a 2D outline;
    "Great for blades, axe heads, wings and signs"), **lathe** (vases, mushroom caps, roofs) and crystal.
  - An orthographic camera at 30° elevation. `render()` returns the anchor pixel (the feet) so the game knows
    where to stand the sprite. `render_fit()` auto-frames icons.
  - A face helper: `surf()` computes the point on the front of an ellipsoid so eyes, highlights and blush sit
    exactly on the surface.
  - Animation is done by posing empties per phase (`_anim_slime` squash and stretch) and rendering several
    frames.
- Result (`shots/sprout_atlas0.png`): clean, cohesive, cute cel-shaded art. It is **not "massively detailed"**.
  It is consistent because one material, one outline, one light and one camera apply to everything. The
  creatures are still made of primitives, just in Blender instead of Three.js.
- Paid services: none for the art. The music uses VSCO 2 CE samples (public domain).

### 2.5 Core Business: a Motherload remake with per-asset Blender scripts (tier A)

- Repo: https://github.com/Leichtbier/core-business. "All 3D models including the Blender scripts that generate
  them – was vibe-coded with Claude Opus 5.5". The exception is ElevenLabs audio, which is paid.
- `assets/<name>.py` produces `assets/<name>.glb`, and `-- --preview pod.png` renders a **Cycles CPU preview at
  64 samples** for self-checking (`bl_helpers.preview`). The helper library covers bmesh boxes, cylinders and
  tori, corrugated sheet metal, diagonal hazard stripes as geometry, text converted to mesh, random rust
  patches through material index, and named empties (`SignGlow`, `Lamp_*`, `Rotor`) that the game animates or
  turns into lights.
- There are test pages for each asset view (`test/finds-view.html`, `test/boss-view.html`).
- Result (`repos/core-business/screenshots/shot1.png`): a solid indie 2.5D look, with good lighting and props
  that read clearly. The hard-surface work is the strong part.

### 2.6 Spiderbench by Shikhar/@xikhar (tier B)

- Repo: https://github.com/xikhar/spiderbench. "The code, shaders, procedural city, **Blender-built models and
  generated textures** were produced by Claude under the direction of a human, who steered the work through
  feedback and reference images." The third iteration ran on Opus 5.5 at **medium** effort.
- Comments in the code point to `tools/blender/city_textures.py`, `city_npc.py`, `city_props.py` and
  `city_vehicles.py`. Cloth folds and AO come from a **Cycles bake** ("(peds r2) folds now come from the Cycles
  bake"), and there are many numbered revision rounds (r6, r9). **The `tools/` folder is not published.**
- The repo ships 2–8K PBR texture sets (asphalt and walls with normal maps of 7–19 MB), a 10 MB character GLB
  and AI-generated ad art. The **image-generation source isn't named**, so it was probably a paid service.
- The rendering pipeline is three.js WebGL2 with cascaded shadows, SSGI, AO, SSR, TAA and motion blur.
- Lesson: this is the "Blender + image-gen + three.js" pattern from the viral posts. The detail comes from
  large textures and baked maps plus many human-steered rounds. It is a fan project using Marvel IP, so it
  only shows the technique.

### 2.7 Wild Fields 1648: procedural v1 against v3 with CC0 scans (tier A; the clearest before/after)

- Repo: https://github.com/0xInsiderhq/wild-fields-1648. "The first build had procedural models only. **v3
  added 25 Poly Haven scans** that Claude found and downloaded itself by driving a browser, after its sandbox
  could not reach the asset sites."
- `media/post_before_after.jpg` (copied to `shots/wf_before_after.jpg`) shows a dramatic jump. Flat
  primitives on lime grass become PBR ground textures, scanned props, better character proportions and a
  muted grade.
- Pipeline (`tools/assets/process.mjs`): gltf-transform plus **meshoptimizer** simplification with a target
  triangle count per asset (`boulder_01: 1600`, `stone_01: 140`). It welds, recentres, drops foliage cards,
  swaps in 1k textures, and packs all meshes into one base64 script. 112 MB came down to about 9 MB.
- Lesson: **free CC0 photogrammetry raised quality more than any code change did.** Note that the paths
  (`/home/claude/...`) show it was built in a sandbox that, like ours, couldn't reach Poly Haven.

### 2.8 Turbo Kart Rally (tier A; best screenshot score in a 727-repo source-verified list)

- Repo: https://github.com/bridge-mind/turbo-kart-rally. It scored **9.8/10** on screenshots in
  AgentsLoop/awesome-opus-5.5-games, which verifies 727 source repos.
- **The full prompt is one line**: "launch five opus 5.5 sub-agents and help me build a triple A quality game
  that is a clone of Mario Kart… without asking me any questions…". The orchestrator wrote `ARCHITECTURE.md`
  plus a shared config and event bus first. Each of five sub-agents owned files (World, Driving, Items/FX,
  **Art and camera**, Game/UI), and each tested its slice in a browser against stubs (`dev/`).
- Everything is procedural: CanvasTextures (asphalt built from blotches and speckles, banners) and primitive
  models. The renderer is ACESFilmic with sRGB, PCFSoft shadows, PMREM environment lighting and UnrealBloom
  (0.32, 0.45, 0.88). **This is essentially Orbkin's technique**, and it looks polished
  (`shots/tkr_race.jpg`) because the palette is coherent, there is a lot of set dressing (banners, trees,
  mountains), and the HUD and UI are clean.

### 2.9 Pokémon Claude Red: creature sprites from a 2D shape DSL (tier A; a creature-collector analogue)

- Repo: https://github.com/levy-street/pokemon-claude-red. It started from one prompt ("using only pixels
  directly remake a beautiful pokemon red remake but with better graphics… absolute pixel art perfection"),
  followed by **"a few days of playing it and asking for fixes."** There are no image files.
- **All 151 creatures are lists of primitives** in a 64×64 space (`src/art/pokesprite.js`): `e`
  ellipsoids shaded like spheres, `c` tapered capsules shaded like cylinders, `p` polygons with bevelled
  edges, `l` tapered strokes, `eye` with style and look direction, `mouth`, and `spot`/`stripe` clipped to a
  group. A rasterizer computes a normal per pixel and lights it with L = (-0.5, -0.72, 0.62). It quantizes
  into a 6-tone ramp per color with Bayer dither at band edges, darkens **inner lines where groups meet**,
  and draws a dark **outer outline tinted by the neighbouring colour**. Back views are generated
  automatically (mirrored, ×1.18, face parts removed).
- Results: `shots/pcr_pokemon-151.png` and `pcr_battle-flamethrower.png`. These are readable, cohesive
  GBA-plus quality sprites. The world renders into a 320×180 Uint32 framebuffer and is upscaled with nearest
  neighbour.
- This is the IP of a real franchise, so only the technique is relevant.

### 2.10 Srak l Zit 2: 3D rendered as pixel art (tier A)

- Repo: https://github.com/gavilanbe/srak-l-zit-2, "Hecho con Claude Opus 5.5". The `play/src/gfx.js` header
  (in Spanish) says the scene is drawn at low resolution, outlines are added from depth, and the browser
  upscales it without smoothing.
- The post shader works on depth. If a neighbour is much farther away, it is a silhouette (×0.4). If the
  depth Laplacian is above 0.06, it is a convex edge, so it gets a highlight (×1.3 + 0.03). If the Laplacian
  is between −0.45 and −0.09, it is a concave crease (×0.78). Vignette and danger tint are stepped through a
  Bayer pattern. The camera is orthographic at 45° yaw and 40° pitch with BasicShadowMap and no
  antialiasing. Result: `repos/srak/play/screenshots/partida.png`.
- This is a cheap, well-known way to make 3D read as crisp pixel art, with edges you can tune.

### 2.11 Opus FPS: Godot with Blender-script assets (tier A; an honest look at code-modelled creatures)

- Repo: https://github.com/frankhale/opus-fps. "Every model and sound is generated by scripts in `tools/`"
  (`generate_assets.py` and `render_previews.py` run through Blender headless).
- Useful conventions: **one shared 128×64 palette texture**, an 8×4 grid of 16 px swatches with a little
  noise. Each face's UVs sit inside one swatch, a second material samples the same texture as emission for
  glowing parts, and filtering is nearest. **Contact sheets** show every model with its name, triangle count
  and dimensions in metres (`shots/opusfps_enemies.png`). There are documented origin and size conventions
  for each asset class.
- Honest result: the creatures look like box-built programmer art (`shots/opusfps_enemies.png`). **Using
  Blender doesn't by itself improve organic creatures.**

### 2.12 Falcon 9 in Blender (tier A; hard-surface ceiling)

- Repo: https://github.com/noahsabaj/falcon9-blender. About 10,000 lines of Python in Blender 5.2 build a 1:1
  Falcon 9: 101 objects, about 751k triangles, 28 procedural materials and no image textures. It includes a
  rig (custom props `leg_deploy` and `gridfin_deploy`), nine framing cameras, a cutaway wedge, and a 65-second
  film with a `cues.json` timeline and one builder per shot.
- Result (`shots/f9_engines.jpg`): clean, accurate hard-surface work. Code-driven Blender is strongest here.

### 2.13 Invisible Cities by Piotr Migdał / Quesma (tier A)

- Repo: https://github.com/stared/invisible-cities-opus-5.5. 55 procedural dioramas are built from a shared kit
  (`src/kit.js`). `/?solo=octavia&view=side` renders one diorama alone **for `scripts/shot.mjs` screenshots**.
  The post chain is tilt-shift, bloom and grain.
- Reported: about 85 minutes, **6 parallel subagents**, about $74 of API usage, about half of a six-hour
  budget used. The write-up says Opus's design came out cleaner than GPT-6 Astra's, but this is a single run
  judged by one person.

### 2.14 Starry Night: 48 code revisions (tier A; the iteration loop made visible)

- Repo: https://github.com/leohuanfang-hub/opus-starry-night-lab. "The finished drawing is **not presented as a
  one-prompt result**. It started as a blue gradient, a triangle, and yellow dots." Every version exposes
  `render(t)`. A Playwright harness renders t=1.5 and **ffmpeg stacks the render under the reference** for
  each version, and `npm run stats` compares mean colours. Determinism ("no timers, Date.now, unseeded
  randomness") turns a screenshot into a review artifact.

### 2.15 riba2534's one-sentence demos (tier A, process claims self-reported)

- Repo: https://github.com/riba2534/claude-opus-5-5-demo. It used Opus 5.5 with 1M context at **xhigh** effort,
  one sentence per game, and zero human edits. The prompts end with "尽可能发挥你的所有能力" ("use all your
  abilities as much as possible"). The model **researched official layouts first**, and "赛道形状先用脚本生成俯视图检查"
  ("first used a script to render a top-down view of the track shapes to check them"). In other words, it
  verified geometry with plots it generated itself.

### 2.16 Claude of Duty by Matt Shumer (July 2026, Opus 5): a corrective case (tier A for the code, the quality is honest)

- A Three.js FPS of about 55k lines with no external assets, built with a "Gauntlet Loop": separate critic
  agents compare it against real Call of Duty footage. **The critic score rose from 3.59 to about 5 out of 10.**
  Coverage includes Decrypt, multiplayer.it and thecode.media.
- Lesson: one-shot and long loops with harsh critics still plateau when the target is photoreal AAA in
  procedural code. Pick a stylised target that procedural code can actually hit (HD-2D, toon, voxel).

### 2.17 Blender MCP, 2025 to 2026 (tier B/C)

- `ahujasid/blender-mcp` (March 2025, now `mcp-for-blender`). The original demo was "Create a low poly scene in
  a dungeon, with a dragon guarding a pot of gold." Tools: `execute_blender_code`, `get_scene_info`, Poly Haven
  downloads, and generation through Hyper3D/Tripo (paid). There is also **Blender Lab MCP**, Blender's own
  server for 5.1 and later (projects.blender.org/lab/blender_mcp), which runs model-written Python with no
  guards.
- Independent reviews (MindStudio, Vagon, Mixar; vendor-adjacent, but they agree): good for **layout,
  primitives, materials, lighting and repetitive Python**. Weak at **organic modelling, rigging and precise
  spatial judgement**. In one "donut test" the cup clipped into the donut and the camera angles were wrong,
  and it used about 60% of a $200 plan in 2 hours, because each step is a round trip.
- Lesson: the verified pipelines above use re-runnable scripts instead of live chat-driving, and they render
  previews or compare sheets that the model then reads. blender-game-skills also says that even with MCP
  available, you build through numbered scripts.

### 2.18 HD-2D community repos (tier B, not inspected in depth)

- `Legerdo/hd2d-diorama` (three.js, pixel billboards, torchlight, tilt-shift).
- `unclebill-spec/hd2d-suite` (r160, no build step).
- `frault75/rpg-claude` PR #5 (an Octopath-style diorama renderer with an Opus 5.5 commit trailer: "tilted
  orthographic camera with stretched depth so pixel texels stay square").
- These are useful for cross-checking HD-2D camera tricks.

### 2.19 Vendor and paid-tool showcases (tier D, excluded for us)

| Showcase | Paid service | What it hides | Free equivalent |
|---|---|---|---|
| Higgsfield "5,112-object Shinkansen", "photo → collapsing building", "charcoal drawing as 3D", "octopus", "windmill in 15 min" | Higgsfield MCP (image, video and 3D generation) | Generated textures and meshes; no files published | Blender scripts plus CC0 textures; procedural materials |
| Developers Digest "Library of Alexandria" | Higgsfield MCP (textures, image-to-3D) | Generated assets | Poly Haven or ambientCG textures; Blender modelling with procedural materials |
| Paper Racers, The Little Prince (16 days), pressure-washer game, anime character, Tripo rig workflows | Tripo / Tripo P2 | The meshes | CC0 libraries (Kenney, Quaternius, Poly Haven); Blender primitives + voxel remesh; local TRELLIS.2 / Pixal3D (MIT, **needs a GPU with ≥ 6–24 GB**, so not in this container) |
| game-creator plugin (OpusGameLabs): `game-3d-assets` makes **Meshy "the preferred source"** | Meshy API | The meshes | The plugin's own free tiers: three.js example GLBs (Soldier, Xbot, RobotExpressive) and Khronos Fox through raw.githubusercontent (reachable from here) |
| Spiderbench "image-gen" textures; Pixel Shanghai (Nano Banana Pro characters); "Here's to the Crazy Ones" (GPT-Image) | Hosted image models | Textures and character art | Procedural texture painters (Lumina's Textures.js); Blender bakes; CC0 textures |
| Core Business music, Lumina dungeon tracks, many films | ElevenLabs | Audio only | Web Audio synthesis; CC0 Freesound recordings (Tidewater) |
| Nilo Roblox trailers | Nilo-generated assets | Assets | n/a |
| `img2threejs` | **Sponsored by** Tripo, Hyper3D and Atlas Cloud, but the core skill is code-only | — | Use the code-only path |
| TripoGrowthLab "awesome-opus-5-5-prompts", tripo3d.ai and hyper3d.ai "3D prompt" pages | Tripo and Hyper3D marketing | They reuse other people's demos as SEO content | Treat them as leads, not as evidence |

---

## 3. What separates real results from fakes or hype

Signs of a real result:
1. **A repo with the generator code**, not just outputs. Lumina, Sprout Quest, Core Business, Opus FPS and
   Falcon 9 publish the actual bpy or JS that makes the art. Spiderbench publishes outputs but not
   `tools/blender`, which lowers its tier.
2. **The prompt or brief is published verbatim** (Nipale, Turbo Kart Rally, riba2534, Pokémon Claude Red).
3. **The process is quantified**: tokens, tool calls, hours, agents and cost (Lumina, Sprout Quest, Tidewater,
   Invisible Cities). One-shot claims come with "and then N days of play and fixes" (Pokémon Claude Red, Sprout
   Quest) or "48 versions" (Starry Night).
4. **Credits list every third-party asset** with its licence (Tidewater and Wild Fields CREDITS.md).
5. **There is a verification harness** in the repo: `tools/check.mjs`, `scripts/shot.mjs`, `look`,
   `review_render.py`, Playwright e2e with screenshots.
6. **Weaknesses are admitted**: Claude of Duty's critic score of about 5/10, KNOWN_ISSUES.md in Lumina, and
   blender-game-skills recording "per-region confidence and a list of what was inferred".

Signs of hype:
- The output is a video post with no build or files, especially from a vendor account (Higgsfield, Tripo).
- "One prompt" for something that took days. Look for multi-agent fan-out and token counts.
- The model name is ambiguous or mixed. The "Pixel Art Model Remix" was a Gemini iteration on an Opus output,
  and the curated list flags it.
- Detail per square centimetre that code alone can't produce, such as photoreal textures, sculpted organic
  characters or film-grade cloth. That nearly always means scans or generators.
- Aggregator and SEO pages ("10 one-shot demos") that repeat each other with no source links.

---

## 4. Common success patterns, with evidence

| # | Pattern | Evidence |
|---|---|---|
| P1 | **Write the visual target down as a binding document before coding.** It names the look's ingredients, texel density, camera numbers, palette roles, the grade, a performance budget and "refuse" lists. | Lumina ARCHITECTURE.md §1; Nipale briefs; 2600th guide "art bible / golden scene"; Anthropic frontend-design "plan → review against brief" |
| P2 | **Give the model eyes.** A deterministic screenshot harness (fixed seed, fixed time t, solo or isolated views, URL flags) that it must run and look at every pass, plus numbers for fps, draw calls, black-pixel share and console errors. | Nipale `look`; Lumina `npm run check`; Invisible Cities `?solo=&view=`; Starry Night `render(t)`; Sprout Quest hero-armour sheets |
| P3 | **Compare against the reference side by side and fix with measurements, not adjectives.** | Starry Night (stacked compare per version); blender-game-skills ("head 12 percent too tall"; IoU ≥ 0.85 for blockout, ≥ 0.90 for forms); img2threejs (side-by-side sheet per pass) |
| P4 | **Critique loop with written findings**: "three weakest things a viewer would notice first", reviewers by lens who change nothing, a separate fixer, and a verifier. | Nipale NOTES.md; Lumina reviewer, fixer and verifier roles; Claude of Duty critic agents; game-creator QA subagent "visual review" |
| P5 | **Fan out by ownership against a contract**: parallel builders, each auditing its own area. | Lumina (18 agents in workflow 01); Turbo Kart Rally (5); Invisible Cities (6); 50-player BR (24) |
| P6 | **Blender as a headless, re-runnable asset factory**, not something you chat with. Use scripts per asset or group, shared helper libraries, preview and contact-sheet renders, GLB or atlas export, gltfpack or meshopt compression. | Sprout Quest, Core Business, Opus FPS, Falcon 9, Spiderbench, Tidewater tools |
| P7 | **One consistent stylisation applied to everything**: one toon material and outline, one key light, one camera elevation, one palette or texel density. Consistency reads as professional. | Sprout Quest lib.py; Opus FPS palette atlas; Lumina PPU=16 + PALETTE ramps; Pokémon Claude Red ramps |
| P8 | **Use free scanned assets where realism matters**, and decimate them to a triangle budget. | Tidewater (Poly Haven + Rocketbox); Wild Fields v1 → v3 |
| P9 | **Implement named, published techniques** instead of inventing them. | Tidewater CREDITS (Tessendorf, Hillaire, Nubis, Jimenez); Lumina (bokeh gather + highlight scatter); pirate ship (Gerstner, analytic normals) |
| P10 | **Research the real thing before building**: maps, references, controls. | riba2534 (official layouts); Anthropic guidance ("explore before acting") as relayed in the 2600th guide |
| P11 | **Higher effort and long budgets.** xhigh for long autonomous runs; runs of hours, not minutes. | Nipale (xhigh, 2–6 h); riba2534 (xhigh); Spiderbench used medium effort but had many human rounds |
| P12 | **Human taste in the loop, used sparingly**: play it on the target device and describe what feels off. | Sprout Quest (11 prompts, then phone playtests); Pokémon Claude Red; Spiderbench ("feedback and reference images") |

---

## 5. Experiments run in this container

### 5.1 EEVEE now works headless (it had failed earlier)

`showcases_exp/engines.py` with Blender 5.2.2 bpy found these engines: `['BLENDER_EEVEE', 'BLENDER_WORKBENCH',
'CYCLES']`. **EEVEE rendered**, with harmless EGL_BAD_MATCH warnings, in 8–31 s per process because of shader
compilation the first time. **Workbench renders in 0.1 s**, which blender-game-skills uses for clay and
silhouette review renders. Note that **`BLENDER_EEVEE_NEXT` doesn't exist in Blender 5.x**, so Sprout Quest's
`lib.py` (written for 4.x) would need `BLENDER_EEVEE` here.

### 5.2 A Sprout Quest-style toon and outline sprite bake that works in Cycles and EEVEE

The files are `showcases_exp/toon_lib.py` and `toon_creature2.py`, and the result is
`shots/exp_toon_eevee_vs_cycles.png`. The two renders are identical. **Cycles takes 0.8–0.9 s at 256²** and
EEVEE takes 8–9 s per cold process.

Two gotchas came up and both are fixed:
1. **`ShaderNodeShaderToRGB` is EEVEE-only.** For an engine-agnostic toon, compute N·L from the Geometry
   Normal against a fixed light vector, then use a CONSTANT color ramp feeding an Emission shader.
2. **Cycles ignores `use_backface_culling`**, so an inverted-hull outline covers the whole model in black. The
   fix is to mix Emission and Transparent by `Geometry.Backfacing`, with emission where it is front-facing.

```python
# outline material that works in both engines
geo = nt.nodes.new('ShaderNodeNewGeometry'); tr = nt.nodes.new('ShaderNodeBsdfTransparent'); mx = nt.nodes.new('ShaderNodeMixShader')
nt.links.new(geo.outputs['Backfacing'], mx.inputs[0])   # fac 0 (front-facing hull part) -> outline colour
nt.links.new(em.outputs[0], mx.inputs[1]); nt.links.new(tr.outputs[0], mx.inputs[2])
m.use_backface_culling = True                           # EEVEE path
# shell: SOLIDIFY thickness=-line, use_flip_normals=True, use_rim=False, material_offset=<outline slot>, offset=1
# toon: Geometry.Normal · L  -> ColorRamp(CONSTANT: shadow@0, base@0.12, highlight@0.82) -> + LayerWeight rim -> Emission
```

### 5.3 Fusing primitives into one organic body: what Blender adds over Three.js primitives

The script is `showcases_exp/fused.py` and the result is `shots/exp_glued_vs_fused.png`. I built the same 16
primitives (an original fox-lizard starter shape) two ways:
- (A) glued, with an outline on each primitive;
- (B) joined, then **Voxel Remesh at 0.025 and Smooth with factor 1 and 12 iterations**, then one outline.

B reads as one continuous creature with smooth armpits, neck and tail joins and a single clean silhouette,
where A looks like balloon animals. Each takes about 1.3 s in Cycles at 320². The tail beads became lumpy, so
use a curve or the Skin modifier for tails, and keep the eyes and belly as separate overlay parts.

Three.js equivalents are SDF raymarch or bake with smooth-min, the MarchingCubes addon, or a metaball-style
field followed by a mesh.

### 5.4 The reference image's pixel grid

`hd2d/reference.png` (2000×1299, watermarked "Made by @nagk01", origin not found online) shows strong
autocorrelation at **4 px**. Within each 4×4 block, variance is only **1–4% of the total**, including inside
the light shafts. So **the reference is consistent with a low-resolution framebuffer of about 500×325
upscaled 4×**, which is Orbkin's approach (640×360), and not with Lumina's full-resolution render with pixel
textures. Whether it is a real-time render or an AI image passed through a pixelating filter can't be
determined. Treat it as a bar for mood and composition, not as proof that a particular technique can reach
it.

---

## 6. Implications for Orbkin

1. **Don't throw out procedural Three.js for Blender.** The verified showcases show that code-only
   Three.js/WebGL can reach the bar (Lumina's HD-2D, the Nipale diorama and ship, Turbo Kart Rally). What
   Orbkin lacks compared with them is:
   - (a) a written, binding **art target and contract** at Lumina's level of detail;
   - (b) a **review loop that forces visual critique against the reference every pass**, with written
     "three weakest things" and reviewers by lens;
   - (c) **depth of investment**: thousands of lines of carefully painted textures and sprites, many props,
     particles and set dressing;
   - (d) **fan-out**: parallel builders plus auditors, at a token budget measured in millions.
2. **Use Blender where it clearly helps.**
   - Creature bodies. Offline `bpy` scripts compose primitives, **fuse them with voxel remesh, Skin or
     metaballs**, add bevels, and bake AO or curvature. They then either export GLB with named pivots for
     Orbkin's existing live sprite baker, or pre-render sprite sheets in the Sprout Quest style.
   - Rock and terrain kit pieces. Use displacement, decimation, and AO and normal bakes into pixel textures.
   - CC0 asset preparation: decimating to a triangle budget, as in Tidewater's `decimate.py`.
   - EEVEE and Cycles both work here now: Cycles about 1 s per 256² sprite, Workbench 0.1 s for clay review.
3. **A/B test the internal resolution policy.** Orbkin renders everything at 640×360 and upscales. Lumina and
   *Octopath* render at full resolution with NEAREST pixel textures and sprites at one texel density, and add
   smooth bokeh depth of field, bloom and god rays on top. The owner's complaint is about "sharp and detailed".
   Measured against the reference, Orbkin's low-res approach is faithful, but the higher-rated showcases use
   full resolution. Make a "Lumina mode" capture (full-res framebuffer, PPU 16 textures, sprites with pixel
   texels, half-res bokeh DOF with highlight scatter) and show both to the judges. This is the single
   cheapest experiment with a potentially large effect.
4. **Borrow these specific techniques from verified repos:**
   - Lumina: `normalMapFromHeight` for pixel textures, so lights rake across them; 5-tone material ramps with a
     plum outline for sprites; a templated character sheet per direction; a keyframed 24-hour palette;
     LightPool; half-res bokeh gather with highlight scatter; wrap lighting and bent normals on sprites; the
     x-ray silhouette when occluded.
   - Pokémon Claude Red: a creature DSL of ellipsoids, capsules, polygons and strokes plus eye and mouth
     styles, with per-pixel sphere and cylinder shading, inner lines where groups meet, an outline tinted by
     the neighbouring colour, and an automatic back view. It suits 2D kin portraits and icons.
   - Srak: depth-Laplacian outlines (silhouette ×0.4, convex highlight, concave crease) as a cheap post pass
     for the diorama geometry.
   - Opus FPS: one shared **palette atlas texture** with swatch UVs, plus contact sheets with triangle count and
     size for every asset.
   - Nipale and Invisible Cities: a `?solo=<asset>&view=<cam>` harness for every arena, creature and prop, and
     deterministic `?seed&t` captures.
   - blender-game-skills: gates such as silhouette IoU ≥ 0.85/0.90 and proportions within 5%/2% against
     reference views, with measurements written as numbers.
5. **Free realism, if any arena calls for it.** Poly Haven, Kenney and the rest are blocked by this proxy, but
   GitHub raw is reachable. Wild Fields' author got around a similar sandbox by having Claude drive a browser.
   Options are GitHub-hosted CC0 packs, the three.js repo example models, and Khronos sample assets. HD-2D
   pixel art doesn't need scans, though, so this is low priority.
6. **The budget is real.** The top results consumed millions of tokens or thousands of dollars. Lumina hit
   usage and session limits twice. On a Claude subscription, plan multi-session workflows that can resume:
   WIP commits, findings saved to files, a contract document, and NOTES.md as memory.

### Skills to create (based on what worked)

1. **`hd2d-art-direction`**. Modelled on Anthropic's `frontend-design` and Lumina §1. It should cover:
   - the role ("art director at a studio that shipped HD-2D games");
   - a target-look checklist with numbers (texel density, camera FOV and pitch, depth-of-field band, grade);
   - a calibration list of "generated defaults" to refuse, such as balloon creatures, uniform noise textures,
     flat lighting, bloom on everything, empty floors, and identical rocks;
   - plan → review the plan against the brief → build → screenshot critique, two or three rounds, with the
     "three weakest things" ledger;
   - the greyscale, silhouette and squint checks from the 2600th guide.
2. **`visual-review-loop`**. Deterministic capture (seed, t, solo view, phone and desktop), side-by-side sheets
   against the reference, crops, numbers (luminance histogram, near-black share, colour stats against the
   reference, draw calls), and a findings JSON with severity, evidence and a fix. Reviewers change nothing.
3. **`blender-asset-factory`**. Headless bpy conventions: a `lib.py` of primitives, profile, lathe, voxel-remesh
   fusion, bevel, a toon emission material and an outline that works in Cycles and EEVEE; review renders
   (Workbench clay or silhouette, Cycles toon); contact sheets; GLB export with named pivots; gltfpack. Note
   the Blender 5.x API differences, and point to blender-game-skills for the gate protocol.
4. **`procedural-pixel-texture`** (Lumina-style painters). Palette ramps with hue shift, height to normal map,
   a baked key light in the forms, cluster and seam rules, tileability checks with a 2×2 proof sheet, and the
   seam metric from the 2600th guide.
5. **`creature-sprite-design`**. Silhouette-first creature design (shape language, a read at 64 px),
   fused-body modelling in Blender or the 2D DSL route, ramp and outline conventions, and an original-IP
   check.

---

## 7. Open questions

- The process behind the reference image (@nagk01) is unknown. Is it a real-time render or an AI image with a
  pixel filter? This changes how literally to chase it.
- Can CC0 packs (Kenney, Quaternius, Poly Haven mirrors) be reached through GitHub or npm from this proxy? I
  didn't search for mirrors.
- Lumina-style full-resolution with pixel textures against Orbkin's low-res framebuffer: which do judges
  prefer for Orbkin's battle scenes on phone and desktop? It needs a capture A/B.
- How fast is EEVEE once it is warm in a persistent Blender process? Batch many renders in one process rather
  than one process per sprite. I didn't measure this.
- The Spiderbench and Tidewater authors' own posts (on x.com, which is unreachable from here) may hold more
  process detail, such as the number of rounds and prompts used.

---

## 8. Sources (primary first)

Repos read directly (code, READMEs and docs):
- https://github.com/neimad-mp/Lumina (ARCHITECTURE.md, docs/history/PROJECT_HISTORY.md, docs/development/DEVELOPMENT_WORKFLOW.md §11, src/engine/pixel/*)
- https://github.com/dgreenheck/tidewater (README, CREDITS.md, docs/PORTING.md, tools/props/decimate.py, tools/characters/convert.py)
- https://github.com/Nipale-ai/opus-5-5-overnight-builds (briefs/*-prompt-as-sent.md, *-model-readme.md, vorschau-*.jpg)
- https://github.com/aibengineering/sprout-quest (README, art/build.sh, art/lib.py, art/monsters.py, public/assets/atlas-0.webp)
- https://github.com/Leichtbier/core-business (README, assets/bl_helpers.py, screenshots/shot1.png)
- https://github.com/xikhar/spiderbench (README, src/world/*.js comments, public/assets listing)
- https://github.com/0xInsiderhq/wild-fields-1648 (README, CREDITS.md, tools/assets/process.mjs, media/post_before_after.jpg)
- https://github.com/bridge-mind/turbo-kart-rally (README with the verbatim prompt, src/main.js, src/track-textures.js)
- https://github.com/levy-street/pokemon-claude-red (README, src/art/pokesprite.js, media branch screenshots)
- https://github.com/gavilanbe/srak-l-zit-2 (play/src/gfx.js, screenshots)
- https://github.com/frankhale/opus-fps (README, assets/previews/*)
- https://github.com/noahsabaj/falcon9-blender (README, docs/still_*.jpg)
- https://github.com/stared/invisible-cities-opus-5.5 (README)
- https://github.com/leohuanfang-hub/opus-starry-night-lab (README)
- https://github.com/riba2534/claude-opus-5-5-demo (README with prompts)
- https://github.com/majidmanzarpour/blender-game-skills (README, skills/blender-image-to-3d/SKILL.md)
- https://github.com/img2threejs/img2threejs (README, LAB-FINDINGS.md)
- https://github.com/anthropics/skills (skills/frontend-design/SKILL.md)
- https://github.com/OpusGameLabs/game-creator (README, skills/game-3d-assets/SKILL.md)
- https://github.com/2600th/game-with-ai-starter-pack (opus-5-5-creative-prompting-guide.html: art direction, 3D assets, gates, sprites, VFX, post-processing)

Curated lists, used as leads:
- https://github.com/coolbat/awesome-opus-5.5-usecase
- https://github.com/magiccreator-ai/awesome-claude-opus-5-5-demos
- https://github.com/AgentsLoop/awesome-opus-5.5-games (games.json: 727 source-verified repos with screenshot ratings)
- https://github.com/theolundqvist/frontier-games (inclusion rules)

Secondary coverage, lower confidence:
- https://aifrontierpost.com/articles/opus-5-5-built-tidewater-island-game/ (8 h, $1,874; seen via search snippet only)
- https://runtimewire.com/article/claude-opus-55-spiderbench-browser-game (search snippet)
- https://quesma.com/blog/invisible-cities-one-shot/ and https://ai-tldr.dev/releases/quesma-invisible-cities-opus-5-5-astra/ (search snippets)
- https://decrypt.co/374560/dumbest-ai-prompt-claude-beat-careful-game-design (Claude of Duty critic loop)
- https://www.mindstudio.ai/blog/claude-blender-mcp-60-percent-tokens-donut-test-results and https://www.mindstudio.ai/blog/claude-blender-mcp-real-world-performance (Blender MCP limits)
- https://www.developersdigest.tech/blog/claude-opus-5-5-3d-world-higgsfield-mcp (Higgsfield workflow, paid)
- https://projects.blender.org/lab/blender_mcp (official Blender MCP, via search snippets)
- https://github.com/ahujasid/blender-mcp (README)
