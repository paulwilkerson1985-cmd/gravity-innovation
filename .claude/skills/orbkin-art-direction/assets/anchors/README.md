# Anchor roles (no images live here)

The anchors are copyrighted frames (Octopath Traveler store shots, a YouTube frame, the fan art with
Nintendo IP). They never enter the repo, a skill, an artifact or an upload. The verifier
(orbkin-visual-gate) loads them at run time from the sealed folder `game/tools/verify/sealed/`
(or a private board outside the repo, manifest `refboard.json` with sha256 + source + role); generator
sessions never read them. This skill names the **roles**, the scale they are shown at and the measured
**ranges**; `critique.py --anchor` consumes the sealed numbers only when the verifier runs it.

| Role | What it is | Scale shown to a judge | What it anchors |
|---|---|---|---|
| **A1** | Octopath battle/victory camera frame (1916x1079; clean phase-locked sprites 31-35 texels tall at 15-24 % of frame height) | 640-px thumbnail of the whole frame + a 2x nearest crop of the sprite group | the battle camera: low angle, 3-4 sprites, strong tilt-shift (top 0.14 / bottom 0.44 of peak sharpness), bright sky, warm/cool split; the "HD" half (smooth bokeh and haze over crisp sprites) |
| **A2** | Octopath field store shot (`bg4` desert; variant `bg1` village terraces, 3840x2160, official PS Store) | 640-px thumbnail only | the field camera: focus band in the middle third (0.5-0.67 of height), dark/mid/light masses, sprites at 10 % of height, env texel = sprite texel, "no sky, back is higher" |
| **A3** | the fan-art cave battle (an AI-assisted browser demo frame, mixed sprite grids, soft textures) | 640-px thumbnail only, **never native** | battle layout and mood only: creature pair + trainer, warm cave, 2-3 shafts beside the subjects, cream HUD |

Per-scene pairing: cave/volcanic -> A1 + A3; meadow/flowers/hollow -> A1 + A2 (`bg1`); coast/shallows
-> A1 + `bg3` (harbour) or `bg2` (cool night). Never more than 3 anchors per judge call. Never judge the
UI against an anchor (A1/A2 have none, A3's biases toward copying its HUD).

## Target ranges the anchors supply (critique context, never gates)

| Quantity | Octopath store median (range) | A3 fan art | Orbkin cave now | Move toward |
|---|---|---|---|---|
| lit-area b* | 16 (10-29) | 28 | 36 | ≤ 28 |
| chroma p95 | 37 (18-48) | 37 | 49 | ≤ 40 |
| cool share (b* < 0) | 0.14 (0.001-0.99) | 0.05 | 0.002 | ≥ 0.05 |
| notan dark/mid/light | 0.51/0.33/0.14 | 0.40/0.42/0.18 | 0.37/0.42/0.21 | ≈ 0.45/0.37/0.18 |
| DoF top / bottom band (rel. to peak) | 0.54 / 0.51 (A1: 0.14 / 0.44; fields 0.42-0.65 / 0.26-0.31) | flat | 0.78 / 0.80 | ≤ 0.7 / ≤ 0.5, focus band on the subjects |
| sprite height (battle) | 15-24 % of frame | 11-19 % | 9-18 % | keep; kin stage 1 at 24-28 texels is fine |
| focal edge ratio | 1.8-9.5 | 1.7 | 3.1 | keep |
| UI share | n/a | 0.195 | 0.255 | ≤ 0.20 desk |

Calibration facts to remember: blind at native size Opus does **not** rank A3 above the current cave
(3/6); at thumbnail size it does (6/6). So the remaining gap is the large-scale read (composition,
value masses, light, sprite integration), not texel detail. The pairwise gate compares the candidate
against the **last accepted Orbkin frame**; anchors only add quality-bar context and sealed numbers.

Never copy shapes, palettes, characters, creature or UI designs from the anchors: `ip_check.py`
(orbkin-visual-gate) runs on any new design.
