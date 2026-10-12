# Creature design sheet

All 18 Orbkin are original designs. Every species has a bespoke builder in
`src/render/creatures/designs.ts` (keyed by species id; `look` in `src/data/species.ts` is only
used by the generic fallback for species without a design). Lineup sheets:
`docs/screenshots/creatures/`. Review tool: `?scene=model` (see the header of `src/scenes/model.ts`
for `species=`, `view=`, `lineup=`, `battle=1&mine=&foe=`, `anim=`, `theme=`, `legacy=1`).

## Rules of the style
- **Low-poly, flat-shaded, one merged mesh** per creature (+ blob shadow): ≤ 2,500 triangles
  (stage 1 ≤ 1,800), built in a few ms. Primitives: ellipsoids, tapered jointed limbs, tubes,
  lathes and **solid bevelled slabs** for every wing/fin/leaf/ear — never zero-thickness planes.
- **Read at ~420 px tall.** Parts are ≥ ~0.05 model units thick; each creature has one big
  signature shape and 2–3 colour blocks (main / belly / accent) plus dark details.
- **Eyes** are placed on the head's ellipsoid surface along its normal (`eyes()`), so nothing
  sinks or intersects them; stage 1 = huge round eyes, stage 2 = slanted, stage 3 = brows/irises.
- **Countershading by face normal** (belly colour on downward faces), mild baked top-light and a
  self-lit ambient term in the material so no face renders near-black under any scene's lights.
- **Ground contact:** models are auto-grounded (lowest vertex at y = 0); fliers hover modestly
  (`hover`, ≤ 0.24) and their elliptical footprint shadow shrinks/fades with height.
- **Secondary motion** lives in the vertex shader (per-vertex rig: flap, wag, nod, flicker,
  blink, twitch, roll) — still one draw call.
- **Escalation:** each evolution changes silhouette, posture and proportions and grows its
  signature part — never just a scale-up.

## Flame line — fire fox → crowned flame beast
| | Concept & silhouette | Signature | Palette |
|---|---|---|---|
| **Ashkit** | Chubby fox kit, head as big as the body, stubby legs, huge ears. Bouncy trot. | Sooty ear tips and socks; a glowing ember on a short fluffy tail. | orange `#ff7a2e`, cream mask/belly, charcoal soot, ember yellow |
| **Cindertail** | Lanky adolescent fox: long legs, long snout, swept ears, slanted eyes. | Bushy tail ending in a big flame plume; cream flame ruff on the chest; soot "boots". | vermilion, cream, charcoal, gold |
| **Pyrelord** | Heavy, chest-high beast with thick gauntleted legs and a proud head. | Flame crown between swept charcoal horns, fiery mane collar, comet-flame tail, ember studs on the spine, golden eyes under a brow, gold claws/bands. | crimson `#d8321e`, gold, charcoal, flame orange/yellow |

## Tide line — droplet → river surfer → sea serpent
| | Concept & silhouette | Signature | Palette |
|---|---|---|---|
| **Dropple** | A wobbly water droplet with a face, hopping. | Curling droplet tip, glossy shine spots, tiny flipper fins. | sky blue `#3fa9f5`, pale aqua face, deep-blue fins |
| **Rillback** | Low, long otter on webbed paws, round head with whiskers. | The broad flat **surfboard back** (white with a racing stripe) and a paddle tail with a fluke. | blue, pale aqua belly, white board, navy stripe |
| **Maelstrode** | One continuous body: a whirlpool coil on the ground rising into a proud S-neck. | Spiral coil (the whirlpool), white fin frills and crest, thick barbels, dorsal fins, tail fluke rising from the coil's centre. | deep blue `#1e64c8`, aqua belly, white fins, gold eyes |

