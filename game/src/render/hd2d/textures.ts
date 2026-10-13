// HD-2D pixel-art surface textures, painted procedurally on small canvases.
//
// Conventions (see docs/HD2D.md):
//  * Every texture is a tiny tile (16–64 texels) painted from a hand-picked RAMP of 4–7 shades,
//    dark → light, hue-shifted (shadows lean red/purple, highlights lean yellow). Never sample
//    colours outside the ramp; blends between neighbouring shades use a 4×4 Bayer dither.
//  * NearestFilter, no mipmaps, sRGB, RepeatWrapping: the texel grid must stay visible.
//  * World texel density is fixed per arena (TEXEL world units per texel, see arena.ts), so a
//    floor, a wall and a crate show the same pixel size on screen.
//  * Deterministic: every painter takes a seed; the same seed paints the same tile.
import * as THREE from 'three';
import { Rng } from '../../engine/rng';

/** A colour ramp, darkest first. 4–7 entries. */
export type Ramp = readonly string[];

/** Material ramps for the cave/quarry arena kit (Ember Ridge). Add new terrains here. */
export const RAMPS = {
  dirt: ['#4a3628', '#66503d', '#806a52', '#9a8366', '#b19a7b', '#c6b090', '#d9c6a6'],
  rock: ['#2a1a14', '#42291e', '#5b3b2a', '#744d36', '#8c6143', '#a37752', '#b98e64'],
  rockTop: ['#4a2f1e', '#69442b', '#865836', '#a26d42', '#bb8350', '#d29d64'],
  stone: ['#2e2b31', '#45414a', '#5d5862', '#77717a', '#928b92', '#aea6aa', '#cbc3c2'],
  wood: ['#3a2112', '#55321c', '#714426', '#8e5831', '#aa6d3d', '#c5864e', '#dba264'],
  plank: ['#4b2c17', '#6a4022', '#86552d', '#a26b39', '#bb8146', '#d39a59'],
  steel: ['#161d30', '#222d48', '#33416a', '#46588a', '#5e72a4', '#8193be'],
  /** Neutral light greys: painted metal/props whose hue comes from the vertex tint. */
  paint: ['#5c5a5e', '#77757a', '#908e93', '#a9a7ab', '#c2c0c3', '#dddbdd'],
  plaster: ['#6e5c45', '#8a755a', '#a68f6e', '#bea683', '#d2bc96', '#e4d1ab'],
  rail: ['#4d120e', '#7a1d15', '#a8291c', '#cc3b26', '#e65c38', '#f78a55'],
  rug: ['#173a2a', '#1f5238', '#2b6c47', '#3f8a58', '#62a86a', '#a6cf86'],
  ember: ['#4a0f08', '#8a1f0c', '#d2400f', '#ff7a1e', '#ffb444', '#fff0a0'],
  /** Earthy yellow-brown boulder rock (kit/rock.ts walls; less red than `rock`). */
  boulder: ['#2a1d15', '#43301f', '#5d452c', '#77593a', '#906d48', '#a88358', '#bf9a6c'],
  // ---- outdoor kit ramps (kit/*): grounds, foliage, water, sky
  sand: ['#6e5236', '#8f6f48', '#ad8c5c', '#c6a670', '#d9be88', '#e8d4a2', '#f4e6c0'],
  grass: ['#1e3a1c', '#2a5224', '#386a2c', '#4b8434', '#649e3e', '#84b74c', '#a9cc62'],
  snow: ['#4e5a78', '#6c7a98', '#8d9bb6', '#afbcd0', '#cdd7e4', '#e4ebf3', '#f7fafc'],
  ash: ['#1c1718', '#2b2426', '#3c3335', '#4f4446', '#645759', '#7b6c6c', '#968683'],
  leaf: ['#13261a', '#1d3b22', '#2a5428', '#3d6e2c', '#578a34', '#77a540', '#a0c25a'],
  bark: ['#24160f', '#3a2418', '#523424', '#6a4630', '#82583c', '#9c6e4c'],
  water: ['#0f2a4a', '#164068', '#1f5888', '#2c74a4', '#4492bc', '#6db2d2', '#a8d6e6'],
  foam: ['#8fb8cc', '#bcd8e4', '#e2f0f4', '#ffffff'],
} as const satisfies Record<string, Ramp>;

