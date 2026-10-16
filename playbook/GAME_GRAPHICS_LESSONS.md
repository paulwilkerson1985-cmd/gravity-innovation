# Game graphics: lessons that carry to the next project

Written from the Orbkin build (October 2026), which was used as a testing ground for making polished browser-game graphics with Claude, free tools and no paid assets. Everything here is project-agnostic. Orbkin-specific detail lives in `game/docs/GRAPHICS_PLAYBOOK.md`, `game/docs/research/graphics/` and `.claude/skills/orbkin-*`.

Read this before starting the art of any new game. The headings are ordered by how much time each lesson would have saved.

## 1. Settle the art direction with the owner first, by blind vote, before polishing anything

- **What happened.** Days went into polishing an HD-2D pixel-art look matched to a reference image. When the owner later saw a polished competitor and then blind-voted four creature styles, the pixel style lost every comparison (0-12). The smooth, Blender-modelled toon style with ink outlines won. Then smooth arenas beat pixel arenas 10-0.
- **What to do instead, in week one:**
  1. Make a **style bake-off**: the same 2-3 characters rendered 3-4 genuinely different ways (for example current, cel-shaded 3D, hand-authored vector, Blender toon). Use the same design sheet for every version, so only the style varies.
  2. Build a **blind owner vote page**: one pair at a time, randomised left/right, with a "no difference" option and copy-out JSON results. It takes about 3 minutes for the owner. Template: `scratchpad`-style pages built during Orbkin; the structure is simple enough to rebuild in minutes.
  3. Take the top two styles into an **in-game runoff**: real scenes, desktop and phone, and both "world" options (e.g. pixel vs smooth environments). Static art in a scene can look pasted on; only an in-context test shows it.
  4. Only then build pipelines and polish.
- **Taste forks belong to the owner.** AI judges flip their verdict when a reference image is shown, and split on things like depth of field, UI style and sprite density. Use AI judges for regressions and defects, and the owner's blind vote for direction.

## 2. Where a "polished" look actually comes from

Breaking down a polished browser creature-battler frame by frame (the video the owner shared):

- **About 80% is character and creature art quality**: clean, high-resolution, outlined cartoon art with appealing shapes. In that game it was borrowed franchise art; ours must be original, which is the hard part.
- **Then cohesive, readable UI**: one panel family, one type family, clear chips and bars.
- **Then juice**: VS splash screens, evolution flashes, boss intros, hit timing.
- **Environments can be simple** (flat hex boards, low-poly crystals, a strong colour per stage). Detailed environments do not rescue weak characters.

So spend effort on characters first, UI second, motion third, environments last.

## 3. AI judging: what works and what doesn't

- **Absolute 1-10 scores are noise.** Don't gate on them.
- **Blind pairwise judging works** when it has all of these:
  - at least 3 fresh-context judges;
  - left/right order randomised, and each pair run in both orders;
  - a calibration "canary" pair per session (a known-worse copy, e.g. blurred or with anticipation removed) that must be told apart;
  - "no detectable difference" as a first-class outcome;
  - a decisive rule (e.g. 3/3 votes, confidence at least 3, score gap at least 0.75).
- **Judge at native resolution and include crops.** Full frames hide close-up problems. The live 3D creature won full frames and lost 15/16 close-up crops.
- **Motion is judged from frame strips** (every 1-2 frames, attacker only), plus measured timings.
- **Captures must be deterministic**: frozen clock, same seed, same game state, so both sides of a pair differ only in the change being tested.
- **Measured defects don't need votes.** Late hit reactions, half-closed blinks, pixels sliding during camera pans and text below a size floor are fixed on numbers.

## 4. Technical findings that will repeat

- **Headless Blender works with no install pain**: `pip install bpy==<version>` (pin it; it needs the matching CPython). Cycles on CPU renders fine; EEVEE/Workbench need EGL/GPU, which cloud containers lack.
- **A good toon creature recipe in Blender**:
  1. metaball/SDF blockout;
  2. voxel remesh;
  3. Boolean-union the parts, so part junctions become ink creases;
  4. vertex-colour zones;
  5. an emission toon ramp (2-3 flat bands);
  6. Freestyle ink;
  7. Cycles with low samples, denoise and zero bounces.

  About 45 s per 1024 px render.
