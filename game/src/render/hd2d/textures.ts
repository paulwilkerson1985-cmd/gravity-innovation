// HD-2D pixel-art surface textures, painted procedurally on small canvases.
//
// Conventions (see docs/HD2D.md):
//  * Every texture is a tiny tile (16–64 texels) painted from a hand-picked RAMP of 4–7 shades,
//    dark → light, hue-shifted (shadows lean red/purple, highlights lean yellow). Never sample
//    colours outside the ramp; blends between neighbouring shades use a 4×4 Bayer dither.
//  * NearestFilter magnification, sRGB, RepeatWrapping: the texel grid must stay visible. Minified
//    surfaces sample a PALETTE-PRESERVING mip chain (pixelTexture: every mip texel is the mode of
//    its 2×2 parent block, never an average), so far walls and floors keep their ramp colours
//    instead of breaking into salt-and-pepper speckle. `?texel=1` swaps every image for a
//    2-colour checker (mip levels colour-coded) to check texel density in captures.
//  * World texel density is fixed per arena (TEXEL world units per texel, see arena.ts), so a
//    floor, a wall and a crate show the same pixel size on screen.
//  * Deterministic: every painter takes a seed; the same seed paints the same tile.
import * as THREE from 'three';
import { Rng } from '../../engine/rng';

/** A colour ramp, darkest first. 4–7 entries. */
export type Ramp = readonly string[];

/**
 * Material ramps for the cave/quarry arena kit (Ember Ridge). Add new terrains here. The two
 * darkest shades of every ramp are ~30% less saturated than the rest (shadows go earthy, not
 * neon); keep that when adding one.
 */
export const RAMPS = {
  /** Warm packed earth (cave floor): orange-brown, not beige. */
  dirt: ['#392d26', '#544237', '#7d583c', '#9a7049', '#b58a5b', '#cfa36f', '#e6bf8a'],
  rock: ['#271b17', '#3d2b23', '#5b3b2a', '#744d36', '#8c6143', '#a37752', '#b98e64'],
  rockTop: ['#433025', '#604634', '#865836', '#a26d42', '#bb8350', '#d29d64'],
  stone: ['#2e2c30', '#454249', '#5d5862', '#77717a', '#928b92', '#aea6aa', '#cbc3c2'],
  wood: ['#342318', '#4c3425', '#714426', '#8e5831', '#aa6d3d', '#c5864e', '#dba264'],
  /** Honey floor planks: warm but not orange (lit planks read pale gold). */
  plank: ['#46321f', '#654b31', '#89663f', '#a57f50', '#be9862', '#d6b47a'],
  steel: ['#1a1f2c', '#282f42', '#33416a', '#46588a', '#5e72a4', '#8193be'],
  /** Neutral light greys: painted metal/props whose hue comes from the vertex tint. */
  paint: ['#5c5b5d', '#777679', '#908e93', '#a9a7ab', '#c2c0c3', '#dddbdd'],
  plaster: ['#685b4b', '#837461', '#a68f6e', '#bea683', '#d2bc96', '#e4d1ab'],
  rail: ['#441a17', '#6b2a24', '#a8291c', '#cc3b26', '#e65c38', '#f78a55'],
  rug: ['#1c352a', '#274a38', '#2b6c47', '#3f8a58', '#62a86a', '#a6cf86'],
  ember: ['#401712', '#772c1f', '#d2400f', '#ff7a1e', '#ffb444', '#fff0a0'],
  /** Cool light-grey rubble (cave piles, stairs): reads against the warm brown walls. */
  rubble: ['#3b393f', '#57545b', '#716d75', '#8d8890', '#a9a4a9', '#c3bdbc', '#d8d2cc'],
  /**
   * Warm red-brown boulder rock (cave walls, kit/rock.ts): saturated deep mids, highlights that
   * cool to a desaturated tan (lit tops read pale, not orange, under the hue-preserving tone map).
   */
  boulder: ['#281a16', '#402920', '#663822', '#83502f', '#9b6a48', '#b38b6c', '#cbab8e'],
  /** Golden-ochre cut stone (cave course stones): brown darks, ochre mids, warm sandy lights. */
  caveStone: ['#2c1b13', '#4a2d1d', '#6c4224', '#8c5c2f', '#a8783b', '#c3964f', '#dab46c'],
  // ---- outdoor kit ramps (kit/*): grounds, foliage, water, sky
  sand: ['#66523e', '#846e53', '#ad8c5c', '#c6a670', '#d9be88', '#e8d4a2', '#f4e6c0'],
  grass: ['#223621', '#2f4b2b', '#386a2c', '#4b8434', '#649e3e', '#84b74c', '#a9cc62'],
  snow: ['#545d72', '#737c91', '#8d9bb6', '#afbcd0', '#cdd7e4', '#e4ebf3', '#f7fafc'],
  ash: ['#1b1818', '#2a2526', '#3c3335', '#4f4446', '#645759', '#7b6c6c', '#968683'],
  leaf: ['#16231b', '#213725', '#2a5428', '#3d6e2c', '#578a34', '#77a540', '#a0c25a'],
  bark: ['#211712', '#35251d', '#523424', '#6a4630', '#82583c', '#9c6e4c'],
  water: ['#182b41', '#22405c', '#1f5888', '#2c74a4', '#4492bc', '#6db2d2', '#a8d6e6'],
  foam: ['#98b5c3', '#c2d6de', '#e2f0f4', '#ffffff'],
} as const satisfies Record<string, Ramp>;