const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);

/** Ordered-dither a continuous ramp position (0..ramp.length-1) to a ramp index at texel (x, y). */
export function ditherIndex(v: number, x: number, y: number, n: number): number {
  const base = Math.floor(v);
  const frac = v - base;
  const i = base + (frac > BAYER4[(y & 3) * 4 + (x & 3)]! ? 1 : 0);
  return Math.max(0, Math.min(n - 1, i));
}

/** Tileable value noise on an integer lattice of `cells` per tile. */
function valueNoise(size: number, cells: number, rng: Rng): Float32Array {
  const lat = new Float32Array(cells * cells).map(() => rng.next());
  const out = new Float32Array(size * size);
  const s = (t: number) => t * t * (3 - 2 * t);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const fx = (x / size) * cells, fy = (y / size) * cells;
      const x0 = Math.floor(fx), y0 = Math.floor(fy);
      const tx = s(fx - x0), ty = s(fy - y0);
      const a = lat[(y0 % cells) * cells + (x0 % cells)]!, b = lat[(y0 % cells) * cells + ((x0 + 1) % cells)]!;
      const c = lat[((y0 + 1) % cells) * cells + (x0 % cells)]!, d = lat[((y0 + 1) % cells) * cells + ((x0 + 1) % cells)]!;
      out[y * size + x] = (a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty;
    }
  }
  return out;
}

/** Sum of octaves of tileable value noise, normalised to 0..1. */
export function fbm(size: number, rng: Rng, octaves: [cells: number, weight: number][]): Float32Array {
  const out = new Float32Array(size * size);
  let total = 0;
  for (const [cells, w] of octaves) {
    const n = valueNoise(size, cells, rng);
    for (let i = 0; i < out.length; i++) out[i]! += n[i]! * w;
    total += w;
  }
  for (let i = 0; i < out.length; i++) out[i]! /= total;
  return out;
}

/** A texel painter: an indexed image (ramp indices) that is finally written to a canvas. */
export class PixelTile {
  readonly idx: Int8Array;
  constructor(readonly w: number, readonly h: number, readonly ramp: Ramp) { this.idx = new Int8Array(w * h); }
  get(x: number, y: number): number { return this.idx[((y + this.h) % this.h) * this.w + ((x + this.w) % this.w)]!; }
  /** Set a texel (wrapping, clamped to the ramp). */
  set(x: number, y: number, i: number) { this.idx[((y + this.h) % this.h) * this.w + ((x + this.w) % this.w)] = Math.max(0, Math.min(this.ramp.length - 1, Math.round(i))); }
  /** Shift a texel by `d` shades. */
  nudge(x: number, y: number, d: number) { this.set(x, y, this.get(x, y) + d); }
  /** Fill from a 0..1 field mapped onto ramp[lo..hi] with Bayer dithering. */
  field(f: Float32Array, lo: number, hi: number, contrast = 1) {
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      const v = Math.max(0, Math.min(1, 0.5 + (f[y * this.w + x]! - 0.5) * contrast));
      this.idx[y * this.w + x] = ditherIndex(lo + v * (hi - lo), x, y, this.ramp.length);
    }
  }
  toCanvas(): HTMLCanvasElement {
    const c = document.createElement('canvas');
    c.width = this.w; c.height = this.h;
    const ctx = c.getContext('2d')!;
    const img = ctx.createImageData(this.w, this.h);
    const rgb = this.ramp.map((hex) => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)] as const);
    for (let i = 0; i < this.idx.length; i++) {
      const [r, g, b] = rgb[this.idx[i]!]!;
      img.data[i * 4] = r; img.data[i * 4 + 1] = g; img.data[i * 4 + 2] = b; img.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    return c;
  }
}

/** Wrap a canvas as a crisp pixel texture (nearest, no mipmaps, sRGB, repeat). */
export function pixelTexture(c: HTMLCanvasElement): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 1;
  return t;
}

