// Pixel-art icons for menus (12×12 grids, drawn as crisp SVG rects). '#' = currentColor,
// 'o' = currentColor at 40% (a second tone), so one icon works on any button colour.
// Displayed at 2 CSS px per pixel (24px) to match the pixel font scale.
import { gridSvg } from './pixel/skin';

const ICONS = {
  party: [
    '............', '..##....##..', '.#..#..#..#.', '.#..#..#..#.', '..##....##..', '............',
    '.####..####.', '#....##....#', '#....##....#', '#....##....#', '............', '............'],
  bestiary: [
    '............', '.#####.####.', '.#ooo#.#..#.', '.#o#o#.#..#.', '.#ooo#.#..#.', '.#...#.#..#.',
    '.#...#.#..#.', '.#...#.#..#.', '.#####.####.', '......#.....', '............', '............'],
  bag: [
    '............', '....####....', '...#....#...', '...#....#...', '.##########.', '.#oooooooo#.',
    '.#o######o#.', '.#oo#oo#oo#.', '.#oooooooo#.', '.##########.', '............', '............'],
  box: [
    '............', '.##########.', '.#oo#oo#oo#.', '.##########.', '.#........#.', '.#..####..#.',
    '.#........#.', '.#........#.', '.##########.', '............', '............', '............'],
  shop: [
    '............', '.##########.', '#o#o#o#o#o##', '##########o#', '.#........#.', '.#.##..##.#.',
    '.#.##..##.#.', '.#.##.....#.', '.#.##.....#.', '.##########.', '............', '............'],
  save: [
    '............', '.#########..', '.#.#ooo#.#..', '.#.#ooo#..#.', '.#.#####..#.', '.#........#.',
    '.#.######.#.', '.#.#....#.#.', '.#.#....#.#.', '.##########.', '............', '............'],
  settings: [
    '............', '.....##.....', '..#.####.#..', '...######...', '..###..###..', '.###....###.',
    '.###....###.', '..###..###..', '...######...', '..#.####.#..', '.....##.....', '............'],
  export: [
    '............', '.....##.....', '.....##.....', '.....##.....', '..#..##..#..', '...#.##.#...',
    '....####....', '.....##.....', '.#........#.', '.#........#.', '.##########.', '............'],
  import: [
    '............', '.....##.....', '....####....', '...#.##.#...', '..#..##..#..', '.....##.....',
    '.....##.....', '.....##.....', '.#........#.', '.#........#.', '.##########.', '............'],
  quit: [
    '............', '.#####......', '.#...#......', '.#...#..#...', '.#...#...#..', '.#...######.',
    '.#...#...#..', '.#...#..#...', '.#...#......', '.#####......', '............', '............'],
  arena: [
    '............', '.#........#.', '..#......#..', '...#....#...', '....#..#....', '.....##.....',
    '.....##.....', '....#..#....', '..##....##..', '.##......##.', '.#........#.', '............'],
  play: [
    '............', '...#........', '...##.......', '...###......', '...####.....', '...#####....',
    '...####.....', '...###......', '...##.......', '...#........', '............', '............'],
  star: [
    '............', '.....##.....', '.....##.....', '....####....', '############', '.##########.',
    '..########..', '...######...', '..###..###..', '..##....##..', '.#........#.', '............'],
  up: [
    '............', '............', '............', '.....##.....', '....####....', '...######...',
    '..###..###..', '.###....###.', '.##......##.', '............', '............', '............'],
  down: [
    '............', '............', '............', '.##......##.', '.###....###.', '..###..###..',
    '...######...', '....####....', '.....##.....', '............', '............', '............'],
  crown: [
    '............', '............', '.#...##...#.', '.##..##..##.', '.###.##.###.', '.##########.',
    '.##o####o##.', '.##########.', '.##########.', '............', '.##########.', '............'],
  plus: [
    '............', '............', '.....##.....', '.....##.....', '.....##.....', '.##########.',
    '.##########.', '.....##.....', '.....##.....', '.....##.....', '............', '............'],
  minus: [
    '............', '............', '............', '............', '............', '.##########.',
    '.##########.', '............', '............', '............', '............', '............'],
  heart: [
    '............', '............', '..##....##..', '.####..####.', '.##########.', '.##########.',
    '..########..', '...######...', '....####....', '.....##.....', '............', '............'],
  lock: [
    '............', '....####....', '...#....#...', '...#....#...', '...#....#...', '.##########.',
    '.##########.', '.####oo####.', '.####oo####.', '.##########.', '............', '............'],
} as const;

