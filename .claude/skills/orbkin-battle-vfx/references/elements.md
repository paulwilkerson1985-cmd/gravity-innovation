# Element identity: shape, motion, ramp, light, signature frames

Contents: 1 the table · 2 per-element signature frames (Spark, Flame, Tide, Terra, Flora, Gale,
Neutral) · 3 impact book anatomy (all elements) · 4 flipbook authoring recipe · 5 size and placement

Shape and motion carry identity; colour is second. Every element gets the same impact book
anatomy (§3) tinted by its ramp, then its own body and dissipation. Ramps are `FX_RAMPS` in
`game/src/render/hd2d/fx.ts` (index 0 transparent, then dark → light).

## 1. The table

| Element | Shape language | Motion and timing | Ramp | FX light | Dissipation |
|---|---|---|---|---|---|
| Spark | zigzags with sharp angles, branching, **no curves**; 1-texel lines, a 2-texel core near the strike | **fast**: on twos with blank frames, ≤ 0.5 s total, set dim 15–35 % | `spark` (orange edge, yellow, white core) | yellow `#fff27a`, on/off with the blank frames | sparks resolve in 3 f; fade the first bolt shape, blank, gone |
| Flame | teardrops, licks with pointy tops, bubbles; hot core at the base/centre | rises; new waves every 2–3 f; fast fade | `flame` 5 + `smoke` 4 | warm `#ffb050`, flicker ±15 % at 8–12 Hz | shrink, burn-through holes (round Voronoi clumps), smoke rises 1 texel/frame and fades slowly |
| Tide | arcs, crowns, columns, round droplets, foam clusters | up then gravity; crown spreads outward; ripples on the floor | `water` + `foam` | cool `#d8f2ff`, brief (≤ 200 ms) | droplets fall, foam ring spreads and thins, wet decal lingers |
| Terra | chunky polygons, shards, dust puffs | heavy: fall on gravity, ground shake / camera dip, slower settle | `rock` + `dust` | none, or a dust-tinted bounce | shards land, dust rolls out and thins by clumps |
| Flora | leaves tumbling, vines growing, petals | swirl, curved paths, gentle | `leaf` | soft green, low | petals drift down, vines retract |
| Gale | crescent slashes, spirals, speed lines | fast sweeps, smears, arcs | `wind` | none | funnel thins from the top, dust lifts |
| Neutral | impact star, speed lines, grit | one pop, lines fly out | `star` (tinted) | white, short | lines shrink, grit falls |

## 2. Signature frames

**Spark** (the pilot target). BG/set dim 20–35 % starts with the charge (2–4 f before the strike)
→ **first shock**: the bolt book frame with sharp angles, strike point on the target → **brighter
different shape** (a second re-seeded arc frame, white core wider) → **blank frame** → contrast
frame + white flash over the target with the FX light at its peak (impact) → fade of the first
shape (orange edge only) → blank → 3 frames of sparks/grit falling → set dim released over 6–8 f.
Keep the whole thing ≤ 30 f from first shock to last spark. Emerald electric runs at ≈ 12 fps with a
new spark every 2 frames; saint11: "always make stuff flicker". The bolt is a **pixel arc book at the
sprite texel** (core/glow/edge), never the smooth 3D box ribbon the default renderer uses.

**Flame.** fireball travel with embers → contrast disc → white disc + 4 light lines → 6-ray sharp
blast over the body → broken blast (hole) → body (teardrops, hot core at the base) with the rim
cooling by one shade from the outside in → burn-through holes (14 round clumps, radius 1 + 7·t^1.3
texels) replaced by smoke on the `smoke` ramp that rises 1 texel per frame. Smoke must never be
darker than the darkest set value near the target (the research's dark smoke read as a black hole on
the cave floor): pick the smoke ramp per arena.

**Tide.** white crest flash → one authored crown + column book (not a ring of identical splash
books: repetition tell) → droplets on ballistic arcs (points) → foam ring (points, drag) → wet decal.
The crown book needs to be ≈ 1.5× the target and partly in front; the research's 40-texel book hid
behind a 30-texel kin.

**Terra.** camera dip (a vertical kick) on contact, spikes erupting in an open arc behind the target,
debris arcs on gravity, a dust ring that rolls out and breaks into clumps.