/** A short random-walk crack: dark texels with a lit lip on one side. */
function crack(t: PixelTile, rng: Rng, len: number, dark = 1, lip = true) {
  let x = rng.int(t.w), y = rng.int(t.h);
  let dx = rng.chance(0.5) ? 1 : -1, dy = rng.chance(0.5) ? 1 : 0;
  for (let i = 0; i < len; i++) {
    t.set(x, y, Math.min(t.get(x, y), dark));
    if (lip) t.nudge(x + 1, y + 1, 1);
    if (rng.chance(0.35)) { const k = dx; dx = dy || (rng.chance(0.5) ? 1 : -1); dy = k ? 0 : 1; }
    x += dx; y += dy;
  }
}

/** A small pebble: lit top-left, shadowed bottom-right, dark rim. */
function pebble(t: PixelTile, x: number, y: number, r: number, base: number) {
  for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) {
    const d = i * i + j * j;
    if (d > r * r + r * 0.6) continue;
    const lit = -i - j;
    t.set(x + i, y + j, base + (lit > r * 0.6 ? 1 : lit < -r * 0.6 ? -1 : 0));
  }
  t.set(x + r, y + r + 1, Math.max(0, base - 2));
  t.set(x + r + 1, y + r, Math.max(0, base - 2));
  t.set(x - r + 1, y - r + 1, base + 2);
}

// ------------------------------------------------------------------ painters

/** Packed-dirt arena floor: blotchy ramp noise, pebbles, faint cracks, footprints of grit. */
export function paintDirt(seed: number, size = 64, ramp: Ramp = RAMPS.dirt): PixelTile {
  const rng = new Rng(seed);
  const t = new PixelTile(size, size, ramp);
  t.field(fbm(size, rng, [[4, 0.55], [8, 0.3], [32, 0.15]]), 1.6, 4.6, 1.5);
  for (let i = 0; i < size * 0.9; i++) t.nudge(rng.int(size), rng.int(size), rng.chance(0.5) ? -1 : 1); // grit
  for (let i = 0; i < 4; i++) crack(t, rng, 5 + rng.int(6), 1, false);
  for (let i = 0; i < size / 6; i++) pebble(t, rng.int(size), rng.int(size), rng.chance(0.25) ? 1 : 0, 3 + rng.int(2));
  return t;
}

/** Face of a chunky rock block: mottled, a few cracks, lit speckles. Edge shading is done by the arena's baked AO. */
export function paintRock(seed: number, size = 32, ramp: Ramp = RAMPS.rock): PixelTile {
  const rng = new Rng(seed);
  const t = new PixelTile(size, size, ramp);
  t.field(fbm(size, rng, [[2, 0.4], [4, 0.4], [16, 0.2]]), 2.0, 5.2, 1.7);
  // Chunky facets: a few flat-shaded patches, as if the stone were chipped.
  for (let i = 0; i < 5; i++) {
    const cx = rng.int(size), cy = rng.int(size), r = 3 + rng.int(4), d = rng.chance(0.5) ? 1 : -1;
    for (let j = -r; j <= r; j++) for (let k = -r; k <= r; k++) if (Math.abs(j) + Math.abs(k) <= r) t.nudge(cx + k, cy + j, d * (Math.abs(j) + Math.abs(k) < r - 1 ? 1 : 0));
  }
  for (let i = 0; i < 3; i++) crack(t, rng, 6 + rng.int(8), 0);
  for (let i = 0; i < size / 2; i++) t.nudge(rng.int(size), rng.int(size), 1);
  return t;
}

/**
 * Boulder face (kit/rock.ts): chunkier, higher-contrast mottling than paintRock — 2×2 texel
 * clusters, lit flecks and dark pits — so a single rounded rock reads as hand-pixeled at 480 px.
 */
export function paintBoulder(seed: number, size = 32, ramp: Ramp = RAMPS.rock): PixelTile {
  const rng = new Rng(seed);
  const t = new PixelTile(size, size, ramp);
  const half = size / 2;
  const f = fbm(half, rng, [[2, 0.35], [4, 0.4], [8, 0.25]]);
  const n = ramp.length;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const v = f[(y >> 1) * half + (x >> 1)]!;
    t.idx[y * size + x] = ditherIndex(2.0 + Math.max(0, Math.min(1, 0.5 + (v - 0.5) * 1.7)) * (n - 3.2), x >> 1, y >> 1, n);
  }
  // Lit flecks (2 texels, a highlight over a mid tone) and dark pits.
  for (let i = 0; i < size * 0.7; i++) { const x = rng.int(size), y = rng.int(size); t.nudge(x, y, 2); t.nudge(x + 1, y, 1); }
  for (let i = 0; i < size * 0.25; i++) { const x = rng.int(size), y = rng.int(size); t.set(x, y, 1); t.nudge(x, y + 1, -1); }
  for (let i = 0; i < 2; i++) crack(t, rng, 4 + rng.int(5), 0);
  return t;
}

