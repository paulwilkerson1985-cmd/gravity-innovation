# Methodology: how an AI agent (Claude Opus) produces excellent visuals — and why Orbkin's code-primitive approach plateaued

Angle: `agent-visual-method` · research session S3 · 2026-10 · JSON summary: `agent-visual-method.json` · companion: `art-direction.md` (critique rubric + `artcheck.py`)

**Bottom line**

The owner is right that hand-typing primitives is the wrong *authoring* method. Blender alone does not fix that, though. Every credible, measured agent pipeline found here (papers and open-source Claude Code skills with published benchmarks) shares four traits:

1. **Reference-first, with a written brief.** Proportions, palette and silhouette features are pinned before any modelling starts.
2. **Phased construction with gates.** The order is blockout → forms → surface → light → polish, and nothing gets detail until its silhouette passes.
3. **Measured comparison against the reference from the same camera at gameplay pixel size.** "Looking at it and deciding it seems fine is not accepted."
4. **Real source material for surfaces** (CC0 scans and kits), not procedural noise.

The VLM is a useful but biased and detail-blind critic. Feed it derived images, crops and numbers, and prefer pairwise comparison against a reference over self-scoring.

Confidence labels:
- **high**: peer-reviewed, or a reproducible repo with published numbers.
- **medium**: one practitioner source with evidence.
- **low**: my synthesis.

Network note: during the research, arxiv.org, gamedeveloper.com and threejs.org could not be fetched (the allowlist was later widened to Poly Haven, ambientCG, Kenney, Blender docs and threejs.org) from this container. Paper claims are taken from abstracts via search, and repo claims from `raw.githubusercontent.com` reads, which are real files.

---

## 1. Evidence: what measurably works for agent-made 3D/visuals

