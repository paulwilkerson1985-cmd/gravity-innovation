# Assets

All art is procedurally generated in code (`src/render/`). No external models, textures, fonts or audio are used. The one font file in the repo, `src/assets/fonts/orbkin-pixel.otf`, is our own: generated from glyph bitmaps in `tools/pixelfont/glyphs.ts` by `tools/pixelfont/build.ts`. The HD-2D prototype's pixel textures (`src/render/hd2d/textures.ts`), window cookie and figures are painted/built procedurally at runtime too; no CC0 or third-party packs.

| Asset | Source | License |
|---|---|---|
| Orbkin Pixel font (`src/assets/fonts/orbkin-pixel.otf`, 206 glyphs) | Original bitmap font drawn for this project in `tools/pixelfont/glyphs.ts`; outlines traced and written with `npx tsx tools/pixelfont/build.ts` (opentype.js, MIT, used as a build tool only — nothing of it ships) | Original, project-owned |
| UI frames, icons, orb/item icons (pixel art) | Character grids in `src/ui/pixel/skin.ts` and `src/ui/icons.ts`, turned into SVG data URIs at runtime | Original, project-owned |
| All audio (music, SFX, move cues, creature cries) | Synthesized at runtime with the Web Audio API in `src/audio/` — no audio files | Original, project-owned |
