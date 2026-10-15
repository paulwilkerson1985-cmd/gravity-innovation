# Non-battle screens: title, route maps, starter pick, evolution, catch, location cards

Angle: HD-2D craft for the screens a designer sees *before* the first battle, which no earlier note studied. These are the
title screen, the overworld route maps, the starter pick, the evolution and catch cinematics, and the "location discovered"
card. Earlier notes covered only the battle frame.

Date: 2026-10-14. All experiments ran in a scratch copy of the game (`scratchpad/nbs/game`, a `git archive HEAD` export with
`node_modules` symlinked). The game repo was never modified.

Scratch layout (all paths are under `scratchpad/nbs/`):

| Path | What |
|---|---|
| `game/` | Scratch game. Adds a `?freeze=T` time-freeze hook and `?xp=` experiment flags (diff in §6.1) |
| `cap.mjs`, `caplogo.mjs` | Capture scripts: desk 1280×720 at `q=high`; phone 393×851 at DPR 2.75 at low tier. Each frame is saved as `.png` (with UI) and `.clean.png` (UI hidden) |
| `shots/` | Every frame. Contact sheets: `summary_before_after_desk.png`, `route_variants_desk.png`, `title_evo_variants_desk.png`, `phone_variants.png`, `round2.png`, `hd_sim_sheet.png` |
| `judge/screen_judge.py` | Blind pairwise judge for non-battle screens: full frame plus an optional element crop |
| `judge/readability_probe.py` | Exploration "5-second test" probe |
| `judge/*.json`, `judge/*.log` | 31 verdicts, every vote with its reason. Total cost $6.20 at list price |
| `scripts/screen_metrics.py` | Depth-of-field band profile, notan, L\*, chroma and cool-share metrics |
| `scripts/hd_tilt.py` | Offline simulation of a device-resolution smooth tilt-shift |
| `scripts/pixel_logo.py` | Code-drawn pixel wordmark that writes PNG and SVG |
| `logo/` | Logo outputs |
| `pe/` | pokeemerald sources read for timings |
| `gh/` | Lyall's OctopathFix and Octopath2Fix clones |
| `pp/` | `postprocessing@6.39.5` tarball, read and not installed |

---

## 0. TL;DR

1. **Where Orbkin stands (measured).**
   - The route map's sprite and ground texels are both 2 device px at 720p, which is **1/360 of frame height**. Octopath's
     field camera measures **1/315**. The battle texel is 1/180, against Octopath's battle 1/135–1/218.
   - So the map-to-battle texel ratio is 2.0, against about 1.4–2.3 in Octopath, and **texel density is not the gap on the
     map either.**
   - The gaps are composition, value structure and depth hierarchy:
     - The route map is a light-dominant pastel sky frame: notan 0.09/0.20/0.71, L\* 69. Octopath field shots are
       dark-dominant: notan median 0.51/0.33/0.14, L\* about 36.
     - The island fills only about 45 % of the desk width.
     - Nothing sits in front of the playfield.
     - The title and starter frames are uniformly sharp and busy: their DoF profile stays at 0.6–1.0 in every band.
2. **Blind pairwise results.** 31 verdicts, fresh tool-less Opus, both orders × 2, canaries passed 4/4. Wins:
   - **Title tilt-shift band** (`ttilt`): *better* on desk and phone (4/4 each). The focal crop is unchanged, so this is a
     pure depth-hierarchy gain.
   - **Pixel wordmark logo v2**, drawn in code (solid ink plate, banded ramp, orb gem inside a legible O): *better* on desk
     (full 4/4 and crop 4/4) and on phone (4/4) against the current CSS-text logo.
   - **Starter tilt-shift band** (`stilt`): *better* on desk (full 4/4 and crop 4/4) and on phone (4/4).
   - **Route map: tighter "field" camera + blur only on sky and underside** (`cam+tilt2`: FOV 26°, pitch 30°, island about
     70 % of width): *better* than the current map on desk (4/4).
   - **Evolution push-in that keeps the window light in frame** (`epush2`): *better* on phone (4/4), 3/4 on desk
     (no_difference).
3. **Failures that became rules.**
   - **Tighter route framing loses on phone (0/4)**: "crops trees, crowds the panel, no breathing room, lost the sun
     shafts". It also cut the flower-patch hotspot out of the desk frame (readability probe recall 1.0 → 0.75).
   - **Blur on the subject loses.** Element crops punished a low-res tilt that reached the island's top trees ("mush", 0/4).
   - **Near-camera foreground clouds lose.** "Inconsistent, softer pixel scale", "reads as a rendering bug". Their texels were
     3–5× the sprite texel.
   - **Evolution push-in that cropped out the window loses on phone (0/4)**: "lost the motivated light, flat, cramped".
   - **Low "key-art" title camera into the flower field loses (0/4)**: oversized blurry foreground buries the trio.
   - **Logo v1 loses on phone (0/4)**: an orb that *replaces* the O reads as "RB KIN".
4. **Smooth device-resolution blur vs low-res pixel blur: no difference.** Tested on the title (desk and phone) and the route
   (desk and phone). Both beat no blur on the title. So on these screens it matters *where* the blur falls, not *how* it is
   computed. This is evidence on the open native-vs-low-res question; the full hybrid still needs its own test.
5. **Sequences, from primary code (pokeemerald).**
   - **Title:** logo shines at 1.3 s and 3.2 s, the banner fades in 2.4 s later, then "PRESS START" blinks with a
     0.53 s period. Any button skips.
   - **Evolution:**
     - Background fades to black.
     - Sparkle choreography: spiral up 2.7 s, arc down 1.6 s.
     - The swap of the two white silhouettes is a **scale cross-swap, not an on/off flash**: 60 swaps in 5.8 s, each
       swap's speed growing from 24 frames to 2 frames.
     - Circle-in 0.8 s, then a white-out flash and spray 2.1 s.
     - Reveal with the cry and the "evolved" jingle.
   - **Catch:** about 1.0 s per shake (31-frame rest + ~30-frame roll). The click at +40 frames darkens the ball and bursts
     stars; the jingle starts at +95 frames and holds until +315 frames.
   - **Map-name pop-up:** 0.5 s delay, 0.33 s slide in, 2.0 s hold, 0.33 s slide out, framed in a per-area theme (wood,
     marble, stone, brick, underwater).
   - **Orbkin today:** the evolution flicker already follows Emerald's rhythm (520 ms ×0.84 down to 55 ms). The catch shakes
     are faster (0.64 s/shake). There is no darkening, no camera beat and no location card.