### 1.1 Closed render→critique→revise loops beat one-shot, but saturate fast
- **SceneCraft** (ICML 2024, [arXiv 2403.01248](https://arxiv.org/pdf/2403.01248)). An LLM writes Blender Python from a scene graph turned into layout constraints. A VLM critiques the renders in an inner loop, and an outer loop grows a library of reusable "spatial skills". **high**
- **BlenderGym** (CVPR 2025 highlight, [arXiv 2504.01786](https://arxiv.org/pdf/2504.01786), [code](https://github.com/richard-guyunqi/BlenderGym-Open)). **high**
  - Code-driven Blender edits covering placement, lighting, procedural materials, blend shapes and procedural geometry. Even state-of-the-art VLM systems trail human Blender users on tasks humans find easy.
  - Key result: in generator–verifier loops, **scaling the verifier helps, and the more compute you have, the larger the share that should go to verification.**
  - Verifiers still sometimes fail to pick the best edit.
- **VIGA — Vision-as-Inverse-Graphics Agent** ([arXiv 2601.11109](https://arxiv.org/pdf/2601.11109), 2026). **medium-high** (the numbers differ between paper versions)
  - A training-free write→run→render→compare→revise loop that alternates generator and verifier roles and keeps memory of plans, diffs and render history.
  - Reports +35% over one-shot on BlenderGym.
  - The authors say performance is "bounded by the spatial perception capabilities of underlying VLMs".
- **LL3M** ([arXiv 2508.08228](https://arxiv.org/pdf/2508.08228), [repo](https://github.com/threedle/ll3m)). **high**
  - Multi-agent plan / retrieve / write / debug / refine of Blender scripts.
  - **BlenderRAG** (retrieval over the Blender API docs) is what made advanced modelling operations and correct code possible.
- **3DCodeBench** ([arXiv 2606.01057](https://arxiv.org/pdf/2606.01057), Google DeepMind / USC 2026). Tested 12 VLMs on procedural Blender code. **high**
  - Most failures were **API mismatches**.
  - Renders that did succeed often had **disconnected or floating geometry**.
  - More thinking budget and multi-turn refinement improved results.
  - They built a human pairwise arena because automated metrics miss how shapes look.
- **Planner–Actor–Critic 3D modelling** ([arXiv 2601.05016](https://arxiv.org/pdf/2601.05016)). **medium**
  - The actor does not always apply the critic's feedback.
  - After about 3 iterations quality "degrades or converges".
- **Practitioner report (Blender devtalk).** Sending viewport screenshots back to the model was the largest quality gain: "just executing code blindly produces garbage after 3–4 steps" ([devtalk thread](https://devtalk.blender.org/t/3d-agent-blender-ai-assistant-built-a-multi-agent-system-on-top-of-blenders-mcp-and-python-api-and-sharing-architecture-learnings-for-the-lab-discussion/44260)). **medium** (anecdotal)

**Takeaways**
- Loops are necessary.
- Each loop iteration must target *specific measured gaps*.
- Iterations without new information plateau after about 3 rounds.
- Spend compute on verification (multi-view renders, measurements, pairwise judgement), not only on generation.

### 1.2 Measured Claude Code skills for Blender (open source, read in full)

**`elithril/blender-kiln`** (MIT; [README](https://github.com/elithril/blender-kiln), [benchmarks.md](https://github.com/elithril/blender-kiln/blob/main/docs/benchmarks.md))

Setup:
- Headless sandboxed sessions on Blender 5.2.2 with Opus 5.5.
- Each GLB the skill ships is scored by silhouette overlap from five sides against the *real* Poly Haven asset, which the session never sees.
- Lantern photo rebuild: 0.830 → 0.897 over 15 versions. Ammo box: 0.854 → 0.950. Chair: 0.445 → 0.750.
- About $4–6 of API-equivalent cost per object.
- Confidence: **high** for the method (data and renders are published on a `bench-results` branch); **medium** for generality, since the authors say it is "one run per brief" with five references.

Its "What the measurements taught" list is the most useful primary source found for this angle:
1. **Measure instead of eyeballing.** Reviewing by eye, sessions over-corrected twice: first too bright and blotchy, then grey at half the reference saturation.
2. Trace thin parts from the pixels.
3. Layer independent texture fields (colour, roughness, relief, cavity); grime has a direction.
4. Settle size and camera before modelling.
5. **Never fit the photo harder than the real object would** (v4 overfit the photo's perspective: base 30% too tall).
6. **Measure the file that ships.** Blender's glTF exporter wrote a linear float base colour without the sRGB transfer, so the asset shipped near-black.
7. Scale the procedure to the asset.
8. **"Start the surface from a scan… CC0 scanned sets, tinted to the photo's palette, read real where procedural noise reads as a smear."**
9. Take proportions from a 3D template when one exists, never its surface.
10. **Look at every joint.**
11. **No figure from a measured object in what the session reads: it becomes a target.**
12. **One material problem per correction round**: fixing six at once regressed the surface.

**`majidmanzarpour/blender-game-skills` → `blender-image-to-3d`** (MIT; [SKILL.md](https://github.com/majidmanzarpour/blender-game-skills/blob/main/skills/blender-image-to-3d/SKILL.md)). **medium-high** (well-specified method; no published benchmark)
- **Gated phases:** brief → calibration → blockout → forms → topology → UVs/bake → rig → secondary motion → animation → export → acceptance.
- **Gate protocol:**
  - render clay and silhouette views from the reference-matched camera ("ref-cam AZ EL LENS") **at gameplay pixel size** (default 128 px);
  - build a compare sheet (reference, render, overlay, gameplay strip);
  - compute silhouette IoU and width profiles per height band.
- **Tolerances:**
  - blockout: IoU ≥ 0.85, band widths ±0.05, proportions ±5%;
  - forms: IoU ≥ 0.90, ±0.03, ±2%;
  - materials must read in greyscale at gameplay size.
- "Write mismatches as measurements, not adjectives: 'head 12 percent too tall'."
- "Most wasted work in this pipeline is detail added on top of wrong proportions, so nothing gets detail until its silhouette passes."
- "Large random noise hides form and shimmers at distance."
- For multi-asset casts: render the **greybox lineup at relative scale**, and check that roles differ in shoulder width, head shape, posture and stance, *not only colour*.
- Phase 0 brief fields:
  - VIEWS with camera estimate;
  - SCALE with evidence;
  - 8–15 PROPORTIONS;
  - PARTS in overlap order;
  - **SILHOUETTE: the 3–5 features that make it read at gameplay size**;
  - MATERIALS by role;
  - INFERRED (everything guessed, listed);
  - TARGET (camera and pixel height).

**`Rambo19911/blender-bridge`** (MIT plugin, GPL add-on; [README](https://github.com/Rambo19911/blender-bridge)). **high** (the tooling exists; quality is not benchmarked)
- MCP tools: `render_preview` (iso/front/back/left/right/top/scene camera), `check_asset`, `export_glb`.
- `check_asset` covers triangle budget, unapplied scale, UVs, non-manifold or loose geometry, zero-area faces and origin.
- Tested on Blender 5.2; works headless (`blender -b … --python`).

**`img2threejs`** (Apache-2.0; [README](https://github.com/img2threejs/img2threejs)) — the counterpoint and closest analogue to Orbkin's approach. **medium**
- Rebuilds a reference image as *procedural Three.js code* through 8 vision-reviewed passes: blockout → structural → form → material → surface → lighting → interaction → optimisation.
- Before generating code it writes a "detailInventory" of identity-defining small details (bevels, screws, linework, wear), and a gate blocks generation until each detail maps to a component or material.
- kiln measured its likeness at **0.866 versus kiln's 0.861 at about 3× the cost**.
- Lesson: code-primitive modelling *can* reach good likeness, but **only with a reference, a detail inventory, staged passes and per-pass vision review**. Those are exactly what Orbkin's creature and arena code never had.

**`ahujasid/blender-mcp`** ([README](https://github.com/ahujasid/blender-mcp)). **high** (facts read from the README)
- The popular Claude↔Blender bridge: `execute_blender_code`, viewport screenshot, Poly Haven / Sketchfab / Poly Pizza import, and AI 3D generation (Hyper3D, Hunyuan3D, Tripo).
- The generators are paid or quota-limited cloud services, which rules them out under our free-only constraint.
- README limitation: "complex operations might need to be broken down into smaller steps".

**3JSBench** (Three.js forum; vendor-run benchmark of LLM-generated three.js objects). **medium**
- Finding: models handle game mechanics, but **3D objects fail the bar**: flickering, invisible surfaces, interpenetrating parts ([forum post](https://discourse.threejs.org/t/3jsbench-a-benchmark-for-llm-generated-three-js-objects/95137), via search summary).
- HN discussion of LL3M describes typical LLM output as "a primitive like a sphere, scaled, then another primitive… default material and set its color" ([HN](https://news.ycombinator.com/item?id=44930808)). **medium** (critique, but matches 3DCodeBench's floating-geometry finding)

### 1.3 3D→pixel sprite pipelines are a proven professional path
- **Dead Cells.** The artist models and rigs in 3D (3ds Max → FBX), then renders the animations to pixel art with an in-house batch tool, so changing a design does not mean redrawing frames ([80.lv case study](https://80.lv/articles/case-study-dead-cells-character-art-pipeline/), [Habr article by Vasseur](https://habr.com/post/416589); the Game Developer deep dive could not be fetched). **high**
- The key detail matching Orbkin is that the 3D model was built **from a 2D pixel-art model sheet**. Reference first, then 3D.
- Orbkin's live sprite baker is the same idea done at runtime. The weak link is the *quality of the 3D model and its reference*, not the baker.

## 2. The limits of a VLM judging its own renders

| Limitation | Evidence | Remedy |
|---|---|---|
| **Fine-detail blindness.** Models fail simple low-level geometry: overlap, intersections, nested shapes | *VLMs are blind* ([arXiv 2407.06581](https://arxiv.org/html/2407.06581v6), [site](https://vlmsareblind.github.io/)): 58% average over 7 trivial tasks, best model 77.8%. Accuracy recovers to ~100% when shapes are spaced apart; linear probes show the information *is* in the encoder **(high)** | Zoom crops of the region in question; isolate one subject per image; ask closed questions ("does the left ear touch the head? yes/no + where") |
| **Small objects in big frames are missed** | V\* guided visual search (CVPR 2024): GPT-4V 51% vs 75% with search-and-crop; SPARC 2026: "the hardest task is to locate small objects and look at them at sufficient resolution" ([V\* summary](https://huggingface.co/papers/2306.04356), [SPARC](https://arxiv.org/pdf/2602.06566), [CropVLM](https://arxiv.org/pdf/2511.19820)) **(high)** | Always pair the full frame with 2–4 crops (each subject, each FX, UI) at ≥ 2× nearest-neighbour upscale |
| **Resolution caps and silent downscaling** | Anthropic: images above the long-edge or megapixel limit are downscaled before the model sees them; patch-based tokens (28×28 blocks); multi-image requests are capped at 2000 px per side or 20 images ([vision docs](https://platform.claude.com/en/docs/build-with-claude/vision), [computer-use best practices](https://claude.com/blog/best-practices-for-computer-and-browser-use-with-claude)) **(high)**. Seen in this session: a 2571×518 triptych was shown to me at 2000×403 | Pre-size images yourself; prefer several focused images over one wide sheet; nearest-upscale pixel art so one game texel spans ≥ 2–3 image pixels |
| **Self-preference / leniency** | LLM judges recognise and favour their own generations ([Panickssery et al., NeurIPS 2024](https://papers.nips.cc/paper_files/paper/2024/hash/7f1f0218e45f5414c79c0679633e47bc-Abstract-Conference.html)); a self-preference metric finds significant bias ([arXiv 2410.21819](https://arxiv.org/pdf/2410.21819)); extended to multimodal judges ([project page](https://projectpage-1sg1y.kinsta.page/)). Some 2026 work argues measurements are confounded ([ICML 2026 poster](https://icml.cc/virtual/2026/poster/61230)) **(medium-high)** | Never "rate your render 1–10". Do **pairwise** reference-vs-ours or A/B with the order shuffled and labels hidden; use a fresh-context critic subagent that has not seen the code or the intent; score with the rubric's located evidence |
| **Eyeball over-correction** | kiln: by-eye sessions over-corrected twice (too bright, then grey at half saturation) **(high)** | Numbers gate the loop: saturation, value, IoU, palette distance; the eye picks the *next* problem |
| **Goodharting the numbers** | kiln: any figure quoted in the skill "becomes a target"; photo over-fitting **(high)** | Keep reference measurements out of the generator's context; the verifier holds them |
| **Critic feedback ignored, quality saturates after ~3 rounds** | Planner–Actor–Critic paper **(medium)** | One problem per round (kiln rule 12); re-plan from the blockout stage when 3 rounds bring no measured gain |
| **Spatial/3D reasoning weakness** | VIGA limitation statement; multi-view benchmarks **(medium-high)** | Multi-view renders (front/side/top/¾ plus the game camera); orthographic silhouettes; numeric bounding boxes from code (`scene_info`) |

## 3. Known failure modes of LLM-made 3D/2D art, and remedies

| Failure mode | What it looks like | Root cause | Remedy |
|---|---|---|---|
| **Blobby primitive assembly** | Scaled spheres/eggs plus cones, overlapping; "toy" read | Generating geometry as parameters in text; no direct sculpting; no form language | Blockout from primitives is fine, then **fuse and refine**: voxel remesh at ~1/200 of the height, then shape (majid Phase 3); curves and skin modifiers for limbs; subdivision; a base mesh |
| **Floating / disconnected parts, bad joints** | Ears hovering, limbs intersecting | No contact check | Render every joint (kiln rule 10); `check_asset` for loose parts; auto-grounding (Orbkin already grounds) |
| **Symmetric stiffness** | Perfect mirror symmetry, T-pose rest, no weight shift | `sym()` everywhere, no pose step | After the symmetric build, apply an asymmetric rest pose (head tilt, weight on one leg, tail curve) and asymmetric accents (a nick in an ear, an uneven tuft) |
| **Noise-as-detail** | fbm everywhere, uniform busy surfaces that smear | Noise is the cheapest detail to write in code | Detail only at the focal point and on lit planes; **start surfaces from CC0 scans**, then palette-quantise; detail-uniformity CV gate (`art-direction.md`) |
| **Muddy / over-saturated colours** | All mid-values, or eye-burn | Colours picked as hex in isolation | Ramps with hue shift; gamut per scene; measure saturation and value against the reference |
| **Wrong scale / proportions** | Heads too big, props off-scale | No calibration | Calibration file: ruler, reference planes, game camera (majid Phase 1); proportions list in the brief |
| **Over-fitting one view** | Looks right from one angle, wrong elsewhere | Single-view review | Multi-view gates; never fit the photo harder than the object |
| **API hallucination (Blender)** | Scripts crash; v5 API changes | Training data lag | RAG over the API docs (LL3M's BlenderRAG), version notes, a small verified snippet library in the skill |
| **Export pipeline bugs** | Black textures, BLEND alpha | sRGB/linear and FBX→glTF quirks | Measure the shipped GLB (kiln rule 6); round-trip import |
| **Generic/average design** | Plausible but forgettable | The model's prior is the mean of its training data | A strong reference sheet and brief with 3–5 *signature silhouette features*; exaggeration; a shape-language motif per family |

## 4. Recommended agent workflow (encode as skills)

`concept → brief → blockout → forms → surface → light → polish`, each stage with a gate. This is a synthesis of SceneCraft, VIGA, kiln, blender-image-to-3d, img2threejs and Dead Cells. Confidence **medium-high** overall.

1. **Reference & mood board.** Collect 3–8 references per asset or scene: style target (quality bar), shape references, palette references.
   - We have no image generation and only free tools. References can be:
     - the owner's targets (kept private, never shipped);
     - CC0 photos and asset previews;
     - **our own 2D concept paintovers** (an SVG or canvas sketch the agent draws: silhouettes and colour blocks only).
   - Store them as files and **write a brief** (majid's Phase 0 fields) including the camera and the on-screen pixel height. For Orbkin kin that is about 30 texels in battle and ~420 px in menus.
2. **Silhouette / blockout.** Build primary masses only.
   - Gate: black silhouettes at gameplay pixel size against the reference silhouette (IoU, width per height band) and a **cast lineup** check (distinct shapes, not just colours).
   - Get this signed off before any detail.
3. **Forms.** Fuse (remesh) and refine secondary forms.
   - Gate: clay render (no colour) from the game camera and ¾; IoU ≥ 0.90; joints inspected.
4. **Surface / material.** Colour blocks first (2–3 per creature), then ramps, then texture.
   - For pixel art: palette-quantise scans or bakes to the arena ramps.
   - Gate: greyscale at gameplay size (values separate), palette distance to the brief.
5. **Light / integration.** Place it in the real scene with the real lighting and post.
   - Gate: `art-direction.md` rubric R1–R8 and `artcheck.py` deltas against the reference frame.
6. **Polish.** Motion, FX, UI.
   - Gate: frame strips (3–5 frames); rubric R13–R15.
7. **Pairwise final check.** A fresh-context critic subagent gets the reference and ours, side by side, in randomised order, with the rubric.
   - Output: the three largest deltas ranked by visual impact.
   - Fix one problem per round. Stop when two rounds bring no measured gain, and re-plan from an earlier stage if needed.

Verification budget: following BlenderGym, put ≥ 50% of the iteration effort into rendering views, crops and measurements, and into judging.

## 5. Prompt / instruction patterns that improve visual output

Each pattern is drawn from the sources above. **medium** unless noted.
- **Measurements, not adjectives.** "Head 12% too tall", "shadow b* +18 vs reference −5", never "make it nicer" (majid, kiln). **high**
- **Name the 3–5 silhouette features** that must read at gameplay size, and check them explicitly every gate.
- **Detail inventory before code** (img2threejs): list identity-defining small details and map each to a part or material, or drop it.
- **One problem per round**, ranked by visual impact (kiln rule 12). **high**
- **List what was inferred.** Any unseen side or guessed dimension is labelled as inferred, not presented as fact.
- **Critic isolation.** The critic sees images and the rubric only, never the code, the plan or previous self-praise. Pairwise, order randomised (self-preference literature).
- **Derived images for the critic:** squint, notan, silhouette, palette swatch, saliency, plus zoom crops (`art-direction.md`).
- **Stop rules.** Stop at the tolerance, not "perfect"; never fit beyond the reference (kiln rule 5).
- **Skill content hygiene.** Never put the target's measured numbers into the generator's instructions (kiln rule 11). **high**
- **Version-pinned API notes plus a snippet library** for Blender 5.x (majid's `blender-5-notes.md`, LL3M's BlenderRAG), to cut API-mismatch failures (3DCodeBench). **high**

## 6. Starting from good bases vs generating from scratch (free only)

| Base | Licence | Use | In this container? |
|---|---|---|---|
| Kenney, Quaternius, KayKit (models), Poly Haven (models, HDRIs, scanned textures), ambientCG (textures) | **CC0** ([summary](https://app.cinevva.com/guides/game-assets-guide)) | Kitbash environment props; scanned surfaces → palette-quantised pixel tiles; base meshes | **Yes (since 2026-10-14):** polyhaven.com (+ api/dl), ambientcg.com and kenney.nl return 200 through the proxy. Download assets only (no installers), check each licence file |
| Blender 5.2 as Python module (`pip install bpy`) | GPL (the outputs are yours) | Real modelling ops (remesh, subdivision, curves, skin, booleans, bevels); headless renders (Cycles CPU, Workbench) for gates; GLB export; offline sprite or texture bakes | **Yes** (Cycles CPU; EEVEE needs libEGL) |
| Our own 3D→sprite baker (`src/render/hd2d/sprite.ts`) | project | Keep: same idea as Dead Cells, at runtime | yes |
| Pyxelate / pixelize / pxly | MIT | Image → pixel art with learned palette and dithering (process scans or renders into ramps) | via pip, probably yes |
| TRELLIS.2 (image→3D, MIT) | MIT | A *measuring template* for proportions, not a shippable surface (kiln §7: 191k triangles, wires broke on decimation) | **No.** Needs a large GPU or Apple silicon, and ~31 GB of weights |
| Hyper3D / Tripo / Hunyuan3D cloud | paid or quota | — | no (not free) |

Recommendation: **kitbash and scan first, procedural second, pure from-scratch last.**
- Environment: modular kits (rocks, timber, shelves, foliage) and scanned surfaces, quantised to our ramps.
- Creatures: original designs, so no kitbash, but build them in Blender with real modelling operations from a 2D reference sheet the agent draws first, gated by silhouettes.

## 7. Why Orbkin's current approach plateaued (specific to our code and screens)

1. **All geometry is typed numbers.**
   - `src/render/creatures/designs.ts` (727 lines) builds 18 species from **66 `k.orb` ellipsoids, 20 balls, 20 tubes, 17 limbs, 16 cones, 6 gems, 5 blades, 3 slabs, 3 lathes**.
   - Positions are hand-typed vectors: 87 literal `[x, y, z]` triples like `[0, 0.44, -0.06], [0.24, 0.22, 0.3]`.
   - The agent cannot *see while shaping*. Each fix is a guess-edit-reload of a coordinate, and nothing fuses forms together.
   - Result, visible in `docs/screenshots/creatures/lineup-0-flame.jpg`: faceted eggs plus cone ears plus cylinder legs. Shapes intersect rather than flow (neck/head/chest joins), and spikes are uniform cones.
   - This is the "blobby primitive assembly" failure in §3. 3JSBench and HN describe it for LLM three.js output in general.
2. **One shared vocabulary for every species.** The same `orb/cone/limb` kit means shape language does not vary between lines: fire fox, water otter and rock brute are all "ellipsoid torso + tapered limbs". Species are told apart mainly by colour, which is exactly what majid's lineup gate rejects.
3. **Mirror symmetry by construction (`k.sym`) and static rest poses.** The idle rig adds motion, but the *pose* is a stiff, symmetric toy stance.
4. **Detail is procedural noise.**
   - `src/render/hd2d/textures.ts` paints every surface from fbm fields plus random "chips", "nudges" and cracks (87 rng calls in the file).
   - Measured: meadow detail-uniformity CV is **0.20** (near-uniform busy). Cave focal-versus-surroundings edge energy is 6.5 vs 5.3, so the subject does not outrank the background (`art-direction.md` §4).
   - kiln reached the same conclusion with measurements: noise "reads as a smear" where scans read as material.
5. **No reference-matched, measured gate.**
   - `docs/HD2D.md` "Gaps vs the reference" is a list of adjectives ("busier", "read a bit grass voxel", "grey pillows").
   - Iterations were judged by looking at screenshots. There was no fixed reference camera, no silhouette IoU, no palette or value deltas, and no pairwise blind critic.
   - Both measured skills (kiln, majid) name this as the main source of wasted work.
6. **Composition and art direction were never specified, only the tech.**
   - The HD-2D pipeline (pixel grid, cookie key light, toon sprite bake, bloom threshold, grade) is technically solid and matches the genre recipe.
   - What judges penalise is value grouping, focal contrast, gamut and UI cohesion (`art-direction.md`). Code primitives can't fix that, and Blender won't fix it by itself either.
7. **Iteration is expensive and coupled.**
   - Every visual check boots the game in SwiftShader (230–450 ms/frame on desktop high tier), inside ~8.4k lines of arena code.
   - Asset authoring is entangled with gameplay code, so experiments are slow and the agent tends to make many small parameter tweaks: a local optimum.

**What to keep:**
- the integer pixel grid and texel discipline;
- the live sprite baker with toon bands and outline;
- the light rig, the post chain and the arena registry;
- one draw call per creature, and the vertex-shader secondary motion (it can be re-targeted to skinned GLB meshes or baked to shape keys).

## 8. Implications for Orbkin (actionable)

1. **Create a `graphics-critique` skill** (rubric plus `artcheck.py`, from the art-direction notes) and make it the gate for every visual change. Inputs:
   - fixed capture URLs per arena and layout;
   - reference crops stored privately in the repo;
   - derived images (squint, notan, saliency, palette);
   - 2–4 zoom crops at ≥ 2× nearest upscale;
   - a fresh-context, pairwise, order-randomised critic subagent.
2. **Move creature authoring to Blender (headless bpy in this container), as a gated, measured pipeline** modelled on `blender-image-to-3d`:
   - Brief per species: signature silhouette features, proportions, palette; the battle camera at 30 texels and the menu at 420 px.
   - The agent first draws a **2D reference sheet** (front/side silhouettes plus colour blocks, SVG or canvas) for owner sign-off, because we have no free image generator.
   - Blockout → remesh/fuse → forms → asymmetric pose → colour blocks.
   - Gates: silhouette IoU against the sheet and a cast lineup.
   - Export GLB (≤ 2,500 tris, 1 material with vertex colour or a small palette texture).
   - Load it in the existing sprite baker.
   - A test checks the triangle budget, grounding and one-mesh rule.
3. **Environment: kitbash and scan before procedural noise.** Vendor a curated set of CC0 packs into `game/assets-src/` (Poly Haven, ambientCG and Kenney are now reachable from the container; download assets only, keep each licence file). Then:
   - palette-quantise scanned textures to the arena ramps at TEXEL = 1/16 (Pyxelate-style or a simple ordered dither);
   - replace fbm rock with quantised scans or hand-designed stamp libraries (large lit planes plus a few cracks);
   - gate with detail CV ≥ 0.45.
4. **Fix art direction first; it is cheap and large** (from `art-direction.md`): subject/ground separation, light-shaft discipline, cool shadows, a foreground framing plane, and a world-cohesive pixel UI. Measure before and after with `artcheck.py`.
5. **Process rules for agents working on graphics:**
   - one problem per round;
   - measurements not adjectives;
   - stop after 2 rounds without measured gain and re-plan from the blockout;
   - never put the reference's numbers into the generator's prompt;
   - pairwise blind critique for any "is it better?" decision;
   - log each round's numbers in `docs/DECISIONS.md`.
6. **Budget the verification.** Per the BlenderGym verifier-scaling result, at least half of each iteration goes to capture, crops, metrics and critique.

## 9. Open questions
- Does Blender-modelled-then-baked kin measurably beat the current code-built kin in blind pairwise judging at 30 texels? Run a 2-species pilot: Ashkit and Pebblet.
- Which free CC0 packs fit HD-2D after quantisation? The sites are now reachable, so this can be tested directly.
- Can Workbench or Cycles CPU renders in this container serve as fast enough gate renders (seconds per view)? Benchmark it.
- Can our vertex-shader rig (flap, wag, nod) be driven by Blender-authored weight or vertex-group attributes exported in GLB, keeping one draw call?
- How reliable is a fresh-context Opus critic in pairwise mode on our frames? Measure its agreement with the human judges' scores over 5–10 pairs.
