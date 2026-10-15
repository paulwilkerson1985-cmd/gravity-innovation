// UI skin: 9-slice frames drawn from tiny character grids into SVG data URIs and exposed as CSS
// custom properties (`--fr-panel`, …), so style.css can `border-image` them. One grid cell = one
// world texel = 2 CSS px, drawn with crisp edges: the frames stay on the diorama's pixel grid while
// the type (style.css) renders at device resolution.
//
// The material is the HD-2D "slab" the owner picked in the blind UI vote (docs/DECISIONS.md): a dark
// plum-black fill at 80 % (the scene shows through a little, no backdrop blur), a dark outer line,
// a one-texel gold hairline with brighter corner ticks, and a dark inner line.
// Palette keys: '.' clear, k outer line, g gold hairline, G corner tick, d inner dark line, f slab
// fill, p plate fill, w well fill, i well shadow, h well light edge.
// Colours may carry alpha as #rrggbbaa (written as fill + fill-opacity for every SVG renderer).

export const PX = 2; // CSS px per UI pixel

export const PALETTE: Record<string, string> = {
  k: '#0c0910d9', g: '#cfae6ed9', G: '#f2d698', d: '#0c09108c', f: '#1a1420cc',
  p: '#1a1420e0', w: '#0c091059', i: '#0c0910b3', h: '#cfae6e40',
};

function fillAttr(c: string): string {
  const m = /^#([0-9a-f]{6})([0-9a-f]{2})$/i.exec(c);
  if (!m) return `fill="${c}"`;
  const a = Math.round((parseInt(m[2]!, 16) / 255) * 1000) / 1000;
  return `fill="#${m[1]}" fill-opacity="${a}"`;
}

/** SVG data URI for a grid (rows of palette keys); runs of one colour are merged into rects. */
export function gridSvg(rows: string[], palette: Record<string, string> = PALETTE, px = PX): string {
  const w = rows[0]!.length, hgt = rows.length;
  let rects = '';
  rows.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const c = row[x]!;
      let n = 1;
      while (x + n < row.length && row[x + n] === c) n++;
      if (c !== '.' && palette[c]) rects += `<rect x="${x * px}" y="${y * px}" width="${n * px}" height="${px}" ${fillAttr(palette[c])}/>`;
      x += n;
    }
  });
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w * px}" height="${hgt * px}" shape-rendering="crispEdges">${rects}</svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

/** Panel / dialog frame: outer line, gold hairline with corner ticks, inner dark line, 80 % slab. 13×13, slice 6 cells. */
export const FRAME_PANEL = [
  '.kkkkkkkkkkk.',
  'kGGgggggggGGk',
  'kGdddddddddGk',
  'kgdfffffffdgk',
  'kgdfffffffdgk',
  'kgdfffffffdgk',
  'kgdfffffffdgk',
  'kgdfffffffdgk',
  'kgdfffffffdgk',
  'kgdfffffffdgk',
  'kGdddddddddGk',
  'kGGgggggggGGk',
  '.kkkkkkkkkkk.',
];

/** Plate (captions, timers, pills over the scene): outer line, gold hairline, a denser fill. 7×7, slice 3. */
export const FRAME_PLATE = [
  '.kkkkk.',
  'kgggggk',
  'kgpppgk',
  'kgpppgk',
  'kgpppgk',
  'kgggggk',
  '.kkkkk.',
];

/** Inset well (groups inside a panel): shaded top/left, faint gold bottom/right, darker fill. 7×7, slice 3. */
export const FRAME_WELL = [
  '.iiiii.',
  'iwwwww.',
  'iwwwwwh',
  'iwwwwwh',
  'iwwwwwh',
  'iwwwwwh',
  '.hhhhh.',
];

function frameCss(): string {
  const vars: Record<string, string> = {
    '--fr-panel': gridSvg(FRAME_PANEL),
    '--fr-plate': gridSvg(FRAME_PLATE),
    '--fr-well': gridSvg(FRAME_WELL),
  };
  return `:root{${Object.entries(vars).map(([k, v]) => `${k}:${v};`).join('')}}`;
}

/** Install the frame variables once (called on import in the browser). */
export function installPixelSkin() {
  if (typeof document === 'undefined' || document.getElementById('pixel-skin')) return;
  const style = document.createElement('style');
  style.id = 'pixel-skin';
  style.textContent = frameCss();
  document.head.prepend(style);
}

installPixelSkin();