/** Grey rubble stone: lighter, cooler, with strong top-left highlights. */
export function paintStone(seed: number, size = 32): PixelTile {
  const t = paintRock(seed, size, RAMPS.stone);
  return t;
}

/** Horizontal wooden planks: seams, staggered butt joints, grain streaks, nail heads. */
export function paintPlanks(seed: number, w = 64, h = 64, plank = 8, ramp: Ramp = RAMPS.plank): PixelTile {
  const rng = new Rng(seed);
  const t = new PixelTile(w, h, ramp);
  for (let row = 0; row * plank < h; row++) {
    const tone = 2.4 + rng.next() * 1.4;
    const joint = rng.int(w);
    for (let y = row * plank; y < row * plank + plank && y < h; y++) {
      for (let x = 0; x < w; x++) {
        const grain = Math.sin((x + row * 13) * 0.21 + Math.sin(x * 0.05 + row) * 2) * 0.5;
        t.idx[y * w + x] = ditherIndex(tone + grain * 0.6 + (y === row * plank + 1 ? 0.8 : 0), x, y, ramp.length);
      }
    }
    for (let x = 0; x < w; x++) t.set(x, row * plank, 0); // seam
    for (let y = row * plank; y < row * plank + plank; y++) { t.set(joint, y, 0); t.set(joint + 1, y, 1); }
    t.set(joint + 3, row * plank + 3, 5); t.set(joint - 3, row * plank + 3, 5); // nails
    for (let i = 0; i < 3; i++) t.set(rng.int(w), row * plank + 2 + rng.int(plank - 3), 1); // knots
  }
  return t;
}

/** Vertical board wall / crate side. */
export function paintBoards(seed: number, size = 32): PixelTile {
  const p = paintPlanks(seed, size, size, 8, RAMPS.wood);
  const t = new PixelTile(size, size, RAMPS.wood);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) t.idx[y * size + x] = p.idx[x * size + y]!;
  return t;
}

/** Plaster wall: soft blotches, a dark skirting band at the bottom. */
export function paintPlaster(seed: number, size = 32): PixelTile {
  const rng = new Rng(seed);
  const t = new PixelTile(size, size, RAMPS.plaster);
  t.field(fbm(size, rng, [[2, 0.6], [8, 0.4]]), 2.4, 4.6, 1.3);
  for (let i = 0; i < 2; i++) crack(t, rng, 4 + rng.int(4), 1, false);
  return t;
}

/** Riveted steel (pass RAMPS.paint for a neutral version that vertex tints colour). */
export function paintSteel(seed: number, size = 16, ramp: Ramp = RAMPS.steel): PixelTile {
  const rng = new Rng(seed);
  const t = new PixelTile(size, size, ramp);
  t.field(fbm(size, rng, [[2, 1]]), 2.2, 3.4, 1);
  for (let y = 0; y < size; y++) { t.set(0, y, 4); t.set(size - 1, y, 1); }
  for (const y of [3, 11]) { t.set(3, y, 5); t.set(4, y + 1, 0); t.set(size - 4, y, 5); t.set(size - 3, y + 1, 0); }
  return t;
}

/** Woven rug: border bands and an original diamond/stripe motif. */
export function paintRug(size = 32): PixelTile {
  const t = new PixelTile(size, size, RAMPS.rug);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const edge = Math.min(x, y, size - 1 - x, size - 1 - y);
    let v = 2;
    if (edge === 0) v = 0; else if (edge === 2) v = 4; else if (edge < 4) v = 3;
    else {
      const cx = Math.abs(x - size / 2 + 0.5), cy = Math.abs(y - size / 2 + 0.5);
      const d = cx + cy;
      if (Math.round(d) % 6 === 0) v = 5; else if (Math.round(d) % 6 === 3) v = 1;
      if ((x + y) % 2 === 0 && v === 2) v = 2;
    }
    t.idx[y * size + x] = v;
  }
  return t;
}

