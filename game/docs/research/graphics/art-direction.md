# Art direction, composition, lighting & polish — what a seasoned art director checks, and how an agent can check it

Angle: `art-direction` · Research session S3 · 2026-10 · JSON summary: `art-direction.json`

**Why this matters for Orbkin.** Judges scored Orbkin at about 6/10 against an HD-2D fan-art battle reference. Most of the remaining gap is *not* triangle count or texture resolution. It is the decisions an art director makes before any asset exists: where the eye goes, which values are grouped together, which colours are allowed, and where the detail is left out. These are also the decisions an LLM agent makes worst by default (see `agent-visual-method.md`). This document lists the principles with sources, then turns them into **(1) a critique rubric an agent applies to a screenshot** and **(2) automated pixel checks** (a working script is included and was run on our screenshots).

How to read the confidence labels:
- **high**: canonical art or VFX teaching that many independent sources state the same way, or that I measured myself.
- **medium**: one good primary source, or a practitioner consensus I could not trace to a primary source.
- **low**: my own synthesis, or numbers I made up as starting thresholds that still need tuning.

Network note: most art-blog hosts (gamedeveloper.com, unrealengine.com, slynyrd.com, vfxapprentice.com) could not be fetched from this container. Their claims come from search-engine summaries and are cited by URL. I have marked where I could not read the primary text.

---

## 1. What a game art director actually evaluates (the "three reads")

Experienced reviewers judge a frame in a fixed order. When an earlier read fails, later polish cannot rescue it.

1. **Silhouette / shape read (≈ 32 px thumbnail).** Can you tell what is where from shapes alone?
   - Who is the player, and who is the foe?
   - Where is the floor?
   - Does each creature have a unique outline?
2. **Value / colour-block read (squint, ≈ 64–128 px).** Are there 3–4 big value masses, with the subject sitting on a contrasting one?
3. **Detail read (full resolution).** Do textures, sprites and FX reward a closer look *without* competing with reads 1–2?