## Flora line — moss puff → thistle grazer → walking thicket
| | Concept & silhouette | Signature | Palette |
|---|---|---|---|
| **Mossling** | Round mossy puffball with lumpy moss clumps, tiny feet, pink cheeks. | A swaying two-leaf sprout; a tiny pink blossom in the moss. | grass green, pale green face, pink |
| **Thistlehorn** | Stocky goat/deer grazer with hooves and leaf ears. | One forward horn crowned by a **purple thistle bloom**; a mossy mantle on its back fringed with rounded leaves lying flat down the flanks. | green, pale lime belly, purple bloom, bone horn |
| **Verdantusk** | Massive, low, pillar-legged thicket beast with a heavy brow. | Big curved **ivory tusks**; a grove (two little trees, bushes, ferns, pink blossoms) growing on its back; thistle crown; leaf ears. | deep green, lime belly, bark brown legs, ivory, pink |

## Spark line — static bug → storm moth
| | Concept & silhouette | Signature | Palette |
|---|---|---|---|
| **Flickwing** | A static-charged firefly: one round fuzzy body whose fur stands on end, lifted orange wing cases, fast-buzzing pale-cyan wings. | **Glowing lantern tail**, zig-zag lightning-bolt antennae with cyan spark tips, static-fluffed crest. | yellow `#ffd83a`, lantern pale yellow, orange cases, cyan sparks |
| **Stormoth** | Big moth with wide storm wings held in a V, slower wingbeats, hovers higher. | Indigo wings with a **yellow lightning bolt** and cloud spots, white storm-cloud ruff, feathery antennae. | gold, indigo `#3d2fa0`, violet, cloud white |

## Terra line — pebble → crystal-fisted boulder
| | Concept & silhouette | Signature | Palette |
|---|---|---|---|
| **Pebblet** | A faceted pebble with a face and a little nose (it sneezes). | Cyan crystal sprouts on its back. | sandstone brown, light face, cyan crystals |
| **Cragmaul** | Hunched boulder brute, tiny head sunk between huge shoulders, knuckle-walking. | **Crystal-studded fists** resting on the ground; crystal cluster on the back; cyan eyes under a rock brow. | brown, light chest, dark fists, cyan |

## Gale line — puff chick → cyclone raptor
| | Concept & silhouette | Signature | Palette |
|---|---|---|---|
| **Breezel** | Round puff chick (one big puff + head), stubby wings. | Curly **wind-swirl tuft**; rides a little cloud cushion. | pale sky blue, white, orange beak |
| **Cyclonyx** | Sleek raptor, wings raised in a V, hooked beak, fierce brow. | Two long **tail streamers** with orange tips; swept crest; orange primaries. | sky blue, light underwings, white, orange |

## Rare singles
| | Concept & silhouette | Signature | Palette |
|---|---|---|---|
| **Vulcrag** (Flame/Terra) | A squat volcano-cone golem — upright, wide base, crater top. Distinct from Cragmaul's hunched brute. | Erupting crater with a lava pool, glowing **magma veins**, molten fists, glowing eyes and mouth. | basalt black, magma orange, lava yellow |
| **Surgeray** (Tide/Spark) | An electric ray resting on the ground — wing-fin tips touch the floor, nose slightly raised. | Yellow lightning bolts on the wings and back, bolt-tipped whip tail, electric-node antennae. | royal blue, pale belly, yellow |
| **Petalwisp** (Flora/Gale) | A floating flower spirit (no bird parts): face in a blossom crown, petal skirt, leaf arms. | Wind-wisp tail spiralling to a point; six-petal crown. | pink, blush face, magenta undersides, leaf green |

## Animation (CreatureView)
Idle styles per design (trot, bounce, float, glide, sway, heavy) with breathing, blinks
(occasionally double) and rig motion. `lunge`: anticipation crouch + lean back → stretched
lunge → impact squash → hop back → landing squash. `hit`: white flash, recoil tilt away from the
attacker with a damped spring, knock-back; strong hits get a ~2-frame hit-stop first.
`faint`: eyes shut, hurt hop, topple sideways, flatten and sink. `appear`: pop with squash wobble.