**Flora.** leaves spiral in, vines sprout (growing frames), a petal burst; everything curved and
gentle; the hit itself still gets the impact book, scaled down.

**Gale.** a smear crescent (3 frames: thin → full → thin), a funnel behind the target, dust lift;
the flash is a thin white crescent, not a disc.

## 3. Impact book anatomy (every element, tinted by its ramp)

| Frame | Content | Where | Frames held |
|---|---|---|---|
| f0 contrast | dark disc, ramp index 1 (the darkest shade), ≈ 0.42 of the book radius | over the target, renderOrder ≥ 8 | 1 |
| f1 white flash | white disc (top index), 1-texel hot rim, 4 light lines along the axes | over the target | 1–2 (hold 3–4 on crits/KO) |
| f2 sharp blast | 6 rays, long on alternating axes, three value bands, 1-texel dark edge band | behind the target (renderOrder 5) | 2 |
| f3 broken blast | the rays with the centre blown out, 8 % smaller | behind | 2, then the element body |

`scripts/impact_book.py` draws these four frames on any ramp; `book_from_renders.py` turns them
(plus the body frames) into one book. The flash frames go **in front** of the target (an additive
batch at renderOrder 8 keeps the sprite readable through it); blast and body go **behind** (5).
Point the open side of any ring or crown toward the camera (`openArc` already does this).

## 4. Flipbook authoring recipe (hand-ruled key frames first, Blender optional)

1. Block the timing with the beat sheet and confirm it with `fx_timeline.sh` before any art.
2. Hand-rule the key frames: `python3 ${CLAUDE_SKILL_DIR}/scripts/impact_book.py DIR --ramp spark --size 32`.
3. Body source, one of:
   - **by hand**: paint frames at the target texel size as RGBA PNGs on the ramp colours (any tool,
     or a small Python painter); `book_from_renders.py` passes same-size frames through untouched;
   - **Blender** (`"$ORBKIN_BPY" -I ${CLAUDE_SKILL_DIR}/scripts/blender_fx.py -- arc|splash|fire DIR
     --size 96 --frames 12 [--aspect 2:3]`): arc = bevelled midpoint-displaced curves (0.3 s for 12
     frames), splash = metaballs (2 s), fire = Cycles 4D-noise volume (≈ 7 s per frame at 128 px / 8
     spp; use 96 px / 6 spp first). Mantaflow does not work in the pip bpy module. Pure Blender output
     reads as a blob: it needs the hand-ruled key frames and shape dissipation on top.
4. Pixelise and palette-lock: `python3 -I ${CLAUDE_SKILL_DIR}/scripts/book_from_renders.py --id
   spark-arc --out game/src/render/hd2d/books --ramp spark --w 32 --h 48 --fit --thr 0.2 --edges
   0.25,0.55,0.9 KEYFRAMES_DIR BODY_DIR` (premultiplied BOX downscale → value by the sequence's 99th
   percentile → ramp index by band edges with Bayer only within `--dither` of an edge → optional
   closing → 3×3 mode filter → orphan cleanup → dark edge band → JSON + PNG atlas). Check the `.x4.png`
   preview: solid bands, a value structure (dark edge → mid → hot core), no speckle, ≤ 6 colours.
5. Load the JSON as an external book (`references/fx-api.md` §5) and play it at the sprite texel.
6. Verify with the strip, never with a still.

Budget per book: ≤ 12 frames of ≤ 48×48 texels, ≤ 6 colours per ramp (flame + smoke ≤ 10), ≤ 80 KB
RGBA. The game's kin are 28–40 texels tall: a 32–40 texel book frames them, a 48-texel book is a
strong/signature move.

## 5. Size and placement

- FX scale (whole internal px per texel) = the **target sprite's** texel size (`SpriteSubject.rect.px`,
  2 on the 1280×720 desk capture), for every piece of one effect. Today `texScale()` returns 1 and
  crowns/stars use `k*2`/`k*3`: mixels. One density per effect, same as the sprites.
- Normal move ≈ the target's height; strong 1.3×; signature ≤ 1.6×. `screenFit` already trims on
  portrait phones; keep it.
- The target must stay readable: only the flash in front, bodies behind or in an open arc; nothing
  darker than the local set value on the camera side.
