# Reference board: where the fan-art target comes from, and measurements of real HD-2D frames

Angle: the only quality bar so far is one fan-art frame (`hd2d/reference.png`, watermarked "Made by @nagk01").
This note checks where it comes from. It then measures real HD-2D frames with numpy and Pillow and compares
them with that fan art and with Orbkin's cave, meadow and shallows captures. From that it proposes a
reference set and private storage rules for the gate.

Date: 2026-10-14. All experiments ran in `scratchpad/refboard/` and never touched the game repo.

---

## 0. TL;DR

1. **Where the fan art comes from (medium confidence).** It is a frame from a video in an X post by Nag Alluri (@nagk01).
   The post is status `2103596354631340522`. Its snowflake ID decodes to **2026-09-25 21:23 UTC**. The text, as
   the search index shows it, is: *"This is actually insane. With the latest AI models, I was able to make a fully playable demo
   in this art style that you can play in your browser! Check it out ->"*. The link points to
   `pokemon-battle-sim-1vq.pages.dev` (page title "Rock Gym"). This explains the in-frame "Made by @nagk01" and "♪ ON" overlays.
   Two details show our copy is a screenshot of the X video player, not the original: the volume icon in the bottom-right
   corner and the letterbox bands. It was taken at 2× device-pixel ratio from a video about 1000 px wide. So the image is an
   **AI-assisted, real-time browser demo using Nintendo/Game Freak IP**, filmed and then screenshotted. It is not a professional
   HD-2D title, and probably not one generated image either. "In this art style" suggests the post was a reply to someone
   else's image, which I could not find. The demo site and x.com are blocked here, so I could not see the code or assets.
2. **Pixel forensics on the fan art.**
   - The sprites sit on a 4-px grid (2 video px), and **each sprite has its own grid phase**. So they are separate
     layers on a high-resolution scene, not a single low-resolution framebuffer.
   - Geodude has **no clean grid**. Brock has a **smoothly painted anime face on a pixel body**. Both are typical of
     AI-generated "pixel art" sprites.
   - The environment (rock, floor) has **no measurable texel grid at any depth**: edge spacing stays at 5–7 px with no
     depth trend. So it is not pixel-textured 3D at a fixed texel density.
   - The props are clean 3D: the four bookshelves are near-identical instances drawn in consistent perspective, and the
     stair geometry is smooth.
   - Verdict on the rock: soft, high-resolution textures on 3D blocks, or a baked backdrop. Either way it is
     **not crisp pixel texturing**.
   - Earlier notes claimed a "4-px grid, 1–4 % block variance". That number only reflects smoothness: block variance is
     the same at every phase. It was a measurement artefact.
3. **Real HD-2D frames obtained.**
   - Ten **official Octopath Traveler PlayStation Store screenshots** (3840×2160) and two YouTube frames (victory, tavern),
     all re-hosted in the public GitHub repo `Emorque/Octopath-Traveler-UI`, whose README credits the PS Store page.
   - Octopath field-sprite rips (44×50 canvases) from the same repo.
   - Octopath's sprite engine data, from the documented reverse-engineering in `mastermind1919/OctoOverworldSprites`.
   - Steam CDN, Nintendo, Square Enix, press sites, Wikimedia, imgur, YouTube and Hugging Face are all blocked here. So
     Octopath Traveler II, Triangle Strategy, Live A Live, DQ3 HD-2D, Sea of Stars and Cassette Beasts are covered only by
     published numbers.
4. **Measured numbers that answer the open questions.**
   - **Octopath human sprites are 32–34 texels tall** (Ophilia's idle frame is exactly 18×32, from the engine's UV
     floats). At **4.545 cm per texel (22 texels/m)** in world space they are nearest-filtered quads with no mipmaps.
     Each sprite has its own **normal map** ("_no" textures).
   - **Screen size varies with the camera and with depth**:
     - field camera: 7.17 px per texel at 4K, a sprite is 10.3 % of frame height, and one texel is **1/315** of frame height;
     - battle or victory camera: 5–8 px per texel at 1080p, sprites are 15–24 % of frame height, and one texel is **1/135–1/218**
       of frame height. The ratio is non-integer and changes with depth.
   - **The environment's texel equals the sprite's texel** in the focus band: floor 7.16 px against sprite 7.17 px.
   - HD-2D titles render the 3D scene at **the console's output resolution**: Octopath runs at 1280×720 docked and 1024×576
     handheld on Switch. Triangle Strategy uses dynamic resolution, 720–900p docked and 600–720p handheld, with 1080p UI.
     The pixel look comes from nearest-filtered textures and sprites. **Depth of field, bloom and light shafts run at full
     resolution.**
5. **Orbkin compared with them.**
   - Orbkin's sprite texel is 4 screen px at 720p, which is 1/180 of frame height, with people 31–42 texels tall. That is
     already **inside Octopath's battle-camera range**, so sprite density is not the gap.
   - The measurable gaps:
     - **(a) Depth of field.** Orbkin's sharpness stays at 0.5–0.8 of peak at the top and bottom of the frame. Octopath
       drops to 0.04–0.32 at the bottom (store-shot median 0.5 top and bottom), with a sharp band in the middle third.
     - **(b) Over-warm, over-saturated light.** Orbkin's lit areas reach b\* ≈ 36 and chroma p95 ≈ 49–50. Octopath lit
       areas are b\* ≈ 10–29 (median 16) with chroma p95 median 37; the fan art is 28 / 37.
     - **(c) No cool shadows.** In the cave only 0.2 % of pixels have b\* < 0. Octopath's median is 14 %.
     - **(d) UI share.** Orbkin is 25 %; the fan art is 19.5 %.
     - **(e) Effects resolution.** Orbkin pixelates its effects; HD-2D keeps them high-res.
6. **Recommended gate anchors.** Keep them private and sealed:
   - **A1** Octopath `victory` (battle camera) at **640-px thumbnail**, plus a 2× crop of its sprites;
   - **A2** Octopath store shot `bg4` (desert field: focus band, value masses), thumbnail only;
   - **A3** the fan art at **thumbnail only**, as a battle-layout and mood anchor, never at native size.
   The pairwise gate still compares candidate against the last accepted Orbkin frame. Anchors are context for the
   `full_ref` condition, and their measured numbers are sealed verifier data.

