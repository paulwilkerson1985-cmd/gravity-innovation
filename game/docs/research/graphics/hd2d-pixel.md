# HD-2D and pixel-art-in-3D: how the pros do it (free tools only)

Research angle: `hd2d-pixel`. Written 2026-10-14 for Orbkin's HD-2D battle look (Three.js r180 +
TypeScript + Vite, `?gfx=hd2d`, see `docs/HD2D.md`). Machine-readable summary:
`docs/research/graphics/hd2d-pixel.json`.

**How to read this.** Every claim carries a confidence tag:
- **[verified]**: I read the code, ran it, or a primary source says it.
- **[secondary]**: several independent secondary sources agree (press write-ups, community
  reimplementations). No primary talk or code.
- **[speculative]**: my inference, or a single weak source. Treat it as a hypothesis to test.

**Environment caveat.** This container's proxy blocks most of the web (blender.org, threejs.org,
polyhaven, kenney.nl, ambientcg, quaternius, opengameart, itch.io, lospec, reddit, youtube,
unrealengine.com, gamedeveloper.com, arxiv.org, sr.ht and most press sites). The tools that
worked: WebSearch (which returns summaries), WebFetch for github.com pages,
`curl https://raw.githubusercontent.com/...` for real code, the npm registry and PyPI. So every
code claim below comes from source I fetched over raw GitHub. Press and interview claims come from
search summaries. I could not open the articles themselves, which is why many of them are tagged
[secondary].

**Follow-up pass (same day).** The proxy then opened docs.blender.org, blender.org, threejs.org,
polyhaven.com (plus its API and download hosts), ambientcg.com (home and API only; `/license` still
403) and kenney.nl. Section 14 lists what I re-checked against those primary sources. The Blender
and three.js API claims are now tagged [verified: docs]. I also added three experiments: a Kenney
CC0 cave kit rendered headless, the Kenney "Retro Textures Fantasy" pack inspected, and a Poly
Haven photo texture converted to a pixel tile (the conversion failed; section 14). The game press
and interview sites are still blocked, so those claims stay [secondary].

---

## 0. TL;DR (the ten things that matter)

1. **HD-2D is a recipe, not an engine.** It means pixel-art characters on 3D dioramas, plus
   dynamic light and shadow, depth of field / tilt-shift, bloom and vignette. Square Enix's DQ3
   producer said so directly: there is no "HD-2D engine", you "place pixel-based characters onto
   3D backgrounds and apply effects". The HD-2D titles use stock **Unreal Engine 4/5**. [secondary]
2. **The backgrounds are real 3D models with point-sampled pixel textures. They are not
   procedural boxes.** In Octopath, low-poly authored geometry carries pixel-art textures. DQ3
   HD-2D (2024) dropped pixel textures on backgrounds entirely and kept pixels only for characters
   and monsters. [secondary] Orbkin hand-codes every rock as a box/chamfer in TypeScript, and this
   is the root of the "voxel/Minecraft" read. That look comes from the authoring method, not from
   a missing shader.
