# Graphics research notes (index)

Research done 2026-10-14/15 to answer one question: what is the best way, using only free
tools, to make Orbkin's graphics look professional to a seasoned game designer? The synthesis is
[`../../GRAPHICS_PLAYBOOK.md`](../../GRAPHICS_PLAYBOOK.md). The working knowledge is encoded as
Claude Code skills in [`/.claude/skills/`](../../../../.claude/skills/) (listed below).

Each note tags its own confidence. Treat the two audits as the tie-breaker: where an audit rated
a claim doubtful, the playbook drops it or says so. All experiments ran in a session scratchpad;
paths to `scratchpad/...` inside the notes are not in the repo.

## Core decisions

| Note | One-line summary |
|---|---|
| [ingame-vertical-slice.md](ingame-vertical-slice.md) | Real-game A/B of the cave frame: the procedural arena beat Blender-authored and CC0-kitbash shells 7/7 (3-0). The construction rules win, not the authoring tool. |
| [agent-visual-method.md](agent-visual-method.md) | How agents produce excellent visuals: reference-first brief, phased gates, measured same-camera comparison, real source material. Why the primitive approach plateaued. |
| [showcases.md](showcases.md) | Verified Claude/Opus graphics showcases (2025-26). The good ones all run a long brief, a screenshot harness and a critique loop. Hype and hidden paid generators are flagged. |
| [frame-architecture-hybrid.md](frame-architecture-hybrid.md) | Built the hybrid frame: a 360p pixel buffer plus device-resolution DoF, bloom and haze. Decision table: hybrid on desktop, low-res grid on phones until benched. |
| [reference-board-measurement.md](reference-board-measurement.md) | Where the fan-art reference comes from, numeric measurements of real HD-2D frames (light colour, chroma, cool share, sharpness bands) and rules for anchor storage. |
| [mobile-perf-budget.md](mobile-perf-budget.md) | Memory bandwidth decides what fits on phones. Native + MSAA blows the bus; per-tier budgets and a two-minute `?bench` protocol. |

## Look and craft

| Note | One-line summary |
|---|---|
| [art-direction.md](art-direction.md) | What an art director checks (reads, value grouping, palette, detail placement) and how an agent can check it with scripts. |
| [hd2d-pixel.md](hd2d-pixel.md) | How HD-2D and pixel-art-in-3D are built (texel grids, sprite billboards, DoF, light) with free tools, plus open reimplementations. |
| [procedural-texturing.md](procedural-texturing.md) | Orbkin's tile painter is already good. The gap is surfaces that follow form (lit caps, contact crevices, shaped cracks). |
| [biome-nature-kit.md](biome-nature-kit.md) | Water, foliage, sky, lava and weather tested in the real arenas. Stepped-clock banded water won blind 4/4 on every view. |
| [non-battle-screens-overworld.md](non-battle-screens-overworld.md) | Title, route map, starter, evolution, catch and location cards. Texel density is not the gap; staging and depth are. |
| [ui-hud-typography.md](ui-hud-typography.md) | HD-2D battle UI, free pixel fonts, frame techniques, a judged UI re-skin A/B and a UI style sheet. |
| [creature-design.md](creature-design.md) | Stylised creature design and modelling: shape language, silhouettes, faces at sprite size, what a script can do, a plan for the 18 kin. |
| [character-animation-craft.md](character-animation-craft.md) | Idle, attack, faint and walk at 28-40 texels; stepped playback against 60 fps tweening; frame-counted references. |
| [battle-vfx-motion.md](battle-vfx-motion.md) | Hit feedback that lands: impact frames, hit-stop, flash, shake. Found the async `return tail` bug that delays hit reactions by about 2 s. |
| [camera-transitions-motion.md](camera-transitions-motion.md) | Whole-frame motion on a 640x360 grid: camera moves without pixel crawl, battle-in transitions, shake, judging motion from video. |

## Tools, pipeline and assets