6. **What HD-2D developers said (UFE 2018 talk via secondary reports, medium confidence).**
   - The Octopath prototype used a normal 3D FOV and looked "not 2D". They **narrowed the FOV to flatten perspective**.
   - They stepped maps so that **"the back is higher"**, which raises screen density.
   - They kept **dark areas textured**.
   - **Indoor scale is half the outdoor scale**, with camera distance changed at the same moment so that characters keep
     their screen size.
   - The prototype had *deep* DoF; the final game uses a shallow focus band.
   - DQ3 HD-2D uses **no pixel art in backgrounds** (Siliconera interview).
7. **Which screens are DOM and which are 3D.**
   - **3D canvas through the HD-2D pipeline:** every scene's set, sprites, gems, "!" and ✓ badges, evolution rays, sparkles
     and bursts.
   - **HTML over canvas (`ui/dom.ts` `h()`):** the logo, tagline, every button and menu, route tabs and hotspot buttons,
     the starter panel, the evolution text box and its white flash (`.evo-flash`), and the scene transitions
     (`#curtain`, CSS `steps()`).
   - So the **logo and the transitions are DOM work**, while the depth hierarchy and the cameras are 3D work.

Implications for Orbkin (short): see §7 and the per-screen style sheet in §8.

---

## 1. Current state: captures and measurements

### 1.1 Captures
- Desk: 1280×720 at `q=high`, internal 640×360.
- Phone: 393×851 at DPR 2.75, low tier, internal 271×586.
- Seed 5, `?freeze=3`: scene time is pinned, so every variant has identical dressing, foliage sway and camera drift. This is
  the "frozen dressing" condition.

| Screen | Desk calls / tris (high) | Phone calls / tris (low) | First impression (my read) |
|---|---|---|---|
| Title | 44 / 41k | 37 / 28k | Busy flower field, uniformly sharp from edge to edge. The trio is small (≈ 14 % of height) and centred, under a logo that is plain UI-font text with CSS text-shadow. **Phone shows a stray grey object with a black stripe on the path in front of the trio.** A judge also noticed it ("the stray mid-path artifact"). Unidentified, to investigate (crop: `shots/artifact_crop.png`) |
| Starter (chosen) | 52 / 39k | 43 / 26k | Good diorama: daises, shafts, chunky near grass. Mid-band is clear; the foreground is busy |
| Route meadow | 52 / 46k | 41 / 18k | Floating island, about 45 % of desk width, in a pastel sky with cloud sea. Pitch about 39.5° (`dir (0, .66, .8)`), FOV 40°, panel over the bottom third. Reads as a level-select board piece |
| Evolution | 30 / 8k | 27 / 5k | Ashkit about 8 % of frame height, on a plinth, in a dim room. Smooth vector starburst rays. Lots of empty floor |

### 1.2 Metrics (`scripts/screen_metrics.py`)
- Frames are resampled to 640 px wide, with the UI hidden.
- DoF: 12 bands, sharpness = `mean|L−G1| / mean|L−G4|`, relative to the maximum.

| Frame | DoF profile (top → bottom) | Notan D/M/L | L\* | C p95 | Cool share |
|---|---|---|---|---|---|
| Title base | .61 .69 .86 .97 1 .97 .98 .99 .93 .88 .83 .72 | .66/.25/.09 | 29 | 51 | .11 |
| Title `ttilt` | .33 .34 .62 .95 1 .97 .98 .99 .86 .52 .33 .30 | .70/.22/.08 | 27 | 50 | .10 |
| Route base | .81 .80 .91 1 .93 .80 .72 .71 .56 .58 .61 .51 | **.09/.20/.71** | **69** | 32 | .39 |
| Route `cam` | .68 .83 .91 .94 1 .79 .91 .80 .76 .71 .65 .43 | .26/.26/.48 | 56 | 40 | .31 |
| Route `cam+tilt+fog` | .37 .40 .67 .94 1 .78 .91 .81 .75 .54 .30 .26 | .24/.34/.42 | 56 | 39 | .28 |
| Starter chosen | .70 .98 1 .98 .93 .92 .88 .87 .82 .84 .73 .67 | .47/.28/.25 | 41 | 44 | .11 |
| Evolution base | .36 .48 .65 .69 .67 .75 .87 .86 1 1 .96 .84 | .81/.17/.02 | 20 | 19 | .49 |
| OT bg1 village (field) | .63 .66 .71 .77 .86 .86 .94 **1** .71 .59 .46 **.26** | .51/.36/.13 | 36 | 39 | .00 |
| OT bg4 desert (field) | .58 .49 .53 .50 .80 **1** .93 .92 .59 .42 .35 **.27** | .30/.34/.36 | 51 | 46 | .01 |
| OT bg5 canyon (field) | .46 .47 .58 .70 .66 .67 .83 **1** .67 .50 .46 **.31** | .59/.37/.05 | 30 | 32 | .35 |
| OT bg9 cliff town | .65 .62 .68 .92 .96 1 .98 .94 .87 .87 .79 .80 | .67/.24/.09 | 27 | 41 | .17 |
| OT bg7 misty town | .42 .58 .73 .73 .81 .82 .95 1 .85 .84 .85 .76 | .42/.43/.15 | 40 | 20 | .24 |

Reading:
- **Octopath's field focus band sits *below* the frame centre, at 0.5–0.67 of the height**, where the party stands. It
  falls off hard to the bottom (0.26–0.31) and less to the top (0.42–0.65).
- Orbkin's title and starter are flat from top to bottom.
- The route map's bright sky makes it the value outlier among all Orbkin screens and against every Octopath field shot.
  Octopath fields have **no sky at all, or a thin strip**: terrain fills the frame up to the top edge (see the contact sheet
  `refboard/thumbs/emorque_bgs.png`). HD-2D's field signature is "inside the world, looking down at a stepped diorama whose
  back is higher", not "an island floating in the sky".

### 1.3 Texel density: map camera vs battle camera
| | Sprite texel on screen | Env texel on screen | Frame height in texels | Person height |
|---|---|---|---|---|
| Orbkin route map (desk) | 2 px (1 internal) | 2 px (`MT = TEXEL/2`) | **360** | ≈ 29 texels, ≈ 8 % of height (hero; 4× crop `shots/route_hero_crop.png`) |
| Orbkin battle (desk) | 4 px | 4 px | 180 | 31–42 texels (reference-board §3.1) |
| Octopath field (store 4K) | 7.17 px | 7.16 px | **315** | 32–34 texels, 10.3 % of height |
| Octopath battle/victory | 5–8 px | — | 135–218 | 31–35 texels, 15–24 % of height |

