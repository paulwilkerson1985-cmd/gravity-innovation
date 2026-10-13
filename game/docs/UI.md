# UI system — pixel handheld panels over the HD-2D diorama

The HTML UI (menus are DOM over the canvas) uses one retro handheld look everywhere: cream paper
panels with crisp pixel frames, dark ink text in our own pixel font, ▶ cursors on lists. It is an
original design in the spirit of 32-bit handheld battle UIs — not a copy of any game's layout,
names or icons. Screens: `docs/screenshots/ui-pixel/`.

## Rules

1. **One pixel scale.** 1 UI pixel = 2 CSS px. Frames, icons, cursors, bar borders and text all
   live on that grid. Big screens (≥ 1600×900) zoom the whole UI by **1.5** (3 device px per UI
   pixel) — `style.css` and `scenes/framing.ts uiZoom` must agree.
2. **Text only at 10 / 20 / 30 / 40 px** (the font's 1×/2×/3×/4×; logos 60/80/120). Use the
   tokens `--f1` (10/12), `--f2` (20/24), `--f2t` (20/20, tight boxes), `--f3`, `--f4`. Never
   `font-weight` (there is one weight; `font-synthesis: none` stops faux bold) and never
   fractional sizes. Hierarchy comes from size, case, colour and the ink shadow — not weight.
   On desktop-size viewports (≥ 1024×600) the secondary 10px tier (meta lines, subtitles,
   section labels, stat labels, notes) steps up to 20px for readability; tiny tags (HP/XP,
   type chips, tile names) stay 10px.
3. **Uppercase for labels** (names, menu entries, buttons, headings); sentence case for dialog
   and blurbs. Text on paper gets the GBA-style shadow `--tsh` (1 UI px, `--shade`).
4. **No rounded corners, no soft shadows, no gradients on chrome.** Drop shadows are hard offsets
   (`4px 4px 0 var(--drop)`); animations use `steps()`.
5. **Touch targets ≥ 44 px** even when rows look compact; every list row is a real `<button>`.
6. **Focus = the cursor.** Keyboard focus shows the ▶ cursor and the amber highlight (list rows)
   or a 2-px ink ring with a paper gap (standalone buttons). Hover uses a quieter paper-2 fill, so
   hover and focus never look the same.
7. **Keep test ids.** e2e specs drive everything through `data-testid`; restyle, don't rename.

## Font — "Orbkin Pixel"

Our own bitmap font (see `ASSETS.md`). Glyphs are character grids in
`tools/pixelfont/glyphs.ts` (cap height 7, x-height 5, descender 2, ascent 8 / descent 2,
proportional advance = width + 1). `npm run font` traces each bitmap into clean outlines (one
contour per edge loop, diagonal touches kept separate, collinear points dropped) and writes
`src/assets/fonts/orbkin-pixel.otf` (~20 KB, 206 glyphs). Coverage: ASCII, Latin-1 accents
(àéêëöüñç ÀÉÖÜÑÇ …), and the UI's symbols — · • – — … ‘ ’ “ ” × ± ≈ ≥ ½ ¼ → ← ⇄ ▶ ◀ ▼ ▲ ✓ ✗ ★ ♥ ♪ ⏱.
`tests/pixelfont.test.ts` fails if any string literal in `src/data|scenes|ui|game` uses a
character the font lacks (emoji excepted — they fall back to the system font).

Loaded with `@font-face { font-display: block }` and awaited in `main.ts` before the first
scene, so text paging and camera framing measure real glyphs. Rendering:
`-webkit-font-smoothing: none; font-smooth: never; font-kerning: none`.

## Tokens (`src/style.css :root`)

| Token | Value | Use |
|---|---|---|
| `--ink` | `#2a2238` | text, outlines, cursor |
| `--ink-2` / `--ink-3` | `#5a4e66` / `#857a8c` | secondary text / disabled |
| `--paper` / `--paper-hi` / `--paper-2` / `--paper-3` | `#f8f5e6` / `#fffdf5` / `#efe7cf` / `#e2d6b3` | panel fill, keycaps, wells & hover, rules |
| `--shade` | `#d8ceb0` | text shadow on paper |
| `--amber-hi` / `--amber` / `--amber-lo` | `#f4cf86` / `#e7a85a` / `#a5652f` | frame band, primary buttons, section labels |
| `--sel` / `--sel-2` | `#fbe2a4` / `#f6cf7c` | cursor row / selected item |
| `--good` `--mid` `--low` (+ `-hi`) | green / gold / red | HP fill (top highlight row in the `-hi` tone) |
| `--xp` / `--xp-hi` | `#3f9be8` / `#9ad6ff` | XP bar |
| `--track` | `#3d3450` | empty bar track |
| `--drop` | `#120c1c80` | hard drop shadow |
| `--fr-panel` `--fr-plate` `--fr-well` | SVG data URIs | 9-slice frames, installed by `ui/pixel/skin.ts` |

Type colours stay in `ui/dom.ts TYPE_COLORS`. Contrast: ink on paper ≈ 13:1, `--ink-2` on paper
≈ 7:1, `--ink-3` (disabled only) ≈ 3.9:1; plates use paper text on ink (≈ 13:1).

## Components

| Component | Markup / class | Notes |
|---|---|---|
| **Panel** | `.panel`, `.sheet`, `.modal`, `.meta-panel`, `.arena-card`, `.textbox`, `.bt-menu`, `.frame` | `border: 12px` + `border-image: var(--fr-panel) 12 fill`: ink outline with notched corners, two-tone amber band (light top/left, dark bottom/right) with corner studs, ink inner line, 2 px paper margin. Content padding starts inside the 12 px frame. |
| **Plate** | `.plate`, `.pill`, timers, captions | dark ink 9-slice (`--fr-plate`, 6 px) with paper text — read-outs that sit on the 3D scene. |
| **Well** | `.set-group`, `.buy-box`, `.arena-detail`, `.arena-vstat` | inset paper-2 9-slice (`--fr-well`, 6 px) for groups inside a panel. |
| **Dialog** | `.textbox` + `.text` + `.text-next` | typewriter text (`battle.ts say()`), ▼ indicator blinking `steps(1)` while waiting. |
| **List with cursor** | buttons inside `.bt-menu`, `.spot-buttons`, `.party-list`, `.bag-list`, `.shop-list`, `.item-pick`, `.arena-modes`, `.menu-grid`, or `.list-row` | flat rows, ≥ 44 px, ▶ cursor (`::before`, a clip-path pixel triangle) on hover/focus/selected. |
| **Button** | `.btn` (+ `--bc` fill) | pixel keycap: 2 px ink border, light top lip, darker bottom lip, 4 px ink base; pressed = moves down 4 px onto its base. Roles: `.btn-big` (amber primary), `.btn-go`, `.btn-danger`, `.btn-back`. |
| **Tabs** | `.tab`, `.tab.on`, `.tab.locked` | keycaps; the active tab is amber, locked ones show a pixel padlock. |
| **Segmented / toggle / slider** | `.segmented .seg`, `.switch`, `input[type=range]` | segment with ▶ on the checked option; ON/OFF pixel switch; square pixel thumb on an amber-filled track. |
| **HP / XP bars** | `hpBar()` → `.hpbar > .hpfill`, `.hplabel` tag, `.xpbar` | ink-framed track, 2-tone fill, amber "HP" / blue "XP" tag riding on the bar's left end; ghost chunk drains after a hit. |
| **Type chip / badge** | `typeChip()` → `.chip`, `.badge` | 10 px uppercase on the type colour, ink border, top highlight. |
| **Icons** | `icon(name)` (`ui/icons.ts`) | 12×12 pixel grids in `currentColor` (+ a 40 % second tone), shown at 24 px. Orbs/items/party pips are pixel art too (`orbIcon`, `.item-ico.ico-*`, `.pdot`). |
| **Toast** | `toast()` → `.toast` | small panel at the top with ✓ / ▶ / ✗ lead glyph. |
| **Modal** | `openModal()` → `.modal` | panel with a sticky header and a dotted dim backdrop; `confirmDialog()` for yes/no. |

## Battle layout

- **Foe box** top-left: NAME, Lv, type chips + status, HP tag + bar. Party pips (pixel lantern-bud
  orbs, greyed when fainted) hang under it for trainers.
- **Your box** right, above the command box (desktop/landscape) or above the dialog (portrait):
  NAME, Lv, chips, HP bar; XP bar + `HP / max` numbers. Pips sit above it.
- **Desktop**: one dialog band at the bottom (2 rows + frame = 112 px): the dialog on the left,
  the 2×2 command box (FIGHT / BAG / KIN / RUN) on the right. FIGHT turns the whole band into the
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
`ui/icons.ts`; new glyphs go in `tools/pixelfont/glyphs.ts` followed by `npm run font`.