3. **The sprites are hand-drawn pixel art in Octopath and Triangle Strategy.** Pixel artists drew
   about twice as many character movements as planned for Live A Live. [secondary] Indies without
   pixel animators use the **Dead Cells pipeline** instead: crude 3D model → keyframed animation →
   rendered at tiny size with **no anti-aliasing** → per-frame PNG plus normal map → toon shading.
   The character is about 50 px tall in game. [secondary, consistent across 3 write-ups of
   Vasseur's article]
4. **"3D pixel art" in the t3ssel8r style is a well-understood post stack.** I read the actual
   open-source code for each part (sections 3–4): low internal resolution; **camera snapped to the
   texel grid in camera space, with the snap error re-applied as a sub-pixel UV offset at upscale
   time**; quantised (banded) lighting; **depth-discontinuity silhouettes that darken the nearer
   side**; **normal-discontinuity convex-edge highlights that brighten**, but only on convex edges
   and only on the shallower pixel. [verified: code]
5. **Three.js already ships the edge pass** [verified: code + [threejs.org docs](https://threejs.org/docs/pages/RenderPixelatedPass.html)]. `RenderPixelatedPass` (Kody King) is in r180
   (`examples/jsm/postprocessing/RenderPixelatedPass.js`): `pixelSize`, `normalEdgeStrength`
   (default 0.3), `depthEdgeStrength` (default 0.4). The `webgl_postprocessing_pixel.html`
   example also shows pixel-aligned frustum panning and object snapping. [verified: code]
6. **Orbkin's environment has no screen-space edge pass.** Only the sprites get outlines, and the
   rock relies on painted texel bevels. A 1-px depth/normal edge pass on the world, done
   t3ssel8r-style at 640×360, is the single cheapest quality jump available in the current
   pipeline. Section 8 gives a recipe that needs **no extra scene render**: it reconstructs
   normals from the depth texture the composer already has. [speculative impact,
   verified technique]
7. **Blender headless works in this container (Blender 5.2.2 via `pip install bpy`)** [verified: ran it; settings checked against docs.blender.org]. Cycles
   CPU renders 128-px albedo/normal sprite passes in about **10 ms per frame**. EEVEE works after
   `apt-get install libegl1 libegl-mesa0 libgl1-mesa-dri` and `EGL_PLATFORM=surfaceless`
   (llvmpipe), at about **1.8–2.7 s per 64-px frame**. EEVEE's
   `Shader to RGB` → `ColorRamp(CONSTANT)` toon works headless. Freestyle works in both engines,
   but at 64 px it produces mushy inner lines. A 4-neighbour alpha outline in post looks much
   better. [verified: ran it, section 6]
8. **For crisp sprites in Blender:** use `film_transparent`; set `render.filter_size = 0.01`
   (EEVEE); set `cycles.filter_width = 0.01` with a `BOX` filter (Cycles); render **1 sample**,
   because multi-sample Cycles still produced 165 partially transparent edge pixels in my test;
   set `view_transform = 'Standard'`. The robust route is to render **albedo and normal as
   separate 1-spp emission-override passes** (deterministic, noise-free, binary alpha). Do the
   toon lighting, outline and palette in Python or in the game shader. [verified]
9. **Free tools cover the whole pipeline.** Blender (GPL), Pixelorama (MIT), LibreSprite (GPL-2,
   a fork of Aseprite 1.1.8), Aseprite (source-available: building it yourself is allowed for
   personal use but not for redistribution), Laigter (GPL-3; normal maps from sprites, and its
   output is yours), SpriteSheetMaker / BlenderSpriteGenerator Blender add-ons (MIT). For CC0
   assets, kenney.nl, Poly Haven (with its API) and ambientCG are reachable since the follow-up
   pass and their CC0 licences are confirmed on the primary sites. Kenney's Modular Cave Kit and
   Retro Textures Fantasy were downloaded and inspected (section 14). The three.js
   repo's `RobotExpressive.glb` (CC0, Quaternius) loaded and baked fine. [verified licences]
10. **Recommendation, in priority order** (section 10): (1) world edge pass + environment palette
    LUT; (2) author the arena **in Blender** as low-poly modular kit pieces with hand- or
    procedurally-painted pixel textures at one texel density, exported to glTF, and replace the
    procedural boxes; (3) move creatures to **authored Blender models**, either still baked live
    in-engine or **pre-rendered per pose** to sprite sheets plus normal maps, then hand-cleaned in
    Pixelorama; (4) keep the light, bloom, god-ray and grade stack, which is already
    reference-grade.

---

## 1. HD-2D (Square Enix / Acquire / Artdink / Team Asano)

### 1.1 What the developers have actually said

| Claim | Source | Confidence |
|---|---|---|
| HD-2D was coined and trademarked by Square Enix for Octopath Traveler. It was developed with Acquire, and the team "relied heavily on Unreal Engine 4" with a small staff. | [Wikipedia: HD-2D](https://en.wikipedia.org/wiki/HD-2D), [Game Developer: trademark](https://www.gamedeveloper.com/production/square-enix-has-trademarked-the-name-of-i-octopath-traveler-s-i-art-style) | secondary (high) |
| The concept came from PS1-era games that put 2D characters over 3D or pre-rendered backgrounds, updated by "fusing 2D pixels with a 3D environment" (Acquire lead artist Mika Iizuka). | [Unreal spotlight (2019)](https://www.unrealengine.com/spotlights/octopath-traveler-s-hd-2d-art-style-and-story-make-for-a-jrpg-dream-come-true) via search summary | secondary |
| Plain VFX in battle "didn't look good enough". The team **added a point light with each VFX**, so the effect casts character shadows onto the environment. | same Unreal spotlight; Wikipedia | secondary (high) |
| "Characters are flat pixel art, backgrounds almost entirely 3D". Making them sit together was the hard part, and lighting sometimes had to be adjusted per scene. | [Unreal OT2 interview (2023)](https://www.unrealengine.com/en-US/developer-interviews/octopath-traveler-ii-builds-a-bigger-bolder-world-in-its-stunning-hd-2d-style) via search summary | secondary |
| OT2: maps were made at **higher resolution** with a "unique, organic pixel-art appearance". Characters are **taller** for expressiveness, especially in battle. The camera is "no longer purely top-down" and handled "like a 3D scene". The team aimed for art that is "picture-perfect no matter when you screenshot it" (citing the Chrono Trigger trial scene). | [Nintendo Life / Famitsu](https://www.nintendolife.com/news/2022/10/octopath-traveler-ii-devs-aimed-to-make-its-hd-2d-visuals-picture-perfect), [Nintendo Wire](https://nintendowire.com/news/2022/10/31/octopath-traveler-ii-devs-on-presentation-and-not-succumbing-to-pure-pixel-art-nostalgia/), [My Nintendo News](https://mynintendonews.com/2022/10/29/octopath-traveler-ii-devs-discussed-the-games-camerawork/) | secondary |
| Triangle Strategy: Asano says Square Enix had several studios make HD-2D demo footage, and Artdink was the only one Acquire judged "accurate". They **"prepared a deformed image first, then added realistic effects"**. Balancing a movable camera with "characters made of dots" was hard. HD-2D "costs more than you'd think". | [Nintendo Life](https://www.nintendolife.com/news/2022/05/triangle-strategy-producers-talk-hd-2d-and-why-other-devs-havent-used-it), [Destructoid](https://www.destructoid.com/triangle-strategy-interview-producers-asano-arai-square-enix-hd-2d-tactics-rpg/), [GamingBolt](https://gamingbolt.com/triangle-strategys-art-style-costs-more-than-youd-think-producer) | secondary |
| DQ3 HD-2D (2024, Team Asano + Artdink): there is **no "HD-2D engine"**, only a method. The final game uses **no pixel art in the backgrounds**; pixels are for characters and monsters only. They discussed "the size of the character pixels". **Depth of field is "extremely important"** to HD-2D. | [Siliconera](https://www.siliconera.com/interview-preparing-a-hd-and-2d-dragon-quest-iii-remake/), [PlayStation Blog](https://blog.playstation.com/2024/11/08/dragon-quest-iii-hd-2d-remake-interview-how-the-classic-rpg-was-revamped-for-its-ps5-debut/), [Digital Trends](https://www.digitaltrends.com/gaming/dragon-quest-3-hd-2d-remake-interview-save-state/) | secondary (high: 3 outlets) |
| Live A Live (2022): an HD-2D remake fuses "the beauty of pixel art with the unique effects possible with 3D". Pixel staff drew **about twice the planned character motions**. | [NME](https://www.nme.com/news/live-a-live-remake-took-three-years-to-create-3221385), [Nintendo Life](https://nintendolife.com/news/2022/05/live-a-live-switch-remake-took-three-years-to-make-says-original-director) | secondary |
| Triangle Strategy runs at dynamic resolution, and characters sometimes get blurry docked. | [Digital Foundry via Nintendo Life](https://www.nintendolife.com/news/2022/03/digital-foundry-shares-its-tech-review-of-triangle-strategy) | secondary |
| The fan "HD-2D Pokémon" demos by 3D pixel artist **Dott** are built in **Unreal Engine 5**. No pipeline breakdown is public. | [Kotaku](https://kotaku.com/pokemon-hd-2d-octopath-traveler-fan-art-unreal-engine-5-1850350661), [GameSpot](https://www.gamespot.com/articles/pokemon-red-and-blue-get-the-hd-2d-treatment-courtesy-of-a-fan/1100-6513399/), [TechEBlog](https://www.techeblog.com/nintendo-pokemon-red-hd-2d-remake-unreal-engine/) | secondary |

**What I could not find:** a CEDEC/GDC technical talk on HD-2D rendering. I searched CEDEC,
Square Enix and Acquire with several phrasings and found none. Specific numbers (sprite heights,
texel density, DOF parameters) are not published. Octopath character sprites are commonly
described as SNES-style, roughly 2–3 heads tall, but **I found no reliable pixel dimension**. The
Spriters Resource rips would settle it, but the site is blocked here. Treat any "Octopath sprites
are N px" claim as unverified, including mine: about 28–36 px wide and 40–56 px tall for
humanoids is a guess.

### 1.2 The HD-2D ingredient list (consensus)

From the interviews above, the Wikipedia article and the PC settings menu (Octopath PC lets you
toggle **Tilt Shift** and **Bloom** separately, according to
[Steam discussion](https://steamcommunity.com/app/921570/discussions/0/3022387599801832913)):

| Ingredient | HD-2D practice | Orbkin today | Gap |
|---|---|---|---|
| Characters | Hand-drawn pixel sprites on camera-facing quads that cast shadows | Live 3D model baked per frame to a toon sprite, 1-texel outline, billboard + real mesh shadow | Good tech. **Source art** (procedural primitives) is the weak link |
| Sprite pixel size vs world | One sprite texel spans several screen pixels; characters are SD/deformed (DQ3 team debated "size of the character pixels") | 2 internal px per texel, people 44, kin 28–40 texels | OK. Re-measure against the target image |
| Environment | Authored low-poly 3D with pixel textures (Octopath/TS); high-res textures (DQ3) | Procedural voxel boxes and chamfered "boulders" painted per texel | **Main gap**: authored shapes, silhouettes, composition |
| Light | Real dynamic lights, VFX point lights cast character shadows, strong key/shadow contrast | Cookie spot, hemisphere, points, god-ray ribbons | At parity |
| DOF / tilt-shift | Strong; "extremely important" | Deliberately weak (≤1 px) to keep texture crisp | Try stronger DOF on **far wall only**, not floor (section 8.7) |
| Bloom | Only bright sources | Threshold 1.0 linear, soft knee | At parity |
| Vignette, grade | Yes | Yes | At parity |
| Edge/outline on world | No explicit outlines, but pixel textures carry painted edge highlights | Texel bevel in texture | Add a screen-space edge pass (t3ssel8r) |

---

## 2. Dead Cells: the canonical "3D → 2D pixel" production pipeline

Thomas Vasseur, Motion Twin, "Art Design Deep Dive: Using a 3D pipeline for 2D animation in
Dead Cells", Gamasutra/Game Developer, 2018
([original](https://www.gamedeveloper.com/production/art-design-deep-dive-using-a-3d-pipeline-for-2d-animation-in-i-dead-cells-i-);
[GameAnim summary](https://www.gameanim.com/2018/01/31/dead-cells-3d-pipeline-2d-animation/);
[Sudo Null translation](https://sudonull.com/post/14066-Dead-Cells-Using-3D-Pipeline-for-2D-Animation);
[wnhub](https://wnhub.io/news/art/item-13775)). The original is blocked here; the details below
agree across the three mirrors and summaries. [secondary, high]

1. Draw a 2D pixel **model sheet** first. The look is decided in 2D.
2. Model and skeleton in 3ds Max, exported as FBX. Models are deliberately **crude**: at about
   **50 px in-game height**, detail in the mesh is "cost-inefficient".
3. **Keyframe like 2D animation**: few strong poses first, then in-betweens. The timing is
   snappy, not mo-cap smooth.
4. A **homebrew tool** renders each frame **at the final tiny size with no anti-aliasing** and
   writes a **PNG plus a normal map** per frame.
5. A **toon/cel shader** is applied using the normal map, so lighting stays dynamic in game.
6. Benefit: changing the model, colours or an animation means re-rendering, not redrawing.

Blender equivalent (verified in section 6): an orthographic camera at sprite resolution with
`filter_size`/`filter_width` 0.01 and 1 sample gives no AA; separate albedo and normal passes
give the normal map; the toon step happens in post or in the game shader.

---

## 3. t3ssel8r-style 3D pixel art: the technique, from real code

t3ssel8r (a Unity developer on YouTube, 2020–) never released code. The technique is known
through his videos and several open-source reimplementations. **I read the code of four of
them** (below), so the technique description is [verified: code]. The claim that it matches
t3ssel8r's own implementation is [secondary].

### 3.1 The five components

| Component | What it does | Reference code |
|---|---|---|
| Low internal resolution | Render to e.g. 640×360 or 320×180 with no AA, upscale by an integer factor | All of them; bababuyyy defaults to 640×360 |
| Texel-snapped camera + sub-pixel compensation | Snap the camera position in **camera space** to a grid one texel in size (ortho). The rendered image then never "creeps". Shift the **upscaled** output by the snap error, so motion stays smooth at screen resolution | denovodavid's Godot code (via astrellon), bababuyyy `SharpUpscaleShader` `_PixelPanOffset`, three.js `pixelAlignFrustum` |
| Object snapping | Snap moving objects' positions to the same camera-space grid before render, restore after | denovodavid `_snap_objects` / three.js `pixelAlignObject` |
| Quantised lighting | N·L → 2–4 hard bands (optional Bayer dither at band boundaries), palette per band | bababuyyy `ToonLit.shader` (`_Cuts`, `BayerDither`) |
| Edge pass | **Silhouette**: depth discontinuity → darken the **nearer** pixel (so the line sits on the object, 1 px thick). **Crease**: normal discontinuity, same depth → **brighten** convex edges only, and only on the pixel whose normal faces away from the camera more | three.js `RenderPixelatedPass`, denovodavid `outline.gdshader`, leopeltola `pixelart_stylizer.gdshader`, bababuyyy `OutlineShader` |

### 3.2 three.js `RenderPixelatedPass` (Kody King), r180

File: `three/examples/jsm/postprocessing/RenderPixelatedPass.js` (fetched from `mrdoob/three.js`
dev, 314 lines; present in the npm `three@0.180.0` tarball). [verified]

- `new RenderPixelatedPass(pixelSize, scene, camera, { normalEdgeStrength = 0.3, depthEdgeStrength = 0.4 })`.
- It renders the scene **twice**: beauty into a `HalfFloatType` target with a `DepthTexture`, and
  then the scene with `scene.overrideMaterial = MeshNormalMaterial` into a normal target. Both
  targets are `(w/pixelSize)|0 × (h/pixelSize)|0` with `NearestFilter`.
- Fragment logic, verbatim essentials:

```glsl
float depthEdgeIndicator(float depth, vec3 normal) {
  float diff = 0.0;
  diff += clamp(getDepth(1, 0) - depth, 0.0, 1.0);
  diff += clamp(getDepth(-1, 0) - depth, 0.0, 1.0);
  diff += clamp(getDepth(0, 1) - depth, 0.0, 1.0);
  diff += clamp(getDepth(0, -1) - depth, 0.0, 1.0);
  return floor(smoothstep(0.01, 0.02, diff) * 2.) / 2.;   // only the NEARER pixel lights up
}
float neighborNormalEdgeIndicator(int x, int y, float depth, vec3 normal) {
  float depthDiff = getDepth(x, y) - depth;
  vec3 neighborNormal = getNormal(x, y);
  vec3 normalEdgeBias = vec3(1., 1., 1.);                  // tie-break: which side owns the line
  float normalDiff = dot(normal - neighborNormal, normalEdgeBias);
  float normalIndicator = clamp(smoothstep(-.01, .01, normalDiff), 0.0, 1.0);
  float depthIndicator = clamp(sign(depthDiff * .25 + .0025), 0.0, 1.0); // shallower pixel only
  return (1.0 - dot(normal, neighborNormal)) * depthIndicator * normalIndicator;
}
// ... normalEdgeIndicator = step(0.1, sum of 4 neighbours)
float Strength = dei > 0.0 ? (1.0 - depthEdgeStrength * dei) : (1.0 + normalEdgeStrength * nei);
gl_FragColor = texel * Strength;
```

- Caveats for Orbkin: (a) the second scene render with `overrideMaterial` breaks the custom
  sprite and billboard materials. Orbkin rejected GTAO for the same reason: it re-rendered the
  scene for normals and cost 2.4× the frame. (b) The depth comparison uses **raw non-linear
  depth** from a perspective camera, so thresholds change with distance. Linearise first. (c)
  Edges are a multiplicative darken/brighten of the beauty colour, which is exactly the
  pixel-art "darker shade of the local colour" convention Orbkin's sprites already use.

**The example** (`examples/webgl_postprocessing_pixel.html`, fetched) adds the snapping half.
GUI defaults: `pixelSize 6, normalEdgeStrength .3, depthEdgeStrength .4, rotationSnap 15°,
cameraRotationSnap 9°, cameraZoomSnap 0.1`. [verified]

```js
function pixelAlignFrustum(camera, aspectRatio, pixelsPerScreenWidth, pixelsPerScreenHeight) {
  const worldScreenWidth  = (camera.right - camera.left) / camera.zoom;
  const worldScreenHeight = (camera.top - camera.bottom) / camera.zoom;
  const pixelWidth = worldScreenWidth / pixelsPerScreenWidth;
  const pixelHeight = worldScreenHeight / pixelsPerScreenHeight;
  const camPos = new THREE.Vector3(); camera.getWorldPosition(camPos);
  const camRot = new THREE.Quaternion(); camera.getWorldQuaternion(camRot);
  const camRight = new THREE.Vector3(1, 0, 0).applyQuaternion(camRot);
  const camUp = new THREE.Vector3(0, 1, 0).applyQuaternion(camRot);
  const fractX = camPos.dot(camRight) / pixelWidth - Math.round(camPos.dot(camRight) / pixelWidth);
  const fractY = camPos.dot(camUp) / pixelHeight - Math.round(camPos.dot(camUp) / pixelHeight);
  camera.left = -aspectRatio - fractX * pixelWidth;   camera.right = aspectRatio - fractX * pixelWidth;
  camera.top  = 1.0 - fractY * pixelHeight;           camera.bottom = -1.0 - fractY * pixelHeight;
  camera.updateProjectionMatrix();
}
// pixelAlignObject: decompose position onto camera right/up/forward, round right/up to the pixel, recompose.
// The example restores true transforms after composer.render() so motion integrates unsnapped.
```

Note that this example **shifts the frustum** (the image never moves by a fraction of a texel)
but does **not** re-add the remainder at upscale. Panning is therefore texel-stepped, not smooth.
The denovodavid and bababuyyy versions below re-add the remainder for smooth motion.

### 3.3 denovodavid / David Holland's Godot code (via astrellon/godot-3d-pixel-art, MIT)

Original: `git.sr.ht/~denovodavid/3d-pixel-art-in-godot` (blocked here). Article:
[davidhol.land/articles/3d-pixel-art-rendering](https://www.davidhol.land/articles/3d-pixel-art-rendering/)
(blocked; the search summary says: depth for silhouettes, normals for edges, a 4-neighbour kernel
keeps lines 1 px, convex edges via a neighbour cross product, camera snapped to a texel grid,
then "offsets the rendered output by the snap error"). I read the code that
[astrellon/godot-3d-pixel-art](https://github.com/astrellon/godot-3d-pixel-art) credits as
David Holland's. [verified: code]

Camera (`camera/main_camera.gd`):

```gdscript
_texel_size = size / float(viewport.size.y)            # ortho size / internal px height
var snap_space_position := global_position * _snap_space   # position in the camera's rotation frame
var snapped := snap_space_position.snapped(Vector3.ONE * _texel_size)
var snap_error := snapped - snap_space_position
h_offset = snap_error.x; v_offset = snap_error.y           # render from the snapped spot
_texel_error = Vector2(snap_error.x, -snap_error.y) / _texel_size  # later: shift the upscaled sprite by this
# objects in group "snap": position snapped to (texel, texel, 0) in snap space before draw,
# restored in RenderingServer.frame_post_draw
```

Edge shader (`materials/outline.gdshader`, key part):

```glsl
// 5-tap cross: view-space position + normal for centre and 4 neighbours
float depth_thresh = depth_threshold /*0.25*/ * remap(max(0.5, 1.0 - norm[2].z), 0.5, 1.0, 1.0, 2.0);
// grazing surfaces get a larger depth threshold (avoids false silhouettes on slopes)
for (i in neighbours) {
  vec3 cp = cross(norm[2], norm[i]);
  float convexity = dot(cp, vec3(offset[i].yx, 0));       // sign tells convex vs concave
  is_edge += abs(pos[i].z - pos[2].z) < depth_thresh       // same surface cluster
          && norm[i].z + bias > norm[2].z                  // the more camera-facing pixel owns the highlight
          && convexity > convex_thresh /*0.5, scaled by facing*/ ? 1.0 : 0.0;
}
ALBEDO = is_edge > 0.0 ? edge_color : ALBEDO;              // highlight convex edges
ALBEDO = (pos[2].z - pos[k].z > depth_thresh for any k) ? outline_color : ALBEDO; // silhouette on the near side
```

The **convex-only** rule is what makes t3ssel8r-style rocks read as chunky pixel-art boulders:
lit top lips get a 1-px highlight, crevices do not.

### 3.4 bababuyyy/unity-isometric-pixel-pipeline (Unity 6 URP, MIT)

[github.com/bababuyyy/unity-isometric-pixel-pipeline](https://github.com/bababuyyy/unity-isometric-pixel-pipeline).
Shaders read via raw GitHub. [verified: code]
- Default internal resolution **640×360**, the same as Orbkin high.
- `OutlineShader`: a 3×3 neighbourhood in view space. **Silhouette** if any of the 8 neighbours
  is nearer by more than `z_thresh`, where `z_thresh = _ZDeltaCutoff * (1 + AngleZScale *
  facing)` adapts to grazing angles. The line colour is the **nearest neighbour's colour ×
  `_LineDarken`**, so lines are a dark shade of the occluding object, not black. **Crease** =
  directional contrast `max(|d0-d3|, |d1-d2|)` of `1 - dot(n, n_k)` across opposite cardinal
  pairs, suppressed near silhouettes. It brightens the centre colour × (1 + `_CreaseBrighten`).
- `SharpUpscaleShader`, the smooth sub-pixel pan at upscale time:

```hlsl
uv += _PixelPanOffset.xy;                         // snap error from the camera, in UV
float2 px = _BlitTexture_TexelSize.xy;
float2 fw = clamp(fwidth(uv) / px, 1e-5, 1.0);
float2 grid = uv / px - 0.5 * fw;
float2 blend = smoothstep(1.0 - fw, 1.0, frac(grid));
float2 finalUV = (floor(grid) + 0.5 + blend) * px;  // nearest inside texels, 1-screen-px AA at texel borders
```

  This "sharp bilinear" upscale also fixes non-integer scale factors (e.g. phones) without
  uneven texel widths. It is relevant because Orbkin currently picks an integer grid plus CSS
  `pixelated`.
- `ToonLit.shader`: `_Cuts` (1–8, default 3) bands; optional 4×4 Bayer dither applied to the
  diffuse term **before** banding (`diffuse += (bayer - 0.5) * _DitherStrength * 0.25`); palette
  mode = `albedo * lerp(_ShadowColor, _HighlightColor, lit)`.

### 3.5 Other implementations worth knowing

- [leopeltola/Godot-3d-pixelart-demo](https://github.com/leopeltola/Godot-3d-pixelart-demo) (MIT):
  a direct port of the three.js indicators to Godot. Defaults `shadow_strength 0.4`,
  `highlight_strength 0.1`; depth diff `smoothstep(0.2, 0.3)`, normal diff
  `smoothstep(0.2, 0.8)`, with normals suppressed where the neighbour is nearer. [verified: code]
- [Robert-K/godot-3d-pixel-art](https://github.com/Robert-K/godot-3d-pixel-art) (MIT): a
  pixel-perfect camera with smooth sub-pixel movement, **stepped 3D animation playback to emulate
  sprite sheets** (play bones at about 8–12 fps), and stylised volumetric god rays. The camera rig
  orbits in 45° steps with eased snapping. [verified: README + `camera_rig.gd`]
- [CelestialLemon/pixel3d-renderer](https://github.com/CelestialLemon/pixel3d-renderer) (three.js,
  licence not stated): a **G-buffer at art resolution (320×180)**, then one stylisation shader
  (silhouette ink on the far pixel, creases, **hue-shifted OKLab ramps**, **gradient-aware
  dithering** only where light forms a smooth gradient, orphan-pixel clean-up). Palette = minimax
  merge in OKLab (64–80 colours), "so small objects are not absorbed". It also snaps the camera,
  and its video tool re-adds the snap remainder. This is the closest public three.js analogue to
  what Orbkin could become. [verified: README via WebFetch, code not read]
- **Texel splatting** (Dylan Ebert, arXiv 2603.14587, March 2026): grid snapping only works for
  **orthographic** cameras. Under perspective, the drift rate depends on depth (ProPixelizer's
  author says the same). The paper renders into a cubemap from a fixed probe and splats texels
  back as world-anchored quads. The limitation is disocclusion at probe boundaries. Code is at
  dylanebert.com/texel-splatting (not checked). [secondary]
  **Relevance:** Orbkin's battle camera is **perspective** (fov 34–38), so camera snapping can
  only be exact at one depth. Orbkin already snaps the view offset "at the focus depth", which is
  the correct compromise.
- ProPixelizer (Unity, paid, ElliotB256) and UPixelator (Unity, paid): per-object pixelation and
  world-space grid snapping. These are paid tools, listed only for vocabulary. [secondary]

---

## 4. Sprites with dynamic light: Sea of Stars, Children of Morta, Eastward, Octopath

| Game | What is known | Confidence |
|---|---|---|
| Sea of Stars (Sabotage) | Press kit: "full-on dynamic lighting", a "custom-made render pipeline". Developers call the style "retro plus". Visible: colour highlights on characters, Zale's charged fireball casts other characters' shadows, day/night. **No technical breakdown found**: no sprite normal maps confirmed, no GDC talk located. | primary press kit + secondary ([press kit](https://sabotagestudio.com/presskits/sea-of-stars/), [ResetEra](https://www.resetera.com/threads/its-frankly-insane-how-good-sea-of-stars-pixel-art-is.1048128/)) |
| Children of Morta (Dead Mage) | Pixel animations are **stretched about 4× to HD** so lighting runs at full resolution: "the puppets are pixelated but are lit with real lights". A custom pipeline integrates lighting with 2D pixel art. Normal maps not confirmed in the sources found. | secondary ([TechRaptor](https://techraptor.net/gaming/previews/how-dead-mage-created-art-for-children-of-morta), [GD postmortem](https://www.gamedeveloper.com/design/postmortem-children-of-morta)) |
| Eastward (Pixpil) | In-house engine (MOAI in 2015 per one source). A dev blog mentions a special texture channel "that looks like a normal map", so props light "more stereoscopically". | low ([Game Developer IGF](https://www.gamedeveloper.com/disciplines/road-to-the-igf-pixpil-s-i-eastward-i-)) |
| Octopath | VFX point lights cast sprite shadows onto 3D. Sprites are lit by scene light (colour/intensity). Whether sprites carry normal maps is unknown. | secondary |
| Unicorn Overlord (Vanillaware) | High-resolution hand-painted 2D (not pixel art); Noma was director, programmer and lead artist. No pipeline details found. Not a pixel-art reference. | secondary |
| Hyper Light Drifter, Blasphemous | Hand-animated pixel art with mostly baked or flat lighting. I found no technical sources in this pass, and they are not 3D→2D references. | — |

The normal-maps-on-pixel-art literature: "Analysis and Compilation of Normal Map Generation
Techniques for Pixel Art" ([arXiv 2212.09692](https://arxiv.org/pdf/2212.09692)) notes that
naive 3D-style normal maps on pixel art "may not yield correct results" ("Hi-bit pixel art"). A
Defold thread observes that smooth normal maps produce **too many tones**, so it "doesn't
resemble hand-drawn pixel art" ([Defold forum](https://forum.defold.com/t/normal-map-lighting-for-2d-pixel-art-sprites/70967)).
[secondary] **Implication:** if sprites are relit at runtime from a normal map, **quantise the
result** (bands plus a palette snap). Orbkin's sprite bake already does this with a five-tone
ramp and palette snap, which is the right call.

Tools: **Laigter** (GPL-3, free on itch, CLI mode for batch) generates normal, specular,
parallax and occlusion maps from sprites. The author says output from a sprite you own is yours,
commercial use included ([itch](https://azagaya.itch.io/laigter), repo `azagaya/laigter`; licence
verified via raw GitHub). Sprite Lamp and SpriteIlluminator are paid. For **Blender-rendered
sprites you do not need Laigter**: render the true normal pass (section 6).

---

## 5. Pre-rendered sprite pipelines from Blender

### 5.1 Settings that matter (verified on Blender 5.2.2 headless unless noted)

| Setting | Value | Why / notes |
|---|---|---|
| Camera | `type='ORTHO'`, `ortho_scale` = subject height × ~1.35 | Ortho keeps texel size constant across the sprite. Use the game's pitch (Orbkin bakes at a fraction of the main camera's elevation, `bakePitch`) |
| Resolution | Final sprite size, 1:1 (e.g. 64×64 for kin, 96×96 for big forms) | Never render big and bilinear-downscale: that makes AA mush. If supersampling, downsample by **picking** samples (Orbkin's detail-preserving 2× already does this) |
| EEVEE AA | `scene.render.filter_size = 0.01`, `scene.eevee.taa_render_samples = 1` | **Verified: 0 partial-alpha pixels** at 64 px. API docs: `filter_size` is the "width over which the reconstruction filter combines samples (in [0, 500], default 1.5)" ([RenderSettings](https://docs.blender.org/api/current/bpy.types.RenderSettings.html)); `taa_render_samples` is "samples per pixel for rendering (default 64)" ([SceneEEVEE](https://docs.blender.org/api/current/bpy.types.SceneEEVEE.html)); the EEVEE Film manual says "lower values give more crisp renders" ([manual](https://docs.blender.org/manual/en/latest/render/eevee/render_settings/film.html)) |
| Cycles AA | `scene.cycles.pixel_filter_type='BOX'`, `scene.cycles.filter_width=0.01` (min 0.01), **`samples=1`** | The Cycles Film manual: Pixel Filter Type "Box: No filter", Width "lower values give more crisp renders" ([manual](https://docs.blender.org/manual/en/latest/render/cycles/render_settings/film.html)). The Cycles add-on properties are not in the bpy API reference (`bpy.types.CyclesRenderSettings` returns 404); I read the property names from the live `bl_rna`. `render.filter_size` is not Cycles' filter. With 16 spp I still measured **165 partial-alpha pixels** even with `use_pixel_jitter=False` (a Blender 5.x property that had no visible effect). 1 spp gave **0 partial** |
| Noise-free at 1 spp | Material override → Emission(albedo) and Emission(camera-space normal) | Emission needs no light sampling, so it is deterministic and noise-free. Lighting is then done in post or in game |
| Colour management | `view_settings.view_transform = 'Standard'` (not AgX/Filmic) | Keeps authored colours exact (also recommended by BNPR's Blender pixel-art guide per search summary). Note: 'Standard' sRGB-encodes the normal pass. Decode it (`srgb_to_lin`) or use a non-colour output |
| Transparency | `film_transparent = True`, RGBA PNG | Binary alpha only with 1 sample / filter 0.01 |
| Toon in EEVEE | `Diffuse BSDF → Shader to RGB → ColorRamp(interpolation='CONSTANT') × base colour → Emission` | **EEVEE only** per the [manual](https://docs.blender.org/manual/en/latest/render/shader_nodes/color/shader_to_rgb.html), which gives "a color ramp on the output of a diffuse BSDF … to create a flexible toon shader" as its example. The manual also warns that it breaks the PBR pipeline (AO, soft shadows, SSR, SSS, alpha clip/hashed) and "doesn't give expected results in render passes". Verified headless with llvmpipe |
| Toon in Cycles | Do it in post from albedo + normal (section 6) or fake N·L with Geometry Normal · light vector in the shader | Verified the post route |
| Outlines | **Post 4-neighbour alpha outline** (dark shade of the neighbour colour) + inner contour from normal jumps | Freestyle works headless in Cycles and EEVEE but is **anti-aliased** (241 partial-alpha px) and **cluttered at 64 px** (see 6.3). Freestyle per the [manual](https://docs.blender.org/manual/en/latest/render/freestyle/introduction.html) is a line engine that "relies on mesh data and Z-depth"; `line_thickness_mode='ABSOLUTE'` means thickness "in pixels" ([API](https://docs.blender.org/api/current/bpy.types.RenderSettings.html)). Line Art (Grease Pencil modifier, [manual](https://docs.blender.org/manual/en/latest/grease_pencil/modifiers/generate/line_art.html)) generates strokes from the active camera's view of a scene, collection or object. Each modifier runs its own occlusion pass (slow with several). Not tested |
| Palette | Pillow `quantize(colors=N, method=MEDIANCUT, dither=Dither.NONE)` or map to a fixed Lospec palette | Median cut **eats small distinct colours** (my cream tail turned orange at 16 colours). Protect eyes and accents (Orbkin's `extractPalette` already keeps rare-but-distinct colours) |
| Directions | Rotate a parent empty by 360/N; N = 8 for overworld, **2 for battle** (front 3/4 of the foe, back 3/4 of yours) | |
| Animation | Sample the action at 8–12 fps ("stepped" playback like sprite sheets) | glTF actions import fine (`bpy.ops.import_scene.gltf`) |

### 5.2 Free Blender add-ons for sprite sheets (licences verified via raw GitHub)

| Add-on | Licence | Notes |
|---|---|---|
| [ManasMakde/SpriteSheetMaker](https://github.com/ManasMakde/SpriteSheetMaker) ([extensions.blender.org](https://extensions.blender.org/add-ons/sprite-sheet-maker/)) | MIT | Animations to sheets, toggleable pixelation, flips, frame ranges. Listed v5.3.1 (Sept 2026) |
| [RubielGames/BlenderSpriteGenerator](https://github.com/RubielGames/BlenderSpriteGenerator) | MIT | N angles, ortho or perspective; tested on Blender 3.4–4.0 |
| [bgivenb/blender-spritesheet](https://github.com/bgivenb/blender-spritesheet) | (not checked) | PNG sheets + JSON frame metadata, 360° orbit mode |
| [theloneplant/blender-spritesheets](https://github.com/theloneplant/blender-spritesheets) | (not checked) | Old (2.81) |
| Pixel Kit (Superhive) | **paid** | Vendor FAQ confirms the same trick: "Crisp Render" sets filter size 0.01, "Sharp Edges" binarises alpha |

For Orbkin a **custom headless script** (section 6) is better than any add-on. It runs in CI or a
container, needs no GUI, and is versioned in the repo.

### 5.3 2D editors (free)

| Tool | Licence | Use |
|---|---|---|
| Pixelorama | MIT (verified) | Hand clean-up of baked frames, palettes, animation preview. Godot-based, runs in a browser too |
| LibreSprite | GPL-2 (verified) | Fork of Aseprite 1.1.8 (Aug 2016). Older feature set |
| Aseprite | **EULA, source-available** (verified `EULA.txt`): compiling it yourself for **personal use** is allowed, redistribution is not | The industry standard. Building from source is free but fiddly (Skia) |
| Laigter | GPL-3 | Normal maps for hand-drawn sprites |
| GIMP / Krita | GPL | Texture painting |

---

## 6. Experiment: headless Blender → pixel sprites in this container

Scratch dir: `/tmp/hd2d-exp` (scripts there; no images in the repo).

### 6.1 Setup (verified)

```bash
python3.13 -m venv /tmp/bpyenv && /tmp/bpyenv/bin/pip install bpy pillow numpy   # bpy 5.2.2 LTS, ~1 min
# EEVEE / Workbench need EGL (llvmpipe software GL works):
apt-get update && apt-get install -y libegl1 libegl-mesa0 libgl1-mesa-dri
export EGL_PLATFORM=surfaceless     # prints harmless "EGL_BAD_MATCH" lines, then renders
```

Without libEGL, EEVEE and Workbench print `Couldn't open libEGL.so.1` and produce nothing. Cycles
CPU always works.

### 6.2 Scripts

`render_sprite.py <ENGINE> <size> <outdir> [freestyle] [dirs]`, env `MODE=beauty|albedo|normal`,
`SPP`, `TOON=1`. A primitive "creature" (spheres, cones; Principled colours) under a pivot empty;
an ortho camera tracking the body centre from `(0,-6,3.3)`; a sun key plus a world fill. The core
render settings:

```python
r = scn.render
r.resolution_x = r.resolution_y = size; r.film_transparent = True
r.filter_size = 0.01                                   # EEVEE pixel filter
scn.view_settings.view_transform = 'Standard'
scn.cycles.samples = 1; scn.cycles.pixel_filter_type = 'BOX'; scn.cycles.filter_width = 0.01
scn.eevee.taa_render_samples = 1
# MODE=albedo / normal: material override, emission only (deterministic at 1 spp)
em.inputs['Color'].default_value = base_colour                                   # albedo
geo.Normal -> VectorTransform(NORMAL, WORLD->CAMERA) -> *(.5,.5,-.5)+.5 -> Emission  # normal
# TOON=1 (EEVEE): DiffuseBSDF -> ShaderToRGB -> ColorRamp(CONSTANT: 0 cool shadow, .25 mid, .6 warm lit)
#                 -> Mix(MULTIPLY, base colour) -> Emission
```

`toon_post.py <albedo> <normal> <out> [ncolours]` (numpy + Pillow, **14 ms** at 64 px):
Lambert from a fixed key → 3 hard bands (0.35 / 0.68 / 1.0) → cool-violet shadow tint, warm lit
tint, key-side rim → **outer 1-px outline = 25% of the neighbour's colour** → **inner contour**
where `1 - dot(n, n_right|down) > 0.35` (×0.55) → median-cut palette, no dither. It also writes
`*_normalmap.png` for runtime relighting.

`render_glb.py <model.glb> <action> <size> <frames> <out.png>`: imports a glTF, finds the action,
renders 8 directions × N frames into one sheet with EEVEE toon, and binarises alpha.

### 6.3 Results (4 vCPU, no GPU)

| Test | Result | Time |
|---|---|---|
| Cycles 64², 1 spp, beauty | Crisp silhouette (0 partial alpha), **noisy shading** (GI/shadow noise at 1 spp) | 0.07 s per frame |
| Cycles 64², 16 spp, filter 0.01 BOX | Smooth shading but **165 partial-alpha edge px** (multiples of 1/16, so samples still spread across the pixel) | 0.09 s |
| Cycles albedo + normal, 1 spp, 128², 8 dirs | **Deterministic, crisp, noise-free**; directions verified different | ~0.01 s per frame (0.9 s wall incl. `import bpy`) |
| Cycles beauty 256², 64 spp, 8 dirs | Fine | 0.6 s per frame |
| `toon_post.py` on 64² passes | Banded toon + outline + inner lines, **15 colours** after 16-colour median cut; the small cream tail merged into orange (palette caveat) | 14 ms |
| EEVEE 64², 1 TAA sample, filter 0.01 | **0 partial alpha**, needs libEGL | first frame 19.4 s (shader compile), later frames ~2.7 s |
| EEVEE toon (Shader to RGB) + Freestyle, 64², 8 dirs | Works headless; 3 clean bands; Freestyle line visible | 11.2 s first, then ~2.7 s per frame |
| Workbench 64² | Works with libEGL; **318 partial-alpha px** (its own AA; set `scene.display.render_aa='OFF'`, not tested) | 0.6 s |
| Freestyle in Cycles | Works headless, 241 partial-alpha px (AA line). Needs `linestyle = bpy.data.linestyles.new()` in factory-empty scenes | 0.12 s |
| **CC0 glTF** (`RobotExpressive.glb` from the three.js repo, Quaternius CC0), "Walking", EEVEE toon, 8 dirs × 4 frames at 64² | **With Freestyle**: inner lines turn the small sprite into mush. **Without Freestyle + 4-neighbour post outline**: clean, readable sprite sheet, 56 colours before palette reduction | 89.8 s with Freestyle, **58.8 s without** (~1.8 s per frame) |

**Takeaways.**
(1) Use **Cycles albedo + normal passes at 1 spp**. They are about 100× faster than EEVEE on this
CPU, perfectly crisp, and they are exactly what a runtime-relit sprite needs (albedo texture plus
normal map).
(2) Do outlines and toon banding **in post or in game**, not with Freestyle, at sprite sizes
under about 96 px.
(3) Palette reduction must protect small accent colours.
(4) The whole 8-direction × 4-frame sheet costs about 1 s in Cycles-passes mode, so even **100
species × 2 facings × 30 frames** is a minutes-long batch job. It is cheap enough to run in CI.

---

## 7. Concrete parameters (reference numbers)

| Parameter | Value | Source / confidence |
|---|---|---|
| Internal resolution, t3ssel8r-style ports | 640×360 (bababuyyy); 320×180 (pixel3d-renderer demo; 480×270 for video) | verified: code/README |
| Orbkin internal resolution | 640×360 high / ~300 px short side low | `docs/HD2D.md` |
| Dead Cells in-game character height | ~50 px | secondary (high) |
| Octopath character sprite height | **unknown**; my guess is 40–56 px for humans | speculative |
| DS-era creature battle sprites (genre convention) | 80×80 (gen 4) / 96×96 (gen 5) canvases; the creature fills ~50–90% | general knowledge, unverified here; quality-bar reference only |
| Orbkin sprite texel heights | people 44, kin 28 / 28 / 34 / 40 by stage | `TEXELS` in `scenes/hd2dBattle.ts` |
| Outline | Exactly 1 texel, 4-neighbour, colour = dark shade of the local/occluding colour (not black) | all implementations; bababuyyy `_LineDarken`, Orbkin sprite.ts |
| Depth-edge strength (three.js) | 0.4 darken; normal-edge 0.3 brighten | verified: code |
| Godot port | shadow 0.4, highlight 0.1; depth smoothstep(0.2, 0.3); normal smoothstep(0.2, 0.8) | verified: code |
| denovodavid thresholds | depth 0.25 (×1–2 by obliquity), convex 0.5 (×1–2) | verified: code |
| Light bands | 3 (bababuyyy `_Cuts` default 3; range 1–8) | verified |
| Palette size | 8–32 colours per scene commonly cited; per-sprite ~16 (Orbkin max 24 per sprite); pixel3d-renderer 64–80 global | secondary / verified |
| Hue shift | Shadows toward blue/violet, highlights toward yellow/orange | secondary, consensus |
| Texel density | One density everywhere; never mipmap/linear-filter pixel textures | consensus (Blender Artists, Bubblehead) |
| Stepped animation | ~8–12 fps for sprite-like motion | Robert-K README (concept), Dead Cells (few keyframes) |

---

## 8. How to do each thing in Three.js r180 (WebGL renderer)

### 8.1 Low-res render + nearest upscale (Orbkin already does this)

```ts
renderer.setPixelRatio(1);
renderer.setSize(internalW, internalH, false);          // 640x360
canvas.style.width = `${internalW * k}px`; canvas.style.imageRendering = 'pixelated';
```

For non-integer scales, use a final full-screen "sharp bilinear" blit (the bababuyyy shader in
3.4, ported to GLSL) instead of CSS `pixelated`. It gives uniform texel widths and a 1-screen-px
blend at texel borders, and it lets you **add the camera snap remainder as a UV offset**.

### 8.2 World edge pass without a second scene render (recommended)

Orbkin's composer target already has depth (or can get it with `rt.depthTexture = new
THREE.DepthTexture(w, h)`). **Reconstruct view-space position from depth and derive normals
from neighbour positions.** No `overrideMaterial` pass, no MRT, sprites untouched. Sketch:

```glsl
uniform sampler2D tColor, tDepth; uniform mat4 uInvProj; uniform vec2 uTexel;
uniform float uDepthK, uConvexK, uDarken, uBright;
vec3 vpos(vec2 uv) {                     // view-space position from the depth buffer
  float d = texture2D(tDepth, uv).r;
  vec4 p = uInvProj * vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
  return p.xyz / p.w;
}
void main() {
  vec3 c = vpos(vUv), r = vpos(vUv + vec2(uTexel.x, 0.)), l = vpos(vUv - vec2(uTexel.x, 0.));
  vec3 u = vpos(vUv + vec2(0., uTexel.y)), d = vpos(vUv - vec2(0., uTexel.y));
  // normal from the smaller-gradient side (avoids smearing across silhouettes)
  vec3 dx = abs(r.z - c.z) < abs(c.z - l.z) ? r - c : c - l;
  vec3 dy = abs(u.z - c.z) < abs(c.z - d.z) ? u - c : c - d;
  vec3 n = normalize(cross(dx, dy));
  float z = -c.z, thresh = uDepthK * z;                       // scale with distance (perspective!)
  bool sil = (-r.z) - z > thresh || (-l.z) - z > thresh || (-u.z) - z > thresh || (-d.z) - z > thresh;
  // convex test (denovodavid): neighbour normal tilts away across the edge.
  // Recompute neighbour normals the same way, or use a cheaper "depth second derivative" test:
  float curv = ((-r.z) + (-l.z) + (-u.z) + (-d.z) - 4.0 * z) / z;  // > 0 where the surface bulges toward the camera (convex ridge), < 0 in creases
  bool ridge = !sil && curv > uConvexK;
  vec3 col = texture2D(tColor, vUv).rgb;
  gl_FragColor = vec4(sil ? col * uDarken : ridge ? col * uBright : col, 1.0);
}
```

Mark this as **speculative but cheap**: four extra depth taps per pixel at 640×360. Tune on the
cave. Exclude the sprite billboards: write them with `depthWrite` on and make the pass skip
pixels whose depth equals a sprite (stencil bit), or run the pass **before** the sprites are
composited. Exclude additive beams and dust (`depthWrite: false` already keeps them out of the
depth buffer). The silhouette should darken the **nearer** pixel (`-neighbour.z > z + thresh`
means this pixel is in front), which matches the three.js and denovodavid convention. In Orbkin
the sprite outline is already 1 texel, so world lines and sprite lines will match.

If quality matters more than cost, use MRT instead. The [RenderTarget docs](https://threejs.org/docs/pages/RenderTarget.html) define `count` ("number of color attachments", default 1) and `depthTexture` ("useful for further processing e.g. in context of post-processing"): (`new THREE.WebGLRenderTarget(w, h, { count:
2 })`, with world materials writing a view normal to `layout(location = 1)` via
`onBeforeCompile`), and port `outline.gdshader`'s exact convex rule.

### 8.3 Camera snapping with sub-pixel compensation (perspective caveat)

Orbkin already rounds the camera offset to whole internal pixels at the focus depth. For a
fully t3ssel8r-like feel during camera moves (intro pans, shakes), use the remainder instead of
dropping it:

```ts
// after computing the snapped view offset (whole internal px) ...
const remPx = new THREE.Vector2(fracX, fracY);           // what rounding removed, in internal px
gradePass.uniforms.uPan.value.set(remPx.x / internalW, remPx.y / internalH);
// final upscale blit: uv += uPan (sharp-bilinear sample), drawn at device resolution
```

This needs the last pass to run at **device resolution** (a full-screen quad sampling the
internal target), not CSS scaling. Cost: one cheap full-res blit. Benefit: smooth slow camera
drift without texel crawl. [verified technique; Orbkin integration speculative]

### 8.4 Quantised lighting on world materials

```ts
const grad = new THREE.DataTexture(new Uint8Array([60, 140, 255]), 3, 1, THREE.RedFormat);
grad.minFilter = grad.magFilter = THREE.NearestFilter; grad.needsUpdate = true;
const mat = new THREE.MeshToonMaterial({ map: pixelTex, gradientMap: grad }); // 3 bands
```

[verified: docs] The [MeshToonMaterial docs](https://threejs.org/docs/pages/MeshToonMaterial.html)
say: "It's required to set Texture#minFilter and Texture#magFilter to NearestFilter" for the
gradient map, and that it "represents non-color data" (keep `colorSpace = NoColorSpace`). The
official [toon example](https://threejs.org/examples/webgl_materials_toon.html) builds the
gradient as `new THREE.DataTexture(colors, colors.length, 1, THREE.RedFormat)`. For pixel
textures the [Texture docs](https://threejs.org/docs/pages/Texture.html) state
`generateMipmaps` defaults to `true`, so set it to `false` together with `NearestFilter`.

Orbkin's world uses Lambert with baked AO. Banding the **key light only** (keep the hemisphere
smooth) through `onBeforeCompile` on `MeshLambertMaterial` keeps the cookie and shadow-map look
and adds the pixel-art "light steps". Add a 4×4 Bayer offset before the step, as bababuyyy does,
to dither band edges.

### 8.5 Normal-mapped sprite billboards lit by Three lights

```ts
const albedo = loader.load('kin_front.png'), normal = loader.load('kin_front_n.png');
for (const t of [albedo, normal]) { t.magFilter = t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; }
albedo.colorSpace = THREE.SRGBColorSpace;            // normal map stays NoColorSpace (data)
const mat = new THREE.MeshLambertMaterial({ map: albedo, normalMap: normal, alphaTest: 0.5 });
// MeshLambertMaterial has normalMap in r180 (verified in the npm tarball); MeshStandard also works (roughness 1, metalness 0).
// SpriteMaterial is unlit: use a PlaneGeometry mesh and orient it to the camera yourself
// (Orbkin already has pixel-snapped billboards). For a camera-facing quad the tangent frame is the
// screen frame, so a camera-space normal pass from Blender (section 6) is directly usable as a
// tangent-space normal map (flip Y if needed).
```

Then **quantise the lit result** in `onBeforeCompile` (bands plus palette snap), or the
smooth-gradient problem from section 4 appears. Orbkin's per-frame bake already does the
equivalent with a live model. A pre-rendered albedo + normal sheet is the static-sprite version
of the same idea.

### 8.6 Palette LUT post pass

`three/examples/jsm/postprocessing/LUTPass.js` (present in r180) applies a 3D LUT. Build a 32³
LUT that maps every colour to the nearest **OKLab** entry of the arena palette, which yields a
hard palette lock after grading. Apply it **after** the grade and **before** the dither. Keep a
`intensity` below 1 (e.g. 0.6; the [LUTPass docs](https://threejs.org/docs/pages/LUTPass.html) list `lut: Data3DTexture` and `intensity`, default 1) so emissives and FX are not crushed. pixel3d-renderer's
minimax-merge palette is a good model for generating the palette from the arena's ramps.
[verified that the pass exists; recipe speculative]

### 8.7 DOF and tilt-shift

DQ3 HD-2D's team calls DOF "extremely important". Orbkin weakened tilt-shift to ≤1 px because it
blurred rock textures into mush. Suggestion: drive the blur from **linear depth beyond the battle
focus plane** (back wall and window only) instead of screen Y, with a cap of about 2 px at
640×360. Keep the floor, kin and trainers 100% crisp. Then quantise: blur, then Bayer dither, so
the out-of-focus area stays "pixel" and does not turn smeary. `three/examples/jsm/tsl/display/DepthOfFieldNode.js`
exists for the WebGPU/TSL path. On the WebGL path a 5-tap depth-weighted blur in the existing
GradePass is enough. [speculative]

---

## 9. Pre-render (Blender) vs real time (Three.js): decision table

| Asset | Pre-render in Blender | Real time in Three | Recommendation for Orbkin |
|---|---|---|---|
| Arena geometry (rock tiers, lodge, stairs, shelves) | Model + paint pixel textures, export **glTF** (geometry stays 3D) | Render with existing lights/cookie/bloom | **Author in Blender, render live.** HD-2D environments are live 3D |
| Arena textures | Paint in Blender texture paint / Pixelorama at one texel density (Orbkin `TEXEL = 1/16` unit), or keep the TS painters but apply them to authored UVs | Point-sampled | Keep the painters as a **texture generator** (they are good), but feed them authored meshes |
| Static props (shelves, crates, barrels, lamps) | Kenney CC0 kits (glTF) → re-texture to the arena ramps | Instanced / merged | Use CC0 + re-texture |
| Creatures | (a) model and rig in Blender → glTF → **keep the live per-frame bake** (all procedural animation survives); (b) **pre-render** albedo + normal sheets per pose (front/back 3/4, idle 4–6 frames, attack 3–5, hit 2, faint 3) → hand clean-up | (a) live bake already exists; (b) normal-mapped billboard + band quantise | **(a) first**: the cheapest big jump. Swap procedural primitive bodies for authored meshes. (b) for "hero" species where hand clean-up pays off |
| Trainers / people | Same as creatures; humanoids benefit most from hand clean-up (faces, hands) | — | (b): pre-render plus Pixelorama polish (faces at 44 texels need hand pixels) |
| Light shafts, dust, bloom, grade | — | Real time | Keep |
| Backdrops beyond the arena (sky, distant cliffs) | Render a wide pixel painting in Blender (Cycles, then palette-quantise) | Textured plane | Pre-render |
| UI frames (cream classic battle UI) | 9-slice pixel frames drawn in Pixelorama | DOM `border-image` | Pre-draw (other research angle) |

**Rule of thumb:** pre-render anything whose **look must be curated per pixel** and whose motion
is a short loop (characters, icons, backdrops). Render live anything whose light must respond
(the world, shadows, FX) or that has continuous procedural motion. Pre-render the **albedo and
normal**, not the final lighting, so pre-rendered sprites still take the arena's light.

---

## 10. Implications for Orbkin: a prioritized plan

Context: the HD-2D stack (640×360, cookie spot, god rays, bloom, ACES + grade, live sprite bake
with 1-texel outline and palette snap) is **technically at or above** what the HD-2D games and
t3ssel8r ports do. The ~6/10 judgement is about **content**: hand-coded primitive geometry gives
grid-aligned silhouettes, every rock feels like a cube, and creatures are built from primitives.
Missing world edges and weak DOF add to that. The owner's instinct is correct: pros author shapes
in a DCC tool and let the engine light them.

### P0: cheap, in the existing pipeline (days)

1. **World edge pass** (section 8.2). Depth-reconstructed silhouette darkening (×0.55–0.7 of the
   local colour) and convex-ridge highlight (×1.15–1.25) at 640×360, before sprite compositing.
   Expect the tiered rock walls and stair edges to read as drawn pixel art. Gate it behind
   `?post=edges` for A/B and measure the cost on SwiftShader (expected ≤10%: 5 depth taps
   per internal pixel). *Confidence that it helps: medium-high.* t3ssel8r ports use exactly this
   to make 3D read as pixel art.
2. **Depth-based DOF on the far wall only** (section 8.7), ≤2 px, dithered. The DQ3 team calls it
   essential. The current Y-based tilt-shift is a weaker proxy.
3. **Arena palette lock** (section 8.6) with `LUTPass` at partial strength, to pull grading
   drift back into the authored ramps.
4. **Stepped creature animation**: sample the rig at 8–12 fps for idle (Robert-K, Dead Cells).
   Smooth 60 fps vertex motion reads as "3D model", while stepped motion reads as "sprite".
   Keep hit and lunge tweens smooth, but quantise their positions to texels (already done).

### P1: move world authoring to Blender (1–2 weeks)

5. **Arena kit in Blender**: about 20–40 modular low-poly pieces per biome (rock tier segments in
   3 widths, corner and stair pieces, ledges, boulders, a window frame, a lodge floor, a shelf, a
   rail). Shapes are drawn as **irregular polygons on a pixel grid** (vertices snapped to
   `TEXEL` multiples; see Bubblehead's grid-before-modeling advice). UVs use one texel density,
   textures are painted in Blender/Pixelorama or generated by the existing TS painters into an
   atlas, and the result is exported as glTF. Assemble arenas from kit pieces in Blender scenes
   (the composition is authored and seen in a viewport) or by code placement (keeps the arena
   registry). The rendering path (VoxelBatch → merged mesh per material) can stay: merge the
   loaded glTF geometry per material at load.
6. **Headless pipeline in the repo** (`tools/blender/*.py`, run with `pip install bpy`): glTF
   validation, texel-density check, palette check, and a contact-sheet render of each kit piece.
   It runs in this container (Cycles CPU, section 6).
7. **CC0 props**: Kenney 3D kits (CC0, kenney.nl reachable; Modular Cave Kit, Mini Dungeon,
   Fantasy Town Kit; plus Retro Textures Fantasy 64×64 tiles), re-textured to the arena ramps through a Blender script
   that replaces materials with the pixel atlas.

### P2: creatures and people from authored models (2–4 weeks)

8. **Model the species in Blender** (low-poly, about 300–1500 tris, vertex colours or a 32–64 px
   palette texture, simple armature), export glTF, and **keep the live per-frame toon bake**.
   It already handles palette, outline, rim and supersampling. This replaces primitive-built
   bodies with designed silhouettes while keeping every engine animation hook. Expected to give
   the largest readability gain per species.
9. For trainers and the 3–6 most visible species, **pre-render pose sheets** (front 3/4 and back
   3/4; idle 4–6 frames, attack 3–5, hit 2, faint 3) as **albedo + normal** at the in-game texel
   height (44 people / 28–40 kin), then **hand-clean in Pixelorama** (faces, eyes, hands), and
   draw them as normal-mapped billboards with band quantisation (section 8.5). This is the Dead
   Cells pipeline. Budget: about 1 s of Cycles time per sheet, so time goes into the hand
   clean-up.
10. **Keep the real mesh as the shadow caster** (already done). For pre-rendered sprites, use a
    low-poly proxy mesh or the sprite alpha in the depth material (the Foliage approach).

### P3: optional

11. Sharp-bilinear final blit with snap-remainder pan (section 8.3) for smooth camera intros on
    non-integer phone scales.
12. Revisit sprite texel heights against the target image. Orbkin's docs say the reference
    measures people ≈ 44–50 and kin ≈ 30 texels, so sizes are probably fine. Bigger final forms
    (≥ 48 texels) would match classic battle-sprite presence. *Measure, don't guess.*

### What NOT to do

- Do not add GTAO or any second full-scene normals render: it was measured at 2.4× frame cost.
  Use depth reconstruction or MRT.
- Do not use Freestyle for sprite outlines below ~96 px (verified clutter).
- Do not bilinear-downscale high-res renders into sprites. Pick samples (Orbkin's supersample
  filter) or render at 1:1.
- Do not mipmap or linear-filter pixel textures, and do not let texel density vary between
  pieces.
- Do not copy franchise IP. Use the reference only as a quality bar.

---

## 11. Free asset sources (and what is reachable from this container)

Licences re-checked on the primary sites in the follow-up pass:
- Kenney [support page](https://kenney.nl/support): "all game assets on the asset pages are public
  domain licensed (CC0) … even in commercial projects", and attribution is not required. Each zip
  ships a `License.txt` (CC0).
- Poly Haven [licence](https://polyhaven.com/license): "Our assets are all licensed as CC0".
- ambientCG [home page FAQ](https://ambientcg.com/): "All assets are released under the Creative
  Commons CC0 license". The `/license` page itself is still proxy-blocked.

| Source | Licence | Reachable here? | HD-2D / pixel-suitable content |
|---|---|---|---|
| Kenney (kenney.nl) | CC0 (verified) | **Yes** (site and zip downloads) | **Modular Cave Kit** (40 glTF pieces: rooms, corridors, stairs, gates, ladder, wall/floor templates; one `colormap.png`, so flat colour, not pixel textures). **Retro Textures Fantasy** (117 tiles at 64×64 / 64×128: stone floors and walls, wood planks, doors, grates, with `_depth` variants; PS1/retro style). Also Mini Dungeon, Fantasy Town Kit, Graveyard Kit, Pirate Kit, Tiny Town/Farm/Battle (2D pixel tiles), Pixel Platformer, Roguelike Characters, **UI Pack Pixel Adventure**, Pattern Pack Pixel |
| Poly Haven | CC0 (verified) | **Yes**: web, [API](https://api.polyhaven.com/types) (`/assets?t=textures&c=rock` gives 125 rock textures; `/files/<id>` gives URLs per map and resolution; models category `rocks` has 37) | Photoreal. Useful for **shapes** (rock models to retopo and pixel-texture) and as reference, **not** as direct pixel textures (section 14) |
| ambientCG | CC0 (verified via FAQ) | Partly: home and `/api/v2`, `/api/v3` reachable; the API search for "pixel" returns 0 assets | Photoreal PBR materials. Same caveat as Poly Haven |
| Quaternius | CC0 | Site not re-tested. `RobotExpressive.glb` (CC0) from the three.js repo **downloaded and baked OK** | Animated humanoids and monsters |
| OpenGameArt, itch.io CC0 packs | per item | No | Check each licence |
| Lospec palettes | per palette | No | Type them in by hand |
| three.js `examples/models` | per model | **Yes** (raw GitHub, threejs.org) | Several CC0 |
| npm / PyPI | per package | **Yes** | `bpy`, `pillow`, `three` |

## 12. Open questions

- Exact Octopath / Triangle Strategy sprite dimensions and texel-to-screen ratios. Needs the
  Spriters Resource or a frame capture.
- Does the target fan-art's environment use pixel textures on 3D or a painted backdrop? Count
  texel density on rock faces against sprite texels in the actual reference image.
- Cost of the depth-reconstructed edge pass on a real phone GPU (SwiftShader numbers are 10–50×
  off).
- Whether Sea of Stars uses sprite normal maps or a custom height/light approach (no primary
  source found).
- Why Cycles 16-spp renders kept fractional coverage with `filter_width=0.01` and
  `use_pixel_jitter=False` in Blender 5.2. This may be a sampling-pattern detail. The 1-spp
  emission passes sidestep it.
- Whether Blender's Line Art (Grease Pencil v3) gives crisper 1-px lines than Freestyle at sprite
  scale. Not tested: Grease Pencil rendering needs the GPU/EGL path, and the manual documents
  the generation options but not pixel-exactness.
- How to turn photo textures (Poly Haven / ambientCG) into readable pixel tiles. Naive
  downsample plus palette produced noise (section 14), so segmentation into stones plus
  per-stone ramps may be needed. Otherwise paint by hand.
- Is a hand-clean-up pass per frame affordable for the owner (time), or should P2 stop at step 8
  (authored models + live bake)?

---

## 13. Sources

Code read (raw GitHub or WebFetch of GitHub pages):
- three.js `RenderPixelatedPass.js` and `webgl_postprocessing_pixel.html`, mrdoob/three.js `dev`
- [bababuyyy/unity-isometric-pixel-pipeline](https://github.com/bababuyyy/unity-isometric-pixel-pipeline): `OutlineShader`, `SharpUpscaleShader`, `ToonLit`
- [astrellon/godot-3d-pixel-art](https://github.com/astrellon/godot-3d-pixel-art): `camera/main_camera.gd`, `materials/outline.gdshader` (David Holland / denovodavid code)
- [leopeltola/Godot-3d-pixelart-demo](https://github.com/leopeltola/Godot-3d-pixelart-demo): `pixelart_stylizer.gdshader`
- [Robert-K/godot-3d-pixel-art](https://github.com/Robert-K/godot-3d-pixel-art): README, `scripts/camera_rig.gd`
- [CelestialLemon/pixel3d-renderer](https://github.com/CelestialLemon/pixel3d-renderer): README
- Licences: Pixelorama (MIT), SpriteSheetMaker (MIT), BlenderSpriteGenerator (MIT), Laigter (GPL-3), LibreSprite (GPL-2), Aseprite (EULA), Kenney starter kits (MIT code / CC0 assets)

Articles and interviews (mostly via search summaries; sites blocked for direct reads):
- [Wikipedia: HD-2D](https://en.wikipedia.org/wiki/HD-2D) · [Unreal spotlight: Octopath](https://www.unrealengine.com/spotlights/octopath-traveler-s-hd-2d-art-style-and-story-make-for-a-jrpg-dream-come-true) · [Unreal interview: Octopath II](https://www.unrealengine.com/en-US/developer-interviews/octopath-traveler-ii-builds-a-bigger-bolder-world-in-its-stunning-hd-2d-style)
- [Nintendo Life: OT2 picture-perfect](https://www.nintendolife.com/news/2022/10/octopath-traveler-ii-devs-aimed-to-make-its-hd-2d-visuals-picture-perfect) · [Nintendo Wire](https://nintendowire.com/news/2022/10/31/octopath-traveler-ii-devs-on-presentation-and-not-succumbing-to-pure-pixel-art-nostalgia/) · [My Nintendo News](https://mynintendonews.com/2022/10/29/octopath-traveler-ii-devs-discussed-the-games-camerawork/)
- [Nintendo Life: Triangle Strategy](https://www.nintendolife.com/news/2022/05/triangle-strategy-producers-talk-hd-2d-and-why-other-devs-havent-used-it) · [Destructoid](https://www.destructoid.com/triangle-strategy-interview-producers-asano-arai-square-enix-hd-2d-tactics-rpg/) · [GamingBolt](https://gamingbolt.com/triangle-strategys-art-style-costs-more-than-youd-think-producer) · [DF via Nintendo Life](https://www.nintendolife.com/news/2022/03/digital-foundry-shares-its-tech-review-of-triangle-strategy)
- [Siliconera: DQ3 HD-2D](https://www.siliconera.com/interview-preparing-a-hd-and-2d-dragon-quest-iii-remake/) · [PlayStation Blog: DQ3](https://blog.playstation.com/2024/11/08/dragon-quest-iii-hd-2d-remake-interview-how-the-classic-rpg-was-revamped-for-its-ps5-debut/) · [Digital Trends](https://www.digitaltrends.com/gaming/dragon-quest-3-hd-2d-remake-interview-save-state/)
- [NME: Live A Live](https://www.nme.com/news/live-a-live-remake-took-three-years-to-create-3221385)
- [Game Developer: Dead Cells 3D pipeline](https://www.gamedeveloper.com/production/art-design-deep-dive-using-a-3d-pipeline-for-2d-animation-in-i-dead-cells-i-) · [GameAnim](https://www.gameanim.com/2018/01/31/dead-cells-3d-pipeline-2d-animation/) · [Sudo Null](https://sudonull.com/post/14066-Dead-Cells-Using-3D-Pipeline-for-2D-Animation) · [Blender Artists thread](https://blenderartists.org/t/mimicking-dead-cells-workflow-from-3d-animation-to-2d-pixel-animation/1124638)
- [David Holland: 3D Pixel Art Rendering](https://www.davidhol.land/articles/3d-pixel-art-rendering/) · [Unity Discussions: recreating t3ssel8r](https://discussions.unity.com/t/recreating-t3ssel8rs-3d-pixel-art/928878) · [Texel Splatting, arXiv 2603.14587](https://arxiv.org/abs/2603.14587)
- [Sea of Stars press kit](https://sabotagestudio.com/presskits/sea-of-stars/) · [TechRaptor: Children of Morta](https://techraptor.net/gaming/previews/how-dead-mage-created-art-for-children-of-morta) · [arXiv 2212.09692 normal maps for pixel art](https://arxiv.org/pdf/2212.09692) · [Defold forum](https://forum.defold.com/t/normal-map-lighting-for-2d-pixel-art-sprites/70967)
- [Kotaku: HD-2D Pokémon fan demo (Dott, UE5)](https://kotaku.com/pokemon-hd-2d-octopath-traveler-fan-art-unreal-engine-5-1850350661)
- [Bubblehead: texture painting pixel art onto a mesh](https://bubblehead-game-dev.com/articles/texture-painting-pixel-art-onto-a-mesh-in-blender) · [Blender Artists: low-poly pixel textures](https://blenderartists.org/t/how-to-make-3d-models-with-pixel-textures-low-poly-pixel-art/1179588) · [Pixel Kit FAQ](https://superhivemarket.com/products/pixel-kit---one-click-pixel-art-renderer/faq)
- [Laigter (itch)](https://azagaya.itch.io/laigter) · [Aseprite open vs paid](https://en.bioerrorlog.work/entry/aseprite-open-vs-paid-version)

---

## 14. Follow-up verification pass (primary sources now reachable)

| Claim | Before | Now | Primary source |
|---|---|---|---|
| EEVEE `render.filter_size` controls AA softness; default 1.5; range 0–500 | verified (ran) | **verified: docs + ran** | [bpy RenderSettings](https://docs.blender.org/api/current/bpy.types.RenderSettings.html), [EEVEE Film](https://docs.blender.org/manual/en/latest/render/eevee/render_settings/film.html) |
| Cycles pixel filter Box = "No filter"; Width lower = crisper | verified (ran) | **verified: docs** (the Cycles property names are not in the bpy API reference) | [Cycles Film](https://docs.blender.org/manual/en/latest/render/cycles/render_settings/film.html) |
| `taa_render_samples` = render samples per pixel, default 64 | ran | **verified: docs** | [SceneEEVEE](https://docs.blender.org/api/current/bpy.types.SceneEEVEE.html) |
| Shader to RGB is EEVEE-only; diffuse → color ramp toon is the documented use; breaks render passes and AO/soft shadows | verified (ran) | **verified: docs** | [Shader To RGB](https://docs.blender.org/manual/en/latest/render/shader_nodes/color/shader_to_rgb.html) |
| Freestyle uses mesh data plus Z-depth; ABSOLUTE thickness is in pixels | ran | **verified: docs** | [Freestyle intro](https://docs.blender.org/manual/en/latest/render/freestyle/introduction.html), [RenderSettings](https://docs.blender.org/api/current/bpy.types.RenderSettings.html) |
| Line Art modifier generates strokes from the active camera; each modifier recomputes occlusion | not checked | **verified: docs** (still not run) | [Line Art](https://docs.blender.org/manual/en/latest/grease_pencil/modifiers/generate/line_art.html) |
| `RenderPixelatedPass(pixelSize, scene, camera, options)`; `depthEdgeStrength` default 0.4, `normalEdgeStrength` default 0.3 | verified (code) | **verified: docs** (the docs page mislabels depthEdgeStrength as "The normal edge strength", same as the source comment) | [docs](https://threejs.org/docs/pages/RenderPixelatedPass.html), [example](https://threejs.org/examples/webgl_postprocessing_pixel.html) |
| MeshToonMaterial `gradientMap` needs NearestFilter and NoColorSpace | general knowledge | **verified: docs** | [MeshToonMaterial](https://threejs.org/docs/pages/MeshToonMaterial.html), [toon example](https://threejs.org/examples/webgl_materials_toon.html) |
| `Texture.generateMipmaps` defaults to true (turn off for pixel art) | general | **verified: docs** | [Texture](https://threejs.org/docs/pages/Texture.html) |
| MeshLambertMaterial has `normalMap` | verified (npm source) | **verified: docs** | [MeshLambertMaterial](https://threejs.org/docs/pages/MeshLambertMaterial.html) |
| RenderTarget `count` (MRT) and `depthTexture` options | general | **verified: docs** | [RenderTarget](https://threejs.org/docs/pages/RenderTarget.html) |
| LUTPass takes `{ lut: Data3DTexture }` and has `intensity` (default 1) | name was wrong (`lutIntensity`) | **fixed + verified: docs** | [LUTPass](https://threejs.org/docs/pages/LUTPass.html) |
| Kenney, Poly Haven and ambientCG assets are CC0 | secondary | **verified: primary sites** | links in section 11 |

**New experiments (scratch in `/tmp/hd2d-exp`; no assets added to the repo):**

1. **Kenney Modular Cave Kit** (7 MB zip, 40 `.glb` pieces plus FBX/OBJ, `License.txt` CC0).
   `render_kit.py` imports `room-large.glb` in headless bpy, sets every image node to
   `interpolation='Closest'`, and renders an ortho 35° view at 320×180 in Cycles (64 spp,
   filter_width 0.01) in **2.4 s**. It loads and frames fine. The first attempt had a black floor
   with sun shadows on, cause not investigated; with `use_shadow=False` it rendered correctly. The
   kit is **smooth, flat-coloured (one colormap) cave geometry**: a good source of **authored
   silhouettes** (rounded walls, pillars, stairs) to re-texture with pixel tiles. The look is not
   HD-2D as-is.
2. **Kenney Retro Textures Fantasy**: 117 PNGs at 64×64 (some 64×128). Stone floors and walls,
   wood planks (plus damaged and `_depth` variants), doors, grates, and a lit window. These are
   real hand-made low-res tiles at one density, a usable CC0 base for the lodge, stairs and floor
   areas. Their palette needs re-grading to Orbkin's warm ramps.
3. **Poly Haven `rock_wall_08`** (CC0, 1k diffuse + GL normal via the API) through
   `photo2pixel.py`: box-downsample to 32 or 64 px, mix luminance with N·L from the normal map,
   4×4 Bayer, map to a 6-shade hue-shifted ramp. **Result: noisy speckle. The individual stones
   do not survive.** Photo textures are **not** a shortcut to pixel textures. Pixel tiles need
   designed shapes (painted, or procedurally structured like Orbkin's `TintedTile` mosaic), so
   Orbkin's painter approach is right for textures. What needs authoring is the **geometry**.

**Net effect on the plan (section 10):** P1 gets concrete CC0 inputs. Use the Kenney cave kit for
blockout silhouettes or as modelling reference, Kenney Retro Textures for wood, stone and door
surfaces, and Poly Haven rock **models** (`/assets?t=models&c=rocks`) as shape sources to decimate
and pixel-texture. Keep Orbkin's own painters for the rock faces.