const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);

/** Ordered-dither a continuous ramp position (0..ramp.length-1) to a ramp index at texel (x, y). */
export function ditherIndex(v: number, x: number, y: number, n: number): number {
  const base = Math.floor(v);
  const frac = v - base;
  const i = base + (frac > BAYER4[(y & 3) * 4 + (x & 3)]! ? 1 : 0);
  return Math.max(0, Math.min(n - 1, i));
}

/**
 * Interleaved-gradient noise on 2×2 texel clusters: a blue-noise-like threshold in 0..1 with no
 * visible lattice (unlike Bayer), for the sparse dither of `PixelTile.field(…, 'band')`.
 */
export function clusterNoise(x: number, y: number): number {
  const cx = x >> 1, cy = y >> 1;
  const v = 52.9829189 * ((0.06711056 * cx + 0.00583715 * cy) % 1);
  return v - Math.floor(v);
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
  /**
   * Fill from a 0..1 field mapped onto ramp[lo..hi].
   *  * `'bayer'` (default): 4×4 Bayer dither between neighbouring shades everywhere.
   *  * `'band'`: posterised into flat bands (one per shade), dithered only within ±0.12 of a
   *    band edge with a 2×2-clustered blue-noise threshold — painterly, no Bayer "carpet".
   */
  field(f: Float32Array, lo: number, hi: number, contrast = 1, ditherMode: 'bayer' | 'band' = 'bayer') {
    const n = this.ramp.length;
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      const v = Math.max(0, Math.min(1, 0.5 + (f[y * this.w + x]! - 0.5) * contrast));
      const pos = lo + v * (hi - lo);
      let i: number;
      if (ditherMode === 'band') {
        const e = pos - (Math.floor(pos) + 0.5); // distance past the band edge (-0.5..0.5)
        i = Math.abs(e) < 0.12 ? Math.floor(pos) + ((e + 0.12) / 0.24 > clusterNoise(x, y) ? 1 : 0) : Math.round(pos);
      } else i = ditherIndex(pos, x, y, n);
      this.idx[y * this.w + x] = Math.max(0, Math.min(n - 1, i));
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

/**
 * A PixelTile with a per-texel RGB multiplier applied when it is written to a canvas: per-chunk
 * hue and value jitter (each stone of a rock tile a little warmer, cooler, lighter or darker)
 * while the painting itself stays indexed into the ramp.
 */
export class TintedTile extends PixelTile {
  readonly mul: Float32Array;
  constructor(w: number, h: number, ramp: Ramp) { super(w, h, ramp); this.mul = new Float32Array(w * h * 3).fill(1); }
  override toCanvas(): HTMLCanvasElement {
    const c = super.toCanvas();
    const ctx = c.getContext('2d')!;
    const img = ctx.getImageData(0, 0, this.w, this.h);
    for (let i = 0; i < this.w * this.h; i++) for (let k = 0; k < 3; k++) img.data[i * 4 + k] = Math.max(0, Math.min(255, Math.round(img.data[i * 4 + k]! * this.mul[i * 3 + k]!)));
    ctx.putImageData(img, 0, 0);
    return c;
  }
}

export interface PixelTextureOptions {
  /**
   * Build a palette-preserving mip chain (default true) and sample it with
   * NearestMipmapNearestFilter. Pass false for thin alpha cards whose 1-texel strokes must not
   * vanish at distance.
   */
  mips?: boolean;
}

let texelDebug: boolean | null = null;
/** `?texel=1`: every pixelTexture image becomes a 2-colour checker (see pixelTexture). */
export function texelDebugMode(): boolean {
  texelDebug ??= typeof location !== 'undefined' && new URLSearchParams(location.search).get('texel') === '1';
  return texelDebug;
}

/**
 * Wrap a canvas as a crisp pixel texture (nearest magnification, sRGB, repeat). By default the
 * texture carries a hand-built mip chain: each level halves the previous one by a MODE filter —
 * the 2×2 parent block votes (ring neighbours break ties), alpha by majority (ties keep the
 * texel opaque) — so every mip texel is an existing ramp colour and alpha stays 0 or 1. Sampled
 * with NearestMipmapNearestFilter: a wall 20 units away shows its stones' flat ramp tones, not
 * the random texels nearest sampling picks out of a minified tile.
 *
 * `?texel=1` (captures): the image is replaced by a same-size checker (alpha kept), grey at
 * level 0 and colour-coded below (1 red, 2 green, 3 blue, 4+ yellow): a grey 1-px checker means
 * one texel per internal pixel; colour means the surface is minified.
 */
export function pixelTexture(c: HTMLCanvasElement, o: PixelTextureOptions = {}): THREE.CanvasTexture {
  const debug = texelDebugMode();
  const mips = o.mips !== false && (c.width > 1 || c.height > 1);
  let levels: HTMLCanvasElement[] = [c];
  if (mips || debug) levels = mipChain(c, mips ? Infinity : 1);
  if (debug) levels = levels.map((l, i) => checkerLevel(l, i));
  const t = new THREE.CanvasTexture(levels[0]!);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = mips ? THREE.NearestMipmapNearestFilter : THREE.NearestFilter;
  t.generateMipmaps = false;
  if (mips) t.mipmaps = levels;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 1;
  return t;
}

/** Canvas → its mip chain (level 0 = the canvas itself), down to 1×1 or `maxLevels` levels. */
function mipChain(c: HTMLCanvasElement, maxLevels: number): HTMLCanvasElement[] {
  const out = [c];
  let w = c.width, h = c.height;
  let data = c.getContext('2d')!.getImageData(0, 0, w, h).data;
  while ((w > 1 || h > 1) && out.length < maxLevels) {
    const next = modeHalve(data, w, h);
    w = next.w; h = next.h; data = next.data;
    const lc = document.createElement('canvas');
    lc.width = w; lc.height = h;
    lc.getContext('2d')!.putImageData(new ImageData(data, w, h), 0, 0);
    out.push(lc);
  }
  return out;
}

/**
 * Halve an RGBA image with a palette-preserving mode filter. Each output texel looks at its
 * parent block (2×2, 3 wide/tall on odd sizes): alpha is the block's majority (ties opaque);
 * the colour is the block colour with the most votes — 4 per texel in the block plus 1 per
 * texel of the surrounding ring (wrapped), so the ring only breaks ties — and on a full tie
 * the one nearest the block's mean luminance. Never averages: output colours ⊂ input colours.
 */
export function modeHalve(src: Uint8ClampedArray, w: number, h: number): { data: Uint8ClampedArray<ArrayBuffer>; w: number; h: number } {
  const w2 = Math.max(1, w >> 1), h2 = Math.max(1, h >> 1);
  const out = new Uint8ClampedArray(w2 * h2 * 4);
  const keys: number[] = [], score: number[] = [], lum: number[] = [];
  const key = (i: number) => (src[i]! << 16) | (src[i + 1]! << 8) | src[i + 2]!;
  for (let y2 = 0; y2 < h2; y2++) {
    const sy0 = Math.floor((y2 * h) / h2), sy1 = Math.floor(((y2 + 1) * h) / h2);
    for (let x2 = 0; x2 < w2; x2++) {
      const sx0 = Math.floor((x2 * w) / w2), sx1 = Math.floor(((x2 + 1) * w) / w2);
      keys.length = 0; score.length = 0; lum.length = 0;
      let opaque = 0, n = 0, meanL = 0;
      for (let y = sy0; y < sy1; y++) for (let x = sx0; x < sx1; x++) {
        const i = (y * w + x) * 4;
        n++;
        if (src[i + 3]! < 128) continue;
        opaque++;
        const k = key(i), l = src[i]! * 0.3 + src[i + 1]! * 0.59 + src[i + 2]! * 0.11;
        meanL += l;
        const at = keys.indexOf(k);
        if (at >= 0) score[at]! += 4; else { keys.push(k); score.push(4); lum.push(l); }
      }
      const o = (y2 * w2 + x2) * 4;
      if (opaque * 2 < n || keys.length === 0) continue; // transparent (0, 0, 0, 0)
      meanL /= opaque;
      if (keys.length > 1) {
        for (let y = sy0 - 1; y <= sy1; y++) for (let x = sx0 - 1; x <= sx1; x++) {
          if (y >= sy0 && y < sy1 && x >= sx0 && x < sx1) continue;
          const i = ((((y % h) + h) % h) * w + (((x % w) + w) % w)) * 4;
          if (src[i + 3]! < 128) continue;
          const at = keys.indexOf(key(i));
          if (at >= 0) score[at]! += 1;
        }
      }
      let best = 0;
      for (let k = 1; k < keys.length; k++) {
        if (score[k]! > score[best]! || (score[k] === score[best] && Math.abs(lum[k]! - meanL) < Math.abs(lum[best]! - meanL))) best = k;
      }
      const k = keys[best]!;
      out[o] = (k >> 16) & 255; out[o + 1] = (k >> 8) & 255; out[o + 2] = k & 255; out[o + 3] = 255;
    }
  }
  return { data: out, w: w2, h: h2 };
}

const CHECKER: readonly (readonly [string, string])[] = [['#e6e6e6', '#3c3c3c'], ['#ff6a5a', '#7a1e16'], ['#6ae070', '#1e6a24'], ['#6a9cff', '#1e327a'], ['#ffe060', '#7a6a10']];
/** `?texel=1`: a 1-texel checker the size of `c`, alpha kept, coloured by mip `level`. */
function checkerLevel(c: HTMLCanvasElement, level: number): HTMLCanvasElement {
  const { width: w, height: h } = c;
  const src = c.getContext('2d')!.getImageData(0, 0, w, h).data;
  const pair = CHECKER[Math.min(level, CHECKER.length - 1)]!.map((hex) => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)] as const);
  const img = new ImageData(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4, col = pair[(x + y) & 1]!;
    img.data[i] = col[0]; img.data[i + 1] = col[1]; img.data[i + 2] = col[2];
    img.data[i + 3] = src[i + 3]! < 128 ? 0 : 255;
  }
  const out = document.createElement('canvas');
  out.width = w; out.height = h;
  out.getContext('2d')!.putImageData(img, 0, 0);
  return out;
}