Rules:
- **Keep env texel = sprite texel in the focus band at every camera**, which the 22 texels/m rule enforces in world space.
- In the `cam` experiment the island was framed tighter but still painted at `MT`. The ground texels grew to 2–3 internal px
  while the sprites stayed at 1 (`shots/texel_cmp.png`).
- Judges flagged exactly that on phone: "resampled, soft, mixed-resolution sprites".
- **Whenever a screen's camera distance changes, recompute the ground texel from the camera.** `MT` = world size of one
  internal pixel at the focus distance. The `px` that `Hd2dScreenStage` already computes in `hd2dScreen.ts:111` is that
  value; painters must take it as an input. The alternative is to quantise zoom to integer multiples.

---

## 2. HD-2D overworld composition (the "signature")

### 2.1 What the developers said (Unreal Fest East 2018, Acquire, "Nintendo Switch『OCTOPATH TRAVELER』はこうして作られた")
Sources:
- slides on [Docswell](https://www.docswell.com/s/EpicGamesJapan/KXPWY5-UE4_UFE2018_ACQUIRE_OCTOPATHTRAVELER) and
  [SlideShare](https://www.slideshare.net/slideshow/nintendo-switchoctopath-traveler/119821741);
- reports on [AUTOMATON](https://automaton-media.com/devlog/report/20181023-78326/),
  [Business 4Gamer](https://business.4gamer.net/article/1810/18101801/),
  [i-mezzo](https://www.i-mezzo.net/log/2018/10/24085339.html/49961/) and the
  [UE blog](https://www.unrealengine.com/blog/report-unrealfesteast2018?lang=ja).

All of these are blocked here, so the details below come from extended-search summaries of them. **Medium confidence.**

- Prototype camera = normal 3D settings, so the "field of view was too wide and didn't feel 2D". → **"画角を狭く調整し，パースを緩やかにした"**
  (narrowed the FOV, gentler perspective).
- The slides list three causes of "scale feels wrong": **1. a wide FOV, 2. houses at the same scale as people, 3. too
  little height difference.**
- Maps were built in steps with **the back higher (段状に奥を高く)** to raise screen density. This is why Octopath field shots
  have no sky.
- **Lighting keeps textures readable in dark areas** (暗いところもテクスチャが見えるライティング).
- **Indoors, the scale halves at the door**, and camera distance changes at the same moment, so a character's screen size
  never jumps.
- **The prototype had deep DoF ("near and far dots crisp")**. The final game moved to a focus band. The talk also lists DoF
  and lens flare among the post effects considered.
- Field camera: a remaining hitch while the camera moves on the field was "a little noticeable".
- In battle the camera is diagonal and keeps swaying slightly, with authored camera moves on Boost and abilities.
- My geometric estimate from the store shots:
  - floor texel aspect 3.24/7.16 gives a camera elevation of about asin(0.45) ≈ **27°**;
  - sprite aspect 0.95 is consistent with upright cards and a pitch of about 18°.
  - **Field pitch ≈ 20–30°, narrow FOV** (low confidence on exact numbers).
  - Orbkin's map uses 39.5° and FOV 40°.

**DQ3 HD-2D is the counter-example.** Its producer says backgrounds use **no pixel art**; only characters and monsters are
pixel sprites. The team chose to "go a different direction" from Octopath and Triangle Strategy
([Siliconera](https://www.siliconera.com/interview-preparing-a-hd-and-2d-dragon-quest-iii-remake/),
[Digital Trends](https://www.digitaltrends.com/gaming/dragon-quest-3-hd-2d-remake-interview-save-state/), via search
summary; medium). So "HD-2D" does not require pixel-textured environments. Orbkin's crisp pixel-textured sets are the Octopath
branch.

**Cassette Beasts** (Bytten devlog "Technical Look: The Park", via search summary; medium):
- 3D (2.5D) world with a fixed camera angle and grid terrain, so maps are designed like a 2D top-down game;
- 16×8 chunks of 32×32 tiles;
- tiles modelled as voxel/Blender meshes in a GridMap;
- billboard sprites.
- Its art director calls the look "GBA HD" ([Pocket Tactics](https://www.pockettactics.com/cassette-beasts/interview)).

### 2.2 Perception: why tilt-shift reads "miniature"
- Held, Cooper, O'Brien and Banks, "Using Blur to Affect Perceived Distance and Size", *ACM TOG* 29(2), 2010
  ([ACM](https://dl.acm.org/doi/abs/10.1145/1731047.1731057), [PubMed](https://pubmed.ncbi.nlm.nih.gov/21552429)).
  - Blur magnitude together with relative-depth cues sets perceived absolute scale.
  - A **linear vertical blur gradient ≈ a simulated tilt-shift lens**. Both diverge from depth-consistent blur where objects
    protrude from the ground plane (buildings; for us, trees, the cave mound and people).
  - Later work: the tilt-shift's exaggerated vertical gradient makes ground-plane scenes look nearer, and therefore smaller
    ([PLOS One 2023](https://journals.plos.org/plosone/article?id=10.1371%2Fjournal.pone.0285423)).
  - Medium confidence: abstracts and search summaries only; the PDFs are blocked.
- **Consequence for us:**
  - a screen-space band works on ground-plane content (flower fields, the clearing floor);
  - it breaks on tall things that cross the band edge: trees at the top of the island were blurred, and crops punished it.
  - Either keep tall subjects entirely inside the band, or move to depth-aware blur (three's `BokehPass` or a custom
    CoC from depth).

### 2.3 Layered depth recipe (what to put where)
| Layer | HD-2D practice | Orbkin now | Do |
|---|---|---|---|
| Foreground occluders | Blurred, dark, out-of-focus near objects at the frame's bottom/side edges (Octopath bg1 foliage, bg5 ledge, victory frame) | Title: near flora (sharp). Route: none. Experiment: near clouds, which lost | Use **darker, desaturated, blurred** occluders at **the same texel density as the set** (paint them at the texel their depth needs), only at the frame edges, never crossing hotspots. Never a big flat shape with big texels |
| Playfield (focus band) | Crisp, brightest values and highest local contrast; characters at 10 % of height | Mostly fine | Put the band at **0.45–0.70 of the height on title, starter and field** (Octopath measured 0.5–0.67), and size it to the subject's vertical extent |
| Mid back | Stepped terrain rising toward the top edge, slightly hazed | Route: island edge, then sky | For "inside" maps, stepped back terrain up to the top edge. For the island concept, put the far islands and cloud banks there |
| Far painted / fogged | Haze, desaturated, low contrast (bg3 harbour, bg7 misty town) | Posterised sky + cloud banks | Fog the far layer toward the sky colour. Distance should raise L\* and lower chroma and contrast |

### 2.4 Parallax
- With a fixed camera, parallax only appears when the camera moves.
- The title already drifts ±0.55 units, snapped to whole texels (`hd2dScreen.drift`). This is the right technique.
- The route map is static; a ±0.2-unit idle drift would make its depth legible.
- Pixel crawl under camera motion belongs to the motion angle. Drift must stay quantised to whole texels at the focus depth,
  which is already done.

---

## 3. Exploration readability: walkable vs blocked, hotspots, encounter zones, the avatar

### 3.1 What exists
- The route map is a **hub/node map**, not a free-roam field: tap a hotspot (or its HTML button) and the hotspot wiggles for
  600 ms, then the battle starts.
- Signals:
  - 7–9-texel gem markers bob over wild spots;
  - "!" / ✓ badges sit over trainers;
  - trainer pads are red or green;
  - dirt paths run from the player to every spot;
  - the HTML buttons carry the labels.
- **There is no walking avatar.** The hero stands still and glides, with no walk cycle (character-animation-craft).

### 3.2 Readability probe (new tool, `judge/readability_probe.py`)
- A fresh judge sees only the clean frame and lists interactables with their positions, then picks "go first".
- Results:
  - **Base desk and phone: recall 1.0.** All four of grass, flowers, cave and trainer were found 3/3. The player was located
    correctly, and "go to the '!' NPC first" came up every time.
  - **`cam` desk: recall 0.75.** The flower patch was never found because the tighter framing pushed it under the panel or
    out of frame.
- **Lesson:** a framing change must keep every hotspot inside the free area. Add the hotspot points to the `fitPoints`
  set, not just the island box.
- Limitation: keyword scoring is lenient. It is a regression guard, not a quality score.

### 3.3 Design rules (from Pokémon decomp data plus general level-design practice)
| Signal | Primary data | Rule for Orbkin |
|---|---|---|
| Encounter zone | pokeemerald tall grass: the rustle field effect is 5 cels × 10 frames (0.83 s) on every step (`field_effect_objects.h` `sAnim_TallGrass`) | Wild patches are **taller, darker and more saturated grass than the lawn**, with a 1-texel dark base line and idle sway that is stronger than ambient grass. A 4–5-cel rustle (≈ 0.8 s) when the avatar enters or the spot is hovered |
| Item / secret | Sparkle: 6 cels × 8 frames (0.8 s loop) | A 3–5-texel pixel sparkle on loop, never a vector glint |
| Water | Ripple: 7 cels, 9–12 frames each | `pixelWater` ripples already exist. Make the lagoon spot ripple when hovered |
| Trainer | "!" bubble (exists) | Keep the "!". Grey out beaten trainers' **sprite** too, not just the badge and pad (HD2D.md gap) |
| Walkable vs blocked | (general practice, low-medium) | Walkable = the lighter, lower-contrast path value with soft edges. Blocked = dark rim, ledge lip or fence with a 1-texel shadow line. Paths must stay inside the focus band and never be blurred |
| Hover / selected | — | On hover or keyboard focus, show a 1-texel ground ring in the accent colour plus the bobbing gem. The HTML button highlight must mirror it (two-way link) |

### 3.4 Walking avatar (spec; motion cannot be judged on frozen frames)
- **Tap a hotspot.** The hero walks the dirt path (polyline from the painter's path graph) at about 2.2 units/s, then faces
  the spot.
- **Walk cycle (character-animation-craft numbers):**
  - 6 cels at 10 fps (0.6 s cycle), or Emerald-style 4 cels at 7.5 fps;
  - 1-texel body bob;
  - arms opposite the legs;
  - 1-texel contact shadow.
- Tall grass rustles when entered, then a 0.5 s pause, then the battle transition (`#curtain.battle`).
- Keyboard and touch go through the same path. Skip if `animClock.instant`.
- **Reduced motion:** teleport plus the rustle only.

---

## 4. Title screen and logo

### 4.1 Pokémon Emerald title timeline (primary: `pret/pokeemerald` `src/title_screen.c`, read in full)
Frames at about 59.73 fps.

| Phase | Frames | What |
|---|---|---|
| 1 | 256 (4.3 s) | Logo shown. **Shine sweeps** (a sprite moving 4 px/frame across 272 px ≈ 1.1 s): a **double shine at frame 80 (1.34 s)** and a **single shine at frame 192 (3.2 s)**. During the sweep the background brightens, then darkens, with a 4-frame green flash at centre |
| 2 | 144 (2.4 s) | Version banner fades in by alpha table and slides 2→66 px down. Logo slides up |
| 3 | until input or music end | "PRESS START" toggles every 16 frames (0.27 s on / 0.27 s off). Clouds (BG1) scroll at 0.5 px per 2 frames. The legendary's markings pulse colour every 4 frames on a cosine. At the end of the music it returns to the intro |
| Skip | — | Any of A/B/Start/Select jumps to the next phase at any time. Start fades to white (`RGB_WHITEALPHA`) and the BGM fades out |

Take-aways:
- **The logo performs** (shine sweep).
- **There is exactly one hero silhouette**, the version legendary, plus ambient motion (clouds).
- The prompt blinks at about 2 Hz.
- Everything is skippable.
- The total time to "interactive" is about 6.7 s, but input works from frame 1.

### 4.2 Our experiments
- **`ttilt`** (title grade: `tiltTop 3.6 @ focusTop 0.6`, `tiltBottom 3.6 @ focusBottom 0.36`, vignette 0.6; low tier uses
  the full radius):
  - better desk 4/4 and phone 4/4;
  - judges: "uniformly sharp foliage is busy and competes with the UI", "tilt-shift isolates creatures and menu";
  - crop of the trio region: no difference, so the focal art was untouched.
- **`tkey`** (camera pitched down 12°, as low as possible for a lineup against the vista): worse 0/4. The near flower beds
  became huge, coarse-texel blobs that buried the trio.
  - Lesson: a **low key-art camera needs a cleared foreground** (a knoll or a path), or the trio must stand on raised
    ground.
  - Near-camera billboards show the texel-density problem from §1.3.
- **Logo v1** (code-drawn pixel wordmark, the O replaced by an orb with an orbit ring): crop better 4/4, full frame split,
  phone worse 0/4 ("reads as 'RB KIN'", "smaller").
- **Logo v2** (`logo/logo2.png`): a legible O whose counter holds a cyan orb gem, an amber/sky two-word split, a 3-tone
  top-lit ramp, a 1-px inner highlight, a 2-px ink outline forming a **solid backing plate**, and a hard drop shadow, at the
  old logo's height:
  - **better** desk full 4/4 and crop 4/4, phone 4/4;
  - judges: "framed, shaded logo with orb motif reads as a finished brand mark; B's flat lettering feels placeholder",
    "hollow letters show background noise through counters".
  - Legibility check: "ORBKIN" at confidence 4 (old: 5).

### 4.3 Logo craft rules (derived plus tested)
1. **A logo is a drawn mark, not typed UI text.** Use custom letterforms on a pixel grid at an integer scale. Give it 3–4
   ramp tones per word colour, a lit top edge, an ink outline that becomes a **solid plate** (no see-through counters over
   busy art), and a hard shadow.
2. **The emblem joins the name, never replaces a letter** (v1 failure). Put the orb inside the O, behind the wordmark, or as
   a separate crest.
3. **Size ≥ 27 % of frame width on desk and ≥ 55 % on phone**, at the top third with breathing room. Never shrink it to fit
   a tagline.
4. **Motion:**
   - one shine sweep (diagonal band, 4 internal px/frame ≈ 1 s) about 1.3 s after load, then every 6–8 s;
   - optional "breathing" glow on the gem;
   - all of it skippable and off under `prefers-reduced-motion`.
5. **Implementation:**
   - author the mark as a bitmap (like `tools/pixelfont/glyphs.ts`, or `scripts/pixel_logo.py` here), and emit SVG with
     `shape-rendering="crispEdges"` (one `<rect>` per run, 271 rects) **and/or** a PNG at 1×;
   - display it with `image-rendering: pixelated` at an integer CSS scale;
   - the shine is a CSS `mask` or `background-clip` sweep in `steps()`, or a canvas draw.
6. **Free tools:**
   - Inkscape (GPL) to edit the SVG;
   - Pixelorama (MIT) or LibreSprite (GPL) for pixel touch-up (Aseprite binaries are paid);
   - Pillow or numpy in Python, or code, for generation.
   - `@resvg/resvg-js` 2.6.2 (MPL-2.0) can rasterise SVG at build time if needed. It is a new dependency, so it needs a
     DECISIONS entry. Code-generated PNG avoids it.
7. **Fonts:**
   - OFL fonts *may* be used in logos and converted to outlines. The artwork is ours, attribution is appreciated but not
     required, and Reserved Font Names matter only if the font itself is modified and redistributed
     ([OFL FAQ](https://tug.ctan.org/fonts/gentium/OFL-FAQ.txt)).
   - Our own Orbkin Pixel font is project-owned, so it is the safest base.
   - Trademark is the remaining risk: check that the name and mark are not confusable with existing marks.
8. **IP hygiene:** avoid a red/white split sphere with a centre button and any Poké-Ball-like iconography. The orb gem is a
   cyan sphere with a highlight, which is fine.

### 4.4 Key-art composition for the title (recommendation, untested beyond `ttilt`)
- **The hero lineup:** the three starters' final forms, or the three starters themselves.
  - Stand them **on a raised knoll or path in the focus band**, at 18–25 % of frame height. Today they are 14 %.
  - Light them with a strong warm key from behind-side (rim) and a dark, blurred foreground.
  - Put a bright, hazy vista or sky behind the logo.
- Layout:
  - **Logo in the top third.**
  - **Menu column in the lower third, over the darkest, most blurred band.** The `bottomShade` already does this.
- **Motion:**
  - camera drift (exists);
  - wind through foliage (exists);
  - one pass of falling petals or motes in the shafts;
  - the shine on the logo;
  - a slow idle pose cycle on the kin.
- **Phone:** stack logo, trio, then buttons. The trio must not fall under the buttons.

---

## 5. Celebratory sequences: evolution, catch, location card

### 5.1 Evolution (primary: `src/evolution_scene.c`, `src/evolution_graphics.c`)
| Beat | Emerald | Orbkin now | HD-2D upgrade (proposal) |
|---|---|---|---|
| Intro | Fade from black, "What? X is evolving!", the mon's anim + cry, intro jingle | Same text, cry, `evolveStart` sfx | Keep. **Dim the room key light to ~40 % over 0.6 s** (the BG fade to black in Emerald). Vignette 0.72 → 0.9 |
| Gather | BG animation + **sparkles spiral upward** (64 frames spawning + 96 frames, ≈ 2.7 s), then **arc down** (96 frames, 1.6 s) | Generic vector starburst rays from the start | Pixel sparkles (3–5-texel cels, 0.8 s loops) spiralling up in world space around the plinth, then raining down. Rays start thin and widen |
| Transform | **Pre and post both white**, swapped by **scale cross-swap**: one grows while the other shrinks; speed 8 → 128 in steps of +2 per half-cycle = **60 swaps in 5.8 s** (24 frames → 2 frames each). B cancels | White emissive silhouette, visibility toggle at 520 ms ×0.84 down to 55 ms over 5.2 s, small scale pulse | Same rhythm, but **cross-scale instead of an on/off toggle**: smoother and less flashy (photosensitivity, §5.4). **Camera push-in over the 5.8 s that keeps the light source (window) in frame.** `epush2` won on phone 4/4; the push that lost the window lost 0/4 |
| Climax | **Circle-in sparkles** (48 frames, 0.8 s), then **spray + full white-out**: fade to white over 16 steps, back from frame 32, 128 frames total (2.1 s) | `.evo-flash` DOM white 0.9 s `steps(6)` + 2 bursts | Keep the DOM white-out but make it **sync with a bloom spike in the 3D frame**. Spray as pixel sparkles |
| Reveal | Restore BG, new mon's anim + cry, "Congratulations!", evolved fanfare, then learn move | Cry + "Congratulations" | **Room light back up to 120 % for 1 s (a "new dawn")**, then settle. New form's idle anim. Camera eases back 30 % |

### 5.2 Catch (primary: `src/battle_anim_throw.c`)
- Wobble: a 31-frame rest after landing. Each shake is roll 8 → pivot → roll 12 → roll back, about 30 frames, then a
  31-frame rest. So **≈ 1.0 s per shake**, with half of it stillness.
- Success: at +40 frames, the "click" SE, the **ball palette darkened to 6/16** and **capture stars**; at +60 the ball fades
  back; at +95 the caught jingle; the sprite is freed at +315 (≈ 5.3 s of hold).
- **Orbkin:** a 260 ms wait + 380 ms wobble = 0.64 s per shake, then a 300 ms wait, then the click. The suspense is
  compressed.
- Recommendation:
  - **rest 500 ms + wobble 450 ms per shake**, and a 650 ms beat before the click;
  - on the click, darken the orb (emissive dip), burst 6–8 pixel stars, and **fade the arena light down about 15 % and the
    vignette up while the jingle plays**;
  - camera: a slow 10 % push toward the orb during the shakes, released on success or break-free.
- Motion-judging protocol is needed for this; these are frozen-frame-untestable.

### 5.3 "Location discovered" card (primary: `src/map_name_popup.c`)
- After entering: 30-frame delay (0.5 s), then slide in at 2 px/frame (20 frames, 0.33 s), **hold 120 frames (2.0 s)**,
  slide out (0.33 s).
- If another pop-up is queued, it cycles.
- The frame theme follows the area: wood (towns and routes), marble, stone, brick (cities), underwater.
- **Orbkin has none.** Route tabs and the `route-name` header are permanent UI.
- Proposal: on first arrival at a route, and on unlocking it:
  - a DOM card (pixel 9-slice in the route's material: meadow wood, ridge basalt, coast driftwood, plateau marble) with the
    route name in the display face and the level range;
  - timings 0.5 / 0.33 / 2.0 / 0.33 s;
  - plus a one-time **camera reveal**: start 30 % closer on the hero and ease out to the map framing over 1.2 s, in whole
    texels.
  - Reduced motion: fade only.

### 5.4 Accessibility for these beats (folded in from the completeness review)
- The evolution flicker reaches 55 ms per state (about 9 Hz full cycles) for a white silhouette, followed by a full-screen
  white flash.
  - WCAG 2.3.1: no more than 3 general flashes per second **above the area threshold** (about 25 % of 10° of visual field).
  - The silhouette is small on desk, but the phone push-in makes it about 30 % of the width.
  - Use Emerald's **scale cross-swap** (both forms white, so there is no luminance flash), keep any on/off luminance toggle
    at ≤ 3 Hz, and **honour `prefers-reduced-motion`** with a cross-fade only. `#curtain` already does this.
- Text over the darkened room must keep the UI contrast rules (ui-hud note).

---

## 6. Experiments: method and full results

### 6.1 Setup
- **Freeze hook** (scratch `src/render/anim.ts`): `animClock.time = FREEZE ?? time + dt`. Tweens still run.
- **Evolution frames:** captured at a deterministic beat. On the Skip button's appearance the capture calls
  `setSpeed(0)`, which freezes the tweens at the glow start.
- **Experiment flags (`?xp=`):**
  - island grade `tilt` (`tiltTop 3.6@.62`, `tiltBottom 3.2@.30`, vignette +.18);
  - `tilt2` (same radii, but `focusTop .84`: only the sky and the underside blur);
  - `fog` (scene fog near 17 / far 42 in the sky colour, plus 5 near and far cloud billboards);
  - route `cam` (FOV 26, dir (0, .5, .87) ≈ 30°, island box ±3.9 on desk, ±5.0 on portrait);
  - title `ttilt` and `tkey`; starter `stilt`; evolution `epush` (k 0.95, vignette .9, exposure .85, tilt) and `epush2`
    (k 1.2);
  - the pipeline tier multiplier for tilt is forced to 1 when any `*tilt` flag is set.
- **Judge** (`judge/screen_judge.py`):
  - built on the calibrated `jc/scripts/visual_judge.py` (`run_set`, `decide`);
  - a screen-specific prompt ("seasoned designer: composition and focal hierarchy, depth layers, light, readability of
    what matters on this screen, crispness");
  - both orders × 2 reps;
  - **element crop**: 2× nearest of the same box in both frames, prompt "pixel-art lead: look only at X";
  - decision rule: *better* needs ≥ 75 % and a win in both orders;
  - canary on 4 sets (all *better*);
  - phone frames are downscaled to 1600 px long side;
  - about $0.13–0.35 per comparison.
- **Smooth-blur simulation** (`scripts/hd_tilt.py`):
  - Gaussian blur of the clean frame per row, σ ramping with an ease-in outside the focus band;
  - UI pixels (raw ≠ clean) are restored crisp from the raw frame.

### 6.2 All verdicts
| Comparison | View | Full | Crop | Notes |
|---|---|---|---|---|
| route `cam` vs base | desk | **better 1.0** | — | "larger diorama, readable player/trainer/hotspots; base wastes sky" |
| route `cam` vs base | phone | **worse 0.0** | — | "cropped, oversized, cramped, crowds the panel" |
| route `cam2` (portrait fit ±5.0) vs base | phone | **worse 0.0** | — | "base has breathing room, sun shafts, cloud layers". Lower pitch moved the shafts' origin out of frame |
| route `tilt` vs base | desk | better 1.0 | **worse 0.0** | frame nicer, island top blurred: "mush". Gate rule → no_difference |
| route `tilt+fog` vs base | desk / phone | no_diff 0.5 / 0.5 | worse 0.0 | near clouds "inconsistent pixel scale", "reads as a rendering bug" |
| route `cam+tilt+fog` vs `cam` | desk / phone | no_diff / no_diff | worse 0.0 | |
| route `cam+tilt+fog` vs base | desk | no_diff 0.5 | — | the fog clouds cancel the framing gain |
| route `cam+tilt2` vs base | desk | **better 1.0** | — | blur only the sky and underside |
| route `cam+tilt2` vs `cam` | desk / phone | no_diff | no_diff 0.5 | |
| route smooth-HD tilt vs `cam+tilt2` (low-res) | desk | no_diff 0.5 | no_diff 0.5 | blur method does not matter |
| route smooth-HD tilt vs `cam` | desk / phone | no_diff | no_diff 0.25 | |
| title `ttilt` vs base | desk (canary ✓) | **better 1.0** | no_diff 0.5 | crop = trio region, unchanged |
| title `ttilt` vs base | phone | **better 1.0** | — | |
| title smooth-HD tilt vs `ttilt` | desk / phone | no_diff 0.25 / 0.5 | no_diff | |
| title smooth-HD tilt vs base | desk | **better 1.0** | — | |
| title `tkey+ttilt` vs base | desk | **worse 0.0** | — | foreground buries the trio |
| logo v1 (orb replaces O) vs CSS | desk / phone | no_diff 0.5 / **worse 0.0** | **better 1.0** | "reads 'RB KIN'" |
| **logo v2 (gem in O, plate) vs CSS** | desk / phone | **better 1.0 / better 1.0** | **better 1.0** | "finished brand mark" vs "placeholder" |
| starter `stilt` vs base | desk (canary ✓) | **better 1.0** | **better 1.0** | |
| starter `stilt` vs base | phone | **better 1.0** | — | |
| evolution `epush` vs base | desk (canary ✓) / phone | no_diff 0.75 / **worse 0.0** | — | "lost the motivated window light; flat, cramped" |
| evolution `epush2` vs base | desk / phone | no_diff 0.75 / **better 1.0** | — | keeps the window |

Confidence in these is **medium-high** for the decided pairs. Calibration (judge-calibration) shows the gate is very
accurate when a real difference exists and position-driven when the pair is near-equal; no_difference results above were
mostly order-flips. Judges are Opus; human ground truth is pending (human-ground-truth note). Static frames cannot judge the
motion beats (§3.4, §5).

### 6.3 Lessons the experiments add to the art-direction rules
1. **Blur the context, never the subject.** A band that reaches the subject's silhouette (trees on the island's top edge) is
   penalised in crops. A band that only touches ground-plane foreground or the background wins or is neutral. Place the band
   from the subject's screen extent, not from fixed fractions.
2. **Pixel blur vs smooth blur is not what judges see on these screens.** Placement is.
3. **Every layer at one texel density.** Near or far billboards whose texels are not the set's density read as bugs. This
   includes a camera zoom that magnifies a ground painted for another distance.
4. **Framing is per aspect ratio.**
   - Desk wants a bigger subject (the island at 70 % of the free width).
   - Portrait already fills its width and wants breathing room above and below plus a visible light source.
   - Write the fit rule per layout (wide, portrait, land), as battle already does.
5. **Keep motivated light in frame.** Push-ins must keep the window, sun-shaft origin or lamp visible. Judges explicitly
   valued "motivated light".
6. **Composition changes must re-run the readability probe.** Framing can silently drop a hotspot.

---

## 7. Implications for Orbkin
Ordered by value/effort. All are behind `?gfx=hd2d`, and each needs the pairwise gate and an owner check.

1. **Title: logo v2 and the tilt band.**
   - Replace the CSS-text logo with a code-drawn pixel wordmark: plate, ramp, gem-in-O, at the current size.
   - Add one shine sweep at 1.3 s, then every 7 s, honouring reduced motion.
   - Set `titleGrade` to `tiltTop 3.6 @ 0.60`, `tiltBottom 3.6 @ 0.36`, vignette 0.6, and **don't scale tilt down on the
     low tier for screens**: it is 13 taps and cheap.
   - Investigate the **stray grey object** on the phone title path.
   - Effort S–M. Evidence: 4/4 desk and phone each.
2. **Starter: the same band** (`tiltTop 3.6 @ .66`, `tiltBottom 3.6 @ .34`, vignette ≥ 0.5). Effort XS. Evidence: full and
   crop 4/4, phone 4/4.
3. **Route map framing.**
   - Desk and landscape: FOV 26°, pitch ≈ 30°, island ≈ 70 % of the free width.
   - Portrait: keep the whole island with margin and keep the shaft origins in frame.
   - Repaint or choose `MT` from the camera so ground texel = sprite texel.
   - Add hotspot positions to the fit set.
   - Tilt only above 0.84 and below 0.30 (`tilt2`).
   - Effort M. Evidence: desk 4/4; phone lost 0/4 until framing is per layout.
4. **Evolution choreography.**
   - Dim the key to 40 % and raise the vignette.
   - Push in to k ≈ 1.2 while keeping the window in frame.
   - Pixel sparkle choreography: spiral up, arc down, circle in, spray.
   - Scale cross-swap instead of an on/off toggle.
   - White-out synced with bloom.
   - Bright reveal, then ease back.
   - Effort M. Evidence: a static push-in that keeps the light won on phone 4/4. The motion needs a motion gate.
5. **Catch pacing.**
   - 500 ms rest + 450 ms wobble per shake; 650 ms pre-click.
   - On the click: orb darkening, pixel stars, arena dim and vignette.
   - Effort S.
6. **Route arrival card + camera reveal.**
   - Material 9-slice per route, 0.5 / 0.33 / 2.0 / 0.33 s.
   - One-time ease-out reveal.
   - Effort S–M.
7. **Walking avatar + encounter-zone language** (§3.3–3.4). Effort M–L. It depends on the walk cycle from
   character-animation-craft.
8. **Longer term, the "inside the world" field.**
   - If the owner wants the HD-2D signature on the overworld, design route maps as **stepped dioramas filling the frame
     (back higher, no sky)** with a follow camera at about 25° and FOV ≈ 25–30°.
   - Keep the floating-island hub as a region overview.
   - This is a design decision for the owner, not a tweak.

### 7.1 Per-screen style sheet (for the art-direction skill)
Values are starting points; the gate decides.

| Screen | Render | Camera | Subject size | Focus band (frac. of height, top→bottom) | Blur | Value structure | Light | Layers | Must-haves | Must-nots |
|---|---|---|---|---|---|---|---|---|---|---|
| **Title** | 3D set + DOM logo/menu | pitch ≈ 27° (portrait 32°), slow whole-texel drift ±0.55 | trio 14 → 18–25 % of height | **0.36–0.60** around the trio | top 3.6 px, bottom 3.6 px internal at the edges, vignette 0.6, bottom shade under the menu | Dark-dominant (notan ≈ .65/.25/.10). Brightest value = clearing + trio | Warm golden key from the back-side, shafts with motes, rim on the kin | Dark blurred foreground flora; crisp clearing; blurred, warm hazy back | Pixel wordmark with plate (≥ 27 % width desk, ≥ 55 % phone); one shine; skippable; blinking/pulsing prompt optional | Typed-text logo; emblem replacing a letter; near-camera billboards with big texels; a low camera without a cleared foreground |
| **Route map** | 3D set + DOM sheet/tabs, 3D gems/badges | desk/land: FOV 26°, pitch ≈ 30°, island ≈ 70 % of free width. Portrait: whole island + ≥ 6 % margin, FOV 40° | hero ≈ 8–10 % of height (Octopath field 10 %) | whole island top; blur only above **0.84** and below **0.30** | top 3.6 / bottom 3.2 px, vignette +0.18 | Today light-dominant (L\* 69). Aim mid (L\* 50–56), and keep the sky but make the island the value focus | Directional key + long shafts **whose origin stays in frame** | Cloud sea and far islands fogged toward the sky colour; no near occluders unless painted at the set texel | Every hotspot inside the free area (readability probe recall 1.0); ground texel = sprite texel; idle whole-texel drift | Near clouds at another texel scale; blurred hotspots; cropping hotspots under the panel |
| **Starter** | 3D set + DOM panel | as now (≈ 25–30°) | three kin on daises ≈ 10–14 % of height | **0.34–0.66** | 3.6 / 3.6 px, vignette ≥ 0.5 | Chosen dais brightest (focal pool) | Canopy-gap shaft onto the **chosen** dais (check the shaft hits the chosen kin on phone) | Blurred grass foreground, crisp clearing, blurred canopy | Selection change = light moves (exists) + the kin's idle/cry | Uniform sharpness |
| **Evolution** | 3D room + DOM text, flash | push from k 1.6 to ≈ 1.2 over the flicker; **window stays in frame** | creature 8 → ≈ 15–20 % of height | creature and plinth | top 2.6 @ .66, bottom 2.4 @ .25 | Very dark (L\* ≈ 16–20) with one hot core | Window key dims to 40 % in the gather, white-out, bright reveal | Dark room, rays, sparkles | Emerald choreography (§5.1); scale cross-swap; reduced-motion cross-fade | Vector starburst as the only effect; on/off luminance flashing > 3 Hz over large areas; losing the light source |
| **Catch** | Battle stage | battle cam + 10 % push to the orb | — | battle band | battle | Arena dims about 15 % on the click | — | — | ≈ 1 s per shake with stillness; click darkening + stars; jingle hold | Compressed shakes |
| **Location card** | DOM over the map | one-time ease-out reveal (1.2 s) | — | — | — | — | — | — | Material 9-slice per route; 0.5 / 0.33 / 2.0 / 0.33 s | Permanent banner as the only area identity |
| **Party / box / bag / shop / bestiary** | 3D room + DOM lists | turntable 22.5° steps (exists) | kin on plinth | plinth | room grade (exists) | Dark room, lit plinth | Window cookie | — | (Not tested here; judge-calibration credited r2 gains to these screens) | — |

### 7.2 Skill-writing notes
- Encode §6.3 as rules. Encode the per-screen sheet as the art-direction skill's table.
- Encode `screen_judge.py` (full + element crop, per-screen prompts) and `readability_probe.py` as gate tools.
- Encode the pokeemerald timings as reference data. They are primary code and were read here; facts and timings are not
  copyrightable expression.
- Safety:
  - no assets were downloaded;
  - the logo is generated in code;
  - recommended tools are Inkscape (GPL), Pixelorama (MIT) and LibreSprite (GPL), installed by the owner. Do not download
    binaries from the agent.
  - npm `@resvg/resvg-js` (MPL-2.0) and `postprocessing@6.39.5` (Zlib; it has a `TiltShiftEffect` with
    `focusArea`/`feather`/`kernelSize`; peer three ≥ 0.168 and < 0.187) are optional and need DECISIONS entries and
    `--ignore-scripts`.
  - three's own `VerticalTiltShiftShader`, `HorizontalTiltShiftShader` and `BokehPass` ship in `three/examples/jsm` and add
    no dependency.

---

## 8. Open questions
1. Does a **depth-aware** blur (CoC from depth, `BokehPass`) beat the screen-space band on the route map, where tall trees
   cross the band? Held et al. predict yes. Not tested.
2. Does the owner want the floating-island hub, or a true HD-2D "inside the world" field (stepped diorama, follow camera,
   walking)? That is a game-design decision with big art and code cost.
3. What is the stray grey object with a black stripe in front of the title trio on phone (`shots/artifact_crop.png`)?
4. Is a motion gate possible (frame strips or short clips to the judge) for the evolution and catch choreography and the
   location card? It is needed before shipping §5.
5. The Opus judges preferred the code-drawn logo strongly. Human check pending: does a human panel agree (human-ground-truth
   protocol)?
6. What are the exact Octopath field FOV and pitch values? The UFE slides (blocked here) may state them. My estimate of
   20–30° pitch is low confidence.

## 9. Sources
Primary code, read in this session:
- `pret/pokeemerald` `src/title_screen.c`, `src/evolution_scene.c`, `src/evolution_graphics.c`, `src/battle_anim_throw.c`,
  `src/map_name_popup.c`, `src/data/field_effects/field_effect_objects.h`
  (raw.githubusercontent.com, master, 2026-10-14);
- `Lyall/OctopathFix` and `Octopath2Fix` (FOV code: multiplies the game's FOV by aspect; no default value in source);
- the Godot HD-2D repos already cloned (`katryo/claude-hd2d-godot` `follow_camera.gd`: pitch 40°, FOV 30°, DoF near/far
  offsets 7/4. AI-made, so not authoritative. `GSansigolo/SimpleHD2D`: spring arm pitched 30°, length 6, far DoF);
- three r180 `examples/jsm/shaders/VerticalTiltShiftShader.js`;
- `postprocessing@6.39.5` type definitions (`npm pack --ignore-scripts`).

Talks, interviews and reports (via search summaries; the hosts are blocked):
- Acquire UFE 2018 talk and its reports, listed in §2.1;
- Siliconera DQ3 interview; Digital Trends;
- Cassette Beasts devlog and Pocket Tactics interview;
- Wikipedia [HD-2D](https://en.wikipedia.org/wiki/HD-2D);
- Steam DoF discussion ([1](https://steamcommunity.com/app/921570/discussions/0/1640913421077220954/)).

Perception:
- Held et al. 2010 ([ACM](https://dl.acm.org/doi/abs/10.1145/1731047.1731057));
- [PLOS One 2023](https://journals.plos.org/plosone/article?id=10.1371%2Fjournal.pone.0285423).

Licences:
- [OFL FAQ](https://tug.ctan.org/fonts/gentium/OFL-FAQ.txt);
- [openfontlicense.org](https://openfontlicense.org/).

Prior notes used: `reference-board-measurement.md` (texel and DoF numbers), `judge-calibration.md` (gate), `character-animation-craft.md`
(walk cycle), `ui-hud-typography.md` (fonts), `biome-nature-kit.md` (element-crop protocol), `local-genai-gpu-node.md` (key art via
local GenAI, licence policy).