- **Real-time toon shading in Three.js did not match the Blender render.** A live rigged GLB with a toon shader and outline lost to the static Blender image twice: it read as glossy plastic with a thin, soft ink line. For an illustrated finish, **pre-render animation frames from Blender into sprite sheets** (front and back views, idle/attack/hit/faint) and play them as full-resolution sprites. This is the classic pre-rendered-sprite approach.
- **Anatomy needs an explicit checklist** (owner request):
  - eyes placed and spaced on the face's front planes, symmetric;
  - a nose at the muzzle tip and a readable mouth;
  - both ears readable in the game camera;
  - limbs attached at believable shoulders and hips;
  - paws planted on one ground plane;
  - room clear of other characters.

  Check front, 3/4, side and back renders before accepting any character.
- **The player's own creature should show its face.** A true back 3/4 view hid the face, put the near eye on the outline and merged the near ear, and it lost every in-battle comparison. Use a camera only about 10–15° behind the side, as genre references do.
- **Back views matter.** The player's own creature is seen from behind most of the time. Give it markings and shape interest from the back, and match the back camera to the real battle camera.
- **Battle feel**: the target must react on the impact frame. A promise/await bug delayed hit reactions by 1.7-2.1 s and was the cheapest big win. Use a directional, integer-pixel camera kick instead of a jittery shake, attack key poses sized in visible units, and drawn hurt frames.
- **Procedural code-built environments beat CC0 kit-bashes and Blender-authored shells** for a stylised look, when built with good rules: aligned courses, texel-consistent UVs, baked AO, and value rules by height. CC0 photo scans only help when mapped to the palette.
- **Pixel art and smooth art don't mix casually.** Smooth creatures on a pixel world can work as a layer drawn at device resolution, but the owner preferred smooth everywhere. Pixel-grid textures look blurry when filtered at native resolution, so a smooth world means repainting textures.
- **UI rules**:
  - one panel material across the whole game;
  - fonts follow the panel family (never pixel fonts on smooth panels);
  - UI must not be the brightest thing on screen;
  - text-size floors (about 7 CSS px x-height on desktop, 18 device px on phone);
  - contrast at least 4.5:1;
  - labels on one line;
  - touch targets at least 44 px.
- **Performance**: smooth native-resolution rendering cost 6x (desktop) to 13x (phone) the frame time of a 640x360 pixel buffer in the software renderer. Plan quality tiers and measure on a real phone before committing.

## 5. Process and infrastructure

- **Research must be bounded and tied to in-game tests.** The 24-angle research was valuable mainly where it ran A/Bs in the real game (it killed a costly Blender-arena rewrite). Broad reading produced process skills, not taste. Next time, cap research and move to style bake-offs sooner.
- **Skills encode process well** (capture, gate, budgets, safety), not taste. Keep them short (under ~4k tokens) and pilot-test each with a fresh agent that reads only the skill.
- **Cloud container limits to plan around**:
  - 4 CPU cores;
  - a fixed disk allowance that fills up (clean research leftovers early);
  - containers restart;
  - 5-hour, weekly and per-model (Fable) usage limits.

  Make long jobs resumable: workflows resume from cache. Commit work in progress, and keep work in git worktrees per parallel agent.
- **Parallel capacity**: one workflow runs about 2 local agents on 4 cores. Add cloud sessions (each has its own container) for CPU-heavy work like Blender renders and Playwright captures.
- **Model use**: Opus for building; Fable for high-judgement review (art direction, security, final decisions) when its quota allows.
- **Security baseline for every repo**:
  - a root `CLAUDE.md` with supply-chain and credential rules;
  - `.claude/settings.json` deny rules;
  - no binaries from the web without owner approval;
  - packages pinned and justified;
  - agents never run apt or sudo;
  - local test servers bind 127.0.0.1 and refuse paths outside their folder;
  - review every agent-written script before installing a skill.

## 6. Owner preferences (Paul)

- Wants polished, professional graphics that would impress a seasoned game designer, using **free tools only** (the Claude subscription is the only cost).
- Chose by blind vote:
  - **smooth Blender-toon creatures with ink outlines**;
  - **smooth (non-pixel) environments**;
  - the **dark translucent "slab" UI** with Alegreya fonts.
- Pays attention to **anatomy and facial detail** (eye placement, nose, mouth, limbs).
- Values **security** very highly. Treat Claude as the last line of defence; never expose credentials or run untrusted code.
- Prefers **fast iteration with visible results** over long research; likes deploying many agents and cloud sessions in parallel.
- Uses Grok to find references and X posts. X links can't be fetched from the cloud container, so ask for the video file or screenshots instead (ffmpeg is available for frame extraction).