/**
 * A short random-walk crack sunk `depth` shades below the stone around it, with a lit lip on the
 * texel below (the lower edge catches the light from above). Starts inside `area` [x0, y0, w, h].
 */
function crackRel(t: PixelTile, rng: Rng, len: number, depth = 2, area: [number, number, number, number] = [0, 0, t.w, t.h]) {
  let x = area[0] + rng.int(area[2]), y = area[1] + rng.int(area[3]);
  let dx = rng.chance(0.5) ? 1 : -1, dy = rng.chance(0.5) ? 1 : 0;
  for (let i = 0; i < len; i++) {
    t.nudge(x, y, -depth);
    t.nudge(x, y + 1, 1);
    if (rng.chance(0.35)) { const k = dx; dx = dy || (rng.chance(0.5) ? 1 : -1); dy = k ? 0 : 1; }
    x += dx; y += dy;
  }
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

// ------------------------------------------------------------------ painters

/**
 * Packed-dirt arena floor, painterly and LOW-frequency (no single-texel grit): the fbm
 * posterised into 4 flat bands (sparse blue-noise dither only at band edges), broad packed
 * lighter dust patches, damp darker blotches, a few big clods with broken rims (no cell
 * lattice), sparse dark 2–4 texel clods with a lit upper edge, scuffs and drag marks, a few
 * hairline and open cracks, and small 2×2 stones with a cast shadow down-right. Paint it at 128
 * texels for a floor: fewer visible repeats.
 */
export function paintDirt(seed: number, size = 64, ramp: Ramp = RAMPS.dirt): PixelTile {
  const rng = new Rng(seed);
  const t = new PixelTile(size, size, ramp);
  const big = size / 64;
  t.field(fbm(size, rng, [[Math.round(3 * big), 0.55], [Math.round(6 * big), 0.3], [Math.round(16 * big), 0.15]]), 2.3, 4.7, 0.95, 'band');
  const blob = (cx: number, cy: number, rx: number, ry: number, d: number, ragged: number) => {
    for (let y = -ry - 1; y <= ry + 1; y++) for (let x = -rx - 1; x <= rx + 1; x++) {
      const q = (x / rx) ** 2 + (y / ry) ** 2;
      if (q < 1 - ragged * clusterNoise(cx + x + 7, cy + y + 3)) t.nudge(cx + x, cy + y, d);
    }
  };
  // Dust patches (packed, lighter: big and flat), damp darker blotches.
  for (let i = 0; i < 4 * big * big; i++) blob(rng.int(size), rng.int(size), 5 + rng.int(8), 3 + rng.int(4), 1, 0.4);
  for (let i = 0; i < 1.5 * big * big; i++) blob(rng.int(size), rng.int(size), 3 + rng.int(4), 2 + rng.int(2), -1, 0.5);
  clods(t, rng, Math.round((size * size) / 110));
  // Dark clods: 2–4 texels, lit along the top edge (light from behind the camera, above).
  for (let i = 0; i < size * size / 150; i++) {
    const x = rng.int(size), y = rng.int(size), w = 2 + rng.int(2), h = rng.chance(0.5) ? 2 : 1;
    for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) t.nudge(x + xx, y + yy, -2);
    for (let xx = 0; xx < w; xx++) t.nudge(x + xx, y - 1, 1);
  }
  // Scuffs and drag marks: short streaks, a dark drag with a lit edge.
  for (let i = 0; i < 4 * big * big; i++) {
    const x = rng.int(size), y = rng.int(size), len = 4 + rng.int(6), slope = rng.chance(0.5) ? 0 : rng.chance(0.5) ? 0.5 : -0.5;
    for (let k = 0; k < len; k++) { const yy = y + Math.round(k * slope); t.nudge(x + k, yy, -1); if (rng.chance(0.7)) t.nudge(x + k, yy - 1, 1); }
  }
  // Cracks: a few hairlines that stop short, one open crack (2 texels wide) that branches.
  for (let i = 0; i < 2 * big * big; i++) crackRel(t, rng, 4 + rng.int(5), 1);
  for (let i = 0; i < 1 * big * big; i++) {
    let x = rng.int(size), y = rng.int(size), dx = rng.chance(0.5) ? 1 : -1, dy = 0;
    const len = 10 + rng.int(10);
    for (let k = 0; k < len; k++) {
      const open = k > 1 && k < len - 2;
      t.nudge(x, y, -2); if (open) { t.nudge(x, y + 1, -1); t.nudge(x, y + 2, 1); } else t.nudge(x, y + 1, 1);
      if (k === Math.floor(len / 2)) crackRel(t, rng, 3 + rng.int(4), 1, [x, y, 1, 1]); // branch
      if (rng.chance(0.3)) { const q = dx; dx = dy || (rng.chance(0.5) ? 1 : -1); dy = q ? 0 : (rng.chance(0.7) ? 1 : -1); }
      x += dx; y += dy;
    }
  }
  // Small 2×2 stones with a cast shadow (light from the back-left: shadow toward +x, +y).
  for (let i = 0; i < size * size / 420; i++) {
    const x = rng.int(size), y = rng.int(size);
    const top = Math.min(ramp.length - 1, 5 + rng.int(2));
    t.set(x + 2, y + 1, 1); t.set(x + 2, y + 2, 1); t.set(x + 1, y + 2, 1);
    t.set(x, y, top); t.set(x + 1, y, top - 1); t.set(x, y + 1, top - 1); t.set(x + 1, y + 1, top - 2);
  }
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
 * Boulder face (kit/rock.ts): a mosaic of rock chunks (chunks()) over soft mottling, dark pits
 * and lit flecks, and a short relative crack. The bevel shader does the block form (dark foot →
 * lit top); the texture gives every face its craggy sub-facets.
 */
export function paintBoulder(seed: number, size = 32, ramp: Ramp = RAMPS.rock): PixelTile {
  const rng = new Rng(seed);
  const t = boulderBase(rng, size, ramp);
  crackRel(t, rng, 4 + rng.int(4), 2);
  return t;
}

function boulderBase(rng: Rng, size: number, ramp: Ramp): TintedTile {
  const t = new TintedTile(size, size, ramp);
  const half = size / 2;
  const f = fbm(half, rng, [[Math.max(2, half / 8), 0.35], [Math.max(4, half / 4), 0.4], [Math.max(8, half / 2), 0.25]]);
  const n = ramp.length;
  // Mottling on 2×2 clusters, posterised into flat shades (sparse blue-noise dither at the band
  // edges only — no Bayer checkers on stone). Kept in the lower-middle of the ramp: the chunk
  // edges need headroom both ways.
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const v = Math.max(0, Math.min(1, 0.5 + (f[(y >> 1) * half + (x >> 1)]! - 0.5) * 1.1));
    const pos = 2.4 + v * (n - 4.5);
    const e = pos - (Math.floor(pos) + 0.5);
    t.idx[y * size + x] = Math.abs(e) < 0.12 ? Math.floor(pos) + ((e + 0.12) / 0.24 > clusterNoise(x, y) ? 1 : 0) : Math.round(pos);
  }
  chunks(t, rng, Math.round((size * size) / 70));
  // Dark pits: 2–4 texel clusters (a pit and its shadowed lower lip; never a lone texel, which
  // reads as salt-and-pepper speckle at battle distance), never horizontal pairs (grain).
  for (let i = 0; i < size * size / 44; i++) {
    const x = rng.int(size), y = rng.int(size), d = rng.chance(0.3) ? -3 : -2;
    t.nudge(x, y, d);
    t.nudge(x, y + 1, d + 1);
    if (rng.chance(0.45)) { t.nudge(x + 1, y, d + 1); t.nudge(x + 1, y + 1, d + 1); }
  }
  // Lit flecks: 2×2 clusters.
  for (let i = 0; i < size * size / 110; i++) {
    const x = rng.int(size), y = rng.int(size);
    t.nudge(x, y, 1); t.nudge(x + 1, y, 1); t.nudge(x, y + 1, 1);
    if (rng.chance(0.5)) t.nudge(x + 1, y + 1, 1);
  }
  return t;
}