The "three-read hierarchy" (silhouette at 32 px → colour blocking at a squint → detail, keeping only ornament that does not damage the first two) appears in many character-design guides ([skill page](https://skillselion.com/skills/omer-metin/skills-for-antigravity/character-design), [Binus DKV on silhouettes](https://binus.ac.id/bandung/dkv/?p=959), [neolemon](https://www.neolemon.com/blog/what-makes-good-character-design-unforgettable)). It is the standard studio "black-fill the silhouette" test. Confidence **high**: the idea is universal, though those particular pages are weak as authorities.

### 1.1 Value structure (the most important single property)
- **Readability comes from value, not hue.** Desaturate the frame: if shapes still separate, the values work. If everything collapses into one grey, the colour was carrying a job it cannot do ([Wayline pixel-art colour lesson](https://www.wayline.io/learn/color-palettes/1), [grayscale check, Designer's Field Guide](https://dataanddesign.substack.com/p/how-to-use-grayscale-a-quick-way)). **high**
- **Group values into 3–4 masses (notan).** A strong frame looks like a 3-value poster when squinted: one dominant band (often ≥ 50% of the area), one secondary band, and a small accent band. Avoid an even three-way split. Conventional painting rule; the [focal-point guide](https://jerwoodvisualarts.org/blog/how-to-choose-a-focal-point-in-painting/) and [Milan Art Institute critique list](https://www.milanartinstitute.com/blog/12-ways-to-self-critique-your-artwork-using-the-elements-of-art) state the squint test. **high**
- **The focal point gets the frame's highest local contrast.** The place with the strongest value, temperature, saturation and detail contrast becomes the focal point, and it works best "when the rest of the painting is more restrained" ([focal-point guide](https://jerwoodvisualarts.org/blog/how-to-choose-a-focal-point-in-painting/)). **high**
- **Depth planes get value plans.** Neil Blevins' concept-art lesson describes the classic schemes:
  - dark, near-silhouette foreground;
  - a mid-value, high-detail midground where the subject lives;
  - a background faded toward the fog/sky value.
  
  The reverse scheme (light foreground) also works, as long as the planes stay distinct ([Blevins FG/MG/BG](http://www.neilblevins.com/art_lessons/composition_fore_mid_back/composition_fore_mid_back.htm), via search summary). **high**

### 1.2 Composition and focal hierarchy
- **One primary focal point, one secondary, and everything else subordinate.** In a battle screen the primary is the *pair of creatures* (the gameplay subject). The secondary is the environment landmark that carries the mood (the window and its shafts, a tree, a throne).
  - Leading lines (stairs, rails, path edges, light shafts) should point *at* the creatures, not off-frame.
  - Unintended lines that pull the eye away are a standard critique item ([Milan Art Institute](https://blog.milanartinstitute.com/how-to-critique-art/)). **high**
- **Framing.** Darker or out-of-focus foreground elements at the frame edges (rocks, foliage, a rail) push the eye inward and add depth ([Wikipedia: Framing](https://en.wikipedia.org/wiki/Framing_(visual_arts)), [Blevins](http://www.neilblevins.com/art_lessons/composition_fore_mid_back/composition_fore_mid_back.htm)). **high**
- **Negative space and rest areas.** Leave areas deliberately quiet so the important element can breathe. Example: Dark Souls bonfire areas are "relatively clear of visual clutter" ([Wayline: Negative space](https://www.wayline.io/blog/negative-space-in-video-game-design)). **medium**
  - Corollary used by every environment lead: **detail density is a gradient.** It is highest near the focal point and gameplay space and lowest at the frame edges and in large planes.
  - "Uniform noise everywhere" is the signature of amateur and procedural environments. (My synthesis; no source quantifies it, so this is **medium/low**. I measure it below.)

### 1.3 Colour
- **Palette ramps hue-shift.** Shadows move toward cool or purple, highlights toward warm or yellow. Saturation peaks in the mid-tones and falls at the extremes; very bright, very saturated colours "burn the eyes", and very dark, very saturated colours look "heavy" ([Slynyrd Pixelblog 1 — Color Palettes](https://www.slynyrd.com/blog/2018/1/10/pixelblog-1-color-palettes), mirrored at [GameDev.net](https://www.gamedev.net/articles/visual-arts/color-palettes-r4964/)). **high**
  - Orbkin's `RAMPS` already hue-shift (HD2D.md), which is good.
- **Limited gamut per scene.** Pre-select a gamut (Gurney's *gamut mask*: a polygon on the colour wheel), and draw every colour in the scene from inside it. Accents outside it are allowed only on the focal point ([Lines and Colors on Gurney's gamut masking](https://linesandcolors.com/2011/09/19/james-gurney-on-gamut-masking/)). **high**
- **Temperature contrast is a lighting tool.**
  - Warm key with cool shadows, or cool key with warm bounce.
  - A scene where lights *and* shadows share one hue reads as "filtered" or monochrome (the "orange cave" problem).
  - Standard in Gurney's *Color and Light* and in lighting talks. **high**
- **Atmospheric perspective.** With distance, contrast falls, saturation falls, and value and hue converge on the sky or fog colour (usually cool, warm at sunset) ([Wikipedia: Aerial perspective](https://en.wikipedia.org/wiki/Aerial_perspective), [Britannica](https://www.britannica.com/art/aerial-perspective)). In an interior or cave, the equivalent is falloff into a dark or haze value. **high**
- **Colour budget for the subject.** Creature palettes are 2–3 colour blocks plus a dark accent (Orbkin's CREATURES.md already says this). The environment must leave a hue *free* for each creature to pop against. A fire fox on an orange rock floor is the canonical failure. **high** (it follows directly from the value and hue rules)

### 1.4 Lighting design
- **Key / fill / rim, adapted to games.** Three-point lighting breaks when the camera is not fixed. In encounters, use **rim lights and background lights to silhouette subjects** where a key light would be lost (David Shaver, GDC 2018 *Invisible Intuition*, as recapped by [Robert Yang's blog](https://www.blog.radiator.debacle.us/2018/03/gdc-2018-how-to-light-level-slides-and.html); session [GDC Vault 1025360](https://gdcvault.com/play/1025360/Level-Design-Workshop-Invisible-Intuition)). Our battle camera *is* fixed per layout, so true three-point lighting on the creatures is available to us. **high**
- **Dominant directionality.** The Last of Us lighting talk stresses one dominant light direction, ambient shadows and bounce ([GDC Vault 1020475](https://gdcvault.com/play/1020475/In-Game-and-Cinematic-Lighting)). One motivated key per scene; everything else supports it. **high**
- **Light and shadow carry readability and depth.** Sable's creative director called lighting "really important to readability and depth": light and shadow tell players where they are relative to surfaces ([Game Developer on Sable](https://www.gamedeveloper.com/marketing/how-shedworks-refined-the-art-of-sable-in-pursuit-of-readability), [GDC Vault: The Art of Sable](https://gdcvault.com/play/1027721/The-Art-of-Sable-Imperfection)). **medium** (secondary summary)
- **HD-2D specifics** (Octopath, Triangle Strategy, Live A Live):
  - flat-ish pixel sprites in a 3D diorama;
  - lighting and shadows interacting with the pixel environment;
  - point lights added for combat effects "because effects alone didn't look good enough";
  - strong tilt-shift DoF top and bottom;
  - selective bloom.
  
  Sources: [Wikipedia HD-2D](https://en.wikipedia.org/wiki/HD-2D) and Unreal spotlights ([Octopath I](https://www.unrealengine.com/spotlights/octopath-traveler-s-hd-2d-art-style-and-story-make-for-a-jrpg-dream-come-true), [Octopath II](https://www.unrealengine.com/en-US/developer-interviews/octopath-traveler-ii-builds-a-bigger-bolder-world-in-its-stunning-hd-2d-style)). A community reimplementation spec gives:
  - camera FOV 25–35°, pitch 35–45°;
  - 32/48-texel tiles, characters ≈ 1.5 tiles tall;
  - nearest filtering, a single directional light with sprite shadows, a high-threshold glow, and near/far DoF ([Godoiosis #176](https://github.com/Phaazoid/Godoiosis/issues/176)).
  
  **medium** (developer statements are high-level; the numbers come from a fan implementation)
- **God rays sparingly.** In the reference they are 2–4 distinct shafts with a visible source, and they land *on* the gameplay space. When they cover the subject they wash out its value contrast. Our squint test shows exactly this; see §4. **high** (measured)
- **Sea of Stars** ("retro plus"): pixel sprites with real-time dynamic lighting, coloured character highlights, shadows from charged attacks. The lighting is a selling point, and "the effects blend in without making it feel like a 3D effect overlaid on low-res 2D" ([Astrolabe feature](https://astrolabe.aidanmoher.com/astrolabe-feature-sea-of-stars-is/), [Megavisions art feature](https://www.megavisions.net/the-art-of-sea-of-stars-a-sea-of-pixels/), [Sabotage press kit](https://sabotagestudio.com/presskits/sea-of-stars/)). The integration test: light must hit sprites and world *in the same pixel grid and the same palette*. **medium**

### 1.5 Shape language and consistency
- **Shape semantics.** Round means friendly or young, square means sturdy or defensive, triangle or diagonal means dangerous or fast. Use them consistently across creatures *and* props; for example, the "spiky equals danger" affordance in Naughty Dog's level-design talk recap ([abhigameart recap](https://abhigameart.wordpress.com/2018/11/02/technical-wizardry/)). **high** (canonical)
- **Cast lineup test.** Put every creature side by side in black silhouette. No two should be confusable, and evolutions must change the silhouette rather than just the scale ([skill page](https://skillselion.com/skills/omer-metin/skills-for-antigravity/character-design)). Orbkin's CREATURES.md already sets "escalation ≠ scale-up". **high**
- **One world, one construction vocabulary.** Bevel size, texel density, outline rule, corner radius and palette must match across environment, characters, FX and UI. Mixed pixel sizes ("mixels") read as amateur in a release ([Flowlab forum rant on mixels](https://community.flowlab.io/t/mini-rant-stop-using-mixels/38287), [Unity PPU note](https://backiee.wasmer.app/http_gamedev_stackexchange_com/q/141609)). **high**

### 1.6 VFX readability (Riot's League of Legends VFX style guide, 2017)
Sources: summaries from [VFX Apprentice](https://www.vfxapprentice.com/blog/10-league-of-legends-vfx-design-tips), [Real-Time VFX](https://realtimevfx.com/t/official-league-of-legends-vfx-style-guide/3392), [Polycount](https://polycount.com/discussion/192857/official-league-of-legends-vfx-style-guide) and [Deck.gallery](https://www.deck.gallery/league-of-legends-2017/). **high** (widely circulated official guide; I read summaries, not the PDF.)
- Goals: clarity for gameplay, less clutter, support the theme, delight.
- The guide's five areas are gameplay, value, colour, shape and timing.
- **Primary versus secondary elements:**

  | | Primary (the readable "what happened") | Secondary |
  |---|---|---|
  | Value range | high | lower |
  | Contrast | strong, in value or saturation | weaker |
  | Silhouette | clear | blurrier |
  | Opacity | high | more transparent |
  | Shape | strong | simpler |
  | Motion | intense | subtler |
  | Size | — | smaller |

- **Visual weight equals gameplay weight.** A weak move looks small; a big move looks big.
- **Timing:** anticipation → climax → dissipation. Keep durations short so effects do not linger and clutter.

### 1.7 UI–art cohesion
- Non-diegetic UI should still *belong to the world*: palette, typography, iconography and frame motif drawn from the game's art direction ([Unity blog on immersive UI](https://blog.unity.com/games/how-to-immerse-your-players-through-effective-ui-and-game-design), [UI art bible how-to](https://designcaitlin.substack.com/p/how-to-write-a-ui-art-bible)). An inconsistent visual style between UI and world is listed as a common immersion breaker ([Wayline](https://www.wayline.io/blog/your-ui-is-killing-immersion-fix-it)). **medium/high**
- For a pixel world, the classic JRPG battle UI follows four rules:
  - **framed panels** (nine-slice borders at the *same* texel scale as the world);
  - **a limited UI palette** sampled from the scene (cream / ink / one accent);
  - **one** typographic voice (a pixel or pixel-friendly face at integer scale);
  - colour reserved for *state* (HP green / amber / red, type badges).
  
  This is my synthesis of the reference style; no source found. **medium**

### 1.8 The "AAA polish" checklist (consolidated)
No single authoritative public checklist exists. The list below merges the sources above with standard studio review practice. Confidence **medium**.
1. The frame reads at 1/8 scale: subjects found in under 1 s.
2. The squint shows 3–4 value masses, and the subject sits on a contrasting mass.
3. The focal point holds the max local contrast, saturation and detail; the edges are calmer.
4. One motivated key light; shadows have a colour (not grey or black); temperature contrast between key and shadow.
5. Depth planes are separated by value, saturation or haze; framing elements sit at the edges.
6. Palette within a gamut; accents only on subjects, UI state and FX.
7. Consistent texel and pixel density and one outline rule across everything; no mixels, no shimmering.
8. Ground contact: contact shadows or AO under every object; nothing floats unintentionally.
9. Silhouettes unique across the cast; no symmetric stiff poses at rest (weight shift, overlap).
10. FX follow primary/secondary hierarchy and timing; visual weight equals gameplay weight.
11. UI belongs to the world (palette, frame, type); text crisp at integer scale; layout doesn't cover the subject.
12. Motion polish: idle life (breathing, secondary motion, ambient particles), camera easing, hit-stop, squash and stretch. Orbkin already has much of this.
13. No "placeholder tells": default-looking materials, flat grey shadows, uniform noise, repeated tiles visible at a glance, z-fighting, aliasing crawl.

---

## 2. Critique rubric for an agent (apply to every screenshot)

Score each item 0–2 (0 = fails, 1 = partial, 2 = meets) and **write one sentence of evidence per item that points at a location in the image**. Total out of 30; map ×(10/30) to the judges' 10-point scale. Always produce the derived images first (squint, notan, silhouette, palette; §3). Then judge *those* in addition to the raw frame. This counters the VLM's detail bias (see `agent-visual-method.md`).

| # | Criterion | 2 = meets when… | Auto-check (§3) |
|---|---|---|---|
| R1 | **Thumbnail read** | At 1/8 scale you can name the player kin, the foe kin and the floor within one look | squint image |
| R2 | **Value grouping** | Notan shows a dominant band ≥ 45% and an accent band ≤ 20%; the subject sits on a contrasting band | `notan_dark_mid_light` |
| R3 | **Focal contrast** | The creature region has clearly higher local contrast than its surroundings: ratio ≥ 1.3 in L-std, chroma or edge energy | `focal_*` ratios |
| R4 | **Subject/ground separation** | Creature mean L or hue differs from the floor behind it (ΔL ≥ 15, or a different hue family) | `focal_mean_L` |
| R5 | **Detail gradient / rest areas** | Edge energy varies across the frame; quiet zones exist away from the action | `detail_uniformity_cv` ≥ 0.45 |
| R6 | **Palette & gamut** | 6–12 dominant colours, hue-shifted ramps, an intentional scheme (analogous + complement accent) | palette swatch, hue hist |
| R7 | **Temperature contrast** | Lights and shadows differ in temperature (Δb* between shadows and lights ≥ 15, or a blue/purple shadow hue) | `b_star_shadows_vs_lights` |
| R8 | **Depth planes** | Foreground framing, midground subject and background each distinct in value or saturation; atmospheric falloff | manual + crop stats |
| R9 | **Light motivation** | One clear key with a visible or obvious source; shafts ≤ 4, not over the subject | manual |
| R10 | **Shape language** | Props and creatures share a construction vocabulary; no "default primitive" silhouettes (bare cubes, spheres) | silhouette crop |
| R11 | **Pixel/texel consistency** | One texel size; no mixels, rotated pixels or blurry upscales | zoom crops |
| R12 | **Ground contact** | Every character and prop has a contact shadow or AO | zoom crops |
| R13 | **FX readability** | Primary FX element is high-contrast and opaque; secondaries are softer; the effect is sized to its gameplay weight | FX capture |
| R14 | **UI cohesion** | UI palette and type derive from the world; frames match the texel scale; UI does not cover the subject | UI crop |
| R15 | **Life & polish** | Idle motion, particles and camera polish (judge from a 3–5 frame strip, not one still) | frame strip |

Rubric rules for the agent:
- Never score above 1 on an item without naming *where* in the image the evidence is.
- Always list the **three biggest deltas versus the reference**, ranked by visual impact, before proposing fixes.
- Compare against the reference *side by side at the same size*, never from memory.

---

## 3. Automated checks (working script, Pillow + numpy only)

`artcheck.py` was run in this container and its source is reproduced in full below. It reports:
- **Value structure:** L* percentiles and histogram; 3-band notan shares.
- **Colour:** Hasler–Süsstrunk colourfulness ([EPFL record](https://infoscience.epfl.ch/record/33994?ln=en); the formula is in [ColorNet, arXiv 1908.08505](https://arxiv.org/pdf/1908.08505); calibration ~15 "slightly", ~82 "highly", ~109 "extremely" colourful per [HSM3](https://github.com/DrNickRedfern/HSM3)). Also mean and p95 chroma, a 12-bin hue histogram, and k-means palette extraction in CIELAB.
- **Temperature split:** mean b* (blue↔yellow) in shadows (L < 30) versus lights (L > 70).
- **Detail distribution:** gradient energy over a 6×8 grid, plus its coefficient of variation (CV) as the uniformity metric.
- **Saliency:** spectral-residual saliency (Hou & Zhang 2007): peak centroid and spread.
- **Focal metrics** for a given focal box: saliency ratio, local L-std, mean L, chroma and edge energy, inside versus a surrounding ring.
- **Debug images:** `_notan.png` (3-value), `_squint.png` (1/8 box-downsampled grey), `_saliency.png` and `_palette.png`. Feed these to the VLM critic.

Caveat: colourfulness has *no* linear relation to aesthetics in general ([Amati, Mitra & Weyrich, UCL study](https://reality.tf.fau.de/projects/image-colourfulness/image-colourfulness.pdf)). Use these numbers to compare *against the reference image* and between iterations, not as absolute goals. Spectral-residual saliency on a 64-px thumbnail is crude: it found the window and beams, not the creatures. Treat the focal ratios (contrast, chroma, edge) as the more reliable signals.

```python
#!/usr/bin/env python3
"""artcheck.py — objective art-direction metrics for a game screenshot.
Usage: python3 artcheck.py IMG [--crop x0,y0,x1,y1] [--focal x0,y0,x1,y1] [--out prefix]
(all boxes in 0..1 fractions; crop is applied first, focal is relative to the crop)"""
import json, argparse
import numpy as np
from PIL import Image, ImageFilter

def srgb_to_linear(c):
    c = c/255.0
    return np.where(c <= 0.04045, c/12.92, ((c+0.055)/1.055)**2.4)

def to_lab(rgb):
    lin = srgb_to_linear(rgb.astype(np.float64))
    M = np.array([[0.4124,0.3576,0.1805],[0.2126,0.7152,0.0722],[0.0193,0.1192,0.9505]])
    xyz = (lin @ M.T) / np.array([0.95047,1.0,1.08883])
    f = np.where(xyz > 0.008856, np.cbrt(xyz), 7.787*xyz + 16/116)
    return np.stack([116*f[...,1]-16, 500*(f[...,0]-f[...,1]), 200*(f[...,1]-f[...,2])], -1)

def kmeans(X, k=8, it=20, seed=0):
    rng = np.random.default_rng(seed); C = X[rng.choice(len(X), k, replace=False)]
    for _ in range(it):
        lab = ((X[:,None,:]-C[None])**2).sum(-1).argmin(1)
        for j in range(k):
            m = X[lab==j]
            if len(m): C[j] = m.mean(0)
    return C, np.bincount(lab, minlength=k)/len(X)

def spectral_residual_saliency(gray):          # Hou & Zhang 2007, 64-px-wide thumbnail
    h, w = gray.shape
    g = np.asarray(Image.fromarray(gray.astype(np.uint8)).resize((64, max(8, int(h*64/w))), Image.BILINEAR), float)
    F = np.fft.fft2(g); A = np.log(np.abs(F)+1e-9); P = np.angle(F)
    Ap = np.pad(A, 1, mode='wrap')
    avg = sum(Ap[i:i+A.shape[0], j:j+A.shape[1]] for i in range(3) for j in range(3))/9
    sal = np.abs(np.fft.ifft2(np.exp(A-avg+1j*P)))**2
    img = Image.fromarray((sal/sal.max()*255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(2.5))
    return np.asarray(img.resize((w, h), Image.BILINEAR), float)/255

def main():
    ap = argparse.ArgumentParser(); ap.add_argument('img'); ap.add_argument('--focal')
    ap.add_argument('--crop'); ap.add_argument('--out'); a = ap.parse_args()
    im = Image.open(a.img).convert('RGB')
    if a.crop:
        x0,y0,x1,y1 = map(float, a.crop.split(',')); W,H = im.size
        im = im.crop((int(x0*W), int(y0*H), int(x1*W), int(y1*H)))
    rgb = np.asarray(im); H, W, _ = rgb.shape
    lab = to_lab(rgb); L = lab[...,0]; C = np.hypot(lab[...,1], lab[...,2]); r = {}
    pct = np.percentile(L, [1,5,25,50,75,95,99])
    r['L_percentiles_1_5_25_50_75_95_99'] = [round(x,1) for x in pct]
    r['value_range_p5_p95'] = round(pct[5]-pct[1], 1)
    r['notan_dark_mid_light'] = [round(float(m.mean()),3) for m in (L<33, (L>=33)&(L<66), L>=66)]
    rg = rgb[...,0].astype(float)-rgb[...,1]; yb = 0.5*(rgb[...,0].astype(float)+rgb[...,1])-rgb[...,2]
    r['colorfulness_hasler'] = round(float(np.hypot(rg.std(), yb.std()) + 0.3*np.hypot(rg.mean(), yb.mean())), 1)
    r['chroma_mean_p95'] = [round(float(C.mean()),1), round(float(np.percentile(C,95)),1)]
    hue = (np.degrees(np.arctan2(lab[...,2], lab[...,1]))+360) % 360
    hh = np.histogram(hue[C>15], bins=12, range=(0,360))[0]; hh = hh/max(1, hh.sum())
    r['hue_hist_12x30deg'] = [round(x,3) for x in hh]; r['hue_dominance_top2'] = round(float(np.sort(hh)[-2:].sum()), 3)
    mb = lambda m: round(float(lab[...,2][m].mean()),1) if m.any() else None
    r['b_star_shadows_vs_lights'] = [mb(L<30), mb(L>70)]
    Cn, wts = kmeans(lab.reshape(-1,3)[::max(1, H*W//40000)].copy(), 10)
    r['palette_lab_weight'] = [[*map(lambda v: round(float(v)), Cn[i]), round(float(wts[i]),3)] for i in np.argsort(-wts)]
    e = (np.abs(np.diff(L,axis=1))[:-1,:] + np.abs(np.diff(L,axis=0))[:,:-1])
    th, tw = 6, 8
    tiles = np.array([[e[i*e.shape[0]//th:(i+1)*e.shape[0]//th, j*e.shape[1]//tw:(j+1)*e.shape[1]//tw].mean()
                       for j in range(tw)] for i in range(th)])
    r['edge_energy_mean'] = round(float(e.mean()),2)
    r['detail_uniformity_cv'] = round(float(tiles.std()/tiles.mean()), 3)   # low => detail spread evenly
    sal = spectral_residual_saliency(L/100*255)
    ys, xs = np.unravel_index(np.argsort(sal.ravel())[-int(sal.size*0.02):], sal.shape)
    r['saliency_peak_centroid_frac'] = [round(float(xs.mean()/W),3), round(float(ys.mean()/H),3)]
    r['saliency_spread'] = round(float(np.hypot(xs.std()/W, ys.std()/H)), 3)
    if a.focal:
        x0,y0,x1,y1 = map(float, a.focal.split(',')); pad = 0.08
        fm = np.zeros((H,W), bool); fm[int(y0*H):int(y1*H), int(x0*W):int(x1*W)] = True
        ring = np.zeros_like(fm)
        ring[max(0,int((y0-pad)*H)):int((y1+pad)*H), max(0,int((x0-pad)*W)):int((x1+pad)*W)] = True; ring &= ~fm
        r['focal_saliency_ratio'] = round(float(sal[fm].mean()/max(1e-6, sal[~fm].mean())), 2)
        for name, arr in (('L_std', None), ('mean_L', L), ('mean_chroma', C)):
            if arr is None: r['focal_L_std_in_vs_ring'] = [round(float(L[fm].std()),1), round(float(L[ring].std()),1)]
            else: r[f'focal_{name}_in_vs_ring'] = [round(float(arr[fm].mean()),1), round(float(arr[ring].mean()),1)]
        r['focal_edge_in_vs_ring'] = [round(float(e[fm[:-1,:-1]].mean()),2), round(float(e[ring[:-1,:-1]].mean()),2)]
    if a.out:
        Image.fromarray(np.where(L<33, 30, np.where(L<66, 128, 230)).astype(np.uint8)).save(a.out+'_notan.png')
        g8 = Image.fromarray((L/100*255).clip(0,255).astype(np.uint8))
        g8.resize((W//8, H//8), Image.BOX).resize((W, H), Image.NEAREST).save(a.out+'_squint.png')
        Image.fromarray((sal*255).astype(np.uint8)).save(a.out+'_saliency.png')
    print(json.dumps(r, indent=1))
main()
```

Two more checks every skill should include (simple to add):
- **Silhouette test for sprites.** Render each creature or character with an unlit black material on white at 32 / 64 px. Compute:
  - **solidity** (area divided by convex-hull area): blobby primitive builds sit near 0.85–0.95, and characterful silhouettes usually show more negative space;
  - **pairwise IoU** between cast members after normalising bounding boxes: flag pairs with IoU > 0.8 as confusable.
  
  This is my method; the thresholds are **low**-confidence starting values.
- **Reference delta.** Run `artcheck.py` on the reference and on our frame with the same crops, and report the deltas: notan shares, b* split, hue dominance, detail CV, focal ratios. This turns "looks less good" into "our lights and shadows are both orange (Δb* 13 vs reference X)".

---

## 4. What the checks say about current Orbkin screens (measured)

All runs used `docs/screenshots/hd2d/*.jpg`. The UI was cropped out where noted.

**Cave battle, desktop (`hd2d-desktop-trainer.jpg`)**
- Crop: playfield left of the UI. Focal box: the fox, the pebble and the hiker.

| Metric | Value | What it means |
|---|---|---|
| Notan dark / mid / light | 0.35 / 0.45 / 0.20 | Three almost-equal bands: no dominant mass |
| Hue histogram | **99.1%** of chromatic pixels in two adjacent 30° bins (orange–yellow) | The scene is effectively monochrome orange |
| Δb* shadows vs lights | 18.5 vs 31.6 | Shadows are just darker orange. No cool / plum shadow, even though the grade intends plum shadows |
| Focal vs ring: L-std | 19.2 vs 18.5 | Focal region is barely more contrasty than its surroundings |
| Focal vs ring: chroma | 35.3 vs 33.8 | Same |
| Focal vs ring: edge energy | 6.5 vs 5.3 | Same |
| Saliency peak | window / beam area | Not the creatures |
| Squint image | brightest mass = window + beams | The orange fox is mid-value on a mid-value orange floor; it is found by its outline, not by value |

**Meadow battle (`arena-meadow.jpg`, main desktop panel, UI cropped)**
- **Detail CV 0.195**: edge energy is almost uniform across the frame. Grass, terraces and trees are all equally busy, so there are no rest areas.
- Focal edge energy equals its surroundings (9.5 vs 9.6). Focal chroma is *lower* than its surroundings (29.6 vs 33.1).
- The yellow Flickwing and pale Breezel sit on similar-value dirt.
- This is the numerical signature of "noise as detail".

**Full frames, UI included (comparison only)**

| Arena | Dark-band share | Detail CV | Shadow b* | Notes |
|---|---|---|---|---|
| Scrub | 0.60 | 0.52 | +4.9 (warm) | Better grouping |
| Volcanic | 0.69 | 0.49 | −0.2 | Better grouping; shadows edge toward cool |
| Summit (night) | 0.81 | 0.88 | −10.7 (cool) | Strong grouping; real warm/cool split (+13.3 lights): the most "art-directed" arena by these numbers |

**Visual observations, by reading screenshots and code**
1. **Subject–ground collision.** The flame kin (orange) stands on orange-lit floor in front of orange rock; the spark kin (yellow) sits on ochre dirt.
   - The reference style separates creatures by value *and* complementary hue: a cool or neutral floor under warm creatures, or a rim light.
   - Fix candidates:
     - per-arena "subject backdrop" rules (floor patch under the kin gets the complementary, desaturated tone);
     - a rim light from the sprite baker's `SpriteLight.rim`, raised for warm-on-warm pairings;
     - a 1-texel darker outline colour taken from the *ground* ramp (selective outline).
2. **Shafts over the subject.** The beams cross the player's side of the field and become the brightest mass. Move the shafts so they *land beside* the creatures, or lower their intensity where they overlap the kin. Keep 2–3 shafts, not 4–5.
3. **Uniform-busy rock.** Every boulder face has the same fbm + chips + cracks density (`textures.ts: paintRock/paintBoulder`), so the whole wall is one texture-noise field.
   - The reference paints *big, simple lit planes* with a few accent cracks, and leaves the shadow sides almost flat.
   - Fix: modulate detail by light (lit faces get detail; shadow faces get 2–3 flat shades) and by distance from focus.
4. **No foreground framing plane.** The front edge (red rails, stair) is lit like the midground.
   - A dark, slightly blurred foreground lip or overhang (near-silhouette) at the bottom and corners would give the diorama a "window" and push the eye to the centre.
   - Tilt-shift is currently ≤ 1 px; that is fine for crispness, so use value rather than blur.
5. **UI does not belong to the world.** The battle buttons are candy-saturated flat pink, orange, green and violet with a modern sans font. They are the most saturated objects on screen and outrank the creatures.
   - The reference uses cream panels, dark ink, a pixel typeface and colour only for HP state.
   - Fix: UI palette sampled from the arena gamut; nine-slice pixel frames at the world texel scale; desaturated buttons with an accent only on the focused one. (See `ui-pixel/` screenshots.)
6. **Creature shapes** (lineup sheet): faceted ellipsoid bodies, cone ears and spikes, cylinder legs, nearly symmetric rest poses.
   - Silhouettes are readable but generic. Every species shares the same "ellipsoid + cones" construction, so shape language does not vary between lines.
   - Plateau analysis in `agent-visual-method.md`.

---

## 5. Concrete parameters and starting thresholds (tune against the reference)

All values in this section are **low/medium** confidence: they are starting points to calibrate on the reference frame, not laws.
- **Notan targets (battle playfield):**
  - dominant band 45–65%;
  - accent (lightest or darkest) band 8–20%;
  - subject on a contrasting band.
- **Focal box versus ring** (creatures versus surroundings): L-std ratio ≥ 1.3 *or* chroma ratio ≥ 1.3 *or* edge ratio ≥ 1.3, with at least two of the three ≥ 1.15.
- **Subject/ground ΔL\*** ≥ 15, or hue difference ≥ 60° with ΔL ≥ 8.
- **Detail CV** ≥ 0.45 for the playfield (meadow is currently 0.20).
- **Temperature split:** shadow b* at least 15 below light b*, *and* shadow b* ≤ 10 for warm scenes (that is, shadows lean neutral or cool).
- **Hue dominance:** the top two 30° bins < 85% of chromatic pixels. Reserve at least one hue family away from the environment for creatures and UI accents.
- **God rays:** ≤ 3 shafts. Peak additive contribution on the creature region ≤ +8 L*. The source is visible in frame or obvious.
- **Bloom:** emitters only (Orbkin already uses threshold 1.0 linear).
- **Outline:** one texel; colour is a darkened, hue-shifted ramp shade of the *adjacent* surface (selective outline), never pure black.
- **UI:**
  - 3–4 UI colours derived from the arena palette, plus HP state colours;
  - frame texel scale equals the world texel scale (2 device px at 720p);
  - one pixel-friendly face rendered at integer sizes.

## 6. Implications for Orbkin

1. **Adopt the rubric (§2) and `artcheck.py` (§3) as the gate for every graphics change.** Encode them in a `graphics-critique` skill:
   - capture a screenshot;
   - produce the squint, notan, palette and saliency images;
   - fill the 15-row rubric with located evidence;
   - compute deltas against the reference crops;
   - rank the top three fixes by impact.
   
   Do not let a VLM "glance and score".
2. **Fix composition before assets.** The cheapest big wins are art direction, not new geometry:
   - (a) complementary or neutral ground under each creature, plus rim light, for value/hue separation;
   - (b) move the shafts off the subjects and cut them to 2–3;
   - (c) a dark foreground framing plane;
   - (d) detail falloff (light- and focus-modulated texture detail);
   - (e) cool or plum shadow colour in the warm arenas (the summit grade already shows this works).
3. **Re-skin the battle UI into the world's pixel vocabulary** (cream / ink / one accent, pixel frames, pixel font). This is the single most "amateur-looking" element by the rubric (R14) and is cheap.
4. **Define a per-arena gamut**: a palette file listing allowed ramps plus the reserved accent hues for kin and UI. Add a unit test that fails if a painter emits colours outside the gamut. This prevents the 99%-orange cave.
5. **Shape-language pass on creatures.** Pick a distinct construction motif per line:
   - Flame: flowing teardrops and S-curves;
   - Terra: chunky trapezoids;
   - Tide: smooth ovals and spirals;
   - Spark: zig-zags;
   - Gale: crescents;
   - Flora: rounded leaves plus spikes for the evolved form.
   
   Then run the silhouette IoU test across the cast. Asymmetric rest poses (weight on one leg, head tilt) remove the "stiff toy" read.
6. **FX audit against Riot's hierarchy:**
   - one opaque, high-value primary shape per move, with secondaries softer;
   - anticipation → climax → dissipation within about 0.6–1.0 s for basic moves;
   - scale matched to move power.

## 7. Open questions
- What are the reference's actual measured numbers (notan, b* split, focal ratios)? We need the image in-repo (private, never shipped) to calibrate the thresholds in §5.
- Can the VLM critic be made reliable on our 640×360 internal frames, or does it need 2× nearest upscales and crops? (See the agent-method angle.)
- Which per-creature rim and outline rule works across all 11 arenas without per-pair tuning?
- How much of the judges' gap is the UI alone? A/B-test the judges with only the UI re-skinned.
