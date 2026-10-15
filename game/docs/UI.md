# UI system — the HD-2D "slab" over the diorama

The HTML UI (menus are DOM over the canvas) uses one material everywhere: dark translucent slab
panels with a one-texel gold hairline, parchment text in one OFL superfamily (Alegreya) rendered at
device resolution, ▶ cursors and a fading gold ribbon on lists. The owner picked it in a blind A/B
over the earlier cream handheld panels (`docs/DECISIONS.md`, "UI skin: slab2"); research and
measurements: `docs/research/graphics/ui-hud-typography.md`. Screens: `docs/screenshots/ui-slab/`.
It is an original design in the spirit of HD-2D battle UIs — not a copy of any game's layout,
names or icons.

## Rules

1. **Frames on the world texel, type at device resolution.** 1 UI pixel = 2 CSS px: frames,
   bars, cursors, chips and rules live on that grid (`ui/pixel/skin.ts`); text is a smooth face
   and never uses the pixel font. Mixing the pixel font with the slab is the tell the research
   found, so `Orbkin Pixel` is not loaded by any screen. Big screens (≥ 1600×900) zoom the whole
   UI by **1.5** — `style.css` and `scenes/framing.ts uiZoom` must agree.
2. **One typographic voice.** `UI Caps` (Alegreya Sans SC 500/700) for labels, names, commands,
   headings — true small caps, so text is never forced to uppercase; `UI Sans` (Alegreya Sans
   500/700) with tabular lining figures for numbers (HP, levels, stats); `UI Serif` (Alegreya
   400/500) for dialogue and prose (blurbs, descriptions, hints) in sentence case. No system sans.
3. **Legibility floor: x-height ≥ 7 CSS px on desktop, ≥ 18 device px on phones** (DPR 2.75 =
   6.5 CSS px). x-height/em: UI Caps 0.501, UI Sans 0.464, UI Serif 0.456. Tokens: `--f1` small
   information tier (chips, tags, meta, notes) **15px on phones, 18px on desktop** (≥ 1024×600);
   `--f2` 22/24, `--f2t`, `--f3` 30 (700), `--f4` 40 (700); `--fnum` 20/24 and `--fnum-s` 16 (18
   desktop) for numbers; `--ftext` 22/28 dialogue (18/20 in the phone battle box), `--ftext-s` 15
   (18 desktop) small prose. `--f0` is decoration only. `e2e/layout.spec.ts` (`hudIssues`) fails
   any visible battle-HUD text under the floor (per-face x-height), any wrapped label (names,
   levels, HP numbers, chips, tags and command/move names `.mn`) and any info box overlapping a
   panel.
4. **Labels never wrap.** The smooth face is ~12 % wider than the old pixel font: command and
   move names step down (23 → 20 → 18 px on phones, 17 px under 380 px) instead of wrapping.
5. **The UI is never the brightest mass on screen.** Panel fill is the body's plum-black at 80 %
   (no backdrop blur); role fills (`--bc`) are dark tints so parchment text keeps ≥ 4.5:1. No
   rounded corners, soft shadows or gradients on frames; the selection ribbon may fade
   horizontally. Drop shadows are hard offsets.
6. **Motion**: panels and modals enter in 220–280 ms with an ease-out (`cubic-bezier(.2,.7,.2,1)`),
   exits ≈ 75 % of that, transform/opacity only; cursor moves are instant; blinks stay `steps()`;
   `prefers-reduced-motion` disables them.
7. **Touch targets ≥ 44 px** even when rows look compact; every list row is a real `<button>`.
8. **States**: focus = ▶ gold cursor + the gold ribbon with a 1-texel under-rule (list rows) or a
   2-px gold-hi ring with a dark gap (standalone buttons); hover = a quieter lift (paper-2 on rows,
   +16 % gold mix on keycaps; the hover cursor only on mouse devices); selected = ribbon / bronze
   fill; pressed = keycap drops 4 px onto its base; disabled = `--ink-3` text, no hairline, no
   cursor (≥ 3:1).