/**
 * Cut-stone surface for coursed stones (kit/rock.ts courseWall): chiselled facets — a weighted,
 * vertically stretched Voronoi of 3×5-ish texel cells, each one flat tone of the ramp (dark,
 * mid, lit or bright: 3–4 tones over broad mottling), lit along part of its top edge and shaded
 * along part of its lower and right edges (light from the upper left) — plus a few 2×3 texel
 * dark pits and a gentle warm/cool drift per patch. Every feature is ≥ 2 texels: no single-texel
 * noise. The bevel shader adds each stone's seam, dark underside and lit top band.
 */
function stoneSurface(rng: Rng, size: number, ramp: Ramp): TintedTile {
  const t = new TintedTile(size, size, ramp);
  const half = size / 2;
  const n = ramp.length;
  const f = fbm(half, rng, [[Math.max(2, half / 8), 0.6], [Math.max(4, half / 4), 0.4]]);
  const lo = n >= 7 ? 2.4 : 1.4, hi = n >= 7 ? 4.0 : n - 2.4;
  const count = Math.round((size * size) / 20);
  const seeds = Array.from({ length: count }, () => {
    const r = rng.next();
    return { x: rng.next() * size, y: rng.next() * size, wt: 0.7 + rng.next() * 0.6, tone: r < 0.24 ? -1 : r < 0.6 ? 0 : r < 0.86 ? 1 : 2 };
  });
  const owner = new Int16Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let best = 1e9, bi = 0;
    seeds.forEach((sd, i) => {
      let dx = Math.abs(x + 0.5 - sd.x), dy = Math.abs(y + 0.5 - sd.y);
      dx = Math.min(dx, size - dx); dy = Math.min(dy, size - dy);
      const q = (dx * dx + dy * dy * 0.42) / (sd.wt * sd.wt);
      if (q < best) { best = q; bi = i; }
    });
    owner[y * size + x] = bi;
  }
  const own = (x: number, y: number) => owner[((y + size) % size) * size + ((x + size) % size)]!;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const o = own(x, y), sd = seeds[o]!;
    const v = Math.max(0, Math.min(1, 0.5 + (f[(y >> 1) * half + (x >> 1)]! - 0.5) * 1.2));
    let k = Math.round(lo + v * (hi - lo)) + sd.tone;
    const brk = clusterNoise(x * 3 + o, y * 2 + 1);
    const up = own(x, y - 1), dn = own(x, y + 1), rt = own(x + 1, y);
    if (up !== o && sd.tone >= 0 && brk < 0.6) k += 1; // lit top edge
    else if (dn !== o && seeds[dn]!.tone > sd.tone - 1 && brk < 0.65) k -= 1; // shadowed lower edge
    else if (rt !== o && brk < 0.4) k -= 1; // shaded right edge
    t.idx[y * size + x] = Math.max(0, Math.min(n - 1, k));
  }
  // Dark pits: 2×2 / 2×3 texels, two shades deep, with a lit lower lip.
  for (let i = 0; i < size * size / 160; i++) {
    const x = rng.int(size), y = rng.int(size), tall = rng.chance(0.5);
    for (let yy = 0; yy < (tall ? 3 : 2); yy++) { t.nudge(x, y + yy, -2); t.nudge(x + 1, y + yy, yy === 0 ? -1 : -2); }
    t.nudge(x, y + (tall ? 3 : 2), 1);
  }
  // Broad warm/cool and value drift (±5%), constant over 8-texel patches.
  const drift = fbm(size / 8, rng, [[2, 1]]);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const dv = (drift[(y >> 3) * (size / 8) + (x >> 3)]! - 0.5) * 0.2, i = y * size + x;
    t.mul[i * 3] = 1 + dv; t.mul[i * 3 + 1] = 1 + dv * 0.5; t.mul[i * 3 + 2] = 1 - dv * 0.4;
  }
  return t;
}