export type IconName = keyof typeof ICONS;

function iconMarkup(name: IconName, cls: string): string {
  const rows = ICONS[name];
  let rects = '';
  rows.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const c = row[x]!;
      let n = 1;
      while (x + n < row.length && row[x + n] === c) n++;
      if (c === '#') rects += `<rect x="${x}" y="${y}" width="${n}" height="1"/>`;
      else if (c === 'o') rects += `<rect x="${x}" y="${y}" width="${n}" height="1" fill-opacity=".4"/>`;
      x += n;
    }
  });
  return `<svg class="${cls}" viewBox="0 0 12 12" aria-hidden="true" fill="currentColor" shape-rendering="crispEdges">${rects}</svg>`;
}

export function icon(name: IconName, cls = 'ico'): SVGSVGElement {
  const wrap = document.createElement('span');
  wrap.innerHTML = iconMarkup(name, cls);
  return wrap.firstElementChild as SVGSVGElement;
}

/** The gold coin glyph used next to money amounts (a pixel coin, see .coin in style.css). */
export function coin(): HTMLElement {
  const el = document.createElement('span');
  el.className = 'coin';
  el.setAttribute('aria-hidden', 'true');
  return el;
}

// ---------------------------------------------------------------- orb icons
// Orbs are lantern-buds (see render/fx.ts): a pointed faceted pod in leafy sepals with a
// glowing tip. Tiers: Orb (coral, green sepals), Bright Orb (sky blue + gold halo band),
// Star Orb (gold pod in a white star collar). Drawn as pixel art (11×13) so they sit with the
// pixel font; a 7×8 "pip" version marks party slots on the battle info boxes.

export type OrbIconTier = 'orb' | 'bright' | 'star';

const ORB_COLORS: Record<OrbIconTier, Record<string, string>> = {
  orb: { b: '#ff4d6d', s: '#c42a50', L: '#ffa0b0', t: '#fff1a8', c: '#4cc35a', C: '#2a8a40', r: '#4cc35a' },
  bright: { b: '#3d9bff', s: '#2160c8', L: '#a6dcff', t: '#ffd23f', c: '#4cc35a', C: '#2a8a40', r: '#ffc93d' },
  star: { b: '#ffc93d', s: '#d8861a', L: '#fff2a8', t: '#ff7ad0', c: '#ffffff', C: '#c9cfe8', r: '#ffc93d' },
};
const FAINT = { b: '#9a93a8', s: '#6f6880', L: '#c9c3d4', t: '#d9d4e2', c: '#8a8498', C: '#6a6478', r: '#8a8498' };

const ORB_GRID: Record<OrbIconTier, string[]> = {
  orb: [
    '.....k.....', '....ktk....', '.....k.....', '....kbk....', '...kLbsk...', '..kLbbbsk..', '..kLbbbsk..',
    '.kLbbbbbsk.', 'kckbbbbbkCk', 'kcckbbbkCCk', '.kccckCCCk.', '..kcccCCk..', '...kkkkk...'],
  bright: [
    '.....k.....', '....ktk....', '.....k.....', '....kbk....', '...kLbsk...', '..kLbbbsk..', 'kkrrrrrrrkk',
    '.kLbbbbbsk.', 'kckbbbbbkCk', 'kcckbbbkCCk', '.kccckCCCk.', '..kcccCCk..', '...kkkkk...'],
  star: [
    '.....k.....', '....ktk....', '.....k.....', '....kbk....', '...kLbsk...', '..kLbbbsk..', '..kLbbbsk..',
    'kk.kbbbsk.k', 'kcckbbbskCk', '.kcckbskCk.', '..kcckCCk..', '.kcck.kCCk.', '.kkk...kkk.'],
};

const PIP = ['...k...', '..ktk..', '.kLbsk.', '.kbbsk.', 'kckbkCk', '.kccCk.', '..kkk..'];

const INK = '#2a2238';

/** SVG markup for an orb tier (pixel art). Pure string — safe to call outside the DOM. */
export function orbIconSvg(tier: OrbIconTier): string {
  const pal = { k: INK, ...ORB_COLORS[tier] };
  const rows = ORB_GRID[tier];
  let rects = '';
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const c = row[x]!;
      const fill = (pal as Record<string, string>)[c];
      if (fill) rects += `<rect x="${x}" y="${y}" width="1" height="1" fill="${fill}"/>`;
    }
  });
  return `<svg viewBox="0 0 11 13" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges" aria-hidden="true">${rects}</svg>`;
}