9. **Keep test ids.** e2e specs drive everything through `data-testid`; restyle, don't rename.

## Fonts

Six latin-subset woff2 files (144 KB) vendored in `src/assets/fonts/` with their SIL OFL 1.1 text
(`OFL-Alegreya.txt`); source, version and sha256 in `ASSETS.md`. No npm dependency. Declared with
`@font-face { font-display: block }` in `style.css` and every face awaited with
`document.fonts.load()` in `main.ts` before the first scene, so text paging and camera framing
measure real glyphs. Rendering: `-webkit-font-smoothing: antialiased; text-rendering:
optimizeLegibility; font-kerning: normal; font-synthesis: none`. Symbols outside the latin subset
(✓ ▶ ⇄) fall back to the platform's symbol font.

## Tokens (`src/style.css :root`)

| Token | Value | Use |
|---|---|---|
| `--ink` / `--ink-2` / `--ink-3` | `#f3ead6` / `#c9bb9c` / `#8a8070` | parchment text / secondary / disabled only |
| `--line` | `#0c0910` | outlines: frames, keycaps, bars, chips; dark text on light chips |
| `--paper` / `--paper-hi` / `--paper-2` / `--paper-3` | `#1a1420` / `#2b2233` / `#231b2a` / `#3d3145` | slab fill, raised keycaps & tiles, wells & hover, rules |
| `--gold` / `--gold-hi` / `--hair` | `#e3c27e` / `#f6dfa6` / `#cfae6e8c` | cursor, accents, focus ring / keycap hairline |
| `--amber` / `--amber-hi` / `--amber-lo` | `#6e5530` / `#f6dfa6` / `#d9b874` | gilded fill (primary, active tab, tags) / its top row / gold section labels |
| `--ribbon`, `--sel` / `--sel-2` | fading gold gradient, translucent golds | cursor row, selected item |
| `--good` `--mid` `--low` (+ `-hi`) | `#63c96a` / `#e9b443` / `#e05a48` | HP fill by %, top highlight row in the `-hi` tone |
| `--xp` / `--xp-hi` | `#5aa8e8` / `#b6e0ff` | XP bar and tag (the one reserved cool hue) |
| `--track` | `#0c0910` | empty bar well |
| `--fr-panel` `--fr-plate` `--fr-well` | SVG data URIs | 9-slice frames, installed by `ui/pixel/skin.ts` |

Type colours stay in `ui/dom.ts TYPE_COLORS`. Contrast: parchment on the 80 % slab over a white
scene ≥ 8:1 (worst case), secondary ≥ 5:1, disabled ≥ 3:1; chip text ≥ 4.5:1 (`inkSafeFill`).

## Components