/**
 * Rock chunks (tileable, multiplicatively weighted Voronoi, so chunk sizes vary ~3×): every
 * chunk gets a 4-tone ramp — a shade for its body (up, down or level), a lit top-left part, a
 * shadowed bottom-right, a crisp 1-texel lit top edge and a dark crevice texel along its lower
 * and right edges (mortar where the two meet) — plus its own ±10% value and ±6% hue jitter.
 * About a third of the borders are fused (no crevice), so the mosaic never reads as a grid.
 */
function chunks(t: TintedTile, rng: Rng, count: number) {
  const { w, h } = t;
  const seeds = Array.from({ length: count }, () => ({
    x: rng.next() * w, y: rng.next() * h, wt: 0.65 + rng.next() * 0.9,
    off: rng.chance(0.15) ? -1 : rng.chance(0.15) ? 1 : 0,
    v: (rng.next() - 0.5) * 0.2, hue: (rng.next() - 0.5) * 0.12,
  }));
  const owner = new Int16Array(w * h);
  const rel = new Float32Array(w * h * 2);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let best = 1e9, bi = 0, bx = 0, by = 0;
    seeds.forEach((s, i) => {
      let dx = x + 0.5 - s.x, dy = y + 0.5 - s.y;
      if (dx > w / 2) dx -= w; else if (dx < -w / 2) dx += w;
      if (dy > h / 2) dy -= h; else if (dy < -h / 2) dy += h;
      const q = (dx * dx + dy * dy * 1.15) / (s.wt * s.wt); // weighted sizes, a little taller than wide
      if (q < best) { best = q; bi = i; bx = dx; by = dy; }
    });
    owner[y * w + x] = bi;
    rel[(y * w + x) * 2] = bx / seeds[bi]!.wt; rel[(y * w + x) * 2 + 1] = by / seeds[bi]!.wt;
  }
  const own = (x: number, y: number) => owner[((y + h) % h) * w + ((x + w) % w)]!;
  const fused = (a: number, b: number) => { const lo = Math.min(a, b), hi = Math.max(a, b); return ((lo * 7919 + hi * 104729) % 101) / 101 < 0.35; };
  const R = Math.sqrt((w * h) / count / Math.PI);
  const d = new Int8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x, o = owner[i]!, s = seeds[o]!;
    let k = s.off;
    // Lit top-left, shadowed bottom-right inside the chunk.
    const l = -(rel[i * 2]! * 0.55 + rel[i * 2 + 1]! * 0.85) / R;
    if (l > 0.65) k += 1; else if (l < -0.7) k -= 1;
    const up = own(x, y - 1), dn = own(x, y + 1), lf = own(x - 1, y), rt = own(x + 1, y);
    const eUp = up !== o && !fused(o, up), eDn = dn !== o && !fused(o, dn);
    const eLf = lf !== o && !fused(o, lf), eRt = rt !== o && !fused(o, rt);
    if (eDn && eRt) k = s.off - 2; // mortar corner
    else if (eDn) k = s.off - (clusterNoise(x * 2 + 5, y) < 0.45 ? 2 : 1); // crevice under the chunk
    else if (eRt) k = Math.min(k, s.off - 1);
    else if (eUp && l > 0) k = s.off + 2; // crisp lit top edge (the lit half of it)
    else if (eUp || eLf) k = Math.max(k, s.off + 1);
    d[i] = k;
    const hue = s.hue, v = 1 + s.v;
    t.mul[i * 3] = v * (1 + hue); t.mul[i * 3 + 1] = v * (1 + hue * 0.3); t.mul[i * 3 + 2] = v * (1 - hue);
  }
  for (let i = 0; i < d.length; i++) if (d[i]) t.idx[i] = Math.max(0, Math.min(t.ramp.length - 1, t.idx[i]! + d[i]!));
}