/** An inline orb icon element. */
export function orbIcon(tier: OrbIconTier, cls = 'orb-svg'): HTMLElement {
  const el = document.createElement('span');
  el.className = cls;
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML = orbIconSvg(tier);
  return el;
}

const ORB_TIER_COLOR: Record<OrbIconTier, string> = { orb: '#ff4d6d', bright: '#3d9bff', star: '#ffc93d' };

// Item icons (bag / shop): 12×12 pixel art, keyed like the item ids.
const ITEM_GRID: Record<string, string[]> = {
  tonic: ['....kkkk....', '....kwwk....', '.....kk.....', '....kbbk....', '...kbbbbk...', '..kLbbbbsk..', '..kLbbbbsk..', '..kLbbbbsk..', '..kLbbbbsk..', '..kbbbbbsk..', '...kkkkkk...', '............'],
  remedy: ['............', '........kkk.', '......kkbbk.', '.....kbbbsk.', '....kbbbbk..', '...kbbsbbk..', '..kbbsbbk...', '..kbsbbk....', '.kbsbkk.....', '.kskk.......', 'kk..........', '............'],
  'revive-seed': ['.....kk.....', '....kbbk....', '...kbkkbk...', '....kk......', '...kkkkk....', '..kLbbbbk...', '.kLbbbbbsk..', '.kLbbbbbsk..', '.kbbbbbbsk..', '..kbbbbsk...', '...kkkkk....', '............'],
};
const ITEM_COLORS: Record<string, Record<string, string>> = {
  tonic: { b: '#5fd36b', s: '#2e9a44', L: '#b8f5bd', w: '#c98a4a' },
  'mega-tonic': { b: '#3d9bff', s: '#2160c8', L: '#a6dcff', w: '#c98a4a' },
  'full-tonic': { b: '#ffc93d', s: '#d8861a', L: '#fff2a8', w: '#c98a4a' },
  remedy: { b: '#4cc35a', s: '#2a8a40' },
  'revive-seed': { b: '#ff9a3d', s: '#c8641a', L: '#ffe08a' },
};

function itemSvg(id: string): string | null {
  const grid = ITEM_GRID[id] ?? (id.endsWith('tonic') ? ITEM_GRID.tonic : undefined);
  const pal = ITEM_COLORS[id];
  if (!grid || !pal) return null;
  return gridSvg(grid, { k: INK, ...pal }, 1);
}

/**
 * CSS that skins the orb/item icon hooks (`.item-ico.ico-<id>` in the bag/shop, `i.orb-ico` in
 * the battle Catch menu keyed by its inline --c colour, `.pdot` party pips) with pixel art.
 */
export function orbIconCss(): string {
  const url = (svg: string) => `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
  const reset = 'border:0;border-radius:0;box-shadow:none;background-color:transparent;background-repeat:no-repeat;background-position:center;background-size:contain;image-rendering:pixelated;';
  let css = '';
  for (const t of Object.keys(ORB_COLORS) as OrbIconTier[]) {
    css += `.item-ico.ico-${t}{${reset}background-image:${url(orbIconSvg(t))};}`;
    css += `.item-ico.ico-${t}::before,.item-ico.ico-${t}::after{content:none;display:none;}`;
    css += `i.orb-ico[style*="${ORB_TIER_COLOR[t]}"]{${reset}background-image:${url(orbIconSvg(t))};}`;
  }
  for (const id of ['tonic', 'mega-tonic', 'full-tonic', 'remedy', 'revive-seed']) {
    const svg = itemSvg(id);
    if (svg) css += `.item-ico.ico-${id}{${reset}background-image:${svg};}.item-ico.ico-${id}::before,.item-ico.ico-${id}::after{content:none;display:none;}`;
  }
  const pip = (faint: boolean) => {
    const pal: Record<string, string> = { k: INK, ...(faint ? FAINT : ORB_COLORS.orb) };
    return gridSvg(PIP, pal, 1);
  };
  css += `.pdot{${reset}background-image:${pip(true)};}.pdot.on{background-image:${pip(false)};}`;
  css += `.arena-pip{${reset}background-image:${pip(false)};}.arena-pip.out{background-image:${pip(true)};opacity:1;}`;
  return css;
}

/** Install the orb icon skin once (called on import in the browser). */
export function installOrbIcons() {
  if (typeof document === 'undefined' || document.getElementById('orb-icon-skin')) return;
  const style = document.createElement('style');
  style.id = 'orb-icon-skin';
  style.textContent = orbIconCss();
  document.head.appendChild(style);
}

installOrbIcons();