// ------------------------------------------------------------------ outdoor ground painters

/** Beach/desert sand: soft dunes (low-frequency light/dark bands), shell/pebble flecks, ripples. */
export function paintSand(seed: number, size = 64, ramp: Ramp = RAMPS.sand): PixelTile {
  const rng = new Rng(seed);
  const t = new PixelTile(size, size, ramp);
  t.field(fbm(size, rng, [[2, 0.5], [4, 0.3], [16, 0.2]]), 2.4, 4.8, 1.3);
  // Wind ripples: diagonal 1-texel darker streaks with a lit lip above.
  for (let y = 0; y < size; y += 5 + rng.int(3)) {
    const off = rng.int(size);
    for (let x = 0; x < size; x++) {
      const yy = y + Math.round(Math.sin((x + off) * 0.25) * 1.5);
      if (rng.chance(0.75)) { t.nudge(x, yy, -1); t.nudge(x, yy - 1, 1); }
    }
  }
  for (let i = 0; i < size / 3; i++) t.set(rng.int(size), rng.int(size), rng.chance(0.5) ? ramp.length - 1 : 1);
  return t;
}

/** Short turf: blade flecks (lit tip over a dark base), clover clumps, a little soil showing. */
export function paintGrass(seed: number, size = 64, ramp: Ramp = RAMPS.grass): PixelTile {
  const rng = new Rng(seed);
  const t = new PixelTile(size, size, ramp);
  t.field(fbm(size, rng, [[4, 0.5], [8, 0.3], [32, 0.2]]), 2.0, 4.4, 1.4);
  for (let i = 0; i < size * size * 0.12; i++) {
    const x = rng.int(size), y = rng.int(size);
    const v = t.get(x, y);
    t.set(x, y, v + 1); t.set(x, y + 1, v - 1); // blade: lit tip, shadowed root
  }
  for (let i = 0; i < size / 8; i++) {
    const cx = rng.int(size), cy = rng.int(size);
    for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [-1, 0], [0, -1]] as const) t.set(cx + dx, cy + dy, 5);
    t.set(cx, cy, 6);
  }
  return t;
}

/** Packed snow: very soft blue-shadowed drifts, sparkle texels, a few footprint dents. */
export function paintSnow(seed: number, size = 64, ramp: Ramp = RAMPS.snow): PixelTile {
  const rng = new Rng(seed);
  const t = new PixelTile(size, size, ramp);
  t.field(fbm(size, rng, [[2, 0.6], [4, 0.3], [16, 0.1]]), 3.2, 5.6, 1.2);
  for (let i = 0; i < size / 2; i++) t.set(rng.int(size), rng.int(size), ramp.length - 1);
  for (let i = 0; i < 3; i++) {
    const x = rng.int(size), y = rng.int(size);
    for (let k = 0; k < 4; k++) { t.nudge(x + k * 3, y + (k % 2) * 4, -1); t.nudge(x + k * 3 + 1, y + (k % 2) * 4, -1); }
  }
  return t;
}

/** Volcanic ash/cinder ground: dark grit, glassy lit flecks, faint cracks. */
export function paintAsh(seed: number, size = 64, ramp: Ramp = RAMPS.ash): PixelTile {
  const rng = new Rng(seed);
  const t = new PixelTile(size, size, ramp);
  t.field(fbm(size, rng, [[4, 0.5], [8, 0.3], [32, 0.2]]), 1.6, 4.2, 1.5);
  for (let i = 0; i < size * 1.5; i++) t.nudge(rng.int(size), rng.int(size), rng.chance(0.5) ? -1 : 1);
  for (let i = 0; i < size / 4; i++) t.set(rng.int(size), rng.int(size), ramp.length - 1);
  for (let i = 0; i < 4; i++) crack(t, rng, 6 + rng.int(8), 0);
  return t;
}

/** Paint once per (key) and keep the texture for the session (arenas are rebuilt per battle). */
const cache = new Map<string, THREE.CanvasTexture>();
export function cachedTexture(key: string, paint: () => PixelTile): THREE.CanvasTexture {
  let tex = cache.get(key);
  if (!tex) {
    tex = pixelTexture(paint().toCanvas());
    tex.userData.persistent = true;
    tex.dispose = () => {};
    cache.set(key, tex);
  }
  return tex;
}