| Component | Markup / class | Notes |
|---|---|---|
| **Panel** | `.panel`, `.sheet`, `.modal`, `.meta-panel`, `.arena-card`, `.textbox`, `.bt-menu`, `.frame` | `border: 12px` + `border-image: var(--fr-panel) 12 fill`: dark outer line with notched corners, one-texel gold hairline with brighter corner ticks, dark inner line, 80 % slab fill. |
| **Plate** | `.plate`, `.pill`, timers, captions | denser slab 9-slice (`--fr-plate`, 6 px) with a gold hairline — read-outs that sit on the 3D scene. |
| **Well** | `.set-group`, `.buy-box`, `.arena-detail`, `.arena-vstat` | inset 9-slice (`--fr-well`, 6 px): shaded top/left, faint gold bottom/right. |
| **Dialog** | `.textbox` + `.text` + `.text-next` | serif typewriter text (`battle.ts say()`), gold ▼ blinking `steps(1)` while waiting. |
| **List with cursor** | buttons inside `.bt-menu`, `.spot-buttons`, `.party-list`, `.bag-list`, `.shop-list`, `.item-pick`, `.arena-modes`, `.menu-grid`, or `.list-row` | flat rows, ≥ 44 px, gold ▶ cursor (`::before`, a clip-path pixel triangle) + gold ribbon on focus/selected. |
| **Button** | `.btn` (+ `--bc` fill) | slab keycap: 2 px dark border, one-texel gold hairline inside, darker bottom lip, 4 px dark base; pressed = moves down 4 px onto its base. Roles (dark tints): `.btn-big` (bronze primary), `.btn-go`, `.btn-danger`, `.btn-back`. |
| **Tabs** | `.tab`, `.tab.on`, `.tab.locked` | keycaps; the active tab is bronze with a gold top row, locked ones show a pixel padlock. |
| **Segmented / toggle / slider** | `.segmented .seg`, `.switch`, `input[type=range]` | segment with ▶ on the checked option; ON/OFF switch; gold square thumb on a gold-filled track. |
| **HP / XP bars** | `hpBar()` → `.hpbar > .hpfill`, `.hplabel` tag, `.xpbar` | dark well, 1-texel dark frame with a gold rim, 2-tone fill; "HP" (gold) / "XP" (sky) tags are text beside the bar; ghost chunk drains after a hit. Your box: the `HP x / max` numbers sit on their own row right under the HP bar, the XP bar last. |
| **Type chip / badge** | `typeChip()` → `.chip`, `.badge` | `--f1` 700 small caps, warm-white text on `--cf` = the type/status colour darkened just enough for ≥ 4.5:1 (`ui/contrast.ts inkSafeFill`, tested), dark border, a one-texel rim of the type colour. Word + colour, never colour alone. |
| **Icons** | `icon(name)` (`ui/icons.ts`) | 12×12 pixel grids in `currentColor` (+ a 40 % second tone), shown at 24 px. Orbs/items/party pips are pixel art too (`orbIcon`, `.item-ico.ico-*`, `.pdot`). |
| **Toast** | `toast()` → `.toast` | small panel at the top with ✓ / ▶ / ✗ lead glyph. |
| **Modal** | `openModal()` → `.modal` | panel with a sticky header and a dotted dim backdrop; `confirmDialog()` for yes/no. |

## Battle layout

- **Foe box** top-left: name, Lv, type chips + status, HP tag + bar. Party pips (pixel lantern-bud
  orbs, greyed when fainted) hang under it for trainers.
- **Your box** right, above the command box (desktop/landscape) or above the dialog (portrait):
  name, Lv; chips, HP bar; `HP / max` numbers under the bar; XP bar. Pips sit above it.
- **Desktop**: one dialog band at the bottom (2 rows + frame = 112 px): the dialog on the left,
  the 2×2 command box (Fight / Bag / Kin / Run) on the right. FIGHT turns the whole band into the
  2×2 move list with a separate **info box** on the right (`PP x/y`, power, `TYPE/…`,
  effectiveness tag) that follows the cursor (`ui/pixel/moveInfo.ts`, also used by the Arena),
  and BACK under it. Longer lists (bag, kin, forget-move, end) pop up as a taller window over
  the right side; your box hides under it rather than peeking out.
- **Portrait**: dialog above a full-width command box; the move list grows up over the dialog
  with `[info][back]` as its last row and a short `TYPE · PP` line under each move.
- **Landscape phone**: dialog bottom-left, everything interactive in the right column.
- The camera targets in `scenes/battleStage.ts battleTargets()` mirror these heights.

## Adding UI

Use the existing classes before inventing new ones: a framed box is `.frame`, a menu is a grid
of `.list-row` buttons, a primary action is `.btn.btn-big`. Draw new icons as 12×12 grids in
`ui/icons.ts`. Keep strings inside the fonts' latin subset (Latin-1, general punctuation); a
new symbol is better drawn as an icon than left to a fallback font. After any change to type or
widths, run `e2e/layout.spec.ts` (one-line labels, floors, overlaps) on every screen.