| Note | One-line summary |
|---|---|
| [lab.md](lab.md) | The full Blender (bpy 5.2.2) to glTF to three r180 chain runs headless here at zero cost, about 15 s per creature. Timings and failure points. Scripts in [lab/](lab/). |
| [blender-llm.md](blender-llm.md) | How people drive Blender with Claude, which modelling strategies avoid "primitive soup", and eight headless experiments. |
| [asset-pipeline.md](asset-pipeline.md) | Blender to glTF to Three.js in detail: real-time modelling, baking, export, glTF-Transform, loading, LODs, atlases, animation. |
| [threejs-render.md](threejs-render.md) | State of the art for three.js r170-r186: colour management, tone mapping, GI, shadows, post, stylised rendering, WebGPU/TSL status. |
| [free-tools-assets.md](free-tools-assets.md) | Free tools and CC0 asset sources with licences and whether they are reachable from the cloud container (Poly Haven, ambientCG, Kenney). |
| [toolchain-bootstrap.md](toolchain-bootstrap.md) | Pinned install manifest, SessionStart hook, portability matrix and the shared "Setup and safety" text for the skills. |
| [local-genai-gpu-node.md](local-genai-gpu-node.md) | Open-weights image and image-to-3D models on the owner's RTX 3090: licences, jail setup, IP drift, an A/B ready to run. Optional, not in the default pipeline. |

## Verification and skills

| Note | One-line summary |
|---|---|
| [judge-calibration.md](judge-calibration.md) | About 790 judge calls: absolute 1-10 scores drift; a blind pairwise judge with canaries against the last accepted frame works. Proposed thresholds failed the reference itself. |
| [human-ground-truth.md](human-ground-truth.md) | An offline blind A/B kit for the owner and what seasoned designers actually look at. Frozen-clock captures exposed wall-clock noise in earlier verdicts. |
| [skills-format.md](skills-format.md) | How Claude Code skills load, trigger and should be written and tested. |
| [skill-pilot-ablation.md](skill-pilot-ablation.md) | The skills trigger 24/24 but do not reliably improve judged taste. So skills ship scripts, gates and budgets, not aesthetic defaults. |
| [audit-1.md](audit-1.md) | First skeptical audit of 159 research claims, with hands-on re-tests. |
| [audit-2.md](audit-2.md) | Second, fresh-context audit of the same claims. It confirmed the `return tail` bug and the wall-clock capture problem and flagged small sample sizes. |

## Skill briefs and pilots

- [skill-briefs/](skill-briefs/): the build briefs given to the cloud sessions for
  `orbkin-render-look`, `orbkin-sprite-creature`, `orbkin-battle-vfx` and `orbkin-blender-forge`.
- [pilots/](pilots/): a few small JPG renders from each skill's pilot run, as evidence of what
  the skill produced. They are not accepted art.

| Skill | Pilot score | What the pilot showed | Renders |
|---|---|---|---|
| [orbkin-visual-gate](../../../../.claude/skills/orbkin-visual-gate/SKILL.md) | 7/10 | Byte-identical repeat captures, self-proving verdicts and controls, $0.33 per run. Still unsealed, and the motion canary is weak. | none (PNG only) |
| [orbkin-render-look](../../../../.claude/skills/orbkin-render-look/SKILL.md) | 7/10 | The tilt band and vignette make a staged diorama, but the delivered strength is too heavy (blur seam, dark corners) and costs frame time. | [pilots/orbkin-render-look/](pilots/orbkin-render-look/) |
| [orbkin-battle-vfx](../../../../.claude/skills/orbkin-battle-vfx/SKILL.md) | 6/10 | Hit timing is fixed (reaction 1 frame after impact) and FX are at sprite texel size. The flash is still a bloom orb and the bolt is weak. | [pilots/orbkin-battle-vfx/](pilots/orbkin-battle-vfx/) |
| [orbkin-art-direction](../../../../.claude/skills/orbkin-art-direction/SKILL.md) | 5/10 | The volcanic grade retune hit its numeric targets but read as a greyer, flatter sidegrade. A global grade cannot fix the real defects in that frame. | [pilots/orbkin-art-direction/](pilots/orbkin-art-direction/) |
| [orbkin-sprite-creature](../../../../.claude/skills/orbkin-sprite-creature/SKILL.md) | 4.5/10 | Motion is better and the process is measurable, but the designed form does not survive the 34-texel bake. Next step: author the sprite first and make the Blender path the default for hero kin. | [pilots/orbkin-sprite-creature/](pilots/orbkin-sprite-creature/) |
| orbkin-blender-forge (not installed) | n/a | Headless bpy asset beside the kit baseline. The skill was refused at install review because of an apt install step. Its brief is in skill-briefs/. | [pilots/orbkin-blender-forge/](pilots/orbkin-blender-forge/) |
