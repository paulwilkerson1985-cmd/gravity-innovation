// Pixel UI skin: 9-slice frames drawn from tiny character grids into SVG data URIs and exposed
// as CSS custom properties (`--fr-panel`, …), so style.css can `border-image` them. One grid
// cell = one font pixel = 2 CSS px (the UI's pixel scale), drawn with crisp edges.
//
// Palette keys: '.' clear, k ink outline, h/m/l frame band (light / mid / low), i inner line,
// p paper, w stud highlight, s stud shade, d dark plate, e plate edge.

export const PX = 2; // CSS px per UI pixel

export const PALETTE: Record<string, string> = {
  k: '#2a2238', i: '#4a3a4e', h: '#f4cf86', m: '#d99a4e', l: '#a5652f', p: '#f8f5e6',
  w: '#fff6d6', s: '#7a4a24', d: '#2a2238', e: '#5d4a6a', g: '#e8dfc4',
};

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
      if (c !== '.' && palette[c]) rects += `<rect x="${x * px}" y="${y * px}" width="${n * px}" height="${px}" fill="${palette[c]}"/>`;
      x += n;
    }
  });
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w * px}" height="${hgt * px}" shape-rendering="crispEdges">${rects}</svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

/** Panel / dialog frame: ink outline, two-tone amber band with corner studs, ink inner line. 13×13, slice 6 cells. */
export const FRAME_PANEL = [
  '.kkkkkkkkkkk.',
  'kwhhhhhhhhhwk',
  'khmmmmmmmmmlk',
  'khmmiiiiimmlk',
  'khmipppppimlk',
  'khmipppppimlk',
  'khmipppppimlk',
  'khmipppppimlk',
  'khmipppppimlk',
  'khmmiiiiimmlk',
  'khmmmmmmmmmlk',
  'kwlllllllllwk',
  '.kkkkkkkkkkk.',
];

/** Dark plate (captions, timers over the scene): ink fill, plum edge. 7×7, slice 3. */
export const FRAME_PLATE = [
  '.kkkkk.',
  'keeeeek',
  'kedddek',
  'kedddek',
  'kedddek',
  'keeeeek',
  '.kkkkk.',
];

/** Inset well (stat boxes, quantity read-outs): paper-2 fill with an ink-shaded top/left. 7×7, slice 3. */
export const FRAME_WELL = [
  '.iiiii.',
  'iggggg.',
  'igggggp',
  'igggggp',
  'igggggp',
  'igggggp',
  '.ppppp.',
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