---

## 1. Where the fan art comes from

### 1.1 Evidence
| # | Evidence | Source / method | Confidence |
|---|---|---|---|
| P1 | X account **@nagk01 = "Nag Alluri"**, post `2103596354631340522`: "With the latest AI models, I was able to make a fully playable demo in this art style that you can play in your browser!" | WebSearch (extended) index of [x.com/nagk01/status/2103596354631340522](https://x.com/nagk01/status/2103596354631340522). x.com itself is unreachable (DNS). | high that the post exists; text as indexed |
| P2 | The post links to **`pokemon-battle-sim-1vq.pages.dev`**, which the index titles "Rock Gym". | WebSearch result list. curl and WebFetch both refused (proxy 403 / DNS). | medium-high |
| P3 | Post date **2026-09-25 21:23:48 UTC**. | Decoded the snowflake: `(id >> 22) + 1288834974657` ms. | high |
| P4 | The frame is a **video-player screenshot**: 2000×1299 with black letterbox bands (game area y 108–1236) and a speaker icon at (1965, 1268). | Visual inspection. | high |
| P5 | It was captured at about 2× device-pixel ratio from a video about 1000 px wide. Lanczos down/up-scaling by 2 loses only 2.5–3.4 % of detail energy, against 5–12 % for the 4K Octopath shots. | `scripts/native_res.py` | medium-high |
| P6 | **Sprites sit on a 4-px grid (2 video px), and each has a different phase**: Charmander (3,0), trainer (1,0), Brock (2,3). Phase contrast at p = 4 is 1.9–2.2. | `scripts/grid_phase.py`, `scripts/sprite_texel.py` | high |
| P7 | **Geodude has no clean grid** (p = 3 contrast 1.3, p = 4 contrast 1.0). **Brock's face is smoothly shaded anime style** inside a pixel body. | Same scripts, plus a 3× nearest crop (`thumbs/ref_geo_brock.png`) | high (observation). Reading it as "AI-generated sprite" is medium |
| P8 | **Environment has no texel grid.** Floor and wall block-variance contrast is about 1.05–1.1 at p = 2, 4 and 8. Floor edge gaps are 5–7 px from far (y 530) to near (y 960) with no depth trend. | `scripts/depth_pitch.py` | medium-high |
| P9 | **The four bookshelves are near-identical instances** (same book order and colours) in consistent perspective. Stair rails and treads are clean, smoothly lit geometry. | Crop `thumbs/ref_shelves.png` | medium. Points to a real 3D scene rather than a single generated image |
| P10 | The UI is crisp, consistent text ("Lv12", "45/ 45", "TYPE/NORMAL") plus a "♪ ON" toggle and a watermark. Image generators rarely produce this. It matches a DOM/canvas HUD. | Visual inspection | medium |
| P11 | Uses Pokémon names and characters (Charmander, Geodude, Red and Brock lookalikes). | — | high |

### 1.2 Verdict
- **What it is.** A frame from a browser demo that one person built "with the latest AI models", posted on X on 2026-09-25 and
  captured from the post's video. It was most likely a real-time 3D scene (clean instanced props, consistent perspective)
  with soft environment textures, sprite billboards on separate grids (probably AI-generated, judging from Geodude and
  Brock), and a DOM-style HUD.
- **Why the pixels look smeared.** Judges saw smeared, non-integer pixels. That is the video codec plus browser scaling, on
  top of sprites whose sizes do not match each other.
- **What it is not.** Not hand-made pixel art and not a professional HD-2D frame. It is also not good evidence of what pixel
  texturing on 3D can achieve.
- **How it was made is unknown.** Which models made the code and which made the assets is unknown. Whether the original
  "art style" image was AI-generated is unknown too, because I could not find the quoted post.
- **Overall confidence: medium.**

Being an Orbkin-like project, it is a *peer* (one person with AI tools), not a "seasoned game designer" bar. It should not
be the only anchor.

### 1.3 The rock: 3D with pixel textures, or a painted backdrop?
- It is not a fixed-density pixel texture on 3D:
  - edge spacing does not follow depth;
  - there is no phase-locked grid;
  - the texture scale on the rock blocks is irregular.
- The props (shelves, stairs, desk) are clearly 3D.
- Best reading: 3D blocks with **soft, high-resolution "pixel-look" textures**, possibly AI-generated or with a bilinear
  filter, rendered at full resolution.
- A baked backdrop cannot be ruled out without the demo's code. The site is blocked (§8).
- Practical consequence: the fan art's environment look **cannot be reproduced by Orbkin's crisp texel pipeline and should
  not be.** It is soft by construction.

### 1.4 Correction to earlier notes
`showcases.md` §5.4 says the reference shows "strong autocorrelation at 4 px; within each 4×4 block variance is only 1–4 %
… consistent with a ~500×325 framebuffer upscaled 4×".

Re-measured, the 4×4 block variance is the same at every phase for the environment (0.043 vs 0.046). It is low because the
image is smooth, not because there is a grid. Only the sprites carry a 4-px grid, and each has its own phase. **There is no
single low-resolution framebuffer.** The 4-px period is the sprite texel (2 video px) and the 2× screenshot scale.

---

## 2. What could be obtained, legally and technically

| Target | Route tried | Result |
|---|---|---|
| Steam store screenshots (Octopath I/II, Triangle Strategy, Live A Live, DQ3 HD-2D, Sea of Stars, Cassette Beasts) | `store.steampowered.com/api/appdetails`, `shared.cloudflare.steamstatic.com`, `cdn.akamai.steamstatic.com`, `shared.akamai…`, `steamcdn-a.akamaihd.net` | **all blocked** (proxy CONNECT 403) |
| Publisher, press and store pages | nintendo.com, square-enix-games.com, store.playstation.com, image.api.playstation.com, sabotagestudio.com, cassettebeasts.com | blocked |
| Image mirrors and wikis | upload.wikimedia.org, imgur, i.redd.it, igdb, mobygames, opencritic, fandom, spriters-resource, gamebanana, huggingface, archive.org | blocked |
| GitHub `user-images` / `user-attachments` | — | blocked. I deliberately did **not** route images through `camo.githubusercontent.com`, because that would sidestep the owner's allowlist |
| **Public GitHub repos with committed images** (`git clone --filter=blob:none`, then check out image paths only) | `Emorque/Octopath-Traveler-UI` | **12 Octopath frames.** `img/bg1–bg10.webp` are 3840×2160 and the README credits them as "Images on the Front Page obtained from the PS App page for OT", i.e. **official PlayStation Store screenshots**. `victory.webp` (1916×1079) and `tavern.webp` (3840×2160) are YouTube frames. Also 8 field sprites (`sprites/*1.png`, 44×50) credited to The Spriters Resource. The repo has no licence, so all rights are reserved |
| Octopath sprite engine data | `mastermind1919/OctoOverworldSprites` (2021): README and technical notes | UE 4.18.2 settings, the CustomSpriteDB float layout, 512×512 atlases, normal maps (§3.2) |
| Published resolution numbers | WebSearch summaries of Digital Foundry and RPG Site (the original pages are blocked for WebFetch) | §3.4 |

Safety:
- Only images (.webp/.png) and text were read.
- `CustomSpriteDB/FileToHex` and `hexToValues` in the sprite repo are compiled binaries. They were **never checked out or run**
  (blobless clone, image paths only).
- A search result `github.com/sirex499/Sea-Of-Stars-Full-Version` ("free full-version download") is a typical **malware lure**.
  Do not touch it.

---

## 3. Measurements

Tools: `scratchpad/refboard/scripts/`, numpy and Pillow only, run with `python3 -I`.
- `pitch.py`: FFT and autocorrelation pitch of the gradient signal, plus block-variance ratio.
- `sprite_texel.py`: phase-locked grid test per sprite box, measuring best-phase versus worst-phase within-block variance.
- `sprite_fft.py`: per-sprite FFT pitch, which gives texels tall.
- `grid_phase.py`: global versus per-region grid phase.
- `depth_pitch.py`: pitch against depth rows.
- `native_res.py`: effective resolution from down/up-scale loss.
- `measure_all.py`: reuses `jc/scripts/artgate.py`, the judge-calibration metric set, so the numbers are comparable with
  `judge-calibration.md`. It adds a depth-of-field band profile, cool share and UI share.

### 3.1 Sprite size and texel-to-screen ratio
| Source (frame) | Sprite | Screen px tall | % of frame H | Texel pitch (px) | Texels tall | 1 texel = 1/x of frame H |
|---|---|---|---|---|---|---|
| **Octopath field** (`bg4` store shot, 3840×2160) | 3 party members | 222 | 10.3 % | 7.18 x / 6.85 y | 32.3–32.5 | **1/315** |
| Octopath field (`bg6` castle, 4K) | Olberic | 232 | 10.7 % | 7.17 / 6.82 | 33–34 | 1/317 |
| **Octopath battle/victory** (`victory`, 1916×1079) | far-left | 200 | 18.5 % | 5.67 | 35 | 1/190 |
| | far-mid | 162 | 15.0 % | 4.95 | 33 | 1/218 |
| | mid-right | 190 | 17.6 % | 6.11 | 31 | 1/177 |
| | near | 260 | 24.1 % | 8.05 | 32 | 1/134 |
| Octopath sprite rips (`sprites/*1.png`) | 8 travellers, idle | — | — | — | **32–34 (18–20 wide)** | — |
| **Fan art** (game area 2000×1128) | trainer (back) | 218 | 19.3 % | 4 (phase-locked) | 54.5 | **1/282** |
| | Charmander | 123 | 10.9 % | 4 | 31 | 1/282 |
| | Brock | 185 | 16.4 % | 4 | ≈ 46 | 1/282 |
| | Geodude | 95 | 8.4 % | none | — | — |
| **Orbkin cave** (1280×720; boxes from `capture.json`) | player | 126 | 17.5 % | 4.00 | 31.5 | **1/180** |
| | your kin (Ashkit) | 96 | 13.3 % | 4.00 | 24 | 1/180 |
| | foe (Flickwing) | 64 | 8.9 % | 4.00 | 16 | 1/180 |
| | trainer | 131 | 18.2 % | 4.00 | 33 | 1/180 |
| Orbkin meadow | player / kin / foe / trainer | 168 / 116 / 85 / 147 | 23 / 16 / 12 / 20 % | 4.00 | 42 / 29 / 21 / 37 | 1/180 |
| Orbkin shallows | player / kin / foe | 168 / 107 / 110 | 23 / 15 / 15 % | 4.00 | 42 / 27 / 27.5 | 1/180 |

Notes:
- Orbkin heights use the harness layout boxes, which can include a few transparent rows (±2 texels). The pitch is exact
  (block variance 0.000 at p = 2 internal and p = 4 screen).
- Octopath's x and y pitches differ (7.18 against 6.85, about 0.95). That is consistent with **upright quads seen from a
  camera pitched down about 17°**.
- Octopath's pitch also changes with depth in the same frame (4.95 → 8.05 px). **Its sprites are world-space quads under
  perspective, not screen-snapped.** Orbkin deliberately snaps them, which is fine. The point is that HD-2D does not need
  an integer texel-to-screen ratio. What it keeps constant is **world texel density** (22 texels/m).

### 3.2 Octopath's sprite engine data (from the modder's notes; medium-high)
- Unreal Engine **4.18.2**. Character textures are 512×512 atlases (`Content/Character/Resource/<Ply***>/Textures`).
  Animation uses Paper2D **Flipbooks** (`Content/Flipbook/Database/CustomSpriteDB.uexp`).
- Import settings for player sprites:
  `Compression: UserInterface2D (RGBA), Mip Gen: NoMipmaps, Texture Group: 2D Pixels (unfiltered), Filter: Nearest`.
  **Normal maps use the same settings**: per-sprite `_no` textures, nearest, no mipmaps. A separate lantern mask is trilinear.
- Decoded quad for Ophilia's idle frame: corners x ±40.909 and y 81.818–227.27 (UE units = cm); UV
  u 0.41992–0.45508 and v 0.15234–0.21484.
  - In texels: (0.45508 − 0.41992) × 512 = **18**, and (0.21484 − 0.15234) × 512 = **32**.
  - In world size: 81.8 cm / 18 = **4.545 cm per texel** (= 100/22), so a 1.45 m tall card.
  - This matches the measured 32–34-texel sprites in the store shots.
- Octopath also keeps alternate job sprites (larger, up to 1024×1024 sheets) and unused shocked/angry frames.

### 3.3 Environment texel against sprite texel, and UI texel
| Frame | Environment texel (focus band) | Sprite texel | Ratio | UI |
|---|---|---|---|---|
| Octopath `bg6` castle (4K) | floor 7.16 px in x (3.24 in y: horizontal plane at about 27°) | 7.17 px | **1.00** | UI is vector/high-res. DF reports the UI fixed at 720p, not pixel-snapped |
| Octopath `bg4` desert | sand is low-detail. The rock texel cannot be measured: it lies in the DoF blur | 7.18 | — | — |
| Fan art | **none measurable** (no grid; feature size 5–7 px, irregular) | 4 px | — | pixel font, font pixel ≈ 4 px ≈ 1 sprite texel |
| Orbkin cave | 4.00 px (floor and wall) | 4.00 | **1.00** | pixel UI on a **2-px** grid: font pixel = ½ sprite texel |

### 3.4 Internal render resolution
Published numbers (secondary summaries; the originals are blocked for fetch):

| Title | Platform | Render resolution | Note |
|---|---|---|---|
| Octopath Traveler | Switch | **1280×720 docked, 1024×576 handheld**, UI fixed at 720p | Digital Foundry 2018 via secondary reports ([NintendoLife](https://www.nintendolife.com/news/2018/07/video_octopath_traveler_earns_digital_foundryrs_respect_for_blending_old_with_new), [MyNintendoNews](https://mynintendonews.com/2018/07/18/digital-foundry-take-on-octopath-traveler-for-nintendo-switch/), [GameFAQs thread](https://gamefaqs.gamespot.com/boards/189706-nintendo-switch/76818599)). UE4 with SSR, DoF, alpha particles; locked 30 fps |
| Triangle Strategy | Switch | **dynamic 720–900p docked, 600–720p handheld, 1080p UI** | [RPG Site comparison](https://www.rpgsite.net/feature/18245-which-is-the-best-version-of-triangle-strategy-ps5-xbox-switch-2-switch-pc-and-steam-deck-compared). The Switch 2 version is reported as upscaled, not native |
| DQ3 HD-2D Remake | Switch 2 | "near-native" in graphics mode (30 fps). Performance mode (60 fps) is "softer … lower resolution for the sprites" | [RPG Site](https://www.rpgsite.net/feature/18345-which-is-the-best-version-of-dragon-quest-iii-hd-2d-remake-ps5-switch-2-xbox-switch-and-pc-tested) |
| Octopath Traveler 0 | Switch 2 | targets 1080p/60 docked, below 1080p handheld | [RPG Site](https://www.rpgsite.net/feature/18921-octopath-traveler-0-steam-deck-vs-nintendo-switch-2-impressions-performance) |
| Sea of Stars | all | one forum user says "actually 360p" (unverified). Not HD-2D in the Square Enix sense: 2D pixel art with dynamic lighting | [GBAtemp](https://gbatemp.net/threads/sea-of-stars-mobile-impressions.681045/) (low) |

What I measured myself:
- Down/up-scaling the 4K store shots by 2 loses 8–12 % of detail energy in the focus band. So they are true high-resolution
  renders (or high-quality upscales), not 1080p ×2 nearest.
- The low-resolution look lives in the textures and sprites. **Blur, bokeh, bloom, haze and light shafts are smooth at full
  resolution.** See the `bg6` crop: the foreground floor is a smooth bokeh, not 2-px blocks.
- So HD-2D's "internal resolution" is the console output resolution.
- The **effective sprite resolution** (frame height in sprite texels) is about **315 at the field camera** and
  **135–220 at the battle/victory camera**. The fan art is 282. Orbkin is 180, with everything (DoF, rays, bloom) quantised
  to that grid.

### 3.5 Frame metrics table
Method:
- All frames are box-resampled to 640 px wide first, as in `artgate.py`.
- Orbkin numbers come from the `.clean.png` world frames (HUD removed), with UI share from the raw/clean diff.
- The fan art uses its game area with the HUD boxes masked. Its UI share comes from the hand-measured HUD boxes.
- Octopath store shots have no UI.
- Focal = creature boxes (Orbkin mine and foe; fan art Charmander and Geodude) or all sprites (Octopath).
- DoF = per-band sharpness `mean|L−G(1)| / mean|L−G(4)|` over 12 horizontal bands. The "in-focus band" is the bands
  ≥ 0.8 × max. "top/bottom rel" is the mean of the two outer bands divided by the max.

| Frame | Notan D/M/L | Squint std | L\* mean | Chroma mean / p95 | b\* shadow / light | Δb\* | Cool share (b\*<0) | Focal chroma | Focal edge | Focal ΔL | DoF in-focus band | DoF top / bottom | UI share |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **Fan art** | 0.40/0.42/0.18 | 18.8 | 41.2 | 22.3 / 37.4 | 7.6 / 27.9 | 20.3 | 0.048 | 1.23 | 1.70 | +2.5 | flat (0.75–1.0 at matched res) | — | **0.195** |
| **Orbkin cave** | 0.37/0.42/0.21 | 18.0 | 43.0 | 28.6 / **49.1** | 7.1 / **36.4** | 29.3 | **0.002** | 0.88 | 3.09 | −13.3 | 0.08–0.92 | 0.78 / 0.80 | **0.255** |
| **Orbkin meadow** | 0.51/0.29/0.20 | 18.1 | 37.8 | 23.9 / **50.0** | 0.9 / **35.6** | 34.7 | 0.107 | 1.07 | 2.09 | −5.2 | 0.08–0.92 | 0.80 / 0.80 | 0.251 |
| **Orbkin shallows** | 0.34/0.39/0.27 | 21.6 | 46.5 | 15.5 / 28.9 | −3.3 / 16.6 | 19.9 | 0.706 | 1.02 | 2.05 | −9.5 | 0.08–0.67 | 0.82 / 0.71 | 0.253 |
| OT victory (battle cam) | 0.36/0.23/0.41 | 32.1 | 52.6 | 15.4 / 32.5 | 6.0 / −3.0 | −9.0 | 0.355 | 0.99 | 5.62 | −5.7 | 0.67–0.83 | **0.14 / 0.44** | 0 |
| OT bg4 desert (field) | 0.30/0.34/0.36 | 24.3 | 50.6 | 30.8 / 46.3 | 10.8 / 29.4 | 18.5 | 0.011 | 0.99 | 9.48 | −31.8 | 0.33–0.67 | 0.57 / **0.15** | 0 |
| OT bg6 castle | 0.50/0.31/0.18 | 17.8 | 36.8 | 15.0 / 27.3 | 5.4 / 17.5 | 12.1 | 0.033 | 1.09 | 1.79 | −7.1 | 0.00–0.67 | 0.92 / 0.32 | 0 |
| OT bg1 village | 0.51/0.36/0.13 | 20.3 | 36.4 | 18.3 / 38.5 | 5.5 / 27.9 | 22.4 | 0.001 | – | – | – | 0.33–0.67 | 0.64 / 0.22 | 0 |
| OT bg2 cathedral (night, blue) | 0.49/0.29/0.22 | 25.2 | 40.2 | 23.7 / 48.1 | −15.4 / −12.6 | 2.8 | 0.994 | – | – | – | 0.50–0.83 | 0.25 / 0.72 | 0 |
| OT bg3 harbour | 0.46/0.35/0.20 | 20.3 | 40.3 | 14.5 / 35.8 | 3.3 / 11.3 | 8.0 | 0.111 | – | – | – | 0.42–1.0 | 0.53 / 0.88 | 0 |
| OT bg5 river canyon | 0.59/0.37/0.05 | 17.0 | 29.7 | 10.9 / 31.8 | −0.9 / 14.8 | 15.7 | 0.350 | – | – | – | 0.25–0.67 | 0.55 / 0.26 | 0 |
| OT bg7 misty town | 0.42/0.43/0.15 | 18.4 | 39.9 | 7.5 / 20.0 | −1.1 / 10.3 | 11.4 | 0.240 | – | – | – | 0.50–0.67 | 0.51 / 0.68 | 0 |
| OT bg8 forest house | 0.83/0.14/0.03 | 16.0 | 17.4 | 9.4 / 18.5 | 3.6 / 3.3 | −0.2 | 0.276 | – | – | – | 0.42–0.83 | 0.52 / 0.55 | 0 |
| OT bg9 cliff town | 0.67/0.24/0.09 | 18.7 | 27.3 | 15.8 / 41.2 | −1.9 / 25.1 | 27.0 | 0.173 | – | – | – | 0.25–0.67 | 0.64 / 0.60 | 0 |
| OT bg10 theatre (dark) | 0.93/0.06/0.01 | 10.5 | 9.3 | 11.3 / 39.4 | 0.5 / 28.3 | 27.8 | 0.035 | – | – | – | 0.50–0.67 | 0.44 / 0.46 | 0 |
| OT tavern (dark) | 0.91/0.07/0.02 | 13.2 | 7.8 | 8.0 / 37.4 | 0.0 / 28.1 | 28.1 | 0.107 | – | – | – | 0.33–0.83 | 0.39 / 0.48 | 0 |
| **OT store median (bg1–10)** | **0.51/0.33/0.14** | 18.5 | **36.6** | **14.8 / 37.2** | **1.9 / 16.2** | — | **0.142** | — | — | — | middle third | **0.54 / 0.51** | — |

DoF checked at matched internal resolution (both downsampled to about 640×360, then the same profile; band sharpness
relative to max, top band to bottom band):
- Orbkin cave: `0.68 0.79 0.91 1.0 0.90 0.87 0.86 0.90 0.86 0.82 0.81 0.75`
- Orbkin meadow: `0.54 … 0.71`
- Octopath bg4: `0.64 0.54 0.56 0.54 0.82 0.97 1.0 0.94 0.46 0.32 0.26 0.19`
- Octopath bg1: `0.59 … 1.0 0.67 0.51 0.31 0.04`
- Fan art: flat, 0.75–1.0. Its first band is the letterbox.

**At matched resolution, Orbkin has almost no tilt-shift. Octopath blurs the foreground hard. The fan art has hardly any
depth of field.**

### 3.6 Reading the table
- **Value.**
  - Octopath store shots are **dark-dominant**: median notan 0.51/0.33/0.14 and L\* mean 37. The light is a minority,
    concentrated in the focus band.
  - Orbkin cave (0.37/0.42/0.21, L\* 43) and the fan art (0.40/0.42/0.18) are **mid-dominant**.
  - Meadow (0.51/0.29/0.20) is close to Octopath's structure.
- **Saturation.** Orbkin's chroma p95 of about 49–50 in the cave and meadow is above every Octopath store shot except the
  blue night cathedral (48). The Octopath median is 37 and the fan art is 37. Mean chroma is 24–29 against an Octopath
  median of 15.
- **Temperature.**
  - Orbkin's lights are very yellow: b\* about 36 against an Octopath median of 16 (max 29) and the fan art's 28.
  - Orbkin's cave has essentially **no cool pixels** (0.2 %). Octopath's median is 14 %. Even its warm desert (1 %) and
    village (0.1 %) keep their lights at b\* ≤ 29.
  - Shallows (cool share 0.71) is the exception: it is a cool scene like bg2.
- **Focal.**
  - Octopath sprites are **not** more saturated than the ground (focal chroma ratio about 1.0).
  - They are usually **darker** than the lit ground they stand on (ΔL −6 to −32).
  - What singles them out is **edge contrast** (edge ratio 1.8–9.5) and the **focus band**: everything else is blurred.
  - Orbkin's sprites already have the edge contrast (2.0–3.1) and the same negative ΔL. What they lack is the blur around them.
- **UI.** Orbkin's desk HUD covers 25 % of the frame, the fan art's 19.5 %. Octopath's battle HUD could not be measured
  (no in-battle store shot was available); §8 explains how to get one.

---

## 4. Anchors for the gate (replacing the single fan art)

The judge-calibration findings stand:
- the pairwise gate compares **candidate against the last accepted Orbkin frame**, guarded by a canary;
- anchors only add a quality-bar context (the `full_ref` condition) and supply sealed numbers for the verifier.

Calibration also showed:
- the fan art wins only at thumbnail size (6/6 at 640 px) and loses at native size (2/6 in crops: "smeared pixels, mixed
  resolutions");
- showing it flips the UI verdict toward its FRLG-style HUD.

**Recommended set** (sealed: only the verifier reads it):

| Anchor | Frame | Scale shown to the judge | Why |
|---|---|---|---|
| **A1** | Octopath `victory.webp` (YouTube frame of an Octopath battle-victory camera, 1916×1079) | **640-px thumbnail** of the whole frame, plus a **2× nearest crop of the sprite group** (it is a clean sprite: phase-locked 5–8 px texels, 31–35 texels tall) | The closest real HD-2D frame to Orbkin's battle camera: low angle, 3–4 sprites at 15–24 % of frame height, strong tilt-shift (top 0.14, bottom 0.44), bright sky, warm and cool split. It shows the "HD" half: smooth bokeh and haze over crisp sprites |
| **A2** | Octopath store shot `bg4.webp` (desert, 3840×2160), or `bg1.webp` (village terraces) as a variant | **640-px thumbnail only** | An official store screenshot with clean provenance. Shows the focus band in the middle third, dark/mid/light value masses, sprites at 10 % height, environment texel = sprite texel. `bg1` adds diorama terraces close to Orbkin's meadow and cave |
| **A3** | Fan art (game area y 108–1236) | **640-px thumbnail only, never native** | Same genre layout (creature battle, FRLG HUD, cave with light shafts) and the scene Orbkin's cave imitates. Its pixel-level flaws are hidden at thumbnail size, and the calibration showed it wins there |

Rules:
- **Thumbnail versus native.**
  - Anchors are compared at 640 px for composition, values, light and DoF.
  - Native-size crops are allowed **only from A1's sprites**, because they are clean.
  - Never use native crops of A3, because they reward smear.
  - Never use Octopath environment crops for texel comparisons: WebP compression and DoF blur hide the texels.
- **Per-scene anchors.**
  - Cave and volcanic: A1 + A3.
  - Meadow, flowers and hollow: A1 + A2 (`bg1`).
  - Coast and shallows: A1 + `bg3` (harbour, cool share 0.11) or `bg2` (cool night).
  - Never send more than 3 anchors per call (the judge-calibration image-count limits apply).
- **Do not judge the UI against an anchor.** A1 and A2 have no HUD, and A3's HUD biases the verdict. The UI goes through
  its own no-reference lens (see `ui-hud-typography.md`).
- Re-run the canaries with each new anchor set before trusting it. Use the judge-calibration protocol: `soft`, `desat`,
  `flat` and `noise` degradations must still lose.

---

## 5. Private storage rule (to encode in the skills)

1. **Never put copyrighted reference images in the repo, a skill, an artifact or any upload.** That covers:
   - Octopath store shots and video frames;
   - sprite rips;
   - the fan art (Nintendo IP plus someone else's work).

   The `.claude/settings.json` deny rules stay as they are.
2. **Private board location**: outside the repo, e.g. `~/.local/share/orbkin-refboard/` or the session scratch
   `refboard/ot1/`. Use a manifest `refboard.json` with, per file: path, sha256, source repo and commit, upstream origin,
   licence status ("all rights reserved — private study"), and the anchor role. The manifest holds no pixels, so it *may*
   live in the repo under `game/tools/verify/sealed/` as long as it contains only hashes, measured numbers and source URLs.
3. **Sealed from the generator (Goodhart).** This follows the rule in `agent-visual-method.md` and `judge-calibration.md` §7.
   - The generator session never reads the board images or the sealed numbers.
   - It sees only the critic's located text ("foreground sharp to the bottom edge; lights too yellow").
   - The gate and verifier load the images at run time from the private path.
   - A deny rule for the sealed path (`Read(game/tools/verify/sealed/**)`) needs the owner's approval to add.
   - **If the private board is missing** (a fresh machine, a cloud session), the gate falls back to Orbkin-only pairwise plus
     sealed numbers, and says so in its report.
4. **Numbers are fine to publish; designs are not.** Measured statistics (notan shares, b\*, texel ratios) are facts and can
   go into skills as targets *ranges*. Never write "make it look like Octopath's village" with layout specifics, and never
   copy character, creature or UI designs.
5. **Provenance before use.** Any new board image needs a recorded origin:
   - store or press pages, or the owner's own screenshots of games they own;
   - no "free full version" download sites, no archives with executables (`sirex499/Sea-Of-Stars-Full-Version` is a lure).
   - Fetch images only from hosts the owner has allowed. No camo or other proxy workarounds.

---

## 6. Where Orbkin's numbers should move

These are ranges, not a single target. They are *verifier-side* numbers, not generator instructions.

| Quantity | Orbkin now | Real HD-2D (Octopath) | Fan art | Move toward | Confidence that it matters |
|---|---|---|---|---|---|
| Sprite texels tall (people) | 31–42 | 32–34 (fixed) | 31–55 (mixed) | **keep 32–44**. Kin: stage 1 at 24–28 is fine | high (already matches) |
| Sprite texel as a fraction of frame height (battle) | 1/180 | 1/135–1/218 | 1/282 | **keep** (1/180–1/220). Don't go finer for the sake of it | high |
| Environment texel : sprite texel | 1.00 | 1.00 | n/a | keep 1.0 | high |
| **DoF: bottom and top band sharpness ÷ peak (matched res)** | 0.71–0.82 | 0.15–0.6 (median 0.5) | flat | **≤ 0.5 at the bottom band, ≤ 0.7 at the top**, with the focus band on the subjects (middle third). Blur at **full output resolution** after the nearest upscale | medium-high (signature look). Judge effect untested: A/B it |
| Bloom, haze, shafts | quantised to 640×360 | smooth, full resolution | smooth | composite at device resolution over the pixel buffer | medium |
| Chroma p95 | 49–50 (cave, meadow) | median 37 (18–48) | 37 | **≤ 40**, mean about 15–22 | medium-high |
| b\* of lights (top 20 % L) | 36 (cave, meadow) | median 16, max 29 | 28 | **≤ 28** | medium-high |
| Cool share (b\* < 0) in warm scenes | 0.2 % (cave) | 0.1–35 %, median 14 % | 5 % | **≥ 5 %** (cool ambient in shadows and far planes) | medium |
| Notan (dark/mid/light) | cave 0.37/0.42/0.21 | median 0.51/0.33/0.14 | 0.40/0.42/0.18 | cave about 0.45/0.37/0.18: a darker frame with the light as a minority pool | medium |
| Focal chroma ratio | 0.88–1.07 | ≈ 1.0 | 1.23 | no target (Octopath does not use chroma for focus) | low |
| UI share (desk battle) | 0.25 | (unmeasured) | 0.195 | **≤ 0.20** | medium |
| UI pixel : sprite texel | 1 : 2 | vector UI | ≈ 1 : 1 | choose deliberately: either a 1:1 pixel font, or a clean high-res UI as HD-2D does (see `ui-hud-typography.md`) | low-medium |

---

## 7. Implications for Orbkin

1. **Stop treating the fan art as the bar.** It is a one-person AI-assisted browser demo with Nintendo IP, mixed sprite
   resolutions and soft textures. Keep it only as a thumbnail mood and layout anchor (A3).
2. **The sprite pipeline's density is already right.** People at 32–44 texels and 1/180 of frame height sit inside real
   HD-2D battle-camera numbers. Don't spend effort making sprites "higher res". This also settles the hd2d-pixel open question.
3. **The biggest measurable gap is the "HD" half.** Real HD-2D keeps textures and sprites pixel-crisp but renders depth of
   field, bloom, haze and light shafts **smoothly at output resolution**, with a strong foreground blur. Orbkin does
   everything inside the 640×360 buffer and its sharpness profile is almost flat.

   Experiment to run, in-game A/B with the pairwise gate and the owner:
   - render the scene at 640×360 with nearest filtering;
   - upscale to device pixels;
   - **then** apply a depth-aware tilt-shift (bottom band about 0.3–0.5 of peak sharpness) plus bloom and god rays at full
     resolution. Use the low-resolution depth buffer, upscaled.
   - Keep sprites and the focus band crisp.
   - Watch out: this costs full-resolution fill-rate on phones (see `mobile-perf-budget.md`). A half-resolution blur
     composited over the nearest upscale may be enough.
4. **Grade toward Octopath's colour statistics.**
   - lights at b\* ≤ 28 (not 36);
   - chroma p95 ≤ 40;
   - some cool pixels (≥ 5 %) in the shadows and the far plane even in warm arenas;
   - a darker overall frame with the light as a minority pool (cave dark share 0.37 → about 0.45).

   These are cheap uniform changes in the grade. Gate them with the pairwise judge: calibration showed raw metrics alone do
   not predict judge preference.
5. **Optional, worth a test: sprite normal maps.** Octopath ships a nearest-filtered normal map per sprite. Orbkin bakes
   lighting into its sprites (toon bands from the arena key). Dynamic sprite normals would let move-FX lights and fire glows
   light the sprites. That is lower priority than items 3 and 4.
6. **UI.** Bring the desk HUD from 25 % down to ≤ 20 % of the frame, and choose the UI pixel scale deliberately. The current
   font pixel is half a sprite texel. Hand this to the UI/HUD angle.
7. **Reference board as a skill asset.** The `orbkin-art-direction` skill should:
   - name the anchor *roles* (A1 battle camera, A2 field store shot, A3 layout thumbnail), the measurement scripts and the
     target *ranges*;
   - **not** contain the images.
   - The verifier's sealed manifest holds the hashes and numbers.

---

## 8. Open questions / next steps
- **Demo code.** Are the demo's environment textures and sprites AI-generated? Was the "this art style" original an AI
  image? This needs the demo site (`pokemon-battle-sim-1vq.pages.dev`) and x.com, both blocked here. The owner could open
  them in a browser: view-source, look at the asset folder names, and read the quoted post.
- **HUD share of real HD-2D battles** (Octopath I/II, Triangle Strategy, DQ3 HD-2D, Live A Live). No in-battle store shot
  was reachable. Cleanest route: the **owner takes his own screenshots** of games he owns (Switch: Album → PC; Steam: F12) and
  drops them into the private board. `measure_all.py` handles the rest. Alternatively, allowlist `shared.akamai.steamstatic.com`
  for store screenshots.
- **Sea of Stars and Cassette Beasts** (sprite-in-3D rather than HD-2D proper): no frames, no verified numbers. The "360p"
  claim for Sea of Stars is a forum post.
- **Would judges and humans actually prefer the full-resolution DoF and bloom composite?** It is the top recommendation
  from these numbers, but it has not been A/B tested.
- **Octopath II, Triangle Strategy and DQ3: do they keep 22 texels/m and 32-texel humans?** Probably (same Asano team
  pipeline, UE4), but not verified. Triangle Strategy's units look slightly smaller on screen.
- The victory frame is a YouTube frame (compression). Re-measure A1's sprite pitch on a cleaner capture if the owner
  provides one.

---

## 9. Files (all in scratch, private)
`/tmp/claude-0/-home-user-gravity-innovation/a5440fec-78d9-5c47-821a-56c84521c2ff/scratchpad/refboard/`

| Path | What |
|---|---|
| `ot1/` → `gh/Emorque_Octopath-Traveler-UI/img/` | 10 Octopath PS Store screenshots (bg1–bg10, 3840×2160), tavern (4K, YouTube) and victory (1916×1079, YouTube). **Private, copyrighted, never distribute** |
| `gh/Emorque_Octopath-Traveler-UI/sprites/` | 8 Octopath field-sprite rips (44×50) |
| `gh/mastermind1919_OctoOverworldSprites/` | blobless clone. Only text read: README, `Technical Stuff/*.md`. Binaries never checked out |
| `scripts/pitch.py`, `sprite_texel.py`, `sprite_fft.py`, `grid_phase.py`, `depth_pitch.py`, `native_res.py`, `measure_all.py`, `gridview.py` | measurement tools (numpy + Pillow, `python3 -I`) |
| `spec.json`, `metrics.json` | measurement inputs and outputs for all 16 frames |
| `board_compare_PRIVATE.png` | 640-px side-by-side of A1, A2, A3 and Orbkin cave, meadow and shallows (private) |
| `thumbs/` | forensic crops (fan-art shelves, sprites, Geodude/Brock; Octopath sprites and castle floor) |

SHA-256 of the board (for the sealed manifest):

| File | SHA-256 |
|---|---|
| `bg1.webp` | `a47bbb1a5b90459855786eadedde506c970fad50992d6bbcf5dc2ace0758f7a1` |
| `bg2.webp` | `ac001bf63a88ce1bfd6b4f0a168de4860d72a7a9a99da46fc3b2d62099f1e8fb` |
| `bg3.webp` | `f6570920f7d4332953555d92afe7e9f1323e6b8c7c98f34ed4ca80b48ba14a62` |
| `bg4.webp` | `a438f2e9af0b6e92c600d9aa17a9132160aad8b82d71fae06a001327b0f82a48` |
| `bg5.webp` | `932d55f9be72428b1f9914233e48527a00b4ed69bda8c3c8723c15ca7e83ef3a` |
| `bg6.webp` | `bd12ed59c015721ba1a821c8d5ff1f0d343be88f71304523d505f983a178ab49` |
| `bg7.webp` | `2fac9f977e18e81a6f6ccf86024f2fd0a079e3c18e3147bc338cb4fc1236dce8` |
| `bg8.webp` | `8501eeeb7fc64c876210423f449ce163b3e8b865f432851f35f75ea1ca340cf2` |
| `bg9.webp` | `b1fd727b9f4ff7ef585253773eee432e7cdca5ee424cd155b71d51b7025dcfa9` |
| `bg10.webp` | `64886b27615c67aed67dc355e5206a772cc5d8bb52f90b090e3e1a15c65f8f04` |
| `tavern.webp` | `553e35aa90ab8ebb7f2b85b41c16bdc97dd35376ffc8e38dff2ed65112b8ce1c` |
| `victory.webp` | `4e44d607fe206752ed823a19142e809f13da8196143bc347be48e224293313ca` |
| `reference.png` | `6ea48c9cf17892b574d26dd69359bcb9ee440c38e2219c2086d75e5cdb2d7b8f` |



Reproduce:
```bash
cd scratchpad/refboard
python3 -I scripts/measure_all.py $PWD/scripts ../jc/scripts spec.json metrics.json
python3 -I scripts/sprite_fft.py $PWD/scripts ot1/bg4.webp '{"s1":[1860,1130,2005,1352]}'
python3 -I scripts/grid_phase.py $PWD/scripts ../hd2d/reference.png "{'charmander':(760,720,920,860)}" 2,4,8
```

## 10. Sources
- [Nag Alluri (@nagk01) on X, status 2103596354631340522](https://x.com/nagk01/status/2103596354631340522). Text via search index; the page is unreachable from here.
- `pokemon-battle-sim-1vq.pages.dev` ("Rock Gym"). Listed in the search index; blocked here.
- [Emorque/Octopath-Traveler-UI](https://github.com/Emorque/Octopath-Traveler-UI). README "Sources": front-page images from the [PS Store page for OT](https://store.playstation.com/en-us/concept/10009066/), the victory and tavern backgrounds from YouTube frames, sprites from The Spriters Resource. Commit `54d8c31`, 2024-12-10.
- [mastermind1919/OctoOverworldSprites](https://github.com/mastermind1919/OctoOverworldSprites). Commit `f232fa6`, 2021-02-20. Technical README and CustomSpriteDB notes (UE 4.18.2, texture settings, quad floats).
- [haifengkao/OctopathParse](https://github.com/haifengkao/OctopathParse): pak/uasset parser that converts DXT5 to PNG. Not used, since no game files.
- Digital Foundry Octopath analysis via [NintendoLife](https://www.nintendolife.com/news/2018/07/video_octopath_traveler_earns_digital_foundryrs_respect_for_blending_old_with_new), [MyNintendoNews](https://mynintendonews.com/2018/07/18/digital-foundry-take-on-octopath-traveler-for-nintendo-switch/), [GameFAQs](https://gamefaqs.gamespot.com/boards/189706-nintendo-switch/76818599), [CheerfulGhost recap](https://cheerfulghost.com/jdodson/posts/3814/digital-foundry-looks-at-the-tech-behind-octopath-traveler) (secondary).
- [RPG Site: Triangle Strategy versions](https://www.rpgsite.net/feature/18245-which-is-the-best-version-of-triangle-strategy-ps5-xbox-switch-2-switch-pc-and-steam-deck-compared); [DQ3 HD-2D versions](https://www.rpgsite.net/feature/18345-which-is-the-best-version-of-dragon-quest-iii-hd-2d-remake-ps5-switch-2-xbox-switch-and-pc-tested); [Octopath Traveler 0 on Switch 2](https://www.rpgsite.net/feature/18921-octopath-traveler-0-steam-deck-vs-nintendo-switch-2-impressions-performance) (via search summaries).
- [GBAtemp Sea of Stars thread](https://gbatemp.net/threads/sea-of-stars-mobile-impressions.681045/) ("360p" claim, low confidence).
- [Spriters Resource: Octopath Traveler](https://www.spriters-resource.com/nintendo_switch/octopathtraveler/) (sheet sizes 512×256 to 1024×1024, via search snippets).
- Internal: `judge-calibration.md` (artgate metrics, the 640-px thumbnail finding, sealed-gate design), `showcases.md` §5.4 (corrected here), `hd2d-pixel.md` §12 open questions (answered here), `ui-hud-typography.md`.