/**
 * Gravel clods (tileable, weighted Voronoi: small and big cells mixed): some clods lit along
 * their upper rim with a dark gap texel under the lower rim, some a shade darker or lighter,
 * most rimless — gritty, pebbly packed earth without a visible cell lattice.
 */
function clods(t: PixelTile, rng: Rng, count: number) {
  const { w, h } = t;
  const seeds = Array.from({ length: count }, () => [rng.next() * w, rng.next() * h, rng.chance(0.2) ? -1 : rng.chance(0.12) ? 1 : 0, rng.chance(0.38), 0.5 + rng.next() * 1.3] as const);
  const owner = new Int16Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let best = 1e9, bi = 0;
    seeds.forEach(([sx, sy, , , wt], i) => {
      let dx = Math.abs(x + 0.5 - sx), dy = Math.abs(y + 0.5 - sy);
      dx = Math.min(dx, w - dx); dy = Math.min(dy, h - dy);
      const q = (dx * dx * 0.55 + dy * dy) / (wt * wt);
      if (q < best) { best = q; bi = i; }
    });
    owner[y * w + x] = bi;
  }
  const own = (x: number, y: number) => owner[((y + h) % h) * w + ((x + w) % w)]!;
  const d = new Int8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const o = own(x, y);
    const [, , off, rim] = seeds[o]!;
    let k: number = off;
    // Rims are broken (every other run of texels), so even rimmed clods never outline fully.
    const broken = clusterNoise(x * 3 + 1, y * 5 + 2) < 0.35;
    if (rim && !broken && own(x, y + 1) !== o) k -= 1; // gap under the clod
    else if (rim && !broken && own(x, y - 1) !== o) k += 1; // lit upper rim
    d[y * w + x] = k;
  }
  for (let i = 0; i < d.length; i++) if (d[i]) t.idx[i] = Math.max(0, Math.min(t.ramp.length - 1, t.idx[i]! + d[i]!));
}

/**
 * A 64×64 cut-stone atlas for coursed stones and rubble (stoneSurface): one continuous tileable
 * surface whose four 32² quadrants vary a little (plain; a short crack; weathered with more lit
 * knobs; a faint darker stratum). Mid tones only, 2–4 texel clusters, no single-texel speckle:
 * each stone's bright warm top band, mid front, darker underside and ~45% seam come from the
 * coursed-stone bevel code (arena.ts addBevel) on top of it. boulder() starts each stone in one
 * quadrant (still one material).
 */
export function paintBoulderAtlas(seed: number, ramp: Ramp = RAMPS.boulder): PixelTile {
  const rng = new Rng(seed);
  const t = stoneSurface(rng, 64, ramp);
  // Quadrant 1: a short wandering crack (2 shades deep, lit lower lip).
  crackRel(t, rng, 5 + rng.int(3), 2, [38, 6, 18, 18]);
  // Quadrant 2: weathered — extra lit knobs.
  for (let i = 0; i < 10; i++) { const x = 2 + rng.int(28), y = 34 + rng.int(28); t.nudge(x, y, 1); t.nudge(x + 1, y, 1); t.nudge(x, y + 1, 1); t.nudge(x + 1, y + 2, -1); }
  // Quadrant 3: a faint darker stratum, 2 texels thick, with a lit edge above.
  for (let x = 33; x < 63; x++) { const y = 46 + Math.round(Math.sin(x * 0.3) * 1.5); t.nudge(x, y, -1); t.nudge(x, y + 1, -1); t.nudge(x, y - 1, 1); }
  return t;
}

/** Grey rubble stone: lighter, cooler, with strong top-left highlights. */
export function paintStone(seed: number, size = 32): PixelTile {
  const t = paintRock(seed, size, RAMPS.stone);
  return t;
}

/**
 * Horizontal wooden planks: seams, staggered butt joints, grain streaks, nail heads and `knots`
 * dark knots per plank row (default 1: clean, long boards).
 */
export function paintPlanks(seed: number, w = 64, h = 64, plank = 8, ramp: Ramp = RAMPS.plank, knots = 1): PixelTile {
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
    for (let i = 0; i < knots; i++) t.set(rng.int(w), row * plank + 2 + rng.int(plank - 3), 1); // knots
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
  t.field(fbm(size, rng, [[2, 0.6], [8, 0.4]]), 3.0, 5.0, 1.2);
  for (let i = 0; i < 2; i++) crack(t, rng, 4 + rng.int(4), 2, false);
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
